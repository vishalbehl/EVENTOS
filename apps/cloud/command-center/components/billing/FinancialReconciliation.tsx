"use client";

import { useEffect, useState } from "react";
import { format } from "date-fns";
import { AlertTriangle, CheckCircle2, FileText, Link2, ReceiptText } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import {
  type BillingInvoice,
  type BillingSupportParams,
  type CommercialPayment,
  useBillingInvoiceDetail,
} from "@/hooks/useBilling";

function money(value: number, currency = "INR") {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency }).format(Number(value));
}

function dateTime(value?: string) {
  return value ? format(new Date(value), "dd MMM yyyy, HH:mm") : "-";
}

function invoiceLabel(invoice: BillingInvoice) {
  return invoice.invoice_number ?? `INV-${invoice.id.slice(0, 8).toUpperCase()}`;
}

export function InvoicePaymentDialog({
  invoice,
  open,
  pending,
  onOpenChange,
  onSubmit,
}: {
  invoice: BillingInvoice | null;
  open: boolean;
  pending?: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (payload: Record<string, unknown>, idempotencyKey: string) => Promise<void>;
}) {
  const [amount, setAmount] = useState("");
  const [provider, setProvider] = useState("OFFLINE");
  const [providerReference, setProviderReference] = useState("");
  const [providerEvent, setProviderEvent] = useState("");
  const [reason, setReason] = useState("");
  const [idempotencyKey, setIdempotencyKey] = useState(() => crypto.randomUUID());
  useEffect(() => {
    if (!open || !invoice) return;
    setAmount(String(Number(invoice.total_amount_inr || invoice.amount)));
    setProvider("OFFLINE");
    setProviderReference("");
    setProviderEvent("");
    setReason("");
    setIdempotencyKey(crypto.randomUUID());
  }, [invoice, open]);
  const valid = !!invoice && Number(amount) > 0 && reason.trim().length >= 12
    && (provider === "OFFLINE" || providerReference.trim().length >= 3);
  return <Dialog open={open} onOpenChange={(next) => !pending && onOpenChange(next)}><DialogContent className="border-[var(--border-default)] bg-[var(--bg-surface)] sm:max-w-xl"><DialogHeader><DialogTitle>Record commercial payment</DialogTitle><DialogDescription>Record a provider or verified offline settlement against {invoice ? invoiceLabel(invoice) : "the selected invoice"}. Recording does not settle the invoice until reconciliation.</DialogDescription></DialogHeader><div className="grid gap-4 py-2 sm:grid-cols-2"><div className="space-y-1.5"><Label htmlFor="payment-amount">Amount</Label><Input id="payment-amount" type="number" min="0.01" step="0.01" value={amount} onChange={(event) => setAmount(event.target.value)} /></div><div className="space-y-1.5"><Label htmlFor="payment-provider">Provider</Label><select id="payment-provider" value={provider} onChange={(event) => setProvider(event.target.value)} className="h-10 w-full rounded-md border border-[var(--border-default)] bg-[var(--bg-surface-2)] px-3 text-sm">{["OFFLINE", "STRIPE", "RAZORPAY", "PAYU", "CCAVENUE", "PAYTM", "OTHER"].map((value) => <option key={value}>{value}</option>)}</select></div>{provider !== "OFFLINE" ? <><div className="space-y-1.5"><Label htmlFor="payment-provider-ref">Provider transaction ID</Label><Input id="payment-provider-ref" value={providerReference} onChange={(event) => setProviderReference(event.target.value)} /></div><div className="space-y-1.5"><Label htmlFor="payment-provider-event">Provider event ID</Label><Input id="payment-provider-event" value={providerEvent} onChange={(event) => setProviderEvent(event.target.value)} /></div></> : null}<div className="space-y-1.5 sm:col-span-2"><Label htmlFor="payment-reason">Evidence and reason</Label><Textarea id="payment-reason" value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Reference the bank statement, verified provider event, or approved finance evidence" /></div></div><DialogFooter><Button variant="outline" disabled={pending} onClick={() => onOpenChange(false)}>Cancel</Button><Button disabled={!valid || pending} onClick={() => void onSubmit({ amount, currency: invoice?.currency ?? "INR", provider, provider_transaction_id: providerReference.trim() || null, provider_event_id: providerEvent.trim() || null, status: "SUCCEEDED", reason: reason.trim() }, idempotencyKey)}>{pending ? "Recording..." : "Record payment"}</Button></DialogFooter></DialogContent></Dialog>;
}

