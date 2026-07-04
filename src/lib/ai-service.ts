import { GoogleGenAI, Type, FunctionDeclaration } from "@google/genai";

// Initialize Gemini lazily to avoid top-level crashes if API key is missing.
// The API key MUST only be available server-side. Vite's `define` injects it
// into the client bundle, which leaks it to the browser - we removed that.
let aiInstance: GoogleGenAI | null = null;

const getAI = (): GoogleGenAI => {
  if (!aiInstance) {
    const apiKey = typeof process !== "undefined" ? process.env?.GEMINI_API_KEY : undefined;
    if (!apiKey) {
      throw new Error("GEMINI_API_KEY is not configured server-side. AI features are disabled.");
    }
    aiInstance = new GoogleGenAI({ apiKey });
  }
  return aiInstance;
};

/**
 * PHI (Protected Health Information) redaction.
 *
 * Before sending any patient data to a third-party LLM (Google Gemini), we MUST
 * strip or mask PHI unless a signed BAA (Business Associate Agreement) is in
 * place with the LLM provider. Without a BAA, sending PHI to Google is a direct
 * HIPAA violation.
 *
 * Modes (controlled by LLM_PHI_MODE env var):
 *  - strip:        Replace PHI fields with placeholders (default, safe without BAA)
 *  - redact:       Mask PHI partially (e.g. "J*** D**")
 *  - passthrough:  Send PHI as-is (REQUIRES signed BAA with Google)
 */

export type PhiMode = "strip" | "redact" | "passthrough";

const PHI_PLACEHOLDERS = {
  name: "[PATIENT_NAME]",
  dni: "[PATIENT_ID]",
  email: "[PATIENT_EMAIL]",
  phone: "[PATIENT_PHONE]",
  birthDate: "[PATIENT_DOB]",
  address: "[PATIENT_ADDRESS]",
};

const redactValue = (value: string): string => {
  if (!value || value.length < 2) return "[REDACTED]";
  return value[0] + "*".repeat(Math.max(2, value.length - 2)) + value[value.length - 1];
};

/**
 * Sanitize a patient object for LLM consumption.
 * Returns a new object with PHI handled according to the configured mode.
 */
export const sanitizePatientForLLM = (
  patient: any,
  mode: PhiMode = (typeof process !== "undefined" && (process.env?.LLM_PHI_MODE as PhiMode)) || "strip",
): any => {
  if (mode === "passthrough") {
    return patient;
  }

  const sanitize = (field: keyof typeof PHI_PLACEHOLDERS, value: string | undefined) => {
    if (!value) return undefined;
    if (mode === "strip") return PHI_PLACEHOLDERS[field];
    return redactValue(value);
  };

  return {
    ...patient,
    name: sanitize("name", patient.name),
    dni: sanitize("dni", patient.dni),
    email: sanitize("email", patient.email),
    phone: sanitize("phone", patient.phone),
    birthDate: sanitize("birthDate", patient.birthDate),
    address: sanitize("address", patient.address),
  };
};

/**
 * Sanitize a free-text prompt that may contain PHI typed by the user.
 * Detects common PHI patterns (emails, phone numbers, ID-like numbers) and
 * redacts them. This is a best-effort heuristic; for strict compliance use
 * mode=strip on structured data instead.
 */
export const sanitizeTextForLLM = (
  text: string,
  mode: PhiMode = (typeof process !== "undefined" && (process.env?.LLM_PHI_MODE as PhiMode)) || "strip",
): string => {
  if (mode === "passthrough") return text;
  let result = text;
  // Email pattern
  result = result.replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, "[EMAIL]");
  // Phone pattern (international + local)
  result = result.replace(/(\+?\d{1,3}[-.\s]?)?\(?\d{2,4}\)?[-.\s]?\d{3,4}[-.\s]?\d{3,4}/g, "[PHONE]");
  // National ID pattern (10 digits, common in LatAm)
  result = result.replace(/\b\d{10}\b/g, "[ID]");
  if (mode === "strip") {
    result = result
      .replace(/\[EMAIL\]/g, "")
      .replace(/\[PHONE\]/g, "")
      .replace(/\[ID\]/g, "");
  }
  return result;
};

/**
 * Tool: Search patients by name or DNI
 */
