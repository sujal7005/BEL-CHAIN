# BEL-Chain — Trust Platform Prototype

A **prototype** of a universal trust platform where multiple organizations
collaborate on one shared, tamper-evident record while keeping their own data
separate. Built as a MERN stack with MongoDB simulating a ledger.

> ⚠️ **This is a prototype.** The "ledger" is a MongoDB collection with a
> hash chain — **not a real blockchain**. It is **not production-secure**.
> See [What's simulated](#whats-simulated) below. The ledger interface is
> deliberately abstracted so Hyperledger Fabric can replace it later without
> touching any other code — see [Replacing the ledger with Fabric](#replacing-the-ledger-with-fabric).

---

## 1. What works

| Feature | Status |
|---|---|
| Multi-org users, roles, JWT auth | ✅ working |
| Industry pack (`defence`) drives record templates & ABAC | ✅ working |
| Records with versions + history timeline | ✅ working |
| Document upload / download (AES-256-GCM + IPFS or local) | ✅ working |
| File verification (SHA-256 vs ledger) | ✅ working |
| Append-only ledger with hash chain | ✅ working |
| Chain integrity verification (`GET /ledger/verify`) | ✅ working |
| RSA-2048 digital signatures on ledger entries | ✅ working |
| High-risk approvals (N-of-M) | ✅ working |
| Cross-org sharing via `shares` collection | ⚠️ metadata only — files not shared |
| Audit log with filters | ✅ working |
| Tamper demo (`POST /ledger/__tamper`, dev only) | ✅ working |
| Pack admin (form regenerates from pack JSON) | ✅ working |
| Acceptance tests (Vitest + supertest) | ✅ working |

---

## 2. Prerequisites

- **Node.js ≥ 20** (`node -v`)
- **MongoDB** running locally on `mongodb://127.0.0.1:27017`
  (Compass, `mongod`, or Docker — anything reachable at that URI)
- **IPFS** (optional). If `ipfs daemon` isn't running, set `USE_IPFS=false`
  and files are encrypted into `server/storage/<orgId>/` instead.

---

## 3. Setup

```bash
# 1. server
cd server
npm install
cp .env.example .env
# Generate the two secrets and paste into .env:
#   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"   # MASTER_KEY_HEX
#   node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"   # JWT_SECRET
npm run seed
npm run dev          # → http://localhost:4000

# 2. client (new terminal)
cd client
npm install
npm run dev          # → http://localhost:5173

# 3. tests (new terminal, dev DB is separate)
cd server
npm test