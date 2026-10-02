# Canada: PIPEDA and provincial health privacy implementation notes

Status: technical and operational mapping only. Compliance for a specific
deployment requires evaluation by legal counsel, the privacy officer, the
clinical owner, the CISO and an independent auditor.

## Why provincial matters

PIPEDA is the federal baseline for private-sector commercial activity, but
health data in Canada is largely governed by provincial laws (for example
PHIPA in Ontario, HIA in Alberta, PIPA in British Columbia plus E-Health
and custodial rules). A multi-province SaaS must treat jurisdiction as a
configuration dimension, not an afterthought.

## Controls implemented in this codebase

| Requirement | Where it lives |
| --- | --- |
| Consent per purpose | Typed consent records (treatment, sharing, AI, communication) with granted/refused/expired states and audit trail |
| Limiting use to purpose | FHIR purpose-of-use validation; audit events carry the purpose of every access |
| Safeguards | Encrypted PHI at rest with key rotation, MFA, step-up re-authentication, session revocation, rate limiting |
| Openness and access | Governed DSAR flow (prepare, approve by a second person, one-time download) |
| Accountability | Hash-chained audit log with continuity verification and signed export batches for external review |
| Jurisdiction as config | `clinic.jurisdiction` selects the compliance pack; timezone and retention are per clinic |

## Deployment considerations

- Identify the custodian (usually the physician or clinic) and set the
  agent relationship in contracts with the software vendor.
- Provincial rules may mandate data residency in Canada: use the residency
  governance variables and the cross-border data map to document hosting.
- Some provinces require specific breach reporting to the regulator;
  wire the incident runbook to the provincial process.

## Open items that need a person, not code

- Provincial legal review per deployment province.
- Custodian/agent agreements.
- Residency confirmation for hosting, backups and AI subprocessors.

## Cross-references

- `docs/compliance/cross-border-data-map.md`
- `docs/compliance/dsar-operational-runbook.md`
