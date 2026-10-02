/**
 * Independent audit batch verification (AUD-001).
 *
 * Recomputes the hash of an exported JSONL batch and its HMAC signature
 * from the manifest. Runs WITHOUT database access so a third party (auditor,
 * DPO) can verify an exported batch against immutable storage.
 *
 * Usage:
 *   npm run audit:verify -- --data <batch.jsonl> --manifest <manifest.json>
 */
import { argv, exit } from "process";
import fs from "fs";
import crypto from "crypto";

const arg = (name: string): string | undefined => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : undefined;
};

const dataFile = arg("data");
const manifestFile = arg("manifest");
const key = process.env.AUDIT_EXPORT_KEY ?? "";

if (!dataFile || !manifestFile) {
  console.error("usage: npm run audit:verify -- --data <batch.jsonl> --manifest <manifest.json>");
  exit(2);
}
if (key.length < 16) {
  console.error("AUDIT_EXPORT_KEY must be set to verify the batch signature");
  exit(2);
}

const lines = fs.readFileSync(dataFile, "utf8").split("\n").filter((l) => l.length > 0);
const manifest = JSON.parse(fs.readFileSync(manifestFile, "utf8")) as {
  count: number;
  batchHash: string;
  signature: string;
  clinicId: string;
};

const batchHash = crypto.createHash("sha256").update(lines.join("\n")).digest("hex");
const signature = crypto.createHmac("sha256", key).update(batchHash).digest("hex");

const hashOk = batchHash === manifest.batchHash;
const signatureOk = crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(manifest.signature));
const countOk = lines.length === manifest.count;

if (hashOk && signatureOk && countOk) {
  console.log(`batch verified: ${manifest.count} events for clinic ${manifest.clinicId}`);
  exit(0);
}
console.error("batch verification FAILED", { hashOk, signatureOk, countOk, lines: lines.length, manifestCount: manifest.count });
exit(1);
