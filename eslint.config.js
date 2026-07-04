import eslint from "@eslint/js";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import security from "eslint-plugin-security";
import noSecrets from "eslint-plugin-no-secrets";
import globals from "globals";

// Use the NON-type-checked recommended configs so we don't need parserOptions.project
// for every file (which would require a tsconfig that includes tests and config files).
// TypeScript's own strict mode (tsc --noEmit) already covers type-checked rules.
export default tseslint.config(
  { ignores: ["dist/", "node_modules/", "coverage/", "playwright-report/", "test-results/"] },
  {
    extends: [eslint.configs.recommended, ...tseslint.configs.recommended],
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2022,
      globals: globals.browser,
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
      security,
      "no-secrets": noSecrets,
    },
    rules: {
      // React
      "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",

      // TypeScript strictness (non-type-checked; tsc strict handles the rest)
      "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/consistent-type-imports": "off", // too noisy for existing code
      "@typescript-eslint/no-non-null-assertion": "warn",

      // Security
      "no-secrets/no-secrets": "warn",
      "security/detect-eval-with-expression": "error",
      "security/detect-new-buffer": "error",
      "security/detect-pseudoRandomBytes": "error",

      // Code hygiene
      "no-console": ["warn", { allow: ["warn", "error"] }],
      "no-debugger": "error",
      "no-var": "error",
      "prefer-const": "error",
      eqeqeq: ["error", "always"],
      "no-eval": "error",
      "no-implied-eval": "error",
    },
  },
  // Node globals for server-side files
  {
    files: ["src/server/**/*.ts", "tests/**/*.ts", "e2e/**/*.ts", "*.config.{ts,js}", "server.ts"],
    languageOptions: {
      globals: { ...globals.node },
    },
  },
  // Tests: relax rules
  {
    files: ["tests/**/*.ts", "e2e/**/*.ts"],
    rules: {
      "@typescript-eslint/no-non-null-assertion": "off",
      "no-console": "off",
      "@typescript-eslint/no-explicit-any": "off",
      "no-secrets/no-secrets": "off", // tests contain test secrets by design
    },
  },
);
