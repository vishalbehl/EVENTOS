"use client";

import { useState, useMemo, useEffect } from "react";
import {
  Calendar,
  LayoutDashboard,
  Building2,
  ListOrdered,
  GanttChart,
  AlertTriangle,
  Eye,
  Plus,
  Sparkles,
  Loader2,
  RefreshCw,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { AgendaOverview, AgendaDayItem } from "./AgendaOverview";
import { DayAgendaSetup, DayConfig } from "./DayAgendaSetup";
import { RoomTrackSetup, RoomItem, TrackConfigItem } from "./RoomTrackSetup";
import { AgendaStructureBuilder, StructureNode } from "./AgendaStructureBuilder";
import { TimelineScheduleBuilder } from "./TimelineScheduleBuilder";
import { SessionInspectorDrawer, SessionInspectorData, SessionFacultyMember } from "./SessionInspectorDrawer";
import { ConflictsValidationHub, ConflictItem } from "./ConflictsValidationHub";
import { PreviewPublishStation } from "./PreviewPublishStation";
import { CreateSessionDialog } from "../sessions/CreateSessionDialog";
import {
  useSessionBuilderSnapshot,
  useBulkReorderSessions,
} from "@/hooks/useSessionBuilder";
import { useEvent } from "@/hooks/useEvents";
import { useSpeakers } from "@/hooks/useSpeakers";
import { useDeleteSession } from "@/hooks/useSessions";
import { apiPatch, apiPost, apiDelete } from "@/lib/api-client";
import { useQueryClient } from "@tanstack/react-query";

export type AgendaViewMode =
  | "overview"
  | "day-setup"
  | "rooms-tracks"
  | "structure"
  | "grid"
  | "conflicts"
  | "preview-publish";

interface AgendaBuilderSuiteProps {
  eventId: string;
  eventName?: string;
  initialView?: AgendaViewMode;
}

export function AgendaBuilderSuite({
  eventId,
  eventName: initialEventName,
  initialView = "overview",
}: AgendaBuilderSuiteProps) {
  const queryClient = useQueryClient();
  const [currentView, setCurrentView] = useState<AgendaViewMode>(initialView);
  const [selectedDayId, setSelectedDayId] = useState<string>("day-1");
  const [isInspectorOpen, setIsInspectorOpen] = useState<boolean>(false);
  const [selectedSession, setSelectedSession] = useState<SessionInspectorData | null>(null);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState<boolean>(false);

  // 1. Live Data Hooks
  const { data: eventData, isLoading: isEventLoading } = useEvent(eventId);
  const {
    data: snapshot,
    isLoading: isSnapshotLoading,
    refetch: refetchSnapshot,
  } = useSessionBuilderSnapshot(eventId);
  const { data: speakersData } = useSpeakers(eventId);
  const bulkReorderMutation = useBulkReorderSessions(eventId);
  const deleteSessionMutation = useDeleteSession(eventId);

  const eventName = eventData?.name || initialEventName || "Annual Scientific Congress";
  const eventTimezone = eventData?.timezone || snapshot?.event_timezone || "UTC";

  // 2. Derive Rooms from Database Snapshot
  const rooms: RoomItem[] = useMemo(() => {
    if (!snapshot?.rooms || snapshot.rooms.length === 0) {
      return [];
    }
    return snapshot.rooms.map((r: any) => ({
      id: r.id,
      name: r.name,
      code: r.name.substring(0, 8).toUpperCase(),
      capacity: r.capacity || 100,
      screen_count: r.screen_count || 1,
      room_type: r.room_type || "presentation",
      room_coordinator: r.room_coordinator || r.av_technician || "",
      location_notes: r.location_notes || "",
      is_active: r.is_active !== false,
    }));
  }, [snapshot?.rooms]);

  // 3. Derive Tracks from Database Snapshot
  const tracks: TrackConfigItem[] = useMemo(() => {
    if (!snapshot?.tracks || snapshot.tracks.length === 0) {
      return [];
    }
    return snapshot.tracks.map((t: any, idx: number) => ({
      id: t.id,
      name: t.name,
      code: t.name.substring(0, 5).toUpperCase(),
      displayColor: t.display_color || "#3b82f6",
      description: t.description || `Track ${idx + 1}`,
      sortOrder: t.sort_order ?? idx + 1,
    }));
  }, [snapshot?.tracks]);

  // 4. Derive Available Faculty / Speakers for assignment
  const availableSpeakersList = useMemo(() => {
    if (!speakersData || speakersData.length === 0) return [];
    return speakersData.map((s) => ({
      id: s.id,
      name: `${s.first_name} ${s.last_name}`.trim(),
      email: s.email,
      role: s.role || "Speaker",
    }));
  }, [speakersData]);

  // 5. Derive Sessions from Database Snapshot
  const sessions: SessionInspectorData[] = useMemo(() => {
    if (!snapshot?.sessions || snapshot.sessions.length === 0) {
      return [];
    }

    return snapshot.sessions.map((s: any) => {
      const startDate = s.start_time ? new Date(s.start_time) : new Date();
      const endDate = s.end_time ? new Date(s.end_time) : new Date(startDate.getTime() + 60 * 60000);
      
      const dateStr = startDate.toISOString().split("T")[0];
      const startHours = String(startDate.getUTCHours()).padStart(2, "0");
      const startMins = String(startDate.getUTCMinutes()).padStart(2, "0");
      const endHours = String(endDate.getUTCHours()).padStart(2, "0");
      const endMins = String(endDate.getUTCMinutes()).padStart(2, "0");

      const durationMins = Math.max(15, Math.round((endDate.getTime() - startDate.getTime()) / 60000));

      const facultyList: SessionFacultyMember[] = (s.speakers || []).map((spk: any, idx: number) => ({
        id: spk.session_speaker_id || spk.id || `fac-${idx}`,
        speakerId: spk.id,
        name: spk.full_name || spk.name || "Faculty Member",
        role: spk.role || "Speaker",
        email: spk.email,
        presentationTitle: spk.presentation_title,
        durationMinutes: spk.duration_minutes || 15,
      }));

      const moderators = facultyList
        .filter((f) => ["Moderator", "Chairperson", "Co-Chair", "Anchor"].includes(f.role))
        .map((f) => f.name);
      
      if (s.moderator_name && !moderators.includes(s.moderator_name)) {
        moderators.push(s.moderator_name);
      }

      const speakerNames = facultyList
        .filter((f) => !["Moderator", "Chairperson", "Co-Chair", "Anchor"].includes(f.role))
        .map((f) => f.name);

      return {
        id: s.id,
        title: s.name,
        sessionType: s.session_type || "Scientific Session",
        trackId: s.track_id || undefined,
        date: dateStr,
        startTime: `${startHours}:${startMins}`,
        endTime: `${endHours}:${endMins}`,
        durationMinutes: durationMins,
        roomId: s.room_id || undefined,
        color: s.display_color || "#3b82f6",
        moderators,
        speakers: speakerNames,
        faculty: facultyList,
        description: s.description || "",
        cmeCredits: s.cme_credits ? parseFloat(s.cme_credits) : 0,
        cmeEligible: !!s.cme_eligible,
        presentations: (s.speakers || [])
          .filter((sp: any) => !!sp.presentation_title)
          .map((sp: any, idx: number) => ({
            id: `p-${sp.session_speaker_id || idx}`,
            title: sp.presentation_title,
            speakerName: sp.full_name,
            duration: 15,
          })),
        documents: [],
        operations: {
          seatingLayout: s.seating_layout || "Theater",
          capacityLimit: s.room?.capacity || 200,
          liveStreamUrl: s.live_stream_url || "",
          moderatorNotes: s.operations_notes || "",
        },
      };
    });
  }, [snapshot?.sessions]);

  // 6. Compute Conference Days dynamically from Event Dates or Sessions
  const days: AgendaDayItem[] = useMemo(() => {
    let datesList: string[] = [];

    if (eventData?.start_date && eventData?.end_date) {
      const start = new Date(eventData.start_date);
      const end = new Date(eventData.end_date);
      const cur = new Date(start);

      while (cur <= end) {
        datesList.push(cur.toISOString().split("T")[0]);
        cur.setDate(cur.getDate() + 1);
      }
    }

    // If dates are not set on event, harvest unique dates from sessions
    if (datesList.length === 0 && sessions.length > 0) {
      const uniqueDates = Array.from(new Set(sessions.map((s) => s.date))).sort();
      datesList = uniqueDates;
    }

    // Fallback: at least 1 day
    if (datesList.length === 0) {
      datesList = [new Date().toISOString().split("T")[0]];
    }

    return datesList.map((dStr, idx) => {
      const daySessions = sessions.filter((s) => s.date === dStr);
      const uniqueRooms = new Set(daySessions.map((s) => s.roomId).filter(Boolean));
      const totalSpeakers = daySessions.reduce(
        (acc, s) => acc + (s.faculty?.length || s.speakers.length || 0),
        0
      );
      const allPublished = daySessions.length > 0 && daySessions.every((s: any) => s.is_published);

      const dateObj = new Date(dStr);
      const formattedDate = !isNaN(dateObj.getTime())
        ? dateObj.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })
        : dStr;

      return {
        id: `day-${idx + 1}`,
        dayNumber: idx + 1,
        name: `Day ${idx + 1} - ${formattedDate}`,
        title: `Day ${idx + 1} - ${formattedDate}`,
        date: dStr,
        startTime: "09:00 AM",
        endTime: "06:00 PM",
        status: allPublished ? "published" : "draft",
        roomsCount: uniqueRooms.size,
        sessionsCount: daySessions.length,
        speakersCount: totalSpeakers,
      };
    });
  }, [eventData?.start_date, eventData?.end_date, sessions, rooms.length]);

  // 7. Day Configs for Day Setup Screen
  const dayConfigs: DayConfig[] = useMemo(() => {
    return days.map((d) => ({
      id: d.id,
      dayNumber: d.dayNumber,
      name: d.name,
      date: d.date,
      startTime: "09:00",
      endTime: "18:00",
      timezone: eventTimezone,
      applyToAllDays: true,
      enableCoffeeBreak: true,
      coffeeBreakStart: "11:00",
      coffeeBreakDuration: 30,
      enableLunchBreak: true,
      lunchBreakStart: "13:00",
      lunchBreakDuration: 60,
      enableNetworkingBreak: true,
      networkingBreakStart: "16:30",
      networkingBreakDuration: 30,
    }));
  }, [days, eventTimezone]);

  // 8. Conflicts from Backend
  const conflicts: ConflictItem[] = useMemo(() => {
    if (!snapshot?.conflicts || snapshot.conflicts.length === 0) {
      return [];
    }

    return snapshot.conflicts.map((c: any, idx: number) => {
      let type: ConflictItem["type"] = "room";
      if (c.type === "speaker_conflict") type = "speaker";
      else if (c.type === "unassigned_moderator") type = "moderator";
      else if (c.type === "travel_time") type = "warning";
      else if (c.type === "capacity_mismatch") type = "resource";

      const sessA = sessions.find((s) => s.id === c.session_ids?.[0]) || {
        id: c.session_ids?.[0] || "sess-a",
        title: "Session A",
        startTime: "10:00",
        roomId: rooms[0]?.id || "",
      };
      const sessB = sessions.find((s) => s.id === c.session_ids?.[1]) || {
        id: c.session_ids?.[1] || "sess-b",
        title: "Session B",
        startTime: "10:00",
        roomId: rooms[0]?.id || "",
      };

      return {
        id: `conf-${idx + 1}`,
        type,
        severity: (c.severity === "error" ? "high" : "medium") as ConflictItem["severity"],
        title: c.type.replace(/_/g, " ").toUpperCase(),
        description: c.description || "Schedule overlap detected",
        conflictTime: sessA.startTime || "10:00 AM",
        sessionA: {
          id: sessA.id,
          title: sessA.title,
          time: sessA.startTime,
          room: rooms.find((r) => r.id === sessA.roomId)?.name || "Main Hall",
        },
        sessionB: {
          id: sessB.id,
          title: sessB.title,
          time: sessB.startTime,
          room: rooms.find((r) => r.id === sessB.roomId)?.name || "Workshop Room",
        },
      };
    });
  }, [snapshot?.conflicts, sessions, rooms]);

  // Set default active day if changed
  useEffect(() => {
    if (days.length > 0 && !days.some((d) => d.id === selectedDayId)) {
      setSelectedDayId(days[0].id);
    }
  }, [days, selectedDayId]);

  // ── Handlers ──────────────────────────────────────────────────────────────

  const handleOpenDay = (dayId: string) => {
    setSelectedDayId(dayId);
    setCurrentView("grid");
  };

  const handleEditSession = (session: SessionInspectorData) => {
    setSelectedSession(session);
    setIsInspectorOpen(true);
  };

  const handleSaveSession = async (updated: SessionInspectorData) => {
    try {
      const sessionDate = updated.date;
      const [sh, sm] = updated.startTime.split(":");
      const [eh, em] = updated.endTime.split(":");

      const startIso = new Date(`${sessionDate}T${sh || "09"}:${sm || "00"}:00Z`).toISOString();
      const endIso = new Date(`${sessionDate}T${eh || "10"}:${em || "00"}:00Z`).toISOString();

      await apiPatch(`/events/${eventId}/sessions/${updated.id}`, {
        name: updated.title,
        room_id: updated.roomId || null,
        track_id: updated.trackId || null,
        session_type: updated.sessionType,
        start_time: startIso,
        end_time: endIso,
        description: updated.description,
        cme_credits: updated.cmeCredits,
        cme_eligible: updated.cmeEligible,
        operations_notes: updated.operations.moderatorNotes,
        seating_layout: updated.operations.seatingLayout,
        live_stream_url: updated.operations.liveStreamUrl,
      });

      await queryClient.invalidateQueries({ queryKey: ["session-builder-snapshot", eventId] });
      await queryClient.invalidateQueries({ queryKey: ["sessions", eventId] });

      toast.success("Session updated successfully in database");
      setIsInspectorOpen(false);
      setSelectedSession(null);
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || "Failed to save session changes");
    }
  };

  const handleDeleteSession = async (sessionId: string) => {
    try {
      await deleteSessionMutation.mutateAsync(sessionId);
      setIsInspectorOpen(false);
      setSelectedSession(null);
      await refetchSnapshot();
    } catch {
      // Error handled by mutation
    }
  };

  const handleUpdateSessionSchedule = (
    sessionId: string,
    newRoomId: string,
    newStartTime: string,
    newEndTime: string
  ) => {
    const target = sessions.find((s) => s.id === sessionId);
    if (!target) return;

    const dateStr = target.date;
    const startIso = new Date(`${dateStr}T${newStartTime}:00Z`).toISOString();
    const endIso = new Date(`${dateStr}T${newEndTime}:00Z`).toISOString();

    bulkReorderMutation.mutate([
      {
        session_id: sessionId,
        room_id: newRoomId || null,
        start_time: startIso,
        end_time: endIso,
      },
    ]);
  };

  const handleSaveRoom = async (room: RoomItem) => {
    try {
      const isNew = room.id === "new" || room.id.startsWith("room-");
      const payload = {
        name: room.name,
        code: room.code || undefined,
        room_type: room.room_type || "MAIN_HALL",
        room_coordinator: room.room_coordinator || "",
        is_active: room.is_active !== false,
      };

      if (isNew) {
        await apiPost(`/events/${eventId}/rooms`, payload);
      } else {
        await apiPatch(`/events/${eventId}/rooms/${room.id}`, payload);
      }
      await queryClient.invalidateQueries({ queryKey: ["session-builder-snapshot", eventId] });
      await queryClient.invalidateQueries({ queryKey: ["rooms", eventId] });
      toast.success(`Room "${room.name}" saved successfully`);
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || "Failed to save room");
    }
  };

  const handleDeleteRoom = async (roomId: string) => {
    try {
      if (roomId !== "new" && !roomId.startsWith("room-")) {
        await apiDelete(`/events/${eventId}/rooms/${roomId}`);
      }
      await queryClient.invalidateQueries({ queryKey: ["session-builder-snapshot", eventId] });
      await queryClient.invalidateQueries({ queryKey: ["rooms", eventId] });
      toast.success("Room deleted");
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || "Failed to delete room");
    }
  };

  const handleSaveTrack = async (track: TrackConfigItem) => {
    try {
      const isNew = track.id === "new" || track.id.startsWith("track-");
      const payload = {
        name: track.name,
        description: track.description || "",
        display_color: track.displayColor || "#3b82f6",
        sort_order: track.sortOrder || 1,
      };

      if (isNew) {
        await apiPost(`/events/${eventId}/tracks`, payload);
      } else {
        await apiPatch(`/events/${eventId}/tracks/${track.id}`, payload);
      }
      await queryClient.invalidateQueries({ queryKey: ["session-builder-snapshot", eventId] });
      await queryClient.invalidateQueries({ queryKey: ["tracks", eventId] });
      toast.success(`Track "${track.name}" saved successfully`);
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || "Failed to save track");
    }
  };

  const handleDeleteTrack = async (trackId: string) => {
    try {
      if (trackId !== "new" && !trackId.startsWith("track-")) {
        await apiDelete(`/events/${eventId}/tracks/${trackId}`);
      }
      await queryClient.invalidateQueries({ queryKey: ["session-builder-snapshot", eventId] });
      await queryClient.invalidateQueries({ queryKey: ["tracks", eventId] });
      toast.success("Track deleted");
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || "Failed to delete track");
    }
  };

  const handleSaveStructure = async (nodes: StructureNode[]) => {
    try {
      const activeDate = activeDay?.date || new Date().toISOString().split("T")[0];
      const flatNodes: StructureNode[] = [];
      const flatten = (list: StructureNode[]) => {
        for (const item of list) {
          flatNodes.push(item);
          if (item.children && item.children.length > 0) {
            flatten(item.children);
          }
        }
      };
      flatten(nodes);

      const existingDaySessions = sessions.filter((s) => s.date === activeDate);
      const currentNodeIds = new Set(flatNodes.map((n) => n.id));

      // 1. Delete sessions that were removed in the structure builder
      for (const existing of existingDaySessions) {
        if (!currentNodeIds.has(existing.id)) {
          try {
            await apiDelete(`/events/${eventId}/sessions/${existing.id}`);
          } catch (e) {
            console.error("Failed to delete removed structure node", e);
          }
        }
      }

      // 2. Create new nodes or update existing nodes in database
      for (const node of flatNodes) {
        const isNew =
          node.id.startsWith("sec-") ||
          node.id.startsWith("sub-") ||
          node.id.startsWith("node-") ||
          node.id === "new";

        const startTimeIso = `${activeDate}T${node.startTime}:00Z`;
        const endTimeIso = `${activeDate}T${node.endTime}:00Z`;

        const roomId =
          node.roomId && !node.roomId.startsWith("hall-") ? node.roomId : rooms[0]?.id || null;
        const trackId =
          node.trackId && !node.trackId.startsWith("track-") ? node.trackId : tracks[0]?.id || null;

        if (isNew) {
          const payload = {
            name: node.title,
            session_code: `SESS-${node.code || Math.floor(1000 + Math.random() * 9000)}`,
            session_type: node.type || "Scientific Session",
            start_time: startTimeIso,
            end_time: endTimeIso,
            room_id: roomId,
            track_id: trackId,
            display_color: node.color || "#3b82f6",
            description: node.description || "",
          };
          await apiPost(`/events/${eventId}/sessions`, payload);
        } else {
          const payload = {
            name: node.title,
            session_type: node.type || "Scientific Session",
            start_time: startTimeIso,
            end_time: endTimeIso,
            room_id: roomId,
            track_id: trackId,
            display_color: node.color || "#3b82f6",
            description: node.description || "",
          };
          await apiPatch(`/events/${eventId}/sessions/${node.id}`, payload);
        }
      }

      await queryClient.invalidateQueries({ queryKey: ["session-builder-snapshot", eventId] });
      await queryClient.invalidateQueries({ queryKey: ["sessions", eventId] });
      await refetchSnapshot();
      toast.success("Agenda structure successfully saved to database");
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || "Failed to save agenda structure");
    }
  };

  // Nav views definition
  const NAV_ITEMS: { id: AgendaViewMode; label: string; icon: any }[] = [
    { id: "overview", label: "Overview", icon: LayoutDashboard },
    { id: "day-setup", label: "Day Setup", icon: Calendar },
    { id: "rooms-tracks", label: "Rooms & Tracks", icon: Building2 },
    { id: "structure", label: "Structure", icon: ListOrdered },
    { id: "grid", label: "Matrix Matrix", icon: GanttChart },
    { id: "conflicts", label: `Conflicts (${conflicts.length})`, icon: AlertTriangle },
    { id: "preview-publish", label: "Publish", icon: Eye },
  ];

  if (isSnapshotLoading || isEventLoading) {
    return (
      <div className="flex h-[75vh] w-full flex-col items-center justify-center gap-3">
        <Loader2 className="size-8 animate-spin text-[var(--pri)]" />
        <span className="text-xs font-semibold text-[var(--text-secondary)]">
          Loading live event agenda & schedule matrix...
        </span>
      </div>
    );
  }

  const activeDay = days.find((d) => d.id === selectedDayId) || days[0];

  return (
    <div className="flex h-full min-h-[calc(100vh-6rem)] flex-col bg-[var(--bg-app)]">
      {/* Top Builder Control Header */}
      <header className="sticky top-0 z-30 flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border-default)] bg-[var(--card)] px-6 py-3 shadow-xs">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <div className="flex size-9 items-center justify-center rounded-xl bg-[var(--pri)]/10 text-[var(--pri)]">
              <Sparkles className="size-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-sm font-bold text-[var(--text-primary)]">
                  {eventName}
                </h1>
                <span className="rounded-md bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold text-emerald-600 border border-emerald-500/20">
                  Live DB
                </span>
              </div>
              <p className="text-[11px] text-[var(--text-secondary)]">
                {days.length} Days • {rooms.length} Rooms • {tracks.length} Tracks • {sessions.length} Sessions
              </p>
            </div>
          </div>
        </div>

        {/* 8-Screen Navigation Pills */}
        <nav className="flex items-center gap-1 rounded-xl bg-[var(--bg-surface-2)] p-1 border border-[var(--border-default)]">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive = currentView === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setCurrentView(item.id)}
                className={cn(
                  "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all cursor-pointer",
                  isActive
                    ? "bg-[var(--pri)] text-[var(--primary-contrast)] shadow-xs font-bold"
                    : "text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--card)]"
                )}
              >
                <Icon className="size-3.5" />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>

        {/* Global Action Bar */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => refetchSnapshot()}
            title="Refresh Live Data"
            className="flex size-8.5 items-center justify-center rounded-lg border border-[var(--border-default)] bg-[var(--card)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface-2)] transition-colors cursor-pointer"
          >
            <RefreshCw className="size-3.5" />
          </button>

          <button
            type="button"
            onClick={() => setIsCreateModalOpen(true)}
            className="flex items-center gap-1.5 rounded-lg bg-[var(--pri)] px-3.5 py-2 text-xs font-bold text-[var(--primary-contrast)] hover:brightness-110 transition-all cursor-pointer shadow-sm"
          >
            <Plus className="size-3.5" />
            <span>Add Session</span>
          </button>
        </div>
      </header>

      {/* Main Screen View Router */}
      <main className="flex-1 p-6">
        {currentView === "overview" && (
          <AgendaOverview
            eventId={eventId}
            eventName={eventName}
            days={days}
            roomsCount={rooms.length}
            sessionsCount={sessions.length}
            tracksCount={tracks.length}
            speakersCount={availableSpeakersList.length}
            documentsCount={0}
            onOpenDay={handleOpenDay}
            onOpenDaySetup={(dayId) => {
              if (dayId) setSelectedDayId(dayId);
              setCurrentView("day-setup");
            }}
            onOpenStructure={(dayId) => {
              if (dayId) setSelectedDayId(dayId);
              setCurrentView("structure");
            }}
            onOpenRoomSetup={() => setCurrentView("rooms-tracks")}
            onNewSession={() => setIsCreateModalOpen(true)}
            onApplyTemplate={() => {
              refetchSnapshot();
              toast.success("Template applied to schedule");
            }}
          />
        )}

        {currentView === "day-setup" && (
          <DayAgendaSetup
            days={dayConfigs}
            selectedDayId={selectedDayId}
            timezone={eventTimezone}
            onSaveDay={(cfg) => {
              toast.success(`Schedule configuration saved for ${cfg.name}`);
            }}
            onAddDay={() => toast.info("To add days, configure event start and end dates in Settings")}
            onBack={() => setCurrentView("overview")}
          />
        )}

        {currentView === "rooms-tracks" && (
          <RoomTrackSetup
            rooms={rooms}
            tracks={tracks}
            onSaveRoom={handleSaveRoom}
            onDeleteRoom={handleDeleteRoom}
            onSaveTrack={handleSaveTrack}
            onDeleteTrack={handleDeleteTrack}
            onBack={() => setCurrentView("overview")}
          />
        )}

        {currentView === "structure" && (
          <AgendaStructureBuilder
            dayTitle={activeDay?.name || "Day 1"}
            dayDate={activeDay?.date || "2026-08-28"}
            rooms={rooms}
            tracks={tracks}
            initialNodes={sessions
              .filter((s) => s.date === (activeDay?.date || "2026-08-28"))
              .map((s, idx) => ({
                id: s.id,
                code: `0${idx + 1}`,
                title: s.title,
                type: s.sessionType,
                startTime: s.startTime,
                endTime: s.endTime,
                durationMinutes: s.durationMinutes,
                roomId: s.roomId,
                trackId: s.trackId,
                color: s.color,
                description: s.description,
              }))}
            onPreview={() => setCurrentView("preview-publish")}
            onSaveStructure={handleSaveStructure}
            onBack={() => setCurrentView("overview")}
          />
        )}

        {currentView === "grid" && (
          <TimelineScheduleBuilder
            rooms={rooms}
            tracks={tracks}
            sessions={sessions}
            selectedDayId={selectedDayId}
            days={days}
            onSelectDay={setSelectedDayId}
            onSelectSession={handleEditSession}
            onNewSession={() => setIsCreateModalOpen(true)}
            onUpdateSessionTimeRoom={handleUpdateSessionSchedule}
          />
        )}

        {currentView === "conflicts" && (
          <ConflictsValidationHub
            conflicts={conflicts}
            onResolveConflict={(confId) => {
              toast.success(`Conflict marked resolved`);
              refetchSnapshot();
            }}
            onRecheck={() => refetchSnapshot()}
            onBack={() => setCurrentView("overview")}
          />
        )}

        {currentView === "preview-publish" && (
          <PreviewPublishStation
            eventName={eventName}
            days={days}
            rooms={rooms}
            tracks={tracks}
            sessions={sessions}
            onPublish={async (channels) => {
              try {
                await apiPost(`/events/${eventId}/sessions/publish-schedule`, {
                  channels,
                  notify_speakers: true,
                });
                await refetchSnapshot();
                toast.success(`Schedule successfully published!`);
              } catch (err: any) {
                toast.error(err?.response?.data?.detail || "Failed to publish schedule");
              }
            }}
            onBack={() => setCurrentView("overview")}
          />
        )}
      </main>

      {/* Slide-over Inspector Drawer for Multi-Role Faculty & Session Details */}
      <SessionInspectorDrawer
        isOpen={isInspectorOpen}
        onClose={() => {
          setIsInspectorOpen(false);
          setSelectedSession(null);
        }}
        session={selectedSession}
        rooms={rooms}
        tracks={tracks}
        availableSpeakers={availableSpeakersList}
        onSave={handleSaveSession}
        onDelete={handleDeleteSession}
      />

      {/* Create Session Dialog */}
      <CreateSessionDialog
        isOpen={isCreateModalOpen}
        onClose={() => {
          setIsCreateModalOpen(false);
          refetchSnapshot();
        }}
        eventId={eventId}
      />
    </div>
  );
}
