/**
 * Auth routes: /api/auth/login, /api/auth/logout, /api/auth/me, /api/auth/refresh
 *
 * Token strategy:
 *  - Access token: JWT, 8h expiry, in httpOnly cookie. Used for API calls.
 *  - Refresh token: opaque random string, 30d expiry, in httpOnly cookie.
 *    Used to obtain new access tokens without re-login.
 *  - Rotation: each refresh issues a new refresh token and revokes the old one.
 *  - Revocation: logout revokes the refresh token; password change revokes all.
 */
import { Router } from "express";
import bcrypt from "bcryptjs";
import { AuthenticatedRequest, authenticateToken } from "../middleware/auth.js";
import { authLimiter } from "../middleware/security.js";
import { validateBody } from "../middleware/validate.js";
import { schemas } from "../schemas/index.js";
import { env, JWT_SECRET, mockUsers, dbAvailable, pool, clearVolatile } from "../config.js";
import { generateCsrfToken } from "../utils/crypto.js";
import { logger } from "../utils/logger.js";
import {
  issueAccessToken,
  issueRefreshToken,
  validateRefreshToken,
  revokeRefreshToken,
  getRefreshCookieName,
  getRefreshCookieOptions,
} from "../utils/refresh-token.js";

export const authRouter = Router();

authRouter.get("/api/auth/me", authenticateToken, (req: AuthenticatedRequest, res) => {
  res.json({ user: req.user });
});

authRouter.post("/api/auth/logout", (req, res) => {
  clearVolatile();

  // Revoke the refresh token if present
  const isProd = env.NODE_ENV === "production";
  const refreshCookieName = getRefreshCookieName(isProd);
  const rawRefreshToken = req.cookies?.[refreshCookieName] || req.cookies?.["refresh_token"];
  if (rawRefreshToken) {
    revokeRefreshToken(rawRefreshToken);
  }

  const cookieOpts = {
    httpOnly: true,
    secure: true,
    sameSite: "lax" as const,
    path: "/",
  };
  res.clearCookie("token", cookieOpts);
  res.clearCookie("csrf_token", { ...cookieOpts, httpOnly: false });
  res.clearCookie("__Host-token", cookieOpts);
  res.clearCookie("__Host-csrf_token", { ...cookieOpts, httpOnly: false });
  res.clearCookie("refresh_token", cookieOpts);
  res.clearCookie("__Host-refresh_token", cookieOpts);
  res.json({ success: true });
});

authRouter.post("/api/auth/login", authLimiter, validateBody(schemas.login), async (req, res) => {
  try {
    const { username, password, role } = req.body;

    let user: any = null;

    if (dbAvailable) {
      try {
        const dbRes = await pool.query("SELECT * FROM users WHERE username = $1", [username]);
        if (dbRes.rows.length > 0) {
          const u = dbRes.rows[0];
          user = {
            id: u.id,
            username: u.username,
            password: u.password,
            name: u.name,
            role: u.role,
            clinic_id: u.clinic_id,
            managed_doctor_ids:
              typeof u.managed_doctor_ids === "string" ? JSON.parse(u.managed_doctor_ids) : u.managed_doctor_ids,
          };
        }
      } catch (dbErr) {
        logger.warn({ msg: "DB login query failed" });
      }
    }

    if (!user) {
      user = mockUsers.find((u) => u.username === username);
    }

    if (!user || !bcrypt.compareSync(password, user.password)) {
      return res.status(401).json({ error: "Invalid username or password" });
    }

    if (role && user.role.toUpperCase() !== role.toUpperCase()) {
      return res.status(401).json({ error: `User exists but does not have the ${role} role` });
    }

    const isProd = env.NODE_ENV === "production";
    const csrfToken = generateCsrfToken();

    // Access token (8h JWT) in httpOnly cookie
    const accessToken = issueAccessToken({
      id: user.id,
      username: user.username,
      role: user.role,
      clinicId: user.clinic_id,
      name: user.name,
      managed_doctor_ids: user.managed_doctor_ids,
    });

    // Refresh token (30d opaque) in httpOnly cookie, separate from access
    const rawRefreshToken = issueRefreshToken(user.id, user.clinic_id);

    const accessCookieOpts = {
      httpOnly: true,
      secure: true,
      sameSite: "lax" as const,
      path: "/",
      maxAge: 8 * 60 * 60 * 1000, // 8 hours
    };

    const tokenCookieName = isProd ? "__Host-token" : "token";
    const csrfCookieName = isProd ? "__Host-csrf_token" : "csrf_token";
    const refreshCookieName = getRefreshCookieName(isProd);

    res.cookie(tokenCookieName, accessToken, accessCookieOpts);
    res.cookie(csrfCookieName, csrfToken, { ...accessCookieOpts, httpOnly: false });
    res.cookie(refreshCookieName, rawRefreshToken, getRefreshCookieOptions(isProd));

    res.json({
      user: {
        id: user.id,
        username: user.username,
        role: user.role,
        clinicId: user.clinic_id,
        name: user.name,
        managed_doctor_ids: user.managed_doctor_ids,
      },
      csrfToken,
      // Expose token expiry to frontend so it can refresh proactively
      accessTokenExpiresAt: Date.now() + 8 * 60 * 60 * 1000,
    });
  } catch (err: any) {
    res.status(500).json({ error: "Database connection error" });
  }
});

