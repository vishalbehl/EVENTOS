"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { AlertTriangle, Clock3, RefreshCw, TicketCheck } from "lucide-react";

import { EmptyState } from "@/components/super-admin/ui/EmptyState";
import { TableSkeleton } from "@/components/super-admin/ui/LoadingSkeleton";
import { MetricRow } from "@/components/super-admin/ui/MetricRow";
import { PageContainer } from "@/components/super-admin/ui/PageContainer";
import { RecoverableError } from "@/components/super-admin/ui/AsyncState";
import { SectionHeader } from "@/components/super-admin/ui/SectionHeader";
import { StatusBadge } from "@/components/super-admin/ui/StatusBadge";
import { SupportAccessScope, type SupportAccessSelection } from "@/components/super-admin/ui/SupportAccessScope";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useSupportTicketsAdmin } from "@/services/support-admin-service";

const COLUMNS = ["OPEN", "IN_PROGRESS", "WAITING_ON_CUSTOMER", "RESOLVED", "CLOSED"];

function dueLabel(value?: string | null) {
  if (!value) return "Not measured";
  const due = new Date(value);
  const overdue = due.getTime() < Date.now();
  return `${overdue ? "Overdue" : "Due"} ${due.toLocaleString()}`;
}

export default function SupportTicketsPage() {
  const [scope, setScope] = useState<SupportAccessSelection | null>(null);
  const [status, setStatus] = useState("ALL");
  const [priority, setPriority] = useState("ALL");
  const queryScope = { organizationId: scope?.organizationId, supportReason: scope?.reason, accessRequestId: scope?.accessRequestId };
  const ticketsQuery = useSupportTicketsAdmin(queryScope, {
    status: status === "ALL" ? undefined : status,
    priority: priority === "ALL" ? undefined : priority,
  });
  const tickets = useMemo(
    () => ticketsQuery.data?.pages.flatMap((page) => page.items) ?? [],
    [ticketsQuery.data?.pages],
  );
  const metrics = useMemo(() => [
    { label: "Open workload", value: tickets.filter((ticket) => !["RESOLVED", "CLOSED"].includes(ticket.status)).length, icon: TicketCheck },
    { label: "Critical / high", value: tickets.filter((ticket) => ["CRITICAL", "HIGH"].includes(ticket.priority)).length, icon: AlertTriangle },
    { label: "Escalated", value: tickets.filter((ticket) => ticket.is_escalated).length, icon: RefreshCw },
    { label: "SLA overdue", value: tickets.filter((ticket) => ticket.resolution_due_at && new Date(ticket.resolution_due_at).getTime() < Date.now() && !["RESOLVED", "CLOSED"].includes(ticket.status)).length, icon: Clock3 },
  ], [tickets]);

  return (
    <PageContainer>
      <SectionHeader
        title="Support Operations"
        description="Tenant-scoped ticket triage, SLA visibility, assignment, escalation, replies, and internal notes."
        breadcrumb={["Console", "Support", "Tickets"]}
        actions={<Button variant="outline" size="sm" disabled={!scope || ticketsQuery.isFetching} onClick={() => void ticketsQuery.refetch()}><RefreshCw className={`mr-2 size-4 ${ticketsQuery.isFetching ? "animate-spin" : ""}`} />Refresh</Button>}
      />
      <SupportAccessScope value={scope} onApply={setScope} />
      {scope ? <MetricRow metrics={metrics} /> : null}

      <div className="my-5 flex flex-wrap gap-3">
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-52" aria-label="Ticket status"><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="ALL">All statuses</SelectItem>{COLUMNS.map((item) => <SelectItem key={item} value={item}>{item.replaceAll("_", " ")}</SelectItem>)}</SelectContent>
        </Select>
        <Select value={priority} onValueChange={setPriority}>
          <SelectTrigger className="w-48" aria-label="Ticket priority"><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="ALL">All priorities</SelectItem>{["CRITICAL", "HIGH", "MEDIUM", "NORMAL", "LOW"].map((item) => <SelectItem key={item} value={item}>{item}</SelectItem>)}</SelectContent>
        </Select>
      </div>

      {!scope ? (
        <EmptyState title="Select a support scope" description="Choose exactly one organization and record the case or operational reason before reading support data." />
      ) : ticketsQuery.isLoading ? (
        <TableSkeleton rows={8} cols={7} />
      ) : ticketsQuery.isError ? (
        <RecoverableError title="Tickets could not be loaded" description={ticketsQuery.error instanceof Error ? ticketsQuery.error.message : "The support API rejected the request."} action={{ label: "Retry", onClick: () => void ticketsQuery.refetch() }} />
      ) : tickets.length === 0 ? (
        <EmptyState title="No support tickets" description="The selected organization has no tickets matching these filters. No sample records are substituted." />
      ) : (
        <div className="overflow-hidden rounded-2xl border border-border bg-surface">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-border bg-surface-2"><tr>{["Ticket", "Status", "Priority", "Category", "Assignment", "Resolution SLA", "Updated"].map((label) => <th key={label} className="px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-[var(--text-tertiary)]">{label}</th>)}</tr></thead>
              <tbody>{tickets.map((ticket) => (
                <tr key={ticket.id} className="border-b border-border/60 align-top hover:bg-surface-2/60">
                  <td className="max-w-md px-4 py-4"><Link className="font-semibold text-[var(--text-primary)] hover:text-[var(--brand-primary)]" href={`/support-center/tickets/${ticket.id}?organization_id=${ticket.organization_id}`}>{ticket.subject}</Link><p className="mt-1 line-clamp-2 text-[11px] text-[var(--text-tertiary)]">{ticket.description}</p><p className="mt-2 font-mono text-[9px] text-[var(--text-tertiary)]">{ticket.id}</p></td>
                  <td className="px-4 py-4"><StatusBadge status={ticket.status} /></td>
                  <td className="px-4 py-4"><StatusBadge status={ticket.priority} /></td>
                  <td className="px-4 py-4 text-[var(--text-secondary)]">{ticket.category}</td>
                  <td className="px-4 py-4 text-[var(--text-secondary)]">{ticket.assigned_agent || (ticket.assigned_to ? ticket.assigned_to.slice(0, 8) : "Unassigned")}{ticket.is_escalated ? <span className="mt-1 block text-[10px] font-semibold text-[var(--status-danger)]">Escalated</span> : null}</td>
                  <td className="px-4 py-4 text-[11px] text-[var(--text-secondary)]">{dueLabel(ticket.resolution_due_at)}</td>
                  <td className="whitespace-nowrap px-4 py-4 text-[11px] text-[var(--text-tertiary)]">{new Date(ticket.updated_at).toLocaleString()}<span className="mt-1 block font-mono">v{ticket.version}</span></td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        </div>
      )}
      {ticketsQuery.hasNextPage ? <div className="mt-4 flex justify-center"><Button variant="outline" disabled={ticketsQuery.isFetchingNextPage} onClick={() => void ticketsQuery.fetchNextPage()}>{ticketsQuery.isFetchingNextPage ? "Loading..." : "Load more"}</Button></div> : null}
    </PageContainer>
  );
}
