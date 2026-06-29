"use client"

import React from "react"
import { useAIDashboard } from "@/services/super-admin-service"
import { PageContainer } from "@/components/super-admin/ui/PageContainer"
import { SectionHeader } from "@/components/super-admin/ui/SectionHeader"
import { KpiCard } from "@/components/super-admin/ui/KpiCard"
import { ChartCard } from "@/components/super-admin/ui/ChartCard"
import { Button } from "@/components/ui/button"
import { AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell, ResponsiveContainer, XAxis, YAxis, Tooltip, Legend, CartesianGrid } from "recharts"
import { Cpu, Terminal, DollarSign, Brain, Bot, Plus, RefreshCw } from "lucide-react"
import { useRouter } from "next/navigation"

export default function AIDashboardPage() {
  const { data, isLoading, error, refetch } = useAIDashboard()
  const router = useRouter()

  if (isLoading) return <div className="p-8 text-center text-secondary">Loading AI Control Center...</div>
  if (error || !data) return <div className="p-8 text-center text-danger">Failed to load AI Dashboard</div>

  // Empty state check
  if (data.total_requests === 0) {
    return (
      <PageContainer>
        <SectionHeader title="AI Dashboard" description="Monitor AI usage, performance metrics, and cost optimization rules." />
        <div className="flex flex-col items-center justify-center py-20 bg-surface border border-border rounded-xl mt-6">
          <Bot className="h-16 w-16 text-tertiary mb-4 animate-bounce" />
          <h3 className="text-lg font-bold text-primary mb-2">AI Control Center not yet activated</h3>
          <p className="text-sm text-secondary mb-6 text-center max-w-sm">
            AI features are currently offline. Configure AI providers and models to start routing API requests.
          </p>
          <Button onClick={() => router.push("/ai-control/models")} className="bg-brand-primary text-white">
            Configure AI Models
          </Button>
        </div>
      </PageContainer>
    )
  }

  const COLORS = ["#7C3AED", "#10B981", "#F59E0B", "#EF4444", "#6B7280"]

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
        <SectionHeader title="AI Dashboard" description="Track model request counts, token processing limits, cost trends, and route efficiency." />
        <Button variant="outline" size="sm" onClick={() => refetch()} className="flex items-center gap-1 text-xs">
          <RefreshCw className="h-3 w-3" /> Refresh
        </Button>
      </div>

      {/* KPI Cards Row */}
      <div className="grid grid-cols-5 gap-4">
        <KpiCard title="Total Requests" value={data.total_requests.toLocaleString()} delta={0} deltaLabel="" trend={[]} icon={Terminal} iconColor="brand" />
        <KpiCard title="Tokens Processed" value={data.tokens_used.toLocaleString()} delta={0} deltaLabel="" trend={[]} icon={Cpu} iconColor="info" />
        <KpiCard title="Total Cost" value={`₹${data.total_cost_inr.toFixed(2)}`} delta={0} deltaLabel="" trend={[]} icon={DollarSign} iconColor="success" />
        <KpiCard title="Avg Cost/1K Tokens" value={`₹${data.avg_cost_per_1k_tokens.toFixed(3)}`} delta={0} deltaLabel="" trend={[]} icon={DollarSign} iconColor="success" />
        <KpiCard title="Success Rate" value={`${data.success_rate.toFixed(1)}%`} delta={0} deltaLabel="" trend={[]} icon={Brain} iconColor="brand" />
      </div>

      <div className="grid grid-cols-3 gap-6 mt-6">
        {/* Requests Over Time */}
        <ChartCard title="Requests Trend (7 Days)" className="col-span-2">
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={data.requests_over_time}>
              <CartesianGrid {...chartConfig.grid} />
              <XAxis dataKey="date" {...chartConfig.xAxis} />
              <YAxis {...chartConfig.yAxis} />
              <Tooltip {...chartConfig.tooltip} />
              <Legend verticalAlign="top" height={36} wrapperStyle={{ fontSize: "11px" }} />
              <Area type="monotone" dataKey="successful" stroke="#10B981" fill="#10B981" fillOpacity={0.1} name="Successful" />
              <Area type="monotone" dataKey="failed" stroke="#EF4444" fill="#EF4444" fillOpacity={0.1} name="Failed" />
            </AreaChart>
          </ResponsiveContainer>
        </ChartCard>

        {/* Usage by Model Donut Chart */}
        <ChartCard title="Usage by Model">
          <ResponsiveContainer width="100%" height={200}>
            <PieChart>
              <Pie data={data.usage_by_model} cx="50%" cy="50%" innerRadius={50} outerRadius={70} paddingAngle={4} dataKey="value" nameKey="model">
                {data.usage_by_model.map((_, index) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip {...chartConfig.tooltip} />
              <Legend verticalAlign="bottom" height={36} wrapperStyle={{ fontSize: "10px" }} />
            </PieChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      <div className="grid grid-cols-3 gap-6 mt-6">
        {/* Tokens and Cost Trends */}
        <ChartCard title="Token Usage trend" className="col-span-2">
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={data.tokens_over_time}>
              <CartesianGrid {...chartConfig.grid} />
              <XAxis dataKey="date" {...chartConfig.xAxis} />
              <YAxis {...chartConfig.yAxis} />
              <Tooltip {...chartConfig.tooltip} />
              <Bar dataKey="tokens" fill="#7C3AED" name="Tokens" radius={[4, 4, 0, 0]} maxBarSize={30} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        {/* Top Use Cases list */}
        <div className="bg-surface border border-border rounded-xl p-5">
          <h3 className="text-base font-semibold text-primary mb-4">Top AI Use Cases</h3>
          <div className="space-y-4">
            {data.top_use_cases.map((uc, i) => (
              <div key={uc.use_case} className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold text-primary">{uc.use_case}</p>
                  <p className="text-xs text-secondary">{uc.requests.toLocaleString()} requests</p>
                </div>
                <span className="text-xs font-mono font-bold text-success">₹{uc.cost.toFixed(2)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </PageContainer>
  )
}
