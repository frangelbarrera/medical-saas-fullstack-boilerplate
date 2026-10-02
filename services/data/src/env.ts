/**
 * Environment contract for the data layer. Loaded from the process env (the
 * api layer loads dotenv before importing anything else).
 */
import { z } from "zod";

export const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]),
  PORT: z.coerce.number().int().default(3000),
  DATABASE_URL: z.string().url(),
  JWT_SECRET: z.string().min(32),
  ENCRYPTION_KEY: z
    .string()
    .regex(/^[0-9a-fA-F]{64}$/, "ENCRYPTION_KEY must be 64 hex chars"),
  // Optional envelope key set for rotation (KEY-001): 'id1:hex64,id2:hex64'.
  // The first entry is the primary (writes); ENCRYPTION_KEY stays as the
  // legacy-read key until the re-encryption job completes.
  ENCRYPTION_KEYS: z
    .string()
    .regex(
      /^[A-Za-z0-9_-]+:[0-9a-fA-F]{64}(,[A-Za-z0-9_-]+:[0-9a-fA-F]{64})*$/,
      "ENCRYPTION_KEYS must be comma-separated id:hex64 pairs",
    )
    .optional(),
  PHI_HMAC_KEY: z
    .string()
    .regex(/^[0-9a-fA-F]{64}$/, "PHI_HMAC_KEY must be 64 hex chars"),
  FRONTEND_URL: z.string().url().default("http://localhost:3000"),
  TRUST_PROXY: z.string().default("1"),
  GEMINI_API_KEY: z.string().optional(),
  LLM_PHI_MODE: z.enum(["strip", "redact", "passthrough"]).default("strip"),
  // Governance records for LLM passthrough (fail-closed, AI-001): the server
  // refuses to start in passthrough mode unless every one of these is set,
  // proving a signed DPA/BAA, an approved provider, a documented processing
  // location, zero-retention training opt-out and a completed DPIA.
  LLM_DPA_RECORDED: z.string().optional(),
  LLM_PROVIDER_APPROVED: z.string().optional(),
  LLM_DATA_RESIDENCY: z.string().optional(),
  LLM_ZERO_RETENTION: z.string().optional(),
  LLM_DPIA_RECORDED: z.string().optional(),
  // Approved model ids (AI-002, fail-closed): comma-separated allowlist of
  // the model versions this deployment may call. Unset keeps the provider
  // default for non-passthrough modes.
  LLM_ALLOWED_MODELS: z.string().optional(),
  // SMART App Launch authorization server (INT-001): when set, the discovery
  // document advertises its authorize/token endpoints. Unset means the
  // deployment exposes no SMART authorization yet (mapping layer only).
  SMART_AUTH_SERVER_URL: z.string().url().optional(),
  PAYMENT_WEBHOOK_SECRET: z.string().min(16).optional(),
  PAYMENT_GATEWAY_TOKEN: z.string().optional(),
});

export type Env = z.infer<typeof envSchema>;

let cached: Env | null = null;

export function loadEnv(): Env {
  if (!cached) {
    const parsed = envSchema.safeParse(process.env);
    if (!parsed.success) {
      const issues = parsed.error.issues
        .map((i) => `  ${i.path.join(".")}: ${i.message}`)
        .join("\n");
      console.error("Invalid or missing environment variables:\n" + issues);
      process.exit(1);
    }
    cached = parsed.data;
  }
  // Fail-closed passthrough gate: sending PHI as-is to a processor is only
  // legal with a full governance record. Missing any piece disables the mode.
  if (cached.LLM_PHI_MODE === "passthrough") {
    const missing = [
      "LLM_DPA_RECORDED",
      "LLM_PROVIDER_APPROVED",
      "LLM_DATA_RESIDENCY",
      "LLM_ZERO_RETENTION",
      "LLM_DPIA_RECORDED",
    ].filter((k) => !process.env[k] || process.env[k]!.trim() === "");
    if (missing.length > 0) {
      console.error(
        // eslint-disable-next-line no-secrets/no-secrets -- mode name, not a secret
        "LLM_PHI_MODE=passthrough requires the full governance record; missing: " +
          missing.join(", ") +
          ". Falling back to 'redact'. Set these env records only after the DPA, DPIA and provider review are complete.",
      );
      cached = { ...cached, LLM_PHI_MODE: "redact" };
    }
  }
  return cached;
}
