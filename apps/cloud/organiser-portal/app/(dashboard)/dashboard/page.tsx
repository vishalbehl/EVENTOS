"use client";

import Link from "next/link";
import { BarChart3, Calendar, CreditCard, PlusCircle, Settings, ShieldCheck, Users } from "lucide-react";
import {
  DataTable,
  MetricCard,
  NeedsAttentionPane,
  OrganiserPage,
  PageTabs,
  Panel,
  QuickActions,
  ReadinessRing,
  StatusBadge,
} from "@/components/organizer/workspace/OrganiserPrimitives";
import { useOrganiserDashboard } from "@/hooks/useOrganiserDashboard";
import { useAuthStore } from "@/store/use-auth-store";

const currency = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 });

export function DashboardOverviewPage() {
  const { user } = useAuthStore();
  const dashboardQuery = useOrganiserDashboard();
  const data = dashboardQuery.data;
  const metrics = data?.metrics;
  const plan = data?.plan;
  const readinessAvg = data?.events.length
    ? Math.round(data.events.reduce((total, event) => total + event.readiness_pct, 0) / data.events.length)
    : null;
  const registrationsTrend = (data?.trend || []).map((p) => p.registrations);
  const revenueTrend = (data?.trend || []).map((p) => p.revenue);

  const metricValue = (value: number | undefined, format?: (value: number) => string): string | number => {
    if (dashboardQuery.isLoading) return "—";
    if (dashboardQuery.isError || value == null) return "—";
    return format ? format(value) : value;
  };

  const displayName = user?.first_name || user?.full_name || "Organiser";
  const orgName = data?.organization?.name;

  return (
    <OrganiserPage
      title={`Hi, ${displayName}`}
      description={`Welcome back. Here's what's happening${orgName ? ` in ${orgName}` : " in your organisation"}.`}
      tabs={
        <PageTabs
          active="Overview"
          tabs={[
            { label: "Overview", href: "/dashboard/overview" },
            { label: "Needs Attention", href: "/dashboard/needs-attention" },
            { label: "Activity", href: "/dashboard/activity" },
          ]}
        />
      }
      attention={<NeedsAttentionPane items={data?.needs_attention || []} />}
    >
      {/* KPI Metric Cards — CC KpiGrid layout */}
      <section aria-label="Key performance indicators" className="op-metric-grid">
        <MetricCard
          label="Active Events"
          value={metricValue(metrics?.active_events)}
          icon={<Calendar className="size-3.5" />}
          iconColor="brand"
          href="/events"
          trend={registrationsTrend}
          deltaLabel="vs last 7d"
        />
        <MetricCard
          label="Team Members"
          value={metricValue(metrics?.team_members)}
          icon={<Users className="size-3.5" />}
          iconColor="info"
          href="/people-teams/users"
          trend={registrationsTrend}
          deltaLabel="vs last 7d"
        />
        <MetricCard
          label="Total Registrations"
          value={metricValue(metrics?.total_registrations, (v) => v.toLocaleString())}
          icon={<Users className="size-3.5" />}
          iconColor="success"
          trend={registrationsTrend}
          hint={data ? "Live organisation total" : dashboardQuery.isError ? "Unavailable" : "Loading"}
          deltaLabel="vs last 7d"
        />
        <MetricCard
          label="Total Revenue"
          value={metricValue(metrics?.total_revenue, (v) => currency.format(v))}
          icon={<CreditCard className="size-3.5" />}
          iconColor="warning"
          trend={revenueTrend}
          hint={data ? "Captured payments" : dashboardQuery.isError ? "Unavailable" : "Loading"}
          deltaLabel="vs last 7d"
        />
      </section>

      {/* Events Table (Limited Columns) + Readiness */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1.15fr)_minmax(280px,0.85fr)]">
        <Panel
          title="Recent Events"
          action={
            <Link
              href="/events"
              className="text-xs font-semibold text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)]"
            >
              View all →
            </Link>
          }
          className="p-0"
        >
          <DataTable
            columns={["Event", "Dates", "Status", "Action"]}
            empty={dashboardQuery.isError ? "Dashboard data is unavailable." : "No events found."}
            rows={(data?.events || []).slice(0, 5).map((event) => [
              <div key="event" className="flex items-center gap-2.5">
                <div className="grid size-7 shrink-0 place-items-center rounded-md border border-[var(--border-subtle)] bg-[var(--bg-surface-3)] font-mono text-[10px] font-bold text-[var(--text-primary)]">
                  {event.short_code?.slice(0, 3) || "EVT"}
                </div>
                <div className="min-w-0">
                  <p className="truncate text-xs font-semibold text-[var(--text-primary)]">{event.name}</p>
                </div>
              </div>,
              <span key="dates" className="text-xs tabular-nums text-[var(--text-secondary)]">
                {event.dates || "TBD"}
              </span>,
              <StatusBadge key="status" status={event.status} />,
              <Link
                key="action"
                href={`/events/${event.id}/dashboard`}
                className="text-xs font-semibold text-[var(--text-primary)] hover:underline"
              >
                Open →
              </Link>,
            ])}
          />
        </Panel>

        <Panel title="Event Readiness Score">
          <div className="grid gap-5 md:grid-cols-[140px_1fr] md:items-center">
            {readinessAvg == null ? (
              <div className="text-sm font-medium text-[var(--text-secondary)]">Readiness unavailable</div>
            ) : (
              <ReadinessRing value={readinessAvg} label={readinessAvg >= 75 ? "On Track" : "Needs Work"} />
            )}
            <div>
              <p className="text-sm font-semibold text-[var(--text-primary)]">
                Readiness is calculated from configured sessions, speakers, files, and venue rooms.
              </p>
              <p className="mt-2 text-xs leading-5 text-[var(--text-secondary)]">
                Open Needs Attention for the exact setup items that need action.
              </p>
              <Link
                href="/events"
                className="mt-4 inline-flex items-center rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface-2)] px-4 py-2 text-xs font-semibold text-[var(--text-primary)] transition-colors hover:bg-[var(--bg-surface-hover)]"
              >
                View Readiness
              </Link>
            </div>
          </div>
        </Panel>
      </div>

      {/* Quick Actions + Plan */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1.1fr)_minmax(280px,0.9fr)]">
        <Panel title="Quick Actions">
          <QuickActions
            actions={[
              { label: "Create Event", href: "/events/new", icon: <PlusCircle className="size-4" /> },
              { label: "Invite User", href: "/people-teams/invitations", icon: <Users className="size-4" /> },
              { label: "Assign Role", href: "/access-roles/roles", icon: <ShieldCheck className="size-4" /> },
              { label: "Review Billing", href: "/billing/overview", icon: <CreditCard className="size-4" /> },
              { label: "View Analytics", href: "/dashboard/analytics/overview", icon: <BarChart3 className="size-4" /> },
              { label: "Manage Plan", href: "/plans-entitlements/overview", icon: <Settings className="size-4" /> },
            ]}
          />
        </Panel>

        <Panel title="Current Plan">
          <div className="space-y-4">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-[var(--text-tertiary)]">Active Plan</p>
              <p className="mt-1 font-mono text-2xl font-semibold tabular-nums tracking-[-0.03em] text-[var(--text-primary)]">
                {plan?.name || "—"}
              </p>
              <StatusBadge status={plan?.status || "pending"} />
            </div>
            <UsageBar label="Registrations" used={plan?.registrations_used} max={plan?.registrations_max} unrestricted={plan?.unrestricted} />
            <UsageBar label="Storage" used={plan?.storage_used_gb} max={plan?.storage_max_gb} suffix="GB" unrestricted={plan?.unrestricted} />
            <UsageBar label="Events" used={plan?.events_used} max={plan?.events_max} unrestricted={plan?.unrestricted} />
            <Link
              href="/plans-entitlements/overview"
              className="inline-flex items-center rounded-lg bg-[var(--brand-primary)] px-4 py-2 text-xs font-semibold text-[var(--text-inverse)] transition-opacity hover:opacity-90"
            >
              View Plan Details
            </Link>
          </div>
        </Panel>
      </div>
    </OrganiserPage>
  );
}

export default DashboardOverviewPage;

function UsageBar({
  label,
  used,
  max,
  suffix = "",
  unrestricted,
}: {
  label: string;
  used?: number | null;
  max?: number | null;
  suffix?: string;
  unrestricted?: boolean;
}) {
  const pct = used == null ? 0 : unrestricted || !max ? 100 : Math.min(100, (used / max) * 100);
  const usedLabel =
    used == null
      ? "—"
      : unrestricted
      ? `${used}${suffix ? ` ${suffix}` : ""} / Unlimited`
      : `${used}${suffix ? ` ${suffix}` : ""} / ${max ?? "N/A"}${suffix ? ` ${suffix}` : ""}`;

  return (
    <div>
      <div className="mb-1.5 flex justify-between text-[11px] font-medium text-[var(--text-secondary)]">
        <span>{label}</span>
        <span>{usedLabel}</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-[var(--bg-surface-3)]">
        <div
          className="h-full rounded-full bg-[var(--brand-primary)] transition-all duration-300"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
