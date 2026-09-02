"use client";

import { useQuery } from "@tanstack/react-query";
import {
  Users, CheckCircle2, Printer, AlertTriangle, RefreshCw, 
  RotateCw, Play, ShieldCheck, ArrowRight, QrCode, Loader2
} from "lucide-react";
import { apiClient } from "@/lib/api-client";
import { cn } from "@/lib/utils";

export default function RegistrationWorkspacePage() {
  const { data, isLoading, refetch } = useQuery({
    queryKey: ["registration-desks-data"],
    queryFn: () => apiClient.get<any>("/venue/admin/control/registration/desks"),
    refetchInterval: 6000,
  });

  const stats = data?.stats || {
    total_registered: 0,
    checked_in: 0,
    badges_printed: 0,
    kits_distributed: 0,
  };

  const desks = data?.desks || [];
  const kiosks = data?.kiosks || [];

  return (
    <div className="mx-auto flex w-full max-w-[1720px] flex-col gap-6 pb-12">
      {/* Header */}
      <div className="flex flex-col justify-between gap-4 border-b border-[var(--border)] pb-5 md:flex-row md:items-end">
        <div>
          <div className="flex items-center gap-2">
            <Users className="size-4 text-purple-400" />
            <span className="font-mono text-[10px] font-black uppercase tracking-widest text-[var(--acc)]">
              WORKSPACE 07 · REGISTRATION & BADGING
            </span>
          </div>
          <h1 className="mt-1 text-2xl font-black uppercase tracking-tight text-[var(--text)] sm:text-3xl">
            Registration & Kiosk Operations
          </h1>
          <p className="text-xs font-semibold text-[var(--muted)]">
            Registration Server Status · {desks.length} Desks · {kiosks.length} Self-Check-in Kiosks · Live Database Telemetry
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => refetch()}
            className="flex h-10 items-center gap-1.5 rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 text-xs font-bold text-[var(--muted)] hover:text-[var(--text)]"
          >
            <RefreshCw className="size-3.5" />
            <span>Refresh Telemetry</span>
          </button>
        </div>
      </div>

      {isLoading ? (
        <div className="flex h-64 items-center justify-center">
          <Loader2 className="size-7 animate-spin text-[var(--acc)]" />
        </div>
      ) : (
        <>
          {/* Top 4 Throughput Metrics */}
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4 shadow-sm">
              <span className="font-mono text-[10px] font-black uppercase text-[var(--muted)]">REGISTERED TODAY</span>
              <div className="mt-1 text-2xl font-black text-[var(--text)]">{stats.total_registered.toLocaleString()}</div>
              <div className="text-[10px] text-[var(--muted)]">Delegates, Faculty & Guests</div>
            </div>

            <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-4 shadow-sm">
              <span className="font-mono text-[10px] font-black uppercase text-emerald-400">CHECKED IN</span>
              <div className="mt-1 text-2xl font-black text-emerald-300">{stats.checked_in.toLocaleString()}</div>
              <div className="text-[10px] text-emerald-400 font-bold">Live database attendance</div>
            </div>

            <div className="rounded-2xl border border-purple-500/30 bg-purple-950/15 p-4 shadow-sm">
              <span className="font-mono text-[10px] font-black uppercase text-purple-400">BADGES PRINTED</span>
              <div className="mt-1 text-2xl font-black text-purple-300">{stats.badges_printed.toLocaleString()}</div>
              <div className="text-[10px] text-[var(--muted)]">Zebra Thermal Badge Stock</div>
            </div>

            <div className="rounded-2xl border border-blue-500/30 bg-blue-500/10 p-4 shadow-sm">
              <span className="font-mono text-[10px] font-black uppercase text-blue-400">KITS DISTRIBUTED</span>
              <div className="mt-1 text-2xl font-black text-blue-300">{stats.kits_distributed.toLocaleString()}</div>
              <div className="text-[10px] text-[var(--muted)]">Kit bag distribution counter</div>
            </div>
          </div>

          {/* Desks & Kiosks Fleet Tables */}
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            {/* Registration Desks */}
            <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5 shadow-sm space-y-4">
              <div className="flex items-center justify-between border-b border-[var(--border)] pb-3">
                <h2 className="text-xs font-black uppercase tracking-wider text-[var(--text)]">
                  STAFF REGISTRATION DESKS ({desks.length} NODES)
                </h2>
                <span className="font-mono text-[10px] font-bold text-emerald-400">● LIVE DB</span>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-[var(--border)] text-[10px] font-black uppercase text-[var(--muted)]">
                      <th className="pb-2">Desk</th>
                      <th className="pb-2">Operator</th>
                      <th className="pb-2">IP</th>
                      <th className="pb-2">Printer</th>
                      <th className="pb-2 text-right">Scans</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--border)]">
                    {desks.map((d: any) => (
                      <tr key={d.id || d.hostname} className="hover:bg-[var(--raised)]">
                        <td className="py-2.5 font-bold text-[var(--text)] flex items-center gap-2">
                          <span className="size-1.5 rounded-full bg-emerald-400" />
                          <span>{d.name}</span>
                        </td>
                        <td className="py-2.5 text-[var(--muted)]">{d.operator}</td>
                        <td className="py-2.5 font-mono text-[10px] text-[var(--muted)]">{d.ip}</td>
                        <td className="py-2.5">
                          <span className="font-mono text-[10px] font-bold text-emerald-400">● Ready</span>
                        </td>
                        <td className="py-2.5 text-right font-mono font-bold text-[var(--text)]">{d.scans}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Self-Checkin Kiosks */}
            <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5 shadow-sm space-y-4">
              <div className="flex items-center justify-between border-b border-[var(--border)] pb-3">
                <h2 className="text-xs font-black uppercase tracking-wider text-[var(--text)]">
                  SELF-CHECK-IN KIOSKS ({kiosks.length} KIOSKS)
                </h2>
                <span className="font-mono text-[10px] font-bold text-amber-400">⚠ 1 PRINTER ATTENTION</span>
              </div>

              <div className="space-y-3">
                {kiosks.map((k: any) => {
                  const hasError = k.printer_status === "error";

                  return (
                    <div
                      key={k.id || k.hostname}
                      className={cn(
                        "flex items-center justify-between rounded-xl border p-3.5 text-xs transition-all",
                        hasError ? "border-rose-500/40 bg-rose-950/15" : "border-[var(--border)] bg-[var(--surf)]"
                      )}
                    >
                      <div className="flex items-center gap-3">
                        <div className="flex size-9 items-center justify-center rounded-xl bg-[var(--card)] border border-[var(--border)]">
                          <QrCode className="size-4 text-[var(--acc)]" />
                        </div>
                        <div>
                          <div className="font-bold text-[var(--text)]">{k.name}</div>
                          <div className="font-mono text-[10px] text-[var(--muted)]">{k.ip}</div>
                        </div>
                      </div>

                      <div className="flex items-center gap-4">
                        <div className="text-right font-mono text-xs">
                          <span className="text-[var(--text)] font-bold">{k.self_checkins}</span>
                          <span className="block text-[9px] text-[var(--muted)]">Self-Checkins</span>
                        </div>

                        <span className={cn(
                          "rounded-lg px-2 py-0.5 font-mono text-[10px] font-black uppercase",
                          hasError ? "bg-rose-500/20 text-rose-400" : "bg-emerald-500/15 text-emerald-400"
                        )}>
                          {hasError ? "⚠ Out of Ribbon" : "● Online"}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
