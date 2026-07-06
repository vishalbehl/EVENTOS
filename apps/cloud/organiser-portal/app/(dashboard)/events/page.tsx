"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  Calendar,
  CheckCircle2,
  MapPin,
  Plus,
  Rocket,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { useEvents } from "@/hooks/useEvents";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  EnterpriseEmptyState,
  EnterprisePageIntro,
  EnterprisePanel,
  EnterpriseStepRail,
} from "@/components/organizer/platform/EnterprisePortal";

export default function EventsPage() {
  const router = useRouter();
  const { data: events = [] } = useEvents();

  const sortedEvents = useMemo(
    () =>
      [...events].sort(
        (left, right) => new Date(right.start_date).getTime() - new Date(left.start_date).getTime()
      ),
    [events]
  );

  return (
    <div className="space-y-6 pb-8">
      <EnterprisePageIntro
        title="Events"
        subtitle="Run every organizer workspace from one geometry-led command surface. Plans, entitlements, and event creation now move through one controlled flow."
        action={
          <Button onClick={() => router.push("/events/new")} className="h-11 rounded-xl px-5 text-[12px] font-semibold">
            <Plus className="mr-1 h-4 w-4" />
            Create Event
          </Button>
        }
      />

      {sortedEvents.length === 0 ? (
        <>
          <EnterprisePanel className="border-dashed border-[rgba(224,255,0,0.18)]">
            <EnterpriseEmptyState
              icon={Calendar}
              title="No events yet"
              description="Your workspace is ready. Activate a plan, choose any add-ons you need, and create the first event from the same guided flow."
              actionLabel="Start creation flow"
              actionOnClick={() => router.push("/events/new")}
            />
          </EnterprisePanel>

          <EnterpriseStepRail
            title="Flow"
            steps={[
              {
                title: "Choose plan",
                description: "Select the organizer plan that unlocks event creation for this workspace.",
                icon: Sparkles,
              },
              {
                title: "Add extras",
                description: "Attach optional add-ons or skip them for now without breaking the creation flow.",
                icon: ShieldCheck,
              },
              {
                title: "Create event",
                description: "Add dates, venue details, and module settings only after entitlements are active.",
                icon: Calendar,
              },
              {
                title: "Go live",
                description: "Open the speaker and registration surfaces with the purchased limits already attached.",
                icon: Rocket,
              },
            ]}
          />
        </>
      ) : (
        <EnterprisePanel className="overflow-hidden">
          <div className="border-b border-[var(--color-border)] px-6 py-4">
            <div className="grid grid-cols-[2.2fr_1fr_1fr_auto] gap-4 text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--color-text-muted)]">
              <span>Event</span>
              <span>Date</span>
              <span>Location</span>
              <span>Status</span>
            </div>
          </div>
          <div className="divide-y divide-[var(--color-border-subtle)]">
            {sortedEvents.map((event) => (
              <button
                key={event.id}
                onClick={() => router.push(`/events/${event.id}/speaker/dashboard`)}
                className="grid w-full grid-cols-[2.2fr_1fr_1fr_auto] gap-4 px-6 py-5 text-left transition-colors hover:bg-white/[0.03]"
              >
                <div>
                  <p className="text-[15px] font-semibold text-[var(--color-text-primary)]">{event.name}</p>
                  <p className="mt-1 text-[12px] uppercase tracking-[0.14em] text-[var(--color-primary-mid)]">
                    {event.short_code}
                  </p>
                </div>
                <div className="flex items-center gap-2 text-[13px] text-[var(--color-text-secondary)]">
                  <Calendar className="h-4 w-4 text-[var(--color-primary-mid)]" />
                  {new Date(event.start_date).toLocaleDateString("en-IN", {
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                    timeZone: "Asia/Kolkata",
                  })}
                </div>
                <div className="flex items-center gap-2 text-[13px] text-[var(--color-text-secondary)]">
                  <MapPin className="h-4 w-4 text-[var(--color-primary-mid)]" />
                  <span className="truncate">{event.location || "Online"}</span>
                </div>
                <div className="flex justify-end">
                  <Badge variant="outline" className="border-[var(--color-border)] bg-white/[0.04] px-3 py-1 text-[11px] text-[var(--color-text-secondary)]">
                    {event.status}
                  </Badge>
                </div>
              </button>
            ))}
          </div>
        </EnterprisePanel>
      )}

      {sortedEvents.length > 0 ? (
        <EnterprisePanel className="p-6">
          <div className="flex items-start gap-3">
            <div className="hex-icon-shell flex h-11 w-11 items-center justify-center">
              <CheckCircle2 className="h-5 w-5 text-[var(--color-text-primary)]" />
            </div>
            <div>
              <p className="text-[16px] font-semibold tracking-[-0.02em] text-[var(--color-text-primary)]">
                Event routing is active
              </p>
              <p className="mt-2 text-[14px] leading-6 text-[var(--color-text-secondary)]">
                Selecting an event opens the workspace dashboard so your team can move directly into speaker and registration operations.
              </p>
            </div>
          </div>
        </EnterprisePanel>
      ) : null}
    </div>
  );
}
