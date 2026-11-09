import fs from "fs/promises";
import path from "path";
import { create } from "ipfs-http-client";
import { config } from "../config.js";
import { aesEncrypt, aesDecrypt, sha256Hex } from "./CryptoService.js";
import { getOrgAesKey } from "./KeyManager.js";

const useIpfs = config.useIpfs;
const ipfs = useIpfs ? create({ url: config.ipfsApiUrl }) : null;
const storageDir = path.resolve(config.storageDir);

async function ensureDir(p) {
  await fs.mkdir(p, { recursive: true });
}

/**
 * Encrypt a buffer with the org's AES key, store it (IPFS or local),
 * and return { cid, plainHash }.
 */
export async function put({ orgId, buffer }) {
  const key = await getOrgAesKey(orgId);
  const plainHash = sha256Hex(buffer);          // <-- goes to the ledger
  const encrypted = aesEncrypt(buffer, key);    // <-- what actually leaves the process

  if (useIpfs) {
    const { cid } = await ipfs.add(encrypted);
    return { cid: cid.toString(), plainHash };
  }

  // Local fallback: server/storage/<orgId>/<plainHash>.enc
  const dir = path.join(storageDir, String(orgId));
  await ensureDir(dir);
  const file = path.join(dir, `${plainHash}.enc`);
  await fs.writeFile(file, encrypted);
  return { cid: `local:${orgId}/${plainHash}.enc`, plainHash };
}

/**
 * Retrieve and decrypt a stored file. `cid` may be an IPFS CID or a
 * `local:<orgId>/<name>.enc` reference.
 */
export async function get({ orgId, cid }) {
  let encrypted;
  if (cid.startsWith("local:")) {
    const rel = cid.replace("local:", "");
    encrypted = await fs.readFile(path.join(storageDir, rel));
  } else {
    if (!useIpfs) throw new Error("IPFS not enabled but cid is not local:");
    const chunks = [];
    for await (const chunk of ipfs.cat(cid)) chunks.push(chunk);
    encrypted = Buffer.concat(chunks);
  }
  const key = await getOrgAesKey(orgId);
  return aesDecrypt(encrypted, key);
}

/** Health probe used by the verify route (optional). */
export async function ipfsReady() {
  if (!useIpfs) return { ok: true, mode: "local" };
  try {
    const id = await ipfs.id();
    return { ok: true, mode: "ipfs", peerId: id.id };
  } catch (err) {
    return { ok: false, mode: "ipfs", error: err.message };
  }
}