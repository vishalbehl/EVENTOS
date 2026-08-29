"use client";

import { useState, useMemo } from "react";
import {
  Calendar,
  Building2,
  Clock,
  Plus,
  Filter,
  Layers,
  ChevronLeft,
  ChevronRight,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Sparkles,
  AlertTriangle,
  Users,
  Tag,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { RoomItem, TrackConfigItem } from "./RoomTrackSetup";
import { SessionInspectorData } from "./SessionInspectorDrawer";
import { toast } from "sonner";

interface TimelineScheduleBuilderProps {
  days: Array<{ id: string; name: string; date: string }>;
  selectedDayId: string;
  rooms: RoomItem[];
  tracks: TrackConfigItem[];
  sessions: SessionInspectorData[];
  onSelectDay: (dayId: string) => void;
  onSelectSession: (session: SessionInspectorData) => void;
  onNewSession: () => void;
  onUpdateSessionTimeRoom: (
    sessionId: string,
    newRoomId: string,
    newStartTime: string,
    newEndTime: string
  ) => void;
}

// Time slots from 08:00 to 19:00 (hourly intervals)
const TIME_SLOTS = [
  "08:00 AM",
  "09:00 AM",
  "10:00 AM",
  "11:00 AM",
  "12:00 PM",
  "01:00 PM",
  "02:00 PM",
  "03:00 PM",
  "04:00 PM",
  "05:00 PM",
  "06:00 PM",
  "07:00 PM",
];

const TIME_START_HOUR = 8; // 8 AM
const TIME_END_HOUR = 19; // 7 PM
const TOTAL_MINUTES = (TIME_END_HOUR - TIME_START_HOUR) * 60; // 660 mins

export function TimelineScheduleBuilder({
  days,
  selectedDayId,
  rooms,
  tracks,
  sessions,
  onSelectDay,
  onSelectSession,
  onNewSession,
  onUpdateSessionTimeRoom,
}: TimelineScheduleBuilderProps) {
  const [viewScope, setViewScope] = useState<"Day" | "3 Days" | "Week">("Day");
  const [selectedTrackFilter, setSelectedTrackFilter] = useState<string>("all");
  const [selectedRoomFilter, setSelectedRoomFilter] = useState<string>("all");

  // Dragging session state
  const [draggedSessionId, setDraggedSessionId] = useState<string | null>(null);
  const [dragOverRoomId, setDragOverRoomId] = useState<string | null>(null);

  const activeDay = days.find((d) => d.id === selectedDayId) || days[0];

  // Filter rooms
  const visibleRooms = useMemo(() => {
    if (selectedRoomFilter === "all") return rooms;
    return rooms.filter((r) => r.id === selectedRoomFilter);
  }, [rooms, selectedRoomFilter]);

  // Filter sessions
  const visibleSessions = useMemo(() => {
    return sessions.filter((s) => {
      if (selectedTrackFilter !== "all" && s.trackId !== selectedTrackFilter) {
        return false;
      }
      return true;
    });
  }, [sessions, selectedTrackFilter]);

  // Helper to calculate top and height in percentage of timeline
  const getSessionPosition = (startTime: string, endTime: string) => {
    const parseMins = (tStr: string) => {
      const [h, m] = tStr.split(":").map(Number);
      return (h - TIME_START_HOUR) * 60 + (m || 0);
    };

    const startMins = Math.max(0, parseMins(startTime));
    const endMins = Math.min(TOTAL_MINUTES, parseMins(endTime));
    const duration = Math.max(25, endMins - startMins);

    const topPct = (startMins / TOTAL_MINUTES) * 100;
    const heightPct = (duration / TOTAL_MINUTES) * 100;

    return { top: `${topPct}%`, height: `${heightPct}%` };
  };

  // Drag event handlers
  const handleDragStart = (e: React.DragEvent, sessionId: string) => {
    e.dataTransfer.setData("text/plain", sessionId);
    setDraggedSessionId(sessionId);
  };

  const handleDragOver = (e: React.DragEvent, roomId: string) => {
    e.preventDefault();
    setDragOverRoomId(roomId);
  };

  const handleDrop = (e: React.DragEvent, roomId: string) => {
    e.preventDefault();
    const sessionId = e.dataTransfer.getData("text/plain") || draggedSessionId;
    if (sessionId) {
      const sess = sessions.find((s) => s.id === sessionId);
      if (sess) {
        onUpdateSessionTimeRoom(sessionId, roomId, sess.startTime, sess.endTime);
        const targetRoom = rooms.find((r) => r.id === roomId);
        toast.success(`Moved "${sess.title}" to ${targetRoom?.name || "new room"}`);
      }
    }
    setDraggedSessionId(null);
    setDragOverRoomId(null);
  };

  return (
    <div className="flex flex-col h-[calc(100vh-140px)] rounded-lg border border-[var(--border-default)] bg-[var(--card)] shadow-xs overflow-hidden">
      {/* Top Controls Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border-subtle)] bg-[var(--card)] p-3 z-10 shrink-0">
        <div className="flex items-center gap-3">
          {/* Day Dropdown */}
          <div className="flex items-center gap-1.5 rounded-lg border border-[var(--border-default)] bg-[var(--surface-subtle)] px-3 py-1.5 text-xs font-bold text-[var(--text-primary)]">
            <Calendar className="size-3.5 text-[var(--pri)]" />
            <select
              value={selectedDayId}
              onChange={(e) => onSelectDay(e.target.value)}
              className="bg-transparent font-bold text-[var(--text-primary)] focus:outline-none cursor-pointer"
            >
              {days.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name} ({d.date})
                </option>
              ))}
            </select>
          </div>

          {/* View Mode Buttons */}
          <div className="flex items-center rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface-2)] p-0.5 gap-0.5">
            {(["Day", "3 Days", "Week"] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => setViewScope(mode)}
                className={cn(
                  "rounded-md px-2.5 py-1 text-xs font-semibold transition-colors cursor-pointer",
                  viewScope === mode
                    ? "bg-[var(--card)] text-[var(--pri)] shadow-xs font-bold"
                    : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                )}
              >
                {mode}
              </button>
            ))}
          </div>
        </div>

        {/* Filters & Actions */}
        <div className="flex items-center gap-2">
          {/* Track Filter */}
          <select
            value={selectedTrackFilter}
            onChange={(e) => setSelectedTrackFilter(e.target.value)}
            className="h-8 rounded-lg border border-[var(--border-default)] bg-[var(--surface-subtle)] px-2.5 text-xs text-[var(--text-primary)] focus:border-[var(--pri)] focus:outline-none cursor-pointer"
          >
            <option value="all">All Tracks</option>
            {tracks.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>

          {/* Room Filter */}
          <select
            value={selectedRoomFilter}
            onChange={(e) => setSelectedRoomFilter(e.target.value)}
            className="h-8 rounded-lg border border-[var(--border-default)] bg-[var(--surface-subtle)] px-2.5 text-xs text-[var(--text-primary)] focus:border-[var(--pri)] focus:outline-none cursor-pointer"
          >
            <option value="all">All Rooms ({rooms.length})</option>
            {rooms.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>

          <button
            type="button"
            onClick={onNewSession}
            className="flex items-center gap-1.5 rounded-lg bg-[var(--pri)] px-3.5 py-1.5 text-xs font-bold text-[var(--primary-contrast)] shadow-sm hover:opacity-95 transition-opacity cursor-pointer"
          >
            <Plus className="size-3.5" /> + Add Session
          </button>
        </div>
      </div>

      {/* Main Gantt / Matrix Grid Viewport */}
      <div className="flex-1 overflow-auto relative flex">
        {/* Left Sticky Time Scale Column */}
        <div className="w-20 shrink-0 border-r border-[var(--border-subtle)] bg-[var(--surface-subtle)]/40 flex flex-col z-20 sticky left-0 select-none">
          {/* Room Header Spacer */}
          <div className="h-12 border-b border-[var(--border-subtle)] bg-[var(--card)] p-2 text-center text-[10px] font-bold uppercase tracking-wider text-[var(--text-tertiary)] flex items-center justify-center">
            Time
          </div>

          {/* Time Rows */}
          <div className="relative flex-1" style={{ minHeight: "880px" }}>
            {TIME_SLOTS.map((slot, idx) => (
              <div
                key={slot}
                className="absolute w-full px-2 text-[10px] font-mono text-[var(--text-tertiary)] -translate-y-2 border-t border-[var(--border-subtle)]"
                style={{ top: `${(idx / (TIME_SLOTS.length - 1)) * 100}%` }}
              >
                {slot}
              </div>
            ))}
          </div>
        </div>

        {/* Room Columns Grid */}
        <div
          className="flex-1 flex min-w-[900px] relative"
          style={{ minHeight: "880px" }}
        >
          {visibleRooms.length === 0 ? (
            <div className="flex flex-1 flex-col items-center justify-center p-12 text-center">
              <Building2 className="size-10 text-[var(--text-tertiary)]" />
              <h3 className="mt-3 text-sm font-bold text-[var(--text-primary)]">
                No Conference Rooms Configured
              </h3>
              <p className="mt-1 text-xs text-[var(--text-secondary)] max-w-sm">
                Configure your main auditoriums, breakout halls, and workshop stations in Rooms & Tracks to start scheduling sessions on the matrix.
              </p>
            </div>
          ) : (
            visibleRooms.map((room) => {
              const roomSessions = visibleSessions.filter((s) => s.roomId === room.id);
              const isDragOver = dragOverRoomId === room.id;

              return (
                <div
                  key={room.id}
                  onDragOver={(e) => handleDragOver(e, room.id)}
                  onDrop={(e) => handleDrop(e, room.id)}
                className={cn(
                  "flex-1 border-r border-[var(--border-subtle)] flex flex-col transition-colors relative min-w-[140px]",
                  isDragOver ? "bg-[var(--pri)]/5" : "bg-[var(--card)]"
                )}
              >
                {/* Column Header */}
                <div className="h-12 border-b border-[var(--border-subtle)] bg-[var(--surface-subtle)] p-2 text-center sticky top-0 z-10 flex flex-col justify-center">
                  <span className="text-xs font-bold text-[var(--text-primary)] truncate">
                    {room.name}
                  </span>
                  <span className="text-[10px] text-[var(--text-tertiary)] truncate">
                    Cap: {room.capacity ?? 100} • {room.room_type || "presentation"}
                  </span>
                </div>

                {/* Column Canvas Body */}
                <div className="relative flex-1">
                  {/* Horizontal Hour Lines Background */}
                  {TIME_SLOTS.map((_, idx) => (
                    <div
                      key={idx}
                      className="absolute w-full border-b border-dashed border-[var(--border-subtle)] pointer-events-none"
                      style={{ top: `${(idx / (TIME_SLOTS.length - 1)) * 100}%` }}
                    />
                  ))}

                  {/* Render Sessions */}
                  {roomSessions.map((session) => {
                    const pos = getSessionPosition(session.startTime, session.endTime);
                    const track = tracks.find((t) => t.id === session.trackId);
                    const cardBg = session.color || track?.displayColor || "#3b82f6";

                    return (
                      <div
                        key={session.id}
                        draggable
                        onDragStart={(e) => handleDragStart(e, session.id)}
                        onClick={() => onSelectSession(session)}
                        className="absolute left-1 right-1 rounded-lg border border-[var(--border-default)] p-2 shadow-xs cursor-pointer hover:shadow-md hover:scale-[1.01] transition-all overflow-hidden flex flex-col justify-between z-10"
                        style={{
                          top: pos.top,
                          height: pos.height,
                          backgroundColor: `${cardBg}18`,
                          borderLeftWidth: "4px",
                          borderLeftColor: cardBg,
                        }}
                      >
                        <div className="space-y-1">
                          <div className="flex items-center justify-between gap-1">
                            <span
                              className="rounded px-1.5 py-0.5 text-[9px] font-bold uppercase truncate"
                              style={{
                                backgroundColor: `${cardBg}30`,
                                color: cardBg,
                              }}
                            >
                              {session.sessionType}
                            </span>
                            <span className="font-mono text-[10px] text-[var(--text-secondary)] shrink-0">
                              {session.startTime} - {session.endTime}
                            </span>
                          </div>

                          <h4 className="text-xs font-bold text-[var(--text-primary)] line-clamp-2 leading-tight">
                            {session.title}
                          </h4>
                        </div>

                        {/* Footer info */}
                        <div className="flex items-center justify-between text-[10px] text-[var(--text-secondary)] pt-1 border-t border-[var(--border-subtle)]/50 mt-1">
                          <span className="truncate flex items-center gap-1 font-medium">
                            <Users className="size-3 text-[var(--text-tertiary)]" />
                            {session.speakers.length > 0
                              ? session.speakers[0]
                              : "No speakers"}
                          </span>
                          {session.cmeEligible && (
                            <span className="text-amber-500 font-bold font-mono">
                              CME {session.cmeCredits}
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          }))}
        </div>
      </div>
    </div>
  );
}
