"use client";

import React, { useState, useMemo } from "react";
import { 
  Webhook, RefreshCw, Send, AlertTriangle, CheckCircle2, 
  XCircle, Clock, Globe, Database, ListFilter, Trash2
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { PageContainer } from "@/components/super-admin/ui/PageContainer";
import { SectionHeader } from "@/components/super-admin/ui/SectionHeader";
import { DataTable } from "@/components/super-admin/ui/DataTable";
import { useReactTable, getCoreRowModel, getPaginationRowModel, ColumnDef } from "@tanstack/react-table";
import { MetricRow } from "@/components/super-admin/ui/MetricRow";

interface WebhookDelivery {
  id: string;
  url: string;
  event: string;
  status: number;
  latency_ms: number;
  timestamp: string;
}

export default function WebhooksConsolePage() {
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [selectedEventFilter, setSelectedEventFilter] = useState("ALL");

  const deliveries: WebhookDelivery[] = [
    { id: "del-1", url: "https://api.techconf.io/v1/webhooks/eventos", event: "registration.created", status: 200, latency_ms: 85, timestamp: new Date(Date.now() - 300000).toISOString() },
    { id: "del-2", url: "https://webhooks.summitsphere.net/receiver", event: "registration.created", status: 502, latency_ms: 240, timestamp: new Date(Date.now() - 600000).toISOString() },
    { id: "del-3", url: "https://api.devcon.global/webhook", event: "invoice.paid", status: 200, latency_ms: 110, timestamp: new Date(Date.now() - 1200000).toISOString() },
    { id: "del-4", url: "https://hooks.slack.com/services/T00/B00/X00", event: "event.published", status: 200, latency_ms: 145, timestamp: new Date(Date.now() - 1800000).toISOString() },
    { id: "del-5", url: "https://webhooks.summitsphere.net/receiver", event: "registration.created", status: 504, latency_ms: 2000, timestamp: new Date(Date.now() - 3600000).toISOString() }
  ];

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await new Promise((resolve) => setTimeout(resolve, 800));
    setIsRefreshing(false);
    toast.success("Webhook delivery logs synchronized");
  };

  const handleRedeliver = async (id: string) => {
    toast.info(`Webhook event payload queued for redelivery (ID: ${id})`);
    await new Promise((resolve) => setTimeout(resolve, 500));
    toast.success("Payload dispatched successfully");
  };

  const filteredDeliveries = useMemo(() => {
    return deliveries.filter(d => selectedEventFilter === "ALL" || d.event === selectedEventFilter);
  }, [selectedEventFilter]);

  const columns: ColumnDef<WebhookDelivery>[] = useMemo(() => [
    {
      accessorKey: "url",
      header: "Endpoint URL",
      cell: ({ row }) => (
        <div className="flex items-center gap-2">
          <Globe className="w-3.5 h-3.5 text-[var(--text-tertiary)] shrink-0" />
          <span className="font-mono text-xs text-[var(--text-secondary)] truncate max-w-[240px] block" title={row.original.url}>
            {row.original.url}
          </span>
        </div>
      ),
    },
    {
      accessorKey: "event",
      header: "Trigger Event",
      cell: ({ row }) => (
        <span className="font-mono text-xs font-semibold text-[var(--text-primary)]">
          {row.original.event}
        </span>
      ),
    },
    {
      accessorKey: "status",
      header: "HTTP Status",
      cell: ({ row }) => {
        const code = row.original.status;
        const color = code >= 400 ? "bg-[var(--danger-muted)] text-[var(--danger)]" : "bg-[var(--success-muted)] text-[var(--success)]";
        return (
          <span className={cn("px-2 py-0.5 rounded text-[10px] font-bold font-mono border border-transparent", color)}>
            {code}
          </span>
        );
      },
    },
    {
      accessorKey: "latency_ms",
      header: "Latency",
      cell: ({ row }) => <span className="font-mono text-xs text-[var(--text-secondary)]">{row.original.latency_ms} ms</span>,
    },
    {
      accessorKey: "timestamp",
      header: "Dispatched",
      cell: ({ row }) => <span className="text-xs text-[var(--text-secondary)] font-mono">{new Date(row.original.timestamp).toLocaleTimeString()}</span>,
    },
    {
      id: "actions",
      header: "",
      cell: ({ row }) => (
        <div className="flex justify-end">
          <Button
            size="sm"
            onClick={() => handleRedeliver(row.original.id)}
            className="h-7 px-2.5 rounded bg-[var(--brand-primary-muted)] border border-[var(--brand-primary)]/20 hover:bg-[var(--brand-primary-muted)]/40 text-[var(--brand-primary)] text-[9px] font-bold"
          >
            Redeliver
          </Button>
        </div>
      ),
    },
  ], []);

  const table = useReactTable({
    data: filteredDeliveries,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
  });

  const metrics = [
    { label: "Webhook Integrations", value: "24 endpoints", icon: Webhook, delta: "Across 18 tenants" },
    { label: "Successful Dispatches (24h)", value: "12,405", icon: CheckCircle2 },
    { label: "Delivery Failure Rate", value: "2.84%", icon: AlertTriangle, delta: "240 retried" },
    { label: "Average Dispatch Latency", value: "112ms", icon: Clock }
  ];

  return (
    <PageContainer>
      <SectionHeader
        title="Webhooks Console"
        description="Monitor system event outbound dispatches, review delivery payload response codes, and manually retry failed channels."
        breadcrumb={["Console", "Developer", "Webhooks"]}
        actions={
          <Button
            variant="outline"
            onClick={handleRefresh}
            size="sm"
            className="border-border"
          >
            <RefreshCw className={cn("w-3.5 h-3.5 mr-2 text-[var(--text-tertiary)]", isRefreshing && "animate-spin")} />
            Refresh Logs
          </Button>
        }
      />

      <MetricRow metrics={metrics} />

      <div className="space-y-4">
        {/* Filters Toolbar */}
        <div className="rounded-xl border border-border bg-surface p-4 flex flex-wrap gap-4 items-center">
          <div className="flex items-center gap-1.5 bg-surface border border-border rounded-xl px-2.5">
            <span className="text-[9px] text-[var(--text-tertiary)] uppercase tracking-wider font-bold pl-1">Filter Event:</span>
            <select
              value={selectedEventFilter}
              onChange={(e) => setSelectedEventFilter(e.target.value)}
              className="bg-transparent text-xs text-[var(--text-secondary)] py-1.5 focus:outline-none border-none cursor-pointer pr-4 font-bold"
            >
              <option value="ALL" className="bg-surface">All Events</option>
              <option value="registration.created" className="bg-surface">registration.created</option>
              <option value="invoice.paid" className="bg-surface">invoice.paid</option>
              <option value="event.published" className="bg-surface">event.published</option>
            </select>
          </div>
        </div>

        {/* Deliveries Grid */}
        <DataTable table={table} />
      </div>

    </PageContainer>
  );
}
