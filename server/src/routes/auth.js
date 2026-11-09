import { Router } from "express";
import jwt from "jsonwebtoken";
import { z } from "zod";
import { User } from "../models/User.js";
import { Organization } from "../models/Organization.js";
import { config } from "../config.js";
import { auth } from "../middleware/auth.js";

const router = Router();

// ---------- POST /api/v1/auth/login ----------
const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

router.post("/login", async (req, res, next) => {
  try {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid input", details: parsed.error.issues });
    }
    const { email, password } = parsed.data;

    const user = await User.findOne({ email: email.toLowerCase() })
      .select("+passwordHash")
      .lean({ getters: false, virtuals: false });

    if (!user || !user.active) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    // compare manually since we're using .lean() — recreate the method check
    const bcrypt = (await import("bcrypt")).default;
    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    await User.updateOne({ _id: user._id }, { $set: { lastLoginAt: new Date() } });

    const token = jwt.sign(
      {
        userId: String(user._id),
        orgId: String(user.orgId),
        role: user.role,
        email: user.email,
      },
      config.jwtSecret,
      { expiresIn: config.jwtExpiresIn }
    );

    const org = await Organization.findById(user.orgId).lean();

    res.json({
      token,
      user: {
        id: String(user._id),
        name: user.name,
        email: user.email,
        role: user.role,
        orgId: String(user.orgId),
        orgName: org?.name || "",
        attributes: user.attributes || {},
        did: user.did,
      },
    });
  } catch (err) {
    next(err);
  }
});

// ---------- GET /api/v1/auth/me ----------
router.get("/me", auth, async (req, res, next) => {
  try {
    const user = await User.findById(req.user.userId).lean();
    if (!user) return res.status(404).json({ error: "User not found" });
    const org = await Organization.findById(user.orgId).lean();
    res.json({
      user: {
        id: String(user._id),
        name: user.name,
        email: user.email,
        role: user.role,
        orgId: String(user.orgId),
        orgName: org?.name || "",
        attributes: user.attributes || {},
        did: user.did,
      },
    });
  } catch (err) {
    next(err);
  }
});

export default router;