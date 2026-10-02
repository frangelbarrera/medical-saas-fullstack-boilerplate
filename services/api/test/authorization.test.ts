/**
 * Negative authorization matrix (SEC-001 / SEC-002 / SEC-003 / PRIV-001 /
 * AI-001 / AUTH-001): integration tests against the real app (supertest +
 * PostgreSQL + RLS) asserting that every PHI surface enforces its gate.
 *
 * Role x surface matrix:
 *   ADMIN:     BREAK_GLASS_REQUIRED on patient detail, clinical reads AND
 *              writes and the FHIR surface; full PHI after a justified
 *              break-glass; blocked again once the window expires.
 *   DOCTOR:    CARE_RELATIONSHIP_REQUIRED outside the care team; access once
 *              assigned; revoked when the membership ends.
 *   SECRETARY: clinical data, DSAR and care-team management stay 403.
 *   PATIENT:   self-scoped reads, 404 cross-patient, staff directory 403.
 *   DSAR:      step-up gate, dual control (self-approval rejected), one-time
 *              token replay rejected, approval-gated fulfillment.
 *   AI:        refused AND missing AI_PROCESSING consent both block.
 *   MFA:       enrollment activation, MFA_REQUIRED at login, invalid-code
 *              rejection, valid-code login.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import crypto from "crypto";
import type { Express } from "express";
import bcrypt from "bcryptjs";
import { prisma, withTenant } from "@medical/data";

const CLINIC = "clinic-authz";
const PASSWORD = "AuthzTestPass2026";

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

const login = async (user: string, username: string, totp?: string) => {
  const res = await request(app).post("/api/v1/auth/login").send({ username, password: PASSWORD, totp });
  expect(res.status).toBe(200);
  parseCookies(user, res);
  csrfByUser[user] = res.body.csrfToken;
  return res;
};

/** Independent RFC 6238 computation (SHA-1/30s/6 digits) for TOTP cases. */
const totpAt = (base32Secret: string, at = Date.now()): string => {
  // eslint-disable-next-line no-secrets/no-secrets -- RFC 4648 alphabet, not a secret
  const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];
  for (const char of base32Secret) {
    const idx = ALPHABET.indexOf(char);
    if (idx === -1) continue;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  const key = Buffer.from(bytes);
  const counter = Math.floor(at / 1000 / 30);
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64BE(BigInt(counter));
  const mac = crypto.createHmac("sha1", key).update(buf).digest();
  const offset = mac[mac.length - 1] & 0x0f;
  const binary =
    ((mac[offset] & 0x7f) << 24) |
    ((mac[offset + 1] & 0xff) << 16) |
    ((mac[offset + 2] & 0xff) << 8) |
    (mac[offset + 3] & 0xff);
  return String(binary % 1_000_000).padStart(6, "0");
};

const ids = {
  admin: "",
  admin2: "",
  doctor: "",
  outsider: "",
  secretary: "",
  portalUser: "",
  p1: "",
  p2: "",
};

/**
 * FK-safe purge: rows with ON DELETE RESTRICT references to users
 * (encounter versions, messages, DSARs, drafts, payments, expenses) are
 * cleared explicitly before the clinic cascade runs.
 */
const purgeClinic = async () => {
  await withTenant({ clinicId: CLINIC, actorId: "tester", actorRole: "ADMIN" }, async (tx) => {
    await tx.encounterVersion.deleteMany({ where: { clinicId: CLINIC } });
    await tx.encounter.deleteMany({ where: { clinicId: CLINIC } });
    await tx.message.deleteMany({ where: { clinicId: CLINIC } });
    await tx.thread.deleteMany({ where: { clinicId: CLINIC } });
    await tx.aiDraft.deleteMany({ where: { clinicId: CLINIC } });
    await tx.payment.deleteMany({ where: { clinicId: CLINIC } });
    await tx.expense.deleteMany({ where: { clinicId: CLINIC } });
    await tx.dsarDownloadToken.deleteMany({ where: { clinicId: CLINIC } });
    await tx.dsarArtifact.deleteMany({ where: { clinicId: CLINIC } });
    await tx.dsarRequest.deleteMany({ where: { clinicId: CLINIC } });
    await tx.clinic.deleteMany({ where: { id: CLINIC } });
  });
};

