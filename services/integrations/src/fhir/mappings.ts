/**
 * FHIR R4 mapping layer (FHIR-001 / FHIR-002).
 *
 * Maps the internal neutral model to HL7 FHIR R4 resources for
 * interoperability. This is a mapping layer, not a certification: payload
 * shapes follow R4 structural rules and swiss profiles are a target, not a
 * claim. Every export is audited by the API layer.
 */

export const FHIR_VERSION = "4.0.1";

export interface FhirResource {
  resourceType: string;
  id?: string;
  [key: string]: unknown;
}

export interface FhirBundleEntry {
  fullUrl?: string;
  resource: FhirResource;
}

export interface FhirBundle {
  resourceType: "Bundle";
  type: "searchset" | "collection";
  total?: number;
  entry: FhirBundleEntry[];
}

const fhirInstant = (iso: string): string => iso;
const fhirDate = (iso: string | null): string | undefined =>
  iso ? iso.slice(0, 10) : undefined;

// ---------------------------------------------------------------------------
// Patient
// ---------------------------------------------------------------------------

export const toFhirPatient = (
  p: {
    id: string;
    internalRef: string;
    fullName: string;
    sex: string | null;
    birthDate: string | null;
    phone: string | null;
    email: string | null;
    address: string | null;
  },
  baseUrl: string,
): FhirResource => {
  const [family, ...given] = p.fullName.split(" ").reverse();
  const resource: FhirResource = {
    resourceType: "Patient",
    id: p.id,
    identifier: [
      {
        use: "usual",
        type: { text: "Internal identifier" },
        system: `${baseUrl}/identifier/patient-internal`,
        value: p.internalRef,
      },
    ],
    active: true,
    name: [{ family: family ?? "", given: given.reverse().length ? given.reverse() : undefined }],
    gender: p.sex === "male" || p.sex === "female" ? p.sex : undefined,
    birthDate: fhirDate(p.birthDate),
    telecom: [
      ...(p.phone ? [{ system: "phone", value: p.phone }] : []),
      ...(p.email ? [{ system: "email", value: p.email }] : []),
    ],
    address: p.address ? [{ text: p.address }] : undefined,
  };
  return resource;
};

// ---------------------------------------------------------------------------
// Appointment
// ---------------------------------------------------------------------------

const APPOINTMENT_TYPE_CODE: Record<string, { code: string; display: string }> = {
  NEW_PATIENT: { code: "NEWPAT", display: "New patient consultation" },
  FOLLOW_UP: { code: "FOLLOWUP", display: "Follow-up consultation" },
  ANNUAL_CHECKUP: { code: "CHECKUP", display: "Annual check-up" },
  PROCEDURE: { code: "PROC", display: "Procedure" },
  OTHER: { code: "GEN", display: "General consultation" },
};

const APPOINTMENT_STATUS_FHIR: Record<string, string> = {
  CANCELLED: "cancelled",
  COMPLETED: "fulfilled",
  NO_SHOW: "noshow",
  SCHEDULED: "booked",
  CONFIRMED: "booked",
  CHECKED_IN: "checked-in",
  IN_PROGRESS: "waitqueue",
};

export const toFhirAppointment = (
  a: { id: string; patientId: string; doctorId: string; type: string; startTime: string; endTime: string; status: string; reason: string | null },
): FhirResource => ({
  resourceType: "Appointment",
  id: a.id,
  status: APPOINTMENT_STATUS_FHIR[a.status] ?? "pending",
  serviceType: APPOINTMENT_TYPE_CODE[a.type]
    ? [{ coding: [{ system: "http://terminology.hl7.org/CodeSystem/service-type", ...APPOINTMENT_TYPE_CODE[a.type] }] }]
    : undefined,
  start: fhirInstant(a.startTime),
  end: fhirInstant(a.endTime),
  description: a.reason ?? undefined,
  participant: [
    { actor: { reference: `Patient/${a.patientId}` }, status: "accepted" },
    { actor: { reference: `Practitioner/${a.doctorId}` }, status: "accepted" },
  ],
});

// ---------------------------------------------------------------------------
// Encounter
// ---------------------------------------------------------------------------

export const toFhirEncounter = (
  e: { id: string; patientId: string; doctorId: string; appointmentId: string | null; status: string; createdAt: string },
): FhirResource => ({
  resourceType: "Encounter",
  id: e.id,
  status: e.status === "SIGNED" || e.status === "AMENDED" ? "finished" : "in-progress",
  class: { system: "http://terminology.hl7.org/CodeSystem/v3-ActCode", code: "AMB", display: "ambulatory" },
  subject: { reference: `Patient/${e.patientId}` },
  participant: [{ individual: { reference: `Practitioner/${e.doctorId}` } }],
  appointment: e.appointmentId ? [{ reference: `Appointment/${e.appointmentId}` }] : undefined,
  period: { start: fhirInstant(e.createdAt) },
});

// ---------------------------------------------------------------------------
// Condition (problems)
// ---------------------------------------------------------------------------

