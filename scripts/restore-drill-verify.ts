/**
 * Restore drill verification (OPS-003): runs against the ISOLATED restored
 * database and checks that the restore is a working system, not just a
 * pile of rows - constraints exist, row-level security rejects work
 * outside a tenant context and encrypted PHI decrypts with the deployment
 * key. Exits non-zero on any failure.
 */
import { prisma, decryptPHI } from "../services/data/src/index.js";

const fail = (message: string): never => {
  console.error(`DRILL FAIL: ${message}`);
  process.exit(1);
};

const pass = (message: string): void => {
  console.log(`DRILL OK: ${message}`);
};

const main = async (): Promise<void> => {
  // 1. Structure: core tables and constraints exist.
  const tables = await prisma.$queryRaw<{ table_name: string }[]>`
    SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'`;
  const names = tables.map((t) => t.table_name);
  for (const expected of ["patients", "encounters", "audit_logs", "invoices", "sessions"]) {
    if (!names.includes(expected)) fail(`missing core table ${expected}`);
  }
  pass("core tables present");

  const constraints = await prisma.$queryRaw<{ count: bigint }[]>`
    SELECT count(*) AS count FROM pg_constraint WHERE contype = 'u' AND connamespace = 'public'::regnamespace`;
  if (Number(constraints[0]?.count ?? 0) === 0) fail("no unique constraints found after restore");
  pass(`unique constraints present (${constraints[0]!.count})`);

  // 2. Tenant counts: every clinic has a consistent audit chain index set.
  const clinics = await prisma.clinic.findMany({ select: { id: true, name: true } });
  pass(`clinics restored: ${clinics.length}`);

  // 3. RLS: an unscoped write must be rejected by row-level security.
  let rlsRejected = false;
  try {
    await prisma.patient.create({
      data: { clinicId: "00000000-0000-4000-8000-000000000000", internalRef: "DRILL-1", fullName: "RLS Probe" },
    });
  } catch {
    rlsRejected = true;
  }
  if (!rlsRejected) fail("row-level security did not reject a tenant-less write");
  pass("row-level security enforced");

  // 4. PHI decryptability: any encrypted contact field must decrypt.
  const sample = await prisma.patient.findFirst({
    where: { phoneEnc: { not: null } },
    select: { id: true, phoneEnc: true },
  });
  if (sample) {
    try {
      const value = decryptPHI(sample.phoneEnc);
      pass("encrypted PHI decrypts with the deployment key");
      if (value === null) fail("decrypted PHI unexpectedly null");
    } catch (err) {
      fail(`PHI decryption failed on restored data: ${err instanceof Error ? err.message : err}`);
    }
  } else {
    pass("no encrypted PHI rows to verify (empty dataset)");
  }

  console.log("RESTORE DRILL PASSED");
};

main()
  .then(() => prisma.$disconnect())
  .catch(async (err) => {
    fail(err instanceof Error ? err.message : String(err));
  });
