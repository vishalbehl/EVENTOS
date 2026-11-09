"use client";

import { useScheduleAnnouncement, useSchedulePreview } from "@/hooks/useSessionBuilder";
import { useEmailTemplates } from "@/hooks/useEmails";
import { useState } from "react";
import { Portal } from "@/components/ui/portal";

export function SchedulePreviewDialog({ eventId, open, onClose }: { eventId: string; open: boolean; onClose: () => void }) {
  const preview = useSchedulePreview(eventId, open);
  const templatesQuery = useEmailTemplates(eventId);
  const announcement = useScheduleAnnouncement(eventId);
  const [templateId, setTemplateId] = useState("");
  const [targetType, setTargetType] = useState<"participant" | "speaker">("participant");
  if (!open) return null;
  const data = preview.data;
  const templates = Array.isArray(templatesQuery.data) ? templatesQuery.data : [];
  return (
    <Portal>
      <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/75 backdrop-blur-xs p-4 overflow-y-auto" role="dialog" aria-modal="true" aria-label="Schedule preview">
        <div className="flex max-h-[88vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-[var(--border-default)] bg-[var(--card)] shadow-2xl relative z-10 my-auto">
          <header className="flex items-center justify-between border-b border-[var(--border-subtle)] px-5 py-4">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[.18em] text-[var(--pri)]">Draft publication view</p>
              <h2 className="mt-1 text-lg font-bold text-[var(--text-primary)]">Schedule preview</h2>
            </div>
            <button type="button" onClick={onClose} className="rounded-lg border border-[var(--border-default)] px-3 py-1.5 text-xs font-bold text-[var(--text-secondary)] hover:bg-[var(--bg-surface-hover)] cursor-pointer">Close</button>
          </header>
          {preview.isLoading ? (
            <div className="p-8 text-sm text-[var(--text-secondary)]">Building a fresh preview from the schedule database…</div>
          ) : preview.isError ? (
            <div className="p-8 text-sm text-rose-700">The draft preview is unavailable. Refresh the builder and try again.</div>
          ) : data ? (
            <div className="min-h-0 overflow-y-auto p-5">
              <div className={`rounded-xl border p-4 ${data.publication_ready ? "border-emerald-200 bg-emerald-50 text-emerald-950" : "border-rose-200 bg-rose-50 text-rose-950"}`}>
                <p className="text-sm font-black">{data.publication_ready ? "Ready for publication checks" : "Publication is blocked"}</p>
                <p className="mt-1 text-xs">{data.sessions.length} schedule items · {data.conflicts.length} checks · state {data.publication_status}</p>
              </div>
              {data.conflicts.length ? (
                <section className="mt-5 rounded-xl border border-rose-200 bg-rose-50/50 p-4">
                  <h3 className="text-xs font-black uppercase tracking-wide text-rose-800">Checks requiring attention</h3>
                  <div className="mt-3 space-y-2">
                    {data.conflicts.map((conflict, index) => (
                      <div key={`${conflict.type}-${index}`} className="rounded-lg border border-rose-200 bg-white p-3 text-xs">
                        <p className="font-bold text-rose-900">{conflict.type.replaceAll("_", " ")} · {conflict.severity}</p>
                        <p className="mt-1 text-rose-800">{conflict.description}</p>
                      </div>
                    ))}
                  </div>
                </section>
              ) : null}
              <section className="mt-5 rounded-xl border border-[var(--border-default)] bg-[var(--surface-subtle)] p-4">
                <div className="flex flex-wrap items-end justify-between gap-3">
                  <div>
                    <h3 className="text-xs font-black uppercase tracking-wide text-[var(--text-primary)]">Announce published schedule</h3>
                    <p className="mt-1 text-xs text-[var(--text-secondary)]">Queues a durable, replay-safe campaign after publication.</p>
                  </div>
                  <button type="button" disabled={!data.publication_ready || !templateId || announcement.isPending} onClick={() => announcement.mutate({ template_id: templateId, target_type: targetType, recipient_filter: "all" })} className="rounded-lg bg-[var(--pri)] px-3 py-2 text-xs font-bold text-[var(--primary-contrast)] disabled:cursor-not-allowed disabled:opacity-40 cursor-pointer">
                    {announcement.isPending ? "Queueing…" : "Queue announcement"}
                  </button>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <select aria-label="Schedule announcement template" value={templateId} onChange={(event) => setTemplateId(event.target.value)} className="h-9 min-w-56 rounded-lg border border-[var(--border-default)] bg-[var(--card)] px-2 text-xs">
                    <option value="">Choose a message template…</option>
                    {templates.map((template) => <option key={template.id} value={template.id}>{template.name}</option>)}
                  </select>
                  <select aria-label="Schedule announcement audience" value={targetType} onChange={(event) => setTargetType(event.target.value as "participant" | "speaker")} className="h-9 rounded-lg border border-[var(--border-default)] bg-[var(--card)] px-2 text-xs">
                    <option value="participant">Participants</option>
                    <option value="speaker">Speakers</option>
                  </select>
                </div>
              </section>
              <div className="mt-5 overflow-x-auto">
                <table className="w-full min-w-[680px] text-left text-xs">
                  <thead className="border-b border-[var(--border-default)] text-[var(--text-tertiary)]">
                    <tr>
                      <th className="px-3 py-2">Time</th>
                      <th className="px-3 py-2">Session</th>
                      <th className="px-3 py-2">Room</th>
                      <th className="px-3 py-2">Track</th>
                      <th className="px-3 py-2">State</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.sessions.map((session) => (
                      <tr key={session.id} className="border-b border-[var(--border-subtle)]">
                        <td className="px-3 py-3 text-[var(--text-secondary)]">{new Date(session.starts_at).toLocaleString()}–{new Date(session.ends_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</td>
                        <td className="px-3 py-3">
                          <p className="font-bold text-[var(--text-primary)]">{session.title}</p>
                          <p className="mt-1 text-[10px] text-[var(--text-tertiary)]">{session.code} · {session.type}</p>
                        </td>
                        <td className="px-3 py-3 text-[var(--text-secondary)]">{session.room || "Unassigned"}</td>
                        <td className="px-3 py-3 text-[var(--text-secondary)]">{session.track || "—"}</td>
                        <td className="px-3 py-3 text-[var(--text-secondary)]">{session.published ? "Published" : session.status}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </Portal>
  );
}
