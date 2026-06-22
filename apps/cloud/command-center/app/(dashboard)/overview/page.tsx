"use client";

import { useState, useMemo } from "react";
import {
  useAdminDashboard,
  useRevenueMetrics,
  useAdminOrgs,
  useExtendTrial,
  usePlatformHealth,
} from "@/services/super-admin-service";
import {
  Building2, Users2, Calendar, TrendingUp, Activity, CheckCircle2,
  RefreshCw, Zap, DollarSign, ChevronDown, AlertTriangle, Clock,
  HelpCircle, Star
} from "lucide-react";
import {
  AreaChart, Area, ResponsiveContainer, XAxis, YAxis, Tooltip, CartesianGrid
} from "recharts";
import { formatDistanceToNow } from "date-fns";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";
import { useRouter } from "next/navigation";

// Reusable custom UI components
import { PageContainer } from "@/components/super-admin/ui/PageContainer";
import { SectionHeader } from "@/components/super-admin/ui/SectionHeader";
import { KpiCard } from "@/components/super-admin/ui/KpiCard";
import { ChartCard } from "@/components/super-admin/ui/ChartCard";
import { StatusBadge } from "@/components/super-admin/ui/StatusBadge";

// ── Helpers ───────────────────────────────────────────────────

function formatBytes(bytes: number) {
  if (!bytes) return "0 GB";
  const gb = bytes / 1024 ** 3;
  if (gb < 1) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${gb.toFixed(1)} GB`;
}

// ── Sub-components ───────────────────────────────────────────

function LiveHealthBar() {
  const { data, isLoading } = usePlatformHealth();
  const [expanded, setExpanded] = useState(false);

  const services = data?.services || [];
  const status = data?.overall || "healthy";

  const hasOutage = status === "down";
  const hasDegraded = status === "degraded";

  let statusText = "All systems operational";
  let colorClass = "bg-[var(--success-muted)] border-success/20 text-[var(--success)]";
  let dotColor = "bg-[var(--success)]";

  if (hasOutage) {
    statusText = "Critical Platform Outage Detected";
    colorClass = "bg-[var(--danger-muted)] border-danger/20 text-[var(--danger)]";
    dotColor = "bg-[var(--danger)]";
  } else if (hasDegraded) {
    const degradedCount = services.filter((s: any) => s.status !== "healthy").length;
    statusText = `Ecosystem Services Degraded (${degradedCount} Degradations)`;
    colorClass = "bg-[var(--warning-muted)] border-warning/20 text-[var(--warning)]";
    dotColor = "bg-[var(--warning)]";
  }

  return (
    <div className="w-full space-y-2">
      <div
        onClick={() => setExpanded(!expanded)}
        className={cn(
          "flex items-center gap-3 px-4 py-2.5 rounded-xl border text-sm font-medium cursor-pointer transition-all duration-150 hover:opacity-95",
          colorClass
        )}
      >
        <span className={cn("w-2 h-2 rounded-full animate-pulse", dotColor)}></span>
        <span>{statusText}</span>
        <span className="ml-auto text-xs opacity-75 hidden sm:inline">Telemetry auto-refreshes</span>
        <motion.div animate={{ rotate: expanded ? 180 : 0 }} className="flex-shrink-0">
          <ChevronDown className="w-4 h-4 ml-1" />
        </motion.div>
      </div>

      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            className="overflow-hidden"
          >
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 p-4 rounded-xl border border-border bg-surface shadow-inner mt-1">
              {services.map((srv: any) => (
                <div key={srv.name} className="p-3 rounded-lg bg-surface-2 border border-border/60 flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-[var(--text-primary)] truncate">{srv.name}</p>
                    <p className="text-[10px] text-[var(--text-tertiary)] font-mono">
                      {srv.uptime_pct ? `${srv.uptime_pct}%` : "99.9%"} · {srv.response_ms !== null && srv.response_ms !== undefined ? `${srv.response_ms}ms` : "—"}
                    </p>
                  </div>
                  <StatusBadge status={srv.status === "healthy" ? "healthy" : srv.status === "down" ? "down" : "degraded"} className="px-1.5 py-0.5 text-[9px]" />
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function TopOrganizations({ orgs }: { orgs: any[] }) {
  const sorted = useMemo(() => {
    return [...orgs]
      .sort((a, b) => (b.mrr || 0) - (a.mrr || 0))
      .slice(0, 5)
      .map((o, idx) => ({
        rank: idx + 1,
        id: o.id,
        name: o.name,
        initials: o.name?.[0] || "?",
        bg: "bg-violet-500/10 text-violet-400",
        mrr: o.mrr || 0,
      }));
  }, [orgs]);

  if (sorted.length === 0) {
    return <p className="text-[var(--text-tertiary)] text-xs py-8 text-center">No organizations found</p>;
  }

  return (
    <div className="divide-y divide-border/60 h-full flex flex-col justify-between">
      {sorted.map((o) => (
        <div key={o.rank} className="flex items-center justify-between py-3.5 first:pt-1 last:pb-1 gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <span className="text-xs font-bold text-[var(--text-tertiary)] w-4 text-center">{o.rank}</span>
            <div className={cn("w-8 h-8 rounded-lg font-bold text-xs flex items-center justify-center flex-shrink-0", o.bg)}>
              {o.initials}
            </div>
            <span className="text-xs font-semibold text-[var(--text-primary)] truncate">{o.name}</span>
          </div>
          <span className="text-xs font-bold font-mono text-[var(--success)]">{formatCurrency(o.mrr)}</span>
        </div>
      ))}
    </div>
  );
}

function PlatformActivity({ metrics }: { metrics: any }) {
  const newOrgsCount = metrics.orgs_trend.reduce((a: number, b: number) => a + b, 0);
  const newUsersCount = metrics.users_trend.reduce((a: number, b: number) => a + b, 0);
  const newEventsCount = metrics.events_trend.reduce((a: number, b: number) => a + b, 0);

  const stats = [
    { label: "New Organizations", value: `+${newOrgsCount}`, period: "This Week", icon: Building2 },
    { label: "New Platform Users", value: `+${newUsersCount}`, period: "This Week", icon: Users2 },
    { label: "New Active Events", value: `+${newEventsCount}`, period: "This Week", icon: Calendar },
    { label: "Gross Revenue Today", value: formatCurrency(metrics.revenue_today), period: "Real-time", icon: DollarSign },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 h-full">
      {stats.map((s, idx) => (
        <div key={idx} className="p-3.5 rounded-xl border border-border bg-surface-2 flex flex-col justify-between">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-semibold text-[var(--text-tertiary)] uppercase tracking-wider">{s.label}</span>
            <s.icon className="w-3.5 h-3.5 text-[var(--text-tertiary)]" />
          </div>
          <div>
            <p className="text-base font-bold text-[var(--text-primary)] leading-tight">{s.value}</p>
            <span className="text-[9px] text-[var(--text-tertiary)]">{s.period}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

function SubscriptionHealth({ metrics }: { metrics: any }) {
  const router = useRouter();

  const statuses = [
    { label: "Active", count: metrics.subscriptions_active, delta: "Active", color: "success", query: "ACTIVE" },
    { label: "Trial", count: metrics.subscriptions_trial, delta: "Trial", color: "info", query: "TRIAL" },
    { label: "Grace", count: metrics.subscriptions_grace, delta: "Grace", color: "warning", query: "GRACE_PERIOD" },
    { label: "Suspended", count: metrics.subscriptions_suspended, delta: "Suspended", color: "danger", query: "SUSPENDED" },
    { label: "Cancelled", count: metrics.subscriptions_cancelled, delta: "Cancelled", color: "tertiary", query: "CANCELLED" },
    { label: "Expired", count: metrics.subscriptions_expired, delta: "Expired", color: "tertiary", query: "EXPIRED" },
  ];

  return (
    <div className="grid grid-cols-2 gap-2 h-full">
      {statuses.map((item) => (
        <div
          key={item.label}
          onClick={() => router.push(`/commercial/subscriptions?status=${item.query}`)}
          className="rounded-xl border border-border/80 bg-surface-2/60 p-3 flex flex-col justify-between cursor-pointer hover:bg-surface-hover/30 hover:border-border transition-all duration-150"
        >
          <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-secondary)]">{item.label}</span>
          <div className="flex items-baseline justify-between mt-2.5">
            <span className="text-xl font-bold tracking-tight text-[var(--text-primary)]">{item.count}</span>
            <span className="text-[9px] font-bold text-[var(--text-tertiary)]">
              {item.delta}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}

function ActivityFeedItem({ orgName, orgId, action, amount, occurredAt }: { orgName: string; orgId: string; action: string; amount: number | null; occurredAt: string }) {
  const router = useRouter();
  return (
    <div className="flex items-center justify-between py-2 text-xs border-b border-border/40 last:border-b-0">
      <div className="min-w-0">
        <p className="font-semibold text-[var(--text-primary)] truncate">
          <span className="hover:underline cursor-pointer" onClick={() => router.push(`/organizations/${orgId}`)}>
            {orgName}
          </span>
        </p>
        <p className="text-[10px] text-[var(--text-tertiary)] uppercase font-mono tracking-wider mt-0.5">{action.replace(/_/g, " ")}</p>
      </div>
      <div className="text-right flex-shrink-0 ml-3">
        {amount !== null && amount !== undefined && (
          <p className="font-bold font-mono text-[var(--success)]">${amount.toFixed(2)}</p>
        )}
        <p className="text-[9px] text-[var(--text-tertiary)] font-mono">
          {formatDistanceToNow(new Date(occurredAt), { addSuffix: true })}
        </p>
      </div>
    </div>
  );
}

function RecentBillingActivity({ activity }: { activity: any[] }) {
  return (
    <div className="space-y-1 h-full overflow-y-auto pr-0.5 custom-scrollbar">
      {activity.length === 0 ? (
        <p className="text-[var(--text-tertiary)] text-xs py-8 text-center">No recent billing activity</p>
      ) : (
        activity.map((item) => (
          <ActivityFeedItem
            key={item.occurred_at}
            orgName={item.org_name}
            orgId={item.org_id}
            action={item.action}
            amount={item.amount}
            occurredAt={item.occurred_at}
          />
        ))
      )}
    </div>
  );
}

function TrialsExpiringSoon({ trials }: { trials: any[] }) {
  const { mutateAsync: extendTrial } = useExtendTrial();
  const [extendingId, setExtendingId] = useState<string | null>(null);
  const [days, setDays] = useState(14);
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleExtend = async (orgId: string) => {
    if (days <= 0 || !reason.trim()) {
      toast.error("Please enter a valid extension period and justification");
      return;
    }
    setSubmitting(true);
    try {
      await extendTrial({ orgId, days, reason });
      toast.success("Trial extended successfully");
      setExtendingId(null);
      setReason("");
    } catch {
      toast.error("Failed to extend trial period");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-3 h-full overflow-y-auto pr-0.5 custom-scrollbar">
      {trials.length === 0 ? (
        <p className="text-[var(--text-tertiary)] text-xs py-8 text-center">No trials expiring within 14 days</p>
      ) : (
        trials.map((t) => {
          const isCurrentExtending = extendingId === t.org_id;

          return (
            <div
              key={t.org_id}
              className="rounded-xl border border-border/80 bg-surface-2 p-3 space-y-3 transition-all duration-150"
            >
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-[var(--text-primary)] truncate">{t.org_name}</p>
                  <p className="text-[10px] text-[var(--text-tertiary)] truncate mt-0.5">{t.plan_name}</p>
                </div>
                <div className="text-right flex-shrink-0">
                  <span
                    className={cn(
                      "inline-flex items-center gap-1 text-[9px] font-bold px-2 py-0.5 rounded-full border",
                      t.days_remaining <= 3
                        ? "bg-[var(--danger-muted)] text-[var(--danger)] border-danger/10"
                        : t.days_remaining <= 7
                        ? "bg-[var(--warning-muted)] text-[var(--warning)] border-warning/10"
                        : "bg-[var(--info-muted)] text-[var(--info)] border-info/10"
                    )}
                  >
                    <Clock className="w-2.5 h-2.5" />
                    {t.days_remaining}d left
                  </span>
                </div>
              </div>

              {/* Inline input extension */}
              {isCurrentExtending ? (
                <div className="space-y-2.5 pt-1 border-t border-border/40 animate-in fade-in duration-200">
                  <div className="flex items-center gap-2">
                    <label className="text-[10px] font-bold text-[var(--text-tertiary)] uppercase tracking-wider">Days</label>
                    <input
                      type="number"
                      value={days}
                      onChange={(e) => setDays(Number(e.target.value))}
                      className="w-16 rounded bg-surface border border-border px-2 py-1 text-xs text-[var(--text-primary)] text-center outline-none"
                    />
                  </div>
                  <textarea
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder="Extension reason..."
                    className="w-full rounded bg-surface border border-border px-2 py-1 text-xs text-[var(--text-primary)] focus:outline-none resize-none"
                    rows={2}
                  />
                  <div className="flex gap-2 justify-end">
                    <button
                      onClick={() => setExtendingId(null)}
                      className="px-2.5 py-1 rounded border border-border text-[10px] font-bold text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={() => handleExtend(t.org_id)}
                      disabled={submitting}
                      className="px-3 py-1 rounded bg-[var(--brand-primary)] hover:bg-[var(--brand-primary-hover)] text-[10px] font-black uppercase text-white disabled:opacity-40"
                    >
                      {submitting ? "Applying…" : "Confirm"}
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => {
                    setDays(14);
                    setExtendingId(t.org_id);
                  }}
                  className="w-full py-1.5 rounded border border-[var(--brand-primary)]/10 bg-[var(--brand-primary-muted)] hover:bg-[var(--brand-primary)]/20 text-[10px] font-semibold text-[var(--brand-primary)] transition-all text-center"
                >
                  Extend Trial
                </button>
              )}
            </div>
          );
        })
      )}
    </div>
  );
}

// ── Main Page Component ───────────────────────────────────────

export default function SuperAdminDashboard() {
  const { data: metrics, isLoading: metricsLoading, error: metricsError, refetch } = useAdminDashboard();
  const { data: revenue = [] } = useRevenueMetrics(12);
  const { data: orgsData = [] } = useAdminOrgs({ limit: 100 });

  const revenueChartData = useMemo(() => {
    return revenue.map((r) => ({
      name: r.period,
      mrr: r.mrr,
      arr: r.mrr * 12,
    }));
  }, [revenue]);

  if (metricsLoading) {
    return (
      <PageContainer>
        <div className="flex flex-col items-center justify-center min-h-[400px] space-y-4">
          <RefreshCw className="w-8 h-8 animate-spin text-violet-500" />
          <p className="text-xs text-[var(--text-tertiary)] font-bold uppercase tracking-wider">Synchronizing Control Plane...</p>
        </div>
      </PageContainer>
    );
  }

  if (metricsError || !metrics) {
    return (
      <PageContainer>
        <div className="flex flex-col items-center justify-center min-h-[400px] space-y-4">
          <AlertTriangle className="w-8 h-8 text-red-500" />
          <p className="text-xs text-red-400 font-bold uppercase tracking-wider">Telemetry Synchronization Failed</p>
          <button
            onClick={() => refetch()}
            className="px-4 py-2 rounded-xl bg-violet-600 hover:bg-violet-700 text-xs text-white font-bold uppercase"
          >
            Retry Telemetry Check
          </button>
        </div>
      </PageContainer>
    );
  }

  return (
    <PageContainer>
      <SectionHeader
        title="Ecosystem Operations"
        description="Command Center Console · EventX Platform Engine"
        breadcrumb={["Console", "Operations"]}
        actions={
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-bold text-[var(--text-tertiary)] uppercase tracking-wider hidden sm:inline">
              Data auto-refreshes in background
            </span>
          </div>
        }
      />

      {/* Row 0 — Platform Health Banner */}
      <LiveHealthBar />

      {/* Row 1 — 5 KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <KpiCard
          title="Total Organizations"
          value={metrics.total_organizations?.toLocaleString() ?? "0"}
          delta={calculateDelta(metrics.orgs_trend)}
          deltaLabel="vs last week"
          trend={metrics.orgs_trend}
          icon={Building2}
          iconColor="brand"
        />
        <KpiCard
          title="Active Users (30d)"
          value={metrics.active_users_30d?.toLocaleString() ?? "0"}
          delta={calculateDelta(metrics.users_trend)}
          deltaLabel="vs last week"
          trend={metrics.users_trend}
          icon={Users2}
          iconColor="info"
        />
        <KpiCard
          title="Platform MRR"
          value={formatCurrency(metrics.mrr_current)}
          delta={calculateDelta(metrics.mrr_trend)}
          deltaLabel="vs last week"
          trend={metrics.mrr_trend}
          icon={DollarSign}
          iconColor="success"
        />
        <KpiCard
          title="Platform ARR"
          value={formatCurrency(metrics.arr_current)}
          delta={calculateDelta(metrics.mrr_trend)}
          deltaLabel="vs last week"
          trend={metrics.mrr_trend.map((m) => m * 12)}
          icon={TrendingUp}
          iconColor="brand"
        />
        <KpiCard
          title="Churn Rate"
          value={`${metrics.churn_rate}%`}
          delta={0}
          deltaLabel="This Month"
          trend={[metrics.churn_rate, metrics.churn_rate]}
          icon={Activity}
          iconColor="danger"
        />
      </div>

      {/* Row 2 — 4 KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          title="Events (This Month)"
          value={metrics.events_this_month?.toLocaleString() ?? "0"}
          delta={calculateDelta(metrics.events_trend)}
          deltaLabel="vs last week"
          trend={metrics.events_trend}
          icon={Calendar}
          iconColor="info"
        />
        <KpiCard
          title="Open Tickets"
          value={metrics.open_tickets?.toLocaleString() ?? "0"}
          delta={0}
          deltaLabel="Active Support Queue"
          trend={[metrics.open_tickets, metrics.open_tickets]}
          icon={HelpCircle}
          iconColor="warning"
        />
        <KpiCard
          title="NPS Score"
          value={metrics.nps_score?.toLocaleString() ?? "0"}
          delta={0}
          deltaLabel="Customer Satisfaction"
          trend={[metrics.nps_score, metrics.nps_score]}
          icon={Star}
          iconColor="success"
        />
        <KpiCard
          title="Revenue Today"
          value={formatCurrency(metrics.revenue_today)}
          delta={0}
          deltaLabel="Completed Invoices Today"
          trend={[metrics.revenue_today, metrics.revenue_today]}
          icon={Zap}
          iconColor="brand"
        />
      </div>

      {/* Row 3 — Two Chart Cards */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <ChartCard
            title="MRR Overview - Last 12 Months"
            description="Comparison of platform Monthly Recurring Revenue (MRR) and Annualized Run Rate (ARR)"
            actions={
              <div className="flex items-center gap-4 text-xs font-semibold text-[var(--text-secondary)]">
                <div className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded bg-[var(--brand-primary)]"></span>
                  <span>MRR</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded bg-[var(--brand-secondary)]"></span>
                  <span>ARR</span>
                </div>
              </div>
            }
          >
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={revenueChartData} margin={{ top: 5, right: 5, left: -10, bottom: 5 }}>
                <defs>
                  <linearGradient id="mrrG" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#7C3AED" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#7C3AED" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="arrG" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#6366F1" stopOpacity={0.15} />
                    <stop offset="95%" stopColor="#6366F1" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="var(--border-default)" strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="name" tick={{ fill: "var(--text-tertiary)", fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis
                  yAxisId="left"
                  tick={{ fill: "var(--text-tertiary)", fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(v) => `$${(v / 1000).toFixed(0)}K`}
                />
                <YAxis
                  yAxisId="right"
                  orientation="right"
                  tick={{ fill: "var(--text-tertiary)", fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(v) => `$${(v / 1000000).toFixed(1)}M`}
                />
                <Tooltip
                  contentStyle={{
                    background: "var(--bg-surface)",
                    border: "1px solid var(--border-default)",
                    borderRadius: "8px",
                    color: "var(--text-primary)",
                    fontSize: 12,
                  }}
                  formatter={(v: any) => formatCurrency(v)}
                />
                <Area yAxisId="left" type="monotone" dataKey="mrr" stroke="#7C3AED" fill="url(#mrrG)" strokeWidth={2} dot={false} />
                <Area yAxisId="right" type="monotone" dataKey="arr" stroke="#6366F1" fill="url(#arrG)" strokeWidth={1.5} dot={false} strokeDasharray="4 4" />
              </AreaChart>
            </ResponsiveContainer>
          </ChartCard>
        </div>

        <div>
          <ChartCard
            title="Top 5 Organizations by MRR"
            description="Tenants generating highest recurring subscription revenue"
            height={280}
          >
            <TopOrganizations orgs={orgsData} />
          </ChartCard>
        </div>
      </div>

      {/* Row 4 — Four Panels */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {/* Panel 1: Platform Activity */}
        <ChartCard
          title="Platform Activity"
          description="Ecosystem metrics and growth counts this week"
          height={260}
        >
          <PlatformActivity metrics={metrics} />
        </ChartCard>

        {/* Panel 2: Recent Billing Activity */}
        <ChartCard
          title="Recent Billing Activity"
          description="Latest subscription ledger event logs"
          height={260}
        >
          <RecentBillingActivity activity={metrics.recent_activity} />
        </ChartCard>

        {/* Panel 3: Subscription Health */}
        <ChartCard
          title="Subscription Health"
          description="Tenant breakdown by plan lifecycle status"
          height={260}
        >
          <SubscriptionHealth metrics={metrics} />
        </ChartCard>

        {/* Panel 4: Trials Expiring Soon */}
        <ChartCard
          title="Trials Expiring Soon"
          description="Action center for expiring trial tenants"
          height={260}
        >
          <TrialsExpiringSoon trials={metrics.trials_expiring} />
        </ChartCard>
      </div>
    </PageContainer>
  );
}

// ── Helpers ───────────────────────────────────────────────────

function calculateDelta(trend: number[]): number {
  if (!trend || trend.length < 2) return 0;
  const last = trend[trend.length - 1];
  const prev = trend[trend.length - 2];
  if (prev === 0) return 0;
  return Math.round(((last - prev) / prev) * 100 * 10) / 10;
}

function formatCurrency(value: number): string {
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(2)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(1)}K`;
  return `$${value.toFixed(0)}`;
}
