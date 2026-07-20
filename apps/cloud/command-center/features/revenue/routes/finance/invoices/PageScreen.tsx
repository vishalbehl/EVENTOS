"use client";

import { useState } from "react";
import { format } from "date-fns";
import { CircleDollarSign, Download, FileCheck2, FileText, Loader2, Plus, RefreshCw, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { BillingStatusDialog } from "@/components/billing/BillingLifecycleDialogs";
import { InvoiceDetailSheet, InvoicePaymentDialog } from "@/components/billing/FinancialReconciliation";
import { EmptyState } from "@/components/super-admin/ui/EmptyState";
import { TableSkeleton } from "@/components/super-admin/ui/LoadingSkeleton";
import { MetricRow } from "@/components/super-admin/ui/MetricRow";
import { PageContainer } from "@/components/super-admin/ui/PageContainer";
import { SectionHeader } from "@/components/super-admin/ui/SectionHeader";
import { SupportAccessScope, type SupportAccessSelection } from "@/components/super-admin/ui/SupportAccessScope";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  type BillingInvoice,
  downloadInvoiceArtifact,
  useBillingInvoices,
  useCreateInvoiceArtifact,
  useInvoiceArtifact,
  useInvoiceStatusMutation,
  useRecordInvoicePayment,
} from "@/hooks/useBilling";

const FILTERS = ["ALL", "UNPAID", "PENDING", "OVERDUE", "PAID", "VOID", "REFUNDED"];
const STATUS_COLORS: Record<string, string> = {
  PAID: "border-green-500/20 bg-green-500/10 text-green-400",
  UNPAID: "border-amber-500/20 bg-amber-500/10 text-amber-300",
  PENDING: "border-amber-500/20 bg-amber-500/10 text-amber-300",
  OVERDUE: "border-red-500/20 bg-red-500/10 text-red-300",
  VOID: "border-zinc-500/20 bg-zinc-500/10 text-zinc-400",
  REFUNDED: "border-blue-500/20 bg-blue-500/10 text-blue-300",
};

function money(value: number, currency = "INR") {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency }).format(Number(value));
}

function date(value?: string) {
  return value ? format(new Date(value), "dd MMM yyyy") : "-";
}

function label(invoice: BillingInvoice) {
  return invoice.invoice_number ?? `INV-${invoice.id.slice(0, 8).toUpperCase()}`;
}

