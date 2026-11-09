import { Router } from "express";
import crypto from "crypto";
import { auth } from "../middleware/auth.js";
import { LedgerEntry } from "../models/LedgerEntry.js";
import { KeyPair } from "../models/KeyPair.js";
import { writeAudit } from "../core/audit.js";
import { config } from "../config.js";
import { verifyHex } from "../trust/CryptoService.js";
import { getLedger } from "../trust/LedgerService.js";

const router = Router();

/* --------------------------------------------------------------
 * Hash rule — MUST match what the writer used.
 * If you ever change this, existing entries won't verify.
 * ------------------------------------------------------------ */
function computeEntryHash(e) {
  return crypto
    .createHash("sha256")
    .update(
      `${e.index}|${e.timestamp}|${e.orgId}|${e.recordId}|${e.action}|${e.payloadHash}|${e.prevHash}|${e.signature || ""}|`
    )
    .digest("hex");
}

/* --------------------------------------------------------------
 * GET /api/v1/ledger?page=1&limit=25&orgId=&action=
 *   Auditor sees all; others see their own org entries.
 * ------------------------------------------------------------ */
router.get("/", auth, async (req, res, next) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 25));
    const { orgId, action } = req.query;

    const filter = {};
    if (req.user.role !== "auditor") filter.orgId = req.user.orgId;
    else if (orgId) filter.orgId = orgId;
    if (action) filter.action = action;

    const [entries, total] = await Promise.all([
      LedgerEntry.find(filter)
        .sort({ index: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .populate("orgId", "name")
        .lean(),
      LedgerEntry.countDocuments(filter),
    ]);

    res.json({ entries, total, page, limit, pages: Math.ceil(total / limit) });
  } catch (err) {
    next(err);
  }
});

/* --------------------------------------------------------------
 * GET /api/v1/ledger/verify
 *   Walks the chain in order. Reports the FIRST broken index.
 *   Checks: recomputed entryHash, prevHash linkage, RSA signature.
 * ------------------------------------------------------------ */
router.get("/verify", auth, async (_req, res, next) => {
  try {
    const ledger = await getLedger();
    res.json(await ledger.verifyChain());
  } catch (err) { next(err); }
});
// router.get("/verify", auth, async (_req, res, next) => {
//   try {
//     const entries = await LedgerEntry.find().sort({ index: 1 }).lean();
//     if (entries.length === 0) {
//       return res.json({ ok: true, count: 0, message: "Empty chain" });
//     }

//     // Preload public keys for the orgs that appear
//     const orgIds = [...new Set(entries.map((e) => String(e.orgId)))];
//     const keyPairs = await KeyPair.find({
//       ownerType: "org",
//       ownerId: { $in: orgIds },
//       purpose: "encryption",
//     }).lean();
//     const pubByOrg = new Map(keyPairs.map((k) => [String(k.ownerId), k.publicKey]));

//     let prev = "0".repeat(64);
//     for (const e of entries) {
//       // 1. Recompute hash
//       const expected = computeEntryHash(e);
//       if (e.entryHash !== expected) {
//         return res.json({
//           ok: false,
//           count: entries.length,
//           brokenIndex: e.index,
//           reason: "entry-hash-mismatch",
//           expected,
//           found: e.entryHash,
//         });
//       }

//       // 2. Chain linkage
//       if (e.prevHash !== prev) {
//         return res.json({
//           ok: false,
//           count: entries.length,
//           brokenIndex: e.index,
//           reason: "prev-hash-mismatch",
//           expected: prev,
//           found: e.prevHash,
//         });
//       }

//       // 3. Signature (skip entries with no signature — e.g. record:create in seed)
//       if (e.signature) {
//         const pub = pubByOrg.get(String(e.orgId));
//         if (!pub) {
//           return res.json({
//             ok: false,
//             count: entries.length,
//             brokenIndex: e.index,
//             reason: "missing-org-key",
//           });
//         }
//         const sigOk = verifyHex(e.payloadHash, e.signature, pub);
//         if (!sigOk) {
//           return res.json({
//             ok: false,
//             count: entries.length,
//             brokenIndex: e.index,
//             reason: "signature-invalid",
//           });
//         }
//       }

