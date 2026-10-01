# Deployment Guide

How to run this boilerplate in development, staging and production. The
application is a single Node.js process (API + built SPA) plus PostgreSQL,
packaged with Docker. It always connects to PostgreSQL through the limited
`medical_app` role so row-level security applies.

## Table of Contents

- [Local development](#local-development)
- [Environment variables](#environment-variables)
- [Docker Compose (recommended for production)](#docker-compose)
- [Bare metal / VM](#bare-metal)
- [Database roles and migrations](#database-roles-and-migrations)
- [Zero-downtime considerations](#zero-downtime-considerations)
- [Post-deploy verification](#post-deploy-verification)

---

## Local development

```bash
npm ci
cp .env.example .env       # edit secrets + URLs
npm run prisma:deploy      # privileged URL (MIGRATION_DATABASE_URL)
npm run db:seed            # synthetic data against DATABASE_URL
npm run dev                # http://localhost:3000 (API + Vite middleware)
```

Production-mode check locally (serves the built SPA, strict CSP):

```bash
npm run build
NODE_ENV=production npm start
```

## Environment variables

| Variable | Required | Notes |
| --- | --- | --- |
| `NODE_ENV` | yes | `development` / `test` / `production` (no default; fail-closed) |
| `PORT` | no | default `3000` |
| `FRONTEND_URL` | no | CORS allowlist origin (default `http://localhost:3000`) |
| `DATABASE_URL` | yes | **must use the `medical_app` role** - RLS is bypassed by owners/superusers |
| `MIGRATION_DATABASE_URL` | migrations only | privileged URL used by `prisma migrate deploy` |
| `JWT_SECRET` | yes | 32+ chars, `openssl rand -hex 32` |
| `ENCRYPTION_KEY` | yes | 64 hex chars (AES-256-GCM field encryption) |
| `PHI_HMAC_KEY` | yes | 64 hex chars (deterministic search indexes) |
| `PAYMENT_WEBHOOK_SECRET` | for webhooks | 16+ chars, HMAC shared secret |
| `GEMINI_API_KEY` | no | empty disables all AI features (they return 503) |
| `LLM_PHI_MODE` | no | `strip` (default) / `redact` / `passthrough` (requires a signed DPA) |
| `TRUST_PROXY` | no | `1` behind exactly one proxy; comma list for more; empty when direct |
| `ADMIN_USERNAME` / `ADMIN_PASSWORD` | first boot | bootstrap admin; unset them afterwards |

**Never commit `.env`.** Production secrets belong in your secret manager,
injected as environment variables at deploy time.

## Docker Compose

`docker-compose.yml` provisions PostgreSQL (with the limited role via
`ops/db/init/01-app-role.sh`), the app and a one-shot migration runner.

```bash
export PGPASSWORD="$(openssl rand -hex 16)"
export MEDICAL_APP_PASSWORD="$(openssl rand -hex 16)"
export JWT_SECRET="$(openssl rand -hex 32)"
export ENCRYPTION_KEY="$(openssl rand -hex 32)"
export PHI_HMAC_KEY="$(openssl rand -hex 32)"
export FRONTEND_URL="https://clinic.example.com"

docker compose run --rm migrate   # migrations first, privileged
docker compose up -d app          # runtime, limited role
curl -fsS https://clinic.example.com/api/v1/health/ready
```

Put TLS in front (Caddy/nginx/your load balancer): the app sets `secure`
cookies and `__Host-` prefixes automatically when it sees HTTPS via
`X-Forwarded-Proto` and `NODE_ENV=production`, and enables HSTS.

## Bare metal

```bash
npm ci --omit=dev && npm install --no-save tsx@^4.21.0
npm run build
MIGRATION_DATABASE_URL=... npx prisma migrate deploy --schema services/data/prisma/schema.prisma
NODE_ENV=production DATABASE_URL=... JWT_SECRET=... ENCRYPTION_KEY=... PHI_HMAC_KEY=... \
  node_modules/.bin/tsx services/api/src/server.ts
```

Run under systemd (or your supervisor) with `Restart=on-failure`; the
process exits on SIGTERM after draining connections.

## Database roles and migrations

- `medical_app` - runtime role. `CONNECT` + table grants from the RLS
  migration; cannot create/drop tables; cannot update or delete audit rows.
- privileged role (e.g. `postgres`) - used ONLY by `prisma migrate deploy`
  and operational runbooks.
- Migrations under `services/data/prisma/migrations` are data-preserving;
  the v2 migration carries a full transform from the v1 schema (see the
  migration header comments).
- After restoring a v1 backup, run `npm run db:backfill` to recompute HMAC
  search indexes and birth years with the application keys.

## Zero-downtime considerations

- Migrations are additive by default; deploy them BEFORE the new app version
  (the compose setup does exactly this via the `migrate` service).
- Run one replica during `migrate deploy`, then scale up. The in-memory rate
  limiter is per-process: for multiple replicas put a shared limiter (Redis)
  or a gateway rate limit in front.
- Static assets are fingerprinted (`dist/assets/*.js`); old and new bundles
  coexist, so in-flight sessions finish on the old chunk set.

## Post-deploy verification

```bash
curl -fsS $BASE/api/v1/health/ready        # {"database":"up"}
# sign in via the UI, then:
curl -fsS -H "Cookie: token=..." $BASE/api/v1/audit/verify   # {"valid":true}
```

Then remove `ADMIN_USERNAME` / `ADMIN_PASSWORD` from the environment so the
bootstrap admin cannot be recreated after a reset.
