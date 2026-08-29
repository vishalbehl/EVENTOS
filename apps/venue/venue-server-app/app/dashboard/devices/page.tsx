"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { RefreshCw, RotateCcw, Search, Send, Wifi } from "lucide-react";
import { toast } from "sonner";
import { apiClient } from "@/lib/api-client";
import { EmptyState, ErrorState, EvidenceTime, LoadingState, PageFrame, Section, StatusBadge } from "@/components/operations/control-room";

type Device = { id: string; name: string; type: string; hostname?: string; ip_address?: string; mac_address?: string; os_version?: string; app_version?: string; status: string; reported_status: string; last_heartbeat_at?: string; room_id?: string; assignment?: { mode: string; status: string; last_sync_at?: string } };

export default function DevicesPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [state, setState] = useState("all");
  const query = useQuery({ queryKey: ["venue-devices"], queryFn: () => apiClient.get<{ items: Device[] }>("/venue/admin/control/devices"), refetchInterval: 10000 });
  const command = useMutation({ mutationFn: ({ id, action }: { id: string; action: string }) => apiClient.post(`/venue/admin/control/commands/device/${id}`, { command: action, reason: `Operator requested ${action}` }), onSuccess: () => { toast.success("Device command queued"); queryClient.invalidateQueries({ queryKey: ["venue-devices"] }); }, onError: (error: Error) => toast.error(error.message) });
  const items = useMemo(() => (query.data?.items || []).filter((item) => (state === "all" || item.status === state) && `${item.name} ${item.hostname || ""} ${item.ip_address || ""} ${item.mac_address || ""}`.toLowerCase().includes(search.toLowerCase())), [query.data, search, state]);
  return <PageFrame eyebrow="Device authority" title="Devices" description="Every approved workstation, scanner, kiosk, room player, technician console and signage endpoint." actions={<button className="venue-button venue-button--secondary" onClick={() => query.refetch()}><RefreshCw className="size-4" />Refresh</button>}>
    <Section title="Device registry" description={`${items.length} matching devices`}>
      <div className="venue-toolbar"><div className="relative min-w-72 flex-1"><Search className="absolute left-3 top-2.5 size-4 text-[var(--muted)]" /><input className="venue-input pl-9" placeholder="Search device, host, IP or MAC" value={search} onChange={(event) => setSearch(event.target.value)} /></div><select className="venue-input !w-44" value={state} onChange={(event) => setState(event.target.value)}><option value="all">All states</option><option value="healthy">Healthy</option><option value="stale">Stale</option><option value="offline">Offline</option><option value="maintenance">Maintenance</option><option value="not_configured">Not configured</option></select></div>
      {query.isLoading && <LoadingState />}{query.isError && <ErrorState message={(query.error as Error).message} retry={() => query.refetch()} />}
      {!query.isLoading && items.length === 0 && <EmptyState title="No matching devices" detail="Enroll a device or change the current filters." />}
      {items.length > 0 && <div className="venue-table-wrap"><table className="venue-table"><thead><tr><th>Device</th><th>State</th><th>Network identity</th><th>Assignment</th><th>Version</th><th>Observed</th><th>Commands</th></tr></thead><tbody>{items.map((device) => <tr key={device.id}><td><strong>{device.name}</strong><div className="venue-code">{device.type}</div></td><td><StatusBadge state={device.status} /></td><td><span className="venue-code">{device.ip_address || "IP unknown"}</span><div className="venue-code">{device.mac_address || device.hostname || "Identity incomplete"}</div></td><td>{device.assignment ? <><span>{device.assignment.mode}</span><div><StatusBadge state={device.assignment.status} /></div></> : <StatusBadge state="not_configured" />}</td><td className="venue-code">{device.app_version || "Unknown"}</td><td><EvidenceTime value={device.last_heartbeat_at} /></td><td><div className="flex gap-1"><button title="Ping" className="venue-button venue-button--secondary !h-8 !px-2" onClick={() => command.mutate({ id: device.id, action: "ping" })}><Wifi className="size-3.5" /></button><button title="Push configuration" className="venue-button venue-button--secondary !h-8 !px-2" onClick={() => command.mutate({ id: device.id, action: "push_configuration" })}><Send className="size-3.5" /></button><button title="Request restart" className="venue-button venue-button--secondary !h-8 !px-2" onClick={() => command.mutate({ id: device.id, action: "restart" })}><RotateCcw className="size-3.5" /></button></div></td></tr>)}</tbody></table></div>}
    </Section>
  </PageFrame>;
}
