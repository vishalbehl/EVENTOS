"use client";

import { useState } from "react";
import { ApiError } from "@/lib/api-client";
import { toast } from "sonner";
import { useArchiveOrganizationTeam, useCreateOrganizationTeam, useOrganizationTeams, useSetOrganizationTeamMember, useUpdateOrganizationTeam } from "@/features/organizations/api/organization-console-api";
import { GovernedActionButton } from "./GovernedActionButton";
import { TeamEventControls } from "./TeamEventControls";
import { OrgCard, OrgSectionTitle, OrgStatusBadge, UnavailableDomain } from "./OrgPageShared";

type Member = { id: string; email?: string; first_name?: string; last_name?: string };
type EventItem = { id: string; name?: string; slug?: string };

export function TeamManagementPanel({ orgId, members, events }: { orgId: string; members: Member[]; events: EventItem[] }) {
  const teamsQuery = useOrganizationTeams(orgId);
  const createTeam = useCreateOrganizationTeam(orgId);
  const updateTeam = useUpdateOrganizationTeam(orgId);
  const archiveTeam = useArchiveOrganizationTeam(orgId);
  const setMember = useSetOrganizationTeamMember(orgId);
  const [draft, setDraft] = useState({ name: "", description: "", reason: "" });
  const [memberDrafts, setMemberDrafts] = useState<Record<string, string>>({});
  const [detailDrafts, setDetailDrafts] = useState<Record<string, { name: string; description: string }>>({});
  const [needsReview, setNeedsReview] = useState<Record<string, boolean>>({});
  async function lifecycle(teamId: string, command: () => Promise<void>) {
    if (needsReview[teamId] || teamsQuery.isFetching) throw new Error("Review the current team version before confirming this action.");
    try { await command(); }
    catch (cause) {
      if (cause instanceof ApiError && cause.status === 412) {
        setNeedsReview(current => ({ ...current, [teamId]: true }));
        await teamsQuery.refetch();
      }
      throw cause;
    }
  }

  if (teamsQuery.isError) return <UnavailableDomain reason="Team records could not be loaded; no empty state is inferred." />;
  const teams = teamsQuery.data?.items ?? [];
  const submitCreate = async () => { try { await createTeam.mutateAsync(draft); setDraft({ name: "", description: "", reason: "" }); toast.success("Team created"); } catch (error) { toast.error(error instanceof Error ? error.message : "Team creation failed"); } };
  return <div className="space-y-4">
    <OrgCard><OrgSectionTitle>Create team</OrgSectionTitle><div className="mt-3 grid gap-2 md:grid-cols-3"><input aria-label="Team name" value={draft.name} onChange={event => setDraft(value => ({ ...value, name: event.target.value }))} placeholder="Team name" className="rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface-3)] px-3 py-2 text-xs" /><input aria-label="Team description" value={draft.description} onChange={event => setDraft(value => ({ ...value, description: event.target.value }))} placeholder="Responsibility" className="rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface-3)] px-3 py-2 text-xs" /><input aria-label="Team creation reason" value={draft.reason} onChange={event => setDraft(value => ({ ...value, reason: event.target.value }))} placeholder="Administrative reason" className="rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface-3)] px-3 py-2 text-xs" /></div><button disabled={draft.name.trim().length < 2 || draft.reason.trim().length < 12 || createTeam.isPending} onClick={submitCreate} className="mt-3 rounded-xl bg-[var(--brand-primary)] px-4 py-2 text-xs font-bold text-[var(--primary-contrast)] disabled:opacity-40">Create team</button></OrgCard>
    {teamsQuery.isLoading && <p className="text-xs text-[var(--text-tertiary)]">Loading teams…</p>}
    {teams.map(team => { const details = detailDrafts[team.id] ?? { name: team.name, description: team.description ?? "" }; const changed = details.name !== team.name || details.description !== (team.description ?? ""); return <OrgCard key={team.id}><div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-64 flex-1"><OrgSectionTitle>{team.name}</OrgSectionTitle><div className="mt-2 grid gap-2 md:grid-cols-2"><input aria-label={`Name for ${team.name}`} value={details.name} onChange={event => setDetailDrafts(value => ({ ...value, [team.id]: { ...details, name: event.target.value } }))} className="rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface-3)] px-2 py-1.5 text-xs" /><input aria-label={`Description for ${team.name}`} value={details.description} onChange={event => setDetailDrafts(value => ({ ...value, [team.id]: { ...details, description: event.target.value } }))} className="rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface-3)] px-2 py-1.5 text-xs" /></div><p className="mt-1 font-mono text-[10px] text-[var(--text-tertiary)]">v{team.version} · {team.member_ids.length} members · {team.events.length} events</p></div><div className="flex gap-2"><GovernedActionButton label="Save details" title="Update organization team" requireCaseReference={false} disabled={!changed || details.name.trim().length < 2 || !!needsReview[team.id] || teamsQuery.isFetching} className="text-xs font-bold text-[var(--brand-primary)] disabled:opacity-40" onConfirm={({ reason }) => lifecycle(team.id, () => updateTeam.mutateAsync({ teamId: team.id, version: team.version, name: details.name, description: details.description, reason }).then(() => { setDetailDrafts(value => { const next = { ...value }; delete next[team.id]; return next; }); }))} /><GovernedActionButton label="Archive" title="Archive organization team" requireCaseReference={false} confirmationText={team.name} disabled={!!needsReview[team.id] || teamsQuery.isFetching} className="text-xs font-bold text-[var(--status-danger)]" onConfirm={({ reason }) => lifecycle(team.id, () => archiveTeam.mutateAsync({ teamId: team.id, version: team.version, reason }).then(() => undefined))} /></div></div>
      {needsReview[team.id] && <p role="alert" className="mt-3 text-xs">This team changed. Review the saved name {team.name} and version {team.version} before retrying. <button type="button" disabled={teamsQuery.isFetching} onClick={() => setNeedsReview(current => ({ ...current, [team.id]: false }))}>Use reviewed version</button></p>}
      <div className="mt-4 grid gap-4 lg:grid-cols-2"><div><p className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">Members</p><div className="mt-2 flex gap-2"><select aria-label={`Member for ${team.name}`} value={memberDrafts[team.id] ?? ""} onChange={event => setMemberDrafts(value => ({ ...value, [team.id]: event.target.value }))} className="min-w-0 flex-1 rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface-3)] px-2 py-1.5 text-xs"><option value="">Select member</option>{members.map(member => <option key={member.id} value={member.id}>{member.first_name} {member.last_name} ({member.email})</option>)}</select>{memberDrafts[team.id] && <GovernedActionButton label={team.member_ids.includes(memberDrafts[team.id]) ? "Remove" : "Add"} title={`${team.member_ids.includes(memberDrafts[team.id]) ? "Remove member from" : "Add member to"} ${team.name}`} requireCaseReference={false} className="text-xs font-bold text-[var(--brand-primary)]" disabled={!!needsReview[team.id] || teamsQuery.isFetching || setMember.isPending} onConfirm={({ reason }) => lifecycle(team.id, () => setMember.mutateAsync({ teamId: team.id, memberId: memberDrafts[team.id], assigned: !team.member_ids.includes(memberDrafts[team.id]), version: team.version, reason }).then(() => undefined))} />}</div><div className="mt-2 flex flex-wrap gap-1">{team.member_ids.map(id => <OrgStatusBadge key={id} status={members.find(member => member.id === id)?.email ?? id.slice(0, 8)} />)}</div></div>
      <div><p className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">Event assignments</p><TeamEventControls key={`${orgId}:${team.id}`} orgId={orgId} team={team} events={events} blocked={!!needsReview[team.id] || teamsQuery.isFetching} lifecycle={lifecycle} /></div></div>
    </OrgCard>; })}
    {!teamsQuery.isLoading && teams.length === 0 && <p className="rounded-xl border border-[var(--border-default)] p-6 text-center text-xs text-[var(--text-tertiary)]">No teams have been created.</p>}
  </div>;
}
