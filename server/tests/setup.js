import { beforeAll, afterAll } from "vitest";
import mongoose from "mongoose";

const TEST_DB = "belchain-test";
process.env.MONGO_URI = `mongodb://127.0.0.1:27017/${TEST_DB}`;
process.env.NODE_ENV = "test";
process.env.JWT_SECRET =
  process.env.JWT_SECRET || "test-secret-at-least-32-chars-long-xx";
process.env.MASTER_KEY_HEX =
  process.env.MASTER_KEY_HEX ||
  "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
process.env.USE_IPFS = "false";
process.env.STORAGE_DIR = "./storage-test";

beforeAll(async () => {
  await mongoose.connect(process.env.MONGO_URI);
});

afterAll(async () => {
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
});