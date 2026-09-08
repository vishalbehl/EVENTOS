"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Radio, HardDrive, ArrowRight, Zap, CheckCircle2, AlertTriangle,
  RotateCw, Filter, Layers, Clock, ShieldCheck
} from "lucide-react";
import { toast } from "sonner";
import { apiClient } from "@/lib/api-client";
import { cn } from "@/lib/utils";

export default function DistributionCenterPage() {
  const queryClient = useQueryClient();

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["distribution-center-data"],
    queryFn: () => apiClient.get<any>("/venue/admin/control/distribution"),
    refetchInterval: 5000,
  });

  const priorityMutation = useMutation({
    mutationFn: ({ fileId, priority }: { fileId: string; priority: string }) =>
      apiClient.post(`/venue/admin/control/distribution/${fileId}/priority`, {
        command: "prioritize",
        reason: `Operator updated transfer priority to ${priority}`,
        payload: { priority },
      }),
    onSuccess: (_, vars) => {
      toast.success(`Asset priority elevated to ${vars.priority.toUpperCase()}`);
      refetch();
    }
  });

  const stats = data?.stats || { active_transfers: 0, queued: 0, failed: 0, completed: 0 };
  const transfers = data?.transfers || [];

  return (
    <div className="mx-auto flex w-full max-w-[1720px] flex-col gap-6 pb-12">
      {/* Header */}
      <div className="flex flex-col justify-between gap-4 border-b border-[var(--border)] pb-5 md:flex-row md:items-end">
        <div>
          <div className="flex items-center gap-2">
            <Radio className="size-4 text-cyan-400 animate-pulse" />
            <span className="font-mono text-[10px] font-black uppercase tracking-widest text-[var(--acc)]">
              WORKSPACE 05 · ASSET BROKER & DISTRIBUTION
            </span>
          </div>
          <h1 className="mt-1 text-2xl font-black uppercase tracking-tight text-[var(--text)] sm:text-3xl">
            File Distribution Center
          </h1>
          <p className="text-xs font-semibold text-[var(--muted)]">
            High-throughput P2P asset distribution broker with stage-priority queue scheduling
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => refetch()}
            className="flex h-10 items-center gap-1.5 rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 text-xs font-bold text-[var(--muted)] hover:text-[var(--text)]"
          >
            <RotateCw className="size-3.5" />
            <span>Refresh Transfers</span>
          </button>
        </div>
      </div>

      {/* Top 4 Metrics */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="rounded-2xl border border-cyan-500/30 bg-cyan-950/15 p-4 shadow-sm">
          <span className="font-mono text-[10px] font-black uppercase text-cyan-400">ACTIVE TRANSFERS</span>
          <div className="mt-1 text-2xl font-black text-cyan-300">{stats.active_transfers} Pipelines</div>
        </div>

        <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4 shadow-sm">
          <span className="font-mono text-[10px] font-black uppercase text-[var(--muted)]">QUEUED JOBS</span>
          <div className="mt-1 text-2xl font-black text-[var(--text)]">{stats.queued} Files</div>
        </div>

        <div className="rounded-2xl border border-rose-500/30 bg-rose-950/15 p-4 shadow-sm">
          <span className="font-mono text-[10px] font-black uppercase text-rose-400">FAILED / RETRYING</span>
          <div className="mt-1 text-2xl font-black text-rose-300">{stats.failed} Alerts</div>
        </div>

        <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-4 shadow-sm">
          <span className="font-mono text-[10px] font-black uppercase text-emerald-400">COMPLETED TRANSFERS</span>
          <div className="mt-1 text-2xl font-black text-emerald-300">{stats.completed} Total</div>
        </div>
      </div>

      {/* Transfers Table with Priority Elevation Controls */}
      <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5 shadow-sm">
        <div className="flex items-center justify-between border-b border-[var(--border)] pb-4">
          <div>
            <h2 className="text-sm font-black uppercase tracking-wider text-[var(--text)]">
              ACTIVE ASSET TRANSFER QUEUE & TARGET PROGRESS
            </h2>
            <p className="text-xs text-[var(--muted)]">Inspect granular node transfer state, checksum confirmation, and elevate imminent speaker priority</p>
          </div>
        </div>

        <div className="mt-4 space-y-4">
          {transfers.map((item: any) => {
            const isUrgent = item.priority === "URGENT";

            return (
              <div
                key={item.id}
                className={cn(
                  "rounded-2xl border p-5 transition-all shadow-sm space-y-4",
                  isUrgent ? "border-amber-500/50 bg-amber-950/10" : "border-[var(--border)] bg-[var(--surf)]"
                )}
              >
                <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-center border-b border-[var(--border)] pb-3">
                  <div className="flex items-center gap-3">
                    <span className="rounded bg-[var(--card)] border border-[var(--border)] px-2.5 py-1 font-mono text-xs font-black text-[var(--acc)]">
                      {item.asset_code}
                    </span>
                    <div>
                      <div className="text-sm font-black text-[var(--text)]">{item.filename}</div>
                      <div className="text-xs text-[var(--muted)]">Source: {item.source_node} → Target: {item.target_node}</div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className={cn(
                      "rounded-lg px-2.5 py-1 font-mono text-[10px] font-black uppercase",
                      isUrgent
                        ? "bg-amber-500 text-black font-black"
                        : "bg-[var(--card)] text-[var(--muted)] border border-[var(--border)]"
                    )}>
                      PRIORITY: {item.priority}
                    </span>

                    {/* Priority Scheduler buttons */}
                    <button
                      onClick={() => priorityMutation.mutate({ fileId: item.file_id, priority: "urgent" })}
                      className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-2.5 py-1 text-[10px] font-bold text-amber-400 hover:bg-amber-500/20"
                    >
                      Set URGENT
                    </button>
                    <button
                      onClick={() => priorityMutation.mutate({ fileId: item.file_id, priority: "normal" })}
                      className="rounded-lg border border-[var(--border)] bg-[var(--card)] px-2.5 py-1 text-[10px] font-bold text-[var(--muted)] hover:text-[var(--text)]"
                    >
                      NORMAL
                    </button>
                  </div>
                </div>

                {/* Progress Bar & Destination Nodes Matrix */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-mono text-[10px] font-bold text-[var(--muted)]">Overall Distribution Progress</span>
                    <span className="font-mono font-bold text-emerald-400">{item.progress_pct}%</span>
                  </div>

                  <div className="h-2 w-full overflow-hidden rounded-full bg-[var(--card)] border border-[var(--border)]">
                    <div
                      className={cn(
                        "h-full transition-all duration-300",
                        item.progress_pct === 100 ? "bg-emerald-500" : "bg-cyan-500"
                      )}
                      style={{ width: `${item.progress_pct}%` }}
                    />
                  </div>

                  {/* Target Node Checks */}
                  <div className="mt-3 flex flex-wrap items-center gap-4 text-xs font-mono">
                    {(item.targets || []).map((target: any) => <div key={`${target.node}-${target.type}`} className={cn("flex items-center gap-1.5 font-bold", target.status === "verified" ? "text-emerald-400" : target.status === "failed" ? "text-rose-400" : "text-cyan-400")}>
                      {target.status === "verified" ? <CheckCircle2 className="size-3.5" /> : <AlertTriangle className="size-3.5" />}
                      <span>{target.node} ({target.status}, {target.progress_pct ?? 0}%)</span>
                    </div>)}
                    {!item.targets?.length && <span className="text-[var(--muted)]">No delivery targets configured</span>}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
