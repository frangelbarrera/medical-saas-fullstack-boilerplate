/**
 * Envelope encryption and key rotation (KEY-001). These tests exercise the
 * real key handling against the process environment, so each case scopes
 * its own ENCRYPTION_KEYS / ENCRYPTION_KEY values and resets the module
 * cache through dynamic re-import.
 */
import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";

type CryptoModule = typeof import("@medical/data");

const KEY_A = "a".repeat(64);
const KEY_B = "b".repeat(64);
const LEGACY = "c".repeat(64);
const HMAC = "d".repeat(64);

let mod: CryptoModule;

const load = async (env: Record<string, string>): Promise<CryptoModule> => {
  for (const k of ["ENCRYPTION_KEY", "ENCRYPTION_KEYS"]) delete process.env[k];
  Object.assign(process.env, env);
  vi.resetModules();
  return (await import("@medical/data")) as CryptoModule;
};

const baseEnv = { PHI_HMAC_KEY: HMAC, JWT_SECRET: "test_jwt_secret_minimum_32_characters_long" };

describe("phi envelope encryption (KEY-001)", () => {
  beforeEach(() => {
    delete process.env.ENCRYPTION_KEYS;
    process.env.ENCRYPTION_KEY = LEGACY;
    process.env.PHI_HMAC_KEY = HMAC;
  });

  afterEach(() => {
    delete process.env.ENCRYPTION_KEYS;
    process.env.ENCRYPTION_KEY = LEGACY;
  });

  it("writes the legacy envelope when only ENCRYPTION_KEY is set and round-trips", async () => {
    mod = await load({ ...baseEnv, ENCRYPTION_KEY: LEGACY });
    const ct = mod.encryptPHI("patient@example.ch");
    expect(ct).toMatch(/^v2:legacy:[0-9a-f]+:[0-9a-f]+:[0-9a-f]+$/);
    expect(mod.decryptPHI(ct)).toBe("patient@example.ch");
  });

  it("decrypts pre-rotation 3-part ciphertexts with the legacy key", async () => {
    mod = await load({ ...baseEnv, ENCRYPTION_KEY: LEGACY });
    const iv = Buffer.alloc(12, 7);
    const cipher = (await import("crypto")).createCipheriv("aes-256-gcm", Buffer.from(LEGACY, "hex"), iv);
    const ct = Buffer.concat([cipher.update("old data", "utf8"), cipher.final()]);
    const tag = cipher.getAuthTag();
    const legacyText = `${iv.toString("hex")}:${tag.toString("hex")}:${ct.toString("hex")}`;
    expect(mod.decryptPHI(legacyText)).toBe("old data");
  });

  it("carries the key id inside the envelope and reads old versions during rotation", async () => {
    mod = await load({ ...baseEnv, ENCRYPTION_KEYS: `v2024a:${KEY_A}`, ENCRYPTION_KEY: LEGACY });
    expect(mod.activeEncryptionKeyId()).toBe("v2024a");
    const oldCt = mod.encryptPHI("rotated away value");
    expect(oldCt.startsWith("v2:v2024a:")).toBe(true);

    // Rotate the primary; old ciphertexts stay readable, new writes re-key.
    mod = await load({ ...baseEnv, ENCRYPTION_KEYS: `v2026b:${KEY_B},v2024a:${KEY_A}`, ENCRYPTION_KEY: LEGACY });
    expect(mod.activeEncryptionKeyId()).toBe("v2026b");
    expect(mod.decryptPHI(oldCt)).toBe("rotated away value");
    const fresh = mod.encryptPHI("new envelope");
    expect(fresh.startsWith("v2:v2026b:")).toBe(true);
    expect(mod.usesPrimaryEnvelope(fresh)).toBe(true);
    expect(mod.usesPrimaryEnvelope(oldCt)).toBe(false);
  });

  it("fails loudly on a tampered auth tag", async () => {
    mod = await load({ ...baseEnv, ENCRYPTION_KEYS: `k1:${KEY_A}` });
    const ct = mod.encryptPHI("integrity matters")!;
    const tampered = ct.replace(/:(?=[0-9a-f]+$)/, ":0000000000000000000000000000000000000000000000000000000000000000");
    expect(() => mod.decryptPHI(tampered)).toThrowError(/integrity/i);
  });

  it("rejects decryption when a key id is unknown to the deployment", async () => {
    mod = await load({ ...baseEnv, ENCRYPTION_KEYS: `k1:${KEY_A}` });
    const ct = mod.encryptPHI("hidden value")!;
    mod = await load({ ...baseEnv, ENCRYPTION_KEYS: `other:${KEY_B}` });
    expect(() => mod.decryptPHI(ct)).toThrowError(/no key material/i);
  });
});
