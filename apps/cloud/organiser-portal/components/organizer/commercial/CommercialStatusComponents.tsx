"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowRight, CircleAlert, Gauge } from "lucide-react";
import { useCloudUsage } from "@/hooks/useCloudCommercial";

export function CapacityUsageMeter({ label, used, total, remaining }: { label: string; used: number; total: number; remaining: number }) {
  const percentage = total > 0 ? Math.min(100, Math.round((used / total) * 100)) : 0;
  const danger = remaining <= 0;
  return <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-3"><div className="flex items-center justify-between gap-3 text-xs"><span className="font-medium text-[var(--text-primary)]">{label.replaceAll("_", " ")}</span><span className={danger ? "font-semibold text-[var(--danger)]" : "text-[var(--text-secondary)]"}>{remaining} remaining</span></div><div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[var(--bg-surface-3)]"><div className={`h-full rounded-full ${danger ? "bg-[var(--danger)]" : "bg-[var(--acc)]"}`} style={{ width: `${percentage}%` }} /></div><p className="mt-1 text-[10px] text-[var(--text-secondary)]">{used} used or reserved of {total}</p></div>;
}

export function CapacityExhaustedState({ label = "This capacity is exhausted." }: { label?: string }) {
  return <div role="alert" className="flex items-start gap-3 rounded-xl border border-[var(--danger)]/30 bg-[var(--danger)]/5 p-4 text-sm"><CircleAlert className="mt-0.5 size-4 shrink-0 text-[var(--danger)]" /><div><p className="font-medium text-[var(--text-primary)]">{label}</p><p className="mt-1 text-xs text-[var(--text-secondary)]">Existing records remain readable. New affected records require additional capacity.</p></div></div>;
}

export function AddCapacityAction({ eventId }: { eventId?: string }) {
  return <Link href={`/commercial/capacity${eventId ? `?eventId=${encodeURIComponent(eventId)}` : ""}`} className="inline-flex items-center gap-1.5 text-sm font-medium text-[var(--acc)] hover:underline">Add capacity <ArrowRight className="size-4" /></Link>;
}

export function FeatureUnavailableState({ children = "This feature is not included in the current commercial contract." }: { children?: ReactNode }) {
  return <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface-2)] p-4 text-sm text-[var(--text-secondary)]">{children}</div>;
}

export function CommercialStatusBanner({ eventId }: { eventId: string }) {
  const usage = useCloudUsage(eventId);
  if (usage.isLoading) return <div role="status" className="rounded-xl border border-[var(--border-subtle)] p-4 text-sm text-[var(--text-secondary)]">Loading commercial capacity…</div>;
  if (usage.isError) return <FeatureUnavailableState>Commercial capacity is currently unavailable. Operational data has not been changed.</FeatureUnavailableState>;
  const items = usage.data?.items ?? [];
  const isFreeTier = Boolean(usage.data?.is_free_tier);
  const exhausted = items.filter((item: any) => item.remaining <= 0);
  return (
    <section aria-labelledby="commercial-status-title" className="space-y-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface-2)] p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Gauge className="size-4 text-[var(--acc)]" />
          <h2 id="commercial-status-title" className="text-sm font-semibold text-[var(--text-primary)]">Commercial capacity</h2>
          {isFreeTier && (
            <span className="inline-flex items-center rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold text-amber-600 dark:text-amber-400 border border-amber-500/20">
              Draft · Free Tier
            </span>
          )}
        </div>
        {isFreeTier ? (
          <Link
            href={`/commercial/workspace?event=${encodeURIComponent(eventId)}`}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-[var(--org-purple,#7c3aed)] hover:underline"
          >
            Upgrade to Event Plan <ArrowRight className="size-3.5" />
          </Link>
        ) : (
          <AddCapacityAction eventId={eventId} />
        )}
      </div>

      {isFreeTier && (
        <div className="rounded-lg border border-amber-500/20 bg-amber-50/50 dark:bg-amber-950/20 px-3.5 py-2.5 text-xs text-amber-800 dark:text-amber-300">
          <p className="font-medium">
            Draft event running under Free Tier limits: 25 registrations, 5 speakers, 5 abstracts, 1 GB storage, and 100 emails.
          </p>
          <p className="mt-0.5 text-[11px] text-amber-700/80 dark:text-amber-400/80">
            You can register attendees and add speakers within these free limits. Purchase or grant an Event Plan to unlock full event entitlements.
          </p>
        </div>
      )}

      {exhausted.length > 0 ? (
        <CapacityExhaustedState label={`${exhausted.length} event capacity limit${exhausted.length === 1 ? "" : "s"} reached.`} />
      ) : items.length === 0 ? (
        <p className="text-xs text-[var(--text-secondary)]">No event allocation has been published yet.</p>
      ) : (
        <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
          {items.slice(0, 6).map((item: any) => (
            <CapacityUsageMeter
              key={item.id}
              label={item.entitlement_key}
              used={item.consumed + item.reserved}
              total={item.total}
              remaining={item.remaining}
            />
          ))}
        </div>
      )}
    </section>
  );
}
