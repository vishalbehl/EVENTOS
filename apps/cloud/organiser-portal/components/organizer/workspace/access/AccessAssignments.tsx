"use client";

import { type FormEvent, useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { apiClient, apiGet, type ApiError } from "@/lib/api-client";
import { accessContextCacheKey, useAuthStore } from "@/store/use-auth-store";
import { useAccessBootstrap } from "@/hooks/useAccessBootstrap";
import { DataTable, Panel } from "../OrganiserPrimitives";
import { AccessPage, type RoleAssignment, type UserRole } from "./shared";

type Scope = "ORGANIZATION" | "EVENT";
type Page<T> = { items: T[]; next_cursor: string | null };
type Choice = { id: string; name: string; email?: string | null; version?: number | null };

export function AccessAssignments({ scope }: { scope?: Scope }) {
  const userId = useAuthStore(state => state.user?.id);
  const userOrganizationId = useAuthStore(state => state.user?.organization_id);
  const context = useAuthStore(state => state.activeContext);
  const scopeKey = accessContextCacheKey(context, userOrganizationId);
  return <Assignments key={`${userId}:${scopeKey}:${scope}`} userId={userId} scopeKey={scopeKey} fixedScope={scope} />;
}

function Assignments({ userId, scopeKey, fixedScope }: { userId?: string; scopeKey: string; fixedScope?: Scope }) {
  const client = useQueryClient();
  const bootstrap = useAccessBootstrap();
  const [selectedScope, setSelectedScope] = useState<Scope>("ORGANIZATION");
  const scope = fixedScope ?? selectedScope;
  const [cursor, setCursor] = useState<string | null>(null);
  const [memberCursor, setMemberCursor] = useState<string | null>(null);
  const [roleCursor, setRoleCursor] = useState<string | null>(null);
  const [eventCursor, setEventCursor] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [target, setTarget] = useState<RoleAssignment | null>(null);
  const [needsReview, setNeedsReview] = useState(false);
  const [member, setMember] = useState<Choice | null>(null);
  const [role, setRole] = useState<UserRole | null>(null);
  const [event, setEvent] = useState<Choice | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<ApiError | null>(null);
  const [notice, setNotice] = useState("");
  const [retryAt, setRetryAt] = useState(0);
  const [seconds, setSeconds] = useState(0);
  const inFlight = useRef(false);
  const receipt = useRef<{ signature: string; key: string } | null>(null);
  const enabled = !!userId && bootstrap.isSuccess;
  const assignments = useQuery({ queryKey: ["access-assignments", userId, scopeKey, bootstrap.data?.policy_revision, scope, cursor], enabled,
    retry: false, staleTime: 0, queryFn: ({ signal }) => apiGet<Page<RoleAssignment>>("/rbac/assignments/page",
      { signal, params: { scope, after: cursor ?? undefined, limit: 50 } }) });
  const choicesEnabled = enabled && open && !target;
  const members = useQuery({ queryKey: ["assignment-member-choices", userId, scopeKey, bootstrap.data?.policy_revision, memberCursor], enabled: choicesEnabled,
    retry: false, staleTime: 0, queryFn: ({ signal }) => apiGet<Page<Choice>>("/rbac/assignments/choices",
      { signal, params: { kind: "member", after: memberCursor ?? undefined, limit: 50 } }) });
  const roles = useQuery({ queryKey: ["access-role-page", userId, scopeKey, bootstrap.data?.policy_revision, roleCursor, ""], enabled: choicesEnabled,
    retry: false, staleTime: 0, queryFn: ({ signal }) => apiGet<Page<UserRole>>("/rbac/roles/page",
      { signal, params: { after: roleCursor ?? undefined, limit: 50 } }) });
  const events = useQuery({ queryKey: ["assignment-event-choices", userId, scopeKey, bootstrap.data?.policy_revision, eventCursor], enabled: choicesEnabled && scope === "EVENT",
    retry: false, staleTime: 0, queryFn: ({ signal }) => apiGet<Page<Choice>>("/rbac/assignments/choices",
      { signal, params: { kind: "event", after: eventCursor ?? undefined, limit: 50 } }) });
  const canManage = !bootstrap.isError && !bootstrap.isFetching && !!bootstrap.data?.actions.includes("roles:manage");
  const readError = assignments.error ?? bootstrap.error ?? (choicesEnabled ? members.error ?? roles.error ?? (scope === "EVENT" ? events.error : null) : null);
  const error = problem ?? (readError as ApiError | null);
  const loading = assignments.isFetching || bootstrap.isFetching;
  const choicesLoading = choicesEnabled && (members.isFetching || roles.isFetching || (scope === "EVENT" && events.isFetching));
  useEffect(() => { if (error?.retryAfter) setRetryAt(Date.now() + error.retryAfter * 1000); }, [error?.retryAfter]);
  useEffect(() => {
    const tick = () => setSeconds(Math.max(0, Math.ceil((retryAt - Date.now()) / 1000)));
    tick(); if (!retryAt) return;
    const timer = window.setInterval(tick, 1000); return () => window.clearInterval(timer);
  }, [retryAt]);

  async function refresh() {
    await Promise.all(["access-assignments", "assignment-member-choices", "assignment-event-choices", "access-role-page", "access-bootstrap", "access-summary"].map(
      prefix => client.invalidateQueries({ queryKey: prefix === "access-bootstrap" ? [prefix, userId] : [prefix, userId, scopeKey] })));
    await Promise.all(["user-role-assignments", "me"].map(prefix => client.invalidateQueries({ queryKey: [prefix] })));
  }
  function begin(assignment?: RoleAssignment) {
    setTarget(assignment ?? null); setNeedsReview(false); setMember(null); setRole(null); setEvent(null);
    setReason(""); setProblem(null); setNotice(""); receipt.current = null; setOpen(true);
  }
  async function save(form: FormEvent) {
    form.preventDefault();
    if (busy || inFlight.current || loading || choicesLoading || error || needsReview || !canManage || seconds || reason.trim().length < 3) return;
    if (!target && (!member?.version || !role || (scope === "EVENT" && !event))) return;
    const payload = target ? { reason: reason.trim() } : { user_id: member!.id, role_id: role!.id,
      member_version: member!.version, role_version: role!.version, event_id: scope === "EVENT" ? event!.id : null, reason: reason.trim() };
    const version = target?.version ?? 0;
    const signature = JSON.stringify({ id: target?.id, version, payload });
    if (receipt.current?.signature !== signature) receipt.current = { signature, key: crypto.randomUUID() };
    inFlight.current = true; setBusy(true); setProblem(null);
    try {
      const headers = { "If-Match": String(version), "Idempotency-Key": receipt.current.key };
      if (target) await apiClient.delete(`/rbac/assignments/${target.id}`, { headers, data: payload });
      else await apiClient.post("/rbac/assignments", payload, { headers });
      setOpen(false); setTarget(null); setMember(null); setRole(null); setEvent(null); setReason("");
      setNotice(target ? "Role assignment revoked." : "Role assigned."); await refresh();
    } catch (cause) {
      const failure = cause as ApiError; setProblem(failure);
      if (target && failure.status === 412) setNeedsReview(true);
      if ([401, 403, 404, 409, 412].includes(failure.status ?? 0)) {
        setMember(null); setRole(null); setEvent(null); receipt.current = null; await refresh();
      }
    } finally { inFlight.current = false; setBusy(false); }
  }
  const rows = assignments.data?.items ?? [];
  const recover = async () => { setProblem(null); await refresh(); };
  const paging = (label: string, value: string | null, next: string | null | undefined, change: (value: string | null) => void) =>
    <div className="flex gap-2"><Button type="button" variant="outline" disabled={busy || choicesLoading || !value} onClick={() => change(null)}>First {label}</Button>
      <Button type="button" variant="outline" disabled={busy || choicesLoading || !next} onClick={() => change(next ?? null)}>More {label}</Button></div>;
  return <AccessPage actions={<Button disabled={!canManage || loading || busy || !!error || seconds > 0} onClick={() => begin()}>Assign role</Button>}>
    <Panel title={scope === "EVENT" ? "Event access" : "Organisation access"} className="p-0">
      {!fixedScope && <div className="p-4"><label>Access scope <select className="op-select" value={scope} disabled={busy} onChange={e => {
        setSelectedScope(e.target.value as Scope); setCursor(null); setOpen(false); setProblem(null); setTarget(null);
      }}><option value="ORGANIZATION">Organisation access</option><option value="EVENT">Event access</option></select></label></div>}
      {error && <div role="alert" className="p-4 text-sm text-[var(--op-danger)]">{error.message || "Access administration is unavailable."}
        {seconds > 0 && <p>Try again in {seconds} seconds. Your form is preserved.</p>}{error.correlationId && <p>Reference: {error.correlationId}</p>}
        <Button variant="outline" disabled={busy || seconds > 0} onClick={() => void recover()}>Reload current access</Button></div>}
      {notice && <p role="status" className="p-4">{notice}</p>}
      <DataTable columns={["Member", "Role", scope === "EVENT" ? "Event" : "Scope", "Assigned", "Actions"]}
        rows={loading || assignments.isError ? [] : rows.map(item => [
          <span key={`${item.id}-member`}><strong className="block">{item.user_name || item.user_email}</strong><span className="text-xs text-[var(--op-muted)]">{item.user_email}</span></span>,
          item.role_name, scope === "EVENT" ? item.event_name ?? "Unavailable" : "Organisation", new Date(item.assigned_at).toLocaleString(),
          <Button key={`${item.id}-revoke`} variant="outline" disabled={!canManage || loading || busy || !!error || seconds > 0} onClick={() => begin(item)}>Revoke</Button>,
        ])} empty={loading ? "Loading current access…" : assignments.isError ? "Access is unavailable." : "No active role assignments in this scope."} />
      <div className="flex gap-2 p-4"><Button variant="outline" disabled={loading || !cursor} onClick={() => setCursor(null)}>First page</Button>
        <Button variant="outline" disabled={loading || !assignments.data?.next_cursor} onClick={() => setCursor(assignments.data?.next_cursor ?? null)}>Next page</Button></div>
    </Panel>
    <Dialog open={open} onOpenChange={value => { if (!busy) setOpen(value); }}><DialogContent className="max-w-lg">
      <form onSubmit={save} className="space-y-4"><DialogHeader><DialogTitle>{target ? "Revoke role assignment" : "Assign role"}</DialogTitle>
        <DialogDescription>{target ? `Revoke ${target.role_name} from ${target.user_name || target.user_email}. Other assignments remain unchanged.` :
          `Assign an accepted member a role at ${scope === "EVENT" ? "event" : "organisation"} scope. Explicit denials still apply.`}</DialogDescription></DialogHeader>
        {!target && <>
          <label className="block text-sm">Accepted member<select className="op-select mt-2 w-full" value={member?.id ?? ""} disabled={busy || choicesLoading} onChange={e => setMember(members.data?.items.find(item => item.id === e.target.value) ?? null)}>
            <option value="">Select member</option>{member && !members.data?.items.some(item => item.id === member.id) && <option value={member.id}>{member.name} ({member.email})</option>}
            {members.data?.items.map(item => <option key={item.id} value={item.id}>{item.name || item.email} ({item.email})</option>)}</select></label>
          {paging("members", memberCursor, members.data?.next_cursor, setMemberCursor)}
          <label className="block text-sm">Role<select className="op-select mt-2 w-full" value={role?.id ?? ""} disabled={busy || choicesLoading} onChange={e => setRole(roles.data?.items.find(item => item.id === e.target.value) ?? null)}>
            <option value="">Select role</option>{role && !roles.data?.items.some(item => item.id === role.id) && <option value={role.id}>{role.name}</option>}
            {roles.data?.items.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
          {paging("roles", roleCursor, roles.data?.next_cursor, setRoleCursor)}
          {scope === "EVENT" && <><label className="block text-sm">Event<select className="op-select mt-2 w-full" value={event?.id ?? ""} disabled={busy || choicesLoading} onChange={e => setEvent(events.data?.items.find(item => item.id === e.target.value) ?? null)}>
            <option value="">Select event</option>{event && !events.data?.items.some(item => item.id === event.id) && <option value={event.id}>{event.name}</option>}
            {events.data?.items.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
            {paging("events", eventCursor, events.data?.next_cursor, setEventCursor)}</>}
        </>}
        <label className="block text-sm">Reason<textarea className="op-input mt-2 w-full" required minLength={3} maxLength={500} value={reason} disabled={busy} onChange={e => setReason(e.target.value)} /></label>
        {error && <><p role="alert">{error.message}{seconds > 0 ? ` Retry in ${seconds}s.` : " Reload current access before trying again."}{error.correlationId ? ` Reference: ${error.correlationId}` : ""}</p>
          <Button type="button" variant="outline" disabled={busy || seconds > 0} onClick={() => void recover()}>Reload current access</Button></>}
        {target && needsReview && <Button type="button" variant="outline" disabled={busy || loading || assignments.isError} onClick={() => {
          const current = rows.find(item => item.id === target.id);
          if (current) { setTarget(current); setNeedsReview(false); setProblem(null); receipt.current = null; }
          else { setOpen(false); setTarget(null); setNotice("This assignment is no longer available. Review the current list."); }
        }}>Review current assignment</Button>}
        <DialogFooter><Button type="button" variant="outline" disabled={busy} onClick={() => setOpen(false)}>Cancel</Button>
          <Button type="submit" disabled={!canManage || loading || choicesLoading || busy || !!error || needsReview || seconds > 0 || reason.trim().length < 3 ||
            (!target && (!member?.version || !role || (scope === "EVENT" && !event)))}>{busy ? "Saving…" : target ? "Confirm revocation" : "Confirm assignment"}</Button></DialogFooter>
      </form></DialogContent></Dialog>
  </AccessPage>;
}
