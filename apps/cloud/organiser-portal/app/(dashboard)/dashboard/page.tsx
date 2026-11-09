"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Award, BadgeCheck, CalendarDays, CheckCircle2, ChevronRight, CreditCard, Layers3, Mail, Mic2, Presentation, UserPlus, Users } from "lucide-react";
import { MetricCard, OrganiserPage, Panel, QuickActions } from "@/components/organizer/workspace/OrganiserPrimitives";
import { useOrganiserDashboard, type OrganiserDashboard } from "@/hooks/useOrganiserDashboard";
import { isPlatformSelfSession, useAuthStore } from "@/store/use-auth-store";
import { OrganisationWorkspaceOverview } from "@/components/organizer/workspace/organisation/OrganisationOverviewTab";

const currency = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 1, notation: "compact" });
const number = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 });

export function DashboardOverviewPage() {
  const searchParams = useSearchParams();
  const { user } = useAuthStore();
  const dashboard = useOrganiserDashboard();
  const platformSelf = useAuthStore(isPlatformSelfSession);
  const data = dashboard.data;
  const metrics = data?.metrics;
  const requestedView = searchParams.get("view") || "overview";
  const view = ["overview", "events", "registrations", "sessions", "venue"].includes(requestedView) ? requestedView : "overview";
  const activeTab = ({ overview: "Overview", events: "Events", registrations: "Registrations", sessions: "Sessions", venue: "Venue" } as Record<string, string>)[view];
  const firstEvent = data?.events?.[0];
  const displayName = user?.first_name || user?.full_name?.split(" ")[0] || "Organiser";
  const metricValue = (value?: number, formatter: (value: number) => string = number.format) => dashboard.isLoading || dashboard.isError || value == null ? "—" : formatter(value);

  if (platformSelf) return <OrganiserPage title={`Welcome back, ${displayName}!`} description="Manage the platform or select an authorised customer context to review organiser activity.">
    <Panel title="Eventos platform workspace" description="Your Enterprise plan and unlimited allowances are available in Commercial and Billing.">
      <div className="flex flex-wrap gap-4 text-sm font-semibold text-[var(--org-purple)]"><Link href="/commercial/overview">View Commercial overview</Link><a href="http://localhost:3000/">Open Command Center</a></div>
    </Panel>
  </OrganiserPage>;

  return <OrganiserPage
    title={`Welcome back, ${displayName}!`}
    description="Here’s an overview of your events, registrations, sessions, and venue operations."
  >
    <section className="op-metric-grid" aria-label="Organisation totals">
      <div className={`transition-all rounded-2xl ${view === "events" ? "ring-2 ring-[var(--op-primary)] shadow-sm" : ""}`}>
        <MetricCard
          label="Total Events"
          value={metricValue(metrics?.total_events)}
          icon={<CalendarDays className="size-4" />}
          tone="green"
          href={view === "events" ? "/dashboard" : "/dashboard?view=events"}
          hint={view === "events" ? "Active filter · Click to clear" : "Click to view events"}
        />
      </div>
      <div className={`transition-all rounded-2xl ${view === "registrations" ? "ring-2 ring-[var(--op-primary)] shadow-sm" : ""}`}>
        <MetricCard
          label="Total Registrations"
          value={metricValue(metrics?.total_registrations)}
          icon={<Users className="size-4" />}
          tone="blue"
          href={view === "registrations" ? "/dashboard" : "/dashboard?view=registrations"}
          hint={view === "registrations" ? "Active filter · Click to clear" : "Click to view registrations"}
        />
      </div>
      <div className={`transition-all rounded-2xl ${view === "sessions" ? "ring-2 ring-[var(--op-primary)] shadow-sm" : ""}`}>
        <MetricCard
          label="Total Sessions"
          value={metricValue(metrics?.total_sessions)}
          icon={<Layers3 className="size-4" />}
          tone="purple"
          href={view === "sessions" ? "/dashboard" : "/dashboard?view=sessions"}
          hint={view === "sessions" ? "Active filter · Click to clear" : "Click to view sessions"}
        />
      </div>
      <div className={`transition-all rounded-2xl ${view !== "overview" && !["events", "registrations", "sessions"].includes(view) ? "ring-2 ring-[var(--op-primary)] shadow-sm" : ""}`}>
        <MetricCard
          label="Total Speakers"
          value={metricValue(metrics?.total_speakers)}
          icon={<Mic2 className="size-4" />}
          tone="amber"
          href={view !== "overview" ? "/dashboard" : "/events"}
          hint={view !== "overview" ? "Click to view full overview" : "Across all events"}
        />
      </div>
    </section>

    {view !== "overview" ? (
      <div className="flex items-center justify-between rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface-2)] px-4 py-2.5 text-xs">
        <span className="text-[var(--text-secondary)]">
          Showing <strong>{activeTab}</strong> breakdown
        </span>
        <Link
          href="/dashboard"
          className="font-semibold text-[var(--op-primary)] hover:underline inline-flex items-center gap-1"
        >
          Show full overview →
        </Link>
      </div>
    ) : null}

    {view === "overview" ? <>
      <div className="grid gap-4 xl:grid-cols-[1.1fr_1fr_.82fr]">
        <RegistrationOverview data={data?.registration_overview} total={metrics?.total_registrations} unavailable={dashboard.isError} />
        <EventProgress events={data?.events || []} loading={dashboard.isLoading} error={dashboard.isError} />
        <RegistrationTrend points={data?.trend || []} loading={dashboard.isLoading} error={dashboard.isError} />
      </div>
      <div className="grid gap-4 xl:grid-cols-[1.08fr_.92fr_.82fr]">
        <SessionDistribution points={data?.session_distribution || []} loading={dashboard.isLoading} error={dashboard.isError} />
        <Panel title="Quick Actions"><QuickActions actions={[
          { label: "Create Event", href: "/events/new", icon: <CalendarDays className="size-4" /> },
          { label: "Add Speaker", href: firstEvent ? `/events/${firstEvent.id}/speakers/list` : "/events", icon: <UserPlus className="size-4" /> },
          { label: "Create Session", href: firstEvent ? `/events/${firstEvent.id}/sessions/builder` : "/events", icon: <Layers3 className="size-4" /> },
          { label: "Design Badge", href: firstEvent ? `/events/${firstEvent.id}/design-studio/badges` : "/events", icon: <BadgeCheck className="size-4" /> },
          { label: "Certificates", href: firstEvent ? `/events/${firstEvent.id}/registration/certificates` : "/events", icon: <Award className="size-4" /> },
          { label: "Send Campaign", href: firstEvent ? `/events/${firstEvent.id}/communication/emails` : "/events", icon: <Mail className="size-4" /> },
        ]} /></Panel>
        <UpcomingTasks items={data?.needs_attention || []} loading={dashboard.isLoading} error={dashboard.isError} />
      </div>
      <OperationalMiniStats metrics={metrics} commercial={data?.commercial} metricValue={metricValue} />
    </> : null}

    {view === "events" ? <div className="grid gap-4 xl:grid-cols-[1fr_1.35fr]"><EventProgress events={data?.events || []} loading={dashboard.isLoading} error={dashboard.isError} /><EventDirectory events={data?.events || []} loading={dashboard.isLoading} error={dashboard.isError} /></div> : null}
    {view === "registrations" ? <><div className="grid gap-4 xl:grid-cols-[1fr_1.25fr]"><RegistrationOverview data={data?.registration_overview} total={metrics?.total_registrations} unavailable={dashboard.isError} /><RegistrationTrend points={data?.trend || []} loading={dashboard.isLoading} error={dashboard.isError} /></div><OperationalMiniStats metrics={metrics} commercial={data?.commercial} metricValue={metricValue} /></> : null}
    {view === "sessions" ? <div className="grid gap-4 xl:grid-cols-[1.2fr_.8fr]"><SessionDistribution points={data?.session_distribution || []} loading={dashboard.isLoading} error={dashboard.isError} /><Panel title="Programme actions"><QuickActions actions={[{ label: "Open programme", href: firstEvent ? `/events/${firstEvent.id}/program` : "/events", icon: <Presentation className="size-4" /> }, { label: "Create session", href: firstEvent ? `/events/${firstEvent.id}/sessions/builder` : "/events", icon: <Layers3 className="size-4" /> }]} /></Panel></div> : null}
    {view === "venue" ? <VenueOverview events={data?.events || []} tasks={data?.needs_attention || []} loading={dashboard.isLoading} error={dashboard.isError} /> : null}
  </OrganiserPage>;
}

