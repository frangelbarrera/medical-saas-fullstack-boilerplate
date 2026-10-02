# Threat model

Status: living document, STRIDE per trust boundary. It maps threats to the
controls that actually exist in the code; anything not implemented is an
accepted risk until it ships.

## Assets

- PHI: identity, contacts, clinical notes, problems, medications,
  observations, consents (PostgreSQL, field-encrypted where personal).
- Audit trail: the legal evidence chain.
- Credentials: passwords, TOTP seeds, session and refresh tokens.
- AI prompt templates: clinical instructions under governance.
- Billing records and payment events.

## Trust boundaries

1. Internet -> API gateway (Express). Untrusted.
2. API -> PostgreSQL as the LIMITED `medical_app` role. RLS is the boundary.
3. API -> LLM provider. External processor; de-identified or governed
   passthrough only.
4. Operator -> production env (secrets, database superuser, WORM storage).

## STRIDE findings and controls

| Threat | Vector | Control (implemented) |
| --- | --- | --- |
| Spoofing | Stolen session cookie | Session-bound JWT with server-side revocation; refresh rotation with reuse detection revokes the family; MFA (TOTP) at login; step-up for privileged operations |
| Spoofing | Forged webhook | HMAC over the raw body with timestamp anti-replay window; constant-time compare; unknown providers rejected; no random ids (idempotency by (provider, external_id)) |
| Tampering | DBA edits/deletes audit rows | Hash chain per clinic + per-clinic chain-index continuity check + signed WORM batch export verifiable without the database |
| Tampering | Patient payload references another encounter | Server validates encounter/patient/tenant in the write transaction; cross-tenant references 404 via RLS |
| Repudiation | Staff denies access to a record | Every PHI surface writes an audit event with actor, patient, purpose and outcome; purposes are a validated taxonomy |
| Information disclosure | Secretary reads full PHI | Directory-only projection; detail endpoint 403 without patients:phi_write; responses downgrade to the projection |
| Information disclosure | Outsider doctor reads a patient | Care-team relationship required on every clinical and FHIR surface; break-glass with caps, review and notifications for admins |
| Information disclosure | FHIR scope abuse | SMART scopes enforced per resource; patient-scoped tokens pinned to their patient; purposeOfUse validated |
| Information disclosure | LLM receives PHI without basis | Redaction modes; AI_PROCESSING consent gate; passthrough fail-closed without DPA/provider/residency/zero-retention/DPIA records; prompt-injection screening |
| Denial of service | Login hammering / username enumeration | Rate limiting (Redis-backed when configured) keyed by IP + account; uniform invalid-credentials responses; Retry-After guidance |
| Denial of service | Runaway queries | 30s statement_timeout inside every tenant transaction; circuit breaker on AI calls; paginated lists with caps and keyset cursors |
| Elevation of privilege | Last admin demoted; secret admin elevation | Last-admin guard on demotion and deactivation; admin elevation requires step-up; all sessions revoked on privilege or credential loss |
| Elevation of privilege | Compromised proxy headers | Proxy trust is an explicit list; forwarded headers alone cannot upgrade a request; production sign-in is HTTPS-only |

## Accepted risks (review quarterly)

- In-memory rate limiting when REDIS_URL is unset: single-replica only.
- AI model outputs are untrusted by design; they land as DRAFT content and
  can never sign notes or activate medication orders.
- FHIR surface is read-only; write interactions (e.g. SMART app launch
  against this resource server) are out of scope.
