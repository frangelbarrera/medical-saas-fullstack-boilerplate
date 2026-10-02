# EU GDPR implementation notes

Status: technical and operational mapping only. Compliance for a specific
deployment requires evaluation by legal counsel, the DPO, the clinical
owner, the CISO and an independent auditor.

## What the regulation demands of this system

Article 9 treats health data as a special category. The controller needs an
Article 9(2) legal basis (typically explicit consent or health-care
provision), a DPIA for high-risk processing, processors under Article 28,
breach notification within 72 hours, and data-subject rights handling.

## Controls implemented in this codebase

| Requirement | Where it lives |
| --- | --- |
| Art. 9 legal basis | Consent records with type and status; AI processing refuses to run without a positive, unexpired AI_PROCESSING consent; absence of refusal is never treated as consent |
| Art. 5(1)(c) minimization | Encrypted-at-rest PHI, directory-only projections for non-clinical roles, minimum-necessary FHIR scopes |
| Art. 5(1)(f) integrity | Per-clinic hash-chained audit log; continuity verification detects deleted rows; HMAC-signed export batches for external WORM storage |
| Art. 32 security | AES-256-GCM field encryption with envelope key rotation, TOTP MFA, step-up re-authentication, session revocation, distributed rate limiting |
| Art. 15-20 rights | Governed DSAR flow: prepare (encrypted artifact), approve (different person), one-time download token; rectification and objection types supported |
| Art. 33/34 breach readiness | Audit trail + incident response runbook; the audit export provides the tamper-evidence needed for an investigation timeline |
| Art. 28 processors | Provider-neutral AI interface behind DPA/BAA governance variables; passthrough mode is fail-closed without them |
| Chapter V transfers | Cross-border data map documents regions, subprocessors and residency variables; the AI governance gate records processing location |

## Data-subject rights coverage

- ACCESS / EXPORT: governed flow with dual control and one-time download.
- RECTIFICATION: clinical corrections go through the amendment flow so the
  original stays intact and the correction is versioned and signed.
- OBJECTION / RESTRICTION: DSAR types exist; enforcement (e.g. blocking
  AI generation) is via consent status today.
- ERASURE: NOT implemented by design. Health records follow retention law;
  the runbook documents the legal assessment path instead of a delete
  button.

## Open items that need a person, not code

- DPO appointment and privacy notice content.
- Records of processing activities (Art. 30) for the actual deployment.
- DPIA sign-off; subprocessor list review; SCCs where relevant.
- 72-hour breach decision tree validation with the DPO.

## Cross-references

- `docs/compliance/cross-border-data-map.md`
- `docs/compliance/dsar-operational-runbook.md`
- `ops/runbooks/incident-response.md`
