import express from "express";
import helmet from "helmet";
import cors from "cors";
import rateLimit from "express-rate-limit";
import { config } from "./config.js";
import { errorHandler } from "./middleware/errorHandler.js";

// ---- Routes (comment out until each file exists) ----
import authRoutes from "./routes/auth.js";
import dashboardRoutes from "./routes/dashboard.js";
import recordRoutes from "./routes/records.js";
import documentRoutes from "./routes/documents.js";
import verifyRoutes from "./routes/verify.js";
import ledgerRoutes from "./routes/ledger.js";
import auditRoutes from "./routes/audit.js";
import packRoutes from "./routes/packs.js";
import approvalRoutes from "./routes/approvals.js";
import credentialRoutes from "./routes/credentials.js";

const app = express();
app.disable("x-powered-by");

// ---- Security ----
app.use(
  helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" },
  })
);
app.use(
  cors({
    origin: config.clientOrigin,
    credentials: true,
  })
);
app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true }));

// ---- Rate limits ----
const authLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many login attempts, try again in a minute." },
});
const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
});

// ---- Health ----
app.get("/health", (_req, res) => {
  res.json({
    ok: true,
    service: "bel-chain-api",
    env: config.env,
    timestamp: new Date().toISOString(),
  });
});

// ---- Routes ----
// app.use("/api/v1", apiLimiter);
app.use("/api/v1/auth", authLimiter, authRoutes);
app.use("/api/v1/dashboard", dashboardRoutes);
app.use("/api/v1/records", recordRoutes);
app.use("/api/v1/approvals", approvalRoutes);
app.use("/api/v1", documentRoutes);        // /records/:id/documents, /documents/:id/download
app.use("/api/v1", verifyRoutes);          // POST /verify
app.use("/api/v1/ledger", ledgerRoutes);
app.use("/api/v1/audit", auditRoutes);
app.use("/api/v1/packs", packRoutes);
app.use("/api/v1/credentials", credentialRoutes);

// ---- 404 ----
app.use((req, res) => {
  res.status(404).json({ error: "Not found", path: req.originalUrl });
});

// ---- Error handler (must be last) ----
app.use(errorHandler);

export default app;