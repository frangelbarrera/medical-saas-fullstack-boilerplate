/**
 * PHI re-encryption job (KEY-001).
 *
 * Migrates every PHI column to the current primary envelope key. Safe to
 * run during rotation: reads resolve any key version, writes always use the
 * primary, and already-migrated rows are skipped by the envelope prefix.
 *
 * Usage:
 *   npm run phi:reencrypt
 */
import { prisma, withTenant, decryptPHI, encryptPHI, usesPrimaryEnvelope } from "./index.js";

interface MigrationStats {
  clinic: string;
  patients: number;
  identifiers: number;
  totpSecrets: number;
}

const migratePatients = async (clinicId: string): Promise<number> => {
  const rows = await prisma.patient.findMany({
    where: { clinicId },
    select: { id: true, birthDateEnc: true, phoneEnc: true, emailEnc: true, addressEnc: true },
  });
  let migrated = 0;
  for (const row of rows) {
    const stale = [row.birthDateEnc, row.phoneEnc, row.emailEnc, row.addressEnc].some(
      (c) => c !== null && !usesPrimaryEnvelope(c),
    );
    if (!stale) continue;
    await prisma.patient.update({
      where: { id: row.id },
      data: {
        birthDateEnc: usesPrimaryEnvelope(row.birthDateEnc) ? row.birthDateEnc : encryptPHI(decryptPHI(row.birthDateEnc)),
        phoneEnc: usesPrimaryEnvelope(row.phoneEnc) ? row.phoneEnc : encryptPHI(decryptPHI(row.phoneEnc)),
        emailEnc: usesPrimaryEnvelope(row.emailEnc) ? row.emailEnc : encryptPHI(decryptPHI(row.emailEnc)),
        addressEnc: usesPrimaryEnvelope(row.addressEnc) ? row.addressEnc : encryptPHI(decryptPHI(row.addressEnc)),
      },
    });
    migrated += 1;
  }
  return migrated;
};

const migrateIdentifiers = async (clinicId: string): Promise<number> => {
  const rows = await prisma.patientIdentifier.findMany({
    where: { clinicId },
    select: { id: true, valueEnc: true },
  });
  let migrated = 0;
  for (const row of rows) {
    if (usesPrimaryEnvelope(row.valueEnc)) continue;
    await prisma.patientIdentifier.update({
      where: { id: row.id },
      data: { valueEnc: encryptPHI(decryptPHI(row.valueEnc)) ?? "" },
    });
    migrated += 1;
  }
  return migrated;
};

const migrateTotpSecrets = async (clinicId: string): Promise<number> => {
  const rows = await prisma.user.findMany({
    where: { clinicId },
    select: { id: true, totpSecretEnc: true },
  });
  let migrated = 0;
  for (const row of rows) {
    if (!row.totpSecretEnc || usesPrimaryEnvelope(row.totpSecretEnc)) continue;
    await prisma.user.update({
      where: { id: row.id },
      data: { totpSecretEnc: encryptPHI(decryptPHI(row.totpSecretEnc)) },
    });
    migrated += 1;
  }
  return migrated;
};

const run = async (): Promise<void> => {
  const clinics = await prisma.clinic.findMany({ select: { id: true } });
  const stats: MigrationStats[] = [];
  for (const { id } of clinics) {
    // Tenant context keeps RLS satisfied; the decrypt/encrypt pair runs in
    // the process, plaintext never leaves it and is never logged.
    const s = await withTenant({ clinicId: id, actorId: "system", actorRole: "ADMIN" }, async () => ({
      clinic: id,
      patients: await migratePatients(id),
      identifiers: await migrateIdentifiers(id),
      totpSecrets: await migrateTotpSecrets(id),
    }));
    stats.push(s);
  }
  for (const s of stats) {
    console.log(
      `clinic ${s.clinic}: ${s.patients} patients, ${s.identifiers} identifiers, ${s.totpSecrets} TOTP secrets migrated`,
    );
  }
};

run()
  .then(() => prisma.$disconnect())
  .catch(async (err) => {
    console.error("re-encryption failed:", err instanceof Error ? err.message : err);
    await prisma.$disconnect();
    process.exitCode = 1;
  });
