"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  HardDrive, Users, CheckCircle2, AlertTriangle, ArrowRight,
  RefreshCw, RotateCw, Lock, Send, Monitor, FileText, QrCode,
  Check, X, Layers
} from "lucide-react";
import { toast } from "sonner";
import { apiClient } from "@/lib/api-client";
import { cn } from "@/lib/utils";

export default function SRRWorkspacePage() {
  const queryClient = useQueryClient();
  const [selectedStation, setSelectedStation] = useState<number | null>(null);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["srr-fleet-data"],
    queryFn: () => apiClient.get<any>("/venue/admin/control/srr-fleet"),
    refetchInterval: 5000,
  });

  const cmdMutation = useMutation({
    mutationFn: ({ stationNumber, command, reason }: { stationNumber: number; command: string; reason: string }) =>
      apiClient.post(`/venue/admin/control/srr/stations/${stationNumber}/command`, {
        command,
        reason,
      }),
    onSuccess: (_, vars) => {
      toast.success(`Station SRR-${String(vars.stationNumber).padStart(2, "0")} command executed`);
      refetch();
    },
    onError: (err: any) => {
      toast.error(`Action failed: ${err.message || "Error"}`);
    }
  });

  const srr = data || {};
  const stations = srr.stations || [];
  const checkin = srr.checkin_node || {};
  const recentFiles = srr.recent_files || [];

  return (
    <div className="mx-auto flex w-full max-w-[1720px] flex-col gap-6 pb-12">
      {/* Header */}
      <div className="flex flex-col justify-between gap-4 border-b border-[var(--border)] pb-5 md:flex-row md:items-end">
        <div>
          <div className="flex items-center gap-2">
            <HardDrive className="size-4 text-amber-400" />
            <span className="font-mono text-[10px] font-black uppercase tracking-widest text-[var(--acc)]">
              WORKSPACE 04 · SPEAKER READY ROOM (SRR)
            </span>
          </div>
          <h1 className="mt-1 text-2xl font-black uppercase tracking-tight text-[var(--text)] sm:text-3xl">
            SRR Control & Fleet Manager
          </h1>
          <p className="text-xs font-semibold text-[var(--muted)]">
            {stations.length} Stations · {checkin?.hostname || "1 Check-in Node"} · Operational Brain
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Link
            href="/dashboard/content"
            className="flex h-10 items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--card)] px-4 text-xs font-bold text-[var(--text)] hover:bg-[var(--raised)]"
          >
            <FileText className="size-3.5 text-[var(--acc)]" />
            <span>SRR File Center & Versions →</span>
          </Link>

          <button
            onClick={() => refetch()}
            className="flex h-10 items-center gap-1.5 rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 text-xs font-bold text-[var(--muted)] hover:text-[var(--text)]"
          >
            <RefreshCw className="size-3.5" />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* Top 2 Cards: SRR Master Status & Check-in Node Monitor */}
      <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
        {/* SRR Status Banner */}
        <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-5 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between">
              <span className="font-mono text-[10px] font-black uppercase text-emerald-400">SRR CLUSTER STATE</span>
              <span className="size-2 rounded-full bg-emerald-400 animate-pulse" />
            </div>
            <div className="mt-2 text-2xl font-black text-emerald-300">● SRR READY</div>
            <p className="mt-1 text-xs text-[var(--muted)]">
              {stations.length} Stations Configured · Local Media Hub Active
            </p>
          </div>
          <div className="mt-4 flex items-center gap-2 font-mono text-[11px] text-emerald-400 font-bold">
            <span>Available Stations:</span>
            <span>{srr.available_stations?.length ? srr.available_stations.join(", ") : "All in use / Standby"}</span>
          </div>
        </div>

        {/* Check-in Node Control */}
        <div className="md:col-span-2 rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5 shadow-sm space-y-4">
          <div className="flex items-center justify-between border-b border-[var(--border)] pb-3">
            <div className="flex items-center gap-2">
              <QrCode className="size-4 text-[var(--pri)]" />
              <h3 className="text-xs font-black uppercase tracking-wider text-[var(--text)]">
                CHECK-IN INTAKE NODE MONITOR
              </h3>
            </div>
            <span className="font-mono text-[10px] font-bold text-emerald-400">● {checkin.status || "CONNECTED"}</span>
          </div>

          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 text-xs">
            <div>
              <span className="font-mono text-[9px] uppercase text-[var(--muted)]">Last QR Scan</span>
              <div className="mt-0.5 font-mono font-bold text-[var(--text)]">{checkin.last_scan_time || "09:41:23"}</div>
            </div>
            <div>
              <span className="font-mono text-[9px] uppercase text-[var(--muted)]">Speaker Scanned</span>
              <div className="mt-0.5 font-bold text-[var(--text)]">{checkin.last_speaker || "Dr. Sharma"}</div>
            </div>
            <div>
              <span className="font-mono text-[9px] uppercase text-[var(--muted)]">Assigned Station</span>
              <div className="mt-0.5 font-mono font-bold text-[var(--acc)]">{checkin.assigned_station || "SRR-02"}</div>
            </div>
            <div>
              <span className="font-mono text-[9px] uppercase text-[var(--muted)]">Intake State</span>
              <div className="mt-0.5 font-bold text-emerald-400">{checkin.status_text || "READY FOR SPEAKER"}</div>
            </div>
          </div>
        </div>
      </div>

      {/* SRR Stations Matrix */}
      <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5 shadow-sm">
        <div className="flex items-center justify-between border-b border-[var(--border)] pb-4">
          <div>
            <h2 className="text-sm font-black uppercase tracking-wider text-[var(--text)]">
              SRR STATIONS FLEET (5 WORKSTATIONS)
            </h2>
            <p className="text-xs text-[var(--muted)]">Operator monitoring, speaker assignment, upload progress, and remote station intervention</p>
          </div>
        </div>

        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-[var(--border)] bg-[var(--surf)] font-mono text-[10px] font-black uppercase text-[var(--muted)]">
                <th className="p-3.5">Station</th>
                <th className="p-3.5">Assigned Speaker</th>
                <th className="p-3.5">Status</th>
                <th className="p-3.5">Current Working File</th>
                <th className="p-3.5">CPU / RAM / Disk</th>
                <th className="p-3.5">Agent Version</th>
                <th className="p-3.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border)]">
              {stations.map((st: any) => {
                const isWorking = st.status === "occupied";
                const isUploading = st.status === "uploading";
                const isAvailable = st.status === "idle";

                return (
                  <tr key={st.station_number} className="hover:bg-[var(--raised)] transition-colors">
                    <td className="p-3.5 font-mono font-bold text-[var(--text)]">
                      <div className="flex items-center gap-2">
                        <span className="flex size-2 rounded-full bg-emerald-500" />
                        <span>{st.station_code}</span>
                      </div>
                      <div className="text-[10px] text-[var(--muted)]">{st.ip_address}</div>
                    </td>

                    <td className="p-3.5 font-bold text-[var(--text)]">
                      {st.speaker || "—"}
                    </td>

                    <td className="p-3.5">
                      <span className={cn(
                        "rounded-lg px-2 py-0.5 font-mono text-[10px] font-black uppercase",
                        isWorking
                          ? "bg-blue-500/15 text-blue-400 border border-blue-500/30"
                          : isUploading
                          ? "bg-amber-500/15 text-amber-400 border border-amber-500/30"
                          : "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30"
                      )}>
                        ● {st.status_text}
                      </span>
                    </td>

                    <td className="p-3.5 font-mono text-[11px] text-[var(--acc)] truncate max-w-[200px]">
                      {st.current_file || "—"}
                    </td>

                    <td className="p-3.5 font-mono text-[11px] text-[var(--text)]">
                      {st.cpu_pct}% / {st.ram_pct}% / <span className={cn(st.disk_pct > 90 && "text-rose-400 font-bold")}>{st.disk_pct}%</span>
                    </td>

                    <td className="p-3.5 font-mono text-[10px] text-[var(--muted)]">
                      v{st.agent_version}
                    </td>

                    <td className="p-3.5 text-right space-x-1.5">
                      {isWorking && (
                        <button
                          onClick={() => cmdMutation.mutate({ stationNumber: st.station_number, command: "force_release", reason: "Force station release" })}
                          className="rounded-lg border border-[var(--border)] bg-[var(--card)] px-2.5 py-1 text-[10px] font-bold text-[var(--text)] hover:bg-[var(--raised)]"
                        >
                          Release
                        </button>
                      )}
                      <button
                        onClick={() => cmdMutation.mutate({ stationNumber: st.station_number, command: "restart_agent", reason: "Restart SRR Agent" })}
                        className="rounded-lg border border-[var(--border)] bg-[var(--card)] px-2.5 py-1 text-[10px] font-bold text-[var(--muted)] hover:text-[var(--text)]"
                      >
                        Restart
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* SRR Recent File Submissions & Distribution Pipeline */}
      <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5 shadow-sm">
        <div className="flex items-center justify-between border-b border-[var(--border)] pb-4">
          <div>
            <h2 className="text-sm font-black uppercase tracking-wider text-[var(--text)]">
              SRR FILE DISTRIBUTION MATRIX
            </h2>
            <p className="text-xs text-[var(--muted)]">Non-destructive version tracking across SRR cluster, Room Tech PC, and Stage PC</p>
          </div>
        </div>

        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-[var(--border)] bg-[var(--surf)] font-mono text-[10px] font-black uppercase text-[var(--muted)]">
                <th className="p-3.5">Speaker</th>
                <th className="p-3.5">Session / Room</th>
                <th className="p-3.5">File & Version</th>
                <th className="p-3.5">Modified</th>
                <th className="p-3.5 text-center">SRR Fleet</th>
                <th className="p-3.5 text-center">Room Tech</th>
                <th className="p-3.5 text-center">Room Stage</th>
                <th className="p-3.5 text-right">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border)]">
              {recentFiles.map((file: any) => (
                <tr key={file.id} className="hover:bg-[var(--raised)] transition-colors">
                  <td className="p-3.5 font-bold text-[var(--text)]">
                    {file.speaker}
                  </td>
                  <td className="p-3.5">
                    <div className="font-bold text-[var(--text)]">{file.session}</div>
                    <div className="text-[10px] text-[var(--muted)]">{file.room}</div>
                  </td>
                  <td className="p-3.5 font-mono text-[11px] text-[var(--acc)]">
                    {file.filename} <span className="font-bold text-[var(--text)] font-sans">({file.version})</span>
                  </td>
                  <td className="p-3.5 font-mono text-[10px] text-[var(--muted)]">
                    {file.modified}
                  </td>
                  <td className="p-3.5 text-center font-mono font-bold text-emerald-400">
                    {file.srr_status}
                  </td>
                  <td className="p-3.5 text-center font-mono font-bold text-emerald-400">
                    {file.tech_status}
                  </td>
                  <td className="p-3.5 text-center font-mono font-bold text-emerald-400">
                    {file.stage_status}
                  </td>
                  <td className="p-3.5 text-right">
                    <span className="rounded-lg bg-emerald-500/10 border border-emerald-500/30 px-2 py-0.5 font-mono text-[10px] font-bold text-emerald-400">
                      ● {file.distribution_status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
