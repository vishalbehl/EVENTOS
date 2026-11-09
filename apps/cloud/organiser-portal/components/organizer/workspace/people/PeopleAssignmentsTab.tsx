"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useEvents } from "@/hooks/useEvents";
import { apiClient, apiGet, type ApiError } from "@/lib/api-client";
import { accessContextCacheKey, useAuthStore } from "@/store/use-auth-store";
import { useAccessBootstrap } from "@/hooks/useAccessBootstrap";
import { DataTable, Panel } from "../OrganiserPrimitives";
import { PeoplePage, type TeamRecord } from "./shared";

function describeTeamPermissions(event: TeamRecord["events"][number]) {
  if (event.authorization_version !== 1) return "Review required — this legacy binding does not grant access";
  if (!event.permissions || typeof event.permissions !== "object" || Array.isArray(event.permissions)) return "Invalid permission configuration";
  const overrides = Object.entries(event.permissions);
  if (overrides.some(([, value]) => typeof value !== "boolean")) return "Invalid permission configuration";
  return overrides.map(([code, value]) => `${value ? "Allow" : "Deny"} ${code}`).join(", ") || "No explicit overrides";
}

export function PeopleAssignmentsTab() {
  const userId = useAuthStore(state => state.user?.id);
  const userOrganizationId = useAuthStore(state => state.user?.organization_id);
  const context = useAuthStore(state => state.activeContext);
  const scopeKey = accessContextCacheKey(context, userOrganizationId);
  return <Assignments key={`${userId}:${scopeKey}`} userId={userId} scopeKey={scopeKey} />;
}

