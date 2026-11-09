import mongoose from "mongoose";

const recordSchema = new mongoose.Schema(
  {
    orgId: { type: mongoose.Schema.Types.ObjectId, ref: "Organization", required: true, index: true },
    packId: { type: String, required: true },
    templateKey: { type: String, required: true },
    fields: { type: Object, default: {} },
    version: { type: Number, default: 1 },
    status: { type: String, enum: ["draft", "active", "archived", "pending"], default: "active", index: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    title: { type: String, default: "" },
  },
  { timestamps: true }
);

recordSchema.index({ orgId: 1, createdAt: -1 });

export const Record = mongoose.model("Record", recordSchema);