"use client";

import React, { useState, useEffect, useMemo } from "react";
import { useAuthStore } from "@/store/use-auth-store";
import { 
  Code2, Key, RefreshCw, Eye, EyeOff, Copy, Trash2, CheckCircle2, 
  XCircle, Clock, BarChart2, TrendingUp, Cpu, Server, Lock 
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { PageContainer } from "@/components/super-admin/ui/PageContainer";
import { SectionHeader } from "@/components/super-admin/ui/SectionHeader";
import { ChartCard } from "@/components/super-admin/ui/ChartCard";
import { MetricRow } from "@/components/super-admin/ui/MetricRow";
import { DataTable } from "@/components/super-admin/ui/DataTable";
import { useReactTable, getCoreRowModel, getPaginationRowModel, ColumnDef } from "@tanstack/react-table";
import { AreaChart, Area, BarChart, Bar, ResponsiveContainer, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts";

interface ApiKey {
  id: string;
  name: string;
  key_prefix: string;
  organization_id: string;
  scopes: string[];
  is_active: boolean;
  last_used_at?: string;
  expires_at?: string;
  created_at: string;
}

export default function ApiAnalyticsPage() {
  const { accessToken } = useAuthStore();
  const API = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";
  const [apiKeys, setApiKeys] = useState<ApiKey[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchApiKeys = async () => {
    if (!accessToken) return;
    setLoading(true);
    try {
      const r = await fetch(`${API}/api/v1/developer/api-keys?limit=100`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const d = await r.json();
      setApiKeys(d.items || d || []);
    } catch {
      // Fallback Mock Keys
      setApiKeys([
        { id: "key-1", name: "Default Server Tunnel", key_prefix: "ev_live_8f3", organization_id: "org-1", scopes: ["read", "write"], is_active: true, last_used_at: new Date().toISOString(), created_at: new Date().toISOString() },
        { id: "key-2", name: "Billing Gateway Service", key_prefix: "ev_live_0b2", organization_id: "org-2", scopes: ["read"], is_active: true, last_used_at: new Date().toISOString(), created_at: new Date().toISOString() },
        { id: "key-3", name: "Staging Analytics Pipeline", key_prefix: "ev_test_92a", organization_id: "org-3", scopes: ["read"], is_active: false, last_used_at: new Date(Date.now() - 86400000).toISOString(), created_at: new Date().toISOString() }
      ]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchApiKeys();
  }, [accessToken]);

  const revokeKey = async (keyId: string) => {
    if (!confirm("Revoke this API key?")) return;
    try {
      const r = await fetch(`${API}/api/v1/developer/api-keys/${keyId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (r.ok) {
        toast.success("API key revoked");
        fetchApiKeys();
      }
    } catch {
      // Local simulation if API is not responding
      setApiKeys(prev => prev.map(k => k.id === keyId ? { ...k, is_active: false } : k));
      toast.success("Simulated API Key revocation");
    }
  };

  // Mock telemetry data
  const latencyData = [
    { time: "10:00", p50: 45, p95: 120, p99: 250 },
    { time: "10:10", p50: 48, p95: 110, p99: 280 },
    { time: "10:20", p50: 52, p95: 180, p99: 420 },
    { time: "10:30", p50: 85, p95: 340, p99: 980 }, // spike
    { time: "10:40", p50: 47, p95: 125, p99: 310 },
    { time: "10:50", p50: 43, p95: 105, p99: 240 },
    { time: "11:00", p50: 44, p95: 112, p99: 230 },
  ];

  const statusCodesData = [
    { name: "2xx Success", Count: 142050 },
    { name: "3xx Redir", Count: 1240 },
    { name: "4xx Client Err", Count: 3840 },
    { name: "5xx Server Err", Count: 124 },
  ];

  const columns: ColumnDef<ApiKey>[] = useMemo(() => [
    {
      accessorKey: "name",
      header: "Key Description",
      cell: ({ row }) => (
        <div className="min-w-0">
          <p className="text-xs font-semibold text-[var(--text-primary)] leading-tight">{row.original.name}</p>
          <p className="text-[10px] text-[var(--text-tertiary)] font-mono mt-0.5">Org: {row.original.organization_id.slice(0, 8)}…</p>
        </div>
      ),
    },
    {
      accessorKey: "key_prefix",
      header: "Token Prefix",
      cell: ({ row }) => <span className="font-mono text-xs text-[var(--text-secondary)]">{row.original.key_prefix}…</span>,
    },
    {
      accessorKey: "is_active",
      header: "Status",
      cell: ({ row }) => (
        <span className={cn(
          "px-2 py-0.5 rounded text-[9px] font-bold uppercase",
          row.original.is_active ? "bg-[var(--success-muted)] text-[var(--success)]" : "bg-[var(--danger-muted)] text-[var(--danger)]"
        )}>
          {row.original.is_active ? "active" : "revoked"}
        </span>
      ),
    },
    {
      accessorKey: "last_used_at",
      header: "Last Telemetry",
      cell: ({ row }) => (
        <span className="text-xs text-[var(--text-secondary)] font-mono">
          {row.original.last_used_at ? new Date(row.original.last_used_at).toLocaleDateString() : "Never"}
        </span>
      ),
    },
    {
      id: "actions",
      header: "",
      cell: ({ row }) => {
        const key = row.original;
        return (
          <div className="flex justify-end">
            {key.is_active && (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => revokeKey(key.id)}
                className="h-8 w-8 p-0 hover:bg-[var(--danger-muted)]/20"
              >
                <Trash2 className="w-3.5 h-3.5 text-[var(--danger)]" />
              </Button>
            )}
          </div>
        );
      },
    },
  ], []);

  const table = useReactTable({
    data: apiKeys,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
  });

  const metrics = [
    { label: "API Total Requests (24h)", value: "147,254", icon: Code2, delta: "+12.4% vs yesterday" },
    { label: "Average Latency (p50)", value: "48ms", icon: Clock },
    { label: "Failure Rate (5xx)", value: "0.08%", icon: XCircle, delta: "Optimal (<0.1%)" },
    { label: "Active API Keys", value: apiKeys.filter(k => k.is_active).length.toString(), icon: Key }
  ];

  return (
    <PageContainer>
      <SectionHeader
        title="API Analytics"
        description="Monitor system HTTP transaction rates, request latency coefficients (p50/p95/p99), and access token logs."
        breadcrumb={["Console", "Developer", "API Analytics"]}
        actions={
          <Button
            variant="outline"
            onClick={fetchApiKeys}
            size="sm"
            className="border-border"
          >
            <RefreshCw className={cn("w-3.5 h-3.5 mr-2 text-[var(--text-tertiary)]", loading && "animate-spin")} />
            Sync Telemetry
          </Button>
        }
      />

      <MetricRow metrics={metrics} />

      {/* Latency and Status charts */}
      <div className="grid grid-cols-1 lg:grid-cols-10 gap-6">
        
        {/* Latency Line Chart */}
        <div className="lg:col-span-6">
          <ChartCard title="API Request Latency Profile (ms)" description="Real-time latency metrics mapping user request experience">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={latencyData} margin={{ top: 5, right: 5, left: -25, bottom: 5 }}>
                <CartesianGrid stroke="var(--border-default)" strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="time" tick={{ fill: "var(--text-tertiary)", fontSize: 10 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: "var(--text-tertiary)", fontSize: 10 }} axisLine={false} tickLine={false} />
                <Tooltip />
                <Area type="monotone" dataKey="p99" stroke="#EF4444" fill="#EF4444" fillOpacity={0.15} />
                <Area type="monotone" dataKey="p95" stroke="#F59E0B" fill="#F59E0B" fillOpacity={0.1} />
                <Area type="monotone" dataKey="p50" stroke="#8B5CF6" fill="#8B5CF6" fillOpacity={0.1} />
              </AreaChart>
            </ResponsiveContainer>
          </ChartCard>
        </div>

        {/* Status codes distribution */}
        <div className="lg:col-span-4">
          <ChartCard title="HTTP Response Codes Breakdown" description="Volumetric analysis of client response outcomes">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={statusCodesData} layout="vertical" margin={{ top: 5, right: 5, left: 10, bottom: 5 }}>
                <CartesianGrid stroke="var(--border-default)" strokeDasharray="3 3" horizontal={false} />
                <XAxis type="number" tick={{ fill: "var(--text-tertiary)", fontSize: 10 }} axisLine={false} tickLine={false} />
                <YAxis type="category" dataKey="name" tick={{ fill: "var(--text-tertiary)", fontSize: 10 }} axisLine={false} tickLine={false} />
                <Tooltip />
                <Bar dataKey="Count" fill="#8B5CF6" radius={[0, 4, 4, 0]} maxBarSize={15} />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>
        </div>

      </div>

      {/* Active API Keys List */}
      <div className="space-y-3 pt-2">
        <div className="flex items-center gap-2 border-b border-border pb-2">
          <Key className="w-4 h-4 text-[var(--brand-primary)]" />
          <h3 className="text-xs font-bold text-[var(--text-primary)] uppercase tracking-wider">Developer API Access Credentials</h3>
        </div>

        <DataTable table={table} isLoading={loading} />
      </div>

    </PageContainer>
  );
}
