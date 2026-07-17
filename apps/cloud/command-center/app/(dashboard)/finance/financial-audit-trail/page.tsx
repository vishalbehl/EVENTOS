"use client";

import React, { useState } from "react";
import { ShieldCheck, RefreshCw, Activity } from "lucide-react";
import { format } from "date-fns";
import { PageContainer } from "@/components/super-admin/ui/PageContainer";
import { SectionHeader } from "@/components/super-admin/ui/SectionHeader";
import { MetricRow } from "@/components/super-admin/ui/MetricRow";
import { TableSkeleton } from "@/components/super-admin/ui/LoadingSkeleton";
import { EmptyState } from "@/components/super-admin/ui/EmptyState";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useFinancialAuditTrail, type FinancialAuditEvent } from "@/hooks/useBilling";
import {
  SupportAccessScope,
  type SupportAccessSelection,
} from "@/components/super-admin/ui/SupportAccessScope";

// ── Constants ──────────────────────────────────────────────────────────────────

const ACTIVITY_COLORS: Record<string, string> = {
  INVOICE_CREATED: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  PAYMENT_RECEIVED: "bg-green-500/10 text-green-400 border-green-500/20",
  REFUND_APPROVED: "bg-yellow-500/10 text-yellow-400 border-yellow-500/20",
  CREDIT_NOTE_ISSUED: "bg-purple-500/10 text-purple-400 border-purple-500/20",
  SUBSCRIPTION_CREATED: "bg-cyan-500/10 text-cyan-400 border-cyan-500/20",
  PLAN_CHANGED: "bg-indigo-500/10 text-indigo-400 border-indigo-500/20",
  GATEWAY_CONFIG_CHANGED: "bg-orange-500/10 text-orange-400 border-orange-500/20",
  TAX_RULE_UPDATED: "bg-rose-500/10 text-rose-400 border-rose-500/20",
};

const ACTIVITY_TYPES = [
  "ALL",
  "INVOICE_CREATED",
  "PAYMENT_RECEIVED",
  "REFUND_APPROVED",
  "CREDIT_NOTE_ISSUED",
  "SUBSCRIPTION_CREATED",
  "PLAN_CHANGED",
];

const ENTITY_TYPES = ["ALL", "INVOICE", "PAYMENT", "REFUND", "CREDIT_NOTE", "SUBSCRIPTION", "GATEWAY"];

// ── Helpers ────────────────────────────────────────────────────────────────────

function fDate(d?: string) {
  if (!d) return "—";
  try { return format(new Date(d), "dd MMM yyyy, HH:mm:ss"); } catch { return d; }
}

function fCurrency(n?: number) {
  if (n == null) return "—";
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(n);
}

