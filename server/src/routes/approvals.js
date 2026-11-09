import { Router } from "express";
import { z } from "zod";
import { auth } from "../middleware/auth.js";
import { ApprovalRequest } from "../models/ApprovalRequest.js";
import { Record } from "../models/Record.js";
import { RecordVersion } from "../models/RecordVersion.js";
import { LedgerEntry } from "../models/LedgerEntry.js";
import { writeAudit } from "../core/audit.js";
import { User } from "../models/User.js";
import { sha256 } from "../core/records.js";
import crypto from "crypto";

const router = Router();

/* ------------------------------------------------------------
 * Helper: append a ledger entry safely (single-writer pattern
 * — in production this would be serialized, but fine for proto)
 * ---------------------------------------------------------- */
async function appendLedger({ orgId, recordId, action, actorUserId, payloadHash, meta }) {
  const last = await LedgerEntry.findOne().sort({ index: -1 }).lean();
  const index = last ? last.index + 1 : 0;
  const prev = last ? last.entryHash : "0".repeat(64);
  const timestamp = new Date().toISOString();
  const entryHash = crypto
    .createHash("sha256")
    .update(`${index}|${timestamp}|${orgId}|${recordId}|${action}|${payloadHash}|${prev}|`)
    .digest("hex");
  return LedgerEntry.create({
    index, timestamp, orgId, recordId, action,
    payloadHash, prevHash: prev, entryHash, actorUserId, meta,
  });
}

/* ------------------------------------------------------------
 * GET /api/v1/approvals
 *   ?status=pending|approved|rejected   (default: pending)
 *   ?mine=1                             (only mine, as requester)
 *   Auditor sees everything; others see only their org
 * ---------------------------------------------------------- */
router.get("/", auth, async (req, res, next) => {
  try {
    const status = req.query.status || "pending";
    const onlyMine = req.query.mine === "1";

    const filter = { status };
    if (req.user.role !== "auditor") filter.orgId = req.user.orgId;
    if (onlyMine) filter.requestedBy = req.user.userId;

    const items = await ApprovalRequest.find(filter)
      .sort({ createdAt: -1 })
      .limit(100)
      .populate("requestedBy", "name email role")
      .populate("recordId", "title templateKey packId version status")
      .lean();

    // Derive "can I vote?" for each — user must be in same org,
    // and must not have already voted on this request
    const shaped = items.map((a) => {
      const alreadyVoted = (a.approvals || []).some(
        (v) => String(v.userId) === String(req.user.userId)
      );
      const sameOrg = String(a.orgId) === String(req.user.orgId);
      const isRequester = String(a.requestedBy?._id) === String(req.user.userId);
      const canVote =
        req.user.role !== "auditor" &&
        sameOrg &&
        !alreadyVoted &&
        !isRequester &&
        a.status === "pending";
      return { ...a, canVote, alreadyVoted, isRequester };
    });

    res.json({ approvals: shaped });
  } catch (err) {
    next(err);
  }
});

/* ------------------------------------------------------------
 * GET /api/v1/approvals/:id
 * ---------------------------------------------------------- */
router.get("/:id", auth, async (req, res, next) => {
  try {
    const item = await ApprovalRequest.findById(req.params.id)
      .populate("requestedBy", "name email role")
      .populate("recordId", "title templateKey packId version status fields")
      .populate("approvals.userId", "name email role")
      .lean();
    if (!item) return res.status(404).json({ error: "Not found" });

    if (req.user.role !== "auditor" && String(item.orgId) !== String(req.user.orgId)) {
      return res.status(403).json({ error: "Forbidden" });
    }
    res.json({ approval: item });
  } catch (err) {
    next(err);
  }
});

/* ------------------------------------------------------------
 * POST /api/v1/approvals/:id/approve
 * POST /api/v1/approvals/:id/reject
 * Body: { note?: string }
 * ---------------------------------------------------------- */
const decisionSchema = z.object({
  note: z.string().max(500).optional().default(""),
});

