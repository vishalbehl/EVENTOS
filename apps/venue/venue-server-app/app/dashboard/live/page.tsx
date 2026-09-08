"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import {
  Radio, LayoutGrid, Clock, ShieldAlert, ArrowRight, CheckCircle2,
  AlertTriangle, RefreshCw, DoorOpen, Monitor, HardDrive, User,
  Play, Pause, ChevronRight, Loader2
} from "lucide-react";
import { toast } from "sonner";
import { apiClient } from "@/lib/api-client";
import { cn } from "@/lib/utils";

type TabType = "grid" | "timeline" | "incidents";

export default function LiveOperationsPage() {
  const [activeTab, setActiveTab] = useState<TabType>("grid");

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["live-operations-data"],
    queryFn: () => apiClient.get<any>("/venue/admin/control/live-operations"),
    refetchInterval: 6000,
  });

  const rooms = data?.rooms || [];
  const timeline = data?.timeline || [];
  const incidents = data?.incidents || [];
  const stats = data?.stats || { total_rooms: 0, live_rooms: 0, warning_rooms: 0, offline_rooms: 0 };

  const formatTimer = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  };

  return (
    <div className="mx-auto flex w-full max-w-[1720px] flex-col gap-6 pb-12">
      {/* Workspace Header */}
      <div className="flex flex-col justify-between gap-4 border-b border-[var(--border)] pb-5 md:flex-row md:items-end">
        <div>
          <div className="flex items-center gap-2">
            <Radio className="size-4 text-emerald-400 animate-pulse" />
            <span className="font-mono text-[10px] font-black uppercase tracking-widest text-[var(--acc)]">
              WORKSPACE 02 · LIVE OPERATIONS
            </span>
          </div>
          <h1 className="mt-1 text-2xl font-black uppercase tracking-tight text-[var(--text)] sm:text-3xl">
            Live Venue Operations
          </h1>
          <p className="text-xs font-semibold text-[var(--muted)]">
            Continuous real-time room execution, session timelines, and incident dispatch
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          {/* 3 View Tabs with perfect theme contrast */}
          <div className="flex rounded-xl border border-[var(--border)] bg-[var(--card)] p-1 shadow-sm">
            <button
              onClick={() => setActiveTab("grid")}
              className={cn(
                "flex items-center gap-2 rounded-lg px-3.5 py-1.5 text-xs font-bold transition-all",
                activeTab === "grid"
                  ? "tab-active shadow-sm"
                  : "text-[var(--muted)] hover:text-[var(--text)]"
              )}
            >
              <LayoutGrid className="size-3.5" />
              <span>Grid View</span>
            </button>

            <button
              onClick={() => setActiveTab("timeline")}
              className={cn(
                "flex items-center gap-2 rounded-lg px-3.5 py-1.5 text-xs font-bold transition-all",
                activeTab === "timeline"
                  ? "tab-active shadow-sm"
                  : "text-[var(--muted)] hover:text-[var(--text)]"
              )}
            >
              <Clock className="size-3.5" />
              <span>Timeline</span>
            </button>

            <button
              onClick={() => setActiveTab("incidents")}
              className={cn(
                "flex items-center gap-2 rounded-lg px-3.5 py-1.5 text-xs font-bold transition-all",
                activeTab === "incidents"
                  ? "tab-active shadow-sm"
                  : "text-[var(--muted)] hover:text-[var(--text)]"
              )}
            >
              <ShieldAlert className="size-3.5" />
              <span>Incidents ({incidents.length})</span>
            </button>
          </div>

          <button
            onClick={() => refetch()}
            className="flex h-9 items-center gap-1.5 rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 text-xs font-bold text-[var(--muted)] hover:text-[var(--text)]"
          >
            <RefreshCw className="size-3.5" />
            <span className="hidden sm:inline">Refresh</span>
          </button>
        </div>
      </div>

      {isLoading ? (
        <div className="flex h-64 items-center justify-center">
          <Loader2 className="size-7 animate-spin text-[var(--acc)]" />
        </div>
      ) : (
        <>
          {/* Summary KPI Strip */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-3 shadow-sm">
              <span className="font-mono text-[9px] font-black uppercase text-[var(--muted)]">TOTAL HALLS</span>
              <div className="text-xl font-black text-[var(--text)]">{stats.total_rooms}</div>
            </div>
            <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 shadow-sm">
              <span className="font-mono text-[9px] font-black uppercase text-emerald-400">ACTIVE LIVE</span>
              <div className="text-xl font-black text-emerald-300">{stats.live_rooms}</div>
            </div>
            <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 shadow-sm">
              <span className="font-mono text-[9px] font-black uppercase text-amber-400">FILE / WARNING</span>
              <div className="text-xl font-black text-amber-300">{stats.warning_rooms}</div>
            </div>
            <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 shadow-sm">
              <span className="font-mono text-[9px] font-black uppercase text-rose-400">OFFLINE / BLOCKED</span>
              <div className="text-xl font-black text-rose-300">{stats.offline_rooms}</div>
            </div>
          </div>

          {/* VIEW 1: GRID */}
          {activeTab === "grid" && (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-6">
              {rooms.map((room: any) => {
                const isOffline = room.status_text === "OFFLINE";
                const isWarning = room.status_text === "FILE UPDATE" || room.status_text === "DEGRADED";

                return (
                  <div
                    key={room.id}
                    className={cn(
                      "flex flex-col justify-between rounded-2xl border p-4 transition-all shadow-sm",
                      isOffline
                        ? "border-rose-500/50 bg-rose-950/15"
                        : isWarning
                        ? "border-amber-500/40 bg-amber-950/10"
                        : "border-[var(--border)] bg-[var(--card)] hover:border-[var(--acc)]"
                    )}
                  >
                    <div>
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-black uppercase tracking-wider text-[var(--text)] truncate">
                          {room.name}
                        </span>
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

                      <div className="mt-3 space-y-1">
                        <div className="text-xs font-bold text-[var(--text)] truncate">
                          {room.current_speaker}
                        </div>
                        <div className="text-[11px] font-medium text-[var(--muted)] truncate">
                          {room.current_session?.title || "No session configured"}
                        </div>
                      </div>

                      {/* Telemetry Matrix */}
                      <div className="mt-4 space-y-1.5 rounded-xl bg-[var(--surf)] border border-[var(--border)] p-2.5 font-mono text-[10px]">
                        <div className="flex items-center justify-between">
                          <span className="text-[var(--muted)]">Tech PC:</span>
                          <span className={cn("font-bold", room.technical.status === "healthy" ? "text-emerald-400" : "text-amber-400")}>
                            ● {room.technical.status || "UNKNOWN"}{room.technical.cpu_pct != null ? ` (${room.technical.cpu_pct}%)` : ""}
                          </span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-[var(--muted)]">Stage PC:</span>
                          <span className={cn("font-bold", room.stage.status === "healthy" ? "text-emerald-400" : "text-rose-400")}>
                            ● {room.stage.playback_status || room.stage.status || "UNKNOWN"}
                          </span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-[var(--muted)]">Asset:</span>
                          <span className="font-bold text-[var(--acc)] truncate max-w-[100px]">
                            {room.presentation.version} · {room.presentation.sync_status}
                          </span>
                        </div>
                        <div className="flex items-center justify-between border-t border-[var(--border)] pt-1">
                          <span className="text-[var(--muted)]">Timer:</span>
                          <span className="font-bold text-[var(--text)]">{room.timer_seconds != null ? formatTimer(room.timer_seconds) : "--:--"}</span>
                        </div>
                      </div>
                    </div>

                    <Link
                      href={`/dashboard/rooms/${room.id}`}
                      className="mt-4 flex w-full items-center justify-center gap-1.5 rounded-xl border border-[var(--border)] bg-[var(--surf)] py-2 text-xs font-bold text-[var(--text)] hover:bg-[var(--raised)] transition-colors"
                    >
                      <span>Open Room Workspace</span>
                      <ArrowRight className="size-3.5" />
                    </Link>
                  </div>
                );
              })}
            </div>
          )}

          {/* VIEW 2: TIMELINE */}
          {activeTab === "timeline" && (
            <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-6 shadow-sm">
              <div className="flex items-center justify-between border-b border-[var(--border)] pb-4">
                <div>
                  <h2 className="text-sm font-black uppercase tracking-wider text-[var(--text)]">
                    OPERATIONAL SCHEDULE & BUFFER TIMELINE
                  </h2>
                  <p className="text-xs text-[var(--muted)]">Tracking session starts, speaker transitions, and presentation readiness windows</p>
                </div>
              </div>

              <div className="mt-6 space-y-4">
                {timeline.length === 0 ? (
                  <div className="p-8 text-center text-xs text-[var(--muted)]">
                    No scheduled sessions found for current time window.
                  </div>
                ) : (
                  ["09:00 AM", "09:30 AM", "10:00 AM", "10:30 AM", "11:00 AM"].map((timeSlot, slotIdx) => (
                    <div key={timeSlot} className="relative flex items-start gap-4">
                      <div className="w-24 shrink-0 font-mono text-xs font-black text-[var(--acc)]">
                        {timeSlot}
                      </div>
                      <div className="flex-1 space-y-2 border-l-2 border-[var(--border)] pl-4 pb-4">
                        {timeline.slice(slotIdx * 2, slotIdx * 2 + 3).map((sess: any) => (
                          <div
                            key={sess.id}
                            className="flex items-center justify-between rounded-xl border border-[var(--border)] bg-[var(--surf)] p-3 text-xs shadow-sm hover:border-[var(--acc)] transition-all"
                          >
                            <div className="flex items-center gap-3">
                              <span className="rounded bg-[var(--card)] px-2 py-0.5 font-mono text-[10px] font-bold text-[var(--muted)] border border-[var(--border)]">
                                {sess.session_code}
                              </span>
                              <div>
                                <div className="font-bold text-[var(--text)]">{sess.title}</div>
                                <div className="text-[11px] text-[var(--muted)]">{sess.speaker} · {sess.room_name}</div>
                              </div>
                            </div>
                            <span className="font-mono text-[10px] font-bold text-emerald-400">
                              ● {sess.status}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {/* VIEW 3: ACTIVE INCIDENTS */}
          {activeTab === "incidents" && (
            <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-6 shadow-sm">
              <div className="flex items-center justify-between border-b border-[var(--border)] pb-4">
                <div>
                  <h2 className="text-sm font-black uppercase tracking-wider text-[var(--text)]">
                    ACTIVE OPERATIONAL INCIDENTS & DISPATCH
                  </h2>
                  <p className="text-xs text-[var(--muted)]">Track technical anomalies from alert triage through technician resolution</p>
                </div>
              </div>

              <div className="mt-5 space-y-4">
                {incidents.length === 0 ? (
                  <div className="p-8 text-center text-xs font-bold text-[var(--muted)]">
                    ✓ No unresolved incidents. All venue hardware running smoothly.
                  </div>
                ) : (
                  incidents.map((inc: any) => (
                    <div
                      key={inc.id}
                      className="rounded-2xl border border-rose-500/40 bg-rose-950/10 p-5 shadow-sm space-y-4"
                    >
                      <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-center border-b border-rose-500/20 pb-3">
                        <div className="flex items-center gap-3">
                          <span className="rounded bg-rose-500/20 px-2 py-0.5 font-mono text-xs font-black text-rose-400 border border-rose-500/30">
                            {inc.code}
                          </span>
                          <h3 className="text-sm font-black uppercase text-[var(--text)]">
                            {inc.title}
                          </h3>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="rounded bg-[var(--card)] px-2.5 py-1 text-[10px] font-mono font-bold text-[var(--muted)] border border-[var(--border)]">
                            STATUS: {inc.status.toUpperCase()}
                          </span>
                          <span className="rounded bg-rose-500/20 px-2.5 py-1 text-[10px] font-bold text-rose-400">
                            Assigned: {inc.assigned_to || "Unassigned"}
                          </span>
                        </div>
                      </div>

                      {/* Incident Timeline Log */}
                      <div className="space-y-2 rounded-xl bg-[var(--surf)] border border-[var(--border)] p-3.5 text-xs">
                        <span className="font-mono text-[10px] font-black uppercase tracking-wider text-[var(--muted)]">
                          DISPATCH TIMELINE LOG
                        </span>
                        {(inc.timeline || []).map((tl: any, i: number) => (
                          <div key={i} className="flex items-start gap-3 text-[11px]">
                            <span className="font-mono font-bold text-[var(--acc)]">{tl.time}</span>
                            <span className="text-[var(--text)]">{tl.note}</span>
                            <span className="ml-auto text-[10px] text-[var(--muted)]">({tl.author})</span>
                          </div>
                        ))}
                      </div>

                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => toast.info(`Radio dispatch triggered for ${inc.code}`)}
                          className="rounded-xl border border-[var(--border)] bg-[var(--card)] px-4 py-2 text-xs font-bold text-[var(--text)] hover:bg-[var(--raised)]"
                        >
                          Radio Technician
                        </button>
                        <button
                          onClick={() => toast.success(`Incident ${inc.code} resolved`)}
                          className="rounded-xl bg-emerald-600 px-4 py-2 text-xs font-bold text-white hover:bg-emerald-500 shadow"
                        >
                          Resolve Incident
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
