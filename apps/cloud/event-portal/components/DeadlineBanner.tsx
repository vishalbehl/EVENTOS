"use client";

import { motion, AnimatePresence } from "framer-motion";
import { Clock, AlertTriangle, XCircle, Timer } from "lucide-react";
import { cn } from "@/lib/utils";
import type { DeadlineInfo } from "@/hooks/useDeadlineStatus";

interface DeadlineBannerProps {
  deadlineInfo: DeadlineInfo;
  className?: string;
}

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
            "w-full flex items-center justify-center gap-3 px-6 py-2.5 text-xs font-semibold tracking-wide z-[60]",
            status === "passed"
              ? "bg-[color-mix(in_srgb,var(--status-danger)_15%,transparent)] border-b border-[var(--status-danger)] text-[var(--status-danger)]"
              : status === "override"
              ? "bg-[color-mix(in_srgb,var(--status-warning)_15%,transparent)] border-b border-[var(--status-warning)] text-[var(--status-warning)]"
              : "bg-[color-mix(in_srgb,var(--status-warning)_15%,transparent)] border-b border-[var(--status-warning)] text-[var(--status-warning)]",
            className
          )}
        >
          {status === "passed" ? (
            <XCircle className="h-4 w-4 shrink-0" />
          ) : status === "override" ? (
            <AlertTriangle className="h-4 w-4 shrink-0" />
          ) : (
            <Timer className="h-4 w-4 shrink-0 animate-pulse" />
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

export function DeadlineCountdownBadge({ deadlineInfo, className }: DeadlineCountdownBadgeProps) {
  const { status, label } = deadlineInfo;

  if (status === "no_deadline") return null;

  const colorClass =
    status === "passed"
      ? "text-[var(--status-danger)] border-[color-mix(in_srgb,var(--status-danger)_30%,transparent)] bg-[color-mix(in_srgb,var(--status-danger)_10%,transparent)]"
      : status === "override"
      ? "text-[var(--status-warning)] border-[color-mix(in_srgb,var(--status-warning)_30%,transparent)] bg-[color-mix(in_srgb,var(--status-warning)_10%,transparent)]"
      : status === "urgent"
      ? "text-[var(--status-danger)] border-[color-mix(in_srgb,var(--status-danger)_30%,transparent)] bg-[color-mix(in_srgb,var(--status-danger)_10%,transparent)]"
      : "text-[var(--status-warning)] border-[color-mix(in_srgb,var(--status-warning)_30%,transparent)] bg-[color-mix(in_srgb,var(--status-warning)_10%,transparent)]";

  return (
    <div
      className={cn(
        "flex items-center gap-2 text-xs font-semibold px-3 py-1 rounded-full border",
        colorClass,
        className
      )}
    >
      <Clock className={cn("h-3.5 w-3.5", status === "urgent" && "animate-pulse")} />
      <span>{label}</span>
    </div>
  );
}
