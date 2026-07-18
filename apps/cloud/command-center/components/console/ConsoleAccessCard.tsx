"use client";
import Link from "next/link";
import { ArrowUpRight, Clock3 } from "lucide-react";
import type { ConsoleDefinition } from "@/lib/console-registry";
import { PremiumAssetIcon, type PremiumAssetKey, type PremiumAssetTone } from "@/components/super-admin/ui/PremiumAssetIcon";
import { useConsoleSummary } from "@/services/super-admin-service";

const ASSETS: Record<string, { key: PremiumAssetKey; tone: PremiumAssetTone }> = {
  home: { key: "organization", tone: "neutral" }, business: { key: "proposal", tone: "violet" }, revenue: { key: "invoice", tone: "green" }, operations: { key: "database", tone: "amber" }, security: { key: "security", tone: "red" }, developer: { key: "api", tone: "blue" }, support: { key: "ticket", tone: "amber" }, settings: { key: "workflow", tone: "violet" },
};

export function ConsoleAccessCard({ definition, count, attention, freshness, health = "unknown" }: { definition: ConsoleDefinition; count?: number; attention?: number; freshness?: string; health?: "healthy" | "degraded" | "down" | "unknown" }) {
  const asset = ASSETS[definition.key];
  const summary = useConsoleSummary(definition.key);
  const resolvedHealth = summary.data?.health ?? health;
  const resolvedCount = summary.data?.resource_count ?? count;
  const resolvedAttention = summary.data?.attention.length ?? attention;
  const resolvedFreshness = summary.data?.generated_at ? `Updated ${new Date(summary.data.generated_at).toLocaleTimeString()}` : freshness;
  return <article className="group flex min-h-64 flex-col rounded-2xl border border-[var(--border-default)] bg-[var(--bg-surface)] p-5 shadow-[var(--shadow-panel)] transition-[transform,box-shadow] hover:-translate-y-1 hover:shadow-[var(--shadow-card-hover)]">
    <div className="flex items-start justify-between gap-4"><PremiumAssetIcon assetKey={asset.key} tone={asset.tone} size="lg" label={`${definition.shortName} console`} /><span className={`rounded-full px-2 py-1 text-[10px] font-semibold ${resolvedHealth === "healthy" ? "bg-[var(--success-muted)] text-[var(--success)]" : resolvedHealth === "degraded" ? "bg-[var(--warning-muted)] text-[var(--warning)]" : resolvedHealth === "down" ? "bg-[var(--danger-muted)] text-[var(--danger)]" : "bg-[var(--bg-surface-3)] text-[var(--text-tertiary)]"}`}>{summary.isLoading ? "Checking…" : resolvedHealth === "unknown" ? "Capability unavailable" : resolvedHealth}</span></div>
    <div className="mt-5 flex-1"><h2 className="text-base font-semibold text-[var(--text-primary)]">{definition.name}</h2><p className="mt-2 text-xs leading-5 text-[var(--text-secondary)]">{definition.description}</p></div>
    <div className="mt-5 grid grid-cols-2 gap-2 border-y border-[var(--border-subtle)] py-3"><div><p className="text-[10px] uppercase tracking-wide text-[var(--text-tertiary)]">Resources</p><p className="mt-1 font-mono text-sm font-semibold tabular-nums text-[var(--text-primary)]">{resolvedCount ?? "—"}</p></div><div><p className="text-[10px] uppercase tracking-wide text-[var(--text-tertiary)]">Attention</p><p className="mt-1 font-mono text-sm font-semibold tabular-nums text-[var(--text-primary)]">{resolvedAttention ?? "—"}</p></div></div>
    <div className="mt-4 flex items-center justify-between gap-3"><span className="flex items-center gap-1.5 text-[10px] text-[var(--text-tertiary)]"><Clock3 className="size-3" />{resolvedFreshness || (summary.isError ? "Summary unavailable" : "No summary generated")}</span><Link href={definition.dashboardRoute} className="inline-flex h-9 items-center gap-2 rounded-lg bg-[var(--text-primary)] px-3 text-xs font-semibold text-[var(--bg-surface)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]">Open console<ArrowUpRight className="size-3.5" /></Link></div>
  </article>;
}
