import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  resolve: {
    alias: {
      "@medical/contracts": path.resolve(__dirname, "packages/contracts/src/index.ts"),
      "@medical/ui": path.resolve(__dirname, "packages/ui/src/index.ts"),
      "@medical/domain": path.resolve(__dirname, "services/domain/src/index.ts"),
      "@medical/data": path.resolve(__dirname, "services/data/src/index.ts"),
      "@medical/audit": path.resolve(__dirname, "services/audit/src/index.ts"),
      "@medical/integrations": path.resolve(__dirname, "services/integrations/src/index.ts"),
    },
  },
  test: {
    include: [
      "packages/*/test/**/*.test.ts",
      "services/*/test/**/*.test.ts",
    ],
    setupFiles: ["tests/setup.ts"],
    env: {
      NODE_ENV: "test",
    },
    coverage: {
      reporter: ["text", "lcov"],
      include: [
        "packages/*/src/**",
        "services/*/src/**",
      ],
      exclude: [
        "services/data/src/seed.ts",
        "**/*.d.ts",
      ],
    },
  },
});
