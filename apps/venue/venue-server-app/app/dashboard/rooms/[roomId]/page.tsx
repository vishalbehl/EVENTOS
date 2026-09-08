"use client";

import { use, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  DoorOpen, Play, Pause, Square, RotateCw, Clock, MessageSquare, 
  AlertTriangle, CheckCircle2, ShieldAlert, Monitor, ArrowLeft,
  Tv, Cpu, HardDrive, User, RefreshCw, Send, Check
} from "lucide-react";
import { toast } from "sonner";
import { apiClient } from "@/lib/api-client";
import { cn } from "@/lib/utils";

export default function RoomWorkspacePage({ params }: { params: Promise<{ roomId: string }> }) {
  const resolvedParams = use(params);
  const roomId = resolvedParams.roomId;
  const router = useRouter();
  const queryClient = useQueryClient();

  const [emergencyModalOpen, setEmergencyModalOpen] = useState(false);
  const [emergencyMessage, setEmergencyMessage] = useState("");

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["room-workspace", roomId],
    queryFn: () => apiClient.get<any>(`/venue/admin/control/rooms/${roomId}/workspace`),
    refetchInterval: 5000,
  });

  const cmdMutation = useMutation({
    mutationFn: ({ command, reason, payload }: { command: string; reason: string; payload?: any }) =>
      apiClient.post(`/venue/admin/control/rooms/${roomId}/command`, { command, reason, payload: payload || {} }),
    onSuccess: (_, vars) => {
      toast.success(`Command '${vars.command}' dispatched to room`);
      refetch();
    },
    onError: (err: any) => {
      toast.error(`Command failed: ${err.message || "Execution error"}`);
    }
  });

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <RefreshCw className="size-6 animate-spin text-[var(--pri)]" />
      </div>
    );
  }

  const room = data?.room;
  const currentSession = data?.current_session;
  const devices = data?.devices || {};
  const tech = devices.technical || {};
  const stage = devices.stage || {};
  const moderator = devices.moderator || {};
  const timer = devices.timer || {};

  const techVersion = tech.current_presentation || null;
  const stageVersion = stage.playing_presentation || null;
  const isVersionMismatch = Boolean(techVersion && stageVersion && techVersion !== stageVersion);

  return (
    <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-6 pb-12">
      {/* Top Breadcrumb & Room Header */}
      <div className="flex flex-col justify-between gap-4 border-b border-[var(--border)] pb-5 md:flex-row md:items-end">
        <div>
          <Link
            href="/dashboard/rooms"
            className="flex items-center gap-1.5 text-xs font-bold text-[var(--muted)] hover:text-[var(--text)] mb-2"
          >
            <ArrowLeft className="size-3.5" />
            <span>Back to All Rooms</span>
          </Link>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-black uppercase tracking-tight text-[var(--text)] sm:text-3xl">
              {room?.name || "Room unavailable"}
            </h1>
            <span className="rounded-lg bg-amber-500/15 border border-amber-500/30 px-3 py-1 font-mono text-[10px] font-black uppercase text-amber-300">
              ● {room?.status?.toUpperCase() || "UNKNOWN"}
            </span>
          </div>
          <p className="text-xs text-[var(--muted)]">
            {room?.type || "Type unavailable"} · Capacity {room?.capacity ?? "Unknown"} · AV Tech: {room?.av_technician || "Unassigned"}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => refetch()}
            className="flex h-9 items-center gap-1.5 rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 text-xs font-bold text-[var(--muted)] hover:text-[var(--text)]"
          >
            <RefreshCw className="size-3.5 text-[var(--pri)]" />
            <span>Refresh State</span>
          </button>
        </div>
      </div>

      {/* Version Mismatch Warning Banner */}
      {isVersionMismatch && (
        <div className="flex items-center justify-between rounded-2xl border border-amber-500/40 bg-amber-950/20 p-4 text-xs shadow-md">
          <div className="flex items-center gap-3">
            <AlertTriangle className="size-5 text-amber-500 animate-bounce" />
            <div>
              <strong className="text-amber-400">Presentation Version Desync Detected!</strong>
              <p className="text-[11px] text-[var(--muted)]">Technical PC has {techVersion} queued, but Stage PC is running {stageVersion}.</p>
            </div>
          </div>
          <button
            onClick={() => cmdMutation.mutate({ command: "reload", reason: "Resync stage presentation to current version" })}
            className="rounded-xl bg-amber-500 px-3.5 py-1.5 font-bold text-black hover:bg-amber-400"
          >
            Resync Stage Now
          </button>
        </div>
      )}

      {/* Primary 2-Column Split: Session & Controls (Left) + Device Telemetry (Right) */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Left 2 Cols: Session & Direct Room Commands */}
        <div className="lg:col-span-2 space-y-6">
          {/* Current Session Card */}
          <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-6 shadow-sm">
            <div className="flex items-center justify-between border-b border-[var(--border)] pb-4">
              <div>
                <span className="font-mono text-[10px] font-black uppercase text-[var(--acc)]">
                  ACTIVE SCIENTIFIC SESSION
                </span>
                <h2 className="text-lg font-black text-[var(--text)]">
                  {currentSession?.title || "No current session"}
                </h2>
                <div className="mt-1 flex items-center gap-3 text-xs text-[var(--muted)]">
                  <span>{currentSession?.start && currentSession?.end ? `${new Date(currentSession.start).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} – ${new Date(currentSession.end).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}` : "Time unavailable"}</span>
                  <span>·</span>
                  <span className="font-bold text-[var(--text)]">{currentSession?.speaker?.name || "Speaker unavailable"}</span>
                  <span>({currentSession?.speaker?.affiliation || "Affiliation unavailable"})</span>
                </div>
              </div>
              <span className="rounded-lg bg-emerald-500/10 border border-emerald-500/30 px-2.5 py-1 font-mono text-[10px] font-bold text-emerald-400">
                {currentSession?.code || "NO CODE"}
              </span>
            </div>

            {/* Presentation Info */}
            <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="rounded-xl border border-[var(--border)] bg-[var(--surf)] p-3 text-xs space-y-1">
                <span className="font-mono text-[9px] font-bold uppercase text-[var(--muted)]">PRESENTATION ASSET</span>
                <div className="font-bold text-[var(--text)] truncate">
                  {currentSession?.presentation?.filename || "No current presentation"}
                </div>
                <div className="flex items-center gap-2 font-mono text-[10px] text-emerald-400">
                  <span>{currentSession?.presentation?.version || "Version unavailable"}</span>
                  <span>·</span>
                  <span>{currentSession?.presentation?.checksum ? "Checksum recorded" : "Checksum unavailable"}</span>
                </div>
              </div>

              <div className="rounded-xl border border-[var(--border)] bg-[var(--surf)] p-3 text-xs space-y-1">
                <span className="font-mono text-[9px] font-bold uppercase text-[var(--muted)]">PRESENTATION TIMER</span>
                <div className="text-xl font-black text-[var(--text)]">
                  {timer.remaining_seconds != null ? `${Math.floor(timer.remaining_seconds / 60).toString().padStart(2, "0")}:${(timer.remaining_seconds % 60).toString().padStart(2, "0")} REMAINING` : "Time unavailable"}
                </div>
                <div className="text-[10px] text-[var(--muted)]">{timer.status || "Timer state unavailable"}</div>
              </div>
            </div>

            {/* Mission-Critical Room Controls Bar */}
            <div className="mt-6 border-t border-[var(--border)] pt-5">
              <span className="block font-mono text-[10px] font-black uppercase tracking-wider text-[var(--muted)] mb-3">
                MISSION-CRITICAL ROOM COMMANDS
              </span>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  disabled={cmdMutation.isPending}
                  onClick={() => cmdMutation.mutate({ command: "launch_presentation", reason: "Operator launched presentation" })}
                  className="btn-pri flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-black shadow-sm"
                >
                  <Play className="size-4" />
                  <span>Launch Presentation</span>
                </button>

                <button
                  disabled={cmdMutation.isPending}
                  onClick={() => cmdMutation.mutate({ command: "pause", reason: "Operator paused presentation" })}
                  className="flex items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--surf)] px-3.5 py-2.5 text-xs font-bold text-[var(--text)] hover:bg-[var(--raised)]"
                >
                  <Pause className="size-4" />
                  <span>Pause</span>
                </button>

                <button
                  disabled={cmdMutation.isPending}
                  onClick={() => cmdMutation.mutate({ command: "stop", reason: "Operator stopped presentation" })}
                  className="flex items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--surf)] px-3.5 py-2.5 text-xs font-bold text-[var(--text)] hover:bg-[var(--raised)]"
                >
                  <Square className="size-4" />
                  <span>Stop</span>
                </button>

                <button
                  disabled={cmdMutation.isPending}
                  onClick={() => cmdMutation.mutate({ command: "reload", reason: "Operator reloaded presentation deck" })}
                  className="flex items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--surf)] px-3.5 py-2.5 text-xs font-bold text-[var(--text)] hover:bg-[var(--raised)]"
                >
                  <RotateCw className="size-4 text-[var(--acc)]" />
                  <span>Reload Deck</span>
                </button>

                <button
                  disabled={cmdMutation.isPending}
                  onClick={() => cmdMutation.mutate({ command: "show_timer", reason: "Operator toggled timer on stage" })}
                  className="flex items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--surf)] px-3.5 py-2.5 text-xs font-bold text-[var(--text)] hover:bg-[var(--raised)]"
                >
                  <Clock className="size-4 text-emerald-400" />
                  <span>Toggle Timer</span>
                </button>

                <button
                  onClick={() => setEmergencyModalOpen(true)}
                  className="flex items-center gap-2 rounded-xl border border-rose-500/40 bg-rose-950/20 px-3.5 py-2.5 text-xs font-bold text-rose-400 hover:bg-rose-950/40"
                >
                  <MessageSquare className="size-4 text-rose-500" />
                  <span>Emergency OSD Message</span>
                </button>
              </div>
            </div>
          </div>

          {/* Upcoming Session Queue */}
          <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5 shadow-sm">
            <h3 className="text-xs font-black uppercase tracking-wider text-[var(--text)] mb-3">
              UPCOMING SESSIONS IN THIS ROOM
            </h3>
            <div className="space-y-2">
              {(data?.upcoming_sessions || []).map((s: any) => (
                <div
                  key={s.id}
                  className="flex items-center justify-between rounded-xl border border-[var(--border)] bg-[var(--surf)] p-3 text-xs"
                >
                  <div className="flex items-center gap-3">
                    <span className="font-mono text-[10px] font-bold text-[var(--muted)]">{s.code}</span>
                    <span className="font-bold text-[var(--text)]">{s.title}</span>
                  </div>
                  <span className="font-mono text-[10px] text-[var(--muted)]">Starts next</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right Col: Separate Tech & Stage App Device Telemetry */}
        <div className="space-y-6">
          {/* Technical App Telemetry */}
          <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5 shadow-sm space-y-3">
            <div className="flex items-center justify-between border-b border-[var(--border)] pb-3">
              <div className="flex items-center gap-2">
                <Monitor className="size-4 text-[var(--pri)]" />
                <h3 className="text-xs font-black uppercase tracking-wider text-[var(--text)]">
                  TECHNICAL APP (OPERATOR PC)
                </h3>
              </div>
              <span className="font-mono text-[10px] font-bold text-emerald-400">
                ● {tech.status?.toUpperCase() || "UNKNOWN"}
              </span>
            </div>

            <div className="space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-[var(--muted)]">Device:</span>
                <span className="font-mono font-bold text-[var(--text)]">{tech.name || "Unavailable"}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[var(--muted)]">IP Address:</span>
                <span className="font-mono text-[var(--text)]">{tech.ip || "Unavailable"}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[var(--muted)]">Current Presentation:</span>
                <span className="font-bold text-[var(--acc)] truncate max-w-[180px]">{tech.current_presentation || "Unavailable"}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[var(--muted)]">CPU / RAM:</span>
                <span className="font-mono text-[var(--text)]">{tech.cpu_pct != null && tech.ram_pct != null ? `${tech.cpu_pct}% / ${tech.ram_pct}%` : "Unavailable"}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[var(--muted)]">App Version:</span>
                <span className="font-mono text-[var(--muted)]">{tech.app_version ? `v${tech.app_version}` : "Unavailable"}</span>
              </div>
            </div>
          </div>

          {/* Stage App Telemetry */}
          <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5 shadow-sm space-y-3">
            <div className="flex items-center justify-between border-b border-[var(--border)] pb-3">
              <div className="flex items-center gap-2">
                <Tv className="size-4 text-emerald-400" />
                <h3 className="text-xs font-black uppercase tracking-wider text-[var(--text)]">
                  STAGE APP (PODIUM DISPLAY)
                </h3>
              </div>
              <span className="font-mono text-[10px] font-bold text-emerald-400">
                ● {stage.status?.toUpperCase() || "UNKNOWN"}
              </span>
            </div>

            <div className="space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-[var(--muted)]">Device:</span>
                <span className="font-mono font-bold text-[var(--text)]">{stage.name || "Unavailable"}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[var(--muted)]">IP Address:</span>
                <span className="font-mono text-[var(--text)]">{stage.ip || "Unavailable"}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[var(--muted)]">Playing Deck:</span>
                <span className="font-bold text-emerald-400 truncate max-w-[180px]">{stage.playing_presentation || "Unavailable"}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[var(--muted)]">Version Cached:</span>
                <span className="font-mono font-bold text-[var(--acc)]">{stage.version_cached || "Unavailable"}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[var(--muted)]">CPU Usage:</span>
                <span className="font-mono text-[var(--text)]">{stage.cpu_pct != null ? `${stage.cpu_pct}%` : "Unavailable"}</span>
              </div>
            </div>
          </div>

          {/* Moderator & Timer Nodes */}
          <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5 shadow-sm space-y-3 text-xs">
            <h3 className="text-xs font-black uppercase tracking-wider text-[var(--text)] border-b border-[var(--border)] pb-3">
              PERIPHERAL ROOM NODES
            </h3>

            <div className="flex items-center justify-between">
              <span className="text-[var(--muted)]">Moderator Tablet:</span>
              <span className="font-bold text-amber-300">● {moderator.status?.toUpperCase() || "UNKNOWN"}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[var(--muted)]">Stage Timer Display:</span>
              <span className="font-bold text-amber-300">● {timer.status?.toUpperCase() || "UNKNOWN"}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Emergency OSD Modal */}
      {emergencyModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-rose-500/40 bg-[var(--surf)] p-6 shadow-2xl space-y-4">
            <div className="flex items-center gap-3">
              <div className="flex size-10 items-center justify-center rounded-xl bg-rose-500/20 text-rose-500">
                <AlertTriangle className="size-5" />
              </div>
              <div>
                <h3 className="text-sm font-black uppercase text-[var(--text)]">
                  Emergency Room Broadcast
                </h3>
                <p className="text-xs text-[var(--muted)]">Display banner on {room?.name} Stage and Tech screens</p>
              </div>
            </div>

            <textarea
              rows={3}
              value={emergencyMessage}
              onChange={(e) => setEmergencyMessage(e.target.value)}
              placeholder="e.g. Session extended by 10 minutes. Please conclude Q&A."
              className="w-full rounded-xl border border-[var(--border)] bg-[var(--card)] p-3 text-xs text-[var(--text)] focus:border-rose-500 focus:outline-none"
            />

            <div className="flex justify-end gap-2">
              <button
                onClick={() => setEmergencyModalOpen(false)}
                className="rounded-xl border border-[var(--border)] px-4 py-2 text-xs font-bold text-[var(--muted)] hover:text-[var(--text)]"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  cmdMutation.mutate({
                    command: "emergency_message",
                    reason: emergencyMessage || "Emergency Broadcast",
                    payload: { message: emergencyMessage }
                  });
                  setEmergencyModalOpen(false);
                }}
                className="rounded-xl bg-rose-600 px-4 py-2 text-xs font-bold text-white hover:bg-rose-500"
              >
                Send Broadcast
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
