/**
 * First-run bootstrap: provisions the initial clinic + admin from
 * ADMIN_USERNAME / ADMIN_PASSWORD / ADMIN_CLINIC_ID when no admin exists yet.
 *
 * The inserts run inside the new clinic's own tenant context so they satisfy
 * the row-level security policies from the very first row.
 */
import {withTenant, Repositories} from "@medical/data";
import { logger } from "./lib/logger.js";

export async function bootstrap(): Promise<void> {
  const username = process.env.ADMIN_USERNAME;
  const password = process.env.ADMIN_PASSWORD;
  if (!username || !password) {
    logger.warn({
      msg: "ADMIN_USERNAME / ADMIN_PASSWORD not set - skipping first-admin bootstrap (create staff from the UI as an existing admin)",
    });
    return;
  }

  const clinicId = process.env.ADMIN_CLINIC_ID ?? "clinic_default";
  const clinicName = process.env.ADMIN_CLINIC_NAME ?? "Riverside Clinic";

  const created = await withTenant(
    { clinicId, actorId: "bootstrap", actorRole: "ADMIN" },
    async (tx) => {
      const repos = new Repositories(tx);
      const admin = await repos.clinics.bootstrapAdmin(clinicId, clinicName, username, password, "System Administrator");
      if (admin) {
        await repos.audit.append(
          { clinicId, actorId: admin.id, actorRole: "ADMIN" },
          { action: "USER_CREATED", category: "ADMIN", target: admin.id, details: { bootstrap: true, role: "ADMIN" } },
        );
      }
      return admin;
    },
  ).catch((err) => {
    logger.error({ msg: "Bootstrap failed", err: String(err) });
    return null;
  });

  if (created) {
    logger.info({ msg: `Initial admin provisioned: ${created.username} - change the password after first login` });
  } else {
    logger.info({ msg: "Bootstrap: an admin already exists, nothing to do" });
  }
}
