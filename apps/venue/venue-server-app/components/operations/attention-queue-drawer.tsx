"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { 
  AlertTriangle, ShieldAlert, CheckCircle2, UserCheck, X, 
  ExternalLink, BellRing, ArrowRight, Loader2
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { apiClient } from "@/lib/api-client";
import { cn } from "@/lib/utils";

type AlertItem = {
  id: string;
  severity: "critical" | "warning" | "info";
  status: "active" | "acknowledged" | "resolved" | "snoozed";
  source_type: string;
  source_id?: string;
  title: string;
  evidence: string;
  suggested_action?: string;
  first_seen_at: string;
  last_seen_at: string;
};

export function AttentionQueueDrawer({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const queryClient = useQueryClient();

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["attention-alerts"],
    queryFn: () => apiClient.get<{ items: AlertItem[] }>("/venue/admin/control/alerts?state=active"),
    refetchInterval: 8000,
  });

  const actMutation = useMutation({
    mutationFn: ({ alertId, action, reason }: { alertId: string; action: string; reason: string }) =>
      apiClient.post(`/venue/admin/control/alerts/${alertId}/action`, { action, reason }),
    onSuccess: (_, vars) => {
      toast.success(`Alert marked as ${vars.action}`);
      queryClient.invalidateQueries({ queryKey: ["attention-alerts"] });
      queryClient.invalidateQueries({ queryKey: ["venue-control-overview"] });
    },
    onError: (err: any) => {
      toast.error(`Action failed: ${err.message || "Unknown error"}`);
    }
  });

  const alerts = data?.items || [];
  const criticalCount = alerts.filter((a) => a.severity === "critical").length;
  const warningCount = alerts.filter((a) => a.severity === "warning").length;

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/60 backdrop-blur-sm animate-in fade-in duration-150">
      <div className="flex h-full w-full max-w-lg flex-col border-l border-[var(--border)] bg-[var(--surf)] shadow-2xl animate-in slide-in-from-right duration-200">
        {/* Drawer Header */}
        <div className="flex items-center justify-between border-b border-[var(--border)] px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex size-9 items-center justify-center rounded-xl bg-rose-500/10 text-rose-500 border border-rose-500/20">
              <BellRing className="size-5" />
            </div>
            <div>
              <h3 className="text-sm font-black uppercase tracking-wider text-[var(--text)]">
                Attention Required Queue
              </h3>
              <p className="text-[11px] font-medium text-[var(--muted)]">
                {alerts.length} active anomalies requiring operator triage
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-[var(--muted)] hover:bg-[var(--raised)] hover:text-[var(--text)]"
          >
            <X className="size-5" />
          </button>
        </div>

        {/* Severity Banner */}
        <div className="grid grid-cols-2 gap-3 border-b border-[var(--border)] bg-[var(--card)] p-4 text-xs">
          <div className="flex items-center gap-2 rounded-lg border border-rose-500/30 bg-rose-500/10 p-2.5">
            <ShieldAlert className="size-4 text-rose-500" />
            <div>
              <div className="font-black text-rose-500">{criticalCount} Critical</div>
              <div className="text-[10px] text-[var(--muted)]">Immediate dispatch</div>
            </div>
          </div>
          <div className="flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-2.5">
            <AlertTriangle className="size-4 text-amber-500" />
            <div>
              <div className="font-black text-amber-500">{warningCount} Warnings</div>
              <div className="text-[10px] text-[var(--muted)]">Monitor closely</div>
            </div>
          </div>
        </div>

        {/* Alerts List */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {isLoading && (
            <div className="flex h-32 items-center justify-center">
              <Loader2 className="size-6 animate-spin text-[var(--pri)]" />
            </div>
          )}

          {!isLoading && alerts.length === 0 && (
            <div className="flex flex-col items-center justify-center p-12 text-center">
              <div className="flex size-12 items-center justify-center rounded-2xl bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">
                <CheckCircle2 className="size-6" />
              </div>
              <p className="mt-3 text-sm font-bold text-[var(--text)]">Attention Queue Clear</p>
              <p className="mt-1 text-xs text-[var(--muted)]">No active alerts are recorded. This does not by itself confirm every node or pipeline is healthy.</p>
            </div>
          )}

          {alerts.map((alt) => {
            const isCrit = alt.severity === "critical";
            return (
              <div
                key={alt.id}
                className={cn(
                  "rounded-xl border p-4 transition-all shadow-sm",
                  isCrit
                    ? "border-rose-500/40 bg-rose-950/15"
                    : "border-amber-500/30 bg-amber-950/10"
                )}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <span
                      className={cn(
                        "size-2.5 rounded-full animate-pulse",
                        isCrit ? "bg-rose-500" : "bg-amber-500"
                      )}
                    />
                    <h4 className="text-xs font-black uppercase tracking-wide text-[var(--text)]">
                      {alt.title}
                    </h4>
                  </div>
                  <span className="rounded bg-[var(--card)] px-2 py-0.5 font-mono text-[9px] font-bold text-[var(--muted)] border border-[var(--border)]">
                    {alt.source_type}
                  </span>
                </div>

                <p className="mt-2 text-xs font-medium leading-relaxed text-[var(--muted)]">
                  {alt.evidence}
                </p>

                {alt.suggested_action && (
                  <div className="mt-2 rounded-lg bg-[var(--card)] border border-[var(--border)] p-2 text-[11px] text-[var(--text)]">
                    <strong className="text-[var(--acc)]">Suggested:</strong> {alt.suggested_action}
                  </div>
                )}

                {/* Actions */}
                <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-[var(--border)] pt-3">
                  <button
                    disabled={actMutation.isPending}
                    onClick={() => actMutation.mutate({ alertId: alt.id, action: "acknowledge", reason: "Acknowledged by operator" })}
                    className="flex items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--card)] px-2.5 py-1 text-[10px] font-bold text-[var(--text)] hover:bg-[var(--raised)]"
                  >
                    <UserCheck className="size-3.5 text-blue-400" />
                    <span>Acknowledge</span>
                  </button>

                  <button
                    disabled={actMutation.isPending}
                    onClick={() => actMutation.mutate({ alertId: alt.id, action: "resolve", reason: "Issue resolved on venue node" })}
                    className="flex items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--card)] px-2.5 py-1 text-[10px] font-bold text-[var(--text)] hover:bg-emerald-500/10 hover:border-emerald-500/40 hover:text-emerald-400"
                  >
                    <CheckCircle2 className="size-3.5 text-emerald-400" />
                    <span>Resolve</span>
                  </button>

                  <button
                    onClick={() => {
                      if (alt.source_type === "room" || alt.title.toLowerCase().includes("hall")) {
                        router.push("/dashboard/live");
                      } else if (alt.source_type === "srr") {
                        router.push("/dashboard/srr");
                      } else if (alt.source_type === "device") {
                        router.push("/dashboard/devices");
                      } else {
                        router.push("/dashboard/alerts");
                      }
                      onClose();
                    }}
                    className="ml-auto flex items-center gap-1 text-[10px] font-bold text-[var(--pri)] hover:underline"
                  >
                    <span>Open Workspace</span>
                    <ArrowRight className="size-3" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className="border-t border-[var(--border)] bg-[var(--card)] p-4">
          <Link
            href="/dashboard/alerts"
            onClick={onClose}
            className="btn-pri flex w-full items-center justify-center gap-2 rounded-xl py-2.5 text-xs font-bold shadow"
          >
            <span>Open All Incident & Alert Records</span>
            <ExternalLink className="size-3.5" />
          </Link>
        </div>
      </div>
    </div>
  );
}
