import { describe, it, expect } from "vitest";

/**
 * Test that env.server.ts Zod schema correctly rejects invalid configurations.
 * We re-implement the schema here to test the validation logic without depending
 * on the actual process.env state.
 *
 * In a future refactor, env.server.ts should export the schema for direct testing.
 */
import { z } from "zod";

const envSchema = z.object({
  JWT_SECRET: z.string().min(32),
  ENCRYPTION_KEY: z.string().regex(/^[0-9a-fA-F]{64}$/),
  PAYMENT_WEBHOOK_SECRET: z.string().min(16),
});

describe("env validation", () => {
  it("should accept valid secrets", () => {
    const result = envSchema.safeParse({
      JWT_SECRET: "a".repeat(32),
      ENCRYPTION_KEY: "a".repeat(64),
      PAYMENT_WEBHOOK_SECRET: "a".repeat(16),
    });
    expect(result.success).toBe(true);
  });

  it("should reject a JWT_SECRET shorter than 32 characters", () => {
    const result = envSchema.safeParse({
      JWT_SECRET: "short",
      ENCRYPTION_KEY: "a".repeat(64),
      PAYMENT_WEBHOOK_SECRET: "a".repeat(16),
    });
    expect(result.success).toBe(false);
  });

  it("should reject an ENCRYPTION_KEY that is not 64 hex chars", () => {
    const cases = [
      "short",
      "g".repeat(64), // non-hex
      "a".repeat(32), // too short
      "a".repeat(66), // too long
    ];
    for (const key of cases) {
      const result = envSchema.safeParse({
        JWT_SECRET: "a".repeat(32),
        ENCRYPTION_KEY: key,
        PAYMENT_WEBHOOK_SECRET: "a".repeat(16),
      });
      expect(result.success).toBe(false);
    }
  });

  it("should reject a PAYMENT_WEBHOOK_SECRET shorter than 16 chars", () => {
    const result = envSchema.safeParse({
      JWT_SECRET: "a".repeat(32),
      ENCRYPTION_KEY: "a".repeat(64),
      PAYMENT_WEBHOOK_SECRET: "short",
    });
    expect(result.success).toBe(false);
  });

  it("should reject all defaults being missing", () => {
    const result = envSchema.safeParse({});
    expect(result.success).toBe(false);
  });
});
