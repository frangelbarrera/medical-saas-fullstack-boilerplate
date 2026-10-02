# US HIPAA implementation notes

Status: technical and operational mapping only. This project DOES NOT claim
HIPAA compliance. A deployment is HIPAA-covered only after a Security Rule
risk analysis, implemented administrative/physical/technical safeguards,
Business Associate Agreements with every vendor touching PHI, and a
documented breach notification process, reviewed by counsel.

## What the rules demand of this system

The Privacy Rule limits PHI use and disclosure to the minimum necessary.
The Security Rule demands technical safeguards: access control, audit
controls, integrity, transmission security. The Breach Notification Rule
demands detection, reporting and mitigation.

## Technical safeguards present in this codebase

| Rule reference | Where it lives |
| --- | --- |
| Access control (164.312(a)) | Capability model + care-team relationship + break-glass with justification and review; unique user accounts; MFA via TOTP |
| Audit controls (164.312(b)) | Hash-chained audit log on every PHI surface with actor, patient, purpose and outcome; continuity verification; signed WORM export |
| Integrity (164.312(c)) | AES-256-GCM authenticated encryption of PHI fields; encounter amendment flow preserves the signed original with versioned, attributed corrections |
| Person or entity authentication | Session JWT bound to a server-side session with revocation; refresh token rotation with reuse detection |
| Transmission security (164.312(e)) | HTTPS-only sessions in production; explicit proxy trust; Secure cookies |
| Minimum necessary | Directory-only projections for non-clinical roles; FHIR minimum-necessary projections; DSAR step-up and dual control |
| Business associates | AI provider behind an approval gate (DPA/BAA record required for passthrough mode); provider-neutral webhook inbox keeps only minimal metadata |

## Deliberate gaps a deployment must close

- BAAs with the hosting provider, the LLM provider and any backup vendor.
- Physical and administrative safeguards (workstation policy, training,
  sanction policy) are organizational, not code.
- The risk analysis (164.308(a)(1)(ii)(A)) must be performed for the actual
  environment.
- Breach notification workflows to HHS/OCR and individuals must be set up
  by the covered entity.

## Cross-references

- `docs/compliance/records-retention-matrix.md`
- `ops/runbooks/incident-response.md`
- `docs/threat-model.md`
