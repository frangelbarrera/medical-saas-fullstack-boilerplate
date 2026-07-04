import { z } from "zod";
import dotenv from "dotenv";

dotenv.config();

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z
    .string()
    .default("3000")
    .transform((val) => parseInt(val, 10)),
  PGHOST: z.string().default("localhost"),
  PGPORT: z
    .string()
    .default("5432")
    .transform((val) => parseInt(val, 10)),
  PGUSER: z.string().default("postgres"),
  PGPASSWORD: z.string().default("postgres"),
  PGDATABASE: z.string().default("medical_saas_db"),
  // Auth secrets: NO defaults. The app must crash if these are missing.
  JWT_SECRET: z.string().min(32, "JWT_SECRET must be at least 32 characters. Generate one with: openssl rand -hex 32"),
  ENCRYPTION_KEY: z
    .string()
    .regex(
      /^[0-9a-fA-F]{64}$/,
      "ENCRYPTION_KEY must be a 64-char hex string (32 bytes). Generate one with: openssl rand -hex 32",
    ),
  // Optional integrations
  GEMINI_API_KEY: z.string().optional(),
  PAYMENT_GATEWAY_TOKEN: z.string().optional(),
  PAYMENT_GATEWAY_URL: z.string().url().optional().default("https://pay.payphone.com.ec/api/button/Prepare"),
  PAYMENT_WEBHOOK_SECRET: z
    .string()
    .min(16, "PAYMENT_WEBHOOK_SECRET must be at least 16 chars for HMAC verification")
    .optional(),
  // Frontend URL for CORS and redirects
  FRONTEND_URL: z.string().url().default("http://localhost:3000"),
  // AI PHI handling mode: strip (default, removes PHI before LLM call), redact (mask), passthrough (no filtering, requires BAA)
  LLM_PHI_MODE: z.enum(["strip", "redact", "passthrough"]).default("strip"),
});

const _env = envSchema.safeParse(process.env);

if (!_env.success) {
  console.error("❌ Invalid or missing environment variables:");
  console.error(JSON.stringify(_env.error.format(), null, 2));
  console.error("\nRequired secrets (no defaults):");
  console.error("  JWT_SECRET          - min 32 chars   - generate: openssl rand -hex 32");
  console.error("  ENCRYPTION_KEY      - 64 hex chars   - generate: openssl rand -hex 32");
  console.error("  PAYMENT_WEBHOOK_SECRET - min 16 chars - generate: openssl rand -hex 16");
  process.exit(1);
}

export const env = _env.data;
export type Env = z.infer<typeof envSchema>;
