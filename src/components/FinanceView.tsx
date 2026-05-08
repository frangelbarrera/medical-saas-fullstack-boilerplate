import React, { useState, useEffect, useMemo } from "react";
import { toast } from "sonner";
import { api } from "../lib/api";
import { useAuth } from "../App";
import { GCard } from "./GCard";
import { Ico } from "./Ico";
import { accent, success, danger, text1, text2, text3, glass } from "../theme";
import { 
  AreaChart, 
  Area, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  BarChart,
  Bar,
  Legend
} from "recharts";
import { motion, AnimatePresence } from "motion/react";

const selectStyle: React.CSSProperties = {
  padding: "12px 40px 12px 12px",
  borderRadius: 12,
  background: glass.input,
  border: `1px solid ${glass.border}`,
  color: text1,
  outline: "none",
  cursor: "pointer",
  appearance: "none",
  backgroundImage: `url("data:image/svg+xml;charset=UTF-8,%3csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='rgba(255,255,255,0.4)' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3e%3cpolyline points='6 9 12 15 18 9'%3e%3c/polyline%3e%3c/svg%3e")`,
  backgroundRepeat: "no-repeat",
  backgroundPosition: "right 12px center",
  backgroundSize: "16px"
};

const optionStyle = {
  background: "#121212",
  color: "#ffffff",
  padding: "12px"
};

