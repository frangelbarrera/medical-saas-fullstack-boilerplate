/**
 * Zod schemas for request body validation.
 *
 * NOTE: clinicId fields are marked optional because the server takes clinicId
 * from the JWT (req.user.clinicId), never from the request body. The fields
 * are kept optional for backwards compatibility with existing API clients.
 */
import { z } from "zod";

export const schemas = {
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
    email: z.string().email().optional().or(z.literal("")),
    phone: z.string().optional().or(z.literal("")),
    birthDate: z.string(),
    gender: z.string(),
    status: z.string(),
    clinicId: z.string().optional(), // ignored, taken from JWT
  }),
  patientUpdate: z.object({
    name: z.string().optional(),
    dni: z.string().optional(),
    email: z.string().email().optional().or(z.literal("")),
    phone: z.string().optional().or(z.literal("")),
    birthDate: z.string().optional(),
    gender: z.string().optional(),
    status: z.string().optional(),
  }),
  appointmentCreate: z.object({
    patientName: z.string(),
    patientId: z.string(),
    type: z.string(),
    duration: z.number().int().positive(),
    reason: z.string().optional().or(z.literal("")),
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
    insuranceCompany: z.string().optional().or(z.literal("")),
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
  aiChatCreate: z.object({
    userId: z.string().optional(), // ignored, taken from JWT
    clinicId: z.string().optional(), // ignored, taken from JWT
    title: z.string(),
    messages: z.array(z.any()),
  }),
  aiChatUpdate: z.object({
    title: z.string().optional(),
    messages: z.array(z.any()).optional(),
  }),
  createOrder: z.object({
    invoiceId: z.string().min(1).max(100),
    // amount is ignored server-side (taken from the invoice record), but kept
    // optional for backwards compatibility with existing API clients.
    amount: z.number().finite().positive().optional(),
    patientName: z.string().min(1).max(255),
    clinicId: z.string().optional(), // ignored, taken from JWT
  }),
} as const;

export type Schemas = typeof schemas;
