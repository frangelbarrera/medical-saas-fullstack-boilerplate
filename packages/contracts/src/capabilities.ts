/**
 * Capability-based authorization.
 *
 * Roles map to capabilities; the UI and the API gate behaviour on
 * capabilities instead of comparing role strings, so a shared view can show
 * different actions per role (UX-002 / ARCH-003).
 */

export const CAPABILITIES = [
  // patients
  "patients:read",
  "patients:write",
  // clinical record
  "clinical:read",
  "clinical:write",
  "clinical:sign",
  "clinical:break_glass",
  // scheduling
  "schedule:read",
  "schedule:write",
  // communications
  "messages:read",
  "messages:write",
  // billing
  "billing:read",
  "billing:write",
  // aggregate analytics
  "insights:read",
  // audit & privacy operations
  "audit:read",
  "dsar:manage",
  // ai assistance (drafts always require clinical review)
  "ai:use",
  // administration
  "admin:users",
  "admin:clinic",
  "admin:integrations",
  // patient portal (self-scoped)
  "portal:self",
] as const;

export type Capability = (typeof CAPABILITIES)[number];

export type Role = "ADMIN" | "DOCTOR" | "SECRETARY" | "PATIENT";

const STAFF_BASE: Capability[] = [
  "patients:read",
  "schedule:read",
  "messages:read",
  "messages:write",
];

const ROLE_CAPABILITIES: Record<Role, Capability[]> = {
  ADMIN: [
    ...STAFF_BASE,
    "patients:write",
    "clinical:read",
    "clinical:write",
    "clinical:sign",
    "clinical:break_glass",
    "schedule:write",
    "billing:read",
    "billing:write",
    "insights:read",
    "audit:read",
    "dsar:manage",
    "ai:use",
    "admin:users",
    "admin:clinic",
    "admin:integrations",
  ],
  DOCTOR: [
    ...STAFF_BASE,
    "patients:write",
    "clinical:read",
    "clinical:write",
    "clinical:sign",
    "clinical:break_glass",
    "schedule:write",
    "billing:read",
    "insights:read",
    "audit:read",
    "ai:use",
  ],
  SECRETARY: [
    ...STAFF_BASE,
    "patients:write",
    "schedule:write",
    "billing:read",
    "billing:write",
  ],
  PATIENT: ["portal:self"],
};

export const capabilitiesForRole = (role: Role): Capability[] =>
  ROLE_CAPABILITIES[role] ?? [];

export const roleCan = (role: Role, capability: Capability): boolean =>
  capabilitiesForRole(role).includes(capability);

/**
 * Patient-portal scope: portal users can only ever touch their own record.
 * The API layer enforces this by rewriting the subject patient id from the
 * session, never from the request.
 */
export const isSelfScoped = (role: Role): boolean => role === "PATIENT";
