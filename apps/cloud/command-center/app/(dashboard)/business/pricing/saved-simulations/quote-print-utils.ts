"use client"

import { formatINR } from "@/services/super-admin-service"

export function openPrintWindow(html: string, title = "Print") {
  const printWindow = window.open("", "_blank")
  if (!printWindow) return
  printWindow.document.write(html)
  printWindow.document.close()
  printWindow.focus()
  printWindow.print()
}

export function buildSavedQuoteFallbackHtml(sim: any) {
  const itemsHtml = sim.output_data?.line_items?.map((item: any) => `
    <tr>
      <td style="padding: 10px; border-bottom: 1px solid #E5E7EB; font-size: 13px;">${item.name}</td>
      <td style="padding: 10px; border-bottom: 1px solid #E5E7EB; font-size: 13px; text-align: center;">${item.quantity}</td>
      <td style="padding: 10px; border-bottom: 1px solid #E5E7EB; font-size: 13px; text-align: center;">${item.days}</td>
      <td style="padding: 10px; border-bottom: 1px solid #E5E7EB; font-size: 13px; text-align: right; font-family: monospace;">${formatINR(item.unit_cost || 0)}</td>
      <td style="padding: 10px; border-bottom: 1px solid #E5E7EB; font-size: 13px; text-align: right; font-family: monospace; font-weight: bold;">${formatINR(item.total || 0)}</td>
    </tr>
  `).join("") || ""

  return `
    <html>
      <head>
        <title>${titleSafe(sim?.name || "Saved Quote")}</title>
        <style>
          body { font-family: Inter, Arial, sans-serif; padding: 40px; color: #1F2937; }
          .header { display: flex; justify-content: space-between; border-bottom: 2px solid #5B21B6; padding-bottom: 20px; }
          h1 { color: #5B21B6; margin: 0; font-size: 24px; font-weight: 800; }
          .meta-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin: 30px 0; }
          .meta-card { background: #F9FAFB; padding: 15px; border-radius: 8px; font-size: 13px; border: 1px solid #E5E7EB; }
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
            <h1>PRICING PROPOSAL</h1>
            <span style="font-size: 11px; text-transform: uppercase; color: #6B7280; font-weight: bold;">Saved Quote Archive</span>
          </div>
          <div style="text-align: right; font-size: 12px; color: #4B5563;">
            <strong>Date Saved:</strong> ${new Date(sim.created_at).toLocaleDateString()}<br/>
            <strong>Quote ID:</strong> ${(sim.id || "").substring(0, 8)}
          </div>
        </div>

        <div class="meta-grid">
          <div class="meta-card">
            <h4 style="margin: 0 0 10px 0; color: #5B21B6;">Quote Specifications</h4>
            <div class="meta-row"><span>Quote Name:</span> <strong>${sim.name || "Saved Quote"}</strong></div>
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
          <tbody>${itemsHtml}</tbody>
        </table>

        <div class="summary-card">
          <div class="summary-row"><span>Hardware Subtotal:</span> <span style="font-family: monospace;">${formatINR(sim.output_data?.hardware_subtotal || 0)}</span></div>
          <div class="summary-row"><span>Staffing Subtotal:</span> <span style="font-family: monospace;">${formatINR(sim.output_data?.staffing_subtotal || 0)}</span></div>
          <div class="summary-row"><span>Markup & Buffer Cost:</span> <span style="font-family: monospace;">${formatINR((sim.output_data?.markup_fees || 0) + (sim.output_data?.contingency || 0) + (sim.output_data?.management_fee || 0))}</span></div>
          <div class="summary-row"><span>Taxes (GST):</span> <span style="font-family: monospace;">${formatINR(sim.output_data?.gst_amount || 0)}</span></div>
          <div class="summary-row total">
            <span>Grand Quote Total:</span> <span style="font-family: monospace;">${formatINR(sim.output_data?.total_amount || 0)}</span>
          </div>
        </div>
      </body>
    </html>
  `
}

