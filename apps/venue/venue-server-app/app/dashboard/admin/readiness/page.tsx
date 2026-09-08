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
  const status = data?.status || "UNKNOWN";
  const passedProbes = data?.passed_probes ?? null;
  const totalProbes = data?.total_probes ?? null;

  const handleRunHealthCheck = async () => {
    setRunningTest(true);
    try {
      const result = await refetch();
      const payload = result.data;
      toast.success(payload ? `Readiness refreshed: ${payload.passed_probes ?? 0} of ${payload.total_probes ?? 0} probes passed.` : "Readiness evidence refreshed.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Readiness refresh failed.");
    } finally {
      setRunningTest(false);
    }
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
          <div className={cn("rounded-2xl border p-6 shadow-md", status === "VENUE READY" ? "border-emerald-500/40 bg-emerald-950/20" : "border-amber-500/40 bg-amber-950/20")}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className={cn("flex size-12 items-center justify-center rounded-2xl border", status === "VENUE READY" ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/30" : "bg-amber-500/20 text-amber-400 border-amber-500/30")}>
                  {status === "VENUE READY" ? <CheckCircle2 className="size-7" /> : <AlertTriangle className="size-7" />}
                </div>
                <div>
                  <span className="font-mono text-[10px] font-black uppercase text-[var(--muted)]">VENUE READINESS STATUS</span>
                  <h2 className={cn("text-xl font-black", status === "VENUE READY" ? "text-emerald-300" : "text-amber-300")}>● {status}</h2>
                  <p className="text-xs text-[var(--muted)]">Authoritative probe evidence from Venue Server. Unknown checks remain unverified.</p>
                </div>
              </div>
              <span className="font-mono text-sm font-black text-[var(--muted)]">{passedProbes === null ? "UNAVAILABLE" : `${passedProbes} / ${totalProbes} PROBES PASSED`}</span>
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

                  <span className={cn("flex items-center gap-1.5 font-mono text-[11px] font-bold", step.status === "passed" ? "text-emerald-400" : step.status === "degraded" ? "text-amber-400" : step.status === "unknown" || step.status === "not_configured" ? "text-[var(--muted)]" : "text-rose-400")}>
                    {step.status === "passed" ? <CheckCircle2 className="size-4" /> : <AlertTriangle className="size-4" />}
                    <span>{String(step.status || "unknown").replaceAll("_", " ").toUpperCase()}</span>
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
