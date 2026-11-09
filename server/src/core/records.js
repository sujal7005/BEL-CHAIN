import crypto from "crypto";
import { Record } from "../models/Record.js";
import { RecordVersion } from "../models/RecordVersion.js";
import { LedgerEntry } from "../models/LedgerEntry.js";
import { loadPack } from "./access.js";

export function sha256(obj) {
  return crypto.createHash("sha256").update(JSON.stringify(obj)).digest("hex");
}

/** Validate fields against the pack template. Returns cleaned object. */
export function validateFields(packId, templateKey, raw) {
  const pack = loadPack(packId);
  const tpl = pack.templates?.[templateKey];
  if (!tpl) throw Object.assign(new Error(`Unknown template: ${templateKey}`), { status: 400 });

  const out = {};
  for (const f of tpl.fields) {
    const v = raw?.[f.key];
    if (f.required && (v === undefined || v === null || v === "")) {
      throw Object.assign(new Error(`Field "${f.key}" is required`), { status: 400 });
    }
    if (v === undefined || v === null) continue;
    if (f.type === "number") {
      const n = Number(v);
      if (Number.isNaN(n)) throw Object.assign(new Error(`Field "${f.key}" must be a number`), { status: 400 });
      out[f.key] = n;
    } else if (f.type === "select") {
      if (!f.options?.includes(v)) {
        throw Object.assign(new Error(`Field "${f.key}" must be one of: ${f.options.join(", ")}`), { status: 400 });
      }
      out[f.key] = v;
    } else {
      out[f.key] = String(v);
    }
  }
  return out;
}

/** Derive a display title from a record's fields or template. */
export function deriveTitle(templateKey, fields) {
  return (
    fields.partNumber ||
    fields.serialNumber ||
    fields.componentRef ||
    fields.title ||
    templateKey
  );
}

export async function createRecord({ user, packId, templateKey, rawFields }) {
  const fields = validateFields(packId, templateKey, rawFields);
  const title = deriveTitle(templateKey, fields);
  const fieldsHash = sha256(fields);

  const record = await Record.create({
    orgId: user.orgId,
    packId,
    templateKey,
    title,
    fields,
    version: 1,
    status: "active",
    createdBy: user.userId,
  });

  await RecordVersion.create({
    recordId: record._id,
    orgId: user.orgId,
    version: 1,
    fields,
    fieldsHash,
    createdBy: user.userId,
    note: "initial version",
  });

  return record;
}

/**
 * Update a record by creating a new version.
 * If `requireApproval` is true (caller decided), it does NOT write the version —
 * it returns { pending: true } and the caller creates an ApprovalRequest.
 */
export async function updateRecord({ user, record, rawFields, requireApproval }) {
  const fields = validateFields(record.packId, record.templateKey, rawFields);
  const fieldsHash = sha256(fields);

  if (requireApproval) {
    return { pending: true, proposedFields: fields, fieldsHash };
  }

  const nextVersion = record.version + 1;
  record.fields = fields;
  record.version = nextVersion;
  record.title = deriveTitle(record.templateKey, fields);
  await record.save();

  await RecordVersion.create({
    recordId: record._id,
    orgId: record.orgId,
    version: nextVersion,
    fields,
    fieldsHash,
    createdBy: user.userId,
    note: "updated",
  });

  return { pending: false, record, fieldsHash };
}

/** Full timeline for a record: version history + ledger entries, merged and sorted. */
export async function recordTimeline(recordId) {
  const [versions, entries] = await Promise.all([
    RecordVersion.find({ recordId }).sort({ version: 1 }).lean(),
    LedgerEntry.find({ recordId }).sort({ index: 1 }).lean(),
  ]);

  const events = [];
  for (const v of versions) {
    events.push({
      kind: "version",
      at: v.createdAt,
      version: v.version,
      fieldsHash: v.fieldsHash,
      note: v.note,
    });
  }
  for (const e of entries) {
    events.push({
      kind: "ledger",
      at: e.timestamp,
      index: e.index,
      action: e.action,
      payloadHash: e.payloadHash,
      entryHash: e.entryHash,
    });
  }
  events.sort((a, b) => new Date(a.at) - new Date(b.at));
  return events;
}