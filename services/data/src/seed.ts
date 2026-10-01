/**
 * Local development seed: generates a clearly synthetic dataset for one
 * clinic (Riverside Clinic) with staff, patients, appointments, encounters,
 * problems, allergies, medications, observations, threads, invoices,
 * payments and a DSAR request. Runs ONLY against the local database via
 * `npm run db:seed`; never shipped with real data.
 *
 * All names and contacts are obviously synthetic (example.test domains,
 * reserved Swiss-style number ranges).
 */
import "dotenv/config";
import bcrypt from "bcryptjs";
import { prisma, withTenant, Repositories } from "./index.js";

const CLINIC_ID = process.env.SEED_CLINIC_ID ?? "clinic_default";
const CLINIC_NAME = "Riverside Clinic";

const STAFF_PASSWORD = process.env.SEED_PASSWORD ?? "LocalStaff2026x";

const PATIENTS = [
  { name: "Marie Schneider", birth: "1986-02-14", sex: "female", doctor: "keller", id: "756.1234.5678.97" },
  { name: "Thomas Weber", birth: "1982-03-30", sex: "male", doctor: "keller", id: "756.2345.6789.01" },
  { name: "Anna Rossi", birth: "1994-07-19", sex: "female", doctor: "frei", id: "756.3456.7890.12" },
  { name: "Jonas Müller", birth: "1978-11-02", sex: "male", doctor: "frei", id: "756.4567.8901.23" },
  { name: "Emma Dubois", birth: "1990-05-25", sex: "female", doctor: "keller", id: "756.5678.9012.34" },
  { name: "Sophie Martin", birth: "1975-09-08", sex: "female", doctor: "frei", id: "756.6789.0123.45" },
  { name: "Luca Bianchi", birth: "1988-12-17", sex: "male", doctor: "keller", id: "756.7890.1234.56" },
  { name: "Nina Baumann", birth: "1996-04-03", sex: "female", doctor: "frei", id: "756.8901.2345.67" },
];

const PATIENT_PROBLEMS = [
  { code: "I10", display: "Essential (primary) hypertension" },
  { code: "E11", display: "Type 2 diabetes mellitus" },
  { code: "J45", display: "Asthma" },
  { code: "K21", display: "Gastro-esophageal reflux disease" },
];

const APPOINTMENT_TODAY = [
  { patientIdx: 0, hours: 8.5, type: "FOLLOW_UP", reason: "Blood panel review", room: "02", status: "COMPLETED" },
  { patientIdx: 1, hours: 9.25, type: "ANNUAL_CHECKUP", reason: "Annual check-up", room: "02", status: "IN_PROGRESS" },
  { patientIdx: 2, hours: 10.5, type: "NEW_PATIENT", reason: "First consultation", room: "01", status: "CONFIRMED" },
  { patientIdx: 3, hours: 11.25, type: "FOLLOW_UP", reason: "Medication review", room: "01", status: "CONFIRMED" },
  { patientIdx: 4, hours: 13.5, type: "FOLLOW_UP", reason: "Care plan check-in", room: "02", status: "SCHEDULED" },
  { patientIdx: 5, hours: 14.5, type: "PROCEDURE", reason: "Minor procedure", room: "01", status: "SCHEDULED" },
  { patientIdx: 6, hours: 15.5, type: "FOLLOW_UP", reason: "Follow-up", room: "02", status: "SCHEDULED" },
];

