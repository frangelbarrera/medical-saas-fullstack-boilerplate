/**
 * Auth routes: login / refresh / logout / session / password.
 */
import { Router } from "express";
import bcrypt from "bcryptjs";
import {
  loginRequest,
  changePasswordRequest,
  capabilitiesForRole,
  type Role,
} from "@medical/contracts";
import {
  prisma,
  withTenant,
  withTenantRepos,
  authRepo,
  AuthRepository,
  REFRESH_TOKEN_TTL_MS,
  SESSION_TTL_MS,
  Repositories,
} from "@medical/data";
import { asyncHandler, ApiError } from "../middleware/errors.js";
import { validateBody } from "../middleware/validate.js";
import { authLimiter } from "../middleware/security.js";
import { issueAccessToken, readRefreshCookie, verifyAccessToken, generateCsrfToken } from "../lib/tokens.js";
import {
  cookieOptions,
  csrfCookieOptions,
  getCsrfCookieName,
  getRefreshCookieName,
  getSessionCookieName,
} from "../lib/cookies.js";
import { authenticate, type AuthedRequest } from "../middleware/auth.js";

export const authRouter = Router();

const profilePayload = async (repos: Repositories, clinicId: string, userId: string) => {
  const user = await repos.users.findById(clinicId, userId);
  const clinic = await repos.clinics.findById(clinicId);
  if (!user) throw new ApiError(401, "UNAUTHORIZED", "Account is not active");
  return {
    userId: user.id,
    username: user.username,
    fullName: user.fullName,
    role: user.role,
    patientId: user.patientId,
    clinic: clinic
      ? {
          id: clinic.id,
          name: clinic.name,
          locale: clinic.locale,
          timezone: clinic.timezone,
          currency: clinic.currency,
        }
      : { id: clinicId, name: "", locale: "en-CH", timezone: "Europe/Zurich", currency: "CHF" },
    capabilities: capabilitiesForRole(user.role as Role),
  };
};

authRouter.post(
  "/auth/login",
  authLimiter,
  validateBody(loginRequest),
  asyncHandler(async (req, res) => {
    const { username, password, deviceLabel } = req.body as {
      username: string;
      password: string;
      deviceLabel?: string;
    };

    // Pre-tenant username lookup through the guarded RLS bypass.
    const found = await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe("SELECT set_config('app.auth_lookup', 'on', true)");
      return tx.user.findFirst({ where: { username: { equals: username, mode: "insensitive" } } });
    });

    // Uniform failure: never reveal whether the username exists.
    const invalid = () => new ApiError(401, "INVALID_CREDENTIALS", "Invalid username or password");
    if (!found) throw invalid();
    const passwordOk = await bcrypt.compare(password, found.passwordHash);
    if (!passwordOk || !found.isActive) throw invalid();

    const result = await withTenant(
      { clinicId: found.clinicId, actorId: found.id, actorRole: found.role },
      async (tx) => {
        const repos = new Repositories(tx);
        const auth = new AuthRepository(tx);
        const session = await auth.createSession(found.id, found.clinicId, deviceLabel);
        const refresh = await auth.issueRefreshToken(session.id, found.id, found.clinicId);
        await repos.audit.append(
          { clinicId: found.clinicId, actorId: found.id, actorRole: found.role, sourceIp: req.ip },
          { action: "AUTH_LOGIN_SUCCESS", category: "AUTH" },
        );
        return { session, refresh, profile: await profilePayload(repos, found.clinicId, found.id) };
      },
    );

    const accessToken = issueAccessToken({
      sub: found.id,
      sid: result.session.id,
      tid: found.clinicId,
      role: found.role,
    });
    const csrf = generateCsrfToken();

    res.cookie(getSessionCookieName(req), accessToken, cookieOptions(req, SESSION_TTL_MS));
    res.cookie(getRefreshCookieName(req), result.refresh, cookieOptions(req, REFRESH_TOKEN_TTL_MS));
    res.cookie(getCsrfCookieName(req), csrf, csrfCookieOptions(req, SESSION_TTL_MS));

    res.json({ ...result.profile, csrfToken: csrf });
  }),
);

