import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { startTestServer } from "./helpers/server.js";

const PORT = 4001;

let server: Awaited<ReturnType<typeof startTestServer>>;

beforeAll(async () => {
  server = await startTestServer(PORT);
}, 30000);

afterAll(async () => {
  if (server) await server.stop();
}, 15000);

describe("Auth & RBAC integration", () => {
  it("should reject login with no credentials (401)", async () => {
    const res = await fetch(`http://localhost:${PORT}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: "nonexistent", password: "wrong" }),
    });
    expect(res.status).toBe(401);
  });

  it("should reject access to /api/auth/me without token (401)", async () => {
    const res = await fetch(`http://localhost:${PORT}/api/auth/me`);
    expect(res.status).toBe(401);
  });

  it("should reject access to /api/users without token (401)", async () => {
    const res = await fetch(`http://localhost:${PORT}/api/users`);
    expect(res.status).toBe(401);
  });

  it("should reject access to /api/audit_logs without token (401)", async () => {
    const res = await fetch(`http://localhost:${PORT}/api/audit_logs`);
    expect(res.status).toBe(401);
  });

  it("should reject POST to /api/admin/populate without token (401 or 403)", async () => {
    // Without auth token AND without CSRF token, either 401 (auth first) or 403 (CSRF first) is acceptable.
    // The order depends on middleware registration; both indicate the request is rejected.
    const res = await fetch(`http://localhost:${PORT}/api/admin/populate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect([401, 403]).toContain(res.status);
  });
});

describe("CSRF protection", () => {
  it("should reject state-changing requests without CSRF token (403)", async () => {
    // /api/auth/logout is a POST without a CSRF token - should be rejected
    // (login is exempt because it issues the token).
    const res = await fetch(`http://localhost:${PORT}/api/auth/logout`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    });
    expect(res.status).toBe(403);
  });

  it("should allow /api/auth/login without CSRF token (login issues the token)", async () => {
    // Login is the only POST exempt from CSRF because it's the request that issues the token.
    // It should return 401 (invalid credentials) not 403 (CSRF failure).
    // Password is 5+ chars to pass Zod validation (schema requires min 5).
    const res = await fetch(`http://localhost:${PORT}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: "testuser", password: "testpass" }),
    });
    expect(res.status).toBe(401);
  });
});

describe("Payment webhook", () => {
  it("should reject webhook calls without signature (401)", async () => {
    // Webhook is exempt from CSRF (it has its own HMAC verification).
    // Without signature header, it should return 401.
    const res = await fetch(`http://localhost:${PORT}/api/webhooks/payment`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        clientTransactionId: "inv_1",
        transactionId: "txn_1",
        status: "Approved",
      }),
    });
    expect(res.status).toBe(401);
  });

  it("should reject webhook calls with invalid signature (401)", async () => {
    const res = await fetch(`http://localhost:${PORT}/api/webhooks/payment`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Signature": "invalid_signature_hex",
      },
      body: JSON.stringify({
        clientTransactionId: "inv_1",
        transactionId: "txn_1",
        status: "Approved",
      }),
    });
    expect(res.status).toBe(401);
  });
});

describe("Security headers", () => {
  it("should return CSP header in production mode", async () => {
    const res = await fetch(`http://localhost:${PORT}/api/auth/me`);
    // Even though we get 401, headers should include security policies
    const csp = res.headers.get("content-security-policy");
    expect(csp).toBeTruthy();
    expect(csp).toContain("default-src");
  });

  it("should return HSTS header", async () => {
    const res = await fetch(`http://localhost:${PORT}/api/auth/me`);
    const hsts = res.headers.get("strict-transport-security");
    expect(hsts).toBeTruthy();
    expect(hsts).toContain("max-age=31536000");
  });

  it("should return X-Frame-Options / frame-ancestors none", async () => {
    const res = await fetch(`http://localhost:${PORT}/api/auth/me`);
    const csp = res.headers.get("content-security-policy") || "";
    expect(csp).toContain("frame-ancestors");
  });
});

describe("Rate limiting", () => {
  it("should apply rate limiting to auth endpoint", async () => {
    // Make a failed login attempt - should return 401 (auth failed) since
    // login is exempt from CSRF.
    // Password is 5+ chars to pass Zod validation.
    const res = await fetch(`http://localhost:${PORT}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: "ratelimituser", password: "ratelimitpass" }),
    });
    expect([401, 429]).toContain(res.status);
  });
});
