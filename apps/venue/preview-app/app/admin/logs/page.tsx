"use client";

import { useState, useEffect, useCallback } from "react";
import { Activity, Clock, RefreshCw, User, Monitor, CheckCircle2, Upload, Lock, RotateCcw } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { apiClient } from "@/lib/api-client";
import { cn } from "@/lib/utils";

interface LogRow {
  id: string;
  action: string;
  station_number?: number;
  speaker_name?: string;
  filename?: string;
  details?: Record<string, any>;
  occurred_at: string;
}

export default function AdminLogsPage() {
  const [logs, setLogs] = useState<LogRow[]>([]);

  const [loading, setLoading] = useState(false);

  const fetchLogs = useCallback(async () => {
    try {
      setLoading(true);
      const data = await apiClient.get<LogRow[]>("/api/v1/srr/activity-logs");
      setLogs(Array.isArray(data) ? data : []);
    } catch {
      setLogs([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  const getActionBadge = (action: string) => {
    switch (action) {
      case "approve":
        return <Badge variant="success">Finalized</Badge>;
      case "upload":
        return <Badge variant="info">Uploaded</Badge>;
      case "checkin":
        return <Badge variant="default">Assigned</Badge>;
      case "reset":
        return <Badge variant="secondary">Reset</Badge>;
      case "lock":
        return <Badge variant="destructive">Locked</Badge>;
      default:
        return <Badge variant="outline">{action}</Badge>;
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between border-b border-[var(--border)] pb-4">
        <div>
          <h1 className="text-2xl font-black text-[var(--text)] tracking-tight">
            SRR Audit & Activity Logs
          </h1>
          <p className="text-xs text-[var(--muted)] mt-0.5">
            Immutable timeline of speaker check-ins, workstation assignments, slide edits, and distribution events.
          </p>
        </div>

        <Button
          size="sm"
          variant="outline"
          onClick={fetchLogs}
          disabled={loading}
          className="gap-2 text-xs font-bold"
        >
          <RefreshCw className={cn("size-3.5", loading && "animate-spin")} />
          Refresh Stream
        </Button>
      </div>

      <Card className="border-[var(--border)] bg-[var(--card)] overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-[var(--surf)] text-[10px] font-black uppercase tracking-wider text-[var(--muted)] border-b border-[var(--border)]">
              <tr>
                <th className="px-5 py-3">Event Action</th>
                <th className="px-5 py-3">Workstation</th>
                <th className="px-5 py-3">Speaker</th>
                <th className="px-5 py-3">Presentation File</th>
                <th className="px-5 py-3 text-right">Timestamp</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border)]">
              {logs.map((l) => (
                <tr key={l.id} className="hover:bg-[var(--surf)]/50 transition-colors">
                  <td className="px-5 py-3.5">
                    {getActionBadge(l.action)}
                  </td>
                  <td className="px-5 py-3.5 text-xs font-bold text-[var(--text)]">
                    {l.station_number ? `Station #${l.station_number}` : "Venue Network"}
                  </td>
                  <td className="px-5 py-3.5 text-xs text-[var(--muted)]">
                    {l.speaker_name || "-"}
                  </td>
                  <td className="px-5 py-3.5 text-xs font-mono text-[var(--text)] max-w-xs truncate">
                    {l.filename || "-"}
                  </td>
                  <td className="px-5 py-3.5 text-right text-xs font-mono text-[var(--muted)]">
                    {new Date(l.occurred_at).toLocaleTimeString("en-IN", {
                      hour: "2-digit",
                      minute: "2-digit",
                      second: "2-digit",
                      hour12: true,
                    })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
