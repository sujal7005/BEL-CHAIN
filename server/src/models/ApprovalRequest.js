import mongoose from "mongoose";

const approvalSchema = new mongoose.Schema(
  {
    orgId: { type: mongoose.Schema.Types.ObjectId, ref: "Organization", required: true, index: true },
    recordId: { type: mongoose.Schema.Types.ObjectId, ref: "Record", index: true },
    action: { type: String, required: true },
    requestedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    requiredApprovals: { type: Number, required: true },
    approvals: [
      {
        userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
        at: Date,
        decision: { type: String, enum: ["approve", "reject"] },
        note: String,
      },
    ],
    status: { type: String, enum: ["pending", "approved", "rejected"], default: "pending", index: true },
    payload: { type: Object, default: {} },
  },
  { timestamps: true }
);

approvalSchema.index({ orgId: 1, status: 1, createdAt: -1 });

export const ApprovalRequest = mongoose.model("ApprovalRequest", approvalSchema);