# Runbook: backup and restore

Backups of medical records must be encrypted, immutable, and RESTORED
REGULARLY - an untested backup is not a backup.

## Objectives (adjust to your contracts)

- RPO: at most 15 minutes of data loss (continuous archiving or frequent
  base backups + WAL shipping).
- RTO: at most 4 hours to a fully operational environment.

## Backup

Nightly base backup with WAL archiving (patroni/pgBackRest or managed
PostgreSQL PITR is preferred). Minimal DIY baseline:

```bash
# 1. Base backup (runs as the privileged user, never the app role)
pg_dump --format=custom \
  --dbname "postgresql://postgres:${PGPASSWORD}@db:5432/medical_saas_db" \
  --file "backups/medical_saas_$(date -u +%Y%m%dT%H%M%SZ).dump"

# 2. Encrypt to the backup key (kept OUTSIDE the database host and app env)
age --encrypt --recipient "$BACKUP_PUBLIC_KEY" \
  "backups/medical_saas_$(date -u +%Y%m%dT%H%M%SZ).dump" \
  > "backups/medical_saas_$(date -u +%Y%m%dT%H%M%SZ).dump.age"

# 3. Ship to immutable storage (object lock / WORM bucket) and VERIFY the
#    upload checksum.
```

Retain per your jurisdiction's rules (20 years is a common medical-records
horizon; verify with your cantonal requirements).

## Verification drill tooling

`ops/runbooks/verify-backup.sh` automates the proof that a backup is worth
keeping: it checks the SHA-256 manifest, decrypts the artifact with the
backup key, restores it into a scratch database and runs the audit-chain
verification against the restored copy. Wire it into your scheduler so the
drill runs unattended and alerts on failure.

## Restore drill (run quarterly, at minimum)

```bash
# 1. Restore into a scratch database
createdb --host db --username postgres medical_saas_restore_drill
pg_restore --no-owner --role=medical_app \
  --dbname "postgresql://postgres:${PGPASSWORD}@db:5432/medical_saas_restore_drill" \
  backups/<backup>.dump

# 2. Verify integrity
psql ... -c "SELECT count(*) FROM audit_logs;"
# chain verification against the restored copy:
#   start the app with DATABASE_URL pointing at the drill database and call
#   GET /api/v1/audit/verify - expect { "valid": true }

# 3. Record the drill: date, duration, verification result, gaps found.
```

## Rules

- Backup credentials are separate from application credentials.
- The `ENCRYPTION_KEY` needed to read PHI must be escrowed (two-person rule)
  and NEVER stored next to the backups.
- Document every drill in the operations log; a failed drill is an incident.
