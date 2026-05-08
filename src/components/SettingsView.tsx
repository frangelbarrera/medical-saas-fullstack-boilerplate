import React, { useState, useEffect } from "react";
import { toast } from "sonner";
import { api } from "../lib/api";
import { useAuth } from "../App";
import { GCard } from "./GCard";
import { Ico } from "./Ico";
import { accent, success, text1, text2, text3, glass, danger } from "../theme";

export function SettingsView() {
  const { clinicId } = useAuth();
  const [clinic, setClinic] = useState<any>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isPopulating, setIsPopulating] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  useEffect(() => {
    if (!clinicId) return;
    const fetchClinic = async () => {
      try {
        const data = await api.clinics.get(clinicId);
        setClinic(data);
      } catch (error) {
        toast.error("Error fetching clinic settings.");
        console.error("Error fetching clinic:", error);
      }
    };
    fetchClinic();
  }, [clinicId]);

  const handleSave = async () => {
    if (!clinic || !clinicId) return;
    setIsSaving(true);
    try {
      await api.clinics.update(clinicId, clinic);
      setSaveSuccess(true);
      toast.success("Settings saved successfully.");
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (error) {
      toast.error("Error updating clinic.");
      console.error("Error updating clinic:", error);
    } finally {
      setIsSaving(false);
    }
  };

  const handlePopulate = async () => {
    if (!clinicId) return;
    
    setIsPopulating(true);
    const loadingToast = toast.loading("Populating database with clinical data...");
    try {
      await api.admin.populateDatabase(clinicId);
      toast.success("Database populated successfully! Please navigate to Dashboard to see changes.", { id: loadingToast });
    } catch (error: any) {
      toast.error(error.message || "Failed to populate database.", { id: loadingToast });
    } finally {
      setIsPopulating(false);
    }
  };

  if (!clinic) return <div style={{ color: text2, padding: 24 }}>Loading settings...</div>;

  return (
    <div style={{ maxWidth: 800, margin: "0 auto", padding: 24 }}>
      <div style={{ marginBottom: 32 }}>
        <h2 style={{ fontSize: 24, fontWeight: 700, color: text1 }}>Clinic Settings</h2>
        <p style={{ color: text2, marginTop: 4 }}>Manage your medical center's public and contact information.</p>
      </div>

      <div style={{ display: "grid", gap: 24 }}>
        <GCard style={{ padding: 24 }}>
          <div style={{ display: "flex", gap: 24, alignItems: "center", marginBottom: 32 }}>
            <div style={{ position: "relative" }}>
              <img src={clinic.logo || "https://picsum.photos/seed/clinic/200/200"} alt="Logo" style={{ width: 100, height: 100, borderRadius: 20, objectFit: "cover", border: `2px solid ${glass.border}` }} referrerPolicy="no-referrer" />
              <button style={{ position: "absolute", bottom: -8, right: -8, width: 32, height: 32, borderRadius: "50%", background: accent, border: "none", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
                <Ico name="Camera" size={16} color="#000" />
              </button>
            </div>
            <div>
              <p style={{ fontSize: 18, fontWeight: 700, color: text1 }}>Clinic Logo</p>
              <p style={{ fontSize: 13, color: text2, marginTop: 4 }}>It will be displayed on prescriptions, invoices, and reports.</p>
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
            <Field label="Clinic Name" value={clinic.name || ""} onChange={(v: string) => setClinic({ ...clinic, name: v })} />
            <Field label="Email Address" value={clinic.email || ""} onChange={(v: string) => setClinic({ ...clinic, email: v })} />
            <Field label="Contact Phone" value={clinic.phone || ""} onChange={(v: string) => setClinic({ ...clinic, phone: v })} />
            <Field label="Physical Address" value={clinic.address || ""} onChange={(v: string) => setClinic({ ...clinic, address: v })} />
          </div>
        </GCard>

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 12 }}>
          {saveSuccess && (
            <div style={{ display: "flex", alignItems: "center", gap: 8, color: success, fontSize: 14, fontWeight: 600 }}>
              <Ico name="CheckCircle" size={18} /> Changes saved
            </div>
          )}
          <button
            onClick={handleSave}
            disabled={isSaving}
            style={{
              padding: "12px 322px", borderRadius: 12, background: accent, color: "#1a0e00",
              fontWeight: 700, border: "none", cursor: isSaving ? "not-allowed" : "pointer",
              opacity: isSaving ? 0.7 : 1, transition: "all 0.2s"
            }}
          >
            {isSaving ? "Saving..." : "Save Changes"}
          </button>
        </div>

        {/* Developer Tools Section */}
        <div style={{ marginTop: 40, borderTop: `1px solid ${glass.border}`, paddingTop: 32 }}>
          <div style={{ marginBottom: 20 }}>
            <h3 style={{ fontSize: 18, fontWeight: 700, color: danger }}>Developer Tools</h3>
            <p style={{ color: text2, fontSize: 13, marginTop: 4 }}>Utilities for functional testing and debugging.</p>
          </div>
          
          <GCard style={{ padding: 24, border: `1px solid ${danger}33`, background: `${danger}08` }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div>
                <p style={{ fontSize: 14, fontWeight: 700, color: text1 }}>Populate Database</p>
                <p style={{ fontSize: 12, color: text2, marginTop: 4 }}>Inject synthetic records, patients, and history. Clears on logout.</p>
              </div>
              <button 
                onClick={handlePopulate}
                disabled={isPopulating}
                style={{ 
                  padding: "10px 20px", borderRadius: 10, background: danger, color: "#fff", 
                  fontWeight: 600, border: "none", cursor: isPopulating ? "not-allowed" : "pointer",
                  fontSize: 12, transition: "all 0.2s", opacity: isPopulating ? 0.7 : 1
                }}
              >
                {isPopulating ? "Populating..." : "Populate with Test Data"}
              </button>
            </div>
          </GCard>
        </div>
      </div>
    </div>
  );
}

function Field({ label, value, onChange }: any) {
  return (
    <div>
      <p style={{ fontSize: 11, fontWeight: 700, color: text3, marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.05em" }}>{label}</p>
      <input
        value={value}
        onChange={e => onChange(e.target.value)}
        style={{
          width: "100%", padding: "12px 16px", background: glass.input, border: `1px solid ${glass.border}`,
          borderRadius: 12, color: text1, outline: "none", fontSize: 14, transition: "border-color 0.2s"
        }}
        onFocus={e => e.currentTarget.style.borderColor = accent}
        onBlur={e => e.currentTarget.style.borderColor = glass.border}
      />
    </div>
  );
}
