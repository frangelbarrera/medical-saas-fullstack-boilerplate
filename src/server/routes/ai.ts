/**
 * AI routes:
 *  - /api/ai/process-consultation (mock AI Scribe)
 *  - /api/ai_chats CRUD
 */
import { Router } from "express";
import { AuthenticatedRequest, authenticateToken, assertClinicOwnership } from "../middleware/auth.js";
import { validateBody } from "../middleware/validate.js";
import { schemas } from "../schemas/index.js";
import { mockAiChats } from "../config.js";
import { generateRandomId } from "../utils/crypto.js";

export const aiRouter = Router();

aiRouter.post("/api/ai/process-consultation", authenticateToken, async (req: AuthenticatedRequest, res: any) => {
  try {
    await new Promise((resolve) => setTimeout(resolve, 3000));
    const aiResult = {
      reason: "Acute abdominal pain and nausea",
      evolution: "Patient reports pain in epigastrium of 24 hours duration, colicky, intensity 7/10. Accompanied by nausea without vomiting. No fever.",
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

aiRouter.post("/api/ai_chats", authenticateToken, validateBody(schemas.aiChatCreate), async (req: AuthenticatedRequest, res) => {
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
    res.json(newChat);
  } catch (err: any) {
    res.status(500).json({ error: "Internal server error" });
  }
});

aiRouter.put("/api/ai_chats/:id", authenticateToken, validateBody(schemas.aiChatUpdate), async (req: AuthenticatedRequest, res) => {
  const { title, messages } = req.body;
  try {
    const idx = mockAiChats.findIndex((c) => c.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: "Chat not found" });
    if (!assertClinicOwnership(mockAiChats[idx].clinic_id, req.user!.clinicId) || mockAiChats[idx].user_id !== req.user!.id) {
      return res.status(404).json({ error: "Chat not found" });
    }
    if (title !== undefined) mockAiChats[idx].title = title;
    if (messages !== undefined) mockAiChats[idx].messages = messages;
    mockAiChats[idx].updated_at = new Date().toISOString();
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: "Internal server error" });
  }
});

aiRouter.delete("/api/ai_chats/:id", authenticateToken, async (req: AuthenticatedRequest, res) => {
  try {
    const idx = mockAiChats.findIndex((c) => c.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: "Chat not found" });
    if (!assertClinicOwnership(mockAiChats[idx].clinic_id, req.user!.clinicId) || mockAiChats[idx].user_id !== req.user!.id) {
      return res.status(404).json({ error: "Chat not found" });
    }
    mockAiChats.splice(idx, 1);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: "Internal server error" });
  }
});
