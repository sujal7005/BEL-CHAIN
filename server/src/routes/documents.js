import { Router } from "express";
import multer from "multer";
import crypto from "crypto";
import { auth } from "../middleware/auth.js";
import { Document } from "../models/Document.js";
import { Record } from "../models/Record.js";
import { LedgerEntry } from "../models/LedgerEntry.js";
import { writeAudit } from "../core/audit.js";
import { can } from "../core/access.js";
import { put, get } from "../trust/IPFSStorage.js";
import { signForOrg } from "../trust/KeyManager.js";
import { sha256Hex } from "../trust/CryptoService.js";

const router = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 }, // 20 MB
});

/* ------------------------------------------------------------
 * helper: append a ledger entry
 * ---------------------------------------------------------- */
async function appendLedger({ orgId, recordId, action, actorUserId, payloadHash, signature, meta }) {
  const last = await LedgerEntry.findOne().sort({ index: -1 }).lean();
  const index = last ? last.index + 1 : 0;
  const prev = last ? last.entryHash : "0".repeat(64);
  const timestamp = new Date().toISOString();
  const entryHash = crypto
    .createHash("sha256")
    .update(`${index}|${timestamp}|${orgId}|${recordId}|${action}|${payloadHash}|${prev}|${signature || ""}|`)
    .digest("hex");
  return LedgerEntry.create({
    index, timestamp, orgId, recordId, action, payloadHash, prevHash: prev, entryHash,
    actorUserId, signature: signature || "", meta,
  });
}

/* ------------------------------------------------------------
 * POST /api/v1/records/:id/documents
 * multipart form: field name "file"
 * ---------------------------------------------------------- */
router.post("/records/:id/documents", auth, upload.single("file"), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ error: "No file uploaded (field: file)" });

    const record = await Record.findById(req.params.id);
    if (!record) return res.status(404).json({ error: "Record not found" });

    if (!can(req.user, "record:write", record, record.packId)) {
      return res.status(403).json({ error: "Forbidden" });
    }

    const { cid, plainHash } = await put({ orgId: record.orgId, buffer: req.file.buffer });

    // Sign the plaintext hash with the org key — proves "this org stored this file"
    const signature = await signForOrg(record.orgId, plainHash);

    const doc = await Document.create({
      orgId: record.orgId,
      recordId: record._id,
      filename: req.file.originalname,
      mimeType: req.file.mimetype,
      size: req.file.size,
      cid,
      sha256: plainHash,
      uploadedBy: req.user.userId,
      signature,
    });

    const entry = await appendLedger({
      orgId: record.orgId,
      recordId: record._id,
      action: "document:upload",
      actorUserId: req.user.userId,
      payloadHash: plainHash,
      signature,
      meta: { documentId: String(doc._id), filename: doc.filename, size: doc.size },
    });

    // Link back on the document for quick lookup
    doc.ledgerIndex = entry.index;
    await doc.save();

    await writeAudit({
      orgId: record.orgId,
      userId: req.user.userId,
      action: "document:upload",
      resourceId: doc._id,
      resourceType: "Document",
      meta: { filename: doc.filename, sha256: plainHash, ledgerIndex: entry.index },
    });

    res.status(201).json({
      document: doc,
      ledgerIndex: entry.index,
      entryHash: entry.entryHash,
    });
  } catch (err) {
    next(err);
  }
});

/* ------------------------------------------------------------
 * GET /api/v1/records/:id/documents — list docs for a record
 * ---------------------------------------------------------- */
router.get("/records/:id/documents", auth, async (req, res, next) => {
  try {
    const record = await Record.findById(req.params.id).lean();
    if (!record) return res.status(404).json({ error: "Record not found" });

    if (!can(req.user, "record:read", record, record.packId)) {
      return res.status(403).json({ error: "Forbidden" });
    }

    const docs = await Document.find({ recordId: record._id })
      .sort({ createdAt: -1 })
      .select("-signature")
      .lean();

    res.json({ documents: docs });
  } catch (err) {
    next(err);
  }
});

/* ------------------------------------------------------------
 * GET /api/v1/documents/:id/download — ABAC + decrypt
 * ---------------------------------------------------------- */
router.get("/documents/:id/download", auth, async (req, res, next) => {
  try {
    if (req.user.role === "auditor") {
      return res.status(403).json({ error: "Auditors cannot download files" });
    }

    const doc = await Document.findById(req.params.id).lean();
    if (!doc) return res.status(404).json({ error: "Not found" });

    // Access: same org OR shared via a Share doc that includes this record
    const sameOrg = String(doc.orgId) === String(req.user.orgId);
    if (!sameOrg) {
      // shares grant metadata, not files, per the spec — deny
      return res.status(403).json({ error: "Forbidden" });
    }

    const plain = await get({ orgId: doc.orgId, cid: doc.cid });

    // Defensive: recompute hash and compare — if it doesn't match, refuse
    const recomputed = sha256Hex(plain);
    if (recomputed !== doc.sha256) {
      return res.status(500).json({ error: "Decrypted hash mismatch — refusing download" });
    }

    await writeAudit({
      orgId: doc.orgId,
      userId: req.user.userId,
      action: "document:download",
      resourceId: doc._id,
      resourceType: "Document",
      meta: { filename: doc.filename, sha256: doc.sha256 },
    });

    res.setHeader("Content-Type", doc.mimeType);
    res.setHeader("Content-Disposition", `attachment; filename="${doc.filename}"`);
    res.setHeader("X-Document-Sha256", doc.sha256);
    res.send(plain);
  } catch (err) {
    next(err);
  }
});

/* ------------------------------------------------------------
 * DELETE is intentionally NOT exposed.
 * The ledger is append-only and documents are on IPFS; a document
 * "delete" would be a metadata tombstone, not a file removal.
 * ---------------------------------------------------------- */

export default router;