function Assignments({ userId, scopeKey }: { userId?: string; scopeKey: string }) {
  const client = useQueryClient();
  const bootstrap = useAccessBootstrap();
  const organizationId = bootstrap.data?.organization_id;
  const enabled = !!userId && bootstrap.isSuccess && !!organizationId;
  const teams = useQuery({ queryKey: ["organisation", "teams", "assignments", userId, scopeKey, bootstrap.data?.policy_revision], enabled,
    retry: false, staleTime: 0, queryFn: ({ signal }) => apiGet<{ items: TeamRecord[] }>("/organiser/teams?page=1&page_size=100", { signal }) });
  const members = useQuery({ queryKey: ["organisation", "team-member-choices", userId, scopeKey, bootstrap.data?.policy_revision], enabled,
    retry: false, staleTime: 0, queryFn: ({ signal }) => apiGet<{ items: Array<{ id: string; name: string; email: string; is_active: boolean; accepted_at: string | null }> }>(
      "/organiser/members?page=1&page_size=100&status=active", { signal }).then(result => result.items) });
  const canManage = !bootstrap.isError && !bootstrap.isFetching && !!bootstrap.data?.actions.includes("teams:manage");
  const events = useEvents();
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<"member" | "event">("member");
  const [teamId, setTeamId] = useState("");
  const [targetId, setTargetId] = useState("");
  const [permissions, setPermissions] = useState<Record<string, boolean>>({});
  const grantable = useQuery({ queryKey: ["organisation", "team-event-actions", userId, scopeKey, bootstrap.data?.policy_revision, targetId],
    enabled: enabled && open && type === "event" && !!targetId, retry: false, staleTime: 0,
    queryFn: ({ signal }) => apiGet<{ event_id: string; actions: string[] }>("/organiser/teams/event-actions",
      { signal, params: { event_id: targetId } }) });
  const [error, setError] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [expectedVersion, setExpectedVersion] = useState<number | null>(null);
  const [needsReview, setNeedsReview] = useState(false);
  const [retryAt, setRetryAt] = useState(0);
  const [seconds, setSeconds] = useState(0);
  const receipt = useRef<{ signature: string; key: string } | null>(null);
  const [removal, setRemoval] = useState<{ kind: "member" | "event"; teamId: string; teamName: string; targetId: string; targetName: string; version: number; preview: any } | null>(null);
  useEffect(() => {
    if (!retryAt) return;
    const tick = () => setSeconds(Math.max(0, Math.ceil((retryAt - Date.now()) / 1000)));
    tick(); const timer = setInterval(tick, 1000); return () => clearInterval(timer);
  }, [retryAt]);
  function headers(payload: object, version: number | null) {
    if (version === null) throw new Error("Review the selected team's current version.");
    const signature = JSON.stringify({ userId, organizationId, payload, version });
    if (receipt.current?.signature !== signature) receipt.current = { signature, key: crypto.randomUUID() };
    return { "If-Match": String(version), "Idempotency-Key": receipt.current.key };
  }
  async function failed(cause: unknown) {
    const problem = cause as ApiError;
    setError(`${problem?.message || "The assignment could not be saved."}${problem?.correlationId ? ` Reference: ${problem.correlationId}` : ""}`);
    if (problem?.retryAfter) setRetryAt(Date.now() + problem.retryAfter * 1000);
    if (problem?.status === 412) { setNeedsReview(true); await teams.refetch(); }
  }
  const refresh = () => client.invalidateQueries({ queryKey: ["organisation", "teams"] });
  const assign = useMutation({ retry: false, mutationFn: () => { if (!canManage || needsReview || seconds > 0 || teams.isFetching || (type === "event" && (grantable.isFetching || grantable.isError || !grantable.data))) throw new Error("Review access and team version before saving."); return type === "member" ? apiClient.post(`/organiser/teams/${teamId}/members/${targetId}`, { reason }, { headers: headers({ teamId, targetId, assigned: true, reason }, expectedVersion) }) : apiClient.put(`/organiser/teams/${teamId}/events/${targetId}`, { permissions, reason }, { headers: headers({ teamId, targetId, assigned: true, permissions, reason }, expectedVersion) }); }, onSuccess: async () => { receipt.current = null; await refresh(); setOpen(false); setTeamId(""); setTargetId(""); setPermissions({}); setReason(""); setExpectedVersion(null); }, onError: failed });
  const removeMember = useMutation({ retry: false, mutationFn: ({ team, member }: { team: string; member: string }) => { if (!removal || !canManage || needsReview || seconds > 0 || teams.isFetching) throw new Error("Review the saved team version before removing this member."); return apiClient.delete(`/organiser/teams/${team}/members/${member}`, { data: { reason }, headers: headers({ team, member, assigned: false, reason }, removal.version) }); }, onSuccess: async () => { receipt.current = null; await refresh(); toast.success("Member assignment removed."); }, onError: failed });
  const removeEvent = useMutation({ retry: false, mutationFn: ({ team, event }: { team: string; event: string }) => { if (!removal || !canManage || needsReview || seconds > 0 || teams.isFetching) throw new Error("Review the saved team version before removing this event."); return apiClient.delete(`/organiser/teams/${team}/events/${event}`, { data: { reason }, headers: headers({ team, event, assigned: false, reason }, removal.version) }); }, onSuccess: async () => { receipt.current = null; await refresh(); toast.success("Event assignment removed."); }, onError: failed });
  const previewRemoval = async (kind: "member" | "event", teamId: string, teamName: string, targetId: string, targetName: string) => {
    try { const preview = await apiGet<any>(`/organiser/teams/${teamId}/${kind === "member" ? "members" : "events"}/${targetId}/access-loss-preview`); const selected = teams.data?.items.find(team => team.id === teamId); if (!selected) throw new Error("The selected team is no longer loaded."); setRemoval({ kind, teamId, teamName, targetId, targetName, version: selected.version, preview }); setReason(""); setNeedsReview(false); setError(null); receipt.current = null; }
    catch (cause: any) { toast.error(cause?.message || "Access impact could not be calculated."); }
  };
  const confirmRemoval = () => { if (!removal || !canManage || needsReview || seconds > 0 || reason.trim().length < 3 || teams.isFetching) return; if (removal.kind === "member") removeMember.mutate({ team: removal.teamId, member: removal.targetId }, { onSuccess: () => setRemoval(null) }); else removeEvent.mutate({ team: removal.teamId, event: removal.targetId }, { onSuccess: () => setRemoval(null) }); };
  const submit = (event: FormEvent) => { event.preventDefault(); setError(null); if (!canManage || needsReview || seconds > 0 || reason.trim().length < 3 || teams.isFetching || assign.isPending) return; if (!teamId || !targetId) { setError("Select a team and assignment target."); return; } assign.mutate(); };
  const records = teams.isFetching || teams.isError ? [] : teams.data?.items || [];
  const reviewedTeam = records.find(team => team.id === (removal?.teamId ?? teamId));
  const reviewControls = <div className="space-y-2 text-sm">
    {seconds > 0 && <p role="status">Try again in {seconds} seconds. Your inputs have been kept.</p>}
    {needsReview && <div role="alert">
      <p>This team changed. Review {reviewedTeam?.name ?? "the saved team"} and version {reviewedTeam?.version ?? "unavailable"} before retrying.</p>
      <Button type="button" variant="outline" disabled={!reviewedTeam || teams.isFetching} onClick={() => {
        if (!reviewedTeam) return;
        if (removal && !(removal.kind === "member" ? reviewedTeam.members.some(member => member.member_id === removal.targetId)
          : reviewedTeam.events.some(event => event.event_id === removal.targetId))) {
          setError("This assignment is no longer present. Cancel and review the saved list."); return;
        }
        setExpectedVersion(reviewedTeam.version);
        setRemoval(current => current ? { ...current, version: reviewedTeam.version } : null);
        receipt.current = null; setNeedsReview(false); setError(null);
      }}>Use reviewed version</Button>
    </div>}
  </div>;

  return <PeoplePage actions={<Button disabled={!canManage || teams.isFetching || members.isFetching} onClick={() => { setOpen(true); setReason(""); setNeedsReview(false); setError(null); receipt.current = null; }}><Plus className="mr-2 h-4 w-4" />Add assignment</Button>}>
    <Panel title="Member assignments" className="p-0"><DataTable columns={["Team", "Member", "Email", "Action"]} rows={records.flatMap((team) => team.members.map((member) => [team.name, member.name, member.email, <Button key={`${team.id}-${member.member_id}`} size="icon" variant="outline" title="Review removal impact" disabled={!canManage || teams.isFetching || removeMember.isPending || removeEvent.isPending} onClick={() => previewRemoval("member", team.id, team.name, member.member_id, member.name)}><X className="h-3.5 w-3.5" /></Button>]))} empty={teams.isError ? "Team assignments are unavailable." : "No member assignments found."} /></Panel>
    <Panel title="Event capability assignments" className="p-0"><DataTable columns={["Team", "Event", "Capabilities", "Action"]} rows={records.flatMap((team) => team.events.map((event) => [team.name, event.event_name, describeTeamPermissions(event), <Button key={`${team.id}-${event.event_id}`} size="icon" variant="outline" title="Review removal impact" disabled={!canManage || teams.isFetching || removeMember.isPending || removeEvent.isPending} onClick={() => previewRemoval("event", team.id, team.name, event.event_id, event.event_name)}><X className="h-3.5 w-3.5" /></Button>]))} empty={teams.isError ? "Event assignments are unavailable." : "No event assignments found."} /></Panel>
    <Dialog open={open} onOpenChange={value => { if (!assign.isPending) setOpen(value); }}><DialogContent className="max-w-md"><form onSubmit={submit} className="space-y-5"><DialogHeader><DialogTitle>Assign organiser team</DialogTitle><DialogDescription>Add a member or grant a team event capabilities.</DialogDescription></DialogHeader><label className="block text-sm font-medium text-[var(--op-text)]">Assignment type<select className="op-select mt-2 w-full" value={type} onChange={(event) => { setType(event.target.value as "member" | "event"); setTargetId(""); setPermissions({}); }}><option value="member">Member</option><option value="event">Event capabilities</option></select></label><label className="block text-sm font-medium text-[var(--op-text)]">Team<select className="op-select mt-2 w-full" value={teamId} onChange={event => { setTeamId(event.target.value); setExpectedVersion(records.find(team => team.id === event.target.value)?.version ?? null); }}><option value="">Select team</option>{records.map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}</select></label><label className="block text-sm font-medium text-[var(--op-text)]">{type === "member" ? "Member" : "Event"}<select className="op-select mt-2 w-full" value={targetId} onChange={event => { setTargetId(event.target.value); setPermissions({}); }}><option value="">Select {type}</option>{type === "member" ? (members.data || []).filter(member => member.is_active && !!member.accepted_at).map((member) => <option key={member.id} value={member.id}>{member.name} ({member.email})</option>) : (events.data || []).map((event) => <option key={event.id} value={event.id}>{event.name}</option>)}</select></label>{type === "event" && targetId ? <fieldset disabled={assign.isPending || grantable.isFetching || needsReview} className="space-y-2"><legend>Event permission overrides</legend>{grantable.isFetching && <p role="status">Loading grantable actions…</p>}{grantable.isError && <p role="alert">Grantable actions are unavailable. <Button type="button" variant="outline" onClick={() => void grantable.refetch()}>Retry loading</Button></p>}{!grantable.isFetching && grantable.data && <div className="max-h-56 space-y-1 overflow-y-auto">{grantable.data.actions.map(code => <label key={code} className="flex items-center justify-between gap-2 text-sm"><span>{code}</span><select aria-label={code} value={permissions[code] === true ? "allow" : permissions[code] === false ? "deny" : "inherit"} onChange={event => setPermissions(current => { const next = { ...current }; if (event.target.value === "inherit") delete next[code]; else next[code] = event.target.value === "allow"; return next; })}><option value="inherit">No team override</option><option value="allow">Allow</option><option value="deny">Deny</option></select></label>)}</div>}<p className="text-sm">Save replaces this team’s event overrides. Billing and organisation administration are excluded.</p></fieldset> : null}<label className="block text-sm font-medium">Reason<Input maxLength={2000} value={reason} onChange={event => setReason(event.target.value)} disabled={assign.isPending} /></label>{error ? <p role="alert" className="text-sm text-[var(--op-danger)]">{error}</p> : null}{reviewControls}<DialogFooter><Button type="button" variant="outline" disabled={assign.isPending} onClick={() => setOpen(false)}>Cancel</Button><Button type="submit" disabled={assign.isPending || !canManage || needsReview || seconds > 0 || reason.trim().length < 3 || teams.isFetching || !expectedVersion || !targetId || Object.keys(permissions).length > 100 || (type === "event" && (grantable.isFetching || grantable.isError || !grantable.data))}>{assign.isPending ? "Saving..." : "Save assignment"}</Button></DialogFooter></form></DialogContent></Dialog>
    <Dialog open={Boolean(removal)} onOpenChange={(value) => { if (!value && !removeMember.isPending && !removeEvent.isPending) setRemoval(null); }}><DialogContent className="max-w-lg"><DialogHeader><DialogTitle>Review assignment removal</DialogTitle><DialogDescription>Remove {removal?.targetName} from {removal?.teamName} after reviewing the recorded team binding.</DialogDescription></DialogHeader><p className="text-sm">This is a partial team-binding preview, not a complete access decision. Other roles, scopes and explicit denials may change effective access.</p>{removal?.preview.requires_owner_reassignment ? <p className="rounded-md border border-[var(--op-danger)] p-3 text-sm text-[var(--op-danger)]">Reassign the team owner before removing this member.</p> : null}{removal?.kind === "member" ? <div className="space-y-2">{removal.preview.impacted_events?.length ? removal.preview.impacted_events.map((impact: any) => <div key={impact.event_id} className="rounded-md border border-[var(--op-border)] p-3"><strong>{impact.event_name}</strong><p className="text-sm text-[var(--op-muted)]">Lost capabilities: {impact.lost_capabilities.join(", ")}</p></div>) : <p className="text-sm text-[var(--op-muted)]">No loss was identified in this preview. The current permission check remains authoritative.</p>}</div> : <div className="space-y-2">{removal?.preview.impacted_members?.length ? <><strong>{removal.preview.impacted_members.length} members lose event access</strong><p className="text-sm text-[var(--op-muted)]">Capabilities: {Array.from(new Set(removal.preview.impacted_members.flatMap((impact: any) => impact.lost_capabilities))).join(", ")}</p></> : <p className="text-sm text-[var(--op-muted)]">No loss was identified in this preview. Other access sources and denials may change the result.</p>}</div>}<label className="block text-sm font-medium">Reason<Input maxLength={2000} value={reason} onChange={event => setReason(event.target.value)} disabled={removeMember.isPending || removeEvent.isPending} /></label>{error && <p role="alert">{error}</p>}{reviewControls}<DialogFooter><Button variant="outline" disabled={removeMember.isPending || removeEvent.isPending} onClick={() => setRemoval(null)}>Cancel</Button><Button disabled={!canManage || needsReview || seconds > 0 || reason.trim().length < 3 || teams.isFetching || Boolean(removal?.preview.requires_owner_reassignment) || removeMember.isPending || removeEvent.isPending} onClick={confirmRemoval}>Confirm removal</Button></DialogFooter></DialogContent></Dialog>
  </PeoplePage>;
}
