/**
 * AES-256-GCM authenticated encryption for PHI fields.
 *
 * Ciphertext format: 'iv:authTag:ciphertext' (all hex, 24:32:N chars).
 * The auth tag prevents ciphertext tampering (padding oracle / bit-flipping).
 */
import crypto from "crypto";
import { ENCRYPTION_KEY } from "../config.js";

const IV_LENGTH = 12; // 96-bit IV is recommended for GCM

export const encryptPHI = (text: string): string => {
  if (!text) return text;
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv("aes-256-gcm", ENCRYPTION_KEY, iv);
  let encrypted = cipher.update(text, "utf8");
  encrypted = Buffer.concat([encrypted, cipher.final()]);
  const authTag = cipher.getAuthTag();
  return iv.toString("hex") + ":" + authTag.toString("hex") + ":" + encrypted.toString("hex");
};

export const decryptPHI = (text: string): string => {
  if (!text) return text;
  try {
    const parts = text.split(":");
    if (parts.length !== 3) {
      // Not a GCM ciphertext (legacy/mock data). Return as-is.
      return text;
    }
    const [ivHex, authTagHex, ciphertextHex] = parts;
    const iv = Buffer.from(ivHex, "hex");
    const authTag = Buffer.from(authTagHex, "hex");
    const ciphertext = Buffer.from(ciphertextHex, "hex");
    const decipher = crypto.createDecipheriv("aes-256-gcm", ENCRYPTION_KEY, iv);
    decipher.setAuthTag(authTag);
    let decrypted = decipher.update(ciphertext);
    decrypted = Buffer.concat([decrypted, decipher.final()]);
    return decrypted.toString("utf8");
  } catch (e) {
    // Auth tag verification failed OR ciphertext corrupted.
    // Never return partial/decrypted data — throw instead.
    throw new Error("PHI decryption failed: ciphertext integrity check failed");
  }
};

export const generateCsrfToken = (): string => crypto.randomBytes(32).toString("hex");

export const generateRandomId = (prefix: string): string => `${prefix}_${crypto.randomUUID()}`;
