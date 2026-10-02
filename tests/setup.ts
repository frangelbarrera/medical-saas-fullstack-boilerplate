/**
 * Vitest global setup: stable test environment.
 *
 * Environment defaults mirror docker-compose.test.yml. Database-backed
 * suites probe TEST_DATABASE_URL themselves; when PostgreSQL is
 * unreachable they fail loudly if REQUIRE_DB=1 (CI and any run that must
 * prove the authorization matrix), otherwise they skip with an explicit
 * notice so a quick lint loop never looks like a partial pass.
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

import net from "net";

const url = new URL(process.env.DATABASE_URL);
const port = Number(url.port || 5432);
const host = url.hostname;

const probe = (timeoutMs = 1500): Promise<boolean> =>
  new Promise((resolve) => {
    const socket = net.connect({ host, port, timeout: timeoutMs });
    socket.once("connect", () => {
      socket.end();
      resolve(true);
    });
    socket.once("timeout", () => {
      socket.destroy();
      resolve(false);
    });
    socket.once("error", () => resolve(false));
  });

const reachable = await probe();

if (!reachable) {
  const instructions =
    "PostgreSQL is not reachable at " +
    `${host}:${port} (TEST_DATABASE_URL). Start the disposable test database with: ` +
    "docker compose -f docker-compose.test.yml up -d";
  if (process.env.REQUIRE_DB === "1") {
    throw new Error("Database-backed suites cannot run. " + instructions);
  }
  console.warn("[setup] " + instructions + " - database-backed suites will skip.");
}