export function FinanceView() {
  const { clinicId, user, role, managedDoctorIds } = useAuth();
  const [invoices, setInvoices] = useState<any[]>([]);
  const [expenses, setExpenses] = useState<any[]>([]);
  const [patients, setPatients] = useState<any[]>([]);
  const [doctors, setDoctors] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  
  const [showInvoiceModal, setShowInvoiceModal] = useState(false);
  const [showExpenseModal, setShowExpenseModal] = useState(false);
  
  const [dateFilter, setDateFilter] = useState("month"); // month, quarter, year, all
  const [doctorFilter, setDoctorFilter] = useState(role === "DOCTOR" ? (user?.id || "all") : "all");

  // Fetch Data
  useEffect(() => {
    if (!clinicId) return;

    const fetchData = async () => {
      try {
        const [invList, expList, patList, dList] = await Promise.all([
          api.invoices.list(clinicId),
          api.expenses.list(clinicId),
          api.patients.list(clinicId),
          api.users.list(clinicId, "DOCTOR")
        ]);
        
        // Filter invoices based on role
        const filteredInvoices = invList.filter((inv: any) => {
          if (role === "DOCTOR") return inv.doctorId === user?.id;
          if (role === "SECRETARY" && managedDoctorIds?.length > 0) {
            return managedDoctorIds.includes(inv.doctorId);
          }
          return true;
        });

        // Filter doctors based on role for the filter dropdown
        const filteredDocs = dList.filter((d: any) => {
          if (role === "SECRETARY" && managedDoctorIds?.length > 0) {
            return managedDoctorIds.includes(d.id);
          }
          if (role === "DOCTOR") return d.id === user?.id;
          return true;
        });

        setInvoices(filteredInvoices);
        setExpenses(expList);
        setPatients(patList);
        setDoctors(filteredDocs);
      } catch (error) {
        console.error("Error fetching finance data:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
    const interval = setInterval(fetchData, 10000);
    return () => clearInterval(interval);
  }, [clinicId]);

  const handleOnlinePayment = async (invoice: any) => {
    try {
      const res = await api.payments.createOrder({
        invoiceId: invoice.id,
        amount: invoice.amount,
        patientName: invoice.patientName,
        clinicId
      });
      if (res.paymentUrl) {
        window.open(res.paymentUrl, "_blank");
      } else {
        toast.error("No payment URL received. Check payment configuration.");
      }
    } catch (error: any) {
      console.error("Error initiating payment:", error);
      toast.error("Error initiating payment: " + (error.message || "Unknown error"));
    }
  };

  // Calculations
  const filteredInvoices = useMemo(() => {
    let filtered = invoices;
    if (doctorFilter !== "all") {
      filtered = filtered.filter(inv => inv.doctorId === doctorFilter);
    }
    
    const now = new Date();
    if (dateFilter === "month") {
      filtered = filtered.filter(inv => {
        const d = new Date(inv.date);
        return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
      });
    } else if (dateFilter === "quarter") {
      const threeMonthsAgo = new Date();
      threeMonthsAgo.setMonth(now.getMonth() - 3);
      filtered = filtered.filter(inv => {
        const d = new Date(inv.date);
        return d >= threeMonthsAgo;
      });
    } else if (dateFilter === "year") {
      filtered = filtered.filter(inv => {
        const d = new Date(inv.date);
        return d.getFullYear() === now.getFullYear();
      });
    }
    
    return filtered;
  }, [invoices, doctorFilter, dateFilter]);

  const filteredExpenses = useMemo(() => {
    let filtered = expenses;
    const now = new Date();
    
    if (dateFilter === "month") {
      filtered = filtered.filter(exp => {
        const d = new Date(exp.date);
        return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
      });
    } else if (dateFilter === "quarter") {
      const threeMonthsAgo = new Date();
      threeMonthsAgo.setMonth(now.getMonth() - 3);
      filtered = filtered.filter(exp => {
        const d = new Date(exp.date);
        return d >= threeMonthsAgo;
      });
    } else if (dateFilter === "year") {
      filtered = filtered.filter(exp => {
        const d = new Date(exp.date);
        return d.getFullYear() === now.getFullYear();
      });
    }
    
    return filtered;
  }, [expenses, dateFilter]);

  const stats = useMemo(() => {
    const totalIncomes = filteredInvoices.reduce((acc, inv) => acc + (inv.amount || 0), 0);
    const totalExpenses = filteredExpenses.reduce((acc, exp) => acc + (exp.amount || 0), 0);
    const pendingInsurance = filteredInvoices
      .filter(inv => inv.paymentMethod === "Insurance" && inv.status === "Pending")
      .reduce((acc, inv) => acc + (inv.amount || 0), 0);
    
    return {
      income: totalIncomes,
      expense: totalExpenses,
      pending: pendingInsurance,
      net: totalIncomes - totalExpenses
    };
  }, [filteredInvoices, filteredExpenses]);

  const chartData = useMemo(() => {
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const data: any[] = [];
    const now = new Date();
    
    let monthsToDisplay = 6;
    if (dateFilter === "quarter") monthsToDisplay = 4;
    if (dateFilter === "year") monthsToDisplay = 12;
    if (dateFilter === "all") monthsToDisplay = 18;
    
    for (let i = monthsToDisplay - 1; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const mLabel = months[d.getMonth()];
      const year = d.getFullYear();
      
      const monthIncomes = invoices.filter(inv => {
        const invDate = new Date(inv.date);
        return invDate.getMonth() === d.getMonth() && invDate.getFullYear() === year;
      }).reduce((acc, inv) => acc + (inv.amount || 0), 0);

      const monthExpenses = expenses.filter(exp => {
        const expDate = new Date(exp.date);
        return expDate.getMonth() === d.getMonth() && expDate.getFullYear() === year;
      }).reduce((acc, exp) => acc + (exp.amount || 0), 0);

      data.push({
        name: monthsToDisplay > 12 ? `${mLabel} ${year.toString().slice(-2)}` : mLabel,
        income: monthIncomes,
        expenses: monthExpenses,
        profit: monthIncomes - monthExpenses
      });
    }
    return data;
  }, [invoices, expenses, dateFilter]);

  const insuranceData = useMemo(() => {
    const companies: Record<string, { amount: number, count: number }> = {};
    filteredInvoices.filter(inv => inv.paymentMethod === "Insurance" && inv.status === "Pending").forEach(inv => {
      const name = inv.insuranceCompany || "Unknown";
      if (!companies[name]) companies[name] = { amount: 0, count: 0 };
      companies[name].amount += inv.amount || 0;
      companies[name].count += 1;
    });
    return Object.entries(companies).map(([name, data]) => ({ name, ...data }));
  }, [filteredInvoices]);

  if (loading) return <div style={{ padding: 40, color: text2 }}>Loading financial data...</div>;

  return (
    <div style={{ padding: "24px 40px", maxWidth: 1400, margin: "0 auto" }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 32 }}>
        <div>
          <h1 style={{ fontSize: 28, fontWeight: 800, color: text1, letterSpacing: "-0.02em" }}>Financial Dashboard</h1>
          <p style={{ color: text2, fontSize: 14, marginTop: 4 }}>Comprehensive control of income, expenses, and billing for the Medical SaaS platform.</p>
        </div>
        <div style={{ display: "flex", gap: 12 }}>
          <button 
            onClick={() => setShowExpenseModal(true)}
            style={{ padding: "10px 20px", borderRadius: 12, background: "rgba(255,255,255,0.05)", border: `1px solid ${glass.border}`, color: text1, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", gap: 8 }}
          >
            <Ico name="MinusCircle" size={18} color={danger} /> Register Expense
          </button>
          <button 
            onClick={() => setShowInvoiceModal(true)}
            style={{ padding: "10px 20px", borderRadius: 12, background: accent, border: "none", color: "#1a0e00", fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", gap: 8 }}
          >
            <Ico name="PlusCircle" size={18} color="#1a0e00" /> New Invoice
          </button>
        </div>
      </div>

      {/* Filters */}
      <div style={{ display: "flex", gap: 16, marginBottom: 32 }}>
        <div style={{ display: "flex", background: glass.navItem, borderRadius: 12, padding: 4, border: `1px solid ${glass.border}` }}>
          {["month", "quarter", "year", "all"].map(f => (
            <button 
              key={f}
              onClick={() => setDateFilter(f)}
              style={{ 
                padding: "6px 16px", borderRadius: 8, border: "none", fontSize: 12, fontWeight: 600,
                background: dateFilter === f ? "rgba(255,255,255,0.1)" : "transparent",
                color: dateFilter === f ? text1 : text3, cursor: "pointer"
              }}
            >
              {f === "month" ? "Month" : f === "quarter" ? "Quarter" : f === "year" ? "Year" : "All"}
            </button>
          ))}
        </div>
        <select 
          value={doctorFilter}
          onChange={(e) => setDoctorFilter(e.target.value)}
          style={{ ...selectStyle, padding: "8px 32px 8px 16px", fontSize: 13 }}
        >
          <option value="all" style={optionStyle}>All Doctors</option>
          {doctors.map(d => <option key={d.id} value={d.id} style={optionStyle}>{d.name || d.displayName}</option>)}
        </select>
      </div>

      {/* KPI Cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 24, marginBottom: 32 }}>
        <StatCard title="Total Income" value={stats.income} icon="TrendingUp" color={success} />
        <StatCard title="Total Expenses" value={stats.expense} icon="TrendingDown" color={danger} />
        <StatCard title="Pending Insurance" value={stats.pending} icon="Clock" color="#FFA726" />
        <StatCard title="Net Profit" value={stats.net} icon="DollarSign" color="#26C6DA" />
      </div>

      {/* Charts Section */}
      <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 24, marginBottom: 32 }}>
        <GCard style={{ padding: 24 }}>
          <h3 style={{ fontSize: 16, fontWeight: 700, color: text1, marginBottom: 24 }}>Income vs Expenses (6 months)</h3>
          <div style={{ height: 300 }}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData}>
                <defs>
                  <linearGradient id="colorInc" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={success} stopOpacity={0.3}/>
                    <stop offset="95%" stopColor={success} stopOpacity={0}/>
                  </linearGradient>
                  <linearGradient id="colorExp" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={danger} stopOpacity={0.3}/>
                    <stop offset="95%" stopColor={danger} stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                <XAxis dataKey="name" stroke={text3} fontSize={12} tickLine={false} axisLine={false} />
                <YAxis stroke={text3} fontSize={12} tickLine={false} axisLine={false} tickFormatter={(v) => `$${v}`} />
                <Tooltip 
                  contentStyle={{ background: "#111", border: `1px solid ${glass.border}`, borderRadius: 12, color: text1 }}
                  itemStyle={{ fontSize: 12 }}
                />
                <Area type="monotone" dataKey="income" stroke={success} fillOpacity={1} fill="url(#colorInc)" strokeWidth={2} />
                <Area type="monotone" dataKey="expenses" stroke={danger} fillOpacity={1} fill="url(#colorExp)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </GCard>

        <GCard style={{ padding: 24 }}>
          <h3 style={{ fontSize: 16, fontWeight: 700, color: text1, marginBottom: 24 }}>Debt by Insurer</h3>
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {insuranceData.length > 0 ? insuranceData.map((ins, i) => (
              <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 16px", background: "rgba(255,255,255,0.03)", borderRadius: 12, border: `1px solid ${glass.border}` }}>
                <div>
                  <p style={{ fontSize: 14, fontWeight: 700, color: text1 }}>{ins.name}</p>
                  <p style={{ fontSize: 11, color: text3 }}>{ins.count} pending invoices</p>
                </div>
                <p style={{ fontSize: 15, fontWeight: 800, color: "#FFA726" }}>${ins.amount.toLocaleString()}</p>
              </div>
            )) : (
              <div style={{ textAlign: "center", padding: "40px 0", color: text3 }}>
                <Ico name="ShieldCheck" size={32} style={{ opacity: 0.2, marginBottom: 12 }} />
                <p style={{ fontSize: 13 }}>No pending debts</p>
              </div>
            )}
          </div>
        </GCard>
      </div>

      {/* Tables Section */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 }}>
        <GCard style={{ padding: 0, overflow: "hidden" }}>
          <div style={{ padding: "20px 24px", borderBottom: `1px solid ${glass.border}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <h3 style={{ fontSize: 16, fontWeight: 700, color: text1 }}>Recent Billing</h3>
            <button style={{ fontSize: 12, color: accent, background: "none", border: "none", cursor: "pointer" }}>See all</button>
          </div>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ textAlign: "left", background: "rgba(255,255,255,0.02)" }}>
                  <th style={{ padding: "12px 24px", color: text3, fontWeight: 600 }}>Patient</th>
                  <th style={{ padding: "12px 24px", color: text3, fontWeight: 600 }}>Concept</th>
                  <th style={{ padding: "12px 24px", color: text3, fontWeight: 600 }}>Amount</th>
                  <th style={{ padding: "12px 24px", color: text3, fontWeight: 600 }}>Status</th>
                  <th style={{ padding: "12px 24px", color: text3, fontWeight: 600 }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredInvoices.slice(0, 8).map((inv) => (
                  <tr key={inv.id} style={{ borderBottom: `1px solid ${glass.border}` }}>
                    <td style={{ padding: "16px 24px", color: text1, fontWeight: 600 }}>{inv.patientName}</td>
                    <td style={{ padding: "16px 24px", color: text2 }}>{inv.concept}</td>
                    <td style={{ padding: "16px 24px", color: text1, fontWeight: 700 }}>${inv.amount}</td>
                    <td style={{ padding: "16px 24px" }}>
                      <span style={{ 
                        padding: "4px 10px", borderRadius: 6, fontSize: 11, fontWeight: 700,
                        background: inv.status === "Issued" || inv.status === "Paid" ? `${success}22` : inv.status === "Pending" ? "#FFA72622" : `${danger}22`,
                        color: inv.status === "Issued" || inv.status === "Paid" ? success : inv.status === "Pending" ? "#FFA726" : danger
                      }}>
                        {inv.status}
                      </span>
                    </td>
                    <td style={{ padding: "16px 24px" }}>
                      {inv.status === "Pending" && (
                        <button 
                          onClick={() => handleOnlinePayment(inv)}
                          style={{ 
                            display: "flex", alignItems: "center", gap: 6, padding: "6px 12px", 
                            borderRadius: 8, background: "#00C853", border: "none", color: "#fff", 
                            fontSize: 11, fontWeight: 700, cursor: "pointer" 
                          }}
                        >
                          <Ico name="CreditCard" size={14} /> Online Pay
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </GCard>

        <GCard style={{ padding: 0, overflow: "hidden" }}>
          <div style={{ padding: "20px 24px", borderBottom: `1px solid ${glass.border}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <h3 style={{ fontSize: 16, fontWeight: 700, color: text1 }}>Expense Control</h3>
            <button style={{ fontSize: 12, color: accent, background: "none", border: "none", cursor: "pointer" }}>See all</button>
          </div>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ textAlign: "left", background: "rgba(255,255,255,0.02)" }}>
                  <th style={{ padding: "12px 24px", color: text3, fontWeight: 600 }}>Concept</th>
                  <th style={{ padding: "12px 24px", color: text3, fontWeight: 600 }}>Category</th>
                  <th style={{ padding: "12px 24px", color: text3, fontWeight: 600 }}>Amount</th>
                  <th style={{ padding: "12px 24px", color: text3, fontWeight: 600 }}>Date</th>
                </tr>
              </thead>
              <tbody>
                {filteredExpenses.slice(0, 8).map((exp) => (
                  <tr key={exp.id} style={{ borderBottom: `1px solid ${glass.border}` }}>
                    <td style={{ padding: "16px 24px", color: text1, fontWeight: 600 }}>{exp.concept}</td>
                    <td style={{ padding: "16px 24px", color: text2 }}>{exp.category}</td>
                    <td style={{ padding: "16px 24px", color: danger, fontWeight: 700 }}>-${exp.amount}</td>
                    <td style={{ padding: "16px 24px", color: text3 }}>{new Date(exp.date).toLocaleDateString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </GCard>
      </div>

      {/* Modals */}
      <AnimatePresence>
        {showInvoiceModal && (
          <FinanceModal 
            title="New Invoice" 
            onClose={() => setShowInvoiceModal(false)}
            onSubmit={async (data) => {
              const res = await api.invoices.create({
                ...data,
                clinicId,
                createdAt: new Date().toISOString()
              });
              
              // Audit Log
              await api.auditLogs.create({
                userId: user?.id,
                userName: user?.name || "User",
                action: "Invoice Created",
                details: {
                  invoiceId: res.id,
                  patientName: data.patientName,
                  amount: data.amount,
                  concept: data.concept,
                  paymentMethod: data.paymentMethod,
                  emissionDate: data.date
                },
                clinicId,
                timestamp: new Date().toISOString(),
                type: "FINANCE"
              });

              setShowInvoiceModal(false);
            }}
            type="invoice"
            patients={patients}
            doctors={doctors}
          />
        )}
        {showExpenseModal && (
          <FinanceModal 
            title="Register Expense" 
            onClose={() => setShowExpenseModal(false)}
            onSubmit={async (data) => {
              const res = await api.expenses.create({
                ...data,
                clinicId,
                registeredBy: user?.id,
                createdAt: new Date().toISOString()
              });

              // Audit Log
              await api.auditLogs.create({
                userId: user?.id,
                userName: user?.name || "User",
                action: "Expense Registered",
                details: {
                  expenseId: res.id,
                  concept: data.concept,
                  category: data.category,
                  amount: data.amount,
                  emissionDate: data.date
                },
                clinicId,
                timestamp: new Date().toISOString(),
                type: "FINANCE"
              });

              setShowExpenseModal(false);
            }}
            type="expense"
          />
        )}
      </AnimatePresence>
    </div>
  );
}

function StatCard({ title, value, icon, color }: any) {
  return (
    <GCard style={{ padding: 24, display: "flex", alignItems: "center", gap: 20 }}>
      <div style={{ width: 56, height: 56, borderRadius: 16, background: `${color}15`, display: "flex", alignItems: "center", justifyContent: "center", border: `1px solid ${color}33` }}>
        <Ico name={icon} size={24} color={color} />
      </div>
      <div>
        <p style={{ fontSize: 13, color: text2, fontWeight: 600 }}>{title}</p>
        <p style={{ fontSize: 24, fontWeight: 800, color: text1, marginTop: 2 }}>${value.toLocaleString()}</p>
      </div>
    </GCard>
  );
}

function FinanceModal({ title, onClose, onSubmit, type, patients, doctors }: any) {
  const [formData, setFormData] = useState<any>(
    type === "invoice" ? {
      patientId: "",
      patientName: "",
      doctorId: "",
      doctorName: "",
      concept: "",
      amount: 0,
      paymentMethod: "Cash",
      status: "Issued",
      insuranceCompany: "",
      date: new Date().toISOString().split('T')[0]
    } : {
      concept: "",
      category: "Supplies",
      amount: 0,
      date: new Date().toISOString().split('T')[0]
    }
  );

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.8)", backdropFilter: "blur(8px)" }}>
      <motion.div 
        initial={{ opacity: 0, scale: 0.9, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.9, y: 20 }}
        style={{ width: "100%", maxWidth: 500, background: "#0a0a0a", borderRadius: 24, border: `1px solid ${glass.border}`, overflow: "hidden", boxShadow: "0 20px 40px rgba(0,0,0,0.5)" }}
      >
        <div style={{ padding: "24px 32px", borderBottom: `1px solid ${glass.border}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h2 style={{ fontSize: 20, fontWeight: 800, color: text1 }}>{title}</h2>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: text3 }}><Ico name="X" size={20} /></button>
        </div>
        
        <div style={{ padding: 32, display: "grid", gap: 20 }}>
          {type === "invoice" ? (
            <>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  <label style={{ fontSize: 11, fontWeight: 700, color: text3, textTransform: "uppercase" }}>Patient</label>
                  <select 
                    value={formData.patientId}
                    onChange={e => {
                      const p = patients.find((x: any) => x.id === e.target.value);
                      setFormData({ ...formData, patientId: e.target.value, patientName: p?.name || "" });
                    }}
                    style={selectStyle}
                  >
                    <option value="" style={optionStyle}>Select...</option>
                    {patients.map((p: any) => <option key={p.id} value={p.id} style={optionStyle}>{p.name}</option>)}
                  </select>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  <label style={{ fontSize: 11, fontWeight: 700, color: text3, textTransform: "uppercase" }}>Doctor</label>
                  <select 
                    value={formData.doctorId}
                    onChange={e => {
                      const d = doctors.find((x: any) => x.id === e.target.value);
                      setFormData({ ...formData, doctorId: e.target.value, doctorName: d?.name || d?.displayName || "" });
                    }}
                    style={selectStyle}
                  >
                    <option value="" style={optionStyle}>Select...</option>
                    {doctors.map((d: any) => <option key={d.id} value={d.id} style={optionStyle}>{d.name || d.displayName}</option>)}
                  </select>
                </div>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <label style={{ fontSize: 11, fontWeight: 700, color: text3, textTransform: "uppercase" }}>Service Concept</label>
                <input 
                  value={formData.concept}
                  onChange={e => setFormData({ ...formData, concept: e.target.value })}
                  placeholder="E.g.: General Consultation, Ultrasound..."
                  style={{ padding: 12, borderRadius: 12, background: glass.input, border: `1px solid ${glass.border}`, color: text1, outline: "none" }}
                />
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  <label style={{ fontSize: 11, fontWeight: 700, color: text3, textTransform: "uppercase" }}>Amount ($)</label>
                  <input 
                    type="number"
                    value={formData.amount}
                    onChange={e => setFormData({ ...formData, amount: parseFloat(e.target.value) })}
                    style={{ padding: 12, borderRadius: 12, background: glass.input, border: `1px solid ${glass.border}`, color: text1, outline: "none" }}
                  />
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  <label style={{ fontSize: 11, fontWeight: 700, color: text3, textTransform: "uppercase" }}>Emission Date</label>
                  <input 
                    type="date"
                    value={formData.date}
                    onChange={e => setFormData({ ...formData, date: e.target.value })}
                    style={{ padding: 12, borderRadius: 12, background: glass.input, border: `1px solid ${glass.border}`, color: text1, outline: "none" }}
                  />
                </div>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <label style={{ fontSize: 11, fontWeight: 700, color: text3, textTransform: "uppercase" }}>Payment Method</label>
                <select 
                  value={formData.paymentMethod}
                  onChange={e => setFormData({ ...formData, paymentMethod: e.target.value })}
                  style={selectStyle}
                >
                  <option value="Cash" style={optionStyle}>Cash</option>
                  <option value="Card" style={optionStyle}>Card</option>
                  <option value="Transfer" style={optionStyle}>Transfer</option>
                  <option value="Insurance" style={optionStyle}>Medical Insurance</option>
                </select>
              </div>
              {formData.paymentMethod === "Insurance" && (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  <label style={{ fontSize: 11, fontWeight: 700, color: text3, textTransform: "uppercase" }}>Insurer</label>
                  <input 
                    value={formData.insuranceCompany}
                    onChange={e => setFormData({ ...formData, insuranceCompany: e.target.value })}
                    placeholder="E.g.: Humana, SaludSA..."
                    style={{ padding: 12, borderRadius: 12, background: glass.input, border: `1px solid ${glass.border}`, color: text1, outline: "none" }}
                  />
                </div>
              )}
            </>
          ) : (
            <>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <label style={{ fontSize: 11, fontWeight: 700, color: text3, textTransform: "uppercase" }}>Expense Concept</label>
                <input 
                  value={formData.concept}
                  onChange={e => setFormData({ ...formData, concept: e.target.value })}
                  placeholder="E.g.: Rent payment, Purchase of gloves..."
                  style={{ padding: 12, borderRadius: 12, background: glass.input, border: `1px solid ${glass.border}`, color: text1, outline: "none" }}
                />
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  <label style={{ fontSize: 11, fontWeight: 700, color: text3, textTransform: "uppercase" }}>Category</label>
                  <select 
                    value={formData.category}
                    onChange={e => setFormData({ ...formData, category: e.target.value })}
                    style={selectStyle}
                  >
                    <option value="Rent" style={optionStyle}>Rent</option>
                    <option value="Supplies" style={optionStyle}>Supplies</option>
                    <option value="Salaries" style={optionStyle}>Salaries</option>
                    <option value="Services" style={optionStyle}>Services</option>
                    <option value="Others" style={optionStyle}>Others</option>
                  </select>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  <label style={{ fontSize: 11, fontWeight: 700, color: text3, textTransform: "uppercase" }}>Amount ($)</label>
                  <input 
                    type="number"
                    value={formData.amount}
                    onChange={e => setFormData({ ...formData, amount: parseFloat(e.target.value) })}
                    style={{ padding: 12, borderRadius: 12, background: glass.input, border: `1px solid ${glass.border}`, color: text1, outline: "none" }}
                  />
                </div>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <label style={{ fontSize: 11, fontWeight: 700, color: text3, textTransform: "uppercase" }}>Emission Date</label>
                <input 
                  type="date"
                  value={formData.date}
                  onChange={e => setFormData({ ...formData, date: e.target.value })}
                  style={{ padding: 12, borderRadius: 12, background: glass.input, border: `1px solid ${glass.border}`, color: text1, outline: "none" }}
                />
              </div>
            </>
          )}
          
          <button 
            onClick={() => onSubmit(formData)}
            style={{ marginTop: 12, padding: 16, borderRadius: 16, background: accent, border: "none", color: "#1a0e00", fontWeight: 800, cursor: "pointer" }}
          >
            Confirm Registration
          </button>
        </div>
      </motion.div>
    </div>
  );
}
