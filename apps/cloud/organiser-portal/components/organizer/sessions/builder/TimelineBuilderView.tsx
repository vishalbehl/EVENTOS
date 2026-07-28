"use client";

import { useMemo, useState } from "react";
import { parseISO, format, differenceInMinutes, addMinutes, startOfDay } from "date-fns";
import { Clock, MapPin, Users, AlertTriangle } from "lucide-react";
import { cn, formatTimeInTZ } from "@/lib/utils";
import { useSessionBuilderStore, BuilderSession } from "@/store/useSessionBuilderStore";
import { Badge } from "@/components/ui/badge";

const HOUR_WIDTH = 120; // px per hour
const ROW_HEIGHT = 86; // px per room row
const LABEL_WIDTH = 200; // px for room name column

export function TimelineBuilderView() {
  const sessions = useSessionBuilderStore((s) => s.sessions);
  const rooms = useSessionBuilderStore((s) => s.rooms);
  const selectedDate = useSessionBuilderStore((s) => s.selectedDate);
  const conflicts = useSessionBuilderStore((s) => s.conflicts);
  const moveSession = useSessionBuilderStore((s) => s.moveSession);
  const setSelectedSessionId = useSessionBuilderStore((s) => s.setSelectedSessionId);
  const selectedSessionId = useSessionBuilderStore((s) => s.selectedSessionId);

  // Filter sessions for selected date
  const daySessions = useMemo(() => {
    return sessions.filter((s) => s.start_time.startsWith(selectedDate));
  }, [sessions, selectedDate]);

  // Determine time bounds (e.g. 08:00 to 20:00)
  const timeBounds = useMemo(() => {
    let startHour = 8;
    let endHour = 18;

    daySessions.forEach((s) => {
      const start = new Date(s.start_time).getHours();
      const end = new Date(s.end_time).getHours() + 1;
      if (start < startHour) startHour = Math.max(0, start - 1);
      if (end > endHour) endHour = Math.min(24, end + 1);
    });

    const hours = [];
    for (let h = startHour; h <= endHour; h++) {
      hours.push(h);
    }
    return { startHour, endHour, hours };
  }, [daySessions]);

  const totalWidth = timeBounds.hours.length * HOUR_WIDTH;

  return (
    <div className="flex flex-col border border-default rounded-3xl overflow-hidden bg-[color-mix(in_srgb,var(--text)_2%,transparent)] shadow-lg">
      {/* Scrollable Container */}
      <div className="overflow-x-auto overflow-y-hidden">
        <div style={{ width: LABEL_WIDTH + totalWidth }} className="relative">
          {/* Header Row: Hours */}
          <div className="flex border-b border-default bg-[color-mix(in_srgb,var(--text)_4%,transparent)] font-mono text-[11px] font-bold text-muted sticky top-0 z-20">
            <div
              style={{ width: LABEL_WIDTH }}
              className="px-4 py-3 border-r border-default flex items-center justify-between font-sans text-[12px] font-black text-[var(--text)] uppercase tracking-wider bg-background"
            >
              <span>Room / Hall</span>
              <span className="text-[10px] text-muted font-normal">{rooms.length} active</span>
            </div>

            <div className="flex">
              {timeBounds.hours.map((hour) => (
                <div
                  key={hour}
                  style={{ width: HOUR_WIDTH }}
                  className="px-2 py-3 border-r border-default/40 text-center flex flex-col justify-center"
                >
                  <span>{format(new Date(2026, 0, 1, hour), "HH:mm")}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Room Rows */}
          {rooms.map((room) => {
            const roomSessions = daySessions.filter((s) => s.room_id === room.id);

            return (
              <div
                key={room.id}
                style={{ height: ROW_HEIGHT }}
                className="flex border-b border-default/50 hover:bg-[color-mix(in_srgb,var(--text)_2%,transparent)] transition-colors relative group"
              >
                {/* Room Label */}
                <div
                  style={{ width: LABEL_WIDTH }}
                  className="px-4 py-3 border-r border-default flex flex-col justify-center bg-background z-10"
                >
                  <div className="font-bold text-[13px] text-[var(--text)] truncate">
                    {room.name}
                  </div>
                  <div className="text-[10px] text-muted flex items-center gap-2 mt-0.5">
                    <span>{room.room_type}</span>
                    {room.capacity && <span>• {room.capacity} seats</span>}
                  </div>
                </div>

                {/* Timeline Grid Cell Column */}
                <div className="relative flex-1 flex" style={{ width: totalWidth }}>
                  {/* Vertical Hour Grid Lines */}
                  {timeBounds.hours.map((hour) => (
                    <div
                      key={hour}
                      style={{ width: HOUR_WIDTH }}
                      className="border-r border-default/20 h-full pointer-events-none"
                    />
                  ))}

                  {/* Session Cards Positioned Absolutely */}
                  {roomSessions.map((session) => {
                    const startDt = new Date(session.start_time);
                    const endDt = new Date(session.end_time);

                    const startMinutes = (startDt.getHours() - timeBounds.startHour) * 60 + startDt.getMinutes();
                    const durationMinutes = Math.max(15, differenceInMinutes(endDt, startDt));

                    const leftPx = (startMinutes / 60) * HOUR_WIDTH;
                    const widthPx = Math.max(80, (durationMinutes / 60) * HOUR_WIDTH);

                    const isSelected = selectedSessionId === session.id;
                    const hasConflict = conflicts.some((c) => c.session_ids.includes(session.id));

                    return (
                      <div
                        key={session.id}
                        onClick={() => setSelectedSessionId(session.id)}
                        style={{
                          left: leftPx,
                          width: widthPx,
                          top: 10,
                          height: ROW_HEIGHT - 20,
                        }}
                        className={cn(
                          "absolute rounded-xl border p-2 flex flex-col justify-between transition-all duration-200 cursor-pointer shadow-md select-none overflow-hidden",
                          isSelected
                            ? "ring-2 ring-[var(--pri)] border-[var(--pri)] shadow-lg shadow-[var(--pri)]/30 z-30"
                            : "bg-[var(--pri)]/15 border-[var(--pri)]/40 hover:border-[var(--pri)] z-10",
                          hasConflict && "border-red-500 bg-red-500/20 ring-1 ring-red-500 z-20"
                        )}
                        title={`${session.name} (${format(startDt, "HH:mm")} - ${format(endDt, "HH:mm")})`}
                      >
                        <div className="flex items-center justify-between gap-1">
                          <span className="text-[9px] font-black uppercase text-[var(--pri)] truncate">
                            {session.session_code}
                          </span>
                          {hasConflict && <AlertTriangle className="h-3 w-3 text-red-400 flex-shrink-0" />}
                        </div>

                        <div className="font-bold text-[11px] text-[var(--text)] truncate leading-tight">
                          {session.name}
                        </div>

                        <div className="text-[9px] text-muted flex items-center justify-between font-mono">
                          <span>
                            {format(startDt, "HH:mm")} - {format(endDt, "HH:mm")}
                          </span>
                          <span className="font-sans text-[8px] font-black text-[var(--sec)]">
                            {durationMinutes}m
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
