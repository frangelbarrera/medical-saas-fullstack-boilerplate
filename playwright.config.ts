import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright E2E configuration.
 *
 * The suite boots the real application (API + built SPA) against a dedicated
 * test database and drives a real browser through the main clinical
 * workflows. It requires:
 *   - schema work via E2E_ADMIN_URL and the runtime app-role URL via E2E_APP_URL
 *   - the app role `medical_app` (ops/db/init/01-app-role.sql)
 *
 * CI provisions both; locally run scripts/e2e-prepare.sh first.
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false, // serial: tests share one seeded server
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: process.env.CI ? "line" : "list",
  timeout: 45000,
  expect: { timeout: 8000 },
  use: {
    baseURL: "http://localhost:4099",
    trace: "on-first-retry",
    headless: true,
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "npm run e2e:server",
    url: "http://localhost:4099/api/v1/health",
    reuseExistingServer: false,
    timeout: 120000,
    stdout: "pipe",
    stderr: "pipe",
    env: {
      NODE_ENV: "production",
      PORT: "4099",
      DATABASE_URL:
        process.env.E2E_APP_URL ??
        "postgresql://medical_app:local_dev_password@127.0.0.1:55432/medical_saas_e2e?schema=public",
      FRONTEND_URL: "http://localhost:4099",
      JWT_SECRET: "e2e_jwt_secret_minimum_32_characters_long",
      ENCRYPTION_KEY: "1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
      PHI_HMAC_KEY: "fedcba0987654321fedcba0987654321fedcba0987654321fedcba0987654321",
      PAYMENT_WEBHOOK_SECRET: "e2e_webhook_secret_16",
      TRUST_PROXY: "0",
      ADMIN_USERNAME: "e2eadmin",
      ADMIN_PASSWORD: "E2eAdminPass2026",
      ADMIN_CLINIC_ID: "clinic_default",
      ADMIN_CLINIC_NAME: "Riverside Clinic",
    },
  },
});
