# Full-Stack Medical SaaS Boilerplate

### HIPAA-aware Clinical Management System with Privacy-First AI

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.8-3178C6.svg)](https://www.typescriptlang.org/)
[![PostgreSQL](https://img.shields.io/badge/Database-PostgreSQL-336791.svg)](https://www.postgresql.org/)
[![Prisma](https://img.shields.io/badge/ORM-Prisma-2D3748.svg)](https://www.prisma.io/)
[![Tests](https://img.shields.io/badge/Tests-60%20total-22C55E.svg)](#testing)
[![CI](https://github.com/frangelbarrera/medical-saas-fullstack-boilerplate/actions/workflows/ci.yml/badge.svg)](https://github.com/frangelbarrera/medical-saas-fullstack-boilerplate/actions/workflows/ci.yml)

A production-grade full-stack medical SaaS boilerplate with modular architecture, role-based access control, AES-256-GCM application-level encryption for PHI, tamper-evident audit logging, refresh token rotation, structured logging with PHI redaction, Prisma ORM with versioned migrations, and comprehensive test coverage (unit + integration + E2E).

> **Disclaimer**: This boilerplate implements HIPAA-aware patterns (encryption at rest, audit trail, RBAC, minimum-necessary role isolation). It is **not** certified HIPAA-compliant. Before deploying with real Protected Health Information (PHI), you must complete infrastructure hardening, sign BAAs with all third-party vendors (Google for Gemini, your DB provider, etc.), and pass a formal HIPAA security risk assessment.

![Main Dashboard](public/Screenshots/1.png)

---

## Key Features by Role

### Administrators
- **Clinic Control**: Manage staff, infrastructure settings, and clinic configuration.
- **Audit Forensics**: Tamper-evident audit trail (SHA-256 hash chain) of every state-changing action.
- **Financial Intelligence**: Dashboards for revenue, expenses, and insurance claim tracking.

### Doctors
- **AI Scribe**: Mock endpoint that simulates extraction of vital signs, evolution, and ICD-10 diagnoses from consultation audio.
- **EHR Timeline**: Chronological view of a patient's medical history and diagnostic journey.
- **Smart Chat Assistant**: Context-aware clinical assistant that queries patient records (with PHI stripped before LLM calls).

### Secretariat
- **Agenda**: Appointment scheduling with status tracking (Scheduled, Active, Completed, No-Show).
- **Patient Intake**: Patient registration with national ID validation.
- **Billing & Payments**: Integration with digital payment platforms (Payphone) with HMAC-verified webhooks.

| Patient Directory | Medical Agenda |
| :---: | :---: |
| ![Patients](public/Screenshots/2.png) | ![Agenda](public/Screenshots/3.png) |

---

## Security Architecture

### Authentication & Authorization
- **JWT** in `HttpOnly`, `Secure`, `SameSite=Lax` cookies (no `localStorage` exposure).
- **`__Host-` cookie prefix** in production (forces `Secure`, `Path=/`, no `Domain`).
- **RBAC middleware** (`requireRole(...)`) applied to every privileged endpoint. Role checks are enforced server-side, not just by hiding UI.
- **bcrypt** password hashing (cost factor 12).
- **Per-session CSRF token** (double-submit cookie pattern). The token is generated server-side on login and must be sent back as `x-csrf-token` header for state-changing requests.

### Multi-Tenant Isolation
- Every query filters by `clinicId` taken from the JWT (`req.user.clinicId`), **never** from the request body or query string.
- Resources that don't belong to the caller's clinic return `404` (not `403`) to avoid leaking existence.
- Self-protection: a user cannot delete their own account, change their own role, or deactivate themselves.

### Application-Level Encryption
- **AES-256-GCM** (authenticated encryption) for PHI fields: `dni`, `email`, `phone`, `birth_date`.
- The auth tag prevents ciphertext tampering (mitigates padding oracle and bit-flipping attacks).
- Ciphertext format: `iv:authTag:ciphertext` (all hex).
- `decryptPHI` throws on auth tag failure (never returns partial/decrypted data).
- `ENCRYPTION_KEY` is sourced from validated environment variables — the app crashes on startup if missing or malformed.

### Audit Trail
- Every state-changing operation (user/patient/appointment/consultation/invoice create/update/delete, payment events) is recorded via `appendAuditLog()`.
- Audit entries are created **server-side only** — the `POST /api/audit_logs` endpoint has been removed to prevent clients from forging entries.
- Each entry includes a SHA-256 hash of the previous entry (hash chain) for tamper-evidence.
- Audit logs are admin-only read.

### Payment Security
- **HMAC-SHA256 webhook verification** with constant-time comparison (`crypto.timingSafeEqual`).
- **Idempotency**: replayed webhooks are detected and skipped.
- **Timeout** (10s) on gateway requests to prevent slow-loris abuse.
- **Host Header Injection fix**: `responseUrl` and `cancellationUrl` use `FRONTEND_URL` env var instead of `req.get('host')`.

### AI / LLM Safety
- **PHI stripping** before sending data to Google Gemini (configurable via `LLM_PHI_MODE` env var):
  - `strip` (default): replace PHI fields with placeholders (`[PATIENT_NAME]`, `[PATIENT_ID]`, etc.)
  - `redact`: mask PHI partially (`J*** D**`)
  - `passthrough`: send PHI as-is (**requires signed BAA with Google**)
- The `GEMINI_API_KEY` is read server-side only — it is **never** exposed to the client bundle (the previous `vite.config.ts` `define` directive that leaked it has been removed).

### HTTP Security Headers
- **Content Security Policy** with explicit directives (production: strict, dev: permissive for Vite HMR).
- **HSTS** (1 year, includeSubDomains, preload).
- **COOP**, **CORP**, **Referrer-Policy: strict-origin-when-cross-origin**.
- `frame-ancestors: 'none'` (clickjacking mitigation).

### Rate Limiting
- Global: 500 requests / 15 min per IP.
- Auth: 20 login attempts / 15 min per IP.

### Body Size Limit
- `express.json` with `limit: '1mb'` to mitigate payload-based DoS.

---

## Required Hardening for Production (HIPAA / GDPR)

Before deploying with real PHI:

1. **Secrets Management**: Move `JWT_SECRET`, `ENCRYPTION_KEY`, `PAYMENT_WEBHOOK_SECRET` from `.env` to a secret vault (AWS Secrets Manager, HashiCorp Vault).
2. **Database Encryption at Rest**: Enable at the infrastructure level (AWS KMS, GCP CMEK).
3. **BAA with Google**: Required before using Gemini with PHI. Without a BAA, keep `LLM_PHI_MODE=strip`.
4. **TLS Termination**: Ensure HTTPS only at the load balancer / reverse proxy layer. Add HTTP→HTTPS redirect.
5. **Backup Strategy**: Encrypted backups with tested restore procedures. Define retention policy (HIPAA: 6 years minimum).
6. **Formal Risk Assessment**: Required by HIPAA Security Rule (45 CFR §164.308).
7. **Workforce Training**: HIPAA-required security awareness training for all users.
8. **Incident Response Plan**: Document breach notification procedures (60-day notification window per HITECH).

---

## Project Structure

```text
.
├── server.ts                     # Entrypoint shim (sets START_SERVER=1, imports src/server)
├── prisma/
│   ├── schema.prisma             # Prisma schema (9 models, 3 enums, source of truth)
│   └── migrations/               # Versioned SQL migrations (committed)
├── schema.sql                    # PostgreSQL schema with RLS (for non-Prisma setup)
├── Dockerfile                    # Multi-stage, non-root, slim
├── docker-compose.yml            # postgres + app with healthchecks and required secrets
├── .env.example                  # Template with generation instructions
├── eslint.config.js              # ESLint 9 flat config (TS, react-hooks, security, no-secrets)
├── .prettierrc.json              # Prettier config (120 chars, double quotes, trailing commas)
├── playwright.config.ts          # E2E test config (spawns dev server, Chromium)
├── vitest.config.ts              # Unit/integration test config
├── tsconfig.json                 # Strict mode enabled
├── vite.config.ts                # Vite + proxy (no client-side secrets)
├── .github/workflows/
│   ├── ci.yml                    # typecheck + lint + test + build + npm audit
│   └── deploy.yml                # SSH deploy (template)
├── public/
│   └── Screenshots/              # README images
├── tests/                        # 52 vitest tests
│   ├── encryption.test.ts        # AES-256-GCM unit tests
│   ├── env.test.ts               # Zod env validation unit tests
│   ├── refresh-token.test.ts     # Refresh token rotation/revocation unit tests
│   ├── api.test.ts               # Spawn-based integration tests (13 tests)
│   ├── in-process.test.ts        # In-process integration tests via createApp() (16 tests)
│   ├── setup.ts                  # Test env vars
│   └── helpers/server.ts         # Spawn helper for E2E-style tests
├── e2e/                          # 8 Playwright E2E tests
│   └── happy-paths.spec.ts       # Login, dashboard, patients, logout, security headers
└── src/
    ├── App.tsx                   # React app, routing, role-based views, session timeout
    ├── main.tsx
    ├── theme.ts
    ├── index.css
    ├── components/               # 19 view components
    │   ├── AIChat.tsx
    │   ├── AIScribe.tsx
    │   ├── AdminUsersView.tsx
    │   ├── AgendaView.tsx / SecAgendaView.tsx
    │   ├── AuditView.tsx
    │   ├── ConsultationView.tsx
    │   ├── DashboardView.tsx / SecDashboardView.tsx
    │   ├── FinanceView.tsx
    │   ├── MedicalHistoryView.tsx
    │   ├── PatientDetailView.tsx
    │   ├── PatientsView.tsx / SecPatientsView.tsx
    │   ├── SettingsView.tsx
    │   └── ...
    ├── lib/
    │   ├── api.ts                # Frontend HTTP client with dynamic CSRF token
    │   ├── ai-service.ts         # Gemini integration with PHI sanitization
    │   ├── env.server.ts         # Zod-validated env vars (no defaults for secrets)
    │   ├── swagger.ts
    │   ├── types.ts
    │   ├── cie10.ts              # ICD-10 catalog (ES)
    │   └── medications.ts
    └── server/                   # Modular backend (was 1480-LOC monolith)
        ├── index.ts              # Entrypoint (START_SERVER env gates listen)
        ├── app.ts                # createApp() factory (exportable for tests)
        ├── config.ts             # env, secrets, DB pool, mock state
        ├── utils/
        │   ├── crypto.ts         # encryptPHI, decryptPHI (AES-256-GCM)
        │   ├── audit.ts          # appendAuditLog with SHA-256 hash chain
        │   ├── logger.ts         # Pino logger with PHI redaction
        │   └── refresh-token.ts  # Opaque refresh tokens with rotation
        ├── middleware/
        │   ├── auth.ts           # authenticateToken, requireRole, assertClinicOwnership
        │   ├── csrf.ts           # Double-submit cookie CSRF protection
        │   ├── validate.ts       # validateBody (Zod)
        │   └── security.ts       # Helmet CSP, rate limiters, CORS
        ├── schemas/
        │   └── index.ts          # All Zod schemas
        ├── db/
        │   ├── init.ts           # initDb() with env-based admin seeding
        │   └── client.ts         # PrismaClient singleton
        └── routes/
            ├── auth.ts           # /api/auth/* (login, logout, me, refresh)
            ├── admin.ts          # /api/admin/populate
            ├── clinics.ts        # /api/clinics/:id
            ├── users.ts          # /api/users/*
            ├── patients.ts       # /api/patients/*
            ├── consultations.ts  # /api/patients/:id/consultations
            ├── appointments.ts   # /api/appointments/*
            ├── invoices.ts       # /api/invoices/*
            ├── expenses.ts       # /api/expenses/*
            ├── stats.ts          # /api/stats
            ├── audit.ts          # /api/audit_logs (admin-only read)
            ├── ai.ts             # /api/ai/*, /api/ai_chats/*
            ├── payments.ts       # /api/payments/create-order
            └── webhooks.ts       # /api/webhooks/payment
```

---

## Tech Stack

- **Frontend**: [React 19](https://react.dev/), [Vite 6](https://vitejs.dev/), [Tailwind CSS 4](https://tailwindcss.com/)
- **Language**: [TypeScript 5.8](https://www.typescriptlang.org/) (strict mode)
- **Animations**: [Motion](https://motion.dev/)
- **Backend**: [Node.js 20](https://nodejs.org/), [Express 4](https://expressjs.com/)
- **Database**: [PostgreSQL 15](https://www.postgresql.org/) + [Prisma ORM 5](https://www.prisma.io/) (with in-memory mock fallback for dev)
- **AI Engine**: [Google Gemini](https://ai.google.dev/) (with PHI sanitization)
- **Logging**: [Pino](https://github.com/pinojs/pino) + [pino-http](https://github.com/pinojs/pino-http) (structured JSON, PHI redaction)
- **Testing**: [Vitest](https://vitest.dev/) (52 unit/integration tests) + [Playwright](https://playwright.dev/) (8 E2E tests)
- **Linting**: [ESLint 9](https://eslint.org/) + [Prettier 3](https://prettier.io/) (with security plugins)
- **Security**: [Helmet](https://helmetjs.github.io/), [express-rate-limit](https://github.com/express-rate-limit/express-rate-limit), [bcryptjs](https://github.com/dcodeIO/bcrypt.js), [jsonwebtoken](https://github.com/auth0/node-jsonwebtoken), [zod](https://zod.dev/)

---

## Database Architecture

The boilerplate ships with two database modes:

### 1. In-Memory Mock (default, for development)
- 8 arrays (`mockUsers`, `mockPatients`, `mockConsultations`, etc.) managed in `src/server/config.ts`.
- Allows instant setup without a Postgres instance.
- Use the "Populate with Test Data" button in Settings to generate synthetic patients, appointments, and consultations.
- **Volatile test data is purged on admin logout.**

### 2. PostgreSQL + Prisma (for production)
- `prisma/schema.prisma` is the source of truth for the schema: 9 models (Clinic, User, Patient, Appointment, Consultation, Invoice, Expense, AiChat, AuditLog), 3 enums (UserRole, AppointmentStatus, InvoiceStatus).
- Migrations are versioned in `prisma/migrations/`. Apply with `npm run prisma:deploy`.
- `schema.sql` is kept for non-Prisma setups (direct psql) and includes Row-Level Security (RLS) policies with `WITH CHECK` for INSERT/UPDATE.
- The Prisma client is generated on `npm install` (postinstall hook) and used via `src/server/db/client.ts`.

### Switching to PostgreSQL mode

1. Set `DATABASE_URL` in `.env` (format: `postgresql://user:pass@host:5432/db?schema=public`).
2. Run `npm run prisma:deploy` to apply migrations.
3. (Optional) Apply RLS policies: `psql $DATABASE_URL -f schema.sql`.
4. Set `ADMIN_USERNAME` and `ADMIN_PASSWORD` to seed the first admin.
5. Restart the server.

> **Note**: The route handlers in `src/server/routes/` still use the mock arrays. Migrating them to PrismaClient calls is the next step — the Prisma client and schema are ready, the switchover is incremental and per-route.

---

## Quick Start

### 1. Clone & Install
```bash
git clone https://github.com/frangelbarrera/medical-saas-fullstack-boilerplate.git
cd medical-saas-fullstack-boilerplate
npm install
```

### 2. Generate Secrets
The app will refuse to start without valid secrets. Generate them with `openssl`:

```bash
# JWT_SECRET (min 32 chars, recommend 64 hex chars = 32 bytes)
openssl rand -hex 32

# ENCRYPTION_KEY (exactly 64 hex chars = 32 bytes for AES-256)
openssl rand -hex 32

# PAYMENT_WEBHOOK_SECRET (min 16 chars)
openssl rand -hex 16
```

### 3. Configure `.env`
```bash
cp .env.example .env
# Edit .env and replace all placeholders with real values
```

Required variables (no defaults — the app crashes if missing):
- `JWT_SECRET` — min 32 characters
- `ENCRYPTION_KEY` — exactly 64 hex characters (32 bytes)
- `PAYMENT_WEBHOOK_SECRET` — min 16 characters
- `FRONTEND_URL` — your frontend origin (for CORS and redirects)

Optional:
- `ADMIN_USERNAME` / `ADMIN_PASSWORD` — first admin credentials (if not set, no admin is seeded; you must provision one)
- `GEMINI_API_KEY` — for AI features (server-side only)
- `PAYMENT_GATEWAY_TOKEN` — for real payment integration
- `LLM_PHI_MODE` — `strip` (default) | `redact` | `passthrough` (BAA required)

### 4. Run
```bash
# Development (Vite HMR + tsx watch)
npm run dev

# Production
npm run build
npm start
```

### 5. First Login
If you set `ADMIN_USERNAME` and `ADMIN_PASSWORD` in `.env`, log in with those credentials. Change the password immediately via the Admin Settings panel.

If you did **not** set those env vars, no admin is seeded. Set them and restart the server to provision the first admin.

---

## Testing

The project has **60 tests** across three layers:

### Unit tests (Vitest, 23 tests)
```bash
npm test                    # run all vitest tests
npm run test:watch          # watch mode
npm run test:ci             # with coverage
```
- `tests/encryption.test.ts` (8): AES-256-GCM round-trip, tamper detection, Unicode support
- `tests/env.test.ts` (5): Zod schema validation for secrets
- `tests/refresh-token.test.ts` (10): rotation, revocation, expiry

### Integration tests (Vitest, 29 tests)
- `tests/api.test.ts` (13): spawn-based, full HTTP stack (CSRF, headers, rate limit, webhook HMAC)
- `tests/in-process.test.ts` (16): in-process via `createApp()`, fast (~300ms total)

### E2E tests (Playwright, 8 tests)
```bash
npm run test:e2e            # runs all E2E tests (spawns dev server + Chromium)
```
- `e2e/happy-paths.spec.ts`: login flow, dashboard rendering, patient navigation, logout, security headers

### Coverage

| Layer | What it covers |
|-------|----------------|
| Auth | login success/failure, JWT verification, role enforcement, refresh token rotation |
| RBAC | admin-only endpoints reject non-admins (403) |
| IDOR | cross-clinic access returns 404 (no existence leak) |
| Encryption | round-trip, auth tag failure throws, Unicode support |
| CSRF | state-changing requests without token rejected (403); login/refresh/webhook exempt |
| Payment webhook | HMAC signature verification, idempotency, missing signature |
| Security headers | CSP, HSTS, COOP, CORP, Referrer-Policy present |
| E2E | real browser login → dashboard → logout, security headers via HTTP response |

---

## CI/CD

Every push to `main` and every PR triggers `.github/workflows/ci.yml`:
1. **Typecheck** (`tsc --noEmit` with strict mode)
2. **Lint** (`eslint .` with security plugins)
3. **Tests** (`vitest run` with test secrets)
4. **Build** (`vite build`)
5. **Security audit** (`npm audit --audit-level=high`, no `continue-on-error`)

Deploy workflow (`.github/workflows/deploy.yml`) is provided as a template — configure `SERVER_HOST`, `SERVER_USER`, `SERVER_SSH_KEY`, and `DEPLOY_PATH` secrets to enable SSH-based deployment.

---

## Security

For the security policy and vulnerability reporting, see [SECURITY.md](SECURITY.md).

---

## Roadmap

- **Local Sovereign AI**: Whisper + Llama 3 via Ollama for fully offline AI.
- **DICOM Integration**: Medical imaging in the patient timeline.
- **HL7/FHIR**: Interoperability with hospital systems.
- **Database migration tooling**: Replace mock arrays with real PostgreSQL queries, aligned with `schema.sql`.
- **Code-splitting**: Lazy-load view components to reduce initial bundle.

---

## License

MIT — see [LICENSE](LICENSE).

Developed by **Frangel Barrera** (Cybersecurity Engineer).
