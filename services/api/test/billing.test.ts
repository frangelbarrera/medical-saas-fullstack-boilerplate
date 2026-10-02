/**
 * Billing hardening (BIL-001 / BIL-002): webhook signature over the raw
 * body with anti-replay, idempotency per (provider, external_id), refusal
 * of identifier-less events, and race-free invoice numbering under real
 * concurrency against PostgreSQL.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import crypto from "crypto";
import bcrypt from "bcryptjs";
import type { Express } from "express";
import { prisma, withTenant } from "@medical/data";

const CLINIC = "clinic-billing";
const PASSWORD = "BillingTest2026!";
const SECRET = "test_webhook_secret_min_16_chars"; // matches tests/setup.ts

let app: Express;

const cookiesByUser: Record<string, Record<string, string>> = {};
const csrfByUser: Record<string, string> = {};

const parseCookies = (user: string, res: request.Response): void => {
  const set = res.headers["set-cookie"] ?? [];
  cookiesByUser[user] = cookiesByUser[user] ?? {};
  for (const line of set) {
    const [pair] = line.split(";");
    const eq = pair.indexOf("=");
    cookiesByUser[user]![pair.slice(0, eq)] = pair.slice(eq + 1);
  }
};

const authHeaders = (user: string): Record<string, string> => {
  const jar = cookiesByUser[user] ?? {};
  return {
    Cookie: Object.entries(jar)
      .filter(([k]) => k === "token" || k === "csrf_token")
      .map(([k, v]) => `${k}=${v}`)
      .join("; "),
    ...(csrfByUser[user] ? { "x-csrf-token": csrfByUser[user] } : {}),
  };
};

const login = async (user: string, username: string) => {
  const res = await request(app).post("/api/v1/auth/login").send({ username, password: PASSWORD });
  expect(res.status).toBe(200);
  parseCookies(user, res);
  csrfByUser[user] = res.body.csrfToken;
  return res;
};

const signedPayload = (body: Record<string, unknown>, timestamp = Date.now().toString()): {
  raw: string;
  signature: string;
  timestamp: string;
} => {
  const raw = JSON.stringify(body);
  const signature = crypto.createHmac("sha256", SECRET).update(`${timestamp}.${raw}`).digest("hex");
  return { raw, signature, timestamp };
};

const ids = { admin: "", patient: "" };
/** Unique-per-run event ids: the webhook inbox is a global table. */
const runId = crypto.randomBytes(4).toString("hex");

beforeAll(async () => {
  const { createApp } = await import("../src/app.js");
  app = (await createApp()) as unknown as Express;

  await withTenant({ clinicId: CLINIC, actorId: "tester", actorRole: "ADMIN" }, async (tx) => {
    await tx.invoiceItem.deleteMany({ where: { clinicId: CLINIC } });
    await tx.payment.deleteMany({ where: { clinicId: CLINIC } });
    await tx.invoice.deleteMany({ where: { clinicId: CLINIC } });
    await tx.clinic.deleteMany({ where: { id: CLINIC } });
    await tx.clinic.create({ data: { id: CLINIC, name: "Billing Clinic" } });
    const admin = await tx.user.create({
      data: {
        clinicId: CLINIC,
        username: "billingadmin",
        passwordHash: bcrypt.hashSync(PASSWORD, 4),
        fullName: "Billing Admin",
        role: "ADMIN",
      },
    });
    ids.admin = admin.id;
    const patient = await tx.patient.create({
      data: { clinicId: CLINIC, internalRef: "P-400001", fullName: "Billed Patient" },
    });
    ids.patient = patient.id;
  });
});

afterAll(async () => {
  await withTenant({ clinicId: CLINIC, actorId: "tester", actorRole: "ADMIN" }, async (tx) => {
    await tx.invoiceItem.deleteMany({ where: { clinicId: CLINIC } });
    await tx.invoice.deleteMany({ where: { clinicId: CLINIC } });
    await tx.clinic.deleteMany({ where: { id: CLINIC } });
  }).catch(() => undefined);
  await prisma.$disconnect();
});

