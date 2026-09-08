"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Activity, ArrowRight, Bell, CheckCircle2, AlertTriangle, 
  DoorOpen, HardDrive, Monitor, Users, ShieldAlert,
  RefreshCw, Play, Clock, Sparkles, ExternalLink, UserCheck, Loader2
} from "lucide-react";
import { toast } from "sonner";
import { apiClient } from "@/lib/api-client";
import { cn } from "@/lib/utils";

type RoomLiveItem = {
  id: string;
  name: string;
  type: string;
  status_text: "LIVE" | "READY" | "FILE UPDATE" | "DEGRADED" | "OFFLINE";
  status: "healthy" | "warning" | "critical";
  current_speaker: string;
  current_session: {
    id: string | null;
    code: string;
    title: string;
    start: string | null;
    end: string | null;
    is_active: boolean;
  };
  technical: {
    status: string;
    device_name: string;
    cpu_pct: number;
    ram_pct: number;
  };
  stage: {
    status: string;
    device_name: string;
    cpu_pct: number;
    ram_pct: number;
    playback_status: string;
  };
  moderator: { status: string };
  presentation: {
    id: string | null;
    filename: string;
    version: string;
    sync_status: string;
  };
  timer_seconds: number;
};

type AlertItem = {
  id: string;
  severity: "critical" | "warning" | "info";
  status: string;
  source_type: string;
  title: string;
  evidence: string;
  suggested_action?: string;
  last_seen_at: string;
};

type LiveOperationsData = {
  generated_at: string;
  venue_healthy: boolean;
  rooms: RoomLiveItem[];
  incidents: any[];
  stats: {
    total_rooms: number;
    live_rooms: number;
    warning_rooms: number;
    offline_rooms: number;
  };
};

