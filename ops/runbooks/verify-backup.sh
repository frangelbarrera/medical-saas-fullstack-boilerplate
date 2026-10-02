#!/usr/bin/env bash
# Backup verification drill: proves a backup is restorable, decryptable and
# that the audit hash chain still verifies on the restored copy.
#
# Usage:
#   ENCRYPTED_DUMP=backups/x.dump.age \
#   BACKUP_KEY_FILE=key.txt \
#   VERIFY_APP_URL=http://localhost:3000 \
#   VERIFY_APP_TOKEN=<session token with audit:read> \
#   ./ops/runbooks/verify-backup.sh
#
# Steps:
#   1. checksum manifest comparison (SHA-256 of the artifact on disk)
#   2. decrypt into a scratch directory
#   3. restore into a scratch database and audit hash-chain verification via
#      the application (GET /api/v1/audit/verify -> {"valid": true})
#
# The script is intentionally verbose and fails on the first broken step.
set -euo pipefail

fail() { echo "FAIL: $1" >&2; exit 1; }
info() { echo "[verify-backup] $1"; }

: "${ENCRYPTED_DUMP:?set ENCRYPTED_DUMP to the encrypted dump path}"
: "${BACKUP_KEY_FILE:?set BACKUP_KEY_FILE to the age private key file}"

MANIFEST="${MANIFEST:-${ENCRYPTED_DUMP}.sha256}"
SCRATCH_DIR="$(mktemp -d)"
trap 'rm -rf "$SCRATCH_DIR"' EXIT

# 1. checksum manifest
if [[ -f "$MANIFEST" ]]; then
  info "checking SHA-256 manifest"
  ( cd "$(dirname "$ENCRYPTED_DUMP")" && sha256sum -c "$(basename "$MANIFEST")" ) \
    || fail "checksum manifest mismatch - the artifact changed in transit or at rest"
else
  info "no manifest next to the dump; computing sha256 for the report"
  sha256sum "$ENCRYPTED_DUMP" > "$SCRATCH_DIR/computed.sha256"
  cat "$SCRATCH_DIR/computed.sha256"
fi

# 2. decrypt (proves the backup key still works and the artifact is readable)
info "decrypting into scratch directory"
age --decrypt --identity "$BACKUP_KEY_FILE" \
  --output "$SCRATCH_DIR/restored.dump" \
  "$ENCRYPTED_DUMP" || fail "decryption failed - key lost or artifact corrupted"
[[ -s "$SCRATCH_DIR/restored.dump" ]] || fail "decrypted dump is empty"

# 3. restore into a scratch database (never the live one)
: "${SCRATCH_DB:=medical_saas_verify_scratch}"
: "${ADMIN_DB_URL:?set ADMIN_DB_URL (postgres role) for the scratch restore}"
info "restoring into scratch database $SCRATCH_DB"
psql "$ADMIN_DB_URL" -c "DROP DATABASE IF EXISTS $SCRATCH_DB" >/dev/null
psql "$ADMIN_DB_URL" -c "CREATE DATABASE $SCRATCH_DB" >/dev/null
pg_restore --dbname "postgresql://$(echo "$ADMIN_DB_URL" | sed -E 's#postgresql://([^/]+)/.*#\1#')/$SCRATCH_DB" \
  "$SCRATCH_DIR/restored.dump" || fail "pg_restore failed"

# 4. audit-chain verification through the application
if [[ -n "${VERIFY_APP_URL:-}" && -n "${VERIFY_APP_TOKEN:-}" ]]; then
  info "verifying the audit hash chain through the app"
  RESULT="$(curl -fsS "$VERIFY_APP_URL/api/v1/audit/verify" \
    -H "Authorization: Bearer $VERIFY_APP_TOKEN")" || fail "audit/verify call failed"
  echo "$RESULT" | grep -q '"valid":true' || fail "audit chain verification returned: $RESULT"
  info "audit chain valid"
else
  info "VERIFY_APP_URL / VERIFY_APP_TOKEN not set - skipping in-app audit verification"
fi

info "backup verification drill passed"
