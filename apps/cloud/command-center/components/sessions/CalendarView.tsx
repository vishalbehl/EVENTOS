"use client";

/**
 * CalendarView — custom monthly/weekly/day calendar built with date-fns.
 * No external calendar library needed — pure CSS + date-fns.
 */

import { useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  format, startOfMonth, endOfMonth, startOfWeek, endOfWeek,
  eachDayOfInterval, isSameMonth, addMonths, subMonths,
  addWeeks, subWeeks, addDays, subDays, parseISO, isToday,
  startOfDay, getHours, getMinutes, differenceInMinutes,
} from "date-fns";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn, formatTimeInTZ, formatTimeRangeInTZ, getTimeComponentsInTZ, getISODateInTZ, formatLocalDate } from "@/lib/utils";
import { SessionSummary } from "@/hooks/useSessions";
import { DatePicker } from "./DatePicker";

type CalendarMode = "month" | "week" | "day";

// Each room gets a stable colour from this palette
const ROOM_COLORS = [
  { bg: "bg-[#6366f1]/20", border: "border-[#6366f1]/50", text: "text-[#6366f1]", solid: "#6366f1" },
  { bg: "bg-[#8b5cf6]/20", border: "border-[#8b5cf6]/50", text: "text-[#8b5cf6]", solid: "#8b5cf6" },
  { bg: "bg-[#06b6d4]/20", border: "border-[#06b6d4]/50", text: "text-[#06b6d4]", solid: "#06b6d4" },
  { bg: "bg-[#10b981]/20", border: "border-[#10b981]/50", text: "text-[#10b981]", solid: "#10b981" },
  { bg: "bg-[#f59e0b]/20", border: "border-[#f59e0b]/50", text: "text-[#f59e0b]", solid: "#f59e0b" },
  { bg: "bg-[#ef4444]/20", border: "border-[#ef4444]/50", text: "text-[#ef4444]", solid: "#ef4444" },
  { bg: "bg-[#ec4899]/20", border: "border-[#ec4899]/50", text: "text-[#ec4899]", solid: "#ec4899" },
];

interface CalendarViewProps {
  sessions: SessionSummary[];
  timezone: string;
  onSelectSession: (id: string) => void;
}

