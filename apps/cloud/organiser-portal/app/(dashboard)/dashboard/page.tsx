"use client";

import { useMemo, useState } from "react";
import {
  Calendar,
  CheckCircle2,
  CreditCard,
  Users,
  Activity,
  PlusCircle,
  FileText,
  AlertCircle,
  ArrowRight,
  TrendingUp,
  Settings,
  Bell
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useEvents } from "@/hooks/useEvents";
import { useCurrentPlan } from "@/hooks/useBilling";
import { useAuthStore } from "@/store/use-auth-store";
import { Button } from "@/components/ui/button";
import {
  EnterpriseChecklist,
  EnterpriseEmptyState,
  EnterprisePageIntro,
  EnterprisePanel,
  EnterpriseStatCard,
} from "@/components/organizer/platform/EnterprisePortal";
import { useOrganizationCapabilities } from "@/lib/capabilities";
import Link from "next/link";

export default function PlatformDashboardPage() {
  const router = useRouter();
  const { user } = useAuthStore();
  const eventsQuery = useEvents();
  const events = eventsQuery.data ?? [];
  const planQuery = useCurrentPlan();
  const currentPlan = planQuery.data;
  const organizationCapabilities = useOrganizationCapabilities();
  const [createIntent, setCreateIntent] = useState(false);

  const activeEvents = useMemo(
    () => events.filter((event) => event.status !== "archived" && event.status !== "completed").length,
    [events]
  );

  const subscriptionsCount = planQuery.isError ? "Unavailable" : currentPlan ? "1" : "0";
  const teamMemberLimit = organizationCapabilities.data?.limits?.max_users;
  const teamMembers = organizationCapabilities.isError ? "Unavailable" : teamMemberLimit ? String(teamMemberLimit.used) : "Not measured";
  
  const mockTotalRegistrations = 0; // TODO: Fetch from API
  const mockRecentActivity: any[] = []; // TODO: Fetch from API
  const mockAlerts: any[] = []; // TODO: Fetch from API

  return (
    <div className="space-y-6 pb-8 pt-4">

      {/* Main Action Panel */}
      <EnterprisePanel className="overflow-hidden p-6 relative border-[var(--color-border)] bg-[linear-gradient(135deg,rgba(255,255,255,0.02)_0%,rgba(255,255,255,0.01)_100%)]">
        {events.length === 0 ? (
          <div className="grid gap-6 lg:grid-cols-[220px_1fr] lg:items-center">
            <div className="flex justify-center lg:justify-start">
              <div className="relative flex h-36 w-36 items-center justify-center rounded-full bg-[var(--color-surface-3)] border border-[var(--color-border)]">
                <div className="absolute -bottom-2 left-4 h-10 w-10 rounded-2xl bg-[var(--color-primary-glow)] border border-[var(--color-primary-mid)]/20" />
                <Calendar className="h-16 w-16 text-[var(--color-primary-mid)]" />
              </div>
            </div>
            <div>
              <p className="text-[24px] font-bold tracking-[-0.04em] text-[var(--color-text-primary)]">
                Initialize your first workspace
              </p>
              <p className="mt-3 max-w-xl text-[14px] leading-6 text-[var(--color-text-secondary)]">
                Create your first event to unlock enterprise registrations, speaker workflows, billing, and high-level operating dashboards.
              </p>
              <Button
                onClick={() => {
                  setCreateIntent(true);
                  router.push("/events?create=true");
                }}
                className="mt-5 h-11 rounded-xl px-5 text-[12px] font-bold hex-lime-gradient text-[var(--color-text-inverse)] hover:scale-[1.02] active:scale-[0.98] transition-all shadow-[0_10px_22px_rgba(224,255,0,0.16)] border-0"
              >
                Deploy New Event
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-[24px] font-bold tracking-[-0.04em] text-[var(--color-text-primary)]">
                Workspace Operational Status: Active
              </p>
              <p className="mt-2 max-w-2xl text-[14px] leading-6 text-[var(--color-text-secondary)]">
                All systems nominal. Track event velocity, manage subscriptions, and coordinate team access directly from this console.
              </p>
            </div>
            <Button onClick={() => router.push("/events")} className="h-11 rounded-xl px-5 text-[12px] font-semibold hex-lime-gradient text-[var(--color-text-inverse)] border-0">
              Open Event Workspaces
            </Button>
          </div>
        )}
      </EnterprisePanel>

      {/* KPI Stats Grid */}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <EnterpriseStatCard
          label="Active Events"
          value={eventsQuery.isError ? "Unavailable" : String(events.length)}
          hint={eventsQuery.isError ? "Event records could not be loaded" : events.length === 0 ? "No events created" : `${activeEvents} active or upcoming`}
        />
        <EnterpriseStatCard
          label="Total Storage"
          value="Per event"
          hint="Open an event capability view for authoritative storage usage"
        />
        <EnterpriseStatCard
          label="Active Subscriptions"
          value={subscriptionsCount}
          hint={planQuery.isError ? "Subscription source unavailable" : currentPlan ? `${currentPlan.plan.name} Plan Active` : "No active subscriptions"}
        />
        <EnterpriseStatCard
          label="Team Members"
          value={teamMembers}
          hint={teamMemberLimit ? `${teamMemberLimit.remaining ?? "Unlimited"} remaining in allowance` : "Source: canonical capabilities"}
        />
      </div>

      {/* Main Content Layout */}
      <div className="grid gap-4 xl:grid-cols-[1fr_320px]">
        
        {/* Left Column (Main Feed & Activity) */}
        <div className="space-y-4">
          
          {events.length === 0 && (
            <EnterpriseChecklist
              title="Deployment Checklist"
              items={[
                {
                  title: "Choose a subscription",
                  description: "Pick the right commercial plan for your event portfolio.",
                  icon: CreditCard,
                },
                {
                  title: "Create your first event",
                  description: "Set event basics, dates, timezone, and workspace modules.",
                  icon: Calendar,
                },
                {
                  title: "Invite your team",
                  description: "Add operations, finance, and support collaborators to the workspace.",
                  icon: Users,
                },
              ]}
            />
          )}

          {/* Activity Log Panel */}
          <EnterprisePanel className="p-6">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-[16px] font-semibold tracking-[-0.02em] text-[var(--color-text-primary)]">
                Recent Organization Activity
              </h3>
              <Button variant="ghost" size="sm" className="h-8 text-[12px] text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]">
                View All <ArrowRight className="ml-2 h-3 w-3" />
              </Button>
            </div>
            
            <div className="space-y-6">
              {mockRecentActivity.length === 0 && (
                <div className="flex flex-col items-center justify-center py-8 text-center">
                  <Activity className="h-8 w-8 text-[var(--color-border)] mb-3" />
                  <p className="text-[13px] font-medium text-[var(--color-text-secondary)]">No recent activity</p>
                  <p className="text-[12px] text-[var(--color-text-muted)] mt-1">Activity logs will appear here once connected.</p>
                </div>
              )}
            </div>
          </EnterprisePanel>
        </div>

        {/* Right Column (Quick Actions & Alerts) */}
        <div className="space-y-4">
          
          {/* Quick Actions */}
          <EnterprisePanel className="p-6">
            <h3 className="text-[16px] font-semibold tracking-[-0.02em] text-[var(--color-text-primary)] mb-5">
              Quick Actions
            </h3>
            <div className="space-y-3">
              <Link href="/events?create=true" className="flex items-center gap-3 p-3 rounded-xl hover:bg-white/[0.03] border border-transparent hover:border-[var(--color-border)] transition-colors group">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--color-primary-mid)]/10 text-[var(--color-primary-mid)] group-hover:bg-[var(--color-primary-mid)]/20 transition-colors">
                  <PlusCircle className="h-4 w-4" />
                </div>
                <div className="flex-1 text-[13px] font-medium text-[var(--color-text-primary)]">Deploy Event</div>
              </Link>
              <Link href="/team" className="flex items-center gap-3 p-3 rounded-xl hover:bg-white/[0.03] border border-transparent hover:border-[var(--color-border)] transition-colors group">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/5 text-[var(--color-text-primary)] group-hover:bg-white/10 transition-colors">
                  <Users className="h-4 w-4" />
                </div>
                <div className="flex-1 text-[13px] font-medium text-[var(--color-text-primary)]">Invite Team Member</div>
              </Link>
              <Link href="/billing" className="flex items-center gap-3 p-3 rounded-xl hover:bg-white/[0.03] border border-transparent hover:border-[var(--color-border)] transition-colors group">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/5 text-[var(--color-text-primary)] group-hover:bg-white/10 transition-colors">
                  <CreditCard className="h-4 w-4" />
                </div>
                <div className="flex-1 text-[13px] font-medium text-[var(--color-text-primary)]">Manage Billing</div>
              </Link>
            </div>
          </EnterprisePanel>

          {/* Alerts & Notifications */}
          <EnterprisePanel className="p-6">
            <div className="flex items-center gap-2 mb-5">
              <Bell className="h-4 w-4 text-[var(--color-text-secondary)]" />
              <h3 className="text-[16px] font-semibold tracking-[-0.02em] text-[var(--color-text-primary)]">
                System Alerts
              </h3>
            </div>
            
            <div className="space-y-3">
              {mockAlerts.length === 0 && (
                <p className="text-[13px] text-[var(--color-text-muted)] text-center py-4">No active alerts</p>
              )}
            </div>
          </EnterprisePanel>
          
        </div>
      </div>

      {createIntent && events.length === 0 ? (
        <EnterpriseEmptyState
          icon={CheckCircle2}
          title="Preparing your event setup"
          description="The create-event workflow opens from the Events page so we can keep the organizer experience consistent."
          actionLabel="Continue to Events"
          actionHref="/events?create=true"
        />
      ) : null}
    </div>
  );
}
