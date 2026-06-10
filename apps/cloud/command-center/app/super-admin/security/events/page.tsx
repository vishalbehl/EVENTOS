"use client";

import { useState } from "react";
import { useSecurityLogs } from "@/services/super-admin-service";
import { Shield, RefreshCw, AlertTriangle, Info, AlertOctagon } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

const SEVERITIES = ["ALL", "info", "warning", "critical"] as const;

const SEVERITY_CONFIG = {
  info: { color: "text-blue-400", bg: "bg-blue-500/10 border-blue-500/20", icon: <Info className="w-3 h-3" /> },
  warning: { color: "text-amber-400", bg: "bg-amber-500/10 border-amber-500/20", icon: <AlertTriangle className="w-3 h-3" /> },
  critical: { color: "text-red-400", bg: "bg-red-500/10 border-red-500/20", icon: <AlertOctagon className="w-3 h-3" /> },
};

export default function SecurityEventsPage() {
  const [severity, setSeverity] = useState<string>("ALL");
  const [page, setPage] = useState(0);

  const { data, isLoading, refetch } = useSecurityLogs({
    severity: severity === "ALL" ? undefined : severity,
    page: page + 1,
    page_size: 25,
  });

  const items = data?.items || [];
  const total = data?.total || 0;

  return (
    <div className="space-y-5 animate-in fade-in duration-500">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-2xl bg-red-500/10 border border-red-500/20">
            <Shield className="w-6 h-6 text-red-400" />
          </div>
          <div>
            <h1 className="text-xl font-black text-white">Security Events</h1>
            <p className="text-[11px] text-white/35">{total} events · auto-refreshing every 10s</p>
          </div>
        </div>
        <button onClick={() => refetch()} className="p-2.5 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 transition-colors text-white/40 hover:text-white">
          <RefreshCw className={`w-4 h-4 ${isLoading ? "animate-spin" : ""}`} />
        </button>
      </div>

      {/* Severity Filter */}
      <div className="flex gap-1.5">
        {SEVERITIES.map((s) => {
          const cfg = s !== "ALL" ? SEVERITY_CONFIG[s] : null;
          return (
            <button
              key={s}
              onClick={() => { setSeverity(s); setPage(0); }}
              className={`px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all duration-150 ${
                severity === s
                  ? (cfg ? `bg-red-500/10 text-red-400 border border-red-500/20` : "bg-white/10 text-white border border-white/20")
                  : "text-white/30 hover:text-white/60 hover:bg-white/5"
              }`}
            >
              {s}
            </button>
          );
        })}
      </div>

      {/* Events List */}
      <div className="space-y-2">
        {isLoading ? (
          <div className="p-8 flex items-center gap-2 text-white/25 text-sm"><RefreshCw className="w-4 h-4 animate-spin" /> Loading security events…</div>
        ) : items.length === 0 ? (
          <div className="rounded-2xl border border-white/5 bg-white/3 p-10 text-center text-white/20 text-sm">
            No security events found
          </div>
        ) : (
          items.map((evt: any) => {
            const cfg = SEVERITY_CONFIG[evt.severity as keyof typeof SEVERITY_CONFIG] || SEVERITY_CONFIG.info;
            return (
              <div key={evt.id} className={`rounded-xl border px-4 py-3 ${cfg.bg}`}>
                <div className="flex items-start gap-3">
                  <div className={`mt-0.5 ${cfg.color}`}>{cfg.icon}</div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-4">
                      <span className={`text-[12px] font-bold ${cfg.color}`}>
                        {evt.event_type}
                      </span>
                      <span className="text-[10px] text-white/25 font-mono flex-shrink-0">
                        {evt.created_at ? formatDistanceToNow(new Date(evt.created_at), { addSuffix: true }) : "—"}
                      </span>
                    </div>
                    {evt.log_metadata && Object.keys(evt.log_metadata).length > 0 && (
                      <pre className="text-[10px] text-white/30 font-mono mt-1 overflow-x-auto">
                        {JSON.stringify(evt.log_metadata, null, 2)}
                      </pre>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between px-1">
        <span className="text-[11px] text-white/25 font-mono">Page {page + 1} · {total} total</span>
        <div className="flex gap-2">
          <button onClick={() => setPage(Math.max(0, page - 1))} disabled={page === 0} className="px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-[11px] font-bold text-white/40 hover:text-white disabled:opacity-30 transition-all">Previous</button>
          <button onClick={() => setPage(page + 1)} disabled={items.length < 25} className="px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-[11px] font-bold text-white/40 hover:text-white disabled:opacity-30 transition-all">Next</button>
        </div>
      </div>
    </div>
  );
}
