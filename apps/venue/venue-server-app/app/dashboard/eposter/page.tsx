"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Boxes,
  CheckCircle2,
  HardDrive,
  Monitor,
  RefreshCw,
  RotateCcw,
  Search,
  Send,
  Tv,
  Wifi,
} from "lucide-react";
import { toast } from "sonner";
import { apiClient } from "@/lib/api-client";
import { cn } from "@/lib/utils";

export default function EposterDisplaysPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["eposter-displays-data"],
    queryFn: () => apiClient.get<any>("/venue/admin/control/devices/wall"),
    refetchInterval: 6000,
  });

  const allDevices: any[] = data?.devices || [];
  const eposterDevices = allDevices.filter(
    (d) => d.service_category === "ePoster" || d.name?.toLowerCase().includes("eposter")
  );

  const commandMutation = useMutation({
    mutationFn: ({ id, command }: { id: string; command: string }) =>
      apiClient.post(`/venue/admin/control/commands/device/${id}`, {
        command,
        reason: `Operator executed ${command} on ePoster display`,
      }),
    onSuccess: () => {
      toast.success("Command dispatched to ePoster terminal");
      refetch();
    },
    onError: (err: any) => {
      toast.error(err.message || "Failed to dispatch command");
    },
  });

  const filtered = eposterDevices.filter(
    (d) =>
      d.name?.toLowerCase().includes(search.toLowerCase()) ||
      d.ip_address?.includes(search) ||
      d.room_name?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="mx-auto flex w-full max-w-[1720px] flex-col gap-6 pb-12">
      {/* Header */}
      <div className="flex flex-col justify-between gap-4 border-b border-[var(--border)] pb-5 md:flex-row md:items-end">
        <div>
          <div className="flex items-center gap-2">
            <Boxes className="size-4 text-cyan-400" />
            <span className="font-mono text-[10px] font-black uppercase tracking-widest text-[var(--acc)]">
              SERVICES · DIGITAL EPOSTER KIOSKS & SCREENS
            </span>
          </div>
          <h1 className="mt-1 text-2xl font-black uppercase tracking-tight text-[var(--text)] sm:text-3xl">
            ePoster Displays & Terminals
          </h1>
          <p className="text-xs font-semibold text-[var(--muted)]">
            Monitor digital research poster kiosks, interactive terminals, PDF render engines, and active delegate touch sessions.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => refetch()}
            className="flex h-10 items-center gap-1.5 rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 text-xs font-bold text-[var(--muted)] hover:text-[var(--text)]"
          >
            <RefreshCw className="size-3.5" />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* Metrics */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4 shadow-sm">
          <span className="font-mono text-[10px] font-black uppercase text-[var(--muted)]">EPOSTER KIOSKS</span>
          <div className="mt-1 text-2xl font-black text-[var(--text)]">{eposterDevices.length} Terminals</div>
        </div>

        <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-4 shadow-sm">
          <span className="font-mono text-[10px] font-black uppercase text-emerald-400">ONLINE SCREENS</span>
          <div className="mt-1 text-2xl font-black text-emerald-300">
            {eposterDevices.filter((d) => d.status === "healthy" || d.status === "online").length} Online
          </div>
        </div>

        <div className="rounded-2xl border border-cyan-500/30 bg-cyan-950/15 p-4 shadow-sm">
          <span className="font-mono text-[10px] font-black uppercase text-cyan-400">CACHE STATUS</span>
          <div className="mt-1 text-2xl font-black text-cyan-300">Synchronized</div>
        </div>

        <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4 shadow-sm">
          <span className="font-mono text-[10px] font-black uppercase text-[var(--muted)]">INTERACTION MODE</span>
          <div className="mt-1 text-2xl font-black text-[var(--text)]">Multi-Touch / 4K</div>
        </div>
      </div>

      {/* Search */}
      <div className="relative min-w-72 max-w-md">
        <Search className="absolute left-3 top-2.5 size-4 text-[var(--muted)]" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search ePoster terminal or location..."
          className="h-10 w-full rounded-xl border border-[var(--border)] bg-[var(--card)] pl-9 pr-3 text-xs text-[var(--text)] placeholder:text-[var(--muted)] focus:outline-none focus:border-[var(--acc)]"
        />
      </div>

      {/* Kiosks Grid */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {isLoading ? (
          <div className="col-span-full py-12 text-center text-xs text-[var(--muted)]">
            Loading ePoster network telemetry...
          </div>
        ) : filtered.length === 0 ? (
          <div className="col-span-full rounded-2xl border border-[var(--border)] bg-[var(--card)] p-12 text-center">
            <Boxes className="mx-auto size-10 text-[var(--muted)] opacity-40 mb-3" />
            <h3 className="text-sm font-bold text-[var(--text)]">No ePoster Terminals Connected</h3>
            <p className="mt-1 text-xs text-[var(--muted)] max-w-md mx-auto">
              Terminals provisioned with the ePoster player mode will appear here with live heartbeat telemetry, touch session state, and slide preloading.
            </p>
          </div>
        ) : (
          filtered.map((d) => (
            <div
              key={d.id}
              className="flex flex-col justify-between rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5 shadow-sm space-y-4 hover:border-[var(--acc)]/40 transition-colors"
            >
              <div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Tv className="size-4 text-cyan-400" />
                    <span className="font-bold text-sm text-[var(--text)]">{d.name}</span>
                  </div>
                  <span
                    className={cn(
                      "rounded-full px-2 py-0.5 font-mono text-[9px] font-bold uppercase",
                      d.status === "healthy" || d.status === "online"
                        ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30"
                        : "bg-rose-500/15 text-rose-400 border border-rose-500/30"
                    )}
                  >
                    {d.status}
                  </span>
                </div>

                <div className="mt-3 grid grid-cols-2 gap-2 text-[11px] font-mono">
                  <div className="rounded-lg bg-[var(--surf)] p-2 border border-[var(--border)]">
                    <span className="block text-[9px] text-[var(--muted)] uppercase">IP Address</span>
                    <span className="font-bold text-[var(--text)]">{d.ip_address || "DHCP Auto"}</span>
                  </div>
                  <div className="rounded-lg bg-[var(--surf)] p-2 border border-[var(--border)]">
                    <span className="block text-[9px] text-[var(--muted)] uppercase">Location</span>
                    <span className="font-bold text-[var(--text)] truncate">{d.room_name || "Exhibition Hall"}</span>
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 border-t border-[var(--border)] pt-3">
                <button
                  onClick={() => commandMutation.mutate({ id: d.id, command: "ping" })}
                  className="flex items-center gap-1 rounded-lg border border-[var(--border)] px-2.5 py-1 text-[10px] font-bold text-[var(--muted)] hover:text-[var(--text)]"
                >
                  <Wifi className="size-3" />
                  <span>Ping</span>
                </button>
                <button
                  onClick={() => commandMutation.mutate({ id: d.id, command: "push_configuration" })}
                  className="flex items-center gap-1 rounded-lg border border-[var(--border)] px-2.5 py-1 text-[10px] font-bold text-[var(--muted)] hover:text-[var(--text)]"
                >
                  <Send className="size-3" />
                  <span>Push Slides</span>
                </button>
                <button
                  onClick={() => commandMutation.mutate({ id: d.id, command: "restart" })}
                  className="flex items-center gap-1 rounded-lg border border-rose-500/30 px-2.5 py-1 text-[10px] font-bold text-rose-400 hover:bg-rose-500/10"
                >
                  <RotateCcw className="size-3" />
                  <span>Reboot</span>
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
