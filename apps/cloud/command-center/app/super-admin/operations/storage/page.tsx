"use client";

import React, { useState, useMemo } from "react";
import { 
  HardDrive, Activity, RefreshCw, AlertTriangle, ArrowUpRight,
  TrendingUp, BarChart2, Cloud, Layers, Database, Timer
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { PageContainer } from "@/components/super-admin/ui/PageContainer";
import { SectionHeader } from "@/components/super-admin/ui/SectionHeader";
import { ChartCard } from "@/components/super-admin/ui/ChartCard";
import { MetricRow } from "@/components/super-admin/ui/MetricRow";
import { DataTable } from "@/components/super-admin/ui/DataTable";
import { useReactTable, getCoreRowModel, ColumnDef } from "@tanstack/react-table";
import { AreaChart, Area, ResponsiveContainer, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts";

interface QueueState {
  name: string;
  messages: number;
  consumers: number;
  rate_in: number;
  rate_out: number;
  status: string;
}

export default function StorageQueuesPage() {
  const [isRefreshing, setIsRefreshing] = useState(false);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await new Promise((resolve) => setTimeout(resolve, 800));
    setIsRefreshing(false);
    toast.success("Storage and queue parameters synchronized");
  };

  // Mock charts data
  const storageTrendData = [
    { time: "Mon", StorageGB: 412, Files: 12400 },
    { time: "Tue", StorageGB: 420, Files: 12600 },
    { time: "Wed", StorageGB: 445, Files: 13200 },
    { time: "Thu", StorageGB: 468, Files: 13900 },
    { time: "Fri", StorageGB: 480, Files: 14200 },
    { time: "Sat", StorageGB: 492, Files: 14500 },
    { time: "Sun", StorageGB: 512, Files: 15100 },
  ];

  const queueTrendData = [
    { time: "Mon", queued: 12, running: 5 },
    { time: "Tue", queued: 28, running: 8 },
    { time: "Wed", queued: 45, running: 12 },
    { time: "Thu", queued: 140, running: 22 }, // Spikes
    { time: "Fri", queued: 35, running: 15 },
    { time: "Sat", queued: 18, running: 4 },
    { time: "Sun", queued: 24, running: 6 },
  ];

  const queues: QueueState[] = [
    { name: "default", messages: 12, consumers: 4, rate_in: 45, rate_out: 42, status: "healthy" },
    { name: "notifications", messages: 0, consumers: 8, rate_in: 124, rate_out: 124, status: "healthy" },
    { name: "analytics", messages: 342, consumers: 2, rate_in: 88, rate_out: 70, status: "congested" },
    { name: "mailers", messages: 0, consumers: 4, rate_in: 12, rate_out: 12, status: "healthy" },
    { name: "scheduler", messages: 2, consumers: 2, rate_in: 5, rate_out: 5, status: "healthy" },
  ];

  const columns: ColumnDef<QueueState>[] = useMemo(() => [
    {
      accessorKey: "name",
      header: "Queue Name",
      cell: ({ row }) => <span className="font-mono text-xs font-semibold text-[var(--text-primary)]">{row.original.name}</span>,
    },
    {
      accessorKey: "messages",
      header: "Queued Messages",
      cell: ({ row }) => {
        const msg = row.original.messages;
        const color = msg > 100 ? "text-[var(--danger)] font-bold animate-pulse" : msg > 0 ? "text-[var(--warning)]" : "text-[var(--text-tertiary)]";
        return <span className={cn("font-mono text-xs", color)}>{msg.toLocaleString()}</span>;
      },
    },
    {
      accessorKey: "consumers",
      header: "Active Workers",
      cell: ({ row }) => <span className="font-mono text-xs text-[var(--text-secondary)]">{row.original.consumers} workers</span>,
    },
    {
      accessorKey: "rate_in",
      header: "Publish Rate (msg/s)",
      cell: ({ row }) => <span className="font-mono text-xs text-[var(--text-secondary)]">{row.original.rate_in}/s</span>,
    },
    {
      accessorKey: "rate_out",
      header: "Consume Rate (msg/s)",
      cell: ({ row }) => <span className="font-mono text-xs text-[var(--text-secondary)]">{row.original.rate_out}/s</span>,
    },
    {
      accessorKey: "status",
      header: "Status",
      cell: ({ row }) => (
        <span className={cn(
          "px-2 py-0.5 rounded text-[9px] font-bold uppercase",
          row.original.status === "healthy" ? "bg-[var(--success-muted)] text-[var(--success)]" : "bg-[var(--warning-muted)] text-[var(--warning)]"
        )}>
          {row.original.status}
        </span>
      ),
    },
  ], []);

  const table = useReactTable({
    data: queues,
    columns,
    getCoreRowModel: getCoreRowModel(),
  });

  const metrics = [
    { label: "Cloud Storage Used", value: "512.4 GB", icon: HardDrive, delta: "72% of 1TB quota" },
    { label: "Total Object Entries", value: "15,100 files", icon: Cloud },
    { label: "Active Channels", value: queues.length.toString(), icon: Layers },
    { label: "Overall Queue Latency", value: "140ms", icon: Timer, delta: "Normal" }
  ];

  return (
    <PageContainer>
      <SectionHeader
        title="Storage & Message Queues"
        description="Monitor Cloudflare R2 bucket sizes, S3 asset distribution logs, and active message brokers/queues."
        breadcrumb={["Console", "Operations", "Storage & Queues"]}
        actions={
          <Button
            variant="outline"
            onClick={handleRefresh}
            size="sm"
            className="border-border"
          >
            <RefreshCw className={cn("w-3.5 h-3.5 mr-2 text-[var(--text-tertiary)]", isRefreshing && "animate-spin")} />
            Refresh Telemetry
          </Button>
        }
      />

      {/* KPI Stats */}
      <MetricRow metrics={metrics} />

      {/* Storage and Queue Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        {/* Storage Volume Trend Area Chart */}
        <ChartCard title="Object Store Storage Over Time" description="Total S3/R2 assets disk capacity allocation in Gigabytes">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={storageTrendData} margin={{ top: 5, right: 5, left: -25, bottom: 5 }}>
              <CartesianGrid stroke="var(--border-default)" strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="time" tick={{ fill: "var(--text-tertiary)", fontSize: 10 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: "var(--text-tertiary)", fontSize: 10 }} axisLine={false} tickLine={false} />
              <Tooltip />
              <Area type="monotone" dataKey="StorageGB" stroke="#8B5CF6" fill="#8B5CF6" fillOpacity={0.15} />
            </AreaChart>
          </ResponsiveContainer>
        </ChartCard>

        {/* Message Queues Depth Area Chart */}
        <ChartCard title="Queue Message Backlog Timeline" description="Analysis of queued and running background execution metrics">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={queueTrendData} margin={{ top: 5, right: 5, left: -25, bottom: 5 }}>
              <CartesianGrid stroke="var(--border-default)" strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="time" tick={{ fill: "var(--text-tertiary)", fontSize: 10 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: "var(--text-tertiary)", fontSize: 10 }} axisLine={false} tickLine={false} />
              <Tooltip />
              <Area type="monotone" dataKey="queued" stackId="1" stroke="#EF4444" fill="#EF4444" fillOpacity={0.15} />
              <Area type="monotone" dataKey="running" stackId="1" stroke="#3B82F6" fill="#3B82F6" fillOpacity={0.1} />
            </AreaChart>
          </ResponsiveContainer>
        </ChartCard>

      </div>

      {/* Broker Queues Section */}
      <div className="space-y-3 pt-2">
        <div className="flex items-center gap-2 border-b border-border pb-2">
          <Layers className="w-4 h-4 text-[var(--brand-primary)]" />
          <h3 className="text-xs font-bold text-[var(--text-primary)] uppercase tracking-wider">Active Broker Queues (Celery/RabbitMQ)</h3>
        </div>

        <DataTable table={table} />
      </div>

    </PageContainer>
  );
}