async function decide(req, res, next, decision) {
  try {
    if (req.user.role === "auditor") {
      return res.status(403).json({ error: "Auditors cannot vote" });
    }

    const parsed = decisionSchema.safeParse(req.body || {});
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid input", details: parsed.error.issues });
    }

    const item = await ApprovalRequest.findById(req.params.id);
    if (!item) return res.status(404).json({ error: "Not found" });
    if (String(item.orgId) !== String(req.user.orgId)) {
      return res.status(403).json({ error: "Forbidden" });
    }
    if (item.status !== "pending") {
      return res.status(409).json({ error: `Approval already ${item.status}` });
    }
    if (String(item.requestedBy) === String(req.user.userId)) {
      return res.status(403).json({ error: "Requester cannot approve their own request" });
    }
    if ((item.approvals || []).some((a) => String(a.userId) === String(req.user.userId))) {
      return res.status(409).json({ error: "You have already voted on this request" });
    }

    item.approvals.push({
      userId: req.user.userId,
      at: new Date(),
      decision,
      note: parsed.data.note,
    });

    // Count decisions
    const approveCount = item.approvals.filter((a) => a.decision === "approve").length;
    const rejectCount = item.approvals.filter((a) => a.decision === "reject").length;

    let finalize = null;

    if (decision === "reject") {
      item.status = "rejected";
    } else if (approveCount >= item.requiredApprovals) {
      item.status = "approved";
      finalize = "apply";
    }
    // else: still pending, just save the vote

    await item.save();

    await writeAudit({
      orgId: item.orgId,
      userId: req.user.userId,
      action: decision === "approve" ? "approval:approve" : "approval:reject",
      resourceId: item._id,
      resourceType: "ApprovalRequest",
      meta: {
        action: item.action,
        approveCount,
        rejectCount,
        requiredApprovals: item.requiredApprovals,
        decision,
      },
    });

    /* --------------------------------------------------------
     * If approved by enough people → apply the change NOW:
     *   - create new RecordVersion with proposedFields
     *   - bump Record.fields + version
     *   - append ledger entry
     * If rejected → ledger entry documenting the rejection
     * ------------------------------------------------------ */
    if (item.status === "approved") {
      const record = await Record.findById(item.recordId);
      if (!record) {
        item.status = "rejected";
        await item.save();
        return res.status(410).json({ error: "Record no longer exists" });
      }

      const proposedFields = item.payload?.proposedFields || {};
      const fieldsHash = item.payload?.fieldsHash || sha256(proposedFields);

      const nextVersion = record.version + 1;
      record.fields = proposedFields;
      record.version = nextVersion;
      record.title =
        proposedFields.partNumber ||
        proposedFields.serialNumber ||
        proposedFields.componentRef ||
        record.title;
      await record.save();

      await RecordVersion.create({
        recordId: record._id,
        orgId: record.orgId,
        version: nextVersion,
        fields: proposedFields,
        fieldsHash,
        createdBy: item.requestedBy,
        note: `approved by ${approveCount} approvers (approval ${item._id})`,
      });

      const entry = await appendLedger({
        orgId: record.orgId,
        recordId: record._id,
        action: "record:update",
        actorUserId: req.user.userId,
        payloadHash: fieldsHash,
        meta: {
          version: nextVersion,
          approvalId: String(item._id),
          approveCount,
          requiredApprovals: item.requiredApprovals,
        },
      });

      return res.json({
        approval: item,
        finalized: true,
        recordId: String(record._id),
        version: nextVersion,
        ledgerIndex: entry.index,
      });
    }

    if (item.status === "rejected") {
      // Record rejection on the ledger (no version bump — change not applied)
      await appendLedger({
        orgId: item.orgId,
        recordId: item.recordId,
        action: "record:update:rejected",
        actorUserId: req.user.userId,
        payloadHash: sha256({ approvalId: item._id, rejected: true }),
        meta: {
          approvalId: String(item._id),
          approveCount,
          rejectCount,
          requiredApprovals: item.requiredApprovals,
        },
      });
      return res.json({ approval: item, finalized: true, rejected: true });
    }

    // Still pending
    return res.json({
      approval: item,
      finalized: false,
      approveCount,
      requiredApprovals: item.requiredApprovals,
    });
  } catch (err) {
    next(err);
  }
}

router.post("/:id/approve", auth, (req, res, next) => decide(req, res, next, "approve"));
router.post("/:id/reject", auth, (req, res, next) => decide(req, res, next, "reject"));

export default router;