function OperationalMiniStats({ metrics, commercial, metricValue }: { metrics?: OrganiserDashboard["metrics"]; commercial?: OrganiserDashboard["commercial"]; metricValue: (value?: number, formatter?: (value: number) => string) => string }) {
  return <div className="grid gap-4 md:grid-cols-3"><MiniStat label="Check-ins" value={metricValue(metrics?.total_checkins)} icon={<CheckCircle2 className="size-4" />} /><MiniStat label="Captured revenue" value={metricValue(metrics?.total_revenue, currency.format)} icon={<CreditCard className="size-4" />} /><MiniStat label="Registration capacity" value={capacityLabel(commercial?.registrations_used, commercial?.registrations_max, commercial?.unrestricted)} icon={<Presentation className="size-4" />} /></div>;
}

function RegistrationOverview({ data, total, unavailable }: { data?: { approved: number; pending: number; waitlisted: number; other: number }; total?: number; unavailable: boolean }) {
  const denominator = Math.max(1, total || 0);
  const items = [
    { label: "Approved", value: data?.approved || 0, color: "var(--org-pink)" },
    { label: "Pending review", value: data?.pending || 0, color: "var(--org-blue)" },
    { label: "Waitlisted / others", value: (data?.waitlisted || 0) + (data?.other || 0), color: "var(--org-orange)" },
  ];
  return <Panel title="Registration Overview" action={<Link href="/events" className="text-xs font-semibold">All events</Link>}>
    {unavailable ? <Empty text="Registration totals are unavailable." /> : <><div className="flex h-8 overflow-hidden rounded-full bg-[var(--org-surface-soft)]">{items.map((item) => <div key={item.label} style={{ width: `${item.value / denominator * 100}%`, background: item.color }} />)}</div><div className="mt-4 grid gap-2 text-xs sm:grid-cols-3">{items.map((item) => <div key={item.label}><span className="mr-2 inline-block size-2 rounded-full" style={{ background: item.color }} /><strong>{Math.round(item.value / denominator * 100)}%</strong><span className="ml-1 text-[var(--org-muted)]">{item.label}</span></div>)}</div></>}
  </Panel>;
}

