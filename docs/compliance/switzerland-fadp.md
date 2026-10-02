# Switzerland - revised FADP (nFADP) implementation notes

Status: technical and operational mapping only. This document describes
which controls exist in code and configuration. It is NOT a legal opinion,
and compliance in any specific deployment requires review by a lawyer, the
DPO, the clinical owner, the CISO and an independent auditor.

## Scope of the law

The revised Federal Act on Data Protection treats health data as
particularly sensitive personal data. Processing requires a legal basis,
privacy by design and by default, and - for high-risk processing such as
clinical record keeping and AI-assisted drafting - a documented impact
assessment.

## Controls implemented in this codebase

| Requirement | Where it lives |
| --- | --- |
| Legal basis per processing purpose | Patient consent records (TREATMENT, DATA_SHARING, AI_PROCESSING, COMMUNICATION) with GRANTED/REFUSED/EXPIRED states; AI generation is fail-closed without a positive AI_PROCESSING consent |
| Privacy by design | PHI columns are AES-256-GCM encrypted at rest; directory lists and the secretary directory projection never decrypt contact fields |
| Purpose limitation | Every patient-data access is audited with a purpose (TREATMENT, EMERGENCY, OPERATIONS, ...); FHIR reads validate purposeOfUse against the taxonomy |
| Access governance | Capability model plus the care-team relationship: clinicians reach only their patients, administrators only via audited break-glass, secretaries never reach clinical data |
| Data minimization | Patient detail served to non-clinical roles is a directory-only projection; DSAR exports are step-up gated and dual-control |
| Security of processing | Hash-chained audit trail with per-clinic continuity verification and signed WORM batches; session revocation on privilege loss; MFA support |
| Processor obligations | The AI passthrough mode refuses to run without a recorded DPA, approved provider, data residency, zero-retention and DPIA record |

## Configuration surface

- Clinic record: jurisdiction (CH default), retention years, locale, timezone, currency.
- LLM governance variables (see `.env.example`): `LLM_PHI_MODE`, `LLM_DPA_RECORDED`, `LLM_PROVIDER_APPROVED`, `LLM_DATA_RESIDENCY`, `LLM_ZERO_RETENTION`, `LLM_DPIA_RECORDED`, `LLM_ALLOWED_MODELS`.
- Break-glass caps: `BREAK_GLASS_ACTIVE_LIMIT`, `BREAK_GLASS_DAILY_LIMIT`.

## Open items that need a person, not code

- DPIA sign-off with the clinical owner before production go-live.
- Health-Professional information duties and privacy notice wording.
- Data-processing agreements with hosting and LLM providers.
- Retention period confirmation per record class against cantonal health
  record rules; the retention matrix ships as
  `docs/compliance/records-retention-matrix.md`.
- Review of the break-glass post-use workflow by the privacy owner.

## Cross-references

- Threat model: `docs/threat-model.md`
- Retention matrix: `docs/compliance/records-retention-matrix.md`
- DSAR operations: `docs/compliance/dsar-operational-runbook.md`
