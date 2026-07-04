/**
 * Client-side mock API for demo mode.
 *
 * When the backend is not available (e.g. the app is deployed as a static
 * site on Vercel without a backend), this module intercepts API calls and
 * returns mock data so the UI is fully explorable for demo purposes.
 *
 * Detection: the api.ts request() function tries a real fetch first. If it
 * fails with a network error or returns HTML (instead of JSON), it falls
 * back to this mock.
 *
 * All data is stored in memory (resets on page refresh) and in localStorage
 * (persists across refreshes for the demo session). No real authentication —
 * any of the demo credentials work.
 */

const DEMO_CREDS = [
  { username: "admin", password: "admin", role: "ADMIN", name: "Demo Administrator" },
  { username: "doctor", password: "doctor", role: "DOCTOR", name: "Dr. Gregory House" },
  { username: "secretary", password: "secretary", role: "SECRETARY", name: "Secretary Claire" },
];

const DEMO_CLINIC = {
  id: "clinic_demo",
  name: "Demo Medical Center",
  owner_id: "admin_root",
  address: "123 Health Plaza, Suite 100",
  phone: "555-0100",
  email: "demo@medical.com",
  logo: "",
};

// Seed mock data
const seedMockData = () => {
  const stored = localStorage.getItem("demo_mock_data");
  if (stored) return JSON.parse(stored);

  const data = {
    patients: [
      {
        id: "pat_1",
        name: "John Doe",
        dni: "1712345678",
        email: "john@test.com",
        phone: "555-1234",
        birth_date: "1990-05-15",
        birthDate: "1990-05-15",
        gender: "M",
        status: "Active",
        clinic_id: "clinic_demo",
        clinicId: "clinic_demo",
        doctorId: "doc_1",
        doctorName: "Dr. Gregory House",
        age: 35,
        doctor: "Dr. Gregory House",
        lastVisit: "2026-06-15",
        cond: "Stable",
        bloodType: "O+",
        allergies: "Penicillin",
        allergiesList: ["Penicillin"],
        hereditary: "None reported",
        insurance: "Humana",
        insuranceStatus: "Active",
      },
      {
        id: "pat_2",
        name: "Jane Smith",
        dni: "1787654321",
        email: "jane@test.com",
        phone: "555-5678",
        birth_date: "1985-10-20",
        birthDate: "1985-10-20",
        gender: "F",
        status: "Active",
        clinic_id: "clinic_demo",
        clinicId: "clinic_demo",
        doctorId: "doc_1",
        doctorName: "Dr. Gregory House",
        age: 40,
        doctor: "Dr. Gregory House",
        lastVisit: "2026-06-20",
        cond: "Stable",
        bloodType: "A+",
        allergies: "None",
        allergiesList: [],
        hereditary: "Diabetes",
        insurance: "None",
        insuranceStatus: "Inactive",
      },
      {
        id: "pat_3",
        name: "Robert Johnson",
        dni: "1709876543",
        email: "robert@test.com",
        phone: "555-9012",
        birth_date: "1978-03-10",
        birthDate: "1978-03-10",
        gender: "M",
        status: "Urgent",
        clinic_id: "clinic_demo",
        clinicId: "clinic_demo",
        doctorId: "doc_1",
        doctorName: "Dr. Gregory House",
        age: 47,
        doctor: "Dr. Gregory House",
        lastVisit: "2026-07-01",
        cond: "Critical",
        bloodType: "B-",
        allergies: "Aspirin",
        allergiesList: ["Aspirin"],
        hereditary: "Hypertension",
        insurance: "Blue Cross",
        insuranceStatus: "Active",
      },
    ],
    consultations: [
      {
        id: "cons_1",
        patient_id: "pat_1",
        date: "2026-06-15T10:00:00Z",
        reason: "Routine checkup",
        evolution: "Patient reports feeling well. Vital signs stable.",
        vital_signs: { bp: "120/80", hr: "72", temp: "36.5", weight: "70", o2: "98" },
        diagnosis_cie10: "Z00.0 - General medical examination",
        prescription: [{ medication: "Multivitamin", dose: "1 tablet", frequency: "Daily", duration: "30 days" }],
        clinic_id: "clinic_demo",
        clinicId: "clinic_demo",
        doctorId: "doc_1",
        doctorName: "Dr. Gregory House",
      },
    ],
    appointments: [
      {
        id: "appt_1",
        patient_name: "John Doe",
        patient_id: "pat_1",
        type: "Follow-up",
        duration: 30,
        reason: "Routine Checkup",
        date_time: new Date(Date.now() + 86400000).toISOString(),
        clinic_id: "clinic_demo",
        doctor_id: "doc_1",
        doctor_name: "Dr. Gregory House",
        created_at: new Date().toISOString(),
      },
    ],
    invoices: [
      {
        id: "inv_1",
        clinic_id: "clinic_demo",
        patient_id: "pat_1",
        patient_name: "John Doe",
        doctor_id: "doc_1",
        doctor_name: "Dr. Gregory House",
        concept: "General Consultation",
        amount: 45.0,
        payment_method: "Cash",
        status: "Paid",
        date: new Date().toISOString(),
      },
      {
        id: "inv_2",
        clinic_id: "clinic_demo",
        patient_id: "pat_2",
        patient_name: "Jane Smith",
        doctor_id: "doc_1",
        doctor_name: "Dr. Gregory House",
        concept: "Ultrasound",
        amount: 80.0,
        payment_method: "Insurance",
        status: "Pending",
        insurance_company: "Humana",
        date: new Date().toISOString(),
      },
    ],
    expenses: [],
    auditLogs: [
      {
        id: "log_1",
        clinic_id: "clinic_demo",
        user_id: "admin_root",
        user_name: "Demo Administrator",
        action: "SYSTEM_INIT",
        target: "system",
        type: "SECURITY",
        details: { note: "Demo session started" },
        timestamp: new Date().toISOString(),
      },
    ],
    aiChats: [],
    users: [
      {
        id: "admin_root",
        username: "admin",
        name: "Demo Administrator",
        role: "ADMIN",
        clinic_id: "clinic_demo",
        is_active: true,
        managed_doctor_ids: [],
      },
      {
        id: "doc_1",
        username: "doctor",
        name: "Dr. Gregory House",
        role: "DOCTOR",
        clinic_id: "clinic_demo",
        is_active: true,
        managed_doctor_ids: [],
      },
      {
        id: "sec_1",
        username: "secretary",
        name: "Secretary Claire",
        role: "SECRETARY",
        clinic_id: "clinic_demo",
        is_active: true,
        managed_doctor_ids: ["doc_1"],
      },
    ],
  };

  localStorage.setItem("demo_mock_data", JSON.stringify(data));
  return data;
};

