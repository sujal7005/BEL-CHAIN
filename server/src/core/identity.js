import { Organization } from "../models/Organization.js";
import { User } from "../models/User.js";
import { Credential } from "../models/Credential.js";
import { writeAudit } from "./audit.js";

/* -------------------- Orgs -------------------- */

export async function getOrg(orgId) {
  return Organization.findById(orgId).lean();
}

export async function listOrgs() {
  return Organization.find({ active: true }).sort({ name: 1 }).lean();
}

export async function createOrg({ name, type, packId }, actingUser) {
  const org = await Organization.create({ name, type, packId });
  await writeAudit({
    orgId: org._id,
    userId: actingUser?.userId,
    action: "org:create",
    resourceId: org._id,
    resourceType: "Organization",
    meta: { name, type, packId },
  });
  return org;
}

/* -------------------- Users -------------------- */

export async function getUser(userId) {
  return User.findById(userId).select("-passwordHash").lean();
}

export async function getUserByEmail(email) {
  return User.findOne({ email: email.toLowerCase() })
    .select("-passwordHash")
    .lean();
}

export async function listUsersInOrg(orgId) {
  return User.find({ orgId }).select("-passwordHash").sort({ name: 1 }).lean();
}

export async function createUserInOrg(
  { name, email, password, role, attributes = {} },
  orgId,
  actingUser
) {
  const user = new User({ name, email, password, role, attributes, orgId });
  await user.save();
  await writeAudit({
    orgId,
    userId: actingUser?.userId,
    action: "user:create",
    resourceId: user._id,
    resourceType: "User",
    meta: { email, role },
  });
  return user;
}

/* -------------------- Credentials -------------------- */

/** True if the user has at least one active credential of `type` in their org. */
export async function hasActiveCredential(userId, type) {
  const cred = await Credential.findOne({
    subjectUserId: userId,
    type,
    status: "active",
  }).lean();
  return Boolean(cred);
}

export async function issueCredential({ subjectUserId, type, meta = {} }, actingUser) {
  const cred = await Credential.create({
    orgId: actingUser.orgId,
    subjectUserId,
    type,
    issuedBy: actingUser.userId,
    meta,
  });
  await writeAudit({
    orgId: actingUser.orgId,
    userId: actingUser.userId,
    action: "credential:issue",
    resourceId: cred._id,
    resourceType: "Credential",
    meta: { subjectUserId: String(subjectUserId), type },
  });
  return cred;
}

export async function revokeCredential(credentialId, actingUser) {
  const cred = await Credential.findById(credentialId);
  if (!cred) throw Object.assign(new Error("Credential not found"), { status: 404 });
  if (String(cred.orgId) !== String(actingUser.orgId)) {
    throw Object.assign(new Error("Forbidden"), { status: 403 });
  }
  if (cred.status === "revoked") {
    throw Object.assign(new Error("Already revoked"), { status: 409 });
  }
  cred.status = "revoked";
  cred.revokedAt = new Date();
  cred.revokedBy = actingUser.userId;
  await cred.save();

  await writeAudit({
    orgId: cred.orgId,
    userId: actingUser.userId,
    action: "credential:revoke",
    resourceId: cred._id,
    resourceType: "Credential",
    meta: { subjectUserId: String(cred.subjectUserId), type: cred.type },
  });
  return cred;
}

export async function verifyCredential(credentialId) {
  const cred = await Credential.findById(credentialId).lean();
  if (!cred) return { valid: false, error: "not-found" };
  return {
    valid: cred.status === "active",
    status: cred.status,
    type: cred.type,
    issuedAt: cred.issuedAt,
    revokedAt: cred.revokedAt || null,
  };
}