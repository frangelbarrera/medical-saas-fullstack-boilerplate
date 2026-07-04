// src/lib/api.ts

const API_BASE = "/api";

// CSRF token: stored in memory after login. The server also sets it as a
// non-httpOnly cookie, but we prefer the in-memory value to avoid stale tokens
// after re-login. We fall back to reading the cookie if memory is empty.
let csrfToken: string | null = null;

export const setCsrfToken = (token: string | null) => {
  csrfToken = token;
};

const getCsrfTokenFromCookie = (): string | null => {
  const match = document.cookie
    .split("; ")
    .find((c) => c.startsWith("csrf_token=") || c.startsWith("__Host-csrf_token="));
  return match ? decodeURIComponent(match.split("=")[1]) : null;
};

async function request<T = any>(path: string, options: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...((options.headers as Record<string, string>) || {}),
  };

  // Attach CSRF token for state-changing methods
  const method = (options.method || "GET").toUpperCase();
  if (!["GET", "HEAD", "OPTIONS"].includes(method)) {
    const token = csrfToken || getCsrfTokenFromCookie();
    if (token) {
      headers["x-csrf-token"] = token;
    }
  }

  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
    credentials: "include",
  });

  if (!response.ok) {
    if (response.status === 401 && !path.includes("/auth/login")) {
      window.dispatchEvent(new Event("auth_unauthorized"));
    }
    const error = await response.json().catch(() => ({ error: "Unknown error" }));
    throw new Error(error.error || `Request failed with status ${response.status}`);
  }

  // Some endpoints (logout) return no body
  const text = await response.text();
  return text ? (JSON.parse(text) as T) : (undefined as unknown as T);
}

export const api = {
  auth: {
    me: () => request("/auth/me"),
    login: (credentials: { username: string; password: string; role?: string }) =>
      request<{ user: any; csrfToken: string }>("/auth/login", {
        method: "POST",
        body: JSON.stringify(credentials),
      }),
    logout: () => request("/auth/logout", { method: "POST" }),
  },
  admin: {
    populateDatabase: (clinicId: string) =>
      request("/admin/populate", { method: "POST", body: JSON.stringify({ clinicId }) }),
  },
  clinics: {
    get: (id: string) => request(`/clinics/${id}`),
    update: (id: string, data: any) => request(`/clinics/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  },
  users: {
    list: (clinicId: string, role?: string) => request(`/users?clinicId=${clinicId}${role ? `&role=${role}` : ""}`),
    create: (data: any) => request("/users", { method: "POST", body: JSON.stringify(data) }),
    update: (id: string, data: any) => request(`/users/${id}`, { method: "PUT", body: JSON.stringify(data) }),
    delete: (id: string) => request(`/users/${id}`, { method: "DELETE" }),
  },
  patients: {
    list: (clinicId: string, doctorId?: string) =>
      request(`/patients?clinicId=${clinicId}${doctorId ? `&doctorId=${doctorId}` : ""}`),
    get: (id: string) => request(`/patients/${id}`),
    create: (data: any) => request("/patients", { method: "POST", body: JSON.stringify(data) }),
    update: (id: string, data: any) => request(`/patients/${id}`, { method: "PUT", body: JSON.stringify(data) }),
    delete: (id: string) => request(`/patients/${id}`, { method: "DELETE" }),
    getConsultations: (id: string) => request(`/patients/${id}/consultations`),
    createConsultation: (id: string, data: any) =>
      request(`/patients/${id}/consultations`, { method: "POST", body: JSON.stringify(data) }),
  },
  stats: {
    get: (clinicId: string) => request(`/stats?clinicId=${clinicId}`),
  },
  auditLogs: {
    list: (clinicId: string) => request(`/audit_logs?clinicId=${clinicId}`),
  },
  appointments: {
    list: (clinicId: string, doctorId: string, start: string, end: string) =>
      request(`/appointments?clinicId=${clinicId}&doctorId=${doctorId}&start=${start}&end=${end}`),
    getByMonth: (clinicId: string, year: number, month: number) => {
      const start = new Date(year, month - 1, 1).toISOString();
      const end = new Date(year, month, 0).toISOString();
      return request(`/appointments?clinicId=${clinicId}&start=${start}&end=${end}`);
    },
    create: (data: any) => request("/appointments", { method: "POST", body: JSON.stringify(data) }),
    delete: (id: string) => request(`/appointments/${id}`, { method: "DELETE" }),
  },
  invoices: {
    list: (clinicId: string) => request(`/invoices?clinicId=${clinicId}`),
    create: (data: any) => request("/invoices", { method: "POST", body: JSON.stringify(data) }),
  },
  expenses: {
    list: (clinicId: string) => request(`/expenses?clinicId=${clinicId}`),
    create: (data: any) => request("/expenses", { method: "POST", body: JSON.stringify(data) }),
  },
  payments: {
    createOrder: (data: any) => request("/payments/create-order", { method: "POST", body: JSON.stringify(data) }),
  },
  ai: {
    chat: (data: { message: string; history: { role: "user" | "bot"; text: string }[]; selectedPatientId?: string }) =>
      request<{ reply: string }>("/ai/chat", { method: "POST", body: JSON.stringify(data) }),
    processConsultation: (_audioBlob: Blob) => {
      return request("/ai/process-consultation", { method: "POST" });
    },
  },
  aiChats: {
    list: (clinicId: string, userId: string) => request(`/ai_chats?clinicId=${clinicId}&userId=${userId}`),
    create: (data: any) => request("/ai_chats", { method: "POST", body: JSON.stringify(data) }),
    update: (id: string, data: any) => request(`/ai_chats/${id}`, { method: "PUT", body: JSON.stringify(data) }),
    delete: (id: string) => request(`/ai_chats/${id}`, { method: "DELETE" }),
  },
};
