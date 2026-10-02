/**
 * Field-level PHI protection with envelope-style key management (KEY-001).
 *
 * Ciphertext format v2: 'v2:<keyId>:<iv>:<authTag>:<ciphertext>' (hex).
 * The key id travels inside the ciphertext, so multiple key versions can be
 * live at once: reads resolve the right key, writes always use the primary.
 * Legacy rows ('iv:authTag:ciphertext') decrypt with the legacy key taken
 * from ENCRYPTION_KEY; the re-encryption job migrates them to v2.
 *
 * - encryptPHI / decryptPHI: AES-256-GCM authenticated encryption. The auth
 *   tag prevents tampering; a failed check fails loudly.
 * - hmacIndex: deterministic HMAC-SHA256 search index so exact-match
 *   lookups never decrypt the directory.
 * - hashIp: minimize IP addresses before they touch the audit log.
 */
import crypto from "crypto";

const IV_LENGTH = 12; // 96-bit IV recommended for GCM
const LEGACY_KEY_ID = "legacy";

interface EncryptionKeySet {
  /** Key used for all NEW ciphertexts. */
  primaryId: string;
  /** Key id -> raw AES-256 key material. */
  keys: Map<string, Buffer>;
  /** Key for pre-v2 rows (ENCRYPTION_KEY); absent when never provided. */
  legacy?: Buffer;
}

const parseKeyPairs = (raw: string | undefined): Map<string, Buffer> => {
  const keys = new Map<string, Buffer>();
  if (!raw) return keys;
  for (const pair of raw.split(",")) {
    const sep = pair.indexOf(":");
    if (sep <= 0) continue;
    const id = pair.slice(0, sep).trim();
    const hex = pair.slice(sep + 1).trim();
    if (!id || !/^[0-9a-fA-F]{64}$/.test(hex)) continue;
    keys.set(id, Buffer.from(hex, "hex"));
  }
  return keys;
};

let keyCache: { encryption: EncryptionKeySet; hmac: Buffer } | null = null;

const keys = () => {
  if (!keyCache) {
    const pairs = parseKeyPairs(process.env.ENCRYPTION_KEYS);
    const legacyHex = process.env.ENCRYPTION_KEY ?? "";
    const legacy = /^[0-9a-fA-F]{64}$/.test(legacyHex) ? Buffer.from(legacyHex, "hex") : undefined;
    if (legacy) pairs.set(LEGACY_KEY_ID, legacy);
    // The primary is the first entry of ENCRYPTION_KEYS; a deployment that
    // still only sets ENCRYPTION_KEY keeps writing under 'legacy'.
    const primaryId = process.env.ENCRYPTION_KEYS?.split(",")[0]?.split(":")[0]?.trim() || LEGACY_KEY_ID;
    keyCache = {
      encryption: { primaryId, keys: pairs },
      hmac: Buffer.from(process.env.PHI_HMAC_KEY ?? "", "hex"),
    };
  }
  return keyCache;
};

export const activeEncryptionKeyId = (): string => keys().encryption.primaryId;

export const encryptPHI = (text: string | null | undefined): string | null => {
  if (text === null || text === undefined || text === "") return null;
  const set = keys().encryption;
  const key = set.keys.get(set.primaryId);
  if (!key) throw new Error("PHI encryption key material is not available");
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(text, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `v2:${set.primaryId}:${iv.toString("hex")}:${authTag.toString("hex")}:${encrypted.toString("hex")}`;
};

export const decryptPHI = (text: string | null | undefined): string | null => {
  if (text === null || text === undefined || text === "") return null;
  const set = keys().encryption;

  // Versioned envelope: the key id rides with the ciphertext.
  if (text.startsWith("v2:")) {
    const [, keyId, ivHex, authTagHex, ciphertextHex] = text.split(":");
    const key = set.keys.get(keyId ?? "");
    if (!key || !ivHex || !authTagHex || !ciphertextHex) {
      throw new Error(`PHI decryption failed: no key material for key id ${keyId ?? "(missing)"}`);
    }
    const decipher = crypto.createDecipheriv("aes-256-gcm", key, Buffer.from(ivHex, "hex"));
    decipher.setAuthTag(Buffer.from(authTagHex, "hex"));
    try {
      const decrypted = Buffer.concat([decipher.update(Buffer.from(ciphertextHex, "hex")), decipher.final()]);
      return decrypted.toString("utf8");
    } catch {
      // Auth tag verification failed or ciphertext corrupted: never return
      // partial data - fail loudly instead.
      throw new Error("PHI decryption failed: ciphertext integrity check failed");
    }
  }

  // Legacy pre-rotation format without a key id.
  const parts = text.split(":");
  if (parts.length !== 3) return text; // not a GCM ciphertext (legacy value)
  const [ivHex, authTagHex, ciphertextHex] = parts;
  const key = set.keys.get(LEGACY_KEY_ID) ?? set.keys.get(set.primaryId);
  if (!key) throw new Error("PHI decryption failed: legacy key material is not available");
  try {
    const decipher = crypto.createDecipheriv("aes-256-gcm", key, Buffer.from(ivHex, "hex"));
    decipher.setAuthTag(Buffer.from(authTagHex, "hex"));
    const decrypted = Buffer.concat([decipher.update(Buffer.from(ciphertextHex, "hex")), decipher.final()]);
    return decrypted.toString("utf8");
  } catch {
    throw new Error("PHI decryption failed: ciphertext integrity check failed");
  }
};

/** True when the ciphertext uses the current primary key (re-encrypt probe). */
export const usesPrimaryEnvelope = (text: string | null | undefined): boolean =>
  Boolean(text && text.startsWith(`v2:${keys().encryption.primaryId}:`));

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