function EventProgress({ events, loading, error }: { events: Array<{ id: string; name: string; dates: string; readiness_pct: number; status: string }>; loading: boolean; error: boolean }) {
  return <Panel title="Event Setup Progress" action={<Link href="/events" className="text-xs font-semibold">See all</Link>}>
    {loading ? <Empty text="Loading event setup…" /> : error ? <Empty text="Event setup is unavailable." /> : events.length === 0 ? <Empty text="Create an event to begin setup." /> : <div className="space-y-3">{events.slice(0, 3).map((event, index) => <Link href={`/events/${event.id}/dashboard`} key={event.id} className="grid grid-cols-[52px_1fr] gap-3 rounded-2xl p-1 transition-colors hover:bg-black/[.03] dark:hover:bg-white/[.04]"><span className="grid h-11 w-[52px] place-items-center rounded-xl text-xs font-bold text-white" style={{ background: ["linear-gradient(135deg,#26355f,#fa6671)", "linear-gradient(135deg,#102f61,#4169e1)", "linear-gradient(135deg,#f88ac5,#6c35f4)"][index % 3] }}>EV</span><span className="min-w-0"><span className="flex items-center justify-between gap-3"><strong className="truncate text-sm">{event.name}</strong><span className="text-xs font-semibold">{event.readiness_pct}%</span></span><span className="mt-1 block truncate text-xs text-[var(--org-muted)]">{event.dates}</span><span className="mt-2 block h-1.5 overflow-hidden rounded-full bg-black/10 dark:bg-white/10"><span className="block h-full rounded-full bg-gradient-to-r from-[#43cc54] to-[#3b8df5]" style={{ width: `${event.readiness_pct}%` }} /></span></span></Link>)}</div>}
  </Panel>;
}

