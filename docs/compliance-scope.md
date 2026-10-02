**Maintainer:** Frangel Raúl Crespo Barrera
**Last verified:** 2026-10-02
**Scope:** ePHI assumptions, roles, tenant isolation, authentication, encryption, audit, retention, backups, deletion/export, providers, and BAA requirements.

| Field | Current record |
|---|---|
| Status | Boilerplate explicitly does not certify HIPAA, GDPR, FADP, or ISO 27001. Tests are distributed across packages and services. |
| Evidence | `services/api/test/`, `services/data/test/`, `services/domain/test/`, `services/integrations/test/`, `packages/contracts/test/`, `SECURITY.md`, `ci.yml`. |
| Verification | Run the documented unit/integration/E2E commands; review deployment and provider configuration separately. |
| Owner | Repository owner for the template; deployer and legal/compliance owners for a real service. |
| Limitations | Legal review, risk analysis, safeguards, contracts, and operational evidence are required before any compliance claim. |

Do not use real patient data in tests, examples, or development. Document actual data flows, retention, deletion/export, subprocessors, incident response, and backups for each deployment.
