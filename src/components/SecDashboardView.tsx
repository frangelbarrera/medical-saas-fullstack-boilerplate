import React, { useState, useEffect } from "react";
import { api } from "../lib/api";
import { useAuth } from "../App";
import { GCard } from "./GCard";
import { Ico } from "./Ico";
import { ATag, SPill } from "./Tags";
import { AuditLog } from "../lib/types";
import { accent, accentB, danger, success, text1, text2, text3, glass } from "../theme";

export function SecDashboardView() {
  const { clinicId, loading, user } = useAuth();
  const [auditFeed, setAuditFeed] = useState<AuditLog[]>([]);
  const [stats, setStats] = useState({ appointments: 0, patients: 0, consultations: 0, alerts: 0 });
  const [clinic, setClinic] = useState<any>(null);
  const [todayAppts, setTodayAppts] = useState<any[]>([]);

  useEffect(() => {
    if (!clinicId) return;

    const fetchData = async () => {
      try {
        const today = new Date().toISOString().split("T")[0];

        // For secretary, check managed doctors.
        // If they manage a specific doctor, fetch their appointments.
        const managedIds = (user as any)?.managed_doctor_ids || [];
        const primaryDocId = managedIds.length > 0 ? managedIds[0] : "";

        const [c, s, logs, appts] = await Promise.all([
          api.clinics.get(clinicId),
          api.stats.get(clinicId),
          api.auditLogs.list(clinicId),
          api.appointments.list(clinicId, primaryDocId, today, today),
        ]);
        setClinic(c);
        setStats(s);
        setAuditFeed(
          (logs || []).map((l: any) => ({
            id: l.id || Math.random().toString(),
            user: l.userName || l.user || "System",
            action: l.action || "Activity",
            target: l.target || "N/A",
            ip: l.ip || "0.0.0.0",
            ua: l.ua || "N/A",
            time: l.timestamp ? new Date(l.timestamp).toLocaleTimeString() : "N/A",
            type: l.type || "info",
          })),
        );
        setTodayAppts(
          (appts || [])
            .map((a: any) => ({
              id: a.id || Math.random().toString(),
              time: a.dateTime
                ? new Date(a.dateTime).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
                : "N/A",
              name: a.patientName || a.name || "Patient",
              doc: a.doctorName || a.doctor || "Doctor",
              type: a.type || "Consultation",
              s: a.status === "Urgency" ? "Urgent" : a.status || "Active",
            }))
            .slice(0, 5),
        );
      } catch (error) {
        console.error("Error fetching secretary dashboard data:", error);
      }
    };

    fetchData();
    const interval = setInterval(fetchData, 30000);
    return () => clearInterval(interval);
  }, [clinicId]);

  const metrics = [
    { label: "Today's Appointments", value: stats.appointments, sub: "Scheduled", icon: "Calendar", color: text1 },
    { label: "Total Patients", value: stats.patients, sub: "Registered", icon: "Users", color: text1 },
    { label: "Histories Created", value: stats.consultations, sub: "Today", icon: "ClipboardList", color: text1 },
    {
      label: "Security Alerts",
      value: stats.alerts,
      sub: "Requires attention",
      icon: "ShieldCheck",
      color: danger,
      urgent: stats.alerts > 0,
    },
  ];

  const live = true;

  return (
    <div style={{ display: "flex", gap: 20, height: "100%", overflow: "hidden" }}>
      <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 20, minWidth: 0, overflow: "hidden" }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 14 }}>
          {metrics.map((m) => (
            <GCard
              key={m.label}
              style={{
                padding: "20px 20px 16px",
                position: "relative",
                overflow: "hidden",
                border: m.urgent ? `1px solid ${danger}44` : `1px solid ${glass.border}`,
              }}
            >
              {m.urgent && (
                <div
                  style={{
                    position: "absolute",
                    top: 12,
                    right: 12,
                    width: 8,
                    height: 8,
                    borderRadius: "50%",
                    background: danger,
                    boxShadow: `0 0 8px ${danger}`,
                  }}
                >
                  <div
                    style={{
                      width: "100%",
                      height: "100%",
                      borderRadius: "50%",
                      animation: "ping 1.5s ease-in-out infinite",
                      background: danger + "44",
                    }}
                  />
                </div>
              )}
              <div
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  right: 0,
                  height: 2,
                  background: `linear-gradient(90deg, transparent, rgba(255,255,255,0.2), transparent)`,
                  borderRadius: "16px 16px 0 0",
                }}
              />
              <div
                style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}
              >
                <div
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 10,
                    background: "rgba(255,255,255,0.05)",
                    border: `1px solid ${glass.border}`,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Ico name={m.icon as any} size={16} color={text1} />
                </div>
              </div>
              <p style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.06em", color: text2, marginBottom: 4 }}>
                {m.label.toUpperCase()} (SEC)
              </p>
              <p style={{ fontSize: 30, fontWeight: 700, color: text1, lineHeight: 1, marginBottom: 4 }}>{m.value}</p>
              <p style={{ fontSize: 11, color: m.urgent ? danger : text3 }}>{m.sub}</p>
            </GCard>
          ))}
        </div>

        <GCard style={{ flex: 1, display: "flex", flexDirection: "column", padding: 0, overflow: "hidden" }}>
          <div
            style={{
              padding: "20px 24px 16px",
              borderBottom: `1px solid ${glass.border}`,
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <div>
              <p style={{ fontSize: 15, fontWeight: 600, color: text1 }}>Today's Agenda (Secretariat)</p>
              <p style={{ fontSize: 11, color: text2, marginTop: 2 }}>
                {new Date().toLocaleDateString("en-US", { weekday: "long", day: "numeric", month: "long" })} ·{" "}
                {stats.appointments} appointments scheduled
              </p>
            </div>
          </div>
          <div style={{ flex: 1, overflowY: "auto", padding: "8px 12px" }}>
            {todayAppts.length === 0 ? (
              <div style={{ padding: 24, textAlign: "center", color: text3, fontSize: 13 }}>
                No appointments scheduled for today.
              </div>
            ) : (
              todayAppts.map((a, i) => (
                <div
                  key={a.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 14,
                    padding: "10px 12px",
                    borderRadius: 10,
                    cursor: "pointer",
                    transition: "background 0.2s",
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = glass.navItem)}
                  onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                >
                  <span
                    style={{
                      fontSize: 11,
                      fontWeight: 700,
                      color: text3,
                      width: 42,
                      flexShrink: 0,
                      fontFamily: "var(--font-sans)",
                    }}
                  >
                    {a.time}
                  </span>
                  <div
                    style={{
                      width: 32,
                      height: 32,
                      borderRadius: "50%",
                      flexShrink: 0,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontWeight: 700,
                      fontSize: 12,
                      color: "#fff",
                      background: `hsl(${(a.name.charCodeAt(0) * 23) % 360},55%,45%)`,
                    }}
                  >
                    {a.name[0]}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p
                      style={{
                        fontSize: 13,
                        fontWeight: 600,
                        color: text1,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {a.name}
                    </p>
                    <p style={{ fontSize: 11, color: text2 }}>
                      {a.doc} · {a.type}
                    </p>
                  </div>
                  <SPill s={a.s as any} />
                </div>
              ))
            )}
          </div>
        </GCard>
      </div>

      <GCard
        style={{ width: 280, flexShrink: 0, display: "flex", flexDirection: "column", padding: 0, overflow: "hidden" }}
      >
        <div style={{ padding: "16px 18px 12px", borderBottom: `1px solid ${glass.border}` }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <p style={{ fontSize: 13, fontWeight: 600, color: text1 }}>Clinical Activity</p>
            <span
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                fontSize: 9,
                fontWeight: 700,
                letterSpacing: "0.08em",
                color: success,
                background: success + "18",
                border: `1px solid ${success}44`,
                padding: "3px 8px",
                borderRadius: 99,
              }}
            >
              <span
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: "50%",
                  background: success,
                  boxShadow: `0 0 6px ${success}`,
                  display: "inline-block",
                }}
              />
              LIVE
            </span>
          </div>
          <p style={{ fontSize: 10, color: text3, marginTop: 2 }}>Global activity log</p>
        </div>
        <div style={{ flex: 1, overflowY: "auto", padding: "8px" }}>
          {auditFeed.map((e, i) => (
            <div
              key={e.id}
              style={{
                padding: "10px 10px",
                borderRadius: 10,
                marginBottom: 2,
                background: "transparent",
                border: "1px solid transparent",
                transition: "all 0.5s ease",
                cursor: "default",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 5 }}>
                <span style={{ fontSize: 11, fontWeight: 600, color: text1 }}>{e.user}</span>
                <ATag type={e.type} />
              </div>
              <p style={{ fontSize: 10, color: text2, marginBottom: 4 }}>
                {e.action} · <span style={{ fontWeight: 700, color: text1 }}>{e.target}</span>
              </p>
              <p style={{ fontSize: 9, color: text3 }}>{e.ip}</p>
              <p
                style={{
                  fontSize: 9,
                  color: text3,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {e.ua}
              </p>
              <p style={{ fontSize: 9, color: text3, marginTop: 4 }}>{e.time}</p>
            </div>
          ))}
        </div>
      </GCard>
    </div>
  );
}
