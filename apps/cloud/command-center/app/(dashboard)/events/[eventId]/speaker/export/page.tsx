"use client";

import { useState, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import { 
  FileText, Download, Printer, CalendarDays, MapPin, 
  Clock, ArrowLeft, Loader2
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useSessions, SessionSummary } from "@/hooks/useSessions";
import { useEvent } from "@/hooks/useEvents";
import { cn, formatDateInTZ, formatTimeRangeInTZ, getISODateInTZ, getFallbackTimezone } from "@/lib/utils";
import { apiClient } from "@/lib/api-client";
import Link from "next/link";

export default function AgendaExportPage() {
  const { eventId } = useParams();
  const eventIdStr = eventId as string;
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

    // Sort sessions in each date group by start_time
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

  // Handle word export streaming
  const handleWordExport = async () => {
    setIsExporting(true);
    try {
      const response = await apiClient.get<Blob>(`/events/${eventIdStr}/sessions/export`, {
        responseType: "blob",
      });
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
    } catch (error) {
      console.error("Export failed:", error);
      alert("Failed to export Word document. Please try again.");
    } finally {
      setIsExporting(false);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  const isLoading = sessionsLoading || eventLoading;

  return (
    <div className="space-y-8 animate-fade-in pb-16">
      {/* Screen Only Navigation/Header */}
      <header className="flex flex-col md:flex-row items-center justify-between gap-6 px-2 print:hidden">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <Link 
              href={`/events/${eventIdStr}/speaker/sessions`}
              className="text-[10px] font-black uppercase tracking-widest text-muted hover:text-[var(--pri)] flex items-center gap-1.5 transition-colors"
            >
              <ArrowLeft className="h-3 w-3" /> Back to Sessions
            </Link>
          </div>
          <h1 className="text-3xl font-black tracking-tighter text-[var(--text)] mb-2 text-glow-indigo">
            Agenda <span className="text-[var(--pri)]">Export Desk</span>
          </h1>
          <p className="text-[13px] font-bold text-muted uppercase tracking-[0.3em]">
            Export schedules as professional handouts or reports
          </p>
        </div>
      </header>

      {/* Action Cards (Screen Only) */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 print:hidden">
        {/* Card 1: Word Document Exporter */}
        <Card className="glass-3d p-8 rounded-[2rem] border-default flex flex-col justify-between hover-lift-3d relative overflow-hidden group">
          <div className="absolute top-0 right-0 h-32 w-32 bg-[var(--pri)]/5 blur-3xl opacity-0 group-hover:opacity-100 transition-opacity" />
          <div className="space-y-4">
            <div className="h-12 w-12 rounded-2xl bg-[var(--pri)]/15 border border-[var(--pri)]/30 flex items-center justify-center">
              <FileText className="h-6 w-6 text-[var(--pri)]" />
            </div>
            <div>
              <h3 className="text-lg font-black text-[var(--text)] tracking-tight">Microsoft Word Handout</h3>
              <p className="text-muted text-[11px] font-medium leading-relaxed mt-2">
                Download a clean, structured schedule format optimized for Microsoft Word (.docx). Uses table layouts, stylish headers, and details session info.
              </p>
            </div>
          </div>
          <div className="mt-8">
            <Button
              onClick={handleWordExport}
              disabled={isExporting || isLoading}
              className="w-full h-12 bg-[var(--pri)] hover:bg-[var(--sec)] text-[var(--text)] font-black uppercase tracking-widest text-[11px] rounded-full border-0 shadow-lg flex items-center justify-center gap-2 hover-lift-3d"
            >
              {isExporting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" /> Exporting...
                </>
              ) : (
                <>
                  <Download className="h-4 w-4" /> Download DOCX Schedule
                </>
              )}
            </Button>
          </div>
        </Card>

        {/* Card 2: Print/PDF Preview */}
        <Card className="glass-3d p-8 rounded-[2rem] border-default flex flex-col justify-between hover-lift-3d relative overflow-hidden group">
          <div className="absolute top-0 right-0 h-32 w-32 bg-teal-500/5 blur-3xl opacity-0 group-hover:opacity-100 transition-opacity" />
          <div className="space-y-4">
            <div className="h-12 w-12 rounded-2xl bg-teal-500/15 border border-teal-500/30 flex items-center justify-center">
              <Printer className="h-6 w-6 text-teal-400" />
            </div>
            <div>
              <h3 className="text-lg font-black text-[var(--text)] tracking-tight">Printable PDF Layout</h3>
              <p className="text-muted text-[11px] font-medium leading-relaxed mt-2">
                Print directly from your browser or save as a pixel-perfect PDF schedule. Formatted with high-contrast styles, page breaks, and clean alignment.
              </p>
            </div>
          </div>
          <div className="mt-8">
            <Button
              onClick={handlePrint}
              disabled={isLoading}
              className="w-full h-12 bg-teal-500 hover:bg-teal-600 text-[var(--text)] font-black uppercase tracking-widest text-[11px] rounded-full border-0 shadow-lg flex items-center justify-center gap-2 hover-lift-3d"
            >
              <Printer className="h-4 w-4" /> Open Print Options
            </Button>
          </div>
        </Card>
      </div>

      {/* On-Screen Live Print Preview Header (Screen Only) */}
      <div className="space-y-4 print:hidden">
        <h2 className="text-lg font-black uppercase tracking-widest text-muted">Live Print Preview</h2>
        <p className="text-xs text-muted">Below is a visual simulation of the printed document layout. Clicking "Open Print Options" will isolate and print this exact layout.</p>
      </div>

      {/* Preview Simulated Page (Normally styled, under print takes over body) */}
      <div className="rounded-[2.5rem] border-default bg-[var(--surf)]/40 p-4 md:p-8 print:p-0 print:border-0 print:bg-white print:rounded-none">
        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-20 text-center space-y-4">
            <Loader2 className="h-10 w-10 animate-spin text-[var(--pri)]" />
            <p className="text-[11px] font-black text-muted uppercase tracking-[0.2em]">Loading agenda details...</p>
          </div>
        ) : sortedDates.length === 0 ? (
          <div className="text-center py-16 text-muted">
            <p className="text-[11px] font-black uppercase tracking-[0.2em]">No sessions scheduled for this event yet.</p>
          </div>
        ) : (
          <div 
            id="printable-agenda" 
            className="bg-white text-black p-8 md:p-12 shadow-2xl rounded-2xl max-w-4xl mx-auto print:shadow-none print:rounded-none print:p-0 print:max-w-none"
          >
            {/* Header Section */}
            <div className="text-center border-b-2 border-slate-900 pb-6 mb-8">
              <h1 className="text-3xl font-extrabold uppercase tracking-tight text-slate-900">{event?.name}</h1>
              {event?.short_code && (
                <p className="text-xs font-mono font-bold tracking-widest text-slate-500 uppercase mt-1">
                  CONFERENCE SCHEDULE ({event.short_code})
                </p>
              )}
              <div className="flex flex-wrap justify-center gap-x-6 gap-y-1 text-xs font-semibold mt-3 text-slate-600">
                {event?.location && (
                  <span className="flex items-center gap-1">
                    <MapPin className="h-3 w-3" /> {event.location}
                  </span>
                )}
                {event?.start_date && (
                  <span className="flex items-center gap-1">
                    <CalendarDays className="h-3 w-3" />
                    {new Date(event.start_date).toLocaleDateString('en-IN', { month: 'long', day: 'numeric', year: 'numeric', timeZone: getFallbackTimezone() })}
                  </span>
                )}
                <span className="flex items-center gap-1">
                  <Clock className="h-3 w-3" /> Timezone: {eventTimezone}
                </span>
              </div>
            </div>

            {/* Program Days */}
            {sortedDates.map((dateStr, idx) => (
              <div 
                key={dateStr} 
                className={cn(
                  "mb-10 page-break", 
                  idx > 0 && "pt-6 border-t border-slate-200"
                )}
              >
                <div className="bg-slate-100 px-4 py-3 rounded-lg border-l-4 border-slate-900 mb-6 flex justify-between items-center print:rounded-none print:bg-slate-100">
                  <h2 className="text-lg font-black uppercase tracking-wider text-slate-900">
                    {formatDateInTZ(dateStr, eventTimezone)}
                  </h2>
                  <span className="text-[10px] font-mono font-bold uppercase text-slate-500">
                    Day {idx + 1}
                  </span>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b-2 border-slate-900 text-[10px] font-black uppercase tracking-widest text-slate-500">
                        <th className="pb-3 w-1/4">Time Slot</th>
                        <th className="pb-3 w-1/4">Location</th>
                        <th className="pb-3 w-1/2">Session &amp; Speakers</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {sessionsByDate[dateStr].map((session) => (
                        <tr key={session.id} className="align-top hover:bg-slate-50/50 print:hover:bg-transparent">
                          <td className="py-4 font-mono font-bold text-xs text-slate-900 pr-4">
                            {formatTimeRangeInTZ(session.start_time, session.end_time, session.event_timezone || eventTimezone)}
                          </td>
                          <td className="py-4 font-semibold text-xs text-slate-700 pr-4 flex items-start gap-1">
                            <MapPin className="h-3.5 w-3.5 text-slate-400 mt-0.5 print:hidden" />
                            <span>{session.room_name || "TBA"}</span>
                          </td>
                          <td className="py-4 pl-2">
                            <div className="font-extrabold text-sm text-slate-950 flex items-center gap-2 flex-wrap">
                              <span>{session.name}</span>
                              {session.session_code && (
                                <span className="inline-block bg-slate-200 text-slate-800 text-[9px] font-mono font-bold px-1.5 py-0.5 rounded">
                                  {session.session_code}
                                </span>
                              )}
                            </div>
                            
                            {session.description && (
                              <p className="text-xs text-slate-600 mt-1 leading-relaxed max-w-xl">
                                {session.description}
                              </p>
                            )}

                            {session.speakers && session.speakers.length > 0 && (
                              <div className="mt-2.5 flex flex-wrap items-center gap-1.5 text-xs">
                                <span className="font-bold text-slate-500 uppercase tracking-wider text-[10px]">
                                  Speakers:
                                </span>
                                <span className="font-semibold text-slate-800">
                                  {session.speakers
                                    .map((s: any) => s.full_name || `${s.first_name || ""} ${s.last_name || ""}`.trim())
                                    .join(", ")}
                                </span>
                              </div>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}

            {/* Footer Notice */}
            <div className="mt-12 pt-6 border-t border-slate-300 text-center text-[10px] text-slate-400 font-bold uppercase tracking-widest">
              Generated automatically on {new Date().toLocaleDateString('en-IN', { timeZone: getFallbackTimezone() })} via EventOS Speaker Workspace
            </div>
          </div>
        )}
      </div>

      {/* Global CSS for browser printing */}
      <style jsx global>{`
        @media print {
          /* Force page break behavior */
          .page-break {
            page-break-before: always !important;
            break-before: page !important;
          }
          
          /* Hide non-printable page layout components */
          aside,
          header,
          .print\\:hidden,
          footer,
          nav,
          .sticky {
            display: none !important;
          }

          /* Reset body and outer containers */
          body,
          html,
          main,
          div {
            background: transparent !important;
            box-shadow: none !important;
            border-color: transparent !important;
            margin: 0 !important;
            padding: 0 !important;
          }

          /* Maximize the print container to cover the full width */
          #printable-agenda {
            display: block !important;
            visibility: visible !important;
            width: 100% !important;
            max-width: 100% !important;
            margin: 0 !important;
            padding: 1.5in 1in !important;
            box-shadow: none !important;
            background: white !important;
            color: black !important;
          }

          #printable-agenda * {
            visibility: visible !important;
          }

          /* Ensure all background fills are printed */
          * {
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
        }
      `}</style>
    </div>
  );
}
