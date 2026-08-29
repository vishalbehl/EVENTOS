"use client";

import { motion } from "framer-motion";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/Tooltip";
import { cn } from "@/lib/utils";

interface HeatmapData {
  room_name: string;
  readiness_pct: number;
  total_sessions: number;
  ready_sessions: number;
}

interface ReadinessHeatmapProps {
  data: HeatmapData[];
}

export function ReadinessHeatmap({ data }: ReadinessHeatmapProps) {
  if (!data || data.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-40 text-[var(--text-secondary)] text-xs font-semibold border border-dashed border-[var(--border-default)] rounded-lg bg-[var(--card)]">
        No Room Data Available
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
      <TooltipProvider>
        {data.map((room, i) => {
          let colorClass = "bg-[var(--card)] border-[var(--border-default)]";
          let textClass = "text-[var(--text-secondary)]";

          if (room.readiness_pct === 100) {
            colorClass = "bg-emerald-500/10 border-emerald-500/30";
            textClass = "text-emerald-600 dark:text-emerald-400";
          } else if (room.readiness_pct > 75) {
            colorClass = "bg-[var(--pri)]/10 border-[var(--pri)]/30";
            textClass = "text-[var(--pri)]";
          } else if (room.readiness_pct > 0) {
            colorClass = "bg-amber-500/10 border-amber-500/30";
            textClass = "text-amber-600 dark:text-amber-400";
          }

          return (
            <Tooltip key={room.room_name}>
              <TooltipTrigger asChild>
                <motion.div
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: i * 0.03 }}
                  className={cn(
                    "relative aspect-square rounded-lg border flex flex-col items-center justify-center p-3 transition-colors cursor-pointer group shadow-sm",
                    colorClass
                  )}
                >
                  <span className={cn("text-[10px] font-bold uppercase tracking-wider mb-1 text-center truncate w-full", textClass)}>
                    {room.room_name}
                  </span>
                  <span className="text-xl font-bold text-[var(--text-primary)]">
                    {Math.round(room.readiness_pct)}%
                  </span>
                  <div className="absolute bottom-2 left-2 right-2 h-1 bg-[var(--bg-surface-2)] rounded-full overflow-hidden">
                    <motion.div 
                      initial={{ width: 0 }}
                      animate={{ width: `${room.readiness_pct}%` }}
                      className={cn("h-full", room.readiness_pct === 100 ? "bg-emerald-500" : "bg-[var(--pri)]")}
                    />
                  </div>
                </motion.div>
              </TooltipTrigger>
              <TooltipContent className="bg-[var(--card)] border border-[var(--border-default)] p-3 rounded-lg shadow-md text-xs">
                <div className="space-y-1">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">{room.room_name}</p>
                  <p className="text-xs font-semibold text-[var(--text-primary)]">{room.ready_sessions} / {room.total_sessions} Sessions Ready</p>
                  <p className="text-[11px] text-[var(--text-secondary)]">{room.readiness_pct.toFixed(1)}% Completion</p>
                </div>
              </TooltipContent>
            </Tooltip>
          );
        })}
      </TooltipProvider>
    </div>
  );
}
