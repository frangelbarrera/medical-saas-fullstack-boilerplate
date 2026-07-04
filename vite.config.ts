import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import path from "path";
import { defineConfig, loadEnv } from "vite";

export default defineConfig(({ mode }) => {
  // Load env for Vite itself (only VITE_ prefixed vars are exposed to the client).
  // NEVER expose server-side secrets (GEMINI_API_KEY, JWT_SECRET, ENCRYPTION_KEY)
  // to the client bundle via `define`. They must stay server-side.
  loadEnv(mode, ".", "");

  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "."),
      },
    },
    server: {
      // Proxy /api requests to the backend in dev so the frontend can call
      // /api/* without CORS issues. The backend runs on port 3000 (server.ts).
      proxy: {
        "/api": {
          target: "http://localhost:3000",
          changeOrigin: true,
        },
      },
      hmr: process.env.DISABLE_HMR !== "true",
    },
    build: {
      // Generate source maps in dev only; in production they leak source code.
      sourcemap: mode !== "production",
    },
  };
});
