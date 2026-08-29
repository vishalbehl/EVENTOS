"use client";

import { useQuery } from "@tanstack/react-query";
import { Cable, Network, RefreshCw, Router, ShieldCheck } from "lucide-react";
import { apiClient } from "@/lib/api-client";
import { ErrorState, LoadingState, Metric, PageFrame, Section, StatusBadge, formatTime } from "@/components/operations/control-room";

type NetworkState = { generated_at: string; hostname: string; configured: boolean; adapter: null | { name: string; description?: string; media_type: string; ip_address?: string; subnet?: string; gateway?: string; mac_address?: string; updated_at?: string }; api: { host: string; port: number; tls_required: boolean } };

export default function NetworkPage() {
  const query = useQuery({ queryKey: ["venue-network"], queryFn: () => apiClient.get<NetworkState>("/venue/admin/control/network"), refetchInterval: 15000 }); const data = query.data;
  return <PageFrame eyebrow="Trusted venue subnet" title="Network" description="Authoritative adapter binding and local API exposure. Discovery tools remain constrained to the configured private subnet." actions={<button className="venue-button venue-button--secondary" onClick={() => query.refetch()}><RefreshCw className="size-4" />Refresh</button>}>
    {query.isLoading && <LoadingState />}{query.isError && <ErrorState message={(query.error as Error).message} retry={() => query.refetch()} />}{data && <><div className="venue-metric-grid"><Metric label="Binding" value={<StatusBadge state={data.configured ? "healthy" : "not_configured"} />} detail={data.adapter?.name || "Select a venue adapter"} /><Metric label="API exposure" value={`${data.api.host}:${data.api.port}`} detail={data.api.tls_required ? "TLS required by production profile" : "Local profile; TLS not enforced"} state={data.api.tls_required ? "healthy" : "degraded"} /><Metric label="Subnet" value={data.adapter?.subnet || "Unknown"} detail={data.adapter?.media_type || "No adapter"} /><Metric label="Evidence" value={formatTime(data.generated_at)} detail="Last network projection" /></div><Section title="Active adapter" description="Persisted network identity"><div className="grid gap-px bg-[var(--border)] md:grid-cols-2 xl:grid-cols-4">{[[Router, "Adapter", data.adapter?.name], [Network, "IP / subnet", `${data.adapter?.ip_address || "Unknown"} · ${data.adapter?.subnet || "Unknown"}`], [Cable, "Gateway", data.adapter?.gateway], [ShieldCheck, "MAC identity", data.adapter?.mac_address]].map(([Icon, label, value]) => { const Component = Icon as typeof Router; return <div key={String(label)} className="bg-[var(--card)] p-4"><Component className="size-4 text-[var(--acc)]" /><p className="mt-3 text-[10px] font-semibold uppercase text-[var(--muted)]">{String(label)}</p><p className="mt-1 font-mono text-xs">{String(value || "Not observed")}</p></div>; })}</div></Section></>}
  </PageFrame>;
}
