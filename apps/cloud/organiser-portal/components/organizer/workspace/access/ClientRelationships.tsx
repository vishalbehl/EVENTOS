"use client";

import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiPost, type ApiError } from "@/lib/api-client";
import type { ClientRelationship, RelationshipAction, RelationshipPage, ClientProvisionResult, ClientProvisionStatus } from "@/lib/client-relationships";
import { useAuthStore } from "@/store/use-auth-store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Panel } from "../OrganiserPrimitives";

type ScopeDraft = { key: string; member_id: string; workspace_id: string; event_id: string; actions: string[] };
const emptyScope = (): ScopeDraft => ({ key: crypto.randomUUID(), member_id: "", workspace_id: "", event_id: "", actions: [] });
const labels: Record<RelationshipAction, string> = { accept: "Approve relationship", reject: "Reject request",
  suspend: "Suspend delegated access", resume: "Approve resumption", detach: "Detach relationship", transfer: "Approve EMC transfer" };
const actionLabel = (code: string) => code === "REG_CONFIG:FORM"
  ? "Manage event forms (registration, survey and speaker intake)" : code;

export function ClientRelationships({ organizationId }: { organizationId: string }) {
  const userId = useAuthStore(state => state.user?.id);
  const queries = useQueryClient();
  const [cursor, setCursor] = useState<string | null>(null);
  const [clientId, setClientId] = useState("");
  const [mode, setMode] = useState<"existing" | "new">("existing");
  const [clientName, setClientName] = useState("");
  const [slug, setSlug] = useState("");
  const [ownerEmail, setOwnerEmail] = useState("");
  const [provision, setProvision] = useState<ClientProvisionResult | null>(null);
  const [issuedLink, setIssuedLink] = useState("");
  const [scopes, setScopes] = useState<ScopeDraft[]>([]);
  const [reason, setReason] = useState("");
  const [previousId, setPreviousId] = useState("");
  const [previousVersion, setPreviousVersion] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [problem, setProblem] = useState<ApiError | null>(null);
  const [retryAt, setRetryAt] = useState(0);
  const [seconds, setSeconds] = useState(0);
  const inFlight = useRef(false);
  const receipt = useRef<{ signature: string; key: string } | null>(null);
  const page = useQuery({ queryKey: ["client-relationships", userId, organizationId, cursor], enabled: !!userId,
    retry: false, staleTime: 0, refetchOnWindowFocus: true,
    queryFn: ({ signal }) => apiGet<RelationshipPage>("/emc/client-relationships", { signal,
      params: { organization_id: organizationId, after: cursor ?? undefined, limit: 50 } }) });
  const provisionStatus = useQuery({ queryKey: ["client-provisioning", userId, organizationId, provision?.provisioning_id],
    enabled: !!userId && !!provision, retry: false, staleTime: 0,
    queryFn: ({ signal }) => apiGet<ClientProvisionStatus>(`/emc/client-relationships/provision/${provision!.provisioning_id}`,
      { signal, params: { organization_id: organizationId } }) });
  const error = problem ?? page.error as ApiError | null ?? provisionStatus.error as ApiError | null;
  useEffect(() => { if (error?.retryAfter) setRetryAt(Date.now() + error.retryAfter * 1000); }, [error?.retryAfter]);
  useEffect(() => {
    const tick = () => setSeconds(Math.max(0, Math.ceil((retryAt - Date.now()) / 1000)));
    tick();
    if (!retryAt) return;
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, [retryAt]);

  function editScope(key: string, patch: Partial<ScopeDraft>) {
    setScopes(current => current.map(scope => scope.key === key ? { ...scope, ...patch } : scope));
  }

  async function save(row?: ClientRelationship, action?: RelationshipAction) {
    if (!userId || inFlight.current || seconds || page.isFetching || page.error || reason.trim().length < 3) return;
    if (row && (!action || !row.available_actions.includes(action))) return;
    const payload = row ? { action, reason: reason.trim(), ...(action === "transfer" ? {
      previous_relationship_id: previousId.trim(), previous_version: Number(previousVersion) } : {}) } : {
      reason: reason.trim(), ...(mode === "new" ? { name: clientName.trim(), slug: slug.trim(), owner_email: ownerEmail.trim(),
        staff: scopes.map(scope => ({ member_id: scope.member_id.trim(), actions: scope.actions })) } : {
        client_organization_id: clientId.trim(), scopes: scopes.map(({ key: _key, ...scope }) => ({
          ...scope, member_id: scope.member_id.trim(), workspace_id: scope.workspace_id.trim(), event_id: scope.event_id.trim() || null })) }) };
    const signature = JSON.stringify([organizationId, row?.id, row?.version, payload]);
    if (receipt.current?.signature !== signature) receipt.current = { signature, key: crypto.randomUUID() };
    const path = row ? `/emc/client-relationships/${row.id}/transitions` : mode === "new" ? "/emc/client-relationships/provision" : "/emc/client-relationships";
    inFlight.current = true; setBusy(true); setProblem(null); setNotice("");
    try {
      const result = await apiPost<ClientRelationship | ClientProvisionResult>(path, payload, { params: { organization_id: organizationId },
        headers: { "Idempotency-Key": receipt.current.key, ...(row ? { "If-Match": String(row.version) } : {}) } });
      if ("provisioning_id" in result) {
        setProvision(result);
        setIssuedLink(result.invite_token ? `${window.location.origin}/accept-invite#token=${encodeURIComponent(result.invite_token)}` : "");
      }
      receipt.current = null; setReason("");
      if (!row) { setClientId(""); setScopes([]); }
      setNotice(row ? "Relationship change saved." : "Request saved. Client-owner approval is required before access becomes active.");
      await Promise.all([
        queries.invalidateQueries({ queryKey: ["client-relationships", userId, organizationId] }),
        queries.invalidateQueries({ queryKey: ["access-bootstrap", userId, organizationId] }),
        queries.invalidateQueries({ queryKey: ["access-contexts", userId] }),
        queries.invalidateQueries({ queryKey: ["permissions", userId] }),
      ]);
    } catch (failure) {
      const failed = failure as ApiError; setProblem(failed);
      if (failed.retryAfter) setRetryAt(Date.now() + failed.retryAfter * 1000);
      if ([401, 403, 404, 409, 412, 428].includes(failed.status ?? 0)) {
        receipt.current = null;
        await queries.invalidateQueries({ queryKey: ["client-relationships", userId, organizationId] });
      }
    } finally { inFlight.current = false; setBusy(false); }
  }

  async function replaceInvitation() {
    if (!userId || !provision || !provisionStatus.data || provisionStatus.data.owner_accepted || !provisionStatus.data.owner_active ||
        inFlight.current || seconds || page.isFetching || page.error || provisionStatus.isFetching || provisionStatus.error || reason.trim().length < 3) return;
    const payload = { reason: reason.trim() };
    const signature = JSON.stringify([organizationId, provision.provisioning_id, provisionStatus.data.owner_version, payload]);
    if (receipt.current?.signature !== signature) receipt.current = { signature, key: crypto.randomUUID() };
    inFlight.current = true; setBusy(true); setProblem(null); setNotice("");
    try {
      const result = await apiPost<ClientProvisionResult>(`/emc/client-relationships/provision/${provision.provisioning_id}/owner-invitation`,
        payload, { params: { organization_id: organizationId }, headers: { "If-Match": String(provisionStatus.data.owner_version), "Idempotency-Key": receipt.current.key } });
      receipt.current = null; setProvision(result); setReason("");
      setIssuedLink(result.invite_token ? `${window.location.origin}/accept-invite#token=${encodeURIComponent(result.invite_token)}` : "");
      setNotice(result.invite_token ? "Owner invitation replaced. The previous link is no longer valid." : "Invitation was already replaced; its link is shown only on first issuance.");
      await queries.invalidateQueries({ queryKey: ["client-provisioning", userId, organizationId, provision.provisioning_id] });
    } catch (failure) {
      const failed = failure as ApiError; setProblem(failed);
      if (failed.retryAfter) setRetryAt(Date.now() + failed.retryAfter * 1000);
      if ([401, 403, 404, 409, 412, 428].includes(failed.status ?? 0)) {
        receipt.current = null;
        await queries.invalidateQueries({ queryKey: ["client-provisioning", userId, organizationId, provision.provisioning_id] });
      }
    } finally { inFlight.current = false; setBusy(false); }
  }

  const blocked = busy || seconds > 0 || page.isFetching || !!page.error;
  return <Panel title="EMC–client relationships">
    <p className="mb-4 text-sm text-[var(--text-secondary)]">Client data remains in its own organisation. Requests grant no access. Suspension or detachment disables delegation without deleting client data or changing commercial contracts.</p>
    {error ? <div role="alert" className="mb-4 border border-red-300 p-3 text-sm">
      {error.status === 403 ? "Relationship administration requires an accepted EMC administrator or client-owner membership." :
       error.status === 412 ? "This relationship changed. Reload it before saving again." :
       error.status === 503 ? "Relationship services are unavailable. Your form is preserved." : error.message}
      {seconds > 0 ? <p>Retry in {seconds} seconds.</p> : null}
      {error.correlationId ? <p>Reference: {error.correlationId}</p> : null}
    </div> : null}
    {notice ? <p role="status" className="mb-3 text-sm">{notice}</p> : null}
    {page.isFetching ? <p role="status">Checking relationship access…</p> : null}
    {!page.isFetching && !page.error && page.data ? <>
      <label className="mb-4 block text-sm">Reason for request or change<Input value={reason} onChange={event => setReason(event.target.value)} minLength={3} maxLength={500} disabled={busy} /></label>
      {page.data.organization_kind === "EMC" ? <form className="mb-6 space-y-3" onSubmit={event => { event.preventDefault(); void save(); }}>
        <h3 className="font-medium">Request client management</h3>
        {page.data.role === "owner" ? <label className="block text-sm">Client setup<select className="ml-2 rounded border p-2" value={mode} disabled={busy} onChange={event => setMode(event.target.value as "existing" | "new")}><option value="existing">Existing client</option><option value="new">Create a separate client organisation</option></select></label> : null}
        {mode === "existing" ? <label className="block text-sm">Client organisation ID<Input value={clientId} onChange={event => setClientId(event.target.value)} maxLength={36} required disabled={busy} /></label> : <>
          <label className="block text-sm">Client organisation name<Input value={clientName} onChange={event => setClientName(event.target.value)} minLength={2} maxLength={160} required disabled={busy} /></label>
          <label className="block text-sm">Organisation identifier<Input value={slug} onChange={event => setSlug(event.target.value)} minLength={3} maxLength={50} pattern="[a-z0-9][a-z0-9-]*[a-z0-9]" required disabled={busy} /></label>
          <label className="block text-sm">Designated client-owner email<Input type="email" value={ownerEmail} onChange={event => setOwnerEmail(event.target.value)} required disabled={busy} /></label>
          <p className="text-sm">The owner must authenticate as the invited identity, accept the invitation and approve the relationship. You receive provisioning status only, not unrestricted client access.</p>
        </>}
        <p className="text-sm text-[var(--text-secondary)]">Use client-provided workspace/event IDs and accepted EMC member IDs. Select only the actions the client should approve. No client directory is exposed before consent.</p>
        {scopes.map((scope, index) => <fieldset key={scope.key} className="space-y-2 border border-[var(--border-subtle)] p-3" disabled={busy}>
          <legend>Staff scope {index + 1}</legend>
          <label className="block text-sm">EMC member ID<Input value={scope.member_id} onChange={event => editScope(scope.key, { member_id: event.target.value })} maxLength={36} required /></label>
          {mode === "existing" ? <>
            <label className="block text-sm">Client operational workspace ID<Input value={scope.workspace_id} onChange={event => editScope(scope.key, { workspace_id: event.target.value })} maxLength={36} required /></label>
            <label className="block text-sm">Client event ID (optional)<Input value={scope.event_id} onChange={event => editScope(scope.key, { event_id: event.target.value })} maxLength={36} /></label>
          </> : <p className="text-sm">Scope: new client's default operational workspace.</p>}
          <div className="flex flex-wrap gap-3">{page.data?.grantable_actions.map(code => <label key={code} className="text-sm">
            <input type="checkbox" checked={scope.actions.includes(code)} onChange={event => editScope(scope.key, { actions: event.target.checked ? [...scope.actions, code] : scope.actions.filter(action => action !== code) })} /> {actionLabel(code)}
          </label>)}</div>
          <Button type="button" variant="outline" onClick={() => setScopes(current => current.filter(item => item.key !== scope.key))}>Remove scope</Button>
        </fieldset>)}
        {!page.data.grantable_actions.length ? <p role="status" className="text-sm">No grantable operational permissions are assigned. An organisation owner must assign explicit permissions before requesting delegation.</p> : null}
        <div className="flex flex-wrap gap-3"><Button type="button" variant="outline" disabled={blocked || scopes.length >= 100} onClick={() => setScopes(current => [...current, emptyScope()])}>Add staff scope</Button>
          <Button type="submit" disabled={blocked || (mode === "existing" ? !clientId.trim() : !clientName.trim() || !slug.trim() || !ownerEmail.trim()) || reason.trim().length < 3 || !scopes.length || scopes.some(scope => !scope.actions.length || !scope.member_id.trim() || (mode === "existing" && !scope.workspace_id.trim()))}>{mode === "existing" ? "Request client approval" : "Create client and invite owner"}</Button></div>
      </form> : null}
      {page.data.organization_kind === "CLIENT" && page.data.role === "owner" ? <div className="mb-4 space-y-2 border-t border-[var(--border-subtle)] pt-3">
        <p className="text-sm">For an EMC transfer, provide the currently active/suspended relationship ID and current version. The change replaces it atomically only after your approval.</p>
        <label className="block text-sm">Previous relationship ID<Input value={previousId} onChange={event => setPreviousId(event.target.value)} maxLength={36} disabled={busy} /></label>
        <label className="block text-sm">Previous relationship version<Input type="number" min={1} step={1} value={previousVersion} onChange={event => setPreviousVersion(event.target.value)} disabled={busy} /></label>
      </div> : null}
      {!page.data.items.length ? <p className="text-sm">No relationship requests or history are available.</p> : null}
      <ul className="divide-y divide-[var(--border-subtle)]">{page.data.items.map(row => <li key={row.id} className="space-y-2 py-4">
        <p className="font-medium">{row.status} · Version {row.version}</p>
        <p className="break-all text-sm">Relationship: {row.id}</p>
        <p className="break-all text-sm">{page.data?.organization_kind === "EMC" ? `Client: ${row.client_organization_id}` : `Managing EMC: ${row.emc_organization_id}`}</p>
        <ul className="text-sm">{row.scopes.map((scope, index) => <li key={`${scope.workspace_id}:${scope.event_id ?? "all"}:${index}`}>
          Workspace {scope.workspace_id} · {scope.event_id ? `Event ${scope.event_id}` : "Workspace events"} · {scope.actions.map(actionLabel).join(", ")}
          {scope.member_id ? ` · EMC member ${scope.member_id}` : ""}
        </li>)}</ul>
        <div className="flex flex-wrap gap-2">{row.available_actions.map(action => <Button key={action} variant="outline"
          disabled={blocked || reason.trim().length < 3 || (action === "transfer" && (!previousId.trim() || !Number.isInteger(Number(previousVersion)) || Number(previousVersion) < 1))}
          onClick={() => { void save(row, action); }}>{labels[action]}</Button>)}</div>
      </li>)}</ul>
    </> : null}
    {provision ? <section className="mt-4 space-y-3 border-t border-[var(--border-subtle)] pt-4" aria-label="Client provisioning status">
      <h3 className="font-medium">Client-owner invitation</h3>
      <p className="break-all text-sm">Provisioning: {provision.provisioning_id} · Client: {provision.client_organization_id}</p>
      {issuedLink ? <label className="block text-sm">One-time owner invitation link — share only with the intended owner<Input value={issuedLink} readOnly /><span>Expires {new Date(provision.expires_at).toLocaleString()}.</span></label> :
        <p className="text-sm">The secret link cannot be retrieved after first issuance. Replace a pending invitation if you did not save it.</p>}
      {provisionStatus.isFetching ? <p role="status">Checking owner acceptance…</p> : provisionStatus.data && !provisionStatus.error ?
        <p className="text-sm">Owner invitation: {provisionStatus.data.owner_accepted ? "Accepted" : provisionStatus.data.owner_active ? "Pending acceptance" : "Revoked"} · Relationship: {provisionStatus.data.relationship_status}</p> : null}
      <div className="flex flex-wrap gap-2"><Button variant="outline" disabled={busy || seconds > 0 || provisionStatus.isFetching} onClick={() => { void provisionStatus.refetch(); }}>Reload owner status</Button>
        <Button variant="outline" disabled={blocked || provisionStatus.isFetching || !!provisionStatus.error || !provisionStatus.data || provisionStatus.data.owner_accepted || !provisionStatus.data.owner_active || reason.trim().length < 3} onClick={() => { void replaceInvitation(); }}>Replace pending owner invitation</Button>
        <Button variant="outline" disabled={busy} onClick={() => setIssuedLink("")}>Hide invitation link</Button></div>
    </section> : null}
    <div className="mt-4 flex flex-wrap gap-3">
      <Button variant="outline" disabled={blocked || !cursor} onClick={() => setCursor(null)}>First page</Button>
      <Button variant="outline" disabled={blocked || !page.data?.next_cursor} onClick={() => setCursor(page.data?.next_cursor ?? null)}>Next page</Button>
      <Button variant="outline" disabled={busy || seconds > 0 || page.isFetching} onClick={() => { setProblem(null); void page.refetch(); }}>Reload relationships</Button>
    </div>
  </Panel>;
}
