"use client";

import { useState } from "react";
import { format } from "date-fns";
import { FileText, IndianRupee, Plus, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { BillingStatusDialog, CreditNoteIssueDialog } from "@/components/billing/BillingLifecycleDialogs";
import { EmptyState } from "@/components/super-admin/ui/EmptyState";
import { TableSkeleton } from "@/components/super-admin/ui/LoadingSkeleton";
import { MetricRow } from "@/components/super-admin/ui/MetricRow";
import { PageContainer } from "@/components/super-admin/ui/PageContainer";
import { SectionHeader } from "@/components/super-admin/ui/SectionHeader";
import { SupportAccessScope, type SupportAccessSelection } from "@/components/super-admin/ui/SupportAccessScope";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  type CreditNote,
  useBillingInvoices,
  useCreditNotes,
  useCreditNoteStatusMutation,
  useIssueCreditNote,
} from "@/hooks/useBilling";

const STATUS_COLORS: Record<string, string> = {
  ISSUED: "border-blue-500/20 bg-blue-500/10 text-blue-400",
  APPLIED: "border-green-500/20 bg-green-500/10 text-green-400",
  PENDING: "border-yellow-500/20 bg-yellow-500/10 text-yellow-400",
  CANCELLED: "border-red-500/20 bg-red-500/10 text-red-400",
};
const STATUS_TRANSITIONS: Record<string, string[]> = {
  PENDING: ["ISSUED", "CANCELLED"],
  ISSUED: ["APPLIED", "CANCELLED"],
  APPLIED: [],
  CANCELLED: [],
};
const FILTER_OPTIONS = ["ALL", "PENDING", "ISSUED", "APPLIED", "CANCELLED"];

function fDate(value?: string) {
  if (!value) return "-";
  try { return format(new Date(value), "dd MMM yyyy, HH:mm"); } catch { return value; }
}

function fCurrency(value: number) {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 }).format(value);
}

function CreditBadge({ status }: { status: string }) {
  return <Badge className={`border px-2 py-0.5 text-[9px] font-bold uppercase ${STATUS_COLORS[status] ?? STATUS_COLORS.CANCELLED}`}>{status}</Badge>;
}

