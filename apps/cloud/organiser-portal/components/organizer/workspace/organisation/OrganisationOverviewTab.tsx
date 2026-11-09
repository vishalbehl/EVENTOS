"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Activity,
  ArrowRight,
  Building2,
  CalendarDays,
  CheckCircle2,
  Circle,
  ExternalLink,
  Globe2,
  KeyRound,
  Layers3,
  Mail,
  MapPin,
  Network,
  Palette,
  Pencil,
  Settings,
  ShieldCheck,
  UserPlus,
  Users,
} from "lucide-react";
import { orgApi } from "@/components/organizer/org/org-api";
import { apiGet } from "@/lib/api-client";
import { usePortalQueryScope } from "@/hooks/useAccessBootstrap";
import { isPlatformSelfSession, useAuthStore } from "@/store/use-auth-store";
import { OrganiserPage, Panel, StatusBadge } from "../OrganiserPrimitives";
import { Unavailable } from "../OrganiserSection";

type MemberSummary = {
  total: number;
  active: number;
  pending: number;
  teams: number;
  role_assignments: number;
};

type AccessSummary = {
  roles_count: number;
  permissions_count: number;
  role_assignments_count: number;
};

type BillingSummary = {
  plan: {
    name: string;
    status: string;
    billing_cycle?: string | null;
    renews_at?: string | null;
    unrestricted?: boolean;
  };
  usage: Record<string, { used: number; max: number | null; source?: string }>;
};

