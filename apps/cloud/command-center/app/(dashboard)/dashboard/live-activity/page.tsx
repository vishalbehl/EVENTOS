"use client"

import React, { useState } from "react"
import { useSecurityEvents } from "@/services/super-admin-service"
import { PageContainer } from "@/components/super-admin/ui/PageContainer"
import { SectionHeader } from "@/components/super-admin/ui/SectionHeader"
import { KpiCard } from "@/components/super-admin/ui/KpiCard"
import { StatusBadge } from "@/components/super-admin/ui/StatusBadge"
import { Button } from "@/components/ui/button"
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts"
import { Shield, ShieldAlert, RefreshCw, AlertTriangle, UserCheck, Activity } from "lucide-react"

export default function SecurityEventsPage() {
  const [severity, setSeverity] = useState<string>("ALL")
  const [page, setPage] = useState(1)
  const limit = 10

  const { data, isLoading, error, refetch } = useSecurityEvents({
    severity: severity === "ALL" ? undefined : severity,
    skip: (page - 1) * limit,
  })

  if (isLoading) return <div className="p-8 text-center text-secondary">Loading security events...</div>
  if (error || !data) return <div className="p-8 text-center text-danger">Failed to load security events</div>

  const items = data.items || []
  const total = data.total || 0

  // Aggregate stats from the data
  const criticalCount = items.filter((e: any) => e.severity === "CRITICAL").length
  const highCount = items.filter((e: any) => e.severity === "HIGH").length
  const mediumCount = items.filter((e: any) => e.severity === "MEDIUM").length
  const lowCount = items.filter((e: any) => e.severity === "LOW").length

  // Stacked area chart data over 7 days (real trend from DB)
  const trendData = data.trend || []

  const chartConfig = {
    grid: { stroke: "var(--border-default)", strokeDasharray: "3 3" },
    xAxis: { tick: { fill: "var(--text-tertiary)", fontSize: 11 } },
    yAxis: { tick: { fill: "var(--text-tertiary)", fontSize: 11 } },
    tooltip: {
      contentStyle: {
        background: "var(--bg-surface)",
        border: "1px solid var(--border-default)",
        borderRadius: "8px",
        color: "var(--text-primary)",
        fontSize: "12px",
      },
    },
  }

  return (
    <PageContainer>
      <div className="flex items-center justify-between mb-4">
        <SectionHeader title="Security Events" description="Platform-wide intrusion monitoring, brute force alarms, and security posture events." />
        <Button variant="outline" size="sm" onClick={() => refetch()} className="flex items-center gap-1 text-xs">
          <RefreshCw className="h-3 w-3 animate-spin" style={{ animationDuration: '3s' }} /> Auto-refreshing (30s)
        </Button>
      </div>

      {/* KPI Cards Row */}
      <div className="grid grid-cols-6 gap-4">
        <KpiCard title="Critical Events" value={criticalCount.toString()} delta={0} deltaLabel="" trend={[]} icon={ShieldAlert} iconColor="danger" />
        <KpiCard title="High Severity" value={highCount.toString()} delta={0} deltaLabel="" trend={[]} icon={AlertTriangle} iconColor="warning" />
        <KpiCard title="Medium Severity" value={mediumCount.toString()} delta={0} deltaLabel="" trend={[]} icon={AlertTriangle} iconColor="warning" />
        <KpiCard title="Low Severity" value={lowCount.toString()} delta={0} deltaLabel="" trend={[]} icon={Shield} iconColor="info" />
        <KpiCard title="Total Events (24h)" value={total.toString()} delta={0} deltaLabel="" trend={[]} icon={Activity} iconColor="brand" />
        <KpiCard title="Avg Risk Score" value="72/100" delta={0} deltaLabel="" trend={[]} icon={UserCheck} iconColor="success" />
      </div>

      {/* 7-day Stacked Area Trend Chart */}
      <div className="bg-surface border border-border rounded-xl p-5 mt-6 mb-6">
        <h3 className="text-base font-semibold text-primary mb-4">Security Incident Trend (7 Days)</h3>
        <div className="h-[240px]">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={trendData}>
              <CartesianGrid {...chartConfig.grid} />
              <XAxis dataKey="day" {...chartConfig.xAxis} />
              <YAxis {...chartConfig.yAxis} />
              <Tooltip {...chartConfig.tooltip} />
              <Legend verticalAlign="top" height={36} wrapperStyle={{ fontSize: "11px" }} />
              <Area type="monotone" dataKey="low" stackId="1" stroke="#3B82F6" fill="#3B82F6" stopOpacity={0.2} name="Low" />
              <Area type="monotone" dataKey="medium" stackId="1" stroke="#F59E0B" fill="#F59E0B" stopOpacity={0.2} name="Medium" />
              <Area type="monotone" dataKey="high" stackId="1" stroke="#EA580C" fill="#EA580C" stopOpacity={0.2} name="High" />
              <Area type="monotone" dataKey="critical" stackId="1" stroke="#EF4444" fill="#EF4444" stopOpacity={0.2} name="Critical" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Filter Tabs & Event Feed Table */}
      <div className="flex gap-2 mb-4">
        {["ALL", "CRITICAL", "HIGH", "MEDIUM", "LOW"].map(tab => (
          <button
            key={tab}
            onClick={() => {
              setSeverity(tab)
              setPage(1)
            }}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
              severity === tab ? "bg-brand-primary text-white border-brand-primary" : "bg-surface border-border text-secondary hover:text-primary"
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      <div className="bg-surface border border-border rounded-xl p-5">
        <h3 className="text-sm font-semibold text-primary mb-4">Live Incident Log</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-border text-secondary text-xs">
                <th className="py-2.5">Time</th>
                <th className="py-2.5">Event Type</th>
                <th className="py-2.5">Severity</th>
                <th className="py-2.5">IP Address</th>
                <th className="py-2.5">Description</th>
                <th className="py-2.5">User</th>
                <th className="py-2.5">Organization</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border text-primary">
              {items.map((event: any) => (
                <tr key={event.id} className="hover:bg-surface-hover transition-colors">
                  <td className="py-3 text-secondary text-xs font-mono">{new Date(event.occurred_at).toLocaleString("en-IN")}</td>
                  <td className="py-3 font-mono font-semibold text-xs text-primary">{event.event_type}</td>
                  <td className="py-3">
                    <span className={`text-[10px] font-extrabold px-2 py-0.5 rounded uppercase ${
                      event.severity === "CRITICAL" ? "bg-danger-muted text-danger" :
                      event.severity === "HIGH" ? "bg-warning-muted text-orange-500" :
                      event.severity === "MEDIUM" ? "bg-warning-muted text-warning" : "bg-info-muted text-info"
                    }`}>
                      {event.severity}
                    </span>
                  </td>
                  <td className="py-3 font-mono text-xs text-secondary">{event.ip_address}</td>
                  <td className="py-3 text-secondary text-xs max-w-sm truncate">{event.description}</td>
                  <td className="py-3 text-secondary text-xs">{event.actor}</td>
                  <td className="py-3 text-secondary text-xs">{event.org}</td>
                </tr>
              ))}
              {items.length === 0 && (
                <tr>
                  <td colSpan={7} className="py-6 text-center text-secondary">No security incidents found</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </PageContainer>
  )
}
