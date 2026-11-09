import { Router } from "express";
import multer from "multer";
import { auth } from "../middleware/auth.js";
import { Document } from "../models/Document.js";
import { LedgerEntry } from "../models/LedgerEntry.js";
import { writeAudit } from "../core/audit.js";
import { sha256Hex } from "../trust/CryptoService.js";
import { verifyForOrg } from "../trust/KeyManager.js";

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

/* ------------------------------------------------------------
 * POST /api/v1/verify
 * multipart: file=@path, documentId=<id>
 * -> { result: "match" | "changed", uploadedHash, ledgerHash, ... }
 * ---------------------------------------------------------- */
router.post("/verify", auth, upload.single("file"), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ error: "No file uploaded (field: file)" });
    const { documentId } = req.body;
    if (!documentId) return res.status(400).json({ error: "documentId is required" });

    const doc = await Document.findById(documentId).lean();
    if (!doc) return res.status(404).json({ error: "Document not found" });

    // Access: same org or auditor
    if (req.user.role !== "auditor" && String(doc.orgId) !== String(req.user.orgId)) {
      return res.status(403).json({ error: "Forbidden" });
    }

    const uploadedHash = sha256Hex(req.file.buffer);

    // Look up the anchoring ledger entry
    const entry = await LedgerEntry.findOne({
      recordId: doc.recordId,
      action: "document:upload",
      payloadHash: doc.sha256,
    }).lean();

    const match = uploadedHash === doc.sha256 && entry && entry.payloadHash === doc.sha256;

    // Optionally verify the org's RSA signature over the anchored hash
    let signatureValid = null;
    if (entry?.signature) {
      try {
        signatureValid = await verifyForOrg(doc.orgId, doc.sha256, entry.signature);
      } catch {
        signatureValid = false;
      }
    }

    await writeAudit({
      orgId: doc.orgId,
      userId: req.user.userId,
      action: match ? "verify:match" : "verify:mismatch",
      resourceId: doc._id,
      resourceType: "Document",
      meta: {
        filename: doc.filename,
        uploadedHash,
        ledgerHash: doc.sha256,
        ledgerIndex: entry?.index,
        signatureValid,
      },
    });

    res.json({
      result: match ? "match" : "changed",
      uploadedHash,
      ledgerHash: doc.sha256,
      ledgerIndex: entry?.index ?? null,
      entryHash: entry?.entryHash ?? null,
      signatureValid,
      filename: doc.filename,
      recordId: doc.recordId,
    });
  } catch (err) {
    next(err);
  }
});

export default router;