"use client";

import { useImpersonationLogs } from "@/services/super-admin-service";
import { LogOut, RefreshCw } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

export default function ImpersonationLogsPage() {
  const { data, isLoading, refetch } = useImpersonationLogs({ limit: 50 });
  const items = data?.items || [];
  const total = data?.total || 0;

  return (
    <div className="space-y-5 animate-in fade-in duration-500">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-2xl bg-orange-500/10 border border-orange-500/20">
            <LogOut className="w-6 h-6 text-orange-400" />
          </div>
          <div>
            <h1 className="text-xl font-black text-white">Impersonation Logs</h1>
            <p className="text-[11px] text-white/35">{total} impersonation events recorded</p>
          </div>
        </div>
        <button onClick={() => refetch()} className="p-2.5 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 transition-colors text-white/40 hover:text-white">
          <RefreshCw className={`w-4 h-4 ${isLoading ? "animate-spin" : ""}`} />
        </button>
      </div>

      <div className="rounded-2xl border border-white/5 bg-white/3 overflow-hidden">
        <div className="grid grid-cols-[2fr_1.5fr_1fr_1fr] gap-4 px-5 py-3 border-b border-white/5">
          {["Organization", "Actor", "Event", "When"].map((h) => (
            <div key={h} className="text-[9px] font-bold uppercase tracking-[0.18em] text-white/25">{h}</div>
          ))}
        </div>

        {isLoading ? (
          <div className="p-8 flex items-center gap-2 text-white/25 text-sm"><RefreshCw className="w-4 h-4 animate-spin" /> Loading logs…</div>
        ) : items.length === 0 ? (
          <div className="p-10 text-center text-white/20 text-sm">
            No impersonation events found. Impersonation logs will appear here when admin users access organizations.
          </div>
        ) : (
          <div className="divide-y divide-white/3">
            {items.map((log) => (
              <div key={log.id} className="grid grid-cols-[2fr_1.5fr_1fr_1fr] gap-4 px-5 py-4 hover:bg-white/3 transition-colors items-center">
                <div>
                  <p className="text-[13px] font-bold text-white/70">{log.organization_name}</p>
                  <p className="text-[10px] text-white/25 font-mono">{log.organization_id?.slice(0, 8)}…</p>
                </div>
                <p className="text-[12px] font-mono text-white/40 truncate">{log.actor_id?.slice(0, 8) || "—"}…</p>
                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold border w-fit ${
                  log.action_type === "IMPERSONATION_STARTED"
                    ? "bg-orange-500/10 text-orange-400 border-orange-500/20"
                    : "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                }`}>
                  {log.action_type === "IMPERSONATION_STARTED" ? "Started" : "Ended"}
                </span>
                <p className="text-[11px] text-white/30 font-mono">
                  {formatDistanceToNow(new Date(log.timestamp), { addSuffix: true })}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
