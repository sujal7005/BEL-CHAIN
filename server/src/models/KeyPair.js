import mongoose from "mongoose";

const keyPairSchema = new mongoose.Schema(
  {
    ownerType: { type: String, enum: ["org", "user"], required: true },
    ownerId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
    purpose: { type: String, default: "encryption" },
    // AES key wrapped (encrypted) with MASTER_KEY using AES-256-GCM. base64.
    wrappedAesKey: { type: String, required: true },
    publicKey: { type: String, required: true },
    // Prototype only — a real system uses HSM/KMS. Never expose via API.
    privateKey: { type: String, required: true },
  },
  { timestamps: true }
);

keyPairSchema.index({ ownerType: 1, ownerId: 1, purpose: 1 }, { unique: true });

export const KeyPair = mongoose.model("KeyPair", keyPairSchema);