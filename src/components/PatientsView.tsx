import React, { useState, useEffect } from "react";
import { api } from "../lib/api";
import { useAuth } from "../App";
import { GCard } from "./GCard";
import { Ico } from "./Ico";
import { SPill } from "./Tags";
import { Patient } from "../lib/types";
import { accent, accentB, danger, success, text1, text2, text3, glass } from "../theme";

export function PatientsView({ onSelectPatient }: { onSelectPatient: (id: string) => void }) {
  const { user, clinicId, role } = useAuth();
  const [q, setQ] = useState("");
  const [f, setF] = useState("All");
  const [patients, setPatients] = useState<Patient[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [newPatient, setNewPatient] = useState<{
    dni: string;
    name: string;
    age: number | string;
    cond: string;
    status: string;
    bloodType: string;
  }>({ dni: "", name: "", age: "", cond: "", status: "Active", bloodType: "" });
  const [idError, setIdError] = useState("");
  const [saveError, setSaveError] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [showStatusDrop, setShowStatusDrop] = useState(false);
  const [patientToDelete, setPatientToDelete] = useState<{ id: string; name: string } | null>(null);

  const fetchPatients = async () => {
    if (!clinicId) return;
    try {
      const doctorIdFilter = role === "DOCTOR" ? user?.id : undefined;
      const list = await api.patients.list(clinicId, doctorIdFilter);
      // Sort in memory
      list.sort((a: any, b: any) => a.name.localeCompare(b.name));
      setPatients(list);
    } catch (error) {
      console.error("Error fetching patients:", error);
    }
  };

  useEffect(() => {
    fetchPatients();
  }, [clinicId, role, user?.id]);

  const list = patients.filter(
    (p) =>
      (f === "All" || p.status === f) &&
      (p.name.toLowerCase().includes(q.toLowerCase()) ||
        p.dni?.includes(q) ||
        p.cond.toLowerCase().includes(q.toLowerCase())),
  );

  const handleSavePatient = async () => {
    if (!newPatient.name || !newPatient.dni) {
      setIdError("Name and ID are required");
      return;
    }

    setIdError("");
    setSaveError("");

    if (!clinicId) {
      setSaveError("Error: Clinic ID not found.");
      return;
    }

    setIsSaving(true);
    try {
      const patientData = {
        dni: newPatient.dni.trim(),
        name: newPatient.name.trim(),
        age: Number(newPatient.age) || 0,
        cond: newPatient.cond.trim(),
        clinicId: clinicId,
        doctorId: user?.id,
        status: newPatient.status,
        bloodType: newPatient.bloodType,
        doctor: user?.name || "Doctor",
        lastVisit: new Date().toISOString().split("T")[0],
      };

      if (isEditing && editingId) {
        await api.patients.update(editingId, patientData);
      } else {
        await api.patients.create(patientData);
      }

      await fetchPatients();
      setShowModal(false);
      setIsEditing(false);
      setEditingId(null);
      setNewPatient({ dni: "", name: "", age: "", cond: "", status: "Active", bloodType: "" });
    } catch (error: any) {
      setSaveError(error.message || "Error saving patient.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeletePatient = async () => {
    if (!patientToDelete || !clinicId) return;
    const { id } = patientToDelete;

    setIsSaving(true);
    try {
      await api.patients.delete(id);
      await fetchPatients();
      setPatientToDelete(null);
    } catch (error: any) {
      setSaveError(`Error deleting: ${error.message}`);
    } finally {
      setIsSaving(false);
    }
  };

  const openEdit = (p: Patient) => {
    setNewPatient({
      dni: p.dni || "",
      name: p.name,
      age: p.age,
      cond: p.cond,
      status: p.status,
      bloodType: p.bloodType || "",
    });
    setEditingId(p.id);
    setIsEditing(true);
    setShowModal(true);
  };

  return (
    <div style={{ height: "100%", position: "relative" }}>
      <GCard style={{ height: "100%", display: "flex", flexDirection: "column", padding: 0, overflow: "hidden" }}>
        <div style={{ padding: "20px 24px 16px", borderBottom: `1px solid ${glass.border}` }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
            <div>
              <p style={{ fontSize: 16, fontWeight: 700, color: text1 }}>Patient Directory</p>
              <p style={{ fontSize: 11, color: text2, marginTop: 2 }}>
                {patients.length} patients registered in the system
              </p>
            </div>
            <button
              onClick={() => setShowModal(true)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                fontSize: 11,
                fontWeight: 700,
                padding: "8px 16px",
                borderRadius: 10,
                background: "rgba(255,255,255,0.95)",
                color: "#000",
                cursor: "pointer",
                boxShadow: glass.shadow,
                border: "none",
              }}
            >
              <Ico name="Plus" size={14} color="#000" /> New Patient
            </button>
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            <div style={{ position: "relative", flex: 1 }}>
              <div style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)" }}>
                <Ico name="Search" size={14} color={text3} />
              </div>
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search by name, ID or diagnosis..."
                style={{
                  width: "100%",
                  paddingLeft: 36,
                  paddingRight: 14,
                  paddingTop: 9,
                  paddingBottom: 9,
                  fontSize: 12,
                  background: glass.input,
                  border: `1px solid ${glass.border}`,
                  borderRadius: 10,
                  color: text1,
                  outline: "none",
                  backdropFilter: "blur(10px)",
                  fontFamily: "inherit",
                  boxSizing: "border-box",
                }}
              />
            </div>
            {["All", "Active", "Urgent", "Inactive"].map((s) => (
              <button
                key={s}
                onClick={() => setF(s)}
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  padding: "8px 14px",
                  borderRadius: 10,
                  cursor: "pointer",
                  transition: "all 0.2s",
                  background: f === s ? "rgba(255,255,255,0.1)" : glass.input,
                  color: f === s ? text1 : text2,
                  border: f === s ? `1px solid rgba(255,255,255,0.2)` : `1px solid ${glass.border}`,
                }}
              >
                {s}
              </button>
            ))}
          </div>
        </div>
        <div style={{ flex: 1, overflowY: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${glass.border}` }}>
                {["ID / National ID", "Patient", "Age", "Doctor", "Diagnosis", "Last visit", "Status", ""].map((h) => (
                  <th
                    key={h}
                    style={{
                      textAlign: "left",
                      padding: "10px 20px",
                      fontSize: 9,
                      fontWeight: 700,
                      letterSpacing: "0.08em",
                      color: text3,
                      textTransform: "uppercase",
                    }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {list.map((p, i) => (
                <tr
                  key={p.id}
                  style={{
                    borderBottom: `1px solid ${glass.border}22`,
                    cursor: "pointer",
                    transition: "background 0.2s",
                  }}
                  onClick={() => onSelectPatient(p.id)}
                  onMouseEnter={(e) => (e.currentTarget.style.background = glass.navItem)}
                  onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                >
                  <td style={{ padding: "14px 20px" }}>
                    <span
                      style={{
                        fontSize: 10,
                        fontWeight: 700,
                        color: text1,
                        background: "rgba(255,255,255,0.05)",
                        border: `1px solid ${glass.border}`,
                        padding: "3px 8px",
                        borderRadius: 6,
                        fontFamily: "var(--font-sans)",
                      }}
                    >
                      {p.dni || p.id}
                    </span>
                  </td>
                  <td style={{ padding: "14px 20px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <div
                        style={{
                          width: 32,
                          height: 32,
                          borderRadius: "50%",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          fontWeight: 700,
                          fontSize: 12,
                          color: "#fff",
                          flexShrink: 0,
                          background: `hsl(${(p.name.charCodeAt(0) * 17) % 360},50%,40%)`,
                        }}
                      >
                        {p.name[0]}
                      </div>
                      <span style={{ fontSize: 13, fontWeight: 600, color: text1 }}>{p.name}</span>
                    </div>
                  </td>
                  <td style={{ padding: "14px 20px", fontSize: 12, color: text2 }}>{p.age} years</td>
                  <td style={{ padding: "14px 20px", fontSize: 12, color: text2 }}>{p.doctor}</td>
                  <td style={{ padding: "14px 20px", fontSize: 12, color: text2 }}>{p.cond}</td>
                  <td style={{ padding: "14px 20px", fontSize: 11, color: text3, fontFamily: "var(--font-sans)" }}>
                    {p.lastVisit}
                  </td>
                  <td style={{ padding: "14px 20px" }}>
                    <SPill s={p.status} />
                  </td>
                  <td style={{ padding: "14px 20px", textAlign: "right" }}>
                    <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          openEdit(p);
                        }}
                        style={{
                          background: "none",
                          border: "none",
                          cursor: "pointer",
                          padding: 4,
                          borderRadius: 6,
                          transition: "background 0.2s",
                        }}
                        onMouseEnter={(e) => (e.currentTarget.style.background = glass.navItem)}
                        onMouseLeave={(e) => (e.currentTarget.style.background = "none")}
                      >
                        <Ico name="Edit" size={14} color={text2} />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setPatientToDelete({ id: p.id, name: p.name });
                        }}
                        style={{
                          background: "none",
                          border: "none",
                          cursor: "pointer",
                          padding: 4,
                          borderRadius: 6,
                          transition: "background 0.2s",
                        }}
                        onMouseEnter={(e) => (e.currentTarget.style.background = danger + "22")}
                        onMouseLeave={(e) => (e.currentTarget.style.background = "none")}
                      >
                        <Ico name="Trash2" size={14} color={danger} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </GCard>

      {/* New/Edit Patient Modal */}
      {showModal && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            zIndex: 100,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "rgba(0,0,0,0.6)",
            backdropFilter: "blur(4px)",
          }}
        >
          <GCard style={{ width: 400, padding: 24, border: `1px solid ${glass.borderS}` }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
              <p style={{ fontSize: 18, fontWeight: 700, color: text1 }}>
                {isEditing ? "Edit Patient" : "Register New Patient"}
              </p>
              <button
                onClick={() => {
                  setShowModal(false);
                  setIsEditing(false);
                  setEditingId(null);
                }}
                style={{ background: "none", border: "none", cursor: "pointer" }}
              >
                <Ico name="X" color={text3} />
              </button>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <div>
                <p style={{ fontSize: 11, fontWeight: 700, color: text2, marginBottom: 6, textTransform: "uppercase" }}>
                  National ID
                </p>
                <input
                  value={newPatient.dni}
                  onChange={(e) => setNewPatient({ ...newPatient, dni: e.target.value })}
                  placeholder="e.g., 1709223410"
                  style={{
                    width: "100%",
                    padding: "10px 12px",
                    background: glass.input,
                    border: `1px solid ${idError ? danger : glass.border}`,
                    borderRadius: 10,
                    color: text1,
                    outline: "none",
                  }}
                />
                {idError && <p style={{ fontSize: 10, color: danger, marginTop: 4 }}>{idError}</p>}
              </div>
              <div>
                <p style={{ fontSize: 11, fontWeight: 700, color: text2, marginBottom: 6, textTransform: "uppercase" }}>
                  Full Name
                </p>
                <input
                  value={newPatient.name}
                  onChange={(e) => setNewPatient({ ...newPatient, name: e.target.value })}
                  placeholder="First and Last Name"
                  style={{
                    width: "100%",
                    padding: "10px 12px",
                    background: glass.input,
                    border: `1px solid ${glass.border}`,
                    borderRadius: 10,
                    color: text1,
                    outline: "none",
                  }}
                />
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <div>
                  <p
                    style={{ fontSize: 11, fontWeight: 700, color: text2, marginBottom: 6, textTransform: "uppercase" }}
                  >
                    Age
                  </p>
                  <input
                    type="number"
                    value={newPatient.age}
                    onChange={(e) => {
                      const val = e.target.value;
                      if (val === "") {
                        setNewPatient({ ...newPatient, age: "" });
                        return;
                      }
                      const num = parseInt(val);
                      if (!isNaN(num) && num >= 0 && num <= 105) {
                        setNewPatient({ ...newPatient, age: num });
                      }
                    }}
                    placeholder="0"
                    style={{
                      width: "100%",
                      padding: "10px 12px",
                      background: glass.input,
                      border: `1px solid ${glass.border}`,
                      borderRadius: 10,
                      color: text1,
                      outline: "none",
                    }}
                  />
                </div>
                <div>
                  <p
                    style={{ fontSize: 11, fontWeight: 700, color: text2, marginBottom: 6, textTransform: "uppercase" }}
                  >
                    Status
                  </p>
                  <div style={{ position: "relative" }}>
                    <button
                      onClick={() => setShowStatusDrop(!showStatusDrop)}
                      style={{
                        width: "100%",
                        padding: "10px 12px",
                        background: glass.input,
                        border: `1px solid ${glass.border}`,
                        borderRadius: 10,
                        color: text1,
                        textAlign: "left",
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        cursor: "pointer",
                        outline: "none",
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <div
                          style={{
                            width: 8,
                            height: 8,
                            borderRadius: "50%",
                            background:
                              newPatient.status === "Active"
                                ? success
                                : newPatient.status === "Urgent"
                                  ? danger
                                  : text3,
                          }}
                        />
                        {newPatient.status}
                      </div>
                      <Ico name="ChevronDown" size={14} color={text3} />
                    </button>
                    {showStatusDrop && (
                      <div
                        style={{
                          position: "absolute",
                          top: "calc(100% + 4px)",
                          left: 0,
                          right: 0,
                          zIndex: 1000,
                          background: "rgba(18,18,26,0.98)",
                          border: `1px solid ${glass.borderS}`,
                          borderRadius: 12,
                          overflow: "hidden",
                          backdropFilter: "blur(24px)",
                          boxShadow: "0 16px 40px rgba(0,0,0,0.5)",
                        }}
                      >
                        {["Active", "Urgent", "Inactive"].map((s) => (
                          <button
                            key={s}
                            onMouseDown={() => {
                              setNewPatient({ ...newPatient, status: s });
                              setShowStatusDrop(false);
                            }}
                            style={{
                              width: "100%",
                              padding: "12px 14px",
                              background: "none",
                              border: "none",
                              borderBottom: `1px solid ${glass.border}`,
                              cursor: "pointer",
                              textAlign: "left",
                              color: text1,
                              fontSize: 12,
                              display: "flex",
                              alignItems: "center",
                              gap: 10,
                            }}
                            onMouseEnter={(e) => (e.currentTarget.style.background = glass.navItem)}
                            onMouseLeave={(e) => (e.currentTarget.style.background = "none")}
                          >
                            <div
                              style={{
                                width: 6,
                                height: 6,
                                borderRadius: "50%",
                                background: s === "Active" ? success : s === "Urgent" ? danger : text3,
                              }}
                            />
                            {s}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
              <div>
                <p style={{ fontSize: 11, fontWeight: 700, color: text2, marginBottom: 6, textTransform: "uppercase" }}>
                  Condition/Diagnosis
                </p>
                <input
                  value={newPatient.cond}
                  onChange={(e) => setNewPatient({ ...newPatient, cond: e.target.value })}
                  placeholder="e.g., Hypertension"
                  style={{
                    width: "100%",
                    padding: "10px 12px",
                    background: glass.input,
                    border: `1px solid ${glass.border}`,
                    borderRadius: 10,
                    color: text1,
                    outline: "none",
                  }}
                />
              </div>
              <div>
                <p style={{ fontSize: 11, fontWeight: 700, color: text2, marginBottom: 6, textTransform: "uppercase" }}>
                  Blood Type
                </p>
                <select
                  value={newPatient.bloodType}
                  onChange={(e) => setNewPatient({ ...newPatient, bloodType: e.target.value })}
                  style={{
                    width: "100%",
                    padding: "10px 12px",
                    background: glass.input,
                    border: `1px solid ${glass.border}`,
                    borderRadius: 10,
                    color: text1,
                    outline: "none",
                  }}
                >
                  <option value="" style={{ background: "#1a1a24" }}>
                    Select...
                  </option>
                  {["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"].map((bt) => (
                    <option key={bt} value={bt} style={{ background: "#1a1a24" }}>
                      {bt}
                    </option>
                  ))}
                </select>
              </div>

              {saveError && (
                <div
                  style={{
                    padding: "10px 16px",
                    borderRadius: 10,
                    background: danger + "22",
                    border: `1px solid ${danger}44`,
                    color: danger,
                    fontSize: 11,
                    fontWeight: 600,
                  }}
                >
                  {saveError}
                </div>
              )}

              <button
                onClick={handleSavePatient}
                disabled={isSaving}
                style={{
                  marginTop: 8,
                  padding: "12px",
                  borderRadius: 10,
                  background: "rgba(255,255,255,0.95)",
                  color: "#000",
                  fontWeight: 700,
                  border: "none",
                  cursor: isSaving ? "not-allowed" : "pointer",
                  opacity: isSaving ? 0.7 : 1,
                }}
              >
                {isSaving ? "Saving..." : isEditing ? "Update Information" : "Save Patient"}
              </button>
            </div>
          </GCard>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {patientToDelete && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            zIndex: 200,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "rgba(0,0,0,0.7)",
            backdropFilter: "blur(8px)",
          }}
        >
          <GCard style={{ width: 360, padding: 32, textAlign: "center", border: `1px solid ${danger}44` }}>
            <div
              style={{
                width: 56,
                height: 56,
                borderRadius: "50%",
                background: danger + "22",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                margin: "0 auto 20px",
              }}
            >
              <Ico name="Trash2" size={28} color={danger} />
            </div>
            <h3 style={{ fontSize: 18, fontWeight: 800, color: text1, marginBottom: 12 }}>Delete Patient?</h3>
            <p style={{ fontSize: 13, color: text2, lineHeight: 1.5, marginBottom: 24 }}>
              You are about to delete <span style={{ color: accent, fontWeight: 700 }}>{patientToDelete.name}</span>.
              This action is permanent and will delete their entire clinical history.
            </p>
            <div style={{ display: "flex", gap: 12 }}>
              <button
                onClick={() => setPatientToDelete(null)}
                disabled={isSaving}
                style={{
                  flex: 1,
                  padding: "12px",
                  borderRadius: 12,
                  background: glass.navItem,
                  color: text1,
                  fontWeight: 700,
                  border: `1px solid ${glass.border}`,
                  cursor: "pointer",
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleDeletePatient}
                disabled={isSaving}
                style={{
                  flex: 1,
                  padding: "12px",
                  borderRadius: 12,
                  background: danger,
                  color: "#fff",
                  fontWeight: 700,
                  border: "none",
                  cursor: "pointer",
                  boxShadow: `0 8px 20px ${danger}44`,
                }}
              >
                {isSaving ? "Deleting..." : "Yes, Delete"}
              </button>
            </div>
          </GCard>
        </div>
      )}
    </div>
  );
}
