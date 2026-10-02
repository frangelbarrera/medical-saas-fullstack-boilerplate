# Singapore: PDPA implementation notes

Status: technical and operational mapping only. Compliance for a specific
deployment requires evaluation by legal counsel, the DPO, the clinical
owner, the CISO and an independent auditor.

## What the regime demands of this system

Health data falls under the PDPA's increased sensitivity regime. The PDPA
requires consent (or a legislative exception such as the healthcare
exception), purpose limitation, protection obligations, retention
limitation, access and correction rights, data breach notification to the
PDPC, and transfer limitation for data leaving Singapore.

## Controls implemented in this codebase

| PDPA obligation | Where it lives |
| --- | --- |
| Consent | Typed, per-purpose consent records with expiry; AI generation blocked without positive consent |
| Purpose limitation | Purpose attribution on every audited patient-data access; FHIR purposeOfUse validation |
| Protection | AES-256-GCM field encryption, envelope key rotation, MFA, step-up re-authentication, session revocation, distributed rate limiting |
| Retention limitation | Per-clinic retention years configuration; retention matrix documents the mapping work per record class |
| Access and correction | Governed DSAR flow (dual control, one-time download); amendment flow for corrections with immutable history |
| Data breach notification | Incident response runbook; audit export provides the evidence timeline |
| Transfer limitation | Cross-border data map; AI governance gate records processing location and is fail-closed without it |

## Deployment considerations

- Singapore deployments should confirm the healthcare exception applies or
  obtain explicit consent for each purpose; the consent model supports
  both paths.
- The PDPC's advisory guidelines for healthcare set expectations on
  cloud usage: document hosting and subprocessors in the data map.

## Open items that need a person, not code

- DPO appointment (mandatory under the PDPA).
- Breach notification thresholds and 72-hour internal escalation drill.
- Transfer impact assessment for hosting and AI subprocessors.

## Cross-references

- `docs/compliance/cross-border-data-map.md`
- `docs/compliance/records-retention-matrix.md`
- `docs/compliance/dsar-operational-runbook.md`
