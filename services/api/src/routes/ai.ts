/**
 * AI routes: governed scribe drafts and chat (ADR-005: drafts only, the
 * legacy mock process-consultation endpoint is removed - SEC-006).
 */
import { Router } from "express";
import {
  scribeRequest,
  chatRequest,
  promptTemplateInput,
} from "@medical/contracts";
import { withTenantRepos, loadEnv } from "@medical/data";
import { asyncHandler, ApiError } from "../middleware/errors.js";
import { validateBody } from "../middleware/validate.js";
import { authenticate, requireCapability, type AuthedRequest } from "../middleware/auth.js";
import { sanitizeFreeText, GeminiProvider, DEFAULT_PROMPTS } from "@medical/integrations";
import { aiLimiter } from "../middleware/security.js";
export const aiRouter = Router();

const provider = (): InstanceType<typeof GeminiProvider> | null => {
  const env = loadEnv();
  if (!env.GEMINI_API_KEY) return null;
  return new GeminiProvider(env.GEMINI_API_KEY);
};

aiRouter.post(
  "/ai/scribe-draft",
  authenticate,
  requireCapability("ai:use"),
  aiLimiter,
  validateBody(scribeRequest),
  asyncHandler(async (req: AuthedRequest, res) => {
    const ctx = req.ctx!;
    const { encounterId } = req.body as { encounterId: string };
    const env = loadEnv();

    const result = await withTenantRepos(ctx, async (repos) => {
      const encounter = await repos.clinical.findById(ctx.tenantId, encounterId);
      if (!encounter) throw new ApiError(404, "NOT_FOUND", "Encounter not found");
      if (encounter.status === "SIGNED") {
        throw new ApiError(409, "INVALID_STATE_TRANSITION", "Signed notes cannot be re-drafted");
      }
      // AI_PROCESSING consent gate (AI-001), fail-closed: AI processing of
      // health data needs a positive legal basis. Missing, REFUSED and
      // EXPIRED consents all block generation - absence of refusal is never
      // treated as consent.
      const consent = await repos.patients.consentFor(ctx.tenantId, encounter.patientId, "AI_PROCESSING");
      if (consent !== "GRANTED") {
        await repos.audit.append(ctx, {
          action: "AI_CONSENT_BLOCKED",
          category: "AI",
          subjectPatientId: encounter.patientId,
          target: encounterId,
          details: { consentState: consent ?? "MISSING" },
        });
        throw new ApiError(
          422,
          "CONSENT_REQUIRED",
          consent === "REFUSED"
            ? "The patient has declined AI processing for their record"
            : "AI processing requires the patient's AI_PROCESSING consent",
        );
      }
      const ai = provider();
      if (!ai) throw new ApiError(503, "AI_NOT_ENABLED", "AI features are not configured on this deployment");

      const prompt = (await repos.ai.activePrompt(ctx.tenantId, "SCRIBE_NOTE")) ?? null;
      const template = prompt?.template ?? DEFAULT_PROMPTS.SCRIBE_NOTE.template;
      const promptVersion = prompt ? `v${prompt.version}` : "default";

      // De-identified context for the LLM.
      const vitals = await repos.clinical.listObservations(ctx.tenantId, encounter.patientId, 10);
      const draft = await ai.generateScribeDraft(template, {
        chiefComplaint: sanitizeFreeText(encounter.chiefComplaint ?? "", env.LLM_PHI_MODE),
        observations: sanitizeFreeText(encounter.observations ?? "", env.LLM_PHI_MODE),
        plan: sanitizeFreeText(encounter.plan ?? "", env.LLM_PHI_MODE),
        vitals: vitals.slice(0, 6).map((v) => ({
          label: v.type.toLowerCase().replace(/_/g, " "),
          value: v.value,
          unit: v.unit,
        })),
      });

      const saved = await repos.ai.saveDraft(ctx, {
        encounterId,
        patientId: encounter.patientId,
        type: "SCRIBE_NOTE",
        content: draft,
        model: ai.model,
        promptVersion,
      });
      await repos.audit.append(ctx, {
        action: "AI_DRAFT_GENERATED",
        category: "AI",
        subjectPatientId: encounter.patientId,
        target: saved.id,
        details: { model: ai.model, promptVersion },
      });
      return saved;
    });
    res.status(201).json(result);
  }),
);

