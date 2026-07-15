"use client";

import { useEffect, useState } from "react";
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
import { Textarea } from "@/components/ui/textarea";
import type { BillingInvoice, OrgSubscription } from "@/hooks/useBilling";

interface DialogBaseProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pending?: boolean;
}

function SelectField({ id, label, value, options, onChange, disabled }: {
  id: string;
  label: string;
  value: string;
  options: Array<{ value: string; label: string }>;
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <select id={id} value={value} disabled={disabled} onChange={(event) => onChange(event.target.value)} className="h-10 w-full rounded-md border border-[var(--border-default)] bg-[var(--bg-surface-2)] px-3 text-sm">
        <option value="">Select...</option>
        {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
    </div>
  );
}

export function BillingStatusDialog({
  open,
  onOpenChange,
  pending,
  title,
  description,
  currentVersion,
  statusOptions,
  invoices,
  onSubmit,
}: DialogBaseProps & {
  title: string;
  description: string;
  currentVersion: number;
  statusOptions: string[];
  invoices?: BillingInvoice[];
  onSubmit: (payload: Record<string, unknown>, idempotencyKey: string) => Promise<void>;
}) {
  const [status, setStatus] = useState("");
  const [reason, setReason] = useState("");
  const [targetInvoiceId, setTargetInvoiceId] = useState("");
  const [idempotencyKey, setIdempotencyKey] = useState(() => crypto.randomUUID());
  useEffect(() => {
    if (!open) return;
    setStatus("");
    setReason("");
    setTargetInvoiceId("");
    setIdempotencyKey(crypto.randomUUID());
  }, [open]);
  const valid = Boolean(status) && reason.trim().length >= 12 && (status !== "APPLIED" || Boolean(targetInvoiceId.trim()));
  const submit = async () => {
    const payload: Record<string, unknown> = { version: currentVersion, status, reason: reason.trim() };
    if (status === "APPLIED") payload.applied_to_invoice_id = targetInvoiceId.trim();
    await onSubmit(payload, idempotencyKey);
  };
  return (
    <Dialog open={open} onOpenChange={(next) => !pending && onOpenChange(next)}>
      <DialogContent className="border-[var(--border-default)] bg-[var(--bg-surface)] sm:max-w-lg">
        <DialogHeader><DialogTitle>{title}</DialogTitle><DialogDescription>{description}</DialogDescription></DialogHeader>
        <div className="space-y-4 py-2">
          <SelectField id="billing-target-status" label="New status" value={status} options={statusOptions.map((value) => ({ value, label: value.replaceAll("_", " ") }))} onChange={setStatus} disabled={pending} />
          {status === "APPLIED" ? (
            invoices ? <SelectField id="billing-target-invoice" label="Target invoice" value={targetInvoiceId} options={invoices.filter((invoice) => !["VOID", "REFUNDED"].includes(invoice.status)).map((invoice) => ({ value: invoice.id, label: `${invoice.invoice_number ?? invoice.id.slice(0, 8)} - ${invoice.status} - ${invoice.currency} ${Number(invoice.total_amount_inr).toFixed(2)}` }))} onChange={setTargetInvoiceId} />
              : <div className="space-y-1.5"><Label htmlFor="billing-target-invoice">Target invoice ID</Label><Input id="billing-target-invoice" value={targetInvoiceId} onChange={(event) => setTargetInvoiceId(event.target.value)} placeholder="UUID from the selected tenant invoice" /></div>
          ) : null}
          <div className="space-y-1.5"><Label htmlFor="billing-status-reason">Decision reason</Label><Textarea id="billing-status-reason" value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Provide at least 12 characters for immutable audit evidence" /></div>
        </div>
        <DialogFooter><Button variant="outline" disabled={pending} onClick={() => onOpenChange(false)}>Cancel</Button><Button disabled={!valid || pending} onClick={() => void submit()}>{pending ? "Applying..." : "Apply status"}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function GrantIssueDialog({ open, onOpenChange, pending, subscriptions, onSubmit }: DialogBaseProps & {
  subscriptions: OrgSubscription[];
  onSubmit: (payload: Record<string, unknown>, idempotencyKey: string) => Promise<void>;
}) {
  const [values, setValues] = useState<Record<string, string>>({});
  const [idempotencyKey, setIdempotencyKey] = useState(() => crypto.randomUUID());
  useEffect(() => {
    if (!open) return;
    setValues({ grant_type: "EVENT_UNIT", scope_type: "EVENT", consumption_model: "SINGLE_USE", unit_type: "EVENT", source_type: "PLAN", quantity_total: "1", reason: "" });
    setIdempotencyKey(crypto.randomUUID());
  }, [open]);
  const set = (key: string, value: string) => setValues((current) => ({ ...current, [key]: value }));
  const nonConsumable = ["NON_CONSUMABLE", "MANUAL_FULFILLMENT"].includes(values.consumption_model);
  const valid = values.reason?.trim().length >= 12 && Boolean(values.grant_type && values.scope_type && values.consumption_model && values.unit_type && values.source_type) && (values.source_type !== "PLAN" || Boolean(values.subscription_id)) && (nonConsumable || Number(values.quantity_total) >= 1);
  const submit = async () => {
    await onSubmit({
      subscription_id: values.subscription_id || null,
      grant_type: values.grant_type,
      scope_type: values.scope_type,
      consumption_model: values.consumption_model,
      unit_type: values.unit_type,
      source_type: values.source_type,
      source_ref: values.source_ref || null,
      quantity_total: nonConsumable ? null : Number(values.quantity_total),
      metadata_json: {},
      reason: values.reason.trim(),
    }, idempotencyKey);
  };
  return (
    <Dialog open={open} onOpenChange={(next) => !pending && onOpenChange(next)}>
      <DialogContent className="max-h-[90vh] overflow-y-auto border-[var(--border-default)] bg-[var(--bg-surface)] sm:max-w-2xl">
        <DialogHeader><DialogTitle>Issue entitlement grant</DialogTitle><DialogDescription>Create a typed commercial right for only the selected support tenant.</DialogDescription></DialogHeader>
        <div className="grid gap-4 py-2 sm:grid-cols-2">
          <SelectField id="grant-subscription" label="Subscription" value={values.subscription_id ?? ""} options={subscriptions.map((item) => ({ value: item.id, label: `${item.id.slice(0, 8)} - ${item.status}` }))} onChange={(value) => set("subscription_id", value)} />
          <SelectField id="grant-type" label="Grant type" value={values.grant_type ?? ""} options={["EVENT_UNIT", "EVENT_PACK", "EVENT_CREDIT_POOL", "ORG_CAPABILITY", "SERVICE_ALLOWANCE"].map((value) => ({ value, label: value }))} onChange={(value) => set("grant_type", value)} />
          <SelectField id="grant-scope" label="Scope" value={values.scope_type ?? ""} options={["EVENT", "ORG"].map((value) => ({ value, label: value }))} onChange={(value) => set("scope_type", value)} />
          <SelectField id="grant-model" label="Consumption model" value={values.consumption_model ?? ""} options={["SINGLE_USE", "QUANTITY", "CREDIT", "DURATION", "NON_CONSUMABLE", "MANUAL_FULFILLMENT"].map((value) => ({ value, label: value }))} onChange={(value) => { set("consumption_model", value); if (value === "SINGLE_USE") set("quantity_total", "1"); }} />
          <SelectField id="grant-unit" label="Unit" value={values.unit_type ?? ""} options={["EVENT", "CREDIT", "MESSAGE", "EMAIL", "STORAGE_MB", "STREAMING_MINUTE", "SERVICE_HOUR", "CUSTOM"].map((value) => ({ value, label: value }))} onChange={(value) => set("unit_type", value)} />
          <SelectField id="grant-source" label="Source" value={values.source_type ?? ""} options={["PLAN", "ADDON", "CONTRACT", "PLATFORM_OVERRIDE"].map((value) => ({ value, label: value }))} onChange={(value) => set("source_type", value)} />
          {!nonConsumable ? <div className="space-y-1.5"><Label htmlFor="grant-quantity">Quantity</Label><Input id="grant-quantity" type="number" min={1} disabled={values.consumption_model === "SINGLE_USE"} value={values.quantity_total ?? ""} onChange={(event) => set("quantity_total", event.target.value)} /></div> : null}
          <div className="space-y-1.5"><Label htmlFor="grant-source-ref">Source reference</Label><Input id="grant-source-ref" value={values.source_ref ?? ""} onChange={(event) => set("source_ref", event.target.value)} /></div>
          <div className="space-y-1.5 sm:col-span-2"><Label htmlFor="grant-reason">Issuance reason</Label><Textarea id="grant-reason" value={values.reason ?? ""} onChange={(event) => set("reason", event.target.value)} placeholder="Approved contract, add-on, plan, or platform override evidence" /></div>
        </div>
        <DialogFooter><Button variant="outline" disabled={pending} onClick={() => onOpenChange(false)}>Cancel</Button><Button disabled={!valid || pending} onClick={() => void submit()}>{pending ? "Issuing..." : "Issue grant"}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function GrantCapacityDialog({ open, onOpenChange, pending, version, currentQuantity, onSubmit }: DialogBaseProps & {
  version: number;
  currentQuantity?: number;
  onSubmit: (payload: Record<string, unknown>, idempotencyKey: string) => Promise<void>;
}) {
  const [quantity, setQuantity] = useState("");
  const [reason, setReason] = useState("");
  const [idempotencyKey, setIdempotencyKey] = useState(() => crypto.randomUUID());
  useEffect(() => {
    if (!open) return;
    setQuantity(String(currentQuantity ?? 1));
    setReason("");
    setIdempotencyKey(crypto.randomUUID());
  }, [open, currentQuantity]);
  return (
    <Dialog open={open} onOpenChange={(next) => !pending && onOpenChange(next)}>
      <DialogContent className="border-[var(--border-default)] bg-[var(--bg-surface)] sm:max-w-md">
        <DialogHeader><DialogTitle>Adjust grant capacity</DialogTitle><DialogDescription>The server rejects values below authoritative reserved and consumed ledger usage.</DialogDescription></DialogHeader>
        <div className="space-y-4 py-2"><div className="space-y-1.5"><Label htmlFor="grant-capacity">Total capacity</Label><Input id="grant-capacity" type="number" min={1} value={quantity} onChange={(event) => setQuantity(event.target.value)} /></div><div className="space-y-1.5"><Label htmlFor="grant-capacity-reason">Change reason</Label><Textarea id="grant-capacity-reason" value={reason} onChange={(event) => setReason(event.target.value)} /></div></div>
        <DialogFooter><Button variant="outline" disabled={pending} onClick={() => onOpenChange(false)}>Cancel</Button><Button disabled={Number(quantity) < 1 || reason.trim().length < 12 || pending} onClick={() => void onSubmit({ version, quantity_total: Number(quantity), reason: reason.trim() }, idempotencyKey)}>{pending ? "Updating..." : "Update capacity"}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function CreditNoteIssueDialog({ open, onOpenChange, pending, invoices = [], onSubmit }: DialogBaseProps & {
  invoices?: BillingInvoice[];
  onSubmit: (payload: Record<string, unknown>, idempotencyKey: string) => Promise<void>;
}) {
  const [values, setValues] = useState<Record<string, string>>({});
  const [idempotencyKey, setIdempotencyKey] = useState(() => crypto.randomUUID());
  useEffect(() => {
    if (!open) return;
    setValues({ invoice_id: "", amount_inr: "", gst_amount: "0", reason: "" });
    setIdempotencyKey(crypto.randomUUID());
  }, [open]);
  const set = (key: string, value: string) => setValues((current) => ({ ...current, [key]: value }));
  const valid = Boolean(values.invoice_id?.trim()) && Number(values.amount_inr) > 0 && Number(values.gst_amount) >= 0 && values.reason?.trim().length >= 12;
  return (
    <Dialog open={open} onOpenChange={(next) => !pending && onOpenChange(next)}>
      <DialogContent className="border-[var(--border-default)] bg-[var(--bg-surface)] sm:max-w-lg">
        <DialogHeader><DialogTitle>Create pending credit note</DialogTitle><DialogDescription>Select an invoice returned by the active audited tenant scope.</DialogDescription></DialogHeader>
        <div className="grid gap-4 py-2 sm:grid-cols-2"><div className="sm:col-span-2"><SelectField id="credit-invoice" label="Source invoice" value={values.invoice_id ?? ""} options={invoices.filter((invoice) => !["VOID", "REFUNDED"].includes(invoice.status)).map((invoice) => ({ value: invoice.id, label: `${invoice.invoice_number ?? invoice.id.slice(0, 8)} - ${invoice.status} - ${invoice.currency} ${Number(invoice.total_amount_inr).toFixed(2)}` }))} onChange={(value) => set("invoice_id", value)} /></div><div className="space-y-1.5"><Label htmlFor="credit-amount">Credit amount</Label><Input id="credit-amount" type="number" min="0.01" step="0.01" value={values.amount_inr ?? ""} onChange={(event) => set("amount_inr", event.target.value)} /></div><div className="space-y-1.5"><Label htmlFor="credit-gst">GST amount</Label><Input id="credit-gst" type="number" min="0" step="0.01" value={values.gst_amount ?? ""} onChange={(event) => set("gst_amount", event.target.value)} /></div><div className="space-y-1.5 sm:col-span-2"><Label htmlFor="credit-reason">Reason</Label><Textarea id="credit-reason" value={values.reason ?? ""} onChange={(event) => set("reason", event.target.value)} /></div></div>
        <DialogFooter><Button variant="outline" disabled={pending} onClick={() => onOpenChange(false)}>Cancel</Button><Button disabled={!valid || pending} onClick={() => void onSubmit({ invoice_id: values.invoice_id.trim(), amount_inr: values.amount_inr, gst_amount: values.gst_amount, reason: values.reason.trim() }, idempotencyKey)}>{pending ? "Creating..." : "Create pending note"}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
