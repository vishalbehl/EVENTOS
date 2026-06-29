"use client"

import React, { useState } from "react"
import { usePaymentGateways } from "@/services/super-admin-service"
import { PageContainer } from "@/components/super-admin/ui/PageContainer"
import { SectionHeader } from "@/components/super-admin/ui/SectionHeader"
import { KpiCard } from "@/components/super-admin/ui/KpiCard"
import { StatusBadge } from "@/components/super-admin/ui/StatusBadge"
import { Button } from "@/components/ui/button"
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts"
import { CreditCard, Power, Plus, RefreshCw, Activity, AlertTriangle, ShieldCheck } from "lucide-react"

export default function PaymentGatewaysPage() {
  const { data, isLoading, error, refetch } = usePaymentGateways()
  const [showAddForm, setShowAddForm] = useState(false)
  const [formData, setFormData] = useState({ name: "", provider: "STRIPE", mode: "TEST" })

  if (isLoading) return <div className="p-8 text-center text-secondary">Loading gateways...</div>
  if (error) return <div className="p-8 text-center text-danger">Failed to load gateways</div>

  const gateways = data?.items || []
  const successChartData = data?.trend || []

  const totalGateways = gateways.length
  const activeGateways = gateways.filter(g => g.is_active).length
  const totalTransactions = gateways.reduce((sum, g) => sum + g.transactions_count, 0)
  const totalVolume = gateways.reduce((sum, g) => sum + g.volume_mtd_inr, 0)

  const chartConfig = {
    grid: { stroke: "var(--border-default)", strokeDasharray: "3 3" },
    xAxis: { tick: { fill: "var(--text-tertiary)", fontSize: 11 } },
    yAxis: { tick: { fill: "var(--text-tertiary)", fontSize: 11 }, domain: [90, 100] },
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

  const formatINR = (val: number) => {
    if (val >= 100_000) return `₹${(val / 100_000).toFixed(2)}L`
    return `₹${val.toLocaleString("en-IN")}`
  }

  return (
    <PageContainer>
      <div className="flex items-center justify-between mb-4">
        <SectionHeader title="Payment Gateways" description="Manage platform payment gateways and check transaction routing rules." />
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => refetch()} className="flex items-center gap-1 text-xs">
            <RefreshCw className="h-3 w-3" /> Refresh
          </Button>
          <Button size="sm" onClick={() => setShowAddForm(!showAddForm)} className="flex items-center gap-1 text-xs bg-brand-primary text-white">
            <Plus className="h-4 w-4" /> Add Gateway
          </Button>
        </div>
      </div>

      {showAddForm && (
        <div className="bg-surface border border-border rounded-xl p-5 mb-6 space-y-4 max-w-xl transition-all duration-300">
          <h3 className="text-sm font-semibold text-primary">Configure New Payment Gateway</h3>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="text-xs text-secondary mb-1 block">Gateway Name</label>
              <input
                value={formData.name}
                onChange={e => setFormData({ ...formData, name: e.target.value })}
                className="w-full text-sm px-3 py-1.5 bg-bg-base border border-border rounded-lg text-primary focus:outline-none focus:border-brand"
                placeholder="e.g. PayU Production"
              />
            </div>
            <div>
              <label className="text-xs text-secondary mb-1 block">Provider</label>
              <select
                value={formData.provider}
                onChange={e => setFormData({ ...formData, provider: e.target.value })}
                className="w-full text-sm px-3 py-1.5 bg-bg-base border border-border rounded-lg text-primary focus:outline-none focus:border-brand"
              >
                <option value="STRIPE">Stripe</option>
                <option value="RAZORPAY">Razorpay</option>
                <option value="PAYU">PayU</option>
                <option value="CCAVENUE">CCAvenue</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-secondary mb-1 block">Mode</label>
              <select
                value={formData.mode}
                onChange={e => setFormData({ ...formData, mode: e.target.value })}
                className="w-full text-sm px-3 py-1.5 bg-bg-base border border-border rounded-lg text-primary focus:outline-none focus:border-brand"
              >
                <option value="TEST">TEST</option>
                <option value="LIVE">LIVE</option>
              </select>
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="ghost" onClick={() => setShowAddForm(false)}>Cancel</Button>
            <Button size="sm" className="bg-brand-primary text-white" disabled={!formData.name}>Save Configuration</Button>
          </div>
        </div>
      )}

      {/* KPI ROW */}
      <div className="grid grid-cols-4 gap-4">
        <KpiCard title="Total Gateways" value={totalGateways.toString()} delta={0} deltaLabel="" trend={[]} icon={CreditCard} iconColor="brand" />
        <KpiCard title="Active Gateways" value={activeGateways.toString()} delta={0} deltaLabel="" trend={[]} icon={Power} iconColor="success" />
        <KpiCard title="Transactions MTD" value={totalTransactions.toLocaleString()} delta={0} deltaLabel="" trend={[]} icon={Activity} iconColor="info" />
        <KpiCard title="Volume MTD" value={formatINR(totalVolume)} delta={0} deltaLabel="" trend={[]} icon={Activity} iconColor="success" />
      </div>

      <div className="grid grid-cols-3 gap-6 mt-6">
        {/* Table list */}
        <div className="col-span-2 bg-surface border border-border rounded-xl p-5">
          <h3 className="text-base font-semibold text-primary mb-4">Configured Gateways</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-border text-secondary text-xs">
                  <th className="py-2.5">Gateway</th>
                  <th className="py-2.5">Provider</th>
                  <th className="py-2.5">Mode</th>
                  <th className="py-2.5">Status</th>
                  <th className="py-2.5 text-right">Success Rate</th>
                  <th className="py-2.5 text-right">Transactions</th>
                  <th className="py-2.5 text-right">Volume MTD</th>
                  <th className="py-2.5">Last Check</th>
                  <th className="py-2.5 text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border text-primary">
                {gateways.map(g => (
                  <tr key={g.id} className="hover:bg-surface-hover transition-colors">
                    <td className="py-3 font-medium">{g.name}</td>
                    <td className="py-3 text-secondary">{g.provider}</td>
                    <td className="py-3">
                      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${g.mode === 'LIVE' ? 'bg-success-muted text-success' : 'bg-default-muted text-secondary'}`}>
                        {g.mode}
                      </span>
                    </td>
                    <td className="py-3">
                      <StatusBadge status={g.is_active ? "HEALTHY" : "DOWN"} />
                    </td>
                    <td className="py-3 text-right font-mono">{g.success_rate.toFixed(1)}%</td>
                    <td className="py-3 text-right font-mono">{g.transactions_count.toLocaleString()}</td>
                    <td className="py-3 text-right font-mono">{formatINR(g.volume_mtd_inr)}</td>
                    <td className="py-3 text-xs text-secondary">{g.last_checked_at ? new Date(g.last_checked_at).toLocaleDateString() : "Never"}</td>
                    <td className="py-3 text-center">
                      <button className="text-xs text-brand-primary font-semibold hover:underline">Toggle</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Success Rate Chart */}
        <div className="bg-surface border border-border rounded-xl p-5 flex flex-col">
          <h3 className="text-base font-semibold text-primary mb-2">Success Rate (Last 30 Days)</h3>
          <p className="text-xs text-secondary mb-4">Rolling transaction success rate comparison across primary gateways.</p>
          <div className="flex-1 min-h-[220px]">
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={successChartData}>
                <CartesianGrid {...chartConfig.grid} />
                <XAxis dataKey="day" {...chartConfig.xAxis} />
                <YAxis {...chartConfig.yAxis} />
                <Tooltip {...chartConfig.tooltip} />
                <Legend verticalAlign="top" height={36} wrapperStyle={{ fontSize: "11px" }} />
                <Line type="monotone" dataKey="stripe" stroke="#7C3AED" name="Stripe" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="razorpay" stroke="#10B981" name="Razorpay" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </PageContainer>
  )
}
