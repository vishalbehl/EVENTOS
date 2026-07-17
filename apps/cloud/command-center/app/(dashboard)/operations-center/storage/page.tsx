"use client";

import { AlertTriangle, HardDrive, Layers, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { PageContainer } from "@/components/super-admin/ui/PageContainer";
import { SectionHeader } from "@/components/super-admin/ui/SectionHeader";
import { useQueueStats, useStorageTelemetry } from "@/services/super-admin-service";

const bytes = (value: number) => value >= 1024 ** 3 ? `${(value / 1024 ** 3).toFixed(1)} GB` : value >= 1024 ** 2 ? `${(value / 1024 ** 2).toFixed(1)} MB` : `${value.toLocaleString()} B`;

export default function StorageAndQueuesPage() {
  const queues = useQueueStats(); const storage = useStorageTelemetry();
  const refresh = () => { queues.refetch(); storage.refetch(); };
  return <PageContainer><SectionHeader title="Storage & Message Queues" description="Authoritative file-state totals and broker depth, with unknown provider facts shown explicitly." breadcrumb={["Console","Operations","Storage & Queues"]} actions={<Button variant="outline" size="sm" onClick={refresh}><RefreshCw className="mr-2 h-4 w-4" />Refresh</Button>} />
    <div className="mb-5 grid gap-4 md:grid-cols-3"><Card className="p-5"><HardDrive className="h-5 w-5 text-brand" /><p className="mt-3 text-xs uppercase text-tertiary">Tracked objects</p><p className="text-2xl font-black">{storage.data?.total_objects.toLocaleString() ?? "-"}</p></Card><Card className="p-5"><p className="text-xs uppercase text-tertiary">Tracked bytes</p><p className="mt-3 text-2xl font-black">{storage.data ? bytes(storage.data.total_bytes) : "-"}</p></Card><Card className="p-5"><p className="text-xs uppercase text-tertiary">Provider state</p><p className="mt-3 text-2xl font-black text-warning">{storage.data?.provider_status ?? "UNKNOWN"}</p></Card></div>
    {(queues.isError || storage.isError) && <Card className="mb-5 border-danger/30 p-5"><AlertTriangle className="h-5 w-5 text-danger" /><p className="mt-2 text-sm">One or more telemetry sources are unavailable. Missing data is not treated as healthy.</p></Card>}
    <div className="grid gap-5 xl:grid-cols-2"><Card className="overflow-x-auto"><h2 className="border-b border-border p-4 font-bold"><Layers className="mr-2 inline h-4 w-4" />Queues</h2><table className="w-full text-left text-xs"><thead><tr className="bg-surface-2"><th className="p-4">Queue</th><th>Depth</th><th>Status</th><th>Workers</th></tr></thead><tbody>{queues.data?.map(q => <tr key={q.name} className="border-b border-border"><td className="p-4 font-mono">{q.name}</td><td>{q.depth}</td><td>{q.status}</td><td>{q.worker_status || "UNVERIFIED"}</td></tr>)}</tbody></table></Card><Card className="overflow-x-auto"><h2 className="border-b border-border p-4 font-bold">File processing states</h2><table className="w-full text-left text-xs"><thead><tr className="bg-surface-2"><th className="p-4">State</th><th>Objects</th><th>Bytes</th></tr></thead><tbody>{storage.data?.by_status.map(s => <tr key={s.status} className="border-b border-border"><td className="p-4">{s.status}</td><td>{s.count}</td><td>{bytes(s.bytes)}</td></tr>)}</tbody></table><p className="p-4 text-xs text-tertiary">{storage.data?.provider_detail}</p></Card></div>
  </PageContainer>;
}
