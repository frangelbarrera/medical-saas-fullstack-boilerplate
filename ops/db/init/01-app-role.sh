#!/bin/bash
# Provisions the LIMITED runtime role on first boot of the database container.
#
# The application must never connect as the superuser or table owner: both
# bypass row-level security. The role created here only receives CONNECT;
# table privileges are granted by the RLS migration (services/data/prisma).
set -euo pipefail

: "${MEDICAL_APP_PASSWORD:?MEDICAL_APP_PASSWORD is required to provision the app role}"

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
  DO \$\$
  BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'medical_app') THEN
      CREATE ROLE medical_app LOGIN PASSWORD '${MEDICAL_APP_PASSWORD}';
    ELSE
      ALTER ROLE medical_app LOGIN PASSWORD '${MEDICAL_APP_PASSWORD}';
    END IF;
  END
  \$\$;
  GRANT CONNECT ON DATABASE "${POSTGRES_DB}" TO medical_app;
EOSQL
