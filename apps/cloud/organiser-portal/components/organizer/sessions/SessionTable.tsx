"use client";

import { Clock, MapPin, Users, AlertTriangle, CheckCircle2 } from "lucide-react";
import { cn, formatTimeRangeInTZ } from "@/lib/utils";
import { BuilderSession, useSessionBuilderStore } from "@/store/useSessionBuilderStore";
import { Badge } from "@/components/ui/badge";

interface SessionTableProps {
  sessions?: BuilderSession[];
  onSelectSession?: (id: string) => void;
}

export function SessionTable({ sessions = [], onSelectSession }: SessionTableProps) {
  const conflicts = useSessionBuilderStore((s) => s.conflicts);

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-[12px]">
        <thead>
          <tr className="border-b border-default text-[10px] font-black uppercase tracking-wider text-muted">
            <th className="pb-3 px-3">Code</th>
            <th className="pb-3 px-3">Session Name</th>
            <th className="pb-3 px-3">Type</th>
            <th className="pb-3 px-3">Room / Hall</th>
            <th className="pb-3 px-3">Schedule Time</th>
            <th className="pb-3 px-3">Speakers</th>
            <th className="pb-3 px-3">Status</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-default/50 font-medium">
          {sessions.length > 0 ? (
            sessions.map((s) => {
              const hasConflict = conflicts.some((c) => c.session_ids.includes(s.id));
              const timezone = s.event_timezone || "UTC";

              return (
                <tr
                  key={s.id}
                  onClick={() => onSelectSession?.(s.id)}
                  className="hover:bg-[color-mix(in_srgb,var(--text)_3%,transparent)] cursor-pointer transition-colors"
                >
                  <td className="py-3 px-3 font-mono font-bold text-[var(--pri)]">
                    {s.session_code}
                  </td>
                  <td className="py-3 px-3 font-bold text-[var(--text)]">
                    <div className="flex items-center gap-2">
                      <span>{s.name}</span>
                      {hasConflict && (
                        <Badge variant="destructive" className="text-[9px] font-bold px-1 py-0">
                          Conflict
                        </Badge>
                      )}
                    </div>
                  </td>
                  <td className="py-3 px-3">
                    <Badge variant="outline" className="text-[10px] uppercase font-bold">
                      {s.session_type}
                    </Badge>
                  </td>
                  <td className="py-3 px-3 text-muted">
                    {s.room_name || <span className="italic text-muted/60">Unassigned</span>}
                  </td>
                  <td className="py-3 px-3 font-mono font-semibold text-[var(--pri)]">
                    {formatTimeRangeInTZ(s.start_time, s.end_time, timezone)}
                  </td>
                  <td className="py-3 px-3 text-muted">
                    {s.speakers && s.speakers.length > 0
                      ? s.speakers.map((sp) => sp.full_name).join(", ")
                      : "No speakers"}
                  </td>
                  <td className="py-3 px-3">
                    {(s.readiness_pct || 0) >= 100 ? (
                      <span className="text-[var(--success)] font-bold flex items-center gap-1 text-[11px]">
                        <CheckCircle2 className="h-3 w-3" /> Ready
                      </span>
                    ) : (
                      <span className="text-[var(--warn)] font-bold text-[11px]">
                        {Math.round(s.readiness_pct || 0)}% ready
                      </span>
                    )}
                  </td>
                </tr>
              );
            })
          ) : (
            <tr>
              <td colSpan={7} className="py-10 text-center text-muted italic">
                No sessions found.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
