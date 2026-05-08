import { z } from "zod";
import dotenv from "dotenv";

dotenv.config();

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PGHOST: z.string().default("localhost"),
  PGPORT: z.string().default("5432").transform((val) => parseInt(val, 10)),
  PGUSER: z.string().default("postgres"),
  PGPASSWORD: z.string().default("postgres"),
  PGDATABASE: z.string().default("medical_saas_db"),
  JWT_SECRET: z.string().min(16, "JWT_SECRET should be at least 16 characters for security").default("medical_saas_secret_key_2026"),
  GEMINI_API_KEY: z.string().optional(),
  PAYMENT_GATEWAY_TOKEN: z.string().optional(),
  PAYMENT_GATEWAY_URL: z.string().url().optional().default("https://pay.payphone.com.ec/api/button/Prepare"),
});

const _env = envSchema.safeParse(process.env);

if (!_env.success) {
  console.error("❌ Invalid environment variables:", JSON.stringify(_env.error.format(), null, 2));
  process.exit(1);
}

export const env = _env.data;
export type Env = z.infer<typeof envSchema>;
