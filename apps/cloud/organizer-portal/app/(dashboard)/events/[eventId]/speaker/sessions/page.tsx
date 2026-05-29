"use client";

import { useState, useEffect, useMemo } from "react";
import { useParams } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  Calendar, Clock, MapPin, Users, Plus,
  Search, Filter, MoreHorizontal, Download,
  LayoutList, Trash2, CalendarDays, GanttChart, CheckCircle2,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { cn, formatDateInTZ, formatTimeRangeInTZ, getISODateInTZ } from "@/lib/utils";
import { useFloatingToolbarStore } from "@/store/useFloatingToolbarStore";
import { apiClient } from "@/lib/api-client";

import { useSessions, SessionSummary, useDeleteSession } from "@/hooks/useSessions";
import { useRooms } from "@/hooks/useRooms";
import { useSpeakers } from "@/hooks/useSpeakers";
import { useEvent } from "@/hooks/useEvents";
import { SessionDetailDialog } from "@/components/sessions/SessionDetailDialog";
import { CreateSessionDialog } from "@/components/sessions/CreateSessionDialog";
import { CalendarView } from "@/components/sessions/CalendarView";
import { TimelineView } from "@/components/sessions/TimelineView";
import { Portal } from "@/components/ui/portal";

type ViewMode = "list" | "calendar" | "timeline";

