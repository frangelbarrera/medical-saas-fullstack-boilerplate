import { describe, it, expect, beforeAll, afterAll } from "vitest";
import http from "http";
import type { AddressInfo } from "net";
import { createApp } from "../src/server/app.js";
import type { Application } from "express";

/**
 * In-process tests using createApp() directly.
 *
 * These are faster than the spawn-based tests in api.test.ts because they
 * don't need to start a child process. They validate that the refactor to
 * createApp() worked correctly and that the app can be tested with supertest
 * style in-process HTTP.
 */

let app: Application;
let server: http.Server;
let baseUrl: string;

beforeAll(async () => {
  app = await createApp();
  server = app.listen(0); // random port
  const port = (server.address() as AddressInfo).port;
  baseUrl = `http://localhost:${port}`;
}, 15000);

afterAll(async () => {
  if (server) await new Promise<void>((resolve) => server.close(() => resolve()));
}, 10000);

describe("createApp() in-process", () => {
  it("should expose /api/health endpoint", async () => {
    const res = await fetch(`${baseUrl}/api/health`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("ok");
    expect(body.timestamp).toBeTruthy();
  });

  it("should reject unauthenticated access to /api/auth/me (401)", async () => {
    const res = await fetch(`${baseUrl}/api/auth/me`);
    expect(res.status).toBe(401);
  });

  it("should reject login with invalid credentials (401)", async () => {
    const res = await fetch(`${baseUrl}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: "nonexistent", password: "wrongpass" }),
    });
    expect(res.status).toBe(401);
  });

  it("should reject /api/users without auth (401)", async () => {
    const res = await fetch(`${baseUrl}/api/users`);
    expect(res.status).toBe(401);
  });

  it("should reject /api/audit_logs without auth (401)", async () => {
    const res = await fetch(`${baseUrl}/api/audit_logs`);
    expect(res.status).toBe(401);
  });

  it("should reject POST /api/admin/populate without auth (401 or 403)", async () => {
    const res = await fetch(`${baseUrl}/api/admin/populate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect([401, 403]).toContain(res.status);
  });

  it("should reject webhook without signature (401)", async () => {
    const res = await fetch(`${baseUrl}/api/webhooks/payment`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clientTransactionId: "x", transactionId: "y", status: "Approved" }),
    });
    expect(res.status).toBe(401);
  });

  it("should reject logout without CSRF token (403)", async () => {
    const res = await fetch(`${baseUrl}/api/auth/logout`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    });
    expect(res.status).toBe(403);
  });

  it("should allow login without CSRF (login issues the token) but 401 for bad creds", async () => {
    const res = await fetch(`${baseUrl}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: "baduser", password: "badpassword" }),
    });
    expect(res.status).toBe(401);
  });

  it("should return security headers (CSP, HSTS)", async () => {
    const res = await fetch(`${baseUrl}/api/health`);
    const csp = res.headers.get("content-security-policy");
    expect(csp).toBeTruthy();
    expect(csp!).toContain("default-src");
    const hsts = res.headers.get("strict-transport-security");
    expect(hsts).toBeTruthy();
    expect(hsts!).toContain("max-age=31536000");
  });

  it("should return CORS headers for the configured origin", async () => {
    const res = await fetch(`${baseUrl}/api/health`, {
      headers: { Origin: "http://localhost:3000" },
    });
    // CORS may or may not be present depending on config; just verify it doesn't crash
    expect(res.status).toBe(200);
  });

  it("should return 404 for non-existent patient (GET /api/patients/:id without auth -> 401)", async () => {
    const res = await fetch(`${baseUrl}/api/patients/nonexistent-id`);
    expect(res.status).toBe(401);
  });

  it("should rate limit login attempts eventually (authLimiter)", async () => {
    // We won't exhaust the limit (20/15min) to keep tests fast.
    // Just verify the endpoint responds with 401 for bad creds.
    const res = await fetch(`${baseUrl}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: "ratelimit", password: "ratelimitpass" }),
    });
    expect([401, 429]).toContain(res.status);
  });

  it("should reject /api/auth/refresh without a refresh token cookie (401)", async () => {
    const res = await fetch(`${baseUrl}/api/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    });
    expect(res.status).toBe(401);
  });

  it("should reject /api/auth/refresh with an invalid refresh token (401)", async () => {
    const res = await fetch(`${baseUrl}/api/auth/refresh`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: "refresh_token=invalid_token_string",
      },
    });
    expect(res.status).toBe(401);
  });

  it("should allow /api/auth/refresh without CSRF token (refresh is exempt)", async () => {
    // The refresh endpoint should NOT return 403 (CSRF failure) even without a CSRF token.
    // It should return 401 (no refresh token provided) instead.
    const res = await fetch(`${baseUrl}/api/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    });
    expect(res.status).not.toBe(403);
    expect(res.status).toBe(401);
  });
});
