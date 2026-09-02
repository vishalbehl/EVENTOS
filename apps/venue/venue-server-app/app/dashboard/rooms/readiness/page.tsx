"use client";

import { useQuery, useMutation } from "@tanstack/react-query";
import Link from "next/link";
import { 
  CheckCircle2, XCircle, AlertTriangle, ArrowRight, 
  RotateCw, DoorOpen, ShieldCheck, Play 
} from "lucide-react";
import { toast } from "sonner";
import { apiClient } from "@/lib/api-client";
import { cn } from "@/lib/utils";

export default function SessionReadinessPage() {
  const { data, isLoading, refetch } = useQuery({
    queryKey: ["rooms-readiness"],
    queryFn: () => apiClient.get<any>("/venue/admin/control/rooms/readiness"),
    refetchInterval: 8000,
  });

  const prepMutation = useMutation({
    mutationFn: (roomId: string) =>
      apiClient.post(`/venue/admin/control/rooms/${roomId}/command`, {
        command: "prepare_now",
        reason: "Operator initiated instant session pre-flight check",
      }),
    onSuccess: () => {
      toast.success("Room preparation dispatched");
      refetch();
    }
  });

  const items = data?.items || [];
  const readyCount = data?.ready_rooms || 0;
  const preparingCount = data?.preparing_rooms || 0;
  const warningCount = data?.warning_rooms || 0;

  return (
    <div className="mx-auto flex w-full max-w-[1720px] flex-col gap-6 pb-12">
      {/* Header */}
      <div className="flex flex-col justify-between gap-4 border-b border-[var(--border)] pb-5 md:flex-row md:items-end">
        <div>
          <div className="flex items-center gap-2">
            <ShieldCheck className="size-4 text-emerald-400" />
            <span className="font-mono text-[10px] font-black uppercase tracking-widest text-[var(--acc)]">
              PRE-SESSION OPERATIONAL AUDIT
            </span>
          </div>
          <h1 className="mt-1 text-2xl font-black uppercase tracking-tight text-[var(--text)] sm:text-3xl">
            Session Readiness Matrix
          </h1>
          <p className="text-xs font-semibold text-[var(--muted)]">
            8-point pre-flight checklist across all active halls prior to session commencement
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => refetch()}
            className="flex h-10 items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--card)] px-4 text-xs font-bold text-[var(--text)] hover:bg-[var(--raised)]"
          >
            <RotateCw className="size-3.5 text-[var(--pri)]" />
            <span>Rerun Check</span>
          </button>
        </div>
      </div>

      {/* Summary KPI Strip */}
      <div className="grid grid-cols-3 gap-4">
        <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-4">
          <span className="font-mono text-[10px] font-black uppercase text-emerald-400">READY FOR SESSION</span>
          <div className="mt-1 text-2xl font-black text-emerald-300">{readyCount} Halls</div>
        </div>
        <div className="rounded-2xl border border-blue-500/30 bg-blue-500/10 p-4">
          <span className="font-mono text-[10px] font-black uppercase text-blue-400">PREPARING / CACHING</span>
          <div className="mt-1 text-2xl font-black text-blue-300">{preparingCount} Halls</div>
        </div>
        <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4">
          <span className="font-mono text-[10px] font-black uppercase text-amber-400">ATTENTION NEEDED</span>
          <div className="mt-1 text-2xl font-black text-amber-300">{warningCount} Halls</div>
        </div>
      </div>

      {/* Readiness Table */}
      <div className="overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--card)] shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-[var(--border)] bg-[var(--surf)] font-mono text-[10px] font-black uppercase text-[var(--muted)]">
                <th className="p-4">Room & Session</th>
                <th className="p-4 text-center">Tech PC</th>
                <th className="p-4 text-center">Stage PC</th>
                <th className="p-4 text-center">PPT Downloaded</th>
                <th className="p-4 text-center">Checksum</th>
                <th className="p-4 text-center">Viewer Ready</th>
                <th className="p-4 text-center">Speaker</th>
                <th className="p-4 text-center">Moderator</th>
                <th className="p-4 text-center">Overall State</th>
                <th className="p-4 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border)]">
              {items.map((item: any) => {
                const isReady = item.overall_status === "READY";
                const isWarning = item.overall_status === "WARNING";
                const cl = item.checklist || {};

                return (
                  <tr key={item.room_id} className="hover:bg-[var(--raised)] transition-colors">
                    <td className="p-4 font-bold text-[var(--text)]">
                      <div className="flex items-center gap-2">
                        <DoorOpen className="size-4 text-[var(--pri)]" />
                        <span>{item.room_name}</span>
                      </div>
                      <div className="mt-1 text-[11px] text-[var(--muted)] truncate max-w-[200px]">
                        [{item.session_code}] {item.session_title}
                      </div>
                    </td>

                    <td className="p-4 text-center">
                      {cl.technical_connected ? (
                        <CheckCircle2 className="mx-auto size-4 text-emerald-400" />
                      ) : (
                        <XCircle className="mx-auto size-4 text-rose-400" />
                      )}
                    </td>

                    <td className="p-4 text-center">
                      {cl.stage_connected ? (
                        <CheckCircle2 className="mx-auto size-4 text-emerald-400" />
                      ) : (
                        <XCircle className="mx-auto size-4 text-rose-400" />
                      )}
                    </td>

                    <td className="p-4 text-center">
                      {cl.presentation_downloaded ? (
                        <CheckCircle2 className="mx-auto size-4 text-emerald-400" />
                      ) : (
                        <XCircle className="mx-auto size-4 text-amber-400" />
                      )}
                    </td>

                    <td className="p-4 text-center">
                      {cl.file_checksum_verified ? (
                        <CheckCircle2 className="mx-auto size-4 text-emerald-400" />
                      ) : (
                        <XCircle className="mx-auto size-4 text-amber-400" />
                      )}
                    </td>

                    <td className="p-4 text-center">
                      {cl.presentation_viewer_ready ? (
                        <span className="font-mono text-[10px] font-bold text-emerald-400">✓ Loaded</span>
                      ) : (
                        <span className="font-mono text-[10px] font-bold text-rose-400">✗ Not Loaded</span>
                      )}
                    </td>

                    <td className="p-4 text-center">
                      {cl.speaker_confirmed ? (
                        <span className="font-mono text-[10px] font-bold text-emerald-400">Confirmed</span>
                      ) : (
                        <span className="font-mono text-[10px] font-bold text-amber-400">Pending</span>
                      )}
                    </td>

                    <td className="p-4 text-center">
                      {cl.moderator_connected ? (
                        <CheckCircle2 className="mx-auto size-4 text-emerald-400" />
                      ) : (
                        <XCircle className="mx-auto size-4 text-zinc-500" />
                      )}
                    </td>

                    <td className="p-4 text-center">
                      <span className={cn(
                        "rounded-lg px-2.5 py-1 font-mono text-[10px] font-black uppercase",
                        isReady
                          ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30"
                          : isWarning
                          ? "bg-rose-500/15 text-rose-400 border border-rose-500/30"
                          : "bg-blue-500/15 text-blue-400 border border-blue-500/30"
                      )}>
                        ● {item.overall_status}
                      </span>
                    </td>

                    <td className="p-4 text-right">
                      {!isReady ? (
                        <button
                          onClick={() => prepMutation.mutate(item.room_id)}
                          className="btn-pri rounded-lg px-3 py-1.5 text-[11px] font-bold shadow-sm"
                        >
                          Prepare Now
                        </button>
                      ) : (
                        <Link
                          href={`/dashboard/rooms/${item.room_id}`}
                          className="inline-flex items-center gap-1 rounded-lg border border-[var(--border)] bg-[var(--surf)] px-3 py-1.5 text-[11px] font-bold text-[var(--text)] hover:border-[var(--pri)]"
                        >
                          <span>Open</span>
                          <ArrowRight className="size-3" />
                        </Link>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
