import { describe, it, expect, beforeAll } from "vitest";
import request from "supertest";
import crypto from "crypto";
import mongoose from "mongoose";

// Import after env override — must be the very next line after setup
import app from "../src/app.js";
import { User } from "../src/models/User.js";
import { Organization } from "../src/models/Organization.js";
import { Record } from "../src/models/Record.js";
import { RecordVersion } from "../src/models/RecordVersion.js";
import { Document } from "../src/models/Document.js";
import { LedgerEntry } from "../src/models/LedgerEntry.js";
import { Credential } from "../src/models/Credential.js";
import { AuditEvent } from "../src/models/AuditEvent.js";
import { ApprovalRequest } from "../src/models/ApprovalRequest.js";
import { ensureOrgKeys } from "../src/trust/KeyManager.js";
import { sha256 } from "../src/core/records.js";

const PASS = "Test@12345";

/* ---------- helpers ---------- */
async function mkOrg(name) {
  const org = await Organization.create({ name, type: "defence", packId: "defence" });
  await ensureOrgKeys(org._id);
  return org;
}
async function mkUser({ name, email, orgId, role, attrs = {} }) {
  const u = new User({ name, email, password: PASS, orgId, role, attributes: attrs });
  await u.save();
  return u;
}
async function login(email) {
  const res = await request(app).post("/api/v1/auth/login").send({ email, password: PASS });
  if (res.status !== 200) throw new Error(`login failed for ${email}: ${JSON.stringify(res.body)}`);
  return res.body.token;
}
function bearer(tok) {
  return { Authorization: `Bearer ${tok}` };
}
async function appendLedger({ orgId, recordId, action, actorUserId, payloadHash, signature = "", meta = {} }) {
  const last = await LedgerEntry.findOne().sort({ index: -1 }).lean();
  const index = last ? last.index + 1 : 0;
  const prev = last ? last.entryHash : "0".repeat(64);
  const timestamp = new Date().toISOString();
  const entryHash = crypto
    .createHash("sha256")
    .update(`${index}|${timestamp}|${orgId}|${recordId}|${action}|${payloadHash}|${prev}|${signature}|`)
    .digest("hex");
  return LedgerEntry.create({
    index, timestamp, orgId, recordId, action, payloadHash, prevHash: prev, entryHash,
    actorUserId, signature, meta,
  });
}

/* ---------- shared state ---------- */
let orgA, orgB, adminA, adminB, staffA, auditor;
let tokAdminA, tokAdminB, tokStaffA, tokAuditor;
let recA;

beforeAll(async () => {
  // Wipe the test DB ONCE before seeding fixtures
  const collections = await mongoose.connection.db.collections();
  for (const c of collections) await c.deleteMany({});

  orgA = await mkOrg("Test BEL");
  orgB = await mkOrg("Test Supplier");

  adminA = await mkUser({ name: "A Admin", email: "a@t.test", orgId: orgA._id, role: "admin", attrs: { clearanceLevel: 3 } });
  staffA = await mkUser({ name: "A Staff", email: "s@t.test", orgId: orgA._id, role: "staff", attrs: { clearanceLevel: 1 } });
  adminB = await mkUser({ name: "B Admin", email: "b@t.test", orgId: orgB._id, role: "admin" });
  auditor = await mkUser({ name: "Aud", email: "aud@t.test", orgId: orgA._id, role: "auditor" });

  tokAdminA = await login("a@t.test");
  tokStaffA = await login("s@t.test");
  tokAdminB = await login("b@t.test");
  tokAuditor = await login("aud@t.test");

  recA = await Record.create({
    orgId: orgA._id, packId: "defence", templateKey: "component",
    title: "Test Part",
    fields: { partNumber: "TP-001", serialNumber: "SN-TEST-1", clearance: "restricted" },
    createdBy: adminA._id,
  });

  await RecordVersion.create({
    recordId: recA._id,
    orgId: orgA._id,
    version: 1,
    fields: recA.fields,
    fieldsHash: sha256(recA.fields),
    createdBy: adminA._id,
    note: "initial version",
  });

  await appendLedger({
    orgId: orgA._id, recordId: recA._id, action: "record:create",
    actorUserId: adminA._id, payloadHash: sha256(recA.fields),
    meta: { title: recA.title },
  });
});

