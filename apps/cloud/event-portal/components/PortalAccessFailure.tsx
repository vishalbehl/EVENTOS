"use client";

import { useEffect, useState } from "react";
import { describePortalAccessFailure } from "../lib/portal-access-failure";
import { Button } from "./ui/button";

export function PortalAccessFailure({ error, busy, onRetry, onSignIn }: {
  error: unknown; busy: boolean; onRetry: () => void; onSignIn: () => void;
}) {
  const problem = describePortalAccessFailure(error);
  const [remaining, setRemaining] = useState(problem.retryAfterSeconds);
  useEffect(() => { setRemaining(problem.retryAfterSeconds); }, [error, problem.retryAfterSeconds]);
  useEffect(() => {
    if (remaining <= 0) return;
    const timer = window.setTimeout(() => setRemaining(value => Math.max(0, value - 1)), 1000);
    return () => window.clearTimeout(timer);
  }, [remaining]);
  return <div role="alert" className="max-w-md mx-auto py-16 text-center space-y-4">
    <h2 className="text-xl font-bold text-[var(--text)]">{problem.title}</h2>
    <p className="text-xs text-[var(--muted)] leading-relaxed">{problem.message}</p>
    {problem.referenceId ? <p className="text-xs text-[var(--muted)]">Reference: {problem.referenceId}</p> : null}
    {problem.canRetry ? <Button disabled={busy || remaining > 0} onClick={onRetry}>
      {busy ? "Checking workspace…" : remaining > 0 ? `Try again in ${remaining}s` : "Try again"}
    </Button> : null}
    <Button onClick={onSignIn}>Go to Sign In</Button>
  </div>;
}