function ActivityBadge({ type }: { type: string }) {
  const cls = ACTIVITY_COLORS[type] ?? "bg-zinc-500/10 text-zinc-400 border-zinc-500/20";
  // Shorten display label
  const label = type.replace(/_/g, " ");
  return (
    <Badge className={`text-[9px] font-bold uppercase px-2 py-0.5 border whitespace-nowrap ${cls}`}>
      {label}
    </Badge>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function FinancialAuditTrailPage() {
  const [activityFilter, setActivityFilter] = useState("ALL");
  const [entityFilter, setEntityFilter] = useState("ALL");
  const [supportScope, setSupportScope] = useState<SupportAccessSelection | null>(null);

  const { data, isLoading, refetch, fetchNextPage, hasNextPage, isFetchingNextPage } = useFinancialAuditTrail({
    organizationId: supportScope?.organizationId,
    supportReason: supportScope?.reason,
    accessRequestId: supportScope?.accessRequestId,
    activityType: activityFilter === "ALL" ? undefined : activityFilter,
    entityType: entityFilter === "ALL" ? undefined : entityFilter,
  });
  const events = data?.pages.flatMap((page) => page.items) ?? [];

  const metrics = [
    { label: "Total Events", value: events.length, icon: Activity },
    { label: "Unique Activity Types", value: new Set(events.map(e => e.activity_type)).size, icon: ShieldCheck },
    { label: "With Amount", value: events.filter(e => e.amount_inr != null).length, icon: ShieldCheck },
    {
      label: "Total Tracked (INR)",
      value: fCurrency(events.reduce((s, e) => s + (e.amount_inr ?? 0), 0)),
      icon: ShieldCheck,
    },
  ];

  return (
    <PageContainer>
      <div className="flex items-start justify-between mb-6">
        <SectionHeader
          title="Financial Audit Trail"
          description="Immutable, append-only ledger of all financial events across the platform. Read-only."
        />
        <Button
          variant="outline"
          size="sm"
          onClick={() => refetch()}
          disabled={isLoading || !supportScope}
          className="shrink-0 gap-2 text-xs"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      <SupportAccessScope value={supportScope} onApply={setSupportScope} />

      {supportScope ? <MetricRow metrics={metrics} /> : null}

      {/* Activity filter */}
      <div className="mt-6 space-y-2">
        <p className="text-[10px] font-bold uppercase tracking-widest text-[var(--text-tertiary)]">
          Activity Type
        </p>
        <div className="flex gap-2 flex-wrap mb-2">
          {ACTIVITY_TYPES.map(f => (
            <button
              key={f}
              onClick={() => setActivityFilter(f)}
              className={`px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider border transition-all ${
                activityFilter === f
                  ? "bg-[var(--brand-primary)] text-[var(--primary-foreground)] border-[var(--brand-primary)]"
                  : "bg-[var(--bg-surface)] border-[var(--border-default)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
              }`}
            >
              {f === "ALL" ? "ALL" : f.replace(/_/g, " ")}
            </button>
          ))}
        </div>

        <p className="text-[10px] font-bold uppercase tracking-widest text-[var(--text-tertiary)] mt-2">
          Entity Type
        </p>
        <div className="flex gap-2 flex-wrap mb-4">
          {ENTITY_TYPES.map(f => (
            <button
              key={f}
              onClick={() => setEntityFilter(f)}
              className={`px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider border transition-all ${
                entityFilter === f
                  ? "bg-[var(--brand-secondary,#7c3aed)] text-white border-[var(--brand-secondary,#7c3aed)]"
                  : "bg-[var(--bg-surface)] border-[var(--border-default)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
              }`}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      {!supportScope ? (
        <EmptyState title="Select a support scope" description="Choose an organization and provide an access reason before viewing financial audit data." className="py-16" />
      ) : isLoading ? (
        <TableSkeleton rows={10} cols={6} />
      ) : events.length === 0 ? (
        <EmptyState
          title="No Audit Events"
          description="No financial events match the current filters."
          className="py-16"
        />
      ) : (
        <div className="rounded-2xl border border-[var(--border-default)] overflow-hidden">
          <div className="overflow-auto max-h-[calc(100vh-560px)]">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-[var(--border-default)] bg-[var(--bg-surface-2)]">
                  {["Activity", "Entity Type", "Entity", "Organisation", "Amount (INR)", "IP", "Occurred At"].map(h => (
                    <th
                      key={h}
                      className="sticky top-0 h-10 px-4 text-[10px] font-bold uppercase tracking-widest text-[var(--text-tertiary)] bg-[var(--bg-surface-2)] border-b border-[var(--border-default)] whitespace-nowrap"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {events.map((ev: FinancialAuditEvent) => (
                  <tr
                    key={ev.id}
                    className="border-b border-[var(--border-subtle)] hover:bg-[var(--bg-surface-2)] transition-colors"
                  >
                    <td className="px-4 py-3">
                      <ActivityBadge type={ev.activity_type} />
                    </td>
                    <td className="px-4 py-3 text-[var(--text-secondary)] font-semibold">{ev.entity_type}</td>
                    <td className="px-4 py-3">
                      {ev.entity_name ? (
                        <span className="text-[var(--text-primary)]">{ev.entity_name}</span>
                      ) : ev.entity_id ? (
                        <span className="font-mono text-[10px] text-[var(--text-tertiary)]">
                          {ev.entity_id.slice(0, 8)}…
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-4 py-3 font-mono text-[10px] text-[var(--text-tertiary)]">
                      {ev.organization_id ? `${ev.organization_id.slice(0, 8)}…` : "—"}
                    </td>
                    <td className="px-4 py-3">
                      {ev.amount_inr != null ? (
                        <span className="font-mono font-bold text-green-400">{fCurrency(ev.amount_inr)}</span>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-4 py-3 font-mono text-[10px] text-[var(--text-tertiary)]">
                      {ev.ip_address ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-[var(--text-secondary)] whitespace-nowrap">
                      {fDate(ev.occurred_at)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      {hasNextPage ? (
        <div className="mt-4 flex justify-center">
          <Button variant="outline" size="sm" disabled={isFetchingNextPage} onClick={() => void fetchNextPage()}>
            {isFetchingNextPage ? "Loading..." : "Load more"}
          </Button>
        </div>
      ) : null}
    </PageContainer>
  );
}
