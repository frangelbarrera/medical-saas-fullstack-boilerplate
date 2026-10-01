/**
 * Structured logging with PHI redaction (pino). Request URLs that can carry
 * PHI (search queries) are redacted before hitting the log stream.
 */
import pino from "pino";
import { loadEnv } from "@medical/data";

export const logger = pino({
  level: process.env.LOG_LEVEL ?? (loadEnv().NODE_ENV === "development" ? "info" : "warn"),
  redact: {
    paths: [
      "req.headers.authorization",
      "req.headers.cookie",
      "req.headers['x-csrf-token']",
      "res.headers['set-cookie']",
    ],
    censor: "[REDACTED]",
  },
});

/** Parameter names that may carry PHI: dropped from logged URLs. */
const PHI_QUERY_KEYS = new Set(["q", "name", "phone", "email", "identifier", "body"]);

export const redactUrl = (url: string | undefined): string => {
  if (!url) return url ?? "";
  const [path, query] = url.split("?");
  if (!query) return path;
  const kept = query.split("&").filter((kv) => {
    const key = kv.split("=")[0];
    return !PHI_QUERY_KEYS.has(key);
  });
  return kept.length ? `${path}?${kept.join("&")}` : path;
};
