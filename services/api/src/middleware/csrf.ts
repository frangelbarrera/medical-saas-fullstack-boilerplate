/**
 * CSRF protection: double-submit cookie pattern. Ported from v1 with the
 * same exemption list (login/refresh issue the token; webhooks use HMAC).
 */
import type { NextFunction, Request, Response } from "express";
import { problem } from "@medical/contracts";

const EXEMPT = new Set([
  "/auth/login",
  "/auth/refresh",
  "/webhooks/payment",
]);

export const csrfProtection = (req: Request, res: Response, next: NextFunction): void => {
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return next();
  // Normalize: req.path may be relative to the mount point (/api or /api/v1).
  const normalized = req.path
    .replace(/^\/api(\/v1)?/, "")
    .replace(/^\/v1/, "")
    .replace(/\/+$/, "") || "/";
  if (EXEMPT.has(normalized)) return next();

  const cookieToken = (req.cookies?.["csrf_token"] ?? req.cookies?.["__Host-csrf_token"]) as string | undefined;
  const headerToken = req.headers["x-csrf-token"] as string | undefined;
  if (!cookieToken || !headerToken || cookieToken !== headerToken) {
    res.status(403).json(problem("FORBIDDEN", "CSRF token missing or invalid", 403));
    return;
  }
  next();
};
