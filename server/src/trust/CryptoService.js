import crypto from "crypto";

/** SHA-256 hex of a buffer or string. */
export function sha256Hex(input) {
  const buf = Buffer.isBuffer(input) ? input : Buffer.from(String(input));
  return crypto.createHash("sha256").update(buf).digest("hex");
}

/** AES-256-GCM. Returns iv(12) || tag(16) || ciphertext. */
export function aesEncrypt(plainBuf, key32) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key32, iv);
  const enc = Buffer.concat([cipher.update(plainBuf), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]);
}

/** AES-256-GCM decrypt. Input must be iv||tag||ciphertext. */
export function aesDecrypt(payload, key32) {
  const iv = payload.subarray(0, 12);
  const tag = payload.subarray(12, 28);
  const enc = payload.subarray(28);
  const decipher = crypto.createDecipheriv("aes-256-gcm", key32, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(enc), decipher.final()]);
}

/** RSA-2048 keypair (PEM). */
export function generateRsaKeyPair() {
  return crypto.generateKeyPairSync("rsa", {
    modulusLength: 2048,
    publicKeyEncoding: { type: "spki", format: "pem" },
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
  });
}

/** RSA-SHA256 signature over a hex string. Returns base64. */
export function signHex(hexString, privateKeyPem) {
  const s = crypto.createSign("RSA-SHA256");
  s.update(hexString);
  s.end();
  return s.sign(privateKeyPem, "base64");
}

/** Verify RSA-SHA256 signature over a hex string. */
export function verifyHex(hexString, sigB64, publicKeyPem) {
  const v = crypto.createVerify("RSA-SHA256");
  v.update(hexString);
  v.end();
  return v.verify(publicKeyPem, sigB64, "base64");
}