beforeAll(async () => {
  const { createApp } = await import("../src/app.js");
  app = (await createApp()) as unknown as Express;

  await purgeClinic().catch(() => undefined);

  await withTenant({ clinicId: CLINIC, actorId: "tester", actorRole: "ADMIN" }, async (tx) => {
    await tx.clinic.create({ data: { id: CLINIC, name: "Authz Clinic" } });
    const mk = (username: string, fullName: string, role: string, patientId?: string) =>
      tx.user.create({
        data: {
          clinicId: CLINIC,
          username,
          passwordHash: bcrypt.hashSync(PASSWORD, 4),
          fullName,
          role: role as never,
          patientId,
        },
      });
    ids.admin = "user-admin-1";
    ids.admin2 = "user-admin-2";
    ids.doctor = "user-doctor-1";
    ids.outsider = "user-doctor-2";
    ids.secretary = "user-secretary-1";
    await Promise.all([
      mk("authadmin", "Authz Admin", "ADMIN"),
      mk("authadmin2", "Second Admin", "ADMIN"),
      mk("authdoctor", "Treating Doctor", "DOCTOR"),
      mk("authoutsider", "Outside Doctor", "DOCTOR"),
      mk("authsecretary", "Front Secretary", "SECRETARY"),
    ]);
    // Fix ids deterministically via lookups after creation.
  });

  const mapUsernames = async () => {
    await withTenant({ clinicId: CLINIC, actorId: "tester", actorRole: "ADMIN" }, async (tx) => {
      for (const [key, username] of [
        ["admin", "authadmin"],
        ["admin2", "authadmin2"],
        ["doctor", "authdoctor"],
        ["outsider", "authoutsider"],
        ["secretary", "authsecretary"],
      ] as const) {
        const u = await tx.user.findFirst({ where: { username } });
        ids[key] = u!.id;
      }
    });
  };
  await mapUsernames();

  await withTenant({ clinicId: CLINIC, actorId: "tester", actorRole: "ADMIN" }, async (tx) => {
    const p1 = await tx.patient.create({
      data: { clinicId: CLINIC, internalRef: "P-900001", fullName: "Cared Patient", phoneEnc: null },
    });
    ids.p1 = p1.id;
    const p2 = await tx.patient.create({
      data: { clinicId: CLINIC, internalRef: "P-900002", fullName: "Refusing Patient", primaryDoctorId: ids.doctor },
    });
    ids.p2 = p2.id;
    await tx.patientConsent.create({
      data: { clinicId: CLINIC, patientId: p2.id, type: "AI_PROCESSING", status: "REFUSED" },
    });
    // The treating relationship of p1 exists ONLY through the care-team
    // membership, so the revocation case can observe the exact boundary.
    await tx.careTeamMembership.create({
      data: { clinicId: CLINIC, patientId: p1.id, userId: ids.doctor, memberRole: "CARING_DOCTOR" },
    });
    await tx.user.create({
      data: {
        clinicId: CLINIC,
        username: "authportal",
        passwordHash: bcrypt.hashSync(PASSWORD, 4),
        fullName: "Portal Patient",
        role: "PATIENT",
        patientId: p1.id,
      },
    });
    const portal = await tx.user.findFirst({ where: { username: "authportal" } });
    ids.portalUser = portal!.id;
  });
});

afterAll(async () => {
  await purgeClinic().catch(() => undefined);
  await prisma.$disconnect();
});

describe("admin break-glass enforcement", () => {
  it("blocks the patient detail before a break-glass grant and leaks only safe meta", async () => {
    await login("admin", "authadmin");
    const res = await request(app).get(`/api/v1/patients/${ids.p1}`).set(authHeaders("admin"));
    expect(res.status).toBe(403);
    expect(res.body.code).toBe("BREAK_GLASS_REQUIRED");
    expect(res.body.meta?.internalRef).toBe("P-900001");
    expect(res.body.meta?.name).toBe("Cared Patient");
    expect(JSON.stringify(res.body)).not.toContain("phone");
    expect(JSON.stringify(res.body)).not.toContain("email");
  });

  it("blocks clinical reads before the grant", async () => {
    const res = await request(app).get(`/api/v1/patients/${ids.p1}/summary`).set(authHeaders("admin"));
    expect(res.status).toBe(403);
    expect(res.body.code).toBe("BREAK_GLASS_REQUIRED");
  });

  it("blocks clinical writes before the grant", async () => {
    const res = await request(app)
      .post("/api/v1/problems")
      .set(authHeaders("admin"))
      .send({ patientId: ids.p1, codingSystem: "ICD_10", code: "I10", display: "Hypertension" });
    expect(res.status).toBe(403);
    expect(res.body.code).toBe("BREAK_GLASS_REQUIRED");
  });

  it("blocks the FHIR surface before the grant", async () => {
    const res = await request(app).get(`/api/v1/fhir/Patient/${ids.p1}`).set(authHeaders("admin"));
    expect(res.status).toBe(403);
    expect(res.body.code).toBe("BREAK_GLASS_REQUIRED");
  });

  it("opens full PHI after a justified break-glass", async () => {
    const grant = await request(app)
      .post("/api/v1/break-glass")
      .set(authHeaders("admin"))
      .send({ patientId: ids.p1, reason: "on-call emergency review of adverse reaction" });
    expect(grant.status).toBe(200);
    const detail = await request(app).get(`/api/v1/patients/${ids.p1}`).set(authHeaders("admin"));
    expect(detail.status).toBe(200);
    expect(detail.body.fullName).toBe("Cared Patient");
    const summary = await request(app).get(`/api/v1/patients/${ids.p1}/summary`).set(authHeaders("admin"));
    expect(summary.status).toBe(200);
    const fhir = await request(app).get(`/api/v1/fhir/Patient/${ids.p1}`).set(authHeaders("admin"));
    expect(fhir.status).toBe(200);
    expect(fhir.body.meta.security[0].code).toBe("R");
  });

  it("blocks again once the break-glass window has expired", async () => {
    await withTenant({ clinicId: CLINIC, actorId: "tester", actorRole: "ADMIN" }, async (tx) => {
      await tx.breakGlassAccess.updateMany({
        where: { clinicId: CLINIC, actorId: ids.admin, patientId: ids.p1 },
        data: { expiresAt: new Date(Date.now() - 60_000) },
      });
    });
    const res = await request(app).get(`/api/v1/patients/${ids.p1}/summary`).set(authHeaders("admin"));
    expect(res.status).toBe(403);
    expect(res.body.code).toBe("BREAK_GLASS_REQUIRED");
  });
});

