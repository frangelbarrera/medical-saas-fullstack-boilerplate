import { describe, expect, it } from "vitest";
import {
  sanitizePatientForLLM,
  sanitizeFreeText,
  toFhirPatient,
  toFhirObservation,
  mapIcd10ToSnomed,
  capabilityStatement,
} from "@medical/integrations";

/**
 * Synthetic PHI corpus (AI-001 redaction suite): all values are fabricated.
 */
const CORPUS = [
  "Marie Schneider has an appointment, her email is marie@example.test",
  "Call +41 79 000 00 01 to confirm the visit",
  "National ID 756.1234.5678.97 on file",
  "Date of birth 1986-02-14 mentioned in the letter",
  "No identifiers in this sentence at all",
];

describe("PHI redaction (strip mode)", () => {
  it("removes all identifiable patterns from free text", () => {
    for (const text of CORPUS) {
      const out = sanitizeFreeText(text, "strip");
      expect(out).not.toMatch(/marie@example\.test/);
      expect(out).not.toMatch(/\+41 79 000 00 01/);
      expect(out).not.toMatch(/756\.1234\.5678\.97/);
      expect(out).not.toMatch(/1986-02-14/);
    }
  });

  it("leaves non-identifying sentences untouched", () => {
    expect(sanitizeFreeText("No identifiers in this sentence at all", "strip")).toBe(
      "No identifiers in this sentence at all",
    );
  });

  it("masks instead of removing in redact mode", () => {
    const out = sanitizeFreeText("Email marie@example.test", "redact");
    expect(out).not.toBe("Email marie@example.test");
    expect(out).toContain("*");
  });

  it("replaces structured patient fields with placeholders", () => {
    const out = sanitizePatientForLLM(
      { name: "Marie Schneider", email: "marie@example.test", phone: "+41 79 000 00 01" },
      "strip",
    );
    expect(out.name).toBe("[PATIENT_NAME]");
    expect(out.email).toBe("[PATIENT_EMAIL]");
    expect(out.phone).toBe("[PATIENT_PHONE]");
  });

  it("passthrough keeps values (documented DPA-only mode)", () => {
    const out = sanitizePatientForLLM({ name: "Marie Schneider" }, "passthrough");
    expect(out.name).toBe("Marie Schneider");
  });
});

describe("FHIR mappings", () => {
  it("maps a patient to a FHIR R4 Patient with internal identifier", () => {
    const resource = toFhirPatient(
      {
        id: "pat-1",
        internalRef: "P-000001",
        fullName: "Marie Schneider",
        sex: "female",
        birthDate: "1986-02-14",
        phone: "+41 79 000 00 01",
        email: null,
        address: null,
      },
      "https://clinic.example",
    );
    expect(resource.resourceType).toBe("Patient");
    expect(resource.identifier[0].value).toBe("P-000001");
    expect(resource.gender).toBe("female");
    expect(resource.birthDate).toBe("1986-02-14");
  });

  it("maps vitals to LOINC-coded observations", () => {
    const resource = toFhirObservation({
      id: "obs-1",
      patientId: "pat-1",
      encounterId: null,
      type: "PULSE",
      loincCode: "8867-4",
      value: "78",
      unit: "bpm",
      effectiveAt: "2026-10-01T08:30:00.000Z",
    });
    expect(resource.resourceType).toBe("Observation");
    expect((resource.code as { coding: { code: string }[] }).coding[0].code).toBe("8867-4");
  });

  it("exposes a capability statement with FHIR 4.0.1", () => {
    const cs = capabilityStatement("https://clinic.example");
    expect(cs.fhirVersion).toBe("4.0.1");
    expect(cs.resourceType).toBe("CapabilityStatement");
  });

  it("maps ICD-10 to SNOMED through the governed seed map", () => {
    expect(mapIcd10ToSnomed("I10")?.snomed).toBe("38341003");
    expect(mapIcd10ToSnomed("ZZZZ")).toBeNull();
  });
});
