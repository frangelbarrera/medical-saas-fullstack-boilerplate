/**
 * AI routes (server-side):
 *  - POST /api/ai/chat            (proxy to Gemini with PHI sanitization)
 *  - POST /api/ai/process-consultation (mock AI Scribe)
 *  - /api/ai_chats CRUD
 *
 * The previous client-side import of ai-service.ts was a CRITICAL security
 * bug: it shipped the Gemini SDK, system prompt, and sanitization regex to
 * the browser bundle. The browser now calls /api/ai/chat, which:
 *  1. Sanitizes PHI from the user message before sending to Gemini.
 *  2. Reads GEMINI_API_KEY server-side only.
 *  3. Returns only the bot reply text.
 */
import { Router } from "express";
import { z } from "zod";
import { AuthenticatedRequest, authenticateToken, assertClinicOwnership } from "../middleware/auth.js";
import { validateBody } from "../middleware/validate.js";
import { schemas } from "../schemas/index.js";
import { mockAiChats, mockPatients, mockUsers } from "../config.js";
import { generateRandomId } from "../utils/crypto.js";
import { appendAuditLog } from "../utils/audit.js";
import { logger } from "../utils/logger.js";
import { createAIChat, sanitizeTextForLLM, sanitizePatientForLLM } from "../services/ai-service.js";

export const aiRouter = Router();

const chatSchema = z.object({
  message: z.string().min(1).max(4000),
  history: z
    .array(
      z.object({
        role: z.enum(["user", "bot"]),
        text: z.string().max(8000),
      }),
    )
    .max(100)
    .default([]),
  selectedPatientId: z.string().optional(),
});

/**
 * POST /api/ai/chat
 *
 * Sends a sanitized message to Gemini and returns the bot reply.
 * PHI is stripped from the message and history BEFORE reaching Gemini.
 * If GEMINI_API_KEY is not configured, returns a graceful fallback.
 */
aiRouter.post("/api/ai/chat", authenticateToken, validateBody(chatSchema), async (req: AuthenticatedRequest, res) => {
  const { message, history, selectedPatientId } = req.body;
  const clinicId = req.user!.clinicId;

  try {
    // Build sanitized history for the LLM
    const sanitizedHistory = history.map((m: { role: string; text: string }) => ({
      role: m.role === "user" ? "user" : "model",
      text: sanitizeTextForLLM(m.text),
    }));

    const sanitizedMessage = sanitizeTextForLLM(message);

    const systemInstruction = `Clinic Context (sanitized):
- User Role: ${req.user!.role}
- Selected Patient ID: ${selectedPatientId || "None"}

The user's message has been sanitized to remove PHI (names, emails, phones, IDs).
Respond professionally and never request raw PHI.`;

    const chat = createAIChat(systemInstruction, sanitizedHistory);
    const response: any = await (chat.sendMessage as any)(sanitizedMessage);

    const botText = response.text || "I couldn't process the response.";

    appendAuditLog({
      id: generateRandomId("log"),
      clinic_id: clinicId,
      user_id: req.user!.id,
      user_name: req.user!.name,
      action: "AI_CHAT_MESSAGE",
      target: selectedPatientId || "none",
      type: "AI",
      details: { messageLength: message.length, responseLength: botText.length },
    });

    res.json({ reply: botText });
  } catch (err: any) {
    logger.error({ msg: "AI chat error", error: err.message });
    // If GEMINI_API_KEY is missing or Gemini fails, return a graceful fallback
    res.status(503).json({
      error: "AI assistant is unavailable. Please try again later.",
      reply:
        "I'm sorry, the AI assistant is currently unavailable. Please contact your administrator or try again in a few moments.",
    });
  }
});

