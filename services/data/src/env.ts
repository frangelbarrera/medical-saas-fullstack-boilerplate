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
  PHI_HMAC_KEY: z
    .string()
    .regex(/^[0-9a-fA-F]{64}$/, "PHI_HMAC_KEY must be 64 hex chars"),
  FRONTEND_URL: z.string().url().default("http://localhost:3000"),
  TRUST_PROXY: z.string().default("1"),
  GEMINI_API_KEY: z.string().optional(),
  LLM_PHI_MODE: z.enum(["strip", "redact", "passthrough"]).default("strip"),
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
  return cached;
}
