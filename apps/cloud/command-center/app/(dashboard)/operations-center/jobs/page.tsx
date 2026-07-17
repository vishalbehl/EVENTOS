"use client";

import React, { useState, useEffect } from "react";
import { 
  JobExecution,
  useBackgroundJobs,
  useJobControl,
} from "@/services/super-admin-service";
import { toast } from "sonner";
import { 
  Play, CheckCircle2, AlertCircle, RefreshCw, Clock,
  ChevronDown, ChevronRight, ShieldAlert,
  Terminal, Database, Layers, CheckSquare
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { PageContainer } from "@/components/super-admin/ui/PageContainer";
import { SectionHeader } from "@/components/super-admin/ui/SectionHeader";
import { StatusBadge } from "@/components/super-admin/ui/StatusBadge";
import { MetricRow } from "@/components/super-admin/ui/MetricRow";

// Debounce hook
function useDebounce<T>(value: T, delay = 300): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => {
      clearTimeout(handler);
    };
  }, [value, delay]);

  return debouncedValue;
}

const STATUS_STYLES: Record<string, { bg: string; text: string; status: "active" | "disabled" | "pending" | "failed" | "warning"; icon: any }> = {
  queued: { bg: "bg-blue-500/10 border-blue-500/20", text: "text-blue-400", status: "pending", icon: Clock },
  running: { bg: "bg-amber-500/10 border-amber-500/20", text: "text-amber-400 animate-pulse", status: "pending", icon: Play },
  success: { bg: "bg-emerald-500/10 border-emerald-500/20", text: "text-emerald-400", status: "active", icon: CheckCircle2 },
  failed: { bg: "bg-red-500/10 border-red-500/20", text: "text-red-400", status: "failed", icon: AlertCircle },
  retrying: { bg: "bg-purple-500/10 border-purple-500/20", text: "text-purple-400", status: "warning", icon: RefreshCw },
};

