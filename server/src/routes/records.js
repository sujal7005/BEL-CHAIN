import { Router } from "express";
import { z } from "zod";
import { auth } from "../middleware/auth.js";
import { Record } from "../models/Record.js";
import { Share } from "../models/Share.js";
import { ApprovalRequest } from "../models/ApprovalRequest.js";
import { LedgerEntry } from "../models/LedgerEntry.js";
import { writeAudit } from "../core/audit.js";
import { can, highRiskConfig, loadPack } from "../core/access.js";
import { createRecord, updateRecord, recordTimeline } from "../core/records.js";
import { enforceOrgScope } from "../middleware/enforceOrgScope.js";

const router = Router();

// ---------- list ----------
router.get("/", auth, async (req, res, next) => {
  try {
    const { orgId, role } = req.user;
    const packId = req.query.packId || "defence";
    const templateKey = req.query.templateKey;
    const status = req.query.status;

    const filter = {};
    if (role !== "auditor") filter.orgId = orgId;
    if (templateKey) filter.templateKey = templateKey;
    if (status) filter.status = status;

    const records = await Record.find(filter).sort({ createdAt: -1 }).limit(200).lean();
    res.json({ records });
  } catch (err) {
    next(err);
  }
});

// ---------- create ----------
const createSchema = z.object({
  packId: z.string().default("defence"),
  templateKey: z.string().min(1),
  fields: z.record(z.any()).default({}),
});

router.post("/", auth, async (req, res, next) => {
  try {
    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Invalid input", details: parsed.error.issues });

    const { packId, templateKey, fields } = parsed.data;
    const synthetic = { orgId: req.user.orgId };
    if (!can(req.user, "record:write", synthetic, packId)) {
      return res.status(403).json({ error: "Forbidden" });
    }

    // Credential-gated action (opt-in via body.gated so the demo stays simple)
    if (req.body?.gated === true) {
      const { hasActiveCredential } = await import("../core/access.js");
      const ok = await hasActiveCredential(req.user.userId, "defence:write");
      if (!ok) {
        return res.status(403).json({ error: "Missing active credential: defence:write" });
      }
    }

    const record = await createRecord({ user: req.user, packId, templateKey, rawFields: fields });

    const payloadHash = sha256String(JSON.stringify(fields));
    const index = await LedgerEntry.countDocuments({});
    const prev = index === 0 ? "0".repeat(64) : (await LedgerEntry.findOne().sort({ index: -1 }).lean()).entryHash;
    const timestamp = new Date().toISOString();
    const entryHash = sha256String(`${index}|${timestamp}|${req.user.orgId}|${record._id}|record:create|${payloadHash}|${prev}|`);
    const entry = await LedgerEntry.create({
      index, timestamp, orgId: req.user.orgId, recordId: record._id,
      action: "record:create", payloadHash, prevHash: prev, entryHash,
      actorUserId: req.user.userId, meta: { title: record.title, templateKey },
    });

    await writeAudit({
      orgId: req.user.orgId, userId: req.user.userId,
      action: "record:create", resourceId: record._id, resourceType: "Record",
      meta: { title: record.title, ledgerIndex: entry.index },
    });

    res.status(201).json({ record, ledgerIndex: entry.index, entryHash });
  } catch (err) {
    next(err);
  }
});

// ---------- read one ----------
router.get("/:id", 
  auth, 
  enforceOrgScope(async (req) => {
    const r = await Record.findById(req.params.id).select("orgId").lean();
    return r?.orgId;
  }),
  async (req, res, next) => {
  try {
    const record = await Record.findById(req.params.id).lean();
    if (!record) return res.status(404).json({ error: "Not found" });

    // Same-org or auditor or shared
    if (!can(req.user, "record:read", record, record.packId)) {
      const share = await Share.findOne({ recordId: record._id, toOrgId: req.user.orgId }).lean();
      if (!share) return res.status(403).json({ error: "Forbidden" });
    }

    const entries = await LedgerEntry.find({ recordId: record._id }).sort({ index: 1 }).lean();
    const latestEntry = entries[entries.length - 1] || null;

    res.json({
      record,
      proof: latestEntry
        ? {
            index: latestEntry.index,
            entryHash: latestEntry.entryHash,
            payloadHash: latestEntry.payloadHash,
            timestamp: latestEntry.timestamp,
          }
        : null,
    });
  } catch (err) {
    next(err);
  }
});

