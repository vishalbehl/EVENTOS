"use client";

import { useState, useEffect, useCallback } from "react";
import { useAuthStore } from "@/store/use-auth-store";
import {
  Activity,
  CheckCircle2,
  XCircle,
  Clock,
  RefreshCw,
  ChevronRight,
  AlertTriangle,
  Layers,
  Play,
  RotateCcw,
  Terminal,
  X,
} from "lucide-react";

// ── Types ─────────────────────────────────────────────────────

interface JobStats {
  total_jobs: number;
  active_jobs: number;
  total_executions: number;
  queued: number;
  running: number;
  succeeded: number;
  failed: number;
  retrying: number;
}

interface JobExecution {
  id: string;
  job_id: string;
  status: "queued" | "running" | "success" | "failed" | "retrying";
  started_at: string | null;
  finished_at: string | null;
  duration_seconds: number | null;
  task_name: string | null;
}

interface JobFailure {
  id: string;
  execution_id: string;
  error_message: string;
  stack_trace: string | null;
  failed_at: string;
}

// ── Helpers ───────────────────────────────────────────────────

const STATUS_STYLES: Record<string, { bg: string; text: string; icon: React.ReactNode }> = {
  queued:   { bg: "bg-slate-500/10 border border-slate-500/30", text: "text-slate-400", icon: <Clock className="w-3 h-3" /> },
  running:  { bg: "bg-blue-500/10 border border-blue-500/30",  text: "text-blue-400",  icon: <Play className="w-3 h-3 animate-pulse" /> },
  success:  { bg: "bg-emerald-500/10 border border-emerald-500/30", text: "text-emerald-400", icon: <CheckCircle2 className="w-3 h-3" /> },
  failed:   { bg: "bg-red-500/10 border border-red-500/30",   text: "text-red-400",   icon: <XCircle className="w-3 h-3" /> },
  retrying: { bg: "bg-amber-500/10 border border-amber-500/30", text: "text-amber-400", icon: <RotateCcw className="w-3 h-3 animate-spin" /> },
};

