"use client";

import { useState } from "react";
import { format } from "date-fns";
import { AlertTriangle, CheckCircle2, CircleDollarSign, RefreshCw, RotateCcw, Undo2 } from "lucide-react";
import { toast } from "sonner";
import { PaymentReconcileDialog } from "@/components/billing/FinancialReconciliation";
import { EmptyState } from "@/components/super-admin/ui/EmptyState";
import { TableSkeleton } from "@/components/super-admin/ui/LoadingSkeleton";
import { MetricRow } from "@/components/super-admin/ui/MetricRow";
import { PageContainer } from "@/components/super-admin/ui/PageContainer";
import { SectionHeader } from "@/components/super-admin/ui/SectionHeader";
import { SupportAccessScope, type SupportAccessSelection } from "@/components/super-admin/ui/SupportAccessScope";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  type CommercialPayment,
  useCommercialPayments,
  useReconcileCommercialPayment,
  useRefundCommercialPayment,
} from "@/hooks/useBilling";

const FILTERS = ["ALL", "PENDING", "RECONCILED", "MISMATCH", "REVERSED"];
const RECONCILIATION_COLORS: Record<string, string> = {
  RECONCILED: "border-green-500/20 bg-green-500/10 text-green-400",
  PENDING: "border-amber-500/20 bg-amber-500/10 text-amber-300",
  MISMATCH: "border-red-500/20 bg-red-500/10 text-red-300",
  REVERSED: "border-blue-500/20 bg-blue-500/10 text-blue-300",
};

function money(value: number, currency: string) {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency }).format(Number(value));
}

function dateTime(value: string) {
  return format(new Date(value), "dd MMM yyyy, HH:mm");
}

