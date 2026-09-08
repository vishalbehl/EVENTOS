"use client";

import { useQuery } from "@tanstack/react-query";
import {
  Activity, Cpu, HardDrive, Network, Database, 
  Clock, RefreshCw, Zap, Server, Loader2
} from "lucide-react";
import { apiClient } from "@/lib/api-client";
import { cn } from "@/lib/utils";

export default function PerformanceDashboardPage() {
  const { data, isLoading, refetch } = useQuery({
    queryKey: ["performance-metrics-data"],
    queryFn: () => apiClient.get<any>("/venue/admin/control/performance"),
    refetchInterval: 3000,
  });

  const apiLat = data?.api_latency;
  const wsLat = data?.websocket_latency;
  const resources = data?.resources;
  const metric = (value: unknown, suffix = "") =>
    typeof value === "number" ? `${value}${suffix}` : "—";
  const percentWidth = (value: unknown) =>
    typeof value === "number" ? `${Math.max(0, Math.min(100, value))}%` : "0%";

  return (
    <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-6 pb-12">
      {/* Header */}
      <div className="flex flex-col justify-between gap-4 border-b border-[var(--border)] pb-5 md:flex-row md:items-end">
        <div>
          <div className="flex items-center gap-2">
            <Activity className="size-4 text-emerald-400" />
            <span className="font-mono text-[10px] font-black uppercase tracking-widest text-[var(--acc)]">
              ADMINISTRATION · NOC TELEMETRY & LATENCY
            </span>
          </div>
          <h1 className="mt-1 text-2xl font-black uppercase tracking-tight text-[var(--text)] sm:text-3xl">
            Venue Server Performance
          </h1>
          <p className="text-xs font-semibold text-[var(--muted)]">
            Live p50, p95, p99 percentile API latency, WebSocket heartbeat jitter, and hardware utilization curves
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => refetch()}
            className="flex h-10 items-center gap-1.5 rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 text-xs font-bold text-[var(--muted)] hover:text-[var(--text)]"
          >
            <RefreshCw className="size-3.5" />
            <span>Live Stream</span>
          </button>
        </div>
      </div>

      {isLoading ? (
        <div className="flex h-64 items-center justify-center">
          <Loader2 className="size-7 animate-spin text-[var(--acc)]" />
        </div>
      ) : (
        <>
          {/* Latency Percentiles Grid */}
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            {/* API Latency */}
            <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-6 shadow-sm space-y-4">
              <div className="flex items-center justify-between border-b border-[var(--border)] pb-3">
                <h2 className="text-xs font-black uppercase tracking-wider text-[var(--text)]">
                  REST API RESPONSE LATENCY (PERCENTILES)
                </h2>
                <span className="font-mono text-[10px] font-bold text-[var(--muted)]">● SERVER TELEMETRY</span>
              </div>

              <div className="grid grid-cols-3 gap-3 text-center">
                <div className="rounded-xl border border-[var(--border)] bg-[var(--surf)] p-4">
                  <span className="font-mono text-[10px] font-black uppercase text-[var(--muted)]">p50 MEDIAN</span>
                  <div className="mt-1 text-2xl font-black text-emerald-400">{metric(apiLat?.p50, " ms")}</div>
                </div>
                <div className="rounded-xl border border-[var(--border)] bg-[var(--surf)] p-4">
                  <span className="font-mono text-[10px] font-black uppercase text-[var(--muted)]">p95 TAIL</span>
                  <div className="mt-1 text-2xl font-black text-blue-400">{metric(apiLat?.p95, " ms")}</div>
                </div>
                <div className="rounded-xl border border-[var(--border)] bg-[var(--surf)] p-4">
                  <span className="font-mono text-[10px] font-black uppercase text-[var(--muted)]">p99 WORST</span>
                  <div className="mt-1 text-2xl font-black text-amber-400">{metric(apiLat?.p99, " ms")}</div>
                </div>
              </div>
            </div>

            {/* WebSocket Heartbeat Latency */}
            <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-6 shadow-sm space-y-4">
              <div className="flex items-center justify-between border-b border-[var(--border)] pb-3">
                <h2 className="text-xs font-black uppercase tracking-wider text-[var(--text)]">
                  WEBSOCKET EVENT BUS JITTER
                </h2>
                <span className="font-mono text-[10px] font-bold text-[var(--muted)]">● SERVER TELEMETRY</span>
              </div>

              <div className="grid grid-cols-3 gap-3 text-center">
                <div className="rounded-xl border border-[var(--border)] bg-[var(--surf)] p-4">
                  <span className="font-mono text-[10px] font-black uppercase text-[var(--muted)]">p50 JITTER</span>
                  <div className="mt-1 text-2xl font-black text-emerald-400">{metric(wsLat?.p50, " ms")}</div>
                </div>
                <div className="rounded-xl border border-[var(--border)] bg-[var(--surf)] p-4">
                  <span className="font-mono text-[10px] font-black uppercase text-[var(--muted)]">p95 JITTER</span>
                  <div className="mt-1 text-2xl font-black text-blue-400">{metric(wsLat?.p95, " ms")}</div>
                </div>
                <div className="rounded-xl border border-[var(--border)] bg-[var(--surf)] p-4">
                  <span className="font-mono text-[10px] font-black uppercase text-[var(--muted)]">p99 JITTER</span>
                  <div className="mt-1 text-2xl font-black text-emerald-400">{metric(wsLat?.p99, " ms")}</div>
                </div>
              </div>
            </div>
          </div>

          {/* Hardware Utilization Matrix */}
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5 space-y-2">
              <div className="flex items-center justify-between text-[var(--muted)]">
                <span className="font-mono text-[10px] font-black uppercase">CPU LOAD</span>
                <Cpu className="size-4 text-[var(--acc)]" />
              </div>
              <div className="text-3xl font-black text-[var(--text)]">{metric(resources?.cpu_pct, "%")}</div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-[var(--raised)]">
                <div className="h-full bg-[var(--acc)]" style={{ width: percentWidth(resources?.cpu_pct) }} />
              </div>
            </div>

            <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5 space-y-2">
              <div className="flex items-center justify-between text-[var(--muted)]">
                <span className="font-mono text-[10px] font-black uppercase">RAM USAGE</span>
                <Server className="size-4 text-purple-400" />
              </div>
              <div className="text-3xl font-black text-[var(--text)]">{metric(resources?.ram_pct, "%")}</div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-[var(--raised)]">
                <div className="h-full bg-purple-500" style={{ width: percentWidth(resources?.ram_pct) }} />
              </div>
            </div>

            <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5 space-y-2">
              <div className="flex items-center justify-between text-[var(--muted)]">
                <span className="font-mono text-[10px] font-black uppercase">NVME STORAGE</span>
                <HardDrive className="size-4 text-emerald-400" />
              </div>
              <div className="text-3xl font-black text-[var(--text)]">{metric(resources?.disk_pct, "%")}</div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-[var(--raised)]">
                <div className="h-full bg-emerald-500" style={{ width: percentWidth(resources?.disk_pct) }} />
              </div>
            </div>

            <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5 space-y-2">
              <div className="flex items-center justify-between text-[var(--muted)]">
                <span className="font-mono text-[10px] font-black uppercase">NETWORK UTIL</span>
                <Network className="size-4 text-cyan-400" />
              </div>
              <div className="text-3xl font-black text-[var(--text)]">{metric(resources?.network_pct, "%")}</div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-[var(--raised)]">
                <div className="h-full bg-cyan-500" style={{ width: percentWidth(resources?.network_pct) }} />
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
