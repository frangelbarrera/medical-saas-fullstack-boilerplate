/**
 * API client: fetch wrapper with cookie auth + CSRF header, RFC 9457
 * problem-details parsing and typed helpers for every endpoint group.
 */
import type {
  Appointment,
  AuditEvent,
  AuditVerification,
  BillingSummary,
  ChatMessage,
  ClinicalSummary,
  DaybookOverview,
  DsarRequest,
  Encounter,
  EncounterVersionInfo,
  Expense,
  Invoice,
  Message,
  NotificationItem,
  Paginated,
  PatientDetail,
  PatientListItem,
  PatientSearchQuery,
  Payment,
  Problem,
  Allergy,
  MedicationOrder,
  Observation,
  SessionProfile,
  ThreadSummary,
  TimelineEvent,
  AiDraft,
  PromptTemplate,
  Payer,
  SearchHit,
} from "@medical/contracts";

// API origin: relative by default (same-origin deployments, the Docker
// image and the local dev server). Static hosts can point at a separate
// API origin by building with VITE_API_URL, e.g.
//   VITE_API_URL=https://api.clinic.example npm run build
// The target origin must match the API's FRONTEND_URL and run on a
// same-site domain - session cookies are SameSite=Lax (TLS-001).
const BASE = `${import.meta.env.VITE_API_URL ?? ""}/api/v1`;

export class ApiProblem extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public errors?: { field: string; message: string }[],
    /** Safe RFC 9457 extensions (e.g. name/internalRef for the access gate). */
    public meta?: Record<string, string | number | boolean | null>,
  ) {
    super(message);
    this.name = "ApiProblem";
  }
}

