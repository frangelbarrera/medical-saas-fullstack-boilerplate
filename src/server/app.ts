/**
 * Express app factory.
 *
 * Exports createApp() so tests can import the app and use supertest directly
 * without spawning a child process. The listen() call lives in index.ts.
 */
import express, { Request, Response, NextFunction } from "express";
import cookieParser from "cookie-parser";
import path from "path";
import { fileURLToPath } from "url";
import { createServer as createViteServer } from "vite";
import { env } from "./config.js";
import { csrfProtection } from "./middleware/csrf.js";
import { corsMiddleware, helmetMiddleware, globalLimiter } from "./middleware/security.js";
import { setupSwagger } from "../lib/swagger.js";
import { logger, createHttpLogger } from "./utils/logger.js";

import { authRouter } from "./routes/auth.js";
import { adminRouter } from "./routes/admin.js";
import { clinicsRouter } from "./routes/clinics.js";
import { usersRouter } from "./routes/users.js";
import { patientsRouter } from "./routes/patients.js";
import { consultationsRouter } from "./routes/consultations.js";
import { appointmentsRouter } from "./routes/appointments.js";
import { invoicesRouter } from "./routes/invoices.js";
import { expensesRouter } from "./routes/expenses.js";
import { statsRouter } from "./routes/stats.js";
import { auditRouter } from "./routes/audit.js";
import { aiRouter } from "./routes/ai.js";
import { paymentsRouter } from "./routes/payments.js";
import { webhooksRouter } from "./routes/webhooks.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export async function createApp(): Promise<express.Application> {
  const app = express();

  // Trust the first proxy (nginx, Caddy, etc.) so req.ip reflects the real
  // client IP from X-Forwarded-For. Without this, rate limiters bucket all
  // requests to the proxy's IP (typically 127.0.0.1), making them ineffective.
  // 'loopback, linklocal, uniquelocal' would be safer for multi-hop setups.
  app.set("trust proxy", 1);

  // HTTP request logger (pino-http) — logs every request with PHI redacted
  app.use(await createHttpLogger());

  // CORS (credentials: true for cookies)
  app.use(corsMiddleware);

  // Cookies
  app.use(cookieParser());

  // CSRF (double-submit cookie pattern). Mounted before body parser so it
  // can reject state-changing requests early.
  app.use("/api/", csrfProtection);

  // Security headers (CSP, HSTS, COOP, CORP, Referrer-Policy)
  app.use(helmetMiddleware);

  // Global rate limiter on /api/
  app.use("/api/", globalLimiter);

  // Body parser with raw-body capture for webhook HMAC verification
  app.use(
    express.json({
      limit: "1mb",
      verify: (req: any, _res, buf) => {
        req.rawBody = buf;
      },
    }),
  );

  // Swagger UI: only exposed in development. In production, the API surface
  // should not be enumerable by unauthenticated visitors.
  if (env.NODE_ENV !== "production") {
    setupSwagger(app);
  }

  // Routes
  app.use(authRouter);
  app.use(adminRouter);
  app.use(clinicsRouter);
  app.use(usersRouter);
  app.use(patientsRouter);
  app.use(consultationsRouter);
  app.use(appointmentsRouter);
  app.use(invoicesRouter);
  app.use(expensesRouter);
  app.use(statsRouter);
  app.use(auditRouter);
  app.use(aiRouter);
  app.use(paymentsRouter);
  app.use(webhooksRouter);

  // Health check endpoint (no auth, no rate limit)
  app.get("/api/health", (_req: Request, res: Response) => {
    res.json({ status: "ok", timestamp: new Date().toISOString() });
  });

  // Vite integration (dev) or static dist (prod)
  if (env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (_req: Request, res: Response) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  // Global error handler — catches errors from body-parser, cookie-parser,
  // CSRF middleware, and any unhandled errors in route handlers. Prevents
  // stack traces from leaking to clients in production.
  // MUST be registered after all other middleware and routes.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  app.use((err: any, req: Request, res: Response, _next: NextFunction) => {
    // Log the full error server-side for debugging
    logger.error({
      msg: "Unhandled error",
      error: err.message,
      stack: env.NODE_ENV === "production" ? undefined : err.stack,
      url: req.url,
      method: req.method,
    });

    // In production, never leak internal error details to the client.
    // In development, return the stack for easier debugging.
    if (env.NODE_ENV === "production") {
      // Handle specific known errors with appropriate status codes
      if (err.type === "entity.too.large") {
        return res.status(413).json({ error: "Request body too large" });
      }
      if (err.type === "entity.parse.failed" || err instanceof SyntaxError) {
        return res.status(400).json({ error: "Invalid JSON" });
      }
      return res.status(500).json({ error: "Internal server error" });
    }

    return res.status(err.status || 500).json({
      error: err.message || "Internal server error",
      ...(err.stack ? { stack: err.stack } : {}),
    });
  });

  return app;
}
