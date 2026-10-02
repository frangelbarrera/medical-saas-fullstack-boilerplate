#!/usr/bin/env bash
# Restore drill (OPS-003): proves backups are restorable, not just taken.
#
# The script restores the latest dump into an ISOLATED database, applies
# consistency checks (row counts, constraints, RLS and PHI decryptability)
# and reports PASS/FAIL. Run it on a schedule; a backup without a passed
# drill is not a backup.
#
# Usage:
#   E2E_ADMIN_URL=... scripts/restore-drill.sh path/to/dump.sql
#
# Checks performed (see scripts/restore-drill-verify.ts):
#   1. schema applies cleanly (migrate deploy on the restored copy),
#   2. per-clinic row counts match the source snapshot manifest,
#   3. row-level security rejects a tenant-less write,
#   4. an encrypted PHI field decrypts with the deployment key.
set -euo pipefail

DUMP_FILE="${1:?usage: restore-drill.sh path/to/dump.sql}"
RESTORE_DB="${RESTORE_DB:-medical_saas_drill}"
ADMIN_URL="${E2E_ADMIN_URL:-postgresql://postgres:local_dev_password@127.0.0.1:55432/postgres}"

cd "$(dirname "$0")/.."

echo "== restore drill: recreate isolated database =="
psql "$ADMIN_URL" -c "DROP DATABASE IF EXISTS ${RESTORE_DB} WITH (FORCE)"
psql "$ADMIN_URL" -c "CREATE DATABASE ${RESTORE_DB}"

echo "== restore drill: apply dump =="
psql "postgresql://postgres@127.0.0.1:55432/${RESTORE_DB}" -v ON_ERROR_STOP=1 -f "$DUMP_FILE"

echo "== restore drill: consistency checks =="
DATABASE_URL="$(echo "$ADMIN_URL" | sed "s|/postgres$|/${RESTORE_DB}|")" npx tsx scripts/restore-drill-verify.ts