//       prev = e.entryHash;
//     }

//     res.json({
//       ok: true,
//       count: entries.length,
//       message: `Chain OK (${entries.length} entries)`,
//     });
//   } catch (err) {
//     next(err);
//   }
// });

/* --------------------------------------------------------------
 * DEV-ONLY: POST /api/v1/ledger/__tamper
 *   Mutates one field on one entry directly via the raw driver,
 *   bypassing the model guard. This is exactly what a real
 *   attacker with DB write access would do — and the whole point
 *   of the demo is that verifyChain() catches it.
 *
 *   Disabled when NODE_ENV=production.
 * ------------------------------------------------------------ */
router.post("/__tamper", auth, async (req, res, next) => {
  try {
    if (config.isProd) return res.status(404).end();
    const { index, field = "payloadHash", value } = req.body || {};
    if (typeof index !== "number") {
      return res.status(400).json({ error: "index (number) is required" });
    }
    if (!["payloadHash", "timestamp", "entryHash"].includes(field)) {
      return res.status(400).json({ error: "Only payloadHash/timestamp/entryHash tampering is allowed" });
    }

    const target = await LedgerEntry.findOne({ index }).lean();
    if (!target) return res.status(404).json({ error: "Entry not found" });

    const newValue =
      value !== undefined
        ? value
        : field === "timestamp"
        ? new Date().toISOString()
        : crypto.randomBytes(32).toString("hex");

    // Raw driver — bypasses the append-only model guard on purpose.
    await LedgerEntry.collection.updateOne(
      { index },
      { $set: { [field]: newValue } }
    );

    await writeAudit({
      orgId: req.user.orgId,
      userId: req.user.userId,
      action: "ledger:tamper-dev",
      resourceId: target._id,
      resourceType: "LedgerEntry",
      meta: { index, field, before: target[field], after: newValue },
    });

    res.json({ ok: true, index, field, before: target[field], after: newValue });
  } catch (err) {
    next(err);
  }
});

/* --------------------------------------------------------------
 * DEV-ONLY: POST /api/v1/ledger/__restore
 *   Re-seeds the entire database. Convenience for demos where
 *   someone hits "Tamper" and then wants a clean state without
 *   switching to a terminal.
 *
 *   If you don't want this, just delete the handler and rely on
 *   `npm run seed` from the terminal.
 * ------------------------------------------------------------ */
router.post("/__restore", auth, async (req, res, next) => {
  try {
    if (config.isProd) return res.status(404).end();
    // Avoid circular imports by lazy-loading
    const { execFile } = await import("child_process");
    const { fileURLToPath } = await import("url");
    const path = await import("path");
    const __dirname = path.dirname(fileURLToPath(import.meta.url));
    const seedPath = path.resolve(__dirname, "..", "seed", "seed.js");

    execFile("node", [seedPath], { env: process.env }, (err, stdout, stderr) => {
      if (err) {
        return res.status(500).json({ error: "Restore failed", stderr, stdout });
      }
      res.json({ ok: true, output: stdout });
    });
  } catch (err) {
    next(err);
  }
});

/* --------------------------------------------------------------
 * GET /api/v1/ledger/:id   — single entry with its org key
 * ------------------------------------------------------------ */
router.get("/:id", auth, async (req, res, next) => {
  try {
    const entry = await LedgerEntry.findById(req.params.id)
      .populate("orgId", "name")
      .lean();
    if (!entry) return res.status(404).json({ error: "Entry not found" });

    if (req.user.role !== "auditor" && String(entry.orgId?._id) !== String(req.user.orgId)) {
      return res.status(403).json({ error: "Forbidden" });
    }
    res.json({ entry });
  } catch (err) {
    next(err);
  }
});

export default router;