"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  Calendar,
  Clock,
  MapPin,
  Monitor,
  RefreshCw,
  Rows3,
  ServerCog,
} from "lucide-react";
import { useRooms } from "@/hooks/useRooms";
import { useSessions } from "@/hooks/useSessions";
import { apiGet } from "@/lib/api-client";
import { useOperationAccess } from "@/lib/capabilities";
import { cn } from "@/lib/utils";

type VenueSyncStatus = {
  event_id: string;
  devices_by_status: Record<string, number>;
  latest_jobs: Array<{
    id: string;
    sync_type: string;
    status: string;
    retry_count: number;
    bytes_transferred?: number | null;
    checksum_verified?: boolean | null;
    error_message?: string | null;
    created_at?: string | null;
    completed_at?: string | null;
  }>;
  freshness_at: string;
  source: string;
};

type QueueItem = { id: string; status?: string; position?: number; session_id?: string };

function reasonLabel(reason?: string | null) {
  return (reason || "RESOLUTION_UNAVAILABLE").replaceAll("_", " ").toLowerCase();
}

export default function ProgramDashboardPage() {
  const params = useParams();
  const eventId = (params?.eventId as string) || "";
  const syncAccess = useOperationAccess("venue.sync");
  const deviceAccess = useOperationAccess("venue.devices.manage");
  const queueAccess = useOperationAccess("presentations.queue.manage");
  const roomsQuery = useRooms(eventId);
  const sessionsQuery = useSessions(eventId);
  const syncQuery = useQuery({
    queryKey: ["venue-sync-status", eventId],
    queryFn: () => apiGet<VenueSyncStatus>(`/events/${eventId}/venue-sync/status`),
    enabled: Boolean(eventId) && syncAccess.enabled && deviceAccess.enabled,
    staleTime: 0,
    refetchOnWindowFocus: true,
  });
  const queueQuery = useQuery({
    queryKey: ["presentation-queue", eventId],
    queryFn: () => apiGet<QueueItem[]>(`/events/${eventId}/queue`),
    enabled: Boolean(eventId) && queueAccess.enabled,
    staleTime: 0,
    refetchOnWindowFocus: true,
  });

  const rooms = roomsQuery.data ?? [];
  const sessions = sessionsQuery.data ?? [];
  const now = Date.now();
  const upcoming = sessions
    .filter((session) => session.start_time && new Date(session.start_time).getTime() >= now)
    .sort(
      (left, right) =>
        new Date(left.start_time).getTime() - new Date(right.start_time).getTime()
    )
    .slice(0, 8);
  const activeRooms = rooms.filter((room) => room.is_active).length;
  const onlineDevices = syncQuery.data?.devices_by_status.online ?? 0;
  const totalDevices = Object.values(syncQuery.data?.devices_by_status ?? {}).reduce(
    (sum, count) => sum + count,
    0
  );
  const loading = roomsQuery.isLoading || sessionsQuery.isLoading;

  const refresh = async () => {
    await Promise.all([
      roomsQuery.refetch(),
      sessionsQuery.refetch(),
      syncAccess.enabled ? syncQuery.refetch() : Promise.resolve(),
      queueAccess.enabled ? queueQuery.refetch() : Promise.resolve(),
    ]);
  };

  return (
    <div className="w-full space-y-6 p-6">
      {/* ── Top Header ── */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <ServerCog className="size-4 text-[var(--pri)]" />
            <span className="text-[10px] font-bold uppercase tracking-widest text-[var(--pri)]">
              Program Operations
            </span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-[var(--text-primary)]">
            Program Dashboard
          </h1>
          <p className="text-xs text-[var(--text-secondary)] mt-0.5">
            Manage Venue Rooms, Sessions, and Presentations queue.
          </p>
        </div>

        <button
          type="button"
          onClick={() => void refresh()}
          disabled={loading || syncQuery.isFetching || queueQuery.isFetching}
          className="flex h-9 items-center gap-1.5 rounded-lg border border-[var(--border-default)] bg-[var(--card)] px-3 text-xs font-semibold text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)] shadow-sm transition-colors cursor-pointer self-start md:self-auto"
        >
          <RefreshCw
            className={cn(
              "size-3.5",
              (loading || syncQuery.isFetching || queueQuery.isFetching) &&
              "animate-spin text-[var(--pri)]"
            )}
          />
          Refresh
        </button>
      </div>

      {/* ── KPI Stat Cards ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5">
        <div className="rounded-lg border border-[var(--border-default)] bg-[var(--card)] p-4 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">
              Active Rooms
            </span>
            <MapPin className="size-4 text-[var(--pri)]" />
          </div>
          <div className="mt-2">
            <div className="text-2xl font-bold text-[var(--text-primary)]">
              {activeRooms}
            </div>
            <span className="text-[11px] text-[var(--text-secondary)]">
              {rooms.length} configured
            </span>
          </div>
        </div>

        <div className="rounded-lg border border-[var(--border-default)] bg-[var(--card)] p-4 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">
              Scheduled Sessions
            </span>
            <Calendar className="size-4 text-emerald-500" />
          </div>
          <div className="mt-2">
            <div className="text-2xl font-bold text-[var(--text-primary)]">
              {sessions.length}
            </div>
            <span className="text-[11px] text-[var(--text-secondary)]">
              {upcoming.length} upcoming next
            </span>
          </div>
        </div>

        <div className="rounded-lg border border-[var(--border-default)] bg-[var(--card)] p-4 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">
              Venue Devices
            </span>
            <Monitor className="size-4 text-[var(--sec)]" />
          </div>
          <div className="mt-2">
            <div className="text-2xl font-bold text-[var(--text-primary)]">
              {!deviceAccess.enabled
                ? "Restricted"
                : syncQuery.isError
                  ? "0"
                  : totalDevices}
            </div>
            <span className="text-[11px] text-[var(--text-secondary)]">
              {deviceAccess.enabled
                ? `${onlineDevices} online`
                : reasonLabel(deviceAccess.reason)}
            </span>
          </div>
        </div>

        <div className="rounded-lg border border-[var(--border-default)] bg-[var(--card)] p-4 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">
              Presentation Queue
            </span>
            <Rows3 className="size-4 text-amber-500" />
          </div>
          <div className="mt-2">
            <div className="text-2xl font-bold text-[var(--text-primary)]">
              {!queueAccess.enabled
                ? "Restricted"
                : queueQuery.isError
                  ? "0"
                  : queueQuery.data?.length ?? 0}
            </div>
            <span className="text-[11px] text-[var(--text-secondary)]">
              {queueAccess.enabled ? "live queue records" : reasonLabel(queueAccess.reason)}
            </span>
          </div>
        </div>
      </div>

      {/* ── 2-Column Operational Grid ── */}
      <div className="grid grid-cols-1 xl:grid-cols-[1.3fr_1fr] gap-4">
        {/* Left: Configured Rooms */}
        <div className="rounded-lg border border-[var(--border-default)] bg-[var(--card)] p-5 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-bold text-[var(--text-primary)]">Configured Rooms</h2>
              <p className="text-xs text-[var(--text-secondary)]">
                Physical hall allocations and staged session counts.
              </p>
            </div>
            <Link
              href={`/events/${eventId}/program/rooms`}
              className="text-xs font-semibold text-[var(--pri)] hover:underline"
            >
              Manage rooms
            </Link>
          </div>

          {roomsQuery.isLoading ? (
            <p className="py-8 text-center text-xs text-[var(--text-secondary)]">
              Loading rooms...
            </p>
          ) : null}

          {!roomsQuery.isLoading && !roomsQuery.isError && rooms.length === 0 ? (
            <p className="rounded-lg border border-dashed border-[var(--border-default)] p-8 text-center text-xs text-[var(--text-secondary)]">
              No rooms have been configured yet.
            </p>
          ) : null}

          <div className="space-y-2">
            {rooms.map((room) => {
              const roomSessions = sessions.filter((session) => session.room_id === room.id);
              return (
                <div
                  key={room.id}
                  className="flex items-center justify-between rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface-2)] p-3.5"
                >
                  <div>
                    <p className="text-xs font-bold text-[var(--text-primary)]">{room.name}</p>
                    <p className="text-[11px] text-[var(--text-secondary)] mt-0.5">
                      {room.room_type || "Hall"} {room.code ? `(${room.code})` : ""} &middot;{" "}
                      {roomSessions.length} sessions
                    </p>
                  </div>
                  <span
                    className={cn(
                      "inline-flex items-center px-2 py-0.5 rounded text-[9px] font-bold uppercase",
                      room.is_active
                        ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                        : "bg-[var(--card)] text-[var(--text-tertiary)]"
                    )}
                  >
                    {room.is_active ? "Active" : "Inactive"}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Right: Upcoming Agenda */}
        <div className="rounded-lg border border-[var(--border-default)] bg-[var(--card)] p-5 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-bold text-[var(--text-primary)]">Upcoming Agenda</h2>
              <p className="text-xs text-[var(--text-secondary)]">
                Next scheduled sessions chronologically.
              </p>
            </div>
            <Link
              href={`/events/${eventId}/program/agenda`}
              className="text-xs font-semibold text-[var(--pri)] hover:underline"
            >
              Open agenda
            </Link>
          </div>

          <div className="space-y-2">
            {upcoming.map((session) => (
              <div
                key={session.id}
                className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-3 rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface-2)] text-xs"
              >
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-1 font-mono font-bold text-[var(--pri)] text-xs">
                    <Clock className="size-3.5" />
                    {new Date(session.start_time).toLocaleTimeString("en-IN", {
                      hour: "2-digit",
                      minute: "2-digit",
                      hour12: true,
                    })}
                  </div>
                  <div>
                    <p className="font-bold text-[var(--text-primary)]">{session.name}</p>
                    <p className="text-[11px] text-[var(--text-secondary)]">
                      {session.room_name || "Unassigned Hall"}
                    </p>
                  </div>
                </div>
                <span className="rounded bg-[var(--card)] px-2 py-0.5 text-[10px] font-bold uppercase text-[var(--text-secondary)] border border-[var(--border-subtle)] self-start sm:self-auto">
                  {session.status || "Scheduled"}
                </span>
              </div>
            ))}
            {!sessionsQuery.isLoading && !sessionsQuery.isError && upcoming.length === 0 ? (
              <p className="py-8 text-center text-xs text-[var(--text-secondary)]">
                No upcoming sessions found.
              </p>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