function StatusBadge({ status }: { status: string }) {
  const s = STATUS_STYLES[status] ?? STATUS_STYLES.queued;
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${s.bg} ${s.text}`}>
      {s.icon}
      {status}
    </span>
  );
}

function formatDuration(seconds: number | null): string {
  if (seconds === null) return "—";
  if (seconds < 1) return `${Math.round(seconds * 1000)}ms`;
  if (seconds < 60) return `${seconds.toFixed(1)}s`;
  return `${Math.floor(seconds / 60)}m ${Math.round(seconds % 60)}s`;
}

function formatTime(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

// ── Stat Card ─────────────────────────────────────────────────

interface StatCardProps {
  label: string;
  value: number;
  color: string;
  icon: React.ReactNode;
  glow?: string;
}

function StatCard({ label, value, color, icon, glow }: StatCardProps) {
  return (
    <div className={`relative rounded-2xl border border-white/5 bg-white/3 backdrop-blur-sm p-5 overflow-hidden group hover:border-white/10 transition-all duration-300 ${glow ? `shadow-[0_0_24px_${glow}]` : ""}`}>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/40 mb-2">{label}</p>
          <p className={`text-4xl font-black tabular-nums ${color}`}>{value.toLocaleString()}</p>
        </div>
        <div className={`p-3 rounded-xl bg-white/5 ${color}`}>
          {icon}
        </div>
      </div>
    </div>
  );
}

// ── Failure Drawer ─────────────────────────────────────────────

function FailureDrawer({
  execution,
  onClose,
}: {
  execution: JobExecution | null;
  onClose: () => void;
}) {
  const [failures, setFailures] = useState<JobFailure[]>([]);
  const [loading, setLoading] = useState(false);
  const { accessToken } = useAuthStore();
  const API = process.env.NEXT_PUBLIC_API_URL;

  useEffect(() => {
    if (!execution) return;
    setLoading(true);
    fetch(`${API}/api/v1/jobs/executions/${execution.id}/failures`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
      .then((r) => r.json())
      .then((d) => setFailures(d.items ?? []))
      .catch(() => setFailures([]))
      .finally(() => setLoading(false));
  }, [execution, accessToken, API]);

  if (!execution) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />
      {/* Drawer */}
      <div className="fixed inset-y-0 right-0 z-50 w-full max-w-2xl flex flex-col bg-[#0e0e14] border-l border-white/10 shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-white/10">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-red-500/10 border border-red-500/20">
              <Terminal className="w-5 h-5 text-red-400" />
            </div>
            <div>
              <h3 className="text-sm font-black text-white">Failure Details</h3>
              <p className="text-[10px] text-white/40 font-mono truncate max-w-xs">{execution.task_name ?? execution.id}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-white/5 text-white/40 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {loading ? (
            <div className="flex items-center gap-2 text-white/40 text-sm">
              <RefreshCw className="w-4 h-4 animate-spin" /> Loading failure records…
            </div>
          ) : failures.length === 0 ? (
            <p className="text-white/40 text-sm">No failure records found for this execution.</p>
          ) : (
            failures.map((f) => (
              <div key={f.id} className="rounded-xl border border-red-500/20 bg-red-500/5 overflow-hidden">
                <div className="px-4 py-3 border-b border-red-500/10">
                  <p className="text-xs font-bold text-red-300">{f.error_message}</p>
                  <p className="text-[10px] text-white/30 mt-0.5">{new Date(f.failed_at).toLocaleString()}</p>
                </div>
                {f.stack_trace && (
                  <pre className="p-4 text-[10px] font-mono text-red-200/70 overflow-x-auto whitespace-pre-wrap leading-relaxed">
                    {f.stack_trace}
                  </pre>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </>
  );
}

// ── Main Component ────────────────────────────────────────────

export default function JobMonitorPage() {
  const { accessToken } = useAuthStore();
  const API = process.env.NEXT_PUBLIC_API_URL;

  const [stats, setStats] = useState<JobStats | null>(null);
  const [executions, setExecutions] = useState<JobExecution[]>([]);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [selectedExecution, setSelectedExecution] = useState<JobExecution | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());

  const fetchData = useCallback(async () => {
    if (!accessToken) return;
    try {
      const [statsRes, execRes] = await Promise.all([
        fetch(`${API}/api/v1/jobs/stats`, {
          headers: { Authorization: `Bearer ${accessToken}` },
        }),
        fetch(
          `${API}/api/v1/jobs/executions?page_size=30${statusFilter !== "all" ? `&status=${statusFilter}` : ""}`,
          { headers: { Authorization: `Bearer ${accessToken}` } }
        ),
      ]);
      if (statsRes.ok) setStats(await statsRes.json());
      if (execRes.ok) {
        const d = await execRes.json();
        setExecutions(d.items ?? []);
      }
    } catch (e) {
      console.error("Job monitor fetch failed:", e);
    } finally {
      setLoading(false);
      setLastRefresh(new Date());
    }
  }, [accessToken, API, statusFilter]);

  // Initial load + 5-second polling
  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 5000);
    return () => clearInterval(interval);
  }, [fetchData]);

  const STATUS_FILTERS = ["all", "running", "queued", "success", "failed", "retrying"];

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-2xl bg-blue-500/10 border border-blue-500/20">
            <Activity className="w-6 h-6 text-blue-400" />
          </div>
          <div>
            <h1 className="text-xl font-black text-white tracking-tight">Job Monitor</h1>
            <p className="text-[11px] text-white/40 font-medium">
              Background worker execution tracking · live refresh every 5s
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-[10px] text-white/30 font-mono">
            Updated {lastRefresh.toLocaleTimeString()}
          </span>
          <button
            onClick={fetchData}
            className="p-2.5 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 transition-colors text-white/60 hover:text-white"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Stats Grid */}
      {stats && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            label="Queued"
            value={stats.queued}
            color="text-slate-300"
            icon={<Clock className="w-5 h-5" />}
          />
          <StatCard
            label="Running"
            value={stats.running}
            color="text-blue-400"
            icon={<Play className="w-5 h-5" />}
            glow="rgba(59,130,246,0.08)"
          />
          <StatCard
            label="Succeeded"
            value={stats.succeeded}
            color="text-emerald-400"
            icon={<CheckCircle2 className="w-5 h-5" />}
            glow="rgba(16,185,129,0.08)"
          />
          <StatCard
            label="Failed"
            value={stats.failed}
            color="text-red-400"
            icon={<XCircle className="w-5 h-5" />}
            glow="rgba(239,68,68,0.08)"
          />
        </div>
      )}

      {/* Secondary stats */}
      {stats && (
        <div className="flex items-center gap-6 px-1">
          <span className="text-[11px] text-white/40">
            <span className="text-white/70 font-bold">{stats.total_jobs}</span> registered task types
          </span>
          <span className="text-[11px] text-white/40">
            <span className="text-white/70 font-bold">{stats.total_executions.toLocaleString()}</span> total executions
          </span>
          {stats.retrying > 0 && (
            <span className="inline-flex items-center gap-1.5 text-[11px] text-amber-400 font-bold">
              <RotateCcw className="w-3 h-3 animate-spin" />
              {stats.retrying} retrying
            </span>
          )}
        </div>
      )}

      {/* Executions Table */}
      <div className="rounded-2xl border border-white/5 bg-white/3 backdrop-blur-sm overflow-hidden">
        {/* Table header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/5">
          <div className="flex items-center gap-2">
            <Layers className="w-4 h-4 text-white/40" />
            <span className="text-sm font-black text-white/80">Execution History</span>
          </div>
          {/* Status filter pills */}
          <div className="flex items-center gap-1.5">
            {STATUS_FILTERS.map((s) => (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                className={`px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all duration-150 ${
                  statusFilter === s
                    ? "bg-white/10 text-white border border-white/20"
                    : "text-white/30 hover:text-white/60 hover:bg-white/5"
                }`}
              >
                {s}
              </button>
            ))}
          </div>
        </div>

        {/* Table */}
        {loading ? (
          <div className="flex items-center gap-2 p-8 text-white/30 text-sm">
            <RefreshCw className="w-4 h-4 animate-spin" /> Loading executions…
          </div>
        ) : executions.length === 0 ? (
          <div className="p-8 text-center text-white/30 text-sm">No executions found.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-white/5">
                  {["Task", "Status", "Started", "Duration", ""].map((h) => (
                    <th
                      key={h}
                      className="px-5 py-3 text-[9px] font-bold uppercase tracking-[0.18em] text-white/30"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {executions.map((ex) => (
                  <tr
                    key={ex.id}
                    className="border-b border-white/3 hover:bg-white/3 transition-colors group"
                  >
                    <td className="px-5 py-3.5">
                      <span className="text-xs font-mono text-white/70 group-hover:text-white transition-colors">
                        {ex.task_name ?? ex.job_id.slice(0, 8) + "…"}
                      </span>
                    </td>
                    <td className="px-5 py-3.5">
                      <StatusBadge status={ex.status} />
                    </td>
                    <td className="px-5 py-3.5 text-[11px] text-white/40 font-mono">
                      {formatTime(ex.started_at)}
                    </td>
                    <td className="px-5 py-3.5 text-[11px] text-white/40 font-mono">
                      {formatDuration(ex.duration_seconds)}
                    </td>
                    <td className="px-5 py-3.5">
                      {ex.status === "failed" && (
                        <button
                          onClick={() => setSelectedExecution(ex)}
                          className="inline-flex items-center gap-1 text-[10px] font-bold text-red-400 hover:text-red-300 transition-colors opacity-0 group-hover:opacity-100"
                        >
                          Inspect <ChevronRight className="w-3 h-3" />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Failure Drawer */}
      <FailureDrawer
        execution={selectedExecution}
        onClose={() => setSelectedExecution(null)}
      />
    </div>
  );
}
