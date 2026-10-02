/**
 * AI provider abstraction (AI-001).
 *
 * The default implementation talks to Google Gemini server-side only. The
 * provider is behind an interface so a clinic can plug a different approved
 * provider with its own data processing agreement. When no provider is
 * configured, AI features are disabled - the UI shows a disabled state and
 * the API returns AI_NOT_ENABLED.
 */

export interface ScribePromptInput {
  chiefComplaint: string | null;
  observations: string | null;
  plan: string | null;
  vitals: { label: string; value: string; unit: string | null }[];
}

export interface ChatPromptInput {
  history: { role: "USER" | "ASSISTANT"; content: string }[];
  message: string;
}

export interface AiProvider {
  readonly model: string;
  generateScribeDraft(prompt: string, input: ScribePromptInput): Promise<{ chiefComplaint: string; observations: string; plan: string }>;
  generateChatReply(prompt: string, input: ChatPromptInput): Promise<string>;
}

export class UnavailableAiProvider implements AiProvider {
  readonly model = "none";
  async generateScribeDraft(): Promise<never> {
    throw new Error("AI provider not configured");
  }
  async generateChatReply(): Promise<never> {
    throw new Error("AI provider not configured");
  }
}

type GenAiSdk = typeof import("@google/genai");

let sdkCache: GenAiSdk | null = null;

/**
 * Outbound circuit breaker (PERF-003): after five consecutive provider
 * failures the breaker opens for 30 seconds and calls fail fast, protecting
 * the request path from a hanging or degraded upstream. Half-open after
 * cooldown lets one probe through to re-close it.
 */
export class CircuitBreaker {
  private failures = 0;
  private openedAt = 0;

  constructor(
    private readonly threshold = 5,
    private readonly cooldownMs = 30_000,
  ) {}

  get open(): boolean {
    if (this.failures < this.threshold) return false;
    if (Date.now() - this.openedAt >= this.cooldownMs) {
      // Half-open: allow a probe.
      this.failures = this.threshold - 1;
      return false;
    }
    return true;
  }

  get available(): boolean {
    return !this.open;
  }

  recordSuccess(): void {
    this.failures = 0;
    this.openedAt = 0;
  }

  recordFailure(): void {
    this.failures += 1;
    if (this.failures >= this.threshold) this.openedAt = Date.now();
  }
}

const providerBreaker = new CircuitBreaker();

/** ESM-friendly lazy loader (no require()) for the server-only SDK. */
const loadSdk = (): GenAiSdk => {
  if (!sdkCache) {
    sdkCache = (globalThis as { __genaiSdk?: GenAiSdk }).__genaiSdk ?? null;
    if (!sdkCache) {
      throw new Error("AI SDK not initialised");
    }
  }
  return sdkCache;
};

/** Called once at server bootstrap (services/api) before any AI call. */
export const initGenAiSdk = async (): Promise<void> => {
  if (sdkCache) return;
  sdkCache = await import("@google/genai");
  (globalThis as { __genaiSdk?: GenAiSdk }).__genaiSdk = sdkCache;
};

export class GeminiProvider implements AiProvider {
  readonly model: string;
  private client: import("@google/genai").GoogleGenAI;

  constructor(apiKey: string, model = "gemini-2.5-flash") {
    // Lazy import keeps the SDK out of any bundler graph that might pull it
    // client-side; this module is server-only by contract.
    const sdk = loadSdk();
    this.client = new sdk.GoogleGenAI({ apiKey });
    this.model = model;
  }

  private async complete(systemPrompt: string, userPrompt: string): Promise<string> {
    // Fail fast while the provider is known to be unhealthy (PERF-003).
    if (providerBreaker.open) {
      throw new Error("AI provider circuit breaker is open; try again shortly");
    }
    try {
      const response = await this.client.models.generateContent({
        model: this.model,
        contents: userPrompt,
        config: {
          systemInstruction: systemPrompt,
          temperature: 0.2,
        },
      });
      const text = response.text;
      if (!text) throw new Error("Empty response from AI provider");
      providerBreaker.recordSuccess();
      return text.trim();
    } catch (err) {
      providerBreaker.recordFailure();
      throw err;
    }
  }

  async generateScribeDraft(
    systemPrompt: string,
    input: ScribePromptInput,
  ): Promise<{ chiefComplaint: string; observations: string; plan: string }> {
    const vitalsBlock = input.vitals.length
      ? input.vitals.map((v) => `- ${v.label}: ${v.value}${v.unit ? ` ${v.unit}` : ""}`).join("\n")
      : "(no vitals recorded)";
    const userPrompt = [
      "Draft a structured clinical note from the following session data.",
      `Chief complaint: ${input.chiefComplaint ?? "(none)"}`,
      `Observations: ${input.observations ?? "(none)"}`,
      `Plan: ${input.plan ?? "(none)"}`,
      `Vitals:\n${vitalsBlock}`,
      "",
      "Return STRICT JSON only: {\"chiefComplaint\": string, \"observations\": string, \"plan\": string}. Keep each field under 1200 characters, factual, no invented findings.",
    ].join("\n");
    const raw = await this.complete(systemPrompt, userPrompt);
    return this.parseScribeJson(raw);
  }

  private parseScribeJson(raw: string): { chiefComplaint: string; observations: string; plan: string } {
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[0]) as Record<string, unknown>;
        return {
          chiefComplaint: String(parsed.chiefComplaint ?? "").slice(0, 4000),
          observations: String(parsed.observations ?? "").slice(0, 20000),
          plan: String(parsed.plan ?? "").slice(0, 20000),
        };
      } catch {
        // fall through to plain-text fallback
      }
    }
    return {
      chiefComplaint: input_fallback("chiefComplaint", raw),
      observations: input_fallback("observations", raw),
      plan: raw.slice(0, 20000),
    };
  }

  async generateChatReply(systemPrompt: string, input: ChatPromptInput): Promise<string> {
    const history = input.history
      .slice(-10)
      .map((m) => `${m.role === "USER" ? "User" : "Assistant"}: ${m.content}`)
      .join("\n");
    const userPrompt = `${history}\nUser: ${input.message}\n\nAnswer concisely as the assistant. Do not invent clinical facts. State clearly when a clinician must decide.`;
    return this.complete(systemPrompt, userPrompt);
  }
}

function input_fallback(_field: string, raw: string): string {
  return raw.slice(0, 4000);
}

/**
 * Default prompt templates seeded per clinic. Clinics can edit them in
 * Administration; every generation records the prompt version used.
 */
export const DEFAULT_PROMPTS: Record<string, { purpose: string; template: string }> = {
  SCRIBE_NOTE: {
    purpose: "Draft clinical notes from session data. Output is always reviewed and signed by a clinician.",
    template:
      "You are a clinical documentation assistant for an ambulatory clinic. You draft structured notes that a clinician will review and sign. You never invent findings, diagnoses or medication orders. If data is missing, write what is supported by the provided session only. Avoid identifying patient details in the output.",
  },
  CHAT_ASSISTANT: {
    purpose: "Administrative and clinical-context chat assistant.",
    template:
      "You are a clinic assistant for healthcare staff. Answers must be concise, professional and safe. You never provide a final diagnosis or medication decision; recommend clinician judgement for clinical choices. Patient data you see has been de-identified.",
  },
};
