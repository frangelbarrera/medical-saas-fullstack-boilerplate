import { defineConfig } from "vite";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig(({ mode }) => {
  return {
    root: path.resolve(__dirname),
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        "@medical/contracts": path.resolve(__dirname, "../../packages/contracts/src/index.ts"),
        "@medical/ui": path.resolve(__dirname, "../../packages/ui/src/index.ts"),
        "@web": path.resolve(__dirname, "src"),
      },
    },
    build: {
      outDir: path.resolve(__dirname, "dist"),
      emptyOutDir: true,
      sourcemap: mode !== "production",
    },
    server: {
      hmr: process.env.DISABLE_HMR !== "true",
    },
  };
});
