/**
 * Field-level PHI protection.
 *
 * - encryptPHI / decryptPHI: AES-256-GCM authenticated encryption for values
 *   at rest ('iv:authTag:ciphertext', all hex). Auth tag prevents tampering.
 * - hmacIndex: deterministic HMAC-SHA256 of a plaintext, used as a search
 *   index so exact-match lookups never decrypt the whole directory (the
 *   search problem flagged in the security review).
 * - hashIp: minimize IP addresses before they touch the audit log.
 */
import crypto from "crypto";

const IV_LENGTH = 12; // 96-bit IV recommended for GCM

let keyCache: { encryption: Buffer; hmac: Buffer } | null = null;

const keys = () => {
  if (!keyCache) {
    keyCache = {
      encryption: Buffer.from(process.env.ENCRYPTION_KEY ?? "", "hex"),
      hmac: Buffer.from(process.env.PHI_HMAC_KEY ?? "", "hex"),
    };
  }
  return keyCache;
};

export const encryptPHI = (text: string | null | undefined): string | null => {
  if (text === null || text === undefined || text === "") return null;
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv("aes-256-gcm", keys().encryption, iv);
  const encrypted = Buffer.concat([cipher.update(text, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `${iv.toString("hex")}:${authTag.toString("hex")}:${encrypted.toString("hex")}`;
};

export const decryptPHI = (text: string | null | undefined): string | null => {
  if (text === null || text === undefined || text === "") return null;
  const parts = text.split(":");
  if (parts.length !== 3) return text; // not a GCM ciphertext (legacy value)
  const [ivHex, authTagHex, ciphertextHex] = parts;
  try {
    const decipher = crypto.createDecipheriv(
      "aes-256-gcm",
      keys().encryption,
      Buffer.from(ivHex, "hex"),
    );
    decipher.setAuthTag(Buffer.from(authTagHex, "hex"));
    const decrypted = Buffer.concat([
      decipher.update(Buffer.from(ciphertextHex, "hex")),
      decipher.final(),
    ]);
    return decrypted.toString("utf8");
  } catch {
    // Auth tag verification failed or ciphertext corrupted: never return
    // partial data - fail loudly instead.
    throw new Error("PHI decryption failed: ciphertext integrity check failed");
  }
};

export const hmacIndex = (text: string | null | undefined): string | null => {
  if (text === null || text === undefined || text === "") return null;
  return crypto
    .createHmac("sha256", keys().hmac)
    .update(text.trim().toLowerCase())
    .digest("hex");
};

export const hashIp = (ip: string | null | undefined): string | null => {
  if (!ip) return null;
  return crypto.createHmac("sha256", keys().hmac).update(ip).digest("hex").slice(0, 32);
};

export const generateCsrfToken = (): string => crypto.randomBytes(32).toString("hex");

export const sha256 = (data: string): string =>
  crypto.createHash("sha256").update(data).digest("hex");
