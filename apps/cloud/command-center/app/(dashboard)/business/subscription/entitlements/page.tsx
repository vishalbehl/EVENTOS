"use client";

import React, { useState } from "react";
import { Layers, Zap, Clock, RefreshCw, CheckCircle2 } from "lucide-react";
import { format } from "date-fns";
import { PageContainer } from "@/components/super-admin/ui/PageContainer";
import { SectionHeader } from "@/components/super-admin/ui/SectionHeader";
import { MetricRow } from "@/components/super-admin/ui/MetricRow";
import { TableSkeleton } from "@/components/super-admin/ui/LoadingSkeleton";
import { EmptyState } from "@/components/super-admin/ui/EmptyState";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useEntitlementGrants, type EntitlementGrant } from "@/hooks/useBilling";
import {
  SupportAccessScope,
  type SupportAccessSelection,
} from "@/components/super-admin/ui/SupportAccessScope";

// ── Constants ──────────────────────────────────────────────────────────────────

const STATUS_COLORS: Record<string, string> = {
  ACTIVE: "bg-green-500/10 text-green-400 border-green-500/20",
  EXPIRED: "bg-red-500/10 text-red-400 border-red-500/20",
  CANCELLED: "bg-zinc-500/10 text-zinc-400 border-zinc-500/20",
  EXHAUSTED: "bg-orange-500/10 text-orange-400 border-orange-500/20",
  RESERVED: "bg-yellow-500/10 text-yellow-400 border-yellow-500/20",
};

const FILTER_OPTIONS = ["ALL", "ACTIVE", "EXPIRED", "CANCELLED", "EXHAUSTED"];

// ── Helpers ────────────────────────────────────────────────────────────────────

function fDate(d?: string) {
  if (!d) return "—";
  try { return format(new Date(d), "dd MMM yyyy"); } catch { return d; }
}

function StatusBadge({ status }: { status: string }) {
  const cls = STATUS_COLORS[status] ?? "bg-zinc-500/10 text-zinc-400 border-zinc-500/20";
  return (
    <Badge className={`text-[9px] font-bold uppercase px-2 py-0.5 border ${cls}`}>
      {status}
    </Badge>
  );
}

function ProgressBar({ consumed, total }: { consumed?: number; total?: number }) {
  if (total == null || total === 0) return <span className="text-xs text-[var(--text-tertiary)]">Unlimited</span>;
  const pct = Math.min(100, Math.round(((consumed ?? 0) / total) * 100));
  const color = pct >= 90 ? "bg-red-500" : pct >= 70 ? "bg-yellow-500" : "bg-green-500";
  return (
    <div className="flex items-center gap-2 min-w-[100px]">
      <div className="flex-1 bg-[var(--bg-surface-2)] rounded-full h-1.5">
        <div className={`${color} h-1.5 rounded-full transition-all`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-[10px] font-mono text-[var(--text-tertiary)] whitespace-nowrap">
        {consumed ?? 0}/{total}
      </span>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function EntitlementsPage() {
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [supportScope, setSupportScope] = useState<SupportAccessSelection | null>(null);
  const { data, isLoading, refetch, fetchNextPage, hasNextPage, isFetchingNextPage } = useEntitlementGrants({
    organizationId: supportScope?.organizationId,
    supportReason: supportScope?.reason,
    accessRequestId: supportScope?.accessRequestId,
    status: statusFilter === "ALL" ? undefined : statusFilter,
  });
  const grants = data?.pages.flatMap((page) => page.items) ?? [];

  const metrics = [
    { label: "Total Grants", value: grants.length, icon: Layers },
    { label: "Active", value: grants.filter(g => g.status === "ACTIVE").length, icon: CheckCircle2 },
    { label: "Expired", value: grants.filter(g => g.status === "EXPIRED").length, icon: Clock },
    { label: "Fully Consumed", value: grants.filter(g => g.status === "EXHAUSTED").length, icon: Zap },
  ];

  return (
    <PageContainer>
      <div className="flex items-start justify-between mb-6">
        <SectionHeader
          title="Entitlement Grants"
          description="Cross-tenant view of event units, add-ons, and capacity grants issued to organisations"
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

      {/* Filters */}
      <div className="flex gap-2 mt-6 mb-4 flex-wrap">
        {FILTER_OPTIONS.map(f => (
          <button
            key={f}
            onClick={() => setStatusFilter(f)}
            className={`px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider border transition-all ${
              statusFilter === f
                ? "bg-[var(--brand-primary)] text-white border-[var(--brand-primary)]"
                : "bg-[var(--bg-surface)] border-[var(--border-default)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
            }`}
          >
            {f}
          </button>
        ))}
      </div>

      {/* Table */}
      {!supportScope ? (
        <EmptyState title="Select a support scope" description="Choose an organization and provide an access reason before viewing entitlement data." className="py-16" />
      ) : isLoading ? (
        <TableSkeleton rows={8} cols={7} />
      ) : grants.length === 0 ? (
        <EmptyState
          title="No Entitlement Grants"
          description="No grants match the current filter."
          className="py-16"
        />
      ) : (
        <div className="rounded-2xl border border-[var(--border-default)] overflow-hidden">
          <div className="overflow-auto max-h-[calc(100vh-480px)]">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-[var(--border-default)] bg-[var(--bg-surface-2)]">
                  {["ID", "Org", "Grant Type", "Unit Type", "Consumption", "Status", "Valid Until"].map(h => (
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
                {grants.map((g: EntitlementGrant) => (
                  <tr
                    key={g.id}
                    className="border-b border-[var(--border-subtle)] hover:bg-[var(--bg-surface-2)] transition-colors"
                  >
                    <td className="px-4 py-3 font-mono text-[10px] text-[var(--text-tertiary)]">
                      {g.id.slice(0, 8)}…
                    </td>
                    <td className="px-4 py-3 font-mono text-[10px] text-[var(--text-tertiary)]">
                      {g.organization_id.slice(0, 8)}…
                    </td>
                    <td className="px-4 py-3">
                      <span className="font-semibold text-[var(--text-primary)]">{g.grant_type}</span>
                      <div className="text-[10px] text-[var(--text-tertiary)] mt-0.5">{g.scope_type}</div>
                    </td>
                    <td className="px-4 py-3 text-[var(--text-secondary)]">{g.unit_type}</td>
                    <td className="px-4 py-3">
                      <ProgressBar consumed={g.quantity_consumed} total={g.quantity_total} />
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={g.status} />
                    </td>
                    <td className="px-4 py-3 text-[var(--text-secondary)]">{fDate(g.valid_until)}</td>
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