function EventDirectory({ events, loading, error }: { events: OrganiserDashboard["events"]; loading: boolean; error: boolean }) {
  return <Panel title="Event portfolio" action={<Link href="/events" className="text-xs font-semibold">Manage events</Link>}>
    {loading ? <Empty text="Loading events…" /> : error ? <Empty text="Events are unavailable." /> : events.length === 0 ? <Empty text="No events have been created." /> : <div className="overflow-x-auto"><table className="w-full min-w-[640px] text-left text-sm"><thead><tr className="border-b border-[var(--org-border)] text-xs text-[var(--org-muted)]"><th className="pb-3">Event</th><th className="pb-3">Status</th><th className="pb-3">Venue</th><th className="pb-3">Registrations</th><th className="pb-3">Readiness</th></tr></thead><tbody>{events.map((event) => <tr key={event.id} className="border-b border-[var(--org-border)]/70"><td className="py-3"><Link className="font-bold hover:text-[var(--org-purple)]" href={`/events/${event.id}/dashboard`}>{event.name}</Link><span className="block text-xs text-[var(--org-muted)]">{event.dates}</span></td><td className="py-3">{event.status}</td><td className="py-3">{event.venue || "Not configured"}</td><td className="py-3">{number.format(event.registrations)}</td><td className="py-3">{event.readiness_pct}%</td></tr>)}</tbody></table></div>}
  </Panel>;
}

