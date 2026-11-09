import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { Credential } from "../models/Credential.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const packsDir = path.join(__dirname, "..", "packs");

const packCache = new Map();

export function loadPack(packId) {
  if (packCache.has(packId)) return packCache.get(packId);
  const file = path.join(packsDir, `${packId}.json`);
  if (!fs.existsSync(file)) throw new Error(`Pack not found: ${packId}`);
  const pack = JSON.parse(fs.readFileSync(file, "utf8"));
  packCache.set(packId, pack);
  return pack;
}

export function listPacks() {
  return fs
    .readdirSync(packsDir)
    .filter((f) => f.endsWith(".json"))
    .map((f) => {
      const p = JSON.parse(fs.readFileSync(path.join(packsDir, f), "utf8"));
      return { id: p.id, name: p.name, version: p.version };
    });
}

/**
 * can(user, action, resource)
 *  user: { userId, orgId, role }
 *  action: e.g. "record:read" | "record:write" | "ledger:read" | "document:read"
 *  resource: { orgId, packId? }
 * Returns boolean.
 */
export function can(user, action, resource, packId = "defence") {
  const pack = loadPack(packId);
  const rules = (pack.abac || []).filter((r) => r.action === action);
  for (const rule of rules) {
    if (!rule.roles.includes(user.role)) continue;
    const cond = rule.condition || "any";
    if (cond === "any") return true;
    if (cond === "sameOrg" && String(user.orgId) === String(resource.orgId)) return true;
    if (cond === "sameOrgOrAuditor") {
      if (String(user.orgId) === String(resource.orgId)) return true;
      if (user.role === "auditor") return true;
    }
  }
  return false;
}

export function highRiskConfig(packId = "defence") {
  const pack = loadPack(packId);
  return {
    highRiskActions: new Set(pack.highRiskActions || []),
    requiredApprovals: pack.requiredApprovals || {},
  };
}

export async function hasActiveCredential(userId, type) {
  const cred = await Credential.findOne({
    subjectUserId: userId,
    type,
    status: "active",
  }).lean();
  return Boolean(cred);
}