"use client";

import { useState } from "react";
import { useJobStats, useJobExecutions } from "@/services/super-admin-service";
import {
  Activity, Play, CheckCircle2, AlertCircle, RefreshCw, Clock,
  ArrowRight, ShieldAlert, Cpu
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";

const STATUS_STYLES: Record<string, { bg: string; text: string; icon: any }> = {
  queued: { bg: "bg-blue-500/10 border-blue-500/20", text: "text-blue-400", icon: Clock },
  running: { bg: "bg-amber-500/10 border-amber-500/20", text: "text-amber-400 animate-pulse", icon: Play },
  success: { bg: "bg-emerald-500/10 border-emerald-500/20", text: "text-emerald-400", icon: CheckCircle2 },
  failed: { bg: "bg-red-500/10 border-red-500/20", text: "text-red-400", icon: AlertCircle },
  retrying: { bg: "bg-purple-500/10 border-purple-500/20", text: "text-purple-400", icon: RefreshCw },
};

export default function JobsMonitorPage() {
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [page, setPage] = useState(1);
  const pageSize = 15;

  const { data: stats, isLoading: statsLoading, refetch: refetchStats } = useJobStats();
  const { data: executionsData, isLoading: execLoading, refetch: refetchExec } = useJobExecutions({
    status: statusFilter || undefined,
    page,
    page_size: pageSize,
  });

  const executions = executionsData?.items || [];
  const totalExecutions = executionsData?.total || 0;
  const totalPages = Math.ceil(totalExecutions / pageSize);

  const refreshAll = () => {
    refetchStats();
    refetchExec();
  };

  const kpis = [
    { label: "Active Jobs", value: stats?.active_jobs ?? 0, icon: Activity, color: "text-blue-400", bg: "bg-blue-500/5" },
    { label: "Running Tasks", value: stats?.running ?? 0, icon: Play, color: "text-amber-400", bg: "bg-amber-500/5" },
    { label: "Succeeded (Recent)", value: stats?.succeeded ?? 0, icon: CheckCircle2, color: "text-emerald-400", bg: "bg-emerald-500/5" },
    { label: "Failed (Recent)", value: stats?.failed ?? 0, icon: AlertCircle, color: "text-red-400", bg: "bg-red-500/5" },
  ];

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-2xl bg-purple-500/10 border border-purple-500/20">
            <Cpu className="w-6 h-6 text-purple-400" />
          </div>
          <div>
            <h1 className="text-xl font-black text-white">Jobs Monitor</h1>
            <p className="text-[11px] text-white/35">Real-time asynchronous background task execution log</p>
          </div>
        </div>
        <button
          onClick={refreshAll}
          className="p-2.5 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 transition-colors text-white/40 hover:text-white"
        >
          <RefreshCw className={`w-4 h-4 ${(statsLoading || execLoading) ? "animate-spin" : ""}`} />
        </button>
      </div>

      {/* KPI Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {kpis.map((kpi) => {
          const Icon = kpi.icon;
          return (
            <div key={kpi.label} className="relative rounded-2xl border border-white/5 bg-white/3 p-4 overflow-hidden">
              <div className="flex items-start justify-between">
                <p className="text-[9px] font-bold uppercase tracking-wider text-white/30">{kpi.label}</p>
                <div className={`p-1.5 rounded-lg ${kpi.color} ${kpi.bg}`}>
                  <Icon className="w-4 h-4" />
                </div>
              </div>
              <p className={`text-2xl font-black tabular-nums mt-2 ${kpi.color}`}>{kpi.value}</p>
            </div>
          );
        })}
      </div>

      {/* Controls & Filters */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex gap-1.5 bg-white/3 p-1 rounded-xl border border-white/5">
          {["", "queued", "running", "success", "failed", "retrying"].map((st) => (
            <button
              key={st}
              onClick={() => {
                setStatusFilter(st);
                setPage(1);
              }}
              className={`px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all ${
                statusFilter === st
                  ? "bg-purple-600 text-white shadow-lg shadow-purple-600/25"
                  : "text-white/40 hover:text-white/70"
              }`}
            >
              {st || "All Executions"}
            </button>
          ))}
        </div>
      </div>

      {/* Table Container */}
      <div className="rounded-2xl border border-white/5 bg-white/3 overflow-hidden">
        <div className="grid grid-cols-[1fr_2fr_1fr_1.5fr_1.5fr_1fr] gap-4 px-5 py-3 border-b border-white/5">
          {["Job Name", "Execution ID", "Status", "Duration", "Started", "Finished"].map((h) => (
            <div key={h} className="text-[9px] font-bold uppercase tracking-[0.18em] text-white/25">{h}</div>
          ))}
        </div>

        {execLoading ? (
          <div className="p-8 flex items-center gap-2 text-white/25 text-sm">
            <RefreshCw className="w-4 h-4 animate-spin" /> Loading execution log…
          </div>
        ) : executions.length === 0 ? (
          <div className="p-12 text-center text-white/20 text-sm">
            <ShieldAlert className="w-8 h-8 text-white/10 mx-auto mb-3" />
            No executions found matching filters.
          </div>
        ) : (
          <div className="divide-y divide-white/3">
            {executions.map((exe) => {
              const Style = STATUS_STYLES[exe.status] || STATUS_STYLES.queued;
              const StatusIcon = Style.icon;
              return (
                <div key={exe.id} className="grid grid-cols-[1fr_2fr_1fr_1.5fr_1.5fr_1fr] gap-4 px-5 py-4 hover:bg-white/3 transition-colors items-center">
                  <div className="min-w-0">
                    <p className="text-[13px] font-bold text-white/75 truncate">{exe.task_name || "Unknown Task"}</p>
                    <p className="text-[10px] text-white/25 truncate font-mono">Job: {exe.job_id.slice(0, 8)}…</p>
                  </div>
                  <p className="text-[11px] font-mono text-white/35 truncate">{exe.id}</p>
                  <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold border w-fit ${Style.bg} ${Style.text}`}>
                    <StatusIcon className="w-3 h-3" />
                    <span className="capitalize">{exe.status}</span>
                  </span>
                  <p className="text-[12px] font-mono text-white/50">
                    {exe.duration_seconds !== undefined && exe.duration_seconds !== null
                      ? `${exe.duration_seconds.toFixed(2)}s`
                      : "—"}
                  </p>
                  <p className="text-[11px] text-white/30 font-mono">
                    {exe.started_at ? formatDistanceToNow(new Date(exe.started_at), { addSuffix: true }) : "—"}
                  </p>
                  <p className="text-[11px] text-white/30 font-mono">
                    {exe.finished_at ? formatDistanceToNow(new Date(exe.finished_at), { addSuffix: true }) : "—"}
                  </p>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between px-1">
          <span className="text-[11px] text-white/25 font-mono">
            Page {page} of {totalPages} · {totalExecutions} executions
          </span>
          <div className="flex gap-2">
            <button
              onClick={() => setPage(Math.max(1, page - 1))}
              disabled={page === 1}
              className="px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-[11px] font-bold text-white/40 hover:text-white disabled:opacity-30 transition-all"
            >
              Previous
            </button>
            <button
              onClick={() => setPage(Math.min(totalPages, page + 1))}
              disabled={page === totalPages}
              className="px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-[11px] font-bold text-white/40 hover:text-white disabled:opacity-30 transition-all"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
