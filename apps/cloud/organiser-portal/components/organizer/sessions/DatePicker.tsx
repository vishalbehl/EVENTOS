"use client";

import { useState, useMemo } from "react";
import { 
  format, addMonths, subMonths, startOfMonth, endOfMonth, 
  startOfWeek, endOfWeek, eachDayOfInterval, isSameMonth, 
  isToday, isSameDay
} from "date-fns";
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";

interface DatePickerProps {
  value: Date;
  onChange: (date: Date) => void;
  className?: string;
}

export function DatePicker({ value, onChange, className }: DatePickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [cursor, setCursor] = useState(value);

  const days = useMemo(() => {
    const start = startOfWeek(startOfMonth(cursor), { weekStartsOn: 1 });
    const end = endOfWeek(endOfMonth(cursor), { weekStartsOn: 1 });
    return eachDayOfInterval({ start, end });
  }, [cursor]);

  return (
    <div className={cn("relative inline-block", className)}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-[var(--border-default)] bg-[var(--card)] hover:bg-[var(--bg-surface-hover)] transition-colors cursor-pointer shadow-sm text-xs font-semibold text-[var(--text-primary)]"
      >
        <CalendarIcon className="size-3.5 text-[var(--pri)]" />
        <span>
          {format(value, "d MMM yyyy")}
        </span>
      </button>

      <AnimatePresence>
        {isOpen && (
          <>
            {/* Backdrop */}
            <div className="fixed inset-0 z-[100]" onClick={() => setIsOpen(false)} />
            
            {/* Popover */}
            <motion.div
              initial={{ opacity: 0, y: 8, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 8, scale: 0.96 }}
              className="absolute top-full left-0 mt-2 z-[101] w-64 p-3.5 border border-[var(--border-default)] rounded-lg bg-[var(--card)] shadow-xl text-[var(--text-primary)]"
            >
              {/* Header */}
              <div className="flex items-center justify-between mb-3">
                <button 
                  type="button"
                  onClick={() => setCursor(subMonths(cursor, 1))}
                  className="size-7 rounded-md border border-[var(--border-default)] bg-[var(--card)] hover:bg-[var(--bg-surface-hover)] flex items-center justify-center transition-colors text-[var(--text-secondary)] hover:text-[var(--text-primary)] cursor-pointer"
                >
                  <ChevronLeft className="size-3.5" />
                </button>
                <span className="text-xs font-bold text-[var(--text-primary)]">
                  {format(cursor, "MMMM yyyy")}
                </span>
                <button 
                  type="button"
                  onClick={() => setCursor(addMonths(cursor, 1))}
                  className="size-7 rounded-md border border-[var(--border-default)] bg-[var(--card)] hover:bg-[var(--bg-surface-hover)] flex items-center justify-center transition-colors text-[var(--text-secondary)] hover:text-[var(--text-primary)] cursor-pointer"
                >
                  <ChevronRight className="size-3.5" />
                </button>
              </div>

              {/* Day Labels */}
              <div className="grid grid-cols-7 mb-1">
                {["M", "T", "W", "T", "F", "S", "S"].map((d, i) => (
                  <div key={i} className="text-center text-[10px] font-bold text-[var(--text-tertiary)] uppercase">
                    {d}
                  </div>
                ))}
              </div>

              {/* Grid */}
              <div className="grid grid-cols-7 gap-1">
                {days.map((day) => {
                  const isCurrentMonth = isSameMonth(day, cursor);
                  const isSelected = isSameDay(day, value);
                  const isDayToday = isToday(day);

                  return (
                    <button
                      key={day.toISOString()}
                      type="button"
                      onClick={() => {
                        onChange(day);
                        setIsOpen(false);
                      }}
                      className={cn(
                        "size-7 rounded-md flex items-center justify-center text-xs transition-colors relative cursor-pointer font-medium",
                        !isCurrentMonth && "text-[var(--text-tertiary)] opacity-40",
                        isCurrentMonth && !isSelected && "text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)]",
                        isSelected && "bg-[var(--pri)] text-[var(--primary-contrast)] font-bold shadow-sm",
                        isDayToday && !isSelected && "border border-[var(--pri)]/50"
                      )}
                    >
                      {format(day, "d")}
                    </button>
                  );
                })}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
