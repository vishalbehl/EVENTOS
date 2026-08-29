"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Activity, Building2, Calendar, Database, MapPin, Plug, Settings, Users } from "lucide-react";
import { orgApi } from "@/components/organizer/org/org-api";
import { apiGet } from "@/lib/api-client";
import { MetricCard, Panel, QuickActions, StatusBadge } from "../OrganiserPrimitives";
import { Unavailable } from "../OrganiserSection";
import { OrganisationPage } from "./shared";

export function OrganisationOverviewTab() {
  const organisation = useQuery({ queryKey: ["organisation", "me"], queryFn: orgApi.me });
  const members = useQuery({ queryKey: ["organisation", "members"], queryFn: orgApi.members });
  const integrations = useQuery({ queryKey: ["organisation", "integrations"], queryFn: () => apiGet<any>("/organiser/integrations") });
  const activity = useQuery({ queryKey: ["organisation", "overview-activity"], queryFn: () => apiGet<any>("/organiser/audit?page=1&page_size=6") });
  const data = organisation.data;
  const org = data?.organization;
  const storageLimit = data?.plan_limits.storage_gb;
  const storagePct = storageLimit ? Math.min(100, (data.storage_used_gb / storageLimit) * 100) : null;
  const activeIntegrations = (integrations.data?.items || []).filter((item: any) => item.is_active).length;

  return <OrganisationPage>
    {organisation.isError ? <Unavailable>Organisation data is unavailable from the authoritative API.</Unavailable> : null}
    <div className="op-metric-grid">
      <MetricCard label="Team members" value={data?.member_count ?? "Unavailable"} tone="amber" icon={<Users className="h-5 w-5" />} />
      <MetricCard label="Events" value={data?.event_count ?? "Unavailable"} tone="purple" icon={<Calendar className="h-5 w-5" />} />
      <MetricCard label="Storage used" value={data ? `${data.storage_used_gb.toFixed(1)} GB` : "Unavailable"} tone="blue" icon={<Database className="h-5 w-5" />} />
      <MetricCard label="Workspace" value={org ? (org.is_active ? "Active" : "Inactive") : "Unavailable"} tone="green" icon={<Building2 className="h-5 w-5" />} />
    </div>
    <div className="op-content-grid">
      <Panel title="Organisation overview">
        <div className="mb-5 flex items-center gap-4">
          <span className="flex h-14 w-14 items-center justify-center rounded-lg bg-[var(--op-metric-purple)] text-[var(--op-primary)]"><Building2 className="h-7 w-7" /></span>
          <div><p className="text-lg font-extrabold text-[var(--op-text)]">{org?.name || "Unavailable"}</p><p className="text-xs text-[var(--op-muted)]">{org?.slug || "Organisation identifier unavailable"}</p></div>
        </div>
        <dl className="op-detail-list"><dt>Billing email</dt><dd>{org?.billing_email || "Not configured"}</dd><dt>Country</dt><dd>{org?.country || "Not configured"}</dd><dt>Timezone</dt><dd>{org?.timezone || "Not configured"}</dd><dt>Workspace role</dt><dd>{data?.org_role || "Unavailable"}</dd></dl>
      </Panel>
      <Panel title="Quick actions">
        <QuickActions actions={[
          { label: "Update details", href: "/organisation/details", icon: <Settings className="h-4 w-4" /> },
          { label: "Manage branding", href: "/organisation/branding", icon: <Building2 className="h-4 w-4" /> },
          { label: "Add location", href: "/organisation/locations", icon: <MapPin className="h-4 w-4" /> },
          { label: "Manage integrations", href: "/organisation/integrations", icon: <Plug className="h-4 w-4" /> },
        ]} />
      </Panel>
    </div>
    <div className="op-content-grid">
      <Panel title="Team members" action={<Link href="/people-teams/members" className="text-xs font-bold text-[var(--op-primary)]">View all</Link>}>
        <div className="flex flex-wrap gap-2">{(members.data || []).slice(0, 8).map((member) => <StatusBadge key={member.id} status={`${member.name} · ${member.org_role}`} />)}{members.isError ? <Unavailable>Team members are unavailable.</Unavailable> : null}{!members.isLoading && !members.isError && !members.data?.length ? <p className="text-sm text-[var(--op-muted)]">No members found.</p> : null}</div>
      </Panel>
      <Panel title="Workspace usage">
        <div className="space-y-5">
          <div><div className="mb-2 flex justify-between text-xs font-bold text-[var(--op-muted)]"><span>Storage</span><span>{data ? `${data.storage_used_gb.toFixed(1)} GB${storageLimit ? ` / ${storageLimit} GB` : " / Unlimited"}` : "Unavailable"}</span></div><div className="h-2 overflow-hidden rounded-full bg-[var(--op-panel-soft)]"><div className="h-full rounded-full bg-[var(--op-primary)]" style={{ width: `${storagePct ?? (data ? 100 : 0)}%` }} /></div></div>
          <div className="flex items-center justify-between border-t border-[var(--op-border)] pt-4"><span className="flex items-center gap-2 text-sm font-bold text-[var(--op-text)]"><Plug className="h-4 w-4 text-[var(--op-primary)]" />Active integrations</span><span className="text-lg font-extrabold text-[var(--op-text)]">{integrations.isError ? "Unavailable" : activeIntegrations}</span></div>
        </div>
      </Panel>
    </div>
    <Panel title="Recent activity" action={<Link href="/organisation/audit" className="text-xs font-bold text-[var(--op-primary)]">View audit log</Link>}>
      <div className="divide-y divide-[var(--op-border)]">
        {(activity.data?.items || []).map((item: any) => <div key={item.id} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0"><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-[var(--op-panel-soft)] text-[var(--op-primary)]"><Activity className="h-4 w-4" /></span><div className="min-w-0 flex-1"><p className="truncate text-sm font-bold text-[var(--op-text)]">{humanize(item.action)}</p><p className="text-xs text-[var(--op-muted)]">{humanize(item.resource_type)}</p></div><time className="text-xs text-[var(--op-muted)]">{new Date(item.occurred_at).toLocaleString()}</time></div>)}
        {activity.isError ? <Unavailable>Organisation activity is unavailable.</Unavailable> : null}
        {!activity.isLoading && !activity.isError && !activity.data?.items?.length ? <p className="py-5 text-sm text-[var(--op-muted)]">No organisation activity has been recorded yet.</p> : null}
      </div>
    </Panel>
  </OrganisationPage>;
}

function humanize(value: string) {
  return value.replace(/[_-]+/g, " ").toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase());
}
