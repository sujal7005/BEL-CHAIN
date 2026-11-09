import { Router } from "express";
import { z } from "zod";
import { auth } from "../middleware/auth.js";
import { Credential } from "../models/Credential.js";
import { User } from "../models/User.js";
import { writeAudit } from "../core/audit.js";

const router = Router();

/* POST /api/v1/credentials — admin/manager issues a credential */
const issueSchema = z.object({
  subjectUserId: z.string().regex(/^[0-9a-fA-F]{24}$/),
  type: z.string().min(2),
  meta: z.record(z.any()).optional(),
});

router.post("/", auth, async (req, res, next) => {
  try {
    if (!["admin", "manager"].includes(req.user.role)) {
      return res.status(403).json({ error: "Only admin/manager can issue" });
    }
    const parsed = issueSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Invalid input", details: parsed.error.issues });

    const subject = await User.findById(parsed.data.subjectUserId).lean();
    if (!subject || String(subject.orgId) !== String(req.user.orgId)) {
      return res.status(404).json({ error: "Subject not found in your org" });
    }

    const cred = await Credential.create({
      orgId: req.user.orgId,
      subjectUserId: subject._id,
      type: parsed.data.type,
      issuedBy: req.user.userId,
      meta: parsed.data.meta || {},
    });

    await writeAudit({
      orgId: req.user.orgId,
      userId: req.user.userId,
      action: "credential:issue",
      resourceId: cred._id,
      resourceType: "Credential",
      meta: { subjectUserId: String(subject._id), type: cred.type },
    });

    res.status(201).json({ credential: cred });
  } catch (err) {
    next(err);
  }
});

/* POST /api/v1/credentials/:id/revoke */
router.post("/:id/revoke", auth, async (req, res, next) => {
  try {
    const cred = await Credential.findById(req.params.id);
    if (!cred) return res.status(404).json({ error: "Not found" });
    if (String(cred.orgId) !== String(req.user.orgId)) return res.status(403).json({ error: "Forbidden" });
    if (!["admin", "manager"].includes(req.user.role)) return res.status(403).json({ error: "Forbidden" });
    if (cred.status === "revoked") return res.status(409).json({ error: "Already revoked" });

    cred.status = "revoked";
    cred.revokedAt = new Date();
    cred.revokedBy = req.user.userId;
    await cred.save();

    await writeAudit({
      orgId: cred.orgId,
      userId: req.user.userId,
      action: "credential:revoke",
      resourceId: cred._id,
      resourceType: "Credential",
      meta: { subjectUserId: String(cred.subjectUserId), type: cred.type },
    });

    res.json({ credential: cred });
  } catch (err) {
    next(err);
  }
});

/* GET /api/v1/credentials/:id/verify */
router.get("/:id/verify", auth, async (req, res, next) => {
  try {
    const cred = await Credential.findById(req.params.id).lean();
    if (!cred) return res.status(404).json({ error: "Not found" });
    res.json({
      valid: cred.status === "active",
      status: cred.status,
      type: cred.type,
      issuedAt: cred.issuedAt,
      revokedAt: cred.revokedAt || null,
    });
  } catch (err) {
    next(err);
  }
});

export default router;