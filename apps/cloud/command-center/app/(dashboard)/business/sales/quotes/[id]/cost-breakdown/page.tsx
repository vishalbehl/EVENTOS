"use client"

import { useState } from "react"
import { useParams, useRouter } from "next/navigation"
import { useQuoteCostBreakdown } from "@/services/super-admin-service"
import { PageContainer } from "@/components/super-admin/ui/PageContainer"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { 
  ArrowLeft, Edit, Copy, Send, Download, FileText, 
  Eye, EyeOff, LayoutGrid, CheckCircle2, ChevronRight 
} from "lucide-react"
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts"
import { formatLakhRupee } from "@/lib/formatters"
import { toast } from "sonner"

export default function CostBreakdownPage() {
  const router = useRouter()
  const params = useParams()
  const quoteId = params.id as string

  // Fetch cost breakdown from view
  const { data: detail, isLoading } = useQuoteCostBreakdown(quoteId)

  // View state: true = Internal view (shows margins), false = Client view (hides margins)
  const [internalView, setInternalView] = useState(true)

  if (isLoading || !detail) {
    return (
      <div className="flex h-[70vh] items-center justify-center">
        <p className="text-zinc-500 text-xs font-black uppercase tracking-widest animate-pulse">Loading Cost breakdown...</p>
      </div>
    )
  }

  const { quote, request, cost_summary = [], line_items = [] } = detail

  // Format summaries
  const subTotal = cost_summary.reduce((acc: number, cur: any) => acc + Number(cur.cost), 0)
  const marginTotal = cost_summary.reduce((acc: number, cur: any) => acc + Number(cur.margin), 0)
  const logistics = 15000
  const gst = (subTotal + marginTotal + logistics) * 0.18
  const grandTotal = subTotal + marginTotal + logistics + gst
  const marginPct = grandTotal > 0 ? (marginTotal / grandTotal) * 100 : 0

  // Chart data
  const donutData = cost_summary.map((c: any) => ({
    name: c.category,
    value: Number(c.cost) + (internalView ? Number(c.margin) : 0)
  }))

  const COLORS = ["#8B5CF6", "#3B82F6", "#F59E0B", "#EF4444", "#10B981"]

  const handleDuplicate = () => {
    toast.success("Quote duplicated into new draft version successfully.")
  }

  return (
    <PageContainer>
      {/* Header bar */}
      <div className="flex flex-col gap-3 mb-6">
        <div className="flex items-center gap-2 text-xs text-tertiary">
          <span className="hover:text-primary cursor-pointer" onClick={() => router.push("/service-requests")}>Service Requests</span>
          <ChevronRight className="h-3 w-3" />
          <span className="text-primary font-extrabold uppercase tracking-wide">{quote.quote_number}</span>
        </div>

        <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4">
          <div>
            <h1 className="text-xl font-black text-primary flex items-center gap-2">
              <Button size="icon" variant="ghost" className="h-7 w-7 rounded-lg" onClick={() => router.back()}>
                <ArrowLeft className="h-4 w-4" />
              </Button>
              Cost Breakdown Dashboard
            </h1>
            <p className="text-[10px] text-tertiary">{request?.title || "Corporate Event"} • {request?.org_name || "Imperial Organizers"}</p>
          </div>

          <div className="flex items-center gap-2">
            <Button
              onClick={() => router.push(`/quotes/${quoteId}/edit`)}
              variant="outline"
              size="sm"
              className="text-xs h-9 gap-1 text-secondary border-border bg-surface-2"
            >
              <Edit className="h-3.5 w-3.5" /> Edit Quote
            </Button>
            <Button
              onClick={handleDuplicate}
              variant="outline"
              size="sm"
              className="text-xs h-9 gap-1 text-secondary border-border bg-surface-2"
            >
              <Copy className="h-3.5 w-3.5" /> Duplicate
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="text-xs h-9 gap-1 text-secondary border-border bg-surface-2"
            >
              <Download className="h-3.5 w-3.5" /> PDF
            </Button>
            <Button
              className="bg-brand-primary text-white text-xs font-bold h-9 px-4 rounded-xl"
            >
              <Send className="h-3.5 w-3.5" /> Send Quote
            </Button>
          </div>
        </div>
      </div>

      {/* KPI Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-8">
        <Card className="p-4 rounded-2xl bg-[var(--bg-surface)] border border-[var(--border-default)] flex flex-col justify-between h-20">
          <span className="text-[9px] uppercase tracking-wider font-extrabold text-secondary block">Sub Total</span>
          <span className="text-sm font-black font-mono text-primary">{formatLakhRupee(subTotal)}</span>
        </Card>
        <Card className="p-4 rounded-2xl bg-[var(--bg-surface)] border border-[var(--border-default)] flex flex-col justify-between h-20">
          <span className="text-[9px] uppercase tracking-wider font-extrabold text-secondary block">Total Cost</span>
          <span className="text-sm font-black font-mono text-primary">{formatLakhRupee(subTotal + logistics)}</span>
        </Card>
        {internalView && (
          <Card className="p-4 rounded-2xl bg-[var(--bg-surface)] border border-[var(--border-default)] flex flex-col justify-between h-20">
            <span className="text-[9px] uppercase tracking-wider font-extrabold text-secondary block">Total Margin (₹)</span>
            <span className="text-sm font-black font-mono text-primary">{formatLakhRupee(marginTotal)}</span>
          </Card>
        )}
        {internalView && (
          <Card className="p-4 rounded-2xl bg-[var(--bg-surface)] border border-[var(--border-default)] flex flex-col justify-between h-20">
            <span className="text-[9px] uppercase tracking-wider font-extrabold text-secondary block">Margin %</span>
            <span className="text-sm font-black font-mono text-primary">{marginPct.toFixed(1)}%</span>
          </Card>
        )}
        <Card className="p-4 rounded-2xl bg-[var(--bg-surface)] border border-[var(--border-default)] flex flex-col justify-between h-20 col-span-2 lg:col-span-1">
          <span className="text-[9px] uppercase tracking-wider font-extrabold text-secondary block">Total Amount</span>
          <span className="text-sm font-black font-mono text-brand-primary">{formatLakhRupee(grandTotal)}</span>
        </Card>
      </div>

      {/* Two-Column Section with Internal/Client toggle */}
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <span className="text-xs font-bold text-primary">Cost breakdown analysis</span>
          
          <Button
            onClick={() => setInternalView(!internalView)}
            variant="outline"
            size="sm"
            className="text-[10px] h-8 gap-1 text-secondary border-border bg-surface-2"
          >
            {internalView ? (
              <><EyeOff className="h-3.5 w-3.5 text-brand-primary" /> Client View</>
            ) : (
              <><Eye className="h-3.5 w-3.5 text-brand-primary" /> Internal View</>
            )}
          </Button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          
          {/* Left Cost Chart */}
          <div className="lg:col-span-5 bg-[var(--bg-surface)] border border-[var(--border-default)] rounded-3xl p-6 flex flex-col justify-between h-[320px]">
            <span className="text-[10px] uppercase tracking-wider font-extrabold text-secondary block mb-4">Category share</span>
            <div className="h-full relative flex items-center justify-center">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={donutData}
                    cx="50%"
                    cy="50%"
                    innerRadius={30}
                    outerRadius={45}
                    paddingAngle={2}
                    dataKey="value"
                  >
                    {donutData.map((entry: any, index: number) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(v: any) => `₹${v.toLocaleString()}`} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="flex flex-wrap gap-2 text-[8px] font-bold text-secondary mt-4">
              {donutData.map((item: any, idx: number) => (
                <span key={idx} className="flex items-center gap-1">
                  <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: COLORS[idx % COLORS.length] }} />
                  {item.name}: ₹{item.value.toLocaleString()}
                </span>
              ))}
            </div>
          </div>

          {/* Right Cost Summary Table */}
          <div className="lg:col-span-7 bg-[var(--bg-surface)] border border-[var(--border-default)] rounded-3xl overflow-hidden h-fit">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-surface-2 border-b border-border text-secondary">
                  <th className="p-3">Category</th>
                  <th className="p-3 text-right">Cost (INR)</th>
                  {internalView && <th className="p-3 text-right">Margin (INR)</th>}
                  <th className="p-3 text-right">Final Amount (INR)</th>
                </tr>
              </thead>
              <tbody>
                {cost_summary.map((row: any, idx: number) => (
                  <tr key={idx} className="border-b border-border/40 hover:bg-surface-hover/20 font-semibold text-secondary">
                    <td className="p-3 text-primary">{row.category}</td>
                    <td className="p-3 text-right font-mono text-tertiary">₹{Number(row.cost).toLocaleString()}</td>
                    {internalView && (
                      <td className="p-3 text-right font-mono text-success">₹{Number(row.margin).toLocaleString()}</td>
                    )}
                    <td className="p-3 text-right font-mono text-primary font-bold">
                      ₹{(Number(row.cost) + (internalView ? Number(row.margin) : 0)).toLocaleString()}
                    </td>
                  </tr>
                ))}
                <tr className="bg-surface-2 font-extrabold text-primary">
                  <td className="p-3">Grand Total:</td>
                  <td className="p-3 text-right font-mono">₹{subTotal.toLocaleString()}</td>
                  {internalView && <td className="p-3 text-right font-mono text-success">₹{marginTotal.toLocaleString()}</td>}
                  <td className="p-3 text-right font-mono text-brand-primary">
                    ₹{(subTotal + (internalView ? marginTotal : 0)).toLocaleString()}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

        </div>
      </div>

      {/* Service-wise Summary Table */}
      <div className="mt-8 space-y-4">
        <span className="text-xs font-bold text-primary block">Service Wise Line Items</span>
        
        <div className="bg-[var(--bg-surface)] border border-[var(--border-default)] rounded-3xl overflow-hidden">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-surface-2 border-b border-border text-secondary">
                <th className="p-3">Service</th>
                <th className="p-3 text-right">Cost (INR)</th>
                {internalView && <th className="p-3 text-center">Margin %</th>}
                {internalView && <th className="p-3 text-right">Margin (INR)</th>}
                <th className="p-3 text-right">Final Amount (INR)</th>
                <th className="p-3">Pricing Rule Applied</th>
              </tr>
            </thead>
            <tbody>
              {line_items.map((item: any, idx: number) => {
                const itemMarginPct = 15 // Mock default margin percentage per item
                const itemMarginAmt = item.total_amount * (itemMarginPct / 100)
                const finalAmt = item.total_amount + (internalView ? itemMarginAmt : 0)

                return (
                  <tr key={idx} className="border-b border-border/40 hover:bg-surface-hover/20 font-semibold text-secondary">
                    <td className="p-3">
                      <span className="text-primary font-bold block">{item.service_name}</span>
                      <span className="text-[9px] text-tertiary block truncate max-w-[250px]">{item.description}</span>
                    </td>
                    <td className="p-3 text-right font-mono text-tertiary">₹{item.total_amount.toLocaleString()}</td>
                    {internalView && <td className="p-3 text-center font-mono">{itemMarginPct}%</td>}
                    {internalView && <td className="p-3 text-right font-mono text-success">₹{itemMarginAmt.toLocaleString()}</td>}
                    <td className="p-3 text-right font-mono text-primary font-bold">₹{finalAmt.toLocaleString()}</td>
                    <td className="p-3 text-brand-primary text-[10px] font-bold">{item.pricing_rule_applied}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </PageContainer>
  )
}
