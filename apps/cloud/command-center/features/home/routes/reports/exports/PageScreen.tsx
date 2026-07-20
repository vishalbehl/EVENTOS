"use client"

import { useState } from "react"
import {
  AlertCircle,
  CheckCircle2,
  Clock3,
  Download,
  FileSpreadsheet,
  FileText,
  Loader2,
  RefreshCw,
} from "lucide-react"
import { toast } from "sonner"

import { AsyncState } from "@/components/super-admin/ui/AsyncState"
import { EmptyState } from "@/components/super-admin/ui/EmptyState"
import { PageContainer } from "@/components/super-admin/ui/PageContainer"
import { SectionHeader } from "@/components/super-admin/ui/SectionHeader"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import {
  downloadCommercialExport,
  type CommercialExport,
  type CommercialReportType,
  useAdminOrgs,
  useCommercialExports,
  useCreateCommercialExport,
} from "@/services/super-admin-service"

const REPORTS: Array<{
  type: CommercialReportType
  title: string
  description: string
  format: "XLSX" | "CSV" | "PDF"
}> = [
  {
    type: "hardware_catalog",
    title: "Hardware Catalog Summary",
    description: "Persisted hardware assets, pricing units, stock, availability, and operational status.",
    format: "XLSX",
  },
  {
    type: "staff_catalog",
    title: "Manpower Mappings Sheet",
    description: "Persisted staff roles, categories, grades, availability, cost, and selling rates.",
    format: "XLSX",
  },
  {
    type: "pricing_simulations",
    title: "Recent Pricing Simulations",
    description: "Organization-scoped persisted simulation inputs, dimensions, calculated totals, and timestamps.",
    format: "CSV",
  },
  {
    type: "pricing_rules",
    title: "Pricing Rules Overview",
    description: "Global rules plus selected-organization overrides, priorities, status, and effective periods.",
    format: "PDF",
  },
]

const LABELS = Object.fromEntries(REPORTS.map(report => [report.type, report.title])) as Record<CommercialReportType, string>

