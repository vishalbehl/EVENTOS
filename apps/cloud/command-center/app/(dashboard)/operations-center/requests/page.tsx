"use client";

import { useState } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { PageContainer } from "@/components/super-admin/ui/PageContainer";
import { SectionHeader } from "@/components/super-admin/ui/SectionHeader";
import { OperationalRequest, useOperationalRequestMutation, useOperationalRequests } from "@/services/super-admin-service";

export default function RequestsTriage() {
  const [status, setStatus] = useState("");
  const [selected, setSelected] = useState<OperationalRequest | null>(null);
  const [target, setTarget] = useState("TRIAGED");
  const [action, setAction] = useState<"transition" | "assign" | "patch">("transition");
  const [assignee, setAssignee] = useState("");
  const [priority, setPriority] = useState("MEDIUM");
  const [reason, setReason] = useState("");
  const query = useOperationalRequests({ status: status || undefined, limit: 50 });
  const mutation = useOperationalRequestMutation();
  const applyChange = async () => {
    if (!selected || reason.trim().length < 12) return toast.error("Enter an administrative reason of at least 12 characters.");
    if (action === "assign" && !assignee) return toast.error("Enter the assigned user ID.");
    const body = action === "transition"
      ? { organization_id: selected.organization_id, version: selected.version, target_status: target, reason }
      : action === "assign"
        ? { organization_id: selected.organization_id, version: selected.version, assigned_to: assignee, role: "operations_owner", reason }
        : { organization_id: selected.organization_id, version: selected.version, priority, reason };
    try { await mutation.mutateAsync({ id: selected.id, action, body }); toast.success("Request updated"); setSelected(null); setReason(""); setAssignee(""); } catch (error) { toast.error(error instanceof Error ? error.message : "Request update failed"); }
  };
  return <PageContainer><SectionHeader title="Requests Triage Desk" description="Tenant-safe service-request triage with optimistic concurrency and audit evidence." breadcrumb={["Console", "Operations", "Requests"]} actions={<Button variant="outline" size="sm" onClick={() => query.refetch()}><RefreshCw className="mr-2 h-4 w-4" />Refresh</Button>} />
    <Card className="mb-5 p-4"><label className="text-xs font-bold text-secondary">Status filter <select value={status} onChange={e => setStatus(e.target.value)} className="ml-3 rounded-lg border border-border bg-surface px-3 py-2 text-primary"><option value="">All</option>{["DRAFT","SUBMITTED","TRIAGED","APPROVED","IN_PROGRESS","COMPLETED","REJECTED","CLOSED"].map(v => <option key={v}>{v}</option>)}</select></label></Card>
    {query.isError ? <Card className="border-danger/30 p-6"><AlertTriangle className="h-5 w-5 text-danger" /> Requests are unavailable; no demo records are shown.</Card> : <Card className="overflow-x-auto"><table className="w-full text-left text-xs" aria-label="Operational requests"><thead><tr className="border-b border-border bg-surface-2"><th className="p-4">Request</th><th>Type</th><th>Priority</th><th>Status</th><th>Updated</th><th>Action</th></tr></thead><tbody>{query.data?.items.map(row => <tr key={row.id} className="border-b border-border"><td className="p-4"><p className="font-bold text-primary">{row.title}</p><p className="text-tertiary">{row.request_number}</p></td><td>{row.request_type}</td><td>{row.priority}</td><td>{row.status}</td><td>{new Date(row.updated_at).toLocaleString()}</td><td><Button size="sm" variant="outline" onClick={() => setSelected(row)}>Manage</Button></td></tr>)}{!query.isLoading && !query.data?.items.length && <tr><td colSpan={6} className="p-10 text-center text-secondary">No requests match this filter.</td></tr>}</tbody></table></Card>}
    {selected && <Card className="mt-5 p-5"><h2 className="font-bold text-primary">Manage {selected.request_number}</h2><div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4"><select aria-label="Request operation" value={action} onChange={e => setAction(e.target.value as typeof action)} className="rounded-lg border border-border bg-surface px-3 py-2 text-sm"><option value="transition">Transition</option><option value="assign">Assign owner</option><option value="patch">Change priority</option></select>{action === "transition" && <select aria-label="Request target status" value={target} onChange={e => setTarget(e.target.value)} className="rounded-lg border border-border bg-surface px-3 py-2 text-sm">{["TRIAGED","APPROVED","REJECTED","IN_PROGRESS","COMPLETED","CLOSED","CANCELLED"].map(v => <option key={v}>{v}</option>)}</select>}{action === "assign" && <input aria-label="Assigned user ID" value={assignee} onChange={e => setAssignee(e.target.value)} placeholder="Assigned user UUID" className="rounded-lg border border-border bg-surface px-3 py-2 text-sm" />}{action === "patch" && <select aria-label="Request priority" value={priority} onChange={e => setPriority(e.target.value)} className="rounded-lg border border-border bg-surface px-3 py-2 text-sm">{["LOW","MEDIUM","HIGH","CRITICAL"].map(v => <option key={v}>{v}</option>)}</select>}<input aria-label="Administrative reason" value={reason} onChange={e => setReason(e.target.value)} placeholder="Administrative reason" className="min-w-72 rounded-lg border border-border bg-surface px-3 py-2 text-sm" /></div><div className="mt-3 flex gap-2"><Button onClick={applyChange} disabled={mutation.isPending}>Apply change</Button><Button variant="outline" onClick={() => setSelected(null)}>Cancel</Button></div></Card>}
  </PageContainer>;
}
