"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { motion } from "framer-motion";
import {
  Users, CheckCircle2, Banknote, CheckSquare, Award, GraduationCap, Globe,
  UserMinus, TrendingUp, RefreshCw, Plus, Calendar, Shield
} from "lucide-react";
import { useEvent } from "@/hooks/useEvents";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";
import { apiGet } from "@/lib/api-client";
import { useWebSocket } from "@/hooks/useWebSocket";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, BarChart, Bar
} from "recharts";

const COLORS = ["#6366F1", "#8B5CF6", "#EC4899", "#10B981", "#F59E0B", "#EF4444", "#06B6D4"];

export default function RegistrationDashboard() {
  const { eventId } = useParams();
  const { data: event } = useEvent(eventId as string);
  const { socket, isConnected } = useWebSocket(eventId as string);

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

  useEffect(() => {
    if (eventId) {
      fetchDashboardData();
    }
  }, [eventId]);

  // WebSocket Live Invalidation
  useEffect(() => {
    if (!socket) return;
    const handleUpdate = () => {
      fetchDashboardData();
    };

    socket.on("check_in.created", handleUpdate);
    socket.on("participant.updated", handleUpdate);
    socket.on("registration.created", handleUpdate);

    return () => {
      socket.off("check_in.created", handleUpdate);
      socket.off("participant.updated", handleUpdate);
      socket.off("registration.created", handleUpdate);
    };
  }, [socket]);

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

  return (
    <div className="space-y-8 p-6 max-w-7xl mx-auto min-h-screen text-[var(--text)]">
      {/* Header section */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-[var(--pri)] animate-pulse" />
            <span className="text-[10px] font-black uppercase tracking-[0.3em] text-[var(--pri)]/85">Registration Terminal</span>
            {isConnected ? (
              <span className="text-[8px] font-black uppercase tracking-widest text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">Live Connection</span>
            ) : (
              <span className="text-[8px] font-black uppercase tracking-widest text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded-full border border-amber-500/20">Offline Mode</span>
            )}
          </div>
          <h1 className="text-4xl font-black tracking-tighter text-[var(--text)] mt-1 text-glow-indigo">
            {event?.name ? `${event.name} Dashboard` : "Registration Dashboard"}
          </h1>
          <p className="text-[10px] font-black uppercase tracking-[0.3em] text-muted mt-1">
            Real-time visual telemetry, intake growth, category analysis, and country mappings.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Button onClick={fetchDashboardData} disabled={loading} className="h-12 px-6 bg-white/5 hover:bg-white/10 text-[var(--text)] font-black uppercase tracking-widest text-[11px] rounded-full border border-default hover-lift-3d">
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
            Sync Dashboard
          </Button>
          <Link href={`/events/${eventId}/register`}>
            <Button className="h-12 px-7 bg-[var(--pri)] hover:bg-[var(--sec)] text-white font-black uppercase tracking-widest text-[11px] rounded-full border-0 hover-lift-3d">
              <Plus className="h-4 w-4 mr-2" />
              Add Delegate
            </Button>
          </Link>
        </div>
      </div>

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
        {kpis.map((kpi, idx) => (
          <motion.div
            key={kpi.label}
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: idx * 0.03 }}
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
                    <stop offset="5%" stopColor="#6366F1" stopOpacity={0.4}/>
                    <stop offset="95%" stopColor="#6366F1" stopOpacity={0}/>
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
    </div>
  );
}