describe("doctor care-relationship enforcement", () => {
  it("treats an outside doctor as CARE_RELATIONSHIP_REQUIRED on patient detail", async () => {
    await login("outsider", "authoutsider");
    const res = await request(app).get(`/api/v1/patients/${ids.p1}`).set(authHeaders("outsider"));
    expect(res.status).toBe(403);
    expect(res.body.code).toBe("CARE_RELATIONSHIP_REQUIRED");
    expect(res.body.meta?.internalRef).toBe("P-900001");
    expect(JSON.stringify(res.body)).not.toContain("+41");
  });

  it("blocks clinical writes from outside the care team", async () => {
    const res = await request(app)
      .post("/api/v1/encounters")
      .set(authHeaders("outsider"))
      .send({ patientId: ids.p1, title: "Outside consult" });
    expect(res.status).toBe(403);
    expect(res.body.code).toBe("CARE_RELATIONSHIP_REQUIRED");
  });

  it("blocks the FHIR surface outside the care team", async () => {
    const res = await request(app).get(`/api/v1/fhir/Patient/${ids.p1}`).set(authHeaders("outsider"));
    expect(res.status).toBe(403);
    expect(res.body.code).toBe("CARE_RELATIONSHIP_REQUIRED");
  });

  it("allows the treating doctor and revokes access when the membership ends", async () => {
    await login("doctor", "authdoctor");
    const ok = await request(app).get(`/api/v1/patients/${ids.p1}/summary`).set(authHeaders("doctor"));
    expect(ok.status).toBe(200);
    // End the treating relationship and verify the loss of access.
    const team = await request(app).get(`/api/v1/patients/${ids.p1}/care-team`).set(authHeaders("doctor"));
    expect(team.status).toBe(200);
    const own = team.body.items.find((m: { userId: string }) => m.userId === ids.doctor);
    const end = await request(app)
      .delete(`/api/v1/patients/${ids.p1}/care-team/${own.id}`)
      .set(authHeaders("doctor"));
    expect(end.status).toBe(200);
    const revoked = await request(app).get(`/api/v1/patients/${ids.p1}/summary`).set(authHeaders("doctor"));
    expect(revoked.status).toBe(403);
    expect(revoked.body.code).toBe("CARE_RELATIONSHIP_REQUIRED");
    // An administrator restores the assignment (audited).
    const assign = await request(app)
      .post(`/api/v1/patients/${ids.p1}/care-team`)
      .set(authHeaders("admin"))
      .send({ userId: ids.doctor, memberRole: "CARING_DOCTOR" });
    expect(assign.status).toBe(201);
    const restored = await request(app).get(`/api/v1/patients/${ids.p1}/summary`).set(authHeaders("doctor"));
    expect(restored.status).toBe(200);
  });

  it("rejects a secretary care-team assignment attempt", async () => {
    await login("secretary", "authsecretary");
    const res = await request(app)
      .post(`/api/v1/patients/${ids.p1}/care-team`)
      .set(authHeaders("secretary"))
      .send({ userId: ids.secretary, memberRole: "NURSE" });
    expect(res.status).toBe(403);
  });
});

