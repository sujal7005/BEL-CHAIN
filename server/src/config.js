import "dotenv/config";
import { z } from "zod";

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(4000),
  MONGO_URI: z.string().min(1, "MONGO_URI is required"),
  JWT_SECRET: z.string().min(32, "JWT_SECRET must be at least 32 chars"),
  JWT_EXPIRES_IN: z.string().default("12h"),
  IPFS_API_URL: z.string().url().default("http://127.0.0.1:5001"),
  USE_IPFS: z
    .string()
    .transform((v) => v.toLowerCase() === "true")
    .default("false"),
  STORAGE_DIR: z.string().default("./storage"),
  MASTER_KEY_HEX: z
    .string()
    .regex(/^[0-9a-fA-F]{64}$/, "MASTER_KEY_HEX must be 64 hex chars (32 bytes)"),
  CLIENT_ORIGIN: z.string().url().default("http://localhost:5173"),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  console.error("❌ Invalid environment variables:");
  for (const issue of parsed.error.issues) {
    console.error(`   • ${issue.path.join(".")}: ${issue.message}`);
  }
  process.exit(1);
}

export const config = Object.freeze({
  env: parsed.data.NODE_ENV,
  isProd: parsed.data.NODE_ENV === "production",
  port: parsed.data.PORT,
  mongoUri: parsed.data.MONGO_URI,
  jwtSecret: parsed.data.JWT_SECRET,
  jwtExpiresIn: parsed.data.JWT_EXPIRES_IN,
  ipfsApiUrl: parsed.data.IPFS_API_URL,
  useIpfs: parsed.data.USE_IPFS,
  storageDir: parsed.data.STORAGE_DIR,
  masterKeyHex: parsed.data.MASTER_KEY_HEX,
  clientOrigin: parsed.data.CLIENT_ORIGIN,
});