"use client";

import { AlertTriangle, CheckCircle2, HardDrive, Layers, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { PageContainer } from "@/components/super-admin/ui/PageContainer";
import { SectionHeader } from "@/components/super-admin/ui/SectionHeader";
import { useQueueStats } from "@/services/super-admin-service";

export default function StorageAndQueuesPage() {
  const queueQuery = useQueueStats();
  const queues = queueQuery.data ?? [];
  const totalDepth = queues.reduce((total, queue) => total + queue.depth, 0);
  const unhealthyCount = queues.filter((queue) => queue.status !== "HEALTHY").length;

  return (
    <PageContainer>
      <SectionHeader
        title="Storage & Message Queues"
        description="Live broker depth is available now. Object-storage capacity, quarantine, retention, and cleanup require a separate authoritative telemetry contract."
        breadcrumb={["Console", "Operations", "Storage & Queues"]}
        actions={
          <Button variant="outline" size="sm" onClick={() => queueQuery.refetch()} disabled={queueQuery.isFetching}>
            <RefreshCw className={`mr-2 h-3.5 w-3.5 ${queueQuery.isFetching ? "animate-spin" : ""}`} />
            Refresh queues
          </Button>
        }
      />

      <div className="grid gap-4 md:grid-cols-3">
        <Card className="rounded-2xl border-border bg-surface p-5"><p className="text-[10px] font-bold uppercase tracking-wider text-tertiary">Observed queues</p><p className="mt-2 text-2xl font-black text-primary">{queueQuery.isSuccess ? queues.length : "-"}</p></Card>
        <Card className="rounded-2xl border-border bg-surface p-5"><p className="text-[10px] font-bold uppercase tracking-wider text-tertiary">Total queued messages</p><p className="mt-2 text-2xl font-black text-primary">{queueQuery.isSuccess ? totalDepth.toLocaleString() : "-"}</p></Card>
        <Card className="rounded-2xl border-border bg-surface p-5"><p className="text-[10px] font-bold uppercase tracking-wider text-tertiary">Degraded or overloaded</p><p className={`mt-2 text-2xl font-black ${unhealthyCount ? "text-warning" : "text-success"}`}>{queueQuery.isSuccess ? unhealthyCount : "-"}</p></Card>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.35fr_0.65fr]">
        <Card className="overflow-hidden rounded-2xl border-border bg-surface">
          <div className="border-b border-border px-5 py-4"><h2 className="flex items-center gap-2 text-sm font-bold text-primary"><Layers className="h-4 w-4" /> Broker queues</h2></div>
          {queueQuery.isLoading ? (
            <div className="flex min-h-56 items-center justify-center gap-3 text-sm text-secondary" role="status"><RefreshCw className="h-5 w-5 animate-spin" /> Loading queue telemetry</div>
          ) : queueQuery.isError ? (
            <div className="flex min-h-56 items-center justify-center p-6"><div className="max-w-lg text-center"><AlertTriangle className="mx-auto h-6 w-6 text-danger" /><h3 className="mt-3 text-sm font-bold text-primary">Broker telemetry unavailable</h3><p className="mt-2 text-xs leading-5 text-secondary">The API now fails closed when Redis cannot be reached. It no longer reports zero-depth queues as healthy.</p></div></div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs" aria-label="Message queue telemetry">
                <thead className="bg-surface-2 text-tertiary"><tr><th className="px-5 py-3 font-semibold">Queue</th><th className="px-5 py-3 font-semibold">Depth</th><th className="px-5 py-3 font-semibold">Status</th></tr></thead>
                <tbody className="divide-y divide-border/60">
                  {queues.map((queue) => <tr key={queue.name}><td className="px-5 py-3 font-mono text-primary">{queue.name}</td><td className="px-5 py-3 text-secondary">{queue.depth.toLocaleString()}</td><td className="px-5 py-3"><span className={queue.status === "HEALTHY" ? "text-success" : queue.status === "DEGRADED" ? "text-warning" : "text-danger"}>{queue.status}</span></td></tr>)}
                  {!queues.length && <tr><td colSpan={3} className="px-5 py-8 text-center text-secondary">No configured queues were returned.</td></tr>}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <Card className="rounded-2xl border-amber-500/20 bg-amber-500/5 p-5">
          <HardDrive className="h-5 w-5 text-amber-300" />
          <h2 className="mt-3 text-sm font-bold text-primary">Storage telemetry contract required</h2>
          <p className="mt-2 text-xs leading-5 text-secondary">Storage totals, bucket health, quarantine, malware scan state, retention, and cleanup were previously hard-coded. They remain unavailable until measured through authorized storage metadata and durable file-state records.</p>
          <div className="mt-4 flex items-center gap-2 text-xs text-secondary"><CheckCircle2 className="h-4 w-4 text-success" /> Fake storage totals and trend charts removed.</div>
        </Card>
      </div>
    </PageContainer>
  );
}