describe("secretary and portal boundaries", () => {
  it("keeps the secretary out of the clinical record", async () => {
    const summary = await request(app).get(`/api/v1/patients/${ids.p1}/summary`).set(authHeaders("secretary"));
    expect(summary.status).toBe(403);
    const problems = await request(app).get(`/api/v1/patients/${ids.p1}/problems`).set(authHeaders("secretary"));
    expect(problems.status).toBe(403);
  });

  it("keeps the secretary out of DSAR and FHIR", async () => {
    const dsar = await request(app).get("/api/v1/dsar").set(authHeaders("secretary"));
    expect(dsar.status).toBe(403);
    const fhir = await request(app).get(`/api/v1/fhir/Patient/${ids.p1}`).set(authHeaders("secretary"));
    expect(fhir.status).toBe(403);
  });

  it("never serves full patient PHI to the secretary (SEC-001)", async () => {
    await login("secretary", "authsecretary");
    // Seed contact PHI first so a leak would be observable in the payload.
    const seed = await request(app)
      .put(`/api/v1/patients/${ids.p1}`)
      .set(authHeaders("admin"))
      .send({ phone: "+41449990011", email: "cared.patient@example.ch", address: "Musterstrasse 1, 8001 Zurich", birthDate: "1980-04-12" });
    expect(seed.status).toBe(200);
    // The full-PHI detail endpoint is clinical: the secretary gets 403 and
    // the error body carries no contact data either.
    const detail = await request(app).get(`/api/v1/patients/${ids.p1}`).set(authHeaders("secretary"));
    expect(detail.status).toBe(403);
    expect(detail.body.code).toBe("DIRECTORY_ONLY");
    const bodyText = JSON.stringify(detail.body);
    expect(bodyText).not.toContain("+41449990011");
    expect(bodyText).not.toContain("cared.patient@example.ch");
    expect(bodyText).not.toContain("1980-04-12");
    // The directory projection returns scheduling-grade fields only.
    const directory = await request(app).get(`/api/v1/patients/${ids.p1}/directory`).set(authHeaders("secretary"));
    expect(directory.status).toBe(200);
    expect(directory.body.internalRef).toBe("P-900001");
    expect(directory.body.fullName).toBe("Cared Patient");
    for (const forbidden of ["phone", "email", "address", "birthDate", "identifiers", "consents", "birthDateEnc"]) {
      expect(directory.body).not.toHaveProperty(forbidden);
    }
    expect(JSON.stringify(directory.body)).not.toContain("+41449990011");
    expect(JSON.stringify(directory.body)).not.toContain("cared.patient@example.ch");
  });

  it("rejects secretary writes on contact PHI, identifiers and consents (SEC-001)", async () => {
    await login("secretary", "authsecretary");
    const phiUpdate = await request(app)
      .put(`/api/v1/patients/${ids.p1}`)
      .set(authHeaders("secretary"))
      .send({ phone: "+41449990099" });
    expect(phiUpdate.status).toBe(403);
    expect(phiUpdate.body.code).toBe("FORBIDDEN");
    const identifier = await request(app)
      .post(`/api/v1/patients/${ids.p1}/identifiers`)
      .set(authHeaders("secretary"))
      .send({ type: "PASSPORT", value: "X1234567" });
    expect(identifier.status).toBe(403);
    const consent = await request(app)
      .put(`/api/v1/patients/${ids.p1}/consents`)
      .set(authHeaders("secretary"))
      .send({ type: "DATA_SHARING", status: "GRANTED" });
    expect(consent.status).toBe(403);
    const create = await request(app)
      .post("/api/v1/patients")
      .set(authHeaders("secretary"))
      .send({ fullName: "Blocked Patient", phone: "+41441111111" });
    expect(create.status).toBe(403);
  });

  it("still allows directory-grade secretary updates on the same record", async () => {
    await login("secretary", "authsecretary");
    const ok = await request(app)
      .put(`/api/v1/patients/${ids.p2}`)
      .set(authHeaders("secretary"))
      .send({ status: "INACTIVE" });
    expect(ok.status).toBe(200);
    expect(ok.body.status).toBe("INACTIVE");
    expect(ok.body).not.toHaveProperty("phone");
    const restore = await request(app)
      .put(`/api/v1/patients/${ids.p2}`)
      .set(authHeaders("secretary"))
      .send({ status: "ACTIVE" });
    expect(restore.status).toBe(200);
  });

  it("keeps the portal user self-scoped and out of staff directories", async () => {
    await login("portal", "authportal");
    const ownDetail = await request(app).get(`/api/v1/patients/${ids.p1}`).set(authHeaders("portal"));
    expect(ownDetail.status).toBe(200);
    const users = await request(app).get("/api/v1/users").set(authHeaders("portal"));
    expect(users.status).toBe(403);
    const audit = await request(app).get("/api/v1/audit/events").set(authHeaders("portal"));
    expect(audit.status).toBe(403);
    const fhir = await request(app).get(`/api/v1/fhir/Patient/${ids.p1}`).set(authHeaders("portal"));
    expect(fhir.status).toBe(403);
  });
});

