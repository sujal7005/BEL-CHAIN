import { config } from "./config.js";
import app from "./app.js";
import { connectDB, disconnectDB } from "./db.js";

async function start() {
  try {
    await connectDB();
    const server = app.listen(config.port, () => {
      console.log(`🚀 BEL-Chain API listening on http://localhost:${config.port}`);
      console.log(`   env: ${config.env}`);
      console.log(`   IPFS: ${config.useIpfs ? config.ipfsApiUrl : "disabled (local encrypted storage)"}`);
    });

    const shutdown = async (signal) => {
      console.log(`\n${signal} received, shutting down...`);
      server.close(async () => {
        await disconnectDB();
        console.log("👋 Bye.");
        process.exit(0);
      });
      // hard timeout
      setTimeout(() => process.exit(1), 10_000).unref();
    };

    process.on("SIGINT", () => shutdown("SIGINT"));
    process.on("SIGTERM", () => shutdown("SIGTERM"));
    process.on("unhandledRejection", (err) => {
      console.error("Unhandled rejection:", err);
    });
  } catch (err) {
    console.error("❌ Failed to start server:", err);
    process.exit(1);
  }
}

start();