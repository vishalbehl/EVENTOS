"use client";

import { useState } from "react";
import { CheckCircle2, RotateCcw, Send, ShieldAlert, X } from "lucide-react";
import { toast } from "sonner";
import { EventWorkspaceAction, useExecuteEventWorkspaceAction } from "@/features/organizations/api/organization-console-api";
import { OrgCard, OrgSectionTitle, OrgStatusBadge } from "./OrgPageShared";

type Item = Record<string, unknown>;
type Pending = { item: Item; action: EventWorkspaceAction; label: string };

const ACTIONS: Record<string, (item: Item) => Array<{ action: EventWorkspaceAction; label: string }>> = {
  attendees: item => [
    Number(item.qr_version ?? 0) > 0
      ? { action: "ROTATE_CONFIRMATION_QR" as const, label: "Rotate confirmation QR" }
      : { action: "ISSUE_CONFIRMATION_QR" as const, label: "Issue confirmation QR" },
  ],
  abstracts: item => [
    ...(item.status === "SUBMITTED" ? [{ action: "START_REVIEW" as const, label: "Start review" }] : []),
    ...(["SUBMITTED", "UNDER_REVIEW"].includes(String(item.status)) ? [
      { action: "APPROVE" as const, label: "Accept" },
      { action: "REQUEST_REVISION" as const, label: "Request revision" },
      { action: "REJECT" as const, label: "Reject" },
    ] : []),
  ],
  files: item => [
    ...(item.upload_status !== "approved" ? [{ action: "APPROVE" as const, label: "Approve" }] : []),
    ...(item.upload_status !== "rejected" ? [{ action: "REJECT" as const, label: "Reject" }] : []),
    { action: item.is_locked ? "UNLOCK" as const : "LOCK" as const, label: item.is_locked ? "Unlock" : "Lock" },
    ...(["failed", "rejected", "processing"].includes(String(item.upload_status)) ? [{ action: "RETRY_PROCESSING" as const, label: "Retry processing" }] : []),
  ],
  communications: item => [
    ...(item.status === "draft" ? [{ action: "SEND" as const, label: "Send" }] : []),
    ...(["sent", "failed"].includes(String(item.status)) ? [{ action: "RESEND_FAILED" as const, label: "Retry failures" }] : []),
    ...(["draft", "scheduled"].includes(String(item.status)) ? [{ action: "CANCEL" as const, label: "Cancel" }] : []),
  ],
  payments: item => [
    ...(["completed", "succeeded", "paid"].includes(String(item.status).toLowerCase()) ? [{ action: "RECORD_REFUND" as const, label: "Record approved refund" }] : []),
  ],
  checkins: () => [{ action: "REMOVE_CHECK_IN" as const, label: "Remove check-in" }],
  jobs: item => {
    const capabilities = (item.capabilities ?? {}) as Record<string, unknown>;
    return capabilities.retry === true
      ? [{ action: "RETRY_JOB" as const, label: "Create retry successor" }]
      : [];
  },
  users: () => [{ action: "UNASSIGN_USER" as const, label: "Unassign" }],
};

