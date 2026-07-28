"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, Calendar, Clock, MapPin, Monitor, RefreshCw, Rows3, ServerCog } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useRooms } from "@/hooks/useRooms";
import { useSessions } from "@/hooks/useSessions";
import { apiGet } from "@/lib/api-client";
import { useOperationAccess } from "@/lib/capabilities";

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

export default function SessionsDashboardPage() {
  const { eventId } = useParams<{ eventId: string }>();
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
    .filter(session => session.start_time && new Date(session.start_time).getTime() >= now)
    .sort((left, right) => new Date(left.start_time).getTime() - new Date(right.start_time).getTime())
    .slice(0, 8);
  const activeRooms = rooms.filter(room => room.is_active).length;
  const onlineDevices = syncQuery.data?.devices_by_status.online ?? 0;
  const totalDevices = Object.values(syncQuery.data?.devices_by_status ?? {}).reduce((sum, count) => sum + count, 0);
  const failedJobs = syncQuery.data?.latest_jobs.filter(job => ["failed", "error"].includes(job.status.toLowerCase())).length ?? 0;
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
    <main className="space-y-6 p-6">
      <header className="flex flex-col gap-4 border-b border-white/10 pb-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="mb-2 text-[10px] font-black uppercase tracking-[0.3em] text-[var(--pri)]">Authoritative event data</p>
          <h1 className="text-3xl font-black tracking-tight text-[var(--text)]">Sessions and venue operations</h1>
          <p className="mt-2 text-sm text-muted">Live records from event sessions, rooms, venue devices, sync jobs, and presentation queue.</p>
        </div>
        <Button variant="outline" onClick={() => void refresh()} disabled={loading || syncQuery.isFetching || queueQuery.isFetching}>
          <RefreshCw className={`mr-2 h-4 w-4 ${(loading || syncQuery.isFetching || queueQuery.isFetching) ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </header>

      {(roomsQuery.isError || sessionsQuery.isError) && (
        <Card className="border-rose-500/20 bg-rose-500/5">
          <CardContent className="flex items-center gap-3 p-5 text-sm text-rose-200">
            <AlertTriangle className="h-5 w-5" /> Room or session records are unavailable. This is not being displayed as an empty event.
          </CardContent>
        </Card>
      )}

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-label="Event operations summary">
        {[
          { label: "Active rooms", value: roomsQuery.isError ? "Unavailable" : String(activeRooms), detail: `${rooms.length} configured`, icon: MapPin },
          { label: "Sessions", value: sessionsQuery.isError ? "Unavailable" : String(sessions.length), detail: `${upcoming.length} shown next`, icon: Calendar },
          { label: "Venue devices", value: !deviceAccess.enabled ? "Restricted" : syncQuery.isError ? "Unavailable" : String(totalDevices), detail: deviceAccess.enabled ? `${onlineDevices} online` : reasonLabel(deviceAccess.reason), icon: Monitor },
          { label: "Presentation queue", value: !queueAccess.enabled ? "Restricted" : queueQuery.isError ? "Unavailable" : String(queueQuery.data?.length ?? 0), detail: queueAccess.enabled ? "live queue records" : reasonLabel(queueAccess.reason), icon: Rows3 },
        ].map(item => (
          <Card key={item.label} className="border-white/10 bg-white/[0.025]">
            <CardContent className="p-5">
              <item.icon className="mb-5 h-5 w-5 text-[var(--pri)]" />
              <p className="text-[10px] font-black uppercase tracking-[0.18em] text-muted">{item.label}</p>
              <p className="mt-1 text-2xl font-black text-[var(--text)]">{loading ? "..." : item.value}</p>
              <p className="mt-1 text-xs text-muted">{item.detail}</p>
            </CardContent>
          </Card>
        ))}
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.3fr_1fr]">
        <Card className="border-white/10 bg-white/[0.025]">
          <CardContent className="p-6">
            <div className="mb-5 flex items-center justify-between">
              <div>
                <h2 className="font-bold text-[var(--text)]">Configured rooms</h2>
                <p className="text-xs text-muted">No operational state is inferred when source records are absent.</p>
              </div>
              <Link href={`/events/${eventId}/sessions/rooms`} className="text-xs font-bold text-[var(--pri)]">Manage rooms</Link>
            </div>
            {roomsQuery.isLoading ? <p className="py-8 text-center text-sm text-muted">Loading rooms...</p> : null}
            {!roomsQuery.isLoading && !roomsQuery.isError && rooms.length === 0 ? <p className="rounded-2xl border border-dashed border-white/10 p-8 text-center text-sm text-muted">No rooms have been configured.</p> : null}
            <div className="space-y-3">
              {rooms.map(room => {
                const roomSessions = sessions.filter(session => session.room_id === room.id);
                return (
                  <div key={room.id} className="flex items-center justify-between rounded-2xl border border-white/10 bg-black/10 p-4">
                    <div>
                      <p className="font-semibold text-[var(--text)]">{room.name}</p>
                      <p className="mt-1 text-xs text-muted">{room.room_type || "Unclassified"} · {room.capacity ?? 0} capacity · {roomSessions.length} sessions</p>
                    </div>
                    <Badge className={room.is_active ? "bg-emerald-500/10 text-emerald-300" : "bg-white/5 text-muted"}>{room.is_active ? "Active" : "Inactive"}</Badge>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

        <Card className="border-white/10 bg-white/[0.025]">
          <CardContent className="p-6">
            <div className="mb-5 flex items-center gap-3">
              <ServerCog className="h-5 w-5 text-[var(--pri)]" />
              <div>
                <h2 className="font-bold text-[var(--text)]">Venue sync</h2>
                <p className="text-xs text-muted">Device and transfer state from production records.</p>
              </div>
            </div>
            {!syncAccess.enabled || !deviceAccess.enabled ? (
              <p className="rounded-2xl border border-amber-500/20 bg-amber-500/5 p-5 text-sm text-amber-100">Restricted: {reasonLabel(!syncAccess.enabled ? syncAccess.reason : deviceAccess.reason)}.</p>
            ) : syncQuery.isError ? (
              <p className="rounded-2xl border border-rose-500/20 bg-rose-500/5 p-5 text-sm text-rose-100">Venue sync status is unavailable.</p>
            ) : (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-xl border border-white/10 p-4"><p className="text-xs text-muted">Online devices</p><p className="mt-1 text-xl font-black">{onlineDevices}/{totalDevices}</p></div>
                  <div className="rounded-xl border border-white/10 p-4"><p className="text-xs text-muted">Failed jobs</p><p className="mt-1 text-xl font-black">{failedJobs}</p></div>
                </div>
                <div className="space-y-2">
                  {(syncQuery.data?.latest_jobs ?? []).slice(0, 6).map(job => (
                    <div key={job.id} className="rounded-xl border border-white/10 p-3">
                      <div className="flex items-center justify-between"><span className="text-xs font-semibold">{job.sync_type}</span><Badge className="bg-white/5 text-muted">{job.status}</Badge></div>
                      <p className="mt-1 text-[11px] text-muted">{job.created_at ? new Date(job.created_at).toLocaleString() : "Timestamp unavailable"}</p>
                      {job.error_message ? <p className="mt-2 text-xs text-rose-300">{job.error_message}</p> : null}
                    </div>
                  ))}
                  {!syncQuery.isLoading && (syncQuery.data?.latest_jobs.length ?? 0) === 0 ? <p className="rounded-xl border border-dashed border-white/10 p-5 text-center text-xs text-muted">No venue sync jobs recorded.</p> : null}
                </div>
                {syncQuery.data?.freshness_at ? <p className="text-[10px] text-muted">Freshness: {new Date(syncQuery.data.freshness_at).toLocaleString()} · {syncQuery.data.source}</p> : null}
              </div>
            )}
          </CardContent>
        </Card>
      </section>

      <Card className="border-white/10 bg-white/[0.025]">
        <CardContent className="p-6">
          <div className="mb-5 flex items-center justify-between">
            <div><h2 className="font-bold text-[var(--text)]">Upcoming agenda</h2><p className="text-xs text-muted">Ordered from persisted session start times.</p></div>
            <Link href={`/events/${eventId}/sessions/agenda`} className="text-xs font-bold text-[var(--pri)]">Open agenda</Link>
          </div>
          <div className="space-y-3">
            {upcoming.map(session => (
              <div key={session.id} className="grid gap-2 rounded-2xl border border-white/10 p-4 sm:grid-cols-[180px_1fr_auto] sm:items-center">
                <p className="flex items-center gap-2 text-xs font-semibold text-[var(--pri)]"><Clock className="h-4 w-4" />{new Date(session.start_time).toLocaleString()}</p>
                <div><p className="font-semibold text-[var(--text)]">{session.name}</p><p className="text-xs text-muted">{session.room_name || "Room not assigned"}</p></div>
                <Badge className="w-fit bg-white/5 text-muted">{session.status || "Unspecified"}</Badge>
              </div>
            ))}
            {!sessionsQuery.isLoading && !sessionsQuery.isError && upcoming.length === 0 ? <p className="rounded-2xl border border-dashed border-white/10 p-8 text-center text-sm text-muted">No upcoming sessions found.</p> : null}
          </div>
        </CardContent>
      </Card>
    </main>
  );
}
