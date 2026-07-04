import React, { useState, useEffect } from "react";
import { toast } from "sonner";
import { api } from "../lib/api";
import { useAuth } from "../App";
import { GCard } from "./GCard";
import { Ico } from "./Ico";
import { SPill } from "./Tags";
import { Patient } from "../lib/types";
import { accent, accentB, danger, success, text1, text2, text3, glass } from "../theme";

export function SecPatientsView({ onSelectPatient }: { onSelectPatient: (id: string) => void }) {
  const { clinicId, role, managedDoctorIds } = useAuth();
  const [q, setQ] = useState("");
  const [f, setF] = useState("All");
  const [patients, setPatients] = useState<Patient[]>([]);
  const [doctors, setDoctors] = useState<any[]>([]);
  const [selectedDoctorFilter, setSelectedDoctorFilter] = useState<any>(null);
  const [showDoctorFilterList, setShowDoctorFilterList] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [newPatient, setNewPatient] = useState<{
    dni: string;
    name: string;
    age: number | string;
    cond: string;
    status: string;
    doctorId: string;
    doctorName: string;
    bloodType: string;
  }>({
    dni: "",
    name: "",
    age: "",
    cond: "",
    status: "Active",
    doctorId: "",
    doctorName: "",
    bloodType: "",
  });
  const [idError, setIdError] = useState("");
  const [showStatusDrop, setShowStatusDrop] = useState(false);
  const [showDoctorDrop, setShowDoctorDrop] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [patientToDelete, setPatientToDelete] = useState<{ id: string; name: string } | null>(null);

  useEffect(() => {
    if (!clinicId) return;
    const fetchData = async () => {
      try {
        const [pList, dList] = await Promise.all([api.patients.list(clinicId), api.users.list(clinicId, "DOCTOR")]);
        setPatients(pList);

        const filteredDocs = dList.filter((d: any) => {
          if (role === "SECRETARY" && managedDoctorIds?.length > 0) {
            return managedDoctorIds.includes(d.id);
          }
          return true;
        });

        setDoctors(filteredDocs);
      } catch (error) {
        console.error("Error fetching data:", error);
      }
    };
    fetchData();
  }, [clinicId, role, managedDoctorIds]);

  const list = patients.filter(
    (p) =>
      (f === "All" || p.status === f) &&
      (!selectedDoctorFilter || (p as any).doctorId === selectedDoctorFilter.id) &&
      (p.name.toLowerCase().includes(q.toLowerCase()) ||
        p.dni?.includes(q) ||
        p.cond.toLowerCase().includes(q.toLowerCase())),
  );

  const [saveError, setSaveError] = useState("");

  const handleSavePatient = async () => {
    if (!newPatient.name || !newPatient.dni) {
      setIdError("Name and ID are mandatory");
      return;
    }

    setIdError("");
    setSaveError("");
    if (!clinicId) return;

    setIsSaving(true);
    try {
      const patientData = {
        ...newPatient,
        age: Number(newPatient.age) || 0,
        clinicId: clinicId,
      };

      if (isEditing && editingId) {
        await api.patients.update(editingId, patientData);
      } else {
        await api.patients.create(patientData);
      }

      // Refresh list
      const pList = await api.patients.list(clinicId);
      setPatients(pList);

      setShowModal(false);
      setIsEditing(false);
      setEditingId(null);
      setNewPatient({
        dni: "",
        name: "",
        age: "",
        cond: "",
        status: "Active",
        doctorId: "",
        doctorName: "",
        bloodType: "",
      });
      toast.success(isEditing ? "Patient updated successfully" : "Patient registered successfully");
    } catch (error: any) {
      console.error("Error saving patient:", error);
      setSaveError(`Error saving: ${error.message || "Network Error"}`);
      toast.error(error.message || "Network Error");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeletePatient = async () => {
    if (!patientToDelete || !clinicId) return;
    setIsSaving(true);
    try {
      await api.patients.delete(patientToDelete.id);
      const pList = await api.patients.list(clinicId);
      setPatients(pList);
      setPatientToDelete(null);
      toast.success("Patient deleted successfully");
    } catch (error: any) {
      console.error("Error deleting patient:", error);
      toast.error(`Error deleting: ${error.message}`);
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
      doctorId: (p as any).doctorId || "",
      doctorName: (p as any).doctorName || "",
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
            <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
              <div>
                <p style={{ fontSize: 16, fontWeight: 700, color: text1 }}>Patient Directory (Secretariat)</p>
                <p style={{ fontSize: 11, color: text2, marginTop: 2 }}>
                  {patients.length} patients registered in the system
                </p>
              </div>

              <div style={{ width: 1, height: 32, background: glass.border }} />

              <div style={{ position: "relative" }}>
                <button
                  onClick={() => setShowDoctorFilterList(!showDoctorFilterList)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    fontSize: 11,
                    fontWeight: 700,
                    padding: "8px 16px",
                    borderRadius: 10,
                    background: glass.navItem,
                    color: text1,
                    border: `1px solid ${glass.border}`,
                    cursor: "pointer",
                  }}
                >
                  <Ico name="UserRound" size={13} color={accent} />
                  {selectedDoctorFilter ? `Dr. ${selectedDoctorFilter.name}` : "Filter by Doctor"}
                  <Ico name="ChevronDown" size={12} color={text3} />
                </button>

                {showDoctorFilterList && (
                  <div
                    style={{
                      position: "absolute",
                      top: "calc(100% + 8px)",
                      left: 0,
                      zIndex: 210,
                      width: 220,
                      background: "rgba(18,18,26,0.98)",
                      border: `1px solid ${glass.borderS}`,
                      borderRadius: 16,
                      backdropFilter: "blur(24px)",
                      boxShadow: "0 16px 40px rgba(0,0,0,0.5)",
                      overflow: "hidden",
                    }}
                  >
                    <div
                      style={{
                        padding: "12px 16px",
                        borderBottom: `1px solid ${glass.border}`,
                        background: "rgba(255,255,255,0.03)",
                      }}
                    >
                      <p
                        style={{
                          fontSize: 10,
                          fontWeight: 800,
                          color: text3,
                          textTransform: "uppercase",
                          letterSpacing: "0.05em",
                        }}
                      >
                        Select Doctor
                      </p>
                    </div>
                    <div style={{ maxHeight: 300, overflowY: "auto" }}>
                      <button
                        onClick={() => {
                          setSelectedDoctorFilter(null);
                          setShowDoctorFilterList(false);
                        }}
                        style={{
                          width: "100%",
                          padding: "12px 16px",
                          display: "flex",
                          alignItems: "center",
                          gap: 10,
                          background: !selectedDoctorFilter ? glass.navAct : "none",
                          border: "none",
                          borderBottom: `1px solid ${glass.border}44`,
                          cursor: "pointer",
                          textAlign: "left",
                          transition: "background 0.2s",
                        }}
                      >
                        <div
                          style={{
                            width: 24,
                            height: 24,
                            borderRadius: 6,
                            background: glass.navItem,
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                          }}
                        >
                          <Ico name="Users" size={12} color={text3} />
                        </div>
                        <span
                          style={{
                            fontSize: 12,
                            fontWeight: !selectedDoctorFilter ? 700 : 500,
                            color: !selectedDoctorFilter ? accent : text1,
                          }}
                        >
                          All Doctors
                        </span>
                      </button>
                      {doctors.map((doc) => (
                        <button
                          key={doc.id}
                          onClick={() => {
                            setSelectedDoctorFilter(doc);
                            setShowDoctorFilterList(false);
                          }}
                          style={{
                            width: "100%",
                            padding: "12px 16px",
                            display: "flex",
                            alignItems: "center",
                            gap: 10,
                            background: selectedDoctorFilter?.id === doc.id ? glass.navAct : "none",
                            border: "none",
                            borderBottom: `1px solid ${glass.border}44`,
                            cursor: "pointer",
                            textAlign: "left",
                            transition: "background 0.2s",
                          }}
                        >
                          <div
                            style={{
                              width: 24,
                              height: 24,
                              borderRadius: 6,
                              background: accent + "22",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                            }}
                          >
                            <Ico name="User" size={12} color={accent} />
                          </div>
                          <span
                            style={{
                              fontSize: 12,
                              fontWeight: selectedDoctorFilter?.id === doc.id ? 700 : 500,
                              color: selectedDoctorFilter?.id === doc.id ? accent : text1,
                            }}
                          >
                            {doc.name}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
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
                background: accent,
                color: "#1a0e00",
                cursor: "pointer",
                boxShadow: `0 4px 16px ${accent}44`,
                border: "none",
              }}
            >
              <Ico name="Plus" size={14} color="#1a0e00" /> New Patient
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
                  background: f === s ? accent + "22" : glass.input,
                  color: f === s ? accent : text2,
                  border: f === s ? `1px solid ${accent}55` : `1px solid ${glass.border}`,
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
                {["ID / Identification", "Patient", "Age", "Doctor", "Diagnosis", "Last visit", "Status", ""].map(
                  (h) => (
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
                  ),
                )}
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
                  <td style={{ padding: "14px 20px", fontSize: 12, color: text2 }}>
                    {(p as any).doctorName || p.doctor || "N/A"}
                  </td>
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
          <GCard style={{ width: 650, padding: 32, border: `1px solid ${glass.borderS}` }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
              <div>
                <p style={{ fontSize: 20, fontWeight: 800, color: text1, letterSpacing: "-0.02em" }}>
                  {isEditing ? "Edit Patient" : "Register New Patient"}
                </p>
                <p style={{ fontSize: 11, color: text3, marginTop: 2 }}>
                  Fill in the patient's clinical information (SEC)
                </p>
              </div>
              <button
                onClick={() => {
                  setShowModal(false);
                  setIsEditing(false);
                  setEditingId(null);
                }}
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 8,
                  background: glass.navItem,
                  border: "none",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  cursor: "pointer",
                  transition: "all 0.2s",
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = glass.border)}
                onMouseLeave={(e) => (e.currentTarget.style.background = glass.navItem)}
              >
                <Ico name="X" size={18} color={text2} />
              </button>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 }}>
              <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                <div>
                  <p
                    style={{
                      fontSize: 10,
                      fontWeight: 800,
                      color: text3,
                      marginBottom: 8,
                      textTransform: "uppercase",
                      letterSpacing: "0.05em",
                    }}
                  >
                    ID / Identification
                  </p>
                  <input
                    value={newPatient.dni}
                    onChange={(e) => setNewPatient({ ...newPatient, dni: e.target.value })}
                    placeholder="Ex: 1723456789"
                    style={{
                      width: "100%",
                      padding: "12px 14px",
                      background: glass.input,
                      border: `1px solid ${idError ? danger : glass.border}`,
                      borderRadius: 12,
                      color: text1,
                      outline: "none",
                      fontSize: 13,
                    }}
                  />
                  {idError && <p style={{ fontSize: 10, color: danger, marginTop: 4, fontWeight: 600 }}>{idError}</p>}
                </div>

                <div>
                  <p
                    style={{
                      fontSize: 10,
                      fontWeight: 800,
                      color: text3,
                      marginBottom: 8,
                      textTransform: "uppercase",
                      letterSpacing: "0.05em",
                    }}
                  >
                    Full Name
                  </p>
                  <input
                    value={newPatient.name}
                    onChange={(e) => setNewPatient({ ...newPatient, name: e.target.value })}
                    placeholder="Name and Surnames"
                    style={{
                      width: "100%",
                      padding: "12px 14px",
                      background: glass.input,
                      border: `1px solid ${glass.border}`,
                      borderRadius: 12,
                      color: text1,
                      outline: "none",
                      fontSize: 13,
                    }}
                  />
                </div>

                <div>
                  <p
                    style={{
                      fontSize: 10,
                      fontWeight: 800,
                      color: text3,
                      marginBottom: 8,
                      textTransform: "uppercase",
                      letterSpacing: "0.05em",
                    }}
                  >
                    Age (Years)
                  </p>
                  <input
                    type="number"
                    value={newPatient.age}
                    onChange={(e) => setNewPatient({ ...newPatient, age: e.target.value })}
                    placeholder="0"
                    style={{
                      width: "100%",
                      padding: "12px 14px",
                      background: glass.input,
                      border: `1px solid ${glass.border}`,
                      borderRadius: 12,
                      color: text1,
                      outline: "none",
                      fontSize: 13,
                    }}
                  />
                </div>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                <div>
                  <p
                    style={{
                      fontSize: 10,
                      fontWeight: 800,
                      color: text3,
                      marginBottom: 8,
                      textTransform: "uppercase",
                      letterSpacing: "0.05em",
                    }}
                  >
                    Patient Status
                  </p>
                  <div style={{ position: "relative" }}>
                    <button
                      onClick={() => setShowStatusDrop(!showStatusDrop)}
                      style={{
                        width: "100%",
                        padding: "12px 14px",
                        background: glass.input,
                        border: `1px solid ${glass.border}`,
                        borderRadius: 12,
                        color: text1,
                        textAlign: "left",
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        cursor: "pointer",
                        outline: "none",
                        fontSize: 13,
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
                          top: "calc(100% + 6px)",
                          left: 0,
                          right: 0,
                          zIndex: 1000,
                          background: "rgba(18,18,26,0.98)",
                          border: `1px solid ${glass.borderS}`,
                          borderRadius: 14,
                          overflow: "hidden",
                          backdropFilter: "blur(32px)",
                          boxShadow: "0 20px 50px rgba(0,0,0,0.6)",
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
                              padding: "12px 16px",
                              background: "none",
                              border: "none",
                              borderBottom: `1px solid ${glass.border}44`,
                              cursor: "pointer",
                              textAlign: "left",
                              color: text1,
                              fontSize: 12,
                              display: "flex",
                              alignItems: "center",
                              gap: 10,
                            }}
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

                <div>
                  <p
                    style={{
                      fontSize: 10,
                      fontWeight: 800,
                      color: text3,
                      marginBottom: 8,
                      textTransform: "uppercase",
                      letterSpacing: "0.05em",
                    }}
                  >
                    Diagnosis / Condition
                  </p>
                  <input
                    value={newPatient.cond}
                    onChange={(e) => setNewPatient({ ...newPatient, cond: e.target.value })}
                    placeholder="Brief description..."
                    style={{
                      width: "100%",
                      padding: "12px 14px",
                      background: glass.input,
                      border: `1px solid ${glass.border}`,
                      borderRadius: 12,
                      color: text1,
                      outline: "none",
                      fontSize: 13,
                    }}
                  />
                </div>

                <div>
                  <p
                    style={{
                      fontSize: 10,
                      fontWeight: 800,
                      color: text3,
                      marginBottom: 8,
                      textTransform: "uppercase",
                      letterSpacing: "0.05em",
                    }}
                  >
                    Blood Type
                  </p>
                  <select
                    value={newPatient.bloodType}
                    onChange={(e) => setNewPatient({ ...newPatient, bloodType: e.target.value })}
                    style={{
                      width: "100%",
                      padding: "12px 14px",
                      background: glass.input,
                      border: `1px solid ${glass.border}`,
                      borderRadius: 12,
                      color: text1,
                      outline: "none",
                      fontSize: 13,
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

                <div>
                  <p
                    style={{
                      fontSize: 10,
                      fontWeight: 800,
                      color: text3,
                      marginBottom: 8,
                      textTransform: "uppercase",
                      letterSpacing: "0.05em",
                    }}
                  >
                    Assigned Doctor
                  </p>
                  <div style={{ position: "relative" }}>
                    <button
                      onClick={() => setShowDoctorDrop(!showDoctorDrop)}
                      style={{
                        width: "100%",
                        padding: "12px 14px",
                        background: glass.input,
                        border: `1px solid ${glass.border}`,
                        borderRadius: 12,
                        color: text1,
                        textAlign: "left",
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        cursor: "pointer",
                        outline: "none",
                        fontSize: 13,
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <Ico name="User" size={14} color={accent} />
                        {newPatient.doctorName || "Select Doctor"}
                      </div>
                      <Ico name="ChevronDown" size={14} color={text3} />
                    </button>
                    {showDoctorDrop && (
                      <div
                        style={{
                          position: "absolute",
                          top: "calc(100% + 6px)",
                          left: 0,
                          right: 0,
                          zIndex: 1000,
                          background: "rgba(18,18,26,0.98)",
                          border: `1px solid ${glass.borderS}`,
                          borderRadius: 14,
                          overflow: "hidden",
                          backdropFilter: "blur(32px)",
                          boxShadow: "0 20px 50px rgba(0,0,0,0.6)",
                        }}
                      >
                        <button
                          onMouseDown={() => {
                            setNewPatient({ ...newPatient, doctorId: "", doctorName: "" });
                            setShowDoctorDrop(false);
                          }}
                          style={{
                            width: "100%",
                            padding: "12px 16px",
                            background: "none",
                            border: "none",
                            borderBottom: `1px solid ${glass.border}44`,
                            cursor: "pointer",
                            textAlign: "left",
                            color: text1,
                            fontSize: 12,
                            display: "flex",
                            alignItems: "center",
                            gap: 10,
                          }}
                        >
                          <Ico name="UserX" size={12} color={text3} /> Unassigned
                        </button>
                        {doctors.map((doc) => (
                          <button
                            key={doc.id}
                            onMouseDown={() => {
                              setNewPatient({ ...newPatient, doctorId: doc.id, doctorName: doc.name });
                              setShowDoctorDrop(false);
                            }}
                            style={{
                              width: "100%",
                              padding: "12px 16px",
                              background: "none",
                              border: "none",
                              borderBottom: `1px solid ${glass.border}44`,
                              cursor: "pointer",
                              textAlign: "left",
                              color: text1,
                              fontSize: 12,
                              display: "flex",
                              alignItems: "center",
                              gap: 10,
                            }}
                          >
                            <Ico name="User" size={12} color={accent} /> {doc.name}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>

            <div style={{ marginTop: 32, display: "flex", flexDirection: "column", gap: 12 }}>
              {saveError && (
                <div
                  style={{
                    padding: "10px 16px",
                    borderRadius: 10,
                    background: danger + "22",
                    border: `1px solid ${danger}44`,
                    color: danger,
                    fontSize: 12,
                    fontWeight: 600,
                  }}
                >
                  {saveError}
                </div>
              )}
              <div style={{ display: "flex", gap: 12, justifyContent: "flex-end" }}>
                <button
                  onClick={() => {
                    setShowModal(false);
                    setIsEditing(false);
                    setEditingId(null);
                    setSaveError("");
                  }}
                  disabled={isSaving}
                  style={{
                    padding: "10px 20px",
                    borderRadius: 12,
                    background: glass.navItem,
                    color: text2,
                    fontWeight: 700,
                    border: `1px solid ${glass.border}`,
                    cursor: isSaving ? "not-allowed" : "pointer",
                    transition: "all 0.2s",
                    fontSize: 12,
                    opacity: isSaving ? 0.5 : 1,
                  }}
                >
                  Cancel
                </button>
                <button
                  onClick={handleSavePatient}
                  disabled={isSaving}
                  style={{
                    padding: "10px 28px",
                    borderRadius: 12,
                    background: accent,
                    color: "#1a0e00",
                    fontWeight: 800,
                    border: "none",
                    cursor: isSaving ? "not-allowed" : "pointer",
                    boxShadow: `0 8px 24px ${accent}44`,
                    transition: "all 0.2s",
                    fontSize: 12,
                    opacity: isSaving ? 0.7 : 1,
                  }}
                >
                  {isSaving ? "Saving..." : isEditing ? "Update Record" : "Save Patient"}
                </button>
              </div>
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
              This action is permanent and will delete all their medical history.
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
