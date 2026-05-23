
"use client";

import { motion } from "framer-motion";
import { Badge } from "@/components/ui/badge";
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
      <div className="flex flex-col items-center justify-center h-48 text-muted uppercase text-[10px] font-black tracking-widest border border-dashed border-default rounded-3xl">
        No Room Data Available
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
      <TooltipProvider>
        {data.map((room, i) => {
          // Determine color based on readiness
          let colorClass = "bg-[color-mix(in_srgb,var(--text)_5%,transparent)]";
          let borderClass = "border-default";
          let textClass = "text-muted";

          if (room.readiness_pct === 100) {
            colorClass = "bg-[var(--success)]/20";
            borderClass = "border-[var(--success)]/30";
            textClass = "text-[var(--success)]";
          } else if (room.readiness_pct > 75) {
            colorClass = "bg-[var(--pri)]/20";
            borderClass = "border-[var(--pri)]/30";
            textClass = "text-[var(--pri)]";
          } else if (room.readiness_pct > 0) {
            colorClass = "bg-[var(--warn)]/20";
            borderClass = "border-[var(--warn)]/30";
            textClass = "text-[var(--warn)]";
          }

          return (
            <Tooltip key={room.room_name}>
              <TooltipTrigger asChild>
                <motion.div
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: i * 0.05 }}
                  className={cn(
                    "relative aspect-square rounded-2xl border flex flex-col items-center justify-center p-4 transition-all hover:scale-105 cursor-pointer group hover-lift-3d",
                    colorClass,
                    borderClass
                  )}
                >
                  <span className={cn("text-[10px] font-black uppercase tracking-widest mb-1 text-center truncate w-full", textClass)}>
                    {room.room_name}
                  </span>
                  <span className="text-xl font-black tracking-tighter text-[var(--text)]">
                    {Math.round(room.readiness_pct)}%
                  </span>
                  <div className="absolute bottom-2 left-2 right-2 h-1 bg-[color-mix(in_srgb,var(--text)_10%,transparent)] rounded-full overflow-hidden">
                    <motion.div 
                      initial={{ width: 0 }}
                      animate={{ width: `${room.readiness_pct}%` }}
                      className={cn("h-full", room.readiness_pct === 100 ? "bg-[var(--success)]" : "bg-[var(--pri)]")}
                    />
                  </div>
                </motion.div>
              </TooltipTrigger>
              <TooltipContent className="glass-3d border-default p-4 rounded-xl">
                <div className="space-y-1">
                  <p className="text-[10px] font-black uppercase tracking-widest text-muted">{room.room_name}</p>
                  <p className="text-sm font-bold text-[var(--text)]">{room.ready_sessions} / {room.total_sessions} Sessions Ready</p>
                  <p className="text-[10px] text-muted">{room.readiness_pct.toFixed(1)}% Completion</p>
                </div>
              </TooltipContent>
            </Tooltip>
          );
        })}
      </TooltipProvider>
    </div>
  );
}
