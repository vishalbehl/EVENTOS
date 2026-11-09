"use client";

import { useEffect, useState } from "react";
import type { ApiError } from "@/lib/api-client";

export function ScopedCommandFeedback({ failure, retryAt }: { failure: ApiError | null; retryAt: number | null }) {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    if (!retryAt) return;
    setNow(Date.now());
    if (retryAt <= Date.now()) return;
    const timer = window.setInterval(() => {
      const next = Date.now();
      setNow(next);
      if (next >= retryAt) window.clearInterval(timer);
    }, 1000);
    return () => window.clearInterval(timer);
  }, [retryAt]);
  if (!failure) return null;
  const seconds = retryAt ? Math.max(0, Math.ceil((retryAt - now) / 1000)) : 0;
  const message = failure.status === 429 ? "Too many requests. Your input is retained."
    : failure.status === 503 ? "The service is temporarily unavailable. Your input is retained."
    : failure.status === 412 ? "This configuration has changed. Reload it before saving again."
    : failure.code === "STEP_UP_REQUIRED" ? "Recent MFA is required. Re-authenticate, then explicitly retry."
    : failure.message;
  return <div role="alert" className="col-span-full rounded border p-3 text-sm">
    <p>{message}</p>
    {retryAt ? <p>{seconds > 0 ? `Retry after ${seconds} seconds.` : "You can explicitly retry now."}</p> : null}
    {failure.correlationId ? <p>Reference: {failure.correlationId}</p> : null}
  </div>;
}
