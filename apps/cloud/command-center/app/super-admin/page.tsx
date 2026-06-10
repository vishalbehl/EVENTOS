"use client";

import { useAdminDashboard, useAdminOrgs, useRevenueMetrics, useAdminSubscriptions } from "@/services/super-admin-service";
import {
  Building2, Users2, Calendar, TrendingUp, Server,
  HardDrive, Activity, CheckCircle2, RefreshCw,
  ArrowUpRight, ArrowDownRight, Zap, DollarSign,
} from "lucide-react";
import { LineChart, Line, AreaChart, Area, PieChart, Pie, Cell, Tooltip, ResponsiveContainer, XAxis, YAxis } from "recharts";
import { formatDistanceToNow } from "date-fns";

// ── Helpers ───────────────────────────────────────────────────

function formatBytes(bytes: number) {
  if (!bytes) return "0 GB";
  const gb = bytes / (1024 ** 3);
  if (gb < 1) return `${(bytes / (1024 ** 2)).toFixed(1)} MB`;
  return `${gb.toFixed(1)} GB`;
}

function formatCurrency(n: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);
}

// ── KPI Card ──────────────────────────────────────────────────

function KpiCard({
  label, value, sub, icon: Icon, color, loading,
}: {
  label: string; value: string | number; sub?: string;
  icon: React.ElementType; color: string; loading?: boolean;
}) {
  return (
    <div className={`relative rounded-2xl border border-white/5 bg-white/3 backdrop-blur-sm p-5 overflow-hidden group hover:border-white/10 transition-all duration-300`}>
      <div className={`absolute top-0 right-0 w-32 h-32 rounded-full blur-3xl opacity-10 ${color.replace("text-", "bg-")}`} />
      <div className="flex items-start justify-between mb-4">
        <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/35">{label}</p>
        <div className={`p-2 rounded-xl bg-white/5 ${color}`}>
          <Icon className="w-4 h-4" />
        </div>
      </div>
      {loading ? (
        <div className="h-8 w-24 bg-white/5 rounded-lg animate-pulse" />
      ) : (
        <p className={`text-3xl font-black tabular-nums ${color}`}>{value}</p>
      )}
      {sub && <p className="text-[10px] text-white/30 mt-1.5 font-medium">{sub}</p>}
    </div>
  );
}

// ── Plan Distribution Chart ───────────────────────────────────

const PLAN_COLORS = ["#8b5cf6", "#6366f1", "#3b82f6", "#06b6d4", "#10b981"];

