"use client";

import { useState, useMemo } from "react";
import { Clock, MapPin, Users, AlertTriangle, CheckCircle2, Building2, Layers } from "lucide-react";
import { cn, formatTimeRangeInTZ } from "@/lib/utils";
import { BuilderSession, BuilderRoom, useSessionBuilderStore } from "@/store/useSessionBuilderStore";
import { Badge } from "@/components/ui/badge";

interface SessionTableProps {
  sessions?: BuilderSession[];
  onSelectSession?: (id: string) => void;
}

export function SessionTable({ sessions = [], onSelectSession }: SessionTableProps) {
  const conflicts = useSessionBuilderStore((s) => s.conflicts);
  const rooms = useSessionBuilderStore((s) => s.rooms);
  const [selectedRoomFilter, setSelectedRoomFilter] = useState<string>("ALL");

  // Group sessions roomwise
  const { groupedRooms, unassignedSessions } = useMemo(() => {
    const map: Record<string, BuilderSession[]> = {};
    const unassigned: BuilderSession[] = [];

    sessions.forEach((s) => {
      if (s.room_id) {
        if (!map[s.room_id]) map[s.room_id] = [];
        map[s.room_id].push(s);
      } else {
        unassigned.push(s);
      }
    });

    // Build room groups preserving room list order or creating entries for active rooms
    const activeRoomGroups: Array<{ room: BuilderRoom; sessionList: BuilderSession[] }> = [];

    // First, add all rooms from the store
    rooms.forEach((r) => {
      activeRoomGroups.push({
        room: r,
        sessionList: map[r.id] || [],
      });
    });

    // Handle any extra room IDs present in sessions but not in rooms list
    Object.keys(map).forEach((rId) => {
      if (!rooms.some((r) => r.id === rId)) {
        const firstSess = map[rId][0];
        activeRoomGroups.push({
          room: {
            id: rId,
            event_id: firstSess?.event_id || "",
            name: firstSess?.room_name || "Room Space",
            screen_count: 1,
            room_type: "ROOM",
            is_active: true,
          },
          sessionList: map[rId],
        });
      }
    });

    return {
      groupedRooms: activeRoomGroups,
      unassignedSessions: unassigned,
    };
  }, [sessions, rooms]);

  // Filter groups according to room navigation
  const visibleGroups = useMemo(() => {
    if (selectedRoomFilter === "ALL") return groupedRooms;
    if (selectedRoomFilter === "UNASSIGNED") return [];
    return groupedRooms.filter((g) => g.room.id === selectedRoomFilter);
  }, [groupedRooms, selectedRoomFilter]);

  const showUnassigned = selectedRoomFilter === "ALL" || selectedRoomFilter === "UNASSIGNED";

  return (
    <div className="flex flex-col gap-6">
      {/* ── Room Navigation Bar ────────────────────────────────────────── */}
      <div className="flex items-center gap-2 overflow-x-auto pb-2 no-scrollbar border-b border-default">
        <span className="text-[10px] font-black text-muted uppercase tracking-widest flex items-center gap-1 shrink-0 mr-1">
          <Layers className="h-3.5 w-3.5 text-[var(--pri)]" /> Room Nav:
        </span>

        {/* All Rooms Pill */}
        <button
          onClick={() => setSelectedRoomFilter("ALL")}
          className={cn(
            "px-3.5 py-1.5 rounded-2xl text-[11px] font-extrabold transition-all shrink-0 border flex items-center gap-2",
            selectedRoomFilter === "ALL"
              ? "bg-[var(--pri)] text-white border-[var(--pri)] shadow-md"
              : "bg-background text-muted border-default hover:text-[var(--text)] hover:border-[var(--pri)]/40"
          )}
        >
          <span>All Rooms</span>
          <span className="text-[9px] px-1.5 py-0.2 bg-white/20 rounded-md font-black">
            {sessions.length}
          </span>
        </button>

        {/* Individual Room Navigation Pills */}
        {groupedRooms.map(({ room, sessionList }) => (
          <button
            key={room.id}
            onClick={() => setSelectedRoomFilter(room.id)}
            className={cn(
              "px-3.5 py-1.5 rounded-2xl text-[11px] font-extrabold transition-all shrink-0 border flex items-center gap-2",
              selectedRoomFilter === room.id
                ? "bg-[var(--pri)] text-white border-[var(--pri)] shadow-md"
                : "bg-background text-muted border-default hover:text-[var(--text)] hover:border-[var(--pri)]/40"
            )}
          >
            <MapPin className="h-3 w-3" />
            <span>{room.name}</span>
            <span
              className={cn(
                "text-[9px] px-1.5 py-0.2 rounded-md font-black",
                selectedRoomFilter === room.id
                  ? "bg-white/20 text-white"
                  : "bg-[color-mix(in_srgb,var(--text)_8%,transparent)] text-muted"
              )}
            >
              {sessionList.length}
            </span>
          </button>
        ))}

        {/* Unassigned Pill */}
        {unassignedSessions.length > 0 && (
          <button
            onClick={() => setSelectedRoomFilter("UNASSIGNED")}
            className={cn(
              "px-3.5 py-1.5 rounded-2xl text-[11px] font-extrabold transition-all shrink-0 border flex items-center gap-2",
              selectedRoomFilter === "UNASSIGNED"
                ? "bg-[var(--warn)] text-white border-[var(--warn)] shadow-md"
                : "bg-background text-muted border-default hover:text-[var(--text)] hover:border-[var(--warn)]/40"
            )}
          >
            <span>Unassigned</span>
            <span
              className={cn(
                "text-[9px] px-1.5 py-0.2 rounded-md font-black",
                selectedRoomFilter === "UNASSIGNED"
                  ? "bg-white/20 text-white"
                  : "bg-[var(--warn)]/10 text-[var(--warn)]"
              )}
            >
              {unassignedSessions.length}
            </span>
          </button>
        )}
      </div>

      {/* ── Roomwise Session Sections ────────────────────────────────────── */}
      <div className="flex flex-col gap-8">
        {visibleGroups.map(({ room, sessionList }) => (
          <div
            key={room.id}
            id={`room-section-${room.id}`}
            className="flex flex-col border border-default rounded-3xl bg-background shadow-sm overflow-hidden"
          >
            {/* Room Header */}
            <div className="px-6 py-4 border-b border-default bg-[color-mix(in_srgb,var(--text)_2%,transparent)] flex items-center justify-between flex-wrap gap-3">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-2xl bg-[var(--pri)]/10 flex items-center justify-center text-[var(--pri)]">
                  <Building2 className="h-5 w-5" />
                </div>
                <div>
                  <h4 className="font-extrabold text-[15px] text-[var(--text)] tracking-tight">
                    {room.name}
                  </h4>
                  <div className="flex items-center gap-2 text-[10px] text-muted font-bold mt-0.5">
                    <Badge variant="outline" className="text-[9px] font-extrabold uppercase px-1.5 py-0">
                      {room.room_type || "ROOM"}
                    </Badge>
                    {room.capacity && (
                      <span className="flex items-center gap-1">
                        <Users className="h-3 w-3" /> {room.capacity} seats
                      </span>
                    )}
                  </div>
                </div>
              </div>

              <span className="text-[11px] font-black text-[var(--pri)] bg-[var(--pri)]/10 px-3 py-1 rounded-xl">
                {sessionList.length} {sessionList.length === 1 ? "Session" : "Sessions"}
              </span>
            </div>

            {/* Session Table for Room */}
            <div className="overflow-x-auto">
              <table className="w-full text-left text-[12px]">
                <thead>
                  <tr className="border-b border-default text-[10px] font-black uppercase tracking-wider text-muted bg-[color-mix(in_srgb,var(--text)_1%,transparent)]">
                    <th className="py-3 px-6">Code</th>
                    <th className="py-3 px-4">Session Name</th>
                    <th className="py-3 px-4">Type</th>
                    <th className="py-3 px-4">Schedule Time</th>
                    <th className="py-3 px-4">Speakers</th>
                    <th className="py-3 px-6">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-default/50 font-medium">
                  {sessionList.length > 0 ? (
                    sessionList.map((s) => {
                      const hasConflict = conflicts.some((c) => c.session_ids.includes(s.id));
                      const timezone = s.event_timezone || "UTC";

                      return (
                        <tr
                          key={s.id}
                          onClick={() => onSelectSession?.(s.id)}
                          className="hover:bg-[color-mix(in_srgb,var(--text)_3%,transparent)] cursor-pointer transition-colors"
                        >
                          <td className="py-3.5 px-6 font-mono font-bold text-[var(--pri)]">
                            {s.session_code?.toUpperCase()}
                          </td>
                          <td className="py-3.5 px-4 font-bold text-[var(--text)]">
                            <div className="flex items-center gap-2">
                              <span>{s.name}</span>
                              {hasConflict && (
                                <Badge variant="destructive" className="text-[9px] font-bold px-1 py-0">
                                  Conflict
                                </Badge>
                              )}
                            </div>
                          </td>
                          <td className="py-3.5 px-4">
                            <Badge variant="outline" className="text-[10px] uppercase font-bold">
                              {s.session_type}
                            </Badge>
                          </td>
                          <td className="py-3.5 px-4 font-mono font-semibold text-[var(--pri)]">
                            {formatTimeRangeInTZ(s.start_time, s.end_time, timezone)}
                          </td>
                          <td className="py-3.5 px-4 text-muted">
                            {s.speakers && s.speakers.length > 0
                              ? s.speakers.map((sp) => sp.full_name).join(", ")
                              : "No speakers"}
                          </td>
                          <td className="py-3.5 px-6">
                            {(s.readiness_pct || 0) >= 100 ? (
                              <span className="text-[var(--success)] font-bold flex items-center gap-1 text-[11px]">
                                <CheckCircle2 className="h-3 w-3" /> Ready
                              </span>
                            ) : (
                              <span className="text-[var(--warn)] font-bold text-[11px]">
                                {Math.round(s.readiness_pct || 0)}% ready
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  ) : (
                    <tr>
                      <td colSpan={6} className="py-8 text-center text-muted italic text-[11px]">
                        No sessions scheduled for this room.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        ))}

        {/* ── Unassigned Sessions Section ──────────────────────────────────── */}
        {showUnassigned && unassignedSessions.length > 0 && (
          <div className="flex flex-col border border-[var(--warn)]/40 rounded-3xl bg-background shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-[var(--warn)]/30 bg-[var(--warn)]/5 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-2xl bg-[var(--warn)]/10 flex items-center justify-center text-[var(--warn)]">
                  <AlertTriangle className="h-5 w-5" />
                </div>
                <div>
                  <h4 className="font-extrabold text-[15px] text-[var(--text)] tracking-tight">
                    Unassigned Sessions
                  </h4>
                  <p className="text-[10px] text-muted font-bold">Sessions awaiting room allocation</p>
                </div>
              </div>
              <span className="text-[11px] font-black text-[var(--warn)] bg-[var(--warn)]/10 px-3 py-1 rounded-xl">
                {unassignedSessions.length} Unallocated
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-[12px]">
                <thead>
                  <tr className="border-b border-default text-[10px] font-black uppercase tracking-wider text-muted bg-[color-mix(in_srgb,var(--text)_1%,transparent)]">
                    <th className="py-3 px-6">Code</th>
                    <th className="py-3 px-4">Session Name</th>
                    <th className="py-3 px-4">Type</th>
                    <th className="py-3 px-4">Schedule Time</th>
                    <th className="py-3 px-4">Speakers</th>
                    <th className="py-3 px-6">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-default/50 font-medium">
                  {unassignedSessions.map((s) => {
                    const timezone = s.event_timezone || "UTC";
                    return (
                      <tr
                        key={s.id}
                        onClick={() => onSelectSession?.(s.id)}
                        className="hover:bg-[color-mix(in_srgb,var(--text)_3%,transparent)] cursor-pointer transition-colors"
                      >
                        <td className="py-3.5 px-6 font-mono font-bold text-[var(--pri)]">
                          {s.session_code?.toUpperCase()}
                        </td>
                        <td className="py-3.5 px-4 font-bold text-[var(--text)]">
                          {s.name}
                        </td>
                        <td className="py-3.5 px-4">
                          <Badge variant="outline" className="text-[10px] uppercase font-bold">
                            {s.session_type}
                          </Badge>
                        </td>
                        <td className="py-3.5 px-4 font-mono font-semibold text-[var(--pri)]">
                          {formatTimeRangeInTZ(s.start_time, s.end_time, timezone)}
                        </td>
                        <td className="py-3.5 px-4 text-muted">
                          {s.speakers && s.speakers.length > 0
                            ? s.speakers.map((sp) => sp.full_name).join(", ")
                            : "No speakers"}
                        </td>
                        <td className="py-3.5 px-6">
                          <span className="text-[var(--warn)] font-bold text-[11px]">
                            Needs Room
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
