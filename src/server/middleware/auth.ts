/**
 * Authentication & authorization middleware.
 */
import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { JWT_SECRET } from "../config.js";

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
  // Read session cookie. In production, use __Host- prefix only (no fallback
  // to non-prefixed 'token', which would allow cookie injection from subdomains).
  // In dev, use 'token'. Authorization header is allowed for non-browser API clients.
  const isProd = process.env.NODE_ENV === "production";
  const cookieName = isProd ? "__Host-token" : "token";
  const token =
    req.cookies?.[cookieName] || (req.headers["authorization"] && req.headers["authorization"].split(" ")[1]);

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
