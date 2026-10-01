/**
 * Token + session helpers.
 *
 * JWT carries the minimum claims (SEC-010): subject (user id), session id,
 * tenant id and role hint. Everything else (name, capabilities, profile) is
 * resolved server-side from the session; revoking the session immediately
 * invalidates the token.
 */
import jwt from "jsonwebtoken";
import crypto from "crypto";
import type { Request } from "express";
import { loadEnv } from "@medical/data";
import { getSessionCookieName, getRefreshCookieName } from "./cookies.js";

export const ACCESS_TOKEN_TTL_SEC = 8 * 60 * 60; // 8h

export interface SessionClaims {
  sub: string; // user id
  sid: string; // session id
  tid: string; // tenant (clinic) id
  role: string; // role at issue time (hint only)
}

export const issueAccessToken = (claims: SessionClaims): string =>
  jwt.sign(claims, loadEnv().JWT_SECRET, { expiresIn: ACCESS_TOKEN_TTL_SEC });

export const verifyAccessToken = (token: string): SessionClaims | null => {
  try {
    const decoded = jwt.verify(token, loadEnv().JWT_SECRET);
    if (typeof decoded === "string") return null;
    const { sub, sid, tid, role } = decoded as Record<string, unknown>;
    if (typeof sub !== "string" || typeof sid !== "string" || typeof tid !== "string") return null;
    return { sub, sid, tid, role: typeof role === "string" ? role : "" };
  } catch {
    return null;
  }
};

export const readSessionCookie = (req: Request): string | null => {
  const name = getSessionCookieName(req);
  const token = req.cookies?.[name] as string | undefined;
  if (token) return token;
  // Fallback to the non-prefixed cookie only when not in the __Host- setup.
  if (name !== "token" && loadEnv().NODE_ENV !== "production") {
    return (req.cookies?.["token"] as string | undefined) ?? null;
  }
  return null;
};

export const readRefreshCookie = (req: Request): string | null =>
  (req.cookies?.[getRefreshCookieName(req)] as string | undefined) ?? null;

export const generateCsrfToken = (): string => crypto.randomBytes(32).toString("hex");
