/**
 * HTTP integration tests against the real app (supertest + PostgreSQL).
 *
 * Covers the auth lifecycle (login -> refresh rotation -> replay detection ->
 * logout), CSRF enforcement, RFC 9457 problem details and tenant-scoped
 * patient access (cross-tenant reads must 404, never leak existence).
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import type { Express } from "express";
import bcrypt from "bcryptjs";
import { prisma, withTenant } from "@medical/data";

const CLINIC = "clinic-http-a";
const OTHER = "clinic-http-b";
const PASSWORD = "HttpTestPass2026";

let app: Express;
const cookies: Record<string, string> = {};
let csrf = "";

const parseCookies = (res: request.Response): void => {
  const set = res.headers["set-cookie"] ?? [];
  for (const line of set) {
    const [pair] = line.split(";");
    const eq = pair.indexOf("=");
    cookies[pair.slice(0, eq)] = pair.slice(eq + 1);
  }
};

const authHeaders = (): Record<string, string> => ({
  Cookie: Object.entries(cookies)
    .filter(([k]) => k === "token" || k === "csrf_token")
    .map(([k, v]) => `${k}=${v}`)
    .join("; "),
  ...(cookies.csrf_token ? { "x-csrf-token": csrf } : {}),
});

beforeAll(async () => {
  const { createApp } = await import("../src/app.js");
  app = (await createApp()) as unknown as Express;

  for (const clinicId of [CLINIC, OTHER]) {
    await withTenant({ clinicId, actorId: "tester", actorRole: "ADMIN" }, async (tx) => {
      await tx.clinic.deleteMany({ where: { id: clinicId } });
    }).catch(() => undefined);
  }
  await withTenant({ clinicId: CLINIC, actorId: "tester", actorRole: "ADMIN" }, async (tx) => {
    await tx.clinic.create({ data: { id: CLINIC, name: "HTTP Clinic" } });
    await tx.user.create({
      data: {
        clinicId: CLINIC,
        username: "httpadmin",
        passwordHash: bcrypt.hashSync(PASSWORD, 12),
        fullName: "HTTP Admin",
        role: "ADMIN",
      },
    });
  });
  await withTenant({ clinicId: OTHER, actorId: "tester", actorRole: "ADMIN" }, async (tx) => {
    await tx.clinic.create({ data: { id: OTHER, name: "Other Clinic" } });
    await tx.patient.create({
      data: { clinicId: OTHER, internalRef: "P-000001", fullName: "Other Clinic Patient" },
    });
  });
});

afterAll(async () => {
  for (const clinicId of [CLINIC, OTHER]) {
    await withTenant({ clinicId, actorId: "tester", actorRole: "ADMIN" }, async (tx) => {
      await tx.clinic.deleteMany({ where: { id: clinicId } });
    }).catch(() => undefined);
  }
  await prisma.$disconnect();
});

describe("auth lifecycle", () => {
  it("rejects wrong credentials with a generic problem detail", async () => {
    const res = await request(app).post("/api/v1/auth/login").send({ username: "httpadmin", password: "wrong-password" });
    expect(res.status).toBe(401);
    expect(res.body.code).toBe("INVALID_CREDENTIALS");
    expect(res.body.type).toContain("invalid-credentials");
  });

  it("logs in, sets cookies and returns capabilities", async () => {
    const res = await request(app)
      .post("/api/v1/auth/login")
      .send({ username: "httpadmin", password: PASSWORD, deviceLabel: "vitest" });
    expect(res.status).toBe(200);
    expect(res.body.username).toBe("httpadmin");
    expect(res.body.capabilities).toContain("patients:write");
    parseCookies(res);
    csrf = res.body.csrfToken;
    expect(csrf).toBeTruthy();
  });

  it("serves the session profile", async () => {
    const res = await request(app).get("/api/v1/auth/session").set(authHeaders());
    expect(res.status).toBe(200);
    expect(res.body.clinic.id).toBe(CLINIC);
  });

  it("blocks state-changing writes without the CSRF header", async () => {
    const res = await request(app)
      .post("/api/v1/patients")
      .set("Cookie", `token=${cookies.token}`)
      .send({ fullName: "No CSRF" });
    expect(res.status).toBe(403);
  });

  it("rejects validation failures with field errors", async () => {
    const res = await request(app)
      .post("/api/v1/patients")
      .set(authHeaders())
      .send({ fullName: "" });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("VALIDATION_FAILED");
    expect(Array.isArray(res.body.errors)).toBe(true);
  });

  it("creates, searches and reads a patient with encrypted PHI", async () => {
    const res = await request(app)
      .post("/api/v1/patients")
      .set(authHeaders())
      .send({ fullName: "Http Patient", phone: "+41 79 000 00 99", identifiers: [{ type: "PASSPORT", value: "X9911" }] });
    expect(res.status).toBe(201);
    expect(res.body.internalRef).toMatch(/^P-\d{6}$/);
    expect(res.body.phone).toBe("+41 79 000 00 99");

    const search = await request(app).get("/api/v1/patients?q=Http").set(authHeaders());
    expect(search.status).toBe(200);
    expect(search.body.items.some((p: { fullName: string }) => p.fullName === "Http Patient")).toBe(true);
    // Minimum-necessary projection: lists never expose contact data.
    expect(search.body.items[0]).not.toHaveProperty("phone");
    expect(search.body.items[0]).not.toHaveProperty("email");
  });

  it("returns 404 (not 403) for patients of another clinic", async () => {
    const other = await withTenant({ clinicId: OTHER, actorId: "t", actorRole: "ADMIN" }, (tx) =>
      tx.patient.findFirst({ where: { clinicId: OTHER } }),
    );
    const res = await request(app).get(`/api/v1/patients/${other!.id}`).set(authHeaders());
    expect(res.status).toBe(404);
    expect(res.body.code).toBe("NOT_FOUND");
  });

  it("rotates the refresh token and detects replay", async () => {
    const first = await request(app).post("/api/v1/auth/refresh").set("Cookie", `refresh_token=${cookies.refresh_token}`);
    expect(first.status).toBe(200);
    const firstCookies: Record<string, string> = {};
    for (const line of first.headers["set-cookie"] ?? []) {
      const [pair] = line.split(";");
      const eq = pair.indexOf("=");
      firstCookies[pair.slice(0, eq)] = pair.slice(eq + 1);
    }

    // Replay the OLD token: family is revoked, session killed.
    const replay = await request(app).post("/api/v1/auth/refresh").set("Cookie", `refresh_token=${cookies.refresh_token}`);
    expect(replay.status).toBe(401);
    expect(replay.body.code).toBe("TOKEN_REUSE_DETECTED");

    // The rotated token is dead too (family poisoned).
    const dead = await request(app).post("/api/v1/auth/refresh").set("Cookie", `refresh_token=${firstCookies.refresh_token}`);
    expect(dead.status).toBe(401);
  });

  it("signs out and revokes the session", async () => {
    const res = await request(app).post("/api/v1/auth/logout").set(authHeaders());
    expect(res.status).toBe(200);
    const after = await request(app).get("/api/v1/auth/session").set("Cookie", `token=${cookies.token}`);
    expect(after.status).toBe(401);
  });
});

describe("security headers", () => {
  it("sends hardened headers and no-store on the API surface", async () => {
    const res = await request(app).get("/api/v1/health");
    expect(res.status).toBe(200);
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
    expect(res.headers["cache-control"]).toBe("no-store");
    expect(res.headers["x-frame-options"]).toBe("DENY");
  });

  it("serves readiness from a live database", async () => {
    const res = await request(app).get("/api/v1/health/ready");
    expect(res.status).toBe(200);
    expect(res.body.database).toBe("up");
  });
});

describe("billing workflow", () => {
  let patientId: string;
  let invoiceId: string;

  it("signs back in for the billing run", async () => {
    const res = await request(app)
      .post("/api/v1/auth/login")
      .send({ username: "httpadmin", password: PASSWORD, deviceLabel: "vitest-billing" });
    expect(res.status).toBe(200);
    parseCookies(res);
    csrf = res.body.csrfToken;
  });

  it("creates a patient to bill", async () => {
    const res = await request(app)
      .post("/api/v1/patients")
      .set(authHeaders())
      .send({ fullName: "Billing Patient" });
    expect(res.status).toBe(201);
    patientId = res.body.id;
  });

  it("creates an invoice with line items and a computed total", async () => {
    const res = await request(app)
      .post("/api/v1/invoices")
      .set(authHeaders())
      .send({
        patientId,
        items: [
          { description: "Consultation", quantity: 1, unitPrice: 100 },
          { description: "Lab panel", quantity: 2, unitPrice: 25.5 },
        ],
      });
    expect(res.status).toBe(201);
    expect(res.body.total).toBe(151);
    expect(res.body.status).toBe("ISSUED");
    invoiceId = res.body.id;
  });

  it("rejects payments above the outstanding balance", async () => {
    const res = await request(app)
      .post(`/api/v1/invoices/${invoiceId}/payments`)
      .set(authHeaders())
      .send({ amount: 151.01, method: "BANK_TRANSFER" });
    expect(res.status).toBe(422);
    expect(res.body.code).toBe("UNPROCESSABLE");
  });

  it("records a partial payment and reconciles to PARTIALLY_PAID", async () => {
    const pay = await request(app)
      .post(`/api/v1/invoices/${invoiceId}/payments`)
      .set(authHeaders())
      .send({ amount: 51, method: "BANK_TRANSFER" });
    expect(pay.status).toBe(201);

    const list = await request(app).get("/api/v1/invoices?page=1&limit=10").set(authHeaders());
    const invoice = list.body.items.find((i: { id: string }) => i.id === invoiceId);
    expect(invoice.status).toBe("PARTIALLY_PAID");
    expect(invoice.paidTotal).toBe(51);
  });

  it("rejects payments that exceed the remaining balance mid-way", async () => {
    const res = await request(app)
      .post(`/api/v1/invoices/${invoiceId}/payments`)
      .set(authHeaders())
      .send({ amount: 100.01, method: "CASH" });
    expect(res.status).toBe(422);
  });

  it("settles the invoice and reconciles to PAID", async () => {
    const pay = await request(app)
      .post(`/api/v1/invoices/${invoiceId}/payments`)
      .set(authHeaders())
      .send({ amount: 100, method: "CASH" });
    expect(pay.status).toBe(201);

    const list = await request(app).get("/api/v1/invoices?page=1&limit=10").set(authHeaders());
    const invoice = list.body.items.find((i: { id: string }) => i.id === invoiceId);
    expect(invoice.status).toBe("PAID");
    expect(invoice.paidTotal).toBe(151);
  });

  it("rejects any further payment on a settled invoice", async () => {
    const res = await request(app)
      .post(`/api/v1/invoices/${invoiceId}/payments`)
      .set(authHeaders())
      .send({ amount: 1, method: "CASH" });
    expect(res.status).toBe(422);
  });

  it("rejects payments on a cancelled invoice", async () => {
    const created = await request(app)
      .post("/api/v1/invoices")
      .set(authHeaders())
      .send({ patientId, items: [{ description: "Cancelled service", quantity: 1, unitPrice: 40 }] });
    expect(created.status).toBe(201);

    const cancel = await request(app)
      .patch(`/api/v1/invoices/${created.body.id}/status`)
      .set(authHeaders())
      .send({ status: "CANCELLED" });
    expect(cancel.status).toBe(200);

    const pay = await request(app)
      .post(`/api/v1/invoices/${created.body.id}/payments`)
      .set(authHeaders())
      .send({ amount: 10, method: "CASH" });
    expect(pay.status).toBe(409);
  });

  it("accepts, rejects and dedupes payment webhooks idempotently", async () => {
    const crypto = await import("node:crypto");
    const secret = process.env.PAYMENT_WEBHOOK_SECRET ?? "test_webhook_secret_min_16_chars";
    const event = {
      id: `evt_http_${Date.now()}`,
      provider: "generic",
      type: "payment.completed",
      amount: "51.00",
      currency: "CHF",
    };
    const sign = crypto.createHmac("sha256", secret).update(JSON.stringify(event)).digest("hex");

    const ok = await request(app).post("/api/v1/webhooks/payment").set("x-signature", sign).send(event);
    expect(ok.status).toBe(200);
    expect(ok.body.status).toBe("PROCESSED");

    // Identical delivery (network retry): deduplicated, never applied twice.
    const replay = await request(app).post("/api/v1/webhooks/payment").set("x-signature", sign).send(event);
    expect(replay.status).toBe(200);
    expect(replay.body.status).toBe("DUPLICATE");

    // Forged signature: recorded as rejected, never settled.
    const forged = await request(app).post("/api/v1/webhooks/payment").set("x-signature", "deadbeef").send({
      ...event,
      id: `evt_http_forged_${Date.now()}`,
    });
    expect(forged.status).toBe(200);
    expect(forged.body.status).toBe("REJECTED");
  });
});
