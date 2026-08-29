"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { BarChart3, Calendar, CreditCard, Globe, Megaphone, PlusCircle, UserPlus, Users } from "lucide-react";
import { DataTable, MetricCard, NeedsAttentionPane, OrganiserPage, Panel, QuickActions, ReadinessRing, StatusBadge } from "@/components/organizer/workspace/OrganiserPrimitives";
import { useActivity, useEvent, useMainDashboardStats } from "@/hooks/useEvents";
import { useEventNeedsAttention } from "@/hooks/useOrganiserDashboard";

const inr = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 });

export default function EventOverviewPage() {
  const params = useParams();
  const eventId = params?.eventId as string;
  const { data: event } = useEvent(eventId);
  const { data: stats } = useMainDashboardStats(eventId);
  const { data: activity } = useActivity(eventId, 5);
  const { data: attention } = useEventNeedsAttention(eventId);

  const readiness = Math.round(stats?.event_readiness_pct ?? stats?.approval_rate_pct ?? 0);
  const totalRegistrations = stats?.total_registrations ?? 0;
  const totalSpeakers = stats?.total_speakers ?? 0;
  const totalSessions = stats?.total_sessions ?? 0;
  const totalRevenue = stats?.total_revenue ?? 0;
  const chartValues = [totalRegistrations, totalSpeakers, totalSessions, Math.round(totalRevenue / 1000)].map((value) => Math.max(0, Number(value || 0)));
  const chartMax = Math.max(1, ...chartValues);

  return (
    <OrganiserPage
      title={event?.name || "Event Home"}
      description={event ? `${formatDate(event.start_date)} - ${formatDate(event.end_date)} · ${event.venue_name || event.location || "Venue not set"}` : "Monitor event setup, registration, speakers, sessions, and operations."}
      attention={<NeedsAttentionPane items={attention || []} />}
    >
      <Panel>
        <div className="grid gap-5 lg:grid-cols-[1fr_320px] lg:items-center">
          <div>
            <StatusBadge status={event?.status || "Loading"} />
            <h2 className="mt-4 text-2xl font-extrabold tracking-normal text-[var(--op-text)]">{event?.name || "Loading event"}</h2>
            <div className="mt-4 grid gap-3 text-sm text-[var(--op-muted)] sm:grid-cols-2 lg:grid-cols-4">
              <span>Type: {event?.registration_settings?.enabled ? "In-Person" : "Configured"}</span>
              <span>Timezone: {event?.timezone || "Asia/Kolkata"}</span>
              <span>Currency: {event?.currency || "INR"}</span>
              <span>Code: {event?.short_code || "..."}</span>
            </div>
          </div>
          <img src="/assets/illustrations/dashboard/event-stage.png" alt="" className="mx-auto max-h-48 w-full max-w-[320px] object-contain" />
        </div>
      </Panel>

      <div className="op-metric-grid">
        <MetricCard label="Registrations" value={totalRegistrations.toLocaleString()} hint="Live attendee total" tone="purple" icon={<Users className="h-5 w-5" />} href={`/events/${eventId}/registration/participants`} />
        <MetricCard label="Speakers" value={totalSpeakers.toLocaleString()} hint="Speaker records" tone="amber" icon={<UserPlus className="h-5 w-5" />} href={`/events/${eventId}/speakers/list`} />
        <MetricCard label="Sessions" value={totalSessions.toLocaleString()} hint="Program sessions" tone="rose" icon={<Calendar className="h-5 w-5" />} href={`/events/${eventId}/program/dashboard`} />
        <MetricCard label="Revenue" value={inr.format(totalRevenue)} hint="Captured payments" tone="green" icon={<CreditCard className="h-5 w-5" />} href={`/events/${eventId}/registration/financials`} />
      </div>

      <div className="op-content-grid">
        <Panel title="Event Overview" action={<span className="text-xs font-bold text-[var(--op-muted)]">Live</span>}>
          <div className="op-chart-placeholder">
            <div className="op-chart-bars">
              {chartValues.map((value, index) => <span key={index} style={{ height: `${Math.max(8, (value / chartMax) * 100)}%` }} />)}
            </div>
          </div>
        </Panel>
        <Panel title="Quick Actions">
          <QuickActions actions={[
            { label: "Create Session", href: `/events/${eventId}/program/builder`, icon: <PlusCircle className="h-4 w-4" /> },
            { label: "Invite Speaker", href: `/events/${eventId}/speakers/list`, icon: <UserPlus className="h-4 w-4" /> },
            { label: "Send Announcement", href: `/events/${eventId}/communications/announcements`, icon: <Megaphone className="h-4 w-4" /> },
            { label: "View Event Website", href: `/events/${eventId}/website/builder`, icon: <Globe className="h-4 w-4" /> },
            { label: "Reports", href: `/events/${eventId}/speakers/analytics`, icon: <BarChart3 className="h-4 w-4" /> },
          ]} />
        </Panel>
      </div>

      <div className="op-content-grid">
        <Panel title="Event Readiness">
          <div className="grid gap-5 md:grid-cols-[140px_1fr] md:items-center">
            <ReadinessRing value={readiness} label={readiness >= 75 ? "On Track" : "Needs Work"} />
            <div>
              <p className="text-sm font-bold text-[var(--op-text)]">Complete pending tasks before opening day.</p>
              <p className="mt-2 text-xs leading-5 text-[var(--op-muted)]">Readiness uses the existing analytics aggregate and the task pane points directly to setup pages.</p>
            </div>
          </div>
        </Panel>
        <Panel title="Recent Activity">
          <div className="space-y-3">
            {(activity || []).length ? activity!.map((item: any, index: number) => (
              <div key={item.id || index} className="rounded-xl border border-[var(--op-border)] bg-[var(--op-panel-soft)] p-3">
                <p className="text-sm font-bold text-[var(--op-text)]">{item.description || item.event_type || "Activity"}</p>
                <p className="text-xs text-[var(--op-muted)]">{item.occurred_at ? new Date(item.occurred_at).toLocaleString() : "Just now"}</p>
              </div>
            )) : <p className="text-sm text-[var(--op-muted)]">No recent activity found.</p>}
          </div>
        </Panel>
      </div>

      <Panel title="Key Event Records" className="p-0">
        <DataTable
          columns={["Area", "Current Count", "Open Page"]}
          rows={[
            ["Registrations", totalRegistrations.toLocaleString(), <Link key="reg" href={`/events/${eventId}/registration/participants`} className="font-bold text-[var(--op-primary)]">Open</Link>],
            ["Speakers", totalSpeakers.toLocaleString(), <Link key="speakers" href={`/events/${eventId}/speakers/list`} className="font-bold text-[var(--op-primary)]">Open</Link>],
            ["Sessions", totalSessions.toLocaleString(), <Link key="sessions" href={`/events/${eventId}/program/dashboard`} className="font-bold text-[var(--op-primary)]">Open</Link>],
            ["Payments", inr.format(totalRevenue), <Link key="payments" href={`/events/${eventId}/registration/financials`} className="font-bold text-[var(--op-primary)]">Open</Link>],
          ]}
        />
      </Panel>
    </OrganiserPage>
  );
}

function formatDate(value?: string) {
  if (!value) return "TBD";
  return new Date(value).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}
