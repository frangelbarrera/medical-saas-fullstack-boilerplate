import React, { useState, useEffect, createContext, useContext, useRef } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Toaster, toast } from "sonner";
import { api, setCsrfToken } from "./lib/api";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { Ico } from "./components/Ico";
import { DashboardView } from "./components/DashboardView";
import { PatientsView } from "./components/PatientsView";
import { PatientDetailView } from "./components/PatientDetailView";
import { ConsultationView } from "./components/ConsultationView";
import { AgendaView } from "./components/AgendaView";
import { SecDashboardView } from "./components/SecDashboardView";
import { SecPatientsView } from "./components/SecPatientsView";
import { SecAgendaView } from "./components/SecAgendaView";
import { AdminUsersView } from "./components/AdminUsersView";
import { AuditView } from "./components/AuditView";
import { SettingsView } from "./components/SettingsView";
import { FinanceView } from "./components/FinanceView";
import { AIChat, AIChatButton } from "./components/AIChat";
import { MedicalHistoryView } from "./components/MedicalHistoryView";
import { accent, accentB, danger, text1, text2, text3, glass } from "./theme";
import { GCard } from "./components/GCard";

interface User {
  id: string;
  username: string;
  name: string;
  role: string;
  clinicId: string;
  photoURL?: string;
  managed_doctor_ids?: string[];
}

const AuthContext = createContext<{
  user: User | null;
  clinicId: string | null;
  role: string | null;
  loading: boolean;
  managedDoctorIds: string[];
}>({
  user: null,
  clinicId: null,
  role: null,
  loading: true,
  managedDoctorIds: [],
});
export const useAuth = () => useContext(AuthContext);

