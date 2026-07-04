import React, { useState, useEffect } from "react";
import { api } from "../lib/api";
import { useAuth } from "../App";
import { GCard } from "./GCard";
import { Ico } from "./Ico";
import { accent, accentB, danger, text1, text2, text3, glass } from "../theme";
import { Patient } from "../lib/types";
import { SPill } from "./Tags";

export function SecAgendaView({ onSelectPatient }: { onSelectPatient?: (id: string) => void }) {
  const { clinicId, role, managedDoctorIds } = useAuth();
  const [appts, setAppts] = useState<any[]>([]);
  const [doctors, setDoctors] = useState<any[]>([]);
  const [selectedDoctor, setSelectedDoctor] = useState<any>(null);
  const [showDoctorList, setShowDoctorList] = useState(false);
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [showCalendar, setShowCalendar] = useState(false);
  const [monthAppts, setMonthAppts] = useState<Set<string>>(new Set());
  const [showModal, setShowModal] = useState(false);
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [selectedAppt, setSelectedAppt] = useState<any>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [newAppt, setNewAppt] = useState({
    patientName: "",
    patientId: "",
    type: "Control",
    time: "08:00",
    duration: 1,
    reason: "",
  });
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  // Calendar Logic
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const daysInMonth = (year: number, month: number) => new Date(year, month + 1, 0).getDate();
  const firstDayOfMonth = (year: number, month: number) => new Date(year, month, 1).getDay();

  const renderCalendar = () => {
    const year = currentMonth.getFullYear();
    const month = currentMonth.getMonth();
    const totalDays = daysInMonth(year, month);
    const startDay = (firstDayOfMonth(year, month) + 6) % 7;
    const days = [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const monthNames = [
      "January",
      "February",
      "March",
      "April",
      "May",
      "June",
      "July",
      "August",
      "September",
      "October",
      "November",
      "December",
    ];

    for (let i = 0; i < startDay; i++) {
      days.push(<div key={`empty-${i}`} style={{ width: 32, height: 32 }} />);
    }

    for (let d = 1; d <= totalDays; d++) {
      const date = new Date(year, month, d);
      const isToday = date.getTime() === today.getTime();
      const isSelected =
        date.getTime() ===
        new Date(selectedDate.getFullYear(), selectedDate.getMonth(), selectedDate.getDate()).getTime();
      const dateKey = `${year}-${month}-${d}`;
      const hasAppt = monthAppts.has(dateKey);

      days.push(
        <button
          key={d}
          onClick={() => {
            setSelectedDate(date);
            setShowCalendar(false);
          }}
          style={{
            width: 32,
            height: 32,
            borderRadius: 8,
            border: "none",
            cursor: "pointer",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 11,
            fontWeight: 600,
            background: isSelected ? accent : isToday ? accent + "22" : "transparent",
            color: isSelected ? "#1a0e00" : isToday ? accent : text1,
            transition: "all 0.2s",
            position: "relative",
          }}
        >
          {d}
          {hasAppt && (
            <div
              style={{
                position: "absolute",
                bottom: 4,
                width: 3,
                height: 3,
                borderRadius: "50%",
                background: isSelected ? "#1a0e00" : accent,
              }}
            />
          )}
        </button>,
      );
    }

    return (
      <div
        style={{
          padding: 16,
          width: 260,
          background: "rgba(18,18,26,0.98)",
          border: `1px solid ${glass.borderS}`,
          borderRadius: 16,
          backdropFilter: "blur(24px)",
          boxShadow: "0 16px 40px rgba(0,0,0,0.5)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
          <p style={{ fontSize: 13, fontWeight: 700, color: text1 }}>
            {monthNames[month]} {year}
          </p>
          <div style={{ display: "flex", gap: 4 }}>
            <button
              onClick={() => setCurrentMonth(new Date(year, month - 1))}
              style={{ background: "none", border: "none", cursor: "pointer", padding: 4 }}
            >
              <Ico name="ChevronLeft" size={14} color={text3} />
            </button>
            <button
              onClick={() => setCurrentMonth(new Date(year, month + 1))}
              style={{ background: "none", border: "none", cursor: "pointer", padding: 4 }}
            >
              <Ico name="ChevronRight" size={14} color={text3} />
            </button>
          </div>
        </div>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(7, 1fr)",
            gap: 4,
            textAlign: "center",
            marginBottom: 8,
          }}
        >
          {["M", "T", "W", "T", "F", "S", "S"].map((d) => (
            <span key={d} style={{ fontSize: 9, fontWeight: 800, color: text3 }}>
              {d}
            </span>
          ))}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 4 }}>{days}</div>
      </div>
    );
  };

  const [showTimeDrop, setShowTimeDrop] = useState(false);
  const [showTypeDrop, setShowTypeDrop] = useState(false);
  const [patientSearch, setPatientSearch] = useState("");
  const [patientResults, setPatientResults] = useState<Patient[]>([]);
  const [showPatientResults, setShowPatientResults] = useState(false);

  const timeOptions = Array.from({ length: 20 }, (_, i) => {
    const h = Math.floor(i / 2) + 8;
    const m = i % 2 === 0 ? "00" : "30";
    return `${h}:${m}`;
  });

  const typeOptions = ["Control", "Urgency", "Prenatal", "Monitoring", "First time"];

  useEffect(() => {
    if (patientSearch.length < 2) {
      setPatientResults([]);
      return;
    }
    const search = async () => {
      if (!clinicId) return;
      try {
        const results = await api.patients.list(clinicId);
        setPatientResults(
          results.filter((p: any) => p.name.toLowerCase().includes(patientSearch.toLowerCase())).slice(0, 10),
        );
      } catch (error) {
        console.error("Error searching patients:", error);
      }
    };
    const timer = setTimeout(search, 300);
    return () => clearTimeout(timer);
  }, [patientSearch, clinicId]);

  useEffect(() => {
    if (!clinicId) return;
    const fetchDoctors = async () => {
      try {
        const dList = await api.users.list(clinicId, "DOCTOR");
        const filtered = dList.filter((d: any) => {
          if (role === "SECRETARY" && managedDoctorIds && managedDoctorIds.length > 0) {
            return managedDoctorIds.includes(d.id);
          }
          return true;
        });
        setDoctors(filtered);
        if (filtered.length > 0 && !selectedDoctor) {
          setSelectedDoctor(filtered[0]);
        }
      } catch (error) {
        console.error("Error fetching doctors:", error);
      }
    };
    fetchDoctors();
  }, [clinicId]);

  useEffect(() => {
    if (!clinicId) return;
    const fetchMonthAppts = async () => {
      try {
        const startOfMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 1)
          .toISOString()
          .split("T")[0];
        const endOfMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 0)
          .toISOString()
          .split("T")[0];

        const appts = await api.appointments.list(clinicId, selectedDoctor?.id || "", startOfMonth, endOfMonth);
        const dates = new Set<string>();
        appts.forEach((a: any) => {
          const date = new Date(a.dateTime);
          dates.add(`${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`);
        });
        setMonthAppts(dates);
      } catch (error) {
        console.error("Error fetching month appts:", error);
      }
    };
    fetchMonthAppts();
  }, [clinicId, currentMonth, selectedDoctor]);

  useEffect(() => {
    if (!clinicId) return;
    const fetchDayAppts = async () => {
      try {
        const dayStr = selectedDate.toISOString().split("T")[0];
        const list = await api.appointments.list(clinicId, selectedDoctor?.id || "", dayStr, dayStr);

        const mapped = list.map((a: any) => {
          const date = new Date(a.dateTime);
          const h = date.getHours() + date.getMinutes() / 60 - 8;
          return {
            ...a,
            name: a.patientName,
            h,
            dur: a.duration || 1,
            time: date.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" }),
            color:
              a.type === "Urgency"
                ? danger
                : a.type === "Control"
                  ? accentB
                  : a.type === "Prenatal"
                    ? "#A78BFA"
                    : accent,
          };
        });

        // Sort by start time
        mapped.sort((a: any, b: any) => a.h - b.h || b.dur - a.dur);

        // Calculate layout to handle overlaps
        const clusters: any[][] = [];
        let currentCluster: any[] = [];
        let clusterEnd = 0;

        mapped.forEach((appt: any) => {
          if (appt.h >= clusterEnd) {
            if (currentCluster.length > 0) clusters.push(currentCluster);
            currentCluster = [appt];
            clusterEnd = appt.h + appt.dur;
          } else {
            currentCluster.push(appt);
            clusterEnd = Math.max(clusterEnd, appt.h + appt.dur);
          }
        });
        if (currentCluster.length > 0) clusters.push(currentCluster);

        const positionedAppts: any[] = [];
        clusters.forEach((cluster) => {
          const columns: any[][] = [];
          cluster.forEach((appt) => {
            let placed = false;
            for (let i = 0; i < columns.length; i++) {
              const lastInCol = columns[i][columns[i].length - 1];
              if (appt.h >= lastInCol.h + lastInCol.dur) {
                columns[i].push(appt);
                placed = true;
                break;
              }
            }
            if (!placed) columns.push([appt]);
          });

          const numCols = columns.length;
          columns.forEach((col, colIdx) => {
            col.forEach((appt) => {
              positionedAppts.push({
                ...appt,
                colIdx,
                numCols,
              });
            });
          });
        });

        setAppts(positionedAppts);
      } catch (error) {
        console.error("Error fetching day appts:", error);
      }
    };
    fetchDayAppts();
  }, [clinicId, selectedDate, selectedDoctor]);

  const handleAddAppointment = async () => {
    if (!newAppt.patientName || !clinicId) return;
    setIsSaving(true);
    try {
      const [h, m] = newAppt.time.split(":").map(Number);
      const date = new Date(selectedDate);
      date.setHours(h, m, 0, 0);

      await api.appointments.create({
        ...newAppt,
        dateTime: date.toISOString(),
        clinicId: clinicId,
        doctorId: selectedDoctor?.id || null,
        doctorName: selectedDoctor?.name || "Unassigned",
      });

      setShowModal(false);
      setNewAppt({ patientName: "", patientId: "", type: "Control", time: "08:00", duration: 1, reason: "" });
      setPatientSearch("");

      // Refresh
      const dayStr = selectedDate.toISOString().split("T")[0];
      const list = await api.appointments.list(clinicId, selectedDoctor?.id || "", dayStr, dayStr);
      // ... (re-run mapping logic or just trigger useEffect)
      setSelectedDate(new Date(selectedDate)); // Trigger refresh
    } catch (error) {
      console.error("Error saving appointment:", error);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteAppointment = async () => {
    if (!selectedAppt || !clinicId) return;
    setIsDeleting(true);
    try {
      await api.appointments.delete(selectedAppt.id);
      setShowDeleteConfirm(false);
      setShowDetailsModal(false);
      setSelectedAppt(null);
      setSelectedDate(new Date(selectedDate)); // Trigger refresh
    } catch (error) {
      console.error("Error deleting appointment:", error);
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div style={{ height: "100%", position: "relative" }}>
      <GCard style={{ height: "100%", display: "flex", flexDirection: "column", padding: 0, overflow: "hidden" }}>
        <div
          style={{
            padding: "20px 24px",
            borderBottom: `1px solid ${glass.border}`,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <div style={{ position: "relative" }}>
              <button
                onClick={() => setShowDoctorList(!showDoctorList)}
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
                {selectedDoctor ? `Dr. ${selectedDoctor.name}` : "Doctors List"}
                <Ico name="ChevronDown" size={12} color={text3} />
              </button>

              {showDoctorList && (
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
                        setSelectedDoctor(null);
                        setShowDoctorList(false);
                      }}
                      style={{
                        width: "100%",
                        padding: "12px 16px",
                        display: "flex",
                        alignItems: "center",
                        gap: 10,
                        background: !selectedDoctor ? glass.navAct : "none",
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
                          fontWeight: !selectedDoctor ? 700 : 500,
                          color: !selectedDoctor ? accent : text1,
                        }}
                      >
                        All Doctors
                      </span>
                    </button>
                    {doctors.map((doc) => (
                      <button
                        key={doc.id}
                        onClick={() => {
                          setSelectedDoctor(doc);
                          setShowDoctorList(false);
                        }}
                        style={{
                          width: "100%",
                          padding: "12px 16px",
                          display: "flex",
                          alignItems: "center",
                          gap: 10,
                          background: selectedDoctor?.id === doc.id ? glass.navAct : "none",
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
                            fontWeight: selectedDoctor?.id === doc.id ? 700 : 500,
                            color: selectedDoctor?.id === doc.id ? accent : text1,
                          }}
                        >
                          {doc.name}
                        </span>
                        {!doc.isPlaceholder && (
                          <div
                            style={{
                              width: 6,
                              height: 6,
                              borderRadius: "50%",
                              background: "#10b981",
                              marginLeft: "auto",
                              boxShadow: "0 0 8px #10b98188",
                            }}
                            title="Account connected"
                          />
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div style={{ width: 1, height: 24, background: glass.border }} />

            <div>
              <p style={{ fontSize: 16, fontWeight: 700, color: text1 }}>Agenda (Secretariat)</p>
              <p style={{ fontSize: 11, color: text2, marginTop: 2 }}>
                {selectedDate.toLocaleDateString("en-US", { weekday: "long", day: "numeric", month: "long" })}
              </p>
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, position: "relative" }}>
            <button
              onClick={() => setShowCalendar(!showCalendar)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
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
              <Ico name="Calendar" size={13} color={text1} /> Calendar
            </button>
            {showCalendar && (
              <div style={{ position: "absolute", top: "calc(100% + 8px)", right: 0, zIndex: 200 }}>
                {renderCalendar()}
              </div>
            )}
            <button
              onClick={() => setShowModal(true)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                fontSize: 11,
                fontWeight: 700,
                padding: "8px 16px",
                borderRadius: 10,
                background: accent,
                color: "#1a0e00",
                border: "none",
                cursor: "pointer",
              }}
            >
              <Ico name="Plus" size={13} color="#1a0e00" /> New Appointment
            </button>
          </div>
        </div>
        <div style={{ flex: 1, overflowY: "auto", padding: 24 }}>
          <div style={{ position: "relative", height: 10 * 64 }}>
            {Array.from({ length: 10 }).map((_, i) => (
              <div
                key={i}
                style={{
                  position: "absolute",
                  left: 0,
                  right: 0,
                  top: i * 64,
                  borderTop: `1px solid ${glass.border}`,
                  display: "flex",
                  alignItems: "center",
                }}
              >
                <span
                  style={{
                    fontSize: 10,
                    fontWeight: 700,
                    color: text3,
                    width: 44,
                    flexShrink: 0,
                    fontFamily: "var(--font-sans)",
                  }}
                >
                  {8 + i}:00
                </span>
              </div>
            ))}
            {appts.map((a, i) => {
              const width = `calc((100% - 60px) / ${a.numCols})`;
              const left = `calc(52px + (${a.colIdx} * (100% - 60px) / ${a.numCols}))`;

              return (
                <div
                  key={a.id}
                  onClick={() => {
                    setSelectedAppt(a);
                    setShowDetailsModal(true);
                  }}
                  style={{
                    position: "absolute",
                    left,
                    width,
                    top: a.h * 64 + 3,
                    height: a.dur * 64 - 6,
                    background: a.color + "15",
                    border: `1px solid ${a.color}44`,
                    borderLeft: `4px solid ${a.color}`,
                    borderRadius: 12,
                    padding: "10px 14px",
                    cursor: "pointer",
                    zIndex: 10 + a.colIdx,
                    display: "flex",
                    flexDirection: "column",
                    justifyContent: "center",
                    transition: "all 0.2s",
                    backdropFilter: "blur(12px)",
                  }}
                >
                  <p
                    style={{
                      fontSize: 12,
                      fontWeight: 800,
                      color: text1,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {a.name}
                  </p>
                  <p style={{ fontSize: 10, fontWeight: 600, color: a.color }}>
                    {a.type} • {a.dur}h
                  </p>
                </div>
              );
            })}
          </div>
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
          <GCard style={{ width: 400, padding: 24, border: `1px solid ${glass.borderS}` }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
              <div>
                <p style={{ fontSize: 18, fontWeight: 700, color: text1 }}>Schedule Appointment (SEC)</p>
                {selectedDoctor && (
                  <p style={{ fontSize: 11, color: accent, fontWeight: 600 }}>For: Dr. {selectedDoctor.name}</p>
                )}
              </div>
              <button
                onClick={() => setShowModal(false)}
                style={{ background: "none", border: "none", cursor: "pointer" }}
              >
                <Ico name="X" color={text3} />
              </button>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <div>
                <p style={{ fontSize: 11, fontWeight: 700, color: text2, marginBottom: 6, textTransform: "uppercase" }}>
                  Patient
                </p>
                <input
                  value={patientSearch}
                  onChange={(e) => {
                    setPatientSearch(e.target.value);
                    setShowPatientResults(true);
                  }}
                  placeholder="Search patient..."
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
                {showPatientResults && patientResults.length > 0 && (
                  <div
                    style={{
                      position: "absolute",
                      zIndex: 1000,
                      background: "#12121a",
                      border: `1px solid ${glass.border}`,
                      borderRadius: 12,
                      width: "calc(100% - 48px)",
                      maxHeight: 150,
                      overflowY: "auto",
                    }}
                  >
                    {patientResults.map((p) => (
                      <button
                        key={p.id}
                        onMouseDown={() => {
                          setNewAppt({ ...newAppt, patientName: p.name, patientId: p.id });
                          setPatientSearch(p.name);
                          setShowPatientResults(false);
                        }}
                        style={{
                          width: "100%",
                          padding: 10,
                          background: "none",
                          border: "none",
                          borderBottom: `1px solid ${glass.border}`,
                          color: text1,
                          textAlign: "left",
                          cursor: "pointer",
                        }}
                      >
                        {p.name}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <div>
                  <p
                    style={{ fontSize: 11, fontWeight: 700, color: text1, marginBottom: 6, textTransform: "uppercase" }}
                  >
                    Time
                  </p>
                  <select
                    value={newAppt.time}
                    onChange={(e) => setNewAppt({ ...newAppt, time: e.target.value })}
                    style={{
                      width: "100%",
                      padding: "10px 12px",
                      background: "#1a1a24",
                      border: `1px solid ${glass.border}`,
                      borderRadius: 10,
                      color: text1,
                      outline: "none",
                    }}
                  >
                    {timeOptions.map((t) => (
                      <option key={t} value={t} style={{ background: "#1a1a24", color: text1 }}>
                        {t}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <p
                    style={{ fontSize: 11, fontWeight: 700, color: text1, marginBottom: 6, textTransform: "uppercase" }}
                  >
                    Duration (h)
                  </p>
                  <input
                    type="number"
                    step="0.5"
                    value={newAppt.duration}
                    onChange={(e) => setNewAppt({ ...newAppt, duration: +e.target.value })}
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
              </div>

              <div>
                <p style={{ fontSize: 11, fontWeight: 700, color: text1, marginBottom: 6, textTransform: "uppercase" }}>
                  Reason for Appointment
                </p>
                <textarea
                  value={newAppt.reason}
                  onChange={(e) => setNewAppt({ ...newAppt, reason: e.target.value })}
                  placeholder="Type the reason for the consultation..."
                  style={{
                    width: "100%",
                    padding: "10px 12px",
                    background: glass.input,
                    border: `1px solid ${glass.border}`,
                    borderRadius: 10,
                    color: text1,
                    outline: "none",
                    boxSizing: "border-box",
                    minHeight: 80,
                    resize: "none",
                    fontSize: 13,
                  }}
                />
              </div>

              <button
                onClick={handleAddAppointment}
                disabled={isSaving || !newAppt.patientName}
                style={{
                  marginTop: 8,
                  padding: "12px",
                  borderRadius: 10,
                  background: accent,
                  color: "#1a0e00",
                  fontWeight: 700,
                  border: "none",
                  cursor: isSaving || !newAppt.patientName ? "not-allowed" : "pointer",
                  opacity: isSaving || !newAppt.patientName ? 0.7 : 1,
                }}
              >
                {isSaving ? "Saving..." : "Schedule (SEC)"}
              </button>
            </div>
          </GCard>
        </div>
      )}

      {/* Appointment Details Modal */}
      {showDetailsModal && selectedAppt && (
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
          <GCard
            style={{ width: 400, padding: 24, border: `1px solid ${glass.borderS}`, position: "relative", zIndex: 101 }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
              <p style={{ fontSize: 18, fontWeight: 700, color: text1 }}>Appointment Details</p>
              <button
                onClick={() => setShowDetailsModal(false)}
                style={{ background: "none", border: "none", cursor: "pointer" }}
              >
                <Ico name="X" color={text3} />
              </button>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
              <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
                <div
                  style={{
                    width: 48,
                    height: 48,
                    borderRadius: 12,
                    background: selectedAppt.color + "22",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    border: `1px solid ${selectedAppt.color}44`,
                  }}
                >
                  <Ico name="User" size={24} color={selectedAppt.color} />
                </div>
                <div>
                  <p style={{ fontSize: 16, fontWeight: 800, color: text1 }}>{selectedAppt.name}</p>
                  <p style={{ fontSize: 12, color: text3 }}>
                    {selectedAppt.time} • {selectedAppt.dur}h • {selectedAppt.type}
                  </p>
                </div>
              </div>

              <div
                style={{
                  padding: 16,
                  borderRadius: 12,
                  background: "rgba(255,255,255,0.03)",
                  border: `1px solid ${glass.border}`,
                }}
              >
                <p
                  style={{
                    fontSize: 10,
                    fontWeight: 800,
                    color: text3,
                    textTransform: "uppercase",
                    letterSpacing: "0.05em",
                    marginBottom: 8,
                  }}
                >
                  Reason for Appointment
                </p>
                <p style={{ fontSize: 14, color: text1, lineHeight: 1.5 }}>
                  {selectedAppt.reason || "No reason specified."}
                </p>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {selectedAppt.patientId && onSelectPatient && (
                  <button
                    onClick={() => {
                      onSelectPatient(selectedAppt.patientId);
                      setShowDetailsModal(false);
                    }}
                    style={{
                      width: "100%",
                      padding: "12px",
                      borderRadius: 10,
                      background: accentB,
                      color: "#fff",
                      fontWeight: 700,
                      border: "none",
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: 8,
                    }}
                  >
                    <Ico name="History" size={16} color="#fff" /> View Medical History
                  </button>
                )}
                <button
                  onClick={() => setShowDeleteConfirm(true)}
                  style={{
                    width: "100%",
                    padding: "12px",
                    borderRadius: 10,
                    background: "rgba(239, 68, 68, 0.1)",
                    color: danger,
                    fontWeight: 700,
                    border: `1px solid ${danger}33`,
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 8,
                  }}
                >
                  <Ico name="Trash2" size={16} color={danger} /> Cancel Appointment
                </button>
              </div>
            </div>
          </GCard>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            zIndex: 200,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "rgba(0,0,0,0.8)",
            backdropFilter: "blur(8px)",
          }}
        >
          <GCard style={{ width: 320, padding: 24, textAlign: "center", border: `1px solid ${danger}44` }}>
            <div
              style={{
                width: 48,
                height: 48,
                borderRadius: "50%",
                background: danger + "22",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                margin: "0 auto 16px",
              }}
            >
              <Ico name="AlertTriangle" size={24} color={danger} />
            </div>
            <p style={{ fontSize: 16, fontWeight: 700, color: text1, marginBottom: 8 }}>Cancel Appointment?</p>
            <p style={{ fontSize: 13, color: text2, marginBottom: 24 }}>
              This action cannot be undone. The appointment will be removed from the agenda.
            </p>
            <div style={{ display: "flex", gap: 12 }}>
              <button
                onClick={() => setShowDeleteConfirm(false)}
                style={{
                  flex: 1,
                  padding: "10px",
                  borderRadius: 8,
                  background: glass.navItem,
                  color: text1,
                  border: `1px solid ${glass.border}`,
                  cursor: "pointer",
                  fontWeight: 600,
                }}
              >
                No, go back
              </button>
              <button
                onClick={handleDeleteAppointment}
                disabled={isDeleting}
                style={{
                  flex: 1,
                  padding: "10px",
                  borderRadius: 8,
                  background: danger,
                  color: "#fff",
                  border: "none",
                  cursor: "pointer",
                  fontWeight: 700,
                }}
              >
                {isDeleting ? "Canceling..." : "Yes, cancel"}
              </button>
            </div>
          </GCard>
        </div>
      )}
    </div>
  );
}
