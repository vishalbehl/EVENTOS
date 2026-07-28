"use client";

import { useParams } from "next/navigation";
import { useState } from "react";
import { Users2, UserPlus, Check, X, MoreHorizontal, Search } from "lucide-react";
import { useOrganizationDomain, useOrganizationEvents, useInviteOrganizationMember, useUpdateOrganizationMember, useRemoveOrganizationMember, useSetOrganizationMemberEvent } from "@/features/organizations/api/organization-console-api";
import { GovernedActionButton } from "@/features/organizations/components/GovernedActionButton";
import { TeamManagementPanel } from "@/features/organizations/components/TeamManagementPanel";
import { toast } from "sonner";
import {
  OrgPageHeader, OrgMetricCard, OrgCard, OrgTabBar, OrgDataTable,
  OrgStatusBadge, OrgSectionTitle, UnavailableDomain, LoadingPage,
} from "@/features/organizations/components/OrgPageShared";

export default function MembersPageScreen() {
  const params = useParams<{ orgId: string }>();
  const orgId = params.orgId;
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

  const { data, isLoading } = useOrganizationDomain(orgId, "members");
  const inviteMember = useInviteOrganizationMember(orgId);
  const updateMember = useUpdateOrganizationMember(orgId);
  const removeMember = useRemoveOrganizationMember(orgId);
  const setMemberEvent = useSetOrganizationMemberEvent(orgId);
  const { data: events = [] } = useOrganizationEvents(orgId);

  if (isLoading) return <LoadingPage />;

  const domainData = data?.data as any;
  const members: any[] = domainData?.items ?? [];
  const total: number = domainData?.total ?? 0;

  const filteredMembers = members.filter((m) => {
    const q = search.toLowerCase();
    const matchSearch =
      !search ||
      m.email?.toLowerCase().includes(q) ||
      m.first_name?.toLowerCase().includes(q) ||
      m.last_name?.toLowerCase().includes(q);
    const matchRole = !roleFilter || m.org_role?.toUpperCase() === roleFilter.toUpperCase();
    const matchStatus = !statusFilter || (m.is_active ? "active" : "inactive") === statusFilter;
    return matchSearch && matchRole && matchStatus;
  });

  const activeCount = members.filter((m) => m.is_active).length;
  const mfaCount = members.filter((m) => m.is_2fa_enabled).length;
  const pendingCount = members.filter((m) => !m.accepted_at).length;

  const handleInvite = async () => {
    if (!inviteEmail || inviteReason.trim().length < 12) {
      toast.error("Email and a reason of at least 12 characters are required.");
      return;
    }
    try {
      await inviteMember.mutateAsync({ email: inviteEmail, org_role: inviteRole.toLowerCase(), reason: inviteReason });
      toast.success("Invitation sent");
      setShowInvite(false);
      setInviteEmail("");
      setInviteReason("");
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
            onClick={() => setShowInvite(true)}
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
              placeholder="Email address *"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              className="rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface-3)] px-3 py-2 text-xs text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:outline-none focus:border-[var(--brand-primary)]/40"
            />
            <select
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
              placeholder="Reason (min 12 chars) *"
              value={inviteReason}
              onChange={(e) => setInviteReason(e.target.value)}
              className="rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface-3)] px-3 py-2 text-xs text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:outline-none focus:border-[var(--brand-primary)]/40"
            />
            <div className="flex gap-2">
              <button
                onClick={handleInvite}
                disabled={inviteMember.isPending}
                className="flex-1 flex items-center justify-center gap-1 rounded-xl bg-[var(--brand-primary)] text-[var(--primary-contrast)] text-xs font-bold py-2 hover:bg-[var(--brand-primary-hover)] transition-colors disabled:opacity-40"
              >
                <Check className="w-3.5 h-3.5" />
                Send
              </button>
              <button
                onClick={() => setShowInvite(false)}
                className="px-3 rounded-xl border border-[var(--border-default)] text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </OrgCard>
      )}

      {/* Tab Bar */}
      <OrgTabBar
        tabs={[{ key: "members", label: "Members" }, { key: "teams", label: "Teams" }]}
        active={activeTab}
        onChange={setActiveTab}
      />

      {/* Filters */}
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
              <OrgStatusBadge status={m.is_active ? "ACTIVE" : "INACTIVE"} />
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
            { key: "events", header: "Event access", render: (m: any) => <div className="min-w-48 space-y-2"><p className="text-[10px] text-[var(--text-tertiary)]">{m.event_ids?.length ?? 0} assigned</p>{m.user_id ? <div className="flex gap-1"><select aria-label={`Event assignment for ${m.email}`} value={eventDrafts[m.id] ?? ""} onChange={event => setEventDrafts(current => ({ ...current, [m.id]: event.target.value }))} className="min-w-0 flex-1 rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface-3)] px-2 py-1 text-[10px]"><option value="">Select event</option>{events.map((event: any) => <option key={event.id} value={event.id}>{event.name}</option>)}</select>{eventDrafts[m.id] && <GovernedActionButton label={m.event_ids?.includes(eventDrafts[m.id]) ? "Remove" : "Assign"} title={`${m.event_ids?.includes(eventDrafts[m.id]) ? "Remove" : "Assign"} event access`} requireCaseReference={false} className="text-[10px] font-bold text-[var(--brand-primary)]" onConfirm={({ reason }) => setMemberEvent.mutateAsync({ memberId: m.id, eventId: eventDrafts[m.id], assigned: !m.event_ids?.includes(eventDrafts[m.id]), reason }).then(() => undefined)} />}</div> : <p className="text-[10px] text-[var(--text-tertiary)]">Invitation must be accepted first.</p>}</div> },
            { key: "actions", header: "Administration", render: (m: any) => <div className="min-w-44 space-y-2"><select aria-label={`Role for ${m.email}`} value={roleDrafts[m.id] ?? m.org_role} onChange={event => setRoleDrafts(current => ({ ...current, [m.id]: event.target.value }))} className="w-full rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface-3)] px-2 py-1 text-[10px]"><option value="owner">Owner</option><option value="admin">Admin</option><option value="member">Member</option><option value="billing_only">Billing only</option></select><div className="flex gap-2"><GovernedActionButton label="Save role" title="Change organization role" requireCaseReference={false} disabled={(roleDrafts[m.id] ?? m.org_role) === m.org_role} className="text-[10px] font-bold text-[var(--brand-primary)] disabled:opacity-40" onConfirm={({ reason }) => updateMember.mutateAsync({ memberId: m.id, orgRole: roleDrafts[m.id] ?? m.org_role, reason }).then(() => undefined)} />{m.org_role !== "owner" && <GovernedActionButton label="Remove" title="Remove organization member" requireCaseReference={false} confirmationText={m.email} className="text-[10px] font-bold text-[var(--status-danger)]" onConfirm={({ reason }) => removeMember.mutateAsync({ memberId: m.id, reason }).then(() => undefined)} />}</div></div> },
          ]}
          rows={filteredMembers}
          keyFn={(m: any) => m.id}
          emptyMessage="No members found"
        />
      )}

      {activeTab === "teams" && (
        <TeamManagementPanel orgId={orgId} members={members} events={events} />
      )}
    </div>
  );
}
