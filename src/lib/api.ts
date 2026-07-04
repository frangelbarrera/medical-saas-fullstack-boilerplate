// src/lib/api.ts

// API base URL: defaults to "/api" for same-origin (dev server proxy or
// Vercel rewrites). For cross-origin deployments (frontend on Vercel,
// backend on a VPS), set VITE_API_BASE_URL to the backend's absolute URL
// (e.g. "https://api.your-domain.com"). The trailing /api is added by the
// callers, so VITE_API_BASE_URL should be the origin or empty.
const API_BASE = (import.meta as any).env?.VITE_API_BASE_URL
  ? `${(import.meta as any).env.VITE_API_BASE_URL.replace(/\/$/, "")}/api`
  : "/api";

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

// Demo mode flag: set to true if the backend is not reachable.
// This allows the app to run as a static demo (e.g. on Vercel without backend).
let demoMode: boolean | null = null;

export const isDemoMode = (): boolean => demoMode === true;

const checkDemoMode = async (): Promise<boolean> => {
  if (demoMode !== null) return demoMode;
  try {
    const res = await fetch(`${API_BASE}/health`, { headers: { Accept: "application/json" } });
    const ct = res.headers.get("content-type") || "";
    // If we get JSON, the backend is alive
    demoMode = !ct.includes("application/json");
  } catch {
    demoMode = true; // network error -> no backend
  }
  return demoMode;
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

  // Check if we should use demo mode (cached after first check)
  const useDemo = await checkDemoMode();

  if (useDemo) {
    // Use client-side mock
    const { handleDemoRequest } = await import("./demo-mode.js");
    const result = await handleDemoRequest(path, options);
    if (!result) {
      throw new Error("Not found in demo mode");
    }
    if (result.status >= 400) {
      const err = new Error(result.data?.error || `Request failed with status ${result.status}`);
      (err as any).status = result.status;
      throw err;
    }
    // Store CSRF token from login response
    if (path === "/auth/login" && result.data?.csrfToken) {
      csrfToken = result.data.csrfToken;
    }
    if (result.status === 401 && !path.includes("/auth/login")) {
      window.dispatchEvent(new Event("auth_unauthorized"));
    }
    return result.data as T;
  }

  // Real backend request
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