/* ============================================================== */
/* 1. Upload → verify same file = match                            */
/* ============================================================== */
describe("1. upload + verify", () => {
  it("verifying the exact uploaded file returns match", async () => {
    const content = Buffer.from("hello BEL-chain\n", "utf8");
    const up = await request(app)
      .post(`/api/v1/records/${recA._id}/documents`)
      .set(bearer(tokAdminA))
      .attach("file", content, "sample.txt");

    expect(up.status).toBe(201);
    expect(up.body.document.sha256).toMatch(/^[0-9a-f]{64}$/);

    const v = await request(app)
      .post("/api/v1/verify")
      .set(bearer(tokAdminA))
      .attach("file", content, "sample.txt")
      .field("documentId", String(up.body.document._id));

    expect(v.status).toBe(200);
    expect(v.body.result).toBe("match");
    expect(v.body.uploadedHash).toBe(v.body.ledgerHash);
  });
});

/* ============================================================== */
/* 2. Change one byte → changed + audit event                     */
/* ============================================================== */
describe("2. tamper byte → changed", () => {
  it("verifying a modified file returns changed and writes an audit event", async () => {
    const good = Buffer.from("BEL TEST\n", "utf8");
    const up = await request(app)
      .post(`/api/v1/records/${recA._id}/documents`)
      .set(bearer(tokAdminA))
      .attach("file", good, "good.txt");

    const bad = Buffer.from("BEL TEST!", "utf8"); // one char diff
    const v = await request(app)
      .post("/api/v1/verify")
      .set(bearer(tokAdminA))
      .attach("file", bad, "bad.txt")
      .field("documentId", String(up.body.document._id));

    expect(v.status).toBe(200);
    expect(v.body.result).toBe("changed");
    expect(v.body.uploadedHash).not.toBe(v.body.ledgerHash);

    const audit = await AuditEvent.findOne({ action: "verify:mismatch" }).lean();
    expect(audit).toBeTruthy();
    expect(audit.meta.uploadedHash).toBe(v.body.uploadedHash);
  });
});

/* ============================================================== */
/* 3. Cross-org access blocked                                    */
/* ============================================================== */
describe("3. org isolation", () => {
  it("Org B cannot read Org A's record", async () => {
    const r = await request(app)
      .get(`/api/v1/records/${recA._id}`)
      .set(bearer(tokAdminB));
    expect([403, 404]).toContain(r.status);
  });

  it("Org B cannot download Org A's document", async () => {
    const up = await request(app)
      .post(`/api/v1/records/${recA._id}/documents`)
      .set(bearer(tokAdminA))
      .attach("file", Buffer.from("secret\n"), "s.txt");
    expect(up.status).toBe(201);

    const d = await request(app)
      .get(`/api/v1/documents/${up.body.document._id}/download`)
      .set(bearer(tokAdminB));
    expect(d.status).toBe(403);
  });
});

/* ============================================================== */
/* 4. Auditor: reads ledger, cannot download files               */
/* ============================================================== */
describe("4. auditor scope", () => {
  it("auditor can read the ledger", async () => {
    const r = await request(app).get("/api/v1/ledger").set(bearer(tokAuditor));
    expect(r.status).toBe(200);
    expect(r.body.entries.length).toBeGreaterThan(0);
  });

  it("auditor cannot download a document", async () => {
    const up = await request(app)
      .post(`/api/v1/records/${recA._id}/documents`)
      .set(bearer(tokAdminA))
      .attach("file", Buffer.from("aud-test\n"), "a.txt");

    const d = await request(app)
      .get(`/api/v1/documents/${up.body.document._id}/download`)
      .set(bearer(tokAuditor));
    expect(d.status).toBe(403);
  });
});

/* ============================================================== */
/* 5. High-risk action pending until enough approvals            */
/* ============================================================== */
describe("5. high-risk approval flow", () => {
  it("record:update from staff creates a pending approval, then requires 2 votes to apply", async () => {
    // staff updates → 202 (pending approval created, no new version)
    const upd = await request(app)
      .put(`/api/v1/records/${recA._id}`)
      .set(bearer(tokStaffA))
      .send({ fields: { partNumber: "TP-001", serialNumber: "SN-TEST-1", clearance: "secret" } });

    expect(upd.status).toBe(202);
    const approvalId = upd.body.approvalId;
    expect(approvalId).toBeTruthy();

    // Confirm no new version was written
    const beforeVersions = await RecordVersion.countDocuments({ recordId: recA._id });
    const beforeLedger = await LedgerEntry.countDocuments();

    // Requester cannot vote
    const selfVote = await request(app)
      .post(`/api/v1/approvals/${approvalId}/approve`)
      .set(bearer(tokStaffA))
      .send({});
    expect(selfVote.status).toBe(403);

    // Two different approvers, both in same org
    const approver1 = await mkUser({ name: "A Mgr1", email: "m1@t.test", orgId: orgA._id, role: "manager" });
    const approver2 = await mkUser({ name: "A Mgr2", email: "m2@t.test", orgId: orgA._id, role: "manager" });
    const tokM1 = await login("m1@t.test");
    const tokM2 = await login("m2@t.test");

    const v1 = await request(app)
      .post(`/api/v1/approvals/${approvalId}/approve`)
      .set(bearer(tokM1)).send({});
    expect(v1.status).toBe(200);
    expect(v1.body.finalized).toBe(false);

    // Still no new version, still no new ledger entries from approval yet
    const midVersions = await RecordVersion.countDocuments({ recordId: recA._id });
    expect(midVersions).toBe(beforeVersions);

    const v2 = await request(app)
      .post(`/api/v1/approvals/${approvalId}/approve`)
      .set(bearer(tokM2)).send({});
    expect(v2.status).toBe(200);
    expect(v2.body.finalized).toBe(true);
    expect(v2.body.version).toBe(beforeVersions + 1);

    const afterLedger = await LedgerEntry.countDocuments();
    expect(afterLedger).toBe(beforeLedger + 1);

    const updated = await Record.findById(recA._id).lean();
    expect(updated.version).toBe(beforeVersions + 1);
    expect(updated.fields.clearance).toBe("secret");
  });
});

