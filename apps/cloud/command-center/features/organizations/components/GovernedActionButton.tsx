"use client";

import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

export function GovernedActionButton({ label, title, className, requireCaseReference = true, confirmationText, disabled, onConfirm }: { label: string; title: string; className?: string; requireCaseReference?: boolean; confirmationText?: string; disabled?: boolean; onConfirm: (input: { reason: string; caseReference: string }) => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [caseReference, setCaseReference] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [pending, setPending] = useState(false);
  const valid = reason.trim().length >= 12 && (!requireCaseReference || caseReference.trim().length >= 2) && (!confirmationText || confirmation === confirmationText);
  const close = () => { if (!pending) { setOpen(false); setReason(""); setCaseReference(""); setConfirmation(""); } };
  return <Dialog open={open} onOpenChange={next => { if (!next) close(); else setOpen(true); }}>
    <DialogTrigger asChild><button type="button" disabled={disabled} className={className}>{label}</button></DialogTrigger>
    <DialogContent>
      <DialogHeader>
        <DialogTitle className="text-sm font-black">{title}</DialogTitle>
        <DialogDescription className="text-xs text-[var(--text-tertiary)]">This action is attributed to your platform identity and recorded in the organization audit trail.</DialogDescription>
      </DialogHeader>
        <div className="mt-4 space-y-3">
          {requireCaseReference && <label className="block text-xs text-[var(--text-secondary)]">Case reference<input autoFocus value={caseReference} onChange={event => setCaseReference(event.target.value)} className="mt-1 w-full rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface-3)] px-3 py-2" /></label>}
          <label className="block text-xs text-[var(--text-secondary)]">Decision reason<textarea autoFocus={!requireCaseReference} value={reason} onChange={event => setReason(event.target.value)} minLength={12} className="mt-1 min-h-24 w-full rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface-3)] px-3 py-2" /></label>
          {confirmationText && <label className="block text-xs text-[var(--text-secondary)]">Type <span className="font-mono font-bold">{confirmationText}</span> to confirm<input value={confirmation} onChange={event => setConfirmation(event.target.value)} className="mt-1 w-full rounded-xl border border-[var(--status-danger)]/40 bg-[var(--bg-surface-3)] px-3 py-2 font-mono" /></label>}
        </div>
      <DialogFooter className="mt-5"><button type="button" disabled={pending} onClick={close} className="rounded-xl px-4 py-2 text-xs font-bold text-[var(--text-secondary)]">Cancel</button><button type="button" disabled={!valid || pending} onClick={async () => { setPending(true); try { await onConfirm({ reason: reason.trim(), caseReference: caseReference.trim() }); setOpen(false); setReason(""); setCaseReference(""); setConfirmation(""); } finally { setPending(false); } }} className="rounded-xl bg-[var(--brand-primary)] px-4 py-2 text-xs font-bold text-[var(--primary-contrast)] disabled:opacity-40">{pending ? "Applying…" : "Confirm"}</button></DialogFooter>
    </DialogContent>
  </Dialog>;
}
