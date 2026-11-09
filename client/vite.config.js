import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: true,
    open: true, // opens browser automatically
    proxy: {
      // Any request from the client to /api/v1/* is forwarded to the Express server.
      // This means the client can just call "/api/v1/auth/login" — no CORS, no hardcoded host.
      "/api": {
        target: "http://localhost:4000",
        changeOrigin: true,
        secure: false,
      },
    },
  },
  build: {
    outDir: "dist",
    sourcemap: true,
  },
  resolve: {
    alias: {
      "@": "/src",
    },
  },
});