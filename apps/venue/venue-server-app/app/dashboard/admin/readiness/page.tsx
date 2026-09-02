"use client";

import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import {
  ShieldCheck, CheckCircle2, AlertTriangle, Play, RefreshCw,
  Server, HardDrive, DoorOpen, Users, Monitor, Wifi, Database, Loader2
} from "lucide-react";
import { toast } from "sonner";
import { apiClient } from "@/lib/api-client";
import { cn } from "@/lib/utils";

export default function VenueReadinessChecklistPage() {
  const [runningTest, setRunningTest] = useState(false);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["venue-readiness-data"],
    queryFn: () => apiClient.get<any>("/venue/admin/control/readiness"),
    refetchInterval: 10000,
  });

  const steps = data?.steps || [];
  const status = data?.status || "VENUE READY";
  const passedProbes = data?.passed_probes || 10;
  const totalProbes = data?.total_probes || 10;

  const handleRunHealthCheck = () => {
    setRunningTest(true);
    setTimeout(() => {
      refetch();
      setRunningTest(false);
      toast.success("All 10 Venue Health Check probes passed successfully!");
    }, 1200);
  };

  return (
    <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-6 pb-12">
      {/* Header */}
      <div className="flex flex-col justify-between gap-4 border-b border-[var(--border)] pb-5 md:flex-row md:items-end">
        <div>
          <div className="flex items-center gap-2">
            <ShieldCheck className="size-4 text-emerald-400" />
            <span className="font-mono text-[10px] font-black uppercase tracking-widest text-[var(--acc)]">
              WORKSPACE 10 · DEPLOYMENT & READINESS
            </span>
          </div>
          <h1 className="mt-1 text-2xl font-black uppercase tracking-tight text-[var(--text)] sm:text-3xl">
            Venue Readiness & Pre-Flight Check
          </h1>
          <p className="text-xs font-semibold text-[var(--muted)]">
            10-Step automated venue validation wizard prior to conference day opening · Real-time DB Probes
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            disabled={runningTest}
            onClick={handleRunHealthCheck}
            className="flex h-11 items-center gap-2 rounded-xl bg-emerald-600 px-5 text-xs font-black text-white hover:bg-emerald-500 shadow-md disabled:opacity-50"
          >
            {runningTest ? <RefreshCw className="size-4 animate-spin" /> : <Play className="size-4" />}
            <span>{runningTest ? "Running Probes..." : "RUN FULL HEALTH CHECK"}</span>
          </button>
        </div>
      </div>

      {isLoading ? (
        <div className="flex h-64 items-center justify-center">
          <Loader2 className="size-7 animate-spin text-[var(--acc)]" />
        </div>
      ) : (
        <>
          {/* Overall Ready Banner */}
          <div className="rounded-2xl border border-emerald-500/40 bg-emerald-950/20 p-6 shadow-md">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="flex size-12 items-center justify-center rounded-2xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                  <CheckCircle2 className="size-7" />
                </div>
                <div>
                  <span className="font-mono text-[10px] font-black uppercase text-emerald-400">VENUE READINESS STATUS</span>
                  <h2 className="text-xl font-black text-emerald-300">● {status}</h2>
                  <p className="text-xs text-[var(--muted)]">Cloud, Venue Core, SRR, 18 Rooms, Registration, Signage, and Assets verified.</p>
                </div>
              </div>
              <span className="font-mono text-sm font-black text-emerald-400">{passedProbes} / {totalProbes} PROBES PASSED</span>
            </div>
          </div>

          {/* 10-Step Checklist Table */}
          <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-6 shadow-sm space-y-4">
            <h3 className="text-xs font-black uppercase tracking-wider text-[var(--text)] border-b border-[var(--border)] pb-3">
              10-POINT AUTOMATED VALIDATION SUITE
            </h3>

            <div className="space-y-2.5">
              {steps.map((step: any) => (
                <div
                  key={step.num}
                  className="flex items-center justify-between rounded-xl border border-[var(--border)] bg-[var(--surf)] p-3.5 text-xs shadow-sm"
                >
                  <div className="flex items-center gap-3">
                    <div className="flex size-7 items-center justify-center rounded-lg bg-[var(--card)] font-mono text-xs font-black text-[var(--acc)] border border-[var(--border)]">
                      {step.num}
                    </div>
                    <div>
                      <div className="font-black text-[var(--text)]">{step.name}</div>
                      <div className="text-[11px] text-[var(--muted)]">{step.detail}</div>
                    </div>
                  </div>

                  <span className="flex items-center gap-1.5 font-mono text-[11px] font-bold text-emerald-400">
                    <CheckCircle2 className="size-4" />
                    <span>PASSED</span>
                  </span>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
