# Changelog

All notable changes to this project are documented here. The format follows
Keep a Changelog; versions follow semantic versioning.

## [2.1.0] - 2026-10-03

### Security (P0)

- Directory/PHI split: `patients:write` replaced by `patients:directory_write`
  and `patients:phi_write`. Secretaries manage the directory and receive a
  directory-only projection; the full detail endpoint 403s without the
  protected capability, and directory-grade updates return the projection.
- AI draft insert/discard now enforce the governed clinical access model
  (care team, break-glass for admins) inside the request transaction, with
  audited outcomes.
- Amendments: the signed original stays SIGNED; the amendment opens as a
  linked DRAFT and the original becomes AMENDED only when the amendment is
  signed. One open amendment per note (partial unique index); version
  conflicts return 409.
- Clinical writes validate encounter/patient/tenant consistency in the
  transaction; medication orders follow a validated state machine and the
  reviewing clinician is stamped server-side on activation.

### Security (P1)

- Scheduling: practitioner eligibility (active doctor, same clinic), agenda
  ranges use overlap semantics with validation and a 62-day cap; open slots
  respect rule validity end and the clinic IANA timezone (CET/CEST covered).
- Messaging validates the whole participant set (clinic, active, role,
  patient-thread eligibility) before anything is written; audits carry
  participant counts, never bodies.
- User administration: last-admin protection on demotion and deactivation,
  cross-clinic edits 404, admin elevation requires step-up, sessions and
  refresh tokens revoked on privilege/credential change, before/after
  auditing without secrets.
- Break-glass: concurrent-window and daily caps with audited blocks,
  immediate revocation, privacy-owner notifications and a mandatory
  post-use review; the justification stays in the protected row.
- Audit: per-clinic chain-index continuity verification (detects deleted
  rows even with recomputed hashes); HMAC-signed WORM batch export and
  offline verification (`npm run audit:export` / `audit:verify`).
- PHI encryption: versioned envelope with key ids, rotation and a
  re-encryption job (`npm run phi:reencrypt`); legacy ciphertexts readable.
- Transport: explicit proxy trust (`TRUST_PROXY=true` refused in
  production), forwarded headers alone cannot mark a request secure,
  production sign-in is HTTPS-only.
- Rate limiting: Redis-backed shared budget when `REDIS_URL` is set,
  Retry-After on 429, auth limiter keyed by IP + account.
- FHIR: SMART read scopes per resource, patient-context pinning for
  patient-scoped tokens, purposeOfUse validation.
- AI: instruction-override screening before provider calls (audited in its
  own transaction), `LLM_ALLOWED_MODELS` allowlist, passthrough remains
  fail-closed on the governance record.
- Prompts: immutable version registry with DRAFT -> PENDING_APPROVAL ->
  ACTIVE -> RETIRED, dual-control approval (author cannot approve) and
  audited activation that retires the previous active version.

### Reliability and operations (P2)

- Deterministic test database via `docker-compose.test.yml` (PostgreSQL 17);
  a missing database fails hard when `REQUIRE_DB=1`; explicit unit,
  integration and authorization test scripts; Vite dev middleware no longer
  starts under tests (no port collisions); CI fixed to PostgreSQL 17 with
  E2E on pull requests.
- Performance: keyset cursor for the audit trail, statement timeout inside
  every tenant transaction, composite indexes for the hot query paths,
  circuit breaker on AI provider calls.
- Availability: `/health/live` and `/health/ready` (draining-aware),
  graceful shutdown with drain, PHI-free per-route latency metrics at
  `/metrics-lite`, restore drill script with consistency, RLS and
  decryptability checks.

### Documentation

- `docs/compliance/`: CH FADP, EU GDPR, UK GDPR/DPA, US HIPAA, Canada
  PIPEDA/provincial, Australia Privacy Act, Singapore PDPA, cross-border
  data map, retention matrix, DSAR operational runbook - technical
  mappings that leave compliance statements to professional review.
- `docs/threat-model.md` and `docs/adr/decisions.md`;
  `ops/runbooks/audit-export.md`; README security and testing sections
  updated.
