"use client";
import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiPost, type ApiError } from "@/lib/api-client";
import { useAuthStore } from "@/store/use-auth-store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Panel } from "../OrganiserPrimitives";

type Candidate = { member_id: string; name: string; role: string; version: number };
type CandidatePage = { items: Candidate[]; next_cursor: string | null; source_version: number; policy_revision: number };

export function OwnershipTransfer({ organizationId }: { organizationId: string }) {
  const userId = useAuthStore(state => state.user?.id);
  const queries = useQueryClient();
  const [cursor, setCursor] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState("");
  const [reason, setReason] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState<ApiError | null>(null);
  const [retryAt, setRetryAt] = useState(0);
  const [seconds, setSeconds] = useState(0);
  const inFlight = useRef(false);
  const receipt = useRef<{ signature: string; key: string } | null>(null);
  const page = useQuery({ queryKey: ["ownership-candidates", userId, organizationId, cursor], enabled: !!userId,
    retry: false, staleTime: 0, refetchOnWindowFocus: true,
    queryFn: ({ signal }) => apiGet<CandidatePage>(`/organizations/${organizationId}/members/ownership-candidates`,
      { signal, params: { after: cursor ?? undefined, limit: 50 } }) });
  const failure = error ?? page.error as ApiError | null;
  useEffect(() => { if (failure?.retryAfter) setRetryAt(Date.now() + failure.retryAfter * 1000); }, [failure?.retryAfter]);
  useEffect(() => {
    const tick = () => setSeconds(Math.max(0, Math.ceil((retryAt - Date.now()) / 1000)));
    tick();
    if (!retryAt) return;
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, [retryAt]);

  async function save() {
    const target = page.data?.items.find(row => row.member_id === selectedId);
    if (!userId || !page.data || !target || !confirmed || reason.trim().length < 3 || inFlight.current || seconds || page.isFetching || page.error) return;
    const payload = { target_member_id: target.member_id, target_version: target.version, reason: reason.trim() };
    const signature = JSON.stringify([organizationId, page.data.source_version, payload]);
    if (receipt.current?.signature !== signature) receipt.current = { signature, key: crypto.randomUUID() };
    inFlight.current = true; setBusy(true); setError(null); setNotice("");
    try {
      await apiPost(`/organizations/${organizationId}/members/transfer-ownership`, payload,
        { headers: { "If-Match": String(page.data.source_version), "Idempotency-Key": receipt.current.key } });
      receipt.current = null; setReason(""); setSelectedId(""); setConfirmed(false);
      setNotice("Ownership transferred. You now have an administrator membership.");
      await Promise.all([
        queries.invalidateQueries({ queryKey: ["access-bootstrap", userId, organizationId] }),
        queries.invalidateQueries({ queryKey: ["access-contexts", userId] }),
        queries.invalidateQueries({ queryKey: ["permissions", userId] }),
        queries.invalidateQueries({ queryKey: ["ownership-candidates", userId, organizationId] }),
        queries.invalidateQueries({ queryKey: ["organisation", "member-directory", userId, organizationId] }),
      ]);
    } catch (problem) {
      const failed = problem as ApiError; setError(failed);
      if (failed.retryAfter) setRetryAt(Date.now() + failed.retryAfter * 1000);
      if ([401, 403, 404, 409, 412, 428].includes(failed.status ?? 0)) {
        receipt.current = null; setConfirmed(false);
        await Promise.all([
          queries.invalidateQueries({ queryKey: ["access-bootstrap", userId, organizationId] }),
          queries.invalidateQueries({ queryKey: ["ownership-candidates", userId, organizationId] }),
        ]);
      }
    } finally { inFlight.current = false; setBusy(false); }
  }

  return <Panel title="Transfer organisation ownership">
    <p className="mb-4 text-sm text-[var(--text-secondary)]">Choose an accepted active member. The successor becomes an owner and you become an administrator in one transaction. Other owners retain their access. Recent authentication is required.</p>
    {failure ? <p role="alert" className="mb-3 text-sm">{failure.status === 412 ? "Membership changed. Reload and review the successor before trying again." : failure.message}
      {seconds > 0 ? ` Retry in ${seconds} seconds.` : ""}{failure.correlationId ? ` Reference: ${failure.correlationId}` : ""}</p> : null}
    {notice ? <p role="status" className="mb-3 text-sm">{notice}</p> : null}
    {page.isFetching ? <p role="status">Checking ownership and eligible members…</p> : null}
    {!page.isFetching && !page.error && page.data ? <form className="space-y-3" onSubmit={event => { event.preventDefault(); void save(); }}>
      <fieldset disabled={busy || seconds > 0}><legend className="font-medium">New owner</legend>
        {page.data.items.map(row => <label key={row.member_id} className="flex items-center gap-2 py-2 text-sm">
          <input type="radio" name="new-owner" value={row.member_id} checked={row.member_id === selectedId}
            onChange={() => { setSelectedId(row.member_id); setConfirmed(false); }} required /> {row.name} · {row.role}
        </label>)}
        {!page.data.items.length ? <p className="text-sm">No eligible members on this page. Invite a successor and wait for their acceptance before transferring ownership.</p> : null}
      </fieldset>
      <label className="block text-sm">Reason for transfer<Input value={reason} onChange={event => setReason(event.target.value)} minLength={3} maxLength={500} required disabled={busy} /></label>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={confirmed} onChange={event => setConfirmed(event.target.checked)} disabled={busy} required />I understand that my membership becomes administrator.</label>
      <Button type="submit" disabled={busy || seconds > 0 || !confirmed || reason.trim().length < 3 || !selectedId || !page.data.items.some(row => row.member_id === selectedId)}>Transfer ownership</Button>
    </form> : null}
    <div className="mt-4 flex flex-wrap gap-2">
      <Button variant="outline" disabled={busy || seconds > 0 || page.isFetching || !cursor} onClick={() => { setCursor(null); setSelectedId(""); setConfirmed(false); }}>First page</Button>
      <Button variant="outline" disabled={busy || seconds > 0 || page.isFetching || !page.data?.next_cursor} onClick={() => { setCursor(page.data?.next_cursor ?? null); setSelectedId(""); setConfirmed(false); }}>Next page</Button>
      <Button variant="outline" disabled={busy || seconds > 0 || page.isFetching} onClick={() => { setError(null); setConfirmed(false); void page.refetch(); }}>Reload ownership</Button>
    </div>
  </Panel>;
}
