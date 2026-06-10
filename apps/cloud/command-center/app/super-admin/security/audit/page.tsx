"use client";

import { useState } from "react";
import { useSystemChanges, useWorkerLogs } from "@/services/super-admin-service";
import { FileText, RefreshCw } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

const TABS = ["System Changes", "Worker Logs"] as const;

export default function AuditLogsPage() {
  const [tab, setTab] = useState<typeof TABS[number]>("System Changes");
  const [page, setPage] = useState(0);

  const { data: sysData, isLoading: sysLoading, refetch: refetchSys } = useSystemChanges({ page: page + 1, page_size: 25 });
  const { data: workerData, isLoading: workerLoading, refetch: refetchWorker } = useWorkerLogs({ page: page + 1, page_size: 25 });

  const isLoading = tab === "System Changes" ? sysLoading : workerLoading;
  const items = tab === "System Changes" ? (sysData?.items || []) : (workerData?.items || []);
  const total = tab === "System Changes" ? (sysData?.total || 0) : (workerData?.total || 0);
  const refetch = tab === "System Changes" ? refetchSys : refetchWorker;

  return (
    <div className="space-y-5 animate-in fade-in duration-500">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-2xl bg-slate-500/10 border border-slate-500/20">
            <FileText className="w-6 h-6 text-slate-400" />
          </div>
          <div>
            <h1 className="text-xl font-black text-white">Audit Logs</h1>
            <p className="text-[11px] text-white/35">System changes and worker error logs</p>
          </div>
        </div>
        <button onClick={() => refetch()} className="p-2.5 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 transition-colors text-white/40 hover:text-white">
          <RefreshCw className={`w-4 h-4 ${isLoading ? "animate-spin" : ""}`} />
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-white/5">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => { setTab(t); setPage(0); }}
            className={`px-4 py-3 text-[12px] font-bold transition-all border-b-2 -mb-px ${
              tab === t ? "text-slate-300 border-slate-400" : "text-white/30 border-transparent hover:text-white/60"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {/* Log Table */}
      <div className="rounded-2xl border border-white/5 bg-white/3 overflow-hidden">
        {isLoading ? (
          <div className="p-8 flex items-center gap-2 text-white/25 text-sm"><RefreshCw className="w-4 h-4 animate-spin" /> Loading logs…</div>
        ) : items.length === 0 ? (
          <div className="p-10 text-center text-white/20 text-sm">No log entries found</div>
        ) : (
          <div className="divide-y divide-white/3">
            {items.map((log: any, idx: number) => (
              <div key={log.id || idx} className="flex items-start gap-4 px-5 py-4 hover:bg-white/3 transition-colors">
                <div className="w-2 h-2 rounded-full bg-slate-400/50 mt-2 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-4">
                    <span className="text-[12px] font-bold text-white/70">
                      {log.change_type || log.task_name || log.event_type || "LOG_ENTRY"}
                    </span>
                    <span className="text-[10px] text-white/25 font-mono flex-shrink-0">
                      {log.created_at ? formatDistanceToNow(new Date(log.created_at), { addSuffix: true }) : "—"}
                    </span>
                  </div>
                  {log.entity_type && (
                    <span className="text-[10px] text-white/30 font-mono">{log.entity_type}</span>
                  )}
                  {(log.changes || log.error_message || log.log_metadata) && (
                    <pre className="text-[10px] text-white/20 font-mono mt-1.5 max-h-20 overflow-auto">
                      {JSON.stringify(log.changes || log.error_message || log.log_metadata, null, 2)}
                    </pre>
                  )}
                </div>
              </div>
            ))}
          </div>
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
