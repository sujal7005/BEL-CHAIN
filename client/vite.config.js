import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    host: true,            // listen on 0.0.0.0 — required for proxies/sandboxes
    port: 5173,
    strictPort: true,
    allowedHosts: [
      "sb-43f9tnafx88u.vercel.run",   // the specific sandbox host
      ".vercel.run",                  // or wildcard: any *.vercel.run host
    ],
    proxy: {
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
    alias: { "@": "/src" },
  },
});