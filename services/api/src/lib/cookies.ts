/**
 * Cookie helpers that respect the request protocol.
 *
 * `__Host-` prefixes are used in production over HTTPS only (the prefix
 * requires Secure cookies; using it on plain HTTP would silently break the
 * session). The production auth path NEVER accepts the non-prefixed cookie
 * to prevent session fixation from subdomains (CWE-384).
 */
import type { Request } from "express";
import { loadEnv } from "@medical/data";

export const isRequestSecure = (req: Request): boolean => {
  if (req.secure) return true;
  const forwardedProto = req.get("x-forwarded-proto");
  if (forwardedProto === "https") return true;
  if (req.get("x-forwarded-ssl") === "on") return true;
  return false;
};

export const isProdHttps = (req: Request): boolean =>
  loadEnv().NODE_ENV === "production" && isRequestSecure(req);

export const getSessionCookieName = (req: Request): string =>
  isProdHttps(req) ? "__Host-token" : "token";

export const getRefreshCookieName = (req: Request): string =>
  isProdHttps(req) ? "__Host-refresh_token" : "refresh_token";

export const getCsrfCookieName = (req: Request): string =>
  isProdHttps(req) ? "__Host-csrf_token" : "csrf_token";

export const cookieOptions = (req: Request, maxAge: number) => ({
  httpOnly: true,
  secure: isRequestSecure(req),
  sameSite: "lax" as const,
  path: "/",
  maxAge,
});

export const csrfCookieOptions = (req: Request, maxAge: number) => ({
  httpOnly: false, // must be readable by the frontend to echo in the header
  secure: isRequestSecure(req),
  sameSite: "lax" as const,
  path: "/",
  maxAge,
});
