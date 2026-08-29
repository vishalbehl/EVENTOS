"use client";

import { useState, useMemo } from "react";
import { useParams } from "next/navigation";
import {
  MapPin,
  Zap,
  LayoutGrid,
  Globe,
  Plus,
  Users,
  Search,
  RefreshCw,
} from "lucide-react";
import { useRooms, useRoomAnalytics, RoomSummary } from "@/hooks/useRooms";
import { useSessions } from "@/hooks/useSessions";
import { useEvent } from "@/hooks/useEvents";
import { useModalStore } from "@/store/useModalStore";
import { CreateRoomDialog } from "@/components/organizer/rooms/CreateRoomDialog";
import { Portal } from "@/components/ui/portal";
import { useOperationAccess } from "@/lib/capabilities";
import { cn } from "@/lib/utils";

export default function RoomAllocationsPage() {
  const params = useParams();
  const eventIdStr = (params?.eventId as string) || "";
  const openModal = useModalStore((state) => state.openModal);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [typeFilter, setTypeFilter] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const roomAccess = useOperationAccess("venue.rooms.manage");

  const { data: roomsConfig, isLoading: isConfigLoading, refetch } = useRooms(eventIdStr);
  const { data: roomsAnalytics } = useRoomAnalytics(eventIdStr);
  const { data: allSessions } = useSessions(eventIdStr);
  const { data: event } = useEvent(eventIdStr);

  const isLoading = isConfigLoading;

  const roomSessionsMap = useMemo(() => {
    const map: Record<string, any[]> = {};
    allSessions?.forEach((s) => {
      if (s.room_id) {
        if (!map[s.room_id]) map[s.room_id] = [];
        map[s.room_id].push(s);
      }
    });
    return map;
  }, [allSessions]);

  const rooms: RoomSummary[] = useMemo(() => {
    if (!roomsConfig) return [];
    return roomsConfig
      .filter((r) => !typeFilter || r.room_type === typeFilter)
      .filter(
        (r) =>
          !searchTerm ||
          r.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
          r.location_notes?.toLowerCase().includes(searchTerm.toLowerCase())
      )
      .map((config) => {
        const analytics = roomsAnalytics?.find((a) => a.room_id === config.id);
        const mappedSessions = roomSessionsMap[config.id] || [];
        return {
          ...config,
          sessions_count: mappedSessions.length || analytics?.session_count || 0,
          readiness: analytics?.readiness_pct || 0,
        };
      });
  }, [roomsConfig, roomsAnalytics, roomSessionsMap, typeFilter, searchTerm]);

  const stats = [
    {
      label: "Active Rooms",
      val: rooms.filter((r) => r.is_active).length.toString(),
      icon: Globe,
      color: "text-[var(--pri)]",
    },
    {
      label: "Total Capacity",
      val: rooms.reduce((acc, r) => acc + (r.capacity || 0), 0).toLocaleString(),
      icon: Users,
      color: "text-emerald-500",
    },
    {
      label: "Avg Readiness",
      val: `${Math.round(
        rooms.reduce((acc, r) => acc + (r.readiness || 0), 0) / Math.max(1, rooms.length)
      )}%`,
      icon: Zap,
      color: "text-[var(--sec)]",
    },
    {
      label: "Mapped Sessions",
      val: rooms.reduce((acc, r) => acc + (r.sessions_count || 0), 0).toString(),
      icon: LayoutGrid,
      color: "text-amber-500",
    },
  ];

  const uniqueTypes = Array.from(
    new Set(roomsConfig?.map((r) => r.room_type).filter(Boolean) || [])
  );

  return (
    <>
      <div className="w-full space-y-6 p-6">
        {/* ── Top Header ── */}
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <MapPin className="size-4 text-[var(--pri)]" />
              <span className="text-[10px] font-bold uppercase tracking-widest text-[var(--pri)]">
                Venue Infrastructure
              </span>
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-[var(--text-primary)]">
              Room Allocations &amp; Venues
            </h1>
            <p className="text-xs text-[var(--text-secondary)] mt-0.5">
              Architect and configure physical halls, breakout rooms, and stage capacities.
            </p>
          </div>

          <div className="flex items-center gap-2.5 shrink-0">
            <button
              type="button"
              onClick={() => refetch()}
              disabled={isLoading}
              className="flex size-9 items-center justify-center rounded-lg border border-[var(--border-default)] bg-[var(--card)] text-[var(--text-secondary)] hover:bg-[var(--bg-surface-hover)] hover:text-[var(--text-primary)] shadow-sm transition-colors cursor-pointer"
              title="Refresh rooms"
            >
              <RefreshCw className={cn("size-4", isLoading && "animate-spin text-[var(--pri)]")} />
            </button>

            <button
              type="button"
              onClick={() => setIsCreateDialogOpen(true)}
              disabled={roomAccess.loading || !roomAccess.enabled}
              className="flex h-9 items-center gap-2 rounded-lg bg-[var(--pri)] px-4 text-xs font-bold text-[var(--primary-contrast)] shadow-sm hover:opacity-90 disabled:opacity-40 transition-all cursor-pointer"
            >
              <Plus className="size-4" /> Add Room
            </button>
          </div>
        </div>

        {/* ── KPI Stat Cards ── */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5">
          {stats.map((s) => (
            <div
              key={s.label}
              className="rounded-lg border border-[var(--border-default)] bg-[var(--card)] p-4 shadow-sm flex flex-col justify-between"
            >
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">
                  {s.label}
                </span>
                <s.icon className={cn("size-4", s.color)} />
              </div>
              <div className="text-2xl font-bold text-[var(--text-primary)] mt-2">{s.val}</div>
            </div>
          ))}
        </div>

        {/* ── Search & Filter Controls ── */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="relative flex-1 max-w-md w-full">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-[var(--text-tertiary)]" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search rooms by name or location..."
              className="h-9 w-full rounded-lg border border-[var(--border-default)] bg-[var(--card)] pl-9 pr-3 text-xs text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:border-[var(--pri)] focus:outline-none shadow-sm"
            />
          </div>

          <div className="flex items-center gap-2.5 shrink-0">
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              className="h-9 rounded-lg border border-[var(--border-default)] bg-[var(--card)] px-3 text-xs font-medium text-[var(--text-primary)] focus:border-[var(--pri)] focus:outline-none shadow-sm cursor-pointer"
            >
              <option value="">All Environment Types</option>
              {uniqueTypes.map((t) => (
                <option key={t} value={t}>
                  {t.toUpperCase()}
                </option>
              ))}
            </select>

            {typeFilter && (
              <button
                type="button"
                onClick={() => setTypeFilter("")}
                className="h-9 rounded-lg border border-[var(--border-default)] bg-[var(--card)] px-3 text-xs font-medium text-[var(--text-secondary)] hover:bg-[var(--bg-surface-hover)] hover:text-[var(--text-primary)] transition-colors shadow-sm cursor-pointer"
              >
                Reset
              </button>
            )}
          </div>
        </div>

        {/* ── Room Cards Grid ── */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {isLoading ? (
            Array.from({ length: 8 }).map((_, i) => (
              <div
                key={i}
                className="h-56 rounded-lg border border-[var(--border-default)] bg-[var(--card)] animate-pulse"
              />
            ))
          ) : rooms.length > 0 ? (
            rooms.map((room) => {
              return (
                <div
                  key={room.id}
                  onClick={() => openModal("ROOM_SETTINGS", room)}
                  className="rounded-lg border border-[var(--border-default)] bg-[var(--card)] p-4 shadow-sm hover:border-[var(--pri)] transition-all cursor-pointer flex flex-col justify-between space-y-4"
                >
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex size-8 items-center justify-center rounded-lg bg-[var(--pri)]/10 text-[var(--pri)] border border-[var(--pri)]/20">
                        <MapPin className="size-4" />
                      </div>
                      <span
                        className={cn(
                          "inline-flex items-center px-2 py-0.5 rounded text-[9px] font-bold uppercase",
                          room.is_active
                            ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                            : "bg-[var(--bg-surface-2)] text-[var(--text-tertiary)]"
                        )}
                      >
                        {room.is_active ? "Active" : "Idle"}
                      </span>
                    </div>

                    <div>
                      <h3 className="text-sm font-bold text-[var(--text-primary)] truncate">
                        {room.name}
                      </h3>
                      <p className="text-xs text-[var(--text-secondary)] truncate mt-0.5">
                        {event?.venue_name ? `${event.venue_name}, ` : ""}
                        {room.location_notes || "Main Venue"}
                      </p>
                    </div>

                    <div className="grid grid-cols-2 gap-2 p-2.5 rounded-md bg-[var(--bg-surface-2)] border border-[var(--border-subtle)]">
                      <div>
                        <span className="text-[10px] font-bold uppercase text-[var(--text-tertiary)] block">
                          Capacity
                        </span>
                        <span className="text-xs font-bold text-[var(--text-primary)]">
                          {room.capacity || 0} Pax
                        </span>
                      </div>
                      <div>
                        <span className="text-[10px] font-bold uppercase text-[var(--text-tertiary)] block">
                          Type
                        </span>
                        <span className="text-xs font-bold text-[var(--text-primary)] uppercase">
                          {room.room_type || "Room"}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="pt-3 border-t border-[var(--border-subtle)] flex items-center justify-between text-xs">
                    <span className="text-[var(--text-secondary)] font-medium">
                      {room.sessions_count || 0} Sessions
                    </span>
                    <span className="font-mono font-bold text-[var(--pri)]">
                      {Math.round(room.readiness || 0)}% Ready
                    </span>
                  </div>
                </div>
              );
            })
          ) : (
            <div className="col-span-full py-16 text-center text-xs text-[var(--text-secondary)] border border-dashed border-[var(--border-default)] rounded-lg bg-[var(--card)]">
              <p className="font-semibold text-sm text-[var(--text-primary)]">
                No rooms found for this event.
              </p>
              <p className="text-[11px] text-[var(--text-tertiary)] mt-1">
                Click &ldquo;Add Room&rdquo; to create a new stage or breakout room.
              </p>
            </div>
          )}
        </div>
      </div>

      <Portal>
        <CreateRoomDialog
          isOpen={isCreateDialogOpen && roomAccess.enabled}
          onClose={() => setIsCreateDialogOpen(false)}
        />
      </Portal>
    </>
  );
}
