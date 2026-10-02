# Australia: Privacy Act and Australian Privacy Principles implementation notes

Status: technical and operational mapping only. Compliance for a specific
deployment requires evaluation by legal counsel, the privacy officer, the
clinical owner, the CISO and an independent auditor.

## What the regime demands of this system

Health information is "sensitive information" under the Privacy Act. The
APPs require consent or another permitted situation for collection of
health data, purpose limitation, security of information, access and
correction rights, and notification of eligible data breaches (Notifiable
Data Breaches scheme).

## Controls implemented in this codebase

| APP | Where it lives |
| --- | --- |
| APP 3 collection | Consent records per purpose; AI processing is fail-closed without a positive consent |
| APP 5 notification | The audit trail records what was collected and who accessed it, supporting privacy notice content |
| APP 6 use/disclosure | Care-team relationship limits clinical access; directory-only projection for reception roles |
| APP 11 security | Encrypted PHI fields with envelope rotation; MFA and step-up; session revocation; hash-chained audit with continuity checks |
| APP 12 access | Governed DSAR flow with dual control and one-time download token |
| APP 13 correction | Amendment flow: the original signed note is preserved, corrections are versioned, attributed and signed |
| NDB scheme | Incident response runbook plus the audit export as tamper-evident evidence for assessment |

## Deployment considerations

- Australian deployments should confirm hosting region (see the
  cross-border data map) and APP 8 accountability for any offshore
  subprocessor, including AI providers.
- My Health Record or state eHealth integrations carry additional
  obligations outside this boilerplate's scope.

## Open items that need a person, not code

- APP privacy policy content for the actual deployment.
- OAIC registration duties for the entity.
- Breach assessment workflow alignment with the 30-day assessment window.

## Cross-references

- `docs/compliance/cross-border-data-map.md`
- `ops/runbooks/incident-response.md`
