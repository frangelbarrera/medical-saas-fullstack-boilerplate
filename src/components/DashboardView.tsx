import React, { useState, useEffect } from "react";
import { api } from "../lib/api";
import { useAuth } from "../App";
import { GCard } from "./GCard";
import { Ico } from "./Ico";
import { ATag, SPill } from "./Tags";
import { AuditLog } from "../lib/types";
import { accent, accentB, danger, success, text1, text2, text3, glass } from "../theme";
import { ResponsiveContainer, AreaChart, Area, XAxis, Tooltip, YAxis } from "recharts";

const dummyChartData = Array.from({ length: 7 }).map((_, i) => {
  const d = new Date();
  d.setDate(d.getDate() - (6 - i));
  return {
    name: d.toLocaleDateString("en-US", { weekday: "short" }),
    appointments: Math.floor(Math.random() * 20) + 10,
    patients: Math.floor(Math.random() * 10) + 2
  };
});

export function DashboardView() {
  const { clinicId, role, loading, user } = useAuth();
  const [auditFeed, setAuditFeed] = useState<AuditLog[]>([]);
  const [stats, setStats] = useState({ appointments: 0, patients: 0, consultations: 0, alerts: 0 });
  const [clinic, setClinic] = useState<any>(null);
  const [todayAppts, setTodayAppts] = useState<any[]>([]);

  useEffect(() => {
    if (!clinicId) return;

    const fetchData = async () => {
      try {
        const today = new Date().toISOString().split('T')[0];
        
        // Define which doctor's appointments to see
        let apptDoctorId = "";
        if (role === "DOCTOR") apptDoctorId = user?.id || "";
        // For secretary, we could fetch all or specific ones. 
        // For now, let's allow seeing everything or specifically the first managed doctor.
        
        const [c, s, logs, appts] = await Promise.all([
          api.clinics.get(clinicId),
          api.stats.get(clinicId),
          api.auditLogs.list(clinicId),
          api.appointments.list(clinicId, apptDoctorId, today, today)
        ]);
        setClinic(c);
        setStats(s);
        
        // If doctor, only show their own activity in the sidebar if they want privacy, 
        // but usually doctors see their clinic's activity if they are the "owner" role.
        // For this enterprise demo, let's filter if DOCTOR.
        let filteredLogs = logs;
        if (role === "DOCTOR") {
          filteredLogs = logs.filter((l: any) => l.userId === user?.id || l.target === user?.id);
        }

        setAuditFeed((filteredLogs || []).map((l: any) => ({
          id: l.id || Math.random().toString(),
          user: l.userName || l.user || "System",
          action: l.action || "Activity",
          target: l.target || "N/A",
          ip: l.ip || "0.0.0.0",
          ua: l.ua || "N/A",
          time: l.timestamp ? new Date(l.timestamp).toLocaleTimeString() : "N/A",
          type: l.type || "info"
        })));
        setTodayAppts((appts || []).map((a: any) => ({
          id: a.id || Math.random().toString(),
          time: a.dateTime ? new Date(a.dateTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : "N/A",
          name: a.patientName || a.name || "Patient",
          doc: a.doctorName || a.doctor || "Doctor",
          type: a.type || "Consultation",
          s: a.status === "Urgency" ? "Urgent" : (a.status || "Active")
        })));
      } catch (error) {
        console.error("Error fetching dashboard data:", error);
      }
    };

    fetchData();
    const interval = setInterval(fetchData, 30000); // Refresh every 30s
    return () => clearInterval(interval);
  }, [clinicId]);

  const metrics = [
    { label: "Today's Appointments", value: stats.appointments, sub: "Scheduled", icon: "Calendar", color: text1 },
    { label: "Total Patients", value: stats.patients, sub: "Registered", icon: "Users", color: text1 },
    { label: "Consultations Created", value: stats.consultations, sub: "Today", icon: "ClipboardList", color: text1 },
    { label: "Security Alerts", value: stats.alerts, sub: "Requires attention", icon: "ShieldCheck", color: danger, urgent: stats.alerts > 0 },
  ];

  const feed = auditFeed;
  const live = true; // Local version is always "live" in terms of polling

  if (stats.patients === 0 && !loading) {
    return (
      <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center", padding: 40 }}>
        <div style={{ maxWidth: 500, textAlign: "center" }}>
          <div style={{ width: 80, height: 80, borderRadius: 24, background: "rgba(255,255,255,0.05)", border: `1px solid ${glass.border}`, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 24px", boxShadow: glass.shadow }}>
            <Ico name="Sparkles" size={40} color={accent} />
          </div>
          <h2 style={{ fontSize: 28, fontWeight: 900, color: text1, marginBottom: 12, letterSpacing: "-0.03em" }}>Welcome to Medical SaaS</h2>
          <p style={{ color: text2, fontSize: 16, lineHeight: 1.6, marginBottom: 32 }}>
            Your private workspace is ready. As you are the administrator of this clinic, you can start registering patients or use our testing tools.
          </p>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            <GCard style={{ padding: 20, textAlign: "left", cursor: "pointer", transition: "all 0.2s" }} onMouseEnter={e => e.currentTarget.style.borderColor = accent} onMouseLeave={e => e.currentTarget.style.borderColor = glass.border}>
              <Ico name="UserPlus" size={20} color={accent} />
              <p style={{ fontSize: 14, fontWeight: 700, color: text1, marginTop: 12 }}>New Patient</p>
              <p style={{ fontSize: 11, color: text3, marginTop: 4 }}>Start building your history from scratch.</p>
            </GCard>
            <GCard style={{ padding: 20, textAlign: "left", cursor: "pointer", transition: "all 0.2s" }} onMouseEnter={e => e.currentTarget.style.borderColor = danger} onMouseLeave={e => e.currentTarget.style.borderColor = glass.border}>
              <Ico name="Database" size={20} color={danger} />
              <p style={{ fontSize: 14, fontWeight: 700, color: text1, marginTop: 12 }}>Populate Data</p>
              <p style={{ fontSize: 11, color: text3, marginTop: 4 }}>Generate dummy data to test functions.</p>
              <p style={{ fontSize: 9, color: text3, marginTop: 8, fontStyle: "italic" }}>Go to Settings {">"} Tools</p>
            </GCard>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display:"flex", gap:20, height:"100%", overflow:"hidden" }}>
      {/* Main */}
      <div style={{ flex:1, display:"flex", flexDirection:"column", gap:20, minWidth:0, overflow:"hidden" }}>
        {/* Metric Cards */}
        <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:14 }}>
          {metrics.map(m => (
            <GCard key={m.label} style={{ padding:"20px 20px 16px", position:"relative", overflow:"hidden",
              border: m.urgent ? `1px solid ${danger}44` : `1px solid ${glass.border}` }}>
              {m.urgent && (
                <div style={{ position:"absolute", top:12, right:12, width:8, height:8,
                  borderRadius:"50%", background:danger, boxShadow:`0 0 8px ${danger}` }}>
                  <div style={{ width:"100%", height:"100%", borderRadius:"50%",
                    animation:"ping 1.5s ease-in-out infinite", background:danger+"44" }} />
                </div>
              )}
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:12 }}>
                <div style={{ width:36, height:36, borderRadius:10,
                  background: "rgba(255,255,255,0.05)", border:`1px solid ${glass.border}`,
                  display:"flex", alignItems:"center", justifyContent:"center" }}>
                  <Ico name={m.icon as any} size={16} color={text1} />
                </div>
              </div>
              <p style={{ fontSize:11, fontWeight:600, letterSpacing:"0.06em", color:text2, marginBottom:4 }}>{m.label.toUpperCase()}</p>
              <p style={{ fontSize:30, fontWeight:700, color:text1, lineHeight:1, marginBottom:4 }}>{m.value}</p>
              <p style={{ fontSize:11, color: m.urgent ? danger : text3 }}>{m.sub}</p>
            </GCard>
          ))}
        </div>

        {/* Analytics Chart */}
        <GCard style={{ height: 260, padding: "20px 24px", display: "flex", flexDirection: "column" }}>
          <div style={{ marginBottom: 16 }}>
            <p style={{ fontSize: 13, fontWeight: 700, color: text1, letterSpacing: "-0.01em" }}>Activity Overview</p>
            <p style={{ fontSize: 11, color: text3, marginTop: 2 }}>Appointments vs New Patients over the last 7 days</p>
          </div>
          <div style={{ flex: 1, width: "100%", minHeight: 0 }}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={dummyChartData} margin={{ top: 10, right: 0, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorAppts" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={accent} stopOpacity={0.3} />
                    <stop offset="95%" stopColor={accent} stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="colorPat" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={success} stopOpacity={0.3} />
                    <stop offset="95%" stopColor={success} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: text3 }} dy={10} />
                <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: text3 }} />
                <Tooltip 
                  contentStyle={{ backgroundColor: "#111116", borderColor: glass.border, borderRadius: 12, padding: "10px 14px", boxShadow: "0 10px 30px rgba(0,0,0,0.5)" }} 
                  itemStyle={{ fontSize: 11, fontWeight: 600 }}
                  labelStyle={{ fontSize: 10, color: text3, marginBottom: 4 }}
                />
                <Area type="monotone" dataKey="appointments" stroke={accent} strokeWidth={2} fillOpacity={1} fill="url(#colorAppts)" />
                <Area type="monotone" dataKey="patients" stroke={success} strokeWidth={2} fillOpacity={1} fill="url(#colorPat)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </GCard>

        {/* Agenda */}
        <GCard style={{ flex:1, display:"flex", flexDirection:"column", padding:0, overflow:"hidden" }}>
          <div style={{ padding:"20px 24px 16px", borderBottom:`1px solid ${glass.border}`,
            display:"flex", alignItems:"center", justifyContent:"space-between" }}>
            <div>
              <p style={{ fontSize:15, fontWeight:600, color:text1 }}>Today's Schedule</p>
              <p style={{ fontSize:11, color:text2, marginTop:2 }}>
                {new Date().toLocaleDateString('en-US', { weekday: 'long', day: 'numeric', month: 'long' })} · {stats.appointments} scheduled appointments
              </p>
            </div>
            <button style={{ fontSize:11, fontWeight:600, padding:"6px 14px", borderRadius:8,
              background: "rgba(255,255,255,0.05)", border:`1px solid ${glass.border}`, color:text1, cursor:"pointer" }}>
              View full schedule
            </button>
          </div>
          <div style={{ flex:1, overflowY:"auto", padding:"8px 12px" }}>
            {todayAppts.length === 0 ? (
              <div style={{ padding: 24, textAlign: "center", color: text3, fontSize: 13 }}>No appointments scheduled for today.</div>
            ) : todayAppts.map((a, i) => (
              <div key={a.id} style={{ display:"flex", alignItems:"center", gap:14, padding:"10px 12px",
                borderRadius:10, cursor:"pointer", transition:"background 0.2s" }}
                onMouseEnter={e => e.currentTarget.style.background = glass.navItem}
                onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                <span style={{ fontSize:11, fontWeight:700, color:text3, width:42, flexShrink:0, fontFamily: "var(--font-sans)" }}>{a.time}</span>
                <div style={{ width:32, height:32, borderRadius:"50%", flexShrink:0, display:"flex",
                  alignItems:"center", justifyContent:"center", fontWeight:700, fontSize:12, color:"#fff",
                  background:`hsl(${(a.name.charCodeAt(0)*23)%360},55%,45%)` }}>{a.name[0]}</div>
                <div style={{ flex:1, minWidth:0 }}>
                  <p style={{ fontSize:13, fontWeight:600, color:text1, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{a.name}</p>
                  <p style={{ fontSize:11, color:text2 }}>{a.doc} · {a.type}</p>
                </div>
                <SPill s={a.s as any} />
              </div>
            ))}
          </div>
        </GCard>
      </div>

      {/* Audit Trail */}
      <GCard style={{ width:280, flexShrink:0, display:"flex", flexDirection:"column", padding:0, overflow:"hidden" }}>
        <div style={{ padding:"16px 18px 12px", borderBottom:`1px solid ${glass.border}` }}>
          <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between" }}>
            <p style={{ fontSize:13, fontWeight:600, color:text1 }}>
              {role === "ADMIN" ? "Global Activity" : "My Activity"}
            </p>
            <span style={{ display:"flex", alignItems:"center", gap:6, fontSize:9, fontWeight:700,
              letterSpacing:"0.08em", color:success, background:success+"18",
              border:`1px solid ${success}44`, padding:"3px 8px", borderRadius:99 }}>
              <span style={{ width:6, height:6, borderRadius:"50%", background:success,
                boxShadow:`0 0 6px ${success}`, display:"inline-block" }} />
              LIVE
            </span>
          </div>
          <p style={{ fontSize:10, color:text3, marginTop:2 }}>
            {role === "ADMIN" ? "Full clinic registry" : "Your activity log"}
          </p>
        </div>
        <div style={{ flex:1, overflowY:"auto", padding:"8px" }}>
          {feed.map((e, i) => (
            <div key={e.id} style={{ padding:"10px 10px", borderRadius:10, marginBottom:2,
              background: i===0&&live ? "rgba(255,255,255,0.05)" : "transparent",
              border: i===0&&live ? `1px solid ${glass.border}` : "1px solid transparent",
              transition:"all 0.5s ease", cursor:"default" }}>
              <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:5 }}>
                <span style={{ fontSize:11, fontWeight:600, color:text1 }}>{e.user}</span>
                <ATag type={e.type} />
              </div>
              <p style={{ fontSize:10, color:text2, marginBottom:4 }}>
                {e.action} · <span style={{ fontWeight:700, color:text1 }}>{e.target}</span>
              </p>
              <p style={{ fontSize:9, color:text3 }}>{e.ip}</p>
              <p style={{ fontSize:9, color:text3, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{e.ua}</p>
              <p style={{ fontSize:9, color:text3, marginTop:4 }}>{e.time}</p>
            </div>
          ))}
        </div>
      </GCard>
    </div>
  );
}
