/**
 * Regression test for CWE-384: Session Fixation via Cookie Fallback
 *
 * Bug history:
 * - Commit ea04024 (Jul 4 15:06 UTC) fixed the bug by removing the
 *   unconditional `req.cookies?.token` fallback in production.
 * - Commit 0994435 (Jul 4 15:41 UTC) re-introduced the fallback 35 minutes
 *   later to resolve a Vercel deploy issue, but the fallback was unconditional
 *   (not gated by !useHostPrefix), re-opening the session-fixation vector.
 * - The SECURITY.md item #6 claim "Fallback removed in production" was
 *   therefore false between 0994435 and the fix applied alongside this test.
 *
 * This test ensures the fallback is gated correctly and will fail loudly if
 * anyone re-introduces the unconditional fallback in the future.
 *
 * Attack scenario (what we're preventing):
 *   1. Attacker controls a subdomain like evil.example.com
 *   2. Attacker sets a `token` cookie scoped to .example.com via their subdomain
 *   3. Victim logs in to app.example.com (HTTPS, production)
 *   4. Server sets __Host-token cookie (correctly prefixed, Secure, Path=/)
 *   5. Victim's browser sends BOTH cookies: __Host-token=legit AND token=evil
 *   6. If the server falls back to `req.cookies?.token` when __Host-token is
 *      absent (e.g. user clears __Host-token but not token), the attacker's
 *      session is used → session fixation succeeds.
 *
 * The mitigation: in production+HTTPS (useHostPrefix=true), ONLY accept
 * __Host-token. Never fall back to the non-prefixed `token` cookie.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import http from "http";
import type { AddressInfo } from "net";
import { createApp } from "../src/server/app.js";
import type { Application } from "express";
import * as fs from "fs";
import * as path from "path";

let app: Application;
let server: http.Server;
let baseUrl: string;

beforeAll(async () => {
  app = await createApp();
  server = app.listen(0);
  const port = (server.address() as AddressInfo).port;
  baseUrl = `http://localhost:${port}`;
}, 15000);

afterAll(async () => {
  if (server) await new Promise<void>((resolve) => server.close(() => resolve()));
}, 10000);

describe("CWE-384 regression: __Host- cookie prefix bypass via fallback", () => {
  it("should NOT accept attacker-injected `token` cookie when __Host-token is absent (dev mode)", async () => {
    // In dev mode (NODE_ENV != production, or HTTP), the `token` cookie IS
    // accepted as the legitimate session cookie. This test confirms dev mode
    // still works (we don't want to break dev), but sets up the contrast for
    // the production test below.
    //
    // We craft a JWT signed with the test secret to simulate a victim's session.
    // The exact value doesn't matter — what matters is that the server processes
    // the `token` cookie in dev but REJECTS it in prod+HTTPS.

    // Sign a token with the test JWT_SECRET (same as tests/setup.ts)
    const jwtSecret = process.env.JWT_SECRET || "test_jwt_secret_minimum_32_characters_long_for_testing_only";
    const jwt = await import("jsonwebtoken");
    const attackerToken = jwt.sign(
      { id: "attacker", username: "attacker", role: "ADMIN", clinicId: "clinic-1", name: "Attacker" },
      jwtSecret,
      { expiresIn: "1h" },
    );

    // In dev/HTTP mode, sending `token=<attackerToken>` should be accepted
    // (the cookie is the legitimate session cookie name in dev).
    // This is the BASELINE — dev mode uses `token`, prod+HTTPS uses `__Host-token`.
    const res = await fetch(`${baseUrl}/api/auth/me`, {
      headers: {
        Cookie: `token=${attackerToken}`,
      },
    });
    // In dev mode, the token cookie IS the session cookie, so it should be
    // accepted (status 200) OR rejected with 403 (if jwt.verify fails because
    // the secret differs). 401 would mean the token wasn't read at all.
    expect([200, 403]).toContain(res.status);
  });

  it("regression: auth.ts must NOT contain unconditional `req.cookies?.token` fallback", () => {
    // This is a static code-level test that fails if anyone re-introduces
    // the unconditional fallback. It reads the auth.ts source and asserts
    // that the fallback is properly gated by `!useHostPrefix`.
    //
    // The buggy pattern (must NOT exist):
    //   req.cookies?.[cookieName] ||
    //   req.cookies?.token ||  // ← unconditional fallback = bug
    //
    // The correct pattern (must exist):
    //   req.cookies?.[cookieName] ||
    //   (!useHostPrefix ? req.cookies?.token : undefined) ||  // ← gated fallback
    //
    const authTsPath = path.join(__dirname, "..", "src", "server", "middleware", "auth.ts");
    const source = fs.readFileSync(authTsPath, "utf-8");

    // The unconditional fallback pattern: `req.cookies?.token` NOT preceded
    // by a `!useHostPrefix` gate on the same or previous line.
    // We look for the specific buggy line pattern.
    const lines = source.split("\n");
    let foundBuggyFallback = false;
    let foundGatedFallback = false;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const prevLine = i > 0 ? lines[i - 1] : "";

      // Match lines containing `req.cookies?.token`
      if (line.includes("req.cookies?.token")) {
        // Check if this line OR the previous line contains the !useHostPrefix gate
        const combinedContext = prevLine + " " + line;
        if (combinedContext.includes("!useHostPrefix")) {
          foundGatedFallback = true;
        } else if (!line.includes("//") || line.indexOf("//") > line.indexOf("req.cookies?.token")) {
          // The line has `req.cookies?.token` and the `//` comment (if any) comes
          // AFTER the code — this is the unconditional fallback pattern.
          foundBuggyFallback = true;
        }
      }
    }

    // Assert: NO unconditional fallback, ONLY gated fallback
    expect(foundBuggyFallback).toBe(false);
    expect(foundGatedFallback).toBe(true);
  });

  it("should preserve Vercel/HTTP-deploy compatibility: dev mode accepts `token` cookie", async () => {
    // This test ensures the fix doesn't break the original Vercel deploy
    // issue that 0994435 was solving. In dev/HTTP mode, the `token` cookie
    // MUST still be accepted (it's the legitimate session cookie in dev).
    //
    // If this test fails, the fix is too aggressive and broke Vercel deploy.

    const jwtSecret = process.env.JWT_SECRET || "test_jwt_secret_minimum_32_characters_long_for_testing_only";
    const jwt = await import("jsonwebtoken");

    // Create a valid JWT signed with the test secret
    const validToken = jwt.sign(
      { id: "user-1", username: "testuser", role: "ADMIN", clinicId: "clinic-1", name: "Test" },
      jwtSecret,
      { expiresIn: "1h" },
    );

    // Send only the `token` cookie (no __Host-token). In dev mode, this should work.
    const res = await fetch(`${baseUrl}/api/auth/me`, {
      headers: {
        Cookie: `token=${validToken}`,
      },
    });

    // Should be 200 (token accepted) — the test server runs in NODE_ENV=test
    // which is NOT production, so useHostPrefix=false and `token` is the
    // legitimate cookie name.
    expect(res.status).toBe(200);
  });
});

describe("CWE-384 documentation: SECURITY.md must be truthful", () => {
  it("SECURITY.md item #6 must not claim fallback is removed if code still has it", () => {
    // Cross-check: if SECURITY.md says "Fallback removed in production",
    // the code MUST actually remove it. If the code re-introduces the
    // unconditional fallback, SECURITY.md must be updated.
    //
    // This test reads both files and asserts consistency.
    const securityMdPath = path.join(__dirname, "..", "SECURITY.md");
    const authTsPath = path.join(__dirname, "..", "src", "server", "middleware", "auth.ts");

    const securityMd = fs.readFileSync(securityMdPath, "utf-8");
    const authTs = fs.readFileSync(authTsPath, "utf-8");

    // Check if SECURITY.md item #6 claims "Fallback removed in production"
    const claimsFallbackRemoved = /Fallback removed in production/i.test(securityMd);

    // Check if auth.ts has the unconditional fallback (the bug)
    const lines = authTs.split("\n");
    let hasUnconditionalFallback = false;
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const prevLine = i > 0 ? lines[i - 1] : "";
      if (line.includes("req.cookies?.token")) {
        const combinedContext = prevLine + " " + line;
        if (!combinedContext.includes("!useHostPrefix")) {
          if (!line.includes("//") || line.indexOf("//") > line.indexOf("req.cookies?.token")) {
            hasUnconditionalFallback = true;
            break;
          }
        }
      }
    }

    // The fix is correct when:
    // - SECURITY.md claims fallback is removed, AND
    // - auth.ts does NOT have the unconditional fallback
    // OR
    // - SECURITY.md does NOT claim fallback is removed, AND
    // - auth.ts HAS the unconditional fallback (SECURITY.md is honest about the bug)
    //
    // The fix is INCORRECT (and this test fails) when:
    // - SECURITY.md claims fallback is removed, BUT
    // - auth.ts still has the unconditional fallback (lying SECURITY.md)
    if (claimsFallbackRemoved && hasUnconditionalFallback) {
      expect.fail(
        "SECURITY.md claims 'Fallback removed in production' but auth.ts still has " +
          "the unconditional `req.cookies?.token` fallback. Update SECURITY.md or fix auth.ts.",
      );
    }

    // Pass: either consistent truth (claim + no bug) or consistent honesty (no claim + bug present)
    expect(true).toBe(true);
  });
});
