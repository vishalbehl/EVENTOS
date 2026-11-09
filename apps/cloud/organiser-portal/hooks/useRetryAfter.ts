"use client";

import { useEffect, useState } from "react";
import type { ApiError } from "@/lib/api-client";

/** Feedback only: expiration never replays a request or a mutation. */
export function useRetryAfter(error: unknown): number {
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    const value = error && typeof error === "object" ? (error as ApiError).retryAfter : 0;
    const delay = typeof value === "number" && Number.isFinite(value)
      ? Math.min(86400, Math.max(0, value)) : 0;
    const deadline = Date.now() + delay * 1000;
    setSeconds(Math.ceil(delay));
    if (!delay) return;
    const timer = window.setInterval(() => {
      const remaining = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
      setSeconds(remaining);
      if (!remaining) window.clearInterval(timer);
    }, 1000);
    return () => window.clearInterval(timer);
  }, [error]);
  return seconds;
}
