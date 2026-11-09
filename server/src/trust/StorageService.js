/**
 * StorageService — trust-layer storage interface.
 *
 * Stores opaque blobs. Implementations MUST encrypt before persisting;
 * only ciphertext leaves the process. The plaintext SHA-256 is the
 * only thing that should ever reach the ledger.
 *
 * Two implementations today:
 *   - IPFSStorage (server/trust/IPFSStorage.js) — encrypts + pins to IPFS,
 *     falls back to local encrypted files when IPFS is disabled.
 *
 * The interface is intentionally shape-agnostic so a future
 * `S3EncryptedStorage` or `FabricOffChainStorage` can replace it.
 */
export class StorageService {
  /**
   * Encrypt + persist a buffer. Returns the CID/reference and plaintext hash.
   * @param {{ orgId: string, buffer: Buffer }} args
   * @returns {Promise<{ cid: string, plainHash: string }>}
   */
  async put(/* { orgId, buffer } */) {
    throw new Error("StorageService.put not implemented");
  }

  /**
   * Fetch + decrypt a blob by its reference.
   * @param {{ orgId: string, cid: string }} args
   * @returns {Promise<Buffer>}
   */
  async get(/* { orgId, cid } */) {
    throw new Error("StorageService.get not implemented");
  }

  /**
   * Health probe. Optional.
   * @returns {Promise<{ ok: boolean, mode: "ipfs"|"local", error?: string }>}
   */
  async ready() {
    return { ok: true, mode: "local" };
  }
}

/** Adapter for the existing function-based IPFSStorage module. */
class IPFSStorageAdapter extends StorageService {
  constructor(mod) {
    super();
    this.mod = mod;
  }
  put(args) { return this.mod.put(args); }
  get(args) { return this.mod.get(args); }
  ready() { return this.mod.ipfsReady ? this.mod.ipfsReady() : super.ready(); }
}

let instance = null;

export async function getStorage() {
  if (instance) return instance;
  const mod = await import("./IPFSStorage.js");
  instance = new IPFSStorageAdapter(mod);
  return instance;
}