export default function CommandCenterPage() {
  const router = useRouter();
  const queryClient = useQueryClient();

  const overviewQuery = useQuery({
    queryKey: ["venue-control-overview"],
    queryFn: () => apiClient.get<any>("/venue/admin/control/overview"),
    refetchInterval: 8000,
  });

  const liveOpsQuery = useQuery({
    queryKey: ["live-operations-data"],
    queryFn: () => apiClient.get<LiveOperationsData>("/venue/admin/control/live-operations"),
    refetchInterval: 8000,
  });

  const alertsQuery = useQuery({
    queryKey: ["attention-alerts"],
    queryFn: () => apiClient.get<{ items: AlertItem[] }>("/venue/admin/control/alerts?state=active"),
    refetchInterval: 8000,
  });

  const srrQuery = useQuery({
    queryKey: ["srr-fleet-data"],
    queryFn: () => apiClient.get<any>("/venue/admin/control/srr-fleet"),
    refetchInterval: 8000,
  });

  const regQuery = useQuery({
    queryKey: ["registration-desks-data"],
    queryFn: () => apiClient.get<any>("/venue/admin/control/registration/desks"),
    refetchInterval: 8000,
  });

  const actAlertMutation = useMutation({
    mutationFn: ({ alertId, action, reason }: { alertId: string; action: string; reason: string }) =>
      apiClient.post(`/venue/admin/control/alerts/${alertId}/action`, { action, reason }),
    onSuccess: () => {
      toast.success("Alert updated");
      queryClient.invalidateQueries({ queryKey: ["attention-alerts"] });
      queryClient.invalidateQueries({ queryKey: ["venue-control-overview"] });
    }
  });

  const overview = overviewQuery.data;
  const liveOps = liveOpsQuery.data;
  const alerts = alertsQuery.data?.items || [];
  const rooms = liveOps?.rooms || [];
  const srrData = srrQuery.data;
  const regData = regQuery.data;

  const formatTimer = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  };

  const freeGB = overview?.storage?.free_bytes ? (overview.storage.free_bytes / (1024 * 1024 * 1024)).toFixed(1) : "0.0";
  const totalGB = overview?.storage?.total_bytes ? (overview.storage.total_bytes / (1024 * 1024 * 1024)).toFixed(1) : "0.0";
  const usedPct = overview?.storage?.total_bytes && overview?.storage?.used_bytes
    ? Math.round((overview.storage.used_bytes / overview.storage.total_bytes) * 100)
    : 0;

  const totalSyncedFiles = (overview?.content?.synced || 0) + (overview?.content?.verified || 0);
  const venueStatus = overview?.status?.toUpperCase() || "UNKNOWN";

  return (
    <div className="mx-auto flex w-full max-w-[1720px] flex-col gap-6 pb-12">
      {/* 1. Header: Live Operational Authority Snapshot */}
      <div className="flex flex-col justify-between gap-4 border-b border-[var(--border)] pb-5 md:flex-row md:items-end">
        <div>
          <div className="flex items-center gap-2">
            <span className="flex size-2 rounded-full bg-emerald-500 animate-pulse" />
            <span className="font-mono text-[10px] font-black uppercase tracking-widest text-[var(--acc)]">
              VENUE OPERATIONS CONTROL CENTER
            </span>
          </div>
          <h1 className="mt-1 text-2xl font-black uppercase tracking-tight text-[var(--text)] sm:text-3xl">
            {overview?.event?.name || "No active event"}
          </h1>
          <p className="text-xs font-semibold text-[var(--muted)]">
            {overview?.event?.venue_name || overview?.event?.location || overview?.installation_name || "Authoritative Venue Node"} · Live Operations
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-3.5 py-2">
            <span className="size-2 rounded-full bg-emerald-500 animate-pulse" />
            <div>
              <div className="text-[10px] font-black uppercase tracking-wider text-emerald-400">VENUE STATUS</div>
              <div className={cn("text-xs font-black", venueStatus === "HEALTHY" ? "text-emerald-300" : "text-amber-300")}>● {venueStatus}</div>
            </div>
          </div>

          <button
            onClick={() => {
              overviewQuery.refetch();
              liveOpsQuery.refetch();
              alertsQuery.refetch();
              srrQuery.refetch();
              regQuery.refetch();
            }}
            className="flex h-11 items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--card)] px-4 text-xs font-bold text-[var(--text)] transition-colors hover:bg-[var(--raised)]"
          >
            <RefreshCw className="size-4 text-[var(--acc)]" />
            <span>Refresh State</span>
          </button>
        </div>
      </div>

      {/* 2. Top 4 Mission-Critical KPI Cards */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {/* Devices */}
        <Link href="/dashboard/devices" className="group rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4 shadow-sm transition-all hover:border-[var(--acc)] hover:shadow-md">
          <div className="flex items-center justify-between text-[var(--muted)]">
            <span className="font-mono text-[10px] font-black uppercase tracking-wider">DEVICES</span>
            <Monitor className="size-4 text-[var(--acc)]" />
          </div>
          <div className="mt-2 text-2xl font-black text-[var(--text)]">
            {overview?.devices?.healthy ?? 0} / {overview?.devices?.total ?? 0}
          </div>
          <div className="mt-1 flex items-center gap-1.5 text-[11px] font-bold text-emerald-400">
            <span className="size-1.5 rounded-full bg-emerald-400" />
            <span>{overview?.devices?.total ? Math.round(((overview.devices.healthy || 0) / overview.devices.total) * 100) + "% ONLINE" : "ONLINE UNKNOWN"} · {overview?.devices?.offline ?? 0} OFFLINE</span>
          </div>
        </Link>

        {/* Rooms */}
        <Link href="/dashboard/live" className="group rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4 shadow-sm transition-all hover:border-[var(--acc)] hover:shadow-md">
          <div className="flex items-center justify-between text-[var(--muted)]">
            <span className="font-mono text-[10px] font-black uppercase tracking-wider">ROOMS</span>
            <DoorOpen className="size-4 text-blue-400" />
          </div>
          <div className="mt-2 text-2xl font-black text-[var(--text)]">
            {liveOps?.stats?.live_rooms ?? 0} / {liveOps?.stats?.total_rooms ?? 0}
          </div>
          <div className="mt-1 flex items-center gap-1.5 text-[11px] font-bold text-blue-400">
            <span className="size-1.5 rounded-full bg-blue-400" />
            <span>{liveOps?.stats?.warning_rooms ?? 0} REQUIRE ATTENTION</span>
          </div>
        </Link>

        {/* SRR */}
        <Link href="/dashboard/srr" className="group rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4 shadow-sm transition-all hover:border-[var(--acc)] hover:shadow-md">
          <div className="flex items-center justify-between text-[var(--muted)]">
            <span className="font-mono text-[10px] font-black uppercase tracking-wider">SRR STATIONS</span>
            <HardDrive className="size-4 text-amber-400" />
          </div>
          <div className="mt-2 text-2xl font-black text-[var(--text)]">
            {srrData?.total_stations ?? 0} STATIONS
          </div>
          <div className="mt-1 flex items-center gap-1.5 text-[11px] font-bold text-emerald-400">
            <span className="size-1.5 rounded-full bg-emerald-400" />
            <span>{srrData?.active_stations ?? 0} ACTIVE · {srrData?.checkin_nodes ?? "UNKNOWN"} INTAKE NODES</span>
          </div>
        </Link>

        {/* Registration */}
        <Link href="/dashboard/registration" className="group rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4 shadow-sm transition-all hover:border-[var(--acc)] hover:shadow-md">
          <div className="flex items-center justify-between text-[var(--muted)]">
            <span className="font-mono text-[10px] font-black uppercase tracking-wider">REGISTRATION</span>
            <Users className="size-4 text-purple-400" />
          </div>
          <div className="mt-2 text-2xl font-black text-[var(--text)]">
            {regData?.stats?.checked_in?.toLocaleString() ?? "0"}
          </div>
          <div className="mt-1 flex items-center gap-1.5 text-[11px] font-bold text-emerald-400">
            <span className="size-1.5 rounded-full bg-emerald-400" />
            <span>{regData?.desks?.length ?? 0} DESKS · {regData?.stats?.total_registered?.toLocaleString() ?? 0} REGISTERED</span>
          </div>
        </Link>
      </div>

      {/* 3. Attention Required Queue */}
      <div className="overflow-hidden rounded-2xl border border-rose-500/30 bg-rose-950/10 shadow-md">
        <div className="flex items-center justify-between border-b border-rose-500/20 bg-rose-950/20 px-5 py-3.5">
          <div className="flex items-center gap-2.5">
            <ShieldAlert className="size-5 text-rose-500 animate-pulse" />
            <h2 className="text-xs font-black uppercase tracking-wider text-[var(--text)]">
              ATTENTION REQUIRED QUEUE ({alerts.length})
            </h2>
          </div>
          <Link href="/dashboard/alerts" className="text-[11px] font-bold text-[var(--acc)] hover:underline flex items-center gap-1">
            <span>View All Triage</span>
            <ArrowRight className="size-3" />
          </Link>
        </div>

        <div className="divide-y divide-[var(--border)]">
          {alerts.length === 0 ? (
            <div className="p-6 text-center text-xs font-bold text-[var(--muted)]">
              ✓ No active exceptions. All systems operating within standard baseline.
            </div>
          ) : (
            alerts.slice(0, 5).map((alt) => {
              const isCrit = alt.severity === "critical";
              return (
                <div key={alt.id} className="flex flex-col justify-between gap-3 p-4 sm:flex-row sm:items-center hover:bg-[var(--raised)]/50 transition-colors">
                  <div className="flex items-start gap-3">
                    <span className={cn(
                      "mt-1 size-2.5 shrink-0 rounded-full",
                      isCrit ? "bg-rose-500 animate-ping" : "bg-amber-500"
                    )} />
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-black text-[var(--text)]">{alt.title}</span>
                        <span className="rounded bg-[var(--card)] px-1.5 py-0.5 font-mono text-[9px] font-bold uppercase text-[var(--muted)] border border-[var(--border)]">
                          {alt.source_type}
                        </span>
                      </div>
                      <p className="mt-0.5 text-xs text-[var(--muted)]">{alt.evidence}</p>
                    </div>
                  </div>

                  <div className="flex shrink-0 items-center gap-2">
                    <button
                      onClick={() => {
                        if (alt.source_type === "room" || alt.title.toLowerCase().includes("hall")) {
                          router.push("/dashboard/live");
                        } else if (alt.source_type === "srr") {
                          router.push("/dashboard/srr");
                        } else {
                          router.push("/dashboard/devices");
                        }
                      }}
                      className="rounded-lg border border-[var(--border)] bg-[var(--card)] px-2.5 py-1 text-[10px] font-bold hover:border-[var(--acc)] hover:text-[var(--text)]"
                    >
                      Open
                    </button>
                    <button
                      onClick={() => actAlertMutation.mutate({ alertId: alt.id, action: "acknowledge", reason: "Quick Acknowledge" })}
                      className="rounded-lg border border-[var(--border)] bg-[var(--card)] px-2.5 py-1 text-[10px] font-bold text-blue-400 hover:bg-blue-500/10"
                    >
                      Acknowledge
                    </button>
                    <button
                      onClick={() => actAlertMutation.mutate({ alertId: alt.id, action: "resolve", reason: "Quick Resolve" })}
                      className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-[10px] font-bold text-emerald-400 hover:bg-emerald-500/20"
                    >
                      Resolve
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* 4. Live Operational Map: 18 Hall Live Grid */}
      <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5 shadow-sm">
        <div className="flex items-center justify-between border-b border-[var(--border)] pb-4">
          <div>
            <h2 className="text-sm font-black uppercase tracking-wider text-[var(--text)]">
              LIVE OPERATIONAL MAP ({rooms.length} ROOMS)
            </h2>
            <p className="text-xs text-[var(--muted)]">Real-time room execution, technical status, stage status, and presentation sync</p>
          </div>
          <div className="flex items-center gap-2">
            <Link href="/dashboard/rooms/readiness" className="rounded-xl border border-[var(--border)] bg-[var(--surf)] px-3 py-1.5 text-xs font-bold text-[var(--text)] hover:border-[var(--acc)]">
              Session Readiness Matrix →
            </Link>
          </div>
        </div>

        {rooms.length === 0 ? (
          <div className="p-8 text-center text-xs text-[var(--muted)]">
            Loading live room telemetry from database...
          </div>
        ) : (
          <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-6">
            {rooms.map((room) => {
              const isLive = room.status_text === "LIVE";
              const isWarning = room.status_text === "FILE UPDATE" || room.status_text === "DEGRADED";
              const isOffline = room.status_text === "OFFLINE";

              return (
                <div
                  key={room.id}
                  className={cn(
                    "flex flex-col justify-between rounded-xl border p-3.5 transition-all shadow-sm",
                    isOffline
                      ? "border-rose-500/40 bg-rose-950/10"
                      : isWarning
                      ? "border-amber-500/40 bg-amber-950/10"
                      : "border-[var(--border)] bg-[var(--surf)] hover:border-[var(--acc)]"
                  )}
                >
                  <div>
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-black uppercase text-[var(--text)] truncate">{room.name}</span>
                      <span className={cn(
                        "rounded px-1.5 py-0.5 font-mono text-[9px] font-black uppercase",
                        isOffline
                          ? "bg-rose-500/20 text-rose-400"
                          : isWarning
                          ? "bg-amber-500/20 text-amber-400"
                          : "bg-emerald-500/20 text-emerald-400"
                      )}>
                        ● {room.status_text}
                      </span>
                    </div>

                    {/* Speaker & Session */}
                    <div className="mt-2.5 space-y-1">
                      <div className="text-[11px] font-bold text-[var(--text)] truncate">
                        {room.current_speaker}
                      </div>
                      <div className="text-[10px] font-medium text-[var(--muted)] truncate">
                        {room.current_session.title}
                      </div>
                    </div>

                    {/* Telemetry rows */}
                    <div className="mt-3 space-y-1 rounded-lg bg-[var(--card)] border border-[var(--border)] p-2 font-mono text-[10px]">
                      <div className="flex items-center justify-between">
                        <span className="text-[var(--muted)]">Technical:</span>
                        <span className={cn("font-bold", room.technical.status === "healthy" ? "text-emerald-400" : "text-amber-400")}>
                          ● {room.technical.status === "healthy" ? "Online" : "Check"}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-[var(--muted)]">Stage:</span>
                        <span className={cn("font-bold", room.stage.status === "healthy" ? "text-emerald-400" : "text-rose-400")}>
                          ● {room.stage.status === "healthy" ? "Online" : "Offline"}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-[var(--muted)]">Pres:</span>
                        <span className="font-bold text-[var(--acc)] truncate max-w-[90px]">
                          {room.presentation.version}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-[var(--muted)]">Timer:</span>
                        <span className="font-bold text-[var(--text)]">{formatTimer(room.timer_seconds || 0)}</span>
                      </div>
                    </div>
                  </div>

                  <Link
                    href={`/dashboard/rooms/${room.id}`}
                    className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--card)] py-1.5 text-[10px] font-bold text-[var(--text)] hover:bg-[var(--pri)] hover:text-[var(--primary-contrast)] transition-colors"
                  >
                    <span>Open Room</span>
                    <ArrowRight className="size-3" />
                  </Link>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 5. Service Matrix & Local Storage */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2 rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5 shadow-sm">
          <div className="flex items-center justify-between border-b border-[var(--border)] pb-3">
            <h3 className="text-xs font-black uppercase tracking-wider text-[var(--text)]">
              VENUE SUBSYSTEM HEALTH MATRIX
            </h3>
            <Link href="/dashboard/services" className="text-[11px] font-bold text-[var(--acc)] hover:underline">
              All Subsystems →
            </Link>
          </div>

          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-[var(--border)] text-[10px] font-black uppercase text-[var(--muted)]">
                  <th className="pb-2">Subsystem</th>
                  <th className="pb-2">Status</th>
                  <th className="pb-2">Host / Version</th>
                  <th className="pb-2">Queue</th>
                  <th className="pb-2">Observed</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)]">
                {(overview?.services || []).map((srv: any) => (
                  <tr key={srv.id} className="hover:bg-[var(--raised)]">
                    <td className="py-2.5 font-bold text-[var(--text)]">
                      {srv.name}
                      <span className="ml-2 font-mono text-[9px] text-[var(--muted)]">{srv.type}</span>
                    </td>
                    <td className="py-2.5">
                      <span className={cn(
                        "rounded px-2 py-0.5 font-mono text-[9px] font-bold uppercase",
                        srv.status === "healthy" ? "bg-emerald-500/10 text-emerald-400" : "bg-amber-500/10 text-amber-400"
                      )}>
                        ● {srv.status}
                      </span>
                    </td>
                    <td className="py-2.5 font-mono text-[10px] text-[var(--muted)]">
                      {srv.host || "Local"} {srv.version ? `· v${srv.version}` : ""}
                    </td>
                    <td className="py-2.5 font-mono font-bold text-[var(--text)]">{srv.queue_depth || 0}</td>
                    <td className="py-2.5 font-mono text-[10px] text-[var(--muted)]">
                      {srv.last_heartbeat_at ? new Date(srv.last_heartbeat_at).toLocaleTimeString() : "Live"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Local Storage & Cache */}
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between border-b border-[var(--border)] pb-3">
              <h3 className="text-xs font-black uppercase tracking-wider text-[var(--text)]">
                LOCAL STORAGE & ASSET CACHE
              </h3>
              <HardDrive className="size-4 text-[var(--acc)]" />
            </div>
            <div className="mt-4">
              <div className="font-mono text-[10px] text-[var(--muted)] truncate">
                {overview?.storage?.path || "/var/eventos/storage"}
              </div>
              <div className="mt-2 text-3xl font-black text-[var(--text)]">
                {freeGB} GB Free
              </div>
              <div className="text-xs text-[var(--muted)]">of {totalGB} GB observed NVMe capacity</div>

              <div className="mt-4 h-2 w-full overflow-hidden rounded-full bg-[var(--raised)]">
                <div className="h-full bg-emerald-500" style={{ width: `${usedPct}%` }} />
              </div>
            </div>
          </div>

          <div className="mt-4 rounded-xl border border-[var(--border)] bg-[var(--surf)] p-3 text-[11px]">
            <div className="flex items-center justify-between font-bold text-[var(--text)]">
              <span>Presentation Cache</span>
              <span className="text-emerald-400">{totalSyncedFiles} Files Synced</span>
            </div>
            <div className="mt-1 text-[10px] text-[var(--muted)]">Checksums verified against local NVMe storage</div>
          </div>
        </div>
      </div>
    </div>
  );
}