describe("payment webhook hardening (BIL-001)", () => {
  it("rejects an invalid signature with 401 and never marks it processed", async () => {
    const { raw, timestamp } = signedPayload({ id: `evt-1-${runId}`, provider: "acme", amount: 100 });
    const res = await request(app)
      .post("/api/v1/webhooks/payment")
      .set("Content-Type", "application/json")
      .set("x-webhook-timestamp", timestamp)
      .set("x-signature", "deadbeef".repeat(8))
      .send(raw);
    expect(res.status).toBe(401);
    const stored = await prisma.webhookEvent.findFirst({
      where: { provider: "unverified" },
      orderBy: { receivedAt: "desc" },
    });
    expect(stored?.status).toBe("REJECTED");
    expect(stored?.payloadHash).toBeTruthy();
    expect(JSON.stringify(stored)).not.toContain("acme");
  });

  it("rejects a missing or stale timestamp before parsing the body", async () => {
    const noTs = await request(app)
      .post("/api/v1/webhooks/payment")
      .set("Content-Type", "application/json")
      .send(JSON.stringify({ id: "evt-2" }));
    expect(noTs.status).toBe(401);

    const stale = signedPayload({ id: "evt-3" }, (Date.now() - 10 * 60 * 1000).toString());
    const staleRes = await request(app)
      .post("/api/v1/webhooks/payment")
      .set("Content-Type", "application/json")
      .set("x-webhook-timestamp", stale.timestamp)
      .set("x-signature", stale.signature)
      .send(stale.raw);
    expect(staleRes.status).toBe(401);
  });

  it("verifies the signature over the RAW body, not a reserialization", async () => {
    // A signature computed over JSON.stringify(req.body) with different key
    // order must fail - proving the raw bytes are covered.
    const timestamp = Date.now().toString();
    const raw = JSON.stringify({ id: `evt-4-${runId}`, provider: "acme", amount: 10, note: "x" });
    const reordered = JSON.stringify({ note: "x", amount: 10, provider: "acme", id: `evt-4-${runId}` });
    const badSignature = crypto.createHmac("sha256", SECRET).update(`${timestamp}.${reordered}`).digest("hex");
    const bad = await request(app)
      .post("/api/v1/webhooks/payment")
      .set("Content-Type", "application/json")
      .set("x-webhook-timestamp", timestamp)
      .set("x-signature", badSignature)
      .send(raw);
    expect(bad.status).toBe(401);

    const goodSignature = crypto.createHmac("sha256", SECRET).update(`${timestamp}.${raw}`).digest("hex");
    const good = await request(app)
      .post("/api/v1/webhooks/payment")
      .set("Content-Type", "application/json")
      .set("x-webhook-timestamp", timestamp)
      .set("x-signature", goodSignature)
      .send(raw);
    expect(good.status).toBe(200);
    expect(good.body.status).toBe("PROCESSED");
  });

  it("is idempotent per (provider, external_id) and allows provider collisions", async () => {
    const first = signedPayload({ id: `evt-shared-${runId}`, provider: "acme" });
    const firstRes = await request(app)
      .post("/api/v1/webhooks/payment")
      .set("Content-Type", "application/json")
      .set("x-webhook-timestamp", first.timestamp)
      .set("x-signature", first.signature)
      .send(first.raw);
    expect(firstRes.body.status).toBe("PROCESSED");

    const replay = signedPayload({ id: `evt-shared-${runId}`, provider: "acme" });
    const replayRes = await request(app)
      .post("/api/v1/webhooks/payment")
      .set("Content-Type", "application/json")
      .set("x-webhook-timestamp", replay.timestamp)
      .set("x-signature", replay.signature)
      .send(replay.raw);
    expect(replayRes.body.status).toBe("DUPLICATE");

    // Same external id, different provider: a distinct event.
    const other = signedPayload({ id: `evt-shared-${runId}`, provider: "beepay" });
    const otherRes = await request(app)
      .post("/api/v1/webhooks/payment")
      .set("Content-Type", "application/json")
      .set("x-webhook-timestamp", other.timestamp)
      .set("x-signature", other.signature)
      .send(other.raw);
    expect(otherRes.body.status).toBe("PROCESSED");
  });

  it("refuses events without a stable identifier instead of generating one", async () => {
    const unsigned = signedPayload({ provider: "acme", amount: 5 });
    const res = await request(app)
      .post("/api/v1/webhooks/payment")
      .set("Content-Type", "application/json")
      .set("x-webhook-timestamp", unsigned.timestamp)
      .set("x-signature", unsigned.signature)
      .send(unsigned.raw);
    expect(res.status).toBe(400);
    // The refused event is stored only under the refusal hash, never under
    // a generated identifier pretending to be the payload's id.
    const refusedHashPrefix = crypto.createHash("sha256").update(unsigned.raw).digest("hex").slice(0, 16);
    const refusal = await prisma.webhookEvent.findFirst({
      where: { provider: "acme", externalId: refusedHashPrefix },
      orderBy: { receivedAt: "desc" },
    });
    expect(refusal).toBeTruthy();
    expect(refusal?.signatureValid).toBe(false);
  });
});

describe("invoice numbering under concurrency (BIL-002)", () => {
  it("issues 50 unique, gapless numbers for 50 concurrent invoices", async () => {
    await login("admin", "billingadmin");

    const create = async (i: number) => {
      const res = await request(app)
        .post("/api/v1/invoices")
        .set(authHeaders("admin"))
        .send({ patientId: ids.patient, items: [{ description: `item ${i}`, quantity: 1, unitPrice: 10 }] });
      expect(res.status).toBe(201);
      return res.body.number as string;
    };

    const numbers = await Promise.all(Array.from({ length: 50 }, (_, i) => create(i)));
    const unique = new Set(numbers);
    expect(unique.size).toBe(50);
    const sorted = [...numbers].map((n) => Number(n.replace("INV-", ""))).sort((a, b) => a - b);
    for (let i = 1; i < sorted.length; i += 1) {
      expect(sorted[i]).toBe(sorted[i - 1] + 1);
    }
  });
});
