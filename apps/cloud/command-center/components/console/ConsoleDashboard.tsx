"use client";
import { AlertTriangle, Clock3, RefreshCw } from "lucide-react";
import { useConsole } from "./ConsoleProvider";
import { useConsoleSummary } from "@/services/super-admin-service";
import { PageContainer } from "@/components/super-admin/ui/PageContainer";
import { SectionHeader } from "@/components/super-admin/ui/SectionHeader";
import { KpiCard } from "@/components/super-admin/ui/KpiCard";
import { Button } from "@/components/ui/button";

export function ConsoleDashboard() {
  const { console: definition, consoleKey } = useConsole();
  const { data, isLoading, error, refetch, isFetching } = useConsoleSummary(consoleKey);
  return <PageContainer><SectionHeader title={definition.name} description={definition.description} breadcrumb={["Command Center", definition.shortName]} actions={<Button variant="outline" onClick={() => refetch()} disabled={isFetching}><RefreshCw className={`mr-2 size-3.5 ${isFetching ? "animate-spin" : ""}`} />Refresh</Button>} />
    {isLoading ? <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">{Array.from({ length: 4 }).map((_, index) => <div key={index} className="h-40 animate-pulse rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)]" />)}</div> : error ? <div className="rounded-xl border border-[var(--danger)]/25 bg-[var(--danger-muted)] p-5 text-sm text-[var(--danger)]"><AlertTriangle className="mb-2 size-5" />The live console summary is unavailable. Existing console pages remain accessible from navigation.</div> : data ? <>
      <div className="mb-4 flex items-center gap-2 text-[10px] text-[var(--text-tertiary)]"><Clock3 className="size-3" />Generated {new Date(data.generated_at).toLocaleString()}</div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">{data.metrics.map((metric) => <KpiCard key={metric.key} title={metric.label} value={`${metric.value}${metric.unit ? ` ${metric.unit}` : ""}`} delta={metric.comparison} deltaLabel={metric.comparison_label || ""} icon={definition.icon} iconColor={metric.status === "danger" ? "danger" : metric.status === "warning" ? "warning" : "brand"} destination={metric.destination} />)}</div>
      {data.metrics.length === 0 && <div className="rounded-xl border border-dashed border-[var(--border-default)] bg-[var(--bg-surface)] p-8 text-center"><p className="text-sm font-medium text-[var(--text-primary)]">No summary metrics available</p><p className="mt-1 text-xs text-[var(--text-secondary)]">This console is live, but its aggregate capabilities are not yet available. No placeholder values are shown.</p></div>}
      {data.attention.length > 0 && <section className="mt-5 rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface)] p-5"><h2 className="text-sm font-semibold text-[var(--text-primary)]">Needs attention</h2><div className="mt-3 divide-y divide-[var(--border-subtle)]">{data.attention.map((entry) => <a key={entry.id} href={entry.destination} className="flex items-center justify-between gap-3 py-3 text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)]"><span>{entry.label}</span><span className="rounded-full bg-[var(--warning-muted)] px-2 py-1 text-[10px] text-[var(--warning)]">{entry.severity}</span></a>)}</div></section>}
    </> : null}
  </PageContainer>;
}
