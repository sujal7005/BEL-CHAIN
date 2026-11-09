import { Router } from "express";
import { auth } from "../middleware/auth.js";
import { Record } from "../models/Record.js";
import { LedgerEntry } from "../models/LedgerEntry.js";
import { ApprovalRequest } from "../models/ApprovalRequest.js";
import { AuditEvent } from "../models/AuditEvent.js";
import { Organization } from "../models/Organization.js";

const router = Router();

router.get("/", auth, async (req, res, next) => {
  try {
    const { orgId, role } = req.user;
    const isAuditor = role === "auditor";

    // Records — auditor sees total network count; others see their own org
    const recordScope = isAuditor ? {} : { orgId };
    const recordCount = await Record.countDocuments(recordScope);

    // Ledger — everyone can read the ledger metadata
    const ledgerCount = await LedgerEntry.countDocuments();

    // Pending approvals — own org for non-auditors; total for auditors
    const approvalScope = isAuditor ? { status: "pending" } : { orgId, status: "pending" };
    const pendingApprovals = await ApprovalRequest.find(approvalScope)
      .sort({ createdAt: -1 })
      .limit(5)
      .populate("requestedBy", "name email")
      .populate("recordId", "title templateKey")
      .lean();

    // Recent ledger activity (last 10 entries, network-wide — matches public ledger visibility)
    const recentLedger = await LedgerEntry.find({})
      .sort({ index: -1 })
      .limit(10)
      .populate("orgId", "name")
      .lean();

    // Verification failures — count audit events in last 7 days
    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const verificationFailures = await AuditEvent.countDocuments({
      action: "verify:mismatch",
      ...(isAuditor ? {} : { orgId }),
      createdAt: { $gte: since },
    });

    // Network members — all orgs on the network
    const members = await Organization.find({ active: true })
      .select("name type packId createdAt")
      .sort({ createdAt: 1 })
      .lean();

    res.json({
      stats: {
        records: recordCount,
        pendingApprovals: pendingApprovals.length,
        ledgerEntries: ledgerCount,
        verificationFailures,
      },
      recentLedger,
      needsApproval: pendingApprovals,
      members,
    });
  } catch (err) {
    next(err);
  }
});

export default router;