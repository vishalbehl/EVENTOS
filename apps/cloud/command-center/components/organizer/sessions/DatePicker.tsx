"use client";

import { useState, useMemo } from "react";
import { 
  format, addMonths, subMonths, startOfMonth, endOfMonth, 
  startOfWeek, endOfWeek, eachDayOfInterval, isSameMonth, 
  isToday, isSameDay, parseISO 
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
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-3 px-4 py-2 rounded-2xl glass-3d border-default hover:border-[var(--pri)]/50 transition-all group"
      >
        <CalendarIcon className="h-4 w-4 text-[var(--pri)] group-hover:scale-110 transition-transform" />
        <span className="text-[13px] font-black uppercase tracking-widest text-[var(--text)]">
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
              initial={{ opacity: 0, y: 10, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 10, scale: 0.95 }}
              className="absolute top-full left-0 mt-3 z-[101] w-72 p-5 glass-3d border-default rounded-[2rem] shadow-2xl backdrop-blur-2xl"
            >
              {/* Header */}
              <div className="flex items-center justify-between mb-4">
                <button 
                  onClick={() => setCursor(subMonths(cursor, 1))}
                  className="h-8 w-8 rounded-xl hover:bg-muted/10 flex items-center justify-center transition-all"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <span className="text-[11px] font-black uppercase tracking-widest text-[var(--text)]">
                  {format(cursor, "MMMM yyyy")}
                </span>
                <button 
                  onClick={() => setCursor(addMonths(cursor, 1))}
                  className="h-8 w-8 rounded-xl hover:bg-muted/10 flex items-center justify-center transition-all"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>

              {/* Day Labels */}
              <div className="grid grid-cols-7 mb-2">
                {["M", "T", "W", "T", "F", "S", "S"].map((d, i) => (
                  <div key={i} className="text-center text-[9px] font-black text-muted uppercase">
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
                      onClick={() => {
                        onChange(day);
                        setIsOpen(false);
                      }}
                      className={cn(
                        "h-8 w-8 rounded-xl text-[10px] font-black transition-all flex items-center justify-center",
                        !isCurrentMonth && "opacity-20",
                        isSelected 
                          ? "bg-[var(--pri)] text-[var(--text)] shadow-lg shadow-[var(--pri)]/20 scale-110" 
                          : "hover:bg-[var(--pri)]/10 text-muted hover:text-[var(--text)]",
                        isDayToday && !isSelected && "text-[var(--pri)] border border-[var(--pri)]/20"
                      )}
                    >
                      {format(day, "d")}
                    </button>
                  );
                })}
              </div>

              {/* Footer */}
              <div className="mt-4 pt-4 border-t border-default/50 flex justify-center">
                <button
                  onClick={() => {
                    onChange(new Date());
                    setCursor(new Date());
                    setIsOpen(false);
                  }}
                  className="text-[9px] font-black uppercase tracking-widest text-[var(--pri)] hover:underline"
                >
                  Go to Today
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
