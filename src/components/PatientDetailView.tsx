import React, { useState, useEffect } from "react";
import { api } from "../lib/api";
import { useAuth } from "../App";
import { GCard } from "./GCard";
import { Ico } from "./Ico";
import { Patient, Consultation, VitalSigns, PrescriptionItem } from "../lib/types";
import { accent, accentB, danger, success, text1, text2, text3, glass } from "../theme";
import { CIE10_COMMON } from "../lib/cie10";
import { MEDICATIONS_COMMON } from "../lib/medications";
import { motion, AnimatePresence } from "motion/react";

interface Props {
  patientId: string;
  onBack: () => void;
}

export function PatientDetailView({ patientId, onBack }: Props) {
  const { user, clinicId, role } = useAuth();
  const [patient, setPatient] = useState<Patient | null>(null);
  const [consultations, setConsultations] = useState<Consultation[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [loading, setLoading] = useState(true);

  // Form State
  const [reason, setReason] = useState("");
  const [evolution, setEvolution] = useState("");
  const [vitals, setVitals] = useState<VitalSigns>({ pulse: "", temp: "", bpS: "", bpD: "", weight: "", height: "" });
  const [diagnosis, setDiagnosis] = useState("");
  const [prescription, setPrescription] = useState<PrescriptionItem[]>([]);
  const [cieSearch, setCieSearch] = useState("");
  const [activeMedSearchIndex, setActiveMedSearchIndex] = useState<number | null>(null);

  const fetchData = async () => {
    if (!patientId || !clinicId) return;
    try {
      const [p, c] = await Promise.all([api.patients.get(patientId), api.patients.getConsultations(patientId)]);
      setPatient(p);
      setConsultations(c);
    } catch (error) {
      console.error("Error fetching patient details:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [patientId, clinicId]);

  const handleSaveConsultation = async () => {
    if (!reason || !diagnosis || !clinicId) return;

    try {
      const consultationData = {
        date: new Date().toISOString(),
        reason,
        evolution,
        vital_signs: vitals,
        diagnosis_cie10: diagnosis,
        prescription,
        clinicId,
        doctorId: user?.id,
        doctorName: user?.name || "Doctor",
      };

      await api.patients.createConsultation(patientId, consultationData);
      await fetchData();
      setShowModal(false);
      resetForm();
    } catch (error) {
      console.error("Error saving consultation:", error);
    }
  };

  const resetForm = () => {
    setReason("");
    setEvolution("");
    setVitals({ pulse: "", temp: "", bpS: "", bpD: "", weight: "", height: "" });
    setDiagnosis("");
    setPrescription([]);
    setCieSearch("");
  };

  const addPrescriptionItem = () => {
    setPrescription([...prescription, { medication: "", dose: "", frequency: "", duration: "" }]);
  };

  const updatePrescriptionItem = (index: number, field: keyof PrescriptionItem, value: string) => {
    const newList = [...prescription];
    newList[index] = { ...newList[index], [field]: value };
    setPrescription(newList);
  };

  const removePrescriptionItem = (index: number) => {
    setPrescription(prescription.filter((_, i) => i !== index));
  };

  const filteredCIE = CIE10_COMMON.filter(
    (c) =>
      c.code.toLowerCase().includes(cieSearch.toLowerCase()) ||
      c.description.toLowerCase().includes(cieSearch.toLowerCase()),
  ).slice(0, 5);

  if (loading && !patient) return <div style={{ padding: 40, color: text2 }}>Loading record...</div>;

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", gap: 20 }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
        <button
          onClick={onBack}
          style={{
            background: glass.input,
            border: `1px solid ${glass.border}`,
            borderRadius: 10,
            padding: 8,
            cursor: "pointer",
            color: text1,
          }}
        >
          <Ico name="ArrowLeft" size={18} />
        </button>
        <div>
          <h2 style={{ fontSize: 24, fontWeight: 700, color: text1 }}>{patient?.name}</h2>
          <p style={{ fontSize: 13, color: text2 }}>
            ID: {patient?.dni} • {patient?.age} years old • {patient?.cond}
          </p>
        </div>
        {role !== "SECRETARY" && (
          <div style={{ marginLeft: "auto" }}>
            <button
              onClick={() => setShowModal(true)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "10px 20px",
                borderRadius: 12,
                background: "rgba(255,255,255,0.95)",
                color: "#000",
                fontWeight: 700,
                border: "none",
                cursor: "pointer",
                boxShadow: glass.shadow,
              }}
            >
              <Ico name="Stethoscope" size={18} /> Start Consultation
            </button>
          </div>
        )}
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: role === "SECRETARY" ? "1fr" : "1fr 320px",
          gap: 20,
          flex: 1,
          overflow: "hidden",
        }}
      >
        {/* Timeline */}
        {role !== "SECRETARY" ? (
          <GCard style={{ display: "flex", flexDirection: "column", padding: 0, overflow: "hidden" }}>
            <div style={{ padding: "16px 24px", borderBottom: `1px solid ${glass.border}` }}>
              <h3 style={{ fontSize: 16, fontWeight: 700, color: text1 }}>Medical History</h3>
            </div>
            <div style={{ flex: 1, overflowY: "auto", padding: 24 }}>
              {consultations.length === 0 ? (
                <div style={{ textAlign: "center", padding: 40, color: text3 }}>
                  <Ico name="History" size={48} color={text3} style={{ marginBottom: 16, opacity: 0.3 }} />
                  <p>No consultations registered yet.</p>
                </div>
              ) : (
                <div style={{ position: "relative", paddingLeft: 32 }}>
                  <div
                    style={{ position: "absolute", left: 15, top: 0, bottom: 0, width: 2, background: glass.border }}
                  />
                  {consultations.map((c, i) => (
                    <div key={c.id} style={{ position: "relative", marginBottom: 32 }}>
                      <div
                        style={{
                          position: "absolute",
                          left: -24,
                          top: 4,
                          width: 16,
                          height: 16,
                          borderRadius: "50%",
                          background: "rgba(255,255,255,0.8)",
                          border: `4px solid #12121a`,
                          zIndex: 1,
                        }}
                      />
                      <div
                        style={{
                          background: glass.navItem,
                          border: `1px solid ${glass.border}`,
                          borderRadius: 16,
                          padding: 20,
                          backdropFilter: "blur(10px)",
                        }}
                      >
                        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 12 }}>
                          <p style={{ fontSize: 14, fontWeight: 700, color: text1 }}>{c.reason}</p>
                          <p style={{ fontSize: 12, color: text3 }}>
                            {new Date(c.date).toLocaleDateString()} •{" "}
                            {new Date(c.date).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                          </p>
                        </div>
                        <div
                          style={{
                            display: "grid",
                            gridTemplateColumns: "repeat(auto-fit, minmax(100px, 1fr))",
                            gap: 16,
                            marginBottom: 16,
                            background: "rgba(0,0,0,0.2)",
                            borderRadius: 12,
                            padding: 16,
                          }}
                        >
                          <div>
                            <p
                              style={{
                                fontSize: 9,
                                color: text3,
                                textTransform: "uppercase",
                                letterSpacing: "0.05em",
                                marginBottom: 2,
                              }}
                            >
                              Pulse
                            </p>
                            <p style={{ fontSize: 13, color: text1 }}>{c.vital_signs.pulse} bpm</p>
                          </div>
                          <div>
                            <p
                              style={{
                                fontSize: 9,
                                color: text3,
                                textTransform: "uppercase",
                                letterSpacing: "0.05em",
                                marginBottom: 2,
                              }}
                            >
                              Temp
                            </p>
                            <p style={{ fontSize: 13, color: text1 }}>{c.vital_signs.temp} °C</p>
                          </div>
                          <div>
                            <p
                              style={{
                                fontSize: 9,
                                color: text3,
                                textTransform: "uppercase",
                                letterSpacing: "0.05em",
                                marginBottom: 2,
                              }}
                            >
                              B.P.
                            </p>
                            <p style={{ fontSize: 13, color: text1 }}>
                              {c.vital_signs.bpS}/{c.vital_signs.bpD}
                            </p>
                          </div>
                          <div>
                            <p
                              style={{
                                fontSize: 9,
                                color: text3,
                                textTransform: "uppercase",
                                letterSpacing: "0.05em",
                                marginBottom: 2,
                              }}
                            >
                              Weight
                            </p>
                            <p style={{ fontSize: 13, color: text1 }}>{c.vital_signs.weight} kg</p>
                          </div>
                        </div>
                        <div style={{ marginBottom: 16 }}>
                          <p style={{ fontSize: 11, fontWeight: 700, color: text1, marginBottom: 4 }}>EVOLUTION</p>
                          <p style={{ fontSize: 13, color: text2, lineHeight: 1.5 }}>{c.evolution}</p>
                        </div>
                        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                          <div
                            style={{
                              padding: "4px 10px",
                              borderRadius: 6,
                              background: success + "22",
                              border: `1px solid ${success}44`,
                              color: success,
                              fontSize: 11,
                              fontWeight: 700,
                            }}
                          >
                            {c.diagnosis_cie10}
                          </div>
                          <p style={{ fontSize: 11, color: text3 }}>Attended by: {c.doctorName}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </GCard>
        ) : (
          <GCard
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: 40,
              textAlign: "center",
            }}
          >
            <div>
              <Ico name="ShieldAlert" size={64} color={text3} style={{ marginBottom: 24, opacity: 0.3 }} />
              <h3 style={{ fontSize: 18, fontWeight: 700, color: text2 }}>Restricted Access</h3>
              <p style={{ fontSize: 14, color: text3, maxWidth: 300, margin: "12px auto 0" }}>
                Detailed clinical information is only accessible to authorized medical personnel.
              </p>
            </div>
          </GCard>
        )}

        {/* Sidebar Info */}
        {role !== "SECRETARY" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            <GCard style={{ padding: 24 }}>
              <h4 style={{ fontSize: 14, fontWeight: 700, color: text1, marginBottom: 16 }}>General Information</h4>
              <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                <div>
                  <p
                    style={{
                      fontSize: 10,
                      color: text3,
                      textTransform: "uppercase",
                      letterSpacing: "0.08em",
                      marginBottom: 4,
                    }}
                  >
                    Status
                  </p>
                  <p
                    style={{
                      fontSize: 13,
                      fontWeight: 600,
                      color: patient?.status === "Active" ? success : patient?.status === "Urgent" ? danger : text3,
                    }}
                  >
                    {patient?.status}
                  </p>
                </div>
                <div>
                  <p
                    style={{
                      fontSize: 10,
                      color: text3,
                      textTransform: "uppercase",
                      letterSpacing: "0.08em",
                      marginBottom: 4,
                    }}
                  >
                    Base Diagnosis
                  </p>
                  <p style={{ fontSize: 13, color: text1, lineHeight: 1.4 }}>{patient?.cond}</p>
                </div>
                <div>
                  <p
                    style={{
                      fontSize: 10,
                      color: text3,
                      textTransform: "uppercase",
                      letterSpacing: "0.08em",
                      marginBottom: 4,
                    }}
                  >
                    Last Visit
                  </p>
                  <p style={{ fontSize: 13, color: text1 }}>{patient?.lastVisit}</p>
                </div>
              </div>
            </GCard>
          </div>
        )}
      </div>

      {/* New Consultation Modal */}
      <AnimatePresence>
        {showModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            style={{
              position: "fixed",
              inset: 0,
              zIndex: 1000,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background: "rgba(0,0,0,0.8)",
              backdropFilter: "blur(8px)",
              padding: 20,
            }}
          >
            <motion.div
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 20 }}
              style={{
                width: "100%",
                maxWidth: 800,
                maxHeight: "90vh",
                overflowY: "auto",
                background: "#12121a",
                border: `1px solid ${glass.borderS}`,
                borderRadius: 24,
                padding: 32,
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 32 }}>
                <div>
                  <h2 style={{ fontSize: 24, fontWeight: 700, color: text1 }}>New Medical Consultation</h2>
                  <p style={{ fontSize: 14, color: text2 }}>Patient: {patient?.name}</p>
                </div>
                <button
                  onClick={() => setShowModal(false)}
                  style={{ background: "none", border: "none", cursor: "pointer", color: text3 }}
                >
                  <Ico name="X" size={24} />
                </button>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 32 }}>
                <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
                  {/* Vital Signs */}
                  <div>
                    <h4
                      style={{
                        fontSize: 12,
                        fontWeight: 700,
                        color: text1,
                        textTransform: "uppercase",
                        marginBottom: 16,
                      }}
                    >
                      Vital Signs
                    </h4>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
                      <div>
                        <p style={{ fontSize: 10, color: text3, marginBottom: 4 }}>Pulse (bpm)</p>
                        <input
                          value={vitals.pulse}
                          onChange={(e) => setVitals({ ...vitals, pulse: e.target.value })}
                          style={{
                            width: "100%",
                            padding: 10,
                            background: glass.input,
                            border: `1px solid ${glass.border}`,
                            borderRadius: 8,
                            color: text1,
                            outline: "none",
                          }}
                        />
                      </div>
                      <div>
                        <p style={{ fontSize: 10, color: text3, marginBottom: 4 }}>Temp (°C)</p>
                        <input
                          value={vitals.temp}
                          onChange={(e) => setVitals({ ...vitals, temp: e.target.value })}
                          style={{
                            width: "100%",
                            padding: 10,
                            background: glass.input,
                            border: `1px solid ${glass.border}`,
                            borderRadius: 8,
                            color: text1,
                            outline: "none",
                          }}
                        />
                      </div>
                      <div>
                        <p style={{ fontSize: 10, color: text3, marginBottom: 4 }}>Weight (kg)</p>
                        <input
                          value={vitals.weight}
                          onChange={(e) => setVitals({ ...vitals, weight: e.target.value })}
                          style={{
                            width: "100%",
                            padding: 10,
                            background: glass.input,
                            border: `1px solid ${glass.border}`,
                            borderRadius: 8,
                            color: text1,
                            outline: "none",
                          }}
                        />
                      </div>
                      <div>
                        <p style={{ fontSize: 10, color: text3, marginBottom: 4 }}>Systolic B.P.</p>
                        <input
                          value={vitals.bpS}
                          onChange={(e) => setVitals({ ...vitals, bpS: e.target.value })}
                          style={{
                            width: "100%",
                            padding: 10,
                            background: glass.input,
                            border: `1px solid ${glass.border}`,
                            borderRadius: 8,
                            color: text1,
                            outline: "none",
                          }}
                        />
                      </div>
                      <div>
                        <p style={{ fontSize: 10, color: text3, marginBottom: 4 }}>Diastolic B.P.</p>
                        <input
                          value={vitals.bpD}
                          onChange={(e) => setVitals({ ...vitals, bpD: e.target.value })}
                          style={{
                            width: "100%",
                            padding: 10,
                            background: glass.input,
                            border: `1px solid ${glass.border}`,
                            borderRadius: 8,
                            color: text1,
                            outline: "none",
                          }}
                        />
                      </div>
                      <div>
                        <p style={{ fontSize: 10, color: text3, marginBottom: 4 }}>Height (cm)</p>
                        <input
                          value={vitals.height}
                          onChange={(e) => setVitals({ ...vitals, height: e.target.value })}
                          style={{
                            width: "100%",
                            padding: 10,
                            background: glass.input,
                            border: `1px solid ${glass.border}`,
                            borderRadius: 8,
                            color: text1,
                            outline: "none",
                          }}
                        />
                      </div>
                    </div>
                  </div>

                  {/* Reason and Evolution */}
                  <div>
                    <h4
                      style={{
                        fontSize: 12,
                        fontWeight: 700,
                        color: text1,
                        textTransform: "uppercase",
                        marginBottom: 16,
                      }}
                    >
                      Evaluation
                    </h4>
                    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                      <div>
                        <p style={{ fontSize: 10, color: text3, marginBottom: 4 }}>Reason for Consultation</p>
                        <input
                          value={reason}
                          onChange={(e) => setReason(e.target.value)}
                          placeholder="E.g.: Abdominal pain..."
                          style={{
                            width: "100%",
                            padding: 12,
                            background: glass.input,
                            border: `1px solid ${glass.border}`,
                            borderRadius: 10,
                            color: text1,
                            outline: "none",
                          }}
                        />
                      </div>
                      <div>
                        <p style={{ fontSize: 10, color: text3, marginBottom: 4 }}>Evolution / Clinical Notes</p>
                        <textarea
                          value={evolution}
                          onChange={(e) => setEvolution(e.target.value)}
                          rows={4}
                          style={{
                            width: "100%",
                            padding: 12,
                            background: glass.input,
                            border: `1px solid ${glass.border}`,
                            borderRadius: 10,
                            color: text1,
                            outline: "none",
                            resize: "none",
                          }}
                        />
                      </div>
                    </div>
                  </div>
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
                  {/* ICD-10 Diagnosis */}
                  <div>
                    <h4
                      style={{
                        fontSize: 12,
                        fontWeight: 700,
                        color: text1,
                        textTransform: "uppercase",
                        marginBottom: 16,
                      }}
                    >
                      Diagnosis (ICD-10)
                    </h4>
                    <div style={{ position: "relative" }}>
                      <input
                        value={cieSearch}
                        onChange={(e) => setCieSearch(e.target.value)}
                        placeholder="Search code or disease..."
                        style={{
                          width: "100%",
                          padding: 12,
                          background: glass.input,
                          border: `1px solid ${glass.border}`,
                          borderRadius: 10,
                          color: text1,
                          outline: "none",
                        }}
                      />
                      {cieSearch && (
                        <div
                          style={{
                            position: "absolute",
                            top: "100%",
                            left: 0,
                            right: 0,
                            zIndex: 10,
                            background: "#1a1a24",
                            border: `1px solid ${glass.border}`,
                            borderRadius: 10,
                            marginTop: 4,
                            overflow: "hidden",
                          }}
                        >
                          {filteredCIE.map((c) => (
                            <button
                              key={c.code}
                              onClick={() => {
                                setDiagnosis(`${c.code} - ${c.description}`);
                                setCieSearch("");
                              }}
                              style={{
                                width: "100%",
                                padding: "10px 14px",
                                textAlign: "left",
                                background: "none",
                                border: "none",
                                borderBottom: `1px solid ${glass.border}`,
                                color: text1,
                                fontSize: 12,
                                cursor: "pointer",
                              }}
                            >
                              <span style={{ fontWeight: 700, color: text1 }}>{c.code}</span> - {c.description}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                    {diagnosis && (
                      <div
                        style={{
                          marginTop: 12,
                          padding: "8px 12px",
                          borderRadius: 8,
                          background: success + "11",
                          border: `1px solid ${success}33`,
                          color: success,
                          fontSize: 12,
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                        }}
                      >
                        {diagnosis}
                        <button
                          onClick={() => setDiagnosis("")}
                          style={{ background: "none", border: "none", cursor: "pointer", color: success }}
                        >
                          <Ico name="X" size={14} />
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Prescription */}
                  <div>
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        marginBottom: 16,
                      }}
                    >
                      <h4 style={{ fontSize: 12, fontWeight: 700, color: text1, textTransform: "uppercase" }}>
                        Prescription / Treatment
                      </h4>
                      <button
                        onClick={addPrescriptionItem}
                        style={{
                          background: "none",
                          border: "none",
                          color: text1,
                          fontSize: 11,
                          fontWeight: 700,
                          cursor: "pointer",
                          display: "flex",
                          alignItems: "center",
                          gap: 4,
                        }}
                      >
                        <Ico name="Plus" size={14} /> Add Medication
                      </button>
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                      {prescription.map((item, idx) => (
                        <div
                          key={idx}
                          style={{
                            background: glass.input,
                            border: `1px solid ${glass.border}`,
                            borderRadius: 12,
                            padding: 12,
                            position: "relative",
                          }}
                        >
                          <button
                            onClick={() => removePrescriptionItem(idx)}
                            style={{
                              position: "absolute",
                              right: 8,
                              top: 8,
                              background: "none",
                              border: "none",
                              color: danger,
                              cursor: "pointer",
                            }}
                          >
                            <Ico name="Trash2" size={14} />
                          </button>
                          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 8 }}>
                            <div style={{ position: "relative" }}>
                              <input
                                placeholder="Medication"
                                value={item.medication}
                                onFocus={() => setActiveMedSearchIndex(idx)}
                                onBlur={() => setTimeout(() => setActiveMedSearchIndex(null), 200)}
                                onChange={(e) => updatePrescriptionItem(idx, "medication", e.target.value)}
                                style={{
                                  width: "100%",
                                  background: "none",
                                  border: "none",
                                  borderBottom: `1px solid ${glass.border}`,
                                  color: text1,
                                  fontSize: 12,
                                  padding: 4,
                                  outline: "none",
                                }}
                              />
                              {activeMedSearchIndex === idx && item.medication.length >= 2 && (
                                <div
                                  style={{
                                    position: "absolute",
                                    top: "100%",
                                    left: 0,
                                    right: 0,
                                    zIndex: 20,
                                    background: "#1a1a24",
                                    border: `1px solid ${glass.border}`,
                                    borderRadius: 10,
                                    marginTop: 4,
                                    overflow: "hidden",
                                    boxShadow: "0 4px 20px rgba(0,0,0,0.5)",
                                  }}
                                >
                                  {MEDICATIONS_COMMON.filter((m) =>
                                    m.toLowerCase().includes(item.medication.toLowerCase()),
                                  )
                                    .slice(0, 5)
                                    .map((m) => (
                                      <button
                                        key={m}
                                        onClick={() => {
                                          updatePrescriptionItem(idx, "medication", m);
                                          setActiveMedSearchIndex(null);
                                        }}
                                        style={{
                                          width: "100%",
                                          padding: "8px 12px",
                                          textAlign: "left",
                                          background: "none",
                                          border: "none",
                                          borderBottom: `1px solid ${glass.border}`,
                                          color: text1,
                                          fontSize: 11,
                                          cursor: "pointer",
                                        }}
                                      >
                                        {m}
                                      </button>
                                    ))}
                                </div>
                              )}
                            </div>
                            <input
                              placeholder="Dose"
                              value={item.dose}
                              onChange={(e) => updatePrescriptionItem(idx, "dose", e.target.value)}
                              style={{
                                background: "none",
                                border: "none",
                                borderBottom: `1px solid ${glass.border}`,
                                color: text1,
                                fontSize: 12,
                                padding: 4,
                                outline: "none",
                              }}
                            />
                          </div>
                          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                            <input
                              placeholder="Frequency"
                              value={item.frequency}
                              onChange={(e) => updatePrescriptionItem(idx, "frequency", e.target.value)}
                              style={{
                                background: "none",
                                border: "none",
                                borderBottom: `1px solid ${glass.border}`,
                                color: text1,
                                fontSize: 12,
                                padding: 4,
                                outline: "none",
                              }}
                            />
                            <input
                              placeholder="Duration"
                              value={item.duration}
                              onChange={(e) => updatePrescriptionItem(idx, "duration", e.target.value)}
                              style={{
                                background: "none",
                                border: "none",
                                borderBottom: `1px solid ${glass.border}`,
                                color: text1,
                                fontSize: 12,
                                padding: 4,
                                outline: "none",
                              }}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              <div style={{ marginTop: 40, display: "flex", gap: 16, justifyContent: "flex-end" }}>
                <button
                  onClick={() => setShowModal(false)}
                  style={{
                    padding: "12px 24px",
                    borderRadius: 12,
                    background: "none",
                    border: `1px solid ${glass.border}`,
                    color: text2,
                    fontWeight: 700,
                    cursor: "pointer",
                  }}
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveConsultation}
                  style={{
                    padding: "12px 32px",
                    borderRadius: 12,
                    background: "rgba(255,255,255,0.95)",
                    color: "#000",
                    fontWeight: 700,
                    border: "none",
                    cursor: "pointer",
                    boxShadow: glass.shadow,
                  }}
                >
                  Save Consultation
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
