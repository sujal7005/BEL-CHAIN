import mongoose from "mongoose";
import bcrypt from "bcrypt";

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      match: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
    },
    passwordHash: { type: String, required: true, select: false },
    orgId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Organization",
      required: true,
      index: true,
    },
    role: {
      type: String,
      required: true,
      enum: ["admin", "manager", "staff", "supplier", "auditor"],
    },
    attributes: {
      clearanceLevel: { type: Number, default: 0 },
      unit: { type: String, default: "" },
    },
    did: { type: String, default: "" },
    active: { type: Boolean, default: true },
    lastLoginAt: { type: Date },
  },
  { timestamps: true }
);

// Virtual: `user.password = "..."` → stored in `_password`, hashed on validate.
userSchema
  .virtual("password")
  .set(function (v) {
    this._password = v;
    this.markModified("passwordHash");
  })
  .get(function () {
    return this._password;
  });

// Hash plaintext into passwordHash BEFORE validation (so `required` passes).
userSchema.pre("validate", async function () {
  if (!this._password) return;
  this.passwordHash = await bcrypt.hash(this._password, 10);
});

// Build DID. NOTE: async, no `next` — matches the style of the hook above.
userSchema.pre("validate", async function () {
  if (this._id && this.orgId && !this.did) {
    this.did = `did:bel:${this.orgId}:${this._id}`;
  }
});

userSchema.methods.comparePassword = function (plain) {
  return bcrypt.compare(plain, this.passwordHash);
};

export const User = mongoose.model("User", userSchema);