const csrfToken = (): string => {
  const match = document.cookie.match(/(?:^|;\s*)csrf_token=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : "";
};

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method,
    credentials: "same-origin",
    headers: {
      ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      ...(method !== "GET" ? { "x-csrf-token": csrfToken() } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (res.status === 204) return undefined as T;
  const data = (await res.json().catch(() => null)) as
    | (T & { code?: string; title?: string; errors?: { field: string; message: string }[] })
    | null;
  if (!res.ok) {
    if (res.status === 401 && !path.startsWith("/auth/")) {
      window.dispatchEvent(new CustomEvent("auth:expired"));
    }
    throw new ApiProblem(
      res.status,
      (data as { code?: string })?.code ?? "INTERNAL",
      (data as { title?: string })?.title ?? "Request failed",
      (data as { errors?: { field: string; message: string }[] })?.errors,
      (data as { meta?: Record<string, string | number | boolean | null> })?.meta,
    );
  }
  return data as T;
}

export const api = {
  // auth
  login: (username: string, password: string) =>
    request<SessionProfile & { csrfToken: string }>("POST", "/auth/login", { username, password }),
  logout: () => request<{ ok: boolean }>("POST", "/auth/logout"),
  session: () => request<SessionProfile>("GET", "/auth/session"),
  changePassword: (currentPassword: string, newPassword: string) =>
    request<{ ok: boolean }>("POST", "/auth/password", { currentPassword, newPassword }),

  // patients
  patients: (q: Partial<PatientSearchQuery>) =>
    request<Paginated<PatientListItem>>("GET", `/patients?${toQuery(q as Record<string, unknown>)}`),
  patient: (id: string) => request<PatientDetail>("GET", `/patients/${id}`),
  createPatient: (input: unknown) => request<PatientDetail>("POST", "/patients", input),
  updatePatient: (id: string, input: unknown) => request<PatientDetail>("PUT", `/patients/${id}`, input),
  archivePatient: (id: string) => request<{ ok: boolean }>("POST", `/patients/${id}/archive`),
  setConsent: (id: string, input: { type: string; status: string }) =>
    request<{ ok: boolean }>("PUT", `/patients/${id}/consents`, input),

  // scheduling
  appointments: (from: string, to: string) =>
    request<{ items: Appointment[] }>("GET", `/appointments?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`),
  createAppointment: (input: unknown) => request<Appointment>("POST", "/appointments", input),
  updateAppointment: (id: string, input: unknown) => request<Appointment>("PUT", `/appointments/${id}`, input),
  setAppointmentStatus: (id: string, status: string) =>
    request<Appointment>("PATCH", `/appointments/${id}/status`, { status }),
  daybook: () => request<DaybookOverview>("GET", "/overview/daybook"),
  doctors: () => request<{ items: { id: string; fullName: string }[] }>("GET", "/doctors"),

  // clinical
  encounters: (patientId: string) =>
    request<{ items: Encounter[] }>("GET", `/patients/${patientId}/encounters`),
  encounter: (id: string) => request<Encounter>("GET", `/encounters/${id}`),
  createEncounter: (input: unknown) => request<Encounter>("POST", "/encounters", input),
  updateEncounter: (id: string, input: unknown) => request<Encounter>("PUT", `/encounters/${id}`, input),
  submitEncounter: (id: string) => request<Encounter>("POST", `/encounters/${id}/submit`),
  signEncounter: (id: string) => request<Encounter>("POST", `/encounters/${id}/sign`),
  amendEncounter: (id: string, reason: string) => request<Encounter>("POST", `/encounters/${id}/amend`, { reason }),
  encounterVersions: (id: string) =>
    request<{ items: EncounterVersionInfo[] }>("GET", `/encounters/${id}/versions`),
  summary: (patientId: string) => request<ClinicalSummary>("GET", `/patients/${patientId}/summary`),
  timeline: (patientId: string) => request<{ items: TimelineEvent[] }>("GET", `/patients/${patientId}/timeline`),
  problems: (patientId: string) => request<{ items: Problem[] }>("GET", `/patients/${patientId}/problems`),
  addProblem: (input: unknown) => request<Problem>("POST", "/problems", input),
  setProblemStatus: (id: string, status: string) => request<Problem>("PATCH", `/problems/${id}/status`, { status }),
  allergies: (patientId: string) => request<{ items: Allergy[] }>("GET", `/patients/${patientId}/allergies`),
  addAllergy: (input: unknown) => request<Allergy>("POST", "/allergies", input),
  medications: (patientId: string) => request<{ items: MedicationOrder[] }>("GET", `/patients/${patientId}/medications`),
  addMedication: (input: unknown) => request<MedicationOrder>("POST", "/medications", input),
  setMedicationStatus: (id: string, status: string) =>
    request<MedicationOrder>("PATCH", `/medications/${id}/status`, { status }),
  observations: (patientId: string) => request<{ items: Observation[] }>("GET", `/patients/${patientId}/observations`),
  addObservation: (input: unknown) => request<Observation>("POST", "/observations", input),
  breakGlass: (patientId: string, reason: string) =>
    request<{ ok: boolean }>("POST", "/break-glass", { patientId, reason }),
  careTeam: (patientId: string) =>
    request<{ items: { id: string; userId: string; userName: string; userRole: string; memberRole: string; startedAt: string; endedAt: string | null }[] }>(
      "GET", `/patients/${patientId}/care-team`,
    ),
  assignCareTeam: (patientId: string, userId: string, memberRole = "CARING_DOCTOR") =>
    request<{ id: string }>("POST", `/patients/${patientId}/care-team`, { userId, memberRole }),
  endCareTeam: (patientId: string, membershipId: string) =>
    request<{ ok: boolean }>("DELETE", `/patients/${patientId}/care-team/${membershipId}`),

  // messaging
  threads: () => request<{ items: ThreadSummary[] }>("GET", "/threads"),
  messages: (threadId: string) => request<{ items: Message[] }>("GET", `/threads/${threadId}/messages`),
  createThread: (input: unknown) => request<ThreadSummary>("POST", "/threads", input),
  sendMessage: (threadId: string, body: string) => request<Message>("POST", `/threads/${threadId}/messages`, { body }),
  notifications: () => request<{ items: NotificationItem[] }>("GET", "/notifications"),

  // billing
  billingSummary: () => request<BillingSummary>("GET", "/billing/summary"),
  invoices: () => request<{ items: Invoice[] }>("GET", "/invoices"),
  createInvoice: (input: unknown) => request<Invoice>("POST", "/invoices", input),
  setInvoiceStatus: (id: string, status: string) => request<Invoice>("PATCH", `/invoices/${id}/status`, { status }),
  payInvoice: (id: string, input: unknown) => request<Payment>("POST", `/invoices/${id}/payments`, input),
  payments: () => request<{ items: Payment[] }>("GET", "/payments"),
  expenses: () => request<{ items: Expense[] }>("GET", "/expenses"),
  createExpense: (input: unknown) => request<Expense>("POST", "/expenses", input),
  payers: () => request<{ items: Payer[] }>("GET", "/payers"),
  createPayer: (name: string, type: string) => request<Payer>("POST", "/payers", { name, type }),

  // audit + privacy
  auditEvents: (params: Record<string, string | number | undefined>) =>
    request<Paginated<AuditEvent>>("GET", `/audit/events?${toQuery(params)}`),
  auditVerify: () => request<AuditVerification>("GET", "/audit/verify"),
  auditExportUrl: () => `${BASE}/audit/export`,
  dsar: () => request<{ items: DsarRequest[] }>("GET", "/dsar"),
  createDsar: (input: unknown) => request<DsarRequest>("POST", "/dsar", input),
  setDsarStatus: (id: string, status: string, decisionNote?: string) =>
    request<DsarRequest>("PATCH", `/dsar/${id}/status`, { status, decisionNote }),
  dsarPrepare: (id: string) => request<DsarRequest>("POST", `/dsar/${id}/prepare`),
  dsarApprove: (id: string) => request<DsarRequest>("POST", `/dsar/${id}/approve`),
  dsarRelease: (id: string) =>
    request<{ token: string; expiresAt: string; downloadPath: string }>("POST", `/dsar/${id}/release`),
  dsarDownloadUrl: (id: string, token: string) => `${BASE}/dsar/${id}/download?token=${encodeURIComponent(token)}`,
  stepUp: (password: string, totp?: string) =>
    request<{ ok: boolean; windowMinutes: number }>("POST", "/auth/step-up", { password, totp }),
  mfaEnroll: () =>
    request<{ secret: string; otpauth: string }>("POST", "/auth/mfa/enroll"),
  mfaActivate: (code: string) => request<{ ok: boolean }>("POST", "/auth/mfa/activate", { code }),
  mfaDisable: (password: string, totp?: string) =>
    request<{ ok: boolean }>("DELETE", "/auth/mfa", { password, totp }),
  compliance: () =>
    request<{
      jurisdiction: string; label: string; frameworks: string[]; regulator: string;
      dsarDeadlineDays: number; aiProcessingConsentRequired: boolean;
      breachNotification: { required: boolean; deadlineHours: number } | null;
      clinicalRetentionYears: number; dataResidency: string; notes: string[];
    }>("GET", "/admin/compliance"),

  // ai
  scribeDraft: (encounterId: string) => request<AiDraft>("POST", "/ai/scribe-draft", { encounterId }),
  insertDraft: (id: string) => request<unknown>("POST", `/ai/drafts/${id}/insert`),
  discardDraft: (id: string) => request<AiDraft>("POST", `/ai/drafts/${id}/discard`),
  chat: (conversationId: string | undefined, message: string) =>
    request<{ conversationId: string; reply: string }>("POST", "/ai/chat", { conversationId, message }),
  chatHistory: (conversationId: string) => request<{ items: ChatMessage[] }>("GET", `/ai/chat/${conversationId}`),
  prompts: () => request<{ items: PromptTemplate[] }>("GET", "/ai/prompts"),
  updatePrompt: (name: string, template: string) =>
    request<PromptTemplate>("PUT", `/ai/prompts/${name}`, { name, template }),

  // admin
  users: () =>
    request<{ items: { id: string; username: string; fullName: string; role: string; isActive: boolean }[] }>("GET", "/users"),
  createUser: (input: unknown) => request<{ id: string }>("POST", "/users", input),
  updateUser: (id: string, input: unknown) => request<{ id: string }>("PUT", `/users/${id}`, input),
  clinic: () =>
    request<{
      id: string; name: string; locale: string; timezone: string; currency: string;
      retentionYears: number; address: string | null; phone: string | null; email: string | null;
    }>("GET", "/clinic"),
  updateClinic: (input: unknown) => request<unknown>("PUT", "/clinic", input),
  availability: () =>
    request<{ items: { id: string; doctorId: string; doctorName: string; weekday: number; startMinute: number; endMinute: number }[] }>(
      "GET", "/availability",
    ),
  setAvailability: (input: unknown) => request<{ ok: boolean }>("PUT", "/availability", input),

  // search
  search: (q: string) => request<{ items: SearchHit[] }>("GET", `/search?q=${encodeURIComponent(q)}`),
};

function toQuery(params: Record<string, unknown>): string {
  const search = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== "") search.set(k, String(v));
  }
  return search.toString();
}