function exportStatus(exportItem: CommercialExport) {
  if (exportItem.status === "COMPLETED") {
    return { icon: CheckCircle2, label: "Ready", className: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20" }
  }
  if (exportItem.status === "FAILED") {
    return { icon: AlertCircle, label: "Failed", className: "text-red-400 bg-red-500/10 border-red-500/20" }
  }
  return { icon: Clock3, label: exportItem.status === "RUNNING" ? "Generating" : "Queued", className: "text-amber-300 bg-amber-500/10 border-amber-500/20" }
}

export default function ReportsExportsPage() {
  const [organizationId, setOrganizationId] = useState("")
  const [reason, setReason] = useState("")
  const [downloadingId, setDownloadingId] = useState<string | null>(null)
  const organizations = useAdminOrgs({ limit: 100 })
  const exportsQuery = useCommercialExports(organizationId || undefined)
  const createExport = useCreateCommercialExport(organizationId || undefined)

  const requestExport = (reportType: CommercialReportType) => {
    createExport.mutate({
      reportType,
      reason: reason.trim(),
      idempotencyKey: `commercial-export-${crypto.randomUUID()}`,
    })
  }

  const download = async (exportItem: CommercialExport) => {
    if (!organizationId) return
    setDownloadingId(exportItem.export_id)
    try {
      const result = await downloadCommercialExport(exportItem.export_id, organizationId)
      const anchor = document.createElement("a")
      anchor.href = result.download_url
      anchor.download = result.filename
      anchor.rel = "noopener noreferrer"
      document.body.appendChild(anchor)
      anchor.click()
      anchor.remove()
      toast.success("Secure download started")
    } catch (error: any) {
      toast.error(error.message || "The export could not be downloaded")
    } finally {
      setDownloadingId(null)
    }
  }

  const canRequest = Boolean(organizationId && reason.trim().length >= 8 && !createExport.isPending)

  return (
    <PageContainer>
      <SectionHeader
        title="Commercial Exports & Reports"
        description="Queue organization-scoped reports, monitor durable generation, and download private artifacts through audited links."
      />

      <Card className="mt-6 grid gap-5 rounded-3xl border border-border bg-surface p-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
        <label className="space-y-2 text-xs font-bold text-primary">
          Organization scope
          <select
            value={organizationId}
            onChange={event => setOrganizationId(event.target.value)}
            className="h-11 w-full rounded-xl border border-border bg-surface-2 px-3 text-sm font-medium text-primary outline-none focus-visible:ring-2 focus-visible:ring-brand-primary"
          >
            <option value="">Select an organization</option>
            {(organizations.data ?? []).map(organization => (
              <option key={organization.id} value={organization.id}>{organization.name}</option>
            ))}
          </select>
        </label>

        <label className="space-y-2 text-xs font-bold text-primary">
          Audit reason
          <textarea
            value={reason}
            onChange={event => setReason(event.target.value)}
            rows={2}
            maxLength={500}
            placeholder="Explain why this organization data is being exported (minimum 8 characters)."
            className="w-full resize-none rounded-xl border border-border bg-surface-2 px-3 py-2 text-sm font-medium text-primary outline-none placeholder:text-tertiary focus-visible:ring-2 focus-visible:ring-brand-primary"
          />
        </label>
      </Card>

      {organizations.isError && (
        <AsyncState
          className="mt-6"
          tone="danger"
          icon={AlertCircle}
          title="Organizations could not be loaded"
          description="Report requests remain disabled until the organization scope can be verified."
          action={{ label: "Retry", onClick: () => organizations.refetch() }}
        />
      )}

      <div className="mt-6 grid grid-cols-1 gap-5 md:grid-cols-2">
        {REPORTS.map(report => (
          <Card key={report.type} className="flex flex-col justify-between rounded-3xl border border-border bg-surface p-6 transition-colors hover:border-brand-primary/45">
            <div className="space-y-3">
              <div className="flex items-start justify-between gap-3">
                <span className="rounded-full border border-brand-primary/20 bg-brand-primary/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-brand-primary">
                  {report.format} report
                </span>
                {report.format === "PDF" ? <FileText className="h-5 w-5 text-tertiary" /> : <FileSpreadsheet className="h-5 w-5 text-tertiary" />}
              </div>
              <h2 className="text-sm font-extrabold text-primary">{report.title}</h2>
              <p className="text-xs leading-relaxed text-secondary">{report.description}</p>
            </div>
            <div className="mt-6 flex justify-end border-t border-border-subtle pt-4">
              <Button
                disabled={!canRequest}
                onClick={() => requestExport(report.type)}
                className="h-9 gap-1.5 bg-brand-primary text-xs font-bold text-white"
              >
                {createExport.isPending && createExport.variables?.reportType === report.type ? (
                  <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Queueing</>
                ) : (
                  <><FileSpreadsheet className="h-3.5 w-3.5" /> Generate report</>
                )}
              </Button>
            </div>
          </Card>
        ))}
      </div>

      <section className="mt-10" aria-labelledby="export-history-title">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <h2 id="export-history-title" className="text-base font-black text-primary">Export history</h2>
            <p className="mt-1 text-xs text-secondary">Private artifacts expire after 24 hours; download links are short-lived and audited.</p>
          </div>
          <Button variant="outline" size="sm" disabled={!organizationId || exportsQuery.isFetching} onClick={() => exportsQuery.refetch()} className="gap-2">
            <RefreshCw className={`h-3.5 w-3.5 ${exportsQuery.isFetching ? "animate-spin" : ""}`} /> Refresh
          </Button>
        </div>

        {!organizationId ? (
          <EmptyState title="Select an organization" description="Export history is isolated by organization and cannot be loaded without a verified scope." />
        ) : exportsQuery.isLoading ? (
          <AsyncState title="Loading export history" description="Reading durable export records." icon={Loader2} />
        ) : exportsQuery.isError ? (
          <AsyncState tone="danger" title="Export history unavailable" description="No sample records are shown when the API fails." icon={AlertCircle} action={{ label: "Retry", onClick: () => exportsQuery.refetch() }} />
        ) : (exportsQuery.data ?? []).length === 0 ? (
          <EmptyState title="No exports requested" description="Generate a report above to create the first durable export record." />
        ) : (
          <div className="space-y-3">
            {(exportsQuery.data ?? []).map(exportItem => {
              const status = exportStatus(exportItem)
              const StatusIcon = status.icon
              return (
                <Card key={exportItem.export_id} className="flex flex-col gap-4 rounded-2xl border border-border bg-surface p-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex min-w-0 items-start gap-3">
                    <StatusIcon className="mt-0.5 h-4 w-4 shrink-0 text-secondary" />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-extrabold text-primary">{LABELS[exportItem.report_type]}</p>
                      <p className="mt-1 text-[11px] text-tertiary">
                        {exportItem.file_format.toUpperCase()} / {new Date(exportItem.created_at).toLocaleString()}
                      </p>
                      {exportItem.failure_reason && <p className="mt-2 text-xs text-red-400">{exportItem.failure_reason}</p>}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <span className={`rounded-full border px-2 py-1 text-[10px] font-bold uppercase ${status.className}`}>{status.label}</span>
                    {exportItem.status === "COMPLETED" && (
                      <Button size="sm" variant="outline" disabled={downloadingId === exportItem.export_id} onClick={() => download(exportItem)} className="gap-2">
                        {downloadingId === exportItem.export_id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
                        Download
                      </Button>
                    )}
                  </div>
                </Card>
              )
            })}
          </div>
        )}
      </section>
    </PageContainer>
  )
}
