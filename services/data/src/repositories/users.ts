/**
 * User & clinic repository. Staff management and clinic settings.
 */
import bcrypt from "bcryptjs";
import type { Tx } from "../client.js";

export interface UserRecord {
  id: string;
  username: string;
  passwordHash: string;
  fullName: string;
  role: string;
  isActive: boolean;
  clinicId: string;
  patientId: string | null;
}

export class UserRepository {
  constructor(private tx: Tx) {}

  /**
   * Login lookup: enables the pre-tenant auth path. ONLY the login flow may
   * call this - the RLS bypass `app.auth_lookup` must be set by the caller.
   */
  async findByUsernameForLogin(username: string): Promise<UserRecord | null> {
    const u = await this.tx.user.findFirst({
      where: { username: { equals: username, mode: "insensitive" } },
    });
    return u ? this.toRecord(u) : null;
  }

  async findById(clinicId: string, id: string): Promise<UserRecord | null> {
    const u = await this.tx.user.findFirst({ where: { clinicId, id } });
    return u ? this.toRecord(u) : null;
  }

  async list(clinicId: string): Promise<UserRecord[]> {
    const users = await this.tx.user.findMany({ where: { clinicId }, orderBy: { fullName: "asc" } });
    return users.map((u) => this.toRecord(u));
  }

  async listDoctors(clinicId: string): Promise<UserRecord[]> {
    const users = await this.tx.user.findMany({
      where: { clinicId, role: "DOCTOR", isActive: true },
      orderBy: { fullName: "asc" },
    });
    return users.map((u) => this.toRecord(u));
  }

  async create(
    clinicId: string,
    input: { username: string; password: string; fullName: string; role: string },
  ): Promise<UserRecord> {
    const u = await this.tx.user.create({
      data: {
        clinicId,
        username: input.username.toLowerCase(),
        passwordHash: bcrypt.hashSync(input.password, 12),
        fullName: input.fullName.trim(),
        role: input.role as never,
      },
    });
    return this.toRecord(u);
  }

  async update(
    clinicId: string,
    id: string,
    input: { fullName?: string; role?: string; isActive?: boolean; password?: string },
  ): Promise<UserRecord | null> {
    const existing = await this.tx.user.findFirst({ where: { clinicId, id } });
    if (!existing) return null;
    const u = await this.tx.user.update({
      where: { id },
      data: {
        ...(input.fullName !== undefined ? { fullName: input.fullName.trim() } : {}),
        ...(input.role !== undefined ? { role: input.role as never } : {}),
        ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
        ...(input.password !== undefined ? { passwordHash: bcrypt.hashSync(input.password, 12) } : {}),
      },
    });
    return this.toRecord(u);
  }

  async countAdmins(clinicId: string, excludeId?: string): Promise<number> {
    return this.tx.user.count({
      where: { clinicId, role: "ADMIN", isActive: true, ...(excludeId ? { id: { not: excludeId } } : {}) },
    });
  }

  async updatePassword(id: string, newPassword: string): Promise<void> {
    await this.tx.user.update({
      where: { id },
      data: { passwordHash: bcrypt.hashSync(newPassword, 12) },
    });
  }

  async verifyPassword(record: UserRecord, password: string): Promise<boolean> {
    return bcrypt.compare(password, record.passwordHash);
  }

  private toRecord(u: {
    id: string;
    username: string;
    passwordHash: string;
    fullName: string;
    role: string;
    isActive: boolean;
    clinicId: string;
    patientId: string | null;
  }): UserRecord {
    return {
      id: u.id,
      username: u.username,
      passwordHash: u.passwordHash,
      fullName: u.fullName,
      role: u.role,
      isActive: u.isActive,
      clinicId: u.clinicId,
      patientId: u.patientId,
    };
  }
}

export class ClinicRepository {
  constructor(private tx: Tx) {}

  async findById(clinicId: string) {
    return this.tx.clinic.findFirst({ where: { id: clinicId } });
  }

  async update(
    clinicId: string,
    input: Partial<{
      name: string;
      address: string;
      phone: string;
      email: string;
      locale: string;
      timezone: string;
      currency: string;
      retentionYears: number;
    }>,
  ) {
    return this.tx.clinic.update({ where: { id: clinicId }, data: input });
  }

  async createPayer(clinicId: string, name: string, type: string) {
    return this.tx.payer.create({ data: { clinicId, name: name.trim(), type } });
  }

  async listPayers(clinicId: string) {
    return this.tx.payer.findMany({ where: { clinicId }, orderBy: { name: "asc" } });
  }

  /** Bootstrap the first admin for a fresh clinic (DB mode). */
  async bootstrapAdmin(
    clinicId: string,
    clinicName: string,
    username: string,
    password: string,
    fullName: string,
  ): Promise<UserRecord | null> {
    const existingClinic = await this.tx.clinic.findUnique({ where: { id: clinicId } });
    if (!existingClinic) {
      await this.tx.clinic.create({
        data: { id: clinicId, name: clinicName, ownerId: null },
      });
    }
    const existing = await this.tx.user.findFirst({ where: { username: username.toLowerCase() } });
    if (existing) return null;
    const u = await this.tx.user.create({
      data: {
        clinicId,
        username: username.toLowerCase(),
        passwordHash: bcrypt.hashSync(password, 12),
        fullName,
        role: "ADMIN",
      },
    });
    await this.tx.clinic.update({ where: { id: clinicId }, data: { ownerId: u.id } });
    return {
      id: u.id,
      username: u.username,
      passwordHash: u.passwordHash,
      fullName: u.fullName,
      role: u.role,
      isActive: u.isActive,
      clinicId: u.clinicId,
      patientId: u.patientId,
    };
  }
}
