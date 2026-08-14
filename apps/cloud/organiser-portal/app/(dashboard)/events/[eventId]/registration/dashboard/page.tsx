"use client";

import { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  Users, CheckCircle2, Banknote, CheckSquare, Award, GraduationCap, Globe,
  UserMinus, TrendingUp, RefreshCw, Plus, Calendar, Shield, Download, BarChart3,
  PieChart as PieIcon, FileText, ToggleLeft, ToggleRight, Copy, Check
} from "lucide-react";
import { useEvent } from "@/hooks/useEvents";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";
import { apiGet, apiPost } from "@/lib/api-client";
import { useWebSocket } from "@/hooks/useWebSocket";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, BarChart, Bar
} from "recharts";
import { useOperationAccess } from "@/lib/capabilities";

const COLORS = ["#6366F1", "#8B5CF6", "#EC4899", "#10B981", "#F59E0B", "#EF4444", "#06B6D4"];

interface Participant {
  id: string;
  regno: string;
  name: string;
  email: string;
  phone?: string;
  company?: string;
  role: string;
  paid_status: string;
  source: string;
  registered_at: string;
}

export default function RegistrationDashboard() {
  const { eventId } = useParams();
  const { data: event } = useEvent(eventId as string);
  const { socket, isConnected } = useWebSocket(eventId as string);
  const analyticsAccess = useOperationAccess("registration.analytics.view");
  const formsAccess = useOperationAccess("registration.forms.manage");

  // Tab State: 'metrics' | 'reports'
  const [activeTab, setActiveTab] = useState<"metrics" | "reports">("metrics");

  // Portal status and URL state
  const [isLive, setIsLive] = useState(false);
  const [toggling, setToggling] = useState(false);
  const [copied, setCopied] = useState(false);

  const portalUrl = `${process.env.NEXT_PUBLIC_REGISTRATION_URL || "http://localhost:3003"}/${eventId}`;

  useEffect(() => {
    const fetchPortalStatus = async () => {
      try {
        const res = await apiGet<any>(`/events/${eventId}/registration/form-config?t=${Date.now()}`);
        setIsLive(res.is_live || false);
      } catch (err) {
        console.error("Failed to fetch portal status:", err);
      }
    };

    if (eventId && formsAccess.enabled) {
      fetchPortalStatus();
    }
  }, [eventId, formsAccess.enabled]);

  const handleToggleLive = async () => {
    if (!formsAccess.enabled) {
      toast.error(`Portal publishing unavailable: ${(formsAccess.reason || "RESOLUTION_UNAVAILABLE").replaceAll("_", " ").toLowerCase()}.`);
      return;
    }
    setToggling(true);
    try {
      const res = await apiPost<any>(`/events/${eventId}/registration/form-config`, {
        is_live: !isLive
      });
      setIsLive(res.is_live);
      toast.success(res.is_live ? "Portal is now LIVE 🚀" : "Portal set to Draft");
    } catch {
      toast.error("Failed to update portal status.");
    } finally {
      setToggling(false);
    }
  };

  const copyLink = () => {
    navigator.clipboard.writeText(portalUrl);
    setCopied(true);
    toast.success("Link copied!");
    setTimeout(() => setCopied(false), 2000);
  };

  // Dashboard Stats States
  const [statsData, setStatsData] = useState<any>({
    kpis: {
      total_registrations: 0,
      checked_in_attendees: 0,
      pending_payments: 0,
      confirmed_attendees: 0,
      vip_attendees: 0,
      student_registrations: 0,
      international_attendees: 0,
      cancellations: 0,
      total_revenue: 0,
      refund_requests: 0
    },
    growth_trends: [],
    participant_type_distribution: [],
    registration_source_tracking: [],
    payment_status_analytics: [],
    country_registrations: [],
    daily_heatmap: []
  });

  const [loading, setLoading] = useState(true);
  const currency = event?.currency || "INR";

  // Reports States
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [reportsStats, setReportsStats] = useState<any>({});
  const [loadingReports, setLoadingReports] = useState(false);

  const fetchDashboardData = async () => {
    try {
      setLoading(true);
      const analyticsRes = await apiGet<any>(`/events/${eventId}/participants/analytics-dashboard`);
      setStatsData(analyticsRes);
    } catch (err) {
      console.error(err);
      toast.error("Failed to load registration analytics.");
    } finally {
      setLoading(false);
    }
  };

  const fetchReportsData = async () => {
    try {
      setLoadingReports(true);
      const [list, statsRes] = await Promise.all([
        apiGet<Participant[]>(`/events/${eventId}/participants`),
        apiGet<any>(`/events/${eventId}/participants/stats`)
      ]);
      setParticipants(list);
      setReportsStats(statsRes || {});
    } catch (err) {
      console.error(err);
      toast.error("Failed to load registration report details.");
    } finally {
      setLoadingReports(false);
    }
  };

  // Sync data based on eventId and activeTab
  useEffect(() => {
    if (eventId && analyticsAccess.enabled) {
      if (activeTab === "metrics") {
        fetchDashboardData();
      } else {
        fetchReportsData();
      }
    }
  }, [eventId, activeTab, analyticsAccess.enabled]);

  // WebSocket Live Invalidation
  useEffect(() => {
    if (!socket) return;
    const handleUpdate = () => {
      if (activeTab === "metrics") {
        fetchDashboardData();
      } else {
        fetchReportsData();
      }
    };

    socket.on("check_in.created", handleUpdate);
    socket.on("participant.updated", handleUpdate);
    socket.on("registration.created", handleUpdate);

    return () => {
      socket.off("check_in.created", handleUpdate);
      socket.off("participant.updated", handleUpdate);
      socket.off("registration.created", handleUpdate);
    };
  }, [socket, activeTab]);

  // KPI configurations
  const kpis = [
    { label: "Total Intake", value: statsData.kpis.total_registrations, icon: Users, color: "text-indigo-400" },
    { label: "Checked In", value: statsData.kpis.checked_in_attendees, icon: CheckCircle2, color: "text-emerald-400" },
    { label: "Confirmed Paid", value: statsData.kpis.confirmed_attendees, icon: CheckSquare, color: "text-green-400" },
    { label: "Pending Payment", value: statsData.kpis.pending_payments, icon: Banknote, color: "text-amber-400" },
    { label: "VIP Attendance", value: statsData.kpis.vip_attendees, icon: Award, color: "text-fuchsia-400" },
    { label: "Student Registrations", value: statsData.kpis.student_registrations, icon: GraduationCap, color: "text-yellow-400" },
    { label: "International", value: statsData.kpis.international_attendees, icon: Globe, color: "text-cyan-400" },
    { label: "Cancellations", value: statsData.kpis.cancellations, icon: UserMinus, color: "text-red-400" },
    { label: "Total Revenue", value: new Intl.NumberFormat(currency === "INR" ? "en-IN" : "en-US", { style: "currency", currency, maximumFractionDigits: 0 }).format(statsData.kpis.total_revenue || 0), icon: TrendingUp, color: "text-teal-400" },
    { label: "Refund Requests", value: statsData.kpis.refund_requests, icon: RefreshCw, color: "text-pink-400" },
  ];

  // CSV Exporter
  const handleExportCSV = () => {
    if (participants.length === 0) {
      toast.error("No delegate data available to export.");
      return;
    }

    const headers = ["Registration No", "Full Name", "Email", "Phone", "Company", "Role", "Payment Status", "Source", "Registration Date"];
    const csvRows = [headers.join(",")];

    participants.forEach(p => {
      const values = [
        `"${p.regno || ""}"`,
        `"${p.name || ""}"`,
        `"${p.email || ""}"`,
        `"${p.phone || ""}"`,
        `"${p.company || ""}"`,
        `"${p.role || ""}"`,
        `"${p.paid_status || ""}"`,
        `"${p.source || ""}"`,
        `"${p.registered_at ? new Date(p.registered_at).toLocaleDateString() : ""}"`
      ];
      csvRows.push(values.join(","));
    });

    const csvContent = "data:text/csv;charset=utf-8," + csvRows.join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `delegates-export-${eventId}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success("CSV report exported successfully.");
  };

  // Process reports charts data
  const roleChartData = useMemo(() => {
    return Object.entries(reportsStats.role_breakdown || {}).map(([name, value]) => ({
      name,
      count: value
    }));
  }, [reportsStats]);

  const paymentChartData = useMemo(() => {
    const paymentColors: Record<string, string> = {
      paid: "#10b981",
      unpaid: "#ef4444",
      pending: "#f59e0b",
      "partially paid": "#0ea5e9",
      partial: "#0ea5e9",
      refunded: "#a855f7",
      complimentary: "#6366f1",
      "complimentary / n/a": "#6366f1",
      free: "#6366f1",
      waived: "#14b8a6",
      exempted: "#14b8a6",
      unspecified: "#94a3b8",
    };

    if (reportsStats.payment_breakdown && Object.keys(reportsStats.payment_breakdown).length > 0) {
      return Object.entries(reportsStats.payment_breakdown)
        .map(([name, value]) => ({
          name,
          value: Number(value),
          color: paymentColors[name.toLowerCase()] || "#94a3b8",
        }))
        .filter((item) => item.value > 0);
    }

    const counts: Record<string, number> = {};
    participants.forEach((p) => {
      const st = p.paid_status || "Paid";
      counts[st] = (counts[st] || 0) + 1;
    });

    return Object.entries(counts)
      .map(([name, value]) => ({
        name,
        value,
        color: paymentColors[name.toLowerCase()] || "#94a3b8",
      }))
      .filter((item) => item.value > 0);
  }, [reportsStats, participants]);

  const timelineData = useMemo(() => {
    const dailyCounts: Record<string, number> = {};
    participants.forEach(p => {
      if (!p.registered_at) return;
      const dateStr = new Date(p.registered_at).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric"
      });
      dailyCounts[dateStr] = (dailyCounts[dateStr] || 0) + 1;
    });
    return Object.entries(dailyCounts)
      .map(([date, count]) => ({ date, count }))
      .reverse();
  }, [participants]);

  // Custom visual heatmap grid for DOW/Hours
  const renderHeatmapGrid = () => {
    const DAYS_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
    const HOURS_ARR = Array.from({ length: 24 }, (_, i) => i);
    const matrix = Array.from({ length: 7 }, () => Array(24).fill(0));

    statsData.daily_heatmap?.forEach((cell: any) => {
      const d = Math.min(6, Math.max(0, parseInt(cell.day)));
      const h = Math.min(23, Math.max(0, parseInt(cell.hour)));
      matrix[d][h] = cell.count;
    });

    const maxVal = Math.max(...(statsData.daily_heatmap?.map((c: any) => c.count) || [1])) || 1;

    return (
      <div className="overflow-x-auto w-full pt-4">
        <div className="min-w-[760px] space-y-1.5 pb-2">
          <div className="flex text-[9px] font-black uppercase text-muted pr-2">
            <div className="w-16 flex-shrink-0" />
            {HOURS_ARR.map(h => (
              <div key={h} className="flex-1 text-center font-bold">{h}h</div>
            ))}
          </div>
          {DAYS_NAMES.map((day, dIdx) => (
            <div key={day} className="flex items-center">
              <div className="w-16 flex-shrink-0 text-[10px] font-black uppercase text-muted">{day.substring(0, 3)}</div>
              <div className="flex flex-1 gap-1">
                {matrix[dIdx].map((val, hIdx) => {
                  const intensity = val > 0 ? Math.max(0.15, val / maxVal) : 0;
                  return (
                    <div
                      key={hIdx}
                      style={{
                        backgroundColor: val > 0 ? `rgba(99, 102, 241, ${intensity})` : "rgba(255, 255, 255, 0.03)",
                        border: val > 0 ? "1px solid rgba(99, 102, 241, 0.4)" : "1px solid rgba(255, 255, 255, 0.05)"
                      }}
                      className="flex-1 h-7 rounded flex items-center justify-center text-[9px] font-bold text-white transition-all hover:scale-110 hover:shadow-[0_0_8px_var(--pri)] cursor-help"
                      title={`${val} registrations on ${day} at ${hIdx}:00`}
                    >
                      {val > 0 ? val : ""}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  };

  if (!analyticsAccess.loading && !analyticsAccess.enabled) {
    return (
      <div className="flex min-h-[360px] items-center justify-center rounded-3xl border border-amber-500/20 bg-amber-500/5 p-8 text-center text-sm text-amber-100">
        Registration analytics are unavailable: {(analyticsAccess.reason || "RESOLUTION_UNAVAILABLE").replaceAll("_", " ").toLowerCase()}.
      </div>
    );
  }

  return (
    <div className="space-y-8 p-6 max-w-7xl mx-auto min-h-screen text-[var(--text)]">
      {/* Header section */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-[var(--pri)] animate-pulse" />
            <span className="text-[10px] font-black uppercase tracking-[0.3em] text-[var(--pri)]/85">Registration Console</span>
            {isConnected ? (
              <span className="text-[8px] font-black uppercase tracking-widest text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">WebSocket Live</span>
            ) : (
              <span className="text-[8px] font-black uppercase tracking-widest text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded-full border border-amber-500/20">WS Offline</span>
            )}
            {/* Live Portal Status Badge */}
            {isLive && (
              <span className="text-[8px] font-black uppercase tracking-widest text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20 animate-pulse">Portal Live</span>
            )}
          </div>
          <h1 className="text-4xl font-black tracking-tighter text-[var(--text)] mt-1 text-glow-indigo">
            {event?.name ? `${event.name} Console` : "Event Registrar Console"}
          </h1>
          <p className="text-[10px] font-black uppercase tracking-[0.3em] text-muted mt-1">
            Monitor intake, payments, and registration growth.
          </p>

          {/* Portal status toggle & URL copy button */}
          <div className="flex items-center gap-3 mt-3 flex-wrap">
            <div className="flex items-center gap-2.5 px-4 py-2 rounded-xl bg-white/5 border border-white/5 text-xs font-semibold">
              <span className="text-[9px] font-black uppercase tracking-wider text-muted mr-1">Portal Control:</span>
              <div className={`h-2 w-2 rounded-full ${isLive ? 'bg-emerald-400 animate-pulse' : 'bg-rose-500'}`} />
              <span className={`text-[10px] font-black uppercase tracking-wider ${isLive ? 'text-emerald-400' : 'text-rose-400'}`}>
                {isLive ? 'Live' : 'Draft'}
              </span>
              <button
                onClick={handleToggleLive}
                disabled={toggling || formsAccess.loading || !formsAccess.enabled}
                title={formsAccess.enabled ? (isLive ? "Set to Draft" : "Go Live") : `Unavailable: ${(formsAccess.reason || "RESOLUTION_UNAVAILABLE").replaceAll("_", " ").toLowerCase()}`}
                className="ml-2 hover:scale-105 transition-all text-muted hover:text-[var(--text)] disabled:opacity-50"
              >
                {isLive ? <ToggleRight className="h-5 w-5 text-emerald-400" /> : <ToggleLeft className="h-5 w-5 text-muted" />}
              </button>
            </div>

            <div className="flex items-center gap-2.5 px-4 py-2 rounded-xl bg-white/5 border border-white/5 text-xs font-semibold">
              <span className="text-[9px] font-black uppercase tracking-wider text-muted mr-1">Register Link:</span>
              <button
                onClick={copyLink}
                className="flex items-center gap-1.5 hover:text-[var(--text)] transition-all font-mono text-[10px] text-muted hover:underline"
              >
                {copied ? <Check className="h-3 w-3 text-emerald-400 animate-bounce" /> : <Copy className="h-3 w-3" />}
                {copied ? 'Copied Link' : 'Copy URL'}
              </button>
            </div>
          </div>
        </div>

        {/* Tab Switcher & Action controls */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center rounded-2xl border border-white/5 bg-white/5 p-1 gap-1 h-12">
            <button
              onClick={() => setActiveTab("metrics")}
              className={`h-9 px-5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === "metrics"
                ? "bg-[var(--pri)] text-white shadow-lg"
                : "text-muted hover:text-[var(--text)]"
                }`}
            >
              Metrics
            </button>
            <button
              onClick={() => setActiveTab("reports")}
              className={`h-9 px-5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === "reports"
                ? "bg-[var(--pri)] text-white shadow-lg"
                : "text-muted hover:text-[var(--text)]"
                }`}
            >
              Reports & CSV
            </button>
          </div>

          <Button
            onClick={activeTab === "metrics" ? fetchDashboardData : fetchReportsData}
            disabled={loading || loadingReports}
            className="h-12 px-6 bg-white/5 hover:bg-white/10 text-[var(--text)] font-black uppercase tracking-widest text-[11px] rounded-full border border-default hover-lift-3d"
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${(loading || loadingReports) ? "animate-spin" : ""}`} />
            Sync
          </Button>

          {activeTab === "reports" && (
            <Button
              onClick={handleExportCSV}
              disabled={loadingReports || participants.length === 0}
              className="h-12 px-7 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 font-black uppercase tracking-widest text-[11px] rounded-full border border-emerald-500/20 hover-lift-3d"
            >
              <Download className="h-4 w-4 mr-2" />
              Export CSV
            </Button>
          )}
        </div>
      </div>

      {/* Tab Contents */}
      <AnimatePresence mode="wait">
        {activeTab === "metrics" ? (
          <motion.div
            key="metrics"
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -15 }}
            transition={{ duration: 0.2 }}
            className="space-y-8"
          >
            {/* KPI Cards Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
              {kpis.map((kpi, idx) => (
                <motion.div
                  key={kpi.label}
                  initial={{ opacity: 0, y: 15 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: idx * 0.02 }}
                >
                  <Card className="glass-3d p-4 rounded-3xl border-default group hover-lift-3d relative overflow-hidden flex flex-col justify-between h-28 bg-[color-mix(in_srgb,var(--text)_4%,transparent)]">
                    <div className="flex items-center justify-between">
                      <span className="text-[9px] font-black uppercase tracking-[0.2em] text-muted">{kpi.label}</span>
                      <div className="h-8 w-8 rounded-xl glass-3d flex items-center justify-center border-default shadow-md bg-white/5">
                        <kpi.icon className={`h-4 w-4 ${kpi.color}`} />
                      </div>
                    </div>
                    <div className="mt-2 flex items-baseline gap-2">
                      <span className="text-2xl font-black tracking-tighter text-[var(--text)]">{kpi.value}</span>
                    </div>
                  </Card>
                </motion.div>
              ))}
            </div>

            {/* Analytics Charts Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Area Chart: Registration Growth Trend */}
              <Card className="lg:col-span-2 glass-3d p-6 rounded-[2rem] border-default bg-[color-mix(in_srgb,var(--text)_5%,transparent)]">
                <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-muted mb-6 flex items-center gap-1.5">
                  <TrendingUp className="h-3.5 w-3.5 text-indigo-400" />
                  Intake Growth Trend (Daily Accumulation)
                </h3>
                <div className="h-72 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={statsData.growth_trends}>
                      <defs>
                        <linearGradient id="growthGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#6366F1" stopOpacity={0.4} />
                          <stop offset="95%" stopColor="#6366F1" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                      <XAxis dataKey="date" stroke="rgba(255,255,255,0.4)" fontSize={9} />
                      <YAxis stroke="rgba(255,255,255,0.4)" fontSize={9} />
                      <Tooltip contentStyle={{ backgroundColor: "#0f0f16", borderColor: "rgba(255,255,255,0.1)", borderRadius: "1rem" }} />
                      <Area type="monotone" dataKey="count" stroke="#6366F1" strokeWidth={2.5} fillOpacity={1} fill="url(#growthGrad)" />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </Card>

              {/* Pie Chart: Participant Type Distribution */}
              <Card className="glass-3d p-6 rounded-[2rem] border-default bg-[color-mix(in_srgb,var(--text)_5%,transparent)]">
                <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-muted mb-6 flex items-center gap-1.5">
                  <Award className="h-3.5 w-3.5 text-fuchsia-400" />
                  Category Distribution
                </h3>
                <div className="h-72 w-full flex flex-col justify-between">
                  <div className="h-56">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={statsData.participant_type_distribution}
                          dataKey="count"
                          nameKey="role"
                          cx="50%"
                          cy="50%"
                          innerRadius={50}
                          outerRadius={70}
                          paddingAngle={4}
                        >
                          {statsData.participant_type_distribution.map((entry: any, index: number) => (
                            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip contentStyle={{ backgroundColor: "#0f0f16", borderColor: "rgba(255,255,255,0.1)", borderRadius: "1rem" }} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="flex flex-wrap justify-center gap-x-4 gap-y-1 mt-2">
                    {statsData.participant_type_distribution.map((item: any, idx: number) => (
                      <div key={item.role} className="flex items-center gap-1.5 text-[9px] font-black uppercase">
                        <span className="h-2 w-2 rounded-full" style={{ backgroundColor: COLORS[idx % COLORS.length] }} />
                        <span className="text-muted">{item.role}:</span>
                        <span className="text-[var(--text)]">{item.count}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </Card>

              {/* Bar Chart: Source Tracking */}
              <Card className="glass-3d p-6 rounded-[2rem] border-default bg-[color-mix(in_srgb,var(--text)_5%,transparent)]">
                <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-muted mb-6 flex items-center gap-1.5">
                  <Users className="h-3.5 w-3.5 text-cyan-400" />
                  Intake Sources
                </h3>
                <div className="h-72 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={statsData.registration_source_tracking} layout="vertical">
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                      <XAxis type="number" stroke="rgba(255,255,255,0.4)" fontSize={9} />
                      <YAxis type="category" dataKey="source" stroke="rgba(255,255,255,0.4)" fontSize={9} />
                      <Tooltip contentStyle={{ backgroundColor: "#0f0f16", borderColor: "rgba(255,255,255,0.1)", borderRadius: "1rem" }} />
                      <Bar dataKey="count" fill="#3b82f6" radius={[0, 4, 4, 0]}>
                        {statsData.registration_source_tracking.map((entry: any, index: number) => (
                          <Cell key={`cell-${index}`} fill={COLORS[(index + 2) % COLORS.length]} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </Card>

              {/* Bar Chart: Country-based Registrations */}
              <Card className="glass-3d p-6 rounded-[2rem] border-default bg-[color-mix(in_srgb,var(--text)_5%,transparent)]">
                <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-muted mb-6 flex items-center gap-1.5">
                  <Globe className="h-3.5 w-3.5 text-emerald-400" />
                  Geographical Layout
                </h3>
                <div className="h-72 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={statsData.country_registrations}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                      <XAxis dataKey="country" stroke="rgba(255,255,255,0.4)" fontSize={9} />
                      <YAxis stroke="rgba(255,255,255,0.4)" fontSize={9} />
                      <Tooltip contentStyle={{ backgroundColor: "#0f0f16", borderColor: "rgba(255,255,255,0.1)", borderRadius: "1rem" }} />
                      <Bar dataKey="count" fill="#10b981" radius={[4, 4, 0, 0]}>
                        {statsData.country_registrations.map((entry: any, index: number) => (
                          <Cell key={`cell-${index}`} fill={COLORS[(index + 4) % COLORS.length]} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </Card>

              {/* Pie Chart: Payment Status Analytics */}
              <Card className="glass-3d p-6 rounded-[2rem] border-default bg-[color-mix(in_srgb,var(--text)_5%,transparent)]">
                <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-muted mb-6 flex items-center gap-1.5">
                  <Banknote className="h-3.5 w-3.5 text-amber-400" />
                  Payment Operations Breakdown
                </h3>
                <div className="h-72 w-full flex flex-col justify-between">
                  <div className="h-56">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={statsData.payment_status_analytics}
                          dataKey="count"
                          nameKey="status"
                          cx="50%"
                          cy="50%"
                          outerRadius={70}
                        >
                          {statsData.payment_status_analytics.map((entry: any, index: number) => (
                            <Cell key={`cell-${index}`} fill={entry.status === "Paid" ? "#10B981" : entry.status === "Refunded" ? "#EC4899" : "#F59E0B"} />
                          ))}
                        </Pie>
                        <Tooltip contentStyle={{ backgroundColor: "#0f0f16", borderColor: "rgba(255,255,255,0.1)", borderRadius: "1rem" }} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="flex justify-center gap-4 text-[9px] font-black uppercase">
                    {statsData.payment_status_analytics.map((item: any) => (
                      <div key={item.status} className="flex items-center gap-1.5">
                        <span className="h-2.5 w-2.5 rounded-full animate-pulse" style={{ backgroundColor: item.status === "Paid" ? "#10B981" : item.status === "Refunded" ? "#EC4899" : "#F59E0B" }} />
                        <span className="text-muted">{item.status}:</span>
                        <span className="text-[var(--text)]">{item.count}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </Card>
            </div>

            {/* Daily Registration Heatmap */}
            <Card className="glass-3d p-6 rounded-[2rem] border-default bg-[color-mix(in_srgb,var(--text)_5%,transparent)]">
              <div className="flex items-center justify-between">
                <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-muted mb-2 flex items-center gap-1.5">
                  <Calendar className="h-3.5 w-3.5 text-indigo-400" />
                  Hourly Registrations Heatmap (Activity Grid)
                </h3>
                <span className="text-[9px] font-black uppercase text-muted bg-white/5 border border-default px-3 py-1 rounded-full">Heat intensity indicates registration density</span>
              </div>
              {renderHeatmapGrid()}
            </Card>
          </motion.div>
        ) : (
          <motion.div
            key="reports"
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -15 }}
            transition={{ duration: 0.2 }}
            className="space-y-8"
          >
            {loadingReports ? (
              <div className="py-20 flex flex-col items-center justify-center text-muted">
                <RefreshCw className="h-8 w-8 animate-spin text-[var(--pri)] mb-4" />
                <p className="text-sm font-medium">Loading Deep-Dive Reports...</p>
              </div>
            ) : (
              <>
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                  {/* Timeline Chart */}
                  <Card className="lg:col-span-2 p-8 glass-3d border-default rounded-[2.5rem] bg-[color-mix(in_srgb,var(--text)_5%,transparent)] relative overflow-hidden shadow-xl">
                    <div className="flex items-center gap-2 mb-6">
                      <BarChart3 className="h-4 w-4 text-[var(--pri)]" />
                      <h3 className="text-sm font-black uppercase tracking-[0.15em] text-[var(--text)]">Registration Intake Timeline</h3>
                    </div>
                    <div className="h-[300px] w-full">
                      {timelineData.length === 0 ? (
                        <div className="h-full flex items-center justify-center text-xs text-muted font-bold">No timeline records found.</div>
                      ) : (
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={timelineData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" opacity={0.1} />
                            <XAxis dataKey="date" stroke="#94a3b8" fontSize={11} fontWeight="bold" />
                            <YAxis stroke="#94a3b8" fontSize={11} fontWeight="bold" />
                            <Tooltip
                              contentStyle={{ backgroundColor: "var(--surf)", border: "1px solid var(--border-default)", borderRadius: "1rem", fontSize: "11px", color: "var(--text)", fontWeight: "bold" }}
                            />
                            <Bar dataKey="count" fill="var(--pri)" radius={[4, 4, 0, 0]} maxBarSize={45} />
                          </BarChart>
                        </ResponsiveContainer>
                      )}
                    </div>
                  </Card>

                  {/* Payment breakdown */}
                  <Card className="p-8 glass-3d border-default rounded-[2.5rem] bg-[color-mix(in_srgb,var(--text)_5%,transparent)] relative overflow-hidden shadow-xl flex flex-col justify-between">
                    <div>
                      <div className="flex items-center gap-2 mb-6">
                        <PieIcon className="h-4 w-4 text-emerald-500" />
                        <h3 className="text-sm font-black uppercase tracking-[0.15em] text-[var(--text)]">Payment Breakdown</h3>
                      </div>
                      <div className="h-[200px] w-full relative">
                        {paymentChartData.length === 0 ? (
                          <div className="h-full flex items-center justify-center text-xs text-muted font-bold">No payment metrics.</div>
                        ) : (
                          <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                              <Pie
                                data={paymentChartData}
                                cx="50%"
                                cy="50%"
                                innerRadius={60}
                                outerRadius={80}
                                paddingAngle={3}
                                dataKey="value"
                              >
                                {paymentChartData.map((entry: any, idx: number) => (
                                  <Cell key={`cell-${idx}`} fill={entry.color} />
                                ))}
                              </Pie>
                              <Tooltip />
                            </PieChart>
                          </ResponsiveContainer>
                        )}
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-3 mt-6 pt-6 border-t border-default/30 text-xs font-black uppercase tracking-wider justify-around">
                      {paymentChartData.length === 0 ? (
                        <div className="text-muted text-center text-xs py-1">No payment data</div>
                      ) : (
                        paymentChartData.map((item) => (
                          <div key={item.name} className="text-center px-2 py-1">
                            <span className="block text-xl font-black" style={{ color: item.color }}>
                              {item.value}
                            </span>
                            <span className="text-[10px] text-muted">{item.name}</span>
                          </div>
                        ))
                      )}
                    </div>
                  </Card>
                </div>

                {/* Role Breakdown Bar chart */}
                <Card className="p-8 glass-3d border-default rounded-[2.5rem] bg-[color-mix(in_srgb,var(--text)_5%,transparent)] relative overflow-hidden shadow-xl">
                  <div className="flex items-center gap-2 mb-6">
                    <FileText className="h-4 w-4 text-[var(--sec)]" />
                    <h3 className="text-sm font-black uppercase tracking-[0.15em] text-[var(--text)]">Role Category Distribution</h3>
                  </div>
                  <div className="h-[250px] w-full">
                    {roleChartData.length === 0 ? (
                      <div className="h-full flex items-center justify-center text-xs text-muted font-bold">No role distribution metrics.</div>
                    ) : (
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={roleChartData} layout="vertical" margin={{ top: 10, right: 10, left: 30, bottom: 5 }}>
                          <CartesianGrid strokeDasharray="3 3" opacity={0.1} />
                          <XAxis type="number" stroke="#94a3b8" fontSize={11} fontWeight="bold" />
                          <YAxis type="category" dataKey="name" stroke="#94a3b8" fontSize={11} fontWeight="bold" />
                          <Tooltip />
                          <Bar dataKey="count" fill="var(--sec)" radius={[0, 4, 4, 0]} maxBarSize={25} />
                        </BarChart>
                      </ResponsiveContainer>
                    )}
                  </div>
                </Card>
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
