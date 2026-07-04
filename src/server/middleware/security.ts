/**
 * HTTP security middleware: Helmet CSP, rate limiters, CORS.
 */
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import cors from "cors";
import { env } from "../config.js";

export const corsMiddleware = cors({
  origin: env.FRONTEND_URL,
  credentials: true,
});

export const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 500,
  message: { error: "Too many requests from this IP, please try again later." },
});

export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { error: "Too many login attempts, please try again later." },
});

// CSP directives: strict in production, permissive for Vite HMR in development.
const cspDirectives: Record<string, any> =
  env.NODE_ENV === "production"
    ? {
        "default-src": ["'self'"],
        "script-src": ["'self'"],
        "style-src": ["'self'", "'unsafe-inline'"], // Tailwind requires inline styles
        "img-src": ["'self'", "data:", "https:"],
        "font-src": ["'self'", "data:"],
        "connect-src": ["'self'"],
        "frame-ancestors": ["'none'"],
        "form-action": ["'self'"],
        "base-uri": ["'self'"],
        "object-src": ["'none'"],
        "upgrade-insecure-requests": [],
      }
    : {
        // Dev: more permissive for Vite HMR over websockets
        "default-src": ["'self'"],
        "script-src": ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
        "style-src": ["'self'", "'unsafe-inline'"],
        "img-src": ["'self'", "data:", "https:"],
        "font-src": ["'self'", "data:"],
        "connect-src": ["'self'", "ws:", "wss:"],
        "frame-ancestors": ["'none'"],
      };

export const helmetMiddleware = helmet({
  contentSecurityPolicy: { directives: cspDirectives },
  crossOriginEmbedderPolicy: false,
  crossOriginOpenerPolicy: { policy: "same-origin" },
  crossOriginResourcePolicy: { policy: "same-origin" },
  referrerPolicy: { policy: "strict-origin-when-cross-origin" },
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true,
  },
});
