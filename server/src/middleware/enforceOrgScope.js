import { Share } from "../models/Share.js";

/**
 * Returns a middleware that enforces the caller may access a resource owned by
 * `getResourceOrgId(req)` (an async function you supply per route).
 *
 * Rules:
 *   - auditor: always passes (read-only; individual routes still block downloads).
 *   - same org: passes.
 *   - other org: passes only if an active Share exists for the record; the
 *     middleware sets `req.shareFields` to the share's field allowlist.
 *   - otherwise: 403.
 *
 * The middleware does NOT check whether the record exists — that's the route's job.
 * It only decides "is this org allowed to touch this resource".
 */
export function enforceOrgScope(getResourceOrgId) {
  return async function enforceOrgScopeMw(req, res, next) {
    try {
      if (!req.user) return res.status(401).json({ error: "Not authenticated" });
      if (req.user.role === "auditor") return next();

      const resourceOrgId = await getResourceOrgId(req);
      if (!resourceOrgId) return res.status(404).json({ error: "Not found" });

      if (String(resourceOrgId) === String(req.user.orgId)) return next();

      // Cross-org: only via an active Share on the record
      const recordId = req.params.id || req.params.recordId || req.body.recordId;
      if (!recordId) return res.status(403).json({ error: "Forbidden" });

      const share = await Share.findOne({
        recordId,
        toOrgId: req.user.orgId,
        revoked: { $ne: true },
      }).lean();

      if (!share) return res.status(403).json({ error: "Forbidden" });

      req.shareFields = share.fields || [];
      req.share = share;
      return next();
    } catch (err) {
      next(err);
    }
  };
}