"use client"

import { useState } from "react"
import { Area, AreaChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts"
import { Activity, AlertTriangle, RefreshCw, Shield, ShieldAlert } from "lucide-react"

import { Button } from "@/components/ui/button"
import { KpiCard } from "@/components/super-admin/ui/KpiCard"
import { PageContainer } from "@/components/super-admin/ui/PageContainer"
import { SectionHeader } from "@/components/super-admin/ui/SectionHeader"
import { useSecurityEvents } from "@/services/super-admin-service"

const SEVERITIES = ["ALL", "CRITICAL", "HIGH", "MEDIUM", "LOW"] as const

export default function SecurityEventsPage() {
  const [severity, setSeverity] = useState<(typeof SEVERITIES)[number]>("ALL")
  const [page, setPage] = useState(1)
  const limit = 10
  const { data, isLoading, isFetching, error, refetch } = useSecurityEvents({
    severity: severity === "ALL" ? undefined : severity,
    skip: (page - 1) * limit,
    limit,
  })

  if (isLoading) {
    return <div className="p-8 text-center text-secondary" role="status">Loading security events...</div>
  }

  if (error || !data) {
    return (
      <PageContainer>
        <div className="flex flex-col items-center gap-3 py-20" role="alert">
          <AlertTriangle className="h-10 w-10 text-danger" />
          <p className="text-sm text-secondary">Security events could not be loaded.</p>
          <Button variant="outline" onClick={() => refetch()}>Retry</Button>
        </div>
      </PageContainer>
    )
  }

  const { severity_summary: summary, items, trend, total, has_next: hasNext } = data

  return (
    <PageContainer>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <SectionHeader
          title="Security Events"
          description="Persisted platform security signals. Summary cards cover the last 24 hours."
        />
        <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
          <RefreshCw className={`mr-2 h-3.5 w-3.5 ${isFetching ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <KpiCard title="Critical (24h)" value={summary.CRITICAL.toString()} delta={0} deltaLabel="" trend={[]} icon={ShieldAlert} iconColor="danger" />
        <KpiCard title="High (24h)" value={summary.HIGH.toString()} delta={0} deltaLabel="" trend={[]} icon={AlertTriangle} iconColor="warning" />
        <KpiCard title="Medium (24h)" value={summary.MEDIUM.toString()} delta={0} deltaLabel="" trend={[]} icon={AlertTriangle} iconColor="warning" />
        <KpiCard title="Low (24h)" value={summary.LOW.toString()} delta={0} deltaLabel="" trend={[]} icon={Shield} iconColor="info" />
        <KpiCard title="Total (24h)" value={summary.total_24h.toString()} delta={0} deltaLabel="" trend={[]} icon={Activity} iconColor="brand" />
      </div>

      <section className="my-6 rounded-xl border border-border bg-surface p-5" aria-labelledby="security-trend-title">
        <h2 id="security-trend-title" className="mb-4 text-base font-semibold text-primary">Security event trend (7 days)</h2>
        {trend.length > 0 ? (
          <div className="h-[240px]" aria-label="Seven-day security event chart">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={trend}>
                <CartesianGrid stroke="var(--border-default)" strokeDasharray="3 3" />
                <XAxis dataKey="day" tick={{ fill: "var(--text-tertiary)", fontSize: 11 }} />
                <YAxis allowDecimals={false} tick={{ fill: "var(--text-tertiary)", fontSize: 11 }} />
                <Tooltip contentStyle={{ background: "var(--bg-surface)", border: "1px solid var(--border-default)", borderRadius: 8 }} />
                <Legend verticalAlign="top" height={36} wrapperStyle={{ fontSize: 11 }} />
                <Area type="monotone" dataKey="low" stackId="1" stroke="#3B82F6" fill="#3B82F6" fillOpacity={0.2} name="Low" />
                <Area type="monotone" dataKey="medium" stackId="1" stroke="#F59E0B" fill="#F59E0B" fillOpacity={0.2} name="Medium" />
                <Area type="monotone" dataKey="high" stackId="1" stroke="#EA580C" fill="#EA580C" fillOpacity={0.2} name="High" />
                <Area type="monotone" dataKey="critical" stackId="1" stroke="#EF4444" fill="#EF4444" fillOpacity={0.2} name="Critical" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <p className="py-16 text-center text-sm text-secondary">No security events were recorded in the last seven days.</p>
        )}
      </section>

      <div className="mb-4 flex flex-wrap gap-2" aria-label="Filter security events by severity">
        {SEVERITIES.map((tab) => (
          <button
            key={tab}
            type="button"
            aria-pressed={severity === tab}
            onClick={() => {
              setSeverity(tab)
              setPage(1)
            }}
            className={`rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors ${
              severity === tab
                ? "border-brand-primary bg-brand-primary text-white"
                : "border-border bg-surface text-secondary hover:text-primary"
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      <section className="rounded-xl border border-border bg-surface p-5" aria-labelledby="incident-log-title">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 id="incident-log-title" className="text-sm font-semibold text-primary">Security event log</h2>
          <span className="text-xs text-secondary">{total.toLocaleString("en-IN")} matching events</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-border text-xs text-secondary">
                <th scope="col" className="py-2.5 pr-4">Time</th>
                <th scope="col" className="py-2.5 pr-4">Event</th>
                <th scope="col" className="py-2.5 pr-4">Risk</th>
                <th scope="col" className="py-2.5 pr-4">Score</th>
                <th scope="col" className="py-2.5 pr-4">User</th>
                <th scope="col" className="py-2.5 pr-4">IP address</th>
                <th scope="col" className="py-2.5">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border text-primary">
              {items.map((event) => (
                <tr key={event.id} className="hover:bg-surface-hover">
                  <td className="whitespace-nowrap py-3 pr-4 font-mono text-xs text-secondary">{new Date(event.occurred_at).toLocaleString("en-IN")}</td>
                  <td className="py-3 pr-4 font-mono text-xs font-semibold">{event.event_type}</td>
                  <td className="py-3 pr-4">
                    <span className={`rounded px-2 py-0.5 text-[10px] font-extrabold uppercase ${
                      event.risk_level === "CRITICAL" ? "bg-danger-muted text-danger" :
                      event.risk_level === "HIGH" ? "bg-warning-muted text-orange-500" :
                      event.risk_level === "MEDIUM" ? "bg-warning-muted text-warning" : "bg-info-muted text-info"
                    }`}>{event.risk_level}</span>
                  </td>
                  <td className="py-3 pr-4 font-mono text-xs">{event.severity_score}</td>
                  <td className="py-3 pr-4 text-xs text-secondary">{event.user_email ?? "System or unknown"}</td>
                  <td className="py-3 pr-4 font-mono text-xs text-secondary">{event.ip_address ?? "Not recorded"}</td>
                  <td className="max-w-xs py-3 text-xs text-secondary">{event.action_taken ?? "No action recorded"}</td>
                </tr>
              ))}
              {items.length === 0 && (
                <tr><td colSpan={7} className="py-10 text-center text-secondary">No matching security events.</td></tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="mt-4 flex items-center justify-end gap-2">
          <Button variant="outline" size="sm" disabled={page === 1 || isFetching} onClick={() => setPage((value) => Math.max(1, value - 1))}>Previous</Button>
          <span className="min-w-16 text-center text-xs text-secondary">Page {page}</span>
          <Button variant="outline" size="sm" disabled={!hasNext || isFetching} onClick={() => setPage((value) => value + 1)}>Next</Button>
        </div>
      </section>
    </PageContainer>
  )
}
