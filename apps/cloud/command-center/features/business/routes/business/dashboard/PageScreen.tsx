"use client"
import { useMemo } from "react"
import { useCatalogTemplates, usePricingSimulations, usePricingRules, formatINR } from "@/services/super-admin-service"
import { PageContainer } from "@/components/super-admin/ui/PageContainer"
import { SectionHeader } from "@/components/super-admin/ui/SectionHeader"
import { MetricRow } from "@/components/super-admin/ui/MetricRow"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { LayoutDashboard, Library, Calculator, FileText, Percent, ArrowRight, ShieldCheck, HelpCircle } from "lucide-react"
import Link from "next/link"
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts"

export default function CommercialDashboardPage() {
  const { data: templatesData } = useCatalogTemplates()
  const { data: simulations = [] } = usePricingSimulations()
  const { data: rules = [] } = usePricingRules()

  const counts = useMemo(() => {
    const room = templatesData?.room_templates?.length ?? 0
    const reg = templatesData?.registration_templates?.length ?? 0
    const srr = templatesData?.srr_templates?.length ?? 0
    return {
      totalTemplates: room + reg + srr,
      activeRules: rules.length,
      simulationsCount: simulations.length,
      revenueForecast: simulations.reduce((acc: number, s: any) => acc + (s.output_data?.total_amount || 0), 0)
    }
  }, [templatesData, rules, simulations])

  const kpis = [
    { label: "Total Templates", value: counts.totalTemplates },
    { label: "Active Simulations", value: counts.simulationsCount },
    { label: "Pricing Margin Rules", value: counts.activeRules },
    { label: "Total Projected Revenue", value: formatINR(counts.revenueForecast) }
  ]

  const chartData = useMemo(() => {
    return simulations.slice(0, 7).reverse().map((sim: any) => ({
      name: sim.name?.length > 15 ? sim.name.substring(0, 15) + "..." : sim.name,
      amount: Math.round(sim.output_data?.total_amount || 0),
    }))
  }, [simulations])

  return (
    <PageContainer>
      <SectionHeader
        title="Commercial Overview Dashboard"
        description="Event SaaS, IT infrastructure deployments, and commercial simulation cockpit"
      />

      <MetricRow metrics={kpis} />

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 mt-6">
        {/* Left Side: Recent Simulations Graph */}
        <div className="lg:col-span-8 bg-[var(--bg-surface)] border border-[var(--border-default)] rounded-3xl p-6">
          <div className="flex justify-between items-center mb-6">
            <h3 className="text-sm font-extrabold uppercase tracking-widest text-secondary flex items-center gap-2">
              <Calculator className="h-4 w-4 text-brand-primary" /> Quote Calculation Sandbox History
            </h3>
            <Link href="/business/sales/quotes">
              <Button size="sm" className="bg-brand-primary text-white text-xs font-bold gap-1">
                Open Quote Workspace <ArrowRight className="h-3.5 w-3.5" />
              </Button>
            </Link>
          </div>

          <div className="h-72 w-full">
            {chartData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 10, right: 10, left: 10, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                  <XAxis dataKey="name" stroke="#6B7280" fontSize={10} tickLine={false} />
                  <YAxis stroke="#6B7280" fontSize={10} tickLine={false} tickFormatter={(v) => `₹${(v/1000)}k`} />
                  <Tooltip
                    formatter={(value: any) => [`₹${value.toLocaleString()}`, "Grand Total"]}
                    contentStyle={{ backgroundColor: "#1F2937", borderColor: "#374151", color: "#F9FAFB", borderRadius: "12px" }}
                  />
                  <Bar dataKey="amount" fill="#8B5CF6" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex flex-col items-center justify-center h-full text-tertiary text-xs">
                No recent quotes found. Create one in the quote workspace to see charts.
              </div>
            )}
          </div>
        </div>

        {/* Right Side: Quick Action Links */}
        <div className="lg:col-span-4 space-y-6">
          <Card className="bg-[var(--bg-surface)] border border-[var(--border-default)] rounded-3xl p-6">
            <h3 className="text-xs font-extrabold uppercase tracking-widest text-secondary mb-4 flex items-center gap-2">
              <Library className="h-4 w-4 text-brand-primary" /> Commercial Modules
            </h3>
            <div className="space-y-3">
              {[
                { label: "Templates Library", desc: "Manage rooms, check-in, and SRR templates", href: "/business/pricing/templates", icon: Library },
                { label: "Saved Quotes", desc: "View and load past quote summaries", href: "/business/sales/saved-quotes", icon: FileText },
                { label: "Proposal Generator", desc: "Export simulations into B2B proposals", href: "/business/sales/proposal-generator", icon: FileText },
                { label: "Margin Rules Configuration", desc: "Set markups, contingency, overhead %", href: "/business/pricing/margin-rules", icon: Percent }
              ].map((mod) => (
                <Link href={mod.href} key={mod.label} className="flex gap-3 items-center p-3 rounded-2xl bg-surface-2/40 border border-border/40 hover:border-brand-primary/45 hover:bg-surface-hover/10 transition-colors">
                  <div className="p-2.5 rounded-xl bg-brand-primary/10 border border-brand-primary/20 text-brand-primary">
                    <mod.icon className="h-4 w-4" />
                  </div>
                  <div>
                    <span className="text-xs font-bold text-primary block">{mod.label}</span>
                    <span className="text-[10px] text-tertiary block mt-0.5">{mod.desc}</span>
                  </div>
                </Link>
              ))}
            </div>
          </Card>
        </div>
      </div>
    </PageContainer>
  )
}
