# UK GDPR and Data Protection Act 2018 implementation notes

Status: technical and operational mapping only. Compliance for a specific
deployment requires evaluation by legal counsel, the DPO, the clinical
owner, the CISO and an independent auditor.

## What the regime demands of this system

UK GDPR keeps the EU special-category regime for health data with UK
specifics: the ICO's guidance on health research and confidentiality, DPIA
requirements, international transfer mechanisms under UK law, and DPA 2018
schedules (e.g. Schedule 1 for employment/health contexts).

## Controls implemented in this codebase

| Requirement | Where it lives |
| --- | --- |
| Special category conditions | Consent granularity per purpose (treatment, sharing, AI, communication); the AI gate refuses processing without a positive consent |
| Confidentiality of health data | Care-team relationship enforcement on every clinical surface; secretaries receive directory-only projections; break-glass is audited and reviewed |
| DPIA support | The audit trail with purpose attribution and the AI governance records provide the processing inventory evidence |
| Security (UK GDPR Art. 32) | Encrypted PHI, envelope key rotation, MFA and step-up, session revocation, distributed rate limiting, hash-chained audit trail |
| International transfers | `LLM_DATA_RESIDENCY` and the cross-border data map; AI passthrough is fail-closed without a recorded processing location |
| Data-subject rights | Governed DSAR flow with dual control; one-time download tokens; tamper-evident audit for accountability |
| Breach | Incident response runbook; the audit export gives an independent timeline source |

## UK-specific considerations for deployments

- The jurisdiction pack switch (`clinic.jurisdiction`) exists so a UK
  deployment can present its own compliance pack; the pack content itself
  must be reviewed by UK counsel before use.
- NHS interoperability (EPR/FHIR profiles) is out of scope of the
  boilerplate's FHIR surface; the mapping layer follows R4 basics and the
  SMART scopes model, but a UK deployment needs profile validation work.

## Open items that need a person, not code

- ICO registration and fee.
- UK representative if the controller is outside the UK.
- Transfer risk assessment for hosting and AI subprocessors.
- DPIA sign-off with the clinical owner.

## Cross-references

- `docs/compliance/eu-gdpr.md` (shared structure; UK specifics above)
- `docs/compliance/cross-border-data-map.md`
- `docs/compliance/records-retention-matrix.md`
