/**
 * Test setup: provide the required env vars BEFORE any module that imports
 * env.server.ts is loaded. The Zod schema in env.server.ts crashes the process
 * if these are missing, so we set them here.
 */
process.env.NODE_ENV = process.env.NODE_ENV || "test";
process.env.PGUSER = process.env.PGUSER || "postgres";
process.env.PGPASSWORD = process.env.PGPASSWORD || "postgres";
process.env.JWT_SECRET = process.env.JWT_SECRET || "test_jwt_secret_minimum_32_characters_long_for_testing_only";
process.env.ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || "a".repeat(64);
process.env.PAYMENT_WEBHOOK_SECRET = process.env.PAYMENT_WEBHOOK_SECRET || "test_webhook_secret_min_16_chars";
process.env.FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:3000";
process.env.PGHOST = process.env.PGHOST || "localhost";
process.env.PGPORT = process.env.PGPORT || "5432";
process.env.PGUSER = process.env.PGUSER || "postgres";
process.env.PGPASSWORD = process.env.PGPASSWORD || "postgres";
process.env.PGDATABASE = process.env.PGDATABASE || "medical_saas_test";

// Suppress console noise during tests
const originalConsoleWarn = console.warn;
const originalConsoleError = console.error;
console.warn = (...args: any[]) => {
  if (typeof args[0] === "string" && args[0].includes("[db]")) return;
  originalConsoleWarn(...args);
};
console.error = (...args: any[]) => {
  if (typeof args[0] === "string" && args[0].includes("❌")) return;
  originalConsoleError(...args);
};
