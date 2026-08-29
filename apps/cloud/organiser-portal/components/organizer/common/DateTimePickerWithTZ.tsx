"use client";

import { useState, useMemo, useEffect, useRef } from "react";
import {
  format,
  addMonths,
  subMonths,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  isSameMonth,
  isToday,
  isSameDay,
} from "date-fns";
import {
  Clock,
  ChevronLeft,
  ChevronRight,
  Globe,
  X,
  Check,
  ChevronDown,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";

interface DateTimePickerWithTZProps {
  value?: string | null; // ISO string
  onChange: (isoString: string | null) => void;
  timezone?: string;
  placeholder?: string;
  defaultTime?: string; // "10:30" or "00:00" or "23:59"
  className?: string;
}

export function DateTimePickerWithTZ({
  value,
  onChange,
  timezone = "Asia/Kolkata",
  placeholder = "Select date & time...",
  defaultTime = "10:30",
  className,
}: DateTimePickerWithTZProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Parse initial selected date
  const parsedDate = useMemo(() => {
    if (!value) return null;
    try {
      const d = new Date(value);
      return isNaN(d.getTime()) ? null : d;
    } catch {
      return null;
    }
  }, [value]);

  const [selectedDate, setSelectedDate] = useState<Date>(parsedDate || new Date());
  const [cursorMonth, setCursorMonth] = useState<Date>(parsedDate || new Date());

  // Split defaultTime into 12-hour format
  const initialTimeState = useMemo(() => {
    if (parsedDate) {
      const h24 = parsedDate.getHours();
      return {
        hours: h24 % 12 === 0 ? 12 : h24 % 12,
        minutes: parsedDate.getMinutes(),
        period: (h24 >= 12 ? "PM" : "AM") as "AM" | "PM",
      };
    }
    const parts = defaultTime.split(":").map((p) => parseInt(p, 10) || 0);
    const h24 = parts[0] ?? 10;
    return {
      hours: h24 % 12 === 0 ? 12 : h24 % 12,
      minutes: parts[1] ?? 30,
      period: (h24 >= 12 ? "PM" : "AM") as "AM" | "PM",
    };
  }, [parsedDate, defaultTime]);

  const [hours, setHours] = useState<number>(initialTimeState.hours);
  const [minutes, setMinutes] = useState<number>(initialTimeState.minutes);
  const [period, setPeriod] = useState<"AM" | "PM">(initialTimeState.period);

  // Sync state when value changes externally
  useEffect(() => {
    if (parsedDate) {
      setSelectedDate(parsedDate);
      setCursorMonth(parsedDate);
      const h24 = parsedDate.getHours();
      setHours(h24 % 12 === 0 ? 12 : h24 % 12);
      setMinutes(parsedDate.getMinutes());
      setPeriod(h24 >= 12 ? "PM" : "AM");
    }
  }, [parsedDate]);

  // Calendar days grid
  const days = useMemo(() => {
    const start = startOfWeek(startOfMonth(cursorMonth), { weekStartsOn: 1 });
    const end = endOfWeek(endOfMonth(cursorMonth), { weekStartsOn: 1 });
    return eachDayOfInterval({ start, end });
  }, [cursorMonth]);

  // Timezone display information
  const tzInfo = useMemo(() => {
    try {
      const now = new Date();
      const formatter = new Intl.DateTimeFormat("en-US", {
        timeZone: timezone,
        timeZoneName: "short",
      });
      const parts = formatter.formatToParts(now);
      const tzShort = parts.find((p) => p.type === "timeZoneName")?.value || "";

      // Compute GMT offset
      const d = new Date();
      const utcDate = new Date(d.toLocaleString("en-US", { timeZone: "UTC" }));
      const tzDate = new Date(d.toLocaleString("en-US", { timeZone: timezone }));
      const diffMinutes = Math.round((tzDate.getTime() - utcDate.getTime()) / 60000);
      const offsetHours = Math.floor(Math.abs(diffMinutes) / 60);
      const offsetMins = Math.abs(diffMinutes) % 60;
      const offsetSign = diffMinutes >= 0 ? "+" : "-";
      const offsetStr = `UTC${offsetSign}${String(offsetHours).padStart(2, "0")}:${String(offsetMins).padStart(2, "0")}`;

      return {
        name: timezone,
        short: tzShort,
        offset: offsetStr,
      };
    } catch {
      return {
        name: timezone || "Local",
        short: "IST",
        offset: "UTC+05:30",
      };
    }
  }, [timezone]);

  // Format ISO string (sets seconds to 0)
  const applyDateTime = (newDate: Date, newHours: number, newMinutes: number, newPeriod: "AM" | "PM") => {
    let final24Hours = newHours % 12;
    if (newPeriod === "PM") {
      final24Hours += 12;
    }
    const combined = new Date(newDate);
    combined.setHours(final24Hours, newMinutes, 0, 0);
    onChange(combined.toISOString());
  };

  const handleSelectDay = (day: Date) => {
    setSelectedDate(day);
    applyDateTime(day, hours, minutes, period);
  };

  const handleTimeChange = (newHours: number, newMinutes: number, newPeriod: "AM" | "PM") => {
    setHours(newHours);
    setMinutes(newMinutes);
    setPeriod(newPeriod);
    const targetDate = parsedDate || selectedDate || new Date();
    applyDateTime(targetDate, newHours, newMinutes, newPeriod);
  };

  // Formatted display label: "28 Aug 2026, 10:30 AM"
  const displayLabel = useMemo(() => {
    if (!parsedDate) return null;
    try {
      return format(parsedDate, "d MMM yyyy, h:mm a");
    } catch {
      return null;
    }
  }, [parsedDate]);

  return (
    <div ref={containerRef} className={cn("w-full space-y-2.5", className)}>
      {/* ── SINGLE UNIFIED TRIGGER BUTTON ── */}
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          className={cn(
            "flex-1 h-11 px-4 rounded-xl border flex items-center justify-between text-left text-xs font-semibold transition-all cursor-pointer shadow-sm bg-[var(--bg-surface-2)]",
            isOpen
              ? "border-[var(--pri)] ring-2 ring-[var(--pri)]/20 text-[var(--text-primary)]"
              : "border-[var(--border-default)] hover:border-[var(--border-strong)] text-[var(--text-primary)]"
          )}
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="p-1 rounded-lg bg-[var(--pri)]/10 text-[var(--pri)] shrink-0">
              <Clock className="size-3.5" />
            </div>
            <span className={cn("truncate font-medium text-xs", !displayLabel && "text-[var(--text-tertiary)]")}>
              {displayLabel || placeholder}
            </span>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <span className="px-2 py-0.5 rounded-md text-[10px] font-mono font-bold bg-[var(--card)] text-[var(--text-secondary)] border border-[var(--border-default)]">
              {tzInfo.short}
            </span>
            <ChevronDown
              className={cn(
                "size-4 text-[var(--text-tertiary)] transition-transform duration-200",
                isOpen && "rotate-180 text-[var(--pri)]"
              )}
            />
          </div>
        </button>

        {value && (
          <button
            type="button"
            onClick={() => onChange(null)}
            className="size-11 rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface-2)] hover:bg-rose-500/10 hover:text-rose-500 hover:border-rose-500/30 flex items-center justify-center text-[var(--text-secondary)] transition-colors cursor-pointer shrink-0 shadow-sm"
            title="Clear date & time"
          >
            <X className="size-4" />
          </button>
        )}
      </div>

      {/* ── EXPANDABLE IN-DIALOGUE CALENDAR & INTEGRATED TIME DRAWER ── */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0, scale: 0.98 }}
            animate={{ opacity: 1, height: "auto", scale: 1 }}
            exit={{ opacity: 0, height: 0, scale: 0.98 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden rounded-xl border border-[var(--border-default)] bg-[var(--card)] p-3.5 space-y-3 shadow-lg"
          >
            {/* Header with Timezone & Quick Actions */}
            <div className="flex items-center justify-between gap-2 pb-2.5 border-b border-[var(--border-subtle)]">
              <span className="text-[10px] text-[var(--text-tertiary)] flex items-center gap-1 font-mono font-medium">
                <Globe className="size-3 text-[var(--pri)]" /> {tzInfo.name} ({tzInfo.offset})
              </span>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    const now = new Date();
                    handleSelectDay(now);
                  }}
                  className="text-[10px] font-bold text-[var(--pri)] hover:underline flex items-center gap-1 cursor-pointer"
                >
                  <Check className="size-3" /> Today
                </button>
                {value && (
                  <button
                    type="button"
                    onClick={() => {
                      onChange(null);
                      setIsOpen(false);
                    }}
                    className="text-[10px] font-bold text-rose-500 hover:underline flex items-center gap-1 cursor-pointer"
                  >
                    <X className="size-3" /> Clear
                  </button>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* Calendar Days Picker */}
              <div className="space-y-2 p-2.5 rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface-2)]">
                {/* Month Navigation */}
                <div className="flex items-center justify-between">
                  <button
                    type="button"
                    onClick={() => setCursorMonth(subMonths(cursorMonth, 1))}
                    className="size-6 rounded border border-[var(--border-default)] bg-[var(--card)] hover:bg-[var(--bg-surface-hover)] flex items-center justify-center transition-colors text-[var(--text-secondary)] hover:text-[var(--text-primary)] cursor-pointer"
                  >
                    <ChevronLeft className="size-3.5" />
                  </button>
                  <span className="text-xs font-bold text-[var(--text-primary)] font-mono">
                    {format(cursorMonth, "MMMM yyyy")}
                  </span>
                  <button
                    type="button"
                    onClick={() => setCursorMonth(addMonths(cursorMonth, 1))}
                    className="size-6 rounded border border-[var(--border-default)] bg-[var(--card)] hover:bg-[var(--bg-surface-hover)] flex items-center justify-center transition-colors text-[var(--text-secondary)] hover:text-[var(--text-primary)] cursor-pointer"
                  >
                    <ChevronRight className="size-3.5" />
                  </button>
                </div>

                {/* Days of week */}
                <div className="grid grid-cols-7 text-center">
                  {["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"].map((d) => (
                    <div
                      key={d}
                      className="text-[9px] font-bold text-[var(--text-tertiary)] uppercase py-0.5"
                    >
                      {d}
                    </div>
                  ))}
                </div>

                {/* Days Grid */}
                <div className="grid grid-cols-7 gap-0.5">
                  {days.map((day) => {
                    const isCurMonth = isSameMonth(day, cursorMonth);
                    const isSelected = parsedDate ? isSameDay(day, selectedDate) : false;
                    const isTodayDay = isToday(day);

                    return (
                      <button
                        key={day.toISOString()}
                        type="button"
                        onClick={() => handleSelectDay(day)}
                        className={cn(
                          "h-6.5 w-full rounded text-[11px] font-mono font-semibold flex items-center justify-center transition-all cursor-pointer",
                          !isCurMonth && "text-[var(--text-tertiary)] opacity-30",
                          isSelected
                            ? "bg-[var(--pri)] text-[var(--primary-contrast)] font-bold shadow-sm"
                            : isTodayDay
                            ? "border border-[var(--pri)] text-[var(--pri)] bg-[var(--pri)]/5 font-bold"
                            : "hover:bg-[var(--card)] text-[var(--text-primary)]"
                        )}
                      >
                        {format(day, "d")}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Integrated Time Controls (Hours and Minutes Only - No Seconds) */}
              <div className="flex flex-col justify-between p-2.5 rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface-2)] space-y-2.5">
                <div className="space-y-2">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-tertiary)] flex items-center gap-1.5">
                    <Clock className="size-3.5 text-[var(--pri)]" /> Set Time ({tzInfo.short}):
                  </span>

                  {/* Hours, Minutes, AM/PM Pickers */}
                  <div className="flex items-center gap-1.5">
                    {/* Hours */}
                    <div className="flex-1 flex items-center bg-[var(--card)] rounded-lg border border-[var(--border-default)] px-2">
                      <input
                        type="number"
                        min={1}
                        max={12}
                        value={hours}
                        onChange={(e) => {
                          const val = Math.max(1, Math.min(12, parseInt(e.target.value, 10) || 1));
                          handleTimeChange(val, minutes, period);
                        }}
                        className="w-full h-8 bg-transparent text-center font-mono font-bold text-xs text-[var(--text-primary)] focus:outline-none"
                      />
                      <span className="text-[9px] text-[var(--text-tertiary)] font-bold">HR</span>
                    </div>

                    <span className="font-bold text-xs text-[var(--text-tertiary)]">:</span>

                    {/* Minutes */}
                    <div className="flex-1 flex items-center bg-[var(--card)] rounded-lg border border-[var(--border-default)] px-2">
                      <input
                        type="number"
                        min={0}
                        max={59}
                        value={String(minutes).padStart(2, "0")}
                        onChange={(e) => {
                          const val = Math.max(0, Math.min(59, parseInt(e.target.value, 10) || 0));
                          handleTimeChange(hours, val, period);
                        }}
                        className="w-full h-8 bg-transparent text-center font-mono font-bold text-xs text-[var(--text-primary)] focus:outline-none"
                      />
                      <span className="text-[9px] text-[var(--text-tertiary)] font-bold">MIN</span>
                    </div>

                    {/* AM / PM Toggle */}
                    <div className="flex rounded-lg border border-[var(--border-default)] p-0.5 bg-[var(--card)]">
                      <button
                        type="button"
                        onClick={() => handleTimeChange(hours, minutes, "AM")}
                        className={cn(
                          "px-2 py-1 text-[10px] font-bold rounded transition-colors cursor-pointer",
                          period === "AM"
                            ? "bg-[var(--pri)] text-[var(--primary-contrast)] shadow-sm"
                            : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                        )}
                      >
                        AM
                      </button>
                      <button
                        type="button"
                        onClick={() => handleTimeChange(hours, minutes, "PM")}
                        className={cn(
                          "px-2 py-1 text-[10px] font-bold rounded transition-colors cursor-pointer",
                          period === "PM"
                            ? "bg-[var(--pri)] text-[var(--primary-contrast)] shadow-sm"
                            : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                        )}
                      >
                        PM
                      </button>
                    </div>
                  </div>

                  {/* Quick Time Presets */}
                  <div className="flex flex-wrap items-center gap-1 pt-1">
                    {[
                      { label: "12:00 AM", h: 12, m: 0, p: "AM" as const },
                      { label: "09:00 AM", h: 9, m: 0, p: "AM" as const },
                      { label: "12:00 PM", h: 12, m: 0, p: "PM" as const },
                      { label: "11:59 PM", h: 11, m: 59, p: "PM" as const },
                    ].map((preset) => (
                      <button
                        key={preset.label}
                        type="button"
                        onClick={() => handleTimeChange(preset.h, preset.m, preset.p)}
                        className={cn(
                          "text-[9px] font-mono font-semibold px-1.5 py-0.5 rounded border transition-colors cursor-pointer",
                          hours === preset.h && minutes === preset.m && period === preset.p
                            ? "bg-[var(--pri)]/10 text-[var(--pri)] border-[var(--pri)] font-bold"
                            : "bg-[var(--card)] border-[var(--border-default)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                        )}
                      >
                        {preset.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="p-2 rounded bg-[var(--card)] border border-[var(--border-subtle)] text-[10px] text-[var(--text-secondary)]">
                  {value ? (
                    <span className="font-semibold text-emerald-500 flex items-center gap-1 truncate">
                      <Check className="size-3 shrink-0" /> {displayLabel} ({tzInfo.short})
                    </span>
                  ) : (
                    <span className="text-[var(--text-tertiary)]">
                      Pick date & time to apply schedule.
                    </span>
                  )}
                </div>

                <button
                  type="button"
                  onClick={() => setIsOpen(false)}
                  className="w-full h-7 bg-[var(--pri)] text-[var(--primary-contrast)] hover:opacity-90 font-bold text-[10px] rounded-md transition-opacity cursor-pointer shadow-sm"
                >
                  Done / Close
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}



