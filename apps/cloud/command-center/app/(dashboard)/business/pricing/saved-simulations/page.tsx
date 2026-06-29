"use client"
import { usePricingSimulations, useDeletePricingSimulation, formatINR } from "@/services/super-admin-service"
import { PageContainer } from "@/components/super-admin/ui/PageContainer"
import { SectionHeader } from "@/components/super-admin/ui/SectionHeader"
import { Button } from "@/components/ui/button"
import { Trash2, FileText, Calendar, History, RefreshCw } from "lucide-react"

export default function SavedSimulationsPage() {
  const { data: simulations = [], isLoading, refetch } = usePricingSimulations()
  const deleteSim = useDeletePricingSimulation()

  const handleDelete = async (id: string) => {
    if (confirm("Are you sure you want to delete this simulation run?")) {
      await deleteSim.mutateAsync(id)
      refetch()
    }
  }

  const handlePrintPDF = (sim: any) => {
    const printWindow = window.open("", "_blank")
    if (!printWindow) return

    const itemsHtml = sim.output_data?.line_items?.map((item: any) => `
      <tr>
        <td style="padding: 10px; border-bottom: 1px solid #E5E7EB; font-size: 13px;">${item.name}</td>
        <td style="padding: 10px; border-bottom: 1px solid #E5E7EB; font-size: 13px; text-align: center;">${item.quantity}</td>
        <td style="padding: 10px; border-bottom: 1px solid #E5E7EB; font-size: 13px; text-align: center;">${item.days}</td>
        <td style="padding: 10px; border-bottom: 1px solid #E5E7EB; font-size: 13px; text-align: right; font-family: monospace;">₹${item.unit_cost.toLocaleString()}</td>
        <td style="padding: 10px; border-bottom: 1px solid #E5E7EB; font-size: 13px; text-align: right; font-family: monospace; font-weight: bold;">₹${item.total.toLocaleString()}</td>
      </tr>
    `).join("") || ""

    printWindow.document.write(`
      <html>
        <head>
          <title>EventX - Saved Quote Proposal</title>
          <style>
            body { font-family: 'Inter', sans-serif; padding: 40px; color: #1F2937; }
            .header { display: flex; justify-content: space-between; border-bottom: 2px solid #5B21B6; padding-bottom: 20px; }
            h1 { color: #5B21B6; margin: 0; font-size: 24px; font-weight: 800; }
            .meta-grid { display: grid; grid-template-cols: 1fr 1fr; gap: 20px; margin: 30px 0; }
            .meta-card { background: #F9FAFB; padding: 15px; border-radius: 8px; font-size: 13px; }
            .meta-row { display: flex; justify-content: space-between; margin-bottom: 6px; }
            .items-table { width: 100%; margin-top: 30px; border-collapse: collapse; text-align: left; }
            .items-table th { padding: 12px 10px; background-color: #F3F4F6; font-size: 12px; font-weight: bold; text-transform: uppercase; color: #4B5563; }
            .summary-card { margin-top: 40px; border: 1px solid #E5E7EB; padding: 20px; border-radius: 12px; background-color: #FAFAFA; width: 380px; margin-left: auto; }
            .summary-row { display: flex; justify-content: space-between; margin-bottom: 8px; font-size: 13px; }
            .summary-row.total { border-top: 2px solid #E5E7EB; padding-top: 10px; font-size: 16px; font-weight: 800; color: #5B21B6; }
          </style>
        </head>
        <body>
          <div class="header">
            <div>
              <h1>COMMERCIAL ESTIMATION SUMMARY</h1>
              <span style="font-size: 11px; text-transform: uppercase; color: #6B7280; font-weight: bold; tracking-wider">EventX Saved Runs Archive</span>
            </div>
            <div style="text-align: right; font-size: 12px; color: #4B5563;">
              <strong>Date Saved:</strong> ${new Date(sim.created_at).toLocaleDateString()}<br/>
              <strong>Sim ID:</strong> ${sim.id?.substring(0, 8)}
            </div>
          </div>

          <div class="meta-grid">
            <div class="meta-card">
              <h4 style="margin: 0 0 10px 0; color: #5B21B6;">Simulation Specifications</h4>
              <div class="meta-row"><span>Simulation Name:</span> <strong>${sim.name}</strong></div>
              <div class="meta-row"><span>Event Days:</span> <strong>${sim.input_data?.event_days || 1} days</strong></div>
              <div class="meta-row"><span>Attendee Target:</span> <strong>${sim.input_data?.attendee_count || 0} pax</strong></div>
            </div>
          </div>

          <h3>Allocated Resource Footprint</h3>
          <table class="items-table">
            <thead>
              <tr>
                <th>Resource description</th>
                <th style="text-align: center;">Qty</th>
                <th style="text-align: center;">Days</th>
                <th style="text-align: right;">Unit Price</th>
                <th style="text-align: right;">Subtotal</th>
              </tr>
            </thead>
            <tbody>
              ${itemsHtml}
            </tbody>
          </table>

          <div class="summary-card">
            <div class="summary-row"><span>Hardware Subtotal:</span> <span style="font-family: monospace;">₹${sim.output_data?.hardware_subtotal?.toLocaleString()}</span></div>
            <div class="summary-row"><span>Staffing Subtotal:</span> <span style="font-family: monospace;">₹${sim.output_data?.staffing_subtotal?.toLocaleString()}</span></div>
            <div class="summary-row"><span>Markup & Buffer Cost:</span> <span style="font-family: monospace;">₹${((sim.output_data?.markup_fees || 0) + (sim.output_data?.contingency || 0) + (sim.output_data?.management_fee || 0))?.toLocaleString()}</span></div>
            <div class="summary-row"><span>Taxes (GST):</span> <span style="font-family: monospace;">₹${sim.output_data?.gst_amount?.toLocaleString()}</span></div>
            <div class="summary-row total">
              <span>Grand Quote Total:</span> <span style="font-family: monospace;">₹${sim.output_data?.total_amount?.toLocaleString()}</span>
            </div>
          </div>
        </body>
      </html>
    `)
    printWindow.document.close()
    printWindow.print()
  }

  return (
    <PageContainer>
      <SectionHeader
        title="Saved Simulations"
        description="Historical repository of quote drafts, operational scenarios, and saved client estimations"
        actions={
          <Button onClick={() => refetch()} variant="outline" className="h-9 gap-1 text-xs">
            <RefreshCw className="h-3.5 w-3.5" /> Refresh List
          </Button>
        }
      />

      <div className="bg-[var(--bg-surface)] border border-[var(--border-default)] rounded-3xl overflow-hidden mt-6">
        {isLoading ? (
          <div className="p-12 text-center text-sm text-secondary">Loading saved pricing runs...</div>
        ) : simulations.length === 0 ? (
          <div className="p-16 text-center text-tertiary text-xs flex flex-col items-center justify-center gap-2">
            <History className="h-8 w-8 text-border-hover mb-2" />
            <span>No saved pricing simulations found. Run and save a simulation to see it here.</span>
          </div>
        ) : (
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-surface-2 border-b border-border text-secondary">
                <th className="p-4">Simulation Run Name</th>
                <th className="p-4">Date Run</th>
                <th className="p-4 text-right">Operational Cost</th>
                <th className="p-4 text-right">Grand Total Quote</th>
                <th className="p-4 text-center">Actions</th>
              </tr>
            </thead>
            <tbody>
              {simulations.map((sim: any) => {
                const operationalCost = (sim.output_data?.hardware_subtotal || 0) + (sim.output_data?.staffing_subtotal || 0)
                return (
                  <tr key={sim.id} className="border-b border-border/40 hover:bg-surface-hover/20">
                    <td className="p-4 font-semibold text-primary">
                      {sim.name}
                    </td>
                    <td className="p-4 text-secondary text-xs font-medium">
                      <div className="flex items-center gap-1.5">
                        <Calendar className="h-3.5 w-3.5 text-tertiary" />
                        {new Date(sim.created_at).toLocaleString()}
                      </div>
                    </td>
                    <td className="p-4 text-right font-mono font-medium text-secondary text-xs">
                      {formatINR(operationalCost)}
                    </td>
                    <td className="p-4 text-right font-mono font-bold text-success text-xs">
                      {formatINR(sim.output_data?.total_amount || 0)}
                    </td>
                    <td className="p-4 text-center">
                      <div className="flex gap-2 justify-center">
                        <Button size="sm" variant="outline" onClick={() => handlePrintPDF(sim)} className="h-8 text-xs font-semibold gap-1">
                          <FileText className="h-3.5 w-3.5" /> PDF
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
    </PageContainer>
  )
}
