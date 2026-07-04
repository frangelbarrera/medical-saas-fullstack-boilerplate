/**
 * Admin routes: /api/admin/populate (synthetic test data)
 */
import { Router } from "express";
import { AuthenticatedRequest, authenticateToken, requireRole } from "../middleware/auth.js";
import { mockUsers, mockPatients, mockAppointments, mockConsultations } from "../config.js";
import { encryptPHI, generateRandomId } from "../utils/crypto.js";
import { appendAuditLog } from "../utils/audit.js";

export const adminRouter = Router();

adminRouter.post("/api/admin/populate", authenticateToken, requireRole("ADMIN"), (req: AuthenticatedRequest, res) => {
  const clinicId = req.user!.clinicId; // IDOR fix: from JWT

  // SECURITY: cap the total number of patients per clinic to prevent OOM via
  // repeated populate calls. 1000 is generous for a boilerplate; production
  // should raise this or remove the endpoint entirely.
  const MAX_PATIENTS_PER_CLINIC = 1000;
  const existingCount = mockPatients.filter((p) => p.clinic_id === clinicId).length;
  if (existingCount >= MAX_PATIENTS_PER_CLINIC) {
    return res.status(429).json({
      error: `Cannot populate: clinic already has ${existingCount} patients (max ${MAX_PATIENTS_PER_CLINIC}). Delete test data before populating again.`,
    });
  }

  const numPatients = 10;
  const firstNames = [
    "James",
    "Maria",
    "Robert",
    "Linda",
    "Michael",
    "Patricia",
    "William",
    "Barbara",
    "David",
    "Susan",
    "Thomas",
    "Jessica",
    "Sarah",
    "Karen",
    "Nancy",
    "Lisa",
  ];
  const lastNames = [
    "Smith",
    "Johnson",
    "Williams",
    "Brown",
    "Jones",
    "Garcia",
    "Miller",
    "Davis",
    "Rodriguez",
    "Martinez",
    "Hernandez",
    "Lopez",
    "Gonzalez",
    "Wilson",
    "Anderson",
    "Thomas",
  ];

  const activeDoctors = mockUsers.filter((u) => u.role === "DOCTOR" && u.clinic_id === clinicId);
  if (!activeDoctors.length) {
    activeDoctors.push({ id: "doc_mock_1", name: "Dr. Virtual", clinic_id: clinicId });
  }

  const today = new Date();
  const todayStr = today.toISOString().split("T")[0];

  for (let i = 0; i < numPatients; i++) {
    const id = "pat_mock_" + crypto.randomUUID();
    const name = `${firstNames[Math.floor(Math.random() * firstNames.length)]} ${lastNames[Math.floor(Math.random() * lastNames.length)]}`;
    const doctor = activeDoctors[i % activeDoctors.length];

    mockPatients.push({
      id,
      name,
      dni: encryptPHI(`09${Math.floor(10000000 + Math.random() * 90000000)}`),
      email: encryptPHI(`${name.split(" ")[0].toLowerCase()}@test.com`),
      phone: encryptPHI(`099${Math.floor(1000000 + Math.random() * 9000000)}`),
      birth_date: encryptPHI(
        new Date(1960 + Math.floor(Math.random() * 40), Math.floor(Math.random() * 12), Math.floor(Math.random() * 28))
          .toISOString()
          .split("T")[0],
      ),
      gender: Math.random() > 0.5 ? "M" : "F",
      status: "Active",
      clinic_id: clinicId,
      doctorId: doctor.id,
      doctorName: doctor.name,
      isVolatile: true,
    });

    const hour = 8 + Math.floor(Math.random() * 8);
    const mins = Math.random() > 0.5 ? "00" : "30";
    const apptDate = new Date(`${todayStr}T${hour.toString().padStart(2, "0")}:${mins}:00`);

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
      isVolatile: true,
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
      vital_signs: { bp: "120/80", hr: "72", temp: "36.5", weight: "70", o2: "98" },
      diagnosis_cie10: "Z00.0 - General medical examination",
      prescription: "Continue healthy lifestyle",
      clinic_id: clinicId,
      doctor_id: doctor.id,
      doctor_name: doctor.name,
      isVolatile: true,
    });
  }

  appendAuditLog({
    id: generateRandomId("log"),
    clinic_id: clinicId,
    user_id: req.user!.id,
    user_name: req.user!.name,
    action: "POPULATE_TEST_DATA",
    target: clinicId,
    type: "ADMIN",
    details: { numPatients },
  });

  res.json({ success: true, message: "Database populated successfully" });
});