const ICD10_SYSTEM = "http://hl7.org/fhir/sid/icd-10";
const SNOMED_SYSTEM = "http://snomed.info/sct";

export const toFhirCondition = (
  p: { id: string; patientId: string; codingSystem: string; code: string; display: string; status: string; onsetDate: string | null; createdAt: string },
): FhirResource => ({
  resourceType: "Condition",
  id: p.id,
  clinicalStatus: {
    coding: [
      {
        system: "http://terminology.hl7.org/CodeSystem/condition-clinical",
        code: p.status === "ACTIVE" ? "active" : p.status === "RESOLVED" ? "resolved" : "inactive",
      },
    ],
  },
  code: {
    coding: [
      {
        system: p.codingSystem === "SNOMED_CT" ? SNOMED_SYSTEM : ICD10_SYSTEM,
        code: p.code,
        display: p.display,
      },
    ],
    text: p.display,
  },
  subject: { reference: `Patient/${p.patientId}` },
  onsetDateTime: p.onsetDate ? fhirInstant(p.onsetDate) : undefined,
  recordedDate: fhirInstant(p.createdAt),
});

// ---------------------------------------------------------------------------
// Observation
// ---------------------------------------------------------------------------

const LOINC_BY_OBSERVATION: Record<string, { code: string; display: string }> = {
  PULSE: { code: "8867-4", display: "Heart rate" },
  TEMPERATURE: { code: "8310-5", display: "Body temperature" },
  BP_SYSTOLIC: { code: "8480-6", display: "Systolic blood pressure" },
  BP_DIASTOLIC: { code: "8462-4", display: "Diastolic blood pressure" },
  WEIGHT: { code: "29463-7", display: "Body weight" },
  HEIGHT: { code: "8302-2", display: "Body height" },
  BMI: { code: "39156-5", display: "Body mass index" },
};

export const toFhirObservation = (
  o: { id: string; patientId: string; encounterId: string | null; type: string; loincCode: string | null; value: string; unit: string | null; effectiveAt: string },
): FhirResource => {
  const loinc = o.loincCode
    ? { code: o.loincCode, display: LOINC_BY_OBSERVATION[o.type]?.display ?? o.type }
    : LOINC_BY_OBSERVATION[o.type];
  return {
    resourceType: "Observation",
    id: o.id,
    status: "final",
    code: {
      coding: loinc
        ? [{ system: "http://loinc.org", code: loinc.code, display: loinc.display }]
        : [{ text: o.type }],
      text: LOINC_BY_OBSERVATION[o.type]?.display ?? o.type.toLowerCase().replace(/_/g, " "),
    },
    subject: { reference: `Patient/${o.patientId}` },
    encounter: o.encounterId ? { reference: `Encounter/${o.encounterId}` } : undefined,
    effectiveDateTime: fhirInstant(o.effectiveAt),
    valueString: o.value,
    ...(o.unit ? { valueQuantity: { value: Number(o.value) || undefined, unit: o.unit } } : {}),
  };
};

// ---------------------------------------------------------------------------
// AllergyIntolerance / MedicationRequest / Practitioner / Organization / AuditEvent
// ---------------------------------------------------------------------------

export const toFhirAllergyIntolerance = (
  a: { id: string; patientId: string; substance: string; reaction: string | null; severity: string | null; status: string; recordedAt: string },
): FhirResource => ({
  resourceType: "AllergyIntolerance",
  id: a.id,
  clinicalStatus: {
    coding: [
      {
        system: "http://terminology.hl7.org/CodeSystem/allergyintolerance-clinical",
        code: a.status === "ACTIVE" ? "active" : "inactive",
      },
    ],
  },
  code: { text: a.substance },
  patient: { reference: `Patient/${a.patientId}` },
  reaction: a.reaction ? [{ manifestation: [{ text: a.reaction }] }] : undefined,
  criticality: a.severity === "SEVERE" ? "high" : a.severity === "MILD" ? "low" : "unable-to-assess",
  recordedDate: fhirInstant(a.recordedAt),
});

export const toFhirMedicationRequest = (
  m: { id: string; patientId: string; encounterId: string | null; medicationName: string; dose: string | null; frequency: string | null; status: string; createdAt: string },
): FhirResource => ({
  resourceType: "MedicationRequest",
  id: m.id,
  status: m.status === "ACTIVE" ? "active" : m.status === "COMPLETED" ? "completed" : m.status === "CANCELLED" ? "cancelled" : "draft",
  intent: "order",
  medicationCodeableConcept: { text: m.medicationName },
  subject: { reference: `Patient/${m.patientId}` },
  encounter: m.encounterId ? { reference: `Encounter/${m.encounterId}` } : undefined,
  dosageInstruction: m.dose || m.frequency
    ? [{ text: [m.dose, m.frequency].filter(Boolean).join(", ") }]
    : undefined,
  authoredOn: fhirInstant(m.createdAt),
});

