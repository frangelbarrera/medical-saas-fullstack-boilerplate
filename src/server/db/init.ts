/**
 * Database initialization and seeding.
 *
 * Behavior:
 *  1. Try to connect to PostgreSQL. If successful, create tables and seed admin.
 *  2. If PostgreSQL is NOT available (mock mode), seed the admin into the
 *     in-memory mock arrays so the app is usable for demos and development.
 *
 * This ensures the app always has at least one admin user (if ADMIN_USERNAME
 * and ADMIN_PASSWORD env vars are set), regardless of whether a database is
 * configured. This is critical for Vercel demos and quick local testing.
 */
import bcrypt from "bcryptjs";
import { pool, setDbAvailable, mockUsers, mockClinics } from "../config.js";
import { logger } from "../utils/logger.js";

/**
 * Seed the admin user into the in-memory mock arrays (used when no DB).
 */
const seedMockAdmin = () => {
  const adminUsername = process.env.ADMIN_USERNAME;
  const adminPassword = process.env.ADMIN_PASSWORD;
  if (!adminUsername || !adminPassword) {
    logger.warn({ msg: "ADMIN_USERNAME / ADMIN_PASSWORD not set, no admin seeded" });
    logger.warn({ msg: "Set ADMIN_USERNAME and ADMIN_PASSWORD env vars and restart to create the first admin" });
    return;
  }

  const adminName = process.env.ADMIN_NAME || "System Administrator";
  const clinicId = process.env.ADMIN_CLINIC_ID || "clinic_default";
  const clinicName = process.env.ADMIN_CLINIC_NAME || "Default Clinic";

  // Check if admin already exists in mock
  if (mockUsers.find((u) => u.username === adminUsername)) {
    return; // already seeded
  }

  const hashedPassword = bcrypt.hashSync(adminPassword, 12);

  // Seed clinic
  if (!mockClinics.find((c) => c.id === clinicId)) {
    mockClinics.push({
      id: clinicId,
      name: clinicName,
      owner_id: "admin_root",
      address: "",
      phone: "",
      email: "",
      logo: "",
    });
  }

  // Seed admin user
  mockUsers.push({
    id: "admin_root",
    username: adminUsername,
    password: hashedPassword,
    name: adminName,
    role: "ADMIN",
    clinic_id: clinicId,
    is_active: true,
    managed_doctor_ids: [],
  });

  logger.info({ msg: "Initial admin seeded (mock mode)", adminUsername });
  logger.warn({ msg: "Change the admin password immediately after first login" });
};

export async function initDb(): Promise<void> {
  let client;
  try {
    client = await pool.connect();
    setDbAvailable(true);
    logger.info({ msg: "PostgreSQL connected" });

    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        username TEXT UNIQUE,
        password TEXT,
        name TEXT,
        role TEXT,
        clinic_id TEXT,
        is_active BOOLEAN DEFAULT TRUE,
        managed_doctor_ids JSONB DEFAULT '[]',
        created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS clinics (
        id TEXT PRIMARY KEY,
        name TEXT,
        address TEXT,
        phone TEXT,
        email TEXT,
        logo TEXT,
        owner_id TEXT,
        created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Seed first admin only if ADMIN_USERNAME / ADMIN_PASSWORD env vars are provided.
    const adminUsername = process.env.ADMIN_USERNAME;
    const adminPassword = process.env.ADMIN_PASSWORD;
    const adminName = process.env.ADMIN_NAME || "System Administrator";
    const clinicId = process.env.ADMIN_CLINIC_ID || "clinic_default";
    const clinicName = process.env.ADMIN_CLINIC_NAME || "Default Clinic";

    if (adminUsername && adminPassword) {
      const adminRes = await client.query("SELECT * FROM users WHERE username = $1", [adminUsername]);
      if (adminRes.rows.length === 0) {
        const hashedPassword = bcrypt.hashSync(adminPassword, 12);
        await client.query("INSERT INTO clinics (id, name, owner_id) VALUES ($1, $2, $3) ON CONFLICT (id) DO NOTHING", [
          clinicId,
          clinicName,
          "admin_root",
        ]);
        await client.query(
          "INSERT INTO users (id, username, password, name, role, clinic_id) VALUES ($1, $2, $3, $4, $5, $6)",
          ["admin_root", adminUsername, hashedPassword, adminName, "ADMIN", clinicId],
        );
        logger.info({ msg: "Initial admin provisioned (DB mode)", adminUsername });
        logger.warn({ msg: "Change the admin password immediately after first login" });
      }
    } else {
      logger.warn({ msg: "ADMIN_USERNAME / ADMIN_PASSWORD not set, no admin seeded" });
    }
  } catch (err) {
    setDbAvailable(false);
    logger.warn({ msg: "PostgreSQL not available, running in mock mode" });
    // Seed admin into mock arrays so the app is usable without a database.
    seedMockAdmin();
  } finally {
    if (client) client.release();
  }
}
