import mongoose from "mongoose";

const orgSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, unique: true, trim: true },
    type: {
      type: String,
      required: true,
      enum: ["defence", "fintech", "university", "food", "company"],
    },
    packId: { type: String, required: true },
    active: { type: Boolean, default: true },
  },
  { timestamps: true }
);

export const Organization = mongoose.model("Organization", orgSchema);