"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, ArrowRight, HardDrive, RefreshCw, Server, UsersRound } from "lucide-react";
import { apiClient } from "@/lib/api-client";
import { EmptyState, ErrorState, EvidenceTime, LoadingState, Metric, PageFrame, Section, StatusBadge, formatBytes } from "@/components/operations/control-room";

type Overview = {
  generated_at: string; status: string;
  event: { id: string; name: string; short_code: string; status: string } | null;
  installation: { name: string; setup_status: string; maintenance_mode: boolean } | null;
  services: Array<{ id: string; name: string; type: string; status: string; evidence: string; host?: string; version?: string; queue_depth: number; last_heartbeat_at?: string }>;
  devices: { total: number; healthy: number; stale: number; offline: number; not_configured: number };
  alerts: { total: number; critical?: number; warning?: number };
  sync: { pending: number; outbox: Record<string, number> };
  content: Record<string, number>;
  storage: { status: string; path: string; free_bytes?: number; total_bytes?: number; evidence?: string };
};

export default function CommandCenterPage() {
  const query = useQuery({ queryKey: ["venue-control-overview"], queryFn: () => apiClient.get<Overview>("/venue/admin/control/overview"), refetchInterval: 10000 });
  const data = query.data;
  return <PageFrame eyebrow="Live venue authority" title="Command center" description="One evidence-backed answer to whether this venue can operate now." actions={<button className="venue-button venue-button--secondary" onClick={() => query.refetch()}><RefreshCw className="size-4" />Refresh evidence</button>}>
    {query.isLoading && <LoadingState />}
    {query.isError && <ErrorState message={(query.error as Error).message} retry={() => query.refetch()} />}
    {data && <>
      <div className="venue-metric-grid">
        <Metric label="Venue readiness" value={<StatusBadge state={data.status} />} detail={data.event ? `${data.event.short_code} · ${data.event.name}` : "Provision an event before operating."} />
        <Metric label="Services" value={`${data.services.filter((item) => item.status === "healthy").length}/${data.services.length}`} detail="Fresh, healthy service evidence" state={data.services.some((item) => item.status !== "healthy") ? "degraded" : "healthy"} />
        <Metric label="Devices online" value={`${data.devices.healthy}/${data.devices.total}`} detail={`${data.devices.stale} stale · ${data.devices.offline} offline`} state={data.devices.offline || data.devices.stale ? "degraded" : data.devices.total ? "healthy" : "not_configured"} />
        <Metric label="Pending operations" value={data.sync.pending} detail="Pending and failed outbox records" state={data.sync.pending ? "degraded" : "healthy"} />
      </div>
      <div className="venue-split">
        <Section title="Service matrix" description={`Generated ${new Date(data.generated_at).toLocaleTimeString()}`} actions={<Link href="/dashboard/services" className="venue-button venue-button--secondary">All services<ArrowRight className="size-4" /></Link>}>
          {data.services.length === 0 ? <EmptyState title="No service evidence" detail="Services appear here after their first authenticated heartbeat." /> : <div className="venue-table-wrap"><table className="venue-table"><thead><tr><th>Service</th><th>State</th><th>Host / version</th><th>Queue</th><th>Observed</th></tr></thead><tbody>{data.services.map((service) => <tr key={service.id}><td><strong>{service.name}</strong><div className="venue-code">{service.type}</div></td><td><StatusBadge state={service.status} evidence={service.evidence} /></td><td><span className="venue-code">{service.host || "Not reported"}{service.version ? ` · ${service.version}` : ""}</span></td><td>{service.queue_depth}</td><td><EvidenceTime value={service.last_heartbeat_at} /></td></tr>)}</tbody></table></div>}
        </Section>
        <div className="space-y-4">
          <Section title="Immediate exceptions" description="Items requiring operator attention"><div className="divide-y divide-[var(--border)]">
            <Link href="/dashboard/alerts" className="flex items-center gap-3 p-4 hover:bg-[var(--raised)]"><AlertTriangle className="size-5 text-[var(--dan)]" /><div className="flex-1"><strong className="text-sm">{data.alerts.critical || 0} critical alerts</strong><p className="text-xs text-[var(--muted)]">{data.alerts.total} active alerts in total</p></div><ArrowRight className="size-4" /></Link>
            <Link href="/dashboard/devices" className="flex items-center gap-3 p-4 hover:bg-[var(--raised)]"><UsersRound className="size-5 text-[var(--warn)]" /><div className="flex-1"><strong className="text-sm">{data.devices.offline + data.devices.stale} device exceptions</strong><p className="text-xs text-[var(--muted)]">Offline and stale observations</p></div><ArrowRight className="size-4" /></Link>
          </div></Section>
          <Section title="Local storage" description={data.storage.path}><div className="p-4"><div className="flex items-center justify-between"><HardDrive className="size-5 text-[var(--acc)]" /><StatusBadge state={data.storage.status} evidence={data.storage.evidence} /></div><div className="mt-4 text-xl font-semibold">{formatBytes(data.storage.free_bytes)} free</div><p className="mt-1 text-xs text-[var(--muted)]">of {formatBytes(data.storage.total_bytes)} observed capacity</p></div></Section>
        </div>
      </div>
    </>}
  </PageFrame>;
}