export function buildAllocationReportHtml(sim: any) {
  const snapshot = sim?.output_data?.quote_snapshot || {}
  const hardwareRows = (snapshot.allocations?.hardware || []).map((item: any) => `
    <tr>
      <td>${item.category || "General"}</td>
      <td>${item.name || "—"}</td>
      <td style="text-align:center">${item.qty || 0}</td>
      <td>${(item.sources || []).join(", ") || "—"}</td>
      <td style="text-align:right; font-family: monospace;">${formatINR(item.actualTotalCost || 0)}</td>
      <td style="text-align:right; font-family: monospace;">${formatINR(item.askedTotalCost || 0)}</td>
    </tr>
  `).join("")

  const staffRows = (snapshot.allocations?.staff || []).map((item: any) => `
    <tr>
      <td>${item.department || "Operations"}</td>
      <td>${item.name || "—"}</td>
      <td style="text-align:center">${item.qty || 0}</td>
      <td style="text-align:center">${item.days || 0}</td>
      <td>${(item.sources || []).join(", ") || "—"}</td>
      <td style="text-align:right; font-family: monospace;">${formatINR(item.actualTotalCost || 0)}</td>
      <td style="text-align:right; font-family: monospace;">${formatINR(item.askedTotalCost || 0)}</td>
    </tr>
  `).join("")

  return `
    <html>
      <head>
        <title>${titleSafe(sim?.name || "Allocation Report")}</title>
        <style>
          body { font-family: Inter, Arial, sans-serif; padding: 32px; color: #111827; }
          h1 { margin: 0 0 8px; font-size: 24px; color: #111827; }
          h2 { margin: 28px 0 10px; font-size: 15px; color: #5B21B6; text-transform: uppercase; letter-spacing: .06em; }
          p { margin: 0; color: #6B7280; font-size: 12px; }
          table { width: 100%; border-collapse: collapse; margin-top: 12px; font-size: 12px; }
          th, td { border: 1px solid #E5E7EB; padding: 8px 10px; vertical-align: top; }
          th { background: #F3F4F6; text-align: left; text-transform: uppercase; font-size: 11px; letter-spacing: .04em; color: #4B5563; }
          .meta { display: flex; justify-content: space-between; align-items: flex-end; border-bottom: 2px solid #EDE9FE; padding-bottom: 12px; }
          .summary { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; margin-top: 20px; }
          .card { border: 1px solid #E5E7EB; background: #F9FAFB; border-radius: 12px; padding: 12px; }
          .k { font-size: 11px; text-transform: uppercase; color: #6B7280; }
          .v { margin-top: 4px; font-size: 16px; font-weight: 800; color: #111827; }
        </style>
      </head>
      <body>
        <div class="meta">
          <div>
            <h1>Resource Allocation Report</h1>
            <p>Category-wise hardware and crew usage with actual vs asked cost.</p>
          </div>
          <div style="text-align:right">
            <p><strong>Quote:</strong> ${sim?.name || "Saved Quote"}</p>
            <p><strong>Saved:</strong> ${new Date(sim?.created_at).toLocaleString()}</p>
          </div>
        </div>
        <div class="summary">
          <div class="card"><div class="k">Hardware actual</div><div class="v">${formatINR(snapshot.summary?.actualHardwareCost || 0)}</div></div>
          <div class="card"><div class="k">Hardware asked</div><div class="v">${formatINR(snapshot.summary?.askedHardwareCost || 0)}</div></div>
          <div class="card"><div class="k">Staff actual</div><div class="v">${formatINR(snapshot.summary?.actualStaffCost || 0)}</div></div>
          <div class="card"><div class="k">Staff asked</div><div class="v">${formatINR(snapshot.summary?.askedStaffCost || 0)}</div></div>
        </div>

        <h2>Hardware Allocation</h2>
        <table>
          <thead>
            <tr>
              <th>Category</th>
              <th>Hardware</th>
              <th style="text-align:center">Qty</th>
              <th>Used in</th>
              <th style="text-align:right">Actual cost</th>
              <th style="text-align:right">Asked cost</th>
            </tr>
          </thead>
          <tbody>${hardwareRows || `<tr><td colspan="6" style="text-align:center;color:#6B7280">No hardware allocation saved.</td></tr>`}</tbody>
        </table>

        <h2>Staff Allocation</h2>
        <table>
          <thead>
            <tr>
              <th>Category</th>
              <th>Role</th>
              <th style="text-align:center">Qty</th>
              <th style="text-align:center">Days</th>
              <th>Used in</th>
              <th style="text-align:right">Actual cost</th>
              <th style="text-align:right">Asked cost</th>
            </tr>
          </thead>
          <tbody>${staffRows || `<tr><td colspan="7" style="text-align:center;color:#6B7280">No crew allocation saved.</td></tr>`}</tbody>
        </table>
      </body>
    </html>
  `
}

function titleSafe(value: string) {
  return String(value).replace(/[<>]/g, "")
}
