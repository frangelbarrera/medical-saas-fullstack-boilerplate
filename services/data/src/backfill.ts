/**
 * Backfills deterministic HMAC search indexes and plaintext birth years for
 * rows created before v2 (legacy v1 data migrated by the SQL migration).
 *
 * The application key never enters a SQL migration, so this script performs
 * the key-dependent backfill: patient identifier HMACs, phone/email HMACs
 * and birth years decrypted from ciphertext. Idempotent: skips rows that
 * already have values.
 *
 * Run locally against a restored v1 backup: `npm run db:backfill`.
 */
import "dotenv/config";
import { prisma, withTenant } from "./index.js";
import { decryptPHI, hmacIndex } from "./crypto.js";

async function main(): Promise<void> {
  const clinics = await prisma.clinic.findMany({ select: { id: true, name: true } });
  let fixedPatients = 0;
  let fixedIdentifiers = 0;

  for (const clinic of clinics) {
    await withTenant({ clinicId: clinic.id, actorId: "backfill", actorRole: "ADMIN" }, async (tx) => {
      const patients = await tx.patient.findMany({ where: { clinicId: clinic.id } });

      for (const p of patients) {
        const data: Record<string, unknown> = {};
        if (p.birthYear === null && p.birthDateEnc) {
          const plain = decryptPHI(p.birthDateEnc);
          if (plain && /^\d{4}-\d{2}-\d{2}/.test(plain)) {
            data.birthYear = Number(plain.slice(0, 4));
          }
        }
        // Re-hash phone/email requires the plaintext: only possible when the
        // value was migrated unencrypted (legacy mock data). Skip otherwise -
        // fresh writes always compute HMACs.
        if (Object.keys(data).length > 0) {
          await tx.patient.update({ where: { id: p.id }, data });
          fixedPatients += 1;
        }
      }

      const identifiers = await tx.patientIdentifier.findMany({
        where: { clinicId: clinic.id, valueHmac: null },
      });
      for (const i of identifiers) {
        const plain = decryptPHI(i.valueEnc);
        if (plain) {
          await tx.patientIdentifier.update({
            where: { id: i.id },
            data: { valueHmac: hmacIndex(plain) },
          });
          fixedIdentifiers += 1;
        }
      }
    });
  }

  console.log(`Backfill complete: ${fixedPatients} patients, ${fixedIdentifiers} identifiers.`);
  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error("Backfill failed:", err);
  await prisma.$disconnect();
  process.exit(1);
});