export default function App() {
  const [view, setView] = useState("dashboard");
  const [selectedPatientId, setSelectedPatientId] = useState<string | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [clinicId, setClinicId] = useState<string | null>(null);
  const [role, setRole] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);
  const [legacyUsername, setLegacyUsername] = useState("");
  const [legacyPassword, setLegacyPassword] = useState("");
  const [legacyRole, setLegacyRole] = useState("DOCTOR");
  const [globalSearch, setGlobalSearch] = useState("");
  const [searchResults, setSearchResults] = useState<{ patients: any[]; appointments: any[] }>({
    patients: [],
    appointments: [],
  });
  const [showSearchResults, setShowSearchResults] = useState(false);
  const [secretaryOpen, setSecretaryOpen] = useState(false);
  const [adminOpen, setAdminOpen] = useState(false);
  const [isChatOpen, setIsChatOpen] = useState(false);

  useEffect(() => {
    if (!globalSearch || globalSearch.length < 2 || !clinicId) {
      setSearchResults({ patients: [], appointments: [] });
      return;
    }

    const search = async () => {
      try {
        const [patients, appointmentsRes] = await Promise.all([
          api.patients.list(clinicId),
          api.appointments.getByMonth(clinicId, new Date().getFullYear(), new Date().getMonth() + 1),
        ]);

        const filtered = patients.filter(
          (p: any) => p.name.toLowerCase().includes(globalSearch.toLowerCase()) || p.dni?.includes(globalSearch),
        );

        const filteredAppointments = appointmentsRes.filter((a: any) =>
          a.patientName.toLowerCase().includes(globalSearch.toLowerCase()),
        );

        setSearchResults({
          patients: filtered,
          appointments: filteredAppointments,
        });
      } catch (error) {
        console.error("Global search error:", error);
      }
    };

    const timeoutId = setTimeout(search, 300);
    return () => clearTimeout(timeoutId);
  }, [globalSearch, clinicId]);

  useEffect(() => {
    const initialize = async () => {
      try {
        const data = await api.auth.me();
        if (data && data.user) {
          const u = data.user;
          setUser(u);
          setClinicId(u.clinicId);
          setRole(u.role);
          // Set view based on role
          if (u.role === "SECRETARY") setView("sec-dashboard");
          else if (u.role === "ADMIN") setView("dashboard");
          else setView("dashboard");
        }
      } catch (e) {
        console.error("Session restoration failed:", e);
      } finally {
        // Always stop loading after attempt
        setLoading(false);
      }
    };

    initialize();
  }, []);

  useEffect(() => {
    const handleUnauthorized = () => {
      setUser(null);
      setClinicId(null);
      setRole(null);
    };
    window.addEventListener("auth_unauthorized", handleUnauthorized);
    return () => window.removeEventListener("auth_unauthorized", handleUnauthorized);
  }, []);

  const handleLegacyLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!legacyUsername || !legacyPassword) return;
    setIsSubmitting(true);
    setLoginError(null);
    try {
      const { user: u, csrfToken } = await api.auth.login({
        username: legacyUsername,
        password: legacyPassword,
        role: legacyRole,
      });
      setCsrfToken(csrfToken);
      setUser(u);
      setClinicId(u.clinicId);
      setRole(u.role);

      // Set initial view based on role
      if (u.role === "SECRETARY") setView("sec-dashboard");
      else setView("dashboard");
    } catch (error: any) {
      setLoginError(error.message || "Error logging in.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleLogout = async () => {
    try {
      await api.auth.logout();
    } catch (e) {
      console.error("Logout failed", e);
    }
    // Clear any client-side PHI cached during the session
    try {
      sessionStorage.clear();
      localStorage.removeItem("ai_chat_draft");
      localStorage.removeItem("lastAIChatId");
    } catch (e) {
      console.error("Failed to clear storage on logout", e);
    }
    setCsrfToken(null);
    setUser(null);
    setClinicId(null);
    setRole(null);
  };

  const lastActivityRef = useRef<number>(Date.now());
  const checkIntervalRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (!user) return;

    // Doctor: 30 mins, Secondary/Others: 15 mins
    const timeoutDuration = user.role === "DOCTOR" ? 30 * 60 * 1000 : 15 * 60 * 1000;

    const handleActivity = () => {
      lastActivityRef.current = Date.now();
    };

    const events = ["mousemove", "keydown", "mousedown", "touchstart", "scroll", "click"];
    events.forEach((e) => document.addEventListener(e, handleActivity, { passive: true }));

    checkIntervalRef.current = setInterval(() => {
      const timeSinceLastActivity = Date.now() - lastActivityRef.current;
      if (timeSinceLastActivity > timeoutDuration) {
        toast.warning("Sesión expirada por inactividad.");
        handleLogout();
      }
    }, 60 * 1000); // Check every minute

    return () => {
      events.forEach((e) => document.removeEventListener(e, handleActivity));
      if (checkIntervalRef.current) clearInterval(checkIntervalRef.current);
    };
  }, [user]);

  if (loading) {
    return (
      <div
        style={{
          height: "100vh",
          width: "100vw",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#050505",
        }}
      >
        <p style={{ color: text1, fontSize: 14, fontWeight: 600, letterSpacing: "0.1em" }}>LOADING MEDICAL SAAS...</p>
      </div>
    );
  }

  if (!user) {
    return (
      <div
        style={{
          height: "100vh",
          width: "100vw",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "radial-gradient(ellipse at top, #0a0f1e 0%, #050505 70%)",
        }}
      >
        <GCard style={{ maxWidth: 360, padding: 32, textAlign: "center", position: "relative", zIndex: 10 }}>
          <div
            style={{
              width: 56,
              height: 56,
              borderRadius: 14,
              background: "rgba(255,255,255,0.1)",
              border: `1px solid ${glass.border}`,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              margin: "0 auto 20px",
              boxShadow: glass.shadow,
            }}
          >
            <Ico name="Heart" size={28} color={text1} stroke={2} />
          </div>
          <h1 style={{ color: text1, fontSize: 28, fontWeight: 900, marginBottom: 6, letterSpacing: "-0.04em" }}>
            MEDICAL SAAS
          </h1>
          <p style={{ color: text2, fontSize: 13, marginBottom: 28 }}>Data management and medical information</p>

          {loginError && (
            <div
              style={{
                background: danger + "15",
                border: `1px solid ${danger}33`,
                padding: "10px 14px",
                borderRadius: 10,
                marginBottom: 20,
                textAlign: "left",
              }}
            >
              <p
                style={{
                  color: danger,
                  fontSize: 11,
                  fontWeight: 700,
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  marginBottom: 4,
                }}
              >
                <Ico name="AlertCircle" size={14} color={danger} />
                Authentication Issue
              </p>
              <p style={{ color: text2, fontSize: 10, lineHeight: 1.4 }}>{loginError}</p>
            </div>
          )}

          <form onSubmit={handleLegacyLogin} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div style={{ textAlign: "left" }}>
              <label
                style={{
                  display: "block",
                  fontSize: 10,
                  fontWeight: 800,
                  color: text3,
                  textTransform: "uppercase",
                  marginBottom: 6,
                }}
              >
                Role
              </label>
              <div style={{ display: "flex", gap: 8 }}>
                {["ADMIN", "DOCTOR", "SECRETARY"].map((r) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => setLegacyRole(r)}
                    style={{
                      flex: 1,
                      padding: "8px 4px",
                      borderRadius: 8,
                      fontSize: 10,
                      fontWeight: 700,
                      background: legacyRole === r ? accent : "rgba(255,255,255,0.05)",
                      color: legacyRole === r ? "#000" : text2,
                      border: `1px solid ${legacyRole === r ? accent : glass.border}`,
                      cursor: "pointer",
                      transition: "all 0.2s",
                    }}
                  >
                    {r}
                  </button>
                ))}
              </div>
            </div>
            <div style={{ textAlign: "left" }}>
              <label
                style={{
                  display: "block",
                  fontSize: 10,
                  fontWeight: 800,
                  color: text3,
                  textTransform: "uppercase",
                  marginBottom: 6,
                }}
              >
                User
              </label>
              <input
                type="text"
                value={legacyUsername}
                onChange={(e) => setLegacyUsername(e.target.value)}
                placeholder="Username"
                style={{
                  width: "100%",
                  padding: "10px 12px",
                  borderRadius: 10,
                  background: glass.input,
                  border: `1px solid ${glass.border}`,
                  color: text1,
                  outline: "none",
                  boxSizing: "border-box",
                  fontSize: 13,
                }}
              />
            </div>
            <div style={{ textAlign: "left" }}>
              <label
                style={{
                  display: "block",
                  fontSize: 10,
                  fontWeight: 800,
                  color: text3,
                  textTransform: "uppercase",
                  marginBottom: 6,
                }}
              >
                Password
              </label>
              <input
                type="password"
                value={legacyPassword}
                onChange={(e) => setLegacyPassword(e.target.value)}
                placeholder="••••••••"
                style={{
                  width: "100%",
                  padding: "10px 12px",
                  borderRadius: 10,
                  background: glass.input,
                  border: `1px solid ${glass.border}`,
                  color: text1,
                  outline: "none",
                  boxSizing: "border-box",
                  fontSize: 13,
                }}
              />
            </div>
            <button
              type="submit"
              disabled={isSubmitting}
              style={{
                width: "100%",
                padding: "12px",
                borderRadius: 12,
                background: accent,
                color: "#000",
                fontWeight: 700,
                border: "none",
                cursor: isSubmitting ? "not-allowed" : "pointer",
                marginTop: 4,
                fontSize: 14,
                opacity: isSubmitting ? 0.7 : 1,
              }}
            >
              {isSubmitting ? "Signing In..." : "Sign In"}
            </button>
            <p style={{ fontSize: 10, color: text3, marginTop: 8 }}>
              Demo: <strong>admin</strong>, <strong>doctor</strong>, or <strong>secretary</strong> (Password:{" "}
              <strong>admin</strong>)
            </p>
          </form>
        </GCard>
      </div>
    );
  }

  const getNav = () => {
    if (!role) return [];
    const r = role.toUpperCase();
    if (r === "ADMIN") {
      return [
        { id: "dashboard", label: "Dashboard", icon: "LayoutDashboard" as const },
        { id: "patients", label: "Patients", icon: "Users" as const },
        { id: "agenda", label: "Agenda", icon: "Calendar" as const },
        { id: "finances", label: "Finances", icon: "DollarSign" as const },
        { id: "admin-users", label: "System Users", icon: "ShieldCheck" as const },
        { id: "audit", label: "Audit Logs", icon: "Activity" as const },
        { id: "settings", label: "Settings", icon: "Settings" as const },
      ];
    }
    if (r === "SECRETARY") {
      return [
        { id: "sec-dashboard", label: "Dashboard", icon: "LayoutDashboard" as const },
        { id: "sec-patients", label: "Patients", icon: "Users" as const },
        { id: "sec-agenda", label: "Agenda", icon: "Calendar" as const },
        { id: "finances", label: "Finances", icon: "DollarSign" as const },
      ];
    }
    // Default: DOCTOR
    return [
      { id: "dashboard", label: "Dashboard", icon: "LayoutDashboard" as const },
      { id: "patients", label: "Patients", icon: "Users" as const },
      { id: "agenda", label: "Agenda", icon: "Calendar" as const },
      { id: "consultation", label: "Consultation", icon: "Heart" as const },
      { id: "finances", label: "Finances", icon: "DollarSign" as const },
    ];
  };

  const nav = getNav();

  return (
    <ErrorBoundary>
      <AuthContext.Provider
        value={{
          user,
          clinicId,
          role,
          loading,
          managedDoctorIds: user?.managed_doctor_ids || [],
        }}
      >
        <Toaster theme="dark" position="bottom-right" richColors />
        <div
          style={{
            display: "flex",
            height: "100vh",
            width: "100vw",
            overflow: "hidden",
            fontFamily: "var(--font-sans)",
            position: "relative",
            color: text1,
          }}
        >
          <div
            style={{
              position: "absolute",
              inset: 0,
              zIndex: 0,
              background: "radial-gradient(ellipse at top, #0a0f1e 0%, #050505 70%)",
            }}
          >
            <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.35)" }} />
          </div>

          <aside
            style={{
              position: "relative",
              zIndex: 10,
              width: 220,
              flexShrink: 0,
              background: glass.nav,
              borderRight: `1px solid ${glass.border}`,
              backdropFilter: glass.blurDeep,
              WebkitBackdropFilter: glass.blurDeep,
              display: "flex",
              flexDirection: "column",
            }}
          >
            <div style={{ padding: "24px 20px 20px", borderBottom: `1px solid ${glass.border}` }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <div
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 10,
                    background: "rgba(255,255,255,0.1)",
                    border: `1px solid ${glass.border}`,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                  }}
                >
                  <Ico name="Heart" size={17} color={text1} stroke={2} />
                </div>
                <div>
                  <p
                    style={{
                      fontSize: 13,
                      fontWeight: 900,
                      color: text1,
                      letterSpacing: "-0.01em",
                      fontFamily: "'Outfit', sans-serif",
                    }}
                  >
                    Medical SaaS
                  </p>
                  <p
                    style={{
                      fontSize: 9,
                      fontWeight: 600,
                      color: text3,
                      letterSpacing: "0.06em",
                      textTransform: "uppercase",
                    }}
                  >
                    v2.5 · Professional Edition
                  </p>
                </div>
              </div>
            </div>
            <nav style={{ flex: 1, padding: "12px 10px", display: "flex", flexDirection: "column", gap: 2 }}>
              {nav.map((n) => {
                const active = view === n.id;
                return (
                  <button
                    key={n.id}
                    onClick={() => setView(n.id)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 12,
                      padding: "10px 12px",
                      borderRadius: 10,
                      cursor: "pointer",
                      border: "none",
                      width: "100%",
                      textAlign: "left",
                      background: active ? glass.navAct : "transparent",
                      transition: "all 0.2s",
                    }}
                    onMouseEnter={(e) => {
                      if (!active) e.currentTarget.style.background = glass.navItem;
                    }}
                    onMouseLeave={(e) => {
                      if (!active) e.currentTarget.style.background = "transparent";
                    }}
                  >
                    <Ico name={n.icon} size={15} color={active ? text1 : text2} stroke={active ? 2 : 1.6} />
                    <span
                      style={{ flex: 1, fontSize: 12, fontWeight: active ? 700 : 500, color: active ? text1 : text2 }}
                    >
                      {n.label}
                    </span>
                  </button>
                );
              })}

              {role?.toUpperCase() === "ADMIN" && (
                <>
                  <div style={{ marginTop: 8, marginBottom: 4, height: 1, background: glass.border, opacity: 0.5 }} />

                  <button
                    onClick={() => setSecretaryOpen(!secretaryOpen)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 12,
                      padding: "10px 12px",
                      borderRadius: 10,
                      cursor: "pointer",
                      border: "none",
                      width: "100%",
                      textAlign: "left",
                      background: "transparent",
                      transition: "all 0.2s",
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = glass.navItem)}
                    onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                  >
                    <Ico name="UserRound" size={15} color={text2} stroke={1.6} />
                    <span style={{ flex: 1, fontSize: 12, fontWeight: 600, color: text2 }}>Secretary Views</span>
                    <Ico name={secretaryOpen ? "ChevronDown" : "ChevronRight"} size={12} color={text3} />
                  </button>

                  {secretaryOpen && (
                    <div style={{ display: "flex", flexDirection: "column", gap: 2, paddingLeft: 12, marginTop: 4 }}>
                      {[
                        { id: "sec-dashboard", label: "Dashboard", icon: "LayoutDashboard" as const },
                        { id: "sec-patients", label: "Patients", icon: "Users" as const },
                        { id: "sec-agenda", label: "Agenda", icon: "Calendar" as const },
                      ].map((n) => {
                        const active = view === n.id;
                        return (
                          <button
                            key={`sec-${n.id}`}
                            onClick={() => setView(n.id)}
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: 12,
                              padding: "8px 12px",
                              borderRadius: 10,
                              cursor: "pointer",
                              border: "none",
                              width: "100%",
                              textAlign: "left",
                              background: active ? glass.navAct : "transparent",
                              transition: "all 0.2s",
                            }}
                            onMouseEnter={(e) => {
                              if (!active) e.currentTarget.style.background = glass.navItem;
                            }}
                            onMouseLeave={(e) => {
                              if (!active) e.currentTarget.style.background = "transparent";
                            }}
                          >
                            <Ico name={n.icon} size={14} color={active ? text1 : text2} stroke={active ? 2 : 1.6} />
                            <span
                              style={{
                                flex: 1,
                                fontSize: 11,
                                fontWeight: active ? 700 : 500,
                                color: active ? text1 : text2,
                              }}
                            >
                              {n.label}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </>
              )}

              {role === "ADMIN" && (
                <>
                  <div style={{ marginTop: 8, marginBottom: 4, height: 1, background: glass.border, opacity: 0.5 }} />

                  <button
                    onClick={() => setAdminOpen(!adminOpen)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 12,
                      padding: "10px 12px",
                      borderRadius: 10,
                      cursor: "pointer",
                      border: "none",
                      width: "100%",
                      textAlign: "left",
                      background: "transparent",
                      transition: "all 0.2s",
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = glass.navItem)}
                    onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                  >
                    <Ico name="Shield" size={15} color={text2} stroke={1.6} />
                    <span style={{ flex: 1, fontSize: 12, fontWeight: 600, color: text2 }}>Admin</span>
                    <Ico name={adminOpen ? "ChevronDown" : "ChevronRight"} size={12} color={text3} />
                  </button>

                  {adminOpen && (
                    <div style={{ display: "flex", flexDirection: "column", gap: 2, paddingLeft: 12, marginTop: 4 }}>
                      {[
                        { id: "admin-users", label: "System Users", icon: "Users" as const },
                        { id: "audit", label: "Audit Logs", icon: "ShieldCheck" as const },
                      ].map((n) => {
                        const active = view === n.id;
                        return (
                          <button
                            key={`admin-${n.id}`}
                            onClick={() => setView(n.id)}
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: 12,
                              padding: "8px 12px",
                              borderRadius: 10,
                              cursor: "pointer",
                              border: "none",
                              width: "100%",
                              textAlign: "left",
                              background: active ? glass.navAct : "transparent",
                              transition: "all 0.2s",
                            }}
                            onMouseEnter={(e) => {
                              if (!active) e.currentTarget.style.background = glass.navItem;
                            }}
                            onMouseLeave={(e) => {
                              if (!active) e.currentTarget.style.background = "transparent";
                            }}
                          >
                            <Ico name={n.icon} size={14} color={active ? text1 : text2} stroke={active ? 2 : 1.6} />
                            <span
                              style={{
                                flex: 1,
                                fontSize: 11,
                                fontWeight: active ? 700 : 500,
                                color: active ? text1 : text2,
                              }}
                            >
                              {n.label}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </>
              )}
            </nav>
            <div style={{ padding: "16px 10px", borderTop: `1px solid ${glass.border}` }}>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "10px",
                  borderRadius: 12,
                  background: glass.navItem,
                }}
              >
                <div
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: "50%",
                    background: "rgba(255,255,255,0.1)",
                    border: `1px solid ${glass.border}`,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 12,
                    fontWeight: 700,
                    color: "#fff",
                    overflow: "hidden",
                  }}
                >
                  {user.photoURL ? (
                    <img src={user.photoURL} alt="" style={{ width: "100%", height: "100%" }} />
                  ) : (
                    user.name?.charAt(0) || "U"
                  )}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p
                    style={{
                      fontSize: 11,
                      fontWeight: 700,
                      color: text1,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {user.name}
                  </p>
                  <p style={{ fontSize: 9, color: text3 }}>Medical Staff</p>
                </div>
                <button
                  onClick={handleLogout}
                  style={{
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Ico name="LogOut" size={14} color={text3} />
                </button>
              </div>
            </div>
          </aside>

          <main
            style={{
              position: "relative",
              zIndex: 5,
              flex: 1,
              display: "flex",
              flexDirection: "column",
              overflow: "hidden",
            }}
          >
            <header
              style={{
                position: "relative",
                zIndex: 50,
                height: 64,
                padding: "0 32px",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                borderBottom: `1px solid ${glass.border}`,
                background: glass.nav,
                backdropFilter: glass.blur,
                WebkitBackdropFilter: glass.blur,
                boxShadow: "inset 0 -1px 0 rgba(255,255,255,0.05)",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                <h2
                  style={{
                    fontSize: 18,
                    fontWeight: 700,
                    color: text1,
                    letterSpacing: "-0.01em",
                    fontFamily: "'Outfit', sans-serif",
                  }}
                >
                  {nav.find((n) => n.id === view)?.label}
                </h2>
                <div style={{ width: 1, height: 16, background: glass.border }} />
                <p style={{ fontSize: 12, fontWeight: 600, color: text2 }}>New York General Hospital</p>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                <div style={{ position: "relative" }}>
                  <div
                    style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", zIndex: 10 }}
                  >
                    <Ico name="Search" size={14} color={text3} />
                  </div>
                  <input
                    aria-label="Global Search"
                    placeholder="SEARCH PATIENT OR APPOINTMENT..."
                    value={globalSearch}
                    onChange={(e) => {
                      setGlobalSearch(e.target.value);
                      setShowSearchResults(true);
                    }}
                    onFocus={() => setShowSearchResults(true)}
                    style={{
                      width: 340,
                      padding: "10px 12px 10px 36px",
                      borderRadius: 99,
                      background: glass.input,
                      border: `1px solid ${glass.border}`,
                      color: text1,
                      fontSize: 11,
                      fontWeight: 600,
                      letterSpacing: "0.02em",
                      outline: "none",
                      transition: "all 0.2s",
                      position: "relative",
                      zIndex: 10,
                    }}
                    onBlur={() => setTimeout(() => setShowSearchResults(false), 200)}
                    onKeyDown={(e) => {
                      if (e.key === "Escape") setShowSearchResults(false);
                    }}
                  />

                  {showSearchResults && globalSearch.length >= 2 && (
                    <div
                      style={{
                        position: "absolute",
                        top: "110%",
                        right: 0,
                        width: 320,
                        background: "#12121a",
                        border: `1px solid ${glass.border}`,
                        borderRadius: 16,
                        boxShadow: "0 10px 40px rgba(0,0,0,0.6)",
                        zIndex: 100,
                        overflow: "hidden",
                        backdropFilter: "blur(20px)",
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
                          Search Results
                        </p>
                      </div>
                      <div style={{ maxHeight: 400, overflowY: "auto" }}>
                        {searchResults.patients.length === 0 && searchResults.appointments.length === 0 && (
                          <div style={{ padding: 20, textAlign: "center", color: text3, fontSize: 12 }}>
                            No results found
                          </div>
                        )}

                        {searchResults.patients.length > 0 && (
                          <div>
                            <div
                              style={{
                                padding: "8px 16px",
                                background: "rgba(255,255,255,0.02)",
                                fontSize: 9,
                                fontWeight: 700,
                                color: text1,
                              }}
                            >
                              PATIENTS
                            </div>
                            {searchResults.patients.map((p) => (
                              <button
                                key={p.id}
                                onClick={() => {
                                  setSelectedPatientId(p.id);
                                  setView("patients");
                                  setGlobalSearch("");
                                  setShowSearchResults(false);
                                }}
                                style={{
                                  width: "100%",
                                  padding: "12px 16px",
                                  display: "flex",
                                  alignItems: "center",
                                  gap: 12,
                                  background: "none",
                                  border: "none",
                                  borderBottom: `1px solid ${glass.border}44`,
                                  cursor: "pointer",
                                  textAlign: "left",
                                  transition: "background 0.2s",
                                }}
                                onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.05)")}
                                onMouseLeave={(e) => (e.currentTarget.style.background = "none")}
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
                                    flexShrink: 0,
                                  }}
                                >
                                  <Ico name="User" size={16} color={text1} />
                                </div>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                  <p
                                    style={{
                                      fontSize: 13,
                                      fontWeight: 700,
                                      color: text1,
                                      overflow: "hidden",
                                      textOverflow: "ellipsis",
                                      whiteSpace: "nowrap",
                                    }}
                                  >
                                    {p.name}
                                  </p>
                                  <p style={{ fontSize: 10, color: text3, marginTop: 2 }}>ID: {p.dni || "N/A"}</p>
                                </div>
                                <Ico name="ChevronRight" size={12} color={text3} />
                              </button>
                            ))}
                          </div>
                        )}

                        {searchResults.appointments.length > 0 && (
                          <div>
                            <div
                              style={{
                                padding: "8px 16px",
                                background: "rgba(255,255,255,0.02)",
                                fontSize: 9,
                                fontWeight: 800,
                                color: text1,
                                letterSpacing: "0.05em",
                              }}
                            >
                              APPOINTMENTS
                            </div>
                            {searchResults.appointments.map((a) => (
                              <button
                                key={a.id}
                                onClick={() => {
                                  setView("agenda");
                                  setGlobalSearch("");
                                  setShowSearchResults(false);
                                }}
                                style={{
                                  width: "100%",
                                  padding: "12px 16px",
                                  display: "flex",
                                  alignItems: "center",
                                  gap: 12,
                                  background: "none",
                                  border: "none",
                                  borderBottom: `1px solid ${glass.border}44`,
                                  cursor: "pointer",
                                  textAlign: "left",
                                  transition: "background 0.2s",
                                }}
                                onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.05)")}
                                onMouseLeave={(e) => (e.currentTarget.style.background = "none")}
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
                                    flexShrink: 0,
                                  }}
                                >
                                  <Ico name="Calendar" size={16} color={text1} />
                                </div>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                  <p
                                    style={{
                                      fontSize: 13,
                                      fontWeight: 700,
                                      color: text1,
                                      overflow: "hidden",
                                      textOverflow: "ellipsis",
                                      whiteSpace: "nowrap",
                                    }}
                                  >
                                    {a.patientName}
                                  </p>
                                  <p style={{ fontSize: 10, color: text3, marginTop: 2 }}>
                                    {new Date(a.dateTime?.toDate?.() || a.dateTime).toLocaleDateString()} • {a.type}
                                  </p>
                                </div>
                                <Ico name="ChevronRight" size={12} color={text3} />
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
                <div style={{ position: "relative", cursor: "pointer" }}>
                  <Ico name="Bell" size={18} color={text2} />
                </div>
              </div>
            </header>
            <div style={{ flex: 1, padding: 32, overflowY: "auto", position: "relative" }}>
              <AnimatePresence mode="wait">
                {isChatOpen ? (
                  <AIChat
                    key="ai-chat"
                    isOpen={isChatOpen}
                    onToggle={() => setIsChatOpen(false)}
                    userRole={role}
                    clinicId={clinicId}
                    selectedPatientId={selectedPatientId}
                  />
                ) : (
                  <motion.div
                    key={view}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 10 }}
                    transition={{ duration: 0.3 }}
                    style={{ width: "100%", height: "100%" }}
                  >
                    {view === "dashboard" && <DashboardView />}
                    {view === "sec-dashboard" && <SecDashboardView />}
                    {view === "patients" &&
                      (selectedPatientId ? (
                        role === "DOCTOR" || role === "ADMIN" ? (
                          <MedicalHistoryView
                            patientId={selectedPatientId}
                            onBack={() => setSelectedPatientId(null)}
                            onNewConsultation={(id) => {
                              setSelectedPatientId(id);
                              setView("consultation");
                            }}
                          />
                        ) : (
                          <PatientDetailView patientId={selectedPatientId} onBack={() => setSelectedPatientId(null)} />
                        )
                      ) : (
                        <PatientsView onSelectPatient={(id) => setSelectedPatientId(id)} />
                      ))}
                    {view === "sec-patients" &&
                      (selectedPatientId ? (
                        <PatientDetailView patientId={selectedPatientId} onBack={() => setSelectedPatientId(null)} />
                      ) : (
                        <SecPatientsView onSelectPatient={(id) => setSelectedPatientId(id)} />
                      ))}
                    {view === "agenda" && (
                      <AgendaView
                        onSelectPatient={(id) => {
                          setSelectedPatientId(id);
                          setView("patients");
                        }}
                      />
                    )}
                    {view === "sec-agenda" && (
                      <SecAgendaView
                        onSelectPatient={(id) => {
                          setSelectedPatientId(id);
                          setView("patients");
                        }}
                      />
                    )}
                    {view === "admin-users" && <AdminUsersView />}
                    {view === "consultation" && (
                      <ConsultationView
                        patientId={selectedPatientId}
                        onSelectPatient={(id) => {
                          setSelectedPatientId(id);
                          setView("patients");
                        }}
                        onCancel={() => {
                          if (selectedPatientId) {
                            setView("patients");
                          } else {
                            setView("dashboard");
                          }
                        }}
                      />
                    )}
                    {view === "audit" && <AuditView />}
                    {view === "finances" && <FinanceView />}
                    {view === "settings" && <SettingsView />}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </main>

          {/* AI Medical Assistant Integration */}
          <AIChatButton onToggle={() => setIsChatOpen(!isChatOpen)} />
        </div>
      </AuthContext.Provider>
    </ErrorBoundary>
  );
}
