"use client";

import React, { useState } from "react";
import { FileText, RefreshCw, IndianRupee } from "lucide-react";
import { format } from "date-fns";
import { PageContainer } from "@/components/super-admin/ui/PageContainer";
import { SectionHeader } from "@/components/super-admin/ui/SectionHeader";
import { MetricRow } from "@/components/super-admin/ui/MetricRow";
import { TableSkeleton } from "@/components/super-admin/ui/LoadingSkeleton";
import { EmptyState } from "@/components/super-admin/ui/EmptyState";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useCreditNotes, type CreditNote } from "@/hooks/useBilling";
import {
  SupportAccessScope,
  type SupportAccessSelection,
} from "@/components/super-admin/ui/SupportAccessScope";

// ── Constants ──────────────────────────────────────────────────────────────────

const STATUS_COLORS: Record<string, string> = {
  ISSUED: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  APPLIED: "bg-green-500/10 text-green-400 border-green-500/20",
  PENDING: "bg-yellow-500/10 text-yellow-400 border-yellow-500/20",
  CANCELLED: "bg-red-500/10 text-red-400 border-red-500/20",
};

const FILTER_OPTIONS = ["ALL", "ISSUED", "APPLIED", "PENDING", "CANCELLED"];

// ── Helpers ────────────────────────────────────────────────────────────────────

function fDate(d?: string) {
  if (!d) return "—";
  try { return format(new Date(d), "dd MMM yyyy, HH:mm"); } catch { return d; }
}

function fCurrency(n: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(n);
}

function CreditBadge({ status }: { status: string }) {
  const cls = STATUS_COLORS[status] ?? "bg-zinc-500/10 text-zinc-400 border-zinc-500/20";
  return (
    <Badge className={`text-[9px] font-bold uppercase px-2 py-0.5 border ${cls}`}>
      {status}
    </Badge>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function CreditNotesPage() {
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [supportScope, setSupportScope] = useState<SupportAccessSelection | null>(null);
  const { data, isLoading, refetch, fetchNextPage, hasNextPage, isFetchingNextPage } = useCreditNotes({
    organizationId: supportScope?.organizationId,
    supportReason: supportScope?.reason,
    accessRequestId: supportScope?.accessRequestId,
    status: statusFilter === "ALL" ? undefined : statusFilter,
  });
  const notes = data?.pages.flatMap((page) => page.items) ?? [];

  const totalAmount = notes.reduce((s, n) => s + n.amount_inr, 0);
  const totalGst = notes.reduce((s, n) => s + n.gst_amount, 0);

  const metrics = [
    { label: "Total Notes", value: notes.length, icon: FileText },
    { label: "Total Amount", value: fCurrency(totalAmount), icon: IndianRupee },
    { label: "Total GST", value: fCurrency(totalGst), icon: IndianRupee },
    { label: "Issued", value: notes.filter(n => n.status === "ISSUED").length, icon: FileText },
  ];

  return (
    <PageContainer>
      <div className="flex items-start justify-between mb-6">
        <SectionHeader
          title="Credit Notes"
          description="Audited tenant-scoped credit notes issued against invoices"
        />
        <Button
          variant="outline"
          size="sm"
          onClick={() => refetch()}
          disabled={isLoading || !supportScope}
          className="shrink-0 gap-2 text-xs"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      <SupportAccessScope value={supportScope} onApply={setSupportScope} />

      {supportScope ? <MetricRow metrics={metrics} /> : null}

      {/* Filters */}
      <div className="flex gap-2 mt-6 mb-4 flex-wrap">
        {FILTER_OPTIONS.map(f => (
          <button
            key={f}
            onClick={() => setStatusFilter(f)}
            className={`px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider border transition-all ${
              statusFilter === f
                ? "bg-[var(--brand-primary)] text-white border-[var(--brand-primary)]"
                : "bg-[var(--bg-surface)] border-[var(--border-default)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
            }`}
          >
            {f}
          </button>
        ))}
      </div>

      {/* Table */}
      {!supportScope ? (
        <EmptyState title="Select a support scope" description="Choose an organization and provide an access reason before viewing credit notes." className="py-16" />
      ) : isLoading ? (
        <TableSkeleton rows={8} cols={6} />
      ) : notes.length === 0 ? (
        <EmptyState
          title="No Credit Notes"
          description="No credit notes match the current filter."
          className="py-16"
        />
      ) : (
        <div className="rounded-2xl border border-[var(--border-default)] overflow-hidden">
          <div className="overflow-auto max-h-[calc(100vh-480px)]">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-[var(--border-default)] bg-[var(--bg-surface-2)]">
                  {["CN Number", "Organisation", "Invoice", "Amount (INR)", "GST", "Status", "Issued At"].map(h => (
                    <th
                      key={h}
                      className="sticky top-0 h-10 px-4 text-[10px] font-bold uppercase tracking-widest text-[var(--text-tertiary)] bg-[var(--bg-surface-2)] border-b border-[var(--border-default)] whitespace-nowrap"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {notes.map((cn: CreditNote) => (
                  <tr
                    key={cn.id}
                    className="border-b border-[var(--border-subtle)] hover:bg-[var(--bg-surface-2)] transition-colors"
                  >
                    <td className="px-4 py-3">
                      <span className="font-mono font-semibold text-[var(--brand-primary)]">
                        {cn.credit_note_number}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-mono text-[10px] text-[var(--text-tertiary)]">
                      {cn.organization_id.slice(0, 8)}…
                    </td>
                    <td className="px-4 py-3 font-mono text-[10px] text-[var(--text-tertiary)]">
                      {cn.invoice_id.slice(0, 8)}…
                    </td>
                    <td className="px-4 py-3">
                      <span className="font-mono font-bold text-green-400">
                        {fCurrency(cn.amount_inr)}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-mono text-[var(--text-secondary)]">
                      {fCurrency(cn.gst_amount)}
                    </td>
                    <td className="px-4 py-3">
                      <CreditBadge status={cn.status} />
                    </td>
                    <td className="px-4 py-3 text-[var(--text-secondary)]">
                      {fDate(cn.issued_at ?? cn.created_at)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      {hasNextPage ? (
        <div className="mt-4 flex justify-center">
          <Button variant="outline" size="sm" disabled={isFetchingNextPage} onClick={() => void fetchNextPage()}>
            {isFetchingNextPage ? "Loading..." : "Load more"}
          </Button>
        </div>
      ) : null}
    </PageContainer>
  );
}
