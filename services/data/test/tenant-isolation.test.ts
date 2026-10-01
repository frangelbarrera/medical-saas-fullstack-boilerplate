/**
 * Database-level tenant isolation (SEC-005).
 *
 * Requires a PostgreSQL test database with the v2 migrations applied and the
 * runtime role `medical_app` (see ops/db/init/01-app-role.sql). Skipped when
 * TEST_DATABASE_URL is not reachable so quick loops stay fast.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  prisma,
  withTenant,
  withAuthLookup,
  Repositories,
  authRepo,
} from "@medical/data";

const TEST_URL = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL ?? "";
const CLINIC_A = "clinic-test-a";
const CLINIC_B = "clinic-test-b";

const canConnect = async (): Promise<boolean> => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return true;
  } catch {
    return false;
  }
};

let dbReady = false;

/** Cleanup must run inside each clinic's own tenant context (RLS). */
const cleanClinics = async (): Promise<void> => {
  for (const clinicId of [CLINIC_A, CLINIC_B]) {
    await withTenant({ clinicId, actorId: "tester", actorRole: "ADMIN" }, async (tx) => {
      await tx.clinic.deleteMany({ where: { id: clinicId } });
    }).catch(() => undefined);
  }
};

beforeAll(async () => {
  dbReady = await canConnect();
  if (!dbReady) return;
  await cleanClinics();
});

afterAll(async () => {
  if (dbReady) {
    await cleanClinics();
    await prisma.$disconnect();
  }
});

describe.skipIf(!TEST_URL)("tenant isolation (RLS)", () => {
  it("sees zero patient rows without a tenant context", async () => {
    if (!dbReady) return;
    // The runtime role has no bypass: unset context yields no rows.
    const count = await prisma.patient.count().catch(() => -1);
    expect(count).toBe(0);
  });

  it("writes and reads inside one clinic, and sees nothing from the other", async () => {
    if (!dbReady) return;
    const createClinic = async (id: string) =>
      withTenant({ clinicId: id, actorId: "tester", actorRole: "ADMIN" }, async (tx) => {
        await tx.clinic.upsert({ where: { id }, create: { id, name: `Clinic ${id}` }, update: {} });
      });

    await createClinic(CLINIC_A);
    await createClinic(CLINIC_B);

    const patientA = await withTenant({ clinicId: CLINIC_A, actorId: "tester", actorRole: "ADMIN" }, async (tx) => {
      const repos = new Repositories(tx);
      return repos.patients.create(CLINIC_A, { fullName: "Isolated Patient A", identifiers: [] });
    });

    await withTenant({ clinicId: CLINIC_B, actorId: "tester", actorRole: "ADMIN" }, async (tx) => {
      const repos = new Repositories(tx);
      await repos.patients.create(CLINIC_B, { fullName: "Isolated Patient B", identifiers: [] });
    });

    const visibleToA = await withTenant({ clinicId: CLINIC_A, actorId: "tester", actorRole: "ADMIN" }, (tx) =>
      new Repositories(tx).patients.search(CLINIC_A, { q: "Isolated", page: 1, limit: 10 }),
    );
    expect(visibleToA.items.map((p) => p.fullName)).toEqual(["Isolated Patient A"]);

    const detailFromB = await withTenant({ clinicId: CLINIC_B, actorId: "tester", actorRole: "ADMIN" }, (tx) =>
      new Repositories(tx).patients.findById(CLINIC_B, patientA.id),
    );
    expect(detailFromB).toBeNull();
  });

  it("blocks cross-tenant writes with a database error", async () => {
    if (!dbReady) return;
    await expect(
      withTenant({ clinicId: CLINIC_A, actorId: "tester", actorRole: "ADMIN" }, async (tx) => {
        await tx.patient.create({
          data: {
            id: "cross-tenant-attempt",
            clinicId: CLINIC_B,
            internalRef: "P-999999",
            fullName: "Should Not Exist",
          },
        });
      }),
    ).rejects.toThrowError();
  });

  it("allows the pre-tenant login lookup only via the auth bypass", async () => {
    if (!dbReady) return;
    // Without the bypass the users table is invisible (clinic policy).
    await withTenant({ clinicId: CLINIC_A, actorId: "x", actorRole: "" }, async (tx) => {
      const visible = await tx.user.findMany({ where: { clinicId: CLINIC_B } });
      expect(visible).toHaveLength(0);
    });
    // With the bypass (login path only) the username lookup works.
    const found = await withAuthLookup((tx) => tx.user.findMany({ select: { id: true } }));
    expect(Array.isArray(found)).toBe(true);
  });

  it("refresh tokens rotate atomically and detect replay", async () => {
    if (!dbReady) return;
    // Infrastructure tables are not tenant-scoped: exercise the rotation CAS.
    const user = await withTenant({ clinicId: CLINIC_A, actorId: "tester", actorRole: "ADMIN" }, (tx) =>
      tx.user.create({
        data: {
          clinicId: CLINIC_A,
          username: `rot-test-${Date.now()}`,
          passwordHash: "x",
          fullName: "Rotation Test",
          role: "SECRETARY",
        },
      }),
    );
    const session = await authRepo().createSession(user.id, CLINIC_A, "vitest");
    const raw1 = await authRepo().issueRefreshToken(session.id, user.id, CLINIC_A);

    const rotated = await authRepo().rotateRefreshToken(raw1);
    expect(rotated.status).toBe("rotated");

    const replay = await authRepo().rotateRefreshToken(raw1);
    expect(replay.status).toBe("reused");

    // After reuse detection the whole family is revoked: even the freshly
    // rotated (legitimate) token must be rejected, never rotated again.
    const afterReplay = await authRepo().rotateRefreshToken((rotated as { raw: string }).raw);
    expect(afterReplay.status).not.toBe("rotated");
  });
});
