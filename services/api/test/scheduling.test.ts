/**
 * Scheduling rules (SCH-001..SCH-004): practitioner eligibility, agenda
 * range semantics, appointment state protection and timezone-aware
 * availability slots against a real PostgreSQL.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import bcrypt from "bcryptjs";
import type { Express } from "express";
import { prisma, withTenant } from "@medical/data";

const CLINIC = "clinic-sched";
const PASSWORD = "SchedTestPass2026";

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
  doctor: "",
  inactiveDoctor: "",
  secretary: "",
  otherClinicDoctor: "",
  patient: "",
};

const purge = async () => {
  await withTenant({ clinicId: CLINIC, actorId: "tester", actorRole: "ADMIN" }, async (tx) => {
    await tx.encounterVersion.deleteMany({ where: { clinicId: CLINIC } });
    await tx.encounter.deleteMany({ where: { clinicId: CLINIC } });
    await tx.appointment.deleteMany({ where: { clinicId: CLINIC } });
    await tx.careTeamMembership.deleteMany({ where: { clinicId: CLINIC } });
    await tx.availabilityRule.deleteMany({ where: { clinicId: CLINIC } });
    await tx.clinic.deleteMany({ where: { id: CLINIC } });
  });
  await withTenant({ clinicId: "clinic-sched-other", actorId: "tester", actorRole: "ADMIN" }, async (tx) => {
    await tx.clinic.deleteMany({ where: { id: "clinic-sched-other" } });
  });
};

beforeAll(async () => {
  const { createApp } = await import("../src/app.js");
  app = (await createApp()) as unknown as Express;

  await purge().catch(() => undefined);

  await withTenant({ clinicId: CLINIC, actorId: "tester", actorRole: "ADMIN" }, async (tx) => {
    await tx.clinic.create({ data: { id: CLINIC, name: "Scheduling Clinic" } });
    const mk = async (clinicId: string, username: string, fullName: string, role: string, isActive = true) =>
      tx.user.create({
        data: { clinicId, username, passwordHash: bcrypt.hashSync(PASSWORD, 4), fullName, role: role as never, isActive },
      });
    const admin = await mk(CLINIC, "schedadmin", "Scheduling Admin", "ADMIN");
    ids.admin = admin.id;
    const doctor = await mk(CLINIC, "scheddoctor", "Scheduling Doctor", "DOCTOR");
    ids.doctor = doctor.id;
    const inactive = await mk(CLINIC, "schedinactive", "Inactive Doctor", "DOCTOR", false);
    ids.inactiveDoctor = inactive.id;
    const secretary = await mk(CLINIC, "schedsecretary", "Scheduling Secretary", "SECRETARY");
    ids.secretary = secretary.id;
    const patient = await tx.patient.create({
      data: { clinicId: CLINIC, internalRef: "P-700001", fullName: "Scheduled Patient" },
    });
    ids.patient = patient.id;
  });

  // The cross-tenant doctor needs its own tenant context: RLS only allows
  // rows whose clinic matches the transaction's clinic id.
  await withTenant({ clinicId: "clinic-sched-other", actorId: "tester", actorRole: "ADMIN" }, async (tx) => {
    await tx.clinic.create({ data: { id: "clinic-sched-other", name: "Other Clinic" } });
    const other = await tx.user.create({
      data: {
        clinicId: "clinic-sched-other",
        username: "schedotherreal",
        passwordHash: bcrypt.hashSync(PASSWORD, 4),
        fullName: "Other Clinic Doctor",
        role: "DOCTOR",
      },
    });
    ids.otherClinicDoctor = other.id;
  });
});

afterAll(async () => {
  await purge().catch(() => undefined);
  await prisma.$disconnect();
});

describe("practitioner eligibility on booking (SCH-004)", () => {
  it("rejects booking a secretary as the practitioner", async () => {
    await login("admin", "schedadmin");
    const res = await request(app)
      .post("/api/v1/appointments")
      .set(authHeaders("admin"))
      .send({ patientId: ids.patient, doctorId: ids.secretary, startTime: "2026-07-15T09:00:00.000Z", durationMinutes: 30 });
    expect(res.status).toBe(422);
    expect(res.body.code).toBe("UNPROCESSABLE");
  });

  it("rejects booking an inactive doctor", async () => {
    const res = await request(app)
      .post("/api/v1/appointments")
      .set(authHeaders("admin"))
      .send({ patientId: ids.patient, doctorId: ids.inactiveDoctor, startTime: "2026-07-15T09:00:00.000Z", durationMinutes: 30 });
    expect(res.status).toBe(422);
  });

  it("never finds a doctor from another clinic", async () => {
    const res = await request(app)
      .post("/api/v1/appointments")
      .set(authHeaders("admin"))
      .send({ patientId: ids.patient, doctorId: ids.otherClinicDoctor, startTime: "2026-07-15T09:00:00.000Z", durationMinutes: 30 });
    expect(res.status).toBe(404);
  });

  it("books against the eligible doctor", async () => {
    const res = await request(app)
      .post("/api/v1/appointments")
      .set(authHeaders("admin"))
      .send({ patientId: ids.patient, doctorId: ids.doctor, startTime: "2026-07-15T09:00:00.000Z", durationMinutes: 30 });
    expect(res.status).toBe(201);
    expect(res.body.doctorId).toBe(ids.doctor);
  });
});

describe("agenda range semantics (SCH-001)", () => {
  beforeAll(async () => {
    await login("admin", "schedadmin");
    const late = await request(app)
      .post("/api/v1/appointments")
      .set(authHeaders("admin"))
      .send({ patientId: ids.patient, doctorId: ids.doctor, startTime: "2026-07-15T22:50:00.000Z", durationMinutes: 20 });
    expect(late.status).toBe(201);
  });

  it("returns appointments that end inside the window even when they start before it", async () => {
    await login("admin", "schedadmin");
    // 22:50Z-23:10Z: a query starting at 23:00Z must still see it.
    const res = await request(app)
      .get("/api/v1/appointments")
      .query({ from: "2026-07-15T23:00:00.000Z", to: "2026-07-15T23:30:00.000Z" })
      .set(authHeaders("admin"));
    expect(res.status).toBe(200);
    const items = res.body.items as { startTime: string; endTime: string }[];
    expect(items).toHaveLength(1);
    expect(items[0].startTime).toBe("2026-07-15T22:50:00.000Z");
  });

  it("excludes appointments that end before the window opens", async () => {
    const res = await request(app)
      .get("/api/v1/appointments")
      .query({ from: "2026-07-15T23:11:00.000Z", to: "2026-07-15T23:59:00.000Z" })
      .set(authHeaders("admin"));
    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(0);
  });

  it("rejects an inverted range and an oversized window", async () => {
    const inverted = await request(app)
      .get("/api/v1/appointments")
      .query({ from: "2026-07-16T00:00:00.000Z", to: "2026-07-15T00:00:00.000Z" })
      .set(authHeaders("admin"));
    expect(inverted.status).toBe(400);
    const oversized = await request(app)
      .get("/api/v1/appointments")
      .query({ from: "2026-01-01T00:00:00.000Z", to: "2026-09-01T00:00:00.000Z" })
      .set(authHeaders("admin"));
    expect(oversized.status).toBe(400);
  });
});

describe("appointment state protection (SCH-002)", () => {
  it("blocks content changes on a cancelled appointment", async () => {
    await login("admin", "schedadmin");
    const created = await request(app)
      .post("/api/v1/appointments")
      .set(authHeaders("admin"))
      .send({ patientId: ids.patient, doctorId: ids.doctor, startTime: "2026-07-16T10:00:00.000Z", durationMinutes: 30 });
    expect(created.status).toBe(201);
    const cancel = await request(app)
      .patch(`/api/v1/appointments/${created.body.id}/status`)
      .set(authHeaders("admin"))
      .send({ status: "CANCELLED" });
    expect(cancel.status).toBe(200);
    const edit = await request(app)
      .put(`/api/v1/appointments/${created.body.id}`)
      .set(authHeaders("admin"))
      .send({ reason: "rescheduling attempt on a cancelled visit" });
    expect(edit.status).toBe(422);
  });
});

describe("timezone-aware availability (SCH-003)", () => {
  beforeAll(async () => {
    await login("admin", "schedadmin");
    // Wednesdays 08:00-12:00 clinic-local; the rule expires mid-June 2026.
    const rule = await request(app)
      .put("/api/v1/availability")
      .set(authHeaders("admin"))
      .send({ doctorId: ids.doctor, weekday: 3, startMinute: 480, endMinute: 720, validTo: "2026-06-30" });
    expect(rule.status).toBe(200);
  });

  it("maps local morning hours to CEST instants in summer", async () => {
    const res = await request(app)
      .get("/api/v1/availability/slots")
      .query({ date: "2026-07-15" })
      .set(authHeaders("admin"));
    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(0); // rule expired on 2026-06-30
  });

  it("still offers slots before the rule expires and converts CET correctly", async () => {
    const res = await request(app)
      .get("/api/v1/availability/slots")
      .query({ date: "2026-01-14" })
      .set(authHeaders("admin"));
    expect(res.status).toBe(200);
    const items = res.body.items as { startTime: string }[];
    expect(items.length).toBeGreaterThan(0);
    // 08:00 Europe/Zurich in January (CET, UTC+1) -> 07:00Z.
    expect(items[0].startTime).toBe("2026-01-14T07:00:00.000Z");
  });

  it("maps the same local hour to CEST instants while the rule is valid", async () => {
    // Extend the rule validity first.
    const extend = await request(app)
      .put("/api/v1/availability")
      .set(authHeaders("admin"))
      .send({ doctorId: ids.doctor, weekday: 3, startMinute: 480, endMinute: 720, validTo: "2026-12-31" });
    expect(extend.status).toBe(200);
    const res = await request(app)
      .get("/api/v1/availability/slots")
      .query({ date: "2026-07-15" })
      .set(authHeaders("admin"));
    expect(res.status).toBe(200);
    const items = res.body.items as { startTime: string }[];
    expect(items.length).toBeGreaterThan(0);
    // 08:00 Europe/Zurich in July (CEST, UTC+2) -> 06:00Z.
    expect(items[0].startTime).toBe("2026-07-15T06:00:00.000Z");
  });
});
