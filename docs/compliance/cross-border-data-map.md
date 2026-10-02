# Cross-border data map

Status: technical and operational template. The deployment fills in the
actual regions, vendors and dates; the reviewer signs it off. This is not a
legal opinion.

## Data inventory

| Data class | Storage | Encryption | Region | Retention |
| --- | --- | --- | --- | --- |
| Patient identity + contacts (PHI) | PostgreSQL, columns `*_enc` | AES-256-GCM field-level, envelope key ids | filled per deployment | per retention matrix |
| Clinical content (notes, problems, medications, observations) | PostgreSQL | tenant isolation (RLS) + at-rest encryption by host | filled per deployment | per retention matrix |
| Audit trail | PostgreSQL `audit_logs` | append-only, hash-chained, exported to WORM | filled per deployment | per retention matrix |
| Sessions + refresh tokens | PostgreSQL | token hashes, rotation with reuse detection | same as application DB | session lifetime |
| AI draft content | PostgreSQL `ai_drafts` | tenant isolation; sanitized inputs per `LLM_PHI_MODE` | same as application DB | per retention matrix |
| DSAR export artifacts | PostgreSQL, GCM ciphertext | AES-256-GCM, one-time download tokens (hash only) | same as application DB | 24h artifact / token 15 min |
| Payment webhook events | PostgreSQL `webhook_events` | metadata + payload hash only (no raw payloads) | same as application DB | operational cleanup |

## Subprocessors to document per deployment

1. Hosting provider (region, SCC/DPA reference, backup region).
2. PostgreSQL backup target (WORM storage, retention, restore drill dates).
3. AI provider (model, region, retention, DPA/BAA reference, training
   opt-out). The deployment refuses passthrough mode without these records.
4. Payment provider (webhook origin, signature scheme, minimal metadata).

## Transfer mechanisms

- Fill in per jurisdiction pack: SCCs, UK IDTA, Canadian residency,
  Australian APP 8 accountability, Singapore transfer limitation.
- The AI governance variables (`LLM_DATA_RESIDENCY`, `LLM_PROVIDER_APPROVED`,
  `LLM_ZERO_RETENTION`) record the processor promises the system enforces
  at runtime.

## Key custody

- PHI envelope keys live in the environment of the API process
  (`ENCRYPTION_KEYS`, primary first). Rotation documented in
  `docs/compliance/records-retention-matrix.md` and the crypto module.
- The audit export HMAC key (`AUDIT_EXPORT_KEY`) belongs to the operator
  running the export, independent from the database.

## Review

- Filled by: _______ (operator) Date: _______
- Reviewed by: _______ (DPO/legal) Date: _______