aiRouter.post(
  "/ai/drafts/:id/insert",
  authenticate,
  requireCapability("clinical:write"),
  asyncHandler(async (req: AuthedRequest, res) => {
    const ctx = req.ctx!;
    const updated = await withTenantRepos(ctx, async (repos) => {
      const draft = await repos.ai.findDraft(ctx.tenantId, req.params.id);
      if (!draft || draft.reviewState !== "PENDING") {
        throw new ApiError(404, "NOT_FOUND", "Draft not found or already handled");
      }
      if (!draft.encounterId) throw new ApiError(422, "UNPROCESSABLE", "Draft has no target encounter");
      const encounter = await repos.clinical.findById(ctx.tenantId, draft.encounterId);
      if (!encounter) throw new ApiError(404, "NOT_FOUND", "Encounter not found");
      // Insert as DRAFT content: clinician still reviews and signs.
      await repos.clinical.updateContent(ctx, draft.encounterId, {
        chiefComplaint: draft.content.chiefComplaint,
        observations: draft.content.observations,
        plan: draft.content.plan,
        changeReason: "AI draft inserted - clinician review pending",
      });
      const inserted = await repos.ai.setDraftState(ctx, req.params.id, "INSERTED");
      await repos.audit.append(ctx, {
        action: "AI_DRAFT_INSERTED",
        category: "AI",
        subjectPatientId: encounter.patientId,
        target: req.params.id,
      });
      return inserted ?? { ok: true };
    });
    res.json(updated);
  }),
);

aiRouter.post(
  "/ai/drafts/:id/discard",
  authenticate,
  requireCapability("ai:use"),
  asyncHandler(async (req: AuthedRequest, res) => {
    const ctx = req.ctx!;
    const discarded = await withTenantRepos(ctx, async (repos) => {
      const result = await repos.ai.setDraftState(ctx, req.params.id, "DISCARDED");
      if (result) {
        await repos.audit.append(ctx, { action: "AI_DRAFT_DISCARDED", category: "AI", target: req.params.id });
      }
      return result;
    });
    if (!discarded) throw new ApiError(404, "NOT_FOUND", "Draft not found or already handled");
    res.json(discarded);
  }),
);

aiRouter.post(
  "/ai/chat",
  authenticate,
  requireCapability("ai:use"),
  aiLimiter,
  validateBody(chatRequest),
  asyncHandler(async (req: AuthedRequest, res) => {
    const ctx = req.ctx!;
    const { conversationId, message } = req.body as { conversationId?: string; message: string };
    const env = loadEnv();

    const result = await withTenantRepos(ctx, async (repos) => {
      const ai = provider();
      if (!ai) throw new ApiError(503, "AI_NOT_ENABLED", "AI features are not configured on this deployment");

      const conversation = conversationId ?? (await repos.ai.createConversation(ctx, "Assistant"));
      const history = await repos.ai.listMessages(ctx.tenantId, conversation, ctx.actorId);
      const sanitized = sanitizeFreeText(message, env.LLM_PHI_MODE);

      // The stored message is the SANITIZED text (AI-001): raw PHI never
      // reaches persistence even when the LLM call is redacted separately.
      // `redactionApplied` keeps the audit signal.
      await repos.ai.appendMessage(ctx, conversation, "USER", sanitized, { redactionApplied: sanitized !== message });
      const prompt = (await repos.ai.activePrompt(ctx.tenantId, "CHAT_ASSISTANT")) ?? null;
      const template = prompt?.template ?? DEFAULT_PROMPTS.CHAT_ASSISTANT.template;
      const reply = await ai.generateChatReply(template, {
        history: history.map((m) => ({ role: m.role, content: m.content })),
        message: sanitized,
      });
      await repos.ai.appendMessage(ctx, conversation, "ASSISTANT", reply, {
        model: ai.model,
        promptVersion: prompt ? `v${prompt.version}` : "default",
        redactionApplied: sanitized !== message,
      });
      await repos.audit.append(ctx, {
        action: "AI_CHAT_MESSAGE",
        category: "AI",
        target: conversation,
        details: { model: ai.model, redactionApplied: sanitized !== message },
      });
      return { conversationId: conversation, reply };
    });
    res.json(result);
  }),
);

aiRouter.get(
  "/ai/chat/:conversationId",
  authenticate,
  requireCapability("ai:use"),
  asyncHandler(async (req: AuthedRequest, res) => {
    const ctx = req.ctx!;
    const messages = await withTenantRepos(ctx, (repos) =>
      repos.ai.listMessages(ctx.tenantId, req.params.conversationId, ctx.actorId),
    );
    res.json({ items: messages });
  }),
);

aiRouter.get(
  "/ai/prompts",
  authenticate,
  requireCapability("admin:integrations"),
  asyncHandler(async (req: AuthedRequest, res) => {
    const ctx = req.ctx!;
    const prompts = await withTenantRepos(ctx, (repos) => repos.ai.listPrompts(ctx.tenantId));
    res.json({ items: prompts });
  }),
);

aiRouter.put(
  "/ai/prompts/:name",
  authenticate,
  requireCapability("admin:integrations"),
  validateBody(promptTemplateInput),
  asyncHandler(async (req: AuthedRequest, res) => {
    const ctx = req.ctx!;
    const updated = await withTenantRepos(ctx, async (repos) => {
      const prompt = await repos.ai.upsertPrompt(ctx.tenantId, req.body);
      await repos.audit.append(ctx, {
        action: "PROMPT_UPDATED",
        category: "AI",
        target: prompt.id,
        details: { name: prompt.name, version: prompt.version },
      });
      return prompt;
    });
    res.json(updated);
  }),
);
