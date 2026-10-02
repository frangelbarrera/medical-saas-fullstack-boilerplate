# Records retention matrix

Status: technical template. The retention values below are the defaults in
the schema (`clinic.retentionYears`); legal confirmation per jurisdiction
and record class is required before production use.

## How retention is configured

- Per clinic: `retention_years` (schema default 20 years) covers clinical
  records; adjust per jurisdiction.
- Per category: audit events carry a category (AUTH, PHI, CLINICAL,
  BILLING, AI, ADMIN, EXPORT, SYSTEM) so retention jobs can apply
  category-specific rules without touching the hash chain (the chain must
  be exported to WORM before any expiry-driven deletion).

## Record classes

| Record class | Default | Notes |
| --- | --- | --- |
| Clinical record (encounters, versions, problems, medications, observations, allergies) | 20 years | Align with cantonal/provincial/national medical record retention |
| Patient identity and contacts | 20 years | Usually matches the clinical record |
| Consents | life of record + limitation period | Needed to prove the legal basis of past processing |
| Audit trail | 10+ years, jurisdiction-dependent | Hash chain + WORM batches; export BEFORE any deletion |
| AI drafts and messages | 1-5 years | Includes model and prompt version for traceability |
| Sessions and refresh tokens | 90 days after expiry | Security data, no clinical value |
| DSAR artifacts | 24 hours (artifact), 15 minutes (download token) | By design; request metadata follows audit retention |
| Billing records | 10 years | Align with commercial and tax law |
| Payment webhook events | 90 days | Minimal metadata + payload hash only |

## Deletion workflow (when retention expires)

1. Confirm the legal assessment with counsel; record the decision.
2. Export and verify the affected audit batch to WORM
   (`npm run audit:export`, `npm run audit:verify`).
3. Run the deletion with the same dual-control pattern used for DSARs;
   the deletion itself is audited.
4. Evidence: audit event with the operator, scope and legal reference.

## Review

- Legal confirmation per deployment: _______ Date: _______
