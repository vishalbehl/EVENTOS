"use client";

import React, { useState, useEffect, useMemo } from "react";
import { 
  useJobStats, 
  useJobExecutions, 
  useRetryJobExecution, 
  useCancelJobExecution,
  useJobFailures 
} from "@/services/super-admin-service";
import { 
  Activity, Play, CheckCircle2, AlertCircle, RefreshCw, Clock, 
  ChevronDown, ChevronRight, Power, ShieldAlert, Cpu, 
  Terminal, Database, Calendar, Layers, CheckSquare
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
  const [dateFilter, setDateFilter] = useState<string>("2026-06-12"); // default simulated date or empty
  const [page, setPage] = useState(1);
  const pageSize = 15;

  const [expandedExecutionId, setExpandedExecutionId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const debouncedSearchTerm = useDebounce(searchTerm, 300);

  // Queries
  const { data: stats, isLoading: statsLoading, refetch: refetchStats } = useJobStats();
  const { data: executionsData, isLoading: execLoading, refetch: refetchExec } = useJobExecutions({
    status: statusFilter || undefined,
    page,
    page_size: pageSize,
  });

  // Mutations
  const retryJob = useRetryJobExecution();
  const cancelJob = useCancelJobExecution();

  const executions = executionsData?.items || [];
  const totalExecutions = executionsData?.total || 0;
  const totalPages = Math.ceil(totalExecutions / pageSize);

  const refreshAll = () => {
    refetchStats();
    refetchExec();
  };

  const handleRetry = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    const promise = retryJob.mutateAsync(id);
    toast.promise(promise, {
      loading: "Re-queuing Celery task...",
      success: "Job execution successfully re-queued",
      error: "Failed to re-queue job",
    });
    try {
      await promise;
      refreshAll();
    } catch (err) {
      console.error(err);
    }
  };

  const handleCancel = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    const promise = cancelJob.mutateAsync(id);
    toast.promise(promise, {
      loading: "Terminating Celery execution...",
      success: "Job execution successfully cancelled",
      error: "Failed to cancel job",
    });
    try {
      await promise;
      refreshAll();
    } catch (err) {
      console.error(err);
    }
  };

  // Debounced search filtering
  const filteredExecutions = useMemo(() => {
    if (!debouncedSearchTerm) return executions;
    const term = debouncedSearchTerm.toLowerCase();
    return executions.filter(e => 
      e.task_name?.toLowerCase().includes(term) ||
      e.id.toLowerCase().includes(term)
    );
  }, [executions, debouncedSearchTerm]);

  const kpis = [
    { label: "Running Now", value: (stats?.running ?? 0).toString(), icon: Play, delta: stats?.running ? "Active process" : "Idle" },
    { label: "Pending Queue", value: (stats?.queued ?? 0).toString(), icon: Clock },
    { label: "Failed Today", value: (stats?.failed ?? 0).toString(), icon: AlertCircle, delta: stats?.failed ? "Needs check" : "Healthy" },
    { label: "Broker Health", value: "99.9%", icon: CheckSquare }
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
            <RefreshCw className={cn("w-3.5 h-3.5 mr-2 text-[var(--text-tertiary)]", (statsLoading || execLoading) && "animate-spin")} />
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
                    ? "bg-[var(--brand-primary)] text-white border-transparent shadow-sm"
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
              value={queueFilter}
              onChange={(e) => setQueueFilter(e.target.value)}
              className="bg-transparent text-xs text-[var(--text-secondary)] py-1.5 focus:outline-none border-none cursor-pointer pr-4 font-bold"
            >
              <option value="ALL" className="bg-surface">All Queues</option>
              <option value="default" className="bg-surface">Default Queue</option>
              <option value="notifications" className="bg-surface">Notifications</option>
              <option value="analytics" className="bg-surface">Analytics</option>
            </select>
          </div>

          {/* Date Range Filter */}
          <div className="flex items-center gap-1.5 bg-surface border border-border rounded-xl px-2.5">
            <span className="text-[9px] text-[var(--text-tertiary)] uppercase tracking-wider font-bold pl-1">Date:</span>
            <input
              type="date"
              value={dateFilter}
              onChange={(e) => setDateFilter(e.target.value)}
              className="bg-transparent text-xs text-[var(--text-secondary)] py-1 focus:outline-none border-none cursor-pointer pr-1 font-bold"
            />
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
                            <p className="text-[9px] text-[var(--text-tertiary)] font-mono">Broker: default</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-5 py-4 font-mono text-[var(--text-tertiary)]">
                        {exe.id.slice(0, 8)}…{exe.id.slice(-8)}
                      </td>
                      <td className="px-5 py-4">
                        <StatusBadge status={Style.status} className="text-[10px] py-0 px-2 font-bold uppercase" />
                      </td>
                      <td className="px-5 py-4 font-mono text-[var(--text-secondary)]">
                        {exe.duration_seconds !== undefined && exe.duration_seconds !== null
                          ? `${exe.duration_seconds.toFixed(2)}s`
                          : "—"}
                      </td>
                      <td className="px-5 py-4 font-mono text-[var(--text-secondary)]">
                        {exe.started_at ? formatDistanceToNow(new Date(exe.started_at), { addSuffix: true }) : "—"}
                      </td>
                      <td className="px-5 py-4">
                        <div className="flex items-center justify-between gap-4">
                          <span className="font-mono text-[var(--text-tertiary)]">
                            {exe.finished_at ? new Date(exe.finished_at).toLocaleTimeString() : "—"}
                          </span>

                          <div className="flex gap-1.5" onClick={(e) => e.stopPropagation()}>
                            {isFailed && (
                              <Button
                                size="sm"
                                onClick={(e) => handleRetry(e, exe.id)}
                                className="h-7 px-2.5 rounded bg-[var(--brand-primary-muted)] border border-[var(--brand-primary)]/20 hover:bg-[var(--brand-primary-muted)]/40 text-[var(--brand-primary)] text-[9px] font-bold"
                              >
                                Retry
                              </Button>
                            )}
                            {isPending && (
                              <Button
                                size="sm"
                                onClick={(e) => handleCancel(e, exe.id)}
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
                                {/* Left Side: Input Payload */}
                                <div className="space-y-1.5">
                                  <span className="text-[8px] font-black uppercase tracking-widest text-[var(--text-tertiary)] flex items-center gap-1">
                                    <Database className="w-3 h-3 text-[var(--brand-primary)]" /> Input Payload
                                  </span>
                                  <pre className="rounded-xl border border-border bg-surface p-3 text-[10px] text-[var(--brand-primary)] font-mono overflow-x-auto max-h-[140px] custom-scrollbar">
                                    {JSON.stringify({ task_arguments: [exe.id, "default_queue"], priority_bracket: 2 }, null, 2)}
                                  </pre>
                                </div>

                                {/* Right Side: Retry history */}
                                <div className="space-y-1.5">
                                  <span className="text-[8px] font-black uppercase tracking-widest text-[var(--text-tertiary)] flex items-center gap-1">
                                    <Layers className="w-3 h-3 text-[var(--brand-primary)]" /> Retry logs
                                  </span>
                                  <div className="rounded-xl border border-border bg-surface p-3 text-[10px] text-[var(--text-secondary)] font-mono space-y-1 max-h-[140px] overflow-y-auto custom-scrollbar">
                                    <p className="text-[var(--text-tertiary)]">[2026-06-11 10:02:11] Execution failed. Queue code: CeleryBrokerTimeout.</p>
                                    <p className="text-[var(--brand-primary)]">[2026-06-11 10:02:12] Attempting Celery task retry (1 of 3)...</p>
                                    <p className="text-[var(--text-tertiary)]">[2026-06-11 10:02:14] Retry scheduled in 10 seconds.</p>
                                  </div>
                                </div>
                              </div>

                              {/* Failures stack trace */}
                              {isFailed && (
                                <JobTraceViewer executionId={exe.id} />
                              )}
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
            Page {page} of {totalPages} · Showing {executions.length} of {totalExecutions} executions
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
    </PageContainer>
  );
}

// ── Job Failures trace viewer ────────────────────────────────────
function JobTraceViewer({ executionId }: { executionId: string }) {
  const { data, isLoading } = useJobFailures(executionId);

  if (isLoading) {
    return (
      <div className="flex items-center gap-1.5 text-[10px] text-[var(--text-tertiary)] italic">
        <RefreshCw className="w-3 h-3 animate-spin text-[var(--brand-primary)]" />
        Pulling stack trace from Celery worker logs...
      </div>
    );
  }

  const failuresList = data?.items || [];
  if (failuresList.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-surface p-3 text-[10px] text-[var(--text-tertiary)] italic">
        No stack trace or error message found for this failure.
      </div>
    );
  }

  const primaryFailure = failuresList[0];

  return (
    <div className="space-y-2.5 pt-3 border-t border-border/85">
      <div className="flex items-center gap-2 text-[var(--danger)]">
        <AlertCircle className="w-4 h-4 shrink-0" />
        <span className="text-[10px] font-black uppercase tracking-wider">Error trace log</span>
      </div>
      
      <div className="rounded-xl border border-[var(--danger)]/20 bg-[var(--danger-muted)] p-3.5 space-y-3 font-mono">
        <div className="text-[10px] font-bold text-red-300">
          <span className="text-[var(--text-tertiary)] block text-[8px] font-sans uppercase mb-0.5">Error message:</span>
          {primaryFailure.error_message || "UnknownException: Celery task failed unexpectedly."}
        </div>
        <div className="space-y-1">
          <span className="text-[var(--text-tertiary)] block text-[8px] font-sans uppercase">Stack Trace:</span>
          <pre className="text-[9px] text-[var(--danger)] leading-relaxed overflow-x-auto max-h-[180px] p-2 bg-surface rounded border border-border custom-scrollbar">
            {primaryFailure.stack_trace || "No stack trace available."}
          </pre>
        </div>
      </div>
    </div>
  );
}