export default function SessionsPage() {
  const { eventId } = useParams();
  const eventIdStr = eventId as string;
  const [searchQuery, setSearchQuery] = useState("");
  const [roomFilter, setRoomFilter] = useState("");
  const [dateFilter, setDateFilter] = useState("");
  const [viewMode, setViewMode] = useState<ViewMode>("list");

  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);

  const setToolbarActions = useFloatingToolbarStore((state) => state.setActions);

  const { data: sessions, isLoading } = useSessions(eventIdStr);
  const deleteSession = useDeleteSession(eventIdStr);
  const { data: rooms } = useRooms(eventIdStr);
  const { data: speakers } = useSpeakers(eventIdStr);
  const { data: event } = useEvent(eventIdStr);
  const eventTimezone = event?.timezone || "UTC";

  const handleExportDocx = async () => {
    try {
      const response = await apiClient.get<Blob>(`/events/${eventIdStr}/sessions/export`, { responseType: "blob" });
      const blob = new Blob([response], { type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", `${eventIdStr}_agenda.docx`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch {
      alert("Export failed. Please try again.");
    }
  };

  useEffect(() => {
    setToolbarActions([
      { label: "Add Session", icon: Plus, onClick: () => setCreateOpen(true), color: "bg-[var(--pri)]/10" },
      { label: "Export DOCX", icon: Download, onClick: handleExportDocx },
    ]);
  }, [setToolbarActions, eventIdStr]);

  const uniqueDates = useMemo(() => {
    if (!sessions) return [];
    const dates = new Set<string>();
    sessions.forEach(s => {
      if (s.start_time) {
        const d = getISODateInTZ(s.start_time, eventTimezone);
        if (d) dates.add(d);
      }
    });
    return Array.from(dates).sort();
  }, [sessions, eventTimezone]);

  const filteredSessions = useMemo(() => {
    if (!sessions) return [];
    return sessions
      .filter(s => {
        const matchesSearch =
          s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          s.session_code.toLowerCase().includes(searchQuery.toLowerCase());
        const matchesRoom = !roomFilter || s.room_id === roomFilter;
        const matchesDate =
          !dateFilter ||
          getISODateInTZ(s.start_time, eventTimezone) === dateFilter;
        return matchesSearch && matchesRoom && matchesDate;
      })
      .sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime());
  }, [sessions, searchQuery, roomFilter, dateFilter, eventTimezone]);

  const stats = useMemo(() => {
    const totalSessions = sessions?.length || 0;
    const readySessions =
      sessions?.filter(s => (s.readiness_pct || 0) >= 100).length || 0;
    const uniqueSpeakerCount = speakers
      ? new Set(
          speakers.map(
            s =>
              `${s.first_name.trim().toLowerCase()} ${s.last_name.trim().toLowerCase()} | ${s.email.trim().toLowerCase()}`
          )
        ).size
      : 0;
    return [
      { label: "Total Sessions", val: totalSessions, icon: Calendar, color: "text-[var(--pri)]" },
      { label: "Ready", val: readySessions, icon: CheckCircle2, color: "text-[var(--success)]" },
      { label: "Speakers", val: uniqueSpeakerCount, icon: Users, color: "text-[var(--sec)]" },
      { label: "Total Days", val: uniqueDates.length, icon: Clock, color: "text-[var(--warn)]" },
    ];
  }, [sessions, uniqueDates, speakers]);

  const VIEW_TABS: { mode: ViewMode; icon: any; label: string }[] = [
    { mode: "list", icon: LayoutList, label: "List" },
    { mode: "calendar", icon: CalendarDays, label: "Calendar" },
    { mode: "timeline", icon: GanttChart, label: "Timeline" },
  ];

  return (
    <div className={cn(
      "flex flex-col animate-fade-in",
      viewMode === "list" ? "h-[calc(100vh-140px)] gap-6 overflow-hidden" : "gap-10 pb-20"
    )}>
      {/* Header */}
      <header className="flex-shrink-0 flex flex-col md:flex-row items-center justify-between gap-6 px-2">
        <div>
          <h1 className="text-3xl font-black tracking-tighter text-[var(--text)] mb-2 text-glow-indigo">
            Session <span className="text-[var(--pri)]">Manager</span>
          </h1>
          <p className="text-[13px] font-bold text-muted uppercase tracking-[0.3em]">
            Orchestrate the event timeline
          </p>
        </div>
        <div className="flex items-center gap-4">
          {/* View Toggle */}
          <div className="flex bg-[color-mix(in_srgb,var(--text)_5%,transparent)] rounded-full p-1 border border-default">
            {VIEW_TABS.map(({ mode, icon: Icon, label }) => (
              <button
                key={mode}
                onClick={() => setViewMode(mode)}
                className={cn(
                  "flex items-center gap-2 px-4 py-2 rounded-full text-[10px] font-black uppercase tracking-widest transition-all",
                  viewMode === mode
                    ? "bg-[var(--pri)] text-[var(--text)] shadow-lg"
                    : "text-muted hover:text-[var(--text)]"
                )}
              >
                <Icon className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">{label}</span>
              </button>
            ))}
          </div>

          <Button
            onClick={() => setCreateOpen(true)}
            className="h-12 px-8 bg-[var(--pri)] hover:bg-[var(--sec)] text-[var(--text)] font-black uppercase tracking-widest text-[11px] rounded-full shadow-[0_15px_30px_color-mix(in_srgb,var(--pri)_30%,transparent)] border-0 hover-lift-3d"
          >
            <Plus className="mr-2 h-4 w-4" /> New Session
          </Button>
        </div>
      </header>

      {/* Metrics Bar */}
      <section className="flex-shrink-0 grid grid-cols-4 gap-6">
        {stats.map(s => (
          <div
            key={s.label}
            className="glass-3d p-6 rounded-[2rem] border-default flex items-center gap-6 group hover-lift-3d"
          >
            <div className="h-12 w-12 rounded-2xl bg-[color-mix(in_srgb,var(--text)_5%,transparent)] border border-default flex items-center justify-center group-hover:bg-[var(--pri)]/10 transition-all">
              <s.icon className={cn("h-6 w-6", s.color)} />
            </div>
            <div>
              <p className="text-[10px] font-black text-muted uppercase tracking-[0.2em] mb-1">{s.label}</p>
              <p className="text-2xl font-black text-[var(--text)] tracking-tighter">{s.val}</p>
            </div>
          </div>
        ))}
      </section>

      {/* Search + Filter — only shown in list view */}
      {viewMode === "list" && (
        <section className="flex-shrink-0 flex items-center gap-4 px-2">
          <div className="flex-1 max-w-md relative group">
            <div className="absolute inset-0 bg-[var(--pri)]/5 blur-xl opacity-0 group-focus-within:opacity-100 transition-opacity" />
            <div className="relative neomorphic-inset rounded-2xl p-0.5 border border-default focus-within:border-[var(--pri)]/50 transition-all">
              <Search className="absolute left-5 top-3.5 h-4 w-4 text-muted group-focus-within:text-[var(--pri)]" />
              <Input
                placeholder="Search sessions..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="h-11 bg-transparent border-0 pl-14 text-[13px] font-bold text-[var(--text)] placeholder:text-muted focus-visible:ring-0"
              />
            </div>
          </div>

          <div className="flex items-center gap-3 glass-3d p-1.5 rounded-2xl border-default">
            <div className="flex items-center gap-2 px-3 border-r border-default">
              <Filter className="h-4 w-4 text-[var(--pri)]" />
              <span className="text-[10px] font-black text-muted uppercase tracking-widest">Filters</span>
            </div>
            <div className="flex items-center gap-4 px-3">
              <div className="flex items-center gap-2">
                <MapPin className="h-3 w-3 text-muted" />
                <select
                  value={roomFilter}
                  onChange={e => setRoomFilter(e.target.value)}
                  className="bg-transparent text-[11px] font-black uppercase tracking-widest text-[var(--text)] outline-none cursor-pointer hover:text-[var(--pri)] transition-colors"
                >
                  <option value="" className="bg-[var(--base)]">All Rooms</option>
                  {rooms?.filter((r: any) => r.id).map((r: any, idx: number) => (
                    <option key={r.id || idx} value={r.id} className="bg-[var(--base)]">{r.name}</option>
                  ))}
                </select>
              </div>
              <div className="h-4 w-px bg-default" />
              <div className="flex items-center gap-2">
                <Calendar className="h-3 w-3 text-muted" />
                <select
                  value={dateFilter}
                  onChange={e => setDateFilter(e.target.value)}
                  className="bg-transparent text-[11px] font-black uppercase tracking-widest text-[var(--text)] outline-none cursor-pointer hover:text-[var(--pri)] transition-colors"
                >
                  <option value="" className="bg-[var(--base)]">All Dates</option>
                  {uniqueDates.filter(d => d).map((d, idx) => (
                    <option key={d || idx} value={d} className="bg-[var(--base)]">
                      {formatDateInTZ(d, eventTimezone)}
                    </option>
                  ))}
                </select>
              </div>
              {(roomFilter || dateFilter) && (
                <>
                  <div className="h-4 w-px bg-default" />
                  <button
                    onClick={() => { setRoomFilter(""); setDateFilter(""); }}
                    className="text-[10px] font-black text-[var(--dan)] uppercase tracking-widest hover:scale-105 transition-transform"
                  >
                    Reset
                  </button>
                </>
              )}
            </div>
          </div>
        </section>
      )}

      {/* Main Content Area */}
      <AnimatePresence mode="wait">
        <motion.div
          key={viewMode}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -12 }}
          transition={{ duration: 0.25 }}
          className={cn("flex-1", viewMode === "list" && "min-h-0 overflow-hidden")}
        >
          {/* ── LIST ── */}
          {viewMode === "list" && (
            <div className="h-full overflow-y-auto pr-2 no-scrollbar">
              <div className="grid gap-6 pb-6">
                {isLoading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <div key={i} className="h-24 bg-[color-mix(in_srgb,var(--text)_5%,transparent)] border-default rounded-3xl animate-pulse" />
                  ))
                ) : filteredSessions.length > 0 ? (
                  filteredSessions.map((session, idx) => (
                    <motion.div
                      key={`session-${session.id || idx}`}
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      onClick={() => setSelectedSessionId(session.id)}
                      className="glass-3d group flex items-center justify-between p-6 rounded-3xl border-default hover:border-[var(--pri)] transition-all cursor-pointer hover-lift-3d"
                    >
                      <div className="flex items-center gap-6">
                        <div className="h-14 w-14 rounded-2xl bg-[color-mix(in_srgb,var(--pri)_10%,transparent)] flex items-center justify-center text-[var(--pri)] font-black text-xs">
                          {session.session_code}
                        </div>
                        <div>
                          <h3 className="text-lg font-black tracking-tight text-[var(--text)] group-hover:text-[var(--pri)] transition-colors">
                            {session.name}
                          </h3>
                          <div className="flex items-center gap-4 mt-1">
                            <div className="flex items-center gap-1.5 text-[10px] font-bold text-muted uppercase tracking-widest">
                              <Calendar className="h-3 w-3" /> {formatDateInTZ(session.start_time, eventTimezone)}
                            </div>
                            <div className="flex items-center gap-1.5 text-[10px] font-bold text-muted uppercase tracking-widest">
                              <MapPin className="h-3 w-3" /> {session.room_name || "Unassigned"}
                            </div>
                            <div className="flex items-center gap-1.5 text-[10px] font-bold text-muted uppercase tracking-widest">
                              <Clock className="h-3 w-3" />{" "}
                              {formatTimeRangeInTZ(session.start_time, session.end_time, session.event_timezone || eventTimezone)}
                            </div>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-8">
                        <div className="flex flex-col items-end gap-1">
                          <p className="text-[10px] font-black text-muted uppercase tracking-widest">Speakers</p>
                          <div className="flex -space-x-3 items-center">
                            {session.speakers && session.speakers.length > 0 ? (
                              <>
                                {session.speakers.slice(0, 3).map((s: any, i: number) => {
                                  const name = s.full_name || `${s.first_name || ""} ${s.last_name || ""}`.trim() || "Speaker";
                                  const initial = name.charAt(0).toUpperCase();
                                  return (
                                    <div
                                      key={s.id || i}
                                      className="h-9 w-9 rounded-full bg-[color-mix(in_srgb,var(--pri)_15%,transparent)] border-2 border-[var(--base)] flex items-center justify-center text-[12px] font-black text-[var(--pri)] shadow-sm hover:scale-110 hover:z-10 transition-all cursor-help"
                                      title={name}
                                    >
                                      {initial}
                                    </div>
                                  );
                                })}
                                {session.speakers.length > 3 && (
                                  <div className="h-9 w-9 rounded-full bg-muted border-2 border-[var(--base)] flex items-center justify-center text-[10px] font-black text-muted-foreground shadow-sm">
                                    +{session.speakers.length - 3}
                                  </div>
                                )}
                              </>
                            ) : (
                              <span className="text-[11px] font-bold text-muted">No Speakers</span>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <Badge className={cn(
                            "px-3 py-1 rounded-lg text-[9px] font-black tracking-widest border-0",
                            (session.readiness_pct || 0) >= 100
                              ? "bg-[var(--success)]/20 text-[var(--success)]"
                              : "bg-[var(--warn)]/20 text-[var(--warn)]"
                          )}>
                            {(session.readiness_pct || 0) >= 100 ? "READY" : "PENDING"}
                          </Badge>
                          <Badge className="px-3 py-1 rounded-lg text-[9px] font-black tracking-widest border-0 bg-[var(--pri)]/10 text-[var(--pri)]">
                            {session.speaker_count || 0} PPTS
                          </Badge>
                          <div className="flex items-center gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="rounded-full h-10 w-10 hover:bg-red-500/10 hover:text-red-500 transition-all"
                              onClick={e => {
                                e.stopPropagation();
                                if (window.confirm(`Delete "${session.name}"?`)) {
                                  deleteSession.mutate(session.id);
                                }
                              }}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="icon" className="rounded-full h-10 w-10">
                              <MoreHorizontal className="h-5 w-5" />
                            </Button>
                          </div>
                        </div>
                      </div>
                    </motion.div>
                  ))
                ) : (
                  <Card className="glass-3d border-default rounded-[2.5rem] overflow-hidden p-20 text-center">
                    <p className="text-[11px] font-black text-muted uppercase tracking-[0.3em]">
                      No sessions found matching your criteria
                    </p>
                    <Button
                      variant="outline"
                      className="mt-8 rounded-full border-default"
                      onClick={() => { setSearchQuery(""); setRoomFilter(""); setDateFilter(""); }}
                    >
                      Reset Filters
                    </Button>
                  </Card>
                )}
              </div>
            </div>
          )}

          {/* ── CALENDAR ── */}
          {viewMode === "calendar" && sessions && (
            <div className="h-full glass-3d rounded-[2.5rem] border-default p-6 overflow-hidden flex flex-col">
              <CalendarView
                sessions={sessions}
                timezone={eventTimezone}
                onSelectSession={setSelectedSessionId}
              />
            </div>
          )}

          {/* ── TIMELINE ── */}
          {viewMode === "timeline" && sessions && (
            <div className="h-full">
              <TimelineView
                sessions={sessions}
                timezone={eventTimezone}
                onSelectSession={setSelectedSessionId}
              />
            </div>
          )}
        </motion.div>
      </AnimatePresence>

      {/* Modals */}
      <Portal>
        <SessionDetailDialog
          isOpen={!!selectedSessionId}
          onClose={() => setSelectedSessionId(null)}
          sessionId={selectedSessionId || ""}
          eventId={eventIdStr}
        />
        <CreateSessionDialog
          isOpen={createOpen}
          onClose={() => setCreateOpen(false)}
          eventId={eventIdStr}
        />
      </Portal>
    </div>
  );
}
