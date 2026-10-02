# ADRs

Compact decision records for the changes introduced in this round. Each
entry: context, decision, consequences.

## ADR-008: Directory/PHI write split

- Context: SECRETARY could read and write the full patient detail,
  including decrypted contacts, identifiers and consents.
- Decision: split `patients:write` into `patients:directory_write` (name,
  status, scheduling links) and `patients:phi_write` (contacts, birth date,
  sex, identifiers, consents). New `/patients/:id/directory` projection
  that never decrypts. Detail endpoint 403s roles without phi_write.
- Consequences: reception workflows keep working through the directory;
  every write is field-scoped server-side; UI hides patient creation for
  directory-only roles.

## ADR-009: Amendment lifecycle

- Context: `amend()` created the replacement note already in AMENDED state,
  which updateContent rejected - the amendment cycle was unusable.
- Decision: the signed original stays SIGNED; the amendment opens as DRAFT
  with `amended_from_id`; the original flips to AMENDED only inside the
  amendment-signing transaction. A partial unique index allows one open
  amendment per note; version races surface as 409.
- Consequences: notes are immutable after signing; corrections follow
  draft -> review -> sign; concurrent amend attempts get a clean conflict.

## ADR-010: Encounter/patient consistency on clinical writes

- Context: clinical resources accepted patientId and encounterId
  independently; reviewedById was client-supplied.
- Decision: every write validates the encounter exists in the tenant and
  belongs to the patient, in the same transaction; medication review stamps
  come from the request context on activation only; order transitions are
  validated (DRAFT -> ACTIVE/CANCELLED -> COMPLETED).
- Consequences: mismatched references are 422; unknown tenant references
  stay 404; the reviewing clinician is always the acting clinician.

## ADR-011: Audit continuity and WORM export

- Context: the hash chain detects edits, but a database administrator
  could delete rows and recompute the tail.
- Decision: a per-clinic `chain_index` (0..N-1, written under the advisory
  lock) makes deletions detectable even with recomputed hashes; export
  batches are HMAC-signed and verifiable offline (`audit:verify`).
- Consequences: continuity verification runs with chain verification;
  operators must schedule exports to immutable storage per the runbook.

## ADR-012: PHI envelope encryption

- Context: a single cached ENCRYPTION_KEY made rotation impossible.
- Decision: versioned envelope `v2:keyId:iv:tag:ct`; the primary key (first
  entry of ENCRYPTION_KEYS) writes; every live key can read; legacy
  3-part ciphertexts keep working through ENCRYPTION_KEY; a re-encryption
  job migrates rows.
- Consequences: rotation is a config change plus a bounded job; GCM
  failures still fail loudly.

## ADR-013: Explicit proxy trust and HTTPS-only sessions

- Context: forwarded headers could mark a request secure.
- Decision: only the explicit TRUST_PROXY configuration feeds Express;
  `TRUST_PROXY=true` is refused in production; sign-in refuses non-HTTPS
  connections in production.
- Consequences: cookie prefixes and Secure flags reflect reality; spoofed
  forwarded headers are inert.

## ADR-014: Distributed rate limiting

- Context: in-memory limiters stop protecting multi-replica deployments.
- Decision: express-rate-limit stores via a Redis adapter when REDIS_URL is
  set (atomic INCR+PEXPIRE windows, namespaced keys); auth limiting keys on
  IP + attempted account; 429s carry Retry-After.
- Consequences: single-replica deployments work unchanged; the cluster
  shares one budget when Redis is present.

## ADR-015: Prompt registry lifecycle

- Context: prompt upserts flipped the active version silently.
- Decision: versions are immutable and move DRAFT -> PENDING_APPROVAL ->
  ACTIVE -> RETIRED; the author cannot approve their own version; approval
  retires the previous active version; every step is audited.
- Consequences: LLM calls always use an explicitly approved version;
  rollback is a new version of an old template through the same control.
