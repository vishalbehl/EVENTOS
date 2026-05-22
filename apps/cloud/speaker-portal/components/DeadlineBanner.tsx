"use client";

import { motion, AnimatePresence } from "framer-motion";
import { Clock, AlertTriangle, XCircle, Timer } from "lucide-react";
import { cn } from "@/lib/utils";
import type { DeadlineInfo } from "@/hooks/useDeadlineStatus";

interface DeadlineBannerProps {
  deadlineInfo: DeadlineInfo;
  className?: string;
}

/**
 * Sticky amber/red top banner that appears when the deadline is under 24h,
 * passed, or in override mode. Nothing is rendered for "no_deadline" or "open".
 */
export function DeadlineBanner({ deadlineInfo, className }: DeadlineBannerProps) {
  const { status, label } = deadlineInfo;

  const show = status === "urgent" || status === "passed" || status === "override";

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ y: -60, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -60, opacity: 0 }}
          transition={{ type: "spring", stiffness: 400, damping: 30 }}
          className={cn(
            "w-full flex items-center justify-center gap-3 px-6 py-3 text-[11px] font-black uppercase tracking-widest z-[60]",
            status === "passed"
              ? "bg-red-500/15 border-b border-red-500/30 text-red-400"
              : status === "override"
              ? "bg-yellow-500/15 border-b border-yellow-500/30 text-yellow-400"
              : "bg-amber-500/15 border-b border-amber-500/30 text-amber-400",
            className
          )}
        >
          {status === "passed" ? (
            <XCircle className="h-3.5 w-3.5 shrink-0" />
          ) : status === "override" ? (
            <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
          ) : (
            <Timer className="h-3.5 w-3.5 shrink-0 animate-pulse" />
          )}
          <span>
            {status === "passed"
              ? "Upload deadline has passed · Contact your organiser if you need to submit"
              : status === "override"
              ? "Late submission window · Your organiser has granted you access"
              : `Upload deadline approaching · ${label}`}
          </span>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

interface DeadlineCountdownBadgeProps {
  deadlineInfo: DeadlineInfo;
  className?: string;
}

/**
 * Compact inline badge for use in section headers, e.g. "14 hrs remaining"
 */
export function DeadlineCountdownBadge({ deadlineInfo, className }: DeadlineCountdownBadgeProps) {
  const { status, label } = deadlineInfo;

  if (status === "no_deadline") return null;

  const colorClass =
    status === "passed"
      ? "text-red-400 border-red-500/20 bg-red-500/10"
      : status === "override"
      ? "text-yellow-400 border-yellow-500/20 bg-yellow-500/10"
      : status === "urgent"
      ? "text-red-400 border-red-500/20 bg-red-500/10"
      : "text-amber-400 border-amber-500/20 bg-amber-400/10";

  return (
    <div
      className={cn(
        "flex items-center gap-2 text-[10px] font-black uppercase tracking-widest px-3 py-1 rounded-full border",
        colorClass,
        className
      )}
    >
      <Clock className={cn("h-3 w-3", status === "urgent" && "animate-pulse")} />
      <span>{label}</span>
    </div>
  );
}
