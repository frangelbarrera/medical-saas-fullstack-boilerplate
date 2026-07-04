/**
 * Centralized configuration: env, secrets, DB pool, mock state.
 *
 * All modules import from here. This avoids circular deps and makes it easy
 * to swap the mock DB for real DB (Prisma) in T1.2.
 */
import { Pool } from "pg";
import { env } from "../lib/env.server.js";

export { env };

export const JWT_SECRET = env.JWT_SECRET;
export const ENCRYPTION_KEY = Buffer.from(env.ENCRYPTION_KEY, "hex");

// PostgreSQL connection pool with timeout (only used if PGHOST is reachable).
export const pool = new Pool({
  host: env.PGHOST,
  port: env.PGPORT,
  user: env.PGUSER,
  password: env.PGPASSWORD,
  database: env.PGDATABASE,
  connectionTimeoutMillis: 2000,
});

export let dbAvailable = false;
export const setDbAvailable = (v: boolean) => {
  (dbAvailable as any) = v;
};

// --- Mock Database (development only) ---
// In T1.2 (Prisma) these will be replaced with PrismaClient calls.
export const mockUsers: any[] = [];
export const mockClinics: any[] = [];
export const mockPatients: any[] = [];
export const mockInvoices: any[] = [];
export const mockExpenses: any[] = [];
export const mockAuditLogs: any[] = [];
export const mockConsultations: any[] = [];
export const mockAppointments: any[] = [];
export const mockAiChats: any[] = [];

// Volatile-filter helpers (used by logout to clear test data).
export const clearVolatile = () => {
  for (let i = mockPatients.length - 1; i >= 0; i--) {
    if (mockPatients[i].isVolatile) mockPatients.splice(i, 1);
  }
  for (let i = mockAppointments.length - 1; i >= 0; i--) {
    if (mockAppointments[i].isVolatile) mockAppointments.splice(i, 1);
  }
  for (let i = mockConsultations.length - 1; i >= 0; i--) {
    if (mockConsultations[i].isVolatile) mockConsultations.splice(i, 1);
  }
};
