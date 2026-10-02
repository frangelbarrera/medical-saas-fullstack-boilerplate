import { z } from "zod";
import { LOCALES } from "./locales.js";
import { JURISDICTIONS } from "./compliance.js";
import type { Capability } from "./capabilities.js";

// ---------------------------------------------------------------------------
// Shared primitives
// ---------------------------------------------------------------------------

export const uuid = z.string().uuid();
export const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD");
export const isoDateTime = z.string().datetime({ offset: true });

export const paginationQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25),
});
export type PaginationQuery = z.infer<typeof paginationQuery>;

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
  pageCount: number;
}

// ---------------------------------------------------------------------------
// Auth & session
// ---------------------------------------------------------------------------

export const loginRequest = z.object({
  username: z.string().min(1).max(100),
  password: z.string().min(1).max(200),
  deviceLabel: z.string().max(120).optional(),
  /** TOTP second factor; required on login when the user enrolled MFA. */
  totp: z.string().regex(/^\d{6}$/, "Expected a 6-digit code").optional(),
});
export type LoginRequest = z.infer<typeof loginRequest>;

export const stepUpRequest = z.object({
  password: z.string().min(1).max(200),
  totp: z.string().regex(/^\d{6}$/, "Expected a 6-digit code").optional(),
});
export type StepUpRequest = z.infer<typeof stepUpRequest>;

export const totpActivate = z.object({
  code: z.string().regex(/^\d{6}$/, "Expected a 6-digit code"),
});
export type TotpActivate = z.infer<typeof totpActivate>;

export interface SessionProfile {
  userId: string;
  username: string;
  fullName: string;
  role: string;
  clinic: ClinicSummary;
  capabilities: Capability[];
  patientId: string | null; // set for portal (PATIENT) users
}

export interface ClinicSummary {
  id: string;
  name: string;
  locale: string;
  timezone: string;
  currency: string;
}

export const changePasswordRequest = z
  .object({
    currentPassword: z.string().min(1),
    newPassword: z
      .string()
      .min(12, "Password must be at least 12 characters")
      .max(200)
      .regex(/[a-zA-Z]/, "Must include a letter")
      .regex(/[0-9]/, "Must include a digit"),
  })
  .refine((v) => v.currentPassword !== v.newPassword, {
    message: "New password must differ from the current one",
    path: ["newPassword"],
  });
export type ChangePasswordRequest = z.infer<typeof changePasswordRequest>;

// ---------------------------------------------------------------------------
// Clinics
// ---------------------------------------------------------------------------

export const clinicUpdate = z.object({
  name: z.string().min(1).max(160).optional(),
  address: z.string().max(300).optional(),
  phone: z.string().max(40).optional(),
  email: z.string().email().max(160).optional(),
  locale: z.enum(LOCALES).optional(),
  timezone: z.string().max(60).optional(),
  currency: z.enum(["CHF", "EUR", "USD"]).optional(),
  jurisdiction: z.enum(JURISDICTIONS).optional(),
  retentionYears: z.number().int().min(1).max(50).optional(),
});
export type ClinicUpdate = z.infer<typeof clinicUpdate>;

// ---------------------------------------------------------------------------
// Users
// ---------------------------------------------------------------------------

export const userCreate = z.object({
  username: z
    .string()
    .min(3)
    .max(60)
    .regex(/^[a-z0-9._-]+$/i, "Letters, digits, dot, underscore and dash only"),
  password: z.string().min(12).max(200),
  fullName: z.string().min(1).max(160),
  role: z.enum(["ADMIN", "DOCTOR", "SECRETARY"]),
});
export type UserCreate = z.infer<typeof userCreate>;

export const userUpdate = z.object({
  fullName: z.string().min(1).max(160).optional(),
  role: z.enum(["ADMIN", "DOCTOR", "SECRETARY"]).optional(),
  isActive: z.boolean().optional(),
  password: z.string().min(12).max(200).optional(),
});
export type UserUpdate = z.infer<typeof userUpdate>;

export interface UserSummary {
  id: string;
  username: string;
  fullName: string;
  role: string;
  isActive: boolean;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// Search (command palette, UX-003)
// ---------------------------------------------------------------------------

export interface SearchHit {
  kind: "patient" | "action";
  id: string;
  title: string;
  subtitle: string | null;
  /** route or action identifier the client resolves */
  href: string;
}