export function OrganisationWorkspaceOverview() {
  const scope = usePortalQueryScope();
  const user = useAuthStore((state) => state.user);
  const platformSelf = useAuthStore(isPlatformSelfSession);
  const displayName = user?.first_name || user?.full_name?.split(" ")[0] || "Organiser";
  const organisation = useQuery({ queryKey: ["organisation", ...scope, "me"], queryFn: orgApi.me });
  const profile = useQuery({ queryKey: ["organisation", ...scope, "profile"], queryFn: () => apiGet<Record<string, any>>("/organiser/organisation/profile") });
  const members = useQuery({
    queryKey: ["organisation", "member-summary", ...scope],
    queryFn: ({ signal }) => apiGet<MemberSummary>("/organiser/members/summary", { signal }),
    retry: false,
  });
  const access = useQuery({
    queryKey: ["access-summary", ...scope],
    queryFn: ({ signal }) => apiGet<AccessSummary>("/rbac/summary", { signal }),
    retry: false,
  });
  const locations = useQuery({
    queryKey: ["organisation", ...scope, "locations", "overview"],
    queryFn: ({ signal }) => apiGet<{ items: any[]; total: number }>("/organiser/locations?limit=100", { signal }),
  });
  const documents = useQuery({
    queryKey: ["organisation", ...scope, "documents", "overview"],
    queryFn: ({ signal }) => apiGet<{ items: any[]; total: number }>("/organiser/documents?page=1&page_size=1", { signal }),
  });
  const billing = useQuery({
    queryKey: ["organisation", ...scope, "workspace-plan-summary", platformSelf ? "internal" : "customer"],
    queryFn: ({ signal }) => apiGet<BillingSummary>(platformSelf ? "/organiser/internal-enterprise/summary" : "/organiser/billing/summary", { signal }),
    retry: false,
  });
  const activity = useQuery({
    queryKey: ["organisation", ...scope, "overview-activity"],
    queryFn: ({ signal }) => apiGet<any>("/organiser/audit?page=1&page_size=6", { signal }),
  });

  const data = organisation.data;
  const org = data?.organization;
  const details = profile.data;
  const address = details?.billing_address || {};
  const plan = billing.data?.plan;
  const usage = billing.data?.usage || {};
  const setupItems = [
    { label: "Organisation Profile", complete: Boolean(details?.name && details?.organization_type && details?.industry) },
    { label: "Branding & Identity", complete: Boolean(details?.logo_url) },
    { label: "Contact & Addresses", complete: Boolean((details?.contact_email || details?.billing_email) && (address.line1 || address.city)) },
    { label: "Preferences", complete: Boolean(details?.country && details?.timezone && details?.currency && details?.date_format && details?.time_format) },
    { label: "Compliance & Legal", complete: Boolean(documents.data?.total || String(details?.verification_status || "").toUpperCase() === "VERIFIED") },
    { label: "Team & Access Setup", complete: Boolean(members.data?.teams && access.data?.roles_count) },
  ];
  const completion = Math.round((setupItems.filter((item) => item.complete).length / setupItems.length) * 100);

  return (
    <OrganiserPage
      eyebrow="Organisation Workspace"
      title={`Welcome back, ${displayName}!`}
      description="Here’s an overview of your organisation, team, plan, and overall activity."
    >
      {organisation.isError ? <Unavailable>Organisation data is unavailable from the authoritative API.</Unavailable> : null}

      <section className="grid gap-4 xl:grid-cols-[1.15fr_.75fr_1.15fr_1fr]" aria-label="Organisation summary">
        <SummaryCard
          icon={<Layers3 />}
          label="Organisation"
          value={org?.name || "Unavailable"}
          footer={<><StatusBadge status={org?.is_active ? "Active" : "Inactive"} /><span>{org?.slug || "Identifier unavailable"}</span></>}
        />
        <SummaryCard
          icon={<Users />}
          label="Team Members"
          value={members.data?.total ?? data?.member_count ?? "Unavailable"}
          footer={<span className="font-semibold text-[var(--status-success)]">{members.data ? `${members.data.active} active${members.data.pending ? ` · ${members.data.pending} pending` : ""}` : "Member totals unavailable"}</span>}
        />
        <SummaryCard
          icon={<Layers3 />}
          label="Active Plan"
          value={plan?.name || data?.commercial.offer_name || "Not configured"}
          action={<Link href="/commercial/overview" className="rounded-full bg-[var(--org-purple-soft)] px-3 py-2 text-xs font-bold text-[var(--org-purple)] transition hover:-translate-y-0.5">Manage Plan</Link>}
          footer={<span>{plan?.unrestricted ? "No expiry" : plan?.renews_at ? `Renews on ${formatDate(plan.renews_at)}` : "Renewal date unavailable"}</span>}
        />
        <SummaryCard
          icon={<Network />}
          label="Associated Units"
          value={locations.isError ? "Unavailable" : locations.data?.total ?? 0}
          footer={<span>Branches / operational units</span>}
        />
      </section>

      <section className="grid gap-4 xl:grid-cols-[1.08fr_.86fr_.92fr]">
        <Panel title="Organisation Health">
          <div className="grid items-center gap-5 sm:grid-cols-[190px_1fr] xl:grid-cols-[1fr_1.08fr]">
            <HealthGauge value={completion} />
            <div className="space-y-2.5">
              {setupItems.map((item) => (
                <div key={item.label} className="flex items-center gap-2.5 text-sm">
                  {item.complete ? <CheckCircle2 className="size-5 shrink-0 text-[var(--status-success)]" /> : <Circle className="size-5 shrink-0 text-[var(--text-tertiary)]" />}
                  <span>{item.label}</span>
                </div>
              ))}
            </div>
          </div>
        </Panel>

        <Panel title="Team & Access" action={<Link href="/people-teams/users" className="inline-flex items-center gap-1 text-xs font-bold">Manage <ArrowRight className="size-3.5" /></Link>}>
          <div className="space-y-2.5">
            <AccessRow icon={<UserPlus />} value={members.data?.total} label="Team Members" />
            <AccessRow icon={<ShieldCheck />} value={access.data?.roles_count} label="Roles" />
            <AccessRow icon={<Users />} value={members.data?.teams} label="Teams" />
            <AccessRow icon={<KeyRound />} value={access.data?.permissions_count} label="Access Policies" />
          </div>
        </Panel>

        <Panel title="Plan Usage" action={<span className="text-xs font-semibold text-[var(--org-muted)]">This Billing Cycle</span>}>
          <div className="space-y-5">
            <UsageRow icon={<CalendarDays />} label="Active Events" used={usage.active_events?.used ?? data?.event_count} max={usage.active_events ? usage.active_events.max : data?.entitlement_limits.events} />
            <UsageRow icon={<Users />} label="Team Members" used={usage.team_members?.used ?? data?.member_count} max={usage.team_members ? usage.team_members.max : data?.entitlement_limits.users} />
            <UsageRow icon={<Mail />} label="Organisation Email Credits" used={usage.organization_email_credits?.used} max={usage.organization_email_credits?.max} />
          </div>
        </Panel>
      </section>

      <section className="grid gap-4 xl:grid-cols-[.92fr_1.08fr]">
        <Panel title="Organisation Details" action={<Link href="/organisation/profile" className="inline-flex items-center gap-1.5 rounded-full border border-[var(--org-hairline)] bg-[var(--org-surface-soft)] px-3 py-1.5 text-xs font-bold"><Pencil className="size-3.5" /> Edit</Link>}>
          <div className="flex items-center gap-4 border-b border-[var(--org-hairline)] pb-4">
            <LogoMark url={details?.logo_url} name={details?.name || org?.name} />
            <div className="min-w-0">
              <p className="truncate text-lg font-bold">{details?.name || org?.name || "Unavailable"}</p>
              <p className="text-xs text-[var(--org-muted)]">{details?.organization_type || "Organisation type not configured"}</p>
              <div className="mt-2"><StatusBadge status={details?.lifecycle_state || (org?.is_active ? "Active" : "Inactive")} /></div>
            </div>
          </div>
          <dl className="mt-3 divide-y divide-[var(--org-hairline)] text-sm">
            <DetailRow icon={<Building2 />} label="Industry" value={details?.industry || "Not configured"} />
            <DetailRow icon={<Globe2 />} label="Website" value={details?.website_url ? <a href={details.website_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[var(--org-purple)] hover:underline">{stripProtocol(details.website_url)} <ExternalLink className="size-3.5" /></a> : "Not configured"} />
            <DetailRow icon={<MapPin />} label="Head Office" value={formatAddress(address)} />
            <DetailRow icon={<CalendarDays />} label="Member Since" value={details?.member_since ? formatDate(details.member_since) : org?.created_at ? formatDate(org.created_at) : "Unavailable"} />
          </dl>
        </Panel>

        <Panel title="Recent Activity" action={<Link href="/organisation/audit" className="rounded-full bg-[var(--org-surface-soft)] px-3 py-1.5 text-xs font-bold">View All</Link>}>
          <ActivityTimeline items={activity.data?.items || []} loading={activity.isLoading} error={activity.isError} />
        </Panel>
      </section>

      <Panel title="Quick Actions" className="organisation-overview-actions">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <QuickAction href="/people-teams/invitations" icon={<UserPlus />} label="Invite Members" />
          <QuickAction href="/access-roles/roles" icon={<ShieldCheck />} label="Manage Roles" />
          <QuickAction href="/organisation/branding" icon={<Palette />} label="Update Branding" />
          <QuickAction href="/organisation/preferences" icon={<Settings />} label="Organisation Settings" />
        </div>
      </Panel>
    </OrganiserPage>
  );
}

function SummaryCard({ icon, label, value, footer, action }: { icon: ReactNode; label: string; value: ReactNode; footer: ReactNode; action?: ReactNode }) {
  return (
    <article data-org-surface className="flex min-h-36 flex-col justify-between p-5">
      <div className="flex items-center gap-3 text-sm text-[var(--org-muted)]"><span className="grid size-9 place-items-center rounded-full bg-[var(--org-purple-soft)] text-[var(--org-purple)] [&_svg]:size-[18px]">{icon}</span><span>{label}</span></div>
      <div className="mt-4 flex items-end justify-between gap-3"><strong className="min-w-0 text-2xl font-bold tracking-[-0.035em]">{value}</strong>{action}</div>
      <div className="mt-3 flex min-h-6 flex-wrap items-center gap-2 text-xs text-[var(--org-muted)]">{footer}</div>
    </article>
  );
}

function HealthGauge({ value }: { value: number }) {
  return (
    <div className="relative mx-auto h-[138px] w-[190px]" role="img" aria-label={`${value}% organisation setup completed`}>
      <svg viewBox="0 0 200 115" className="h-full w-full overflow-visible" aria-hidden>
        <path d="M 20 100 A 80 80 0 0 1 180 100" pathLength="100" fill="none" stroke="var(--org-purple-soft)" strokeWidth="22" strokeLinecap="round" />
        <path d="M 20 100 A 80 80 0 0 1 180 100" pathLength="100" fill="none" stroke="url(#organisation-health-gradient)" strokeWidth="22" strokeLinecap="round" strokeDasharray="100" strokeDashoffset={100 - value} />
        <defs><linearGradient id="organisation-health-gradient" x1="0" x2="1"><stop stopColor="var(--org-purple)" /><stop offset="1" stopColor="#a36cff" /></linearGradient></defs>
      </svg>
      <div className="absolute inset-x-0 bottom-0 text-center"><strong className="block text-3xl font-bold tracking-tight">{value}%</strong><span className="text-xs text-[var(--org-muted)]">Setup Completed</span></div>
    </div>
  );
}

function AccessRow({ icon, value, label }: { icon: ReactNode; value?: number; label: string }) {
  return <div className="grid grid-cols-[32px_44px_1fr] items-center gap-2 rounded-xl border border-[var(--org-hairline)] bg-[var(--org-surface-soft)] px-3 py-2.5 shadow-sm"><span className="text-[var(--org-muted)] [&_svg]:size-[18px]">{icon}</span><strong className="text-lg">{value ?? "—"}</strong><span className="text-sm text-[var(--org-muted)]">{label}</span></div>;
}

function UsageRow({ icon, label, used, max, suffix = "" }: { icon: ReactNode; label: string; used?: number; max?: number | null; suffix?: string }) {
  const pct = max == null ? (used ? 28 : 0) : max > 0 ? Math.min(100, ((used || 0) / max) * 100) : 0;
  return (
    <div className="grid grid-cols-[42px_1fr] gap-3">
      <span className="grid size-10 place-items-center rounded-full bg-[var(--org-surface-soft)] text-[var(--org-ink)] shadow-sm [&_svg]:size-[18px]">{icon}</span>
      <div className="min-w-0"><div className="flex items-center justify-between gap-3 text-xs"><span className="font-semibold">{label}</span><strong>{used == null ? "Unavailable" : `${formatNumber(used)}${suffix} / ${max == null ? "Unlimited" : `${formatNumber(max)}${suffix}`}`}</strong></div><div className="mt-2 h-2 overflow-hidden rounded-full bg-[var(--org-track)]"><div className="h-full rounded-full bg-gradient-to-r from-[var(--org-purple)] to-[#a559ff]" style={{ width: `${pct}%` }} /></div></div>
    </div>
  );
}

function DetailRow({ icon, label, value }: { icon: ReactNode; label: string; value: ReactNode }) {
  return <div className="grid grid-cols-[24px_115px_1fr] gap-2 py-2.5"><span className="text-[var(--org-ink)] [&_svg]:size-4">{icon}</span><dt className="font-semibold text-[var(--org-muted)]">{label}</dt><dd className="min-w-0 font-medium">{value}</dd></div>;
}

function LogoMark({ url, name }: { url?: string | null; name?: string | null }) {
  return <span className="grid size-20 shrink-0 place-items-center overflow-hidden rounded-2xl bg-[var(--org-purple-soft)] text-[var(--org-purple)]">{url ? <img src={url} alt={`${name || "Organisation"} logo`} className="size-full object-contain p-2" /> : <Building2 className="size-9" />}</span>;
}

function ActivityTimeline({ items, loading, error }: { items: any[]; loading: boolean; error: boolean }) {
  if (loading) return <p className="py-8 text-center text-sm text-[var(--org-muted)]">Loading organisation activity…</p>;
  if (error) return <Unavailable>Organisation activity is unavailable.</Unavailable>;
  if (!items.length) return <p className="py-8 text-center text-sm text-[var(--org-muted)]">No organisation activity has been recorded yet.</p>;
  return (
    <div className="relative ml-4 space-y-0 before:absolute before:bottom-5 before:left-[13px] before:top-5 before:w-px before:bg-[var(--org-purple-soft)]">
      {items.map((item) => <div key={item.id} className="relative grid grid-cols-[28px_1fr_auto] items-center gap-3 border-b border-[var(--org-hairline)] py-3 last:border-0"><span className="relative z-10 grid size-7 place-items-center rounded-full bg-[var(--org-purple-soft)] text-[var(--org-purple)] [&_svg]:size-3.5"><Activity /></span><div className="min-w-0"><strong className="block truncate text-sm">{humanize(item.action)}</strong><span className="block truncate text-xs text-[var(--org-muted)]">{activityDescription(item)}</span></div><time className="text-xs text-[var(--org-muted)]">{relativeTime(item.occurred_at)}</time></div>)}
    </div>
  );
}

function QuickAction({ href, icon, label }: { href: string; icon: ReactNode; label: string }) {
  return <Link href={href} className="flex min-h-16 items-center justify-center gap-3 rounded-2xl border border-[var(--org-hairline)] bg-[var(--org-surface-soft)] px-4 text-sm font-bold shadow-sm transition hover:-translate-y-0.5 hover:border-[var(--org-purple)]/30 hover:shadow-md"><span className="text-[var(--org-purple)] [&_svg]:size-5">{icon}</span>{label}</Link>;
}

function humanize(value?: string) { return String(value || "Activity").replace(/[_-]+/g, " ").toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase()); }
function activityDescription(item: any) { return typeof item.reason === "string" && item.reason.trim() ? item.reason : `${humanize(item.resource_type)} was updated`; }
function relativeTime(value?: string) {
  if (!value) return "—";
  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) return "—";
  const seconds = Math.round((timestamp - Date.now()) / 1000);
  const format = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
  if (Math.abs(seconds) < 60) return format.format(seconds, "second");
  const minutes = Math.round(seconds / 60);
  if (Math.abs(minutes) < 60) return format.format(minutes, "minute");
  const hours = Math.round(minutes / 60);
  if (Math.abs(hours) < 24) return format.format(hours, "hour");
  return format.format(Math.round(hours / 24), "day");
}
function formatAddress(address: Record<string, string>) { return [address.line1, address.line2, address.city, address.state, address.postal_code, address.country].filter(Boolean).join(", ") || "Not configured"; }
function formatDate(value: string) { return new Date(value).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" }); }
function formatNumber(value: number) { return new Intl.NumberFormat("en-IN", { maximumFractionDigits: 1 }).format(value); }
function stripProtocol(value: string) { return value.replace(/^https?:\/\//, "").replace(/\/$/, ""); }