export function PaymentReconcileDialog({
  payment,
  open,
  pending,
  onOpenChange,
  onSubmit,
}: {
  payment: CommercialPayment | null;
  open: boolean;
  pending?: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (payload: Record<string, unknown>, idempotencyKey: string) => Promise<void>;
}) {
  const [decision, setDecision] = useState("RECONCILED");
  const [reason, setReason] = useState("");
  const [idempotencyKey, setIdempotencyKey] = useState(() => crypto.randomUUID());
  useEffect(() => {
    if (!open) return;
    setDecision(payment?.reconciliation_status === "RECONCILED" ? "REVERSED" : "RECONCILED");
    setReason("");
    setIdempotencyKey(crypto.randomUUID());
  }, [open, payment]);
  return <Dialog open={open} onOpenChange={(next) => !pending && onOpenChange(next)}><DialogContent className="border-[var(--border-default)] bg-[var(--bg-surface)] sm:max-w-lg"><DialogHeader><DialogTitle>Reconcile payment</DialogTitle><DialogDescription>This versioned decision may settle or reopen the linked invoice and is written to both financial and security audit trails.</DialogDescription></DialogHeader><div className="space-y-4 py-2"><div className="space-y-1.5"><Label htmlFor="reconciliation-decision">Decision</Label><select id="reconciliation-decision" value={decision} onChange={(event) => setDecision(event.target.value)} className="h-10 w-full rounded-md border border-[var(--border-default)] bg-[var(--bg-surface-2)] px-3 text-sm">{payment?.reconciliation_status === "RECONCILED" ? <option value="REVERSED">Reverse reconciliation</option> : <><option value="RECONCILED">Confirm match</option><option value="MISMATCH">Mark mismatch</option></>}</select></div><div className="space-y-1.5"><Label htmlFor="reconciliation-reason">Decision evidence</Label><Textarea id="reconciliation-reason" value={reason} onChange={(event) => setReason(event.target.value)} /></div></div><DialogFooter><Button variant="outline" disabled={pending} onClick={() => onOpenChange(false)}>Cancel</Button><Button disabled={!payment || reason.trim().length < 12 || pending} onClick={() => void onSubmit({ version: payment?.version, reconciliation_status: decision, reason: reason.trim() }, idempotencyKey)}>{pending ? "Applying..." : "Apply decision"}</Button></DialogFooter></DialogContent></Dialog>;
}

export function InvoiceDetailSheet({ invoiceId, scope, onOpenChange }: { invoiceId: string | null; scope: BillingSupportParams; onOpenChange: (open: boolean) => void }) {
  const query = useBillingInvoiceDetail(invoiceId, scope);
  const data = query.data;
  return <Sheet open={!!invoiceId} onOpenChange={onOpenChange}><SheetContent className="max-w-3xl bg-[#07090d]"><div className="border-b border-white/10 p-5 pr-14"><SheetHeader><div className="mb-2 flex items-center gap-2"><ReceiptText className="size-4 text-cyan-400" /><Badge className="border-cyan-400/20 bg-cyan-400/10 text-cyan-300">Commercial ledger</Badge></div><SheetTitle>{data ? invoiceLabel(data.invoice) : "Invoice reconciliation"}</SheetTitle><SheetDescription>Line items, commercial payments, reconciliation evidence, and outstanding balance.</SheetDescription></SheetHeader></div><ScrollArea className="flex-1"><div className="space-y-4 p-5">{query.isLoading ? <p className="py-20 text-center text-sm text-white/45">Loading invoice evidence...</p> : null}{query.isError ? <div className="rounded-xl border border-red-400/20 bg-red-400/10 p-4 text-sm text-red-200">{query.error instanceof Error ? query.error.message : "Unable to inspect invoice"}</div> : null}{data ? <><div className="grid grid-cols-2 gap-3 md:grid-cols-4">{[["Status", data.invoice.status], ["Reconciliation", data.reconciliation_status], ["Total", money(data.invoice.total_amount_inr, data.invoice.currency)], ["Outstanding", money(data.outstanding_amount, data.invoice.currency)]].map(([label, value]) => <div key={label} className="rounded-xl border border-white/10 bg-white/[0.035] p-3"><p className="text-[9px] font-bold uppercase tracking-widest text-white/35">{label}</p><p className="mt-1 text-sm font-semibold text-white">{value}</p></div>)}</div><section className="rounded-xl border border-white/10 bg-white/[0.035] p-4"><h3 className="mb-3 text-[10px] font-bold uppercase tracking-widest text-white/45">Invoice items</h3>{data.items.length ? <div className="space-y-2">{data.items.map((item) => <div key={item.id} className="flex items-center justify-between rounded-lg bg-black/25 p-3"><div className="flex items-center gap-2"><FileText className="size-3.5 text-white/40" /><span className="text-xs text-white/80">{item.description} x {item.quantity}</span></div><span className="font-mono text-xs text-white">{money(item.amount * item.quantity, data.invoice.currency)}</span></div>)}</div> : <p className="text-xs text-white/40">No line items recorded.</p>}</section><section className="rounded-xl border border-white/10 bg-white/[0.035] p-4"><h3 className="mb-3 text-[10px] font-bold uppercase tracking-widest text-white/45">Payment evidence</h3>{data.payments.length ? <div className="space-y-2">{data.payments.map((payment) => <div key={payment.id} className="rounded-lg bg-black/25 p-3"><div className="flex items-start justify-between gap-3"><div className="flex gap-2">{payment.reconciliation_status === "RECONCILED" ? <CheckCircle2 className="mt-0.5 size-3.5 text-green-400" /> : <AlertTriangle className="mt-0.5 size-3.5 text-amber-400" />}<div><p className="font-mono text-xs text-white">{payment.provider_transaction_id ?? payment.id}</p><p className="mt-1 text-[10px] text-white/35">{payment.provider} / {dateTime(payment.created_at)}</p></div></div><div className="text-right"><p className="font-mono text-xs text-white">{money(payment.amount, payment.currency)}</p><p className="mt-1 text-[9px] uppercase text-white/40">{payment.reconciliation_status}</p></div></div></div>)}</div> : <p className="text-xs text-white/40">No commercial payments recorded.</p>}</section><div className="flex items-center gap-2 rounded-xl border border-white/10 p-4 text-[10px] text-white/40"><Link2 className="size-3.5" />Invoice v{data.invoice.version}. Sensitive reads are tenant-scoped and audited.</div></> : null}</div></ScrollArea></SheetContent></Sheet>;
}
