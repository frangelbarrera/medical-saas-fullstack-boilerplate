/**
 * Authentication & authorization middleware.
 */
import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { JWT_SECRET, env } from "../config.js";
import { isRequestSecure } from "../utils/cookies.js";

export interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    username: string;
    role: string;
    clinicId: string;
    name: string;
    managed_doctor_ids?: string[];
  };
}

export const authenticateToken = (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  // Read session cookie. The cookie name depends on whether the request is
  // HTTPS and production: __Host-token (prod + HTTPS) or token (dev/HTTP).
  // We check both names to handle transitions between environments.
  const isProd = env.NODE_ENV === "production";
  const isSecure = isRequestSecure(req);
  const useHostPrefix = isProd && isSecure;
  const cookieName = useHostPrefix ? "__Host-token" : "token";
  const token =
    req.cookies?.[cookieName] ||
    req.cookies?.token || // fallback for dev/HTTP
    (req.headers["authorization"] && req.headers["authorization"].split(" ")[1]);

  if (!token) return res.sendStatus(401);

  jwt.verify(token, JWT_SECRET, (err: any, user: any) => {
    if (err) return res.sendStatus(403);
    req.user = user;
    next();
  });
};

/**
 * RBAC middleware. Usage: app.post('/api/users', authenticateToken, requireRole('ADMIN'), handler)
 * Returns 403 if the authenticated user's role is not in the allowed list.
 */
export const requireRole = (...allowedRoles: string[]) => {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.user || !req.user.role) {
      return res.status(403).json({ error: "Forbidden: missing role in token" });
    }
    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ error: `Forbidden: requires one of [${allowedRoles.join(", ")}]` });
    }
    next();
  };
};

/**
 * Multi-tenant isolation helper. Returns true if the resource belongs to the
 * caller's clinic. We return 404 (not 403) on mismatch to avoid leaking existence.
 */
export const assertClinicOwnership = (resourceClinicId: string, userClinicId: string): boolean => {
  return resourceClinicId === userClinicId;
};
