"use client";

import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiPatch, type ApiError } from "@/lib/api-client";
import { useAuthStore } from "@/store/use-auth-store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type EventRow = { id: string; name: string; version: number; operational_workspace_id: string | null };
type Workspace = { id: string; name: string; status: "ACTIVE" | "ARCHIVED" };
type Page<T> = { items: T[]; next_cursor: string | null };
type Access = { role: string; actions: string[]; policy_revision: number };

export function WorkspaceEventEditor({ organizationId, workspaceId, workspaceName }: {
  organizationId: string; workspaceId: string; workspaceName: string;
}) {
  const user = useAuthStore(state => state.user);
  const queries = useQueryClient();
  const [cursor, setCursor] = useState<string | null>(null);
  const [destinationCursor, setDestinationCursor] = useState<string | null>(null);
  const [selected, setSelected] = useState<EventRow | null>(null);
  const [destination, setDestination] = useState<Workspace | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const [notice, setNotice] = useState("");
  const [retryAt, setRetryAt] = useState(0);
  const [seconds, setSeconds] = useState(0);
  const command = useRef<{ signature: string; key: string } | null>(null);
  const access = useQuery({ queryKey: ["access-bootstrap", user?.id, organizationId], enabled: !!user,
    retry: false, staleTime: 0,
    queryFn: ({ signal }) => apiGet<Access>("/access/bootstrap", { signal, params: { organization_id: organizationId } }) });
  const allowed = !access.isFetching && !access.isError && !!access.data &&
    ["owner", "admin"].includes(access.data.role) &&
    ["workspace:edit", "EVENTS:VIEW", "EVENTS:EDIT"].every(action => (access.data?.actions ?? []).includes(action));
  const events = useQuery({ queryKey: ["workspace-events", user?.id, organizationId, workspaceId, access.data?.policy_revision, cursor],
    enabled: allowed, retry: false,
    queryFn: ({ signal }) => apiGet<Page<EventRow>>(`/organizations/${organizationId}/workspaces/${workspaceId}/events`,
      { signal, params: { after: cursor ?? undefined, limit: 50 } }) });
  const destinations = useQuery({ queryKey: ["workspace-event-destinations", user?.id, organizationId, access.data?.policy_revision, destinationCursor],
    enabled: allowed, retry: false,
    queryFn: ({ signal }) => apiGet<Page<Workspace>>(`/organizations/${organizationId}/workspaces`,
      { signal, params: { after: destinationCursor ?? undefined, limit: 50 } }) });
  useEffect(() => {
    const update = () => setSeconds(Math.max(0, Math.ceil((retryAt - Date.now()) / 1000)));
    update();
    if (!retryAt) return;
    const timer = window.setInterval(update, 1000);
    return () => window.clearInterval(timer);
  }, [retryAt]);

  async function move() {
    if (!user || !allowed || !selected || !destination || busy || seconds || reason.trim().length < 3 || events.isError || destinations.isError) return;
    const payload = { workspace_id: destination.id, reason: reason.trim() };
    const signature = JSON.stringify([organizationId, selected.id, selected.version, payload]);
    if (command.current?.signature !== signature) command.current = { signature, key: crypto.randomUUID() };
    setBusy(true); setError(null); setNotice("");
    try {
      await apiPatch(`/organizations/${organizationId}/events/${selected.id}/workspace`, payload,
        { headers: { "If-Match": String(selected.version), "Idempotency-Key": command.current.key } });
      setNotice(`${selected.name} moved from ${workspaceName} to ${destination.name}.`);
      setSelected(null); setReason(""); command.current = null;
      await Promise.all([
        queries.invalidateQueries({ queryKey: ["access-bootstrap", user.id, organizationId] }),
        queries.invalidateQueries({ queryKey: ["workspace-events", user.id, organizationId] }),
        queries.invalidateQueries({ queryKey: ["operational-workspaces", user.id, organizationId] }),
        queries.invalidateQueries({ predicate: query => query.queryKey.some(key => key === selected.id) }),
      ]);
    } catch (failure) {
      const problem = failure as ApiError; setError(problem);
      if (problem.retryAfter) setRetryAt(Date.now() + problem.retryAfter * 1000);
      if ([401, 403, 404, 409, 412].includes(problem.status ?? 0)) {
        command.current = null; setSelected(null);
        await access.refetch(); await events.refetch();
      }
    } finally { setBusy(false); }
  }

  const problem = error ?? access.error as ApiError | null ?? events.error as ApiError | null ?? destinations.error as ApiError | null;
  return <section className="mt-6 border-t border-[var(--border-subtle)] pt-5" aria-label={`Events in ${workspaceName}`}>
    <h3 className="text-base font-semibold">Move events from {workspaceName}</h3>
    <p className="mb-4 text-sm text-[var(--text-secondary)]">Move events to another active workspace in this organisation before archiving. Event IDs and commercial agreements stay unchanged; workspace-based access may change.</p>
    {problem && <div role="alert" className="mb-3 text-sm">{problem.message}{problem.status === 412 && " Review the refreshed event before submitting again."}{seconds > 0 && <p>Retry in {seconds} seconds.</p>}{problem.correlationId && <p>Reference: {problem.correlationId}</p>}
      <Button variant="outline" disabled={busy || seconds > 0} onClick={() => { void access.refetch(); void events.refetch(); void destinations.refetch(); }}>Reload access</Button></div>}
    {notice && <p role="status" className="mb-3 text-sm">{notice}</p>}
    {!allowed ? <p role="status" className="text-sm">{access.isFetching ? "Checking workspace access…" : "Organisation and event administration access is required."}</p> : <>
      {events.isFetching ? <p role="status">Loading events…</p> : !events.isError && <div className="flex flex-wrap gap-2">{events.data?.items.map(event => <Button key={event.id} variant="outline" disabled={busy} aria-pressed={selected?.id === event.id} onClick={() => { setSelected(event); setError(null); }}>{event.name}</Button>)}{events.data?.items.length === 0 && <p>No active events remain in this workspace.</p>}</div>}
      <div className="my-3 flex gap-2"><Button variant="outline" disabled={!cursor || busy} onClick={() => { setCursor(null); setSelected(null); }}>First event page</Button><Button variant="outline" disabled={!events.data?.next_cursor || busy} onClick={() => { setCursor(events.data?.next_cursor ?? null); setSelected(null); }}>Next event page</Button></div>
      {selected && <form onSubmit={event => { event.preventDefault(); void move(); }} className="space-y-3">
        <p className="text-sm font-medium">{selected.name}: {workspaceName} → {destination?.name ?? "Choose destination"}</p>
        <div className="flex flex-wrap gap-2" aria-label="Destination workspaces">{!destinations.isError && !destinations.isFetching && destinations.data?.items.filter(row => row.status === "ACTIVE" && row.id !== workspaceId).map(row => <Button key={row.id} variant="outline" type="button" disabled={busy} aria-pressed={destination?.id === row.id} onClick={() => setDestination(row)}>{row.name}</Button>)}</div>
        <div className="flex gap-2"><Button type="button" variant="outline" disabled={!destinationCursor || busy} onClick={() => setDestinationCursor(null)}>First destination page</Button><Button type="button" variant="outline" disabled={!destinations.data?.next_cursor || busy} onClick={() => setDestinationCursor(destinations.data?.next_cursor ?? null)}>Next destination page</Button></div>
        <label className="block text-sm">Reason for moving<Input value={reason} onChange={event => setReason(event.target.value)} minLength={3} maxLength={500} required disabled={busy} /></label>
        <Button type="submit" disabled={!destination || busy || seconds > 0 || reason.trim().length < 3 || events.isFetching || destinations.isFetching || events.isError || destinations.isError}>Move event</Button>
      </form>}
    </>}
  </section>;
}
