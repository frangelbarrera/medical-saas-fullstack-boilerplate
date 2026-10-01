export { prisma, type Tx } from "./client.js";
export {
  withTenant,
  withAuthLookup,
  checkDatabaseHealth,
  type TenantContext,
} from "./tenant.js";
export {
  encryptPHI,
  decryptPHI,
  hmacIndex,
  hashIp,
  generateCsrfToken,
  sha256,
} from "./crypto.js";
export { loadEnv, envSchema, type Env } from "./env.js";

export { AuditRepository, type ActorContext } from "./repositories/audit.js";
export { PatientRepository } from "./repositories/patients.js";
export { UserRepository, ClinicRepository, type UserRecord } from "./repositories/users.js";
export { SchedulingRepository } from "./repositories/scheduling.js";
export { ClinicalRepository, ENCOUNTER_TRANSITIONS } from "./repositories/clinical.js";
export { MessagingRepository } from "./repositories/messaging.js";
export { BillingRepository } from "./repositories/billing.js";
export {
  AuthRepository,
  REFRESH_TOKEN_BYTES,
  REFRESH_TOKEN_TTL_MS,
  SESSION_TTL_MS,
  type SessionRecord,
} from "./repositories/auth.js";
export { DsarRepository, AiRepository } from "./repositories/dsar-ai.js";

import type { Tx } from "./client.js";
import { prisma } from "./client.js";
import { AuthRepository } from "./repositories/auth.js";

/**
 * The auth repository lives on infrastructure tables (no RLS); give it the
 * root client. Everything tenant-scoped must go through withTenantRepos.
 */
export const authRepo = (): AuthRepository => new AuthRepository(prisma as unknown as Tx);

import { AuditRepository } from "./repositories/audit.js";
// prisma is already re-exported above via ./client.js
import { PatientRepository } from "./repositories/patients.js";
import { UserRepository, ClinicRepository } from "./repositories/users.js";
import { SchedulingRepository } from "./repositories/scheduling.js";
import { ClinicalRepository } from "./repositories/clinical.js";
import { MessagingRepository } from "./repositories/messaging.js";
import { BillingRepository } from "./repositories/billing.js";
import { DsarRepository, AiRepository } from "./repositories/dsar-ai.js";

/**
 * Repository bundle bound to one tenant-scoped transaction. Use via
 * withTenant(ctx, (repos) => ...).
 */
export class Repositories {
  readonly audit: AuditRepository;
  readonly patients: PatientRepository;
  readonly users: UserRepository;
  readonly clinics: ClinicRepository;
  readonly scheduling: SchedulingRepository;
  readonly clinical: ClinicalRepository;
  readonly messaging: MessagingRepository;
  readonly billing: BillingRepository;
  readonly dsar: DsarRepository;
  readonly ai: AiRepository;

  constructor(tx: Tx) {
    this.audit = new AuditRepository(tx);
    this.patients = new PatientRepository(tx);
    this.users = new UserRepository(tx);
    this.clinics = new ClinicRepository(tx);
    this.scheduling = new SchedulingRepository(tx);
    this.clinical = new ClinicalRepository(tx);
    this.messaging = new MessagingRepository(tx);
    this.billing = new BillingRepository(tx);
    this.dsar = new DsarRepository(tx);
    this.ai = new AiRepository(tx);
  }
}

export { withTenantRepos };

import { withTenant } from "./tenant.js";

async function withTenantRepos<T>(
  ctx: { tenantId?: string; clinicId?: string; actorId?: string; actorRole?: string; requestId?: string },
  fn: (repos: Repositories) => Promise<T>,
): Promise<T> {
  const clinicId = ctx.tenantId ?? ctx.clinicId;
  if (!clinicId) throw new Error("withTenantRepos: missing tenant id");
  return withTenant(
    { clinicId, actorId: ctx.actorId ?? "", actorRole: ctx.actorRole ?? "", requestId: ctx.requestId },
    async (tx) => fn(new Repositories(tx)),
  );
}