/**
 * Refresh the access token using a valid refresh token.
 *
 * Flow:
 *  1. Read refresh token from cookie.
 *  2. Validate (exists, not revoked, not expired).
 *  3. Issue new access token.
 *  4. Rotate refresh token (issue new, revoke old).
 *  5. Set new cookies.
 *
 * This endpoint is exempt from CSRF (it only reads a httpOnly cookie and
 * issues new tokens; no state change that an attacker could forge).
 */
authRouter.post("/api/auth/refresh", authLimiter, async (req, res) => {
  try {
    const isProd = env.NODE_ENV === "production";
    const refreshCookieName = getRefreshCookieName(isProd);
    const rawRefreshToken = req.cookies?.[refreshCookieName] || req.cookies?.["refresh_token"];

    if (!rawRefreshToken) {
      return res.status(401).json({ error: "No refresh token provided" });
    }

    const record = validateRefreshToken(rawRefreshToken);
    if (!record) {
      return res.status(401).json({ error: "Invalid or expired refresh token" });
    }

    // Look up the user (mock or DB)
    let user: any = null;
    if (dbAvailable) {
      try {
        const dbRes = await pool.query("SELECT * FROM users WHERE id = $1", [record.userId]);
        if (dbRes.rows.length > 0) {
          const u = dbRes.rows[0];
          user = {
            id: u.id,
            username: u.username,
            name: u.name,
            role: u.role,
            clinic_id: u.clinic_id,
            managed_doctor_ids:
              typeof u.managed_doctor_ids === "string" ? JSON.parse(u.managed_doctor_ids) : u.managed_doctor_ids,
          };
        }
      } catch (dbErr) {
        logger.warn({ msg: "DB refresh query failed" });
      }
    }
    if (!user) {
      user = mockUsers.find((u) => u.id === record.userId);
    }
    if (!user) {
      return res.status(401).json({ error: "User not found" });
    }
    if (!user.is_active) {
      return res.status(401).json({ error: "Account is inactive" });
    }

    // Issue new access token
    const accessToken = issueAccessToken({
      id: user.id,
      username: user.username,
      role: user.role,
      clinicId: user.clinic_id,
      name: user.name,
      managed_doctor_ids: user.managed_doctor_ids,
    });

    // Rotate refresh token (revokes old, issues new)
    const newRawRefreshToken = issueRefreshToken(user.id, user.clinic_id, record.token);

    const csrfToken = generateCsrfToken();

    const isProd2 = env.NODE_ENV === "production";
    const accessCookieOpts = {
      httpOnly: true,
      secure: true,
      sameSite: "lax" as const,
      path: "/",
      maxAge: 8 * 60 * 60 * 1000,
    };
    const tokenCookieName = isProd2 ? "__Host-token" : "token";
    const csrfCookieName = isProd2 ? "__Host-csrf_token" : "csrf_token";
    const refreshCookieName2 = getRefreshCookieName(isProd2);

    res.cookie(tokenCookieName, accessToken, accessCookieOpts);
    res.cookie(csrfCookieName, csrfToken, { ...accessCookieOpts, httpOnly: false });
    res.cookie(refreshCookieName2, newRawRefreshToken, getRefreshCookieOptions(isProd2));

    res.json({
      user: {
        id: user.id,
        username: user.username,
        role: user.role,
        clinicId: user.clinic_id,
        name: user.name,
        managed_doctor_ids: user.managed_doctor_ids,
      },
      csrfToken,
      accessTokenExpiresAt: Date.now() + 8 * 60 * 60 * 1000,
    });
  } catch (err: any) {
    res.status(500).json({ error: "Token refresh failed" });
  }
});
