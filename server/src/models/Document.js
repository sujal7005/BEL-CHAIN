import mongoose from "mongoose";

const documentSchema = new mongoose.Schema(
  {
    orgId: { type: mongoose.Schema.Types.ObjectId, ref: "Organization", required: true, index: true },
    recordId: { type: mongoose.Schema.Types.ObjectId, ref: "Record", required: true, index: true },
    filename: { type: String, required: true },
    mimeType: { type: String, default: "application/octet-stream" },
    size: { type: Number, required: true },
    cid: { type: String, required: true },
    sha256: { type: String, required: true, index: true },     // hash of PLAINTEXT
    version: { type: Number, default: 1 },
    uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    ledgerIndex: { type: Number },
    signature: { type: String },                               // RSA signature over sha256
  },
  { timestamps: true }
);

documentSchema.index({ recordId: 1, createdAt: -1 });

export const Document = mongoose.model("Document", documentSchema);