aiRouter.post("/api/ai/process-consultation", authenticateToken, async (req: AuthenticatedRequest, res: any) => {
  try {
    await new Promise((resolve) => setTimeout(resolve, 3000));
    const aiResult = {
      reason: "Acute abdominal pain and nausea",
      evolution:
        "Patient reports pain in epigastrium of 24 hours duration, colicky, intensity 7/10. Accompanied by nausea without vomiting. No fever.",
      vital_signs: {
        pulse: "82",
        temp: "37.2",
        bpS: "125",
        bpD: "82",
        weight: "70",
        height: "172",
        saturation: "98",
        respiratoryRate: "18",
        bmi: "23.7",
      },
      diagnosis_cie10: "K30 - Dyspepsia",
      prescription: [
        { medication: "Omeprazole 20mg", dose: "1 capsule", frequency: "Every 24 hours", duration: "7 days" },
        { medication: "Hyoscine 10mg", dose: "1 tablet", frequency: "Every 8 hours", duration: "3 days" },
      ],
    };
    res.json(aiResult);
  } catch (err: any) {
    res.status(500).json({ error: "Internal server error" });
  }
});

aiRouter.get("/api/ai_chats", authenticateToken, async (req: AuthenticatedRequest, res) => {
  const clinicId = req.user!.clinicId;
  const userId = req.user!.id;
  try {
    const filtered = mockAiChats.filter((c) => c.clinic_id === clinicId && c.user_id === userId);
    res.json(filtered);
  } catch (err: any) {
    res.status(500).json({ error: "Internal server error" });
  }
});

aiRouter.post(
  "/api/ai_chats",
  authenticateToken,
  validateBody(schemas.aiChatCreate),
  async (req: AuthenticatedRequest, res) => {
    const { title, messages } = req.body;
    const clinicId = req.user!.clinicId;
    const userId = req.user!.id;
    const id = generateRandomId("chat");

    try {
      const newChat = {
        id,
        user_id: userId,
        clinic_id: clinicId,
        title,
        messages,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      mockAiChats.push(newChat);
      appendAuditLog({
        id: generateRandomId("log"),
        clinic_id: clinicId,
        user_id: userId,
        user_name: req.user!.name,
        action: "AI_CHAT_CREATE",
        target: id,
        type: "AI",
        details: { title },
      });
      res.json(newChat);
    } catch (err: any) {
      res.status(500).json({ error: "Internal server error" });
    }
  },
);

aiRouter.put(
  "/api/ai_chats/:id",
  authenticateToken,
  validateBody(schemas.aiChatUpdate),
  async (req: AuthenticatedRequest, res) => {
    const { title, messages } = req.body;
    try {
      const idx = mockAiChats.findIndex((c) => c.id === req.params.id);
      if (idx === -1) return res.status(404).json({ error: "Chat not found" });
      if (
        !assertClinicOwnership(mockAiChats[idx].clinic_id, req.user!.clinicId) ||
        mockAiChats[idx].user_id !== req.user!.id
      ) {
        return res.status(404).json({ error: "Chat not found" });
      }
      if (title !== undefined) mockAiChats[idx].title = title;
      if (messages !== undefined) mockAiChats[idx].messages = messages;
      mockAiChats[idx].updated_at = new Date().toISOString();
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: "Internal server error" });
    }
  },
);

aiRouter.delete("/api/ai_chats/:id", authenticateToken, async (req: AuthenticatedRequest, res) => {
  try {
    const idx = mockAiChats.findIndex((c) => c.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: "Chat not found" });
    if (
      !assertClinicOwnership(mockAiChats[idx].clinic_id, req.user!.clinicId) ||
      mockAiChats[idx].user_id !== req.user!.id
    ) {
      return res.status(404).json({ error: "Chat not found" });
    }
    mockAiChats.splice(idx, 1);
    appendAuditLog({
      id: generateRandomId("log"),
      clinic_id: req.user!.clinicId,
      user_id: req.user!.id,
      user_name: req.user!.name,
      action: "AI_CHAT_DELETE",
      target: req.params.id,
      type: "AI",
      details: {},
    });
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: "Internal server error" });
  }
});

// Mark unused imports as referenced (TS strict) — these are used by ai-service consumers
void mockPatients;
void mockUsers;
