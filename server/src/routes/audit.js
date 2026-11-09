import { Router } from "express";
import { auth } from "../middleware/auth.js";
import { AuditEvent } from "../models/AuditEvent.js";

const router = Router();

/* GET /api/v1/audit?action=&userId=&orgId=&from=&to=&mismatchOnly=&page=&limit= */
router.get("/", auth, async (req, res, next) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 50));

    const filter = {};

    if (req.user.role !== "auditor") {
      filter.orgId = req.user.orgId;
    } else if (req.query.orgId) {
      filter.orgId = req.query.orgId;
    }

    if (req.query.action) filter.action = req.query.action;
    if (req.query.userId) filter.userId = req.query.userId;

    if (req.query.mismatchOnly === "1" || req.query.mismatchOnly === "true") {
      filter.action = { $in: ["verify:mismatch", "ledger:tamper-dev"] };
    }

    if (req.query.from || req.query.to) {
      filter.createdAt = {};
      if (req.query.from) filter.createdAt.$gte = new Date(req.query.from);
      if (req.query.to) filter.createdAt.$lte = new Date(req.query.to);
    }

    const [events, total] = await Promise.all([
      AuditEvent.find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .populate("orgId", "name")
        .populate("userId", "name email role")
        .lean(),
      AuditEvent.countDocuments(filter),
    ]);

    res.json({ events, total, page, limit, pages: Math.ceil(total / limit) });
  } catch (err) {
    next(err);
  }
});

/* Distinct actions present in the audit log (for the filter dropdown) */
router.get("/actions", auth, async (req, res, next) => {
  try {
    const match = req.user.role === "auditor" ? {} : { orgId: req.user.orgId };
    const actions = await AuditEvent.distinct("action", match);
    res.json({ actions: actions.sort() });
  } catch (err) {
    next(err);
  }
});

export default router;