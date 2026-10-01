import { PrismaClient } from "@prisma/client";

/**
 * Prisma client singleton.
 *
 * The application connects as the limited `medical_app` role; row-level
 * security policies apply to every query. Tenant scope is provided by
 * services/data/src/tenant.ts, never by ad-hoc query filters alone.
 */
declare global {
  var __medicalPrisma: PrismaClient | undefined;
}

export const prisma =
  globalThis.__medicalPrisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalThis.__medicalPrisma = prisma;
}

export type Tx = Parameters<Parameters<PrismaClient["$transaction"]>[0]>[0];
