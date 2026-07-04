import React, { useState, useEffect } from "react";
import { api } from "../lib/api";
import { useAuth } from "../App";
import { GCard } from "./GCard";
import { Ico } from "./Ico";
import { accent, accentB, danger, success, text1, text2, text3, glass } from "../theme";
import { Patient } from "../lib/types";

import { SPill } from "./Tags";

export function AgendaView({
  onSelectPatient,
  doctorId,
}: {
  onSelectPatient?: (id: string) => void;
  doctorId?: string;
}) {
  const { clinicId, role, user } = useAuth();
  const [appts, setAppts] = useState<any[]>([]);
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
    type: "Follow-up",
    time: "08:00",
    duration: 1,
    reason: "",
  });
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [doctors, setDoctors] = useState<any[]>([]);
  const [selectedDoctorId, setSelectedDoctorId] = useState<string | null>(doctorId || user?.id || null);

  useEffect(() => {
    if (doctorId) {
      setSelectedDoctorId(doctorId);
    }
  }, [doctorId]);

  useEffect(() => {
    if (!clinicId || role !== "SECRETARY") return;
    const fetchDoctors = async () => {
      try {
        const docs = await api.users.list(clinicId, "DOCTOR");
        setDoctors(docs);
        if (docs.length > 0 && !selectedDoctorId) {
          setSelectedDoctorId(docs[0].id);
        }
      } catch (error) {
        console.error("Error fetching doctors:", error);
      }
    };
    fetchDoctors();
  }, [clinicId, role]);

  // Calendar Logic
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const daysInMonth = (year: number, month: number) => new Date(year, month + 1, 0).getDate();
  const firstDayOfMonth = (year: number, month: number) => new Date(year, month, 1).getDay();

  const renderCalendar = () => {
    const year = currentMonth.getFullYear();
    const month = currentMonth.getMonth();
    const totalDays = daysInMonth(year, month);
    const startDay = (firstDayOfMonth(year, month) + 6) % 7; // Adjust to Monday start
    const days = [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Header
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
            background: isSelected ? "rgba(255,255,255,0.95)" : isToday ? "rgba(255,255,255,0.1)" : "transparent",
            color: isSelected ? "#000" : isToday ? text1 : text1,
            transition: "all 0.2s",
            position: "relative",
          }}
          onMouseEnter={(e) => {
            if (!isSelected) e.currentTarget.style.background = glass.navItem;
          }}
          onMouseLeave={(e) => {
            if (!isSelected) e.currentTarget.style.background = isToday ? "rgba(255,255,255,0.1)" : "transparent";
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
                background: isSelected ? "#000" : text1,
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
              onClick={() => {
                setSelectedDate(new Date());
                setCurrentMonth(new Date());
                setShowCalendar(false);
              }}
              style={{
                background: "rgba(255,255,255,0.1)",
                border: `1px solid ${glass.border}`,
                color: text1,
                fontSize: 9,
                fontWeight: 700,
                padding: "4px 8px",
                borderRadius: 6,
                cursor: "pointer",
                marginRight: 4,
              }}
            >
              Today
            </button>
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

  // Custom Dropdowns State
  const [showTimeDrop, setShowTimeDrop] = useState(false);
  const [showTypeDrop, setShowTypeDrop] = useState(false);
  const [patientSearch, setPatientSearch] = useState("");
  const [patientResults, setPatientResults] = useState<Patient[]>([]);
  const [isSearchingPatients, setIsSearchingPatients] = useState(false);
  const [showPatientResults, setShowPatientResults] = useState(false);

  const timeOptions = Array.from({ length: 20 }, (_, i) => {
    const h = Math.floor(i / 2) + 8;
    const m = i % 2 === 0 ? "00" : "30";
    return `${h}:${m}`;
  });

  const typeOptions = ["Follow-up", "Urgency", "Prenatal", "Monitoring", "First time"];

  useEffect(() => {
    if (patientSearch.length < 2) {
      setPatientResults([]);
      return;
    }
    const search = async () => {
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
    };
    const timer = setTimeout(search, 300);
    return () => clearTimeout(timer);
  }, [patientSearch, clinicId]);

  useEffect(() => {
    if (!clinicId || !selectedDoctorId) return;
    const startOfMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 1).toISOString();
    const endOfMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 0, 23, 59, 59).toISOString();

    const fetchMonthAppts = async () => {
      try {
        const list = await api.appointments.list(clinicId, selectedDoctorId, startOfMonth, endOfMonth);
        const dates = new Set<string>();
        list.forEach((appt: any) => {
          const date = new Date(appt.dateTime);
          dates.add(`${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`);
        });
        setMonthAppts(dates);
      } catch (error) {
        console.error("Error fetching month appointments:", error);
      }
    };

    fetchMonthAppts();
    const interval = setInterval(fetchMonthAppts, 10000);
    return () => clearInterval(interval);
  }, [clinicId, currentMonth, selectedDoctorId]);

  useEffect(() => {
    if (!clinicId || !selectedDoctorId) return;
    const startOfDay = new Date(selectedDate);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(startOfDay);
    endOfDay.setDate(endOfDay.getDate() + 1);

    const fetchAppts = async () => {
      try {
        const list = await api.appointments.list(
          clinicId,
          selectedDoctorId,
          startOfDay.toISOString(),
          endOfDay.toISOString(),
        );
        const mapped = list.map((data: any) => {
          const date = new Date(data.dateTime);
          const h = date.getHours() + date.getMinutes() / 60 - 8;
          return {
            id: data.id,
            name: data.patientName || "Patient",
            patientId: data.patientId,
            type: data.type || "Consultation",
            dur: data.duration || 1,
            reason: data.reason || "",
            time: date.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" }),
            h,
            color:
              data.type === "Urgent"
                ? danger
                : data.type === "Follow-up"
                  ? accentB
                  : data.type === "Prenatal"
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
        console.error("Error fetching appointments:", error);
      }
    };

    fetchAppts();
    const interval = setInterval(fetchAppts, 10000);
    return () => clearInterval(interval);
  }, [clinicId, selectedDate, selectedDoctorId]);

  const handleAddAppointment = async () => {
    if (!newAppt.patientName || !clinicId || !selectedDoctorId) return;
    setIsSaving(true);
    try {
      const [h, m] = newAppt.time.split(":").map(Number);
      const date = new Date(selectedDate);
      date.setHours(h, m, 0, 0);

      const doctor =
        role === "SECRETARY" ? doctors.find((d) => d.id === selectedDoctorId) : { id: user?.id, name: user?.name };

      await api.appointments.create({
        patientName: newAppt.patientName,
        patientId: newAppt.patientId || null,
        type: newAppt.type,
        duration: newAppt.duration,
        reason: newAppt.reason,
        dateTime: date.toISOString(),
        clinicId: clinicId,
        doctorId: selectedDoctorId,
        doctorName: doctor?.name || "Dr. Vallejo",
        createdAt: new Date().toISOString(),
      });

      setShowModal(false);
      setNewAppt({ patientName: "", patientId: "", type: "Follow-up", time: "08:00", duration: 1, reason: "" });
      setPatientSearch("");
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
          <div>
            <p style={{ fontSize: 16, fontWeight: 700, color: text1 }}>Medical Agenda</p>
            <p style={{ fontSize: 11, color: text2, marginTop: 2 }}>
              {selectedDate.toLocaleDateString("en-US", { weekday: "long", day: "numeric", month: "long" })}
            </p>
          </div>
          <div style={{ display: "flex", gap: 8, position: "relative" }}>
            {role === "SECRETARY" && doctors.length > 0 && (
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginRight: 12 }}>
                <p
                  style={{
                    fontSize: 9,
                    fontWeight: 800,
                    color: text3,
                    textTransform: "uppercase",
                    letterSpacing: "0.05em",
                  }}
                >
                  Doctor:
                </p>
                <select
                  value={selectedDoctorId || ""}
                  onChange={(e) => setSelectedDoctorId(e.target.value)}
                  style={{
                    padding: "6px 12px",
                    borderRadius: 8,
                    background: "#1a1a24",
                    border: `1px solid ${glass.border}`,
                    color: text1,
                    fontSize: 11,
                    fontWeight: 600,
                    outline: "none",
                    cursor: "pointer",
                  }}
                >
                  {doctors.map((d) => (
                    <option key={d.id} value={d.id} style={{ background: "#1a1a24", color: text1 }}>
                      {d.name || "No name"}
                    </option>
                  ))}
                </select>
              </div>
            )}
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
                transition: "all 0.2s",
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
                background: "rgba(255,255,255,0.95)",
                color: "#000",
                border: "none",
                cursor: "pointer",
                boxShadow: glass.shadow,
              }}
            >
              <Ico name="Plus" size={13} color="#000" /> New Appointment
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

              const apptColor = a.type === "Urgent" ? danger : "rgba(255,255,255,0.5)";

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
                    background: "rgba(255,255,255,0.05)",
                    border: `1px solid ${glass.border}`,
                    borderLeft: `4px solid ${apptColor}`,
                    borderRadius: 12,
                    padding: "10px 14px",
                    cursor: "pointer",
                    transition: "all 0.2s cubic-bezier(0.4, 0, 0.2, 1)",
                    backdropFilter: "blur(12px)",
                    zIndex: 10 + a.colIdx,
                    display: "flex",
                    flexDirection: "column",
                    justifyContent: "center",
                    boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = "rgba(255,255,255,0.1)";
                    e.currentTarget.style.transform = "scale(1.01)";
                    e.currentTarget.style.zIndex = "50";
                    e.currentTarget.style.boxShadow = `0 8px 24px rgba(255,255,255,0.1)`;
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = "rgba(255,255,255,0.05)";
                    e.currentTarget.style.transform = "none";
                    e.currentTarget.style.zIndex = (10 + a.colIdx).toString();
                    e.currentTarget.style.boxShadow = "0 4px 12px rgba(0,0,0,0.1)";
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
                    <div style={{ width: 6, height: 6, borderRadius: "50%", background: apptColor }} />
                    <p
                      style={{
                        fontSize: 12,
                        fontWeight: 800,
                        color: text1,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                        letterSpacing: "-0.01em",
                      }}
                    >
                      {a.name}
                    </p>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                    <p
                      style={{
                        fontSize: 10,
                        fontWeight: 600,
                        color: text2,
                        opacity: 0.9,
                        textTransform: "uppercase",
                        letterSpacing: "0.02em",
                      }}
                    >
                      {a.type}
                    </p>
                    <span style={{ fontSize: 9, color: text3 }}>• {a.dur}h</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </GCard>

      {/* New Appointment Modal */}
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
          <GCard
            style={{ width: 400, padding: 24, border: `1px solid ${glass.borderS}`, position: "relative", zIndex: 101 }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
              <p style={{ fontSize: 18, fontWeight: 700, color: text1 }}>Schedule Appointment</p>
              <button
                onClick={() => setShowModal(false)}
                style={{ background: "none", border: "none", cursor: "pointer" }}
              >
                <Ico name="X" color={text3} />
              </button>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              {/* Patient Search */}
              <div style={{ position: "relative", zIndex: showPatientResults ? 10 : 1 }}>
                <p style={{ fontSize: 11, fontWeight: 700, color: text2, marginBottom: 6, textTransform: "uppercase" }}>
                  Patient
                </p>
                <div style={{ position: "relative" }}>
                  <div style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)" }}>
                    <Ico name="Search" size={14} color={text3} />
                  </div>
                  <input
                    value={patientSearch}
                    onChange={(e) => {
                      setPatientSearch(e.target.value);
                      setShowPatientResults(true);
                    }}
                    onFocus={() => setShowPatientResults(true)}
                    placeholder="Search patient..."
                    style={{
                      width: "100%",
                      padding: "10px 12px 10px 36px",
                      background: glass.input,
                      border: `1px solid ${glass.border}`,
                      borderRadius: 10,
                      color: text1,
                      outline: "none",
                      boxSizing: "border-box",
                    }}
                  />

                  {showPatientResults && patientSearch.length >= 2 && (
                    <div
                      style={{
                        position: "absolute",
                        top: "calc(100% + 4px)",
                        left: 0,
                        right: 0,
                        zIndex: 1000,
                        background: "rgba(18,18,26,0.98)",
                        border: `1px solid ${glass.borderS}`,
                        borderRadius: 12,
                        overflow: "hidden",
                        backdropFilter: "blur(24px)",
                        boxShadow: "0 16px 40px rgba(0,0,0,0.5)",
                      }}
                    >
                      {isSearchingPatients ? (
                        <div style={{ padding: 16, textAlign: "center" }}>
                          <div
                            style={{
                              width: 16,
                              height: 16,
                              border: "2px solid rgba(255,255,255,0.1)",
                              borderTopColor: accent,
                              borderRadius: "50%",
                              animation: "spin 1s linear infinite",
                              margin: "0 auto",
                            }}
                          />
                        </div>
                      ) : patientResults.length === 0 ? (
                        <div style={{ padding: 16, textAlign: "center", fontSize: 12, color: text3 }}>
                          No patients found
                        </div>
                      ) : (
                        patientResults.map((p) => (
                          <button
                            key={p.id}
                            onMouseDown={() => {
                              setNewAppt({
                                ...newAppt,
                                patientName: p.name,
                                patientId: p.id,
                                type: p.status === "Urgent" ? "Urgency" : "Follow-up",
                              });
                              setPatientSearch(p.name);
                              setShowPatientResults(false);
                            }}
                            style={{
                              width: "100%",
                              padding: "10px 14px",
                              background: "none",
                              border: "none",
                              borderBottom: `1px solid ${glass.border}`,
                              cursor: "pointer",
                              textAlign: "left",
                              transition: "background 0.15s",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "space-between",
                            }}
                            onMouseEnter={(e) => (e.currentTarget.style.background = glass.navItem)}
                            onMouseLeave={(e) => (e.currentTarget.style.background = "none")}
                          >
                            <div>
                              <p style={{ fontSize: 13, fontWeight: 600, color: text1 }}>{p.name}</p>
                              <p style={{ fontSize: 10, color: text3 }}>{p.dni || p.id}</p>
                            </div>
                            <SPill s={p.status} />
                          </button>
                        ))
                      )}
                    </div>
                  )}
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                {/* Time Dropdown */}
                <div style={{ position: "relative", zIndex: showTimeDrop ? 5 : 1 }}>
                  <p
                    style={{ fontSize: 11, fontWeight: 700, color: text2, marginBottom: 6, textTransform: "uppercase" }}
                  >
                    Time
                  </p>
                  <button
                    onClick={() => setShowTimeDrop(!showTimeDrop)}
                    style={{
                      width: "100%",
                      padding: "10px 12px",
                      background: glass.input,
                      border: `1px solid ${glass.border}`,
                      borderRadius: 10,
                      color: text1,
                      textAlign: "left",
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      cursor: "pointer",
                    }}
                  >
                    {newAppt.time}
                    <Ico name="ChevronDown" size={14} color={text3} />
                  </button>
                  {showTimeDrop && (
                    <div
                      style={{
                        position: "absolute",
                        top: "calc(100% + 4px)",
                        left: 0,
                        right: 0,
                        zIndex: 1000,
                        maxHeight: 200,
                        overflowY: "auto",
                        background: "rgba(18,18,26,0.98)",
                        border: `1px solid ${glass.borderS}`,
                        borderRadius: 12,
                        backdropFilter: "blur(24px)",
                        boxShadow: "0 16px 40px rgba(0,0,0,0.5)",
                      }}
                    >
                      {timeOptions.map((t) => (
                        <button
                          key={t}
                          onMouseDown={() => {
                            setNewAppt({ ...newAppt, time: t });
                            setShowTimeDrop(false);
                          }}
                          style={{
                            width: "100%",
                            padding: "10px 14px",
                            background: "none",
                            border: "none",
                            borderBottom: `1px solid ${glass.border}`,
                            cursor: "pointer",
                            textAlign: "left",
                            color: text1,
                            fontSize: 12,
                          }}
                          onMouseEnter={(e) => (e.currentTarget.style.background = glass.navItem)}
                          onMouseLeave={(e) => (e.currentTarget.style.background = "none")}
                        >
                          {t}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                <div>
                  <p
                    style={{ fontSize: 11, fontWeight: 700, color: text2, marginBottom: 6, textTransform: "uppercase" }}
                  >
                    Duration (Hours)
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
                      boxSizing: "border-box",
                    }}
                  />
                </div>
              </div>

              {/* Type Dropdown */}
              <div style={{ position: "relative", zIndex: showTypeDrop ? 4 : 1 }}>
                <p style={{ fontSize: 11, fontWeight: 700, color: text2, marginBottom: 6, textTransform: "uppercase" }}>
                  Appointment Type
                </p>
                <button
                  onClick={() => setShowTypeDrop(!showTypeDrop)}
                  style={{
                    width: "100%",
                    padding: "10px 12px",
                    background: glass.input,
                    border: `1px solid ${glass.border}`,
                    borderRadius: 10,
                    color: text1,
                    textAlign: "left",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    cursor: "pointer",
                  }}
                >
                  {newAppt.type}
                  <Ico name="ChevronDown" size={14} color={text3} />
                </button>
                {showTypeDrop && (
                  <div
                    style={{
                      position: "absolute",
                      top: "calc(100% + 4px)",
                      left: 0,
                      right: 0,
                      zIndex: 1000,
                      background: "rgba(18,18,26,0.98)",
                      border: `1px solid ${glass.borderS}`,
                      borderRadius: 12,
                      overflow: "hidden",
                      backdropFilter: "blur(24px)",
                      boxShadow: "0 166px 40px rgba(0,0,0,0.5)",
                    }}
                  >
                    {typeOptions.map((t) => (
                      <button
                        key={t}
                        onMouseDown={() => {
                          setNewAppt({ ...newAppt, type: t });
                          setShowTypeDrop(false);
                        }}
                        style={{
                          width: "100%",
                          padding: "10px 14px",
                          background: "none",
                          border: "none",
                          borderBottom: `1px solid ${glass.border}`,
                          cursor: "pointer",
                          textAlign: "left",
                          color: text1,
                          fontSize: 12,
                        }}
                        onMouseEnter={(e) => (e.currentTarget.style.background = glass.navItem)}
                        onMouseLeave={(e) => (e.currentTarget.style.background = "none")}
                      >
                        {t}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div>
                <p style={{ fontSize: 11, fontWeight: 700, color: text2, marginBottom: 6, textTransform: "uppercase" }}>
                  Reason for Appointment
                </p>
                <textarea
                  value={newAppt.reason}
                  onChange={(e) => setNewAppt({ ...newAppt, reason: e.target.value })}
                  placeholder="Write the reason for the consultation..."
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
                  background: "rgba(255,255,255,0.95)",
                  color: "#000",
                  fontWeight: 700,
                  border: "none",
                  cursor: isSaving || !newAppt.patientName ? "not-allowed" : "pointer",
                  opacity: isSaving || !newAppt.patientName ? 0.7 : 1,
                }}
              >
                {isSaving ? "Saving..." : "Schedule Appointment"}
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
