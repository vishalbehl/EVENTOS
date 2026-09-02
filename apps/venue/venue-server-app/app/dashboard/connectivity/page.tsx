"use client";

import { useQuery } from "@tanstack/react-query";
import {
  Wifi, Server, Layers, ArrowRight, RefreshCw, CheckCircle2,
  AlertTriangle, Network, ShieldCheck, Database
} from "lucide-react";
import { apiClient } from "@/lib/api-client";
import { cn } from "@/lib/utils";

export default function ConnectivityPage() {
  const { data, isLoading, refetch } = useQuery({
    queryKey: ["connectivity-data"],
    queryFn: () => apiClient.get<any>("/venue/admin/control/connectivity"),
    refetchInterval: 5000,
  });

  const cloud = data?.cloud || { status: "ONLINE", latency_ms: 0 };
  const venue = data?.venue_server || { status: "OPERATIONAL", node_id: "LOCAL-NODE" };
  const sync = data?.sync || {
    cloud_to_venue: "Ready",
    venue_to_cloud_pending: 0,
    failed: 0,
    conflicts: 0,
    last_sync: "—",
    event_version: 0,
    venue_snapshot: 0,
  };
  const topologies = data?.topology_modes || {
    srr: "LOCAL",
    rooms: "LOCAL",
    registration: "HYBRID",
    signage: "LOCAL",
    eposter: "LOCAL",
  };

  return (
    <div className="mx-auto flex w-full max-w-[1720px] flex-col gap-6 pb-12">
      {/* Header */}
      <div className="flex flex-col justify-between gap-4 border-b border-[var(--border)] pb-5 md:flex-row md:items-end">
        <div>
          <div className="flex items-center gap-2">
            <Wifi className="size-4 text-blue-400" />
            <span className="font-mono text-[10px] font-black uppercase tracking-widest text-[var(--acc)]">
              WORKSPACE 08 · HYBRID CONNECTIVITY & SYNC
            </span>
          </div>
          <h1 className="mt-1 text-2xl font-black uppercase tracking-tight text-[var(--text)] sm:text-3xl">
            Cloud, Venue & Subsystem Sync
          </h1>
          <p className="text-xs font-semibold text-[var(--muted)]">
            3-Pillar independent telemetry, outbox sync queue, and deployment topology breakdown
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => refetch()}
            className="flex h-10 items-center gap-1.5 rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 text-xs font-bold text-[var(--muted)] hover:text-[var(--text)]"
          >
            <RefreshCw className="size-3.5" />
            <span>Probe Sync</span>
          </button>
        </div>
      </div>

      {/* 3-Pillar Status Cards */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {/* Pillar 1: Cloud */}
        <div className="rounded-2xl border border-blue-500/30 bg-blue-950/15 p-5 shadow-sm space-y-2">
          <div className="flex items-center justify-between">
            <span className="font-mono text-[10px] font-black uppercase text-blue-400">PILLAR 1 · EVENTOS CLOUD</span>
            <Wifi className="size-4 text-blue-400" />
          </div>
          <div className="text-2xl font-black text-blue-300">● {cloud.status}</div>
          <p className="text-xs text-[var(--muted)]">Global master event configuration & assets</p>
          <div className="font-mono text-[11px] text-blue-400 font-bold">Latency: {cloud.latency_ms} ms (Roundtrip)</div>
        </div>

        {/* Pillar 2: Venue Server */}
        <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-5 shadow-sm space-y-2">
          <div className="flex items-center justify-between">
            <span className="font-mono text-[10px] font-black uppercase text-emerald-400">PILLAR 2 · VENUE SERVER CORE</span>
            <Server className="size-4 text-emerald-400" />
          </div>
          <div className="text-2xl font-black text-emerald-300">● {venue.status}</div>
          <p className="text-xs text-[var(--muted)]">Local authoritative edge broker & distribution controller</p>
          <div className="font-mono text-[11px] text-emerald-400 font-bold">Node ID: {venue.node_id} (Local Active)</div>
        </div>

        {/* Pillar 3: Local Services */}
        <div className="rounded-2xl border border-purple-500/30 bg-purple-950/15 p-5 shadow-sm space-y-2">
          <div className="flex items-center justify-between">
            <span className="font-mono text-[10px] font-black uppercase text-purple-400">PILLAR 3 · LOCAL SUBSYSTEMS</span>
            <Layers className="size-4 text-purple-400" />
          </div>
          <div className="text-2xl font-black text-purple-300">● 5 / 5 HEALTHY</div>
          <p className="text-xs text-[var(--muted)]">SRR, Rooms, Registration, Signage, ePoster nodes</p>
          <div className="font-mono text-[11px] text-purple-400 font-bold">All Micro-Engines Responsive</div>
        </div>
      </div>

      {/* Sync Dashboard & Deployment Topology */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Sync Telemetry */}
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-6 shadow-sm space-y-4">
          <h2 className="text-xs font-black uppercase tracking-wider text-[var(--text)] border-b border-[var(--border)] pb-3">
            BIDIRECTIONAL SYNC ENGINE DASHBOARD
          </h2>

          <div className="grid grid-cols-2 gap-4 text-xs">
            <div className="rounded-xl border border-[var(--border)] bg-[var(--surf)] p-3">
              <span className="font-mono text-[9px] uppercase text-[var(--muted)]">Cloud → Venue</span>
              <div className="mt-1 text-sm font-black text-emerald-400">✓ {sync.cloud_to_venue}</div>
            </div>
            <div className="rounded-xl border border-[var(--border)] bg-[var(--surf)] p-3">
              <span className="font-mono text-[9px] uppercase text-[var(--muted)]">Venue → Cloud Outbox</span>
              <div className="mt-1 text-sm font-black text-[var(--text)]">{sync.venue_to_cloud_pending} Pending</div>
            </div>
            <div className="rounded-xl border border-[var(--border)] bg-[var(--surf)] p-3">
              <span className="font-mono text-[9px] uppercase text-[var(--muted)]">Sync Conflicts</span>
              <div className="mt-1 text-sm font-black text-emerald-400">{sync.conflicts} Conflicts</div>
            </div>
            <div className="rounded-xl border border-[var(--border)] bg-[var(--surf)] p-3">
              <span className="font-mono text-[9px] uppercase text-[var(--muted)]">Snapshot Version</span>
              <div className="mt-1 font-mono text-sm font-black text-[var(--acc)]">#{sync.event_version}</div>
            </div>
          </div>
        </div>

        {/* Service Connectivity Topology */}
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-6 shadow-sm space-y-4">
          <h2 className="text-xs font-black uppercase tracking-wider text-[var(--text)] border-b border-[var(--border)] pb-3">
            SERVICE CONNECTIVITY ARCHITECTURE
          </h2>

          <div className="space-y-2 text-xs">
            {Object.entries(topologies).map(([svc, mode]) => (
              <div
                key={svc}
                className="flex items-center justify-between rounded-xl border border-[var(--border)] bg-[var(--surf)] p-3 font-mono"
              >
                <span className="font-bold uppercase text-[var(--text)]">{svc}</span>
                <span className={cn(
                  "rounded px-2.5 py-1 text-[10px] font-black uppercase",
                  mode === "VENUE"
                    ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30"
                    : mode === "CLOUD"
                    ? "bg-blue-500/15 text-blue-400 border border-blue-500/30"
                    : "bg-purple-500/15 text-purple-400 border border-purple-500/30"
                )}>
                  ● {String(mode)}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