async function main(): Promise<void> {
  console.log("Seeding synthetic development data (local only)…");

  // Clinic existence check + optional creation, both inside the clinic's own
  // tenant context (RLS hides rows without it; unique id still applies).
  await withTenant({ clinicId: CLINIC_ID, actorId: "seed", actorRole: "ADMIN" }, async (tx) => {
    const existing = await tx.clinic.findFirst({ where: { id: CLINIC_ID } });
    if (!existing) {
      await tx.clinic.create({
        data: { id: CLINIC_ID, name: CLINIC_NAME, locale: "en-CH", timezone: "Europe/Zurich", currency: "CHF" },
      });
    }
  });

  const staff = [
    { username: "keller", fullName: "Dr. Lara Keller", role: "DOCTOR" },
    { username: "frei", fullName: "Dr. Milan Frei", role: "DOCTOR" },
    { username: "brunner", fullName: "Elena Brunner", role: "SECRETARY" },
  ];

  const staffIds: Record<string, string> = {};
  for (const member of staff) {
    const created = await withTenant({ clinicId: CLINIC_ID, actorId: "seed", actorRole: "ADMIN" }, async (tx) => {
      const existing = await tx.user.findFirst({ where: { clinicId: CLINIC_ID, username: member.username } });
      if (existing) return existing;
      return tx.user.create({
        data: {
          clinicId: CLINIC_ID,
          username: member.username,
          passwordHash: bcrypt.hashSync(STAFF_PASSWORD, 12),
          fullName: member.fullName,
          role: member.role as never,
        },
      });
    });
    staffIds[member.username] = created.id;
  }

  await withTenant({ clinicId: CLINIC_ID, actorId: "seed", actorRole: "ADMIN" }, async (tx) => {
    const repos = new Repositories(tx);

    // availability rules Mon-Fri 08:00-17:00 for both doctors
    for (const username of ["keller", "frei"]) {
      for (const weekday of [1, 2, 3, 4, 5]) {
        await repos.scheduling.setAvailabilityRule(CLINIC_ID, {
          doctorId: staffIds[username],
          weekday,
          startMinute: 8 * 60,
          endMinute: 17 * 60,
        });
      }
    }

    // payer
    const payer = await tx.payer.upsert({
      where: { clinicId_name: { clinicId: CLINIC_ID, name: "Sanitas AG" } },
      create: { clinicId: CLINIC_ID, name: "Sanitas AG", type: "INSURANCE" },
      update: {},
    });

    const patientIds: string[] = [];
    for (const p of PATIENTS) {
      const created = await repos.patients.create(CLINIC_ID, {
        fullName: p.name,
        birthDate: p.birth,
        sex: p.sex as "female" | "male" | "other" | "unknown",
        phone: `+41 79 000 ${String(10 + PATIENTS.indexOf(p)).padStart(2, "0")}`,
        email: `${p.name.split(" ")[0].toLowerCase()}@example.test`,
        primaryDoctorId: staffIds[p.doctor],
        defaultPayerId: payer.id,
        identifiers: [{ type: "NATIONAL_ID", value: p.id, isPrimary: true }],
      });
      patientIds.push(created.id);
    }

    // clinical context per patient
    for (let i = 0; i < PATIENTS.length; i += 1) {
      const patientId = patientIds[i];
      await repos.patients.upsertConsent(CLINIC_ID, patientId, {
        type: "TREATMENT",
        status: "GRANTED",
        recordedById: staffIds.keller,
      });
      if (i % 3 === 0) {
        await repos.patients.upsertConsent(CLINIC_ID, patientId, {
          type: "AI_PROCESSING",
          status: i === 3 ? "REFUSED" : "GRANTED",
          recordedById: staffIds.keller,
        });
      }
      const problem = PATIENT_PROBLEMS[i % PATIENT_PROBLEMS.length];
      await repos.clinical.addProblem(
        { tenantId: CLINIC_ID, actorId: staffIds.keller },
        { patientId, codingSystem: "ICD_10", code: problem.code, display: problem.display, onsetDate: "2026-06-04" },
      );
      if (i === 1 || i === 5) {
        await repos.clinical.addAllergy(
          { tenantId: CLINIC_ID, actorId: staffIds.keller },
          { patientId, substance: "Penicillin", reaction: "Rash", severity: i === 1 ? "SEVERE" : "MODERATE" },
        );
      }
      if (i % 2 === 0) {
        const med = await repos.clinical.addMedicationOrder(
          { tenantId: CLINIC_ID, actorId: staffIds.keller },
          { patientId, medicationName: "Amlodipine", dose: "5 mg", frequency: "once daily", durationDays: 30 },
        );
        await repos.clinical.setMedicationStatus(CLINIC_ID, med.id, "ACTIVE", staffIds.keller);
      }
    }

    // today's appointments
    const now = new Date();
    const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    for (const appt of APPOINTMENT_TODAY) {
      const start = new Date(dayStart.getTime() + appt.hours * 3600 * 1000);
      const doctor = appt.room === "01" ? staffIds.frei : staffIds.keller;
      const created = await repos.scheduling.create(CLINIC_ID, {
        patientId: patientIds[appt.patientIdx],
        doctorId: doctor,
        type: appt.type as never,
        startTime: start.toISOString(),
        durationMinutes: 30,
        reason: appt.reason,
        room: appt.room,
      });
      await repos.scheduling.setStatus(CLINIC_ID, created.id, appt.status);
    }

    // past encounters: one signed for patient 0 yesterday
    const yesterday = new Date(now.getTime() - 24 * 3600 * 1000);
    const signedEncounter = await repos.clinical.create(
      { tenantId: CLINIC_ID, actorId: staffIds.keller },
      {
        patientId: patientIds[0],
        title: "Follow-up hypertension",
        chiefComplaint: "Blood pressure control review",
        observations: "Patient stable, reports no symptoms. BP 138/86, pulse 78.",
        plan: "Continue current medication; repeat blood panel in 3 months.",
      },
    );
    // backdate + sign
    await tx.encounter.update({
      where: { id: signedEncounter.id },
      data: { createdAt: yesterday, updatedAt: yesterday },
    });
    await repos.clinical.transition({ tenantId: CLINIC_ID, actorId: staffIds.keller }, signedEncounter.id, "SIGNED");
    await repos.clinical.addObservation(
      { tenantId: CLINIC_ID, actorId: staffIds.keller },
      { patientId: patientIds[0], encounterId: signedEncounter.id, type: "PULSE", loincCode: "8867-4", value: "78", unit: "bpm" },
    );
    await repos.clinical.addObservation(
      { tenantId: CLINIC_ID, actorId: staffIds.keller },
      { patientId: patientIds[0], encounterId: signedEncounter.id, type: "BP_SYSTOLIC", loincCode: "8480-6", value: "138", unit: "mmHg" },
    );

    // a draft encounter for patient 1 (the "in progress" appointment)
    const draft = await repos.clinical.create(
      { tenantId: CLINIC_ID, actorId: staffIds.keller },
      {
        patientId: patientIds[1],
        title: "Annual check-up",
        chiefComplaint: "Routine annual check-up.",
        observations: "Blood pressure and vital signs captured during consultation.",
        plan: "Review laboratory results when available.",
      },
    );
    void draft;

    // pending lab results (observations without encounter) for patient 0
    await repos.clinical.addObservation(
      { tenantId: CLINIC_ID, actorId: staffIds.keller },
      { patientId: patientIds[0], type: "CUSTOM", value: "HbA1c 5.4%", unit: "%" },
    );

    // messages
    const thread = await repos.messaging.createThread(
      { tenantId: CLINIC_ID, actorId: staffIds.brunner },
      {
        subject: "Blood test tomorrow",
        category: "PATIENT",
        patientId: patientIds[0],
        participantIds: [staffIds.keller],
        body: "Marie asked whether fasting is required for tomorrow's blood panel.",
      },
    );
    await repos.messaging.addMessage({ tenantId: CLINIC_ID, actorId: staffIds.keller }, thread.id, "Yes - fasting 12 hours before the lipid panel.");

    // billing
    const invoice1 = await repos.billing.createInvoice({ tenantId: CLINIC_ID }, {
      patientId: patientIds[0],
      payerId: payer.id,
      dueInDays: 30,
      items: [{ description: "Consultation 30 min", quantity: 1, unitPrice: 120 }],
    });
    await repos.billing.addPayment({ tenantId: CLINIC_ID, actorId: staffIds.brunner }, invoice1.id, {
      amount: 120,
      method: "CARD",
    });
    await repos.billing.createInvoice({ tenantId: CLINIC_ID }, {
      patientId: patientIds[2],
      payerId: payer.id,
      dueInDays: 14,
      items: [
        { description: "First consultation", quantity: 1, unitPrice: 160 },
        { description: "Lab panel", quantity: 1, unitPrice: 95.5 },
      ],
    });
    await repos.billing.addExpense({ tenantId: CLINIC_ID, actorId: staffIds.brunner }, {
      category: "Supplies",
      description: "Gloves and disposables",
      amount: 240.1,
    });

    // a DSAR
    await repos.dsar.create(
      { tenantId: CLINIC_ID, actorId: staffIds.brunner },
      { patientId: patientIds[3], type: "EXPORT", dueInDays: 30, details: "Patient requested a copy of his record by letter." },
    );
  });

  console.log("Seed complete.");
  console.log(`  clinic: ${CLINIC_NAME} (${CLINIC_ID})`);
  console.log(`  staff: keller/frei (doctors), brunner (secretary) - password: ${STAFF_PASSWORD}`);
  console.log(`  patients: ${PATIENTS.length} synthetic records`);
  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error("Seed failed:", err);
  await prisma.$disconnect();
  process.exit(1);
});
