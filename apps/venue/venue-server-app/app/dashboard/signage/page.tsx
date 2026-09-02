"use client";

import { useQuery } from "@tanstack/react-query";
import {
  Monitor, Tv, ArrowRight, RefreshCw, RotateCw, Play, CheckCircle2,
  AlertTriangle, Radio, Sparkles, Loader2
} from "lucide-react";
import { toast } from "sonner";
import { apiClient } from "@/lib/api-client";
import { cn } from "@/lib/utils";

export default function SignageHubPage() {
  const { data, isLoading, refetch } = useQuery({
    queryKey: ["signage-screens-data"],
    queryFn: () => apiClient.get<any>("/venue/admin/control/signage/screens"),
    refetchInterval: 6000,
  });

  const screens = data?.screens || [];
  const onlineCount = data?.online_screens || 0;
  const reconnectingCount = data?.reconnecting_screens || 0;

  return (
    <div className="mx-auto flex w-full max-w-[1720px] flex-col gap-6 pb-12">
      {/* Header */}
      <div className="flex flex-col justify-between gap-4 border-b border-[var(--border)] pb-5 md:flex-row md:items-end">
        <div>
          <div className="flex items-center gap-2">
            <Monitor className="size-4 text-emerald-400" />
            <span className="font-mono text-[10px] font-black uppercase tracking-widest text-[var(--acc)]">
              WORKSPACE 07 · DIGITAL SIGNAGE HUB
            </span>
          </div>
          <h1 className="mt-1 text-2xl font-black uppercase tracking-tight text-[var(--text)] sm:text-3xl">
            Digital Signage Operations
          </h1>
          <p className="text-xs font-semibold text-[var(--muted)]">
            {screens.length} Zone Displays · {onlineCount} Online · {reconnectingCount} Reconnecting · Live Database Telemetry
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => {
              toast.success("Global playlist push triggered across all digital signage endpoints");
            }}
            className="btn-pri flex h-10 items-center gap-2 rounded-xl px-4 text-xs font-bold shadow"
          >
            <RotateCw className="size-3.5" />
            <span>Push Global Playlist</span>
          </button>
        </div>
      </div>

      {isLoading ? (
        <div className="flex h-64 items-center justify-center">
          <Loader2 className="size-7 animate-spin text-[var(--acc)]" />
        </div>
      ) : screens.length === 0 ? (
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-12 text-center text-xs text-[var(--muted)]">
          No digital signage screens found in the database.
        </div>
      ) : (
        /* Screen Zones Matrix */
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {screens.map((screen: any) => {
            const isReconnect = screen.status === "reconnecting";

            return (
              <div
                key={screen.id}
                className={cn(
                  "flex flex-col justify-between rounded-2xl border p-4 shadow-sm transition-all",
                  isReconnect ? "border-amber-500/40 bg-amber-950/15" : "border-[var(--border)] bg-[var(--card)] hover:border-[var(--acc)]"
                )}
              >
                <div>
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-[9px] font-bold text-[var(--muted)] uppercase">
                      {screen.zone}
                    </span>
                    <span className={cn(
                      "rounded px-1.5 py-0.5 font-mono text-[9px] font-black uppercase",
                      isReconnect ? "bg-amber-500/20 text-amber-400 animate-pulse" : "bg-emerald-500/20 text-emerald-400"
                    )}>
                      ● {screen.status?.toUpperCase() || "ONLINE"}
                    </span>
                  </div>

                  <div className="mt-2">
                    <h4 className="text-xs font-black text-[var(--text)]">{screen.name}</h4>
                    <span className="font-mono text-[10px] text-[var(--muted)]">{screen.screen_code} · {screen.ip_address}</span>
                  </div>

                  <div className="mt-3 rounded-xl border border-[var(--border)] bg-[var(--surf)] p-2.5 text-xs">
                    <span className="font-mono text-[9px] text-[var(--muted)] uppercase">Current Playlist</span>
                    <div className="font-bold text-[var(--acc)] truncate">{screen.schedule}</div>
                  </div>
                </div>

                <div className="mt-3 flex items-center justify-between border-t border-[var(--border)] pt-3 text-[10px] font-bold">
                  <button
                    onClick={() => toast.info(`Previewing ${screen.screen_code}`)}
                    className="text-[var(--muted)] hover:text-[var(--text)]"
                  >
                    Preview Screen
                  </button>
                  <button
                    onClick={() => toast.success(`Content pushed to ${screen.screen_code}`)}
                    className="text-[var(--acc)] hover:underline"
                  >
                    Push Content →
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
