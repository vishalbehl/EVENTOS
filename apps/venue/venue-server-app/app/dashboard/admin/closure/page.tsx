"use client";

import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import {
  CheckCircle2, ArrowRight, ShieldCheck, Database,
  FileCheck, HardDrive, Download, Lock, RefreshCw, Loader2
} from "lucide-react";
import { toast } from "sonner";
import { apiClient } from "@/lib/api-client";
import { cn } from "@/lib/utils";

export default function EventClosurePage() {
  const [closed, setClosed] = useState(false);

  const overviewQuery = useQuery({
    queryKey: ["venue-control-overview"],
    queryFn: () => apiClient.get<any>("/venue/admin/control/overview"),
  });

  const closureMutation = useMutation({
    mutationFn: () => apiClient.post("/venue/admin/control/closure/final-sync"),
    onSuccess: (data: any) => {
      setClosed(Boolean(data?.closure_verified));
      if (data?.closure_verified) toast.success("Event closed and final sync verified.");
      else toast.warning(`Closure remains incomplete: ${data?.synced_files ?? 0} of ${data?.total_current_files ?? 0} files verified.`);
    },
    onError: (err: any) => {
      toast.error(`Closure failed: ${err.message || "Error"}`);
    }
  });

  const overview = overviewQuery.data;
  const eventName = overview?.event?.name || "Live Event Core";
  const pendingSync = overview?.sync?.pending ?? 0;
  const totalSynced = (overview?.content?.synced ?? 0) + (overview?.content?.verified ?? 0);
  const totalAuditEvents = overview?.audit_events?.total ?? null;

  return (
    <div className="mx-auto flex w-full max-w-[1400px] flex-col gap-6 pb-12">
      {/* Header */}
      <div className="flex flex-col justify-between gap-4 border-b border-[var(--border)] pb-5 md:flex-row md:items-end">
        <div>
          <div className="flex items-center gap-2">
            <ShieldCheck className="size-4 text-emerald-400" />
            <span className="font-mono text-[10px] font-black uppercase tracking-widest text-[var(--acc)]">
              ADMINISTRATION · POST-EVENT CLOSURE
            </span>
          </div>
          <h1 className="mt-1 text-2xl font-black uppercase tracking-tight text-[var(--text)] sm:text-3xl">
            Event Closure & Final Cloud Sync
          </h1>
          <p className="text-xs font-semibold text-[var(--muted)]">
            Verify pending uploads, finalize attendee transactions, export audit logs, and seal local event snapshot
          </p>
        </div>
      </div>

      {/* Closure Verification Matrix */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-5 space-y-1">
          <span className="font-mono text-[10px] font-black uppercase text-emerald-400">PENDING UPLOADS</span>
          <div className="text-2xl font-black text-emerald-300">{pendingSync} Pending</div>
          <p className="text-xs text-[var(--muted)]">{totalSynced} presentations verified</p>
        </div>

        <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-5 space-y-1">
          <span className="font-mono text-[10px] font-black uppercase text-emerald-400">SYNC OUTBOX</span>
          <div className="text-2xl font-black text-emerald-300">{pendingSync === 0 ? "All Synced" : `${pendingSync} in queue`}</div>
          <p className="text-xs text-[var(--muted)]">Local edge database outbox queue</p>
        </div>

        <div className="rounded-2xl border border-blue-500/30 bg-blue-950/15 p-5 space-y-1">
          <span className="font-mono text-[10px] font-black uppercase text-blue-400">AUDIT TRAIL LOGS</span>
          <div className="text-2xl font-black text-blue-300">{totalAuditEvents === null ? "Unavailable" : `${totalAuditEvents} Records`}</div>
          <p className="text-xs text-[var(--muted)]">Tamper-evident operational log</p>
        </div>
      </div>

      {/* Action Card */}
      <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-8 text-center shadow-md space-y-6">
        <div className="mx-auto flex size-16 items-center justify-center rounded-3xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
          <Lock className="size-8" />
        </div>

        <div>
          <h2 className="text-lg font-black uppercase text-[var(--text)]">
            {closed ? "EVENT PERMANENTLY CLOSED & SEALED" : `Finalize & Seal ${eventName}`}
          </h2>
          <p className="mx-auto mt-2 max-w-xl text-xs text-[var(--muted)]">
            Executing final sync will flush all local queues to Eventos Cloud, generate an encrypted event report archive, and transition the local venue core into archive read-only state.
          </p>
        </div>

        {!closed ? (
          <button
            disabled={closureMutation.isPending}
            onClick={() => closureMutation.mutate()}
            className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-8 py-3 text-xs font-black text-white hover:bg-emerald-500 shadow-md disabled:opacity-50"
          >
            {closureMutation.isPending ? <RefreshCw className="size-4 animate-spin" /> : <CheckCircle2 className="size-4" />}
            <span>COMPLETE FINAL SYNC & CLOSE EVENT</span>
          </button>
        ) : (
          <div className="inline-flex items-center gap-2 rounded-xl bg-emerald-500/20 px-6 py-2.5 font-mono text-xs font-black text-emerald-400 border border-emerald-500/30">
            <CheckCircle2 className="size-4" />
            <span>EVENT SNAPSHOT SEALED & EXPORTED</span>
          </div>
        )}
      </div>
    </div>
  );
}