export default function InvoicesPage() {
  const [supportScope, setSupportScope] = useState<SupportAccessSelection | null>(null);
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [inspectionId, setInspectionId] = useState<string | null>(null);
  const [paymentTarget, setPaymentTarget] = useState<BillingInvoice | null>(null);
  const [voidTarget, setVoidTarget] = useState<BillingInvoice | null>(null);
  const [artifactTarget, setArtifactTarget] = useState<BillingInvoice | null>(null);
  const [artifactReason, setArtifactReason] = useState("");
  const [activeArtifact, setActiveArtifact] = useState<{ invoiceId: string; exportId: string } | null>(null);
  const [downloadingArtifact, setDownloadingArtifact] = useState(false);
  const scope = { organizationId: supportScope?.organizationId, supportReason: supportScope?.reason, accessRequestId: supportScope?.accessRequestId };
  const query = useBillingInvoices({ ...scope, status: statusFilter === "ALL" ? undefined : statusFilter });
  const paymentMutation = useRecordInvoicePayment(scope);
  const statusMutation = useInvoiceStatusMutation(scope);
  const artifactMutation = useCreateInvoiceArtifact(scope);
  const artifactQuery = useInvoiceArtifact(activeArtifact?.invoiceId ?? null, activeArtifact?.exportId ?? null, scope);
  const invoices = query.data?.pages.flatMap((page) => page.items) ?? [];
  const total = invoices.reduce((sum, invoice) => sum + Number(invoice.total_amount_inr || invoice.amount), 0);
  const paid = invoices.filter((invoice) => invoice.status === "PAID").reduce((sum, invoice) => sum + Number(invoice.total_amount_inr || invoice.amount), 0);
  const outstanding = invoices.filter((invoice) => ["UNPAID", "PENDING", "OVERDUE"].includes(invoice.status)).reduce((sum, invoice) => sum + Number(invoice.total_amount_inr || invoice.amount), 0);
  const metrics = [
    { label: "Invoices", value: invoices.length, icon: FileText },
    { label: "Ledger value", value: money(total), icon: CircleDollarSign },
    { label: "Paid", value: money(paid), icon: FileCheck2 },
    { label: "Outstanding", value: money(outstanding), icon: TriangleAlert },
  ];

  const execute = async (operation: () => Promise<unknown>, success: string, close: () => void) => {
    try { await operation(); toast.success(success); close(); } catch (error) { toast.error(error instanceof Error ? error.message : "Invoice operation failed"); }
  };

  return <PageContainer>
    <div className="mb-6 flex flex-wrap items-start justify-between gap-3"><SectionHeader title="Invoice Reconciliation" description="Tenant-scoped commercial invoices, settlement evidence, and versioned finance controls" /><Button variant="outline" size="sm" disabled={!supportScope || query.isLoading} onClick={() => void query.refetch()} className="gap-2"><RefreshCw className={`size-3.5 ${query.isLoading ? "animate-spin" : ""}`} />Refresh</Button></div>
    <SupportAccessScope value={supportScope} onApply={setSupportScope} />
    {activeArtifact && artifactQuery.data ? <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface-2)] px-4 py-3"><div><p className="text-xs font-bold uppercase tracking-wider text-[var(--text-tertiary)]">Invoice PDF</p><p className="mt-1 text-sm text-[var(--text-primary)]">Artifact {artifactQuery.data.status.toLowerCase()}{artifactQuery.data.failure_reason ? `: ${artifactQuery.data.failure_reason}` : ""}</p></div>{artifactQuery.data.status === "COMPLETED" ? <Button variant="outline" size="sm" disabled={downloadingArtifact} className="gap-2" onClick={async () => { setDownloadingArtifact(true); try { const result = await downloadInvoiceArtifact(activeArtifact.invoiceId, activeArtifact.exportId, scope); window.open(result.download_url, "_blank", "noopener,noreferrer"); } catch (error) { toast.error(error instanceof Error ? error.message : "Invoice download failed"); } finally { setDownloadingArtifact(false); } }}>{downloadingArtifact ? <Loader2 className="size-3.5 animate-spin" /> : <Download className="size-3.5" />}Download PDF</Button> : <Loader2 className="size-4 animate-spin text-[var(--brand-primary)]" aria-label="Invoice PDF processing" />}</div> : null}
    {supportScope ? <MetricRow metrics={metrics} /> : null}
    <div className="my-5 flex flex-wrap gap-2">{FILTERS.map((status) => <button key={status} onClick={() => setStatusFilter(status)} className={`rounded-lg border px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider ${statusFilter === status ? "border-[var(--brand-primary)] bg-[var(--brand-primary)] text-[var(--primary-foreground)]" : "border-[var(--border-default)] bg-[var(--bg-surface)] text-[var(--text-secondary)]"}`}>{status}</button>)}</div>
    {!supportScope ? <EmptyState title="Select a support scope" description="Choose one organization and record the support reason before viewing its financial ledger." className="py-16" /> : query.isLoading ? <TableSkeleton rows={8} cols={9} /> : !invoices.length ? <EmptyState title="No invoices" description="No invoices match this tenant and lifecycle filter." className="py-16" /> : <div className="overflow-hidden rounded-2xl border border-[var(--border-default)]"><div className="overflow-auto"><table className="w-full text-left text-xs"><thead><tr className="border-b border-[var(--border-default)] bg-[var(--bg-surface-2)]">{["Invoice", "Base", "GST", "Total", "Status", "Issued", "Due", "Version", "Actions"].map((header) => <th key={header} className="h-10 whitespace-nowrap px-4 text-[10px] font-bold uppercase tracking-widest text-[var(--text-tertiary)]">{header}</th>)}</tr></thead><tbody>{invoices.map((invoice) => <tr key={invoice.id} className="border-b border-[var(--border-subtle)] hover:bg-[var(--bg-surface-2)]"><td className="px-4 py-3"><button className="font-mono font-bold text-[var(--brand-primary)] hover:underline" onClick={() => setInspectionId(invoice.id)}>{label(invoice)}</button><p className="mt-0.5 font-mono text-[9px] text-[var(--text-tertiary)]">{invoice.id}</p></td><td className="px-4 py-3 font-mono text-[var(--text-secondary)]">{money(invoice.amount, invoice.currency)}</td><td className="px-4 py-3 font-mono text-[var(--text-secondary)]">{money(invoice.gst_amount, invoice.currency)}</td><td className="px-4 py-3 font-mono font-bold text-[var(--text-primary)]">{money(invoice.total_amount_inr || Number(invoice.amount) + Number(invoice.gst_amount), invoice.currency)}</td><td className="px-4 py-3"><Badge className={`border ${STATUS_COLORS[invoice.status] ?? STATUS_COLORS.UNPAID}`}>{invoice.status}</Badge></td><td className="px-4 py-3 text-[var(--text-secondary)]">{date(invoice.issued_at)}</td><td className="px-4 py-3 text-[var(--text-secondary)]">{date(invoice.due_date)}</td><td className="px-4 py-3 font-mono text-[var(--text-tertiary)]">v{invoice.version}</td><td className="px-4 py-3"><div className="flex gap-2"><Button variant="outline" size="sm" onClick={() => setInspectionId(invoice.id)}>Inspect</Button><Button variant="outline" size="sm" onClick={() => { setArtifactTarget(invoice); setArtifactReason(""); }}>PDF</Button>{!["VOID", "REFUNDED"].includes(invoice.status) ? <Button variant="outline" size="sm" className="gap-1" onClick={() => setPaymentTarget(invoice)}><Plus className="size-3" />Payment</Button> : null}{["UNPAID", "PENDING", "OVERDUE", "DRAFT"].includes(invoice.status) ? <Button variant="outline" size="sm" onClick={() => setVoidTarget(invoice)}>Void</Button> : null}</div></td></tr>)}</tbody></table></div></div>}
    {query.hasNextPage ? <div className="mt-4 flex justify-center"><Button variant="outline" size="sm" disabled={query.isFetchingNextPage} onClick={() => void query.fetchNextPage()}>{query.isFetchingNextPage ? "Loading..." : "Load more"}</Button></div> : null}
    <InvoiceDetailSheet invoiceId={inspectionId} scope={scope} onOpenChange={(open) => !open && setInspectionId(null)} />
    <InvoicePaymentDialog invoice={paymentTarget} open={!!paymentTarget} pending={paymentMutation.isPending} onOpenChange={(open) => !open && setPaymentTarget(null)} onSubmit={(payload, idempotencyKey) => execute(() => paymentMutation.mutateAsync({ invoiceId: paymentTarget!.id, payload, idempotencyKey }), "Payment evidence recorded", () => setPaymentTarget(null))} />
    {voidTarget ? <BillingStatusDialog open onOpenChange={(open) => !open && setVoidTarget(null)} pending={statusMutation.isPending} title="Void invoice" description="Voiding is blocked when the invoice is settled or has reconciled payments. The decision is version checked and audited." currentVersion={voidTarget.version} statusOptions={["VOID"]} onSubmit={(payload, idempotencyKey) => execute(() => statusMutation.mutateAsync({ invoiceId: voidTarget.id, payload, idempotencyKey }), "Invoice voided", () => setVoidTarget(null))} /> : null}
    <Dialog open={Boolean(artifactTarget)} onOpenChange={(open) => !open && setArtifactTarget(null)}><DialogContent><DialogHeader><DialogTitle>Generate invoice PDF</DialogTitle><DialogDescription>The worker will render a version-bound invoice snapshot and store it in the private exports bucket. Downloads are short-lived and audited.</DialogDescription></DialogHeader><div className="py-2"><Label htmlFor="invoice-pdf-reason">Generation reason</Label><Textarea id="invoice-pdf-reason" className="mt-1" minLength={12} value={artifactReason} onChange={(event) => setArtifactReason(event.target.value)} /></div><DialogFooter><Button variant="outline" onClick={() => setArtifactTarget(null)}>Cancel</Button><Button disabled={!artifactTarget || artifactReason.trim().length < 12 || artifactMutation.isPending} onClick={async () => { if (!artifactTarget) return; try { const result = await artifactMutation.mutateAsync({ invoiceId: artifactTarget.id, version: artifactTarget.version, reason: artifactReason.trim(), idempotencyKey: crypto.randomUUID() }); setActiveArtifact({ invoiceId: artifactTarget.id, exportId: result.export_id }); setArtifactTarget(null); toast.success("Invoice PDF queued"); } catch (error) { toast.error(error instanceof Error ? error.message : "Invoice PDF request failed"); } }}>{artifactMutation.isPending ? "Queueing..." : "Generate PDF"}</Button></DialogFooter></DialogContent></Dialog>
  </PageContainer>;
}
