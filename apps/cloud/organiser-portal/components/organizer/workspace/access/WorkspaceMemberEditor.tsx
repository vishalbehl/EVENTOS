"use client";

import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiPut, type ApiError } from "@/lib/api-client";
import { useAuthStore } from "@/store/use-auth-store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Panel } from "@/components/organizer/workspace/OrganiserPrimitives";

type Role = "admin" | "member" | "viewer";
type Member = { member_id: string; name: string; role: Role | null; version: number };
type Page = { items: Member[]; next_cursor: string | null; policy_revision: number };

export function WorkspaceMemberEditor({ organizationId, workspaceId, workspaceName }: {
  organizationId: string; workspaceId: string; workspaceName: string;
}) {
  const user = useAuthStore(state => state.user);
  const queries = useQueryClient();
  const [cursor, setCursor] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, Role | "none">>({});
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const [notice, setNotice] = useState("");
  const [retryAt, setRetryAt] = useState(0);
  const [seconds, setSeconds] = useState(0);
  const inFlight = useRef(false);
  const command = useRef<{ signature: string; key: string } | null>(null);
  const page = useQuery({ queryKey: ["workspace-member-editor", user?.id, organizationId, workspaceId, cursor],
    enabled: !!user, retry: false, staleTime: 0,
    queryFn: ({ signal }) => apiGet<Page>(`/organizations/${organizationId}/workspaces/${workspaceId}/members`,
      { signal, params: { after: cursor ?? undefined, limit: 50 } }) });
  const problem = error ?? page.error as ApiError | null;
  useEffect(() => {
    if (problem?.retryAfter) setRetryAt(Date.now() + problem.retryAfter * 1000);
  }, [problem]);
  useEffect(() => {
    const tick = () => setSeconds(Math.max(0, Math.ceil((retryAt - Date.now()) / 1000)));
    tick();
    if (!retryAt) return;
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, [retryAt]);

  async function save(member: Member) {
    if (!user || inFlight.current || seconds || reason.trim().length < 3 || page.isFetching || page.error) return;
    const selected = drafts[member.member_id] ?? member.role ?? "none";
    const payload = { role: selected === "none" ? null : selected, reason: reason.trim() };
    const signature = JSON.stringify([organizationId, workspaceId, member.member_id, member.version, payload]);
    if (command.current?.signature !== signature) command.current = { signature, key: crypto.randomUUID() };
    inFlight.current = true; setBusy(true); setError(null); setNotice("");
    try {
      await apiPut(`/organizations/${organizationId}/workspaces/${workspaceId}/members/${member.member_id}`, payload,
        { headers: { "If-Match": String(member.version), "Idempotency-Key": command.current.key } });
      command.current = null;
      setDrafts(previous => { const next = { ...previous }; delete next[member.member_id]; return next; });
      setNotice(`Workspace access saved for ${member.name}.`);
      await Promise.all([
        queries.invalidateQueries({ queryKey: ["workspace-member-editor", user.id, organizationId, workspaceId] }),
        queries.invalidateQueries({ queryKey: ["access-bootstrap", user.id, organizationId] }),
        queries.invalidateQueries({ queryKey: ["operational-workspaces", user.id, organizationId] }),
        queries.invalidateQueries({ queryKey: ["context-directory-access", user.id, user.organization_id, organizationId] }),
        queries.invalidateQueries({ queryKey: ["context-directory-workspaces", user.id, user.organization_id, organizationId] }),
      ]);
    } catch (failure) {
      const failed = failure as ApiError;
      setError(failed);
      if ([401, 403, 404, 409, 412].includes(failed.status ?? 0)) {
        command.current = null;
        await page.refetch();
      }
    } finally { inFlight.current = false; setBusy(false); }
  }

  return <Panel title={`Member access — ${workspaceName}`}>
    <p className="mb-3 text-sm text-[var(--text-secondary)]">Accepted members only. Organisation owners and administrators retain organisation-wide access.
      These assignments control workspace visibility; they do not grant billing or organisation administration. Operational permission consolidation remains in progress.</p>
    <label className="mb-3 block text-sm">Reason for access change<Input value={reason} onChange={event => setReason(event.target.value)} minLength={3} maxLength={500} /></label>
    {problem ? <div role="alert" className="mb-3 text-sm">{problem.status === 412 ? "Access changed. Review the refreshed records before saving again." : problem.message}
      {seconds > 0 ? ` Retry in ${seconds} seconds.` : ""}{problem.correlationId ? ` Reference: ${problem.correlationId}` : ""}
      <Button variant="outline" disabled={busy || seconds > 0} onClick={() => { setError(null); void page.refetch(); }}>Reload member access</Button>
    </div> : null}
    {notice ? <p role="status" className="mb-3 text-sm">{notice}</p> : null}
    {page.isFetching ? <p role="status">Checking member access…</p> : page.error ? null : <>
      {page.data?.items.length === 0 ? <p>No accepted active members are available.</p> : null}
      <ul className="divide-y divide-[var(--border-subtle)]">{page.data?.items.map(member => <li key={member.member_id} className="flex flex-wrap items-center gap-3 py-3">
        <span className="min-w-36 flex-1 text-sm">{member.name}</span>
        <label className="text-sm">Workspace role for {member.name}
          <select className="ml-2 rounded border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-2" disabled={busy || seconds > 0}
            value={drafts[member.member_id] ?? member.role ?? "none"}
            onChange={event => setDrafts(previous => ({ ...previous, [member.member_id]: event.target.value as Role | "none" }))}>
            <option value="none">No explicit access</option><option value="viewer">Viewer</option><option value="member">Member</option><option value="admin">Workspace admin</option>
          </select>
        </label>
        <Button variant="outline" disabled={busy || seconds > 0 || reason.trim().length < 3 || (drafts[member.member_id] ?? member.role ?? "none") === (member.role ?? "none")}
          onClick={() => { void save(member); }}>Save access</Button>
      </li>)}</ul>
    </>}
    <div className="mt-3 flex gap-3">
      <Button variant="outline" disabled={!cursor || busy || page.isFetching || seconds > 0} onClick={() => { setCursor(null); setDrafts({}); }}>First page</Button>
      <Button variant="outline" disabled={!page.data?.next_cursor || busy || page.isFetching || seconds > 0} onClick={() => { setCursor(page.data?.next_cursor ?? null); setDrafts({}); }}>Next page</Button>
    </div>
  </Panel>;
}
