"use client"
import React, { useState } from "react"
import { useRevenueAnalytics, formatINR } from "@/services/super-admin-service"
import { PageContainer } from "@/components/super-admin/ui/PageContainer"
import { SectionHeader } from "@/components/super-admin/ui/SectionHeader"
import { ChartCard } from "@/components/super-admin/ui/ChartCard"
import { KpiCard } from "@/components/super-admin/ui/KpiCard"
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from "recharts"
import { AlertTriangle, TrendingUp, TrendingDown, RefreshCw } from "lucide-react"

export default function RevenueAnalyticsPage() {
  const [period, setPeriod] = useState<string>("12m")
  const { data, isLoading, error, refetch } = useRevenueAnalytics(period)

  if (isLoading) return <RevenueSkeleton />
  if (error) return (
    <PageContainer>
      <div className="flex flex-col items-center gap-3 py-20">
        <AlertTriangle className="h-10 w-10 text-danger" />
        <p className="text-sm text-secondary">Failed to load revenue analytics</p>
        <button onClick={() => refetch()}
          className="px-4 py-2 text-sm bg-brand-primary text-white rounded-lg">
          Retry
        </button>
      </div>
    </PageContainer>
  )
  if (!data) return null

  // Metric Cards Data
  const cards = [
    { label: "MRR", value: formatINR(data.summary.mrr) },
    { label: "ARR", value: formatINR(data.summary.arr) },
    { label: "Net New MRR", value: formatINR(data.summary.net_new_mrr || 0) },
    { label: "Churned MRR", value: formatINR(data.summary.churned_mrr || 0), isNegative: true },
    { label: "Expansion MRR", value: formatINR(data.summary.expansion_mrr || 0) },
    { label: "ARPU", value: formatINR(data.arpu_inr || 0) },
  ]

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

  const PLAN_COLORS = ["#7C3AED", "#4F46E5", "#64748B", "#EC4899", "#3B82F6"]

  // MRR summary calculations for Right table
  const monthlyData = data.mrr_by_month || []
  const thisMonthMRR = monthlyData.length > 0 ? monthlyData[monthlyData.length - 1].mrr : 0
  const prevMonthMRR = monthlyData.length > 1 ? monthlyData[monthlyData.length - 2].mrr : 0
  const changeMRR = thisMonthMRR - prevMonthMRR
  const changePct = prevMonthMRR > 0 ? (changeMRR / prevMonthMRR) * 100 : 0

  const thisMonthARR = monthlyData.length > 0 ? monthlyData[monthlyData.length - 1].arr : 0
  const prevMonthARR = monthlyData.length > 1 ? monthlyData[monthlyData.length - 2].arr : 0
  const changeARR = thisMonthARR - prevMonthARR
  const changeARRPct = prevMonthARR > 0 ? (changeARR / prevMonthARR) * 100 : 0

  return (
    <PageContainer>
      <div className="flex justify-between items-center mb-4">
        <SectionHeader
          title="Revenue Analytics"
          description="In-depth analysis of MRR growth, plan distribution, and commercial metrics."
        />
        {/* Period Selector */}
        <div className="flex gap-1 p-1 bg-[var(--bg-surface-2)] border border-[var(--border-subtle)] rounded-xl">
          {["3m", "6m", "12m"].map(p => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`px-3 py-1 text-xs font-bold rounded-lg transition-colors
                ${period === p ? "bg-brand-primary text-white" : "text-secondary hover:text-primary"}`}
            >
              {p.toUpperCase()}
            </button>
          ))}
        </div>
      </div>

      {/* Row 1 — 6 metric cards */}
      <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
        {cards.map((card, i) => (
          <div key={i} className="bg-[var(--bg-surface)] border border-[var(--border-default)] rounded-2xl p-5 shadow-sm">
            <span className="text-[10px] font-bold uppercase tracking-wider text-secondary">
              {card.label}
            </span>
            <p className={`text-xl font-black font-mono tracking-tight mt-1.5
              ${card.isNegative ? "text-danger" : "text-primary"}`}>
              {card.value}
            </p>
          </div>
        ))}
      </div>

      {/* Row 2 — Full width AreaChart */}
      <ChartCard title="MRR & ARR Growth Trend" height={320}>
        <ResponsiveContainer width="100%" height={260}>
          <AreaChart data={data.mrr_by_month}>
            <defs>
              <linearGradient id="mrrCol" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#7C3AED" stopOpacity={0.3}/>
                <stop offset="95%" stopColor="#7C3AED" stopOpacity={0}/>
              </linearGradient>
              <linearGradient id="arrCol" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#4F46E5" stopOpacity={0.15}/>
                <stop offset="95%" stopColor="#4F46E5" stopOpacity={0}/>
              </linearGradient>
            </defs>
            <CartesianGrid {...chartConfig.grid} />
            <XAxis dataKey="period" {...chartConfig.xAxis} />
            <YAxis {...chartConfig.yAxis} tickFormatter={v => formatINR(v)} />
            <Tooltip {...chartConfig.tooltip} formatter={(v: number) => formatINR(v)} />
            <Area type="monotone" dataKey="mrr" stroke="#7C3AED" strokeWidth={2} fill="url(#mrrCol)" name="MRR" />
            <Area type="monotone" dataKey="arr" stroke="#4F46E5" strokeDasharray="5 5" strokeWidth={2} fill="url(#arrCol)" name="ARR" />
          </AreaChart>
        </ResponsiveContainer>
      </ChartCard>

      {/* Row 3 — Two charts side by side */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Left: Revenue by Plan (PieChart donut) */}
        <div className="bg-[var(--bg-surface)] border border-[var(--border-default)] rounded-2xl p-5 shadow-sm">
          <h3 className="text-sm font-bold uppercase tracking-wider text-secondary mb-4">
            MRR Distribution by Plan
          </h3>
          <div className="flex items-center justify-between gap-6">
            <div className="h-44 w-44 shrink-0 relative">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={data.mrr_by_plan}
                    dataKey="mrr"
                    nameKey="plan"
                    innerRadius={48}
                    outerRadius={68}
                    paddingAngle={3}
                  >
                    {data.mrr_by_plan.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={PLAN_COLORS[index % PLAN_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(v: number) => formatINR(v)} />
                </PieChart>
              </ResponsiveContainer>
              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                <span className="text-[10px] text-tertiary font-medium uppercase">MRR</span>
                <span className="text-sm font-bold text-primary font-mono mt-0.5">
                  {formatINR(data.summary.mrr)}
                </span>
              </div>
            </div>

            <div className="flex-1 space-y-3">
              {data.mrr_by_plan.map((entry, index) => (
                <div key={entry.plan} className="flex items-center justify-between text-xs border-b border-[var(--border-subtle)] pb-1.5 last:border-0 last:pb-0">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: PLAN_COLORS[index % PLAN_COLORS.length] }} />
                    <span className="font-medium text-secondary">{entry.plan}</span>
                  </div>
                  <div className="text-right">
                    <p className="font-semibold text-primary font-mono">{formatINR(entry.mrr)}</p>
                    <p className="text-[10px] text-tertiary">
                      {entry.orgs} {entry.orgs === 1 ? "org" : "orgs"} · {entry.color_hex ? entry.color_hex : ""}
                    </p>
                  </div>
                </div>
              ))}
              {data.mrr_by_plan.length === 0 && (
                <p className="text-xs text-tertiary py-8 text-center">No plan breakdown</p>
              )}
            </div>
          </div>
        </div>

        {/* Right: MRR summary table (This Period / Previous Period / Change) */}
        <div className="bg-[var(--bg-surface)] border border-[var(--border-default)] rounded-2xl p-5 shadow-sm space-y-4">
          <h3 className="text-sm font-bold uppercase tracking-wider text-secondary">
            Period Summary Comparison
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-[var(--border-default)] text-secondary uppercase font-semibold">
                  <th className="py-2.5">Metric</th>
                  <th className="py-2.5">This Month</th>
                  <th className="py-2.5">Last Month</th>
                  <th className="py-2.5 text-right">Change</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-subtle)] text-sm">
                <tr className="hover:bg-surface-hover/30">
                  <td className="py-3 font-semibold text-primary">Monthly Recurring Revenue (MRR)</td>
                  <td className="py-3 font-mono text-secondary">{formatINR(thisMonthMRR)}</td>
                  <td className="py-3 font-mono text-secondary">{formatINR(prevMonthMRR)}</td>
                  <td className="py-3 font-mono text-right">
                    <span className={`inline-flex items-center gap-0.5 font-bold ${changeMRR >= 0 ? "text-success" : "text-danger"}`}>
                      {changeMRR >= 0 ? <TrendingUp className="w-3.5 h-3.5" /> : <TrendingDown className="w-3.5 h-3.5" />}
                      {changeMRR >= 0 ? "+" : ""}{changePct.toFixed(1)}%
                    </span>
                  </td>
                </tr>
                <tr className="hover:bg-surface-hover/30">
                  <td className="py-3 font-semibold text-primary">Annual Recurring Revenue (ARR)</td>
                  <td className="py-3 font-mono text-secondary">{formatINR(thisMonthARR)}</td>
                  <td className="py-3 font-mono text-secondary">{formatINR(prevMonthARR)}</td>
                  <td className="py-3 font-mono text-right">
                    <span className={`inline-flex items-center gap-0.5 font-bold ${changeARR >= 0 ? "text-success" : "text-danger"}`}>
                      {changeARR >= 0 ? <TrendingUp className="w-3.5 h-3.5" /> : <TrendingDown className="w-3.5 h-3.5" />}
                      {changeARR >= 0 ? "+" : ""}{changeARRPct.toFixed(1)}%
                    </span>
                  </td>
                </tr>
                <tr className="hover:bg-surface-hover/30">
                  <td className="py-3 font-semibold text-primary">Upgrades This Month</td>
                  <td className="py-3 font-mono text-secondary">{data.upgrades_this_month}</td>
                  <td className="py-3 font-mono text-tertiary">—</td>
                  <td className="py-3 text-right font-medium text-secondary">New Expansion</td>
                </tr>
                <tr className="hover:bg-surface-hover/30">
                  <td className="py-3 font-semibold text-primary">Downgrades This Month</td>
                  <td className="py-3 font-mono text-secondary">{data.downgrades_this_month}</td>
                  <td className="py-3 font-mono text-tertiary">—</td>
                  <td className="py-3 text-right font-medium text-secondary">Net Contraction</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </PageContainer>
  )
}

function RevenueSkeleton() {
  return (
    <PageContainer>
      <div className="h-10 bg-surface-2 animate-pulse rounded-xl mb-4" />
      <div className="grid grid-cols-6 gap-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-20 bg-surface-2 animate-pulse rounded-xl" />
        ))}
      </div>
      <div className="h-72 bg-surface-2 animate-pulse rounded-xl mt-4" />
      <div className="grid grid-cols-2 gap-4 mt-4">
        <div className="h-56 bg-surface-2 animate-pulse rounded-xl" />
        <div className="h-56 bg-surface-2 animate-pulse rounded-xl" />
      </div>
    </PageContainer>
  )
}
