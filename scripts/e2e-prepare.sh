#!/usr/bin/env bash
# Prepares the dedicated E2E database: create (if needed), reset, migrate and
# seed. Used by `npm run test:e2e` and by CI before Playwright.
#
# Required environment:
#   E2E_ADMIN_URL - privileged URL used for schema work (default: local dev)
#   E2E_APP_URL   - runtime URL of the medical_app role
set -euo pipefail

E2E_ADMIN_URL="${E2E_ADMIN_URL:-postgresql://postgres@127.0.0.1:55432/medical_saas_e2e?schema=public}"
E2E_APP_URL="${E2E_APP_URL:-postgresql://medical_app:local_dev_password@127.0.0.1:55432/medical_saas_e2e?schema=public}"
E2E_DB="${E2E_DB:-medical_saas_e2e}"
ADMIN_SERVER_URL="${E2E_ADMIN_URL%%/${E2E_DB}*}/postgres"

cd "$(dirname "$0")/.."

echo "== e2e: ensure database =="
psql_create() {
  echo "SELECT 'CREATE DATABASE ${E2E_DB}' WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = '${E2E_DB}')\\gexec" \
    | DATABASE_URL="$ADMIN_SERVER_URL" npx prisma db execute --stdin --schema services/data/prisma/schema.prisma --url "$ADMIN_SERVER_URL"
}
psql_create || echo "(database may already exist)"

echo "== e2e: reset + migrate =="
DATABASE_URL="$E2E_ADMIN_URL" npx prisma migrate reset --force --skip-generate --schema services/data/prisma/schema.prisma

echo "== e2e: seed synthetic data =="
# The seed must encrypt PHI with the SAME keys the e2e server will use
# (see playwright.config.ts webServer env).
SEED_CLINIC_ID=clinic_default \
SEED_PASSWORD=E2eStaffPass2026 \
ENCRYPTION_KEY="1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef" \
PHI_HMAC_KEY="fedcba0987654321fedcba0987654321fedcba0987654321fedcba0987654321" \
DATABASE_URL="$E2E_ADMIN_URL" \
  npx tsx services/data/src/seed.ts

echo "== e2e: ready (server will connect as medical_app) =="
echo "$E2E_APP_URL"
