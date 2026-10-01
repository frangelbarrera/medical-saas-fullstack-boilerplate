/**
 * Vitest global setup: stable test environment.
 *
 * Tests that need PostgreSQL are gated on TEST_DATABASE_URL; when it is not
 * set (e.g. a quick lint loop) they skip with a notice instead of failing.
 */
process.env.NODE_ENV = "test";
process.env.JWT_SECRET = process.env.JWT_SECRET ?? "test_jwt_secret_minimum_32_characters_long";
process.env.ENCRYPTION_KEY =
  process.env.ENCRYPTION_KEY ?? "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
process.env.PHI_HMAC_KEY =
  process.env.PHI_HMAC_KEY ?? "fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210";
process.env.PAYMENT_WEBHOOK_SECRET = process.env.PAYMENT_WEBHOOK_SECRET ?? "test_webhook_secret_min_16_chars";
process.env.FRONTEND_URL = process.env.FRONTEND_URL ?? "http://localhost:3000";
// Tests always point at the dedicated test database (never the sandbox
// default and never a developer database).
process.env.DATABASE_URL =
  process.env.TEST_DATABASE_URL ??
  "postgresql://medical_app:local_dev_password@127.0.0.1:55432/medical_saas_test?schema=public";
process.env.TRUST_PROXY = "0";
