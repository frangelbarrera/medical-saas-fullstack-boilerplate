import { z } from "zod";

// ---------------------------------------------------------------------------
// AI governance (ADR-005: AI is a draft assistant, never an implicit clinician)
// ---------------------------------------------------------------------------

export const PHI_MODES = ["strip", "redact", "passthrough"] as const;
export type PhiMode = (typeof PHI_MODES)[number];

/** Structured scribe draft. Always requires clinician review before use. */
export const scribeDraftContent = z.object({
  chiefComplaint: z.string().max(4000),
  observations: z.string().max(20000),
  plan: z.string().max(20000),
});
export type ScribeDraftContent = z.infer<typeof scribeDraftContent>;

export const DRAFT_STATES = ["PENDING", "INSERTED", "DISCARDED"] as const;

export interface AiDraft {
  id: string;
  encounterId: string | null;
  patientId: string | null;
  type: "SCRIBE_NOTE" | "CHAT_REPLY";
  content: ScribeDraftContent;
  model: string;
  promptVersion: string;
  reviewState: (typeof DRAFT_STATES)[number];
  createdAt: string;
}

export const scribeRequest = z.object({
  encounterId: z.string().uuid(),
});
export type ScribeRequest = z.infer<typeof scribeRequest>;

export const chatRequest = z.object({
  conversationId: z.string().uuid().optional(),
  message: z.string().min(1).max(4000),
});
export type ChatRequest = z.infer<typeof chatRequest>;

export interface ChatMessage {
  id: string;
  role: "USER" | "ASSISTANT";
  content: string;
  createdAt: string;
}

export const promptTemplateInput = z.object({
  name: z.enum(["SCRIBE_NOTE", "CHAT_ASSISTANT"]),
  template: z.string().min(10).max(8000),
  purpose: z.string().max(300).optional(),
});
export type PromptTemplateInput = z.infer<typeof promptTemplateInput>;

export interface PromptTemplate {
  id: string;
  name: string;
  version: number;
  purpose: string;
  template: string;
  isActive: boolean;
  updatedAt: string;
}
