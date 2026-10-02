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
import { storeFor, rateLimitHandler } from "../lib/rate-store.js";

/**
 * Test scale factor: the integration suites drive hundreds of authenticated
 * requests from one source IP within seconds. Production limits are
 * unchanged; under test every threshold is relaxed by the same factor so
 * the limiter still works but never masks an authorization result.
 */
const limitScale = process.env.NODE_ENV === "test" ? 100 : 1;

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
  max: 500 * limitScale,
  standardHeaders: true,
  legacyHeaders: false,
  store: storeFor("global"),
  handler: rateLimitHandler(15 * 60, "Too many requests, please try again later"),
});

export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20 * limitScale,
  standardHeaders: true,
  legacyHeaders: false,
  store: storeFor("auth"),
  handler: rateLimitHandler(15 * 60, "Too many sign-in attempts, please try again later"),
  // Enumeration protection (RL-003): the budget pairs the source IP with
  // the attempted account, so spraying many usernames from one IP or
  // hammering one username from many IPs both exhaust quickly.
  keyGenerator: (req: Request): string => {
    const body = req.body as { username?: unknown } | undefined;
    const username = typeof body?.username === "string" ? body.username.trim().toLowerCase() : "anonymous";
    return `${req.ip ?? "unknown"}:${username}`;
  },
});

export const searchLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200 * limitScale,
  standardHeaders: true,
  legacyHeaders: false,
  store: storeFor("search"),
  handler: rateLimitHandler(15 * 60, "Search rate limit reached, please slow down"),
});

export const aiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 40 * limitScale,
  standardHeaders: true,
  legacyHeaders: false,
  store: storeFor("ai"),
  handler: rateLimitHandler(15 * 60, "AI rate limit reached, please try again later"),
});

export const exportLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10 * limitScale,
  standardHeaders: true,
  legacyHeaders: false,
  store: storeFor("export"),
  handler: rateLimitHandler(60 * 60, "Export limit reached for this hour"),
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

/**
 * TRUST_PROXY configuration (TLS-001): the deployment names exactly the
 * proxies it runs behind. Supported values: "false"/"" (none), a hop count
 * ("1"), or a comma-separated list of IPs / CIDR ranges passed to Express.
 * The blanket "true" is refused in production - a deployment must declare
 * its proxy chain, otherwise x-forwarded-proto becomes client-controlled.
 */
export const parseTrustProxy = (): string | number | boolean => {
  const raw = loadEnv().TRUST_PROXY;
  if (raw === "" || raw === "false") return false;
  if (raw === "true") {
    if (loadEnv().NODE_ENV === "production") {
      throw new Error(
        "TRUST_PROXY=true is not allowed in production: list your proxies explicitly (e.g. TRUST_PROXY=10.0.0.5,10.0.0.6)",
      );
    }
    return true;
  }
  const n = Number(raw);
  if (Number.isFinite(n) && n >= 0) return n;
  // Explicit list or CIDR range - forwarded verbatim to Express.
  return raw;
};

export const securityHeaders = (_req: Request, res: { setHeader: (k: string, v: string) => void }, next: () => void): void => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Cache-Control", "no-store");
  next();
};
