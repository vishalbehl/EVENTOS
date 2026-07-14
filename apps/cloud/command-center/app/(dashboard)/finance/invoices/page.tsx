"use client"
import React, { useState, useEffect } from "react"
import { useInvoices, useVoidInvoice, formatINR } from "@/services/super-admin-service"
import { PageContainer } from "@/components/super-admin/ui/PageContainer"
import { SectionHeader } from "@/components/super-admin/ui/SectionHeader"
import { ConfirmDestructiveAction } from "@/components/super-admin/ui/ConfirmDestructiveAction"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Search,
  AlertTriangle,
  MoreVertical,
  ChevronLeft,
  ChevronRight,
  FileText,
  Mail,
  Trash2,
  Download,
} from "lucide-react"
import { toast } from "sonner"

type SelectedInvoice = {
  id: string
  number: string
}

export default function InvoicesPage() {
  const [selectedStatus, setSelectedStatus] = useState<string>("ALL")
  const [searchVal, setSearchVal] = useState("")
  const [debouncedSearch, setDebouncedSearch] = useState("")
  const [page, setPage] = useState(1)
  const [invoiceToVoid, setInvoiceToVoid] = useState<SelectedInvoice | null>(null)
  const limit = 8
  const voidInvoice = useVoidInvoice()

  // Debounce search
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearch(searchVal)
      setPage(1)
    }, 300)
    return () => clearTimeout(handler)
  }, [searchVal])

  const { data, isLoading, error, refetch } = useInvoices({
    status: selectedStatus === "ALL" ? undefined : selectedStatus,
    search: debouncedSearch || undefined,
    skip: (page - 1) * limit,
  })

  const items = data?.items || []
  const total = data?.total || 0
  const totalPages = Math.ceil(total / limit) || 1

  // Aggregate Metrics from Backend Summary or compute fallback
  const summary = data?.summary || {
    total_amount: 0,
    paid_amount: 0,
    pending_amount: 0,
    overdue_amount: 0,
    this_month_amount: 0,
    avg_collection_days: 0,
  }

  const metrics = [
    { label: "Total Invoices", value: formatINR(summary.total_amount) },
    { label: "Paid Invoices", value: formatINR(summary.paid_amount) },
    { label: "Pending Invoices", value: formatINR(summary.pending_amount) },
    { label: "Overdue Invoices", value: formatINR(summary.overdue_amount) },
    { label: "This Month Revenue", value: formatINR(summary.this_month_amount) },
    { label: "Avg Collection", value: `${Math.round(summary.avg_collection_days)} Days` },
  ]

  const STATUS_TABS = [
    { label: "All Invoices", value: "ALL" },
    { label: "Paid", value: "PAID" },
    { label: "Pending", value: "PENDING" },
    { label: "Overdue", value: "OVERDUE" },
    { label: "Draft", value: "DRAFT" },
    { label: "Void", value: "VOID" },
  ]

  const handleVoid = async (reason?: string) => {
    if (!invoiceToVoid || !reason) return

    try {
      await voidInvoice.mutateAsync({ invoiceId: invoiceToVoid.id, reason })
      toast.success(`Invoice ${invoiceToVoid.number} has been voided.`)
      setInvoiceToVoid(null)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to void invoice")
    }
  }

  return (
    <PageContainer>
      <SectionHeader
        title="Invoices Ledger"
        description="View payments, invoice logs, GST aggregates, collection speeds, and send reminders."
      />

      {/* Row 1 — 6 metric cards */}
      <div className="grid grid-cols-2 md:grid-cols-6 gap-4 mb-6">
        {metrics.map((m, i) => (
          <div key={i} className="bg-[var(--bg-surface)] border border-[var(--border-default)] rounded-2xl p-4 shadow-sm">
            <span className="text-[10px] font-bold uppercase tracking-wider text-secondary">
              {m.label}
            </span>
            <p className="text-lg font-black font-mono text-primary tracking-tight mt-1">
              {m.value}
            </p>
          </div>
        ))}
      </div>

      <div className="space-y-4">
        {/* Status Tabs and Search */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex flex-wrap gap-1 p-1 bg-[var(--bg-surface-2)] border border-[var(--border-subtle)] rounded-xl w-fit">
            {STATUS_TABS.map(tab => (
              <button
                key={tab.value}
                onClick={() => {
                  setSelectedStatus(tab.value)
                  setPage(1)
                }}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-colors
                  ${selectedStatus === tab.value
                    ? "bg-brand-primary text-white"
                    : "text-secondary hover:text-primary hover:bg-surface-hover"}`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="relative w-72">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-tertiary" />
            <input
              type="text"
              placeholder="Search by invoice # or organization..."
              value={searchVal}
              onChange={e => setSearchVal(e.target.value)}
              className="w-full bg-[var(--bg-surface)] border border-[var(--border-default)] rounded-xl pl-9 pr-4 py-2 text-sm text-primary focus:outline-none focus:border-brand-primary"
            />
          </div>
        </div>

        {/* Data Table */}
        <div className="bg-[var(--bg-surface)] border border-[var(--border-default)] rounded-2xl overflow-hidden shadow-sm">
          {isLoading ? (
            <div className="divide-y divide-[var(--border-subtle)]">
              {Array.from({ length: limit }).map((_, i) => (
                <div key={i} className="h-16 bg-surface-2 animate-pulse" />
              ))}
            </div>
          ) : error ? (
            <div className="flex flex-col items-center gap-2 py-16">
              <AlertTriangle className="h-8 w-8 text-danger" />
              <p className="text-sm text-secondary">Failed to load invoices</p>
              <button onClick={() => refetch()} className="text-xs bg-brand-primary text-white px-3 py-1.5 rounded-lg">
                Retry
              </button>
            </div>
          ) : total === 0 ? (
            <div className="flex flex-col items-center gap-2 py-20 text-center">
              <FileText className="h-12 w-12 text-tertiary animate-pulse" />
              <p className="text-sm font-semibold text-secondary">No invoices yet</p>
              <p className="text-xs text-tertiary">Invoices will show up automatically once transactions occur.</p>
            </div>
          ) : (
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-[var(--border-default)] bg-[var(--bg-surface-2)] text-[11px] font-semibold text-secondary uppercase tracking-wider">
                  <th className="py-3.5 px-4">Invoice #</th>
                  <th className="py-3.5 px-4">Organization</th>
                  <th className="py-3.5 px-4">Plan</th>
                  <th className="py-3.5 px-4 text-right">Amount</th>
                  <th className="py-3.5 px-4 text-right">Tax (GST)</th>
                  <th className="py-3.5 px-4 text-right">Total Amount</th>
                  <th className="py-3.5 px-4">Status</th>
                  <th className="py-3.5 px-4">Due Date</th>
                  <th className="py-3.5 px-4">Paid Date</th>
                  <th className="py-3.5 px-4"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-subtle)] text-sm">
                {items.map(item => (
                  <tr key={item.id} className="hover:bg-[var(--bg-surface-hover)] transition-colors">
                    {/* Invoice ID/Num */}
                    <td className="py-3.5 px-4 font-mono font-bold text-primary">
                      {item.invoice_number || item.id.slice(0, 8).toUpperCase()}
                    </td>

                    {/* Org */}
                    <td className="py-3.5 px-4 font-semibold text-primary">
                      {item.org_name}
                    </td>

                    {/* Plan */}
                    <td className="py-3.5 px-4">
                      <span className="text-xs bg-surface-2 border border-[var(--border-subtle)] px-2 py-0.5 rounded text-secondary font-medium">
                        {item.plan_name}
                      </span>
                    </td>

                    {/* Base Amount */}
                    <td className="py-3.5 px-4 text-right font-mono font-semibold text-primary">
                      {formatINR(item.amount_inr)}
                    </td>

                    {/* GST */}
                    <td className="py-3.5 px-4 text-right font-mono text-secondary">
                      {formatINR(item.gst_amount)}
                    </td>

                    {/* Total Amount */}
                    <td className="py-3.5 px-4 text-right font-mono font-bold text-primary">
                      {formatINR(item.total_amount_inr)}
                    </td>

                    {/* Status badge */}
                    <td className="py-3.5 px-4">
                      <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold border uppercase
                        ${item.status === 'PAID' ? 'bg-success-muted text-success border-success/20'
                          : item.status === 'PENDING' ? 'bg-warning-muted text-warning border-warning/20'
                          : item.status === 'OVERDUE' ? 'bg-danger-muted text-danger border-danger/20'
                          : 'bg-surface-2 text-secondary border-border'}`}>
                        <span className="w-1.5 h-1.5 rounded-full bg-current" />
                        {item.status}
                      </span>
                    </td>

                    {/* Due Date */}
                    <td className="py-3.5 px-4 font-mono text-secondary text-xs">
                      {item.due_date ? new Date(item.due_date).toLocaleDateString('en-IN', { month: 'short', day: 'numeric', year: 'numeric' }) : "—"}
                    </td>

                    {/* Paid Date */}
                    <td className="py-3.5 px-4 font-mono text-secondary text-xs">
                      {item.paid_at ? new Date(item.paid_at).toLocaleDateString('en-IN', { month: 'short', day: 'numeric', year: 'numeric' }) : "—"}
                    </td>

                    {/* Actions Menu */}
                    <td className="py-3.5 px-4 text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-secondary"
                            aria-label={`Actions for invoice ${item.invoice_number || item.id}`}
                          >
                            <MoreVertical className="w-4 h-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-52 border-border bg-surface text-primary">
                          <DropdownMenuItem
                            disabled
                            title="Invoice PDF generation and authorization-gated download are not implemented."
                            className="text-xs text-tertiary"
                          >
                            <Download className="w-3.5 h-3.5 text-secondary" />
                            PDF unavailable
                          </DropdownMenuItem>
                          {item.status === "PENDING" && (
                            <DropdownMenuItem
                              disabled
                              title="Reminder dispatch is unavailable until a durable communication job and delivery audit exist."
                              className="text-xs text-tertiary"
                            >
                              <Mail className="w-3.5 h-3.5 text-secondary" />
                              Reminder unavailable
                            </DropdownMenuItem>
                          )}
                          {item.status !== "VOID" && item.status !== "PAID" && (
                            <DropdownMenuItem
                              onSelect={() => setInvoiceToVoid({
                                id: item.id,
                                number: item.invoice_number || item.id.slice(0, 8).toUpperCase(),
                              })}
                              className="text-xs text-danger focus:bg-red-950/20 focus:text-danger"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                              Void Invoice
                            </DropdownMenuItem>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Pagination Controls */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between py-2">
            <span className="text-xs text-secondary">
              Showing <span className="font-semibold text-primary">{(page - 1) * limit + 1}</span> to{" "}
              <span className="font-semibold text-primary">{Math.min(page * limit, total)}</span> of{" "}
              <span className="font-semibold text-primary">{total}</span> invoices
            </span>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={page === 1}
                onClick={() => setPage(p => p - 1)}
                className="h-8 rounded-lg"
              >
                <ChevronLeft className="w-4 h-4 mr-1" />
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={page === totalPages}
                onClick={() => setPage(p => p + 1)}
                className="h-8 rounded-lg"
              >
                Next
                <ChevronRight className="w-4 h-4 ml-1" />
              </Button>
            </div>
          </div>
        )}
      </div>

      <ConfirmDestructiveAction
        open={invoiceToVoid !== null}
        onOpenChange={(open) => !open && setInvoiceToVoid(null)}
        title="Void invoice?"
        description="This financial mutation changes the invoice lifecycle and will be recorded in the immutable audit history."
        confirmLabel="Void invoice"
        resourceName={invoiceToVoid?.number}
        requireReason
        pending={voidInvoice.isPending}
        onConfirm={handleVoid}
      />
    </PageContainer>
  )
}