// ---------- update (may require approval) ----------
const updateSchema = z.object({
  fields: z.record(z.any()),
  forceApproval: z.boolean().optional(),
});

router.put("/:id", auth, async (req, res, next) => {
  try {
    const parsed = updateSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Invalid input", details: parsed.error.issues });

    const record = await Record.findById(req.params.id);
    if (!record) return res.status(404).json({ error: "Not found" });

    if (!can(req.user, "record:write", record, record.packId)) {
      return res.status(403).json({ error: "Forbidden" });
    }

    const { highRiskActions, requiredApprovals } = highRiskConfig(record.packId);
    const needsApproval =
      parsed.data.forceApproval === true || highRiskActions.has("record:update");

    if (needsApproval && req.user.role !== "admin") {
      // Create a pending approval request — do NOT write the version yet
      const { proposedFields, fieldsHash } = await updateRecord({
        user: req.user, record, rawFields: parsed.data.fields, requireApproval: true,
      });
      const reqDoc = await ApprovalRequest.create({
        orgId: record.orgId,
        recordId: record._id,
        action: "record:update",
        requestedBy: req.user.userId,
        requiredApprovals: requiredApprovals["record:update"] || 2,
        status: "pending",
        payload: { proposedFields, fieldsHash },
      });
      await writeAudit({
        orgId: record.orgId, userId: req.user.userId,
        action: "approval:request", resourceId: record._id, resourceType: "Record",
        meta: { approvalId: reqDoc._id, action: "record:update" },
      });
      return res.status(202).json({
        pending: true,
        approvalId: reqDoc._id,
        message: "High-risk action requires approvals",
      });
    }

    // Direct update (admin or non-high-risk)
    const { record: saved, fieldsHash } = await updateRecord({
      user: req.user, record, rawFields: parsed.data.fields, requireApproval: false,
    });

    // Ledger + audit
    const index = await LedgerEntry.countDocuments({});
    const prev = index === 0 ? "0".repeat(64) : (await LedgerEntry.findOne().sort({ index: -1 }).lean()).entryHash;
    const timestamp = new Date().toISOString();
    const entryHash = sha256String(`${index}|${timestamp}|${record.orgId}|${record._id}|record:update|${fieldsHash}|${prev}|`);
    const entry = await LedgerEntry.create({
      index, timestamp, orgId: record.orgId, recordId: record._id,
      action: "record:update", payloadHash: fieldsHash, prevHash: prev, entryHash,
      actorUserId: req.user.userId, meta: { version: saved.version },
    });
    await writeAudit({
      orgId: record.orgId, userId: req.user.userId,
      action: "record:update", resourceId: record._id, resourceType: "Record",
      meta: { version: saved.version, ledgerIndex: entry.index },
    });

    res.json({ record: saved, ledgerIndex: entry.index });
  } catch (err) {
    next(err);
  }
});

// ---------- history ----------
router.get("/:id/history", auth, async (req, res, next) => {
  try {
    const record = await Record.findById(req.params.id).lean();
    if (!record) return res.status(404).json({ error: "Not found" });
    if (!can(req.user, "record:read", record, record.packId)) {
      const share = await Share.findOne({ recordId: record._id, toOrgId: req.user.orgId }).lean();
      if (!share) return res.status(403).json({ error: "Forbidden" });
    }
    const timeline = await recordTimeline(record._id);
    res.json({ recordId: record._id, timeline });
  } catch (err) {
    next(err);
  }
});

// ---------- pack metadata (form generation) ----------
router.get("/meta/template", auth, async (req, res, next) => {
  try {
    const packId = req.query.packId || "defence";
    const templateKey = req.query.templateKey;
    const pack = loadPack(packId);
    if (!templateKey) return res.json({ templates: pack.templates });
    const tpl = pack.templates[templateKey];
    if (!tpl) return res.status(404).json({ error: "Template not found" });
    res.json({ templateKey, ...tpl });
  } catch (err) {
    next(err);
  }
});

// ---------- helpers ----------
import crypto from "crypto";
function sha256String(s) {
  return crypto.createHash("sha256").update(s).digest("hex");
}

export default router;