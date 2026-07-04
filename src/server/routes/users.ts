/**
 * User management routes (admin only for write; admin+doctor+secretary for read).
 *
 * Self-protection: a user cannot delete their own account, change their own role,
 * or deactivate themselves.
 */
import { Router } from "express";
import bcrypt from "bcryptjs";
import { AuthenticatedRequest, authenticateToken, requireRole, assertClinicOwnership } from "../middleware/auth.js";
import { validateBody } from "../middleware/validate.js";
import { schemas } from "../schemas/index.js";
import { mockUsers } from "../config.js";
import { generateRandomId } from "../utils/crypto.js";
import { appendAuditLog } from "../utils/audit.js";

export const usersRouter = Router();

usersRouter.get(
  "/api/users",
  authenticateToken,
  requireRole("ADMIN", "DOCTOR", "SECRETARY"),
  async (req: AuthenticatedRequest, res) => {
    const clinicId = req.user!.clinicId; // IDOR fix: from JWT
    const role = req.query.role as string | undefined;
    try {
      let filtered = mockUsers.filter((u) => u.clinic_id === clinicId);
      if (role) {
        filtered = filtered.filter((u) => u.role === role);
      }
      // Whitelist fields: never expose password hash
      res.json(
        filtered.map((u: any) => ({
          id: u.id,
          username: u.username,
          name: u.name,
          role: u.role,
          clinicId: u.clinic_id,
          isActive: u.is_active,
          managedDoctorIds: u.managed_doctor_ids,
        })),
      );
    } catch (err: any) {
      res.status(500).json({ error: "Internal server error" });
    }
  },
);

usersRouter.post(
  "/api/users",
  authenticateToken,
  requireRole("ADMIN"),
  validateBody(schemas.userCreate),
  async (req: AuthenticatedRequest, res) => {
    const { name, username, password, role } = req.body;
    const clinicId = req.user!.clinicId; // IDOR fix
    const allowedRoles = ["ADMIN", "DOCTOR", "SECRETARY"];
    if (!allowedRoles.includes(role)) {
      return res.status(400).json({ error: `Invalid role. Allowed: ${allowedRoles.join(", ")}` });
    }
    const hashedPassword = bcrypt.hashSync(password, 12);
    const id = generateRandomId("user");

    try {
      const newUser = {
        id,
        username,
        password: hashedPassword,
        name,
        role,
        clinic_id: clinicId,
        is_active: true,
        managed_doctor_ids: [],
      };
      mockUsers.push(newUser);
      appendAuditLog({
        id: generateRandomId("log"),
        clinic_id: clinicId,
        user_id: req.user!.id,
        user_name: req.user!.name,
        action: "USER_CREATE",
        target: id,
        type: "SECURITY",
        details: { username, role },
      });
      res.json({ id, name, role, clinicId });
    } catch (error: any) {
      res.status(500).json({ error: "Error saving user to database" });
    }
  },
);

usersRouter.put(
  "/api/users/:id",
  authenticateToken,
  requireRole("ADMIN"),
  validateBody(schemas.userUpdate),
  async (req: AuthenticatedRequest, res) => {
    const { name, role, isActive, managedDoctorIds } = req.body;
    try {
      const idx = mockUsers.findIndex((u) => u.id === req.params.id);
      if (idx === -1) return res.status(404).json({ error: "User not found" });
      if (!assertClinicOwnership(mockUsers[idx].clinic_id, req.user!.clinicId)) {
        return res.status(404).json({ error: "User not found" });
      }
      if (req.params.id === req.user!.id && (isActive === false || (role && role !== req.user!.role))) {
        return res.status(400).json({ error: "Cannot change your own role or deactivate yourself" });
      }
      if (name !== undefined) mockUsers[idx].name = name;
      if (role !== undefined) mockUsers[idx].role = role;
      if (isActive !== undefined) mockUsers[idx].is_active = isActive;
      if (managedDoctorIds !== undefined) mockUsers[idx].managed_doctor_ids = managedDoctorIds;
      appendAuditLog({
        id: generateRandomId("log"),
        clinic_id: req.user!.clinicId,
        user_id: req.user!.id,
        user_name: req.user!.name,
        action: "USER_UPDATE",
        target: req.params.id,
        type: "SECURITY",
        details: { name, role, isActive, managedDoctorIds },
      });
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: "Internal server error" });
    }
  },
);

usersRouter.delete(
  "/api/users/:id",
  authenticateToken,
  requireRole("ADMIN"),
  async (req: AuthenticatedRequest, res) => {
    try {
      if (req.params.id === req.user!.id) {
        return res.status(400).json({ error: "Cannot delete your own account" });
      }
      const idx = mockUsers.findIndex((u) => u.id === req.params.id);
      if (idx === -1) return res.status(404).json({ error: "User not found" });
      if (!assertClinicOwnership(mockUsers[idx].clinic_id, req.user!.clinicId)) {
        return res.status(404).json({ error: "User not found" });
      }
      mockUsers.splice(idx, 1);
      appendAuditLog({
        id: generateRandomId("log"),
        clinic_id: req.user!.clinicId,
        user_id: req.user!.id,
        user_name: req.user!.name,
        action: "USER_DELETE",
        target: req.params.id,
        type: "SECURITY",
        details: {},
      });
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: "Internal server error" });
    }
  },
);
