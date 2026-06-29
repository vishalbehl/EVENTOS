"use client"

import React, { useState } from "react"
import { useModelManagement } from "@/services/super-admin-service"
import { PageContainer } from "@/components/super-admin/ui/PageContainer"
import { SectionHeader } from "@/components/super-admin/ui/SectionHeader"
import { StatusBadge } from "@/components/super-admin/ui/StatusBadge"
import { Button } from "@/components/ui/button"
import { ToggleLeft, ToggleRight, Settings, Activity, ShieldCheck, RefreshCw } from "lucide-react"

export default function ModelsPage() {
  const { data, isLoading, error, refetch } = useModelManagement()
  const [strategy, setStrategy] = useState("Cost Optimized")
  const [autoRouting, setAutoRouting] = useState(true)
  const [fallbackModel, setFallbackModel] = useState("gpt-3.5-turbo")

  if (isLoading) return <div className="p-8 text-center text-secondary">Loading AI models...</div>
  if (error || !data) return <div className="p-8 text-center text-danger">Failed to load AI model management</div>

  const models = data.models || []

  return (
    <PageContainer>
      <div className="flex items-center justify-between mb-4">
        <SectionHeader title="Model Management" description="Configure active LLM endpoints, pricing variables, fallback rules, and smart traffic routing." />
        <Button variant="outline" size="sm" onClick={() => refetch()} className="flex items-center gap-1 text-xs">
          <RefreshCw className="h-3 w-3" /> Refresh
        </Button>
      </div>

      {/* Model Routing Control Section */}
      <div className="bg-surface border border-border rounded-xl p-5 mb-6">
        <div className="flex items-center justify-between mb-4 pb-4 border-b border-border">
          <div>
            <h3 className="text-base font-semibold text-primary">Smart Model Routing</h3>
            <p className="text-xs text-secondary">Enable intelligent request routing to optimize cost, latency, or model capability.</p>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-primary">Smart Routing:</span>
            {autoRouting ? (
              <ToggleRight onClick={() => setAutoRouting(false)} className="h-8 w-8 text-brand-primary cursor-pointer" />
            ) : (
              <ToggleLeft onClick={() => setAutoRouting(true)} className="h-8 w-8 text-secondary cursor-pointer" />
            )}
          </div>
        </div>

        <div className="grid grid-cols-3 gap-6">
          <div>
            <label className="text-xs text-secondary mb-1 block">Routing Strategy</label>
            <select
              value={strategy}
              onChange={e => setStrategy(e.target.value)}
              disabled={!autoRouting}
              className="w-full text-sm px-3 py-1.5 bg-bg-base border border-border rounded-lg text-primary focus:outline-none focus:border-brand disabled:opacity-50"
            >
              <option value="Cost Optimized">Cost Optimized (Minimize expense)</option>
              <option value="Performance First">Performance First (Prioritize smartest/fastest model)</option>
              <option value="Load Balanced">Load Balanced (Distribute traffic evenly)</option>
            </select>
          </div>
          <div>
            <label className="text-xs text-secondary mb-1 block">Default Fallback Model</label>
            <select
              value={fallbackModel}
              onChange={e => setFallbackModel(e.target.value)}
              className="w-full text-sm px-3 py-1.5 bg-bg-base border border-border rounded-lg text-primary focus:outline-none focus:border-brand"
            >
              <option value="gpt-3.5-turbo">gpt-3.5-turbo</option>
              <option value="claude-3-haiku">claude-3-haiku</option>
              <option value="llama-3-8b">llama-3-8b</option>
            </select>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-6">
        {/* Model Configurations Table */}
        <div className="col-span-2 bg-surface border border-border rounded-xl p-5">
          <h3 className="text-base font-semibold text-primary mb-4">Supported Models</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-border text-secondary text-xs">
                  <th className="py-2.5">Name</th>
                  <th className="py-2.5">Provider</th>
                  <th className="py-2.5">Context</th>
                  <th className="py-2.5 text-right">Cost/1K In</th>
                  <th className="py-2.5 text-right">Cost/1K Out</th>
                  <th className="py-2.5">Status</th>
                  <th className="py-2.5 text-right">Usage (7d)</th>
                  <th className="py-2.5 text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border text-primary">
                {models.map(m => (
                  <tr key={m.name} className="hover:bg-surface-hover transition-colors">
                    <td className="py-3 font-semibold font-mono text-xs">{m.name}</td>
                    <td className="py-3 text-secondary text-xs">{m.provider}</td>
                    <td className="py-3 font-mono text-xs text-secondary">{m.context}</td>
                    <td className="py-3 text-right font-mono font-medium text-xs">₹{(m.cost_in * 83).toFixed(4)}</td>
                    <td className="py-3 text-right font-mono font-medium text-xs">₹{(m.cost_out * 83).toFixed(4)}</td>
                    <td className="py-3">
                      <StatusBadge status={m.status === "ACTIVE" ? "HEALTHY" : "DOWN"} />
                    </td>
                    <td className="py-3 text-right font-mono text-xs">{m.usage_7d.toLocaleString()}</td>
                    <td className="py-3 text-center">
                      <button className="text-xs text-brand-primary font-semibold hover:underline">Configure</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Live Model Performance List */}
        <div className="bg-surface border border-border rounded-xl p-5">
          <h3 className="text-base font-semibold text-primary mb-4">Model Performance Matrix</h3>
          <div className="space-y-4">
            {models.length === 0 || models.every(m => m.usage_7d === 0) ? (
              <div className="text-center py-10 text-secondary text-xs">
                No active usage telemetry logs recorded in the last 7 days.
              </div>
            ) : (
              models.map(m => (
                <div key={m.name} className="flex items-center justify-between pb-3 border-b border-border last:border-0 last:pb-0">
                  <div>
                    <p className="text-xs font-bold text-primary font-mono">{m.name}</p>
                    <p className="text-[10px] text-tertiary">Provider: {m.provider}</p>
                  </div>
                  <div className="text-right">
                    <span className="text-xs font-mono font-bold text-success">{m.usage_7d.toLocaleString()} requests</span>
                    <p className="text-[10px] text-tertiary">Status: {m.status}</p>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </PageContainer>
  )
}