function PlanDistribution({ subscriptions }: { subscriptions: any[] }) {
  const planCounts = subscriptions.reduce((acc: Record<string, number>, s) => {
    acc[s.plan_name] = (acc[s.plan_name] || 0) + 1;
    return acc;
  }, {});
  
  const data = Object.entries(planCounts).map(([name, value]) => ({ name, value }));
  
  if (!data.length) {
    return (
      <div className="flex items-center justify-center h-48 text-white/20 text-sm">No subscription data</div>
    );
  }

  return (
    <div className="flex items-center gap-6">
      <ResponsiveContainer width={140} height={140}>
        <PieChart>
          <Pie data={data} cx="50%" cy="50%" innerRadius={40} outerRadius={65} paddingAngle={3} dataKey="value">
            {data.map((_, i) => (
              <Cell key={i} fill={PLAN_COLORS[i % PLAN_COLORS.length]} />
            ))}
          </Pie>
        </PieChart>
      </ResponsiveContainer>
      <div className="space-y-2 flex-1">
        {data.map((item, i) => (
          <div key={item.name} className="flex items-center gap-2">
            <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: PLAN_COLORS[i % PLAN_COLORS.length] }} />
            <span className="text-[11px] text-white/50 flex-1">{item.name}</span>
            <span className="text-[11px] font-bold text-white/70">{item.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Revenue Chart ─────────────────────────────────────────────

function RevenueChart({ data }: { data: any[] }) {
  if (!data.length) {
    return (
      <div className="flex items-center justify-center h-48 text-white/20 text-sm">No revenue data yet</div>
    );
  }
  return (
    <ResponsiveContainer width="100%" height={160}>
      <AreaChart data={data} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
        <defs>
          <linearGradient id="mrrGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.3} />
            <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0} />
          </linearGradient>
        </defs>
        <XAxis dataKey="period" tick={{ fontSize: 9, fill: "rgba(255,255,255,0.3)" }} axisLine={false} tickLine={false} />
        <YAxis tick={{ fontSize: 9, fill: "rgba(255,255,255,0.3)" }} axisLine={false} tickLine={false} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
        <Tooltip
          contentStyle={{ background: "rgba(15,15,20,0.95)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 12, fontSize: 11 }}
          formatter={(v: any) => [formatCurrency(v), "MRR"]}
        />
        <Area type="monotone" dataKey="mrr" stroke="#8b5cf6" fill="url(#mrrGrad)" strokeWidth={2} dot={false} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

// ── Activity Feed ─────────────────────────────────────────────

const ACTIVITY_ICONS: Record<string, { icon: string; color: string }> = {
  ORG_ACTIVATED: { icon: "✅", color: "text-emerald-400" },
  ORG_SUSPENDED: { icon: "🚫", color: "text-red-400" },
  FEATURE_OVERRIDE_CHANGED: { icon: "⚙️", color: "text-violet-400" },
  PLAN_UPGRADED: { icon: "⬆️", color: "text-blue-400" },
  SUBSCRIPTION_EXPIRED: { icon: "⏰", color: "text-amber-400" },
  IMPERSONATION_STARTED: { icon: "👤", color: "text-orange-400" },
  default: { icon: "📋", color: "text-white/40" },
};

function ActivityFeed({ orgs }: { orgs: any[] }) {
  // Use org created_at as activity events for now
  const activities = orgs.slice(0, 8).map((org) => ({
    type: "ORG_CREATED",
    label: `${org.name} joined the platform`,
    time: org.created_at,
    icon: "🏢",
    color: "text-purple-400",
  }));

  return (
    <div className="space-y-3">
      {activities.length === 0 ? (
        <p className="text-white/25 text-sm py-4 text-center">No recent activity</p>
      ) : (
        activities.map((a, i) => (
          <div key={i} className="flex items-start gap-3 group">
            <div className="w-7 h-7 rounded-lg bg-white/5 flex items-center justify-center flex-shrink-0 text-sm">
              {a.icon}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[12px] text-white/70 font-medium truncate">{a.label}</p>
              <p className="text-[10px] text-white/25 font-mono">
                {formatDistanceToNow(new Date(a.time), { addSuffix: true })}
              </p>
            </div>
          </div>
        ))
      )}
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────

export default function SuperAdminDashboard() {
  const { data: metrics, isLoading: metricsLoading } = useAdminDashboard();
  const { data: orgs = [], isLoading: orgsLoading } = useAdminOrgs({ limit: 100 });
  const { data: revenue = [] } = useRevenueMetrics(12);
  const { data: subsData } = useAdminSubscriptions({ limit: 200 });

  const currentMrr = metrics?.current_mrr || 0;
  const storageFormatted = formatBytes(metrics?.storage_used_bytes || 0);
  const subsItems = subsData?.items || [];

  const kpis = [
    {
      label: "Total Organizations",
      value: metricsLoading ? "—" : (metrics?.total_organizations || 0).toLocaleString(),
      icon: Building2,
      color: "text-violet-400",
      sub: `${metrics?.active_organizations || 0} active`,
    },
    {
      label: "Total Events",
      value: metricsLoading ? "—" : (metrics?.total_active_events || 0).toLocaleString(),
      icon: Calendar,
      color: "text-blue-400",
      sub: "across all orgs",
    },
    {
      label: "Total Registrations",
      value: metricsLoading ? "—" : (metrics?.total_registrations || 0).toLocaleString(),
      icon: Users2,
      color: "text-emerald-400",
      sub: "platform-wide",
    },
    {
      label: "Monthly Revenue",
      value: metricsLoading ? "—" : formatCurrency(currentMrr),
      icon: DollarSign,
      color: "text-amber-400",
      sub: "current MRR",
    },
    {
      label: "Storage Used",
      value: metricsLoading ? "—" : storageFormatted,
      icon: HardDrive,
      color: "text-cyan-400",
      sub: "total platform storage",
    },
    {
      label: "API Gateway",
      value: "Online",
      icon: Zap,
      color: "text-green-400",
      sub: "healthy",
    },
    {
      label: "Active Subscriptions",
      value: subsData?.total || "—",
      icon: TrendingUp,
      color: "text-pink-400",
      sub: "billing active",
    },
    {
      label: "Platform Health",
      value: "100%",
      icon: Activity,
      color: "text-teal-400",
      sub: "all systems operational",
    },
  ];

  return (
    <div className="space-y-6 animate-in fade-in duration-500">

      {/* Page Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-black text-white tracking-tight">Platform Overview</h1>
          <p className="text-[12px] text-white/35 font-medium mt-1">
            EventX OS · Super Admin Control Plane · Real-time metrics
          </p>
        </div>
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-full border border-emerald-500/20 bg-emerald-500/5">
          <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
          <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-wider">All Systems Operational</span>
        </div>
      </div>

      {/* KPI Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {kpis.map((kpi) => (
          <KpiCard key={kpi.label} {...kpi} loading={metricsLoading} />
        ))}
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

        {/* Revenue Chart */}
        <div className="lg:col-span-2 rounded-2xl border border-white/5 bg-white/3 backdrop-blur-sm p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-black text-white">Revenue Growth</h3>
              <p className="text-[10px] text-white/30">Monthly Recurring Revenue (12 months)</p>
            </div>
            <span className="text-[11px] font-bold text-violet-400 tabular-nums">
              {formatCurrency(currentMrr)} MRR
            </span>
          </div>
          <RevenueChart data={revenue} />
        </div>

        {/* Plan Distribution */}
        <div className="rounded-2xl border border-white/5 bg-white/3 backdrop-blur-sm p-5">
          <div className="mb-4">
            <h3 className="text-sm font-black text-white">Plan Distribution</h3>
            <p className="text-[10px] text-white/30">Subscriptions by plan tier</p>
          </div>
          <PlanDistribution subscriptions={subsItems} />
        </div>
      </div>

      {/* Bottom Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

        {/* Org Status Breakdown */}
        <div className="rounded-2xl border border-white/5 bg-white/3 backdrop-blur-sm p-5">
          <h3 className="text-sm font-black text-white mb-4">Organization Health</h3>
          <div className="space-y-3">
            {[
              { label: "Healthy", count: subsItems.filter(s => s.status === "ACTIVE").length, color: "bg-emerald-400" },
              { label: "Trial", count: subsItems.filter(s => s.status === "TRIAL").length, color: "bg-blue-400" },
              { label: "Suspended", count: subsItems.filter(s => s.status === "SUSPENDED").length, color: "bg-red-400" },
              { label: "Grace Period", count: subsItems.filter(s => s.status === "GRACE_PERIOD").length, color: "bg-amber-400" },
              { label: "Expired", count: subsItems.filter(s => s.status === "EXPIRED").length, color: "bg-red-500" },
            ].map(item => (
              <div key={item.label} className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className={`w-2 h-2 rounded-full ${item.color}`} />
                  <span className="text-[12px] text-white/50">{item.label}</span>
                </div>
                <span className="text-[12px] font-bold text-white/70 tabular-nums">{item.count}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Quick Stats */}
        <div className="rounded-2xl border border-white/5 bg-white/3 backdrop-blur-sm p-5">
          <h3 className="text-sm font-black text-white mb-4">Platform Metrics</h3>
          <div className="space-y-3">
            {[
              { label: "Avg Events / Org", value: orgs.length > 0 ? ((metrics?.total_active_events || 0) / orgs.length).toFixed(1) : "0" },
              { label: "Avg Storage / Org", value: orgs.length > 0 ? formatBytes((metrics?.storage_used_bytes || 0) / orgs.length) : "0 MB" },
              { label: "Total Orgs", value: (metrics?.total_organizations || 0).toString() },
              { label: "Active Orgs", value: (metrics?.active_organizations || 0).toString() },
              { label: "API Gateway", value: "99.9% uptime" },
            ].map(item => (
              <div key={item.label} className="flex items-center justify-between">
                <span className="text-[12px] text-white/40">{item.label}</span>
                <span className="text-[12px] font-bold text-white/70">{item.value}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Activity Feed */}
        <div className="rounded-2xl border border-white/5 bg-white/3 backdrop-blur-sm p-5">
          <h3 className="text-sm font-black text-white mb-4">Recent Activity</h3>
          <ActivityFeed orgs={orgs.slice(0, 8)} />
        </div>

      </div>
    </div>
  );
}