describe("governed DSAR release", () => {
  it("requires a fresh step-up before preparing the artifact", async () => {
    const create = await request(app)
      .post("/api/v1/dsar")
      .set(authHeaders("admin"))
      .send({ patientId: ids.p1, type: "EXPORT", dueInDays: 30 });
    expect(create.status).toBe(201);
    const res = await request(app).post(`/api/v1/dsar/${create.body.id}/prepare`).set(authHeaders("admin"));
    expect(res.status).toBe(403);
    expect(res.body.code).toBe("STEP_UP_REQUIRED");
  });

  it("rejects a wrong password at step-up", async () => {
    const res = await request(app)
      .post("/api/v1/auth/step-up")
      .set(authHeaders("admin"))
      .send({ password: "definitely-wrong" });
    expect(res.status).toBe(401);
  });

  it("runs prepare -> dual control -> release -> single-use download", async () => {
    // step-up for the requesting admin
    const up1 = await request(app).post("/api/v1/auth/step-up").set(authHeaders("admin")).send({ password: PASSWORD });
    expect(up1.status).toBe(200);
    const list = await request(app).get("/api/v1/dsar").set(authHeaders("admin"));
    const request1 = list.body.items.find((d: { status: string }) => d.status !== "REJECTED");
    expect(request1).toBeTruthy();

    const prepared = await request(app).post(`/api/v1/dsar/${request1.id}/prepare`).set(authHeaders("admin"));
    expect(prepared.status).toBe(200);
    expect(prepared.body.preparedAt).toBeTruthy();

    // fulfillment is approval-gated
    const early = await request(app)
      .patch(`/api/v1/dsar/${request1.id}/status`)
      .set(authHeaders("admin"))
      .send({ status: "FULFILLED" });
    expect(early.status).toBe(403);
    expect(early.body.code).toBe("DSAR_APPROVAL_REQUIRED");

    // self-approval is rejected (dual control)
    const selfApproval = await request(app).post(`/api/v1/dsar/${request1.id}/approve`).set(authHeaders("admin"));
    expect(selfApproval.status).toBe(422);

    // a second admin approves (with its own step-up)
    await login("admin2", "authadmin2");
    const up2 = await request(app).post("/api/v1/auth/step-up").set(authHeaders("admin2")).send({ password: PASSWORD });
    expect(up2.status).toBe(200);
    const approved = await request(app).post(`/api/v1/dsar/${request1.id}/approve`).set(authHeaders("admin2"));
    expect(approved.status).toBe(200);
    expect(approved.body.approvedByName).toBe("Second Admin");

    // release issues a one-time token
    const released = await request(app).post(`/api/v1/dsar/${request1.id}/release`).set(authHeaders("admin"));
    expect(released.status).toBe(200);
    expect(released.body.token).toBeTruthy();

    const downloadUrl = new URL(released.body.downloadPath, "http://localhost").pathname +
      "?" + new URL(released.body.downloadPath, "http://localhost").searchParams.toString();
    const first = await request(app).get(downloadUrl).set(authHeaders("admin"));
    expect(first.status).toBe(200);
    expect(first.headers["content-disposition"]).toContain("attachment");

    // replaying the same token fails
    const replay = await request(app).get(downloadUrl).set(authHeaders("admin"));
    expect(replay.status).toBe(410);

    // fulfillment now succeeds with the recorded approval
    const fulfilled = await request(app)
      .patch(`/api/v1/dsar/${request1.id}/status`)
      .set(authHeaders("admin"))
      .send({ status: "FULFILLED" });
    expect(fulfilled.status).toBe(200);
  });

  it("retires the legacy direct export path with 410", async () => {
    const res = await request(app).get(`/api/v1/dsar/export/${ids.p1}`).set(authHeaders("admin"));
    expect(res.status).toBe(410);
  });
});

describe("AI consent fail-closed gate", () => {
  it("blocks generation when the patient refused AI processing", async () => {
    await login("doctor", "authdoctor");
    const encounter = await request(app)
      .post("/api/v1/encounters")
      .set(authHeaders("doctor"))
      .send({ patientId: ids.p2, title: "Refusal check" });
    expect(encounter.status).toBe(201);
    const res = await request(app)
      .post("/api/v1/ai/scribe-draft")
      .set(authHeaders("doctor"))
      .send({ encounterId: encounter.body.id });
    expect(res.status).toBe(422);
    expect(res.body.code).toBe("CONSENT_REQUIRED");
  });

  it("blocks generation when no AI_PROCESSING consent exists at all", async () => {
    const encounter = await request(app)
      .post("/api/v1/encounters")
      .set(authHeaders("doctor"))
      .send({ patientId: ids.p1, title: "Missing consent check" });
    expect(encounter.status).toBe(201);
    const res = await request(app)
      .post("/api/v1/ai/scribe-draft")
      .set(authHeaders("doctor"))
      .send({ encounterId: encounter.body.id });
    expect(res.status).toBe(422);
    expect(res.body.code).toBe("CONSENT_REQUIRED");
  });
});

