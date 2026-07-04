import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright E2E test configuration.
 *
 * Tests spin up the dev server (tsx server.ts) on port 4099 with test env
 * vars, then drive a real browser (Chromium) through the happy paths:
 *  1. Login as admin
 *  2. View dashboard
 *  3. Create a patient
 *  4. View patient list
 *  5. Logout
 *
 * Run with: npm run test:e2e
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false, // serial — tests share the same server instance
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: process.env.CI ? "line" : "html",
  timeout: 30000,
  expect: {
    timeout: 5000,
  },
  use: {
    baseURL: "http://localhost:4099",
    trace: "on-first-retry",
    headless: true,
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command:
      "START_SERVER=1 NODE_ENV=test PORT=4099 JWT_SECRET=test_jwt_secret_minimum_32_characters_long_for_testing_only ENCRYPTION_KEY=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa PAYMENT_WEBHOOK_SECRET=test_webhook_secret_min_16_chars FRONTEND_URL=http://localhost:4099 PGHOST=localhost PGUSER=postgres PGPASSWORD=postgres PGDATABASE=medical_saas_test ADMIN_USERNAME=e2eadmin ADMIN_PASSWORD=e2epass123 npx tsx server.ts",
    url: "http://localhost:4099/api/health",
    reuseExistingServer: !process.env.CI,
    timeout: 30000,
    stdout: "pipe",
    stderr: "pipe",
  },
});
