import { Router } from "express";
import { auth } from "../middleware/auth.js";
import { listPacks, loadPack } from "../core/access.js";

const router = Router();

router.get("/", auth, (_req, res) => {
  res.json({ packs: listPacks() });
});

router.get("/:id", auth, (req, res, next) => {
  try {
    res.json({ pack: loadPack(req.params.id) });
  } catch (e) {
    next(Object.assign(e, { status: 404 }));
  }
});

export default router;