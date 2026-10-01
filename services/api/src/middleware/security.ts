/**
 * HTTP security middleware: Helmet with strict production CSP, CORS
 * allowlist, tiered rate limiters.
 *
 * CSP note (audit finding): production no longer allows 'unsafe-inline' for
 * scripts or styles. The frontend uses compiled CSS and no inline scripts;
 * dynamic values are applied through the CSSOM (React style props), which
 * CSP does not block. Development keeps the relaxed policy for Vite HMR.
 */
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import cors from "cors";
import type { Request } from "express";
import { loadEnv } from "@medical/data";
import { problem } from "@medical/contracts";

const message = (title: string) => problem("RATE_LIMITED", title, 429);

export const corsMiddleware = cors({
  origin: (origin, cb) => {
    const env = loadEnv();
    // Same-origin / no-origin requests (curl, server-side) are allowed.
    if (!origin || origin === env.FRONTEND_URL) return cb(null, true);
    cb(new Error("Not allowed by CORS"));
  },
  credentials: true,
});

export const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 500,
  standardHeaders: true,
  legacyHeaders: false,
  message: [message("Too many requests, please try again later")],
});

export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: [message("Too many sign-in attempts, please try again later")],
});

export const searchLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: [message("Search rate limit reached, please slow down")],
});

export const aiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 40,
  standardHeaders: true,
  legacyHeaders: false,
  message: [message("AI rate limit reached, please try again later")],
});

export const exportLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: [message("Export limit reached for this hour")],
});

const prodCsp = {
  "default-src": ["'self'"],
  "script-src": ["'self'"],
  "style-src": ["'self'"],
  "img-src": ["'self'", "data:"],
  "font-src": ["'self'"],
  "connect-src": ["'self'"],
  "frame-ancestors": ["'none'"],
  "form-action": ["'self'"],
  "base-uri": ["'self'"],
  "object-src": ["'none'"],
  "upgrade-insecure-requests": [],
};

const devCsp = {
  ...prodCsp,
  "script-src": ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
  "style-src": ["'self'", "'unsafe-inline'"],
  "connect-src": ["'self'", "ws:", "wss:"],
};

export const helmetMiddleware = helmet({
  contentSecurityPolicy: {
    directives: loadEnv().NODE_ENV === "production" ? prodCsp : devCsp,
  },
  crossOriginEmbedderPolicy: false,
  crossOriginOpenerPolicy: { policy: "same-origin" },
  crossOriginResourcePolicy: { policy: "same-origin" },
  referrerPolicy: { policy: "strict-origin-when-cross-origin" },
  frameguard: { action: "deny" },
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true,
  },
});

/** TRUST_PROXY env: comma-free single number or list, applied to app.set(). */
export const parseTrustProxy = (): string | number | boolean => {
  const raw = loadEnv().TRUST_PROXY;
  if (raw === "" || raw === "false") return false;
  if (raw === "true") return true;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : 1;
};

export const securityHeaders = (_req: Request, res: { setHeader: (k: string, v: string) => void }, next: () => void): void => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Cache-Control", "no-store");
  next();
};
