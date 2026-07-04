import React, { useState, useEffect } from "react";
import { api } from "../lib/api";
import { useAuth } from "../App";
import { GCard } from "./GCard";
import { Ico } from "./Ico";
import { Patient, VitalSigns, PrescriptionItem } from "../lib/types";
import { accent, accentB, danger, success, text1, text2, text3, glass } from "../theme";
import { CIE10_COMMON } from "../lib/cie10";
import { MEDICATIONS_COMMON } from "../lib/medications";
import { motion, AnimatePresence } from "motion/react";
import { AIScribe } from "./AIScribe";

interface Props {
  patientId?: string | null;
  onSelectPatient: (id: string) => void;
  onCancel?: () => void;
}

export function ConsultationView({ patientId, onSelectPatient, onCancel }: Props) {
  const { clinicId, user } = useAuth();
  const [patientSearch, setPatientSearch] = useState("");
  const [patientResults, setPatientResults] = useState<Patient[]>([]);
  const [isSearchingPatients, setIsSearchingPatients] = useState(false);
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);
  const [loadingPatient, setLoadingPatient] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Form State
  const [reason, setReason] = useState("");
  const [evolution, setEvolution] = useState("");
  const [vitals, setVitals] = useState<VitalSigns>({
    pulse: "",
    temp: "",
    bpS: "",
    bpD: "",
    weight: "",
    height: "",
    saturation: "",
    respiratoryRate: "",
    bmi: "",
  });
  const [diagnosis, setDiagnosis] = useState("");
  const [prescription, setPrescription] = useState<PrescriptionItem[]>([]);
  const [cieSearch, setCieSearch] = useState("");
  const [activeMedSearchIndex, setActiveMedSearchIndex] = useState<number | null>(null);
  const [showAIScribe, setShowAIScribe] = useState(false);

  useEffect(() => {
    if (patientId) {
      const fetchPatient = async () => {
        setLoadingPatient(true);
        try {
          const p = await api.patients.get(patientId);
          setSelectedPatient(p);
        } catch (error) {
          console.error("Error fetching patient:", error);
        } finally {
          setLoadingPatient(false);
        }
      };
      fetchPatient();
    } else {
      setSelectedPatient(null);
    }
  }, [patientId]);

  useEffect(() => {
    if (patientSearch.length < 2) {
      setPatientResults([]);
      return;
    }

    const delayDebounceFn = setTimeout(async () => {
      if (!clinicId) return;
      setIsSearchingPatients(true);
      try {
        const allPatients = await api.patients.list(clinicId);
        const searchLower = patientSearch.toLowerCase();
        const results = allPatients
          .filter((p: any) => p.name?.toLowerCase().includes(searchLower) || p.dni?.includes(patientSearch))
          .slice(0, 5);
        setPatientResults(results);
      } catch (error) {
        console.error("Error searching patients:", error);
      } finally {
        setIsSearchingPatients(false);
      }
    }, 300);

    return () => clearTimeout(delayDebounceFn);
  }, [patientSearch, clinicId]);

  useEffect(() => {
    const w = parseFloat(vitals.weight);
    const h = parseFloat(vitals.height) / 100;
    if (w > 0 && h > 0) {
      const bmiValue = (w / (h * h)).toFixed(1);
      if (vitals.bmi !== bmiValue) {
        setVitals((prev) => ({ ...prev, bmi: bmiValue }));
      }
    }
  }, [vitals.weight, vitals.height]);

  const handleSaveConsultation = async () => {
    const pId = patientId || selectedPatient?.id;
    const finalDiagnosis = diagnosis || cieSearch;

    if (!reason || !finalDiagnosis || !clinicId || !pId) {
      console.warn("Missing required fields for consultation:", { reason, finalDiagnosis, clinicId, pId });
      return;
    }

    setIsSaving(true);
    try {
      const consultationData = {
        date: new Date().toISOString(),
        reason,
        evolution,
        vital_signs: vitals,
        diagnosis_cie10: finalDiagnosis,
        prescription,
        clinicId,
        doctorId: user?.id,
        doctorName: user?.name || "Doctor",
        createdAt: new Date().toISOString(),
      };

      await api.patients.createConsultation(pId, consultationData);

      // Update patient's latest vitals and last visit
      await api.patients.update(pId, {
        latestVitals: vitals,
        lastVisit: new Date().toLocaleDateString("en-US", { day: "numeric", month: "long", year: "numeric" }),
        status: "Active",
      });

      onSelectPatient(pId); // Go back to patient history
    } catch (error) {
      console.error("Error in handleSaveConsultation:", error);
    } finally {
      setIsSaving(false);
    }
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

  const handleAIResult = (result: any) => {
    if (result.reason) setReason(result.reason);
    if (result.evolution) setEvolution(result.evolution);
    if (result.vital_signs) setVitals(result.vital_signs);
    if (result.diagnosis_cie10) setDiagnosis(result.diagnosis_cie10);
    if (result.prescription) setPrescription(result.prescription);
    setShowAIScribe(false);
  };

  if (loadingPatient) return <div style={{ padding: 40, color: text2 }}>Loading patient...</div>;

  if (selectedPatient) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        style={{ maxWidth: 1000, margin: "0 auto", padding: "20px 0" }}
      >
        <GCard style={{ padding: 32 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
            <div>
              <h2 style={{ fontSize: 24, fontWeight: 700, color: text1 }}>New Medical Consultation</h2>
              <p style={{ fontSize: 14, color: text2 }}>
                Patient: <span style={{ fontWeight: 700, color: text1 }}>{selectedPatient.name}</span> • ID:{" "}
                {selectedPatient.dni}
              </p>
            </div>
            <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
              {onCancel && (
                <button
                  onClick={onCancel}
                  style={{ background: "none", border: "none", cursor: "pointer", color: text3 }}
                >
                  <Ico name="X" size={24} />
                </button>
              )}
            </div>
          </div>

          <AnimatePresence mode="wait">
            {!showAIScribe ? (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                style={{
                  marginBottom: 32,
                  padding: "20px",
                  borderRadius: 16,
                  background: "linear-gradient(135deg, rgba(99, 102, 241, 0.1) 0%, rgba(168, 85, 247, 0.1) 100%)",
                  border: `1px solid ${accent}33`,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 20,
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                  <div
                    style={{
                      width: 48,
                      height: 48,
                      borderRadius: 12,
                      background: "#fff",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
                    }}
                  >
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 3 }}>
                      <div style={{ display: "flex", gap: 6 }}>
                        <div style={{ width: 6, height: 8, borderRadius: "50%", background: "#1a202c" }} />
                        <div style={{ width: 6, height: 8, borderRadius: "50%", background: "#1a202c" }} />
                      </div>
                      <svg width="14" height="7" viewBox="0 0 22 10" fill="none">
                        <path
                          d="M4 2C6 5.5 10 7 11 7C12 7 16 5.5 18 2"
                          stroke="#1a202c"
                          strokeWidth="3"
                          strokeLinecap="round"
                        />
                      </svg>
                    </div>
                  </div>
                  <div>
                    <h4 style={{ fontSize: 16, fontWeight: 700, color: text1 }}>Proactive Clinical AI</h4>
                    <p style={{ fontSize: 13, color: text2 }}>
                      Start the AI Scribe to automatically transcribe and complete the medical record.
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setShowAIScribe(true)}
                  style={{
                    padding: "12px 24px",
                    borderRadius: 12,
                    background: "#fff",
                    color: "#000",
                    fontSize: 14,
                    fontWeight: 800,
                    cursor: "pointer",
                    border: "none",
                    boxShadow: "0 4px 12px rgba(0,0,0,0.3)",
                    transition: "all 0.2s",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.transform = "scale(1.05)";
                    e.currentTarget.style.boxShadow = "0 6px 16px rgba(0,0,0,0.4)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.transform = "scale(1)";
                    e.currentTarget.style.boxShadow = "0 4px 12px rgba(0,0,0,0.3)";
                  }}
                >
                  Activate AI Scribe
                </button>
              </motion.div>
            ) : (
              <motion.div
                key="ai-scribe-active"
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                style={{ marginBottom: 32, overflow: "hidden" }}
              >
                <AIScribe onResult={handleAIResult} onCancel={() => setShowAIScribe(false)} />
              </motion.div>
            )}
          </AnimatePresence>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 40 }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
              {/* Vital Signs */}
              <div>
                <h4
                  style={{ fontSize: 12, fontWeight: 700, color: text1, textTransform: "uppercase", marginBottom: 16 }}
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
                    <p style={{ fontSize: 10, color: text3, marginBottom: 4 }}>Systolic BP</p>
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
                    <p style={{ fontSize: 10, color: text3, marginBottom: 4 }}>Diastolic BP</p>
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
                  <div>
                    <p style={{ fontSize: 10, color: text3, marginBottom: 4 }}>Saturation (%)</p>
                    <input
                      value={vitals.saturation}
                      onChange={(e) => setVitals({ ...vitals, saturation: e.target.value })}
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
                    <p style={{ fontSize: 10, color: text3, marginBottom: 4 }}>Resp. Rate (rpm)</p>
                    <input
                      value={vitals.respiratoryRate}
                      onChange={(e) => setVitals({ ...vitals, respiratoryRate: e.target.value })}
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
                    <p style={{ fontSize: 10, color: text3, marginBottom: 4 }}>BMI</p>
                    <input
                      value={vitals.bmi}
                      readOnly
                      style={{
                        width: "100%",
                        padding: 10,
                        background: glass.input,
                        border: `1px solid ${glass.border}`,
                        borderRadius: 8,
                        color: text1,
                        fontWeight: 700,
                        outline: "none",
                        opacity: 0.8,
                      }}
                    />
                  </div>
                </div>
              </div>

              {/* Reason and Evolution */}
              <div>
                <h4
                  style={{ fontSize: 12, fontWeight: 700, color: text1, textTransform: "uppercase", marginBottom: 16 }}
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
                      rows={6}
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
                  style={{ fontSize: 12, fontWeight: 700, color: text1, textTransform: "uppercase", marginBottom: 16 }}
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
                        background: "rgba(18,18,26,0.98)",
                        border: `1px solid ${glass.borderS}`,
                        borderRadius: 10,
                        marginTop: 4,
                        overflow: "hidden",
                        backdropFilter: "blur(24px)",
                        boxShadow: "0 10px 30px rgba(0,0,0,0.5)",
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
                  style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}
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
                              {MEDICATIONS_COMMON.filter((m) => m.toLowerCase().includes(item.medication.toLowerCase()))
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

          <div style={{ marginTop: 48, display: "flex", gap: 16, justifyContent: "flex-end" }}>
            {onCancel && (
              <button
                onClick={onCancel}
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
            )}
            <button
              onClick={handleSaveConsultation}
              disabled={isSaving}
              style={{
                padding: "12px 40px",
                borderRadius: 12,
                background: isSaving ? text3 : "rgba(255,255,255,0.95)",
                color: "#000",
                fontWeight: 700,
                border: "none",
                cursor: isSaving ? "not-allowed" : "pointer",
                boxShadow: glass.shadow,
                display: "flex",
                alignItems: "center",
                gap: 8,
              }}
            >
              {isSaving ? (
                <>
                  <div
                    style={{
                      width: 14,
                      height: 14,
                      border: "2px solid rgba(0,0,0,0.1)",
                      borderTopColor: "#000",
                      borderRadius: "50%",
                      animation: "spin 1s linear infinite",
                    }}
                  />
                  Saving...
                </>
              ) : (
                "Save Consultation"
              )}
            </button>
          </div>
        </GCard>
      </motion.div>
    );
  }

  return (
    <div style={{ maxWidth: 800, margin: "0 auto", paddingTop: 40 }}>
      <GCard style={{ padding: 40, textAlign: "center" }}>
        <div
          style={{
            width: 64,
            height: 64,
            borderRadius: 20,
            background: "rgba(255,255,255,0.05)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            margin: "0 auto 24px",
            border: `1px solid ${glass.border}`,
          }}
        >
          <Ico name="Search" size={32} color={text1} />
        </div>
        <h2 style={{ fontSize: 24, fontWeight: 700, color: text1, marginBottom: 8 }}>New Consultation</h2>
        <p style={{ fontSize: 14, color: text3, marginBottom: 32 }}>
          Search for a patient to start their medical record or view their file.
        </p>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          style={{
            marginBottom: 24,
            padding: "12px 16px",
            borderRadius: 12,
            background: "rgba(99, 102, 241, 0.05)",
            border: `1px solid ${accent}22`,
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
          }}
        >
          <Ico name="Sparkles" size={14} color={accent} />
          <span style={{ fontSize: 11, fontWeight: 600, color: text2, letterSpacing: "0.02em" }}>
            NEW: AI SCRIBE AVAILABLE IN CONSULTATION
          </span>
        </motion.div>

        <div style={{ position: "relative", textAlign: "left" }}>
          <div style={{ position: "absolute", left: 16, top: "50%", transform: "translateY(-50%)" }}>
            <Ico name="Search" size={20} color={text3} />
          </div>
          <input
            value={patientSearch}
            onChange={(e) => setPatientSearch(e.target.value)}
            placeholder="Patient name or ID number..."
            autoFocus
            style={{
              width: "100%",
              padding: "16px 16px 16px 52px",
              fontSize: 16,
              background: glass.input,
              border: `1px solid ${glass.border}`,
              borderRadius: 16,
              color: text1,
              outline: "none",
              fontFamily: "inherit",
              boxSizing: "border-box",
              boxShadow: "0 4px 20px rgba(0,0,0,0.1)",
            }}
          />

          {isSearchingPatients && (
            <div style={{ position: "absolute", right: 16, top: "50%", transform: "translateY(-50%)" }}>
              <div
                style={{
                  width: 16,
                  height: 16,
                  border: "2px solid rgba(255,255,255,0.1)",
                  borderTopColor: accentB,
                  borderRadius: "50%",
                  animation: "spin 1s linear infinite",
                }}
              />
            </div>
          )}
        </div>

        <div style={{ marginTop: 24, display: "flex", flexDirection: "column", gap: 12 }}>
          {patientResults.map((p) => (
            <button
              key={p.id}
              onClick={() => setSelectedPatient(p)}
              style={{
                width: "100%",
                display: "flex",
                alignItems: "center",
                gap: 16,
                padding: 16,
                background: glass.input,
                border: `1px solid ${glass.border}`,
                borderRadius: 16,
                cursor: "pointer",
                textAlign: "left",
                transition: "all 0.2s",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = glass.navItem;
                e.currentTarget.style.borderColor = accentB + "44";
                e.currentTarget.style.transform = "translateY(-2px)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = glass.input;
                e.currentTarget.style.borderColor = glass.border;
                e.currentTarget.style.transform = "translateY(0)";
              }}
            >
              <div
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: 12,
                  background: "rgba(255,255,255,0.05)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 16,
                  fontWeight: 700,
                  color: text1,
                  border: `1px solid ${glass.border}`,
                }}
              >
                {p.name[0]}
              </div>
              <div style={{ flex: 1 }}>
                <p style={{ fontSize: 15, fontWeight: 600, color: text1 }}>{p.name}</p>
                <p style={{ fontSize: 12, color: text3 }}>
                  {(p as any).dni || "No ID"} · {p.age} years
                </p>
              </div>
              <Ico name="ChevronRight" size={18} color={text3} />
            </button>
          ))}

          {patientSearch.length >= 2 && patientResults.length === 0 && !isSearchingPatients && (
            <div style={{ padding: 32, textAlign: "center", opacity: 0.5 }}>
              <Ico name="UserX" size={32} color={text3} style={{ marginBottom: 12 }} />
              <p style={{ fontSize: 14, color: text3 }}>No patients found with that name or ID.</p>
            </div>
          )}
        </div>
      </GCard>
    </div>
  );
}
