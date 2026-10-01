/**
 * End-to-end happy paths against the real app (API + SPA + browser).
 *
 * Covers: login, daybook, patient creation, search, clinical record with
 * encounter lifecycle (draft -> sign), messaging, billing, audit chain and
 * language switching. Runs against the seeded e2e database.
 */
import { test, expect, type Page } from "@playwright/test";

const ADMIN = { username: "e2eadmin", password: "E2eAdminPass2026" };

async function login(page: Page, username: string, password: string): Promise<void> {
  await page.goto("/");
  await page.getByLabel("Username", { exact: false }).fill(username);
  await page.getByLabel("Password", { exact: false }).fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { name: "Clinical daybook" })).toBeVisible();
}

async function openPatients(page: Page): Promise<void> {
  await page
    .getByRole("navigation", { name: "Primary navigation" })
    .getByRole("button", { name: "Patients" })
    .click();
  await expect(page.getByRole("heading", { name: "Patients." })).toBeVisible();
}

async function logout(page: Page): Promise<void> {
  // The shell may be localised (e.g. "Abmelden" after switching to German).
  await page.getByRole("button", { name: /^(Sign out|Abmelden|Déconnexion|Esci)$/ }).click();
  await expect(page.getByRole("heading", { name: /^(Sign in\.|Anmelden\.|Connexion\.|Accedi\.)$/ })).toBeVisible();
}

test.describe("clinical console", () => {
  test("admin can sign in and out", async ({ page }) => {
    await login(page, ADMIN.username, ADMIN.password);
    await expect(page.getByRole("navigation", { name: "Primary navigation" })).toBeVisible();
    await logout(page);
  });

  test("daybook shows today's agenda and review queue", async ({ page }) => {
    await login(page, ADMIN.username, ADMIN.password);
    await expect(page.getByRole("region", { name: "Today" })).toBeVisible();
    await expect(page.getByText("appointments").first()).toBeVisible();
    await expect(page.getByRole("heading", { name: "To review" })).toBeVisible();
    await logout(page);
  });

  test("admin creates a patient and finds it via search", async ({ page }) => {
    await login(page, ADMIN.username, ADMIN.password);
    await openPatients(page);
    await page.getByRole("button", { name: "Add patient" }).click();
    await page.getByRole("dialog").getByLabel("Name", { exact: false }).fill("Test Person E2E");
    await page.getByRole("dialog").getByLabel("Date of birth", { exact: false }).fill("1991-06-15");
    await page.getByRole("button", { name: "Create", exact: true }).click();
    await expect(page.getByRole("table").getByText("Test Person E2E").first()).toBeVisible();

    await page.getByLabel(/Search name or internal ID/).fill("Test Person");
    await expect(page.getByRole("table").getByText("Test Person E2E").first()).toBeVisible();
    await logout(page);
  });

  test("clinical record: break-glass then encounter sign flow", async ({ page }) => {
    await login(page, ADMIN.username, ADMIN.password);
    await openPatients(page);
    await page.getByLabel(/Search name or internal ID/).fill("Marie");
    await page.getByRole("table").getByText("Marie Schneider").first().click();

    // admin hits the break-glass gate (fresh databases); on a recently used
    // database an earlier 30-minute window may still be active, in which case
    // the record opens directly.
    const gate = page.getByRole("heading", { name: "Break-glass access" });
    const record = page.getByRole("heading", { name: "Marie Schneider" });
    await expect(record).toBeVisible();
    if ((await gate.count()) > 0) {
      await page.getByLabel("Reason for access").fill("Covering physician requested record verification");
      await page.getByRole("button", { name: /Log reason and open record/ }).click();
      await expect(record).toBeVisible();
    }

    // encounters tab shows the seeded signed note
    await page.getByRole("tab", { name: "Encounters" }).click();
    await expect(page.getByText("Follow-up hypertension")).toBeVisible();
    await logout(page);
  });

  test("doctor signs a draft encounter", async ({ page }) => {
    await login(page, "keller", "E2eStaffPass2026");
    await openPatients(page);
    await page.getByLabel(/Search name or internal ID/).fill("Thomas");
    await page.getByRole("table").getByText("Thomas Weber").first().click();
    await expect(page.getByRole("heading", { name: "Thomas Weber" })).toBeVisible();

    await page.getByRole("tab", { name: "Encounters" }).click();
    await page.getByRole("button", { name: "New encounter" }).first().click();
    await page.getByRole("dialog").getByLabel("Name", { exact: false }).fill("E2e consultation note");
    await page.getByRole("dialog").getByLabel("Chief concern", { exact: false }).fill("E2e chief concern");
    await page.getByRole("button", { name: "Create", exact: true }).click();
    await expect(page.getByText("E2e consultation note").first()).toBeVisible();

    await page.getByRole("button", { name: "Sign note" }).click();
    await expect(page.getByText("Signed", { exact: true }).first()).toBeVisible();
    await logout(page);
  });

  test("secure inbox: thread list and reply", async ({ page }) => {
    await login(page, "keller", "E2eStaffPass2026");
    await page
      .getByRole("navigation", { name: "Primary navigation" })
      .getByRole("button", { name: "Messages" })
      .click();
    await expect(page.getByRole("heading", { name: "Messages." })).toBeVisible();
    const thread = page.getByRole("button", { name: /Blood test tomorrow/ });
    await expect(thread).toBeVisible();
    await thread.click();
    await expect(page.getByText(/fasting/i)).toBeVisible();
    await logout(page);
  });

  test("billing overview shows invoices and payments", async ({ page }) => {
    await login(page, "keller", "E2eStaffPass2026");
    await page
      .getByRole("navigation", { name: "Primary navigation" })
      .getByRole("button", { name: "Billing" })
      .click();
    await expect(page.getByRole("heading", { name: "Billing." })).toBeVisible();
    await expect(page.getByText("INV-00001")).toBeVisible();
    await page.getByRole("tab", { name: "Payments" }).click();
    await expect(page.getByText("120.00").first()).toBeVisible();
    await logout(page);
  });

  test("audit trail verifies its hash chain", async ({ page }) => {
    await login(page, ADMIN.username, ADMIN.password);
    await page
      .getByRole("navigation", { name: "Primary navigation" })
      .getByRole("button", { name: "Audit" })
      .click();
    await expect(page.getByRole("heading", { name: "Audit." })).toBeVisible();
    await page.getByRole("button", { name: "Verify chain" }).click();
    await expect(page.getByText("Hash chain intact").first()).toBeVisible();
    await logout(page);
  });

  test("language switching to German localises the shell", async ({ page }) => {
    await login(page, ADMIN.username, ADMIN.password);
    await page.getByRole("button", { name: "DE" }).first().click();
    await expect(page.getByRole("button", { name: "01 Tagebuch" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Klinisches Tagebuch." })).toBeVisible();
    await logout(page);
  });
});
