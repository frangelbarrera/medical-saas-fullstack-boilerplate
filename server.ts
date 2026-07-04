import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import { Pool } from "pg";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import dotenv from "dotenv";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import cookieParser from "cookie-parser";
import cors from "cors";
import { z } from "zod";
import crypto from "crypto";

import { env } from "./src/lib/env.server.js";
import { setupSwagger } from "./src/lib/swagger.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// --- ALE (Application-Level Encryption) Configuration ---
// AES-256-GCM provides authenticated encryption (AEAD): confidentiality + integrity.
// The auth tag prevents ciphertext tampering (mitigates padding oracle / bit-flipping attacks).
// The ENCRYPTION_KEY is sourced from the validated env (env.server.ts) and MUST be 32 bytes (64 hex chars).
const ENCRYPTION_KEY = Buffer.from(env.ENCRYPTION_KEY, 'hex'); // 256-bit key
const IV_LENGTH = 12; // 96-bit IV is recommended for GCM

const encryptPHI = (text: string): string => {
  if (!text) return text;
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv('aes-256-gcm', ENCRYPTION_KEY, iv);
  let encrypted = cipher.update(text, 'utf8');
  encrypted = Buffer.concat([encrypted, cipher.final()]);
  const authTag = cipher.getAuthTag();
  // Format: iv:authTag:ciphertext (all hex)
  return iv.toString('hex') + ':' + authTag.toString('hex') + ':' + encrypted.toString('hex');
};

const decryptPHI = (text: string): string => {
  if (!text) return text;
  try {
    const parts = text.split(':');
    // Legacy CBC format was iv:ciphertext (2 parts). GCM format is iv:authTag:ciphertext (3 parts).
    if (parts.length !== 3) {
      // Not a GCM ciphertext. Return as-is (legacy/mock data passthrough).
      return text;
    }
    const [ivHex, authTagHex, ciphertextHex] = parts;
    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');
    const ciphertext = Buffer.from(ciphertextHex, 'hex');
    const decipher = crypto.createDecipheriv('aes-256-gcm', ENCRYPTION_KEY, iv);
    decipher.setAuthTag(authTag);
    let decrypted = decipher.update(ciphertext);
    decrypted = Buffer.concat([decrypted, decipher.final()]);
    return decrypted.toString('utf8');
  } catch (e) {
    // Auth tag verification failed OR ciphertext corrupted: never return partial/decrypted data.
    // Returning the raw text here would silently bypass integrity. Throw instead.
    throw new Error('PHI decryption failed: ciphertext integrity check failed');
  }
};

// --- WORM Tamper-Evident Audit Logging ---
let lastLogHash = crypto.createHash('sha256').update('GENESIS_BLOCK').digest('hex');

const appendAuditLog = (mockLogsArray: any[], logData: any) => {
  const timestamp = new Date().toISOString();
  // Stringify deterministic structure for hashing
  const dataString = JSON.stringify({ ...logData, timestamp });
  const currentHash = crypto.createHash('sha256').update(lastLogHash + dataString).digest('hex');
  
  const sealedLog = {
    ...logData,
    timestamp,
    hash: currentHash,
    prevHash: lastLogHash
  };
  
  lastLogHash = currentHash;
  mockLogsArray.push(sealedLog);
  return sealedLog;
};

// PostgreSQL Connection Pool with Timeout
const pool = new Pool({
  host: env.PGHOST,
  port: env.PGPORT,
  user: env.PGUSER,
  password: env.PGPASSWORD,
  database: env.PGDATABASE,
  connectionTimeoutMillis: 2000, // 2 seconds timeout
});

const JWT_SECRET = env.JWT_SECRET;

// --- Mock Database ---
// Demo users are NOT seeded here. The first admin is provisioned by the setup
// script (scripts/init-admin.ts) or by initDb() reading ADMIN_USERNAME /
// ADMIN_PASSWORD from env vars. This prevents credentials like "admin/admin"
// from being committed to source control.
let mockUsers: any[] = [];

let mockClinics: any[] = [];

let mockPatients: any[] = [];

let mockInvoices: any[] = [];

let mockExpenses: any[] = [];
let mockAuditLogs: any[] = [];
let mockConsultations: any[] = [];
let mockAppointments: any[] = [];
let mockAiChats: any[] = [];

let dbAvailable = false;

// Initialize Database Schema and seed first admin from env vars.
// NEVER hardcode credentials. The first admin's password comes from ADMIN_PASSWORD
// env var (or a random one is generated and logged once if ADMIN_PASSWORD_AUTO=true).
async function initDb() {
  let client;
  try {
    client = await pool.connect();
    dbAvailable = true;
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
    dbAvailable = false;
    console.warn("[db] PostgreSQL not available. Running in mock mode.");
  } finally {
    if (client) client.release();
  }
}

initDb();

// --- Auth Middleware ---
const authenticateToken = (req: any, res: any, next: any) => {
  // Read session cookie (prefixed in production)
  const cookieName = env.NODE_ENV === 'production' ? '__Host-token' : 'token';
  const token = req.cookies?.[cookieName] || req.cookies?.token
    || (req.headers['authorization'] && req.headers['authorization'].split(' ')[1]);

  if (!token) return res.sendStatus(401);

  jwt.verify(token, JWT_SECRET, (err: any, user: any) => {
    if (err) return res.sendStatus(403);
    req.user = user;
    next();
  });
};

// RBAC middleware. Usage: app.post('/api/users', authenticateToken, requireRole('ADMIN'), handler)
// Returns 403 if the authenticated user's role is not in the allowed list.
const requireRole = (...allowedRoles: string[]) => {
  return (req: any, res: any, next: any) => {
    if (!req.user || !req.user.role) {
      return res.status(403).json({ error: "Forbidden: missing role in token" });
    }
    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ error: `Forbidden: requires one of [${allowedRoles.join(', ')}]` });
    }
    next();
  };
};

// Multi-tenant isolation helper. Throws 404 if the resource does not belong to
// the authenticated user's clinic. We return 404 (not 403) to avoid leaking existence.
const assertClinicOwnership = (resourceClinicId: string, userClinicId: string) => {
  return resourceClinicId === userClinicId;
};

const app = express();

// Set up CORS
app.use(cors({
  origin: env.FRONTEND_URL,
  credentials: true,
}));