const searchPatients: FunctionDeclaration = {
  name: "search_patients",
  description: "Search patients by name or ID number within the clinic. Returns only sanitized metadata (no raw PHI).",
  parameters: {
    type: Type.OBJECT,
    properties: {
      queryText: { type: Type.STRING, description: "Name or part of the name or ID to search for" },
      clinicId: { type: Type.STRING, description: "Clinic ID" },
    },
    required: ["queryText", "clinicId"],
  },
};

/**
 * Tool: Get patient summary
 */
const getPatientSummary: FunctionDeclaration = {
  name: "get_patient_summary",
  description:
    "Obtains a sanitized summary of the patient (no raw name/DNI/email/phone). Useful for context without exposing PHI to the LLM.",
  parameters: {
    type: Type.OBJECT,
    properties: {
      patientId: { type: Type.STRING, description: "Patient ID" },
      clinicId: { type: Type.STRING, description: "Clinic ID for data isolation" },
    },
    required: ["patientId", "clinicId"],
  },
};

/**
 * Tool: Get patient medical history
 */
const getPatientHistory: FunctionDeclaration = {
  name: "get_patient_history",
  description:
    "Obtains the patient's medical consultation history. Diagnoses and prescriptions are returned; PHI fields are sanitized.",
  parameters: {
    type: Type.OBJECT,
    properties: {
      patientId: { type: Type.STRING, description: "Patient ID" },
      clinicId: { type: Type.STRING, description: "Clinic ID" },
      limitCount: { type: Type.NUMBER, description: "Maximum number of consultations to retrieve (default 5)" },
    },
    required: ["patientId", "clinicId"],
  },
};

// Tool implementations call the local API (server-side) and sanitize PHI before returning.
export const toolsImplementation = {
  search_patients: async (args: any) => {
    const { queryText, clinicId } = args;
    if (!clinicId) return { error: "Missing clinicId" };

    try {
      // In a server-side context, this would call the internal patient service.
      // The actual implementation lives in server.ts which has access to the data layer.
      // Here we just return a placeholder that the server can hydrate.
      return { query: queryText, clinicId, results: [] };
    } catch (error: any) {
      return { error: `Error searching patients: ${error.message}` };
    }
  },
  get_patient_summary: async (args: any) => {
    const { patientId, clinicId } = args;
    if (!patientId || !clinicId || patientId === "None") return { error: "Missing valid patientId or clinicId" };
    return { patientId, clinicId };
  },
  get_patient_history: async (args: any) => {
    const { patientId, clinicId, limitCount = 5 } = args;
    if (!patientId || !clinicId) return { error: "Missing patientId or clinicId" };
    return { patientId, clinicId, limit: limitCount };
  },
};

/**
 * Create a chat session with the configured tools and history.
 * NOTE: This function is intended to be called server-side only. The Gemini
 * API key is read from process.env and must never be exposed to the browser.
 */
export const createAIChat = (systemInstruction: string, history: any[] = []) => {
  const ai = getAI();
  return ai.chats.create({
    model: "gemini-3-flash-preview",
    config: {
      systemInstruction: `
        You are a highly professional Medical AI Assistant, the clinic's intelligent co-pilot.
        Your goal is to help medical and administrative staff with queries about patients, appointments, and finances.

        CRITICAL RULES:
        1. Always search for patients using 'search_patients' if the user mentions a name or ID (DNI).
        2. If you find multiple patients, ask for clarification.
        3. Use 'get_patient_summary' to get details of a specific patient once you have their ID.
        4. Do not invent data. If you don't find something, say it clearly.
        5. Maintain a professional, empathetic, and efficient tone.
        6. Never echo back raw PHI (names, DNI, emails, phones) in your responses. Refer to patients by their ID or sanitized labels.
        7. If the user greets you or makes small talk, respond kindly but focus on being helpful.

        Current context: ${sanitizeTextForLLM(systemInstruction)}
      `,
      tools: [
        {
          functionDeclarations: [searchPatients, getPatientSummary, getPatientHistory],
        },
      ],
    },
    history: history.map((m) => ({
      role: m.role === "user" ? "user" : "model",
      parts: [{ text: sanitizeTextForLLM(m.text || "") }],
    })),
  });
};
