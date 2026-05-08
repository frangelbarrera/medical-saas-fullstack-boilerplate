import React, { useState, useEffect } from "react";
import { api } from "../lib/api";
import { useAuth } from "../App";
import { GCard } from "./GCard";
import { Ico } from "./Ico";
import { Patient, Consultation, VitalSigns } from "../lib/types";
import { accent, accentB, danger, success, text1, text2, text3, glass } from "../theme";
import { motion, AnimatePresence } from "motion/react";

interface Props {
  patientId: string;
  onBack: () => void;
  onNewConsultation: (patientId: string) => void;
}

export function MedicalHistoryView({ patientId, onBack, onNewConsultation }: Props) {
  const { clinicId, role } = useAuth();
  const [patient, setPatient] = useState<Patient | null>(null);
  const [consultations, setConsultations] = useState<Consultation[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Editing state
  const [isEditing, setIsEditing] = useState(false);
  const [printingConsultation, setPrintingConsultation] = useState<Consultation | null>(null);
  const [printingSummary, setPrintingSummary] = useState(false);
  const [editData, setEditData] = useState<Partial<Patient>>({});
  const [newAllergy, setNewAllergy] = useState("");
  const [newVaccine, setNewVaccine] = useState({ name: "", date: "", dose: "" });

  const calculateBMI = (weight: string, height: string) => {
    const w = parseFloat(weight);
    const h = parseFloat(height) / 100;
    if (!w || !h) return "--";
    return (w / (h * h)).toFixed(1);
  };

  const addAllergy = () => {
    if (!newAllergy.trim()) return;
    const current = editData.allergiesList || [];
    setEditData({ ...editData, allergiesList: [...current, newAllergy.trim()] });
    setNewAllergy("");
  };

  const removeAllergy = (index: number) => {
    const current = editData.allergiesList || [];
    setEditData({ ...editData, allergiesList: current.filter((_, i) => i !== index) });
  };

  const addVaccine = () => {
    if (!newVaccine.name || !newVaccine.date) return;
    const current = editData.vaccinations || [];
    setEditData({ ...editData, vaccinations: [...current, newVaccine] });
    setNewVaccine({ name: "", date: "", dose: "" });
  };

  const removeVaccine = (index: number) => {
    const current = editData.vaccinations || [];
    setEditData({ ...editData, vaccinations: current.filter((_, i) => i !== index) });
  };

  const handlePrintConsultation = (c: Consultation) => {
    setPrintingConsultation(c);
  };

  const handlePrintSummary = () => {
    setPrintingSummary(true);
  };

  const mockUploadAttachment = () => {
    const name = prompt("File name:");
    if (!name) return;
    
    const newFile = {
      id: Math.random().toString(36).substr(2, 9),
      name: name,
      type: "application/pdf",
      url: "https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf",
      date: new Date().toISOString().split('T')[0],
      size: "1.2 MB"
    };
    
    const current = editData.attachments || [];
    setEditData({ ...editData, attachments: [...current, newFile] });
  };

  const removeAttachment = (id: string) => {
    const current = editData.attachments || [];
    setEditData({ ...editData, attachments: current.filter(f => f.id !== id) });
  };

  useEffect(() => {
    if (!patientId || !clinicId) return;

    const fetchData = async () => {
      try {
        const p = await api.patients.get(patientId);
        setPatient(p);
        setEditData(p);

        const c = await api.patients.getConsultations(patientId);
        setConsultations(c.sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime()));
        setLoading(false);
      } catch (error) {
        console.error("Error fetching medical history:", error);
      }
    };

    fetchData();
  }, [patientId, clinicId]);

  const handleSaveProfile = async () => {
    if (!patientId) return;
    try {
      await api.patients.update(patientId, {
        name: editData.name || "",
        dni: editData.dni || "",
        age: editData.age || 0,
        insurance: editData.insurance || "",
        insuranceStatus: editData.insuranceStatus || "Inactive",
        bloodType: editData.bloodType || "",
        pathologicalHistory: editData.pathologicalHistory || "",
        surgicalHistory: editData.surgicalHistory || "",
        hereditary: editData.hereditary || "",
        allergiesList: editData.allergiesList || [],
        vaccinations: editData.vaccinations || [],
        attachments: editData.attachments || [],
        latestVitals: editData.latestVitals || null,
        lifestyle: editData.lifestyle || {
          smoking: "Never",
          alcohol: "Never",
          activity: "Sedentary",
          sleep: "Good"
        }
      });
      setIsEditing(false);
      setPatient(prev => prev ? { ...prev, ...editData } : null);
    } catch (error) {
      console.error("Error updating patient profile:", error);
    }
  };

  const getLifestyleColor = (type: string, value: string) => {
    if (type === "smoking" || type === "alcohol") {
      if (value === "Frequent") return danger;
      if (value === "Occasional") return accent;
      return success;
    }
    if (type === "activity") {
      if (value === "Active") return success;
      if (value === "Moderate") return accent;
      return danger;
    }
    if (type === "sleep") {
      if (value === "Good") return success;
      if (value === "Regular") return accent;
      return danger;
    }
    return text3;
  };

  const getInsuranceStatusColor = (status?: string) => {
    if (status === "Active") return success;
    if (status === "Pre-authorization") return accent;
    return danger;
  };

  if (role !== "DOCTOR" && role !== "ADMIN") {
    return (
      <GCard style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: 40, textAlign: "center" }}>
        <div>
          <Ico name="ShieldAlert" size={64} color={danger} style={{ marginBottom: 24, opacity: 0.3 }} />
          <h3 style={{ fontSize: 18, fontWeight: 700, color: text2 }}>Access Denied</h3>
          <p style={{ fontSize: 14, color: text3, maxWidth: 300, margin: "12px auto 0" }}>Only authorized medical personnel can access the electronic medical record.</p>
        </div>
      </GCard>
    );
  }

  if (loading && !patient) return <div style={{ padding: 40, color: text2 }}>Loading record...</div>;

  const formatDate = (date: any) => {
    if (!date) return "---";
    try {
      // Handle Firestore Timestamp
      if (date && typeof date === 'object' && 'toDate' in date) {
        return date.toDate().toLocaleDateString("en-US", { day: 'numeric', month: 'long', year: 'numeric' });
      }
      // Handle ISO string or other date formats
      const d = new Date(date);
      if (isNaN(d.getTime())) return "Invalid date";
      return d.toLocaleDateString("en-US", { day: 'numeric', month: 'long', year: 'numeric' });
    } catch (e) {
      console.error("Error formatting date:", e, date);
      return "Date error";
    }
  };

  const latestVitals = patient?.latestVitals || consultations[0]?.vital_signs;

  return (
    <motion.div 
      initial={{ opacity: 0, scale: 0.98 }} 
      animate={{ opacity: 1, scale: 1 }} 
      style={{ height: "100%", display: "flex", flexDirection: "column", gap: 20 }}
    >
      {/* Dashboard Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 20, background: glass.nav, padding: "16px 24px", borderRadius: 16, border: `1px solid ${glass.border}` }}>
        <button onClick={onBack} style={{ background: "rgba(255,255,255,0.05)", border: "none", borderRadius: 12, width: 40, height: 40, cursor: "pointer", color: text1, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <Ico name="ArrowLeft" size={20} />
        </button>
        
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <div style={{ width: 56, height: 56, borderRadius: 16, background: "rgba(255,255,255,0.05)", display: "flex", alignItems: "center", justifyContent: "center", border: `1px solid ${glass.border}` }}>
            <Ico name="User" size={28} color={text1} />
          </div>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              {isEditing ? (
                <input 
                  value={editData.name || ""}
                  onChange={e => setEditData({ ...editData, name: e.target.value })}
                  style={{ fontSize: 22, fontWeight: 800, color: text1, letterSpacing: "-0.02em", background: "transparent", border: "none", borderBottom: `1px solid rgba(255,255,255,0.2)`, outline: "none", width: 250 }}
                />
              ) : (
                <h2 style={{ fontSize: 22, fontWeight: 800, color: text1, letterSpacing: "-0.02em" }}>{patient?.name}</h2>
              )}
              <div style={{ 
                padding: "4px 10px", borderRadius: 20, background: getInsuranceStatusColor(patient?.insuranceStatus) + "22", 
                border: `1px solid ${getInsuranceStatusColor(patient?.insuranceStatus)}44`, 
                color: getInsuranceStatusColor(patient?.insuranceStatus), fontSize: 10, fontWeight: 800, textTransform: "uppercase" 
              }}>
                {patient?.insuranceStatus || "Inactive"}
              </div>
            </div>
            <p style={{ fontSize: 13, color: text2, marginTop: 2 }}>
              <span style={{ color: text3 }}>ID:</span> {isEditing ? (
                <input 
                  value={editData.dni || ""}
                  onChange={e => setEditData({ ...editData, dni: e.target.value })}
                  style={{ background: "transparent", border: "none", color: text1, fontSize: 13, width: 100, outline: "none", borderBottom: `1px solid ${glass.border}` }}
                />
              ) : patient?.dni} • 
              <span style={{ color: text3, marginLeft: 8 }}>Age:</span> {isEditing ? (
                <input 
                  type="number"
                  value={editData.age || ""}
                  onChange={e => setEditData({ ...editData, age: parseInt(e.target.value) })}
                  style={{ background: "transparent", border: "none", color: text1, fontSize: 13, width: 40, outline: "none", borderBottom: `1px solid ${glass.border}` }}
                />
              ) : patient?.age} years • 
              <span style={{ color: text3, marginLeft: 8 }}>Blood:</span> {isEditing ? (
                <select 
                  value={editData.bloodType || ""}
                  onChange={e => setEditData({ ...editData, bloodType: e.target.value })}
                  style={{ background: "transparent", border: "none", color: danger, fontSize: 13, fontWeight: 700, outline: "none", borderBottom: `1px solid ${glass.border}` }}
                >
                  <option value="" style={{ background: "#1a1a24" }}>---</option>
                  {["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"].map(bt => (
                    <option key={bt} value={bt} style={{ background: "#1a1a24" }}>{bt}</option>
                  ))}
                </select>
              ) : <span style={{ color: danger, fontWeight: 700 }}>{patient?.bloodType || "---"}</span>}
            </p>
          </div>
        </div>

        <div style={{ marginLeft: "auto", display: "flex", gap: 12 }}>
          {isEditing && (
            <button 
              onClick={handleSaveProfile}
              style={{ 
                display: "flex", alignItems: "center", gap: 8, padding: "10px 18px", 
                borderRadius: 12, background: success, color: "#000", fontWeight: 800, 
                border: "none", cursor: "pointer", fontSize: 13, boxShadow: `0 8px 20px ${success}44`
              }}
            >
              <Ico name="Check" size={16} /> Save Changes
            </button>
          )}
          <button 
            onClick={() => setIsEditing(!isEditing)} 
            style={{ 
              display: "flex", alignItems: "center", gap: 8, padding: "10px 18px", 
              borderRadius: 12, background: isEditing ? danger + "22" : glass.navItem, color: isEditing ? danger : text1, fontWeight: 700, 
              border: `1px solid ${isEditing ? danger + "44" : glass.border}`, cursor: "pointer", fontSize: 13
            }}
          >
            <Ico name={isEditing ? "X" : "UserPen"} size={16} /> {isEditing ? "Cancel" : "Edit Profile"}
          </button>
          <button 
            onClick={() => onNewConsultation(patientId)} 
            style={{ 
              display: "flex", alignItems: "center", gap: 8, padding: "12px 24px", 
              borderRadius: 12, background: "rgba(255,255,255,0.95)", color: "#000", fontWeight: 800, 
              border: "none", cursor: "pointer", boxShadow: glass.shadow, fontSize: 13
            }}
          >
            <Ico name="Plus" size={18} /> New Consultation
          </button>
          <button 
            onClick={handlePrintSummary}
            style={{ background: "rgba(255,255,255,0.05)", border: "none", borderRadius: 12, width: 44, height: 44, cursor: "pointer", color: text1, display: "flex", alignItems: "center", justifyContent: "center" }}
            title="Print Full History"
          >
            <Ico name="Printer" size={20} />
          </button>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "320px 1fr 340px", gap: 20, flex: 1, overflow: "hidden" }}>
        
        {/* Left Column: Stats & Lifestyle */}
        <div style={{ display: "flex", flexDirection: "column", gap: 20, overflowY: "auto", paddingRight: 4 }}>
          
          {/* Lifestyle Module */}
          <GCard style={{ padding: 20 }}>
            <h3 style={{ fontSize: 14, fontWeight: 800, color: text1, marginBottom: 16, display: "flex", alignItems: "center", gap: 8, textTransform: "uppercase", letterSpacing: "0.05em" }}>
              <Ico name="Leaf" size={16} color={success} /> Lifestyle
            </h3>
            
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {[
                { label: "Smoking", value: (isEditing ? editData.lifestyle?.smoking : patient?.lifestyle?.smoking) || "Never", icon: "Cigarette", key: "smoking", options: ["Never", "Occasional", "Frequent", "Ex-smoker"] },
                { label: "Alcohol", value: (isEditing ? editData.lifestyle?.alcohol : patient?.lifestyle?.alcohol) || "Never", icon: "GlassWater", key: "alcohol", options: ["Never", "Occasional", "Frequent"] },
                { label: "Physical Activity", value: (isEditing ? editData.lifestyle?.activity : patient?.lifestyle?.activity) || "Sedentary", icon: "Dumbbell", key: "activity", options: ["Sedentary", "Moderate", "Active"] },
                { label: "Sleep Quality", value: (isEditing ? editData.lifestyle?.sleep : patient?.lifestyle?.sleep) || "Good", icon: "Moon", key: "sleep", options: ["Good", "Regular", "Bad"] },
              ].map((item, idx) => (
                <div key={idx} style={{ background: "rgba(255,255,255,0.03)", borderRadius: 12, padding: 12, border: `1px solid ${glass.border}` }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <Ico name={item.icon as any} size={14} color={getLifestyleColor(item.key, item.value)} />
                      <p style={{ fontSize: 11, color: text2, fontWeight: 600 }}>{item.label}</p>
                    </div>
                    {!isEditing && (
                      <div style={{ width: 8, height: 8, borderRadius: "50%", background: getLifestyleColor(item.key, item.value), boxShadow: `0 0 8px ${getLifestyleColor(item.key, item.value)}66` }} />
                    )}
                  </div>
                  
                  {isEditing ? (
                    <select 
                      value={item.value}
                      onChange={e => setEditData({
                        ...editData, 
                        lifestyle: { 
                          ...(editData.lifestyle || { smoking: "Never", alcohol: "Never", activity: "Sedentary", sleep: "Good" }), 
                          [item.key]: e.target.value 
                        }
                      })}
                      style={{ width: "100%", padding: "6px 10px", borderRadius: 8, background: "#1a1a24", border: `1px solid ${glass.border}`, color: text1, fontSize: 12, outline: "none" }}
                    >
                      {item.options.map(opt => <option key={opt} value={opt} style={{ background: "#1a1a24" }}>{opt}</option>)}
                    </select>
                  ) : (
                    <p style={{ fontSize: 13, fontWeight: 700, color: text1 }}>{item.value}</p>
                  )}
                </div>
              ))}
            </div>
          </GCard>

          {/* Live Vitals Grid (Compact) */}
          <GCard style={{ padding: 20 }}>
            <h3 style={{ fontSize: 14, fontWeight: 800, color: text1, marginBottom: 16, display: "flex", alignItems: "center", gap: 8, textTransform: "uppercase", letterSpacing: "0.05em" }}>
              <Ico name="Activity" size={16} color={text1} /> Vital Signs
            </h3>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              {isEditing ? (
                <>
                  {[
                    { label: "Systolic BP", key: "bpS", unit: "mmHg" },
                    { label: "Diastolic BP", key: "bpD", unit: "mmHg" },
                    { label: "Pulse", key: "pulse", unit: "bpm" },
                    { label: "Temp", key: "temp", unit: "°C" },
                    { label: "Resp. Rate", key: "respiratoryRate", unit: "rpm" },
                    { label: "Weight", key: "weight", unit: "kg" },
                    { label: "Height", key: "height", unit: "cm" },
                  ].map((v, i) => (
                    <div key={i} style={{ background: "rgba(255,255,255,0.03)", border: `1px solid ${glass.border}`, borderRadius: 10, padding: 10 }}>
                      <p style={{ fontSize: 9, color: text3, textTransform: "uppercase", marginBottom: 4 }}>{v.label}</p>
                      <input 
                        value={(editData.latestVitals as any)?.[v.key] || ""}
                        onChange={e => setEditData({
                          ...editData,
                          latestVitals: {
                            ...(editData.latestVitals || { pulse: "", temp: "", bpS: "", bpD: "", weight: "", height: "" }),
                            [v.key]: e.target.value
                          }
                        })}
                        style={{ width: "100%", background: "transparent", border: "none", color: text1, fontSize: 13, fontWeight: 700, outline: "none" }}
                      />
                    </div>
                  ))}
                  <div style={{ background: "rgba(255,255,255,0.03)", border: `1px solid ${glass.border}`, borderRadius: 10, padding: 10 }}>
                    <p style={{ fontSize: 9, color: text3, textTransform: "uppercase", marginBottom: 4 }}>BMI</p>
                    <p style={{ fontSize: 14, fontWeight: 700, color: text1 }}>
                      {calculateBMI(editData.latestVitals?.weight || "", editData.latestVitals?.height || "")}
                    </p>
                  </div>
                </>
              ) : (
                [
                  { label: "Blood Pressure", value: latestVitals ? `${latestVitals.bpS}/${latestVitals.bpD}` : "--", unit: "mmHg", icon: "Gauge" },
                  { label: "Pulse", value: latestVitals?.pulse || "--", unit: "bpm", icon: "Heart" },
                  { label: "Temp", value: latestVitals?.temp || "--", unit: "°C", icon: "Thermometer" },
                  { label: "Resp. Rate", value: latestVitals?.respiratoryRate || "--", unit: "rpm", icon: "Wind" },
                  { label: "Weight", value: latestVitals?.weight || "--", unit: "kg", icon: "Weight" },
                  { label: "BMI", value: latestVitals ? calculateBMI(latestVitals.weight, latestVitals.height) : "--", unit: "", icon: "Scale", highlight: true },
                ].map((v, i) => (
                  <div key={i} style={{ background: "rgba(255,255,255,0.03)", border: `1px solid ${glass.border}`, borderRadius: 10, padding: 10 }}>
                    <p style={{ fontSize: 9, color: text3, textTransform: "uppercase", marginBottom: 4 }}>{v.label}</p>
                    <p style={{ fontSize: 14, fontWeight: 700, color: text1 }}>{v.value} <span style={{ fontSize: 9, fontWeight: 400, color: text3 }}>{v.unit}</span></p>
                  </div>
                ))
              )}
            </div>
          </GCard>

          {/* Immunizations (Phase 2) */}
          <GCard style={{ padding: 20 }}>
            <h3 style={{ fontSize: 14, fontWeight: 800, color: text1, marginBottom: 16, display: "flex", alignItems: "center", gap: 8, textTransform: "uppercase", letterSpacing: "0.05em" }}>
              <Ico name="Syringe" size={16} color={text1} /> Immunizations
            </h3>
            
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {(isEditing ? editData.vaccinations : patient?.vaccinations)?.map((v, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: "rgba(255,255,255,0.03)", borderRadius: 10, padding: "8px 12px", border: `1px solid ${glass.border}` }}>
                  <div>
                    <p style={{ fontSize: 12, fontWeight: 700, color: text1 }}>{v.name}</p>
                    <p style={{ fontSize: 10, color: text3 }}>{v.date} • {v.dose || "Single dose"}</p>
                  </div>
                  {isEditing && (
                    <button onClick={() => removeVaccine(i)} style={{ background: "none", border: "none", color: danger, cursor: "pointer" }}>
                      <Ico name="Trash2" size={14} />
                    </button>
                  )}
                </div>
              ))}
              
              {isEditing && (
                <div style={{ background: "rgba(255,255,255,0.05)", borderRadius: 10, padding: 12, border: `1px dashed ${accent}44`, marginTop: 8 }}>
                  <input 
                    placeholder="Vaccine..." 
                    value={newVaccine.name}
                    onChange={e => setNewVaccine({...newVaccine, name: e.target.value})}
                    onKeyPress={e => e.key === 'Enter' && addVaccine()}
                    style={{ width: "100%", background: "transparent", border: "none", color: text1, fontSize: 12, marginBottom: 8, borderBottom: `1px solid ${glass.border}` }}
                  />
                  <div style={{ display: "flex", gap: 8 }}>
                    <input 
                      type="date"
                      value={newVaccine.date}
                      onChange={e => setNewVaccine({...newVaccine, date: e.target.value})}
                      onKeyPress={e => e.key === 'Enter' && addVaccine()}
                      style={{ flex: 1, background: "transparent", border: "none", color: text1, fontSize: 11 }}
                    />
                    <input 
                      placeholder="Dose"
                      value={newVaccine.dose}
                      onChange={e => setNewVaccine({...newVaccine, dose: e.target.value})}
                      onKeyPress={e => e.key === 'Enter' && addVaccine()}
                      style={{ width: 60, background: "transparent", border: "none", color: text1, fontSize: 11 }}
                    />
                    <button 
                      onClick={addVaccine} 
                      title="Add Vaccine"
                      style={{ background: accent, border: "none", borderRadius: 6, width: 24, height: 24, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", transition: "transform 0.2s" }}
                      onMouseEnter={e => e.currentTarget.style.transform = "scale(1.1)"}
                      onMouseLeave={e => e.currentTarget.style.transform = "scale(1)"}
                    >
                      <Ico name="Plus" size={14} color="#000" />
                    </button>
                  </div>
                </div>
              )}
              
              {!(isEditing ? editData.vaccinations : patient?.vaccinations)?.length && !isEditing && (
                <p style={{ fontSize: 12, color: text3, textAlign: "center", padding: 10 }}>No vaccine records</p>
              )}
            </div>
          </GCard>
        </div>

        {/* Center Column: Consultation Timeline */}
        <div style={{ display: "flex", flexDirection: "column", gap: 20, overflowY: "auto", paddingRight: 8 }}>
          <div style={{ position: "relative", paddingLeft: 24 }}>
            <div style={{ position: "absolute", left: 7, top: 0, bottom: 0, width: 2, background: glass.border }} />
            
            {consultations.length === 0 ? (
              <GCard style={{ textAlign: "center", padding: 60, color: text3 }}>
                <Ico name="FileText" size={48} color={text3} style={{ marginBottom: 16, opacity: 0.2 }} />
                <p>No consultations recorded.</p>
              </GCard>
            ) : (
              consultations.map((c) => (
                <div key={c.id} style={{ position: "relative", marginBottom: 24 }}>
                  <div style={{ 
                    position: "absolute", left: -21, top: 8, width: 10, height: 10, 
                    borderRadius: "50%", background: "rgba(255,255,255,0.8)", border: `3px solid #12121a`, zIndex: 1 
                  }} />
                  
                  <GCard style={{ background: glass.nav, padding: 20, border: `1px solid ${glass.border}` }}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 12 }}>
                      <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                        <button 
                          onClick={() => handlePrintConsultation(c)}
                          style={{ background: "rgba(255,255,255,0.05)", border: "none", borderRadius: 8, width: 32, height: 32, cursor: "pointer", color: text3, display: "flex", alignItems: "center", justifyContent: "center" }}
                          title="Print Prescription / Report"
                        >
                          <Ico name="Printer" size={16} />
                        </button>
                        <div style={{ textAlign: "left" }}>
                          <h3 style={{ fontSize: 15, fontWeight: 800, color: text1 }}>{c.reason}</h3>
                          <p style={{ fontSize: 11, color: text3, marginTop: 2 }}>{formatDate(c.date)} • {c.doctorName}</p>
                        </div>
                      </div>
                      <div style={{ padding: "4px 10px", borderRadius: 6, background: success + "15", border: `1px solid ${success}33`, color: success, fontSize: 10, fontWeight: 800, height: "fit-content" }}>
                        {c.diagnosis_cie10}
                      </div>
                    </div>
                    <p style={{ fontSize: 13, color: text2, lineHeight: 1.6, marginBottom: 16 }}>{c.evolution}</p>
                    
                    <div style={{ 
                      display: "flex", gap: 16, background: "rgba(0,0,0,0.15)", borderRadius: 10, padding: "10px 16px"
                    }}>
                      {[
                        { l: "BP", v: `${c.vital_signs.bpS}/${c.vital_signs.bpD}` },
                        { l: "PULSE", v: c.vital_signs.pulse },
                        { l: "TEMP", v: c.vital_signs.temp + "°C" },
                        {
                          l: "BMI",
                          v: c.vital_signs.bmi,
                          c: text1,
                        },
                      ].map((v, idx) => (
                        <div key={idx}>
                          <p style={{ fontSize: 8, color: text3, fontWeight: 800, marginBottom: 2 }}>{v.l}</p>
                          <p style={{ fontSize: 12, fontWeight: 700, color: v.c || text1 }}>{v.v}</p>
                        </div>
                      ))}
                    </div>
                  </GCard>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Right Column: Critical Info & Insurance */}
        <div style={{ display: "flex", flexDirection: "column", gap: 20, overflowY: "auto", paddingRight: 4 }}>
          <GCard style={{ borderLeft: `4px solid ${danger}`, padding: 20 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
              <h3 style={{ fontSize: 14, fontWeight: 800, color: danger, display: "flex", alignItems: "center", gap: 8, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                <Ico name="ShieldAlert" size={16} /> Critical Info
              </h3>
              {isEditing && (
                <button onClick={handleSaveProfile} style={{ padding: "6px 14px", borderRadius: 8, background: success, color: "#fff", border: "none", fontSize: 11, fontWeight: 800, cursor: "pointer", boxShadow: `0 4px 12px ${success}44` }}>
                  Save
                </button>
              )}
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              {/* Insurance Status (Edit Mode) */}
              {isEditing && (
                <div>
                  <p style={{ fontSize: 10, color: text3, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6 }}>Insurance Status</p>
                  <select 
                    value={editData.insuranceStatus || "Inactive"} 
                    onChange={e => setEditData({...editData, insuranceStatus: e.target.value as any})}
                    style={{ width: "100%", padding: "8px 12px", borderRadius: 8, background: "#1a1a24", border: `1px solid ${glass.border}`, color: text1, fontSize: 13, outline: "none" }}
                  >
                    <option value="Active" style={{ background: "#1a1a24" }}>Active</option>
                    <option value="Pre-authorization" style={{ background: "#1a1a24" }}>Pre-authorization</option>
                    <option value="Inactive" style={{ background: "#1a1a24" }}>Inactive</option>
                  </select>
                </div>
              )}

              {/* Insurance Name */}
              <div>
                <p style={{ fontSize: 10, color: text3, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6 }}>Insurance / Policy</p>
                {isEditing ? (
                  <input 
                    value={editData.insurance || ""} 
                    onChange={e => setEditData({...editData, insurance: e.target.value})}
                    style={{ width: "100%", padding: "8px 12px", borderRadius: 8, background: glass.input, border: `1px solid ${glass.border}`, color: text1, fontSize: 13 }}
                  />
                ) : (
                  <p style={{ fontSize: 14, color: text1, fontWeight: 700 }}>{patient?.insurance || "Not registered"}</p>
                )}
              </div>

              {/* Allergies */}
              <div>
                <p style={{ fontSize: 10, color: text3, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6 }}>Allergies</p>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: isEditing ? 8 : 0 }}>
                  {(isEditing ? editData.allergiesList : patient?.allergiesList)?.map((a, i) => (
                    <div key={i} style={{ display: "flex", alignItems: "center", gap: 6, padding: "4px 10px", borderRadius: 6, background: danger + "15", border: `1px solid ${danger}33`, color: danger, fontSize: 11, fontWeight: 700 }}>
                      {a}
                      {isEditing && <button onClick={() => removeAllergy(i)} style={{ background: "none", border: "none", color: danger, cursor: "pointer", padding: 0, display: "flex" }}><Ico name="X" size={12} /></button>}
                    </div>
                  ))}
                  {!(isEditing ? editData.allergiesList : patient?.allergiesList)?.length && !isEditing && <p style={{ fontSize: 13, color: text3 }}>None known</p>}
                </div>
                {isEditing && (
                  <div style={{ display: "flex", gap: 8 }}>
                    <input 
                      placeholder="New allergy..."
                      value={newAllergy}
                      onChange={e => setNewAllergy(e.target.value)}
                      onKeyPress={e => e.key === 'Enter' && addAllergy()}
                      style={{ flex: 1, padding: "6px 10px", borderRadius: 8, background: glass.input, border: `1px solid ${glass.border}`, color: text1, fontSize: 12 }}
                    />
                    <button onClick={addAllergy} style={{ padding: "6px", borderRadius: 8, background: "rgba(255,255,255,0.95)", color: "#000", border: "none", cursor: "pointer" }}><Ico name="Plus" size={16} /></button>
                  </div>
                )}
              </div>

              {/* Pathological History */}
              <div>
                <p style={{ fontSize: 10, color: text3, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6 }}>Pathological History</p>
                {isEditing ? (
                  <textarea 
                    value={editData.pathologicalHistory || ""} 
                    onChange={e => setEditData({...editData, pathologicalHistory: e.target.value})}
                    rows={3}
                    style={{ width: "100%", padding: "8px 12px", borderRadius: 8, background: glass.input, border: `1px solid ${glass.border}`, color: text1, fontSize: 12, resize: "none" }}
                  />
                ) : (
                  <p style={{ fontSize: 13, color: text2, lineHeight: 1.5 }}>{patient?.pathologicalHistory || "No records"}</p>
                )}
              </div>

              {/* Surgical History */}
              <div>
                <p style={{ fontSize: 10, color: text3, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6 }}>Surgical History</p>
                {isEditing ? (
                  <textarea 
                    value={editData.surgicalHistory || ""} 
                    onChange={e => setEditData({...editData, surgicalHistory: e.target.value})}
                    rows={3}
                    style={{ width: "100%", padding: "8px 12px", borderRadius: 8, background: glass.input, border: `1px solid ${glass.border}`, color: text1, fontSize: 12, resize: "none" }}
                  />
                ) : (
                  <p style={{ fontSize: 13, color: text2, lineHeight: 1.5 }}>{patient?.surgicalHistory || "No records"}</p>
                )}
              </div>

              {/* Hereditary */}
              <div>
                <p style={{ fontSize: 10, color: text3, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6 }}>Hereditary History</p>
                {isEditing ? (
                  <textarea 
                    value={editData.hereditary || ""} 
                    onChange={e => setEditData({...editData, hereditary: e.target.value})}
                    rows={3}
                    style={{ width: "100%", padding: "8px 12px", borderRadius: 8, background: glass.input, border: `1px solid ${glass.border}`, color: text1, fontSize: 12, resize: "none" }}
                  />
                ) : (
                  <p style={{ fontSize: 13, color: text2, lineHeight: 1.5 }}>{patient?.hereditary || "No records"}</p>
                )}
              </div>

              {/* Archivos Adjuntos (Phase 2) */}
              <div style={{ marginTop: 10 }}>
                <h3 style={{ fontSize: 12, fontWeight: 800, color: text1, marginBottom: 12, display: "flex", alignItems: "center", gap: 8, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                  <Ico name="Paperclip" size={14} color={text1} /> Files and Reports
                </h3>
                
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {(isEditing ? editData.attachments : patient?.attachments)?.map((file, i) => (
                    <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, background: "rgba(255,255,255,0.03)", borderRadius: 10, padding: 10, border: `1px solid ${glass.border}` }}>
                      <div style={{ width: 32, height: 32, borderRadius: 8, background: "rgba(255,255,255,0.05)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                        <Ico name={file.type.includes('image') ? "Image" : "FileText"} size={16} color={text3} />
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ fontSize: 12, fontWeight: 600, color: text1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{file.name}</p>
                        <p style={{ fontSize: 9, color: text3 }}>{file.date} • {file.size || "---"}</p>
                      </div>
                      <a href={file.url} target="_blank" rel="noreferrer" style={{ color: accent }}>
                        <Ico name="ExternalLink" size={14} />
                      </a>
                      {isEditing && (
                        <button onClick={() => removeAttachment(file.id)} style={{ background: "none", border: "none", color: danger, cursor: "pointer" }}>
                          <Ico name="Trash2" size={14} />
                        </button>
                      )}
                    </div>
                  ))}
                  
                  {isEditing && (
                    <button 
                      style={{ 
                        width: "100%", padding: "10px", borderRadius: 10, border: `1px dashed ${glass.border}`, 
                        background: "rgba(255,255,255,0.02)", color: text3, fontSize: 11, cursor: "pointer",
                        display: "flex", alignItems: "center", justifyContent: "center", gap: 8
                      }}
                      onClick={mockUploadAttachment}
                    >
                      <Ico name="Upload" size={14} /> Upload Document
                    </button>
                  )}

                  {!(isEditing ? editData.attachments : patient?.attachments)?.length && !isEditing && (
                    <p style={{ fontSize: 12, color: text3, fontStyle: "italic" }}>No attached documents</p>
                  )}
                </div>
              </div>
            </div>
          </GCard>
        </div>
      </div>

      {/* Print Preview Modal */}
      <AnimatePresence>
        {(printingConsultation || printingSummary) && (
          <motion.div 
            initial={{ opacity: 0 }} 
            animate={{ opacity: 1 }} 
            exit={{ opacity: 0 }}
            style={{ 
              position: "fixed", top: 0, left: 0, right: 0, bottom: 0, 
              background: "rgba(0,0,0,0.85)", zIndex: 1000, display: "flex", 
              alignItems: "center", justifyContent: "center", padding: 40 
            }}
          >
            <div style={{ 
              width: "100%", maxWidth: 800, height: "100%", background: "#fff", 
              borderRadius: 8, display: "flex", flexDirection: "column", overflow: "hidden",
              boxShadow: "0 20px 50px rgba(0,0,0,0.5)"
            }}>
              {/* Modal Header (Non-printable) */}
              <div className="no-print" style={{ padding: "16px 24px", borderBottom: "1px solid #eee", display: "flex", justifyContent: "space-between", alignItems: "center", background: "#f8f9fa" }}>
                <h4 style={{ color: "#333", fontWeight: 700 }}>Print Preview</h4>
                <div style={{ display: "flex", gap: 12 }}>
                  <button 
                    onClick={() => window.print()}
                    style={{ padding: "8px 16px", borderRadius: 6, background: accent, color: "#000", border: "none", fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", gap: 8 }}
                  >
                    <Ico name="Printer" size={16} /> Print
                  </button>
                  <button 
                    onClick={() => { setPrintingConsultation(null); setPrintingSummary(false); }}
                    style={{ padding: "8px 16px", borderRadius: 6, background: "#eee", color: "#333", border: "none", fontWeight: 700, cursor: "pointer" }}
                  >
                    Close
                  </button>
                </div>
              </div>

              {/* Printable Content */}
              <div id="printable-report" style={{ flex: 1, padding: 60, overflowY: "auto", color: "#000", fontFamily: "var(--font-sans)" }}>
                {printingSummary ? (
                  <>
                    <div style={{ display: "flex", justifyContent: "space-between", borderBottom: "2px solid #000", paddingBottom: 20, marginBottom: 30 }}>
                      <div>
                        <h1 style={{ fontSize: 24, fontWeight: 800, marginBottom: 4 }}>Medical SaaS Center</h1>
                        <p style={{ fontSize: 12, color: "#666" }}>MEDICAL HISTORY SUMMARY</p>
                      </div>
                      <div style={{ textAlign: "right" }}>
                        <p style={{ fontSize: 14, fontWeight: 700 }}>ISSUE DATE: {new Date().toLocaleDateString()}</p>
                      </div>
                    </div>

                    <div style={{ marginBottom: 30 }}>
                      <h2 style={{ fontSize: 18, fontWeight: 800, borderBottom: "1px solid #eee", paddingBottom: 8, marginBottom: 12 }}>PATIENT INFORMATION</h2>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
                        <p style={{ fontSize: 13 }}><strong>Name:</strong> {patient?.name}</p>
                        <p style={{ fontSize: 13 }}><strong>ID:</strong> {patient?.dni}</p>
                        <p style={{ fontSize: 13 }}><strong>Age:</strong> {patient?.age} years</p>
                        <p style={{ fontSize: 13 }}><strong>Blood Type:</strong> {patient?.bloodType}</p>
                        <p style={{ fontSize: 13 }}><strong>Insurance:</strong> {patient?.insurance} ({patient?.insuranceStatus})</p>
                      </div>
                    </div>

                    <div style={{ marginBottom: 30 }}>
                      <h2 style={{ fontSize: 18, fontWeight: 800, borderBottom: "1px solid #eee", paddingBottom: 8, marginBottom: 12 }}>MEDICAL HISTORY</h2>
                      <p style={{ fontSize: 13, marginBottom: 8 }}><strong>Pathological:</strong> {patient?.pathologicalHistory || "No records"}</p>
                      <p style={{ fontSize: 13, marginBottom: 8 }}><strong>Surgical:</strong> {patient?.surgicalHistory || "No records"}</p>
                      <p style={{ fontSize: 13, marginBottom: 8 }}><strong>Hereditary:</strong> {patient?.hereditary || "No records"}</p>
                      <p style={{ fontSize: 13, marginBottom: 8 }}><strong>Allergies:</strong> {patient?.allergiesList?.join(", ") || "None known"}</p>
                    </div>

                    <div style={{ marginBottom: 30 }}>
                      <h2 style={{ fontSize: 18, fontWeight: 800, borderBottom: "1px solid #eee", paddingBottom: 8, marginBottom: 12 }}>LIFESTYLE</h2>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
                        <p style={{ fontSize: 13 }}><strong>Smoking:</strong> {patient?.lifestyle?.smoking}</p>
                        <p style={{ fontSize: 13 }}><strong>Alcohol:</strong> {patient?.lifestyle?.alcohol}</p>
                        <p style={{ fontSize: 13 }}><strong>Activity:</strong> {patient?.lifestyle?.activity}</p>
                        <p style={{ fontSize: 13 }}><strong>Sleep:</strong> {patient?.lifestyle?.sleep}</p>
                      </div>
                    </div>

                    <div style={{ marginBottom: 30 }}>
                      <h2 style={{ fontSize: 18, fontWeight: 800, borderBottom: "1px solid #eee", paddingBottom: 8, marginBottom: 12 }}>CONSULTATION HISTORY ({consultations.length})</h2>
                      {consultations.map((c, i) => (
                        <div key={i} style={{ marginBottom: 20, padding: 10, border: "1px solid #eee", borderRadius: 4 }}>
                          <p style={{ fontSize: 12, fontWeight: 700 }}>{formatDate(c.date)} - {c.reason}</p>
                          <p style={{ fontSize: 11, color: "#444", marginTop: 4 }}>{c.evolution}</p>
                          <p style={{ fontSize: 11, fontWeight: 700, marginTop: 4 }}>DX: {c.diagnosis_cie10}</p>
                        </div>
                      ))}
                    </div>
                  </>
                ) : printingConsultation && (
                  <>
                    <div style={{ display: "flex", justifyContent: "space-between", borderBottom: "2px solid #000", paddingBottom: 20, marginBottom: 30 }}>
                      <div>
                        <h1 style={{ fontSize: 24, fontWeight: 800, marginBottom: 4 }}>Medical SaaS Center</h1>
                        <p style={{ fontSize: 12, color: "#666" }}>Medical Specialty Center • Tel: (555) 123-4567</p>
                      </div>
                      <div style={{ textAlign: "right" }}>
                        <p style={{ fontSize: 14, fontWeight: 700 }}>DATE: {formatDate(printingConsultation.date)}</p>
                        <p style={{ fontSize: 12, color: "#666" }}>Consultation ID: {printingConsultation.id.slice(0,8)}</p>
                      </div>
                    </div>

                    <div style={{ marginBottom: 30 }}>
                      <h2 style={{ fontSize: 18, fontWeight: 800, borderBottom: "1px solid #eee", paddingBottom: 8, marginBottom: 12 }}>PATIENT DATA</h2>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
                        <p style={{ fontSize: 13 }}><strong>Name:</strong> {patient?.name}</p>
                        <p style={{ fontSize: 13 }}><strong>Age:</strong> {patient?.age} years</p>
                        <p style={{ fontSize: 13 }}><strong>ID:</strong> {patient?.dni}</p>
                        <p style={{ fontSize: 13 }}><strong>Blood Type:</strong> {patient?.bloodType}</p>
                      </div>
                    </div>

                    <div style={{ marginBottom: 30 }}>
                      <h2 style={{ fontSize: 18, fontWeight: 800, borderBottom: "1px solid #eee", paddingBottom: 8, marginBottom: 12 }}>VITAL SIGNS</h2>
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 15 }}>
                        <div><p style={{ fontSize: 10, color: "#666" }}>BLOOD PRESSURE</p><p style={{ fontSize: 14, fontWeight: 700 }}>{printingConsultation.vital_signs.bpS}/{printingConsultation.vital_signs.bpD} <span style={{ fontSize: 10 }}>mmHg</span></p></div>
                        <div><p style={{ fontSize: 10, color: "#666" }}>PULSE</p><p style={{ fontSize: 14, fontWeight: 700 }}>{printingConsultation.vital_signs.pulse} <span style={{ fontSize: 10 }}>bpm</span></p></div>
                        <div><p style={{ fontSize: 10, color: "#666" }}>TEMP</p><p style={{ fontSize: 14, fontWeight: 700 }}>{printingConsultation.vital_signs.temp} <span style={{ fontSize: 10 }}>°C</span></p></div>
                        <div><p style={{ fontSize: 10, color: "#666" }}>WEIGHT</p><p style={{ fontSize: 14, fontWeight: 700 }}>{printingConsultation.vital_signs.weight} <span style={{ fontSize: 10 }}>kg</span></p></div>
                      </div>
                    </div>

                    <div style={{ marginBottom: 30 }}>
                      <h2 style={{ fontSize: 18, fontWeight: 800, borderBottom: "1px solid #eee", paddingBottom: 8, marginBottom: 12 }}>REASON AND EVOLUTION</h2>
                      <p style={{ fontSize: 13, marginBottom: 12 }}><strong>Reason:</strong> {printingConsultation.reason}</p>
                      <p style={{ fontSize: 13, lineHeight: 1.6 }}><strong>Evolution:</strong> {printingConsultation.evolution}</p>
                    </div>

                    <div style={{ marginBottom: 30 }}>
                      <h2 style={{ fontSize: 18, fontWeight: 800, borderBottom: "1px solid #eee", paddingBottom: 8, marginBottom: 12 }}>DIAGNOSIS</h2>
                      <p style={{ fontSize: 14, fontWeight: 700 }}>{printingConsultation.diagnosis_cie10}</p>
                    </div>

                    {printingConsultation.prescription && printingConsultation.prescription.length > 0 && (
                      <div style={{ marginBottom: 40 }}>
                        <h2 style={{ fontSize: 18, fontWeight: 800, borderBottom: "1px solid #eee", paddingBottom: 8, marginBottom: 12 }}>MEDICAL PRESCRIPTION</h2>
                        <table style={{ width: "100%", borderCollapse: "collapse" }}>
                          <thead>
                            <tr style={{ textAlign: "left", borderBottom: "1px solid #000" }}>
                              <th style={{ padding: "8px 0", fontSize: 12 }}>Medication</th>
                              <th style={{ padding: "8px 0", fontSize: 12 }}>Dose</th>
                              <th style={{ padding: "8px 0", fontSize: 12 }}>Frequency</th>
                              <th style={{ padding: "8px 0", fontSize: 12 }}>Duration</th>
                            </tr>
                          </thead>
                          <tbody>
                            {printingConsultation.prescription.map((p, i) => (
                              <tr key={i} style={{ borderBottom: "1px solid #eee" }}>
                                <td style={{ padding: "10px 0", fontSize: 13, fontWeight: 700 }}>{p.medication}</td>
                                <td style={{ padding: "10px 0", fontSize: 13 }}>{p.dose}</td>
                                <td style={{ padding: "10px 0", fontSize: 13 }}>{p.frequency}</td>
                                <td style={{ padding: "10px 0", fontSize: 13 }}>{p.duration}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </>
                )}

                <div style={{ marginTop: 80, display: "flex", justifyContent: "center" }}>
                  <div style={{ textAlign: "center", borderTop: "1px solid #000", width: 250, paddingTop: 10 }}>
                    <p style={{ fontSize: 14, fontWeight: 700 }}>{printingConsultation?.doctorName || "Attending Doctor"}</p>
                    <p style={{ fontSize: 11, color: "#666" }}>Treating Physician</p>
                    <p style={{ fontSize: 10, color: "#999", marginTop: 4 }}>Signature and Stamp</p>
                  </div>
                </div>
              </div>
            </div>

            <style>{`
              @media print {
                body * { visibility: hidden; }
                #printable-report, #printable-report * { visibility: visible; }
                #printable-report { position: absolute; left: 0; top: 0; width: 100%; height: auto; padding: 0; }
                .no-print { display: none !important; }
              }
            `}</style>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