// Set up Cookie Parser
app.use(cookieParser());

// CSRF Protection: Double-Submit Cookie pattern.
// On login, the server sets a non-httpOnly cookie 'csrf_token' with a random
// value. The frontend must read it and send the same value back in the
// 'x-csrf-token' header for state-changing requests. An attacker on a
// different origin cannot read the cookie (SameSite + CORS) and therefore
// cannot forge the header. This is the standard pattern when cookies use
// SameSite=None (required for cross-origin deployments).
const csrfProtection = (req: any, res: any, next: any) => {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    return next();
  }
  // Webhook has its own HMAC verification, skip CSRF there
  if (req.path === '/api/webhooks/payment') {
    return next();
  }
  const cookieToken = req.cookies?.csrf_token;
  const headerToken = req.headers['x-csrf-token'];
  if (!cookieToken || !headerToken || cookieToken !== headerToken) {
    return res.status(403).json({ error: "CSRF token missing or invalid." });
  }
  next();
};

app.use("/api/", csrfProtection);

// Helper to generate a new CSRF token (called on login)
const generateCsrfToken = () => crypto.randomBytes(32).toString('hex');

// Security Headers with explicit CSP.
// In development, Vite needs 'unsafe-inline' for styles and connects to itself.
// In production, the policy is strict.
const cspDirectives = env.NODE_ENV === 'production'
  ? {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"], // Tailwind requires inline styles
      imgSrc: ["'self'", "data:", "https:"],
      fontSrc: ["'self'", "data:"],
      connectSrc: ["'self'"],
      frameAncestors: ["'none'"],
      formAction: ["'self'"],
      baseUri: ["'self'"],
      objectSrc: ["'none'"],
      upgradeInsecureRequests: [],
    }
  : {
      // Dev: more permissive to allow Vite HMR over websockets
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "https:"],
      fontSrc: ["'self'", "data:"],
      connectSrc: ["'self'", "ws:", "wss:"],
      frameAncestors: ["'none'"],
    };

app.use(helmet({
  contentSecurityPolicy: { directives: cspDirectives },
  crossOriginEmbedderPolicy: false,
  crossOriginOpenerPolicy: { policy: 'same-origin' },
  crossOriginResourcePolicy: { policy: 'same-origin' },
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true,
  },
}));

// Global Rate Limiting
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 500, // limit each IP to 500 requests per windowMs
  message: { error: "Too many requests from this IP, please try again later." }
});
app.use("/api/", globalLimiter);

// Specific Auth Limiter
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20, // limit each IP to 20 auth attempts per windowMs
  message: { error: "Too many login attempts, please try again later." }
});

// Capture raw body for webhook signature verification. The JSON parser still
// runs and populates req.body, but we also keep req.rawBody as a Buffer for
// HMAC computation. This is required for verifying payment webhook signatures.
app.use(express.json({
  limit: '1mb',
  verify: (req: any, _res, buf) => {
    req.rawBody = buf;
  }
}));
setupSwagger(app);

// Payload Validation Middleware
const validateBody = (schema: z.ZodTypeAny) => {
  return (req: any, res: any, next: any) => {
    try {
      req.body = schema.parse(req.body);
      next();
    } catch (e: any) {
      if (e instanceof z.ZodError) {
        return res.status(400).json({ error: "Validation Error", details: (e as any).errors || e.issues });
      }
      next(e);
    }
  }
};

