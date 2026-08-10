"use client";

import { useState, useEffect } from "react";
import { FileText, Filter, RefreshCw, CheckCircle2, XCircle, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function AdminLogsPage() {
  const [logs, setLogs] = useState<any[]>([]);
  const [filterType, setFilterType] = useState<string>("all");

  const fetchLogs = async () => {
    try {
      const res = await fetch("/api/v1/venue/admin/logs");
      if (res.ok) {
        setLogs(await res.json());
      }
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    fetchLogs();
    const interval = setInterval(fetchLogs, 10000);
    return () => clearInterval(interval);
  }, []);

  const filteredLogs = logs.filter(l => filterType === "all" || l.type === filterType);

  return (
    <div className="space-y-6 w-full pb-10">
      <div className="flex justify-between items-center bg-[var(--card)] p-5 rounded-2xl border border-[var(--border)] shadow-sm">
        <div>
          <h2 className="text-lg font-black uppercase tracking-wider text-[var(--text)] flex items-center gap-2">
            <FileText className="w-5 h-5 text-[var(--pri)]" />
            System & Audit Logs
          </h2>
          <p className="text-xs text-[var(--muted)] mt-0.5">Real-time venue station activity logs and operational audit records.</p>
        </div>
        <div className="flex items-center gap-2">
          <select 
            value={filterType} 
            onChange={e => setFilterType(e.target.value)} 
            className="border border-[var(--border)] text-xs font-bold rounded-xl px-3 py-1.5 outline-none text-[var(--text)] bg-[var(--surf)]"
          >
            <option value="all">All Events</option>
            <option value="activity">Device Activity</option>
            <option value="sync">Cloud Sync</option>
          </select>
          <Button variant="outline" size="sm" onClick={fetchLogs} className="h-8 px-2.5">
            <RefreshCw className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>

      <div className="bg-[var(--card)] rounded-2xl border border-[var(--border)] shadow-sm overflow-hidden flex flex-col">
        <div className="p-2 flex-1 overflow-x-auto custom-scrollbar">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-[var(--surf)] border-b border-[var(--border)] text-[var(--muted)] font-black uppercase tracking-wider text-[10px]">
                <th className="py-3 px-4 w-10"></th>
                <th className="py-3 px-4">Timestamp</th>
                <th className="py-3 px-4">Component / Station</th>
                <th className="py-3 px-4">Action</th>
                <th className="py-3 px-4 text-right">Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border)] font-semibold text-[var(--text)]">
              {filteredLogs.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-[var(--muted)]">No log records found.</td>
                </tr>
              ) : (
                filteredLogs.map((log, i) => (
                  <tr key={i} className="hover:bg-[var(--raised)] transition-colors">
                    <td className="py-3 px-4">
                      {log.status === "failed" ? (
                        <XCircle className="w-4 h-4 text-red-500" />
                      ) : (
                        <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                      )}
                    </td>
                    <td className="py-3 px-4 font-mono text-[var(--muted)]">{new Date(log.timestamp).toLocaleTimeString()}</td>
                    <td className="py-3 px-4 font-bold text-[var(--text)]">{log.component || "Venue Edge"}</td>
                    <td className="py-3 px-4 uppercase text-[10px] text-[var(--pri)]">{log.action}</td>
                    <td className="py-3 px-4 text-right font-mono text-[var(--muted)]">{log.details || "—"}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
