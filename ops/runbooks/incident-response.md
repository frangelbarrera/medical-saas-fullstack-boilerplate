# Runbook: incident response

Operational procedures for security and privacy incidents. Adapt them to
your organisation and practice them before you need them.

## Roles

- **On-call engineer**: executes containment, keeps the timeline.
- **Security officer**: decides notification obligations (FDPIC / GDPR).
- **Clinical lead**: assesses patient-safety impact.

## Detection

Signals to watch (wire them into your monitoring):

- Repeated `AUTH_TOKEN_REUSE_DETECTED` audit events for one account.
- Login failure spikes for one username (`AUTH_LOGIN_FAILURE`).
- `BREAK_GLASS_USED` events outside working hours.
- Unexpected `AUDIT_VERIFIED` failures (`valid: false`).
- `/api/v1/health/ready` reporting `database: down`.

## Containment checklist

1. Freeze the blast radius: revoke sessions of affected accounts
   (`POST /api/v1/auth/logout` per account, or `UPDATE sessions SET
   revoked_at = now()` as the privileged user for bulk).
2. If a database leak is suspected: rotate `JWT_SECRET`, `ENCRYPTION_KEY`
   and `PHI_HMAC_KEY` (see "Key rotation" below) and block egress at the
   network level.
3. Preserve evidence: `GET /api/v1/audit/export` (or a SQL-level copy of
   `audit_logs`) into a write-once location; do not update rows.
4. Take the environment offline only if containment is impossible otherwise.

## Key rotation

`ENCRYPTION_KEY` rotates by re-encrypting: fields encrypted with the old key
must be decrypted with it before switching. Procedure:

1. Run a maintenance window.
2. With the old key active, export affected tables (DSAR export per patient).
3. Set the new key, then run `npm run db:backfill` after re-importing data.
4. Rotate `JWT_SECRET` freely (sessions simply require re-login).
5. Rotate `PHI_HMAC_KEY` and re-run `npm run db:backfill` to re-index search.

## Notification decision (Swiss FADP / GDPR)

- Assess whether the incident likely results in a high risk to the rights
  and freedoms of the affected persons.
- If yes: notify the FDPIC (or the competent EU supervisory authority when
  GDPR applies) without undue delay; inform affected patients unless the
  risk is unlikely to materialise.
- Document the decision and its rationale - including a decision NOT to
  notify.

## Post-incident

- Timeline from audit exports + server logs.
- Corrective actions tracked as issues with owners and deadlines.
- A blameless review within five working days.