export function CalendarView({ sessions, timezone, onSelectSession }: CalendarViewProps) {
  const [mode, setMode] = useState<CalendarMode>("month");
  const [cursor, setCursor] = useState(new Date());

  // Build room → colour index map
  const roomColors = useMemo(() => {
    const map = new Map<string, number>();
    sessions.forEach(s => {
      const key = s.room_id || s.room_name || "unassigned";
      if (!map.has(key)) map.set(key, map.size % ROOM_COLORS.length);
    });
    return map;
  }, [sessions]);

  const colorOf = (s: SessionSummary) => {
    const key = s.room_id || s.room_name || "unassigned";
    return ROOM_COLORS[roomColors.get(key) ?? 0];
  };

  const nav = (dir: 1 | -1) => {
    if (mode === "month") setCursor(dir > 0 ? addMonths(cursor, 1) : subMonths(cursor, 1));
    else if (mode === "week") setCursor(dir > 0 ? addWeeks(cursor, 1) : subWeeks(cursor, 1));
    else setCursor(dir > 0 ? addDays(cursor, 1) : subDays(cursor, 1));
  };

  const headerLabel = useMemo(() => {
    if (mode === "month") return format(cursor, "MMMM yyyy");
    if (mode === "week") {
      const s = startOfWeek(cursor, { weekStartsOn: 1 });
      const e = endOfWeek(cursor, { weekStartsOn: 1 });
      return `${format(s, "d MMM")} – ${format(e, "d MMM yyyy")}`;
    }
    return format(cursor, "EEEE, d MMMM yyyy");
  }, [cursor, mode]);

  // Days shown in month grid
  const monthDays = useMemo(() => {
    const start = startOfWeek(startOfMonth(cursor), { weekStartsOn: 1 });
    const end = endOfWeek(endOfMonth(cursor), { weekStartsOn: 1 });
    return eachDayOfInterval({ start, end });
  }, [cursor]);

  // Days shown in week grid
  const weekDays = useMemo(() => {
    const start = startOfWeek(cursor, { weekStartsOn: 1 });
    const end = endOfWeek(cursor, { weekStartsOn: 1 });
    return eachDayOfInterval({ start, end });
  }, [cursor]);

  const sessionsForDay = (day: Date) => {
    const dayStr = formatLocalDate(day);
    return sessions.filter(s => s.start_time && getISODateInTZ(s.start_time, timezone) === dayStr);
  };

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center justify-between mb-4 flex-shrink-0">
        <div className="flex items-center gap-3">
          <button
            onClick={() => nav(-1)}
            className="h-9 w-9 rounded-xl glass-3d border-default flex items-center justify-center text-muted hover:text-[var(--pri)] transition-all"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            onClick={() => setCursor(new Date())}
            className="px-4 h-9 rounded-xl glass-3d border-default text-[11px] font-black uppercase tracking-widest text-muted hover:text-[var(--pri)] transition-all"
          >
            Today
          </button>
          <button
            onClick={() => nav(1)}
            className="h-9 w-9 rounded-xl glass-3d border-default flex items-center justify-center text-muted hover:text-[var(--pri)] transition-all"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
          
          <DatePicker 
            value={cursor} 
            onChange={setCursor} 
            className="ml-2"
          />
        </div>

        <div className="flex bg-[color-mix(in_srgb,var(--text)_5%,transparent)] rounded-xl p-1 border border-default">
          {(["month", "week", "day"] as CalendarMode[]).map(m => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={cn(
                "px-4 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all",
                mode === m ? "bg-[var(--pri)] text-[var(--text)] shadow" : "text-muted hover:text-[var(--text)]"
              )}
            >
              {m}
            </button>
          ))}
        </div>
      </div>

      {/* Calendar Grid */}
      <AnimatePresence mode="wait">
        <motion.div
          key={`${mode}-${cursor.toISOString()}`}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.2 }}
          className="flex-1"
        >
          {mode === "month" && (
            <div className="h-full">
              {/* Day headers */}
              <div className="grid grid-cols-7 mb-1">
                {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map(d => (
                  <div key={d} className="text-center text-[10px] font-black text-muted uppercase tracking-widest py-2">{d}</div>
                ))}
              </div>
              {/* Cells */}
              <div className="grid grid-cols-7 gap-1 auto-rows-[minmax(120px,auto)]">
                {monthDays.map(day => {
                  const daySessions = sessionsForDay(day);
                  const today = isToday(day);
                  const inMonth = isSameMonth(day, cursor);
                  return (
                    <div
                      key={day.toISOString()}
                      className={cn(
                        "rounded-2xl p-2 flex flex-col gap-1 border transition-all",
                        inMonth ? "glass-3d border-default" : "border-transparent opacity-30",
                        today && "border-[var(--pri)]/50 shadow-[0_0_0_2px_var(--pri)]"
                      )}
                    >
                      <div className={cn(
                        "text-[11px] font-black w-7 h-7 rounded-full flex items-center justify-center",
                        today ? "bg-[var(--pri)] text-[var(--text)]" : "text-muted"
                      )}>
                        {format(day, "d")}
                      </div>
                      <div className="flex flex-col gap-0.5">
                        {daySessions.map(s => {
                          const c = colorOf(s);
                          return (
                            <button
                              key={s.id}
                              onClick={() => onSelectSession(s.id)}
                              className={cn(
                                "text-left px-2 py-0.5 rounded-lg text-[9px] font-black truncate border transition-all hover:scale-[1.02]",
                                c.bg, c.border, c.text
                              )}
                            >
                              <span className="opacity-60 mr-1">
                                {formatTimeRangeInTZ(s.start_time, s.end_time, timezone)}
                              </span>
                              {s.name}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {mode === "week" && (
            <div className="flex flex-col">
              {/* Header row */}
              <div className="grid gap-px" style={{ gridTemplateColumns: "60px repeat(7,1fr)" }}>
                <div />
                {weekDays.map(day => (
                  <div key={day.toISOString()} className={cn(
                    "text-center py-3 rounded-xl text-[11px] font-black uppercase tracking-widest",
                    isToday(day) ? "bg-[var(--pri)]/10 text-[var(--pri)]" : "text-muted"
                  )}>
                    <div>{format(day, "EEE")}</div>
                    <div className={cn(
                      "text-lg font-black mt-0.5",
                      isToday(day) ? "text-[var(--pri)]" : "text-[var(--text)]"
                    )}>{format(day, "d")}</div>
                  </div>
                ))}
              </div>
              {/* Time rows */}
              <div className="grid gap-px" style={{ gridTemplateColumns: "60px repeat(7,1fr)" }}>
                {Array.from({ length: 24 }, (_, h) => (
                  <>
                    <div key={`hour-${h}`} className="pr-2 text-right text-[10px] font-black text-muted py-3">
                      {h === 0 ? "12 AM" : h < 12 ? `${h} AM` : h === 12 ? "12 PM" : `${h - 12} PM`}
                    </div>
                    {weekDays.map(day => {
                      const daySessions = sessionsForDay(day).filter(s => {
                        if (!s.start_time) return false;
                        return getTimeComponentsInTZ(s.start_time, timezone).hour === h;
                      });
                      return (
                        <div key={`${day}-${h}`} className="border-t border-[color-mix(in_srgb,var(--text)_5%,transparent)] min-h-[64px] relative">
                          {daySessions.map(s => {
                            const c = colorOf(s);
                            const comp = getTimeComponentsInTZ(s.start_time, timezone);
                            const top = (comp.minute / 60) * 100;
                            return (
                              <button
                                key={s.id}
                                onClick={() => onSelectSession(s.id)}
                                style={{ top: `${top}%` }}
                                className={cn(
                                  "absolute left-0.5 right-0.5 rounded-lg p-1 text-left text-[9px] font-black border truncate z-10 transition-transform hover:scale-[1.02]",
                                  c.bg, c.border, c.text
                                )}
                              >
                                {s.name}
                              </button>
                            );
                          })}
                        </div>
                      );
                    })}
                  </>
                ))}
              </div>
            </div>
          )}

          {mode === "day" && (
            <div className="space-y-0">
              {Array.from({ length: 24 }, (_, h) => {
                const daySessions = sessionsForDay(cursor).filter(s => {
                  if (!s.start_time) return false;
                  return getTimeComponentsInTZ(s.start_time, timezone).hour === h;
                });
                return (
                  <div key={h} className="flex gap-4 border-t border-[color-mix(in_srgb,var(--text)_5%,transparent)] min-h-[56px]">
                    <div className="w-16 shrink-0 text-right pr-4 text-[11px] font-black text-muted pt-2">
                      {h === 0 ? "12 AM" : h < 12 ? `${h} AM` : h === 12 ? "12 PM" : `${h - 12} PM`}
                    </div>
                    <div className="flex-1 py-1 space-y-1">
                      {daySessions.map(s => {
                        const c = colorOf(s);
                        return (
                          <button
                            key={s.id}
                            onClick={() => onSelectSession(s.id)}
                            className={cn(
                              "w-full text-left px-4 py-2.5 rounded-2xl border transition-all hover:scale-[1.01] flex items-center gap-3",
                              c.bg, c.border
                            )}
                          >
                            <div className="h-2 w-2 rounded-full" style={{ backgroundColor: c.solid }} />
                            <div>
                              <p className={cn("text-[12px] font-black", c.text)}>{s.name}</p>
                              <p className="text-[10px] font-bold text-muted">
                                {formatTimeRangeInTZ(s.start_time, s.end_time, timezone)} — {s.room_name || "No room"}
                              </p>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </motion.div>
      </AnimatePresence>

      {/* Room legend */}
      {roomColors.size > 0 && (
        <div className="flex-shrink-0 flex flex-wrap gap-3 mt-4 pt-4 border-t border-default">
          {Array.from(roomColors.entries()).map(([key, idx]) => {
            const c = ROOM_COLORS[idx];
            const room = sessions.find(s => (s.room_id || s.room_name || "unassigned") === key);
            return (
              <div key={key} className="flex items-center gap-2">
                <div className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: c.solid }} />
                <span className="text-[10px] font-black text-muted uppercase tracking-widest">
                  {room?.room_name || key}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

