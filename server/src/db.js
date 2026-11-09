import mongoose from "mongoose";
import { config } from "./config.js";

mongoose.set("strictQuery", true);
// mongoose.set("sanitizeFilter", true);

let connected = false;

export async function connectDB() {
  if (connected) return mongoose.connection;

  mongoose.connection.on("connected", () => console.log("✅ MongoDB connected"));
  mongoose.connection.on("disconnected", () => console.warn("⚠️  MongoDB disconnected"));
  mongoose.connection.on("error", (err) => console.error("❌ MongoDB error:", err.message));

  await mongoose.connect(config.mongoUri, {
    serverSelectionTimeoutMS: 10_000,
    maxPoolSize: 20,
  });

  connected = true;
  return mongoose.connection;
}

export async function disconnectDB() {
  if (!connected) return;
  await mongoose.disconnect();
  connected = false;
}