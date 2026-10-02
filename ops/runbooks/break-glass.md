# Runbook: break-glass access

Break-glass is the audited emergency path to a clinical record when no care
relationship exists. In this codebase it applies to **administrators**:
doctors reach records through their care relationship; portal users are
strictly self-scoped.

## How it works

1. An administrator opening a clinical record receives a `BREAK_GLASS_REQUIRED`
   problem detail (HTTP 403) from the server - enforcement is server-side,
   not cosmetic.
2. The UI shows a reason dialog. The reason must be at least 10 characters
   and meaningful ("covering physician", "urgent audit request", ...).
3. `POST /api/v1/break-glass` records the access with:
   - actor, patient, reason, granted timestamp, 30-minute expiry
   - an audit event `BREAK_GLASS_USED` (category PHI, purpose EMERGENCY) in
     the tamper-evident chain.
4. EVERY clinical PHI surface accepts the administrator only while a
   non-expired break-glass row exists: encounters (read + write + versions),
   problems, allergies, medications, observations, summary, timeline, the
   patient detail with decrypted contacts, and the FHIR surface
   (Patient, AuditEvent, Provenance).

## Operating rules

- The ROUTINE path is the care relationship: a doctor reaches a record
  through an ACTIVE care-team membership or the primary-doctor assignment.
  Book an appointment, document an encounter or assign the primary doctor -
  the membership starts automatically. Break-glass is not a shortcut around
  that model.
- Break-glass is for emergencies and explicitly mandated access only.
- Reviews: weekly, the security officer reads all `BREAK_GLASS_USED` events
  (`GET /api/v1/audit/events?action=BREAK_GLASS_USED`) and confirms each
  reason with the actor.
- Unjustified use is an HR/security incident (see incident-response.md).
- The 30-minute window is deliberate: extend by recording a NEW reason, so
  every extension is individually justified.