export default function JobsMonitorPage() {
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [queueFilter, setQueueFilter] = useState<string>("ALL");
  const [page, setPage] = useState(1);
  const pageSize = 15;

  const [expandedExecutionId, setExpandedExecutionId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [controlTarget, setControlTarget] = useState<{ job: JobExecution; action: "retry" | "cancel" } | null>(null);
  const [controlReason, setControlReason] = useState("");
  const jobControl = useJobControl();
  const debouncedSearchTerm = useDebounce(searchTerm, 300);

  const {
    data: jobsData,
    isLoading: execLoading,
    isFetching,
    refetch,
  } = useBackgroundJobs({
    status: statusFilter || undefined,
    queue: queueFilter === "ALL" ? undefined : queueFilter,
    skip: (page - 1) * pageSize,
    limit: pageSize,
  });

  const stats = jobsData?.summary;
  const executions: JobExecution[] = jobsData?.items || [];
  const totalExecutions = jobsData?.total || 0;
  const totalPages = Math.ceil(totalExecutions / pageSize);
  const unavailableSources = jobsData?.unavailable_sources || [];

  const refreshAll = () => {
    refetch();
  };

  // Debounced search filtering
  const term = debouncedSearchTerm.toLowerCase();
  const filteredExecutions = debouncedSearchTerm
    ? executions.filter(e =>
      e.task_name?.toLowerCase().includes(term) ||
      e.id.toLowerCase().includes(term)
    )
    : executions;

  const kpis = [
    { label: "Running Now", value: (stats?.running ?? 0).toString(), icon: Play, delta: stats?.running ? "Active process" : "Idle" },
    { label: "Pending Queue", value: (stats?.queued ?? stats?.pending ?? 0).toString(), icon: Clock },
    { label: "Failed Jobs", value: (stats?.failed ?? 0).toString(), icon: AlertCircle, delta: stats?.failed ? "Needs check" : "Healthy" },
    { label: "Sources", value: unavailableSources.length ? "Partial" : "Ready", icon: CheckSquare, delta: unavailableSources.length ? `${unavailableSources.length} unavailable` : "All readable" }
  ];

  return (
    <PageContainer>
      <SectionHeader
        title="Background Jobs Monitor"
        description="Celery task pools broker checks, asynchronous event reconciliations, and retry managers."
        breadcrumb={["Console", "Operations", "Jobs"]}
        actions={
          <Button
            variant="outline"
            onClick={refreshAll}
            size="sm"
            className="border-border"
          >
            <RefreshCw className={cn("w-3.5 h-3.5 mr-2 text-[var(--text-tertiary)]", (isFetching || execLoading) && "animate-spin")} />
            Refresh
          </Button>
        }
      />

      {/* Summary KPI Bar */}
      <MetricRow metrics={kpis} />

      {/* Filters Toolbar */}
      <div className="rounded-xl border border-border bg-surface p-4 flex flex-wrap gap-4 items-center justify-between">
        <div className="flex flex-wrap items-center gap-3 flex-1">
          {/* Search Input */}
          <div className="flex items-center gap-2 bg-surface border border-border rounded-xl px-3 py-1.5 flex-1 min-w-[200px] max-w-[320px]">
            <span className="text-[10px] font-bold text-[var(--text-tertiary)] uppercase tracking-wider">Search:</span>
            <input
              aria-label="Search jobs"
              type="text"
              placeholder="Filter by job name or ID..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="bg-transparent text-xs text-[var(--text-primary)] outline-none border-none w-full"
            />
          </div>

          {/* Status Buttons */}
          <div className="flex gap-1.5 bg-surface-2 p-1 rounded-xl border border-border flex-wrap">
            {["", "queued", "running", "success", "failed", "retrying"].map((st) => (
              <button
                key={st}
                onClick={() => { setStatusFilter(st); setPage(1); }}
                className={cn(
                  "px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all border",
                  statusFilter === st
                    ? "bg-[var(--brand-primary)] text-[var(--primary-foreground)] border-transparent shadow-sm"
                    : "bg-transparent border-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                )}
              >
                {st || "All Statuses"}
              </button>
            ))}
          </div>

          {/* Queue Filter */}
          <div className="flex items-center gap-1.5 bg-surface border border-border rounded-xl px-2.5">
            <span className="text-[9px] text-[var(--text-tertiary)] uppercase tracking-wider font-bold pl-1">Queue:</span>
            <select
              aria-label="Queue filter"
              value={queueFilter}
              onChange={(e) => {
                setQueueFilter(e.target.value);
                setPage(1);
              }}
              className="bg-transparent text-xs text-[var(--text-secondary)] py-1.5 focus:outline-none border-none cursor-pointer pr-4 font-bold"
            >
              <option value="ALL" className="bg-surface">All Queues</option>
              <option value="imports" className="bg-surface">Imports</option>
              <option value="search" className="bg-surface">Search</option>
              <option value="presentations" className="bg-surface">Presentations</option>
              <option value="badges" className="bg-surface">Badges</option>
              <option value="venue-sync" className="bg-surface">Venue Sync</option>
            </select>
          </div>

        </div>
      </div>

      {/* Executions Table */}
      <div className="rounded-xl border border-border bg-surface overflow-hidden shadow-sm relative">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-border bg-surface-2/40">
              {["Job Name", "Execution ID", "Status", "Duration", "Started", "Finished / Actions"].map((h) => (
                <th key={h} className="px-5 py-3.5 text-[9px] font-bold uppercase tracking-widest text-[var(--text-tertiary)]">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border/60 text-[11px]">
            {execLoading ? (
              <tr>
                <td colSpan={6} className="p-10 text-center text-[var(--text-tertiary)] text-xs">
                  <RefreshCw className="w-4 h-4 animate-spin mx-auto text-[var(--brand-primary)] mb-2" />
                  Synchronizing execution pools...
                </td>
              </tr>
            ) : filteredExecutions.length === 0 ? (
              <tr>
                <td colSpan={6} className="p-12 text-center text-[var(--text-tertiary)] text-xs">
                  <ShieldAlert className="w-8 h-8 text-[var(--text-tertiary)]/30 mx-auto mb-3" />
                  No executions found matching filters.
                </td>
              </tr>
            ) : (
              filteredExecutions.map((exe) => {
                const Style = STATUS_STYLES[exe.status] || STATUS_STYLES.queued;
                const isExpanded = expandedExecutionId === exe.id;

                const isFailed = exe.status === "failed";
                const isPending = exe.status === "queued" || exe.status === "running";

                return (
                  <React.Fragment key={exe.id}>
                    <tr 
                      onClick={() => setExpandedExecutionId(isExpanded ? null : exe.id)}
                      className={cn(
                        "hover:bg-surface-hover/30 transition-colors cursor-pointer items-center border-b border-border/40 last:border-0",
                        isExpanded && "bg-[var(--brand-primary-muted)]/5 hover:bg-[var(--brand-primary-muted)]/10"
                      )}
                    >
                      <td className="px-5 py-4">
                        <div className="min-w-0 flex items-center gap-2.5">
                          <Terminal className="w-3.5 h-3.5 text-[var(--brand-primary)] shrink-0" />
                          <div>
                            <p className="font-bold text-[var(--text-primary)] truncate max-w-[180px]">{exe.task_name || "Unknown Task"}</p>
                            <p className="text-[9px] text-[var(--text-tertiary)] font-mono">Queue: {exe.queue || "Not recorded"}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-5 py-4 font-mono text-[var(--text-tertiary)]">
                        {exe.id.slice(0, 8)}...{exe.id.slice(-8)}
                      </td>
                      <td className="px-5 py-4">
                        <StatusBadge status={Style.status} className="text-[10px] py-0 px-2 font-bold uppercase" />
                      </td>
                      <td className="px-5 py-4 font-mono text-[var(--text-secondary)]">
                        {exe.duration_seconds !== undefined && exe.duration_seconds !== null
                          ? `${exe.duration_seconds.toFixed(2)}s`
                          : "-"}
                      </td>
                      <td className="px-5 py-4 font-mono text-[var(--text-secondary)]">
                        {exe.started_at ? formatDistanceToNow(new Date(exe.started_at), { addSuffix: true }) : "-"}
                      </td>
                      <td className="px-5 py-4">
                        <div className="flex items-center justify-between gap-4">
                          <span className="font-mono text-[var(--text-tertiary)]">
                            {exe.finished_at ? new Date(exe.finished_at).toLocaleTimeString() : "-"}
                          </span>

                          <div className="flex gap-1.5" onClick={(e) => e.stopPropagation()}>
                            {isFailed && exe.capabilities?.retry && (
                              <Button
                                size="sm"
                                onClick={() => setControlTarget({ job: exe, action: "retry" })}
                                className="h-7 px-2.5 rounded bg-[var(--brand-primary-muted)] border border-[var(--brand-primary)]/20 hover:bg-[var(--brand-primary-muted)]/40 text-[var(--brand-primary)] text-[9px] font-bold"
                              >
                                Retry
                              </Button>
                            )}
                            {isPending && exe.capabilities?.cancel && (
                              <Button
                                size="sm"
                                onClick={() => setControlTarget({ job: exe, action: "cancel" })}
                                className="h-7 px-2.5 rounded bg-[var(--danger-muted)] border border-[var(--danger)]/20 hover:bg-[var(--danger-muted)]/40 text-[var(--danger)] text-[9px] font-bold"
                              >
                                Cancel
                              </Button>
                            )}
                            <button onClick={() => setExpandedExecutionId(isExpanded ? null : exe.id)} className="text-[var(--text-tertiary)] p-1 hover:text-[var(--text-primary)]">
                              {isExpanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                            </button>
                          </div>
                        </div>
                      </td>
                    </tr>

                    {/* EXPANDED FAILURES & PAYLOAD DETAIL DRAWERS */}
                    <AnimatePresence>
                      {isExpanded && (
                        <tr>
                          <td colSpan={6} className="px-6 py-4 bg-surface-2 border-b border-border">
                            <motion.div
                              initial={{ opacity: 0, height: 0 }}
                              animate={{ opacity: 1, height: "auto" }}
                              exit={{ opacity: 0, height: 0 }}
                              className="space-y-4"
                            >
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div className="space-y-1.5">
                                  <span className="text-[8px] font-black uppercase tracking-widest text-[var(--text-tertiary)] flex items-center gap-1">
                                    <Database className="w-3 h-3 text-[var(--brand-primary)]" /> Source Metadata
                                  </span>
                                  <pre className="rounded-xl border border-border bg-surface p-3 text-[10px] text-[var(--brand-primary)] font-mono overflow-x-auto max-h-[140px] custom-scrollbar">
                                    {JSON.stringify({
                                      source: exe.source || "unknown",
                                      queue: exe.queue || null,
                                      raw_status: exe.raw_status || null,
                                      job_id: exe.job_id,
                                    }, null, 2)}
                                  </pre>
                                </div>

                                <div className="space-y-1.5">
                                  <span className="text-[8px] font-black uppercase tracking-widest text-[var(--text-tertiary)] flex items-center gap-1">
                                    <Layers className="w-3 h-3 text-[var(--brand-primary)]" /> Operational Notes
                                  </span>
                                  <div className="rounded-xl border border-border bg-surface p-3 text-[10px] text-[var(--text-secondary)] font-mono space-y-1 max-h-[140px] overflow-y-auto custom-scrollbar">
                                    {exe.error_message ? (
                                      <p className="text-[var(--danger)]">{exe.error_message}</p>
                                    ) : (
                                      <p className="text-[var(--text-tertiary)]">No failure detail recorded for this job source.</p>
                                    )}
                                    <p className="text-[var(--text-tertiary)]">Controls are exposed only when the source adapter declares the action safe.</p>
                                  </div>
                                </div>
                              </div>
                            </motion.div>
                          </td>
                        </tr>
                      )}
                    </AnimatePresence>
                  </React.Fragment>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination controls */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between px-1 mt-4">
          <span className="text-[10px] text-[var(--text-tertiary)] font-mono">
            Page {page} of {totalPages} / Showing {executions.length} of {totalExecutions} executions
          </span>
          <div className="flex gap-2">
            <Button
              onClick={() => setPage(Math.max(1, page - 1))}
              disabled={page === 1}
              size="sm"
              className="border-border h-8 text-[11px] font-bold"
            >
              Previous
            </Button>
            <Button
              onClick={() => setPage(Math.min(totalPages, page + 1))}
              disabled={page === totalPages}
              size="sm"
              className="border-border h-8 text-[11px] font-bold"
            >
              Next
            </Button>
          </div>
        </div>
      )}
      {controlTarget && <div className="mt-5 rounded-xl border border-border bg-surface p-5"><h2 className="text-sm font-bold text-primary">{controlTarget.action === "cancel" ? "Cancel" : "Retry"} {controlTarget.job.task_name}</h2><p className="mt-1 text-xs text-secondary">This records an idempotent control request and immutable audit event.</p><div className="mt-3 flex flex-wrap gap-3"><input value={controlReason} onChange={e => setControlReason(e.target.value)} placeholder="Administrative reason" className="min-w-72 flex-1 rounded-lg border border-border bg-surface px-3 py-2 text-sm" /><Button disabled={controlReason.trim().length < 12 || jobControl.isPending} onClick={async () => { const job = controlTarget.job; if (!job.organization_id || !job.source) return toast.error("Job tenant scope is unavailable."); try { await jobControl.mutateAsync({ source: job.source, jobId: job.job_id, action: controlTarget.action, organizationId: job.organization_id, eventId: job.event_id, reason: controlReason, idempotencyKey: crypto.randomUUID() }); toast.success(`Job ${controlTarget.action} request recorded`); setControlTarget(null); setControlReason(""); } catch (e) { toast.error(e instanceof Error ? e.message : "Job control failed"); } }}>Confirm</Button><Button variant="outline" onClick={() => setControlTarget(null)}>Close</Button></div></div>}
    </PageContainer>
  );
}

// ── Job Failures trace viewer ────────────────────────────────────
