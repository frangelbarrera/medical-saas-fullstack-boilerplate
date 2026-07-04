import React, { useState, useEffect } from "react";
import { toast } from "sonner";
import { api } from "../lib/api";
import { useAuth } from "../App";
import { Ico } from "./Ico";
import { GCard } from "./GCard";
import { accent, accentB, danger, text1, text2, text3, glass } from "../theme";

interface SystemUser {
  id: string;
  username: string;
  name: string;
  email?: string;
  role: "DOCTOR" | "SECRETARY" | "ADMIN";
  managedDoctorIds?: string[];
  isActive?: boolean;
}

export const AdminUsersView: React.FC = () => {
  const { clinicId } = useAuth();
  const [activeTab, setActiveTab] = useState<"users" | "whitelist">("users");
  const [users, setUsers] = useState<SystemUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [showUserModal, setShowUserModal] = useState(false);
  const [showNewLegacyModal, setShowNewLegacyModal] = useState(false);
  const [editingUser, setEditingUser] = useState<SystemUser | null>(null);
  const [newLegacy, setNewLegacy] = useState({ name: "", username: "", password: "", role: "SECRETARY" as const });

  const fetchUsers = async () => {
    if (!clinicId) return;
    try {
      const list = await api.users.list(clinicId);
      setUsers(list);
    } catch (error) {
      console.error("Error fetching users:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
    const interval = setInterval(fetchUsers, 10000);
    return () => clearInterval(interval);
  }, [clinicId]);

  const handleToggleActive = async (user: SystemUser) => {
    try {
      await api.users.update(user.id, {
        isActive: !user.isActive,
      });
      await fetchUsers();
    } catch (error) {
      console.error("Error toggling user status:", error);
    }
  };

  const handleSaveUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUser) return;
    try {
      await api.users.update(editingUser.id, {
        name: editingUser.name,
        role: editingUser.role,
        managedDoctorIds: editingUser.managedDoctorIds || [],
      });
      setShowUserModal(false);
      await fetchUsers();
    } catch (error) {
      console.error("Error updating user:", error);
    }
  };

  const handleAddLegacyUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newLegacy.name || !newLegacy.username || !newLegacy.password || !clinicId) return;
    setLoading(true);

    try {
      await api.users.create({
        ...newLegacy,
        clinicId,
      });

      setNewLegacy({ name: "", username: "", password: "", role: "SECRETARY" });
      setShowNewLegacyModal(false);
      await fetchUsers();
      toast.success("User created successfully.");
    } catch (error: any) {
      console.error("Error creating user:", error);
      toast.error(error.message || "Error creating user.");
    } finally {
      setLoading(false);
    }
  };

  const doctors = users.filter((u) => u.role === "DOCTOR");
  const secretaries = users.filter((u) => u.role === "SECRETARY");
  const admins = users.filter((u) => u.role === "ADMIN");

  const renderUserRow = (user: SystemUser) => (
    <div
      key={user.id}
      style={{
        display: "grid",
        gridTemplateColumns: "1fr 1fr 100px 120px 80px",
        alignItems: "center",
        padding: "16px 24px",
        borderBottom: `1px solid ${glass.border}44`,
        background: "rgba(255,255,255,0.01)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <div
          style={{
            width: 32,
            height: 32,
            borderRadius: 8,
            background: user.role === "DOCTOR" ? accent + "22" : user.role === "ADMIN" ? danger + "22" : accentB + "22",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Ico
            name={user.role === "DOCTOR" ? "UserRound" : user.role === "ADMIN" ? "Shield" : "UserCircle"}
            size={14}
            color={user.role === "DOCTOR" ? accent : user.role === "ADMIN" ? danger : accentB}
          />
        </div>
        <div>
          <p style={{ fontSize: 13, fontWeight: 700, color: text1 }}>{user.name}</p>
          <p style={{ fontSize: 11, color: text3 }}>{user.username}</p>
        </div>
      </div>
      <div style={{ fontSize: 11, color: text2 }}>
        {user.role === "SECRETARY" && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
            {user.managedDoctorIds && user.managedDoctorIds.length > 0 ? (
              user.managedDoctorIds.map((id) => {
                const doc = doctors.find((d) => d.id === id);
                return (
                  <span
                    key={id}
                    style={{ padding: "2px 6px", borderRadius: 4, background: "rgba(255,255,255,0.05)", fontSize: 9 }}
                  >
                    {doc?.name || "Doctor"}
                  </span>
                );
              })
            ) : (
              <span style={{ opacity: 0.5 }}>No doctors assigned</span>
            )}
          </div>
        )}
        {user.role === "DOCTOR" && <span style={{ opacity: 0.7 }}>System doctor</span>}
        {user.role === "ADMIN" && <span style={{ color: danger, fontWeight: 600 }}>Total Access</span>}
      </div>
      <div
        style={{
          fontSize: 10,
          fontWeight: 800,
          color: user.isActive !== false ? "#10b981" : danger,
          textTransform: "uppercase",
        }}
      >
        {user.isActive !== false ? "Active" : "Inactive"}
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <button
          onClick={() => {
            setEditingUser(user);
            setShowUserModal(true);
          }}
          style={{ background: "none", border: "none", cursor: "pointer", padding: 6, borderRadius: 6 }}
          onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.05)")}
          onMouseLeave={(e) => (e.currentTarget.style.background = "none")}
        >
          <Ico name="Edit3" size={14} color={text2} />
        </button>
        <button
          onClick={() => handleToggleActive(user)}
          style={{ background: "none", border: "none", cursor: "pointer", padding: 6, borderRadius: 6 }}
          onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.05)")}
          onMouseLeave={(e) => (e.currentTarget.style.background = "none")}
        >
          <Ico
            name={user.isActive !== false ? "UserX" : "UserCheck"}
            size={14}
            color={user.isActive !== false ? danger : "#10b981"}
          />
        </button>
      </div>
      <div style={{ textAlign: "right" }}>
        <div
          style={{
            width: 6,
            height: 6,
            borderRadius: "50%",
            background: "#10b981",
            display: "inline-block",
            boxShadow: "0 0 8px #10b98188",
          }}
          title="Connected"
        />
      </div>
    </div>
  );

  return (
    <div style={{ height: "100%", padding: 32, overflowY: "auto" }}>
      <div style={{ maxWidth: 1000, margin: "0 auto" }}>
        <header style={{ marginBottom: 32, display: "flex", alignItems: "flex-end", justifyContent: "space-between" }}>
          <div>
            <h1 style={{ fontSize: 32, fontWeight: 900, color: text1, letterSpacing: "-0.04em" }}>System Users</h1>
            <p style={{ color: text2, fontSize: 14, marginTop: 4 }}>
              Manage staff, roles, and access permissions for the clinic.
            </p>
          </div>
          <div style={{ display: "flex", gap: 12 }}>
            {activeTab === "users" && (
              <button
                onClick={() => setShowNewLegacyModal(true)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "8px 16px",
                  borderRadius: 10,
                  background: accent,
                  color: "#1a0e00",
                  fontWeight: 700,
                  border: "none",
                  cursor: "pointer",
                  fontSize: 12,
                }}
              >
                <Ico name="UserPlus" size={14} /> New User
              </button>
            )}
            <div
              style={{
                display: "flex",
                background: glass.nav,
                padding: 4,
                borderRadius: 12,
                border: `1px solid ${glass.border}`,
              }}
            >
              <button
                onClick={() => setActiveTab("users")}
                style={{
                  padding: "8px 16px",
                  borderRadius: 8,
                  border: "none",
                  cursor: "pointer",
                  fontSize: 12,
                  fontWeight: 700,
                  background: activeTab === "users" ? accent : "transparent",
                  color: activeTab === "users" ? "#1a0e00" : text2,
                  transition: "all 0.2s",
                }}
              >
                Staff
              </button>
              <button
                onClick={() => setActiveTab("whitelist")}
                style={{
                  padding: "8px 16px",
                  borderRadius: 8,
                  border: "none",
                  cursor: "pointer",
                  fontSize: 12,
                  fontWeight: 700,
                  background: activeTab === "whitelist" ? accent : "transparent",
                  color: activeTab === "whitelist" ? "#1a0e00" : text2,
                  transition: "all 0.2s",
                }}
              >
                Whitelist
              </button>
            </div>
          </div>
        </header>

        {activeTab === "users" ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
            <GCard style={{ padding: 0, overflow: "hidden" }}>
              <div
                style={{
                  padding: "16px 24px",
                  borderBottom: `1px solid ${glass.border}`,
                  background: "rgba(255,255,255,0.02)",
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr 100px 120px 80px",
                  fontSize: 10,
                  fontWeight: 800,
                  color: text3,
                  textTransform: "uppercase",
                  letterSpacing: "0.05em",
                }}
              >
                <span>User</span>
                <span>Assignment / Permissions</span>
                <span>Status</span>
                <span>Actions</span>
                <span style={{ textAlign: "right" }}>Link</span>
              </div>
              <div style={{ maxHeight: 600, overflowY: "auto" }}>
                {loading ? (
                  <div style={{ padding: 40, textAlign: "center", color: text3 }}>Loading staff...</div>
                ) : (
                  <>
                    <div
                      style={{
                        padding: "12px 24px",
                        background: "rgba(255,255,255,0.01)",
                        fontSize: 10,
                        fontWeight: 800,
                        color: danger,
                      }}
                    >
                      ADMINISTRATORS ({admins.length})
                    </div>
                    {admins.map(renderUserRow)}

                    <div
                      style={{
                        padding: "12px 24px",
                        background: "rgba(255,255,255,0.01)",
                        fontSize: 10,
                        fontWeight: 800,
                        color: accentB,
                      }}
                    >
                      SECRETARIES ({secretaries.length})
                    </div>
                    {secretaries.map(renderUserRow)}

                    <div
                      style={{
                        padding: "12px 24px",
                        background: "rgba(255,255,255,0.01)",
                        fontSize: 10,
                        fontWeight: 800,
                        color: accent,
                      }}
                    >
                      DOCTORS ({doctors.length})
                    </div>
                    {doctors.map(renderUserRow)}
                  </>
                )}
              </div>
            </GCard>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
            <GCard style={{ padding: 40, textAlign: "center", color: text3 }}>
              <Ico name="ShieldAlert" size={48} style={{ opacity: 0.2, marginBottom: 16 }} />
              <p>Whitelist functionality is not available in the local version.</p>
              <p style={{ fontSize: 12, marginTop: 8 }}>Create users directly from the Staff tab.</p>
            </GCard>
          </div>
        )}
      </div>

      {/* New User Modal */}
      {showNewLegacyModal && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 1000,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "rgba(0,0,0,0.8)",
            backdropFilter: "blur(8px)",
          }}
        >
          <GCard style={{ width: 450, padding: 32 }}>
            <h2 style={{ fontSize: 20, fontWeight: 800, color: text1, marginBottom: 24 }}>Create New User</h2>
            <form onSubmit={handleAddLegacyUser} style={{ display: "flex", flexDirection: "column", gap: 20 }}>
              <div>
                <label
                  style={{
                    display: "block",
                    fontSize: 11,
                    fontWeight: 800,
                    color: text3,
                    textTransform: "uppercase",
                    marginBottom: 8,
                  }}
                >
                  Full Name
                </label>
                <input
                  placeholder="E.g.: John Doe"
                  value={newLegacy.name}
                  onChange={(e) => setNewLegacy({ ...newLegacy, name: e.target.value })}
                  style={{
                    width: "100%",
                    padding: "12px",
                    borderRadius: 10,
                    background: glass.input,
                    border: `1px solid ${glass.border}`,
                    color: text1,
                    outline: "none",
                  }}
                  required
                />
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                <div>
                  <label
                    style={{
                      display: "block",
                      fontSize: 11,
                      fontWeight: 800,
                      color: text3,
                      textTransform: "uppercase",
                      marginBottom: 8,
                    }}
                  >
                    Username
                  </label>
                  <input
                    placeholder="john_doe"
                    value={newLegacy.username}
                    onChange={(e) => setNewLegacy({ ...newLegacy, username: e.target.value })}
                    style={{
                      width: "100%",
                      padding: "12px",
                      borderRadius: 10,
                      background: glass.input,
                      border: `1px solid ${glass.border}`,
                      color: text1,
                      outline: "none",
                    }}
                    required
                  />
                </div>
                <div>
                  <label
                    style={{
                      display: "block",
                      fontSize: 11,
                      fontWeight: 800,
                      color: text3,
                      textTransform: "uppercase",
                      marginBottom: 8,
                    }}
                  >
                    Password
                  </label>
                  <input
                    type="text"
                    placeholder="••••••••"
                    value={newLegacy.password}
                    onChange={(e) => setNewLegacy({ ...newLegacy, password: e.target.value })}
                    style={{
                      width: "100%",
                      padding: "12px",
                      borderRadius: 10,
                      background: glass.input,
                      border: `1px solid ${glass.border}`,
                      color: text1,
                      outline: "none",
                    }}
                    required
                  />
                </div>
              </div>
              <div>
                <label
                  style={{
                    display: "block",
                    fontSize: 11,
                    fontWeight: 800,
                    color: text3,
                    textTransform: "uppercase",
                    marginBottom: 12,
                  }}
                >
                  Role
                </label>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
                  {["DOCTOR", "SECRETARY", "ADMIN"].map((r) => (
                    <button
                      key={r}
                      type="button"
                      onClick={() => setNewLegacy({ ...newLegacy, role: r as any })}
                      style={{
                        padding: "10px 4px",
                        borderRadius: 8,
                        fontSize: 11,
                        fontWeight: 700,
                        border: `1px solid ${newLegacy.role === r ? accent : glass.border}`,
                        background: newLegacy.role === r ? `${accent}22` : "transparent",
                        color: newLegacy.role === r ? accent : text2,
                        cursor: "pointer",
                        transition: "all 0.2s ease",
                      }}
                    >
                      {r}
                    </button>
                  ))}
                </div>
              </div>
              <div style={{ display: "flex", gap: 12, marginTop: 12 }}>
                <button
                  type="button"
                  onClick={() => setShowNewLegacyModal(false)}
                  style={{
                    flex: 1,
                    padding: "12px",
                    borderRadius: 10,
                    background: "rgba(255,255,255,0.05)",
                    color: text1,
                    border: "none",
                    cursor: "pointer",
                    fontWeight: 600,
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  style={{
                    flex: 1,
                    padding: "12px",
                    borderRadius: 10,
                    background: accent,
                    color: "#1a0e00",
                    border: "none",
                    cursor: "pointer",
                    fontWeight: 700,
                  }}
                >
                  {loading ? "Creating..." : "Create User"}
                </button>
              </div>
            </form>
          </GCard>
        </div>
      )}

      {/* User Edit Modal */}
      {showUserModal && editingUser && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 1000,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "rgba(0,0,0,0.8)",
            backdropFilter: "blur(8px)",
          }}
        >
          <GCard style={{ width: 450, padding: 32 }}>
            <h2 style={{ fontSize: 20, fontWeight: 800, color: text1, marginBottom: 24 }}>Edit User</h2>
            <form onSubmit={handleSaveUser} style={{ display: "flex", flexDirection: "column", gap: 20 }}>
              <div>
                <label
                  style={{
                    display: "block",
                    fontSize: 11,
                    fontWeight: 800,
                    color: text3,
                    textTransform: "uppercase",
                    marginBottom: 8,
                  }}
                >
                  Full Name
                </label>
                <input
                  value={editingUser.name}
                  onChange={(e) => setEditingUser({ ...editingUser, name: e.target.value })}
                  style={{
                    width: "100%",
                    padding: "12px",
                    borderRadius: 10,
                    background: glass.input,
                    border: `1px solid ${glass.border}`,
                    color: text1,
                    outline: "none",
                  }}
                />
              </div>
              <div>
                <label
                  style={{
                    display: "block",
                    fontSize: 11,
                    fontWeight: 800,
                    color: text3,
                    textTransform: "uppercase",
                    marginBottom: 12,
                  }}
                >
                  System Role
                </label>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
                  {[
                    { id: "DOCTOR", label: "Doctor" },
                    { id: "SECRETARY", label: "Secretary" },
                    { id: "ADMIN", label: "Admin" },
                  ].map((r) => (
                    <button
                      key={r.id}
                      type="button"
                      onClick={() => setEditingUser({ ...editingUser, role: r.id as any })}
                      style={{
                        padding: "10px 4px",
                        borderRadius: 8,
                        fontSize: 11,
                        fontWeight: 700,
                        border: `1px solid ${editingUser.role === r.id ? accent : glass.border}`,
                        background: editingUser.role === r.id ? `${accent}22` : "transparent",
                        color: editingUser.role === r.id ? accent : text2,
                        cursor: "pointer",
                        transition: "all 0.2s ease",
                      }}
                    >
                      {r.label}
                    </button>
                  ))}
                </div>
              </div>

              {editingUser.role === "SECRETARY" && (
                <div>
                  <label
                    style={{
                      display: "block",
                      fontSize: 11,
                      fontWeight: 800,
                      color: text3,
                      textTransform: "uppercase",
                      marginBottom: 8,
                    }}
                  >
                    Assigned Doctors
                  </label>
                  <div
                    style={{
                      maxHeight: 150,
                      overflowY: "auto",
                      border: `1px solid ${glass.border}`,
                      borderRadius: 10,
                      padding: 8,
                      display: "flex",
                      flexDirection: "column",
                      gap: 4,
                    }}
                  >
                    {doctors.map((doc) => (
                      <label
                        key={doc.id}
                        style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 8px", cursor: "pointer" }}
                      >
                        <input
                          type="checkbox"
                          checked={editingUser.managedDoctorIds?.includes(doc.id)}
                          onChange={(e) => {
                            const current = editingUser.managedDoctorIds || [];
                            const next = e.target.checked
                              ? [...current, doc.id]
                              : current.filter((id) => id !== doc.id);
                            setEditingUser({ ...editingUser, managedDoctorIds: next });
                          }}
                        />
                        <span style={{ fontSize: 12, color: text2 }}>{doc.name}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}

              <div style={{ display: "flex", gap: 12, marginTop: 12 }}>
                <button
                  type="button"
                  onClick={() => setShowUserModal(false)}
                  style={{
                    flex: 1,
                    padding: "12px",
                    borderRadius: 10,
                    background: "rgba(255,255,255,0.05)",
                    color: text1,
                    border: "none",
                    cursor: "pointer",
                    fontWeight: 600,
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  style={{
                    flex: 1,
                    padding: "12px",
                    borderRadius: 10,
                    background: accent,
                    color: "#1a0e00",
                    border: "none",
                    cursor: "pointer",
                    fontWeight: 700,
                  }}
                >
                  Save Changes
                </button>
              </div>
            </form>
          </GCard>
        </div>
      )}
    </div>
  );
};
