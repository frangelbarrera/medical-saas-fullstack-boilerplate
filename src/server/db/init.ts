/**
 * Database initialization and seeding.
 *
 * In mock mode (no PostgreSQL available), the app runs against in-memory arrays
 * defined in config.ts. When PostgreSQL is available, initDb() creates the
 * users and clinics tables and seeds the first admin from env vars.
 *
 * The full production schema (with RLS, UUID, ENUM) is in schema.sql. To use
 * PostgreSQL mode, run `psql -f schema.sql` against your database.
 */
import bcrypt from "bcryptjs";
import { pool, setDbAvailable } from "../config.js";

export async function initDb(): Promise<void> {
  let client;
  try {
    client = await pool.connect();
    setDbAvailable(true);
    console.log("[db] Connected to PostgreSQL successfully.");

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
        await client.query(
          "INSERT INTO clinics (id, name, owner_id) VALUES ($1, $2, $3) ON CONFLICT (id) DO NOTHING",
          [clinicId, clinicName, "admin_root"]
        );
        await client.query(
          "INSERT INTO users (id, username, password, name, role, clinic_id) VALUES ($1, $2, $3, $4, $5, $6)",
          ["admin_root", adminUsername, hashedPassword, adminName, "ADMIN", clinicId]
        );
        console.log(`[db] Initial admin '${adminUsername}' provisioned. Change the password immediately after first login.`);
      }
    } else {
      console.warn("[db] ADMIN_USERNAME / ADMIN_PASSWORD not set. No initial admin seeded.");
      console.warn("[db] To create the first admin, set ADMIN_USERNAME and ADMIN_PASSWORD env vars and restart.");
    }
  } catch (err) {
    setDbAvailable(false);
    console.warn("[db] PostgreSQL not available. Running in mock mode.");
  } finally {
    if (client) client.release();
  }
}
