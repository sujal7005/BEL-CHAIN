import crypto from "crypto";
import { LedgerService } from "./LedgerService.js";
import { LedgerEntry } from "../models/LedgerEntry.js";
import { KeyPair } from "../models/KeyPair.js";
import { verifyHex } from "./CryptoService.js";

function computeEntryHash(e) {
  return crypto
    .createHash("sha256")
    .update(
      `${e.index}|${e.timestamp}|${e.orgId}|${e.recordId}|${e.action}|${e.payloadHash}|${e.prevHash}|${e.signature || ""}|`
    )
    .digest("hex");
}

export class MongoLedger extends LedgerService {
  /**
   * Append an entry. This is the ONLY write path.
   * Caller must supply `payloadHash` (SHA-256 hex of the trusted payload)
   * and, optionally, `signature` (RSA base64) — the entry hash includes
   * both, so tampering with either breaks the chain.
   */
  async append({ orgId, recordId, action, payloadHash, signature = "", meta = {}, actorUserId }) {
    const last = await LedgerEntry.findOne().sort({ index: -1 }).lean();
    const index = last ? last.index + 1 : 0;
    const prevHash = last ? last.entryHash : "0".repeat(64);
    const timestamp = new Date().toISOString();

    const entryHash = computeEntryHash({
      index, timestamp, orgId, recordId, action, payloadHash, prevHash, signature,
    });

    return LedgerEntry.create({
      index, timestamp, orgId, recordId, action, payloadHash, prevHash, entryHash,
      signature, meta, actorUserId,
    });
  }

  async getEntry(id) {
    return LedgerEntry.findById(id).populate("orgId", "name").lean();
  }

  async getHistory(recordId) {
    return LedgerEntry.find({ recordId }).sort({ index: 1 }).lean();
  }

  async list({ filter = {}, page = 1, limit = 25 } = {}) {
    const skip = (Math.max(1, page) - 1) * limit;
    const [entries, total] = await Promise.all([
      LedgerEntry.find(filter).sort({ index: -1 }).skip(skip).limit(limit)
        .populate("orgId", "name").lean(),
      LedgerEntry.countDocuments(filter),
    ]);
    return { entries, total, page, limit, pages: Math.ceil(total / limit) };
  }

  /**
   * Recompute every hash in order and validate:
   *   - entryHash matches the recomputed hash
   *   - prevHash matches the previous entry's entryHash
   *   - signature (if present) verifies against the org's public key
   * Reports the FIRST broken index.
   */
  async verifyChain() {
    const entries = await LedgerEntry.find().sort({ index: 1 }).lean();
    if (entries.length === 0) return { ok: true, count: 0, message: "Empty chain" };

    const orgIds = [...new Set(entries.map((e) => String(e.orgId)))];
    const keyPairs = await KeyPair.find({
      ownerType: "org",
      ownerId: { $in: orgIds },
      purpose: "encryption",
    }).lean();
    const pubByOrg = new Map(keyPairs.map((k) => [String(k.ownerId), k.publicKey]));

    let prev = "0".repeat(64);
    for (const e of entries) {
      const expected = computeEntryHash(e);
      if (e.entryHash !== expected) {
        return {
          ok: false, count: entries.length, brokenIndex: e.index,
          reason: "entry-hash-mismatch", expected, found: e.entryHash,
        };
      }
      if (e.prevHash !== prev) {
        return {
          ok: false, count: entries.length, brokenIndex: e.index,
          reason: "prev-hash-mismatch", expected: prev, found: e.prevHash,
        };
      }
      if (e.signature) {
        const pub = pubByOrg.get(String(e.orgId));
        if (!pub) {
          return { ok: false, count: entries.length, brokenIndex: e.index, reason: "missing-org-key" };
        }
        if (!verifyHex(e.payloadHash, e.signature, pub)) {
          return { ok: false, count: entries.length, brokenIndex: e.index, reason: "signature-invalid" };
        }
      }
      prev = e.entryHash;
    }
    return { ok: true, count: entries.length, message: `Chain OK (${entries.length} entries)` };
  }
}