export default function CreditNotesPage() {
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [supportScope, setSupportScope] = useState<SupportAccessSelection | null>(null);
  const [issueOpen, setIssueOpen] = useState(false);
  const [statusTarget, setStatusTarget] = useState<CreditNote | null>(null);
  const scope = { organizationId: supportScope?.organizationId, supportReason: supportScope?.reason, accessRequestId: supportScope?.accessRequestId };
  const query = useCreditNotes({ ...scope, status: statusFilter === "ALL" ? undefined : statusFilter });
  const invoicesQuery = useBillingInvoices({ ...scope, limit: 500 });
  const issueMutation = useIssueCreditNote(scope);
  const statusMutation = useCreditNoteStatusMutation(scope);
  const notes = query.data?.pages.flatMap((page) => page.items) ?? [];
  const invoices = invoicesQuery.data?.pages.flatMap((page) => page.items) ?? [];

  const execute = async (operation: () => Promise<unknown>, success: string, close: () => void) => {
    try { await operation(); toast.success(success); close(); } catch (error) { toast.error(error instanceof Error ? error.message : "Credit-note operation failed"); }
  };
  const totalAmount = notes.reduce((sum, note) => sum + Number(note.amount_inr), 0);
  const metrics = [
    { label: "Total notes", value: notes.length, icon: FileText },
    { label: "Credit amount", value: fCurrency(totalAmount), icon: IndianRupee },
    { label: "Pending approval", value: notes.filter((note) => note.status === "PENDING").length, icon: FileText },
    { label: "Applied", value: notes.filter((note) => note.status === "APPLIED").length, icon: FileText },
  ];

  return (
    <PageContainer>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <SectionHeader title="Credit Notes" description="Versioned, reconciled credit decisions issued against tenant-owned invoices" />
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => void query.refetch()} disabled={query.isLoading || !supportScope} className="gap-2"><RefreshCw className={`size-3.5 ${query.isLoading ? "animate-spin" : ""}`} />Refresh</Button>
          <Button size="sm" disabled={!supportScope} onClick={() => setIssueOpen(true)} className="gap-2"><Plus className="size-3.5" />Create credit note</Button>
        </div>
      </div>
      <SupportAccessScope value={supportScope} onApply={setSupportScope} />
      {supportScope ? <MetricRow metrics={metrics} /> : null}
      <div className="my-5 flex flex-wrap gap-2">{FILTER_OPTIONS.map((status) => <button key={status} onClick={() => setStatusFilter(status)} className={`rounded-lg border px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider ${statusFilter === status ? "border-[var(--brand-primary)] bg-[var(--brand-primary)] text-[var(--primary-foreground)]" : "border-[var(--border-default)] bg-[var(--bg-surface)] text-[var(--text-secondary)]"}`}>{status}</button>)}</div>

      {!supportScope ? <EmptyState title="Select a support scope" description="Choose one organization and provide an access reason before viewing credit notes." className="py-16" /> : query.isLoading ? <TableSkeleton rows={8} cols={9} /> : !notes.length ? <EmptyState title="No credit notes" description="No credit notes match the current tenant and status filter." className="py-16" /> : (
        <div className="overflow-hidden rounded-2xl border border-[var(--border-default)]"><div className="overflow-auto"><table className="w-full text-left text-xs"><thead><tr className="border-b border-[var(--border-default)] bg-[var(--bg-surface-2)]">{["Credit note", "Source invoice", "Amount", "GST", "Status", "Applied invoice", "Updated", "Version", "Actions"].map((header) => <th key={header} className="h-10 whitespace-nowrap px-4 text-[10px] font-bold uppercase tracking-widest text-[var(--text-tertiary)]">{header}</th>)}</tr></thead><tbody>{notes.map((note) => (
          <tr key={note.id} className="border-b border-[var(--border-subtle)] hover:bg-[var(--bg-surface-2)]">
            <td className="px-4 py-3 font-mono font-semibold text-[var(--brand-primary)]">{note.credit_note_number}</td>
            <td className="px-4 py-3 font-mono text-[10px] text-[var(--text-tertiary)]">{note.invoice_id.slice(0, 8)}...</td>
            <td className="px-4 py-3 font-mono font-bold text-green-400">{fCurrency(Number(note.amount_inr))}</td>
            <td className="px-4 py-3 font-mono text-[var(--text-secondary)]">{fCurrency(Number(note.gst_amount))}</td>
            <td className="px-4 py-3"><CreditBadge status={note.status} /></td>
            <td className="px-4 py-3 font-mono text-[10px] text-[var(--text-tertiary)]">{note.applied_to_invoice_id ? `${note.applied_to_invoice_id.slice(0, 8)}...` : "-"}</td>
            <td className="px-4 py-3 text-[var(--text-secondary)]">{fDate(note.updated_at ?? note.created_at)}</td>
            <td className="px-4 py-3 font-mono text-[var(--text-tertiary)]">v{note.version}</td>
            <td className="px-4 py-3">{(STATUS_TRANSITIONS[note.status] ?? []).length ? <Button variant="outline" size="sm" onClick={() => setStatusTarget(note)}>Change status</Button> : null}</td>
          </tr>
        ))}</tbody></table></div></div>
      )}
      {query.hasNextPage ? <div className="mt-4 flex justify-center"><Button variant="outline" size="sm" disabled={query.isFetchingNextPage} onClick={() => void query.fetchNextPage()}>{query.isFetchingNextPage ? "Loading..." : "Load more"}</Button></div> : null}

      <CreditNoteIssueDialog open={issueOpen} onOpenChange={setIssueOpen} pending={issueMutation.isPending} invoices={invoices} onSubmit={(payload, idempotencyKey) => execute(() => issueMutation.mutateAsync({ payload, idempotencyKey }), "Pending credit note created", () => setIssueOpen(false))} />
      {statusTarget ? <BillingStatusDialog open onOpenChange={(open) => !open && setStatusTarget(null)} pending={statusMutation.isPending} title="Update credit-note status" description="Approval, application, and cancellation are version checked and written to both financial and security audit trails." currentVersion={statusTarget.version} statusOptions={STATUS_TRANSITIONS[statusTarget.status] ?? []} invoices={invoices.filter((invoice) => invoice.id !== statusTarget.invoice_id)} onSubmit={(payload, idempotencyKey) => execute(() => statusMutation.mutateAsync({ creditNoteId: statusTarget.id, payload, idempotencyKey }), "Credit-note status updated", () => setStatusTarget(null))} /> : null}
    </PageContainer>
  );
}