export default function PaymentsPage() {
  const [supportScope, setSupportScope] = useState<SupportAccessSelection | null>(null);
  const [reconciliationFilter, setReconciliationFilter] = useState("ALL");
  const [target, setTarget] = useState<CommercialPayment | null>(null);
  const [refundTarget, setRefundTarget] = useState<CommercialPayment | null>(null);
  const [refundAmount, setRefundAmount] = useState("");
  const [refundReference, setRefundReference] = useState("");
  const [refundReason, setRefundReason] = useState("");
  const scope = { organizationId: supportScope?.organizationId, supportReason: supportScope?.reason, accessRequestId: supportScope?.accessRequestId };
  const query = useCommercialPayments({ ...scope, reconciliationStatus: reconciliationFilter === "ALL" ? undefined : reconciliationFilter });
  const mutation = useReconcileCommercialPayment(scope);
  const refundMutation = useRefundCommercialPayment(scope);
  const payments = query.data?.pages.flatMap((page) => page.items) ?? [];
  const metrics = [
    { label: "Payments", value: payments.length, icon: CircleDollarSign },
    { label: "Recorded value", value: money(payments.reduce((sum, payment) => sum + Number(payment.amount), 0), "INR"), icon: CircleDollarSign },
    { label: "Reconciled", value: payments.filter((payment) => payment.reconciliation_status === "RECONCILED").length, icon: CheckCircle2 },
    { label: "Needs review", value: payments.filter((payment) => ["PENDING", "MISMATCH"].includes(payment.reconciliation_status)).length, icon: AlertTriangle },
  ];

  const submit = async (payload: Record<string, unknown>, idempotencyKey: string) => {
    if (!target) return;
    try {
      await mutation.mutateAsync({ paymentId: target.id, payload, idempotencyKey });
      toast.success("Reconciliation decision applied");
      setTarget(null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Reconciliation failed");
    }
  };

  return <PageContainer>
    <div className="mb-6 flex flex-wrap items-start justify-between gap-3"><SectionHeader title="Commercial Payment Ledger" description="Provider and offline invoice payments with explicit matching, mismatch, and reversal decisions" /><Button variant="outline" size="sm" disabled={!supportScope || query.isLoading} onClick={() => void query.refetch()} className="gap-2"><RefreshCw className={`size-3.5 ${query.isLoading ? "animate-spin" : ""}`} />Refresh</Button></div>
    <SupportAccessScope value={supportScope} onApply={setSupportScope} />
    {supportScope ? <MetricRow metrics={metrics} /> : null}
    <div className="my-5 flex flex-wrap gap-2">{FILTERS.map((status) => <button key={status} onClick={() => setReconciliationFilter(status)} className={`rounded-lg border px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider ${reconciliationFilter === status ? "border-[var(--brand-primary)] bg-[var(--brand-primary)] text-white" : "border-[var(--border-default)] bg-[var(--bg-surface)] text-[var(--text-secondary)]"}`}>{status}</button>)}</div>
    {!supportScope ? <EmptyState title="Select a support scope" description="Choose one organization before viewing or reconciling its commercial payments." className="py-16" /> : query.isLoading ? <TableSkeleton rows={8} cols={9} /> : !payments.length ? <EmptyState title="No commercial payments" description="Payments recorded against organization invoices will appear here." className="py-16" /> : <div className="overflow-hidden rounded-2xl border border-[var(--border-default)]"><div className="overflow-auto"><table className="w-full text-left text-xs"><thead><tr className="border-b border-[var(--border-default)] bg-[var(--bg-surface-2)]">{["Payment", "Invoice", "Amount", "Provider", "Provider reference", "Payment status", "Reconciliation", "Version", "Actions"].map((header) => <th key={header} className="h-10 whitespace-nowrap px-4 text-[10px] font-bold uppercase tracking-widest text-[var(--text-tertiary)]">{header}</th>)}</tr></thead><tbody>{payments.map((payment) => <tr key={payment.id} className="border-b border-[var(--border-subtle)] hover:bg-[var(--bg-surface-2)]"><td className="px-4 py-3"><p className="font-mono text-[10px] text-[var(--text-primary)]">{payment.id.slice(0, 8)}...</p><p className="mt-0.5 text-[9px] text-[var(--text-tertiary)]">{dateTime(payment.created_at)}</p></td><td className="px-4 py-3 font-mono text-[10px] text-[var(--text-secondary)]">{payment.invoice_id ? `${payment.invoice_id.slice(0, 8)}...` : "Unlinked"}</td><td className="px-4 py-3 font-mono font-bold text-[var(--text-primary)]">{money(payment.amount, payment.currency)}</td><td className="px-4 py-3"><Badge className="border-[var(--border-default)] bg-[var(--bg-surface-2)] text-[var(--text-secondary)]">{payment.provider}</Badge></td><td className="max-w-48 truncate px-4 py-3 font-mono text-[10px] text-[var(--text-secondary)]">{payment.provider_transaction_id ?? "Offline evidence"}</td><td className="px-4 py-3 text-[var(--text-secondary)]">{payment.status}</td><td className="px-4 py-3"><Badge className={`border ${RECONCILIATION_COLORS[payment.reconciliation_status] ?? RECONCILIATION_COLORS.PENDING}`}>{payment.reconciliation_status}</Badge></td><td className="px-4 py-3 font-mono text-[var(--text-tertiary)]">v{payment.version}</td><td className="px-4 py-3"><div className="flex gap-1"><Button variant="outline" size="sm" className="gap-1" disabled={payment.status === "FAILED" || payment.reconciliation_status === "REVERSED" || Boolean(payment.parent_transaction_id)} onClick={() => setTarget(payment)}>{payment.reconciliation_status === "RECONCILED" ? <RotateCcw className="size-3" /> : <CheckCircle2 className="size-3" />}{payment.reconciliation_status === "RECONCILED" ? "Reverse" : "Review"}</Button>{payment.reconciliation_status === "RECONCILED" && !payment.parent_transaction_id && !["REFUNDED"].includes(payment.status) ? <Button variant="outline" size="sm" className="gap-1 text-amber-300" onClick={() => { setRefundTarget(payment); setRefundAmount(String(Number(payment.amount) - Number(payment.refunded_amount || 0))); setRefundReference(""); setRefundReason(""); }}><Undo2 className="size-3" />Refund</Button> : null}</div></td></tr>)}</tbody></table></div></div>}
    {query.hasNextPage ? <div className="mt-4 flex justify-center"><Button variant="outline" size="sm" disabled={query.isFetchingNextPage} onClick={() => void query.fetchNextPage()}>{query.isFetchingNextPage ? "Loading..." : "Load more"}</Button></div> : null}
    <PaymentReconcileDialog payment={target} open={!!target} pending={mutation.isPending} onOpenChange={(open) => !open && setTarget(null)} onSubmit={submit} />
    <Dialog open={Boolean(refundTarget)} onOpenChange={(open) => !open && setRefundTarget(null)}><DialogContent><DialogHeader><DialogTitle>Refund commercial payment</DialogTitle><DialogDescription>Creates an auditable refund transaction linked to the original payment. Provider refunds require the verified provider refund reference.</DialogDescription></DialogHeader><div className="grid gap-4 py-2"><div><Label htmlFor="refund-amount">Refund amount</Label><Input id="refund-amount" type="number" min="0.01" step="0.01" value={refundAmount} onChange={(event) => setRefundAmount(event.target.value)} /></div>{refundTarget?.provider !== "OFFLINE" ? <div><Label htmlFor="refund-reference">Provider refund ID</Label><Input id="refund-reference" value={refundReference} onChange={(event) => setRefundReference(event.target.value)} /></div> : null}<div><Label htmlFor="refund-reason">Refund reason and approval evidence</Label><Textarea id="refund-reason" minLength={12} value={refundReason} onChange={(event) => setRefundReason(event.target.value)} /></div></div><DialogFooter><Button variant="outline" onClick={() => setRefundTarget(null)}>Cancel</Button><Button variant="destructive" disabled={!refundTarget || Number(refundAmount) <= 0 || refundReason.trim().length < 12 || (refundTarget.provider !== "OFFLINE" && refundReference.trim().length < 3) || refundMutation.isPending} onClick={async () => { if (!refundTarget) return; try { await refundMutation.mutateAsync({ paymentId: refundTarget.id, idempotencyKey: crypto.randomUUID(), payload: { version: refundTarget.version, amount: refundAmount, provider_refund_id: refundReference.trim() || null, reason: refundReason.trim() } }); toast.success("Refund recorded with payment lineage."); setRefundTarget(null); } catch (error) { toast.error(error instanceof Error ? error.message : "Refund failed"); } }}>{refundMutation.isPending ? "Refunding..." : "Record refund"}</Button></DialogFooter></DialogContent></Dialog>
  </PageContainer>;
}
