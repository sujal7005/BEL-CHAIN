import mongoose from "mongoose";

const versionSchema = new mongoose.Schema(
  {
    recordId: { type: mongoose.Schema.Types.ObjectId, ref: "Record", required: true, index: true },
    orgId: { type: mongoose.Schema.Types.ObjectId, ref: "Organization", required: true, index: true },
    version: { type: Number, required: true },
    fields: { type: Object, default: {} },
    fieldsHash: { type: String, required: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    note: { type: String, default: "" },
    ledgerIndex: { type: Number },
  },
  { timestamps: true }
);

versionSchema.index({ recordId: 1, version: 1 }, { unique: true });

export const RecordVersion = mongoose.model("RecordVersion", versionSchema);