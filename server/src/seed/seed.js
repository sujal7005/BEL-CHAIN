import "dotenv/config";
import mongoose from "mongoose";
import crypto from "crypto";

import { Organization } from "../models/Organization.js";
import { User } from "../models/User.js";
import { LedgerEntry } from "../models/LedgerEntry.js";
import { Record } from "../models/Record.js";
import { RecordVersion } from "../models/RecordVersion.js";
import { ApprovalRequest } from "../models/ApprovalRequest.js";
import { AuditEvent } from "../models/AuditEvent.js";
import { Share } from "../models/Share.js";
import { Document } from "../models/Document.js";
import { Credential } from "../models/Credential.js";
import { KeyPair } from "../models/KeyPair.js";
import { sha256 } from "../core/records.js";
import { ensureOrgKeys, signForOrg } from "../trust/KeyManager.js";
import { put } from "../trust/IPFSStorage.js";

async function main() {
  await mongoose.connect(process.env.MONGO_URI);
  console.log("✅ Connected to MongoDB");

  // ---------- Clean slate ----------
  // Ledger is append-only via the model; bypass its guard through the raw collection.
  await LedgerEntry.collection.deleteMany({});
  await RecordVersion.deleteMany({});
  await Document.deleteMany({});
  await Record.deleteMany({});
  await ApprovalRequest.deleteMany({});
  await Share.deleteMany({});
  await AuditEvent.deleteMany({});
  await Credential.deleteMany({});
  await KeyPair.deleteMany({});       // <-- important: rotate keys on every re-seed
  await User.deleteMany({});
  await Organization.deleteMany({});
  console.log("🧹 Cleared all collections");

  // ---------- Orgs ----------
  const [bel, suppA, suppB] = await Organization.insertMany([
    { name: "BEL Unit 3", type: "defence", packId: "defence" },
    { name: "Supplier A", type: "defence", packId: "defence" },
    { name: "Supplier B", type: "defence", packId: "defence" },
  ]);
  console.log("🏢 Orgs created:", [bel.name, suppA.name, suppB.name].join(", "));

  // ---------- Keys (AFTER orgs exist, AFTER wipe) ----------
  for (const org of [bel, suppA, suppB]) {
    await ensureOrgKeys(org._id);
  }
  console.log("🔑 Org keypairs generated (AES + RSA)");

  // ---------- Users ----------
  const demoPass = "Bel@12345";
  const usersToCreate = [
    { name: "BEL Admin",        email: "admin@bel.test",   password: demoPass, orgId: bel._id,   role: "admin",    attributes: { clearanceLevel: 3, unit: "BEL-U3" } },
    { name: "BEL Manager",      email: "manager@bel.test", password: demoPass, orgId: bel._id,   role: "manager",  attributes: { clearanceLevel: 2, unit: "BEL-U3" } },
    { name: "BEL Staff",        email: "staff@bel.test",   password: demoPass, orgId: bel._id,   role: "staff",    attributes: { clearanceLevel: 1, unit: "BEL-U3" } },
    { name: "BEL Auditor",      email: "auditor@bel.test", password: demoPass, orgId: bel._id,   role: "auditor",  attributes: { clearanceLevel: 3, unit: "BEL-AUDIT" } },
    { name: "Supplier A Admin", email: "a@supplier.test",  password: demoPass, orgId: suppA._id, role: "supplier", attributes: { clearanceLevel: 1, unit: "SUPP-A" } },
    { name: "Supplier B Admin", email: "b@supplier.test",  password: demoPass, orgId: suppB._id, role: "supplier", attributes: { clearanceLevel: 1, unit: "SUPP-B" } },
  ];

  const saved = [];
  for (const u of usersToCreate) {
    const user = new User(u);
    await user.save(); // pre-validate hooks: hash + did
    saved.push(user);
  }

  const adminUser   = saved.find((u) => u.email === "admin@bel.test");
  const managerUser = saved.find((u) => u.email === "manager@bel.test");
  const suppAUser   = saved.find((u) => u.email === "a@supplier.test");
  const suppBUser   = saved.find((u) => u.email === "b@supplier.test");
  console.log(`👥 ${saved.length} users created`);

  // ---------- Credential for the admin (AFTER users exist) ----------
  await Credential.create({
    orgId: bel._id,
    subjectUserId: adminUser._id,
    type: "defence:write",
    issuedBy: adminUser._id,
    meta: { scope: "records" },
  });
  console.log("🎫 1 credential issued (defence:write → BEL Admin)");

  // ---------- Ledger helper (defined BEFORE any appendEntry call) ----------
  let prev = "0".repeat(64);
  const appendEntry = async ({ orgId, recordId, action, actorUserId, payloadHash, signature = "", meta = {} }) => {
    const index = await LedgerEntry.countDocuments({});
    const timestamp = new Date().toISOString();
    const entryHash = crypto
      .createHash("sha256")
      .update(`${index}|${timestamp}|${orgId}|${recordId}|${action}|${payloadHash}|${prev}|${signature}|`)
      .digest("hex");
    const e = await LedgerEntry.create({
      index, timestamp, orgId, recordId, action, payloadHash, prevHash: prev, entryHash,
      actorUserId, signature, meta,
    });
    prev = entryHash;
    return e;
  };

  // ---------- Records ----------
  const rec1 = await Record.create({
    orgId: bel._id, packId: "defence", templateKey: "component",
    title: "Radar Array Mk-II",
    fields: { partNumber: "BEL-RAD-001", serialNumber: "SN-AAA-001", clearance: "restricted" },
    createdBy: adminUser._id,
  });
  const rec2 = await Record.create({
    orgId: suppA._id, packId: "defence", templateKey: "component",
    title: "Signal Processor",
    fields: { partNumber: "SUPPA-SP-77", serialNumber: "SN-SPA-014", clearance: "restricted" },
    createdBy: suppAUser._id,
  });
  const rec3 = await Record.create({
    orgId: suppB._id, packId: "defence", templateKey: "component",
    title: "Power Module",
    fields: { partNumber: "SUPPB-PM-12", serialNumber: "SN-SPB-009", clearance: "restricted" },
    createdBy: suppBUser._id,
  });
  const rec4 = await Record.create({
    orgId: bel._id, packId: "defence", templateKey: "testReport",
    title: "Radar Array — Initial Test",
    fields: { componentRef: "BEL-RAD-001", result: "pass", notes: "Range test OK" },
    createdBy: adminUser._id,
  });
  console.log(`📦 ${await Record.countDocuments()} records created`);

  // ---------- Version history (v1 for each record) ----------
  for (const r of [rec1, rec2, rec3, rec4]) {
    await RecordVersion.create({
      recordId: r._id,
      orgId: r.orgId,
      version: 1,
      fields: r.fields,
      fieldsHash: sha256(r.fields),
      createdBy: r.createdBy,
      note: "initial version",
    });
  }
  console.log(`🧾 ${await RecordVersion.countDocuments()} record versions created`);

  // ---------- Ledger entries for record creation/updates ----------
  await appendEntry({
    orgId: bel._id, recordId: rec1._id, action: "record:create", actorUserId: adminUser._id,
    payloadHash: sha256(rec1.fields), meta: { title: rec1.title },
  });
  await appendEntry({
    orgId: suppA._id, recordId: rec2._id, action: "record:create", actorUserId: suppAUser._id,
    payloadHash: sha256(rec2.fields), meta: { title: rec2.title },
  });
  await appendEntry({
    orgId: suppB._id, recordId: rec3._id, action: "record:create", actorUserId: suppBUser._id,
    payloadHash: sha256(rec3.fields), meta: { title: rec3.title },
  });
  await appendEntry({
    orgId: bel._id, recordId: rec4._id, action: "record:create", actorUserId: adminUser._id,
    payloadHash: sha256(rec4.fields), meta: { title: rec4.title },
  });
  await appendEntry({
    orgId: bel._id, recordId: rec1._id, action: "record:update", actorUserId: adminUser._id,
    payloadHash: sha256({ field: "clearance", to: "secret" }), meta: { field: "clearance" },
  });
  console.log(`📒 ${await LedgerEntry.countDocuments()} ledger entries appended (records)`);

  // ---------- Sample document on rec1 ----------
  const sampleBody = Buffer.from(
    "BEL Unit 3 — Inspection Report\nPart: BEL-RAD-001\nSerial: SN-AAA-001\nStatus: PASS\n",
    "utf8"
  );
  const { cid, plainHash } = await put({ orgId: bel._id, buffer: sampleBody });
  const signature = await signForOrg(bel._id, plainHash);

  const sampleDoc = await Document.create({
    orgId: bel._id,
    recordId: rec1._id,
    filename: "inspection-report.txt",
    mimeType: "text/plain",
    size: sampleBody.length,
    cid,
    sha256: plainHash,
    uploadedBy: adminUser._id,
    signature,
  });

  // Anchored with payloadHash = file's SHA-256, signature = org's RSA sign over that hash.
  // This is what /verify compares against.
  const docEntry = await appendEntry({
    orgId: bel._id,
    recordId: rec1._id,
    action: "document:upload",
    actorUserId: adminUser._id,
    payloadHash: plainHash,
    signature,
    meta: { documentId: String(sampleDoc._id), filename: sampleDoc.filename, size: sampleDoc.size },
  });
  sampleDoc.ledgerIndex = docEntry.index;
  await sampleDoc.save();
  console.log(`📎 1 sample document uploaded (${sampleDoc.filename}) → ledger #${docEntry.index}`);
  console.log(`📎 plaintext sha256 = ${plainHash}`);

  // ---------- One pending approval ----------
  await ApprovalRequest.create({
    orgId: bel._id,
    recordId: rec1._id,
    action: "record:update",
    requestedBy: managerUser._id,
    requiredApprovals: 2,
    status: "pending",
    payload: {
      // Correct shape — approvals route reads `proposedFields` + `fieldsHash`
      proposedFields: { partNumber: "BEL-RAD-001", serialNumber: "SN-AAA-001", clearance: "secret" },
      fieldsHash: sha256({ partNumber: "BEL-RAD-001", serialNumber: "SN-AAA-001", clearance: "secret" }),
    },
  });
  console.log("📝 1 pending approval created");

  // ---------- One share (Supplier A sees BEL's test report) ----------
  await Share.create({
    recordId: rec4._id,
    fromOrgId: bel._id,
    toOrgId: suppA._id,
    fields: [],
    createdBy: adminUser._id,
  });
  console.log("🔗 1 cross-org share created (BEL → Supplier A, test report)");

  // ---------- Demo logins ----------
  console.log("\n📋 Demo logins (password: " + demoPass + "):");
  for (const u of usersToCreate) {
    console.log(`   ${u.role.padEnd(9)} ${u.email}`);
  }
  console.log("\n✅ Seed complete. Try: admin@bel.test / Bel@12345\n");

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error("❌ Seed failed:", err);
  process.exit(1);
});