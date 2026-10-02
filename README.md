# Full-Stack Medical SaaS Boilerplate

### Privacy-first clinical console with EHR, audit trail and governed AI

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.8-3178C6.svg)](https://www.typescriptlang.org/)
[![PostgreSQL](https://img.shields.io/badge/Database-PostgreSQL-336691.svg)](https://www.postgresql.org/)
[![Prisma](https://img.shields.io/badge/ORM-Prisma-2D3748.svg)](https://www.prisma.io/)
[![Tests](https://img.shields.io/badge/Tests-50%2B-22C55E.svg)](#testing)
[![CI](https://github.com/frangelbarrera/medical-saas-fullstack-boilerplate/actions/workflows/ci.yml/badge.svg)](https://github.com/frangelbarrera/medical-saas-fullstack-boilerplate/actions/workflows/ci.yml)

A production-grade clinical management boilerplate: a workspace for ambulatory practices with tenant isolation enforced in the database (row-level security), typed clinical records with a review/sign lifecycle, a tamper-evident audit trail, governed AI drafts and a neutral, jurisdiction-flexible data model.

> **Disclaimer**: This boilerplate implements privacy- and security-aware patterns (field-level encryption, audit chain, capability-based access control, RLS). It is **not certified** HIPAA, FADP, GDPR, ISO 27001 or any other regime. Before using real patient data you must complete infrastructure hardening, sign data processing agreements with every vendor touching PHI, and pass a formal risk assessment with legal counsel.

---

## What's inside

| Area | Highlights |
| --- | --- |
| **Clinical console** | Editorial daybook, agenda (day/week), patient directory with server-side search, clinical record with tabs, secure inbox, billing, insights, audit |
| **Clinical records** | Encounters with `DRAFT -> IN REVIEW -> SIGNED -> AMENDED` lifecycle, version snapshots, ICD-10/SNOMED problems, allergies, medication orders, LOINC-coded observations |
| **Tenant isolation** | Every table under row-level security keyed on a transaction-local `app.current_clinic_id`; the runtime uses a limited DB role that cannot bypass it |
| **Audit trail** | Append-only per-clinic hash chain (WORM for the runtime role), 48-event catalog, chain verification endpoint, break-glass with mandatory reason |
| **Privacy tooling** | AES-256-GCM field encryption with deterministic HMAC search indexes, DSAR workflow with full subject export, consent register (incl. AI opt-out) |
| **Governed AI** | Scribe drafts that REQUIRE clinician review (never auto-orders), versioned prompt registry, PHI redaction modes, provider abstraction (Gemini by default, optional) |
| **Interoperability** | Read-only FHIR R4 mapping layer (Patient, Encounter, Condition, Observation, MedicationRequest, AllergyIntolerance, AuditEvent...) and an ICD-10 <-> SNOMED CT seed map |
| **i18n / a11y** | English, German, French, Italian out of the box (`en-CH`, `de-CH`, `fr-CH`, `it-CH`), Intl-based formatting, keyboard-first command palette (`Cmd/Ctrl+K`) |

## Architecture

npm-workspaces monorepo:

```
apps/web            React 19 + Vite + Tailwind 4 (editorial console)
packages/contracts  Zod schemas, RFC 9457 errors, capabilities, locales
packages/ui         Accessible editorial design system (tokens + components)
services/api        Express, thin controllers, /api/v1
services/domain     Request context, policies, clinical state machine
services/data       Prisma repositories, tenant-scoped transactions, RLS
services/integrations  AI provider + PHI redaction, FHIR mappings
services/audit      Audit event catalog and purpose taxonomy
ops/                DB init scripts and operational runbooks
```

Core decisions (each enforced in code, not documentation):

- **Repositories are the only persistence boundary.** Routes never import Prisma; every operation runs inside `withTenant()`, which sets the row-level security context for the transaction.
- **Two database roles.** The privileged role runs migrations only; the application connects as `medical_app`, which owns nothing and cannot bypass policies (or even `UPDATE`/`DELETE` audit rows).
- **Capabilities, not roles, gate the UI.** A shared view adapts to the signed-in user; there are no duplicated per-role screens.
- **AI is a draft assistant, never an implicit clinician.** Model output lands as `PENDING` drafts; insertion writes DRAFT note content and medication orders start as DRAFT regardless of origin.

## Quick start (local)

Requirements: Node 20+, PostgreSQL 14+ (or Docker).

```bash
# 1. Install
npm ci

# 2. Create the limited runtime role (one-time, as superuser)
psql "postgresql://postgres@localhost:5432/postgres" -f ops/db/init/01-app-role.sh  # or run the SQL inside manually

# 3. Configure
cp .env.example .env   # then edit: DATABASE_URL (medical_app), secrets, MIGRATION_DATABASE_URL (privileged)

# 4. Schema + synthetic data (clearly fake; never seed production)
npm run prisma:deploy  # uses MIGRATION_DATABASE_URL
npm run db:seed        # uses DATABASE_URL

# 5. Run
npm run dev            # API on :3000 + Vite dev middleware for the SPA
```

Sign in with the bootstrap admin (`ADMIN_USERNAME` / `ADMIN_PASSWORD` from your `.env`) or the seeded staff (`keller` / `LocalStaff2026x`).

### Docker

```bash
export PGPASSWORD=... JWT_SECRET=... ENCRYPTION_KEY=... PHI_HMAC_KEY=... MEDICAL_APP_PASSWORD=...
docker compose run --rm migrate   # apply migrations (privileged)
docker compose up -d app          # runtime on :3000 (limited role)
```

## Testing

```bash
npm run test        # unit + integration (41 tests; PG-backed tests exercise RLS as medical_app)
npm run test:e2e    # builds the SPA, resets+seeds the e2e database, runs 9 Playwright scenarios
npm run lint        # ESLint 9 + security + no-secrets plugins
npm run typecheck   # strict TypeScript across every workspace
```

Integration tests use `TEST_DATABASE_URL` and skip gracefully when it is not
reachable; CI provisions PostgreSQL, the app role and both databases.

## Security architecture (summary)

- Minimal-claim JWT (`sub`, `sid`, `tid`) + durable sessions; revocation is immediate.
- Refresh tokens in PostgreSQL with atomic compare-and-set rotation and family-based replay detection (replaying one token kills the whole family).
- CSRF double-submit; strict production CSP without `unsafe-inline`; hardened Helmet headers; `no-store` on all API responses.
- PHI encrypted at field level (AES-256-GCM); exact-match search via HMAC indexes instead of decrypting the directory.
- Uniform `404` for cross-tenant resources (no existence leaks); server-side break-glass with reason for administrative record access.
- Webhooks are HMAC-verified and idempotent by `(provider, external_id)`.

Details and responsible disclosure: [SECURITY.md](SECURITY.md).

## Project layout conventions

- API is versioned under `/api/v1`; errors follow RFC 9457 problem details with stable `code` values.
- Every state-changing clinical action writes an audit event from the 48-event catalog.
- Migrations are data-preserving; jurisdiction-specific fields stay out of the core model (typed identifiers + configurable payers instead).
- `npm run db:backfill` recomputes HMAC indexes / birth years for legacy v1 data using application keys (never inside SQL migrations).

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). Operational procedures live in
[ops/runbooks/](ops/runbooks/) (incident response, backup/restore drills,
break-glass). Deployment options: [DEPLOYMENT_GUIDE.md](DEPLOYMENT_GUIDE.md).

## License

MIT - see [LICENSE](LICENSE).

## Compliance scope

See [docs/compliance-scope.md](docs/compliance-scope.md).
