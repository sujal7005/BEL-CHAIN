import mongoose from "mongoose";

const auditSchema = new mongoose.Schema(
  {
    orgId: { type: mongoose.Schema.Types.ObjectId, ref: "Organization", index: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", index: true },
    action: { type: String, required: true, index: true },
    resourceId: { type: mongoose.Schema.Types.ObjectId },
    resourceType: { type: String },
    meta: { type: Object, default: {} },
    ip: { type: String, default: "" },
  },
  { timestamps: true }
);

auditSchema.index({ createdAt: -1 });

export const AuditEvent = mongoose.model("AuditEvent", auditSchema);