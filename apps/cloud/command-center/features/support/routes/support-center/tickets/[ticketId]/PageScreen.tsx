"use client";

import { FormEvent, useState } from "react";
import { ArrowLeft, LockKeyhole, MessageSquare, Save, Send, ShieldAlert } from "lucide-react";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { toast } from "sonner";

import { EmptyState } from "@/components/super-admin/ui/EmptyState";
import { SupportAttachmentsPanel } from "@/components/support/SupportAttachmentsPanel";
import { RecoverableError } from "@/components/super-admin/ui/AsyncState";
import { PageContainer } from "@/components/super-admin/ui/PageContainer";
import { SectionHeader } from "@/components/super-admin/ui/SectionHeader";
import { StatusBadge } from "@/components/super-admin/ui/StatusBadge";
import { SupportAccessScope, type SupportAccessSelection } from "@/components/super-admin/ui/SupportAccessScope";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useAddSupportCommentAdmin, useSupportCommentsAdmin, useSupportTicketAdmin, useUpdateSupportTicketAdmin } from "@/services/support-admin-service";
import { useGlobalUsers } from "@/services/super-admin-service";

export default function SupportTicketDetailPage() {
  const ticketId = String(useParams().ticketId || "");
  const expectedOrganizationId = useSearchParams().get("organization_id");
  const [scope, setScope] = useState<SupportAccessSelection | null>(null);
  const [status, setStatus] = useState("");
  const [priority, setPriority] = useState("");
  const [assignedTo, setAssignedTo] = useState("");
  const [escalate, setEscalate] = useState(false);
  const [reason, setReason] = useState("");
  const [message, setMessage] = useState("");
  const [internal, setInternal] = useState(false);
  const queryScope = { organizationId: scope?.organizationId, supportReason: scope?.reason, accessRequestId: scope?.accessRequestId };
  const ticketQuery = useSupportTicketAdmin(queryScope, ticketId);
  const commentsQuery = useSupportCommentsAdmin(queryScope, ticketId);
  const update = useUpdateSupportTicketAdmin(queryScope);
  const addComment = useAddSupportCommentAdmin(queryScope);
  const assignees = useGlobalUsers(
    { org_id: scope?.organizationId, limit: 200, is_active: true },
    { enabled: Boolean(scope?.organizationId) },
  );
  const ticket = ticketQuery.data;

  const applyScope = (selection: SupportAccessSelection) => {
    if (expectedOrganizationId && selection.organizationId !== expectedOrganizationId) {
      toast.error("Select the organization associated with this ticket.");
      return;
    }
    setScope(selection);
  };

  const saveLifecycle = async (event: FormEvent) => {
    event.preventDefault();
    if (!ticket || reason.trim().length < 12) return;
    try {
      await update.mutateAsync({
        ticketId,
        payload: {
          status: status || ticket.status,
          priority: priority || ticket.priority,
          assigned_to: assignedTo || ticket.assigned_to || undefined,
          escalate: escalate || ticket.is_escalated,
          reason: reason.trim(),
          version: ticket.version,
        },
      });
      toast.success("Ticket lifecycle updated and audited.");
      setReason("");
    } catch (error) { toast.error(error instanceof Error ? error.message : "Ticket update failed."); }
  };

  const sendMessage = async (event: FormEvent) => {
    event.preventDefault();
    if (message.trim().length < 1) return;
    try {
      await addComment.mutateAsync({ ticketId, content: message.trim(), isInternal: internal });
      toast.success(internal ? "Internal note recorded." : "Customer reply recorded.");
      setMessage("");
    } catch (error) { toast.error(error instanceof Error ? error.message : "Message could not be recorded."); }
  };

  return <PageContainer>
    <SectionHeader title={ticket?.subject || "Support Ticket"} description="Audited ticket lifecycle, SLA, customer conversation, and private support notes." breadcrumb={["Console", "Support", "Tickets", ticketId.slice(0, 8)]} actions={<Link href="/support-center/tickets" className="inline-flex h-9 items-center rounded-md border border-border px-3 text-xs font-medium text-[var(--text-primary)] hover:bg-surface-2"><ArrowLeft className="mr-2 size-4" />Back to tickets</Link>} />
    <SupportAccessScope value={scope} onApply={applyScope} />
    {!scope ? <EmptyState title="Re-authorize support access" description="Ticket links never carry the support reason. Apply the correct tenant scope again before reading the record." /> : ticketQuery.isLoading ? <div className="h-80 animate-pulse rounded-2xl bg-surface-2" /> : ticketQuery.isError ? <RecoverableError title="Ticket could not be loaded" description={ticketQuery.error instanceof Error ? ticketQuery.error.message : "The support API rejected this scope."} action={{ label: "Retry", onClick: () => void ticketQuery.refetch() }} /> : ticket ? <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
      <div className="space-y-5">
        <section className="rounded-2xl border border-border bg-surface p-5"><div className="flex flex-wrap items-start justify-between gap-3"><div><div className="flex gap-2"><StatusBadge status={ticket.status} /><StatusBadge status={ticket.priority} />{ticket.is_escalated ? <StatusBadge status="ESCALATED" /> : null}</div><p className="mt-4 whitespace-pre-wrap text-sm leading-6 text-[var(--text-secondary)]">{ticket.description}</p></div><span className="font-mono text-[10px] text-[var(--text-tertiary)]">v{ticket.version}</span></div><dl className="mt-5 grid gap-4 border-t border-border pt-4 text-xs sm:grid-cols-3"><div><dt className="text-[var(--text-tertiary)]">Category</dt><dd className="mt-1 text-[var(--text-primary)]">{ticket.category}</dd></div><div><dt className="text-[var(--text-tertiary)]">First response SLA</dt><dd className="mt-1 text-[var(--text-primary)]">{ticket.first_response_due_at ? new Date(ticket.first_response_due_at).toLocaleString() : "Not measured"}</dd></div><div><dt className="text-[var(--text-tertiary)]">Resolution SLA</dt><dd className="mt-1 text-[var(--text-primary)]">{ticket.resolution_due_at ? new Date(ticket.resolution_due_at).toLocaleString() : "Not measured"}</dd></div></dl></section>
        <section className="rounded-2xl border border-border bg-surface p-5"><h2 className="flex items-center gap-2 text-sm font-semibold"><MessageSquare className="size-4" />Conversation and internal notes</h2><div className="mt-4 space-y-3">{commentsQuery.isLoading ? <p className="text-xs text-[var(--text-tertiary)]">Loading conversation...</p> : !commentsQuery.data?.length ? <p className="text-xs text-[var(--text-tertiary)]">No messages are recorded.</p> : commentsQuery.data.map((comment) => <article key={comment.id} className={`rounded-xl border p-4 ${comment.is_internal ? "border-amber-400/20 bg-amber-400/[0.04]" : "border-border bg-surface-2"}`}><div className="flex items-center justify-between gap-3"><p className="text-xs font-semibold text-[var(--text-primary)]">{comment.author_name}</p><span className="text-[10px] text-[var(--text-tertiary)]">{new Date(comment.created_at).toLocaleString()}</span></div>{comment.is_internal ? <p className="mt-1 flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-amber-300"><LockKeyhole className="size-3" />Internal note</p> : null}<p className="mt-2 whitespace-pre-wrap text-xs leading-5 text-[var(--text-secondary)]">{comment.content}</p></article>)}</div><form onSubmit={sendMessage} className="mt-5 space-y-3 border-t border-border pt-5"><Textarea value={message} onChange={(event) => setMessage(event.target.value)} placeholder={internal ? "Record a private operational note" : "Reply to the customer"} className="min-h-28" required /><label className="flex items-center gap-2 text-xs text-[var(--text-secondary)]"><input type="checkbox" checked={internal} onChange={(event) => setInternal(event.target.checked)} />Internal note, hidden from customer</label><Button type="submit" disabled={addComment.isPending || !message.trim()}><Send className="mr-2 size-4" />{addComment.isPending ? "Recording..." : internal ? "Record internal note" : "Send reply"}</Button></form></section>
        <SupportAttachmentsPanel scope={queryScope} ticketId={ticketId} />
      </div>
      <aside><form onSubmit={saveLifecycle} className="sticky top-24 space-y-4 rounded-2xl border border-border bg-surface p-5"><div><h2 className="text-sm font-semibold">Lifecycle control</h2><p className="mt-1 text-xs text-[var(--text-tertiary)]">Changes require recent step-up authentication, an optimistic version, and an audit reason.</p></div><label className="block text-xs text-[var(--text-secondary)]">Status<Select value={status || ticket.status} onValueChange={setStatus}><SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger><SelectContent>{["OPEN", "IN_PROGRESS", "WAITING_ON_CUSTOMER", "RESOLVED", "CLOSED"].map((item) => <SelectItem key={item} value={item}>{item.replaceAll("_", " ")}</SelectItem>)}</SelectContent></Select></label><label className="block text-xs text-[var(--text-secondary)]">Priority<Select value={priority || ticket.priority} onValueChange={setPriority}><SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger><SelectContent>{["CRITICAL", "HIGH", "MEDIUM", "NORMAL", "LOW"].map((item) => <SelectItem key={item} value={item}>{item}</SelectItem>)}</SelectContent></Select></label><label className="block text-xs text-[var(--text-secondary)]">Assigned agent<Select value={assignedTo || ticket.assigned_to || undefined} onValueChange={setAssignedTo}><SelectTrigger className="mt-1.5"><SelectValue placeholder="Select an agent" /></SelectTrigger><SelectContent>{(assignees.data?.items ?? []).filter((user) => user.is_platform_admin || user.platform_role === "SUPER_ADMIN").map((user) => <SelectItem key={user.id} value={user.id}>{user.first_name} {user.last_name} ({user.email})</SelectItem>)}</SelectContent></Select></label><label className="flex items-center gap-2 text-xs text-[var(--text-secondary)]"><input type="checkbox" checked={escalate || ticket.is_escalated} disabled={ticket.is_escalated} onChange={(event) => setEscalate(event.target.checked)} />{ticket.is_escalated ? "Escalated" : "Escalate to priority support"}</label><label className="block text-xs text-[var(--text-secondary)]">Audit reason<Textarea value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Describe the case decision (minimum 12 characters)" className="mt-1.5 min-h-24" required minLength={12} /></label><Button className="w-full" type="submit" disabled={update.isPending || reason.trim().length < 12}><Save className="mr-2 size-4" />{update.isPending ? "Saving..." : "Save lifecycle"}</Button><div className="flex gap-2 rounded-xl border border-amber-400/20 bg-amber-400/[0.04] p-3 text-[11px] text-amber-200"><ShieldAlert className="mt-0.5 size-4 shrink-0" />Cross-tenant existence remains concealed. A stale version is rejected instead of overwriting another operator.</div></form></aside>
    </div> : null}
  </PageContainer>;
}
