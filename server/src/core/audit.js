import { AuditEvent } from "../models/AuditEvent.js";

/**
 * Write an audit event. Never throws — audit failures should not
 * break the primary request. They are logged instead.
 *
 * @param {Object} opts
 * @param {ObjectId|string} opts.orgId
 * @param {ObjectId|string} [opts.userId]
 * @param {string}          opts.action         e.g. "record:create", "verify:mismatch"
 * @param {ObjectId|string} [opts.resourceId]
 * @param {string}          [opts.resourceType] e.g. "Record", "Document", "Credential"
 * @param {Object}          [opts.meta]
 * @param {string}          [opts.ip]
 */
export async function writeAudit({ orgId, userId, action, resourceId, resourceType, meta = {}, ip }) {
  try {
    await AuditEvent.create({
      orgId,
      userId,
      action,
      resourceId,
      resourceType,
      meta,
      ip: ip || "",
    });
  } catch (err) {
    // Never fail the primary action because of an audit write
    console.error("⚠️  audit write failed:", err.message, {
      action,
      resourceId: String(resourceId || ""),
    });
  }
}

/** Convenience: recent events for one resource, ordered newest first. */
export async function recentEventsFor(resourceId, { limit = 50 } = {}) {
  return AuditEvent.find({ resourceId })
    .sort({ createdAt: -1 })
    .limit(limit)
    .lean();
}

/** Convenience: everything a user did in the last N days. */
export async function eventsForUser(userId, { days = 7, limit = 200 } = {}) {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  return AuditEvent.find({ userId, createdAt: { $gte: since } })
    .sort({ createdAt: -1 })
    .limit(limit)
    .lean();
}