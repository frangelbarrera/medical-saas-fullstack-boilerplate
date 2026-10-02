/**
 * RFC 6238 time-based one-time passwords built on node:crypto.
 *
 * Profile: SHA-1 HMAC / 30-second steps / 6 digits - the default every
 * authenticator app (Aegis, Google Authenticator, 1Password) assumes for
 * otpauth:// URIs. Verification tolerates +/-1 step of clock drift and uses
 * timing-safe comparison so the endpoint cannot act as a code oracle.
 */
import crypto from "crypto";

// RFC 4648 base32 alphabet (no-secrets: static constant, not a credential).
// eslint-disable-next-line no-secrets/no-secrets
const B32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
const STEP_SECONDS = 30;

export const base32Encode = (buf: Buffer): string => {
  let bits = 0;
  let value = 0;
  let output = "";
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += B32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) output += B32_ALPHABET[(value << (5 - bits)) & 31];
  return output;
};

export const base32Decode = (input: string): Buffer => {
  const clean = input.replace(/=+$/g, "").toUpperCase();
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const char of clean) {
    const idx = B32_ALPHABET.indexOf(char);
    if (idx === -1) throw new Error("Invalid base32 character");
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(out);
};

/** 160-bit secret (RFC 6238 recommendation), base32-encoded for apps. */
export const generateTotpSecret = (bytes = 20): string => base32Encode(crypto.randomBytes(bytes));

const hotp = (key: Buffer, counter: number): string => {
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64BE(BigInt(counter));
  const mac = crypto.createHmac("sha1", key).update(buf).digest();
  const offset = mac[mac.length - 1] & 0x0f;
  const binary =
    ((mac[offset] & 0x7f) << 24) |
    ((mac[offset + 1] & 0xff) << 16) |
    ((mac[offset + 2] & 0xff) << 8) |
    (mac[offset + 3] & 0xff);
  return String(binary % 1_000_000).padStart(6, "0");
};

export const currentTotp = (secret: string, at: number = Date.now()): string =>
  hotp(base32Decode(secret), Math.floor(at / 1000 / STEP_SECONDS));

export const verifyTotp = (secret: string, code: string, at: number = Date.now()): boolean => {
  if (!/^\d{6}$/.test(code)) return false;
  const key = base32Decode(secret);
  const counter = Math.floor(at / 1000 / STEP_SECONDS);
  for (const drift of [-1, 0, 1]) {
    const expected = Buffer.from(hotp(key, counter + drift));
    const presented = Buffer.from(code);
    if (expected.length === presented.length && crypto.timingSafeEqual(expected, presented)) {
      return true;
    }
  }
  return false;
};

export const otpauthUri = (secret: string, account: string, issuer: string): string =>
  `otpauth://totp/${encodeURIComponent(issuer)}:${encodeURIComponent(account)}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`;
