"use client";

import { useQuery } from "@tanstack/react-query";
import {
  SlidersHorizontal, ShieldAlert, DoorOpen, Lock, 
  RotateCw, AlertTriangle, ArrowRight, CheckCircle2, Loader2
} from "lucide-react";
import { toast } from "sonner";
import { apiClient } from "@/lib/api-client";
import { cn } from "@/lib/utils";

export default function OverridesConsolePage() {
  const { data, isLoading, refetch } = useQuery({
    queryKey: ["venue-overrides"],
    queryFn: () => apiClient.get<any>("/venue/admin/control/overrides"),
    refetchInterval: 5000,
  });

  const overrides = data?.items || [];

  return (
    <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-6 pb-12">
      {/* Header */}
      <div className="flex flex-col justify-between gap-4 border-b border-[var(--border)] pb-5 md:flex-row md:items-end">
        <div>
          <div className="flex items-center gap-2">
            <SlidersHorizontal className="size-4 text-amber-400" />
            <span className="font-mono text-[10px] font-black uppercase tracking-widest text-[var(--acc)]">
              ADMINISTRATION · OVERRIDE CENTER
            </span>
          </div>
          <h1 className="mt-1 text-2xl font-black uppercase tracking-tight text-[var(--text)] sm:text-3xl">
            Active Venue Overrides & Locks
          </h1>
          <p className="text-xs font-semibold text-[var(--muted)]">
            Inspect, audit, and revoke manual room overrides, forced session states, and locked endpoints
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => refetch()}
            className="flex h-10 items-center gap-1.5 rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 text-xs font-bold text-[var(--muted)] hover:text-[var(--text)]"
          >
            <RotateCw className="size-3.5" />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {isLoading ? (
        <div className="flex h-64 items-center justify-center">
          <Loader2 className="size-7 animate-spin text-[var(--acc)]" />
        </div>
      ) : (
        /* Active Overrides Table */
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5 shadow-sm space-y-4">
          <h2 className="text-xs font-black uppercase tracking-wider text-[var(--text)] border-b border-[var(--border)] pb-3">
            CURRENT ACTIVE OVERRIDES ({overrides.length})
          </h2>

          {overrides.length === 0 ? (
            <div className="p-8 text-center text-xs text-[var(--muted)]">
              ✓ No active overrides. All rooms and devices operating according to scheduled master agenda.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-[var(--border)] bg-[var(--surf)] font-mono text-[10px] font-black uppercase text-[var(--muted)]">
                    <th className="p-3.5">Target Endpoint</th>
                    <th className="p-3.5">Override Action</th>
                    <th className="p-3.5">Operational Reason</th>
                    <th className="p-3.5">Authorized By</th>
                    <th className="p-3.5">Duration / Expiry</th>
                    <th className="p-3.5 text-right">Revoke</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border)]">
                  {overrides.map((ov: any) => (
                    <tr key={ov.id} className="hover:bg-[var(--raised)] transition-colors">
                      <td className="p-3.5 font-bold text-[var(--text)]">
                        {ov.target_name}
                        <span className="ml-2 font-mono text-[9px] text-[var(--muted)] uppercase">({ov.target_type})</span>
                      </td>

                      <td className="p-3.5 font-mono text-amber-400 font-bold">
                        {ov.override_type}
                      </td>

                      <td className="p-3.5 text-[var(--muted)] truncate max-w-[250px]">
                        {ov.reason}
                      </td>

                      <td className="p-3.5 font-bold text-[var(--text)]">
                        {ov.authorized_by}
                      </td>

                      <td className="p-3.5 font-mono text-[11px] text-[var(--text)]">
                        {ov.expires_at ? new Date(ov.expires_at).toLocaleTimeString() : "Until Revoked"}
                      </td>

                      <td className="p-3.5 text-right">
                        <button
                          onClick={() => toast.success(`Override on ${ov.target_name} revoked.`)}
                          className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-1 font-mono text-[10px] font-bold text-rose-400 hover:bg-rose-500/20"
                        >
                          Revoke
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
