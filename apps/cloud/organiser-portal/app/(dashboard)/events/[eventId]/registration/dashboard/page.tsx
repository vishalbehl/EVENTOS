"use client";

import { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  Users,
  Banknote,
  CheckSquare,
  Award,
  Globe,
  UserMinus,
  TrendingUp,
  RefreshCw,
  Calendar,
  Shield,
  Download,
  BarChart3,
  PieChart as PieIcon,
  FileText,
} from "lucide-react";

import { useEvent } from "@/hooks/useEvents";
import { toast } from "sonner";
import { apiGet, apiPost } from "@/lib/api-client";
import { useWebSocket } from "@/hooks/useWebSocket";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
} from "recharts";
import { useOperationAccess } from "@/lib/capabilities";
import { cn } from "@/lib/utils";

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
  const params = useParams();
  const eventIdStr = (params?.eventId as string) || "";
  const { data: event } = useEvent(eventIdStr);
  const { socket, isConnected } = useWebSocket(eventIdStr);
  const analyticsAccess = useOperationAccess("registration.analytics.view");
  const formsAccess = useOperationAccess("registration.forms.manage");

  const [activeTab, setActiveTab] = useState<"metrics" | "reports">("metrics");

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
      refund_requests: 0,
    },
    growth_trends: [],
    participant_type_distribution: [],
    registration_source_tracking: [],
    payment_status_analytics: [],
    country_registrations: [],
    daily_heatmap: [],
  });

  const [loading, setLoading] = useState(true);
  const currency = event?.currency || "INR";

  const [participants, setParticipants] = useState<Participant[]>([]);
  const [reportsStats, setReportsStats] = useState<any>({});
  const [loadingReports, setLoadingReports] = useState(false);

  const fetchDashboardData = async () => {
    try {
      setLoading(true);
      const analyticsRes = await apiGet<any>(
        `/events/${eventIdStr}/participants/analytics-dashboard`
      );
      setStatsData(analyticsRes);
    } catch {
      toast.error("Failed to load registration analytics.");
    } finally {
      setLoading(false);
    }
  };

  const fetchReportsData = async () => {
    try {
      setLoadingReports(true);
      const [list, statsRes] = await Promise.all([
        apiGet<Participant[]>(`/events/${eventIdStr}/participants`),
        apiGet<any>(`/events/${eventIdStr}/participants/stats`),
      ]);
      setParticipants(list);
      setReportsStats(statsRes || {});
    } catch {
      toast.error("Failed to load registration report details.");
    } finally {
      setLoadingReports(false);
    }
  };

  useEffect(() => {
    if (eventIdStr && analyticsAccess.enabled) {
      if (activeTab === "metrics") {
        fetchDashboardData();
      } else {
        fetchReportsData();
      }
    }
  }, [eventIdStr, activeTab, analyticsAccess.enabled]);

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

  const kpis = [
    { label: "Total Registrations", value: statsData.kpis.total_registrations, icon: Users, color: "text-[var(--pri)]" },
    { label: "Confirmed Paid", value: statsData.kpis.confirmed_attendees, icon: CheckSquare, color: "text-emerald-500" },
    { label: "Pending Payment", value: statsData.kpis.pending_payments, icon: Banknote, color: "text-amber-500" },
    {
      label: "Total Revenue",
      value: new Intl.NumberFormat(currency === "INR" ? "en-IN" : "en-US", {
        style: "currency",
        currency,
        maximumFractionDigits: 0,
      }).format(statsData.kpis.total_revenue || 0),
      icon: TrendingUp,
      color: "text-emerald-600 dark:text-emerald-400",
    },
    { label: "Cancellations", value: statsData.kpis.cancellations, icon: UserMinus, color: "text-rose-500" },
    { label: "Refund Requests", value: statsData.kpis.refund_requests, icon: RefreshCw, color: "text-pink-500" },
  ];

  const handleExportCSV = () => {
    if (participants.length === 0) {
      toast.error("No delegate data available to export.");
      return;
    }

    const headers = [
      "Registration No",
      "Full Name",
      "Email",
      "Phone",
      "Company",
      "Role",
      "Payment Status",
      "Source",
      "Registration Date",
    ];
    const csvRows = [headers.join(",")];

    participants.forEach((p) => {
      const values = [
        `"${p.regno || ""}"`,
        `"${p.name || ""}"`,
        `"${p.email || ""}"`,
        `"${p.phone || ""}"`,
        `"${p.company || ""}"`,
        `"${p.role || ""}"`,
        `"${p.paid_status || ""}"`,
        `"${p.source || ""}"`,
        `"${p.registered_at ? new Date(p.registered_at).toLocaleDateString() : ""}"`,
      ];
      csvRows.push(values.join(","));
    });

    const csvContent = "data:text/csv;charset=utf-8," + csvRows.join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `delegates-export-${eventIdStr}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success("CSV report exported successfully.");
  };

  const roleChartData = useMemo(() => {
    return Object.entries(reportsStats.role_breakdown || {}).map(([name, value]) => ({
      name,
      count: value,
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
    participants.forEach((p) => {
      if (!p.registered_at) return;
      const dateStr = new Date(p.registered_at).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
      });
      dailyCounts[dateStr] = (dailyCounts[dateStr] || 0) + 1;
    });
    return Object.entries(dailyCounts)
      .map(([date, count]) => ({ date, count }))
      .reverse();
  }, [participants]);

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
      <div className="overflow-x-auto w-full pt-3">
        <div className="min-w-[720px] space-y-1">
          <div className="flex text-[9px] font-bold uppercase text-[var(--text-tertiary)] pr-2">
            <div className="w-12 shrink-0" />
            {HOURS_ARR.map((h) => (
              <div key={h} className="flex-1 text-center font-mono">
                {h}h
              </div>
            ))}
          </div>
          {DAYS_NAMES.map((day, dIdx) => (
            <div key={day} className="flex items-center">
              <div className="w-12 shrink-0 text-[10px] font-bold uppercase text-[var(--text-secondary)]">
                {day.substring(0, 3)}
              </div>
              <div className="flex flex-1 gap-1">
                {matrix[dIdx].map((val, hIdx) => {
                  const intensity = val > 0 ? Math.max(0.2, val / maxVal) : 0;
                  return (
                    <div
                      key={hIdx}
                      style={{
                        backgroundColor:
                          val > 0
                            ? `color-mix(in srgb, var(--pri) ${Math.round(intensity * 100)}%, transparent)`
                            : "var(--bg-surface-2)",
                        border:
                          val > 0
                            ? "1px solid color-mix(in srgb, var(--pri) 50%, transparent)"
                            : "1px solid var(--border-subtle)",
                      }}
                      className="flex-1 h-6 rounded flex items-center justify-center text-[9px] font-bold text-[var(--text-primary)] transition-all cursor-help"
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

  return (
    <div className="w-full space-y-6 p-6">
      {/* ── Top Header ── */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Shield className="size-4 text-[var(--pri)]" />
            <span className="text-[10px] font-bold uppercase tracking-widest text-[var(--pri)]">
              Registration Service
            </span>
            {isConnected ? (
              <span className="inline-flex items-center rounded bg-emerald-500/10 px-2 py-0.5 text-[9px] font-bold uppercase text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                Live Feed
              </span>
            ) : (
              <span className="inline-flex items-center rounded bg-amber-500/10 px-2 py-0.5 text-[9px] font-bold uppercase text-amber-600 dark:text-amber-400 border border-amber-500/20">
                Polling
              </span>
            )}
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-[var(--text-primary)]">
            Registration Operations
          </h1>
          <p className="text-xs text-[var(--text-secondary)] mt-0.5">
            Monitor delegate intake, revenue growth, payment states, and registration metrics.
          </p>
        </div>

        {/* Tab Switcher & Actions */}

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <div className="flex items-center rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface-2)] p-1 gap-1 shadow-sm">
            <button
              type="button"
              onClick={() => setActiveTab("metrics")}
              className={cn(
                "h-7 px-3 rounded-md text-xs font-semibold transition-colors cursor-pointer",
                activeTab === "metrics"
                  ? "bg-[var(--pri)] text-[var(--primary-contrast)] shadow-sm font-bold"
                  : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
              )}
            >
              Metrics
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("reports")}
              className={cn(
                "h-7 px-3 rounded-md text-xs font-semibold transition-colors cursor-pointer",
                activeTab === "reports"
                  ? "bg-[var(--pri)] text-[var(--primary-contrast)] shadow-sm font-bold"
                  : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
              )}
            >
              Reports & CSV
            </button>
          </div>

          <button
            type="button"
            onClick={activeTab === "metrics" ? fetchDashboardData : fetchReportsData}
            disabled={loading || loadingReports}
            className="flex h-9 items-center gap-1.5 rounded-lg border border-[var(--border-default)] bg-[var(--card)] px-3 text-xs font-semibold text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)] shadow-sm transition-colors cursor-pointer"
          >
            <RefreshCw
              className={cn("size-3.5", (loading || loadingReports) && "animate-spin text-[var(--pri)]")}
            />
            Sync
          </button>

          {activeTab === "reports" && (
            <button
              type="button"
              onClick={handleExportCSV}
              disabled={loadingReports || participants.length === 0}
              className="flex h-9 items-center gap-1.5 rounded-lg bg-[var(--pri)] px-3.5 text-xs font-bold text-[var(--primary-contrast)] shadow-sm hover:opacity-90 transition-opacity cursor-pointer"
            >
              <Download className="size-3.5" />
              Export CSV
            </button>
          )}
        </div>
      </div>

      {/* ── KPI Cards Strip (4-Column Layout) ── */}
      {activeTab === "metrics" && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
          {kpis.map((kpi) => (
            <div
              key={kpi.label}
              className="rounded-lg border border-[var(--border-default)] bg-[var(--card)] p-3.5 shadow-sm flex flex-col justify-between"
            >
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">
                  {kpi.label}
                </span>
                <kpi.icon className={cn("size-4", kpi.color)} />
              </div>
              <div className="text-xl font-bold text-[var(--text-primary)] mt-2">{kpi.value}</div>
            </div>
          ))}
        </div>
      )}

      {/* ── Tab Views ── */}
      <AnimatePresence mode="wait">
        {activeTab === "metrics" ? (
          <motion.div
            key="metrics"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="space-y-4"
          >
            {/* Charts Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              {/* Growth Trend */}
              <div className="lg:col-span-2 rounded-lg border border-[var(--border-default)] bg-[var(--card)] p-5 shadow-sm space-y-3">
                <div className="flex items-center gap-2">
                  <TrendingUp className="size-4 text-[var(--pri)]" />
                  <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--text-primary)]">
                    Intake Growth Trend (Daily Accumulation)
                  </h3>
                </div>
                <div className="h-64 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={statsData.growth_trends}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.3} />
                      <XAxis dataKey="date" fontSize={10} tick={{ fill: "var(--text-secondary)" }} />
                      <YAxis fontSize={10} tick={{ fill: "var(--text-secondary)" }} />
                      <Tooltip />
                      <Area
                        type="monotone"
                        dataKey="count"
                        stroke="var(--pri)"
                        strokeWidth={2}
                        fill="color-mix(in srgb, var(--pri) 20%, transparent)"
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Category Distribution */}
              <div className="rounded-lg border border-[var(--border-default)] bg-[var(--card)] p-5 shadow-sm space-y-3 flex flex-col justify-between">
                <div className="flex items-center gap-2">
                  <Award className="size-4 text-purple-500" />
                  <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--text-primary)]">
                    Category Distribution
                  </h3>
                </div>
                <div className="h-44">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={statsData.participant_type_distribution}
                        dataKey="count"
                        nameKey="role"
                        cx="50%"
                        cy="50%"
                        innerRadius={40}
                        outerRadius={60}
                        paddingAngle={3}
                      >
                        {statsData.participant_type_distribution.map((entry: any, index: number) => (
                          <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="flex flex-wrap gap-2 text-[10px] font-semibold text-[var(--text-secondary)]">
                  {statsData.participant_type_distribution.map((item: any, idx: number) => (
                    <span key={item.role} className="flex items-center gap-1">
                      <span
                        className="size-2 rounded-full"
                        style={{ backgroundColor: COLORS[idx % COLORS.length] }}
                      />
                      {item.role}: {item.count}
                    </span>
                  ))}
                </div>
              </div>

              {/* Sources */}
              <div className="rounded-lg border border-[var(--border-default)] bg-[var(--card)] p-5 shadow-sm space-y-3">
                <div className="flex items-center gap-2">
                  <Users className="size-4 text-cyan-500" />
                  <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--text-primary)]">
                    Intake Sources
                  </h3>
                </div>
                <div className="h-60 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={statsData.registration_source_tracking} layout="vertical">
                      <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                      <XAxis type="number" fontSize={10} />
                      <YAxis type="category" dataKey="source" fontSize={10} width={80} />
                      <Tooltip />
                      <Bar dataKey="count" fill="var(--pri)" radius={[0, 4, 4, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Geography */}
              <div className="rounded-lg border border-[var(--border-default)] bg-[var(--card)] p-5 shadow-sm space-y-3">
                <div className="flex items-center gap-2">
                  <Globe className="size-4 text-emerald-500" />
                  <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--text-primary)]">
                    Geographical Layout
                  </h3>
                </div>
                <div className="h-60 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={statsData.country_registrations}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.2} />
                      <XAxis dataKey="country" fontSize={10} />
                      <YAxis fontSize={10} />
                      <Tooltip />
                      <Bar dataKey="count" fill="#10b981" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Payment Status */}
              <div className="rounded-lg border border-[var(--border-default)] bg-[var(--card)] p-5 shadow-sm space-y-3">
                <div className="flex items-center gap-2">
                  <Banknote className="size-4 text-amber-500" />
                  <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--text-primary)]">
                    Payment Breakdown
                  </h3>
                </div>
                <div className="h-44">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={statsData.payment_status_analytics}
                        dataKey="count"
                        nameKey="status"
                        cx="50%"
                        cy="50%"
                        outerRadius={60}
                      >
                        {statsData.payment_status_analytics.map((entry: any, index: number) => (
                          <Cell
                            key={`cell-${index}`}
                            fill={
                              entry.status === "Paid"
                                ? "#10B981"
                                : entry.status === "Refunded"
                                ? "#EC4899"
                                : "#F59E0B"
                            }
                          />
                        ))}
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="flex justify-around text-xs font-semibold text-[var(--text-secondary)]">
                  {statsData.payment_status_analytics.map((item: any) => (
                    <span key={item.status}>
                      {item.status}: {item.count}
                    </span>
                  ))}
                </div>
              </div>
            </div>

            {/* Heatmap Card */}
            <div className="rounded-lg border border-[var(--border-default)] bg-[var(--card)] p-5 shadow-sm space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Calendar className="size-4 text-[var(--pri)]" />
                  <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--text-primary)]">
                    Hourly Registrations Activity Heatmap
                  </h3>
                </div>
                <span className="text-[10px] text-[var(--text-tertiary)]">Day &times; Hour matrix</span>
              </div>
              {renderHeatmapGrid()}
            </div>
          </motion.div>
        ) : (
          <motion.div
            key="reports"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="space-y-4"
          >
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <div className="lg:col-span-2 rounded-lg border border-[var(--border-default)] bg-[var(--card)] p-5 shadow-sm space-y-3">
                <div className="flex items-center gap-2">
                  <BarChart3 className="size-4 text-[var(--pri)]" />
                  <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--text-primary)]">
                    Registration Intake Timeline
                  </h3>
                </div>
                <div className="h-64 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={timelineData}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.2} />
                      <XAxis dataKey="date" fontSize={10} />
                      <YAxis fontSize={10} />
                      <Tooltip />
                      <Bar dataKey="count" fill="var(--pri)" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="rounded-lg border border-[var(--border-default)] bg-[var(--card)] p-5 shadow-sm space-y-3 flex flex-col justify-between">
                <div className="flex items-center gap-2">
                  <PieIcon className="size-4 text-emerald-500" />
                  <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--text-primary)]">
                    Payment Status Breakdown
                  </h3>
                </div>
                <div className="h-44">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={paymentChartData}
                        cx="50%"
                        cy="50%"
                        innerRadius={45}
                        outerRadius={65}
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
                </div>
                <div className="flex flex-wrap justify-around gap-2 text-xs font-bold">
                  {paymentChartData.map((item) => (
                    <div key={item.name} className="text-center">
                      <span className="block text-sm" style={{ color: item.color }}>
                        {item.value}
                      </span>
                      <span className="text-[10px] text-[var(--text-secondary)]">{item.name}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Role Breakdown */}
            <div className="rounded-lg border border-[var(--border-default)] bg-[var(--card)] p-5 shadow-sm space-y-3">
              <div className="flex items-center gap-2">
                <FileText className="size-4 text-[var(--sec)]" />
                <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--text-primary)]">
                  Role Category Distribution
                </h3>
              </div>
              <div className="h-56 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={roleChartData} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                    <XAxis type="number" fontSize={10} />
                    <YAxis type="category" dataKey="name" fontSize={10} width={120} />
                    <Tooltip />
                    <Bar dataKey="count" fill="var(--sec)" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
