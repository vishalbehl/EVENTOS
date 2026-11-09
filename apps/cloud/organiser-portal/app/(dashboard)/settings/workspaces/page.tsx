"use client";

import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiPatch, apiPost, type ApiError } from "@/lib/api-client";
import { useAuthStore } from "@/store/use-auth-store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Panel } from "@/components/organizer/workspace/OrganiserPrimitives";
import { SettingsPage } from "@/components/organizer/workspace/settings/shared";
import { ContextDirectory, type OrganizationSelection } from "@/components/organizer/workspace/access/ContextDirectory";
import { WorkspaceMemberEditor } from "@/components/organizer/workspace/access/WorkspaceMemberEditor";
import { OwnershipTransfer } from "@/components/organizer/workspace/access/OwnershipTransfer";
import { WorkspaceEventEditor } from "@/components/organizer/workspace/access/WorkspaceEventEditor";

type Workspace = { id: string; organization_id: string; name: string; status: "ACTIVE" | "ARCHIVED"; is_default: boolean; version: number };
type Page = { items: Workspace[]; next_cursor: string | null };
type Access = { organization_id: string; role: string; actions: string[]; policy_revision: number };

function WorkspaceScreen({ organizationId, organizationName }: { organizationId: string; organizationName: string }) {
  const user = useAuthStore(state => state.user);
  const queries = useQueryClient();
  const [name, setName] = useState("");
  const [editingWorkspace, setEditingWorkspace] = useState<Workspace | null>(null);
  const [managedWorkspace, setManagedWorkspace] = useState<Workspace | null>(null);
  const [eventWorkspace, setEventWorkspace] = useState<Workspace | null>(null);
  const [reason, setReason] = useState("");
  const [cursor, setCursor] = useState<string | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [retryAt, setRetryAt] = useState(0);
  const [seconds, setSeconds] = useState(0);
  // Keep the key for an identical command after network uncertainty. A changed
  // payload is a new command; no automatic mutation replay occurs.
  const command = useRef<{ signature: string; key: string } | null>(null);
  const access = useQuery({ queryKey: ["access-bootstrap", user?.id, organizationId], staleTime: 0,
    queryFn: ({ signal }) => apiGet<Access>("/access/bootstrap", { signal, params: { organization_id: organizationId } }), enabled: !!user, retry: false });
  const listKey = ["operational-workspaces", user?.id, organizationId, access.data?.policy_revision, cursor];
  const list = useQuery({ queryKey: listKey, enabled: !!user && !!access.data && !access.error, retry: false,
    queryFn: ({ signal }) => apiGet<Page>(`/organizations/${organizationId}/workspaces`, { signal, params: { after: cursor ?? undefined, limit: 50 } }) });

  useEffect(() => {
    const update = () => setSeconds(Math.max(0, Math.ceil((retryAt - Date.now()) / 1000)));
    update();
    if (!retryAt) return;
    const timer = window.setInterval(update, 1000);
    return () => window.clearInterval(timer);
  }, [retryAt]);

  useEffect(() => { setCursor(null); setError(null); setNotice(""); command.current = null; }, [user?.id, organizationId]);

  async function save(row?: Workspace, rename = false) {
    if (!user || busy || seconds || access.isFetching || access.error || !reason.trim() || (!row && !name.trim())) return;
    if (rename && !name.trim()) return;
    const payload = row && !rename ? { status: "ARCHIVED", reason: reason.trim() } : { name: name.trim(), reason: reason.trim() };
    const signature = JSON.stringify([organizationId, row?.id, row?.version, payload]);
    if (command.current?.signature !== signature) command.current = { signature, key: crypto.randomUUID() };
    setBusy(true); setError(null); setNotice("");
    try {
      const headers = { "Idempotency-Key": command.current.key, ...(row ? { "If-Match": String(row.version) } : {}) };
      if (row) await apiPatch<Workspace>(`/organizations/${organizationId}/workspaces/${row.id}`, payload, { headers });
      else await apiPost<Workspace>(`/organizations/${organizationId}/workspaces`, payload, { headers });
      command.current = null; setEditingWorkspace(null); setName(""); setReason(""); setNotice(rename ? "Workspace name updated." : row ? "Workspace archived." : "Workspace created.");
      await Promise.all([
        queries.invalidateQueries({ queryKey: ["access-bootstrap", user.id, organizationId] }),
        queries.invalidateQueries({ queryKey: ["operational-workspaces", user.id, organizationId] }),
        queries.invalidateQueries({ queryKey: ["context-directory-access", user.id, user.organization_id, organizationId] }),
        queries.invalidateQueries({ queryKey: ["context-directory-workspaces", user.id, user.organization_id, organizationId] }),
      ]);
    } catch (failure) {
      const problem = failure as ApiError; setError(problem);
      if (problem.retryAfter) setRetryAt(Date.now() + problem.retryAfter * 1000);
      if ([401, 403, 404, 409, 412].includes(problem.status ?? 0)) {
        command.current = null;
        if (problem.status === 412) { setEditingWorkspace(null); setName(""); }
        await Promise.all([
          queries.invalidateQueries({ queryKey: ["access-bootstrap", user.id, organizationId] }),
          queries.invalidateQueries({ queryKey: ["operational-workspaces", user.id, organizationId] }),
        ]);
      }
    } finally { setBusy(false); }
  }

  const canCreate = !access.isFetching && !access.error && access.data?.actions.includes("workspace:create");
  const canArchive = !access.isFetching && !access.error && access.data?.actions.includes("workspace:archive");
  const canEdit = !access.isFetching && !access.error && access.data?.actions.includes("workspace:edit");
  const canManageMembers = !access.isFetching && !access.error && access.data?.actions.includes("members:manage");
  const canMoveEvents = !access.isFetching && !access.error && access.data?.actions.includes("workspace:edit") && access.data?.actions.includes("EVENTS:EDIT");
  const problem = error ?? access.error as ApiError | null ?? list.error as ApiError | null;
  return <Panel title={`Operational workspaces — ${organizationName}`}>
    <p className="mb-4 text-sm text-[var(--text-secondary)]">Changes below apply only to this organisation. Your login organisation, subscription and commercial contract remain unchanged.</p>
    {!access.isFetching && !access.error && access.data?.role === "owner" ? <OwnershipTransfer key={`${user?.id}:${organizationId}`} organizationId={organizationId} /> : null}
    {problem && <div role="alert" className="mb-4 rounded border border-red-300 p-3 text-sm">
      {problem.code === "ACCESS_RECONCILIATION_REQUIRED" ? "Workspace access is awaiting administrator reconciliation." : problem.message}
      {seconds > 0 && <p>Retry in {seconds} seconds.</p>}
      {problem.correlationId && <p>Reference: {problem.correlationId}</p>}
      <Button variant="outline" disabled={busy || seconds > 0} onClick={() => { void access.refetch(); void list.refetch(); }}>Reload access</Button>
    </div>}
    {notice && <p role="status" className="mb-4 text-sm">{notice}</p>}
    {(access.isFetching || list.isFetching) && <p role="status">Checking workspace access…</p>}
    {(canCreate || (editingWorkspace && canEdit)) && <form className="mb-6 flex flex-wrap items-end gap-3" onSubmit={event => { event.preventDefault(); void save(editingWorkspace ?? undefined, !!editingWorkspace); }}>
      <label className="min-w-48 flex-1 text-sm">Workspace name<Input value={name} onChange={event => setName(event.target.value)} maxLength={160} required /></label>
      <label className="min-w-48 flex-1 text-sm">Reason for change<Input value={reason} onChange={event => setReason(event.target.value)} minLength={3} maxLength={500} required /></label>
      <Button type="submit" disabled={busy || seconds > 0 || !name.trim() || reason.trim().length < 3}>{editingWorkspace ? "Save workspace name" : "Create workspace"}</Button>
      {editingWorkspace && <Button variant="outline" type="button" disabled={busy} onClick={() => { setEditingWorkspace(null); setName(""); command.current = null; }}>Cancel rename</Button>}
    </form>}
    {!access.isFetching && !access.error && !list.isFetching && !list.error && list.data && <div className="overflow-x-auto"><table className="w-full text-left text-sm"><caption className="sr-only">Organisation workspaces</caption><thead><tr><th scope="col" className="p-3">Workspace</th><th scope="col" className="p-3">Status</th><th scope="col" className="p-3">Actions</th></tr></thead><tbody>
{list.data.items.map(row => <tr key={row.id} className="border-t border-[var(--border-subtle)]"><td className="p-3">{row.name}{row.is_default && <span className="ml-2 text-xs">Default</span>}</td><td className="p-3">{row.status === "ACTIVE" ? "Active" : "Archived"}</td><td className="p-3">{canEdit && row.status === "ACTIVE" && <Button variant="outline" disabled={busy || seconds > 0} onClick={() => { setEditingWorkspace(row); setName(row.name); command.current = null; }}>Rename workspace</Button>}{canArchive && !row.is_default && row.status === "ACTIVE" && <Button variant="outline" disabled={busy || seconds > 0 || reason.trim().length < 3} onClick={() => { void save(row); }}>Archive workspace</Button>}{canManageMembers && row.status === "ACTIVE" && <Button variant="outline" disabled={busy || seconds > 0} onClick={() => setManagedWorkspace(row)}>Manage member access</Button>}{canMoveEvents && row.status === "ACTIVE" && <Button variant="outline" disabled={busy || seconds > 0} onClick={() => setEventWorkspace(row)}>Move events</Button>}</td></tr>)}
    </tbody></table>{!list.data.items.length && <p className="p-3">No workspaces are available in your current scope.</p>}</div>}
    <div className="mt-4 flex gap-3"><Button variant="outline" disabled={!cursor || busy} onClick={() => setCursor(null)}>First page</Button><Button variant="outline" disabled={!list.data?.next_cursor || busy} onClick={() => setCursor(list.data?.next_cursor ?? null)}>Next page</Button></div>
    {eventWorkspace && canMoveEvents ? <WorkspaceEventEditor key={`${user?.id}:${organizationId}:${eventWorkspace.id}`} organizationId={organizationId} workspaceId={eventWorkspace.id} workspaceName={eventWorkspace.name} /> : null}
    {managedWorkspace && canManageMembers ? <WorkspaceMemberEditor key={`${user?.id}:${organizationId}:${managedWorkspace.id}`}
      organizationId={organizationId} workspaceId={managedWorkspace.id} workspaceName={managedWorkspace.name} /> : null}
  </Panel>;
}

function WorkspacesBody() {
  const user = useAuthStore(state => state.user);
  const [selected, setSelected] = useState<OrganizationSelection | null>(null);
  const organizationId = selected?.organization_id ?? user?.organization_id;
  return <SettingsPage><ContextDirectory onSelect={setSelected} />{organizationId ?
    <WorkspaceScreen key={`${user?.id}:${organizationId}`} organizationId={organizationId}
      organizationName={selected?.organization_name ?? "Login organisation"} /> : null}</SettingsPage>;
}

export default function WorkspacesPage() {
  const user = useAuthStore(state => state.user);
  // Remount immediately on identity/context changes: an old in-flight mutation
  // cannot put its form values or success message into the new tenant's screen.
  return <WorkspacesBody key={`${user?.id ?? "logged-out"}:${user?.organization_id ?? "none"}`} />;
}
