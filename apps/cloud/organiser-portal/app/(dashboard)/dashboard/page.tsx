"use client";

import { useMemo, useState } from "react";
import {
  Calendar,
  CheckCircle2,
  CreditCard,
  FolderKanban,
  Rocket,
  ShieldCheck,
  Sparkles,
  Users,
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

export default function PlatformDashboardPage() {
  const router = useRouter();
  const { user } = useAuthStore();
  const { data: events = [] } = useEvents();
  const { data: currentPlan } = useCurrentPlan();
  const [createIntent, setCreateIntent] = useState(false);

  const activeEvents = useMemo(
    () => events.filter((event) => event.status !== "archived" && event.status !== "completed").length,
    [events]
  );

  const subscriptionsCount = currentPlan ? 1 : 0;
  const storageUsed = "0 B";

  return (
    <div className="space-y-6 pb-8">
      <EnterprisePageIntro
        title="Dashboard"
        subtitle={`Welcome${user?.full_name ? `, ${user.full_name}` : ""}. Set up your workspace and bring your first conference live from one place.`}
      />

      <EnterprisePanel className="overflow-hidden border-violet-200 bg-[linear-gradient(135deg,#f8f7ff_0%,#ffffff_56%,#f5f9ff_100%)] p-6">
        {events.length === 0 ? (
          <div className="grid gap-6 lg:grid-cols-[220px_1fr] lg:items-center">
            <div className="flex justify-center lg:justify-start">
              <div className="relative flex h-36 w-36 items-center justify-center rounded-full bg-violet-100/80">
                <div className="absolute -bottom-2 left-4 h-10 w-10 rounded-2xl bg-amber-100" />
                <Calendar className="h-16 w-16 text-violet-500" />
              </div>
            </div>
            <div>
              <p className="text-[24px] font-bold tracking-[-0.04em] text-slate-950">
                You don&apos;t have any active events yet
              </p>
              <p className="mt-3 max-w-xl text-[14px] leading-6 text-slate-500">
                Create your first event to unlock registrations, speaker workflows, billing, and operating dashboards across the organizer portal.
              </p>
              <Button
                onClick={() => {
                  setCreateIntent(true);
                  router.push("/events?create=true");
                }}
                className="mt-5 h-11 rounded-xl px-5 text-[12px] font-semibold"
              >
                Create New Event
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-[24px] font-bold tracking-[-0.04em] text-slate-950">
                Your workspace is ready
              </p>
              <p className="mt-2 max-w-2xl text-[14px] leading-6 text-slate-500">
                Track active events, manage subscriptions, and coordinate your team without leaving the organizer portal.
              </p>
            </div>
            <Button onClick={() => router.push("/events")} className="h-11 rounded-xl px-5 text-[12px] font-semibold">
              Open Events
            </Button>
          </div>
        )}
      </EnterprisePanel>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <EnterpriseStatCard
          label="Events"
          value={String(events.length)}
          hint={events.length === 0 ? "No events created" : `${activeEvents} active or upcoming`}
        />
        <EnterpriseStatCard
          label="Active Subscriptions"
          value={String(subscriptionsCount)}
          hint={subscriptionsCount ? "Subscription available" : "No active subscriptions"}
        />
        <EnterpriseStatCard
          label="Team Members"
          value="1"
          hint={user?.full_name ? `${user.full_name.split(" ")[0]} is set up` : "Only you"}
        />
        <EnterpriseStatCard label="Storage Used" value={storageUsed} hint="of 5 GB" />
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.25fr_0.75fr]">
        <EnterpriseChecklist
          title="Next Steps"
          items={[
            {
              title: "Create your first event",
              description: "Set event basics, dates, timezone, and workspace modules.",
              icon: Calendar,
            },
            {
              title: "Choose a subscription",
              description: "Pick the right commercial plan for your event portfolio.",
              icon: CreditCard,
            },
            {
              title: "Invite your team",
              description: "Add operations, finance, and support collaborators to the workspace.",
              icon: Users,
            },
          ]}
        />

        <EnterprisePanel className="p-6">
          <h3 className="text-[16px] font-semibold tracking-[-0.02em] text-slate-950">
            Why choose EventX OS?
          </h3>
          <div className="mt-5 space-y-4">
            {[
              { icon: Sparkles, title: "Per-event subscriptions", description: "Launch only what you need for each conference." },
              { icon: FolderKanban, title: "Unified event operations", description: "Keep dashboards, registrations, and speakers aligned." },
              { icon: ShieldCheck, title: "Enterprise-grade governance", description: "Support secure access, roles, and team workflows." },
              { icon: Rocket, title: "Faster go-live cycles", description: "Move from onboarding to launch without stitching tools together." },
            ].map((item) => (
              <div key={item.title} className="flex gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-50">
                  <item.icon className="h-5 w-5 text-violet-500" />
                </div>
                <div>
                  <p className="text-[14px] font-semibold text-slate-900">{item.title}</p>
                  <p className="mt-1 text-[13px] leading-5 text-slate-500">{item.description}</p>
                </div>
              </div>
            ))}
          </div>
        </EnterprisePanel>
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