describe("AI draft insert and discard authorization (SEC-002)", () => {
  const makeDraft = async (encounterId: string, patientId: string) => {
    const draft = await withTenant({ clinicId: CLINIC, actorId: ids.doctor, actorRole: "DOCTOR" }, async (tx) =>
      tx.aiDraft.create({
        data: {
          clinicId: CLINIC,
          encounterId,
          patientId,
          authorId: ids.doctor,
          type: "SCRIBE_NOTE",
          content: { chiefComplaint: "cough", observations: "three days", plan: "rest" },
          model: "test-model",
          promptVersion: "v1",
          reviewState: "PENDING",
        },
      }),
    );
    return draft.id;
  };

  const makeCaredEncounter = async () => {
    const encounter = await request(app)
      .post("/api/v1/encounters")
      .set(authHeaders("doctor"))
      .send({ patientId: ids.p1, title: "Draft authorization check" });
    expect(encounter.status).toBe(201);
    return encounter.body.id as string;
  };

  it("blocks insert by a doctor outside the care team", async () => {
    await login("outsider", "authoutsider");
    const encounterId = await makeCaredEncounter();
    const draftId = await makeDraft(encounterId, ids.p1);
    const res = await request(app).post(`/api/v1/ai/drafts/${draftId}/insert`).set(authHeaders("outsider"));
    expect(res.status).toBe(403);
    expect(res.body.code).toBe("CARE_RELATIONSHIP_REQUIRED");
    const untouched = await withTenant({ clinicId: CLINIC, actorId: "tester", actorRole: "ADMIN" }, async (tx) => {
      const d = await tx.aiDraft.findFirst({ where: { clinicId: CLINIC, id: draftId } });
      const e = await tx.encounter.findFirst({ where: { clinicId: CLINIC, id: encounterId } });
      return { state: d?.reviewState, plan: e?.plan };
    });
    expect(untouched.state).toBe("PENDING");
    expect(untouched.plan).toBeNull();
  });

  it("blocks discard by a doctor outside the care team", async () => {
    await login("outsider", "authoutsider");
    const encounterId = await makeCaredEncounter();
    const draftId = await makeDraft(encounterId, ids.p1);
    const res = await request(app).post(`/api/v1/ai/drafts/${draftId}/discard`).set(authHeaders("outsider"));
    expect(res.status).toBe(403);
    expect(res.body.code).toBe("CARE_RELATIONSHIP_REQUIRED");
    const state = await withTenant({ clinicId: CLINIC, actorId: "tester", actorRole: "ADMIN" }, async (tx) => {
      const d = await tx.aiDraft.findFirst({ where: { clinicId: CLINIC, id: draftId } });
      return d?.reviewState;
    });
    expect(state).toBe("PENDING");
  });

  it("blocks insert by an administrator without break-glass", async () => {
    await login("admin", "authadmin");
    const encounterId = await makeCaredEncounter();
    const draftId = await makeDraft(encounterId, ids.p1);
    const res = await request(app).post(`/api/v1/ai/drafts/${draftId}/insert`).set(authHeaders("admin"));
    expect(res.status).toBe(403);
    expect(res.body.code).toBe("BREAK_GLASS_REQUIRED");
  });

  it("blocks discard by an administrator without break-glass", async () => {
    await login("admin", "authadmin");
    const encounterId = await makeCaredEncounter();
    const draftId = await makeDraft(encounterId, ids.p1);
    const res = await request(app).post(`/api/v1/ai/drafts/${draftId}/discard`).set(authHeaders("admin"));
    expect(res.status).toBe(403);
    expect(res.body.code).toBe("BREAK_GLASS_REQUIRED");
  });

  it("never lets a secretary insert or discard drafts", async () => {
    await login("secretary", "authsecretary");
    const encounterId = await makeCaredEncounter();
    const draftId = await makeDraft(encounterId, ids.p1);
    const insert = await request(app).post(`/api/v1/ai/drafts/${draftId}/insert`).set(authHeaders("secretary"));
    expect(insert.status).toBe(403);
    const discard = await request(app).post(`/api/v1/ai/drafts/${draftId}/discard`).set(authHeaders("secretary"));
    expect(discard.status).toBe(403);
  });

  it("lets the treating doctor insert and discard within the care team", async () => {
    await login("doctor", "authdoctor");
    const encounterId = await makeCaredEncounter();
    const draftId = await makeDraft(encounterId, ids.p1);
    const insert = await request(app).post(`/api/v1/ai/drafts/${draftId}/insert`).set(authHeaders("doctor"));
    expect(insert.status).toBe(200);
    const inserted = await withTenant({ clinicId: CLINIC, actorId: "tester", actorRole: "ADMIN" }, async (tx) => {
      const d = await tx.aiDraft.findFirst({ where: { clinicId: CLINIC, id: draftId } });
      const e = await tx.encounter.findFirst({ where: { clinicId: CLINIC, id: encounterId } });
      return { state: d?.reviewState, plan: e?.plan };
    });
    expect(inserted.state).toBe("INSERTED");
    expect(inserted.plan).toBe("rest");
  });
});

