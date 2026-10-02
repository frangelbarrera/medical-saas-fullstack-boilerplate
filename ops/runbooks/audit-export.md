# Audit WORM export runbook

Status: operational procedure for the hash-chain export (ADR-011). The
export is the tamper-evidence that survives a hostile database
administrator: batches are HMAC-signed and verifiable without the
database.

## Why

The per-clinic hash chain plus the chain-index continuity check detects
tampering inside PostgreSQL. An administrator could still delete rows and
recompute the tail. A signed batch exported to immutable storage keeps an
independent copy: any later database that disagrees with the batch is
compromised.

## Export

```bash
export AUDIT_EXPORT_KEY=<operator key, 16+ chars>
npm run audit:export -- --clinic <clinicId> --out /var/spool/audit-exports
```

Produces a JSONL batch and a manifest: `batchHash` (SHA-256 over the
canonical lines) and `signature` (HMAC-SHA256 over the hash). Both files
go to the WORM/blob target (S3 Object Lock, immutable bucket, or tape).

## Schedule

- Daily incremental export after the nightly backup window.
- The job runs as an operator account with database read access only;
  the export key lives in the operator's secret store, not in the app.

## Verify (independent machine or auditor)

```bash
AUDIT_EXPORT_KEY=<operator key> npm run audit:verify -- \
  --data audit-<clinicId>-<stamp>.jsonl \
  --manifest audit-<clinicId>-<stamp>.manifest.json
```

Verification needs only the files and the key - no database access.

## Retention

Follow the jurisdiction rows in `docs/compliance/records-retention-matrix.md`.
Export BEFORE any expiry-driven deletion; the deletion decision and the
operator are audited.

## Incident use

If chain verification (`GET /api/v1/audit/verify`) reports `valid: false`
or `continuityValid: false`:

1. Freeze the audit table (revoke write access).
2. Compare the current chain against the latest verified WORM batch.
3. Escalate per `ops/runbooks/incident-response.md`.
