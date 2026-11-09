import mongoose from "mongoose";

const shareSchema = new mongoose.Schema(
  {
    recordId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Record",
      required: true,
      index: true,
    },
    fromOrgId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Organization",
      required: true,
      index: true,
    },
    toOrgId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Organization",
      required: true,
      index: true,
    },
    // Field-level allowlist for the recipient. Empty array = all fields visible.
    fields: { type: [String], default: [] },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    expiresAt: { type: Date },
    revoked: { type: Boolean, default: false },
  },
  { timestamps: true }
);

// Prevent duplicate active shares for the same (record, recipient)
shareSchema.index({ recordId: 1, toOrgId: 1 }, { unique: true });

export const Share = mongoose.model("Share", shareSchema);