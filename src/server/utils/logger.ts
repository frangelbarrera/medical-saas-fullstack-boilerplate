/**
 * Pino logger with PHI redaction.
 *
 * PHI fields (name, dni, email, phone, birth_date, address) are automatically
 * redacted from logs. This prevents accidental PHI leakage when logging
 * request bodies, errors, or audit details.
 *
 * In production, logs are JSON formatted for easy ingestion by SIEM tools
 * (Splunk, ELK, Datadog, Loki). In development, logs are pretty-printed.
 *
 * Usage:
 *   import { logger } from "./utils/logger.js";
 *   logger.info({ msg: "patient created", patientId: "pat_123" });
 *
 * For HTTP request logging, see pino-http middleware in app.ts.
 */
import pino from "pino";
import { env } from "../config.js";

// PHI fields that must NEVER appear in logs. They are replaced with '[REDACTED]'.
// Paths support nested objects (e.g. 'patient.name' would match { patient: { name } }).
const PHI_REDACT_PATHS = [
  // Direct PHI fields
  "name",
  "dni",
  "email",
  "phone",
  "birth_date",
  "birthDate",
  "address",
  "password",
  "password_hash",
  "token",
  "csrf_token",
  // Nested in patient/user objects
  "patient.name",
  "patient.dni",
  "patient.email",
  "patient.phone",
  "patient.birth_date",
  "patient.birthDate",
  "user.name",
  "user.email",
  "user.password",
  // Nested in request body
  "req.body.name",
  "req.body.dni",
  "req.body.email",
  "req.body.phone",
  "req.body.birthDate",
  "req.body.password",
  // Nested in details objects (audit logs)
  "details.name",
  "details.dni",
  "details.email",
  "details.phone",
];

const isProd = env.NODE_ENV === "production";

export const logger = pino({
  level: process.env.LOG_LEVEL || (isProd ? "info" : "debug"),
  redact: {
    paths: PHI_REDACT_PATHS,
    censor: "[REDACTED]",
    remove: false, // keep the key but replace value
  },
  ...(isProd
    ? {
        // Production: JSON for SIEM ingestion
        formatters: {
          level: (label: string) => ({ level: label }),
        },
        timestamp: pino.stdTimeFunctions.isoTime,
      }
    : {
        // Development: pretty print
        transport: {
          target: "pino-pretty",
          options: {
            colorize: true,
            translateTime: "HH:MM:ss",
            ignore: "pid,hostname",
          },
        },
      }),
});

/**
 * HTTP request logger middleware factory.
 * Use: app.use(httpLogger)
 */
export const createHttpLogger = async () => {
  const pinoHttp = (await import("pino-http")).default;
  return pinoHttp({ logger });
};
