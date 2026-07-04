# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 1.1.x   | :white_check_mark: |
| < 1.1   | :x:                |

## Reporting a Vulnerability

**Do not open public GitHub issues for security vulnerabilities.** Instead:

1. Email **security@your-domain.com** (replace with your actual security contact).
2. Include a detailed description of the vulnerability.
3. Include steps to reproduce (PoC, screenshots, or curl commands).
4. Mention the potential impact and any suggested mitigations.

We will acknowledge receipt within 48 hours and work with you on coordinated disclosure. Reporters who follow responsible disclosure will be credited (if desired) in the fix announcement.

## Security Architecture

This boilerplate implements the following security controls. Each is mapped to its implementation location for auditability.

### Authentication & Session Management
- **JWT** in `HttpOnly`, `Secure`, `SameSite=Lax` cookies. No `localStorage` exposure (mitigates XSS token theft).
- **`__Host-` cookie prefix** in production (forces `Secure`, `Path=/`, no `Domain`).
- **JWT expiry**: 8 hours (configured in `server.ts` `jwt.sign(..., { expiresIn: '8h' })`).
- **bcrypt** password hashing with cost factor 12 (in `initDb()` and `/api/users` POST).
- **Login rate limiting**: 20 attempts / 15 min per IP (`authLimiter` in `server.ts`).
- Implementation: `server.ts` `authenticateToken` middleware, `/api/auth/login` handler.

### Authorization (RBAC)
- **`requireRole(...roles)` middleware** in `server.ts` enforces role checks server-side.
- Applied to: `/api/admin/populate` (ADMIN), `/api/users` POST/PUT/DELETE (ADMIN), `/api/audit_logs` GET (ADMIN), `/api/patients/:id/consultations` POST (ADMIN, DOCTOR).
- Self-protection: a user cannot delete their own account, change their own role, or deactivate themselves.
- Frontend role guards are cosmetic only; real enforcement is server-side.

### Multi-Tenant Isolation (IDOR Mitigation)
- Every query filters by `clinicId` taken from the JWT (`req.user.clinicId`), never from the request body or query string.
- Resources that don't belong to the caller's clinic return `404` (not `403`) to avoid leaking existence.
- `assertClinicOwnership(resourceClinicId, userClinicId)` helper used in PUT/DELETE handlers.
- Implementation: every handler in `server.ts` that touches clinic-scoped resources.

### Application-Level Encryption (ALE)
- **AES-256-GCM** (authenticated encryption) for PHI fields: `dni`, `email`, `phone`, `birth_date`.
- Auth tag prevents ciphertext tampering (mitigates padding oracle and bit-flipping attacks).
- Ciphertext format: `iv:authTag:ciphertext` (all hex, 24:32:N chars).
- `decryptPHI` throws on auth tag failure (never returns partial/decrypted data).
- `ENCRYPTION_KEY` is sourced from validated env vars (`env.server.ts`) — the app crashes on startup if missing or malformed.
- Key generation: `openssl rand -hex 32` (produces 64 hex chars = 32 bytes = 256 bits).
- Implementation: `encryptPHI` / `decryptPHI` in `server.ts`.

### Audit Trail (Tamper-Evident)
- Every state-changing operation is recorded via `appendAuditLog()` server-side.
- Audit entries are created server-side only — the `POST /api/audit_logs` endpoint has been removed (clients cannot forge entries).
- Each entry includes a SHA-256 hash chain: `hash = SHA-256(prev_hash || JSON.stringify(entry_data))`.
- Audit logs are admin-only read (`requireRole('ADMIN')`).
- For production with PostgreSQL, the `audit_logs` table has `REVOKE UPDATE, DELETE` to enforce append-only.
- Implementation: `appendAuditLog()` in `server.ts`, `audit_logs` table in `schema.sql`.

