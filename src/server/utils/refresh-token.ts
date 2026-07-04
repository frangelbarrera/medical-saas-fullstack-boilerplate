/**
 * Refresh token service.
 *
 * Strategy:
 *  - Access token: JWT, 8h expiry, stored in httpOnly cookie. Used for API calls.
 *  - Refresh token: opaque random string (not JWT), 30d expiry, stored in DB
 *    (mock array for dev, Prisma in prod) AND in httpOnly cookie.
 *  - Rotation: every time the refresh token is used, a new one is issued and
 *    the old one is revoked. This limits the window of replay if a refresh
 *    token is stolen.
 *  - Revocation: refresh tokens can be revoked explicitly (logout) or
 *    automatically (rotation invalidates the old one).
 *
 * Why opaque tokens (not JWT) for refresh?
 *  - JWT refresh tokens cannot be revoked without a server-side blocklist,
 *    which defeats the purpose of stateless tokens.
 *  - Opaque tokens require a DB lookup, but that's the point: we can revoke
 *    them instantly by deleting from the DB.
 */
import crypto from "crypto";
import jwt from "jsonwebtoken";
import { JWT_SECRET } from "../config.js";

export interface RefreshTokenRecord {
  token: string; // SHA-256 hash of the refresh token (never store raw)
  userId: string;
  clinicId: string;
  expiresAt: Date;
  createdAt: Date;
  revoked: boolean;
  replacedBy?: string; // token hash that replaced this one (rotation)
}

// Mock store (in production: Prisma model RefreshToken)
const refreshTokens: RefreshTokenRecord[] = [];

const REFRESH_TOKEN_BYTES = 48; // 48 bytes = 96 hex chars
const REFRESH_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const ACCESS_TOKEN_TTL_SEC = 8 * 60 * 60; // 8 hours

export const REFRESH_COOKIE_NAME = "refresh_token";
export const REFRESH_COOKIE_NAME_PROD = "__Host-refresh_token";

const sha256 = (s: string): string => crypto.createHash("sha256").update(s).digest("hex");

export const issueAccessToken = (user: {
  id: string;
  username: string;
  role: string;
  clinicId: string;
  name: string;
  managed_doctor_ids?: string[];
}): string => {
  return jwt.sign(
    {
      id: user.id,
      username: user.username,
      role: user.role,
      clinicId: user.clinicId,
      name: user.name,
      managed_doctor_ids: user.managed_doctor_ids,
    },
    JWT_SECRET,
    { expiresIn: ACCESS_TOKEN_TTL_SEC },
  );
};

/**
 * Issue a new refresh token, store its SHA-256 hash, and return the raw token
 * to be set as a cookie. Rotation: if oldTokenHash is provided, revoke it and
 * link the new one as its replacement.
 */
export const issueRefreshToken = (userId: string, clinicId: string, oldTokenHash?: string): string => {
  const rawToken = crypto.randomBytes(REFRESH_TOKEN_BYTES).toString("hex");
  const tokenHash = sha256(rawToken);
  const now = new Date();

  // Rotate: revoke the old token and link to the new one
  if (oldTokenHash) {
    const oldRecord = refreshTokens.find((r) => r.token === oldTokenHash);
    if (oldRecord && !oldRecord.revoked) {
      oldRecord.revoked = true;
      oldRecord.replacedBy = tokenHash;
    }
  }

  refreshTokens.push({
    token: tokenHash,
    userId,
    clinicId,
    expiresAt: new Date(now.getTime() + REFRESH_TOKEN_TTL_MS),
    createdAt: now,
    revoked: false,
  });

  return rawToken;
};

/**
 * Validate a refresh token: must exist, not be revoked, not be expired.
 * Returns the record if valid, null otherwise.
 *
 * SECURITY (reuse detection): if a revoked token is presented, this indicates
 * the token was stolen (the legitimate user already rotated past it). Per
 * OAuth 2.0 BCP, we revoke ALL tokens for that user to force re-login and
 * limit the attacker's window. The legitimate user will need to re-authenticate,
 * which is the safe default.
 */
export const validateRefreshToken = (rawToken: string): RefreshTokenRecord | null => {
  if (!rawToken) return null;
  const tokenHash = sha256(rawToken);
  const record = refreshTokens.find((r) => r.token === tokenHash);
  if (!record) return null;
  if (record.expiresAt < new Date()) return null;

  if (record.revoked) {
    // Reuse detection: a revoked token was presented. Revoke ALL tokens for
    // this user to invalidate any stolen tokens in the family.
    // This is a defensive measure — the legitimate user will need to re-login.
    for (const r of refreshTokens) {
      if (r.userId === record.userId) {
        r.revoked = true;
      }
    }
    return null;
  }
  return record;
};

/**
 * Revoke a refresh token (logout). Idempotent — revoking an already-revoked
 * token is a no-op.
 */
export const revokeRefreshToken = (rawToken: string): void => {
  if (!rawToken) return;
  const tokenHash = sha256(rawToken);
  const record = refreshTokens.find((r) => r.token === tokenHash);
  if (record) {
    record.revoked = true;
  }
};

/**
 * Revoke all refresh tokens for a user (password change, security incident).
 */
export const revokeAllUserTokens = (userId: string): void => {
  for (const r of refreshTokens) {
    if (r.userId === userId) {
      r.revoked = true;
    }
  }
};

/**
 * Hash a raw token for storage/lookup. Exposed for tests.
 */
export const _hashTokenForTesting = sha256;

/**
 * Get the cookie name based on environment.
 */
export const getRefreshCookieName = (isProd: boolean): string =>
  isProd ? REFRESH_COOKIE_NAME_PROD : REFRESH_COOKIE_NAME;

/**
 * Get the cookie options for the refresh token.
 *
 * `secure` is now dynamic: it must be true on HTTPS (production), but false
 * on HTTP (local dev, or a backend VPS without TLS yet). With secure=true on
 * HTTP, the browser silently drops the cookie and login appears to fail.
 */
export const getRefreshCookieOptions = (isProd: boolean, isSecure: boolean) => ({
  httpOnly: true,
  secure: isSecure,
  sameSite: "lax" as const,
  path: "/",
  maxAge: REFRESH_TOKEN_TTL_MS,
});