async function startServer() {
  // --- Zod Schemas ---
  const schemas = {
    login: z.object({
      username: z.string().min(3).max(50),
      password: z.string().min(5).max(100),
      role: z.string().optional(),
    }),
    clinicUpdate: z.object({
      name: z.string().optional(),
      address: z.string().optional(),
      phone: z.string().optional(),
      email: z.string().email().optional(),
      logo: z.string().optional(),
    }),
    userCreate: z.object({
      name: z.string().min(2).max(100),
      username: z.string().min(3).max(50),
      password: z.string().min(5).max(100),
      role: z.string(),
      clinicId: z.string().optional(), // ignored, taken from JWT
    }),
    userUpdate: z.object({
      name: z.string().optional(),
      role: z.string().optional(),
      isActive: z.boolean().optional(),
      managedDoctorIds: z.array(z.string()).optional(),
    }),
    patientCreate: z.object({
      name: z.string().min(2),
      dni: z.string().min(5),
      email: z.string().email().optional().or(z.literal('')),
      phone: z.string().optional().or(z.literal('')),
      birthDate: z.string(),
      gender: z.string(),
      status: z.string(),
      clinicId: z.string().optional(), // ignored, taken from JWT
    }),
    patientUpdate: z.object({
      name: z.string().optional(),
      dni: z.string().optional(),
      email: z.string().email().optional().or(z.literal('')),
      phone: z.string().optional().or(z.literal('')),
      birthDate: z.string().optional(),
      gender: z.string().optional(),
      status: z.string().optional(),
    }),
    appointmentCreate: z.object({
      patientName: z.string(),
      patientId: z.string(),
      type: z.string(),
      duration: z.number().int().positive(),
      reason: z.string().optional().or(z.literal('')),
      dateTime: z.string(),
      clinicId: z.string().optional(), // ignored, taken from JWT
      doctorId: z.string(),
      doctorName: z.string(),
    }),
    invoiceCreate: z.object({
      patientId: z.string(),
      patientName: z.string(),
      doctorId: z.string(),
      doctorName: z.string(),
      concept: z.string(),
      amount: z.number().nonnegative(),
      paymentMethod: z.string(),
      status: z.string(),
      insuranceCompany: z.string().optional().or(z.literal('')),
      date: z.string(),
      clinicId: z.string().optional(), // ignored, taken from JWT
    }),
    expenseCreate: z.object({
      concept: z.string(),
      category: z.string(),
      amount: z.number().nonnegative(),
      date: z.string(),
      clinicId: z.string().optional(), // ignored, taken from JWT
      registeredBy: z.string(),
    }),
    consultationCreate: z.object({
      date: z.string(),
      reason: z.string(),
      evolution: z.string(),
      vital_signs: z.record(z.string(), z.any()).optional(),
      diagnosis_cie10: z.array(z.any()).optional(),
      prescription: z.array(z.any()).optional(),
      clinicId: z.string().optional(), // ignored, taken from JWT
      doctorId: z.string(),
      doctorName: z.string(),
    }),
    auditLogCreate: z.object({
      clinicId: z.string().optional(), // ignored, taken from JWT
      userId: z.string(),
      userName: z.string(),
      action: z.string(),
      target: z.string(),
      type: z.string(),
      details: z.record(z.string(), z.any()).optional(),
    }),
    aiChatCreate: z.object({
      userId: z.string(),
      clinicId: z.string().optional(), // ignored, taken from JWT
      title: z.string(),
      messages: z.array(z.any()),
    }),
    aiChatUpdate: z.object({
      title: z.string().optional(),
      messages: z.array(z.any()).optional(),
    }),
    createOrder: z.object({
      invoiceId: z.string(),
      amount: z.number().positive(),
      patientName: z.string(),
      clinicId: z.string().optional(), // ignored, taken from JWT
    })
  };

  // --- API Routes ---
  // Auth

  app.get("/api/auth/me", authenticateToken, (req: any, res: any) => {
    res.json({ user: req.user });
  });

  app.post("/api/auth/logout", (req: any, res: any) => {
    // Clear volatile test data generated by the populate endpoint
    mockPatients = mockPatients.filter(p => !p.isVolatile);
    mockAppointments = mockAppointments.filter(a => !a.isVolatile);
    mockConsultations = mockConsultations.filter(c => !c.isVolatile);

    res.clearCookie("token", {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
    });
    res.clearCookie("csrf_token", {
      httpOnly: false,
      secure: true,
      sameSite: "lax",
      path: "/",
    });
    res.json({ success: true });
  });

  /**
   * @openapi
   * /api/auth/login:
   *   post:
   *     summary: Authenticate a user
   *     tags: [Auth]
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               username:
   *                 type: string
   *               password:
   *                 type: string
   *               role:
   *                 type: string
   *     responses:
   *       200:
   *         description: Login successful
   *       401:
   *         description: Invalid credentials
   */
  app.post("/api/auth/login", authLimiter, validateBody(schemas.login), async (req, res) => {
    try {
      const { username, password, role } = req.body;
      
      let user = null;
      
      // Try DB only if healthy
      if (dbAvailable) {
        try {
          const dbRes = await pool.query("SELECT * FROM users WHERE username = $1", [username]);
          if (dbRes.rows.length > 0) {
            const u = dbRes.rows[0];
            user = {
              id: u.id,
              username: u.username,
              password: u.password,
              name: u.name,
              role: u.role,
              clinic_id: u.clinic_id,
              managed_doctor_ids: typeof u.managed_doctor_ids === 'string' ? JSON.parse(u.managed_doctor_ids) : u.managed_doctor_ids
            };
          }
        } catch (dbErr) {
          console.warn("DB login query failed");
        }
      }

      // Fallback to mock
      if (!user) {
        user = mockUsers.find(u => u.username === username);
      }

      if (!user || !bcrypt.compareSync(password, user.password)) {
        return res.status(401).json({ error: "Invalid username or password" });
      }

      if (role && user.role.toUpperCase() !== role.toUpperCase()) {
        return res.status(401).json({ error: `User exists but does not have the ${role} role` });
      }

      const token = jwt.sign({ 
        id: user.id, 
        username: user.username, 
        role: user.role, 
        clinicId: user.clinic_id, 
        name: user.name,
        managed_doctor_ids: user.managed_doctor_ids
      }, JWT_SECRET, { expiresIn: '8h' });

      // Set session cookie (httpOnly: JS cannot read it; SameSite=lax blocks CSRF
      // for top-level navigations; secure: only over HTTPS in prod).
      // In production we use __Host- prefix which forces secure, path=/, no domain.
      const isProd = env.NODE_ENV === 'production';
      const cookieName = isProd ? '__Host-token' : 'token';
      const csrfToken = generateCsrfToken();
      res.cookie(cookieName, token, {
        httpOnly: true,
        secure: true,
        sameSite: "lax",
        path: "/",
        maxAge: 8 * 60 * 60 * 1000, // 8 hours
        ...(isProd ? {} : {}), // __Host- requires no domain
      });
      // CSRF double-submit cookie: readable by JS so it can be sent back as header.
      const csrfCookieName = isProd ? '__Host-csrf_token' : 'csrf_token';
      res.cookie(csrfCookieName, csrfToken, {
        httpOnly: false,
        secure: true,
        sameSite: "lax",
        path: "/",
        maxAge: 8 * 60 * 60 * 1000,
      });

      res.json({ 
        user: { 
          id: user.id, 
          username: user.username, 
          role: user.role, 
          clinicId: user.clinic_id, 
          name: user.name,
          managed_doctor_ids: user.managed_doctor_ids
        },
        csrfToken // also returned in body so frontend can store in memory
      });
    } catch (err: any) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ error: (err as any).errors || err.issues });
      }
      res.status(500).json({ error: "Database connection error" });
    }
  });

  // Populate Database (admin only)
  app.post("/api/admin/populate", authenticateToken, requireRole('ADMIN'), (req: any, res: any) => {
    // Use clinicId from JWT, ignore any clinicId in body (IDOR fix)
    const clinicId = req.user.clinicId;

    const numPatients = 10;
    const firstNames = ["James", "Maria", "Robert", "Linda", "Michael", "Patricia", "William", "Barbara", "David", "Susan", "Thomas", "Jessica", "Sarah", "Karen", "Nancy", "Lisa"];
    const lastNames = ["Smith", "Johnson", "Williams", "Brown", "Jones", "Garcia", "Miller", "Davis", "Rodriguez", "Martinez", "Hernandez", "Lopez", "Gonzalez", "Wilson", "Anderson", "Thomas"];
    
    // Find doctors in this clinic
    const activeDoctors = mockUsers.filter(u => u.role === "DOCTOR" && u.clinic_id === clinicId);
    if (!activeDoctors.length) {
      activeDoctors.push({ id: "doc_mock_1", name: "Dr. Virtual", clinic_id: clinicId });
    }

    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];

    for (let i = 0; i < numPatients; i++) {
        const id = "pat_mock_" + crypto.randomUUID();
        const name = `${firstNames[Math.floor(Math.random()*firstNames.length)]} ${lastNames[Math.floor(Math.random()*lastNames.length)]}`;
        const doctor = activeDoctors[i % activeDoctors.length];
        
        mockPatients.push({
            id,
            name,
            dni: encryptPHI(`09${Math.floor(10000000 + Math.random() * 90000000)}`),
            email: encryptPHI(`${name.split(' ')[0].toLowerCase()}@test.com`),
            phone: encryptPHI(`099${Math.floor(1000000 + Math.random() * 9000000)}`),
            birth_date: encryptPHI(new Date(1960 + Math.floor(Math.random() * 40), Math.floor(Math.random() * 12), Math.floor(Math.random() * 28)).toISOString().split('T')[0]),
            gender: Math.random() > 0.5 ? "M" : "F",
            status: "Active",
            clinic_id: clinicId,
            doctorId: doctor.id,
            doctorName: doctor.name,
            isVolatile: true
        });

        const hour = 8 + Math.floor(Math.random() * 8);
        const mins = Math.random() > 0.5 ? "00" : "30";
        const apptDate = new Date(`${todayStr}T${hour.toString().padStart(2, '0')}:${mins}:00`);

        const apptId = "appt_mock_" + crypto.randomUUID();
        mockAppointments.push({
            id: apptId,
            patient_name: name,
            patient_id: id,
            type: "Follow-up",
            duration: 30,
            reason: "Routine Checkup",
            date_time: apptDate.toISOString(),
            clinic_id: clinicId,
            doctor_id: doctor.id,
            doctor_name: doctor.name,
            created_at: new Date().toISOString(),
            isVolatile: true
        });

        const consDate = new Date();
        consDate.setDate(consDate.getDate() - (1 + Math.floor(Math.random() * 30)));
        consDate.setHours(8 + Math.floor(Math.random() * 8));

        mockConsultations.push({
            id: "cons_mock_" + crypto.randomUUID(),
            patient_id: id,
            date: consDate.toISOString(),
            reason: "Previous symptom assessment",
            evolution: "Patient improved after initial treatment. Normal vital signs.",
            vital_signs: {
                bp: "120/80",
                hr: "72",
                temp: "36.5",
                weight: "70",
                o2: "98"
            },
            diagnosis_cie10: "Z00.0 - General medical examination",
            prescription: "Continue healthy lifestyle",
            clinic_id: clinicId,
            doctor_id: doctor.id,
            doctor_name: doctor.name,
            isVolatile: true
        });
    }

    res.json({ success: true, message: "Database populated successfully" });
  });

  // Clinics
  app.get("/api/clinics/:id", authenticateToken, async (req, res) => {
    try {
      const clinic = mockClinics.find(c => c.id === req.params.id);
      res.json(clinic);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.put("/api/clinics/:id", authenticateToken, validateBody(schemas.clinicUpdate), async (req, res) => {
    const { name, address, phone, email, logo } = req.body;
    try {
      const idx = mockClinics.findIndex(c => c.id === req.params.id);
      if (idx !== -1) {
        mockClinics[idx] = { ...mockClinics[idx], name, address, phone, email, logo };
      }
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Users (admin only for write operations; admin+doctor+secretary for read)
  app.get("/api/users", authenticateToken, requireRole('ADMIN', 'DOCTOR', 'SECRETARY'), async (req: any, res) => {
    // clinicId from JWT, ignore query param (IDOR fix)
    const clinicId = req.user.clinicId;
    const role = req.query.role;
    try {
      let filtered = mockUsers.filter(u => u.clinic_id === clinicId);
      if (role) {
        filtered = filtered.filter(u => u.role === role);
      }
      // Whitelist fields: never expose password hash
      res.json(filtered.map((u: any) => ({
        id: u.id,
        username: u.username,
        name: u.name,
        role: u.role,
        clinicId: u.clinic_id,
        isActive: u.is_active,
        managedDoctorIds: u.managed_doctor_ids
      })));
    } catch (err: any) {
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/users", authenticateToken, requireRole('ADMIN'), validateBody(schemas.userCreate), async (req: any, res: any) => {
    const id = "user_" + crypto.randomUUID();
    const { name, username, password, role } = req.body;
    // Enforce clinicId from JWT (IDOR fix) and restrict assign roles
    const clinicId = req.user.clinicId;
    // Only ADMIN can create ADMIN; SECRETARY/DOCTOR creation is allowed to ADMIN
    const allowedRoles = ['ADMIN', 'DOCTOR', 'SECRETARY'];
    if (!allowedRoles.includes(role)) {
      return res.status(400).json({ error: `Invalid role. Allowed: ${allowedRoles.join(', ')}` });
    }
    const hashedPassword = bcrypt.hashSync(password, 12);
    
    try {
      const newUser = { id, username, password: hashedPassword, name, role, clinic_id: clinicId, is_active: true, managed_doctor_ids: [] };
      mockUsers.push(newUser);
      appendAuditLog(mockAuditLogs, {
        id: "log_" + crypto.randomUUID(), clinic_id: clinicId, user_id: req.user.id, user_name: req.user.name,
        action: "USER_CREATE", target: id, type: "SECURITY",
        details: { username, role }
      });
      res.json({ id, name, role, clinicId });
    } catch (error: any) {
      res.status(500).json({ error: "Error saving user to database" });
    }
  });

  app.put("/api/users/:id", authenticateToken, requireRole('ADMIN'), validateBody(schemas.userUpdate), async (req: any, res) => {
    const { name, role, isActive, managedDoctorIds } = req.body;
    try {
      const idx = mockUsers.findIndex(u => u.id === req.params.id);
      if (idx === -1) return res.status(404).json({ error: "User not found" });
      // IDOR fix: cannot modify users outside own clinic
      if (!assertClinicOwnership(mockUsers[idx].clinic_id, req.user.clinicId)) {
        return res.status(404).json({ error: "User not found" });
      }
      // Self-protection: cannot deactivate or de-role yourself
      if (req.params.id === req.user.id && (isActive === false || (role && role !== req.user.role))) {
        return res.status(400).json({ error: "Cannot change your own role or deactivate yourself" });
      }
      if (name !== undefined) mockUsers[idx].name = name;
      if (role !== undefined) mockUsers[idx].role = role;
      if (isActive !== undefined) mockUsers[idx].is_active = isActive;
      if (managedDoctorIds !== undefined) mockUsers[idx].managed_doctor_ids = managedDoctorIds;
      appendAuditLog(mockAuditLogs, {
        id: "log_" + crypto.randomUUID(), clinic_id: req.user.clinicId, user_id: req.user.id, user_name: req.user.name,
        action: "USER_UPDATE", target: req.params.id, type: "SECURITY",
        details: { name, role, isActive, managedDoctorIds }
      });
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.delete("/api/users/:id", authenticateToken, requireRole('ADMIN'), async (req: any, res) => {
    try {
      // Self-protection: cannot delete yourself
      if (req.params.id === req.user.id) {
        return res.status(400).json({ error: "Cannot delete your own account" });
      }
      const idx = mockUsers.findIndex(u => u.id === req.params.id);
      if (idx === -1) return res.status(404).json({ error: "User not found" });
      // IDOR fix: cannot delete users outside own clinic
      if (!assertClinicOwnership(mockUsers[idx].clinic_id, req.user.clinicId)) {
        return res.status(404).json({ error: "User not found" });
      }
      mockUsers = mockUsers.filter(u => u.id !== req.params.id);
      appendAuditLog(mockAuditLogs, {
        id: "log_" + crypto.randomUUID(), clinic_id: req.user.clinicId, user_id: req.user.id, user_name: req.user.name,
        action: "USER_DELETE", target: req.params.id, type: "SECURITY",
        details: {}
      });
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Patients
  /**
   * @openapi
   * /api/patients:
   *   get:
   *     summary: List all patients for a clinic
   *     tags: [Patients]
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: query
   *         name: clinicId
   *         required: true
   *         schema:
   *           type: string
   *     responses:
   *       200:
   *         description: List of patients
   */
  app.get("/api/patients", authenticateToken, async (req: any, res) => {
    // IDOR fix: clinicId from JWT, ignore query param
    const clinicId = req.user.clinicId;
    const doctorId = req.query.doctorId;
    try {
      let filtered = mockPatients.filter(p => p.clinic_id === clinicId);
      
      if (doctorId) {
        filtered = filtered.filter(p => p.doctor_id === doctorId || p.doctorId === doctorId);
      }

      res.json(filtered.map(p => ({
        ...p,
        dni: decryptPHI(p.dni),
        email: decryptPHI(p.email),
        phone: decryptPHI(p.phone),
        clinicId: p.clinic_id,
        birthDate: decryptPHI(p.birth_date)
      })));
    } catch (err: any) {
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/patients", authenticateToken, validateBody(schemas.patientCreate), async (req: any, res) => {
    const id = "pat_" + crypto.randomUUID();
    const { name, dni, email, phone, birthDate, gender, status } = req.body;
    // IDOR fix: clinicId from JWT
    const clinicId = req.user.clinicId;
    
    try {
      const newPat = { 
        id, 
        name, 
        dni: encryptPHI(dni), 
        email: encryptPHI(email), 
        phone: encryptPHI(phone), 
        birth_date: encryptPHI(birthDate), 
        gender, 
        status, 
        clinic_id: clinicId 
      };
      mockPatients.push(newPat);
      appendAuditLog(mockAuditLogs, {
        id: "log_" + crypto.randomUUID(), clinic_id: clinicId, user_id: req.user.id, user_name: req.user.name,
        action: "PATIENT_CREATE", target: id, type: "PHI",
        details: { name }
      });
      res.json({ 
        ...newPat, 
        dni,
        email,
        phone,
        clinicId: newPat.clinic_id, 
        birthDate
      });
    } catch (err: any) {
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.put("/api/patients/:id", authenticateToken, validateBody(schemas.patientUpdate), async (req: any, res) => {
    const { name, dni, email, phone, birthDate, gender, status } = req.body;
    try {
      const idx = mockPatients.findIndex(p => p.id === req.params.id);
      if (idx === -1) return res.status(404).json({ error: "Patient not found" });
      // IDOR fix: cannot modify patients outside own clinic
      if (!assertClinicOwnership(mockPatients[idx].clinic_id, req.user.clinicId)) {
        return res.status(404).json({ error: "Patient not found" });
      }
      mockPatients[idx] = { 
        ...mockPatients[idx], 
        name: name || mockPatients[idx].name, 
        dni: dni ? encryptPHI(dni) : mockPatients[idx].dni, 
        email: email !== undefined ? encryptPHI(email) : mockPatients[idx].email, 
        phone: phone !== undefined ? encryptPHI(phone) : mockPatients[idx].phone, 
        birth_date: birthDate ? encryptPHI(birthDate) : mockPatients[idx].birth_date, 
        gender: gender || mockPatients[idx].gender, 
        status: status || mockPatients[idx].status 
      };
      appendAuditLog(mockAuditLogs, {
        id: "log_" + crypto.randomUUID(), clinic_id: req.user.clinicId, user_id: req.user.id, user_name: req.user.name,
        action: "PATIENT_UPDATE", target: req.params.id, type: "PHI",
        details: { name, gender, status }
      });
      res.json({
        ...mockPatients[idx],
        dni: decryptPHI(mockPatients[idx].dni),
        email: decryptPHI(mockPatients[idx].email),
        phone: decryptPHI(mockPatients[idx].phone),
        birthDate: decryptPHI(mockPatients[idx].birth_date),
      });
    } catch (err: any) {
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.delete("/api/patients/:id", authenticateToken, async (req: any, res) => {
    try {
      const idx = mockPatients.findIndex(p => p.id === req.params.id);
      if (idx === -1) return res.status(404).json({ error: "Patient not found" });
      // IDOR fix: cannot delete patients outside own clinic
      if (!assertClinicOwnership(mockPatients[idx].clinic_id, req.user.clinicId)) {
        return res.status(404).json({ error: "Patient not found" });
      }
      mockPatients = mockPatients.filter(p => p.id !== req.params.id);
      appendAuditLog(mockAuditLogs, {
        id: "log_" + crypto.randomUUID(), clinic_id: req.user.clinicId, user_id: req.user.id, user_name: req.user.name,
        action: "PATIENT_DELETE", target: req.params.id, type: "PHI",
        details: {}
      });
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.get("/api/patients/:id", authenticateToken, async (req: any, res) => {
    try {
      const p = mockPatients.find(p => p.id === req.params.id);
      if (!p) return res.status(404).json({ error: "Patient not found" });
      // IDOR fix: cannot read patients outside own clinic
      if (!assertClinicOwnership(p.clinic_id, req.user.clinicId)) {
        return res.status(404).json({ error: "Patient not found" });
      }
      res.json({
        ...p,
        dni: decryptPHI(p.dni),
        email: decryptPHI(p.email),
        phone: decryptPHI(p.phone),
        clinicId: p.clinic_id,
        birthDate: decryptPHI(p.birth_date)
      });
    } catch (err: any) {
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Stats
  app.get("/api/stats", authenticateToken, async (req: any, res) => {
    // IDOR fix: clinicId from JWT
    const clinicId = req.user.clinicId;
    try {
      const pCount = mockPatients.filter(p => p.clinic_id === clinicId).length;
      const cCount = mockConsultations.filter(c => c.clinic_id === clinicId).length;
      res.json({
        patients: pCount,
        consultations: cCount,
        appointments: 0,
        alerts: 0
      });
    } catch (err: any) {
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Audit Logs (admin-only read; clients cannot write audit logs anymore)
  /**
   * @openapi
   * /api/audit_logs:
   *   get:
   *     summary: Retrieve clinical audit logs (admin only)
   *     tags: [Audit]
   *     security:
   *       - bearerAuth: []
   *     responses:
   *       200:
   *         description: List of audit logs for the caller's clinic
   */
  app.get("/api/audit_logs", authenticateToken, requireRole('ADMIN'), async (req: any, res) => {
    // IDOR fix: clinicId from JWT
    const clinicId = req.user.clinicId;
    try {
      const filtered = mockAuditLogs.filter(l => l.clinic_id === clinicId).slice(-50).reverse();
      res.json(filtered);
    } catch (err: any) {
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // NOTE: POST /api/audit_logs has been intentionally removed.
  // Audit entries are now created server-side by appendAuditLog() from inside
  // privileged handlers. Allowing clients to write their own audit entries
  // destroyed the integrity of the audit trail (HIPAA violation).

  // Appointments
  app.get("/api/appointments", authenticateToken, async (req: any, res) => {
    // IDOR fix: clinicId from JWT
    const clinicId = req.user.clinicId;
    const doctorId = req.query.doctorId;
    const start = req.query.start;
    const end = req.query.end;
    try {
      const filtered = mockAppointments.filter(a => {
        const matchClinic = a.clinic_id === clinicId;
        const matchDoctor = !doctorId || a.doctor_id === doctorId;
        const apptDate = new Date(a.date_time);
        const matchStart = !start || apptDate >= new Date(start as string);
        const matchEnd = !end || apptDate <= new Date(end as string);
        return matchClinic && matchDoctor && matchStart && matchEnd;
      });
      res.json(filtered);
    } catch (err: any) {
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/appointments", authenticateToken, validateBody(schemas.appointmentCreate), async (req: any, res) => {
    const id = "appt_" + crypto.randomUUID();
    const { patientName, patientId, type, duration, reason, dateTime, doctorId, doctorName } = req.body;
    // IDOR fix: clinicId from JWT
    const clinicId = req.user.clinicId;
    
    try {
      const newAppt = { id, patient_name: patientName, patient_id: patientId, type, duration, reason, date_time: dateTime, clinic_id: clinicId, doctor_id: doctorId, doctor_name: doctorName, created_at: new Date().toISOString() };
      mockAppointments.push(newAppt);
      appendAuditLog(mockAuditLogs, {
        id: "log_" + crypto.randomUUID(), clinic_id: clinicId, user_id: req.user.id, user_name: req.user.name,
        action: "APPOINTMENT_CREATE", target: id, type: "SCHEDULE",
        details: { patientId, doctorId, dateTime }
      });
      res.json(newAppt);
    } catch (err: any) {
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.delete("/api/appointments/:id", authenticateToken, async (req: any, res) => {
    try {
      const idx = mockAppointments.findIndex(a => a.id === req.params.id);
      if (idx === -1) return res.status(404).json({ error: "Appointment not found" });
      // IDOR fix
      if (!assertClinicOwnership(mockAppointments[idx].clinic_id, req.user.clinicId)) {
        return res.status(404).json({ error: "Appointment not found" });
      }
      mockAppointments = mockAppointments.filter(a => a.id !== req.params.id);
      appendAuditLog(mockAuditLogs, {
        id: "log_" + crypto.randomUUID(), clinic_id: req.user.clinicId, user_id: req.user.id, user_name: req.user.name,
        action: "APPOINTMENT_DELETE", target: req.params.id, type: "SCHEDULE",
        details: {}
      });
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Invoices
  app.get("/api/invoices", authenticateToken, async (req: any, res) => {
    // IDOR fix: clinicId from JWT
    const clinicId = req.user.clinicId;
    try {
      const filtered = mockInvoices.filter(i => i.clinic_id === clinicId);
      res.json(filtered.map(i => ({
        ...i,
        clinicId: i.clinic_id,
        patientId: i.patient_id,
        patientName: i.patient_name,
        doctorId: i.doctor_id,
        doctorName: i.doctor_name,
        paymentMethod: i.payment_method,
        insuranceCompany: i.insurance_company,
        createdAt: i.date
      })));
    } catch (err: any) {
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/invoices", authenticateToken, validateBody(schemas.invoiceCreate), async (req: any, res) => {
    const id = "inv_" + crypto.randomUUID();
    const { patientId, patientName, doctorId, doctorName, concept, amount, paymentMethod, status, insuranceCompany, date } = req.body;
    // IDOR fix: clinicId from JWT
    const clinicId = req.user.clinicId;
    
    try {
      const newInv = { id, patient_id: patientId, patient_name: patientName, doctor_id: doctorId, doctor_name: doctorName, concept, amount, payment_method: paymentMethod, status, insurance_company: insuranceCompany, date, clinic_id: clinicId };
      mockInvoices.push(newInv);
      appendAuditLog(mockAuditLogs, {
        id: "log_" + crypto.randomUUID(), clinic_id: clinicId, user_id: req.user.id, user_name: req.user.name,
        action: "INVOICE_CREATE", target: id, type: "FINANCE",
        details: { patientId, amount, paymentMethod }
      });
      res.json({
        ...newInv,
        clinicId: newInv.clinic_id,
        patientId: newInv.patient_id,
        patientName: newInv.patient_name,
        doctorId: newInv.doctor_id,
        doctorName: newInv.doctor_name,
        paymentMethod: newInv.payment_method,
        insuranceCompany: newInv.insurance_company,
        createdAt: newInv.date
      });
    } catch (err: any) {
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Expenses
  app.get("/api/expenses", authenticateToken, async (req: any, res) => {
    // IDOR fix: clinicId from JWT
    const clinicId = req.user.clinicId;
    try {
      const filtered = mockExpenses.filter(e => e.clinic_id === clinicId);
      res.json(filtered);
    } catch (err: any) {
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/expenses", authenticateToken, validateBody(schemas.expenseCreate), async (req: any, res) => {
    const id = "exp_" + crypto.randomUUID();
    const { concept, category, amount, date, registeredBy } = req.body;
    // IDOR fix: clinicId from JWT
    const clinicId = req.user.clinicId;
    
    try {
      const newExp = { id, concept, category, amount, date, clinic_id: clinicId, registered_by: registeredBy, created_at: new Date().toISOString() };
      mockExpenses.push(newExp);
      res.json(newExp);
    } catch (err: any) {
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Consultations
  app.get("/api/patients/:id/consultations", authenticateToken, async (req: any, res) => {
    try {
      // IDOR fix: verify patient belongs to caller's clinic before returning consultations
      const patient = mockPatients.find(p => p.id === req.params.id);
      if (!patient) return res.status(404).json({ error: "Patient not found" });
      if (!assertClinicOwnership(patient.clinic_id, req.user.clinicId)) {
        return res.status(404).json({ error: "Patient not found" });
      }
      const filtered = mockConsultations.filter(c => c.patient_id === req.params.id);
      res.json(filtered);
    } catch (err: any) {
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/patients/:id/consultations", authenticateToken, requireRole('ADMIN', 'DOCTOR'), validateBody(schemas.consultationCreate), async (req: any, res) => {
    const id = "cons_" + crypto.randomUUID();
    const { date, reason, evolution, vital_signs, diagnosis_cie10, prescription, doctorId, doctorName } = req.body;
    // IDOR fix: clinicId from JWT
    const clinicId = req.user.clinicId;
    
    try {
      // Verify patient belongs to caller's clinic
      const patient = mockPatients.find(p => p.id === req.params.id);
      if (!patient) return res.status(404).json({ error: "Patient not found" });
      if (!assertClinicOwnership(patient.clinic_id, clinicId)) {
        return res.status(404).json({ error: "Patient not found" });
      }
      const newCons = { id, patient_id: req.params.id, date, reason, evolution, vital_signs, diagnosis_cie10, prescription, clinic_id: clinicId, doctor_id: doctorId, doctor_name: doctorName };
      mockConsultations.push(newCons);
      appendAuditLog(mockAuditLogs, {
        id: "log_" + crypto.randomUUID(), clinic_id: clinicId, user_id: req.user.id, user_name: req.user.name,
        action: "CONSULTATION_CREATE", target: id, type: "PHI",
        details: { patientId: req.params.id, diagnosis: diagnosis_cie10 }
      });
      res.json(newCons);
    } catch (err: any) {
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // AI Chats
  app.get("/api/ai_chats", authenticateToken, async (req: any, res) => {
    // IDOR fix: clinicId and userId from JWT
    const clinicId = req.user.clinicId;
    const userId = req.user.id;
    try {
      const filtered = mockAiChats.filter(c => c.clinic_id === clinicId && c.user_id === userId);
      res.json(filtered);
    } catch (err: any) {
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/ai_chats", authenticateToken, validateBody(schemas.aiChatCreate), async (req: any, res) => {
    const id = "chat_" + crypto.randomUUID();
    const { title, messages } = req.body;
    // IDOR fix: clinicId and userId from JWT
    const clinicId = req.user.clinicId;
    const userId = req.user.id;
    
    try {
      const newChat = { id, user_id: userId, clinic_id: clinicId, title, messages, created_at: new Date().toISOString(), updated_at: new Date().toISOString() };
      mockAiChats.push(newChat);
      res.json(newChat);
    } catch (err: any) {
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.put("/api/ai_chats/:id", authenticateToken, validateBody(schemas.aiChatUpdate), async (req: any, res) => {
    const { title, messages } = req.body;
    try {
      const idx = mockAiChats.findIndex(c => c.id === req.params.id);
      if (idx === -1) return res.status(404).json({ error: "Chat not found" });
      // IDOR fix
      if (!assertClinicOwnership(mockAiChats[idx].clinic_id, req.user.clinicId) || mockAiChats[idx].user_id !== req.user.id) {
        return res.status(404).json({ error: "Chat not found" });
      }
      if (title !== undefined) mockAiChats[idx].title = title;
      if (messages !== undefined) mockAiChats[idx].messages = messages;
      mockAiChats[idx].updated_at = new Date().toISOString();
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.delete("/api/ai_chats/:id", authenticateToken, async (req: any, res) => {
    try {
      const idx = mockAiChats.findIndex(c => c.id === req.params.id);
      if (idx === -1) return res.status(404).json({ error: "Chat not found" });
      // IDOR fix
      if (!assertClinicOwnership(mockAiChats[idx].clinic_id, req.user.clinicId) || mockAiChats[idx].user_id !== req.user.id) {
        return res.status(404).json({ error: "Chat not found" });
      }
      mockAiChats = mockAiChats.filter(c => c.id !== req.params.id);
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // --- External Payment Gateway (Example: Payphone or Stripe) ---
  const PAYMENT_GATEWAY_TOKEN = env.PAYMENT_GATEWAY_TOKEN;
  const PAYMENT_GATEWAY_URL = env.PAYMENT_GATEWAY_URL; // Example endpoint

  // --- AI Proactive Clinic ---
  app.post("/api/ai/process-consultation", authenticateToken, async (req: any, res: any) => {
    // In a real scenario, we would receive an audio file (multipart/form-data)
    // For this mock, we'll simulate the AI analysis of a consultation
    
    try {
      // Simulate processing delay
      await new Promise(resolve => setTimeout(resolve, 3000));

      // Mock AI Result based on a "generic" consultation
      const aiResult = {
        reason: "Acute abdominal pain and nausea",
        evolution: "Patient reports pain in epigastrium of 24 hours duration, colicky, intensity 7/10. Accompanied by nausea without vomiting. No fever.",
        vital_signs: {
          pulse: "82",
          temp: "37.2",
          bpS: "125",
          bpD: "82",
          weight: "70",
          height: "172",
          saturation: "98",
          respiratoryRate: "18",
          bmi: "23.7"
        },
        diagnosis_cie10: "K30 - Dyspepsia",
        prescription: [
          { medication: "Omeprazole 20mg", dose: "1 capsule", frequency: "Every 24 hours", duration: "7 days" },
          { medication: "Hyoscine 10mg", dose: "1 tablet", frequency: "Every 8 hours", duration: "3 days" }
        ]
      };

      res.json(aiResult);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/payments/create-order", authenticateToken, validateBody(schemas.createOrder), async (req: any, res: any) => {
    const { invoiceId, amount, patientName } = req.body;
    // IDOR fix: clinicId from JWT
    const clinicId = req.user.clinicId;

    // --- TEST MODE IF NO TOKEN ---
    if (!PAYMENT_GATEWAY_TOKEN) {
      console.warn("[payment] PAYMENT_GATEWAY_TOKEN not configured. Using test URL.");
      appendAuditLog(mockAuditLogs, {
        id: "log_" + crypto.randomUUID(), clinic_id: clinicId, user_id: req.user.id, user_name: req.user.name,
        action: "Digital Payment Simulation (No Token)", target: invoiceId, type: "FINANCE",
        details: { amount, invoiceId, note: "Simulation mode activated due to missing credentials" }
      });

      return res.json({
        paymentUrl: "https://www.google.com/search?q=Digital+Payment+Simulation",
        paymentId: "mock_id_123"
      });
    }

    try {
      // Gateway expects amount in cents
      const amountInCents = Math.round(amount * 100);

      // Use FRONTEND_URL from env (not req.get('host')) to prevent Host Header Injection.
      // An attacker could send a malicious Host header to redirect the payment responseUrl
      // to an attacker-controlled domain.
      const baseUrl = env.FRONTEND_URL;

      const payload = {
        amount: amountInCents,
        amountWithoutTax: amountInCents,
        currency: "USD",
        clientTransactionId: invoiceId,
        responseUrl: `${baseUrl}/finance?payment=success`,
        cancellationUrl: `${baseUrl}/finance?payment=cancelled`
      };

      // Add timeout to prevent hanging requests (mitigates slow-loris style abuse
      // and prevents the gateway from holding the connection indefinitely).
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);

      const response = await fetch(PAYMENT_GATEWAY_URL, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${PAYMENT_GATEWAY_TOKEN}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify(payload),
        signal: controller.signal
      }).catch((fetchErr: any) => {
        clearTimeout(timeout);
        if (fetchErr.name === 'AbortError') {
          throw new Error("Payment gateway request timed out after 10s");
        }
        throw new Error(`Payment gateway unreachable: ${fetchErr.message}`);
      });
      clearTimeout(timeout);

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Error creating payment order");
      }

      appendAuditLog(mockAuditLogs, {
        id: "log_" + crypto.randomUUID(), clinic_id: clinicId, user_id: req.user.id, user_name: req.user.name,
        action: "Digital Payment Attempt", target: invoiceId, type: "FINANCE",
        details: { amount, invoiceId, gatewayId: data.paymentId }
      });

      res.json({ paymentUrl: data.paymentUrl, paymentId: data.paymentId });
    } catch (err: any) {
      console.error("[payment] Gateway error:", err.message);
      res.status(500).json({ error: "Payment gateway error" });
    }
  });

  // Webhook for payment confirmation.
  // Verifies HMAC-SHA256 signature over the raw request body using a shared
  // secret (PAYMENT_WEBHOOK_SECRET). This prevents attackers from forging
  // webhook calls to mark invoices as paid without a real payment.
  app.post("/api/webhooks/payment", async (req, res) => {
    // 1. Verify HMAC signature. The signature is computed over the raw body.
    //    We stored req.rawBody via the express.json verify hook below.
    const signatureHeader = req.get('X-Signature') || req.get('X-Payphone-Signature') || '';
    if (!signatureHeader || !env.PAYMENT_WEBHOOK_SECRET) {
      return res.status(401).json({ error: "Missing signature or webhook secret not configured" });
    }

    const rawBody = (req as any).rawBody;
    if (!rawBody) {
      return res.status(400).json({ error: "Raw body required for signature verification" });
    }

    const expectedSignature = crypto
      .createHmac('sha256', env.PAYMENT_WEBHOOK_SECRET)
      .update(rawBody)
      .digest('hex');

    // Constant-time comparison to prevent timing attacks.
    const signatureBuffer = Buffer.from(signatureHeader);
    const expectedBuffer = Buffer.from(expectedSignature);
    if (signatureBuffer.length !== expectedBuffer.length || !crypto.timingSafeEqual(signatureBuffer, expectedBuffer)) {
      return res.status(401).json({ error: "Invalid signature" });
    }

    const { clientTransactionId, transactionId, status } = req.body;

    if (status !== "Approved") {
      return res.status(200).json({ message: "Transaction not approved" });
    }

    try {
      // Idempotency: check if this transaction was already processed
      const alreadyProcessed = mockAuditLogs.some(l =>
        l.action === "Payment received via Digital Gateway" &&
        l.details && l.details.transactionId === transactionId
      );
      if (alreadyProcessed) {
        return res.status(200).json({ message: "Transaction already processed (idempotent)" });
      }

      // 1. Update Invoice status
      const idx = mockInvoices.findIndex(i => i.id === clientTransactionId);
      if (idx === -1) {
        return res.status(404).json({ error: "Invoice not found" });
      }
      mockInvoices[idx].status = "Paid";
      const invoice = mockInvoices[idx];

      // 2. Create Audit Log
      const logId = "log_" + crypto.randomUUID();
      appendAuditLog(mockAuditLogs, {
        id: logId, clinic_id: invoice.clinic_id, user_id: "SYSTEM", user_name: "Payment Gateway Webhook", 
        action: "Payment received via Digital Gateway", target: clientTransactionId, type: "FINANCE", 
        details: { transactionId, invoiceId: clientTransactionId, amount: invoice.amount }
      });

      res.json({ success: true });
    } catch (err: any) {
      console.error("Webhook Error:", err);
      res.status(500).json({ error: err.message });
    }
  });

  // --- Vite Integration ---
  if (env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  const PORT = 3000;
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
  });
}

startServer();
