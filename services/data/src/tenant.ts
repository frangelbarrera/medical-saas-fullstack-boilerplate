/**
 * Tenant-scoped transactions (ADR-003).
 *
 * EVERY database access for tenant data goes through withTenant(): the
 * transaction opens by setting `app.current_clinic_id` as a transaction-local
 * PostgreSQL setting, which is what the row-level security policies key on.
 * Running without a tenant context yields zero rows by design - queries
 * without tenant scope are impossible through this module.
 */
import { prisma, type Tx } from "./client.js";

export interface TenantContext {
  /** accepts tenantId (domain RequestContext) or clinicId (internal) */
  tenantId?: string;
  clinicId?: string;
  actorId: string;
  actorRole: string;
  requestId?: string;
}

/** Domain request context (tenantId naming) accepted by withTenantRepos. */
export interface DomainContextShape {
  tenantId: string;
  actorId: string;
  actorRole?: string;
  requestId?: string;
  sourceIp?: string;
  capabilities?: unknown[];
  [key: string]: unknown;
}

export type ReposFactory<T> = (tx: Tx) => T;

export async function withTenant<T>(
  ctx: TenantContext,
  fn: (tx: Tx) => Promise<T>,
): Promise<T> {
  const clinicId = ctx.tenantId ?? ctx.clinicId;
  if (!clinicId) throw new Error("withTenant: missing tenant id");
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.current_clinic_id', ${clinicId}, true)`;
    // Query budget (PERF-002): no tenant query may run away and hold a
    // connection for an unbounded time. 30s covers every indexed path in
    // the schema; long jobs must batch explicitly.
    await tx.$executeRaw`SELECT set_config('statement_timeout', '30000', true)`;
    return fn(tx);
  });
}

/**
 * Pre-tenant authentication lookup (login only): enables the users RLS
 * bypass `app.auth_lookup` for exactly one transaction. Used exclusively by
 * the login code path to resolve a username before its clinic is known.
 */
export async function withAuthLookup<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.auth_lookup', 'on', true)`;
    return fn(tx);
  });
}

/**
 * Serialize audit writes per clinic so the hash chain never forks under
 * concurrency. Called at the start of the audit append, inside the same
 * transaction.
 */
export async function lockAuditChain(tx: Tx, clinicId: string): Promise<void> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${"audit:" + clinicId}))`;
}

/**
 * Database readiness probe (SEC-003): a real round-trip against PostgreSQL.
 */
export async function checkDatabaseHealth(): Promise<boolean> {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return true;
  } catch {
    return false;
  }
}

export { prisma };
