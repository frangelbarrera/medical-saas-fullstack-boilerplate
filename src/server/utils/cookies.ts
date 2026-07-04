/**
 * Cookie helpers that respect the request protocol.
 *
 * The `secure: true` flag on cookies means the browser will ONLY set the
 * cookie over HTTPS. If the backend is deployed over HTTP (e.g. a VPS
 * without TLS termination yet, or a local dev server), the cookie is
 * silently dropped — login appears to succeed but the session is never
 * established, causing "Authentication Issue" errors on the next request.
 *
 * Solution: set `secure` dynamically based on whether the request arrived
 * over HTTPS (directly or via a trusted reverse proxy with X-Forwarded-Proto).
 *
 * The `__Host-` prefix is only used when secure=true (HTTPS), because the
 * prefix REQUIRES secure cookies — using it on HTTP would break.
 */
import { Request } from "express";
import { env } from "../config.js";

export const isRequestSecure = (req: Request): boolean => {
  // Direct HTTPS
  if (req.secure) return true;
  // Behind a reverse proxy that sets X-Forwarded-Proto (nginx, Caddy, Vercel)
  const forwardedProto = req.get("x-forwarded-proto");
  if (forwardedProto === "https") return true;
  // Vercel sets this header
  if (req.get("x-forwarded-ssl") === "on") return true;
  return false;
};

export const getCookieOptions = (req: Request, maxAge?: number) => {
  const secure = isRequestSecure(req);
  return {
    httpOnly: true,
    secure,
    sameSite: secure ? ("lax" as const) : ("lax" as const),
    path: "/",
    ...(maxAge ? { maxAge } : {}),
  };
};

/**
 * Returns the cookie name for the access token. Uses `__Host-` prefix only
 * when the request is over HTTPS (the prefix requires Secure cookies).
 */
export const getAccessTokenCookieName = (req: Request): string => {
  return isRequestSecure(req) && env.NODE_ENV === "production" ? "__Host-token" : "token";
};

/**
 * Returns the cookie name for the CSRF token. Uses `__Host-` prefix only
 * when the request is over HTTPS.
 */
export const getCsrfCookieName = (req: Request): string => {
  return isRequestSecure(req) && env.NODE_ENV === "production" ? "__Host-csrf_token" : "csrf_token";
};
