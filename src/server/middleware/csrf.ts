/**
 * CSRF protection: Double-Submit Cookie pattern.
 *
 * On login, the server sets a non-httpOnly cookie 'csrf_token' (or '__Host-csrf_token'
 * in production) with a random value. The frontend must read it and send the same
 * value back in the 'x-csrf-token' header for state-changing requests.
 *
 * An attacker on a different origin cannot read the cookie (SameSite + CORS) and
 * therefore cannot forge the header.
 */
import { Request, Response, NextFunction } from "express";

export const csrfProtection = (req: Request, res: Response, next: NextFunction) => {
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) {
    return next();
  }
  // Login doesn't have a CSRF token yet (it's the request that issues one).
  // Webhook has its own HMAC verification.
  // req.path inside a middleware mounted on '/api/' is relative (e.g. '/auth/login'),
  // so we check both the relative and original URL forms.
  const reqPath = req.path || "";
  if (
    reqPath === "/auth/login" ||
    reqPath === "/api/auth/login" ||
    reqPath === "/auth/refresh" ||
    reqPath === "/api/auth/refresh" ||
    reqPath === "/webhooks/payment" ||
    reqPath === "/api/webhooks/payment"
  ) {
    return next();
  }
  const cookieToken = req.cookies?.csrf_token || req.cookies?.["__Host-csrf_token"];
  const headerToken = req.headers["x-csrf-token"];
  if (!cookieToken || !headerToken || cookieToken !== headerToken) {
    return res.status(403).json({ error: "CSRF token missing or invalid." });
  }
  next();
};