### CSRF Protection (Double-Submit Cookie)
- Per-session CSRF token generated on login (`crypto.randomBytes(32).toString('hex')`).
- Token stored in a non-`HttpOnly` cookie (`csrf_token` / `__Host-csrf_token`) AND returned in the login response body.
- Frontend stores token in memory and sends it as `x-csrf-token` header for state-changing requests.
- Server compares cookie value vs header value (constant-time comparison not needed because tokens are random, but values must match).
- Login endpoint is exempt (it's the request that issues the token).
- Webhook endpoint is exempt (it has its own HMAC verification).
- Implementation: `csrfProtection` middleware in `server.ts`, `setCsrfToken` in `src/lib/api.ts`.

### Payment Webhook Security
- **HMAC-SHA256 signature verification** over raw request body.
- Constant-time comparison via `crypto.timingSafeEqual` (prevents timing attacks).
- **Idempotency**: replayed webhooks are detected (by `transactionId` in audit logs) and skipped.
- **Timeout** (10s) on gateway fetch requests via `AbortController` (prevents slow-loris).
- **Host Header Injection fix**: `responseUrl` and `cancellationUrl` use `FRONTEND_URL` env var, not `req.get('host')`.
- Implementation: `/api/webhooks/payment` and `/api/payments/create-order` in `server.ts`.

### HTTP Security Headers
- **Content Security Policy**: production is strict (`default-src 'self'`, `frame-ancestors 'none'`, `upgrade-insecure-requests`); dev is permissive for Vite HMR.
- **HSTS**: 1 year, `includeSubDomains`, `preload`.
- **COOP**: `same-origin`.
- **CORP**: `same-origin`.
- **Referrer-Policy**: `strict-origin-when-cross-origin`.
- Implementation: `helmet(...)` config in `server.ts`.

### Rate Limiting
- **Global**: 500 requests / 15 min per IP.
- **Auth**: 20 login attempts / 15 min per IP.
- Implementation: `express-rate-limit` in `server.ts`.

### Body Size Limit
- `express.json({ limit: '1mb' })` to mitigate payload-based DoS.

### AI / LLM Safety
- **PHI stripping** before sending data to Google Gemini (configurable via `LLM_PHI_MODE` env var):
  - `strip` (default): replace PHI fields with placeholders (`[PATIENT_NAME]`, `[PATIENT_ID]`, etc.)
  - `redact`: mask PHI partially (`J*** D**`)
  - `passthrough`: send PHI as-is (**requires signed BAA with Google**)
- The `GEMINI_API_KEY` is read server-side only — it is **never** exposed to the client bundle.
- Implementation: `sanitizePatientForLLM` / `sanitizeTextForLLM` in `src/lib/ai-service.ts`.

### Dependency Security
- `npm audit --audit-level=high` runs in CI without `continue-on-error` (high-severity vulns fail the build).
- Dependabot is enabled via GitHub (configured in repo settings, not in code).
- Dependencies are pinned in `package-lock.json` for reproducible installs.

## Required Hardening for Production (HIPAA / GDPR)

This boilerplate implements HIPAA-aware patterns but is **not** certified HIPAA-compliant. Before deploying with real Protected Health Information (PHI):

### Must-Do Before Production
1. **Secrets Management**: Move `JWT_SECRET`, `ENCRYPTION_KEY`, `PAYMENT_WEBHOOK_SECRET` from `.env` to a secret vault (AWS Secrets Manager, HashiCorp Vault, GCP Secret Manager).
2. **Database Encryption at Rest**: Enable at the infrastructure level (AWS KMS, GCP CMEK, Azure TDE).
3. **TLS Termination**: HTTPS only at the load balancer / reverse proxy. Add HTTP→HTTPS redirect. Use HSTS preload.
4. **BAA with Google**: Required before using Gemini with PHI. Without a BAA, keep `LLM_PHI_MODE=strip`.
5. **Backup Strategy**: Encrypted backups with tested restore procedures. Define retention policy (HIPAA: 6 years minimum).
6. **Database Migrations**: Run `psql -f schema.sql` to create the full schema with RLS. Update `server.ts` to use PostgreSQL queries instead of mock arrays.
7. **First Admin Provisioning**: Set `ADMIN_USERNAME` and `ADMIN_PASSWORD` env vars on first boot. Change the password immediately after first login.
8. **Remove Test Mode**: Set `NODE_ENV=production` (affects CSP strictness, cookie prefixes, error messages).

### HIPAA Compliance Requirements (Beyond This Boilerplate)
1. **Formal Risk Assessment**: Required by HIPAA Security Rule (45 CFR §164.308). Document annually.
2. **Workforce Training**: HIPAA-required security awareness training for all users.
3. **Incident Response Plan**: Document breach notification procedures. HITECH requires 60-day notification to affected individuals, HHS, and media (if >500 individuals).
4. **Business Associate Agreements (BAAs)**: Signed with all third-party vendors that touch PHI (Google for Gemini, your DB provider, your hosting provider, your backup provider, etc.).
5. **Audit Log Retention**: HIPAA requires 6 years. Configure log archival.
6. **Physical Safeguards**: Facility access controls, workstation security, device and media controls.
7. **Administrative Safeguards**: Security management process, sanctions policy, information access management, contingency plan.

## Threat Model

### What This Boilerplate Defends Against
- **Token theft via XSS**: JWT in `HttpOnly` cookies (not `localStorage`).
- **CSRF on state-changing requests**: Double-submit cookie pattern with per-session tokens.
- **IDOR cross-clinic access**: `clinicId` always from JWT, never from request.
- **Privilege escalation via API**: `requireRole()` middleware on every privileged endpoint.
- **PHI exposure if DB is compromised**: AES-256-GCM app-layer encryption.
- **Ciphertext tampering**: GCM auth tag (AEAD).
- **Audit log forgery**: Server-only writing, hash chain, append-only table.
- **Payment webhook forgery**: HMAC-SHA256 verification.
- **Host Header Injection on payment redirects**: `FRONTEND_URL` env var.
- **Slow-loris on payment gateway**: 10s timeout via `AbortController`.
- **Brute-force on login**: 20 attempts / 15 min rate limit.
- **Timing attack on webhook signature**: `crypto.timingSafeEqual`.
- **Clickjacking**: `frame-ancestors: 'none'`.
- **MIME-type sniffing XSS**: `X-Content-Type-Options: nosniff` (Helmet default).
- **GEMINI_API_KEY leak to client**: Removed from Vite `define`, used server-side only.

### What This Boilerplate Does NOT Defend Against (Yet)
- **SQL injection**: All current queries are parameterized, but there is no automated test that verifies this for future queries. Consider adding sqlmap to CI.
- **Supply chain attacks**: Dependencies are pinned in `package-lock.json` but there is no SBOM or signature verification. Consider `npm audit signatures`, Snyk, or Dependabot.
- **DDoS at the network layer**: Rate limiting is per-IP at the app layer only. Use a CDN/WAF (Cloudflare, AWS WAF) for volumetric protection.
- **Insider threat from DBA**: RLS policies protect against app-level mistakes, but a DBA with `BYPASSRLS` privilege can still read everything. Use column-level encryption (already implemented) and audit DBA actions.
- **Side-channel attacks (timing, power)**: Out of scope for a web app; relevant for HSMs and secure enclaves.
- **Zero-day vulnerabilities in dependencies**: Mitigated by `npm audit` in CI but not eliminated. Subscribe to security advisories for all critical deps (express, pg, bcryptjs, jsonwebtoken).

## Security Review Checklist

Before deploying, verify:

- [ ] All env vars in `.env.example` are set in production with real, high-entropy values.
- [ ] `NODE_ENV=production` (affects CSP strictness, cookie prefixes, error messages).
- [ ] `FRONTEND_URL` matches your production domain (HTTPS).
- [ ] HTTPS is enforced at the load balancer; HTTP redirects to HTTPS.
- [ ] Database has `schema.sql` applied with RLS enabled.
- [ ] Database user used by the app does NOT have `BYPASSRLS` or superuser privileges.
- [ ] `ADMIN_PASSWORD` is a strong, unique password (or use a password manager).
- [ ] First admin's password is changed after first login.
- [ ] `PAYMENT_GATEWAY_TOKEN` and `PAYMENT_WEBHOOK_SECRET` are configured.
- [ ] Webhook URL is registered with the payment gateway.
- [ ] `LLM_PHI_MODE` is `strip` unless a BAA is signed with Google.
- [ ] `GEMINI_API_KEY` is set server-side and NOT in any client bundle.
- [ ] Backups are encrypted and tested for restore.
- [ ] Audit logs are archived with 6+ year retention.
- [ ] Incident response runbook is documented and the team knows the 60-day notification window.
- [ ] `npm audit` passes with no high-severity vulnerabilities.
- [ ] All tests in `npm test` pass.

## Contact

For security questions or to report a vulnerability, contact **security@your-domain.com**.

For general questions, open a GitHub issue.

## License

This security policy is part of the Medical SaaS Boilerplate project, licensed under the MIT License.