export function EventWorkspaceActionsPanel({ orgId, eventId, workspace, data }: { orgId: string; eventId: string; workspace: string; data: Record<string, unknown> }) {
  const actionMutation = useExecuteEventWorkspaceAction(orgId, eventId, workspace);
  const [pending, setPending] = useState<Pending | null>(null);
  const [reason, setReason] = useState("");
  const [caseReference, setCaseReference] = useState("");
  const [approvalId, setApprovalId] = useState("");
  const [providerRefundId, setProviderRefundId] = useState("");
  const [rejectionReason, setRejectionReason] = useState("");
  const items = workspace === "communications" ? (data.campaigns as Item[] | undefined) ?? [] : (data.items as Item[] | undefined) ?? [];
  if (!ACTIONS[workspace]) return null;

  const open = (item: Item, action: EventWorkspaceAction, label: string) => {
    setPending({ item, action, label }); setReason(""); setCaseReference(""); setApprovalId(""); setProviderRefundId(""); setRejectionReason("");
  };
  const needsReviewNotes = pending?.action === "REJECT" || pending?.action === "REQUEST_REVISION";
  const valid = reason.trim().length >= 12 && caseReference.trim().length >= 2 && (!needsReviewNotes || rejectionReason.trim().length >= 3) && (!pending || pending.action !== "RECORD_REFUND" || approvalId.trim().length >= 32);
  const execute = async () => {
    if (!pending?.item.id || !valid) return;
    try {
      const resourceId = workspace === "users" ? String(pending.item.user_id) : String(pending.item.id);
      await actionMutation.mutateAsync({ resourceId, action: pending.action, reason, case_reference: caseReference, approved_request_id: approvalId || undefined, data: { rejection_reason: rejectionReason || undefined, review_notes: rejectionReason || reason, version: Number(pending.item.qr_version ?? pending.item.version ?? 0), provider_refund_id: providerRefundId || undefined, source: pending.item.source || undefined } });
      toast.success(`${pending.label} completed`); setPending(null);
    } catch (error) { toast.error(error instanceof Error ? error.message : `${pending.label} failed`); }
  };

  return <OrgCard className="border-[var(--brand-primary)]/20">
    <div className="mb-3"><OrgSectionTitle>Administrative actions</OrgSectionTitle><p className="text-[10px] text-[var(--text-tertiary)]">Actions use the organizer domain service and produce privileged audit records.</p></div>
    <div className="space-y-2">{items.map(item => <div key={String(item.id)} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface-3)] p-3"><div><p className="text-xs font-bold text-[var(--text-primary)]">{String(item.original_filename ?? item.filename ?? item.name ?? item.sync_type ?? item.id)}</p><div className="mt-1 flex items-center gap-2"><span className="font-mono text-[9px] text-[var(--text-tertiary)]">{String(item.id)}</span><OrgStatusBadge status={String(item.upload_status ?? item.status ?? "unknown")} />{item.source ? <span className="rounded bg-[var(--bg-surface)] px-1.5 py-0.5 text-[9px] font-bold text-[var(--text-tertiary)]">{String(item.source)}</span> : null}</div>{workspace === "jobs" && (item.capabilities as Record<string, unknown> | undefined)?.unavailable_reason ? <p className="mt-1 text-[10px] text-[var(--text-tertiary)]">{String((item.capabilities as Record<string, unknown>).unavailable_reason)}</p> : null}</div><div className="flex flex-wrap gap-2">{ACTIONS[workspace](item).map(({ action, label }) => <button key={action} onClick={() => open(item, action, label)} className="rounded-lg border border-[var(--border-default)] px-2.5 py-1.5 text-[10px] font-bold text-[var(--brand-primary)]">{action === "SEND" ? <Send className="mr-1 inline h-3 w-3" /> : action.includes("RETRY") ? <RotateCcw className="mr-1 inline h-3 w-3" /> : <CheckCircle2 className="mr-1 inline h-3 w-3" />}{label}</button>)}</div></div>)}</div>
    {pending && <div className="mt-4 rounded-xl border border-[var(--status-warning)]/35 bg-[var(--status-warning)]/5 p-4"><div className="flex items-start justify-between"><div className="flex gap-2"><ShieldAlert className="mt-0.5 h-4 w-4 text-[var(--status-warning)]" /><div><p className="text-xs font-black text-[var(--text-primary)]">{pending.label}</p><p className="text-[10px] text-[var(--text-tertiary)]">Record {String(pending.item.id)}</p></div></div><button aria-label="Close action form" onClick={() => setPending(null)}><X className="h-4 w-4" /></button></div><div className="mt-3 grid gap-3 md:grid-cols-2"><input value={caseReference} onChange={event => setCaseReference(event.target.value)} placeholder="Case reference" className="rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface)] px-3 py-2 text-xs" /><input value={reason} onChange={event => setReason(event.target.value)} placeholder="Administrative reason (minimum 12 characters)" className="rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface)] px-3 py-2 text-xs" />{needsReviewNotes && <input value={rejectionReason} onChange={event => setRejectionReason(event.target.value)} placeholder={pending.action === "REQUEST_REVISION" ? "Revision instructions" : "Rejection reason"} className="rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface)] px-3 py-2 text-xs" />}{pending.action === "RECORD_REFUND" && <><input value={approvalId} onChange={event => setApprovalId(event.target.value)} placeholder="Approved financial adjustment ID" className="rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface)] px-3 py-2 text-xs font-mono" /><input value={providerRefundId} onChange={event => setProviderRefundId(event.target.value)} placeholder="Provider refund reference" className="rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface)] px-3 py-2 text-xs" /></>}</div><button disabled={!valid || actionMutation.isPending} onClick={execute} className="mt-3 rounded-xl bg-[var(--brand-primary)] px-4 py-2 text-xs font-bold text-[var(--primary-contrast)] disabled:opacity-40">Confirm {pending.label.toLowerCase()}</button></div>}
  </OrgCard>;
}
