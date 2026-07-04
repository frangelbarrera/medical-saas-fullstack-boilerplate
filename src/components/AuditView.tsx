import React, { useState, useEffect } from "react";
import { api } from "../lib/api";
import { useAuth } from "../App";
import { GCard } from "./GCard";
import { Ico } from "./Ico";
import { ATag } from "./Tags";
import { AuditLog } from "../lib/types";
import { accent, accentB, danger, success, text1, text2, text3, glass } from "../theme";

export function AuditView() {
  const { clinicId } = useAuth();
  const [auditFeed, setAuditFeed] = useState<AuditLog[]>([]);
  const [selectedLog, setSelectedLog] = useState<any | null>(null);
  const [showTech, setShowTech] = useState(false);

  const renderDetails = (details: any) => {
    if (!details)
      return (
        <div style={{ padding: 12, textAlign: "center", color: text3 }}>
          <p style={{ fontSize: 12 }}>No additional details for this record.</p>
        </div>
      );

    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {/* Finance Summary */}
        {details.amount !== undefined && (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 10,
              background: glass.navItem,
              padding: "10px 14px",
              borderRadius: 10,
              border: `1px solid ${glass.border}`,
            }}
          >
            <div>
              <p style={{ fontSize: 7, fontWeight: 700, color: text3, textTransform: "uppercase", marginBottom: 1 }}>
                Amount
              </p>
              <p style={{ fontSize: 16, fontWeight: 900, color: success }}>${details.amount.toLocaleString()}</p>
              <p style={{ fontSize: 9, color: text2, marginTop: 1 }}>
                Method: {details.paymentMethod || details.category}
              </p>
            </div>
            <div>
              <p style={{ fontSize: 7, fontWeight: 700, color: text3, textTransform: "uppercase", marginBottom: 1 }}>
                Emission Date
              </p>
              <p style={{ fontSize: 12, fontWeight: 700, color: text1 }}>{details.emissionDate}</p>
              <p style={{ fontSize: 9, color: text2, marginTop: 1 }}>Concept: {details.concept}</p>
            </div>
          </div>
        )}

        {/* Patient & Diagnosis Summary */}
        {(details.patientName || details.diagnosis) && (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 10,
              background: glass.navItem,
              padding: "10px 14px",
              borderRadius: 10,
              border: `1px solid ${glass.border}`,
            }}
          >
            {details.patientName && (
              <div>
                <p style={{ fontSize: 7, fontWeight: 700, color: text3, textTransform: "uppercase", marginBottom: 1 }}>
                  Patient
                </p>
                <p style={{ fontSize: 12, fontWeight: 700, color: accent }}>{details.patientName}</p>
                <p style={{ fontSize: 9, color: text2, marginTop: 1 }}>ID: {details.patientDni || details.patientId}</p>
              </div>
            )}
            {details.diagnosis && (
              <div>
                <p style={{ fontSize: 7, fontWeight: 700, color: text3, textTransform: "uppercase", marginBottom: 1 }}>
                  Diagnosis
                </p>
                <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                  <span
                    style={{
                      fontSize: 9,
                      fontWeight: 800,
                      color: "#fff",
                      background: accentB,
                      padding: "1px 4px",
                      borderRadius: 4,
                    }}
                  >
                    {details.diagnosis}
                  </span>
                  <p style={{ fontSize: 10, fontWeight: 600, color: text1 }}>{details.diagnosisDesc}</p>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Clinical Content */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 10 }}>
          {details.reason && (
            <div
              style={{
                background: "rgba(255,255,255,0.02)",
                padding: "10px 14px",
                borderRadius: 10,
                border: `1px solid ${glass.border}`,
              }}
            >
              <p
                style={{
                  fontSize: 7,
                  fontWeight: 700,
                  color: text3,
                  textTransform: "uppercase",
                  marginBottom: 2,
                  display: "flex",
                  alignItems: "center",
                  gap: 4,
                }}
              >
                <Ico name="Stethoscope" size={10} color={accent} /> Reason for Consultation
              </p>
              <p style={{ fontSize: 11, color: text1, lineHeight: 1.3, fontStyle: "italic" }}>"{details.reason}"</p>
            </div>
          )}

          {details.vitals && (
            <div
              style={{
                background: "rgba(255,255,255,0.02)",
                padding: "10px 14px",
                borderRadius: 10,
                border: `1px solid ${glass.border}`,
              }}
            >
              <p style={{ fontSize: 7, fontWeight: 700, color: text3, textTransform: "uppercase", marginBottom: 6 }}>
                Vital Signs
              </p>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8 }}>
                {[
                  { l: "Pulse", v: details.vitals.pulse, u: "bpm" },
                  { l: "Temp", v: details.vitals.temp, u: "°C" },
                  { l: "Systolic", v: details.vitals.bpS, u: "mmHg" },
                  { l: "Diastolic", v: details.vitals.bpD, u: "mmHg" },
                ].map((v) => (
                  <div
                    key={v.l}
                    style={{
                      background: glass.input,
                      padding: 6,
                      borderRadius: 6,
                      textAlign: "center",
                      border: `1px solid ${glass.border}`,
                    }}
                  >
                    <p style={{ fontSize: 6, color: text3, marginBottom: 1 }}>{v.l}</p>
                    <p style={{ fontSize: 11, fontWeight: 800, color: text1 }}>
                      {v.v}
                      <span style={{ fontSize: 7, fontWeight: 400, color: text3, marginLeft: 2 }}>{v.u}</span>
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {details.notes && (
            <div
              style={{
                background: "rgba(255,255,255,0.02)",
                padding: "10px 14px",
                borderRadius: 10,
                border: `1px solid ${glass.border}`,
              }}
            >
              <p style={{ fontSize: 7, fontWeight: 700, color: text3, textTransform: "uppercase", marginBottom: 2 }}>
                Clinical Notes
              </p>
              <p style={{ fontSize: 11, color: text2, lineHeight: 1.4, whiteSpace: "pre-wrap" }}>{details.notes}</p>
            </div>
          )}

          {details.meds && details.meds.length > 0 && (
            <div
              style={{
                background: "rgba(255,255,255,0.02)",
                padding: "10px 14px",
                borderRadius: 10,
                border: `1px solid ${glass.border}`,
              }}
            >
              <p style={{ fontSize: 7, fontWeight: 700, color: text3, textTransform: "uppercase", marginBottom: 4 }}>
                Prescribed Medications ({details.meds.length})
              </p>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                {details.meds.map((m: any, idx: number) => (
                  <div
                    key={idx}
                    style={{
                      background: accent + "12",
                      border: `1px solid ${accent}22`,
                      padding: "3px 8px",
                      borderRadius: 6,
                      display: "flex",
                      alignItems: "center",
                      gap: 4,
                    }}
                  >
                    <Ico name="Pill" size={9} color={accent} />
                    <span style={{ fontSize: 10, fontWeight: 600, color: text1 }}>{m.name}</span>
                    <span style={{ fontSize: 9, color: text3 }}>{m.dose}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    );
  };

  useEffect(() => {
    if (!clinicId) return;

    const fetchLogs = async () => {
      try {
        const logs = await api.auditLogs.list(clinicId);
        setAuditFeed(
          logs.map((l: any) => ({
            id: l.id,
            user: l.userName || "System",
            action: l.action,
            target: l.target || "N/A",
            ip: l.ip || "0.0.0.0",
            ua: l.ua || "N/A",
            time: new Date(l.timestamp).toLocaleString(),
            type: l.type || "info",
            details: l.details ? JSON.parse(l.details) : null,
          })),
        );
      } catch (error) {
        console.error("Error fetching audit logs:", error);
      }
    };

    fetchLogs();
    const interval = setInterval(fetchLogs, 30000);
    return () => clearInterval(interval);
  }, [clinicId]);

  const closeLog = () => {
    setSelectedLog(null);
    setShowTech(false);
  };

  return (
    <GCard style={{ height: "100%", display: "flex", flexDirection: "column", padding: 0, overflow: "hidden" }}>
      <div style={{ padding: "14px 20px", borderBottom: `1px solid ${glass.border}` }}>
        <p style={{ fontSize: 15, fontWeight: 700, color: text1 }}>Audit Logs</p>
        <p style={{ fontSize: 10, color: text2, marginTop: 1 }}>Complete log of system activity</p>
      </div>
      <div
        style={{ flex: 1, overflowY: "auto", padding: "8px 12px", display: "flex", flexDirection: "column", gap: 6 }}
      >
        {auditFeed.map((e, i) => (
          <div
            key={i}
            onClick={() => setSelectedLog(e)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              padding: "10px 14px",
              borderRadius: 10,
              background: e.type === "alert" ? danger + "0d" : glass.input,
              border: `1px solid ${e.type === "alert" ? danger + "44" : glass.border}`,
              transition: "background 0.2s",
              cursor: "pointer",
            }}
            onMouseEnter={(ev) =>
              (ev.currentTarget.style.background = e.type === "alert" ? danger + "18" : glass.cardHov)
            }
            onMouseLeave={(ev) =>
              (ev.currentTarget.style.background = e.type === "alert" ? danger + "0d" : glass.input)
            }
          >
            <ATag type={e.type} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ fontSize: 12, fontWeight: 600, color: text1 }}>
                {e.user} <span style={{ fontWeight: 400, color: text2 }}>— {e.action}</span>
              </p>
              <p style={{ fontSize: 10, color: text3, marginTop: 1 }}>
                Resource:{" "}
                <span style={{ fontWeight: 700, color: text2, fontFamily: "var(--font-sans)" }}>{e.target}</span>
              </p>
            </div>
            <div style={{ textAlign: "right", flexShrink: 0 }}>
              <p style={{ fontSize: 9, color: text2, fontFamily: "var(--font-sans)" }}>{e.ip}</p>
              <p style={{ fontSize: 8, color: text3 }}>{e.ua.substring(0, 20)}...</p>
            </div>
            <span style={{ fontSize: 9, color: text3, width: 50, textAlign: "right", flexShrink: 0 }}>
              {e.time.split(" ")[1]}
            </span>
          </div>
        ))}
      </div>

      {selectedLog && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 1000,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "rgba(0,0,0,0.85)",
            backdropFilter: "blur(12px)",
            padding: 20,
          }}
        >
          <GCard
            style={{
              width: "100%",
              maxWidth: 960,
              maxHeight: "75vh",
              display: "flex",
              flexDirection: "column",
              padding: 0,
              border: `1px solid ${glass.borderS}`,
              boxShadow: "0 32px 80px rgba(0,0,0,0.7)",
              overflow: "hidden",
            }}
          >
            {/* Modal Header */}
            <div
              style={{
                padding: "14px 20px",
                borderBottom: `1px solid ${glass.border}`,
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                background: glass.nav,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: "50%",
                    background:
                      selectedLog.type === "create" ? success : selectedLog.type === "update" ? accent : danger,
                    boxShadow: `0 0 10px ${selectedLog.type === "create" ? success : selectedLog.type === "update" ? accent : danger}66`,
                  }}
                />
                <div>
                  <h3 style={{ fontSize: 15, fontWeight: 800, color: text1, letterSpacing: "-0.02em", margin: 0 }}>
                    Event Details
                  </h3>
                  <p style={{ fontSize: 9, color: text3, marginTop: 1 }}>
                    {selectedLog.action} • {selectedLog.time}
                  </p>
                </div>
              </div>
              <button
                onClick={closeLog}
                style={{
                  background: glass.input,
                  border: `1px solid ${glass.border}`,
                  width: 24,
                  height: 24,
                  borderRadius: 8,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  cursor: "pointer",
                  transition: "all 0.2s",
                }}
              >
                <Ico name="X" color={text1} size={12} />
              </button>
            </div>

            {/* Modal Body */}
            <div style={{ flex: 1, overflowY: "auto", padding: "20px" }}>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr 1fr",
                  gap: 12,
                  marginBottom: 16,
                  paddingBottom: 12,
                  borderBottom: `1px solid ${glass.border}22`,
                }}
              >
                <div>
                  <p
                    style={{
                      fontSize: 7,
                      fontWeight: 700,
                      color: text3,
                      textTransform: "uppercase",
                      letterSpacing: "0.05em",
                      marginBottom: 2,
                    }}
                  >
                    Staff Member
                  </p>
                  <p style={{ fontSize: 11, color: text1, fontWeight: 600 }}>{selectedLog.user}</p>
                </div>
                <div>
                  <p
                    style={{
                      fontSize: 7,
                      fontWeight: 700,
                      color: text3,
                      textTransform: "uppercase",
                      letterSpacing: "0.05em",
                      marginBottom: 2,
                    }}
                  >
                    Affected Resource
                  </p>
                  <p style={{ fontSize: 11, color: text1, fontWeight: 700, fontFamily: "var(--font-sans)" }}>
                    {selectedLog.target}
                  </p>
                </div>
                <div>
                  <p
                    style={{
                      fontSize: 7,
                      fontWeight: 700,
                      color: text3,
                      textTransform: "uppercase",
                      letterSpacing: "0.05em",
                      marginBottom: 2,
                    }}
                  >
                    IP Address
                  </p>
                  <p style={{ fontSize: 11, color: text2, fontFamily: "var(--font-sans)" }}>{selectedLog.ip}</p>
                </div>
              </div>

              {renderDetails(selectedLog.details)}

              {/* Technical Details Toggle */}
              <div style={{ marginTop: 16, borderTop: `1px solid ${glass.border}`, paddingTop: 16 }}>
                <button
                  onClick={() => setShowTech(!showTech)}
                  style={{
                    width: "100%",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "8px 12px",
                    background: glass.input,
                    border: `1px solid ${glass.border}`,
                    borderRadius: 10,
                    cursor: "pointer",
                    color: text2,
                    fontSize: 9,
                    fontWeight: 600,
                    transition: "all 0.2s",
                  }}
                >
                  <span>{showTech ? "Hide" : "Show"} Technical Metadata</span>
                  <Ico name={showTech ? "ChevronUp" : "ChevronDown"} size={10} color={text3} />
                </button>

                {showTech && (
                  <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 8 }}>
                    <div
                      style={{
                        padding: 10,
                        background: "rgba(0,0,0,0.2)",
                        border: `1px solid ${glass.border}`,
                        borderRadius: 8,
                      }}
                    >
                      <p
                        style={{
                          fontSize: 7,
                          fontWeight: 700,
                          color: text3,
                          textTransform: "uppercase",
                          marginBottom: 2,
                        }}
                      >
                        User Agent
                      </p>
                      <p
                        style={{
                          fontSize: 8,
                          color: text3,
                          lineHeight: 1.4,
                          wordBreak: "break-all",
                          fontFamily: "var(--font-sans)",
                        }}
                      >
                        {selectedLog.ua}
                      </p>
                    </div>
                    <div
                      style={{
                        padding: 10,
                        background: "rgba(0,0,0,0.2)",
                        border: `1px solid ${glass.border}`,
                        borderRadius: 8,
                      }}
                    >
                      <p
                        style={{
                          fontSize: 7,
                          fontWeight: 700,
                          color: text3,
                          textTransform: "uppercase",
                          marginBottom: 2,
                        }}
                      >
                        Raw Data
                      </p>
                      <pre
                        style={{
                          fontSize: 8,
                          color: text3,
                          margin: 0,
                          whiteSpace: "pre-wrap",
                          fontFamily: "var(--font-sans)",
                          opacity: 0.6,
                        }}
                      >
                        {JSON.stringify(selectedLog.details, null, 2)}
                      </pre>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Modal Footer */}
            <div
              style={{
                padding: "12px 20px",
                borderTop: `1px solid ${glass.border}`,
                background: glass.nav,
                display: "flex",
                justifyContent: "flex-end",
              }}
            >
              <button
                onClick={closeLog}
                style={{
                  padding: "6px 16px",
                  borderRadius: 8,
                  background: accent,
                  color: "#1a0e00",
                  fontWeight: 800,
                  fontSize: 10,
                  border: "none",
                  cursor: "pointer",
                  boxShadow: `0 4px 12px ${accent}44`,
                  transition: "all 0.2s",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = "translateY(-1px)";
                  e.currentTarget.style.boxShadow = `0 6px 16px ${accent}66`;
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = "none";
                  e.currentTarget.style.boxShadow = `0 4px 12px ${accent}44`;
                }}
              >
                Understood
              </button>
            </div>
          </GCard>
        </div>
      )}
    </GCard>
  );
}
