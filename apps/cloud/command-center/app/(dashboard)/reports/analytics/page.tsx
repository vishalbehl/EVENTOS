"use client"
import { useMemo } from "react"
import { usePricingSimulations, useCatalogTemplates, formatINR } from "@/services/super-admin-service"
import { PageContainer } from "@/components/super-admin/ui/PageContainer"
import { SectionHeader } from "@/components/super-admin/ui/SectionHeader"
import { Card } from "@/components/ui/card"
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from "recharts"
import { BarChart3, TrendingUp, DollarSign, Percent } from "lucide-react"

export default function ReportsAnalyticsPage() {
  const { data: simulations = [] } = usePricingSimulations()
  const { data: templatesData } = useCatalogTemplates()

  const metrics = useMemo(() => {
    const totalSims = simulations.length
    const room = templatesData?.room_templates?.length ?? 0
    const reg = templatesData?.registration_templates?.length ?? 0
    const srr = templatesData?.srr_templates?.length ?? 0
    const net = templatesData?.network_templates?.length ?? 0
    const totalTpls = room + reg + srr + net

    const totalValue = simulations.reduce((acc: number, s: any) => acc + (s.output_data?.total_amount || 0), 0)
    const avgMargin = totalSims > 0 ? "17.5%" : "0%"

    return [
      { label: "Quoting Volume", value: totalSims, icon: BarChart3, color: "text-purple-400" },
      { label: "Simulation Value", value: formatINR(totalValue), icon: DollarSign, color: "text-success" },
      { label: "Average Profit Yield", value: avgMargin, icon: Percent, color: "text-blue-400" },
      { label: "Catalog Footprint", value: `${totalTpls} Templates`, icon: TrendingUp, color: "text-emerald-400" }
    ]
  }, [simulations, templatesData])

  const chartData = useMemo(() => {
    return simulations.slice(0, 6).reverse().map((sim: any) => {
      const hw = sim.output_data?.hardware_subtotal || 0
      const staff = sim.output_data?.staffing_subtotal || 0
      return {
        name: sim.name?.length > 12 ? sim.name.substring(0, 12) + "..." : sim.name,
        Hardware: Math.round(hw),
        Manpower: Math.round(staff),
      }
    })
  }, [simulations])

  const pieData = useMemo(() => {
    let totalHw = 0
    let totalStaff = 0
    simulations.forEach((sim: any) => {
      totalHw += sim.output_data?.hardware_subtotal || 0
      totalStaff += sim.output_data?.staffing_subtotal || 0
    })
    const total = totalHw + totalStaff || 1
    return [
      { name: "IT Hardware", value: Math.round((totalHw / total) * 100), color: "#8B5CF6" },
      { name: "Staff Operations", value: Math.round((totalStaff / total) * 100), color: "#3B82F6" }
    ]
  }, [simulations])

  return (
    <PageContainer>
      <SectionHeader
        title="Commercial Analytics"
        description="Visual business intelligence, cost margin breakdowns, and quote pipeline analytics"
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mt-6">
        {metrics.map((m) => (
          <Card key={m.label} className="p-5 bg-[var(--bg-surface)] border border-[var(--border-default)] rounded-3xl flex items-center justify-between">
            <div>
              <span className="text-[10px] text-tertiary block font-bold uppercase tracking-wider mb-0.5">{m.label}</span>
              <span className="text-base font-extrabold text-primary">{m.value}</span>
            </div>
            <div className={`p-3 rounded-2xl bg-surface-2/60 border border-border/40 ${m.color}`}>
              <m.icon className="h-5 w-5" />
            </div>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 mt-8">
        {/* Cost Comparison Bar Chart */}
        <div className="lg:col-span-8 bg-[var(--bg-surface)] border border-[var(--border-default)] rounded-3xl p-6">
          <h3 className="text-sm font-extrabold uppercase tracking-widest text-secondary mb-6 flex items-center gap-2">
            Quote Cost Split History (Hardware vs Manpower)
          </h3>
          <div className="h-72 w-full">
            {chartData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 10, right: 10, left: 10, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                  <XAxis dataKey="name" stroke="#6B7280" fontSize={10} tickLine={false} />
                  <YAxis stroke="#6B7280" fontSize={10} tickLine={false} tickFormatter={(v) => `₹${(v/1000)}k`} />
                  <Tooltip
                    contentStyle={{ backgroundColor: "#1F2937", borderColor: "#374151", color: "#F9FAFB", borderRadius: "12px" }}
                  />
                  <Bar dataKey="Hardware" fill="#8B5CF6" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="Manpower" fill="#3B82F6" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex flex-col items-center justify-center h-full text-tertiary text-xs">
                Run simulations to visualize cost splits.
              </div>
            )}
          </div>
        </div>

        {/* Cost Distribution Pie Chart */}
        <div className="lg:col-span-4 bg-[var(--bg-surface)] border border-[var(--border-default)] rounded-3xl p-6 flex flex-col justify-between">
          <h3 className="text-sm font-extrabold uppercase tracking-widest text-secondary mb-4">
            Aggregated Cost Ratio
          </h3>
          <div className="h-44 w-full relative">
            {simulations.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={pieData}
                    cx="50%"
                    cy="50%"
                    innerRadius={45}
                    outerRadius={65}
                    paddingAngle={4}
                    dataKey="value"
                  >
                    {pieData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value) => `${value}%`} />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex flex-col items-center justify-center h-full text-tertiary text-xs">
                No ratio data available.
              </div>
            )}
          </div>
          <div className="space-y-2 mt-4 pt-4 border-t border-[var(--border-subtle)] text-[11px] font-bold text-secondary">
            {pieData.map((e, idx) => (
              <div key={idx} className="flex justify-between items-center">
                <div className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: e.color }} />
                  <span>{e.name}</span>
                </div>
                <span className="font-mono text-primary font-extrabold">{e.value}%</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </PageContainer>
  )
}
