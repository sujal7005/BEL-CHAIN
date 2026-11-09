import crypto from "crypto";
import { config } from "../config.js";
import { KeyPair } from "../models/KeyPair.js";
import { generateRsaKeyPair, aesEncrypt, aesDecrypt, signHex, verifyHex } from "./CryptoService.js";

const masterKey = Buffer.from(config.masterKeyHex, "hex");

function wrapAesKey(raw32) {
  return aesEncrypt(raw32, masterKey).toString("base64");
}
function unwrapAesKey(b64) {
  return aesDecrypt(Buffer.from(b64, "base64"), masterKey);
}

/** Ensure the org has an AES + RSA keypair. Idempotent. */
export async function ensureOrgKeys(orgId) {
  let kp = await KeyPair.findOne({ ownerType: "org", ownerId: orgId, purpose: "encryption" });
  if (kp) return kp;

  const aes = crypto.randomBytes(32);
  const rsa = generateRsaKeyPair();
  try {
    kp = await KeyPair.create({
      ownerType: "org",
      ownerId: orgId,
      purpose: "encryption",
      wrappedAesKey: wrapAesKey(aes),
      publicKey: rsa.publicKey,
      privateKey: rsa.privateKey,
    });
  } catch (err) {
    // race: another process created it first
    if (err.code === 11000) {
      kp = await KeyPair.findOne({ ownerType: "org", ownerId: orgId, purpose: "encryption" });
    } else {
      throw err;
    }
  }
  return kp;
}

/** Get the raw 32-byte AES key for an org. */
export async function getOrgAesKey(orgId) {
  const kp = await ensureOrgKeys(orgId);
  return unwrapAesKey(kp.wrappedAesKey);
}

/** Sign a hex payload on behalf of an org. */
export async function signForOrg(orgId, hexPayload) {
  const kp = await ensureOrgKeys(orgId);
  return signHex(hexPayload, kp.privateKey);
}

/** Verify a signature against an org's public key. */
export async function verifyForOrg(orgId, hexPayload, sigB64) {
  const kp = await ensureOrgKeys(orgId);
  return verifyHex(hexPayload, sigB64, kp.publicKey);
}