const saveMockData = (data: any) => {
  localStorage.setItem("demo_mock_data", JSON.stringify(data));
};

const getDemoUser = () => {
  const stored = sessionStorage.getItem("demo_user");
  return stored ? JSON.parse(stored) : null;
};

const setDemoUser = (user: any) => {
  if (user) {
    sessionStorage.setItem("demo_user", JSON.stringify(user));
  } else {
    sessionStorage.removeItem("demo_user");
  }
};

const demoCsrfToken = "demo-csrf-token-static-value";

/**
 * Handle an API request in demo mode.
 * Returns { status, data } or null if the path is not handled.
 */
export const handleDemoRequest = async (
  path: string,
  options: RequestInit = {},
): Promise<{ status: number; data: any } | null> => {
  const method = (options.method || "GET").toUpperCase();
  const body = options.body ? JSON.parse(options.body as string) : {};
  const data = seedMockData();
  const demoUser = getDemoUser();

  // Helper: require auth
  const requireAuth = () => {
    if (!demoUser) {
      return { status: 401, data: { error: "Unauthorized" } };
    }
    return null;
  };

  // === AUTH ===
  if (path === "/auth/login" && method === "POST") {
    const cred = DEMO_CREDS.find((c: any) => c.username === body.username && c.password === body.password);
    if (!cred) {
      return { status: 401, data: { error: "Invalid username or password" } };
    }
    const user = {
      id: cred.role === "ADMIN" ? "admin_root" : cred.role === "DOCTOR" ? "doc_1" : "sec_1",
      username: cred.username,
      role: cred.role,
      clinicId: "clinic_demo",
      name: cred.name,
      managed_doctor_ids: cred.role === "SECRETARY" ? ["doc_1"] : [],
    };
    setDemoUser(user);
    return {
      status: 200,
      data: { user, csrfToken: demoCsrfToken, accessTokenExpiresAt: Date.now() + 8 * 60 * 60 * 1000 },
    };
  }

  if (path === "/auth/me" && method === "GET") {
    const err = requireAuth();
    if (err) return err;
    return { status: 200, data: { user: demoUser } };
  }

  if (path === "/auth/logout" && method === "POST") {
    setDemoUser(null);
    return { status: 200, data: { success: true } };
  }

  if (path === "/auth/refresh" && method === "POST") {
    if (!demoUser) return { status: 401, data: { error: "No refresh token" } };
    return {
      status: 200,
      data: { user: demoUser, csrfToken: demoCsrfToken, accessTokenExpiresAt: Date.now() + 8 * 60 * 60 * 1000 },
    };
  }

  // All endpoints below require auth
  const authErr = requireAuth();
  if (authErr) return authErr;

  // === PATIENTS ===
  if (path === "/patients" && method === "GET") {
    return { status: 200, data: data.patients };
  }

  if (path === "/patients" && method === "POST") {
    const newPat = {
      id: "pat_" + Date.now(),
      ...body,
      clinic_id: "clinic_demo",
      clinicId: "clinic_demo",
      birth_date: body.birthDate,
      age: body.birthDate ? new Date().getFullYear() - new Date(body.birthDate).getFullYear() : 0,
      doctor: "Dr. Gregory House",
      lastVisit: new Date().toISOString(),
      cond: "New",
    };
    data.patients.push(newPat);
    saveMockData(data);
    return { status: 200, data: newPat };
  }

  // Single patient
  const patMatch = path.match(/^\/patients\/([^/]+)$/);
  if (patMatch) {
    const id = patMatch[1];
    if (method === "GET") {
      const pat = data.patients.find((p: any) => p.id === id);
      return pat ? { status: 200, data: pat } : { status: 404, data: { error: "Not found" } };
    }
    if (method === "PUT") {
      const idx = data.patients.findIndex((p: any) => p.id === id);
      if (idx === -1) return { status: 404, data: { error: "Not found" } };
      data.patients[idx] = { ...data.patients[idx], ...body };
      saveMockData(data);
      return { status: 200, data: data.patients[idx] };
    }
    if (method === "DELETE") {
      data.patients = data.patients.filter((p: any) => p.id !== id);
      saveMockData(data);
      return { status: 200, data: { success: true } };
    }
  }

  // Consultations
  const consMatch = path.match(/^\/patients\/([^/]+)\/consultations$/);
  if (consMatch) {
    const patientId = consMatch[1];
    if (method === "GET") {
      return { status: 200, data: data.consultations.filter((c: any) => c.patient_id === patientId) };
    }
    if (method === "POST") {
      const newCons = {
        id: "cons_" + Date.now(),
        patient_id: patientId,
        ...body,
        clinic_id: "clinic_demo",
        doctor_id: body.doctorId || demoUser.id,
        doctor_name: body.doctorName || demoUser.name,
      };
      data.consultations.push(newCons);
      saveMockData(data);
      return { status: 200, data: newCons };
    }
  }

  // === APPOINTMENTS ===
  if (path === "/appointments" && method === "GET") {
    return { status: 200, data: data.appointments };
  }
  if (path === "/appointments" && method === "POST") {
    const newAppt = {
      id: "appt_" + Date.now(),
      ...body,
      clinic_id: "clinic_demo",
      created_at: new Date().toISOString(),
    };
    data.appointments.push(newAppt);
    saveMockData(data);
    return { status: 200, data: newAppt };
  }
  const apptMatch = path.match(/^\/appointments\/([^/]+)$/);
  if (apptMatch && method === "DELETE") {
    data.appointments = data.appointments.filter((a: any) => a.id !== apptMatch[1]);
    saveMockData(data);
    return { status: 200, data: { success: true } };
  }

  // === INVOICES ===
  if (path === "/invoices" && method === "GET") {
    return {
      status: 200,
      data: data.invoices.map((i: any) => ({
        ...i,
        clinicId: i.clinic_id,
        patientId: i.patient_id,
        patientName: i.patient_name,
        doctorId: i.doctor_id,
        doctorName: i.doctor_name,
        paymentMethod: i.payment_method,
        insuranceCompany: i.insurance_company,
        createdAt: i.date,
      })),
    };
  }
  if (path === "/invoices" && method === "POST") {
    const newInv = {
      id: "inv_" + Date.now(),
      ...body,
      clinic_id: "clinic_demo",
      status: "Pending",
      date: new Date().toISOString(),
    };
    data.invoices.push(newInv);
    saveMockData(data);
    return { status: 200, data: { ...newInv, status: "Pending" } };
  }

  // === EXPENSES ===
  if (path === "/expenses" && method === "GET") {
    return { status: 200, data: data.expenses };
  }
  if (path === "/expenses" && method === "POST") {
    const newExp = {
      id: "exp_" + Date.now(),
      ...body,
      clinic_id: "clinic_demo",
      registered_by: demoUser.id,
      created_at: new Date().toISOString(),
    };
    data.expenses.push(newExp);
    saveMockData(data);
    return { status: 200, data: newExp };
  }

  // === STATS ===
  if (path === "/stats" && method === "GET") {
    return {
      status: 200,
      data: {
        patients: data.patients.length,
        consultations: data.consultations.length,
        appointments: data.appointments.length,
        alerts: data.patients.filter((p: any) => p.status === "Urgent").length,
      },
    };
  }

  // === AUDIT LOGS ===
  if (path === "/audit_logs" && method === "GET") {
    return {
      status: 200,
      data: {
        logs: data.auditLogs.slice(-50).reverse(),
        pagination: { page: 1, limit: 50, total: data.auditLogs.length, totalPages: 1 },
      },
    };
  }

  // === USERS ===
  if (path.startsWith("/users")) {
    if (method === "GET") {
      const role = new URLSearchParams(path.split("?")[1] || "").get("role");
      let users = data.users;
      if (role) users = users.filter((u: any) => u.role === role);
      return {
        status: 200,
        data: users.map((u: any) => ({
          id: u.id,
          username: u.username,
          name: u.name,
          role: u.role,
          clinicId: u.clinic_id,
          isActive: u.is_active,
          managedDoctorIds: u.managed_doctor_ids,
        })),
      };
    }
    if (method === "POST") {
      const newUser = {
        id: "user_" + Date.now(),
        ...body,
        clinic_id: "clinic_demo",
        is_active: true,
        managed_doctor_ids: [],
      };
      data.users.push(newUser);
      saveMockData(data);
      return { status: 200, data: { id: newUser.id, name: newUser.name, role: newUser.role, clinicId: "clinic_demo" } };
    }
  }
  const userMatch = path.match(/^\/users\/([^/]+)$/);
  if (userMatch) {
    const id = userMatch[1];
    if (method === "PUT") {
      const idx = data.users.findIndex((u: any) => u.id === id);
      if (idx === -1) return { status: 404, data: { error: "Not found" } };
      data.users[idx] = { ...data.users[idx], ...body };
      saveMockData(data);
      return { status: 200, data: { success: true } };
    }
    if (method === "DELETE") {
      data.users = data.users.filter((u: any) => u.id !== id);
      saveMockData(data);
      return { status: 200, data: { success: true } };
    }
  }

  // === CLINICS ===
  const clinicMatch = path.match(/^\/clinics\/([^/]+)$/);
  if (clinicMatch) {
    if (method === "GET") {
      return { status: 200, data: DEMO_CLINIC };
    }
    if (method === "PUT") {
      return { status: 200, data: { success: true } };
    }
  }

  // === AI CHATS ===
  if (path === "/ai_chats" && method === "GET") {
    return { status: 200, data: data.aiChats.filter((c: any) => c.user_id === demoUser.id) };
  }
  if (path === "/ai_chats" && method === "POST") {
    const newChat = {
      id: "chat_" + Date.now(),
      user_id: demoUser.id,
      clinic_id: "clinic_demo",
      ...body,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    data.aiChats.push(newChat);
    saveMockData(data);
    return { status: 200, data: newChat };
  }
  const chatMatch = path.match(/^\/ai_chats\/([^/]+)$/);
  if (chatMatch) {
    if (method === "PUT") {
      const idx = data.aiChats.findIndex((c: any) => c.id === chatMatch[1]);
      if (idx !== -1) {
        data.aiChats[idx] = { ...data.aiChats[idx], ...body, updated_at: new Date().toISOString() };
        saveMockData(data);
      }
      return { status: 200, data: { success: true } };
    }
    if (method === "DELETE") {
      data.aiChats = data.aiChats.filter((c: any) => c.id !== chatMatch[1]);
      saveMockData(data);
      return { status: 200, data: { success: true } };
    }
  }

  // === AI CHAT (LLM) ===
  if (path === "/ai/chat" && method === "POST") {
    return {
      status: 200,
      data: {
        reply:
          "I'm the demo AI assistant. In demo mode, I can't connect to Gemini, but the full server-side implementation sanitizes PHI before forwarding your message. Try the real backend to use the AI features.",
      },
    };
  }

  // === AI PROCESS CONSULTATION ===
  if (path === "/ai/process-consultation" && method === "POST") {
    return {
      status: 200,
      data: {
        reason: "Acute abdominal pain and nausea",
        evolution: "Patient reports pain in epigastrium of 24 hours duration.",
        vital_signs: {
          pulse: "82",
          temp: "37.2",
          bpS: "125",
          bpD: "82",
          weight: "70",
          height: "172",
          saturation: "98",
        },
        diagnosis_cie10: "K30 - Dyspepsia",
        prescription: [
          { medication: "Omeprazole 20mg", dose: "1 capsule", frequency: "Every 24 hours", duration: "7 days" },
        ],
      },
    };
  }

  // === PAYMENTS ===
  if (path === "/payments/create-order" && method === "POST") {
    return {
      status: 200,
      data: {
        paymentUrl: "https://www.google.com/search?q=Digital+Payment+Simulation",
        paymentId: "demo_payment_" + Date.now(),
      },
    };
  }

  // === ADMIN POPULATE ===
  if (path === "/admin/populate" && method === "POST") {
    return { status: 200, data: { success: true, message: "Demo mode: data already populated" } };
  }

  // === HEALTH ===
  if (path === "/health") {
    return { status: 200, data: { status: "ok (demo mode)", timestamp: new Date().toISOString() } };
  }

  // Unknown path
  return { status: 404, data: { error: "Not found in demo mode" } };
};

/**
 * Check if we should use demo mode.
 * Returns true if the backend is not reachable.
 */
export const checkDemoMode = async (): Promise<boolean> => {
  // If already in demo session, stay in demo
  if (sessionStorage.getItem("demo_user")) return true;

  try {
    const res = await fetch("/api/health", { headers: { Accept: "application/json" } });
    // If we get JSON, the backend is alive
    const ct = res.headers.get("content-type") || "";
    if (ct.includes("application/json")) {
      return false; // backend exists
    }
    // Got HTML -> no backend, use demo mode
    return true;
  } catch {
    return true; // network error -> no backend
  }
};
