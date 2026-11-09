"use client";

import { History, RotateCcw, Save, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useCreateScheduleCheckpoint, useRestoreScheduleRevision, useScheduleRevisions } from "@/hooks/useSessionBuilder";
import { Portal } from "@/components/ui/portal";

export function ScheduleHistoryDialog({ eventId, open, onClose }: { eventId: string; open: boolean; onClose: () => void }) {
  const revisions = useScheduleRevisions(eventId);
  const checkpoint = useCreateScheduleCheckpoint(eventId);
  const restore = useRestoreScheduleRevision(eventId);
  if (!open) return null;
  return (
    <Portal>
      <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/75 backdrop-blur-xs p-4 overflow-y-auto" role="dialog" aria-modal="true" aria-label="Schedule history">
        <div className="flex max-h-[80vh] w-full max-w-xl flex-col overflow-hidden rounded-2xl border border-[var(--border-default)] bg-[var(--card)] shadow-2xl relative z-10 my-auto">
          <div className="flex items-start justify-between border-b border-[var(--border-subtle)] p-5">
            <div>
              <div className="flex items-center gap-2 text-[var(--text-primary)]">
                <History className="size-4" />
                <h2 className="text-sm font-bold">Schedule history</h2>
              </div>
              <p className="mt-1 text-xs text-[var(--text-secondary)]">Restore an earlier schedule safely. The current state is checkpointed first.</p>
            </div>
            <button type="button" onClick={onClose} className="rounded-md p-1 text-[var(--text-secondary)] hover:bg-[var(--surface-subtle)] cursor-pointer">
              <X className="size-4" />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-4">
            {revisions.isLoading ? <p className="py-8 text-center text-xs text-[var(--text-secondary)]">Loading schedule history…</p> : null}
            {!revisions.isLoading && !revisions.data?.length ? <p className="py-8 text-center text-xs text-[var(--text-secondary)]">No checkpoints yet. Save one before a major programme change.</p> : null}
            <div className="space-y-2">
              {revisions.data?.map((revision) => (
                <article key={revision.id} className="flex items-center justify-between gap-4 rounded-lg border border-[var(--border-default)] p-3">
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-[var(--text-primary)]">Revision {revision.revision_number}{revision.label ? ` · ${revision.label}` : ""}</p>
                    <p className="mt-1 text-[10px] text-[var(--text-secondary)]">{new Date(revision.created_at).toLocaleString()} {revision.reason ? `· ${revision.reason}` : ""}</p>
                  </div>
                  <Button size="sm" variant="outline" disabled={restore.isPending} onClick={() => { if (window.confirm("Restore this schedule revision? Current work will be checkpointed first.")) restore.mutate(revision.id); }} className="h-8 shrink-0 gap-1.5 text-[10px] font-bold cursor-pointer">
                    <RotateCcw className="size-3" /> Restore
                  </Button>
                </article>
              ))}
            </div>
          </div>
          <div className="flex justify-end border-t border-[var(--border-subtle)] p-4">
            <Button disabled={checkpoint.isPending} onClick={() => checkpoint.mutate({ label: "Manual checkpoint" })} className="h-9 gap-2 text-xs font-bold cursor-pointer">
              <Save className="size-3.5" /> Save checkpoint
            </Button>
          </div>
        </div>
      </div>
    </Portal>
  );
}
