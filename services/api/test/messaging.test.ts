/**
 * Messaging participant validation (COM-001): threads reject external,
 * inactive or unauthorized participants as a whole set, against a real
 * PostgreSQL with row-level security.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import bcrypt from "bcryptjs";
import type { Express } from "express";
import { prisma, withTenant } from "@medical/data";

const CLINIC = "clinic-msg";
const PASSWORD = "MessagingTest2026";

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
  doctor: "",
  outsider: "",
  inactive: "",
  otherClinic: "",
  portal: "",
  p1: "",
  p2: "",
};

const threadCount = async (): Promise<number> =>
  withTenant({ clinicId: CLINIC, actorId: "tester", actorRole: "ADMIN" }, async (tx) => {
    const t = await tx.message.findMany({ where: { clinicId: CLINIC }, select: { id: true } });
    return t.length;
  });

beforeAll(async () => {
  const { createApp } = await import("../src/app.js");
  app = (await createApp()) as unknown as Express;

  await withTenant({ clinicId: CLINIC, actorId: "tester", actorRole: "ADMIN" }, async (tx) => {
    await tx.message.deleteMany({ where: { clinicId: CLINIC } });
    await tx.thread.deleteMany({ where: { clinicId: CLINIC } });
    await tx.clinic.deleteMany({ where: { id: CLINIC } });
    await tx.clinic.create({ data: { id: CLINIC, name: "Messaging Clinic" } });
    const mk = async (username: string, fullName: string, role: string, isActive = true, patientId?: string) =>
      tx.user.create({
        data: { clinicId: CLINIC, username, passwordHash: bcrypt.hashSync(PASSWORD, 4), fullName, role: role as never, isActive, patientId },
      });
    const doctor = await mk("msgdoctor", "Messaging Doctor", "DOCTOR");
    ids.doctor = doctor.id;
    const outsider = await mk("msgoutsider", "Outside Doctor", "DOCTOR");
    ids.outsider = outsider.id;
    const inactive = await mk("msginactive", "Inactive Staff", "SECRETARY", false);
    ids.inactive = inactive.id;
    ids.otherClinic = "00000000-0000-4000-8000-000000000abc";
    const patient = await tx.patient.create({
      data: { clinicId: CLINIC, internalRef: "P-600001", fullName: "Messaging Patient", primaryDoctorId: doctor.id },
    });
    ids.p1 = patient.id;
    const portal = await mk("msgportal", "Messaging Portal User", "PATIENT", true, patient.id);
    ids.portal = portal.id;
  });
});

afterAll(async () => {
  await withTenant({ clinicId: CLINIC, actorId: "tester", actorRole: "ADMIN" }, async (tx) => {
    await tx.message.deleteMany({ where: { clinicId: CLINIC } });
    await tx.thread.deleteMany({ where: { clinicId: CLINIC } });
    await tx.clinic.deleteMany({ where: { id: CLINIC } });
  });
  await prisma.$disconnect();
});

describe("messaging participant validation (COM-001)", () => {
  it("rejects a thread with an inactive participant and creates nothing", async () => {
    await login("doctor", "msgdoctor");
    const before = await threadCount();
    const res = await request(app)
      .post("/api/v1/threads")
      .set(authHeaders("doctor"))
      .send({ subject: "Inactive check", category: "INTERNAL", participantIds: [ids.inactive], body: "hello" });
    expect(res.status).toBe(422);
    expect(await threadCount()).toBe(before);
  });

  it("rejects a thread referencing a user from another clinic", async () => {
    const res = await request(app)
      .post("/api/v1/threads")
      .set(authHeaders("doctor"))
      .send({ subject: "Cross tenant check", category: "INTERNAL", participantIds: [ids.otherClinic], body: "hello" });
    expect(res.status).toBe(422);
  });

  it("rejects an INTERNAL thread that includes a portal user", async () => {
    const res = await request(app)
      .post("/api/v1/threads")
      .set(authHeaders("doctor"))
      .send({ subject: "Portal in internal", category: "INTERNAL", participantIds: [ids.portal], body: "hello" });
    expect(res.status).toBe(422);
  });

  it("rejects staff without a relationship on a patient thread without consent", async () => {
    const res = await request(app)
      .post("/api/v1/threads")
      .set(authHeaders("doctor"))
      .send({
        subject: "Patient thread",
        category: "PATIENT",
        patientId: ids.p1,
        participantIds: [ids.outsider],
        body: "case discussion",
      });
    expect(res.status).toBe(422);
  });

  it("allows the treating doctor on a patient thread", async () => {
    const res = await request(app)
      .post("/api/v1/threads")
      .set(authHeaders("doctor"))
      .send({
        subject: "Care coordination",
        category: "PATIENT",
        patientId: ids.p1,
        participantIds: [ids.portal],
        body: "your next appointment",
      });
    // The author (doctor) is the primary doctor of the patient; the portal
    // user joins the explicit patient-communication flow.
    expect(res.status).toBe(201);
    expect(res.body.patientId).toBe(ids.p1);
  });

  it("allows staff with the patient's communication consent on a patient thread", async () => {
    await withTenant({ clinicId: CLINIC, actorId: "tester", actorRole: "ADMIN" }, async (tx) => {
      const patient = await tx.patient.create({
        data: { clinicId: CLINIC, internalRef: "P-600002", fullName: "Consent Patient", primaryDoctorId: ids.doctor },
      });
      ids.p2 = patient.id;
      await tx.patientConsent.create({
        data: { clinicId: CLINIC, patientId: patient.id, type: "COMMUNICATION", status: "GRANTED" },
      });
    });
    const res = await request(app)
      .post("/api/v1/threads")
      .set(authHeaders("doctor"))
      .send({
        subject: "Front desk follow-up",
        category: "PATIENT",
        patientId: ids.p2,
        participantIds: [ids.outsider],
        body: "appointment scheduling for the patient",
      });
    // The author is the primary doctor; the outside staff member joins
    // through the patient's granted COMMUNICATION consent (COM-001).
    expect(res.status).toBe(201);
    expect(res.body.patientId).toBe(ids.p2);
  });

  it("allows an internal staff thread between clinic members", async () => {
    const res = await request(app)
      .post("/api/v1/threads")
      .set(authHeaders("doctor"))
      .send({ subject: "Staff coordination", category: "INTERNAL", participantIds: [ids.outsider], body: "handover notes" });
    expect(res.status).toBe(201);
  });
});
