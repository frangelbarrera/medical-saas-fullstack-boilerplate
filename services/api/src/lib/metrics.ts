/**
 * Lightweight process metrics (OPS-002): per-route counters with latency
 * aggregates. Route TEMPLATES only (no URLs, no query strings, no PHI) -
 * the series identify endpoints, never patients or requests.
 */
import type { Request, Response, NextFunction } from "express";

interface RouteStats {
  hits: number;
  errors: number;
  totalMs: number;
  maxMs: number;
}

const stats = new Map<string, RouteStats>();
const startedAt = new Date().toISOString();

export const metricsMiddleware = (req: Request, res: Response, next: NextFunction): void => {
  const start = Date.now();
  res.on("finish", () => {
    if (!req.originalUrl.startsWith("/api") || req.originalUrl.startsWith("/api/v1/metrics")) return;
    // Route template from the matched route: /patients/:id, never the id.
    const base = req.baseUrl ?? "";
    const template = req.route?.path ? base + req.route.path : `${base}/(unmatched)`;
    const key = `${req.method} ${template}`;
    const entry = stats.get(key) ?? { hits: 0, errors: 0, totalMs: 0, maxMs: 0 };
    entry.hits += 1;
    if (res.statusCode >= 500) entry.errors += 1;
    const ms = Date.now() - start;
    entry.totalMs += ms;
    entry.maxMs = Math.max(entry.maxMs, ms);
    stats.set(key, entry);
  });
  next();
};

export const metricsText = (): string => {
  const lines = [
    "# HELP api_route_requests request counts, errors and latency per route template",
    "# TYPE api_route_requests summary",
    `api_metrics_started_at ${startedAt}`,
  ];
  for (const [key, s] of [...stats.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    const avg = s.hits > 0 ? Math.round(s.totalMs / s.hits) : 0;
    lines.push(
      `api_route_requests{route="${key}",outcome="hits"} ${s.hits}`,
      `api_route_requests{route="${key}",outcome="errors_5xx"} ${s.errors}`,
      `api_route_latency_ms{route="${key}",quantile="avg"} ${avg}`,
      `api_route_latency_ms{route="${key}",quantile="max"} ${s.maxMs}`,
    );
  }
  return lines.join("\n") + "\n";
};
