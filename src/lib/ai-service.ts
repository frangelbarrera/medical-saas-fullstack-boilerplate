import { GoogleGenAI, Type, FunctionDeclaration } from "@google/genai";
import { api } from "./api";

// Initialize Gemini lazily to avoid top-level crashes if API key is missing
let aiInstance: GoogleGenAI | null = null;

const getAI = () => {
  if (!aiInstance) {
    // In Vite, we should use import.meta.env.VITE_GEMINI_API_KEY
    // We use a type cast to satisfy TS without adding vite/client to types
    const meta = import.meta as any;
    const apiKey = (meta.env?.VITE_GEMINI_API_KEY) || 
                   (typeof process !== 'undefined' ? process.env?.GEMINI_API_KEY : undefined) || 
                   "";
    
    if (!apiKey) {
      console.warn("GEMINI_API_KEY is missing. AI features will be disabled.");
    }
    aiInstance = new GoogleGenAI({ apiKey });
  }
  return aiInstance;
};

/**
 * Tool: Search patients by name or DNI
 */
const searchPatients: FunctionDeclaration = {
  name: "search_patients",
  description: "Search patients by name or ID number (DNI) within the clinic. Useful when the user asks for a patient by their name.",
  parameters: {
    type: Type.OBJECT,
    properties: {
      queryText: { type: Type.STRING, description: "Name or part of the name or ID to search for" },
      clinicId: { type: Type.STRING, description: "Clinic ID" }
    },
    required: ["queryText", "clinicId"]
  }
};

/**
 * Tool: Get patient summary
 */
const getPatientSummary: FunctionDeclaration = {
  name: "get_patient_summary",
  description: "Obtains a basic summary of the patient: name, age, current condition, blood type, and last visit.",
  parameters: {
    type: Type.OBJECT,
    properties: {
      patientId: { type: Type.STRING, description: "Patient ID" },
      clinicId: { type: Type.STRING, description: "Clinic ID for data isolation" }
    },
    required: ["patientId", "clinicId"]
  }
};

/**
 * Tool: Get patient medical history
 */
const getPatientHistory: FunctionDeclaration = {
  name: "get_patient_history",
  description: "Obtains the patient's medical consultation history, including evolutions, diagnoses (ICD-10/CIE-10), and prescriptions.",
  parameters: {
    type: Type.OBJECT,
    properties: {
      patientId: { type: Type.STRING, description: "Patient ID" },
      clinicId: { type: Type.STRING, description: "Clinic ID" },
      limitCount: { type: Type.NUMBER, description: "Maximum number of consultations to retrieve (default 5)" }
    },
    required: ["patientId", "clinicId"]
  }
};

// Implement the actual functions that call Local API
export const toolsImplementation = {
  search_patients: async (args: any) => {
    const { queryText, clinicId } = args;
    if (!clinicId) return { error: "Missing clinicId" };
    
    try {
      const allPatients = await api.patients.list(clinicId);
      const searchLower = queryText.toLowerCase();
      const results = allPatients.filter((p: any) => 
        p.name?.toLowerCase().includes(searchLower) || 
        p.dni?.includes(queryText)
      );
      return results.map((p: any) => ({ id: p.id, name: p.name, dni: p.dni, cond: p.cond }));
    } catch (error: any) {
      return { error: `Error searching patients: ${error.message}` };
    }
  },
  get_patient_summary: async (args: any) => {
    const { patientId, clinicId } = args;
    if (!patientId || !clinicId || patientId === "None") return { error: "Missing valid patientId or clinicId" };
    
    try {
      const data = await api.patients.get(patientId);
      if (data.clinicId !== clinicId) return { error: "Access denied: patient does not belong to this clinic" };
      return data;
    } catch (error: any) {
      return { error: `Error obtaining summary: ${error.message}` };
    }
  },
  get_patient_history: async (args: any) => {
    const { patientId, clinicId, limitCount = 5 } = args;
    if (!patientId || !clinicId) return { error: "Missing patientId or clinicId" };
    
    try {
      const p = await api.patients.get(patientId);
      if (p.clinicId !== clinicId) return { error: "Access denied" };

      const consultations = await api.patients.getConsultations(patientId);
      return consultations.slice(0, limitCount);
    } catch (error: any) {
      return { error: "Error obtaining history" };
    }
  }
};

/**
 * Create a chat session with the configured tools and history
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
        6. If the user greets you or makes small talk, respond kindly but focus on being helpful.
        
        Current context: ${systemInstruction}
      `,
      tools: [{
        functionDeclarations: [
          searchPatients,
          getPatientSummary,
          getPatientHistory
        ]
      }]
    },
    history: history.map(m => ({
      role: m.role === "user" ? "user" : "model",
      parts: [{ text: m.text }]
    }))
  });
};
