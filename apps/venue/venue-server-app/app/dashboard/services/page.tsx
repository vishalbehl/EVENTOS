"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Pause, Play, RefreshCw, RotateCcw, Stethoscope } from "lucide-react";
import { toast } from "sonner";
import { apiClient } from "@/lib/api-client";
import { EmptyState, ErrorState, EvidenceTime, LoadingState, PageFrame, Section, StatusBadge } from "@/components/operations/control-room";

type Service = { id: string; service_key: string; name: string; type: string; host?: string; version?: string; status: string; evidence: string; latency_ms?: number; queue_depth: number; locally_managed: boolean; paused: boolean; last_heartbeat_at?: string; last_failure_at?: string };

export default function ServicesPage() {
  const client = useQueryClient();
  const [reason, setReason] = useState("Operator service control");
  const query = useQuery({ queryKey: ["venue-services"], queryFn: () => apiClient.get<{ items: Service[] }>("/venue/admin/control/services"), refetchInterval: 10000 });
  const command = useMutation({
    mutationFn: ({ id, command }: { id: string; command: string }) => apiClient.post(`/venue/admin/control/services/${id}/commands`, { command, reason }),
    onSuccess: () => { toast.success("Service command queued"); client.invalidateQueries({ queryKey: ["venue-services"] }); },
    onError: (error: Error) => toast.error(error.message),
  });
  return <PageFrame eyebrow="Service supervision" title="Services" description="Fresh heartbeat evidence from every venue subsystem. Unknown is shown whenever evidence does not exist." actions={<button className="venue-button venue-button--secondary" onClick={() => query.refetch()}><RefreshCw className="size-4" />Refresh</button>}>
    <Section title="Control reason" description="Recorded in the immutable audit trail for every command"><div className="p-3"><input className="venue-input max-w-xl" value={reason} onChange={(event) => setReason(event.target.value)} aria-label="Command reason" /></div></Section>
    <Section title="Service inventory" description="Registration, SRR, room, ePoster, storage, gateway and worker services">
      {query.isLoading && <LoadingState />}{query.isError && <ErrorState message={(query.error as Error).message} retry={() => query.refetch()} />}
      {query.data?.items.length === 0 && <EmptyState title="No service heartbeats" detail="Configure each service with the Venue endpoint and device credential." />}
      {!!query.data?.items.length && <div className="venue-table-wrap"><table className="venue-table"><thead><tr><th>Service</th><th>Evidence state</th><th>Host</th><th>Latency</th><th>Queue</th><th>Observed</th><th>Commands</th></tr></thead><tbody>{query.data.items.map((service) => <tr key={service.id}><td><strong>{service.name}</strong><div className="venue-code">{service.service_key} · {service.version || "Version unknown"}</div></td><td><StatusBadge state={service.status} evidence={service.evidence} /></td><td className="venue-code">{service.host || "Not reported"}</td><td>{service.latency_ms == null ? "Unknown" : `${service.latency_ms} ms`}</td><td>{service.queue_depth}</td><td><EvidenceTime value={service.last_heartbeat_at} /></td><td><div className="flex gap-1"><button title="Test" className="venue-button venue-button--secondary !h-8 !px-2" onClick={() => command.mutate({ id: service.id, command: "test" })}><Stethoscope className="size-3.5" /></button><button title={service.paused ? "Resume" : "Pause"} className="venue-button venue-button--secondary !h-8 !px-2" onClick={() => command.mutate({ id: service.id, command: service.paused ? "resume" : "pause" })}>{service.paused ? <Play className="size-3.5" /> : <Pause className="size-3.5" />}</button><button title="Restart managed service" disabled={!service.locally_managed} className="venue-button venue-button--secondary !h-8 !px-2 disabled:opacity-35" onClick={() => command.mutate({ id: service.id, command: "restart" })}><RotateCcw className="size-3.5" /></button></div></td></tr>)}</tbody></table></div>}
    </Section>
  </PageFrame>;
}
