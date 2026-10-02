/**
 * Administration final-state rules (ADM-001/ADM-002) and break-glass abuse
 * controls (BG-001): last-admin protection, session invalidation, step-up
 * elevation, cross-tenant admin isolation, rate caps, revocation and the
 * mandatory post-use review - against a real PostgreSQL.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import bcrypt from "bcryptjs";
import type { Express } from "express";
import { prisma, withTenant } from "@medical/data";

const CLINIC = "clinic-admin";
const OTHER = "clinic-admin-other";
const PASSWORD = "AdminTestPass2026!";

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

const ids = {
  admin: "",
  admin2: "",
  doctor: "",
  otherClinicDoctor: "",
  patient: "",
};

beforeAll(async () => {
  const { createApp } = await import("../src/app.js");
  app = (await createApp()) as unknown as Express;

  for (const clinic of [CLINIC, OTHER]) {
    await withTenant({ clinicId: clinic, actorId: "tester", actorRole: "ADMIN" }, async (tx) => {
      await tx.clinic.deleteMany({ where: { id: clinic } });
      await tx.clinic.create({ data: { id: clinic, name: clinic === CLINIC ? "Admin Clinic" : "Other Admin Clinic" } });
    });
  }

  await withTenant({ clinicId: CLINIC, actorId: "tester", actorRole: "ADMIN" }, async (tx) => {
    const mk = async (username: string, fullName: string, role: string) =>
      tx.user.create({
        data: { clinicId: CLINIC, username, passwordHash: bcrypt.hashSync(PASSWORD, 4), fullName, role: role as never },
      });
    ids.admin = (await mk("admintest", "Primary Admin", "ADMIN")).id;
    ids.admin2 = (await mk("admintest2", "Second Admin", "ADMIN")).id;
    ids.doctor = (await mk("admindoctor", "Admin Doctor", "DOCTOR")).id;
    const patient = await tx.patient.create({ data: { clinicId: CLINIC, internalRef: "P-500001", fullName: "Admin Patient" } });
    ids.patient = patient.id;
  });

  await withTenant({ clinicId: OTHER, actorId: "tester", actorRole: "ADMIN" }, async (tx) => {
    const u = await tx.user.create({
      data: {
        clinicId: OTHER,
        username: "adminotherdoc",
        passwordHash: bcrypt.hashSync(PASSWORD, 4),
        fullName: "Other Clinic Doctor",
        role: "DOCTOR",
      },
    });
    ids.otherClinicDoctor = u.id;
  });
});

afterAll(async () => {
  for (const clinic of [CLINIC, OTHER]) {
    await withTenant({ clinicId: clinic, actorId: "tester", actorRole: "ADMIN" }, async (tx) => {
      await tx.clinic.deleteMany({ where: { id: clinic } });
    }).catch(() => undefined);
  }
  await prisma.$disconnect();
});

describe("user administration final state (ADM-001/ADM-002)", () => {
  it("blocks modifying a user of another clinic even with a known id", async () => {
    await login("admin", "admintest");
    const res = await request(app)
      .put(`/api/v1/users/${ids.otherClinicDoctor}`)
      .set(authHeaders("admin"))
      .send({ isActive: false });
    expect(res.status).toBe(404);
  });

  it("blocks deactivating the last active administrator", async () => {
    await login("admin", "admintest");
    // Remove the second admin first, leaving exactly one active.
    const removeSecond = await request(app)
      .put(`/api/v1/users/${ids.admin2}`)
      .set(authHeaders("admin"))
      .send({ isActive: false });
    expect(removeSecond.status).toBe(200);
    const block = await request(app)
      .put(`/api/v1/users/${ids.admin}`)
      .set(authHeaders("admin"))
      .send({ isActive: false });
    expect(block.status).toBe(422);
    const stillActive = await withTenant({ clinicId: CLINIC, actorId: "tester", actorRole: "ADMIN" }, async (tx) => {
      const u = await tx.user.findFirst({ where: { clinicId: CLINIC, id: ids.admin } });
      return u?.isActive;
    });
    expect(stillActive).toBe(true);
  });

  it("requires step-up before elevating a user to ADMIN", async () => {
    await login("admin", "admintest");
    const created = await request(app)
      .post("/api/v1/users")
      .set(authHeaders("admin"))
      .send({ username: "stepelevation", password: PASSWORD, fullName: "Step Up Doctor", role: "DOCTOR" });
    expect(created.status).toBe(201);
    const doctorId = created.body.id as string;
    const elevate = await request(app)
      .put(`/api/v1/users/${doctorId}`)
      .set(authHeaders("admin"))
      .send({ role: "ADMIN" });
    expect(elevate.status).toBe(403);
    expect(elevate.body.code).toBe("STEP_UP_REQUIRED");
    const stepUp = await request(app)
      .post("/api/v1/auth/step-up")
      .set(authHeaders("admin"))
      .send({ password: PASSWORD });
    expect(stepUp.status).toBe(200);
    const elevateAgain = await request(app)
      .put(`/api/v1/users/${doctorId}`)
      .set(authHeaders("admin"))
      .send({ role: "ADMIN" });
    expect(elevateAgain.status).toBe(200);
    expect(elevateAgain.body.role).toBe("ADMIN");
  });

  it("revokes every session when a user is deactivated", async () => {
    await login("admin", "admintest");
    const doctorLogin = await login("doctor", "admindoctor");
    expect(doctorLogin.status).toBe(200);
    const sessionBefore = await request(app).get("/api/v1/auth/session").set(authHeaders("doctor"));
    expect(sessionBefore.status).toBe(200);
    const deactivate = await request(app)
      .put(`/api/v1/users/${ids.doctor}`)
      .set(authHeaders("admin"))
      .send({ isActive: false });
    expect(deactivate.status).toBe(200);
    const sessionAfter = await request(app).get("/api/v1/auth/session").set(authHeaders("doctor"));
    expect(sessionAfter.status).toBe(401);
  });

  it("records before and after states in the audit trail without secrets", async () => {
    const events = await withTenant({ clinicId: CLINIC, actorId: "tester", actorRole: "ADMIN" }, async (tx) => {
      const rows = await tx.auditLog.findMany({
        where: { clinicId: CLINIC, action: "USER_DEACTIVATED", target: ids.doctor },
        orderBy: { seq: "desc" },
        take: 1,
      });
      return rows.map((r) => ({ details: r.details as Record<string, unknown> }));
    });
    expect(events).toHaveLength(1);
    const details = events[0].details as { before?: { isActive?: boolean }; after?: { isActive?: boolean } };
    expect(details.before?.isActive).toBe(true);
    expect(details.after?.isActive).toBe(false);
    expect(JSON.stringify(details)).not.toContain("passwordHash");
  });
});

describe("break-glass abuse controls (BG-001)", () => {
  it("caps concurrent emergency windows per actor", async () => {
    await login("admin", "admintest");
    const first = await request(app)
      .post("/api/v1/break-glass")
      .set(authHeaders("admin"))
      .send({ patientId: ids.patient, reason: "first emergency window for the same actor" });
    expect(first.status).toBe(200);
    expect(first.body.accessId).toBeTruthy();
    const second = await request(app)
      .post("/api/v1/break-glass")
      .set(authHeaders("admin"))
      .send({ patientId: ids.patient, reason: "second emergency window for the same actor" });
    expect(second.status).toBe(200);
    const third = await request(app)
      .post("/api/v1/break-glass")
      .set(authHeaders("admin"))
      .send({ patientId: ids.patient, reason: "third emergency attempt beyond the cap" });
    expect(third.status).toBe(429);
    expect(third.body.code).toBe("RATE_LIMITED");
  });

  it("closes all windows on revocation and blocks access immediately after", async () => {
    const summary = await request(app).get(`/api/v1/patients/${ids.patient}/summary`).set(authHeaders("admin"));
    expect(summary.status).toBe(200);
    const revoke = await request(app).delete("/api/v1/break-glass").set(authHeaders("admin"));
    expect(revoke.status).toBe(200);
    expect(revoke.body.windowsClosed).toBeGreaterThan(0);
    const blocked = await request(app).get(`/api/v1/patients/${ids.patient}/summary`).set(authHeaders("admin"));
    expect(blocked.status).toBe(403);
    expect(blocked.body.code).toBe("BREAK_GLASS_REQUIRED");
  });

  it("lists unreviewed grants and records the review", async () => {
    await login("admin", "admintest");
    const grant = await request(app)
      .post("/api/v1/break-glass")
      .set(authHeaders("admin"))
      .send({ patientId: ids.patient, reason: "window opened for the review flow test" });
    expect(grant.status).toBe(200);
    const pending = await request(app).get("/api/v1/break-glass/pending-review").set(authHeaders("admin"));
    expect(pending.status).toBe(200);
    const item = (pending.body.items as { id: string }[]).find((x) => x.id === grant.body.accessId);
    expect(item).toBeTruthy();
    const review = await request(app)
      .post(`/api/v1/break-glass/${grant.body.accessId}/review`)
      .set(authHeaders("admin"));
    expect(review.status).toBe(200);
    const reviewed = await withTenant({ clinicId: CLINIC, actorId: "tester", actorRole: "ADMIN" }, async (tx) => {
      const row = await tx.breakGlassAccess.findFirst({ where: { clinicId: CLINIC, id: grant.body.accessId } });
      return { reviewedAt: row?.reviewedAt, reviewedById: row?.reviewedById };
    });
    expect(reviewed.reviewedAt).not.toBeNull();
    expect(reviewed.reviewedById).toBe(ids.admin);
  });

  it("notifies administrators and blocks beyond the daily rate", async () => {
    await login("admin", "admintest");
    // Revoke first so the active-window cap does not interfere.
    await request(app).delete("/api/v1/break-glass").set(authHeaders("admin"));
    // Existing grants from this suite count toward the daily rate; keep
    // granting until the rate cap answers 429.
    let hit = false;
    for (let i = 0; i < 12 && !hit; i += 1) {
      const res = await request(app)
        .post("/api/v1/break-glass")
        .set(authHeaders("admin"))
        .send({ patientId: ids.patient, reason: `daily rate probe ${i} with enough length` });
      if (res.status === 429) {
        hit = true;
        expect(res.body.code).toBe("RATE_LIMITED");
      } else {
        expect(res.status).toBe(200);
        // Keep the active-window cap open for the next probe.
        await request(app).delete("/api/v1/break-glass").set(authHeaders("admin"));
      }
    }
    expect(hit).toBe(true);
    const notifications = await withTenant({ clinicId: CLINIC, actorId: "tester", actorRole: "ADMIN" }, async (tx) =>
      tx.notification.count({ where: { clinicId: CLINIC, category: "BREAK_GLASS" } }),
    );
    expect(notifications).toBeGreaterThan(0);
  });
});