authRouter.post(
  "/auth/refresh",
  asyncHandler(async (req, res) => {
    const raw = readRefreshCookie(req);
    if (!raw) throw new ApiError(401, "UNAUTHORIZED", "No refresh token present");

    const rotation = await authRepo().rotateRefreshToken(raw);

    if (rotation.status === "reused") {
      // Token replay: the family is already revoked. Record the incident in
      // the affected clinic's audit trail.
      await withTenant(
        { clinicId: rotation.clinicId, actorId: rotation.userId, actorRole: "" },
        async (tx) => {
          const repos = new Repositories(tx);
          await repos.audit.append(
            { clinicId: rotation.clinicId, actorId: rotation.userId, sourceIp: req.ip },
            { action: "AUTH_TOKEN_REUSE_DETECTED", category: "AUTH" },
          );
        },
      ).catch(() => undefined);
      res.clearCookie(getRefreshCookieName(req));
      res.clearCookie(getSessionCookieName(req));
      throw new ApiError(401, "TOKEN_REUSE_DETECTED", "Session revoked for security; sign in again");
    }
    if (rotation.status === "invalid") {
      res.clearCookie(getRefreshCookieName(req));
      res.clearCookie(getSessionCookieName(req));
      throw new ApiError(401, "SESSION_EXPIRED", "Session expired, please sign in again");
    }

    const accessToken = issueAccessToken({
      sub: rotation.userId,
      sid: rotation.sessionId,
      tid: rotation.clinicId,
      role: "",
    });
    res.cookie(getSessionCookieName(req), accessToken, cookieOptions(req, SESSION_TTL_MS));
    res.cookie(getRefreshCookieName(req), rotation.raw, cookieOptions(req, REFRESH_TOKEN_TTL_MS));
    res.json({ ok: true });
  }),
);

authRouter.post(
  "/auth/logout",
  asyncHandler(async (req, res) => {
    const raw = readRefreshCookie(req);
    if (raw) {
      await authRepo().revokeRefreshToken(raw).catch(() => undefined);
    }
    const token = req.cookies?.[getSessionCookieName(req)] as string | undefined;
    if (token) {
      const claims = verifyAccessToken(token);
      if (claims) {
        await authRepo().revokeSession(claims.sid).catch(() => undefined);
        await withTenant(
          { clinicId: claims.tid, actorId: claims.sub, actorRole: claims.role },
          async (tx) => {
            const repos = new Repositories(tx);
            await repos.audit.append(
              { clinicId: claims.tid, actorId: claims.sub, actorRole: claims.role },
              { action: "AUTH_LOGOUT", category: "AUTH" },
            );
          },
        ).catch(() => undefined);
      }
    }
    res.clearCookie(getSessionCookieName(req));
    res.clearCookie(getRefreshCookieName(req));
    res.clearCookie(getCsrfCookieName(req));
    res.json({ ok: true });
  }),
);

authRouter.get(
  "/auth/session",
  authenticate,
  asyncHandler(async (req: AuthedRequest, res) => {
    const ctx = req.ctx!;
    const profile = await withTenantRepos(ctx, (repos) =>
      profilePayload(repos, ctx.tenantId, ctx.actorId),
    );
    res.json(profile);
  }),
);

authRouter.post(
  "/auth/password",
  authenticate,
  validateBody(changePasswordRequest),
  asyncHandler(async (req: AuthedRequest, res) => {
    const ctx = req.ctx!;
    const { currentPassword, newPassword } = req.body as {
      currentPassword: string;
      newPassword: string;
    };
    const changed = await withTenant(ctx, async (tx) => {
      const user = await tx.user.findFirst({ where: { clinicId: ctx.tenantId, id: ctx.actorId } });
      if (!user) return false;
      const ok = await bcrypt.compare(currentPassword, user.passwordHash);
      if (!ok) return false;
      await tx.user.update({
        where: { id: user.id },
        data: { passwordHash: bcrypt.hashSync(newPassword, 12) },
      });
      return true;
    });
    if (!changed) throw new ApiError(422, "UNPROCESSABLE", "Current password is incorrect");

    // Revoke every session after a password change.
    await authRepo().revokeAllForUser(ctx.actorId);

    await withTenantRepos(ctx, (repos) =>
      repos.audit.append(ctx, {
        action: "AUTH_PASSWORD_CHANGED",
        category: "AUTH",
        actorId: ctx.actorId,
        actorRole: ctx.actorRole,
      }),
    );
    res.json({ ok: true });
  }),
);
