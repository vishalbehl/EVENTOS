"use client";

import React, { useState, useMemo } from "react";
import { 
  Lock, RefreshCw, AlertTriangle, ShieldCheck, Play, 
  Trash2, Edit3, PlusCircle, Clock, ShieldAlert, Layers
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { PageContainer } from "@/components/super-admin/ui/PageContainer";
import { SectionHeader } from "@/components/super-admin/ui/SectionHeader";
import { DataTable } from "@/components/super-admin/ui/DataTable";
import { useReactTable, getCoreRowModel, getPaginationRowModel, ColumnDef } from "@tanstack/react-table";
import { MetricRow } from "@/components/super-admin/ui/MetricRow";

interface RateLimitRule {
  id: string;
  path: string;
  method: string;
  limit_per_min: number;
  blocked_count_24h: number;
  status: string;
}

export default function RateLimitsPage() {
  const [isRefreshing, setIsRefreshing] = useState(false);

  const rules: RateLimitRule[] = [
    { id: "rule-1", path: "/api/v1/auth/login", method: "POST", limit_per_min: 10, blocked_count_24h: 384, status: "enforced" },
    { id: "rule-2", path: "/api/v1/registrations/*", method: "POST", limit_per_min: 120, blocked_count_24h: 12, status: "enforced" },
    { id: "rule-3", path: "/api/v1/developer/*", method: "ALL", limit_per_min: 300, blocked_count_24h: 2450, status: "enforced" },
    { id: "rule-4", path: "/platform/*", method: "ALL", limit_per_min: 60, blocked_count_24h: 0, status: "enforced" },
    { id: "rule-5", path: "/api/v1/static/*", method: "GET", limit_per_min: 2000, blocked_count_24h: 0, status: "disabled" },
  ];

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await new Promise((resolve) => setTimeout(resolve, 800));
    setIsRefreshing(false);
    toast.success("Rate limit rules and logs refreshed");
  };

  const handleModify = (id: string) => {
    toast.info(`Modify limit configuration for rule ID: ${id}`);
  };

  const columns: ColumnDef<RateLimitRule>[] = useMemo(() => [
    {
      accessorKey: "path",
      header: "API Route Pattern",
      cell: ({ row }) => <span className="font-mono text-xs font-semibold text-[var(--text-primary)]">{row.original.path}</span>,
    },
    {
      accessorKey: "method",
      header: "HTTP Method",
      cell: ({ row }) => (
        <span className="font-mono text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 bg-surface-2 border border-border rounded">
          {row.original.method}
        </span>
      ),
    },
    {
      accessorKey: "limit_per_min",
      header: "Threshold / Min",
      cell: ({ row }) => <span className="font-mono text-xs text-[var(--text-secondary)]">{row.original.limit_per_min.toLocaleString()} req/m</span>,
    },
    {
      accessorKey: "blocked_count_24h",
      header: "Blocked (24h)",
      cell: ({ row }) => {
        const count = row.original.blocked_count_24h;
        const color = count > 1000 ? "text-[var(--danger)] font-bold" : count > 0 ? "text-[var(--warning)]" : "text-[var(--text-tertiary)]";
        return <span className={cn("font-mono text-xs", color)}>{count.toLocaleString()}</span>;
      },
    },
    {
      accessorKey: "status",
      header: "Rule Status",
      cell: ({ row }) => (
        <span className={cn(
          "px-2 py-0.5 rounded text-[9px] font-bold uppercase",
          row.original.status === "enforced" ? "bg-[var(--success-muted)] text-[var(--success)]" : "bg-surface-2 text-[var(--text-tertiary)]"
        )}>
          {row.original.status}
        </span>
      ),
    },
    {
      id: "actions",
      header: "",
      cell: ({ row }) => (
        <div className="flex justify-end gap-2">
          <Button
            size="sm"
            variant="ghost"
            onClick={() => handleModify(row.original.id)}
            className="h-8 w-8 p-0 hover:bg-surface-hover/40"
          >
            <Edit3 className="w-3.5 h-3.5 text-[var(--text-secondary)]" />
          </Button>
        </div>
      ),
    },
  ], []);

  const table = useReactTable({
    data: rules,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
  });

  const metrics = [
    { label: "Active Firewall Rules", value: rules.filter(r => r.status === "enforced").length.toString(), icon: Lock },
    { label: "Blocked Requests (24h)", value: "2,846", icon: ShieldAlert, delta: "Spike detected on developer route" },
    { label: "Current WAF Lockouts", value: "12 IPs", icon: ShieldCheck }
  ];

  return (
    <PageContainer>
      <SectionHeader
        title="Rate Limit Policies"
        description="Define API consumer throttling parameters, configure rule gates by route prefix, and inspect blocked request statistics."
        breadcrumb={["Console", "Developer", "Rate Limits"]}
        actions={
          <div className="flex gap-2">
            <Button
              onClick={() => toast.info("Add new throttling rule")}
              size="sm"
              className="bg-[var(--brand-primary)] hover:bg-[var(--brand-primary)]/90 text-white font-semibold text-xs h-9 px-4 flex gap-1.5"
            >
              <PlusCircle className="w-3.5 h-3.5" /> Define Rule
            </Button>
            <Button
              variant="outline"
              onClick={handleRefresh}
              size="sm"
              className="border-border"
            >
              <RefreshCw className={cn("w-3.5 h-3.5 text-[var(--text-tertiary)]", isRefreshing && "animate-spin")} />
            </Button>
          </div>
        }
      />

      <MetricRow metrics={metrics} />

      <div className="space-y-4">
        {/* Rules Grid */}
        <DataTable table={table} />
      </div>

    </PageContainer>
  );
}
