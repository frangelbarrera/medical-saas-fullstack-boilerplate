/**
 * Prisma client singleton.
 *
 * In production (DATABASE_URL set), use PrismaClient for all DB operations.
 * In development without a database, the app falls back to the in-memory mock
 * arrays defined in config.ts.
 *
 * Usage:
 *   import { prisma } from "./client.js";
 *   const users = await prisma.user.findMany({ where: { clinicId } });
 */
import { PrismaClient } from "@prisma/client";

declare global {
  // eslint-disable-next-line no-var
  var __prisma: PrismaClient | undefined;
}

export const prisma =
  globalThis.__prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalThis.__prisma = prisma;
}
