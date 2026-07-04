import { describe, it, expect, beforeEach, vi } from "vitest";

/**
 * Test the AES-256-GCM encryption/decryption logic.
 *
 * Since server.ts is a monolithic file that calls app.listen() at import time,
 * we cannot import encryptPHI/decryptPHI directly. Instead, we re-implement
 * the same logic here to verify the algorithm behaves as expected, and we
 * test the integration in webhook.test.ts via supertest.
 *
 * TODO: When server.ts is refactored to export createApp(), these tests should
 * import from the source module directly.
 */
import crypto from "crypto";

const ENCRYPTION_KEY = Buffer.from("a".repeat(64), "hex");
const IV_LENGTH = 12;

const encryptPHI = (text: string): string => {
  if (!text) return text;
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv("aes-256-gcm", ENCRYPTION_KEY, iv);
  let encrypted = cipher.update(text, "utf8");
  encrypted = Buffer.concat([encrypted, cipher.final()]);
  const authTag = cipher.getAuthTag();
  return iv.toString("hex") + ":" + authTag.toString("hex") + ":" + encrypted.toString("hex");
};

const decryptPHI = (text: string): string => {
  if (!text) return text;
  const parts = text.split(":");
  if (parts.length !== 3) return text;
  const [ivHex, authTagHex, ciphertextHex] = parts;
  const iv = Buffer.from(ivHex, "hex");
  const authTag = Buffer.from(authTagHex, "hex");
  const ciphertext = Buffer.from(ciphertextHex, "hex");
  const decipher = crypto.createDecipheriv("aes-256-gcm", ENCRYPTION_KEY, iv);
  decipher.setAuthTag(authTag);
  let decrypted = decipher.update(ciphertext);
  decrypted = Buffer.concat([decrypted, decipher.final()]);
  return decrypted.toString("utf8");
};

describe("AES-256-GCM encryption", () => {
  it("should round-trip a PHI string correctly", () => {
    const plaintext = "1712345678";
    const ciphertext = encryptPHI(plaintext);
    expect(ciphertext).not.toBe(plaintext);
    expect(ciphertext.split(":")).toHaveLength(3);
    expect(decryptPHI(ciphertext)).toBe(plaintext);
  });

  it("should produce different ciphertexts for the same plaintext (random IV)", () => {
    const plaintext = "john@test.com";
    const c1 = encryptPHI(plaintext);
    const c2 = encryptPHI(plaintext);
    expect(c1).not.toBe(c2);
    expect(decryptPHI(c1)).toBe(plaintext);
    expect(decryptPHI(c2)).toBe(plaintext);
  });

  it("should return empty string for empty input", () => {
    expect(encryptPHI("")).toBe("");
    expect(decryptPHI("")).toBe("");
  });

  it("should throw when the auth tag is tampered with", () => {
    const ciphertext = encryptPHI("secret");
    const parts = ciphertext.split(":");
    // Flip a bit in the auth tag
    const tamperedTag = (parseInt(parts[1][0], 16) ^ 1).toString(16) + parts[1].slice(1);
    const tampered = `${parts[0]}:${tamperedTag}:${parts[2]}`;
    expect(() => decryptPHI(tampered)).toThrow();
  });

  it("should throw when the ciphertext is modified", () => {
    const ciphertext = encryptPHI("secret");
    const parts = ciphertext.split(":");
    // Flip a bit in the ciphertext
    const tamperedCiphertext =
      (parseInt(parts[2][0], 16) ^ 1).toString(16) + parts[2].slice(1);
    const tampered = `${parts[0]}:${parts[1]}:${tamperedCiphertext}`;
    expect(() => decryptPHI(tampered)).toThrow();
  });

  it("should return plaintext for non-GCM format (legacy passthrough)", () => {
    // Legacy CBC format was iv:ciphertext (2 parts)
    const legacy = "abc:def";
    expect(decryptPHI(legacy)).toBe(legacy);
  });

  it("should handle Unicode characters (Spanish names with accents)", () => {
    const names = ["María José", "Ñoño", "François", "日本語"];
    for (const name of names) {
      const ciphertext = encryptPHI(name);
      expect(decryptPHI(ciphertext)).toBe(name);
    }
  });

  it("should produce ciphertext with hex-encoded IV, authTag, and ciphertext", () => {
    const ciphertext = encryptPHI("test");
    const [iv, authTag, encrypted] = ciphertext.split(":");
    expect(iv).toMatch(/^[0-9a-f]+$/);
    expect(authTag).toMatch(/^[0-9a-f]+$/);
    expect(encrypted).toMatch(/^[0-9a-f]+$/);
    // IV is 12 bytes = 24 hex chars
    expect(iv).toHaveLength(24);
    // Auth tag is 16 bytes = 32 hex chars
    expect(authTag).toHaveLength(32);
  });
});
