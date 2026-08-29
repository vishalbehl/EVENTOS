"use client";

import { useState, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  FileText,
  Download,
  Printer,
  CalendarDays,
  MapPin,
  Clock,
  ArrowLeft,
  Loader2,
  Sparkles,
} from "lucide-react";
import { useSessions, SessionSummary } from "@/hooks/useSessions";
import { useEvent } from "@/hooks/useEvents";
import {
  cn,
  formatDateInTZ,
  formatTimeRangeInTZ,
  getISODateInTZ,
  getFallbackTimezone,
} from "@/lib/utils";
import { apiClient } from "@/lib/api-client";
import Link from "next/link";
import { toast } from "sonner";

export default function AgendaExportPage() {
  const params = useParams();
  const eventIdStr = (params?.eventId as string) || "";
  const [isExporting, setIsExporting] = useState(false);

  // Fetch data
  const { data: sessions, isLoading: sessionsLoading } = useSessions(eventIdStr);
  const { data: event, isLoading: eventLoading } = useEvent(eventIdStr);
  const eventTimezone = event?.timezone || "UTC";

  // Group sessions by date
  const sessionsByDate = useMemo(() => {
    if (!sessions) return {};
    const grouped: Record<string, SessionSummary[]> = {};
    sessions.forEach((session) => {
      if (session.start_time) {
        const d = getISODateInTZ(session.start_time, eventTimezone);
        if (d) {
          if (!grouped[d]) grouped[d] = [];
          grouped[d].push(session);
        }
      }
    });

    Object.keys(grouped).forEach((dateStr) => {
      grouped[dateStr].sort(
        (a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime()
      );
    });

    return grouped;
  }, [sessions, eventTimezone]);

  const sortedDates = useMemo(() => {
    return Object.keys(sessionsByDate).sort();
  }, [sessionsByDate]);

  const handleWordExport = async () => {
    setIsExporting(true);
    try {
      const response = await apiClient.post<Blob>(
        `/events/${eventIdStr}/sessions/export`,
        undefined,
        {
          responseType: "blob",
          headers: { "Idempotency-Key": crypto.randomUUID() },
        }
      );
      const blob = new Blob([response], {
        type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", `${event?.short_code || "event"}_agenda.docx`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      toast.success("DOCX schedule downloaded successfully.");
    } catch {
      toast.error("Failed to export Word document.");
    } finally {
      setIsExporting(false);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  const isLoading = sessionsLoading || eventLoading;

  return (
    <div className="w-full space-y-6 p-6">
      {/* ── Top Header ── */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between print:hidden">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Link
              href={`/events/${eventIdStr}/speakers/dashboard`}
              className="text-[11px] font-bold text-[var(--pri)] hover:underline flex items-center gap-1"
            >
              <ArrowLeft className="size-3" /> Back to Dashboard
            </Link>
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-[var(--text-primary)]">
            Agenda & Handout Export Desk
          </h1>
          <p className="text-xs text-[var(--text-secondary)] mt-0.5">
            Export formatted schedules as Microsoft Word (.docx) handouts or print-ready PDF reports.
          </p>
        </div>
      </div>

      {/* ── Action Export Cards ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 print:hidden">
        {/* Card 1: Word Document Exporter */}
        <div className="rounded-lg border border-[var(--border-default)] bg-[var(--card)] p-5 shadow-sm flex flex-col justify-between space-y-4">
          <div className="space-y-2">
            <div className="flex size-10 items-center justify-center rounded-lg bg-[var(--pri)]/10 text-[var(--pri)] border border-[var(--pri)]/20">
              <FileText className="size-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-[var(--text-primary)]">
                Microsoft Word Handout (.docx)
              </h3>
              <p className="text-xs text-[var(--text-secondary)] leading-relaxed mt-1">
                Structured schedule format with table layouts, speaker abstracts, and session timing metadata.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={handleWordExport}
            disabled={isExporting || isLoading}
            className="flex h-9 w-full items-center justify-center gap-2 rounded-lg bg-[var(--pri)] px-4 text-xs font-bold text-[var(--primary-contrast)] shadow-sm hover:opacity-90 disabled:opacity-40 transition-all cursor-pointer"
          >
            {isExporting ? (
              <>
                <Loader2 className="size-4 animate-spin" /> Generating DOCX...
              </>
            ) : (
              <>
                <Download className="size-4" /> Download DOCX Schedule
              </>
            )}
          </button>
        </div>

        {/* Card 2: Print/PDF Layout */}
        <div className="rounded-lg border border-[var(--border-default)] bg-[var(--card)] p-5 shadow-sm flex flex-col justify-between space-y-4">
          <div className="space-y-2">
            <div className="flex size-10 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-600 border border-emerald-500/20">
              <Printer className="size-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-[var(--text-primary)]">
                Printable High-Contrast PDF
              </h3>
              <p className="text-xs text-[var(--text-secondary)] leading-relaxed mt-1">
                Print directly or save as a pixel-perfect PDF schedule formatted with clean headers and page breaks.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={handlePrint}
            disabled={isLoading}
            className="flex h-9 w-full items-center justify-center gap-2 rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface-2)] px-4 text-xs font-bold text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)] transition-colors shadow-sm cursor-pointer"
          >
            <Printer className="size-4" /> Open Print Options
          </button>
        </div>
      </div>

      {/* ── Live Print Preview Section ── */}
      <div className="space-y-3 print:hidden">
        <div className="flex items-center gap-2">
          <Sparkles className="size-4 text-[var(--pri)]" />
          <h2 className="text-xs font-bold uppercase tracking-wider text-[var(--text-primary)]">
            Live Print Simulation
          </h2>
        </div>
        <p className="text-xs text-[var(--text-secondary)]">
          Below is a preview of the clean print document. Click &ldquo;Open Print Options&rdquo; above to isolate and print this exact layout.
        </p>
      </div>

      {/* Simulated Document Container */}
      <div className="rounded-lg border border-[var(--border-default)] bg-[var(--card)] p-6 shadow-sm print:p-0 print:border-0 print:bg-white print:shadow-none">
        {isLoading ? (
          <div className="py-16 text-center text-xs text-[var(--text-secondary)]">
            <Loader2 className="size-6 text-[var(--pri)] animate-spin mx-auto mb-2" />
            Compiling schedule preview...
          </div>
        ) : sortedDates.length === 0 ? (
          <div className="py-16 text-center text-xs text-[var(--text-secondary)]">
            No scheduled sessions found for this event.
          </div>
        ) : (
          <div
            id="printable-agenda"
            className="max-w-4xl mx-auto space-y-6 text-slate-900 bg-white p-6 rounded-lg border border-slate-200 print:border-0 print:p-0 print:max-w-none"
          >
            {/* Header */}
            <div className="text-center border-b-2 border-slate-900 pb-4">
              <h2 className="text-2xl font-bold uppercase tracking-tight text-slate-900">
                {event?.name}
              </h2>
              {event?.short_code && (
                <p className="text-xs font-mono font-bold tracking-widest text-slate-500 uppercase mt-0.5">
                  CONFERENCE SCHEDULE ({event.short_code})
                </p>
              )}
              <div className="flex flex-wrap justify-center gap-x-4 gap-y-1 text-xs font-medium mt-2 text-slate-600">
                {event?.location && (
                  <span className="flex items-center gap-1">
                    <MapPin className="size-3" /> {event.location}
                  </span>
                )}
                {event?.start_date && (
                  <span className="flex items-center gap-1">
                    <CalendarDays className="size-3" />
                    {new Date(event.start_date).toLocaleDateString("en-IN", {
                      month: "long",
                      day: "numeric",
                      year: "numeric",
                      timeZone: getFallbackTimezone(),
                    })}
                  </span>
                )}
                <span className="flex items-center gap-1">
                  <Clock className="size-3" /> Timezone: {eventTimezone}
                </span>
              </div>
            </div>

            {/* Days Loop */}
            {sortedDates.map((dateStr, idx) => (
              <div key={dateStr} className={cn("space-y-3", idx > 0 && "pt-4 border-t border-slate-200")}>
                <div className="bg-slate-100 px-3 py-2 rounded border-l-4 border-slate-900 flex justify-between items-center">
                  <h3 className="text-sm font-bold uppercase tracking-wider text-slate-900">
                    {formatDateInTZ(dateStr, eventTimezone)}
                  </h3>
                  <span className="text-[10px] font-mono font-bold uppercase text-slate-500">
                    Day {idx + 1}
                  </span>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="border-b border-slate-300 text-[10px] font-bold uppercase text-slate-500">
                        <th className="pb-2 w-1/4">Time</th>
                        <th className="pb-2 w-1/4">Location</th>
                        <th className="pb-2 w-1/2">Session & Faculty</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {sessionsByDate[dateStr].map((session) => (
                        <tr key={session.id} className="align-top">
                          <td className="py-2.5 font-mono font-semibold text-slate-900 pr-2">
                            {formatTimeRangeInTZ(
                              session.start_time,
                              session.end_time,
                              session.event_timezone || eventTimezone
                            )}
                          </td>
                          <td className="py-2.5 text-slate-700 pr-2">
                            <span className="font-semibold">{session.room_name || "Unassigned"}</span>
                          </td>
                          <td className="py-2.5">
                            <p className="font-bold text-slate-900">
                              [{session.session_code}] {session.name}
                            </p>
                            {session.speakers && session.speakers.length > 0 && (
                              <p className="text-[11px] text-slate-600 mt-0.5">
                                {session.speakers.map((s) => s.full_name).join(", ")}
                              </p>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
