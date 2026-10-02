/**
 * Audit WORM batch export (AUD-001).
 *
 * Exports one clinic's audit trail as a canonical JSONL batch plus a signed
 * manifest. The manifest carries the batch hash and an HMAC signature made
 * with AUDIT_EXPORT_KEY, so an external WORM/blob store can be verified
 * independently from the database (a database administrator cannot erase a
 * row and stay consistent with the exported batch).
 *
 * Usage:
 *   npm run audit:export -- --clinic <clinicId> --out <dir>
 *
 * Schedule the command (cron) and push the produced files to immutable
 * storage; see ops/runbooks/audit-export.md for retention guidance.
 */
import { argv, exit } from "process";
import fs from "fs";
import path from "path";
import crypto from "crypto";

const arg = (name: string): string | undefined => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : undefined;
};

const clinicId = arg("clinic");
const outDir = arg("out") ?? "./audit-exports";
const key = process.env.AUDIT_EXPORT_KEY ?? "";

if (!clinicId) {
  console.error("usage: npm run audit:export -- --clinic <clinicId> --out <dir>");
  exit(2);
}
if (key.length < 16) {
  console.error("AUDIT_EXPORT_KEY must be set (at least 16 characters) to sign the batch");
  exit(2);
}

const { PrismaClient } = await import("@prisma/client");
const prisma = new PrismaClient();

try {
  const rows = await prisma.auditLog.findMany({
    where: { clinicId },
    orderBy: { chainIndex: "asc" },
    select: {
      seq: true,
      chainIndex: true,
      action: true,
      category: true,
      actorId: true,
      actorRole: true,
      subjectPatientId: true,
      target: true,
      purpose: true,
      details: true,
      createdAt: true,
      prevHash: true,
      hash: true,
    },
  });

  // Canonical line order: chain index ascending, stable JSON serialization.
  const lines = rows.map((r) =>
    JSON.stringify({
      chainIndex: r.chainIndex,
      seq: r.seq,
      action: r.action,
      category: r.category,
      actorId: r.actorId,
      actorRole: r.actorRole,
      subjectPatientId: r.subjectPatientId,
      target: r.target,
      purpose: r.purpose,
      details: r.details,
      createdAt: r.createdAt.toISOString(),
      prevHash: r.prevHash,
      hash: r.hash,
    }),
  );
  const batchHash = crypto.createHash("sha256").update(lines.join("\n")).digest("hex");
  const signature = crypto.createHmac("sha256", key).update(batchHash).digest("hex");
  const exportedAt = new Date().toISOString();

  const manifest = {
    clinicId,
    exportedAt,
    count: rows.length,
    firstChainIndex: rows[0]?.chainIndex ?? null,
    lastChainIndex: rows[rows.length - 1]?.chainIndex ?? null,
    firstSeq: rows[0]?.seq ?? null,
    lastSeq: rows[rows.length - 1]?.seq ?? null,
    batchHash,
    signature,
    algorithm: "sha256+hmac-sha256",
  };

  fs.mkdirSync(outDir, { recursive: true });
  const stamp = exportedAt.replace(/[:.]/g, "-");
  const dataFile = path.join(outDir, `audit-${clinicId}-${stamp}.jsonl`);
  const manifestFile = path.join(outDir, `audit-${clinicId}-${stamp}.manifest.json`);
  fs.writeFileSync(dataFile, lines.join("\n") + (lines.length ? "\n" : ""));
  fs.writeFileSync(manifestFile, JSON.stringify(manifest, null, 2) + "\n");

  console.log(`exported ${rows.length} events to ${dataFile}`);
  console.log(`manifest written to ${manifestFile}`);
  console.log(`batchHash: ${batchHash}`);
} finally {
  await prisma.$disconnect();
}
