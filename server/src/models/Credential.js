import mongoose from "mongoose";

const credentialSchema = new mongoose.Schema(
  {
    orgId: { type: mongoose.Schema.Types.ObjectId, ref: "Organization", required: true, index: true },
    subjectUserId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    type: { type: String, required: true },        // e.g. "defence:clearance", "supplier:registration"
    issuedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    status: { type: String, enum: ["active", "revoked"], default: "active", index: true },
    issuedAt: { type: Date, default: Date.now },
    revokedAt: { type: Date },
    revokedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    meta: { type: Object, default: {} },
  },
  { timestamps: true }
);

credentialSchema.index({ subjectUserId: 1, type: 1, status: 1 });

export const Credential = mongoose.model("Credential", credentialSchema);