/**
 * LedgerService — trust-layer interface.
 *
 * Every write of a trusted fact goes through `append`. Reads go through
 * `getEntry` / `getHistory` / `verifyChain`. Implementations MUST be
 * append-only: no update or delete is exposed.
 *
 * The MongoDB implementation is in `MongoLedger.js`.
 * To replace with Hyperledger Fabric, implement this interface and
 * point `getLedger()` at it — nothing else in the codebase changes.
 */
export class LedgerService {
  /** @returns {Promise<object>} the appended entry */
  async append(/* { orgId, recordId, action, payloadHash, signature, meta, actorUserId } */) {
    throw new Error("LedgerService.append not implemented");
  }

  /** @returns {Promise<object|null>} */
  async getEntry(/* id */) {
    throw new Error("LedgerService.getEntry not implemented");
  }

  /** @returns {Promise<object[]>} ordered oldest→newest */
  async getHistory(/* recordId */) {
    throw new Error("LedgerService.getHistory not implemented");
  }

  /** @returns {Promise<{ ok: boolean, count: number, brokenIndex?: number, reason?: string }>} */
  async verifyChain() {
    throw new Error("LedgerService.verifyChain not implemented");
  }

  /** @returns {Promise<object[]>} paged list */
  async list(/* { filter, page, limit } */) {
    throw new Error("LedgerService.list not implemented");
  }
}

let instance = null;

/**
 * Singleton accessor. Today returns the Mongo implementation.
 * When Fabric arrives, swap the body for `new FabricLedger()`.
 */
export async function getLedger() {
  if (instance) return instance;
  const { MongoLedger } = await import("./MongoLedger.js");
  instance = new MongoLedger();
  return instance;
}