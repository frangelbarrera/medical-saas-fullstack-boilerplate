# DSAR operational runbook

Status: operational procedure for the implemented flow. Identity
verification strength and legal edge cases are the DPO's call; this runbook
is the technical path, not legal advice.

## The implemented flow

The DSAR release is a governed, dual-control pipeline
(`services/api/src/routes/dsar.ts`, `services/data/src/repositories/dsar-ai.ts`):

1. PREPARE - a staff member with `dsar:manage` creates a request, then
   prepares an artifact: the full patient bundle is serialized and
   encrypted (AES-256-GCM) into `dsar_artifacts` with a 24-hour lifetime.
2. APPROVE - a DIFFERENT staff member approves. Self-approval is rejected
   by the API. Approval is audited.
3. ISSUE - a one-time download token (15 minutes) is issued; only its hash
   is stored.
4. DOWNLOAD - the token is consumed with a compare-and-set update: replay
   fails. The download is audited.
5. RETIRE - artifacts expire; the legacy direct export endpoint responds
   410 so old integrations fail visibly instead of bypassing the flow.

Every privileged step requires a fresh step-up re-authentication (5-minute
window) with password and TOTP when enrolled.

## Per request type

| Type | What the operator does |
| --- | --- |
| ACCESS / EXPORT | Run the flow above; verify identity before issuing the token |
| RECTIFICATION | Do NOT edit history: use the clinical amendment flow (`POST /encounters/:id/amend`) which versions and signs the correction; directory fields are updated with `patients:phi_write` |
| OBJECTION / RESTRICTION | Record the DSAR; enforcement hooks: consent status (e.g. AI generation blocks on REFUSED), care-team membership changes, patient status |
| ERASURE | NOT automated. Health records follow retention law; produce the retention assessment (`records-retention-matrix.md`) and document the decision |

## Identity verification checklist

- In-portal request: the requester is authenticated and self-scoped; the
  operator matches the account to the patient record.
- Out-of-portal request: verify identity per the clinic's policy (in person
  with ID, or certified channel) BEFORE creating the DSAR; record who
  verified.

## Failure and escalation

- Artifact expired or token replayed: re-run prepare + approve; the audit
  trail shows the failed attempt.
- Any suspicion of unauthorized access during handling: freeze the request,
  escalate per `ops/runbooks/incident-response.md`.

## Evidence for the regulator

The audit events `DSAR_CREATED`, `DSAR_ARTIFACT_PREPARED`,
`DSAR_ARTIFACT_APPROVED`, `DSAR_DOWNLOAD_ISSUED`, `DSAR_DOWNLOAD_COMPLETED`
carry actor, patient, timestamps and outcomes. Export them with
`/audit/events` and attach the audit verification result
(`/audit/verify`) to the case file.
