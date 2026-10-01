/**
 * Express app factory.
 *
 * Middleware order: logging -> CORS -> cookies -> CSRF -> security headers ->
 * rate limits -> body parser -> /api/v1 routers -> static SPA.
 */
import express, { type NextFunction, type Request, type Response } from "express";
import cookieParser from "cookie-parser";
import path from "path";
import { fileURLToPath } from "url";
import { loadEnv } from "@medical/data";
import {
  corsMiddleware,
  globalLimiter,
  helmetMiddleware,
  parseTrustProxy,
} from "./middleware/security.js";
import { csrfProtection } from "./middleware/csrf.js";
import { errorHandler, notFoundHandler } from "./middleware/errors.js";
import { logger, redactUrl } from "./lib/logger.js";
import { authRouter } from "./routes/auth.js";
import { patientsRouter } from "./routes/patients.js";
import { schedulingRouter } from "./routes/scheduling.js";
import { clinicalRouter } from "./routes/clinical.js";
import { messagingRouter } from "./routes/messaging.js";
import { billingRouter, webhooksRouter } from "./routes/billing.js";
import { auditRouter } from "./routes/audit.js";
import { dsarRouter } from "./routes/dsar.js";
import { aiRouter } from "./routes/ai.js";
import { fhirRouter } from "./routes/fhir.js";
import { searchRouter } from "./routes/search.js";
import { adminRouter } from "./routes/admin.js";
import { checkDatabaseHealth } from "@medical/data";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export async function createApp(): Promise<express.Application> {
  const app = express();
  const env = loadEnv();

  app.set("trust proxy", parseTrustProxy());
  app.disable("x-powered-by");

  // Structured request logging with PHI-safe URLs.
  app.use((req: Request, res: Response, next: NextFunction) => {
    const start = Date.now();
    res.on("finish", () => {
      if (req.path.startsWith("/api")) {
        logger.info({
          msg: "request",
          method: req.method,
          url: redactUrl(req.originalUrl),
          status: res.statusCode,
          durationMs: Date.now() - start,
        });
      }
    });
    next();
  });

  app.use(corsMiddleware);
  app.use(cookieParser());

  // CSRF double-submit on the API surface (webhooks use HMAC instead).
  app.use("/api/", csrfProtection);

  app.use(helmetMiddleware);

  // No-store for API responses: clinical data must not be cached by proxies.
  app.use("/api/", (_req, res, next) => {
    res.setHeader("Cache-Control", "no-store");
    next();
  });

  app.use("/api/", globalLimiter);

  app.use(
    express.json({
      limit: "1mb",
      verify: (req: Request, _res, buf) => {
        (req as Request & { rawBody?: Buffer }).rawBody = buf;
      },
    }),
  );

  const api = express.Router();
  api.use(authRouter);
  api.use(patientsRouter);
  api.use(schedulingRouter);
  api.use(clinicalRouter);
  api.use(messagingRouter);
  api.use(billingRouter);
  api.use(auditRouter);
  api.use(dsarRouter);
  api.use(aiRouter);
  api.use(fhirRouter);
  api.use(searchRouter);
  api.use(adminRouter);
  api.use(webhooksRouter);

  // Liveness (no DB) + readiness (real DB round-trip, SEC-003).
  api.get("/health", (_req, res) => {
    res.json({ status: "ok", timestamp: new Date().toISOString() });
  });
  api.get("/health/ready", async (_req, res) => {
    const healthy = await checkDatabaseHealth();
    res.status(healthy ? 200 : 503).json({
      status: healthy ? "ready" : "degraded",
      database: healthy ? "up" : "down",
      timestamp: new Date().toISOString(),
    });
  });

  app.use("/api/v1", api);
  app.use("/api", (req, res, _next) => {
    // Legacy /api/* prefix: permanently moved to /api/v1.
    if (req.method === "GET" && req.path === "/health") {
      return res.json({ status: "ok", timestamp: new Date().toISOString() });
    }
    res.setHeader("Location", `/api/v1${req.originalUrl.slice(4)}`);
    res.status(308).json({ error: "API moved to /api/v1" });
  });

  app.use("/api", notFoundHandler);

  // SPA: Vite middleware in dev, built dist in production.
  if (env.NODE_ENV !== "production") {
    const { createServer } = await import("vite");
    const vite = await createServer({
      root: path.resolve(__dirname, "../../../apps/web"),
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, "../../../apps/web/dist");
    app.use(express.static(distPath));
    app.get("*", (_req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.use(errorHandler);
  return app;
}
