"use client";

import { AlertTriangle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function CommandCenterError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="grid min-h-[60vh] place-items-center p-6">
      <section className="w-full max-w-lg rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-8 text-center shadow-[var(--shadow-panel)]">
        <AlertTriangle className="mx-auto h-8 w-8 text-[var(--status-warning)]" aria-hidden />
        <h1 className="mt-4 text-lg font-semibold text-[var(--text-primary)]">This workspace could not be loaded</h1>
        <p className="mt-2 text-sm text-[var(--text-secondary)]">Retry the request. If it continues, check the related service status.</p>
        <Button className="mt-6" onClick={reset}><RefreshCw className="mr-2 h-4 w-4" />Retry</Button>
      </section>
    </main>
  );
}
