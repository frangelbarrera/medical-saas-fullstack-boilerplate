/**
 * WORM tamper-evident audit logging with SHA-256 hash chain.
 *
 * Each entry's hash is SHA-256(prev_hash || JSON.stringify(entry_data)).
 * Verification: walk the chain and recompute hashes; any tampering breaks it.
 *
 * NOTE: The hash chain is in-memory for the mock DB. In production with Prisma,
 * the chain persists in the audit_logs table (prev_hash + hash columns).
 */
import crypto from "crypto";
import { mockAuditLogs } from "../config.js";

let lastLogHash = crypto.createHash("sha256").update("GENESIS_BLOCK").digest("hex");

export interface AuditLogEntry {
  id: string;
  clinic_id: string;
  user_id: string;
  user_name: string;
  action: string;
  target: string;
  type: string;
  details?: any;
}

export const appendAuditLog = (logData: AuditLogEntry) => {
  const timestamp = new Date().toISOString();
  const dataString = JSON.stringify({ ...logData, timestamp });
  const currentHash = crypto
    .createHash("sha256")
    .update(lastLogHash + dataString)
    .digest("hex");

  const sealedLog = {
    ...logData,
    timestamp,
    hash: currentHash,
    prevHash: lastLogHash,
  };

  lastLogHash = currentHash;
  mockAuditLogs.push(sealedLog);
  return sealedLog;
};

// Reset the hash chain (used by tests to get a clean state).
export const _resetAuditChainForTests = () => {
  lastLogHash = crypto.createHash("sha256").update("GENESIS_BLOCK").digest("hex");
  mockAuditLogs.length = 0;
};
