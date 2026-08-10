"use client";

/**
 * TimelineView (Gantt) — X axis = hourly time, Y axis = rooms.
 * Each session block shows name + readiness% badge.
 * Hover tooltip with full session info.
 * Today's sessions highlighted with thicker border.
 * Hidden on mobile (show message instead).
 */

import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { parseISO, format, isSameDay, differenceInMinutes, addMinutes } from "date-fns";
import { cn, formatTimeInTZ, formatTimeRangeInTZ, getTimeComponentsInTZ, getISODateInTZ, formatLocalDate } from "@/lib/utils";
import { SessionSummary } from "@/hooks/useSessions";
import { ChevronLeft, ChevronRight, Monitor, Calendar as CalendarIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { DatePicker } from "./DatePicker";

const ROOM_COLORS = [
  "#6366f1", "#8b5cf6", "#06b6d4", "#10b981",
  "#f59e0b", "#ef4444", "#ec4899", "#14b8a6",
];

const HOUR_WIDTH = 100; // px per hour (wider for better clarity)
const ROW_HEIGHT = 80; // px per room row
const LABEL_WIDTH = 180; // px for room name column

interface TimelineViewProps {
  sessions: SessionSummary[];
  timezone: string;
  onSelectSession: (id: string) => void;
}

export function TimelineView({ sessions, timezone, onSelectSession }: TimelineViewProps) {
  const [selectedDateStr, setSelectedDateStr] = useState(() => {
    const today = formatLocalDate(new Date());
    const hasToday = sessions.some(s => s.start_time && getISODateInTZ(s.start_time, timezone) === today);
    if (hasToday) return today;
    
    // Default to first session date if available
    const firstSession = sessions
      .filter(s => s.start_time)
      .sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime())[0];
    
    return firstSession ? getISODateInTZ(firstSession.start_time, timezone) : today;
  });

  const selectedDay = useMemo(() => {
    return parseISO(selectedDateStr);
  }, [selectedDateStr]);

  // Sessions for the selected day in event timezone
  const daySessions = useMemo(
    () => sessions.filter(s => s.start_time && getISODateInTZ(s.start_time, timezone) === selectedDateStr),
    [sessions, selectedDateStr, timezone]
  );

  // Build unique rooms preserving order
  const rooms = useMemo(() => {
    const seen = new Map<string, { id: string; name: string }>();
    daySessions.forEach(s => {
      const key = s.room_id || "unassigned";
      if (!seen.has(key)) seen.set(key, { id: key, name: s.room_name || "Unassigned" });
    });
    // Add rooms that might not have sessions today but exist in the event? 
    // For now, just rooms with sessions today to keep it tight.
    return Array.from(seen.values());
  }, [daySessions]);

  // Hour range: start from first session or 8am, end at last session or 6pm
  const { startHour, totalHours } = useMemo(() => {
    if (!daySessions.length) return { startHour: 8, totalHours: 12 };
    const starts = daySessions.map(s => getTimeComponentsInTZ(s.start_time!, timezone).hour);
    const ends = daySessions.map(s => s.end_time ? getTimeComponentsInTZ(s.end_time, timezone).hour + 1 : 18);
    const minH = Math.max(0, Math.min(...starts) - 1);
    const maxH = Math.min(24, Math.max(...ends) + 1);
    return {
      startHour: minH,
      totalHours: maxH - minH,
    };
  }, [daySessions, timezone]);

  const totalWidth = totalHours * HOUR_WIDTH;
  const isCurrentDay = selectedDateStr === formatLocalDate(new Date());

  // Current time indicator
  const nowPos = useMemo(() => {
    if (!isCurrentDay) return null;
    const now = getTimeComponentsInTZ(new Date().toISOString(), timezone);
    const mins = (now.hour - startHour) * 60 + now.minute;
    return (mins / 60) * HOUR_WIDTH;
  }, [isCurrentDay, startHour, timezone]);

  const [tooltip, setTooltip] = useState<{ session: SessionSummary; x: number; y: number } | null>(null);

  const navDate = (days: number) => {
    const d = parseISO(selectedDateStr);
    const next = days > 0 ? addMinutes(d, 24 * 60) : addMinutes(d, -24 * 60);
    setSelectedDateStr(formatLocalDate(next));
  };

  return (
    <>
      {/* Mobile fallback */}
      <div className="md:hidden flex items-center justify-center py-20 glass-3d rounded-[2.5rem] border-default">
        <div className="text-center space-y-3">
          <Monitor className="h-10 w-10 text-muted mx-auto opacity-40" />
          <p className="text-[11px] font-black text-muted uppercase tracking-widest">Timeline is desktop only</p>
        </div>
      </div>

      <div className="hidden md:flex flex-col h-full">
        {/* Navigation & Date Picker */}
        <div className="flex items-center justify-between mb-6 flex-shrink-0">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 bg-[color-mix(in_srgb,var(--text)_5%,transparent)] p-1 rounded-2xl border border-default">
              <button onClick={() => navDate(-1)} className="h-8 w-8 flex items-center justify-center rounded-xl hover:bg-[var(--pri)]/10 text-muted hover:text-[var(--pri)] transition-all">
                <ChevronLeft className="h-4 w-4" />
              </button>

              <DatePicker
                value={selectedDay}
                onChange={(date) => setSelectedDateStr(formatLocalDate(date))}
              />

              <button onClick={() => navDate(1)} className="h-8 w-8 flex items-center justify-center rounded-xl hover:bg-[var(--pri)]/10 text-muted hover:text-[var(--pri)] transition-all">
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
            
            <button
              onClick={() => setSelectedDateStr(formatLocalDate(new Date()))}
              className={cn(
                "px-4 h-10 rounded-2xl border text-[10px] font-black uppercase tracking-[0.2em] transition-all",
                isCurrentDay ? "bg-[var(--pri)] text-[var(--text)] border-[var(--pri)]" : "glass-3d border-default text-muted hover:text-[var(--pri)]"
              )}
            >
              Today
            </button>
          </div>
          
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2">
              <div className="h-2 w-2 rounded-full bg-[var(--pri)] animate-pulse" />
              <span className="text-[10px] font-black text-muted uppercase tracking-widest">{timezone} Timezone</span>
            </div>
            <span className="text-[11px] font-black text-[var(--text)] uppercase tracking-widest bg-muted/10 px-3 py-1 rounded-full border border-default">
              {daySessions.length} Sessions
            </span>
          </div>
        </div>

        {/* Timeline Grid */}
        <div className="flex-1 glass-3d rounded-[2.5rem] border-default overflow-x-auto no-scrollbar relative min-h-[400px]">
          {daySessions.length === 0 ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center text-muted gap-4">
              <div className="h-16 w-16 rounded-full bg-muted/5 flex items-center justify-center border border-default">
                <CalendarIcon className="h-8 w-8 opacity-20" />
              </div>
              <p className="text-[12px] font-black uppercase tracking-widest opacity-40">No sessions scheduled</p>
            </div>
          ) : (
            <div style={{ minWidth: LABEL_WIDTH + totalWidth + 40 }}>
              {/* Sticky Header */}
              <div className="flex sticky top-0 z-30 glass-3d border-b border-default" style={{ paddingLeft: LABEL_WIDTH }}>
                {Array.from({ length: totalHours }, (_, i) => {
                  const h = startHour + i;
                  return (
                    <div key={h} style={{ width: HOUR_WIDTH }} className="flex-shrink-0 border-l border-default/30 py-3 px-4 text-[10px] font-black text-muted">
                      {h === 0 ? "12 AM" : h < 12 ? `${h} AM` : h === 12 ? "12 PM" : `${h - 12} PM`}
                    </div>
                  );
                })}
              </div>

              {/* Rows */}
              <div className="relative">
                {/* Now Line */}
                {nowPos !== null && nowPos >= 0 && nowPos <= totalWidth && (
                  <div className="absolute top-0 bottom-0 w-0.5 bg-[var(--dan)] z-20 pointer-events-none" style={{ left: LABEL_WIDTH + nowPos }}>
                    <div className="absolute top-0 left-1/2 -translate-x-1/2 h-3 w-3 rounded-full bg-[var(--dan)] shadow-[0_0_10px_var(--dan)]" />
                  </div>
                )}

                {rooms.map((room, ri) => {
                  const color = ROOM_COLORS[ri % ROOM_COLORS.length];
                  const roomSessions = daySessions.filter(s => (s.room_id || "unassigned") === room.id);

                  return (
                    <div key={room.id} className="flex border-b border-default/20 group/row" style={{ height: ROW_HEIGHT }}>
                      {/* Room Column */}
                      <div className="flex-shrink-0 sticky left-0 z-20 glass-3d border-r border-default flex items-center px-6" style={{ width: LABEL_WIDTH }}>
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: color }} />
                          <span className="text-[11px] font-black text-[var(--text)] truncate uppercase tracking-tight">{room.name}</span>
                        </div>
                      </div>

                      {/* Time Content */}
                      <div className="flex-1 relative" style={{ width: totalWidth }}>
                        {/* Hour Guides */}
                        {Array.from({ length: totalHours }, (_, i) => (
                          <div key={i} className="absolute top-0 bottom-0 border-l border-default/10" style={{ left: i * HOUR_WIDTH }} />
                        ))}

                        {/* Blocks */}
                        {roomSessions.map(s => {
                          const startComp = getTimeComponentsInTZ(s.start_time!, timezone);
                          const endComp = s.end_time ? getTimeComponentsInTZ(s.end_time, timezone) : null;
                          
                          const startMins = (startComp.hour - startHour) * 60 + startComp.minute;
                          const duration = endComp 
                            ? ((endComp.hour * 60 + endComp.minute) - (startComp.hour * 60 + startComp.minute))
                            : 60;
                          
                          const left = (startMins / 60) * HOUR_WIDTH;
                          const width = Math.max((duration / 60) * HOUR_WIDTH - 6, 60);
                          const readiness = s.readiness_pct ?? 0;

                          return (
                            <motion.button
                              key={s.id}
                              whileHover={{ scale: 1.02, zIndex: 40 }}
                              onClick={() => onSelectSession(s.id)}
                              onMouseEnter={(e) => {
                                const rect = e.currentTarget.getBoundingClientRect();
                                setTooltip({ session: s, x: rect.left, y: rect.top });
                              }}
                              onMouseLeave={() => setTooltip(null)}
                              style={{
                                position: "absolute",
                                left: left + 3,
                                width,
                                top: 10,
                                bottom: 10,
                                backgroundColor: `${color}15`,
                                borderColor: color,
                              }}
                              className={cn(
                                "rounded-2xl border text-left px-4 flex flex-col justify-center gap-1 overflow-hidden transition-shadow hover:shadow-lg",
                                isCurrentDay && "border-2 shadow-[0_4px_12px_rgba(0,0,0,0.1)]"
                              )}
                            >
                              <p className="text-[10px] font-black truncate leading-tight" style={{ color }}>{s.name}</p>
                              <div className="flex items-center gap-2">
                                <span className="text-[8px] font-black opacity-60 uppercase tracking-widest whitespace-nowrap" style={{ color }}>
                                  {formatTimeRangeInTZ(s.start_time!, s.end_time!, timezone)}
                                </span>
                                <div className="h-1 flex-1 bg-muted/20 rounded-full overflow-hidden">
                                  <div className="h-full rounded-full" style={{ width: `${readiness}%`, backgroundColor: color }} />
                                </div>
                              </div>
                            </motion.button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Tooltip */}
      {tooltip && (
        <div
          className="fixed z-[100] bg-[var(--card)] border border-[var(--border)] text-[var(--text)] rounded-2xl p-5 shadow-2xl pointer-events-none max-w-sm animate-in fade-in zoom-in duration-200"
          style={{ top: Math.max(20, tooltip.y - 140), left: tooltip.x }}
        >
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-4">
              <Badge className="bg-[var(--pri)]/10 text-[var(--pri)] border-0 text-[9px] font-black uppercase tracking-widest px-2 py-0.5">
                {tooltip.session.session_code}
              </Badge>
              <span className="text-[10px] font-black text-muted uppercase tracking-widest">
                {formatTimeRangeInTZ(tooltip.session.start_time!, tooltip.session.end_time!, timezone)}
              </span>
            </div>
            <p className="text-[14px] font-black text-[var(--text)] leading-tight">{tooltip.session.name}</p>
            <div className="flex items-center gap-4 pt-2 border-t border-default/50">
              <div>
                <p className="text-[8px] font-black text-muted uppercase tracking-widest">Readiness</p>
                <p className="text-[12px] font-black text-[var(--success)]">{Math.round(tooltip.session.readiness_pct ?? 0)}%</p>
              </div>
              <div>
                <p className="text-[8px] font-black text-muted uppercase tracking-widest">Speakers</p>
                <p className="text-[12px] font-black text-[var(--text)]">{tooltip.session.speaker_count ?? 0}</p>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