/* ============================================================== */
/* 6. Tamper DB → verify fails at broken index                   */
/* ============================================================== */
describe("6. chain detects tampering", () => {
  it("editing one entry via the raw driver breaks verifyChain at that index", async () => {
    // Build a fresh chain in this test's context
    await LedgerEntry.collection.deleteMany({});
    const last = await appendLedger({
      orgId: orgA._id, recordId: recA._id, action: "record:create",
      actorUserId: adminA._id, payloadHash: sha256({ a: 1 }),
    });
    await appendLedger({
      orgId: orgA._id, recordId: recA._id, action: "record:update",
      actorUserId: adminA._id, payloadHash: sha256({ a: 2 }),
    });

    // OK first
    const ok = await request(app).get("/api/v1/ledger/verify").set(bearer(tokAuditor));
    expect(ok.body.ok).toBe(true);

    // Tamper via the raw driver, bypassing the append-only guard
    await LedgerEntry.collection.updateOne(
      { index: last.index },
      { $set: { payloadHash: "deadbeef".repeat(8) } }
    );

    const after = await request(app).get("/api/v1/ledger/verify").set(bearer(tokAuditor));
    expect(after.body.ok).toBe(false);
    expect(after.body.brokenIndex).toBe(last.index);
    expect(after.body.reason).toBe("entry-hash-mismatch");
  });
});

/* ============================================================== */
/* 7. Switching pack changes the form without frontend code      */
/* ============================================================== */
describe("7. pack is the only industry-specific input", () => {
  it("meta/template returns a fields array from the pack JSON", async () => {
    const r = await request(app)
      .get("/api/v1/records/meta/template?packId=defence&templateKey=component")
      .set(bearer(tokAdminA));

    expect(r.status).toBe(200);
    expect(Array.isArray(r.body.fields)).toBe(true);
    expect(r.body.fields.map((f) => f.key)).toEqual(
      expect.arrayContaining(["partNumber", "serialNumber", "clearance"])
    );
  });

  it("the pack JSON is served verbatim from GET /packs/:id", async () => {
    const r = await request(app).get("/api/v1/packs/defence").set(bearer(tokAdminA));
    expect(r.status).toBe(200);
    expect(r.body.pack.templates.component).toBeTruthy();
    expect(r.body.pack.templates.testReport).toBeTruthy();
  });
});

/* ============================================================== */
/* 8. Revoked credential blocks a gated action                   */
/* ============================================================== */
describe("8. revoked credential blocks gated action", () => {
  it("POST /records works with an active credential, then fails after revocation", async () => {
    const cred = await Credential.create({
      orgId: orgA._id,
      subjectUserId: adminA._id,
      type: "defence:write",
      issuedBy: adminA._id,
    });

    const body = {
      packId: "defence",
      templateKey: "component",
      fields: { partNumber: "TP-777", serialNumber: "SN-777" },
      gated: true,
    };

    const ok = await request(app).post("/api/v1/records").set(bearer(tokAdminA)).send(body);
    expect(ok.status).toBe(201);

    const rv = await request(app)
      .post(`/api/v1/credentials/${cred._id}/revoke`)
      .set(bearer(tokAdminA)).send({});
    expect(rv.status).toBe(200);

    const denied = await request(app).post("/api/v1/records").set(bearer(tokAdminA)).send(body);
    expect(denied.status).toBe(403);
    expect(denied.body.error).toMatch(/credential/i);
  });
});