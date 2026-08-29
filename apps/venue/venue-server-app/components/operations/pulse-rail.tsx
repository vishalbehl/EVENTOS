"use client";

import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, Cloud, Database, HardDrive, Radio, Server } from "lucide-react";
import { apiClient } from "@/lib/api-client";
import { StatusBadge, formatBytes } from "./control-room";

type Overview = {
  generated_at: string;
  status: string;
  event: { name: string; short_code: string } | null;
  services: Array<{ status: string }>;
  alerts: { total: number; critical?: number };
  sync: { pending: number };
  storage: { status: string; free_bytes?: number };
};

export function PulseRail() {
  const query = useQuery({
    queryKey: ["venue-control-overview"],
    queryFn: () => apiClient.get<Overview>("/venue/admin/control/overview"),
    refetchInterval: 10000,
  });
  const data = query.data;
  const unhealthy = data?.services.filter((service) => service.status !== "healthy").length ?? 0;
  return (
    <div className="venue-pulse" aria-label="Venue pulse">
      <div className="venue-pulse-title"><Radio className="size-4" /><span>Venue pulse</span><StatusBadge state={query.isError ? "unknown" : data?.status || "unknown"} /></div>
      <div className="venue-pulse-item"><Cloud className="size-3.5" /><span>{data?.event ? `${data.event.short_code} · ${data.event.name}` : "No event bound"}</span></div>
      <div className="venue-pulse-item"><Server className="size-3.5" /><span>{data ? `${unhealthy} service exceptions` : "Services unknown"}</span></div>
      <div className="venue-pulse-item"><Database className="size-3.5" /><span>{data ? `${data.sync.pending} pending operations` : "Sync unknown"}</span></div>
      <div className="venue-pulse-item"><AlertTriangle className="size-3.5" /><span>{data ? `${data.alerts.critical || 0} critical alerts` : "Alerts unknown"}</span></div>
      <div className="venue-pulse-item"><HardDrive className="size-3.5" /><span>{data ? `${formatBytes(data.storage.free_bytes)} free` : "Storage unknown"}</span></div>
    </div>
  );
}
