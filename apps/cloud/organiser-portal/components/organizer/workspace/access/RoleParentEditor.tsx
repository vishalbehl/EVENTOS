"use client";

import { type FormEvent, useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { apiClient, apiGet, type ApiError } from "@/lib/api-client";
import { type UserRole } from "./shared";

type Parent = { id: string; name: string; version: number };
type Snapshot = { role_id: string; version: number; parents: Parent[] };

export function RoleParentEditor({ role, userId, organizationId, canManage, close, saved }: {
  role: UserRole; userId?: string; organizationId?: string; canManage: boolean; close: () => void; saved: () => Promise<void>;
}) {
  const [cursor, setCursor] = useState<string | null>(null);
  const [selected, setSelected] = useState<Record<string, Parent>>({});
  const [version, setVersion] = useState<number | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<ApiError | null>(null);
  const [needsReview, setNeedsReview] = useState(false);
  const [retryAt, setRetryAt] = useState(0);
  const [seconds, setSeconds] = useState(0);
  const initialized = useRef(false);
  const inFlight = useRef(false);
  const receipt = useRef<{ signature: string; key: string } | null>(null);
  const snapshot = useQuery({ queryKey: ["access-role-parents", userId, organizationId, role.id], retry: false, staleTime: 0,
    queryFn: ({ signal }) => apiGet<Snapshot>(`/rbac/roles/${role.id}/parents`, { signal }) });
  const choices = useQuery({ queryKey: ["access-role-page", userId, organizationId, cursor, ""], retry: false, staleTime: 0,
    queryFn: ({ signal }) => apiGet<{ items: UserRole[]; next_cursor: string | null }>("/rbac/roles/page",
      { signal, params: { after: cursor ?? undefined, limit: 50 } }) });
  const error = problem ?? (snapshot.error as ApiError | null) ?? (choices.error as ApiError | null);
  const loading = snapshot.isFetching || choices.isFetching;
  useEffect(() => {
    if (!initialized.current && snapshot.data && !snapshot.isFetching && !snapshot.isError) {
      initialized.current = true; setVersion(snapshot.data.version);
      setSelected(Object.fromEntries(snapshot.data.parents.map(parent => [parent.id, parent])));
    }
  }, [snapshot.data, snapshot.isFetching, snapshot.isError]);
  useEffect(() => { if (error?.retryAfter) setRetryAt(Date.now() + error.retryAfter * 1000); }, [error?.retryAfter]);
  useEffect(() => {
    const tick = () => setSeconds(Math.max(0, Math.ceil((retryAt - Date.now()) / 1000)));
    tick(); if (!retryAt) return;
    const timer = window.setInterval(tick, 1000); return () => window.clearInterval(timer);
  }, [retryAt]);
  const parents = Object.values(selected);

  async function review() {
    const [fresh] = await Promise.all([snapshot.refetch(), choices.refetch()]);
    if (fresh.data && !fresh.error) {
      setVersion(fresh.data.version);
      setSelected(Object.fromEntries(fresh.data.parents.map(parent => [parent.id, parent])));
      receipt.current = null; setNeedsReview(false); setProblem(null);
    }
  }
  async function save(form: FormEvent) {
    form.preventDefault();
    if (inFlight.current || busy || loading || !canManage || error || needsReview || seconds || !version || reason.trim().length < 3) return;
    const payload = { parents: parents.map(({ id, version }) => ({ id, version })).sort((a, b) => a.id.localeCompare(b.id)), reason: reason.trim() };
    const signature = JSON.stringify({ role_id: role.id, version, payload });
    if (receipt.current?.signature !== signature) receipt.current = { signature, key: crypto.randomUUID() };
    inFlight.current = true; setBusy(true);
    try {
      await apiClient.put(`/rbac/roles/${role.id}/parents`, payload,
        { headers: { "If-Match": String(version), "Idempotency-Key": receipt.current.key } });
      await saved(); close();
    } catch (cause) {
      const failure = cause as ApiError; setProblem(failure);
      if (failure.status === 412) setNeedsReview(true);
    } finally { inFlight.current = false; setBusy(false); }
  }
  return <Dialog open onOpenChange={value => { if (!value && !busy) close(); }}><DialogContent className="max-w-lg">
    <form onSubmit={save} className="space-y-4"><DialogHeader><DialogTitle>Inherited roles for {role.name}</DialogTitle>
      <DialogDescription>Parent roles contribute their permissions. Direct grants remain unchanged; explicit denials still apply. Cycles and grants beyond your authority are rejected.</DialogDescription></DialogHeader>
      <div className="max-h-40 overflow-y-auto space-y-2" aria-label="Selected parent roles">
        {parents.length ? parents.map(parent => <div key={parent.id} className="flex items-center justify-between gap-2 text-sm"><span>{parent.name}</span>
          <Button type="button" variant="outline" disabled={busy || loading || !canManage || needsReview} onClick={() => setSelected(current => {
            const next = { ...current }; delete next[parent.id]; return next;
          })}>Remove</Button></div>) : <p className="text-sm">{version ? "No parent roles selected." : "Loading saved parents…"}</p>}
      </div>
      <fieldset disabled={busy || loading || !canManage || needsReview} className="max-h-48 overflow-y-auto space-y-2"><legend className="text-sm">Available parent roles</legend>
        {(choices.data?.items ?? []).filter(item => item.id !== role.id).map(item => <label key={item.id} className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={!!selected[item.id]} disabled={!selected[item.id] && parents.length >= 100} onChange={event => {
            const checked = event.target.checked;
            setSelected(current => { const next = { ...current }; if (checked) next[item.id] = item; else delete next[item.id]; return next; });
          }} />{item.name}</label>)}
      </fieldset>
      <div className="flex gap-2"><Button type="button" variant="outline" disabled={busy || loading || !cursor} onClick={() => setCursor(null)}>First roles</Button>
        <Button type="button" variant="outline" disabled={busy || loading || !choices.data?.next_cursor} onClick={() => setCursor(choices.data?.next_cursor ?? null)}>More roles</Button></div>
      <label className="block text-sm">Reason<textarea className="op-input mt-2 w-full" minLength={3} maxLength={500} required value={reason} disabled={busy} onChange={event => setReason(event.target.value)} /></label>
      {error && <p role="alert" className="text-sm">{error.message}{error.correlationId ? ` Reference: ${error.correlationId}` : ""}{seconds > 0 ? ` Retry in ${seconds}s; your choices are preserved.` : ""}</p>}
      {(error || needsReview) && <Button type="button" variant="outline" disabled={busy || loading || seconds > 0} onClick={() => void review()}>Review saved parents and reset choices</Button>}
      <DialogFooter><Button type="button" variant="outline" disabled={busy} onClick={close}>Cancel</Button>
        <Button type="submit" disabled={busy || loading || !canManage || !!error || needsReview || seconds > 0 || !version || reason.trim().length < 3}>{busy ? "Saving…" : "Save inherited roles"}</Button></DialogFooter>
    </form></DialogContent></Dialog>;
}
