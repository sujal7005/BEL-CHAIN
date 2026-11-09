import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.js"],
    setupFiles: ["./tests/setup.js"],
    // Single-threaded — Mongo state must be deterministic across tests
    pool: "forks",
    poolOptions: { forks: { singleFork: true } },
    testTimeout: 20000,
    hookTimeout: 30000,
  },
});