function VenueOverview({ events, tasks, loading, error }: { events: OrganiserDashboard["events"]; tasks: OrganiserDashboard["needs_attention"]; loading: boolean; error: boolean }) {
  const venueTasks = tasks.filter((item) => /venue|room|floor|onsite|check.?in/i.test(`${item.title} ${item.description}`));
  return <div className="grid gap-4 xl:grid-cols-[1.2fr_.8fr]">
    <Panel title="Venue readiness" description="Venue data is shown only when it is configured on the event.">{loading ? <Empty text="Loading venue readiness…" /> : error ? <Empty text="Venue readiness is unavailable." /> : events.length === 0 ? <Empty text="Create an event before configuring venue operations." /> : <div className="space-y-3">{events.map((event) => <div key={event.id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[var(--org-border)] p-4"><div><Link href={`/events/${event.id}/venue-ops`} className="font-bold hover:text-[var(--org-purple)]">{event.name}</Link><p className="mt-1 text-xs text-[var(--org-muted)]">{event.venue || "Venue not configured"} · {event.dates}</p></div><div className="text-right"><strong>{event.readiness_pct}%</strong><p className="text-xs text-[var(--org-muted)]">event readiness</p></div></div>)}</div>}</Panel>
    <Panel title="Venue tasks" action={<Link href="/dashboard/needs-attention" className="text-xs font-semibold">All tasks</Link>}>{loading ? <Empty text="Loading venue tasks…" /> : error ? <Empty text="Venue tasks are unavailable." /> : venueTasks.length === 0 ? <Empty text="No venue-specific tasks need attention." /> : <div className="divide-y divide-[var(--org-border)]">{venueTasks.slice(0, 8).map((item) => <Link key={item.id} href={item.href} className="flex items-center justify-between gap-3 py-3"><span><strong className="block text-sm">{item.title}</strong><span className="text-xs text-[var(--org-muted)]">{item.description}</span></span><ChevronRight className="size-4 shrink-0" /></Link>)}</div>}</Panel>
  </div>;
}

function RegistrationTrend({ points, loading, error }: { points: Array<{ label: string; registrations: number }>; loading: boolean; error: boolean }) {
  const max = Math.max(1, ...points.map((point) => point.registrations));
  const total = points.reduce((sum, point) => sum + point.registrations, 0);
  return <Panel title="Registrations (Last 7 Days)" action={<span className="rounded-full border border-[var(--org-border)] px-3 py-1 text-xs">7 Days</span>}>
    {loading ? <Empty text="Loading trend…" /> : error ? <Empty text="Registration trend is unavailable." /> : <><p className="text-3xl font-bold tracking-tight">{number.format(total)}</p><div className="mt-4 flex h-28 items-end gap-2" role="img" aria-label="Seven day registration trend">{points.map((point) => <div key={point.label} className="flex flex-1 flex-col items-center justify-end gap-2"><span className="w-full rounded-t bg-[var(--org-orange)]" style={{ height: `${Math.max(5, point.registrations / max * 88)}px` }} /><span className="text-[10px] text-[var(--org-muted)]">{point.label}</span></div>)}</div></>}
  </Panel>;
}

function SessionDistribution({ points, loading, error }: { points: Array<{ label: string; oral: number; poster: number }>; loading: boolean; error: boolean }) {
  const max = Math.max(1, ...points.map((point) => point.oral + point.poster));
  return <Panel title="Session Distribution">{loading ? <Empty text="Loading session distribution…" /> : error ? <Empty text="Session distribution is unavailable." /> : points.length === 0 ? <Empty text="No scheduled sessions are available." /> : <><div className="flex h-36 items-end gap-4" role="img" aria-label="Oral and poster session distribution">{points.map((point) => <div key={point.label} className="flex flex-1 flex-col items-center justify-end"><div className="flex w-full flex-col-reverse overflow-hidden rounded-t-lg" style={{ height: `${Math.max(12, (point.oral + point.poster) / max * 112)}px` }}><span className="bg-[var(--org-purple)]" style={{ flex: point.oral || 0.01 }} /><span className="bg-[#43b6f1]" style={{ flex: point.poster || 0.01 }} /></div><span className="mt-2 text-[10px] text-[var(--org-muted)]">{point.label}</span></div>)}</div><div className="mt-3 flex justify-center gap-5 text-xs"><span><i className="mr-2 inline-block size-2 rounded-full bg-[var(--org-purple)]" />Oral</span><span><i className="mr-2 inline-block size-2 rounded-full bg-[#43b6f1]" />Poster</span></div></>}</Panel>;
}

function UpcomingTasks({ items, loading, error }: { items: Array<{ id: string; title: string; description?: string; count?: number; href: string; severity?: string }>; loading: boolean; error: boolean }) {
  return <Panel title="Upcoming Tasks" action={<Link href="/dashboard/needs-attention" className="text-xs font-semibold">See all</Link>}>{loading ? <Empty text="Loading tasks…" /> : error ? <Empty text="Tasks are unavailable." /> : items.length === 0 ? <Empty text="You’re all caught up." /> : <div className="divide-y divide-[var(--org-border)]">{items.slice(0, 4).map((item) => <Link key={item.id} href={item.href} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0"><span className="grid size-9 shrink-0 place-items-center rounded-full bg-[var(--org-purple-soft)] text-[var(--org-purple)]"><CheckCircle2 className="size-4" /></span><span className="min-w-0 flex-1"><strong className="block truncate text-sm">{item.count ? `${item.count} ` : ""}{item.title}</strong><span className="block truncate text-xs text-[var(--org-muted)]">{item.description}</span></span><ChevronRight className="size-4" /></Link>)}</div>}</Panel>;
}

function MiniStat({ label, value, icon }: { label: string; value: string | number; icon: React.ReactNode }) { return <div data-org-surface className="flex items-center gap-3 p-4"><span className="grid size-10 place-items-center rounded-full bg-[var(--org-surface-soft)]">{icon}</span><span><span className="block text-xs text-[var(--org-muted)]">{label}</span><strong className="text-xl">{value}</strong></span></div>; }
function Empty({ text }: { text: string }) { return <p className="py-8 text-center text-sm text-[var(--org-muted)]">{text}</p>; }
function capacityLabel(used?: number, max?: number | null, unrestricted?: boolean) { return unrestricted ? "Unlimited" : used == null || !max ? "Unavailable" : `${Math.min(100, Math.round(used / max * 100))}%`; }

export default OrganisationWorkspaceOverview;
