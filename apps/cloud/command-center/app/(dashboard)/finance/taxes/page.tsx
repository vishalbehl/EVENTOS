"use client"

import React, { useState } from "react"
import { useTaxConfig } from "@/services/super-admin-service"
import { PageContainer } from "@/components/super-admin/ui/PageContainer"
import { SectionHeader } from "@/components/super-admin/ui/SectionHeader"
import { StatusBadge } from "@/components/super-admin/ui/StatusBadge"
import { Button } from "@/components/ui/button"
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from "recharts"
import { Percent, ShieldAlert, Plus, ToggleLeft, ToggleRight } from "lucide-react"

export default function TaxConfigPage() {
  const { data, isLoading, error, refetch } = useTaxConfig()
  const [activeTab, setActiveTab] = useState<"gst" | "invoice">("gst")
  const [showAddRule, setShowAddRule] = useState(false)
  const [newRule, setNewRule] = useState({ name: "", type: "GST", rate: 18.0, region: "" })

  if (isLoading) return <div className="p-8 text-center text-secondary">Loading tax configuration...</div>
  if (error || !data) return <div className="p-8 text-center text-danger">Failed to load tax configuration</div>

  const COLORS = ["#7C3AED", "#10B981", "#F59E0B", "#EF4444", "#6B7280"]

  const chartConfig = {
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
        <SectionHeader title="Tax Configuration" description="Manage GST rules, invoice tax properties, and base pricing modifiers." />
        {activeTab === "gst" && (
          <Button size="sm" onClick={() => setShowAddRule(!showAddRule)} className="flex items-center gap-1 text-xs bg-brand-primary text-white">
            <Plus className="h-4 w-4" /> Add GST Rule
          </Button>
        )}
      </div>

      {showAddRule && (
        <div className="bg-surface border border-border rounded-xl p-5 mb-6 space-y-4 max-w-xl">
          <h3 className="text-sm font-semibold text-primary">Configure New GST Rule</h3>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-secondary mb-1 block">Rule Name</label>
              <input
                value={newRule.name}
                onChange={e => setNewRule({ ...newRule, name: e.target.value })}
                className="w-full text-sm px-3 py-1.5 bg-bg-base border border-border rounded-lg text-primary focus:outline-none focus:border-brand"
                placeholder="e.g. Karnataka GST"
              />
            </div>
            <div>
              <label className="text-xs text-secondary mb-1 block">Tax Type</label>
              <select
                value={newRule.type}
                onChange={e => setNewRule({ ...newRule, type: e.target.value })}
                className="w-full text-sm px-3 py-1.5 bg-bg-base border border-border rounded-lg text-primary focus:outline-none focus:border-brand"
              >
                <option value="GST">GST (CGST + SGST)</option>
                <option value="IGST">IGST</option>
                <option value="UTGST">UTGST</option>
                <option value="EXEMPT">EXEMPT</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-secondary mb-1 block">Rate (%)</label>
              <input
                type="number"
                value={newRule.rate}
                onChange={e => setNewRule({ ...newRule, rate: Number(e.target.value) })}
                className="w-full text-sm px-3 py-1.5 bg-bg-base border border-border rounded-lg text-primary focus:outline-none focus:border-brand"
              />
            </div>
            <div>
              <label className="text-xs text-secondary mb-1 block">State / Region</label>
              <input
                value={newRule.region}
                onChange={e => setNewRule({ ...newRule, region: e.target.value })}
                className="w-full text-sm px-3 py-1.5 bg-bg-base border border-border rounded-lg text-primary focus:outline-none focus:border-brand"
                placeholder="e.g. Karnataka"
              />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="ghost" onClick={() => setShowAddRule(false)}>Cancel</Button>
            <Button size="sm" className="bg-brand-primary text-white" disabled={!newRule.name || !newRule.region}>Save Rule</Button>
          </div>
        </div>
      )}

      {/* Tabs Selector */}
      <div className="flex border-b border-border mb-6">
        <button
          onClick={() => setActiveTab("gst")}
          className={`px-4 py-2 text-sm font-semibold border-b-2 transition-colors ${
            activeTab === "gst" ? "border-brand-primary text-brand-primary" : "border-transparent text-secondary hover:text-primary"
          }`}
        >
          GST Rules
        </button>
        <button
          onClick={() => setActiveTab("invoice")}
          className={`px-4 py-2 text-sm font-semibold border-b-2 transition-colors ${
            activeTab === "invoice" ? "border-brand-primary text-brand-primary" : "border-transparent text-secondary hover:text-primary"
          }`}
        >
          Invoice & Pricing Config
        </button>
      </div>

      <div className="grid grid-cols-3 gap-6">
        {/* Main Content Pane */}
        <div className="col-span-2 space-y-4">
          {activeTab === "gst" ? (
            <div className="bg-surface border border-border rounded-xl p-5">
              <h3 className="text-base font-semibold text-primary mb-4">Active GST Configurations</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-border text-secondary text-xs">
                      <th className="py-2.5">Rule Name</th>
                      <th className="py-2.5">Type</th>
                      <th className="py-2.5">Rate (%)</th>
                      <th className="py-2.5">State/Region</th>
                      <th className="py-2.5">Status</th>
                      <th className="py-2.5 text-center">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border text-primary">
                    {data.tax_rules.map(rule => (
                      <tr key={rule.id} className="hover:bg-surface-hover transition-colors">
                        <td className="py-3 font-medium">{rule.name}</td>
                        <td className="py-3 text-secondary font-mono">{rule.tax_type}</td>
                        <td className="py-3 font-mono font-semibold">{rule.rate.toFixed(1)}%</td>
                        <td className="py-3 text-secondary">{rule.state_region}</td>
                        <td className="py-3">
                          <StatusBadge status={rule.is_active ? "HEALTHY" : "DOWN"} />
                        </td>
                        <td className="py-3 text-center">
                          <button className="text-xs text-brand-primary font-semibold hover:underline">Edit</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <div className="bg-surface border border-border rounded-xl p-5 space-y-6">
              <div>
                <h3 className="text-base font-semibold text-primary mb-2">Global Pricing Overrides</h3>
                <p className="text-xs text-secondary mb-4">Base convenience and overhead variables charged platform-wide.</p>
                <div className="divide-y divide-border">
                  {data.pricing_rules.map(rule => (
                    <div key={rule.id} className="py-3 flex items-center justify-between">
                      <div>
                        <p className="text-sm font-semibold text-primary">{rule.name}</p>
                        <p className="text-xs text-tertiary">ID: {rule.id}</p>
                      </div>
                      <div className="flex items-center gap-4">
                        <span className="font-mono text-sm font-semibold">₹{rule.value.toLocaleString("en-IN")}</span>
                        {rule.is_active ? <ToggleRight className="h-6 w-6 text-brand-primary cursor-pointer" /> : <ToggleLeft className="h-6 w-6 text-secondary cursor-pointer" />}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="pt-4 border-t border-border">
                <h3 className="text-base font-semibold text-primary mb-2">Invoice General Settings</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div className="p-3 bg-surface-2 rounded-lg border border-border space-y-1">
                    <p className="text-xs font-semibold text-primary">GSTIN Registration Number</p>
                    <p className="text-sm text-secondary font-mono font-bold">29AAAAA1111A1Z1</p>
                  </div>
                  <div className="p-3 bg-surface-2 rounded-lg border border-border space-y-1">
                    <p className="text-xs font-semibold text-primary">Invoice Number Prefix</p>
                    <p className="text-sm text-secondary font-mono font-bold">EVX-IN-</p>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Sidebar Tax Pie Chart */}
        <div className="bg-surface border border-border rounded-xl p-5 flex flex-col">
          <h3 className="text-base font-semibold text-primary mb-2">Tax Distribution Summary</h3>
          <p className="text-xs text-secondary mb-6">Aggregate collection distribution across CGST, SGST, IGST, and UTGST.</p>
          <div className="flex-1 min-h-[220px]">
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie
                  data={data.tax_summary_distribution}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={80}
                  paddingAngle={5}
                  dataKey="value"
                  nameKey="type"
                >
                  {data.tax_summary_distribution.map((_, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip {...chartConfig.tooltip} formatter={(v: number) => [`₹${v.toLocaleString("en-IN")}`, "Volume"]} />
                <Legend verticalAlign="bottom" height={36} wrapperStyle={{ fontSize: "11px" }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </PageContainer>
  )
}
