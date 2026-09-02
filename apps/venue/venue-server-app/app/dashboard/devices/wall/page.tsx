"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import {
  Layers, Monitor, HardDrive, Users, Tv, Boxes,
  AlertTriangle, CheckCircle2, RefreshCw, Filter, ArrowRight, Loader2
} from "lucide-react";
import { apiClient } from "@/lib/api-client";
import { cn } from "@/lib/utils";

type FilterType = "All" | "Rooms" | "SRR" | "Registration" | "Signage" | "ePoster" | "Warning" | "Offline";

export default function DeviceWallPage() {
  const [activeFilter, setActiveFilter] = useState<FilterType>("All");

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["device-wall-data"],
    queryFn: () => apiClient.get<any>("/venue/admin/control/devices/wall"),
    refetchInterval: 5000,
  });

  const allDevices = data?.devices || [];
  const onlineCount = data?.online_count || 0;
  const warningCount = data?.warning_count || 0;
  const offlineCount = data?.offline_count || 0;

  const filteredDevices = allDevices.filter((d: any) => {
    if (activeFilter === "All") return true;
    if (activeFilter === "Offline") return d.status === "offline";
    if (activeFilter === "Warning") return d.status === "stale" || d.status === "degraded";
    return d.service_category === activeFilter;
  });

  return (
    <div className="mx-auto flex w-full max-w-[1720px] flex-col gap-6 pb-12">
      {/* Header */}
      <div className="flex flex-col justify-between gap-4 border-b border-[var(--border)] pb-5 md:flex-row md:items-end">
        <div>
          <div className="flex items-center gap-2">
            <Layers className="size-4 text-purple-400" />
            <span className="font-mono text-[10px] font-black uppercase tracking-widest text-[var(--acc)]">
              WORKSPACE 06 · NOC FLEET MATRIX
            </span>
          </div>
          <h1 className="mt-1 text-2xl font-black uppercase tracking-tight text-[var(--text)] sm:text-3xl">
            Live Device Wall
          </h1>
          <p className="text-xs font-semibold text-[var(--muted)]">
            High-density operational wall monitoring {allDevices.length} registered venue workstations, endpoints, and displays
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Link
            href="/dashboard/devices"
            className="flex h-10 items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--card)] px-3.5 text-xs font-bold text-[var(--text)] hover:bg-[var(--raised)]"
          >
            <Monitor className="size-3.5" />
            <span>Table Fleet View →</span>
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

      {/* Filter Tabs with safe contrast */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border)] pb-4">
        <div className="flex flex-wrap items-center gap-1.5">
          {(["All", "Rooms", "SRR", "Registration", "Signage", "ePoster", "Warning", "Offline"] as FilterType[]).map((f) => (
            <button
              key={f}
              onClick={() => setActiveFilter(f)}
              className={cn(
                "rounded-xl px-3.5 py-1.5 text-xs font-bold transition-all",
                activeFilter === f
                  ? "tab-active shadow-sm"
                  : "border border-[var(--border)] bg-[var(--card)] text-[var(--muted)] hover:text-[var(--text)]"
              )}
            >
              {f}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-3 font-mono text-xs">
          <span className="text-emerald-400 font-bold">● {onlineCount} Online</span>
          <span className="text-amber-400 font-bold">● {warningCount} Warning</span>
          <span className="text-rose-400 font-bold">● {offlineCount} Offline</span>
        </div>
      </div>

      {isLoading ? (
        <div className="flex h-64 items-center justify-center">
          <Loader2 className="size-7 animate-spin text-[var(--acc)]" />
        </div>
      ) : (
        /* Wall Matrix Grid */
        <div className="grid grid-cols-2 gap-3.5 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
          {filteredDevices.map((d: any) => {
            const isOnline = d.status === "healthy";
            const isOffline = d.status === "offline";
            const isWarning = d.status === "stale" || d.status === "degraded";

            return (
              <div
                key={d.id}
                className={cn(
                  "flex flex-col justify-between rounded-2xl border p-3.5 transition-all shadow-sm",
                  isOffline
                    ? "border-rose-500/40 bg-rose-950/20"
                    : isWarning
                    ? "border-amber-500/40 bg-amber-950/15"
                    : "border-[var(--border)] bg-[var(--card)] hover:border-[var(--acc)]"
                )}
              >
                <div>
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-[9px] font-bold text-[var(--muted)] truncate max-w-[90px]">
                      {d.service_category}
                    </span>
                    <span className={cn(
                      "flex items-center gap-1 rounded px-1.5 py-0.5 font-mono text-[9px] font-black uppercase",
                      isOffline
                        ? "bg-rose-500/20 text-rose-400"
                        : isWarning
                        ? "bg-amber-500/20 text-amber-400"
                        : "bg-emerald-500/20 text-emerald-400"
                    )}>
                      ● {isOffline ? "OFFLINE" : isWarning ? "WARN" : "ONLINE"}
                    </span>
                  </div>

                  <div className="mt-2">
                    <h4 className="text-xs font-black text-[var(--text)] truncate">{d.name}</h4>
                    <p className="text-[10px] text-[var(--muted)] truncate">{d.room_name}</p>
                  </div>

                  {/* Hardware Telemetry */}
                  <div className="mt-3 space-y-1 rounded-xl bg-[var(--surf)] border border-[var(--border)] p-2 font-mono text-[9px]">
                    <div className="flex justify-between">
                      <span className="text-[var(--muted)]">IP:</span>
                      <span className="text-[var(--text)]">{d.ip_address}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-[var(--muted)]">CPU:</span>
                      <span className="font-bold text-[var(--text)]">{d.cpu_pct}%</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-[var(--muted)]">App:</span>
                      <span className="text-[var(--muted)]">v{d.app_version}</span>
                    </div>
                  </div>
                </div>

                <Link
                  href={`/dashboard/devices?inspect=${d.id}`}
                  className="mt-3 flex items-center justify-center gap-1 rounded-lg border border-[var(--border)] bg-[var(--surf)] py-1 text-[10px] font-bold text-[var(--text)] hover:bg-[var(--raised)] transition-colors"
                >
                  <span>Inspect</span>
                  <ArrowRight className="size-3" />
                </Link>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