export const toFhirPractitioner = (u: { id: string; fullName: string }): FhirResource => {
  const [family, ...given] = u.fullName.split(" ").reverse();
  return {
    resourceType: "Practitioner",
    id: u.id,
    active: true,
    name: [{ family: family ?? "", given: given.reverse().length ? given.reverse() : undefined }],
  };
};

export const toFhirOrganization = (c: { id: string; name: string; phone: string | null; email: string | null; address: string | null }): FhirResource => ({
  resourceType: "Organization",
  id: c.id,
  name: c.name,
  telecom: [
    ...(c.phone ? [{ system: "phone", value: c.phone }] : []),
    ...(c.email ? [{ system: "email", value: c.email }] : []),
  ],
  address: c.address ? [{ text: c.address }] : undefined,
});

export const toFhirAuditEvent = (
  a: { id: string; action: string; createdAt: string; actorId: string | null; subjectPatientId: string | null; category: string },
): FhirResource => ({
  resourceType: "AuditEvent",
  id: a.id,
  type: {
    system: "http://terminology.hl7.org/CodeSystem/audit-event-type",
    code: "rest",
    display: "RESTful operation",
  },
  subtype: [{ system: `${"http://medical-saas.local/actions"}`, code: a.action }],
  action: "E",
  recorded: fhirInstant(a.createdAt),
  agent: a.actorId ? [{ who: { reference: `Practitioner/${a.actorId}` } }] : undefined,
  entity: a.subjectPatientId ? [{ what: { reference: `Patient/${a.subjectPatientId}` } }] : undefined,
});

// ---------------------------------------------------------------------------
// CapabilityStatement + Bundle helpers
// ---------------------------------------------------------------------------

export const capabilityStatement = (baseUrl: string): FhirResource => ({
  resourceType: "CapabilityStatement",
  status: "active",
  date: new Date().toISOString(),
  kind: "instance",
  software: { name: "Medical SaaS Boilerplate" },
  implementation: { url: baseUrl, description: "FHIR R4 mapping layer (sandbox)" },
  fhirVersion: FHIR_VERSION,
  format: ["json"],
  rest: [
    {
      mode: "server",
      resource: [
        { type: "Patient", interaction: [{ code: "read" }, { code: "search-type" }] },
        { type: "Practitioner", interaction: [{ code: "read" }, { code: "search-type" }] },
        { type: "Organization", interaction: [{ code: "read" }] },
        { type: "Appointment", interaction: [{ code: "read" }, { code: "search-type" }] },
        { type: "Encounter", interaction: [{ code: "read" }, { code: "search-type" }] },
        { type: "Condition", interaction: [{ code: "read" }, { code: "search-type" }] },
        { type: "Observation", interaction: [{ code: "read" }, { code: "search-type" }] },
        { type: "AllergyIntolerance", interaction: [{ code: "read" }, { code: "search-type" }] },
        { type: "MedicationRequest", interaction: [{ code: "read" }, { code: "search-type" }] },
        { type: "AuditEvent", interaction: [{ code: "search-type" }] },
      ],
    },
  ],
});

export const bundle = (type: "searchset" | "collection", entries: FhirResource[], baseUrl: string): FhirBundle => ({
  resourceType: "Bundle",
  type,
  total: entries.length,
  entry: entries.map((resource) => ({
    fullUrl: `${baseUrl}/fhir/${resource.resourceType}/${resource.id}`,
    resource,
  })),
});

// ---------------------------------------------------------------------------
// Terminology bridge (FHIR-002): governed seed map ICD-10 <-> SNOMED CT
// ---------------------------------------------------------------------------

export interface ConceptMapEntry {
  icd10: string;
  snomed: string;
  display: string;
}

export const ICD10_SNOMED_SEED: ConceptMapEntry[] = [
  { icd10: "I10", snomed: "38341003", display: "Essential hypertension" },
  { icd10: "E11", snomed: "44054006", display: "Type 2 diabetes mellitus" },
  { icd10: "J45", snomed: "207260004", display: "Asthma" },
  { icd10: "E66", snomed: "237840003", display: "Obesity" },
  { icd10: "K21", snomed: "235601009", display: "Gastro-esophageal reflux disease" },
  { icd10: "J20", snomed: "195967001", display: "Acute bronchitis" },
  { icd10: "M54.5", snomed: "391160024", display: "Low back pain" },
  { icd10: "G43", snomed: "3860007", display: "Migraine" },
  { icd10: "F41.1", snomed: "19600002", display: "Generalized anxiety disorder" },
  { icd10: "F32", snomed: "370143000", display: "Major depressive disorder" },
];

export const mapIcd10ToSnomed = (icd10: string): ConceptMapEntry | null =>
  ICD10_SNOMED_SEED.find((e) => e.icd10 === icd10) ?? null;

export const mapSnomedToIcd10 = (snomed: string): ConceptMapEntry | null =>
  ICD10_SNOMED_SEED.find((e) => e.snomed === snomed) ?? null;