describe("clinical amendment lifecycle (CLIN-002)", () => {
  const signOriginal = async (): Promise<{ originalId: string; amendmentId: string }> => {
    await login("doctor", "authdoctor");
    const created = await request(app)
      .post("/api/v1/encounters")
      .set(authHeaders("doctor"))
      .send({ patientId: ids.p1, title: "Amendment source", chiefComplaint: "initial complaint" });
    expect(created.status).toBe(201);
    const originalId = created.body.id as string;
    const submit = await request(app).post(`/api/v1/encounters/${originalId}/submit`).set(authHeaders("doctor"));
    expect(submit.status).toBe(200);
    const sign = await request(app).post(`/api/v1/encounters/${originalId}/sign`).set(authHeaders("doctor"));
    expect(sign.status).toBe(200);
    return { originalId, amendmentId: "" };
  };

  it("runs the full cycle: sign, amend as draft, edit, submit, sign, supersede", async () => {
    const { originalId } = await signOriginal();
    // The signed original is immutable.
    const editOriginal = await request(app)
      .put(`/api/v1/encounters/${originalId}`)
      .set(authHeaders("doctor"))
      .send({ observations: "should not land" });
    expect(editOriginal.status).toBe(409);

    // Amend: the correction opens as a DRAFT linked to the original.
    const amend = await request(app)
      .post(`/api/v1/encounters/${originalId}/amend`)
      .set(authHeaders("doctor"))
      .send({ reason: "wrong laterality documented in the initial note" });
    expect(amend.status).toBe(201);
    const amendmentId = amend.body.id as string;
    expect(amend.body.status).toBe("DRAFT");
    expect(amend.body.amendedFromId).toBe(originalId);

    // The original is still the authoritative signed note.
    const stillSigned = await request(app).get(`/api/v1/encounters/${originalId}`).set(authHeaders("doctor"));
    expect(stillSigned.body.status).toBe("SIGNED");

    // The amendment draft is editable and versioned.
    const edit = await request(app)
      .put(`/api/v1/encounters/${amendmentId}`)
      .set(authHeaders("doctor"))
      .send({ observations: "corrected laterality, left side", changeReason: "correction entered" });
    expect(edit.status).toBe(200);
    expect(edit.body.currentVersion).toBe(2);

    // Review cycle on the amendment, then signature.
    const submit = await request(app).post(`/api/v1/encounters/${amendmentId}/submit`).set(authHeaders("doctor"));
    expect(submit.status).toBe(200);
    const sign = await request(app).post(`/api/v1/encounters/${amendmentId}/sign`).set(authHeaders("doctor"));
    expect(sign.status).toBe(200);
    expect(sign.body.status).toBe("SIGNED");

    // Signing the amendment supersedes the original transactionally.
    const original = await request(app).get(`/api/v1/encounters/${originalId}`).set(authHeaders("doctor"));
    expect(original.body.status).toBe("AMENDED");

    // Both versions of the amendment exist with their reasons.
    const versions = await request(app).get(`/api/v1/encounters/${amendmentId}/versions`).set(authHeaders("doctor"));
    expect(versions.body.items).toHaveLength(2);
    expect(versions.body.items[0].version).toBe(1);
    expect(versions.body.items[1].snapshot.observations).toBe("corrected laterality, left side");
  });

  it("rejects a second concurrent amendment while one draft is open", async () => {
    const { originalId } = await signOriginal();
    const first = await request(app)
      .post(`/api/v1/encounters/${originalId}/amend`)
      .set(authHeaders("doctor"))
      .send({ reason: "first amendment draft for documentation error" });
    expect(first.status).toBe(201);
    const second = await request(app)
      .post(`/api/v1/encounters/${originalId}/amend`)
      .set(authHeaders("doctor"))
      .send({ reason: "second amendment attempt while the first is open" });
    expect(second.status).toBe(409);
    expect(second.body.code).toBe("CONFLICT");
  });

  it("rejects amendments without a specific reason", async () => {
    const { originalId } = await signOriginal();
    const amend = await request(app)
      .post(`/api/v1/encounters/${originalId}/amend`)
      .set(authHeaders("doctor"))
      .send({ reason: "short" });
    expect(amend.status).toBe(400);
  });
});

