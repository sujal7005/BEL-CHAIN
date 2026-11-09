import mongoose from "mongoose";

const entrySchema = new mongoose.Schema(
  {
    index: { type: Number, required: true, unique: true, index: true },
    timestamp: { type: String, required: true },
    orgId: { type: mongoose.Schema.Types.ObjectId, ref: "Organization", required: true, index: true },
    recordId: { type: mongoose.Schema.Types.ObjectId, index: true },
    action: { type: String, required: true },
    payloadHash: { type: String, required: true },
    prevHash: { type: String, required: true },
    entryHash: { type: String, required: true, index: true },
    signature: { type: String, default: "" },
    actorUserId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    meta: { type: Object, default: {} },
  },
  { timestamps: false }
);

// Block updates and deletes at the model level
["updateOne", "updateMany", "deleteOne", "deleteMany", "findOneAndUpdate", "findOneAndDelete", "replaceOne"].forEach(
  (m) => {
    entrySchema.pre(m, function () {
      throw new Error("Ledger is append-only: updates/deletes are forbidden");
    });
  }
);

export const LedgerEntry = mongoose.model("LedgerEntry", entrySchema);