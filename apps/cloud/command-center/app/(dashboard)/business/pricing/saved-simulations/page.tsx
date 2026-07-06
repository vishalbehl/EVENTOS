"use client"

import { useMemo, useState } from "react"
import { usePricingSimulations, useDeletePricingSimulation, formatINR } from "@/services/super-admin-service"
import { PageContainer } from "@/components/super-admin/ui/PageContainer"
import { SectionHeader } from "@/components/super-admin/ui/SectionHeader"
import { Button } from "@/components/ui/button"
import { Trash2, FileText, Calendar, History, RefreshCw, Eye, Printer, Package, Users } from "lucide-react"
import { buildAllocationReportHtml, buildSavedQuoteFallbackHtml, openPrintWindow } from "./quote-print-utils"

export default function SavedSimulationsPage() {
  const { data: simulations = [], isLoading, refetch } = usePricingSimulations()
  const deleteSim = useDeletePricingSimulation()
  const [activeSimulation, setActiveSimulation] = useState<any>(null)

  const handleDelete = async (id: string) => {
    if (confirm("Are you sure you want to delete this saved quote?")) {
      await deleteSim.mutateAsync(id)
      refetch()
      if (activeSimulation?.id === id) setActiveSimulation(null)
    }
  }

  const handlePrintQuote = (sim: any) => {
    const savedHtml = sim?.output_data?.quote_snapshot?.proposal_html
    openPrintWindow(savedHtml || buildSavedQuoteFallbackHtml(sim), sim?.name || "Saved Quote")
  }

  const handlePrintAllocation = (sim: any) => {
    openPrintWindow(buildAllocationReportHtml(sim), `${sim?.name || "Saved Quote"} Allocation Report`)
  }

  const allocationSnapshot = activeSimulation?.output_data?.quote_snapshot
  const hardwareAllocations = useMemo(() => allocationSnapshot?.allocations?.hardware || [], [allocationSnapshot])
  const staffAllocations = useMemo(() => allocationSnapshot?.allocations?.staff || [], [allocationSnapshot])

  return (
    <PageContainer>
      <SectionHeader
        title="Saved Quotes"
        description="View saved quotes, allocation snapshots, and print the exact proposal or a detailed hardware report."
        actions={
          <Button onClick={() => refetch()} variant="outline" className="h-9 gap-1 text-xs">
            <RefreshCw className="h-3.5 w-3.5" /> Refresh List
          </Button>
        }
      />

      <div className="bg-[var(--bg-surface)] border border-[var(--border-default)] rounded-3xl overflow-hidden mt-6">
        {isLoading ? (
          <div className="p-12 text-center text-sm text-secondary">Loading saved quotes...</div>
        ) : simulations.length === 0 ? (
          <div className="p-16 text-center text-tertiary text-xs flex flex-col items-center justify-center gap-2">
            <History className="h-8 w-8 text-border-hover mb-2" />
            <span>No saved quotes found. Save a quote to see it here.</span>
          </div>
        ) : (
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-surface-2 border-b border-border text-secondary">
                <th className="p-4">Quote Name</th>
                <th className="p-4">Date Saved</th>
                <th className="p-4 text-right">Actual Cost</th>
                <th className="p-4 text-right">Grand Total Quote</th>
                <th className="p-4 text-center">Actions</th>
              </tr>
            </thead>
            <tbody>
              {simulations.map((sim: any) => {
                const snapshot = sim.output_data?.quote_snapshot
                const actualCost = snapshot?.summary?.actualOperationalCost ?? ((sim.output_data?.hardware_subtotal || 0) + (sim.output_data?.staffing_subtotal || 0))
                const askedCost = snapshot?.summary?.askedOperationalCost ?? ((sim.output_data?.hardware_subtotal || 0) + (sim.output_data?.staffing_subtotal || 0))
                return (
                  <tr key={sim.id} className="border-b border-border/40 hover:bg-surface-hover/20">
                    <td className="p-4 font-semibold text-primary">
                      <div className="space-y-1">
                        <div>{sim.name}</div>
                        <div className="text-[10px] font-medium text-tertiary">
                          Asked operational {formatINR(askedCost)}
                        </div>
                      </div>
                    </td>
                    <td className="p-4 text-secondary text-xs font-medium">
                      <div className="flex items-center gap-1.5">
                        <Calendar className="h-3.5 w-3.5 text-tertiary" />
                        {new Date(sim.created_at).toLocaleString()}
                      </div>
                    </td>
                    <td className="p-4 text-right font-mono font-medium text-secondary text-xs">
                      {formatINR(actualCost)}
                    </td>
                    <td className="p-4 text-right font-mono font-bold text-success text-xs">
                      {formatINR(snapshot?.summary?.grandTotal || sim.output_data?.total_amount || 0)}
                    </td>
                    <td className="p-4 text-center">
                      <div className="flex gap-2 justify-center flex-wrap">
                        <Button size="sm" variant="outline" onClick={() => setActiveSimulation(sim)} className="h-8 text-xs font-semibold gap-1">
                          <Eye className="h-3.5 w-3.5" /> View
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => handlePrintQuote(sim)} className="h-8 text-xs font-semibold gap-1">
                          <FileText className="h-3.5 w-3.5" /> Quote PDF
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => handlePrintAllocation(sim)} className="h-8 text-xs font-semibold gap-1">
                          <Printer className="h-3.5 w-3.5" /> Allocation PDF
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => handleDelete(sim.id)} className="h-8 text-danger hover:text-danger/80">
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      {activeSimulation && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
          <div className="flex max-h-[88vh] w-full max-w-6xl flex-col overflow-hidden rounded-3xl border border-[var(--border-default)] bg-[var(--bg-surface)] shadow-2xl">
            <div className="flex items-center justify-between border-b border-border px-6 py-4">
              <div>
                <h3 className="text-base font-bold text-primary">{activeSimulation.name}</h3>
                <p className="text-xs text-secondary">Actual hardware and staff allocation with printable quote and allocation reports.</p>
              </div>
              <div className="flex items-center gap-2">
                <Button variant="outline" className="h-9 gap-1 text-xs" onClick={() => handlePrintQuote(activeSimulation)}>
                  <FileText className="h-3.5 w-3.5" /> Quote PDF
                </Button>
                <Button variant="outline" className="h-9 gap-1 text-xs" onClick={() => handlePrintAllocation(activeSimulation)}>
                  <Printer className="h-3.5 w-3.5" /> Print Allocation
                </Button>
                <Button variant="ghost" className="h-9 text-xs" onClick={() => setActiveSimulation(null)}>Close</Button>
              </div>
            </div>

            <div className="grid gap-4 border-b border-border bg-surface-2/40 px-6 py-4 md:grid-cols-4">
              <StatCard label="Actual hardware" value={formatINR(allocationSnapshot?.summary?.actualHardwareCost || 0)} icon={Package} />
              <StatCard label="Asked hardware" value={formatINR(allocationSnapshot?.summary?.askedHardwareCost || 0)} icon={Package} />
              <StatCard label="Actual staff" value={formatINR(allocationSnapshot?.summary?.actualStaffCost || 0)} icon={Users} />
              <StatCard label="Asked staff" value={formatINR(allocationSnapshot?.summary?.askedStaffCost || 0)} icon={Users} />
            </div>

            <div className="grid min-h-0 flex-1 md:grid-cols-[1.15fr_0.85fr]">
              <div className="min-h-0 overflow-y-auto border-r border-border">
                <div className="sticky top-0 z-10 border-b border-border bg-[var(--bg-surface)] px-6 py-3">
                  <h4 className="text-xs font-bold uppercase tracking-widest text-secondary">Hardware allocation</h4>
                </div>
                <div className="p-6 pt-4">
                  <div className="overflow-hidden rounded-2xl border border-border">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-surface-2 text-secondary">
                        <tr>
                          <th className="p-3">Category</th>
                          <th className="p-3">Hardware</th>
                          <th className="p-3 text-center">Qty</th>
                          <th className="p-3">Used In</th>
                          <th className="p-3 text-right">Actual</th>
                          <th className="p-3 text-right">Asked</th>
                        </tr>
                      </thead>
                      <tbody>
                        {hardwareAllocations.length === 0 ? (
                          <tr><td colSpan={6} className="p-6 text-center text-tertiary">No saved hardware allocation for this quote.</td></tr>
                        ) : hardwareAllocations.map((item: any) => (
                          <tr key={item.id} className="border-t border-border/50">
                            <td className="p-3">{item.category || "General"}</td>
                            <td className="p-3 font-semibold text-primary">{item.name}</td>
                            <td className="p-3 text-center font-mono">{item.qty}</td>
                            <td className="p-3 text-secondary">{(item.sources || []).join(", ") || "—"}</td>
                            <td className="p-3 text-right font-mono">{formatINR(item.actualTotalCost || 0)}</td>
                            <td className="p-3 text-right font-mono font-semibold text-primary">{formatINR(item.askedTotalCost || 0)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>

              <div className="min-h-0 overflow-y-auto">
                <div className="sticky top-0 z-10 border-b border-border bg-[var(--bg-surface)] px-6 py-3">
                  <h4 className="text-xs font-bold uppercase tracking-widest text-secondary">Staff allocation</h4>
                </div>
                <div className="p-6 pt-4 space-y-4">
                  <div className="overflow-hidden rounded-2xl border border-border">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-surface-2 text-secondary">
                        <tr>
                          <th className="p-3">Category</th>
                          <th className="p-3">Role</th>
                          <th className="p-3 text-center">Qty</th>
                          <th className="p-3 text-center">Days</th>
                          <th className="p-3 text-right">Actual</th>
                          <th className="p-3 text-right">Asked</th>
                        </tr>
                      </thead>
                      <tbody>
                        {staffAllocations.length === 0 ? (
                          <tr><td colSpan={6} className="p-6 text-center text-tertiary">No saved staff allocation for this quote.</td></tr>
                        ) : staffAllocations.map((item: any) => (
                          <tr key={item.id} className="border-t border-border/50">
                            <td className="p-3">{item.department || "Operations"}</td>
                            <td className="p-3 font-semibold text-primary">{item.name}</td>
                            <td className="p-3 text-center font-mono">{item.qty}</td>
                            <td className="p-3 text-center font-mono">{item.days || 0}</td>
                            <td className="p-3 text-right font-mono">{formatINR(item.actualTotalCost || 0)}</td>
                            <td className="p-3 text-right font-mono font-semibold text-primary">{formatINR(item.askedTotalCost || 0)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <div className="rounded-2xl border border-border bg-surface-2/40 p-4">
                    <h5 className="text-xs font-bold uppercase tracking-widest text-secondary">Quote summary</h5>
                    <div className="mt-3 space-y-2 text-xs">
                      <div className="flex justify-between"><span className="text-secondary">Actual operational cost</span><span className="font-mono text-primary">{formatINR(allocationSnapshot?.summary?.actualOperationalCost || 0)}</span></div>
                      <div className="flex justify-between"><span className="text-secondary">Asked operational cost</span><span className="font-mono text-primary">{formatINR(allocationSnapshot?.summary?.askedOperationalCost || 0)}</span></div>
                      <div className="flex justify-between"><span className="text-secondary">Commercial add-ons</span><span className="font-mono text-primary">{formatINR(allocationSnapshot?.summary?.addonCommercialCost || 0)}</span></div>
                      <div className="flex justify-between border-t border-border/60 pt-2 font-semibold"><span className="text-primary">Grand total quote</span><span className="font-mono text-primary">{formatINR(allocationSnapshot?.summary?.grandTotal || activeSimulation.output_data?.total_amount || 0)}</span></div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </PageContainer>
  )
}

function StatCard({ label, value, icon: Icon }: { label: string; value: string; icon: any }) {
  return (
    <div className="rounded-2xl border border-border bg-[var(--bg-surface)] p-4">
      <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-secondary">
        <Icon className="h-3.5 w-3.5" />
        <span>{label}</span>
      </div>
      <div className="mt-2 text-lg font-semibold text-primary">{value}</div>
    </div>
  )
}
