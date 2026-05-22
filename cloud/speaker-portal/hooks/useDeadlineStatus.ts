"use client";

import { useState, useEffect } from "react";

export type DeadlineStatus =
  | "no_deadline"   // no deadline set
  | "open"          // > 24 hours remaining
  | "urgent"        // <= 24 hours remaining, not yet passed
  | "passed"        // deadline has passed
  | "override";     // deadline passed, but allow_override=true

export interface DeadlineInfo {
  status: DeadlineStatus;
  /** ISO string of the deadline, or null */
  deadline: string | null;
  /** Hours remaining (can be negative if passed) */
  hoursRemaining: number;
  /** Minutes remaining within the current hour */
  minutesRemaining: number;
  /** Human-friendly label: "28 Apr 18:00 IST · 14 hrs remaining" */
  label: string;
  /** True when the dropzone should be locked */
  isLocked: boolean;
}

function computeDeadlineInfo(
  deadline: string | null,
  allowOverride: boolean
): DeadlineInfo {
  if (!deadline) {
    return {
      status: "no_deadline",
      deadline: null,
      hoursRemaining: Infinity,
      minutesRemaining: 0,
      label: "",
      isLocked: false,
    };
  }

  const deadlineDate = new Date(deadline);
  const now = new Date();
  const diffMs = deadlineDate.getTime() - now.getTime();
  const diffTotalMinutes = Math.floor(diffMs / 60_000);
  const hoursRemaining = Math.floor(diffTotalMinutes / 60);
  const minutesRemaining = Math.abs(diffTotalMinutes % 60);

  // Format the deadline time nicely
  const formattedDate = deadlineDate.toLocaleDateString('en-IN', {
    day: "numeric",
    month: "short",
    timeZone: 'Asia/Kolkata'
  });
  const formattedTime = deadlineDate.toLocaleTimeString('en-IN', {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
    timeZone: 'Asia/Kolkata'
  }) + " IST";

  let status: DeadlineStatus;
  let label: string;
  let isLocked: boolean;

  if (diffMs <= 0) {
    // Deadline has passed
    if (allowOverride) {
      status = "override";
      label = `${formattedDate} ${formattedTime} · Late submission`;
      isLocked = false;
    } else {
      status = "passed";
      const hoursAgo = Math.abs(hoursRemaining);
      label = `${formattedDate} ${formattedTime} · Deadline passed ${hoursAgo > 0 ? `${hoursAgo}h ago` : "just now"}`;
      isLocked = true;
    }
  } else if (diffMs <= 24 * 60 * 60 * 1000) {
    // Under 24 hours
    status = "urgent";
    const h = hoursRemaining;
    const m = minutesRemaining;
    const remaining = h > 0 ? `${h}h ${m}m remaining` : `${m}m remaining`;
    label = `${formattedDate} ${formattedTime} · ${remaining}`;
    isLocked = false;
  } else {
    status = "open";
    const h = hoursRemaining;
    const remaining = h < 48 ? `${h} hrs remaining` : `${Math.floor(h / 24)} days remaining`;
    label = `${formattedDate} ${formattedTime} · ${remaining}`;
    isLocked = false;
  }

  return { status, deadline, hoursRemaining, minutesRemaining, label, isLocked };
}

/**
 * Self-ticking hook that recalculates deadline status every 30 seconds.
 */
export function useDeadlineStatus(
  deadline: string | null,
  allowOverride: boolean
): DeadlineInfo {
  const [info, setInfo] = useState<DeadlineInfo>(() =>
    computeDeadlineInfo(deadline, allowOverride)
  );

  useEffect(() => {
    // Recalculate immediately when inputs change
    setInfo(computeDeadlineInfo(deadline, allowOverride));

    // Tick every 30 seconds
    const interval = setInterval(() => {
      setInfo(computeDeadlineInfo(deadline, allowOverride));
    }, 30_000);

    return () => clearInterval(interval);
  }, [deadline, allowOverride]);

  return info;
}
