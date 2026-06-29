"use client"
import { useAdminDashboard, formatINR, calcDelta, useExtendTrial } from "@/services/super-admin-service"
import { KpiCard } from "@/components/super-admin/ui/KpiCard"
import { ChartCard } from "@/components/super-admin/ui/ChartCard"
import { StatusBadge } from "@/components/super-admin/ui/StatusBadge"
import { PageContainer } from "@/components/super-admin/ui/PageContainer"
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts"
import { Building2, Users, TrendingUp, Calendar, TicketCheck, BadgeIndianRupee, ChevronDown, AlertTriangle } from "lucide-react"
import { useState } from "react"
import { useRouter } from "next/navigation"

export default function SuperAdminDashboard() {
  const { data, isLoading, error, refetch } = useAdminDashboard()
  const router = useRouter()
  const [healthExpanded, setHealthExpanded] = useState(false)
  const [extendTrialOrg, setExtendTrialOrg] = useState<string|null>(null)

  if (isLoading) return <DashboardSkeleton />
  if (error) return (
    <PageContainer>
      <div className="flex flex-col items-center gap-3 py-20">
        <AlertTriangle className="h-10 w-10 text-danger" />
        <p className="text-sm text-secondary">Failed to load dashboard</p>
        <button onClick={() => refetch()}
          className="px-4 py-2 text-sm bg-brand-primary text-white rounded-lg">
          Retry
        </button>
      </div>
    </PageContainer>
  )
  if (!data) return null

  const STATUS_MAP = {
    ACTIVE: { count: data.subscriptions_active, label: 'Active', color: 'success' },
    TRIAL: { count: data.subscriptions_trial, label: 'Trial', color: 'info' },
    GRACE_PERIOD: { count: data.subscriptions_grace, label: 'Grace Period', color: 'warning' },
    SUSPENDED: { count: data.subscriptions_suspended, label: 'Suspended', color: 'danger' },
    EXPIRED: { count: data.subscriptions_expired, label: 'Expired', color: 'default' },
    CANCELLED: { count: data.subscriptions_cancelled, label: 'Cancelled', color: 'default' },
  }

  const chartConfig = {
    grid: { stroke: "var(--border-default)", strokeDasharray: "3 3" },
    xAxis: { tick: { fill: "var(--text-tertiary)", fontSize: 12 } },
    yAxis: { tick: { fill: "var(--text-tertiary)", fontSize: 12 } },
    tooltip: {
      contentStyle: {
        background: "var(--bg-surface)",
        border: "1px solid var(--border-default)",
        borderRadius: "8px",
        color: "var(--text-primary)",
        fontSize: "12px"
      }
    }
  }

  // Build MRR chart data from trend
  const mrrChartData = data.mrr_trend.map((val, i) => ({
    day: `Day ${i+1}`, mrr: val
  }))

  return (
    <PageContainer>
      {/* ── PLATFORM HEALTH BANNER ────────────────────── */}
      <div
        className={`flex items-center gap-3 px-4 py-2.5 rounded-xl border
          cursor-pointer transition-colors
          ${data.platform_status === 'healthy'
            ? 'bg-success-muted border-success/20'
            : data.platform_status === 'degraded'
            ? 'bg-warning-muted border-warning/20'
            : 'bg-danger-muted border-danger/20'}`}
        onClick={() => setHealthExpanded(v => !v)}
      >
        <span className={`w-2 h-2 rounded-full animate-pulse
          ${data.platform_status === 'healthy' ? 'bg-success'
            : data.platform_status === 'degraded' ? 'bg-warning'
            : 'bg-danger'}`} />
        <span className={`text-sm font-medium
          ${data.platform_status === 'healthy' ? 'text-success'
            : data.platform_status === 'degraded' ? 'text-warning'
            : 'text-danger'}`}>
          {data.platform_status === 'healthy'
            ? 'All systems operational'
            : data.platform_status === 'degraded'
            ? `${data.services_degraded} service(s) degraded`
            : 'Platform experiencing issues'}
        </span>
        <span className="ml-auto text-xs text-secondary">
          Last checked: just now
        </span>
        <ChevronDown className={`h-4 w-4 text-secondary transition-transform
          ${healthExpanded ? 'rotate-180' : ''}`} />
      </div>

      {/* ── ROW 1: KPI CARDS (5) ──────────────────────── */}
      <div className="grid grid-cols-5 gap-4">
        <div onClick={() => router.push('/organizations')} className="cursor-pointer">
          <KpiCard
            title="Total Organizations"
            value={data.total_organizations.toLocaleString('en-IN')}
            delta={calcDelta(data.orgs_trend)}
            deltaLabel="vs last 7d"
            trend={data.orgs_trend}
            icon={Building2}
            iconColor="brand"
          />
        </div>
        <KpiCard
          title="Active Users (30d)"
          value={data.active_users_30d.toLocaleString('en-IN')}
          delta={calcDelta(data.users_trend)}
          deltaLabel="vs last 7d"
          trend={data.users_trend}
          icon={Users}
          iconColor="info"
        />
        <div onClick={() => router.push('/commercial/revenue')} className="cursor-pointer">
          <KpiCard
            title="MRR"
            value={formatINR(data.mrr_current)}
            delta={calcDelta(data.mrr_trend)}
            deltaLabel="vs last 7d"
            trend={data.mrr_trend}
            icon={TrendingUp}
            iconColor="success"
          />
        </div>
        <KpiCard
          title="Events This Month"
          value={data.events_this_month.toLocaleString('en-IN')}
          delta={calcDelta(data.events_trend)}
          deltaLabel="vs last 7d"
          trend={data.events_trend}
          icon={Calendar}
          iconColor="brand"
        />
        <div onClick={() => router.push('/support/tickets')} className="cursor-pointer">
          <KpiCard
            title="Open Tickets"
            value={data.open_tickets.toLocaleString('en-IN')}
            delta={0}
            deltaLabel=""
            trend={[]}
            icon={TicketCheck}
            iconColor="warning"
          />
        </div>
      </div>

      {/* ── ROW 2: KPI CARDS (4 more) ─────────────────── */}
      <div className="grid grid-cols-4 gap-4">
        <KpiCard
          title="ARR"
          value={formatINR(data.arr_current)}
          delta={0} deltaLabel="" trend={[]}
          icon={TrendingUp} iconColor="success"
        />
        <KpiCard
          title="Revenue Today"
          value={formatINR(data.revenue_today_inr)}
          delta={calcDelta(data.revenue_trend)} deltaLabel="vs yesterday"
          trend={data.revenue_trend}
          icon={BadgeIndianRupee} iconColor="success"
        />
        <KpiCard
          title="Churn Rate"
          value={`${data.churn_rate.toFixed(1)}%`}
          delta={0} deltaLabel="" trend={[]}
          icon={TrendingUp} iconColor="danger"
        />
        <KpiCard
          title="NPS Score"
          value={data.nps_score.toString()}
          delta={0} deltaLabel="" trend={[]}
          icon={Users} iconColor="info"
        />
      </div>

      {/* ── ROW 3: MRR CHART + TOP ORGS ──────────────── */}
      <div className="grid grid-cols-3 gap-4">
        <ChartCard
          title="MRR Overview (Last 7 Days)"
          className="col-span-2"
          height={220}
        >
          <ResponsiveContainer width="100%" height={180}>
            <AreaChart data={mrrChartData}>
              <defs>
                <linearGradient id="mrrGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#7C3AED" stopOpacity={0.3}/>
                  <stop offset="95%" stopColor="#7C3AED" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <CartesianGrid {...chartConfig.grid} />
              <XAxis dataKey="day" {...chartConfig.xAxis} />
              <YAxis {...chartConfig.yAxis} tickFormatter={v => formatINR(v)} />
              <Tooltip {...chartConfig.tooltip}
                formatter={(v: number) => [formatINR(v), 'MRR']} />
              <Area type="monotone" dataKey="mrr" stroke="#7C3AED"
                strokeWidth={2} fill="url(#mrrGrad)" />
            </AreaChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Top 5 Orgs by MRR" height={220}>
          <div className="space-y-3 mt-2">
            {data.top_orgs_by_mrr.map((org, i) => (
              <div key={org.org_id}
                className="flex items-center gap-3 cursor-pointer hover:bg-surface-hover rounded-lg p-1.5 -mx-1.5"
                onClick={() => router.push(`/organizations/${org.org_id}`)}>
                <span className="text-sm text-tertiary font-mono w-4">
                  {i + 1}
                </span>
                <div className="w-8 h-8 rounded-lg bg-brand-muted flex items-center
                  justify-center text-xs font-bold text-brand-primary shrink-0">
                  {org.org_name.slice(0,2).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-primary truncate">
                    {org.org_name}
                  </p>
                  <p className="text-xs text-tertiary">{org.plan_name}</p>
                </div>
                <span className="text-sm font-mono text-success font-semibold">
                  {formatINR(org.mrr)}
                </span>
              </div>
            ))}
            {data.top_orgs_by_mrr.length === 0 && (
              <p className="text-sm text-tertiary text-center py-6">
                No revenue data yet
              </p>
            )}
          </div>
        </ChartCard>
      </div>

      {/* ── ROW 4: SUBSCRIPTION HEALTH + ACTIVITY + TRIALS ── */}
      <div className="grid grid-cols-3 gap-4">
        {/* Subscription Health Matrix */}
        <div className="bg-surface border border-border rounded-xl p-5">
          <h3 className="text-base font-semibold text-primary mb-4">
            Subscription Health
          </h3>
          <div className="grid grid-cols-2 gap-3">
            {Object.entries(STATUS_MAP).map(([key, { count, label, color }]) => (
              <button
                key={key}
                onClick={() => router.push(
                  `/commercial/subscriptions?status=${key}`
                )}
                className="flex flex-col p-3 rounded-lg bg-surface-2 hover:bg-surface-hover
                  transition-colors text-left"
              >
                <span className={`text-2xl font-bold
                  ${color === 'success' ? 'text-success'
                    : color === 'warning' ? 'text-warning'
                    : color === 'danger' ? 'text-danger'
                    : color === 'info' ? 'text-info'
                    : 'text-tertiary'}`}>
                  {count.toLocaleString('en-IN')}
                </span>
                <span className="text-xs text-secondary mt-1">{label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Recent Activity Feed */}
        <div className="bg-surface border border-border rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-base font-semibold text-primary">
              Recent Activity
            </h3>
            <button
              onClick={() => router.push('/security/audit')}
              className="text-xs text-brand-primary hover:underline">
              View all →
            </button>
          </div>
          <div className="space-y-3 overflow-y-auto max-h-48">
            {data.recent_activity.map((item, i) => (
              <div key={i} className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-full bg-brand-muted
                  flex items-center justify-center text-xs font-bold
                  text-brand-primary shrink-0 mt-0.5">
                  {item.org_name.slice(0,2).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-primary">
                    <span className="font-medium">{item.org_name}</span>
                    {' '}
                    <span className="text-secondary">
                      {item.action.replace(/_/g,' ').toLowerCase()}
                    </span>
                    {item.amount && (
                      <span className="text-success ml-1">
                        {formatINR(item.amount)}
                      </span>
                    )}
                  </p>
                  <p className="text-xs text-tertiary">
                    {new Date(item.occurred_at).toLocaleString('en-IN', {
                      month: 'short', day: 'numeric',
                      hour: '2-digit', minute: '2-digit'
                    })}
                  </p>
                </div>
              </div>
            ))}
            {data.recent_activity.length === 0 && (
              <p className="text-sm text-tertiary text-center py-6">
                No recent activity
              </p>
            )}
          </div>
        </div>

        {/* Trials Expiring Soon */}
        <div className="bg-surface border border-border rounded-xl p-5">
          <h3 className="text-base font-semibold text-primary mb-4">
            Trials Expiring Soon
          </h3>
          <div className="space-y-3">
            {data.trials_expiring.slice(0, 5).map((trial) => (
              <div key={trial.org_id} className="space-y-1">
                <div className="flex items-center gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-primary truncate">
                      {trial.org_name}
                    </p>
                    <p className="text-xs text-tertiary">{trial.plan_name}</p>
                  </div>
                  <span className={`text-xs font-bold px-2 py-1 rounded-full
                    ${trial.days_remaining <= 3
                      ? 'bg-danger-muted text-danger'
                      : trial.days_remaining <= 7
                      ? 'bg-warning-muted text-warning'
                      : 'bg-info-muted text-info'}`}>
                    {trial.days_remaining}d
                  </span>
                </div>
                {extendTrialOrg === trial.org_id ? (
                  <ExtendTrialInline
                    orgId={trial.org_id}
                    onClose={() => setExtendTrialOrg(null)}
                  />
                ) : (
                  <button
                    onClick={() => setExtendTrialOrg(trial.org_id)}
                    className="text-xs text-brand-primary hover:underline">
                    + Extend trial
                  </button>
                )}
              </div>
            ))}
            {data.trials_expiring.length === 0 && (
              <p className="text-sm text-tertiary text-center py-6">
                No trials expiring soon
              </p>
            )}
          </div>
        </div>
      </div>
    </PageContainer>
  )
}

// ── ExtendTrialInline sub-component ─────────────────
function ExtendTrialInline({
  orgId, onClose
}: { orgId: string; onClose: () => void }) {
  const [days, setDays] = useState(7)
  const [reason, setReason] = useState('')
  const { mutate, isPending } = useExtendTrial()

  return (
    <div className="bg-surface-2 rounded-lg p-3 space-y-2 border border-border">
      <div className="flex gap-2">
        <input
          type="number" min={1} max={90} value={days}
          onChange={e => setDays(Number(e.target.value))}
          className="w-20 px-2 py-1 text-sm bg-bg-base border border-border
            rounded-md text-primary"
          placeholder="Days"
        />
        <input
          value={reason}
          onChange={e => setReason(e.target.value)}
          className="flex-1 px-2 py-1 text-sm bg-bg-base border border-border
            rounded-md text-primary"
          placeholder="Reason (required)"
        />
      </div>
      <div className="flex gap-2">
        <button
          onClick={() => mutate({ orgId, days, reason },
            { onSuccess: onClose })}
          disabled={isPending || reason.length < 5}
          className="px-3 py-1 text-xs bg-brand-primary text-white rounded-md
            disabled:opacity-50">
          {isPending ? 'Extending...' : 'Confirm'}
        </button>
        <button onClick={onClose}
          className="px-3 py-1 text-xs text-secondary hover:text-primary">
          Cancel
        </button>
      </div>
    </div>
  )
}

// ── Skeleton ────────────────────────────────────────
function DashboardSkeleton() {
  return (
    <PageContainer>
      <div className="h-10 bg-surface-2 animate-pulse rounded-xl" />
      <div className="grid grid-cols-5 gap-4">
        {Array.from({length: 5}).map((_,i) => (
          <div key={i} className="h-28 bg-surface-2 animate-pulse rounded-xl" />
        ))}
      </div>
      <div className="grid grid-cols-4 gap-4">
        {Array.from({length: 4}).map((_,i) => (
          <div key={i} className="h-28 bg-surface-2 animate-pulse rounded-xl" />
        ))}
      </div>
      <div className="grid grid-cols-3 gap-4">
        <div className="col-span-2 h-60 bg-surface-2 animate-pulse rounded-xl" />
        <div className="h-60 bg-surface-2 animate-pulse rounded-xl" />
      </div>
      <div className="grid grid-cols-3 gap-4">
        {Array.from({length: 3}).map((_,i) => (
          <div key={i} className="h-64 bg-surface-2 animate-pulse rounded-xl" />
        ))}
      </div>
    </PageContainer>
  )
}
