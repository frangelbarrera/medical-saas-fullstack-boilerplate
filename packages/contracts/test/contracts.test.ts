import { describe, expect, it } from "vitest";
import {
  loginRequest,
  patientCreate,
  appointmentCreate,
  invoiceCreate,
  encounterUpdate,
  changePasswordRequest,
  paginationQuery,
  auditQuery,
  roleCan,
  capabilitiesForRole,
} from "@medical/contracts";

describe("contracts", () => {
  it("accepts a valid login payload", () => {
    const parsed = loginRequest.parse({ username: "keller", password: "secret-value-1" });
    expect(parsed.username).toBe("keller");
  });

  it("rejects an invalid email on patient create", () => {
    expect(() =>
      patientCreate.parse({ fullName: "Test Person", email: "not-an-email" }),
    ).toThrowError();
  });

  it("rejects appointment durations below the minimum", () => {
    expect(() =>
      appointmentCreate.parse({
        patientId: "b3e22b20-b440-4fe6-9548-433a14f1b186",
        doctorId: "6460d447-1416-4642-92e2-196003ae88b5",
        startTime: "2026-10-01T08:30:00.000Z",
        durationMinutes: 3,
      }),
    ).toThrowError(/duration/i);
  });

  it("requires at least one invoice item", () => {
    expect(() =>
      invoiceCreate.parse({ patientId: "b3e22b20-b440-4fe6-9548-433a14f1b186", items: [] }),
    ).toThrowError();
  });

  it("caps encounter title length", () => {
    expect(() => encounterUpdate.parse({ title: "x".repeat(201) })).toThrowError();
  });

  it("enforces password policy on change", () => {
    expect(() =>
      changePasswordRequest.parse({ currentPassword: "aaaaaaaaaaaa1", newPassword: "short1" }),
    ).toThrowError();
    expect(() =>
      changePasswordRequest.parse({ currentPassword: "aaaaaaaaaaaa1", newPassword: "aaaaaaaaaaaa1" }),
    ).toThrowError(/differ/);
  });

  it("applies pagination defaults", () => {
    expect(paginationQuery.parse({})).toEqual({ page: 1, limit: 25 });
  });

  it("coerces query strings from express", () => {
    expect(auditQuery.parse({ page: "3", limit: "50" })).toMatchObject({ page: 3, limit: 50 });
  });
});

describe("capability model", () => {
  it("gives doctors clinical signing but not administration", () => {
    expect(roleCan("DOCTOR", "clinical:sign")).toBe(true);
    expect(roleCan("DOCTOR", "admin:users")).toBe(false);
  });

  it("scopes secretaries to scheduling and billing", () => {
    expect(roleCan("SECRETARY", "schedule:write")).toBe(true);
    expect(roleCan("SECRETARY", "clinical:read")).toBe(false);
  });

  it("keeps portal users strictly self-scoped", () => {
    expect(capabilitiesForRole("PATIENT")).toEqual(["portal:self"]);
  });
});
