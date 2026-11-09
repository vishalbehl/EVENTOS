"use client";

import { useParams } from "next/navigation";
import { useState } from "react";
import { ApiError } from "@/lib/api-client";
import { Users2, UserPlus, Check, X, MoreHorizontal, Search } from "lucide-react";
import { useOrganizationDomain, useOrganizationMemberDirectory, useOrganizationEvents, useInviteOrganizationMember, useUpdateOrganizationMember, useRemoveOrganizationMember, useSetOrganizationMemberEvent, useReplaceOrganizationInvitation } from "@/features/organizations/api/organization-console-api";
import { GovernedActionButton } from "@/features/organizations/components/GovernedActionButton";
import { TeamManagementPanel } from "@/features/organizations/components/TeamManagementPanel";
import { toast } from "sonner";
import {
  OrgPageHeader, OrgMetricCard, OrgCard, OrgTabBar, OrgDataTable,
  OrgStatusBadge, OrgSectionTitle, UnavailableDomain, LoadingPage,
} from "@/features/organizations/components/OrgPageShared";

export default function MembersPageScreen() {
  const params = useParams<{ orgId: string }>();
  return <MembersContent key={params.orgId} orgId={params.orgId} />;
}

function MembersContent({ orgId }: { orgId: string }) {
  const [activeTab, setActiveTab] = useState("members");
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [showInvite, setShowInvite] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("member");
  const [inviteReason, setInviteReason] = useState("");
  const [roleDrafts, setRoleDrafts] = useState<Record<string, string>>({});
  const [eventDrafts, setEventDrafts] = useState<Record<string, string>>({});
  const [issuedToken, setIssuedToken] = useState<string | null>(null);
  const [invitationCommitted, setInvitationCommitted] = useState(false);
  const [needsReview, setNeedsReview] = useState<Record<string, boolean>>({});
  const [cursors, setCursors] = useState<Array<string | null>>([null]);
  const [pageIndex, setPageIndex] = useState(0);
  const directoryQuery = useOrganizationMemberDirectory(orgId, cursors[pageIndex]);

  const membersQuery = useOrganizationDomain(orgId, "members");
  const { data, isLoading } = membersQuery;
  const inviteMember = useInviteOrganizationMember(orgId);
  const updateMember = useUpdateOrganizationMember(orgId);
  const removeMember = useRemoveOrganizationMember(orgId);
  const replaceInvitation = useReplaceOrganizationInvitation(orgId);
  const setMemberEvent = useSetOrganizationMemberEvent(orgId);
  const { data: events = [] } = useOrganizationEvents(orgId);

  async function lifecycle(memberId: string, command: () => Promise<void>) {
    if (needsReview[memberId] || membersQuery.isFetching || directoryQuery.isFetching) throw new Error("Review the current membership before confirming.");
    try { await command(); }
    catch (error) {
      if (error instanceof ApiError && error.status === 412) {
        setNeedsReview(current => ({ ...current, [memberId]: true }));
        await membersQuery.refetch();
        await directoryQuery.refetch();
      }
      throw error;
    }
  }

  if (isLoading || directoryQuery.isLoading) return <LoadingPage />;
  if (membersQuery.isError || directoryQuery.isError) return <UnavailableDomain reason="Membership access could not be verified. Cached rows are not displayed." />;

  const domainData = data?.data as any;
  const members = directoryQuery.data?.items ?? [];
  const total: number = domainData?.total ?? 0;

  const filteredMembers = members.filter((m) => {
    const q = search.toLowerCase();
    const matchSearch =
      !search ||
      m.email?.toLowerCase().includes(q) ||
      m.first_name?.toLowerCase().includes(q) ||
      m.last_name?.toLowerCase().includes(q);
    const matchRole = !roleFilter || m.org_role?.toUpperCase() === roleFilter.toUpperCase();
    const matchStatus = !statusFilter || (m.accepted_at && m.is_active ? "active" : "inactive") === statusFilter;
    return matchSearch && matchRole && matchStatus;
  });

  const activeCount = members.filter((m) => m.is_active && m.accepted_at).length;
  const mfaCount = members.filter((m) => m.is_2fa_enabled).length;
  const pendingCount = members.filter((m) => !m.accepted_at).length;

  const handleInvite = async () => {
    if (inviteMember.isPending || invitationCommitted) return;
    if (!inviteEmail || inviteReason.trim().length < 12) {
      toast.error("Email and a reason of at least 12 characters are required.");
      return;
    }
    try {
      const result = await inviteMember.mutateAsync({ email: inviteEmail, org_role: inviteRole.toLowerCase(), reason: inviteReason });
      setIssuedToken(result.invite_token);
      setInvitationCommitted(true);
      toast.success("Invitation created for manual sharing; no email delivery is implied.");
    } catch (e: any) {
      toast.error(e?.message || "Failed to send invitation");
    }
  };

  if (!data?.availability?.available) {
    return <UnavailableDomain reason={data?.availability?.reason} />;
  }

  return (
    <div className="p-6 space-y-6">
      <OrgPageHeader
        icon={Users2}
        title="Members & Teams"
        description="Manage your organization members, roles, and teams."
        generatedAt={data?.generated_at}
        actions={
          <button
            onClick={() => { setIssuedToken(null); setInvitationCommitted(false); setInviteEmail(""); setInviteReason(""); setShowInvite(true); }}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[var(--brand-primary)] text-[var(--primary-contrast)] text-xs font-bold hover:bg-[var(--brand-primary-hover)] transition-colors"
          >
            <UserPlus className="w-3.5 h-3.5" />
            Invite Member
          </button>
        }
      />

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <OrgMetricCard label="Total Members" value={total} />
        <OrgMetricCard label="Active Members" value={activeCount} />
        <OrgMetricCard label="MFA Enabled" value={mfaCount} sub={`of ${activeCount} active`} />
        <OrgMetricCard label="Pending Invites" value={pendingCount} />
      </div>

      {/* Invite Panel */}
      {showInvite && (
        <OrgCard>
          <OrgSectionTitle>Send Invitation</OrgSectionTitle>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <input
              type="email"
              disabled={inviteMember.isPending || invitationCommitted}
              placeholder="Email address *"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              className="rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface-3)] px-3 py-2 text-xs text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:outline-none focus:border-[var(--brand-primary)]/40"
            />
            <select
              disabled={inviteMember.isPending || invitationCommitted}
              value={inviteRole}
              onChange={(e) => setInviteRole(e.target.value)}
              className="rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface-3)] px-3 py-2 text-xs text-[var(--text-secondary)] focus:outline-none focus:border-[var(--brand-primary)]/40"
            >
              <option value="admin">Admin</option>
              <option value="member">Member</option>
              <option value="billing_only">Billing only</option>
            </select>
            <input
              type="text"
              disabled={inviteMember.isPending || invitationCommitted}
              placeholder="Reason (min 12 chars) *"
              value={inviteReason}
              onChange={(e) => setInviteReason(e.target.value)}
              className="rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface-3)] px-3 py-2 text-xs text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:outline-none focus:border-[var(--brand-primary)]/40"
            />
            <div className="flex gap-2">
              <button
                onClick={handleInvite}
                disabled={inviteMember.isPending || invitationCommitted}
                className="flex-1 flex items-center justify-center gap-1 rounded-xl bg-[var(--brand-primary)] text-[var(--primary-contrast)] text-xs font-bold py-2 hover:bg-[var(--brand-primary-hover)] transition-colors disabled:opacity-40"
              >
                <Check className="w-3.5 h-3.5" />
                Send
              </button>
              <button
                disabled={inviteMember.isPending}
                onClick={() => setShowInvite(false)}
                className="px-3 rounded-xl border border-[var(--border-default)] text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
          {invitationCommitted && <div role="status" className="mt-3 space-y-2 text-xs">
            <p>{issuedToken ? "Share this one-time token with the intended recipient through the organiser portal invitation acceptance flow." : "The invitation was already committed. Its secret is not stored for replay; request a replacement link instead of issuing a duplicate invitation."}</p>
            {issuedToken && <><p className="break-all font-mono">{issuedToken}</p><button type="button" onClick={() => navigator.clipboard.writeText(issuedToken)}>Copy one-time token</button></>}
          </div>}
        </OrgCard>
      )}

      {/* Tab Bar */}
      <OrgTabBar
        tabs={[{ key: "members", label: "Members" }, { key: "teams", label: "Teams" }]}
        active={activeTab}
        onChange={setActiveTab}
      />

      {/* Filters */}
      <div className="flex items-center gap-3 text-xs"><p>Page {pageIndex + 1} · active, MFA and pending counts describe this page. Search and filters apply to this page.</p>
        <button disabled={pageIndex === 0 || directoryQuery.isFetching} onClick={() => setPageIndex(index => index - 1)}>Previous</button>
        <button disabled={!directoryQuery.data?.next_cursor || directoryQuery.isFetching} onClick={() => { const next = directoryQuery.data?.next_cursor; if (!next) return; setCursors(current => [...current.slice(0, pageIndex + 1), next]); setPageIndex(index => index + 1); }}>Next</button>
      </div>
      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[var(--text-tertiary)]" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search members…"
            className="w-full pl-9 pr-4 py-2 rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface)] text-xs text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:outline-none focus:border-[var(--brand-primary)]/40"
          />
        </div>
        <select
          value={roleFilter}
          onChange={(e) => setRoleFilter(e.target.value)}
          className="rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface)] text-xs text-[var(--text-secondary)] px-3 py-2 focus:outline-none"
        >
          <option value="">All Roles</option>
          <option value="OWNER">Owner</option>
          <option value="ADMIN">Admin</option>
          <option value="MEMBER">Member</option>
          <option value="BILLING_ONLY">Billing only</option>
        </select>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface)] text-xs text-[var(--text-secondary)] px-3 py-2 focus:outline-none"
        >
          <option value="">All Statuses</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </select>
      </div>

      {activeTab === "members" && (
        <OrgDataTable
          columns={[
            { key: "member", header: "Member", render: (m: any) => (
              <div>
                <p className="text-xs font-bold text-[var(--text-primary)]">
                  {m.first_name} {m.last_name}
                </p>
                <p className="text-[10px] text-[var(--text-tertiary)]">{m.email}</p>
              </div>
            )},
            { key: "role", header: "Role", render: (m: any) => (
              <span className="text-xs font-bold text-[var(--text-secondary)]">{m.org_role || m.role || "—"}</span>
            )},
            { key: "mfa", header: "MFA", render: (m: any) => (
              <span className={`text-[10px] font-bold ${m.is_2fa_enabled ? "text-[var(--status-success)]" : "text-[var(--text-tertiary)]"}`}>
                {m.is_2fa_enabled ? "Enabled" : "Disabled"}
              </span>
            )},
            { key: "status", header: "Status", render: (m: any) => (
              <OrgStatusBadge status={m.invitation_state ?? "UNAVAILABLE"} />
            )},
            { key: "joined", header: "Joined", render: (m: any) => (
              <span className="text-[10px] text-[var(--text-tertiary)] font-mono">
                {m.accepted_at ? new Date(m.accepted_at).toLocaleDateString() : "Pending"}
              </span>
            )},
            { key: "last_active", header: "Last Active", render: (m: any) => (
              <span className="text-[10px] text-[var(--text-tertiary)] font-mono">
                {m.last_login_at ? new Date(m.last_login_at).toLocaleDateString() : "—"}
              </span>
            )},
            { key: "events", header: "Event access", render: (m: any) => <div className="min-w-48 space-y-2"><p className="text-[10px] text-[var(--text-tertiary)]">{m.event_ids?.length ?? 0} assigned</p>{m.user_id ? <div className="flex gap-1"><select aria-label={`Event assignment for ${m.email}`} value={eventDrafts[m.id] ?? ""} onChange={event => setEventDrafts(current => ({ ...current, [m.id]: event.target.value }))} className="min-w-0 flex-1 rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface-3)] px-2 py-1 text-[10px]"><option value="">Select event</option>{events.map((event: any) => <option key={event.id} value={event.id}>{event.name}</option>)}</select>{eventDrafts[m.id] && <GovernedActionButton disabled={!m.accepted_at || !m.is_active || !!needsReview[m.id] || directoryQuery.isFetching || setMemberEvent.isPending} label={m.event_ids?.includes(eventDrafts[m.id]) ? "Remove" : "Grant read access"} title={`${m.event_ids?.includes(eventDrafts[m.id]) ? "Remove" : "Assign"} event access`} requireCaseReference={false} className="text-[10px] font-bold text-[var(--brand-primary)]" onConfirm={({ reason }) => lifecycle(m.id, () => setMemberEvent.mutateAsync({ memberId: m.id, eventId: eventDrafts[m.id], assigned: !m.event_ids?.includes(eventDrafts[m.id]), reason, version: m.version }).then(() => undefined))} />}</div> : <p className="text-[10px] text-[var(--text-tertiary)]">Invitation must be accepted first.</p>}</div> },
            { key: "actions", header: "Administration", render: (m: any) => <div className="min-w-44 space-y-2">
              {!m.accepted_at && m.is_active && <GovernedActionButton label="Replace invitation" title="Invalidate the previous invitation and issue a new one-time token" requireCaseReference={false} disabled={!!needsReview[m.id] || directoryQuery.isFetching || replaceInvitation.isPending} onConfirm={({ reason }) => lifecycle(m.id, async () => {
                const result = await replaceInvitation.mutateAsync({ memberId: m.id, reason, version: m.version });
                setIssuedToken(result.invite_token); setInvitationCommitted(true); setShowInvite(true);
              })} />}
              {m.org_role === "owner" ? <p className="text-[10px]">Ownership changes require the accepted owner’s transfer flow.</p> : <>
                <select aria-label={`Role for ${m.email}`} disabled={!m.accepted_at || !m.is_active || !!needsReview[m.id] || updateMember.isPending} value={roleDrafts[m.id] ?? m.org_role} onChange={event => setRoleDrafts(current => ({ ...current, [m.id]: event.target.value }))} className="w-full rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface-3)] px-2 py-1 text-[10px]">
                  <option value="admin">Admin</option><option value="member">Member</option><option value="billing_only">Billing only</option>
                </select>
                <div className="flex gap-2">
                  <GovernedActionButton label="Save role" title="Change organization role" requireCaseReference={false} disabled={!m.accepted_at || !m.is_active || !!needsReview[m.id] || membersQuery.isFetching || updateMember.isPending || (roleDrafts[m.id] ?? m.org_role) === m.org_role} className="text-[10px] font-bold text-[var(--brand-primary)] disabled:opacity-40" onConfirm={({ reason }) => lifecycle(m.id, () => updateMember.mutateAsync({ memberId: m.id, orgRole: roleDrafts[m.id] ?? m.org_role, reason, version: m.version }).then(() => undefined))} />
                  <GovernedActionButton label="Suspend membership" title="Suspend this organisation membership only" requireCaseReference={false} confirmationText={m.email} disabled={!m.accepted_at || !m.is_active || !!needsReview[m.id] || membersQuery.isFetching || removeMember.isPending} className="text-[10px] font-bold text-[var(--status-danger)]" onConfirm={({ reason }) => lifecycle(m.id, () => removeMember.mutateAsync({ memberId: m.id, reason, version: m.version }).then(() => undefined))} />
                </div>
              </>}
              {needsReview[m.id] && <p role="alert" className="text-xs">Membership changed. Review role {m.org_role} and version {m.version}. <button disabled={membersQuery.isFetching} onClick={() => { setRoleDrafts(current => ({ ...current, [m.id]: m.org_role })); setNeedsReview(current => ({ ...current, [m.id]: false })); }}>Use reviewed version</button></p>}
            </div> },
          ]}
          rows={filteredMembers}
          keyFn={(m: any) => m.id}
          emptyMessage="No members found"
        />
      )}

      {activeTab === "teams" && (
        <TeamManagementPanel orgId={orgId} members={members as any} events={events} />
      )}
    </div>
  );
}
