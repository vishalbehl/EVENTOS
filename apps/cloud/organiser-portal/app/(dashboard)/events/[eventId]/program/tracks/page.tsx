"use client";

import { useState, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  Calendar,
  Layers,
  Plus,
  Clock,
  MapPin,
  Users,
  Search,
  SlidersHorizontal,
  ChevronRight,
  MoreVertical,
  Trash2,
  Edit,
  ExternalLink,
  Sparkles,
  LayoutGrid,
  Table as TableIcon,
  Mic,
  Tag,
  CheckCircle2,
  AlertCircle,
  Building2,
  UserCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useEvent } from "@/hooks/useEvents";
import { useSessions, useDeleteSession, SessionSummary } from "@/hooks/useSessions";
import { useTracks } from "@/hooks/useSpeakers";
import { useRooms } from "@/hooks/useRooms";
import { CreateSessionDialog } from "@/components/organizer/sessions/CreateSessionDialog";
import { formatTimeInTZ, formatDateInTZ, getFallbackTimezone } from "@/lib/utils";

export default function ProgramTracksPage() {
  const params = useParams();
  const router = useRouter();
  const eventId = params?.eventId as string;

  const { data: event } = useEvent(eventId);
  const { data: sessions = [], isLoading: sessionsLoading } = useSessions(eventId);
  const { data: tracks = [], isLoading: tracksLoading } = useTracks(eventId);
  const { data: rooms = [], isLoading: roomsLoading } = useRooms(eventId);
  const deleteSessionMutation = useDeleteSession(eventId);

  const [searchQuery, setSearchQuery] = useState("");
  const [selectedTrack, setSelectedTrack] = useState<string>("ALL");
  const [selectedRoom, setSelectedRoom] = useState<string>("ALL");
  const [viewMode, setViewMode] = useState<"grid" | "table">("grid");
  const [isCreateOpen, setIsCreateOpen] = useState(false);

  const eventTZ = event?.timezone || getFallbackTimezone();

  // Metrics calculation
  const totalSessions = sessions.length;
  const uniqueTracksCount = tracks.length > 0 ? tracks.length : new Set(sessions.map(s => (s as any).track_id || (s as any).track_name).filter(Boolean)).size || 1;
  const totalSpeakers = useMemo(() => {
    const speakerIds = new Set<string>();
    sessions.forEach(s => {
      s.speakers?.forEach(sp => {
        if (sp.id || sp.session_speaker_id) speakerIds.add(sp.id || sp.session_speaker_id);
      });
    });
    return speakerIds.size;
  }, [sessions]);

  const totalDurationMinutes = useMemo(() => {
    return sessions.reduce((acc, s) => {
      if (!s.start_time || !s.end_time) return acc;
      const start = new Date(s.start_time).getTime();
      const end = new Date(s.end_time).getTime();
      const mins = Math.max(0, Math.round((end - start) / (1000 * 60)));
      return acc + (isNaN(mins) ? 0 : mins);
    }, 0);
  }, [sessions]);

  const totalHours = (totalDurationMinutes / 60).toFixed(1);

  // Filtered sessions
  const filteredSessions = useMemo(() => {
    return sessions.filter(session => {
      const q = searchQuery.toLowerCase().trim();
      const matchSearch =
        !q ||
        session.name?.toLowerCase().includes(q) ||
        session.session_code?.toLowerCase().includes(q) ||
        session.description?.toLowerCase().includes(q) ||
        session.moderator_name?.toLowerCase().includes(q) ||
        session.speakers?.some(sp => sp.full_name?.toLowerCase().includes(q) || sp.presentation_title?.toLowerCase().includes(q));

      const matchTrack =
        selectedTrack === "ALL" ||
        (session as any).track_id === selectedTrack ||
        (session as any).track_name === selectedTrack;

      const matchRoom =
        selectedRoom === "ALL" ||
        session.room_id === selectedRoom ||
        session.room_name === selectedRoom;

      return matchSearch && matchTrack && matchRoom;
    });
  }, [sessions, searchQuery, selectedTrack, selectedRoom]);

  // Track map for color badges
  const trackMap = useMemo(() => {
    const map: Record<string, { name: string; color: string }> = {};
    tracks.forEach((t, idx) => {
      const defaultColors = ["#6366F1", "#EC4899", "#10B981", "#F59E0B", "#8B5CF6", "#06B6D4", "#3B82F6"];
      map[t.id] = {
        name: t.name,
        color: t.display_color || defaultColors[idx % defaultColors.length],
      };
      map[t.name] = {
        name: t.name,
        color: t.display_color || defaultColors[idx % defaultColors.length],
      };
    });
    return map;
  }, [tracks]);

  const handleDeleteSession = async (sessionId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirm("Are you sure you want to delete this session? This action cannot be undone.")) {
      await deleteSessionMutation.mutateAsync(sessionId);
    }
  };

  const handleCardClick = (sessionId: string) => {
    router.push(`/events/${eventId}/program/tracks/${sessionId}`);
  };

  const getStatusBadge = (status: string) => {
    const s = (status || "scheduled").toLowerCase();
    if (s === "in_progress" || s === "live") {
      return <Badge className="bg-rose-500/15 text-rose-400 border border-rose-500/30 text-[10px] font-bold">● LIVE</Badge>;
    }
    if (s === "completed") {
      return <Badge className="bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 text-[10px] font-bold">COMPLETED</Badge>;
    }
    if (s === "draft") {
      return <Badge className="bg-amber-500/15 text-amber-400 border border-amber-500/30 text-[10px] font-bold">DRAFT</Badge>;
    }
    return <Badge className="bg-indigo-500/15 text-indigo-300 border border-indigo-500/30 text-[10px] font-bold">SCHEDULED</Badge>;
  };

  return (
    <div className="space-y-6 p-6 min-h-screen">
      {/* Header */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between border-b border-[var(--border)]/20 pb-5">
        <div>
          <div className="flex items-center gap-2 text-xs font-bold text-[var(--pri)] uppercase tracking-wider mb-1">
            <Layers className="w-3.5 h-3.5" />
            <span>Program & Agenda Operations</span>
          </div>
          <h1 className="text-2xl font-black tracking-tight text-[var(--text)]">
            Conference Tracks & Sessions
          </h1>
          <p className="text-xs text-[var(--text-secondary)] mt-1">
            Browse all session schedules, tracks, speaker talks, and committee faculty assignments.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Button
            onClick={() => setIsCreateOpen(true)}
            className="h-9 px-4 text-xs font-bold bg-[var(--pri)] hover:bg-[var(--pri)]/90 text-white shadow-lg shadow-[var(--pri)]/20 rounded-xl cursor-pointer transition-all"
          >
            <Plus className="mr-1.5 h-4 w-4" />
            Create Session
          </Button>
        </div>
      </div>

      {/* KPI Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="border-[var(--border)]/30 bg-[var(--card)] shadow-sm rounded-2xl">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-[11px] font-bold text-[var(--text-secondary)] uppercase tracking-wider">Total Sessions</p>
              <p className="text-2xl font-black text-[var(--text)] mt-1">{sessionsLoading ? "..." : totalSessions}</p>
              <p className="text-[10px] text-indigo-400 mt-0.5 font-medium">{filteredSessions.length} visible in filter</p>
            </div>
            <div className="w-11 h-11 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400">
              <Layers className="w-5 h-5" />
            </div>
          </CardContent>
        </Card>

        <Card className="border-[var(--border)]/30 bg-[var(--card)] shadow-sm rounded-2xl">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-[11px] font-bold text-[var(--text-secondary)] uppercase tracking-wider">Conference Tracks</p>
              <p className="text-2xl font-black text-[var(--text)] mt-1">{tracksLoading ? "..." : uniqueTracksCount}</p>
              <p className="text-[10px] text-purple-400 mt-0.5 font-medium">Thematic parallel streams</p>
            </div>
            <div className="w-11 h-11 rounded-xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-purple-400">
              <Tag className="w-5 h-5" />
            </div>
          </CardContent>
        </Card>

        <Card className="border-[var(--border)]/30 bg-[var(--card)] shadow-sm rounded-2xl">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-[11px] font-bold text-[var(--text-secondary)] uppercase tracking-wider">Assigned Faculty & Speakers</p>
              <p className="text-2xl font-black text-[var(--text)] mt-1">{sessionsLoading ? "..." : totalSpeakers}</p>
              <p className="text-[10px] text-emerald-400 mt-0.5 font-medium">Linked to scheduled talks</p>
            </div>
            <div className="w-11 h-11 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
              <Mic className="w-5 h-5" />
            </div>
          </CardContent>
        </Card>

        <Card className="border-[var(--border)]/30 bg-[var(--card)] shadow-sm rounded-2xl">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-[11px] font-bold text-[var(--text-secondary)] uppercase tracking-wider">Total Scheduled Hours</p>
              <p className="text-2xl font-black text-[var(--text)] mt-1">{sessionsLoading ? "..." : `${totalHours} hrs`}</p>
              <p className="text-[10px] text-amber-400 mt-0.5 font-medium">{rooms.length} active stages / rooms</p>
            </div>
            <div className="w-11 h-11 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
              <Clock className="w-5 h-5" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filter & Search Toolbar */}
      <div className="flex flex-col md:flex-row items-center justify-between gap-3 p-3.5 rounded-2xl bg-[var(--card)] border border-[var(--border)]/30">
        <div className="flex flex-1 items-center gap-2 w-full md:w-auto">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-secondary)]" />
            <Input
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search sessions, codes, topics, or faculty..."
              className="pl-9 h-9 text-xs rounded-xl bg-[var(--bg-surface-2)] border-[var(--border)]/30 focus-visible:ring-[var(--pri)]"
            />
          </div>

          {/* Track Filter */}
          {tracks.length > 0 && (
            <select
              value={selectedTrack}
              onChange={e => setSelectedTrack(e.target.value)}
              aria-label="Filter by Track"
              className="h-9 px-3 text-xs rounded-xl bg-[var(--bg-surface-2)] border border-[var(--border)]/30 text-[var(--text)] font-medium cursor-pointer"
            >
              <option value="ALL">All Tracks</option>
              {tracks.map(t => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          )}

          {/* Room Filter */}
          {rooms.length > 0 && (
            <select
              value={selectedRoom}
              onChange={e => setSelectedRoom(e.target.value)}
              aria-label="Filter by Room"
              className="h-9 px-3 text-xs rounded-xl bg-[var(--bg-surface-2)] border border-[var(--border)]/30 text-[var(--text)] font-medium cursor-pointer"
            >
              <option value="ALL">All Rooms</option>
              {rooms.map(r => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
          )}
        </div>

        {/* View Switcher */}
        <div className="flex items-center gap-1.5 p-1 rounded-xl bg-[var(--bg-surface-2)] border border-[var(--border)]/30">
          <button
            type="button"
            onClick={() => setViewMode("grid")}
            className={`p-1.5 rounded-lg text-xs transition-all cursor-pointer ${
              viewMode === "grid"
                ? "bg-[var(--pri)] text-white shadow-sm"
                : "text-[var(--text-secondary)] hover:text-[var(--text)]"
            }`}
            title="Card Grid View"
          >
            <LayoutGrid className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => setViewMode("table")}
            className={`p-1.5 rounded-lg text-xs transition-all cursor-pointer ${
              viewMode === "table"
                ? "bg-[var(--pri)] text-white shadow-sm"
                : "text-[var(--text-secondary)] hover:text-[var(--text)]"
            }`}
            title="Table View"
          >
            <TableIcon className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Session Cards Grid View */}
      {viewMode === "grid" && (
        <>
          {sessionsLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {[1, 2, 3, 4, 5, 6].map(i => (
                <div key={i} className="h-56 rounded-2xl bg-[var(--card)] border border-[var(--border)]/20 animate-pulse" />
              ))}
            </div>
          ) : filteredSessions.length === 0 ? (
            <div className="text-center py-16 px-4 rounded-3xl border border-dashed border-[var(--border)]/40 bg-[var(--card)]/50">
              <div className="w-14 h-14 rounded-2xl bg-[var(--pri)]/10 border border-[var(--pri)]/20 flex items-center justify-center mx-auto mb-3 text-[var(--pri)]">
                <Layers className="w-7 h-7" />
              </div>
              <h3 className="text-base font-bold text-[var(--text)]">No sessions found</h3>
              <p className="text-xs text-[var(--text-secondary)] max-w-sm mx-auto mt-1 mb-5">
                {searchQuery || selectedTrack !== "ALL" || selectedRoom !== "ALL"
                  ? "No sessions match your search filters. Try clearing your filters."
                  : "Start creating conference sessions and assigning speakers to your agenda."}
              </p>
              <Button
                onClick={() => setIsCreateOpen(true)}
                className="h-9 px-4 text-xs font-bold bg-[var(--pri)] text-white rounded-xl cursor-pointer"
              >
                <Plus className="mr-1.5 h-4 w-4" />
                Create New Session
              </Button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredSessions.map(session => {
                const trackInfo = trackMap[(session as any).track_id] || trackMap[(session as any).track_name];
                const trackName = trackInfo?.name || (session as any).track_name || "General Track";
                const trackColor = trackInfo?.color || "#6366F1";

                const startFormatted = session.start_time
                  ? formatTimeInTZ(session.start_time, eventTZ)
                  : "--:--";
                const endFormatted = session.end_time
                  ? formatTimeInTZ(session.end_time, eventTZ)
                  : "--:--";
                const dateFormatted = session.start_time
                  ? formatDateInTZ(session.start_time, eventTZ)
                  : "Unscheduled";

                const durationMins =
                  session.start_time && session.end_time
                    ? Math.max(0, Math.round((new Date(session.end_time).getTime() - new Date(session.start_time).getTime()) / 60000))
                    : null;

                const speakersList = session.speakers || [];

                return (
                  <div
                    key={session.id}
                    onClick={() => handleCardClick(session.id)}
                    className="group relative flex flex-col justify-between p-5 rounded-2xl bg-[var(--card)] border border-[var(--border)]/30 hover:border-[var(--pri)]/60 hover:shadow-xl hover:shadow-[var(--pri)]/5 transition-all cursor-pointer overflow-hidden"
                  >
                    {/* Top Accent Strip */}
                    <div
                      className="absolute top-0 left-0 right-0 h-1 transition-all group-hover:h-1.5"
                      style={{ backgroundColor: trackColor }}
                    />

                    <div>
                      {/* Top Badges & Context Menu */}
                      <div className="flex items-center justify-between gap-2 mb-3">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <Badge
                            className="text-[10px] font-black tracking-wider uppercase px-2 py-0.5 rounded-md"
                            style={{
                              backgroundColor: `${trackColor}15`,
                              color: trackColor,
                              borderColor: `${trackColor}30`,
                            }}
                          >
                            {session.session_code || "SES"}
                          </Badge>
                          <Badge
                            variant="outline"
                            className="text-[10px] font-semibold text-[var(--text-secondary)] border-[var(--border)]/30"
                          >
                            {trackName}
                          </Badge>
                          {getStatusBadge(session.status)}
                        </div>

                        <DropdownMenu>
                          <DropdownMenuTrigger asChild onClick={e => e.stopPropagation()}>
                            <button
                              type="button"
                              className="w-7 h-7 rounded-lg flex items-center justify-center text-[var(--text-secondary)] hover:text-[var(--text)] hover:bg-[var(--bg-surface-2)] transition-colors cursor-pointer"
                            >
                              <MoreVertical className="w-3.5 h-3.5" />
                            </button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-44 text-xs font-medium rounded-xl">
                            <DropdownMenuItem
                              onClick={e => {
                                e.stopPropagation();
                                handleCardClick(session.id);
                              }}
                              className="cursor-pointer gap-2"
                            >
                              <Edit className="w-3.5 h-3.5 text-indigo-400" />
                              <span>Edit & Assign People</span>
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={e => handleDeleteSession(session.id, e)}
                              className="cursor-pointer gap-2 text-rose-400 focus:text-rose-400 focus:bg-rose-500/10"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                              <span>Delete Session</span>
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>

                      {/* Title & Description */}
                      <h3 className="text-base font-bold text-[var(--text)] group-hover:text-[var(--pri)] transition-colors line-clamp-2 leading-snug">
                        {session.name}
                      </h3>

                      {session.description && (
                        <p className="text-xs text-[var(--text-secondary)] mt-1 line-clamp-2 leading-relaxed">
                          {session.description}
                        </p>
                      )}

                      {/* Location & Time Pills */}
                      <div className="flex flex-wrap items-center gap-2 mt-3.5 text-xs text-[var(--text-secondary)] font-medium">
                        <div className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[var(--bg-surface-2)] border border-[var(--border)]/20">
                          <Calendar className="w-3.5 h-3.5 text-indigo-400" />
                          <span>{dateFormatted}</span>
                        </div>

                        <div className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[var(--bg-surface-2)] border border-[var(--border)]/20">
                          <Clock className="w-3.5 h-3.5 text-emerald-400" />
                          <span>
                            {startFormatted} – {endFormatted}
                          </span>
                          {durationMins && (
                            <span className="text-[10px] text-[var(--muted)] ml-0.5">({durationMins}m)</span>
                          )}
                        </div>

                        {session.room_name && (
                          <div className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[var(--bg-surface-2)] border border-[var(--border)]/20">
                            <MapPin className="w-3.5 h-3.5 text-amber-400" />
                            <span>{session.room_name}</span>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Footer: Speakers & People info */}
                    <div className="mt-4 pt-3.5 border-t border-[var(--border)]/20 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        {speakersList.length > 0 ? (
                          <div className="flex items-center gap-1.5">
                            <div className="flex -space-x-2 overflow-hidden">
                              {speakersList.slice(0, 3).map((sp, idx) => (
                                <div
                                  key={sp.id || idx}
                                  className="inline-block h-6 w-6 rounded-full ring-2 ring-[var(--card)] bg-indigo-500/20 border border-indigo-500/40 flex items-center justify-center text-[9px] font-black text-indigo-300"
                                  title={sp.full_name}
                                >
                                  {sp.full_name?.charAt(0) || "S"}
                                </div>
                              ))}
                            </div>
                            <span className="text-[11px] font-semibold text-[var(--text-secondary)]">
                              {speakersList.length} {speakersList.length === 1 ? "Talk" : "Talks"}
                            </span>
                          </div>
                        ) : (
                          <span className="text-[11px] font-medium text-[var(--muted)] flex items-center gap-1">
                            <Mic className="w-3 h-3" />
                            No talks assigned
                          </span>
                        )}

                        {session.moderator_name && (
                          <div className="flex items-center gap-1 text-[11px] font-medium text-amber-300/80 bg-amber-500/10 px-2 py-0.5 rounded-md border border-amber-500/20">
                            <UserCheck className="w-3 h-3 text-amber-400" />
                            <span className="truncate max-w-[110px]">{session.moderator_name}</span>
                          </div>
                        )}
                      </div>

                      <div className="flex items-center gap-1 text-xs font-bold text-[var(--pri)] group-hover:translate-x-0.5 transition-transform">
                        <span>Edit</span>
                        <ChevronRight className="w-3.5 h-3.5" />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* Table View */}
      {viewMode === "table" && (
        <Card className="border-[var(--border)]/30 bg-[var(--card)] rounded-2xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-[var(--bg-surface-2)] text-[var(--text-secondary)] uppercase tracking-wider font-bold border-b border-[var(--border)]/20">
                <tr>
                  <th className="py-3 px-4">Code</th>
                  <th className="py-3 px-4">Session Title</th>
                  <th className="py-3 px-4">Track</th>
                  <th className="py-3 px-4">Room</th>
                  <th className="py-3 px-4">Date & Time</th>
                  <th className="py-3 px-4">Speakers / Talks</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)]/10 font-medium">
                {filteredSessions.map(session => {
                  const trackInfo = trackMap[(session as any).track_id] || trackMap[(session as any).track_name];
                  const trackName = trackInfo?.name || (session as any).track_name || "General Track";
                  const startFormatted = session.start_time ? formatTimeInTZ(session.start_time, eventTZ) : "--:--";
                  const endFormatted = session.end_time ? formatTimeInTZ(session.end_time, eventTZ) : "--:--";
                  const dateFormatted = session.start_time ? formatDateInTZ(session.start_time, eventTZ) : "Unscheduled";

                  return (
                    <tr
                      key={session.id}
                      onClick={() => handleCardClick(session.id)}
                      className="hover:bg-[var(--bg-surface-2)]/60 cursor-pointer transition-colors"
                    >
                      <td className="py-3 px-4 font-mono font-bold text-[var(--pri)]">
                        {session.session_code || "SES"}
                      </td>
                      <td className="py-3 px-4">
                        <p className="font-bold text-[var(--text)]">{session.name}</p>
                        {session.moderator_name && (
                          <p className="text-[10px] text-amber-400">Mod: {session.moderator_name}</p>
                        )}
                      </td>
                      <td className="py-3 px-4 text-[var(--text-secondary)]">{trackName}</td>
                      <td className="py-3 px-4 text-[var(--text-secondary)]">{session.room_name || "Unassigned"}</td>
                      <td className="py-3 px-4 text-[var(--text-secondary)]">
                        <span>{dateFormatted}</span>
                        <span className="block text-[10px] text-[var(--muted)]">
                          {startFormatted} - {endFormatted}
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        <Badge variant="outline" className="text-[10px] font-semibold">
                          {session.speakers?.length || 0} Talks
                        </Badge>
                      </td>
                      <td className="py-3 px-4">{getStatusBadge(session.status)}</td>
                      <td className="py-3 px-4 text-right" onClick={e => e.stopPropagation()}>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleCardClick(session.id)}
                          className="h-7 px-2 text-xs font-bold text-[var(--pri)] hover:bg-[var(--pri)]/10"
                        >
                          Open Editor
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Create Session Dialog */}
      <CreateSessionDialog
        isOpen={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        eventId={eventId}
      />
    </div>
  );
}