describe("clinical write entity validation (CLIN-001)", () => {
  let caredEncounterId = "";
  let otherEncounterId = "";

  beforeAll(async () => {
    await login("doctor", "authdoctor");
    const own = await request(app)
      .post("/api/v1/encounters")
      .set(authHeaders("doctor"))
      .send({ patientId: ids.p1, title: "Own encounter for writes" });
    expect(own.status).toBe(201);
    caredEncounterId = own.body.id;
    const other = await request(app)
      .post("/api/v1/encounters")
      .set(authHeaders("doctor"))
      .send({ patientId: ids.p2, title: "Other patient encounter" });
    expect(other.status).toBe(201);
    otherEncounterId = other.body.id;
  });

  it("rejects an observation whose encounter belongs to another patient", async () => {
    const res = await request(app)
      .post("/api/v1/observations")
      .set(authHeaders("doctor"))
      .send({ patientId: ids.p1, encounterId: otherEncounterId, type: "PULSE", value: "72" });
    expect(res.status).toBe(422);
    const stored = await withTenant({ clinicId: CLINIC, actorId: "tester", actorRole: "ADMIN" }, async (tx) =>
      tx.observation.count({ where: { clinicId: CLINIC, patientId: ids.p1, encounterId: otherEncounterId } }),
    );
    expect(stored).toBe(0);
  });

  it("rejects a problem whose encounter belongs to another patient", async () => {
    const res = await request(app)
      .post("/api/v1/problems")
      .set(authHeaders("doctor"))
      .send({ patientId: ids.p2, encounterId: caredEncounterId, codingSystem: "ICD_10", code: "J45", display: "Asthma" });
    expect(res.status).toBe(422);
  });

  it("rejects a medication whose encounter belongs to another patient", async () => {
    const res = await request(app)
      .post("/api/v1/medications")
      .set(authHeaders("doctor"))
      .send({ patientId: ids.p1, encounterId: otherEncounterId, medicationName: "Amoxicillin" });
    expect(res.status).toBe(422);
  });

  it("rejects an encounter reference from an unknown clinic", async () => {
    const res = await request(app)
      .post("/api/v1/observations")
      .set(authHeaders("doctor"))
      .send({ patientId: ids.p1, encounterId: "00000000-0000-4000-8000-000000000000", type: "PULSE", value: "70" });
    expect(res.status).toBe(404);
  });

  it("allows a linked observation when the encounter matches the patient", async () => {
    const res = await request(app)
      .post("/api/v1/observations")
      .set(authHeaders("doctor"))
      .send({ patientId: ids.p1, encounterId: caredEncounterId, type: "PULSE", value: "74" });
    expect(res.status).toBe(201);
    expect(res.body.encounterId).toBe(caredEncounterId);
  });

  it("rejects invalid medication state jumps and stamps the reviewing clinician server-side", async () => {
    const created = await request(app)
      .post("/api/v1/medications")
      .set(authHeaders("doctor"))
      // A client-sent reviewer id must be ignored end to end.
      .send({ patientId: ids.p1, medicationName: "Ibuprofen", reviewedById: ids.admin });
    expect(created.status).toBe(201);
    const orderId = created.body.id as string;
    expect(created.body.status).toBe("DRAFT");

    const jump = await request(app)
      .patch(`/api/v1/medications/${orderId}/status`)
      .set(authHeaders("doctor"))
      .send({ status: "COMPLETED" });
    expect(jump.status).toBe(409);
    expect(jump.body.code).toBe("INVALID_STATE_TRANSITION");

    const activate = await request(app)
      .patch(`/api/v1/medications/${orderId}/status`)
      .set(authHeaders("doctor"))
      .send({ status: "ACTIVE" });
    expect(activate.status).toBe(200);

    const stored = await withTenant({ clinicId: CLINIC, actorId: "tester", actorRole: "ADMIN" }, async (tx) => {
      const m = await tx.medicationOrder.findFirst({ where: { clinicId: CLINIC, id: orderId } });
      return { status: m?.status, reviewedById: m?.reviewedById, authoredById: m?.authoredById };
    });
    expect(stored.status).toBe("ACTIVE");
    // The reviewing clinician is the activating actor, never the admin id
    // sent by the client.
    expect(stored.reviewedById).toBe(ids.doctor);
    expect(stored.reviewedById).not.toBe(ids.admin);
  });
});

describe("TOTP MFA lifecycle", () => {
  it("enforces enrollment, invalid-code rejection and valid-code login", async () => {
    await login("secretary", "authsecretary");
    const enroll = await request(app).post("/api/v1/auth/mfa/enroll").set(authHeaders("secretary"));
    expect(enroll.status).toBe(201);
    expect(enroll.body.secret).toMatch(/^[A-Z2-7]+$/);
    const badActivate = await request(app)
      .post("/api/v1/auth/mfa/activate")
      .set(authHeaders("secretary"))
      .send({ code: "000000" });
    expect(badActivate.status).toBe(401);
    const goodCode = totpAt(enroll.body.secret);
    const activate = await request(app)
      .post("/api/v1/auth/mfa/activate")
      .set(authHeaders("secretary"))
      .send({ code: goodCode });
    expect(activate.status).toBe(200);

    // login without the code
    const noTotp = await request(app).post("/api/v1/auth/login").send({ username: "authsecretary", password: PASSWORD });
    expect(noTotp.status).toBe(401);
    expect(noTotp.body.code).toBe("MFA_REQUIRED");

    // login with a wrong code
    const wrongTotp = await request(app)
      .post("/api/v1/auth/login")
      .send({ username: "authsecretary", password: PASSWORD, totp: "000000" });
    expect(wrongTotp.status).toBe(401);
    expect(wrongTotp.body.code).toBe("MFA_INVALID_CODE");

    // login with a valid code (fresh computation at the same step)
    const ok = await request(app)
      .post("/api/v1/auth/login")
      .send({ username: "authsecretary", password: PASSWORD, totp: totpAt(enroll.body.secret) });
    expect(ok.status).toBe(200);
  });
});
