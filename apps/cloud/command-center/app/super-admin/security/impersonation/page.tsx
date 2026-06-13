"use client";

import React, { useState, useMemo } from "react";
import { 
  useImpersonationLogs, 
  useEndImpersonationSession 
} from "@/services/super-admin-service";
import { 
  Eye, RefreshCw, AlertOctagon, Power, ShieldAlert, Calendar, Globe, 
  CheckCircle, Play, Timer, User, ShieldCheck
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PageContainer } from "@/components/super-admin/ui/PageContainer";
import { SectionHeader } from "@/components/super-admin/ui/SectionHeader";
import { StatusBadge } from "@/components/super-admin/ui/StatusBadge";
import { MetricRow } from "@/components/super-admin/ui/MetricRow";
import { DataTable } from "@/components/super-admin/ui/DataTable";
import { useReactTable, getCoreRowModel, getPaginationRowModel, ColumnDef } from "@tanstack/react-table";

export default function ImpersonationLogPage() {
  const [page, setPage] = useState(0);
  const limit = 20;

  // Query impersonation log history
  const { data, isLoading, refetch } = useImpersonationLogs({
    skip: page * limit,
    limit,
  });

  const terminateSession = useEndImpersonationSession();

  const logs = data?.items || [];
  
  // Split active and ended sessions
  const activeSessions = useMemo(() => logs.filter(log => !log.ended_at), [logs]);
  const endedSessions = useMemo(() => logs.filter(log => !!log.ended_at), [logs]);

  const handleTerminate = async (sessionId: string) => {
    try {
      await terminateSession.mutateAsync(sessionId);
      toast.success("Impersonation session terminated successfully");
      refetch();
    } catch {
      toast.error("Failed to terminate session");
    }
  };

  // Helper to format session duration
  const getDurationText = (start?: string, end?: string) => {
    const startTime = start ? new Date(start).getTime() : Date.now();
    const endTime = end ? new Date(end).getTime() : Date.now();
    const diffSeconds = Math.max(0, Math.floor((endTime - startTime) / 1000));
    
    if (diffSeconds < 60) return `${diffSeconds}s`;
    const mins = Math.floor(diffSeconds / 60);
    const secs = diffSeconds % 60;
    return `${mins}m ${secs}s`;
  };

  // TanStack Table columns
  const columns: ColumnDef<any>[] = useMemo(() => [
    {
      accessorKey: "impersonator_name",
      header: "Impersonator",
      cell: ({ row }) => {
        const name = row.original.impersonator_name;
        const email = row.original.impersonator_email;
        const initials = name ? name[0].toUpperCase() : email[0].toUpperCase();
        return (
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-[var(--brand-primary-muted)] border border-[var(--brand-primary)]/15 flex items-center justify-center font-bold text-[var(--brand-primary)] text-xs">
              {initials}
            </div>
            <div className="min-w-0">
              <p className="text-xs font-semibold text-[var(--text-primary)] leading-tight">{name}</p>
              <p className="text-[10px] text-[var(--text-tertiary)] font-mono">{email}</p>
            </div>
          </div>
        );
      }
    },
    {
      accessorKey: "target_user_name",
      header: "Target User",
      cell: ({ row }) => (
        <div className="min-w-0">
          <p className="text-xs font-semibold text-[var(--text-primary)] leading-tight">{row.original.target_user_name || "—"}</p>
          <p className="text-[10px] text-[var(--text-tertiary)] font-mono">{row.original.target_user_email}</p>
        </div>
      )
    },
    {
      accessorKey: "target_organization_name",
      header: "Target Org",
      cell: ({ row }) => (
        <span className="text-xs text-[var(--text-secondary)] font-medium">
          {row.original.target_organization_name || "—"}
        </span>
      )
    },
    {
      id: "period",
      header: "Period / Duration",
      cell: ({ row }) => (
        <div className="font-mono text-xs text-[var(--text-secondary)] space-y-0.5">
          <div className="flex items-center gap-1.5">
            <Calendar className="w-3.5 h-3.5 text-[var(--text-tertiary)]" />
            <span>{row.original.started_at ? new Date(row.original.started_at).toLocaleDateString() : "—"}</span>
          </div>
          <div className="flex items-center gap-1.5 text-[10px] text-[var(--brand-primary)]">
            <Timer className="w-3.5 h-3.5 text-[var(--brand-primary)]/75" />
            <span>{getDurationText(row.original.started_at, row.original.ended_at)}</span>
          </div>
        </div>
      )
    },
    {
      accessorKey: "ip_address",
      header: "Geo / IP Address",
      cell: ({ row }) => (
        <div className="flex items-center gap-1.5 font-mono text-xs text-[var(--text-secondary)]">
          <Globe className="w-3.5 h-3.5 text-[var(--text-tertiary)]" />
          <span>{row.original.ip_address || "127.0.0.1"}</span>
        </div>
      )
    },
    {
      accessorKey: "reason",
      header: "Reason",
      cell: ({ row }) => (
        <p className="text-xs text-[var(--text-secondary)] max-w-[240px] truncate leading-normal" title={row.original.reason}>
          {row.original.reason}
        </p>
      )
    },
    {
      accessorKey: "ended_at",
      header: "Status",
      cell: ({ row }) => <StatusBadge status={row.original.ended_at ? "disabled" : "active"} />,
    }
  ], []);

  const table = useReactTable({
    data: endedSessions,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
  });

  const metrics = [
    { label: "Active Tunnels", value: activeSessions.length.toString(), icon: Eye, delta: activeSessions.length > 0 ? "Warning active" : "Secure" },
    { label: "Total Historical Bypass", value: endedSessions.length.toString(), icon: Calendar },
    { label: "Broker Connection", value: "Healthy", icon: ShieldCheck }
  ];

  return (
    <PageContainer>
      <SectionHeader
        title="Impersonation Logs"
        description="Reconcile active support sessions, track administrator entries, and force terminate active bypass states."
        breadcrumb={["Console", "Security", "Impersonation"]}
        actions={
          <Button
            variant="outline"
            onClick={() => refetch()}
            size="sm"
            className="border-border"
          >
            <RefreshCw className={cn("w-3.5 h-3.5 mr-2 text-[var(--text-tertiary)]", isLoading && "animate-spin")} />
            Refresh
          </Button>
        }
      />

      {/* Metrics Row */}
      <MetricRow metrics={metrics} />

      {/* Active sessions list */}
      <AnimatePresence>
        {activeSessions.length > 0 && (
          <motion.div 
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="space-y-3"
          >
            <div className="flex items-center gap-2 border-b border-border pb-2">
              <ShieldAlert className="w-4 h-4 text-[var(--danger)] animate-pulse" />
              <h3 className="text-xs font-bold text-[var(--text-primary)] uppercase tracking-wider">Active Administrative Tunnels</h3>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {activeSessions.map(session => (
                <div 
                  key={session.id} 
                  className="rounded-xl border border-[var(--danger)]/30 bg-[var(--danger-muted)] p-4 relative overflow-hidden shadow-sm"
                >
                  <div className="flex justify-between items-start gap-4">
                    <div className="space-y-2 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-[9px] font-bold text-[var(--danger)] uppercase tracking-widest font-mono">Session Active</span>
                        <Badge variant="outline" className="border-border text-[var(--text-secondary)] text-[8px] py-0 px-2 font-mono bg-surface">
                          Started: {new Date(session.started_at || "").toLocaleTimeString()}
                        </Badge>
                      </div>
                      
                      <div className="text-xs text-[var(--text-primary)] font-medium">
                        <span className="text-[var(--brand-primary)] font-bold">{session.impersonator_name}</span>
                        <span className="text-[var(--text-tertiary)] mx-1">impersonating</span>
                        <span className="text-orange-400 font-bold">{session.target_user_name}</span>
                        <span className="text-[var(--text-tertiary)] block text-[10px] font-normal leading-relaxed mt-1">
                          Org: <span className="text-[var(--text-primary)] font-bold">{session.target_organization_name}</span>
                        </span>
                      </div>

                      <div className="text-[10px] text-[var(--text-secondary)] leading-relaxed font-sans bg-surface border border-border rounded-lg p-2.5">
                        <span className="text-[var(--text-tertiary)] uppercase tracking-wider font-bold block text-[8px] mb-0.5">Reason:</span>
                        {session.reason}
                      </div>
                    </div>

                    <Button
                      onClick={() => handleTerminate(session.id)}
                      disabled={terminateSession.isPending}
                      className="bg-[var(--danger)] hover:bg-[var(--danger)]/90 text-white font-bold text-[10px] h-8 rounded-lg shrink-0 px-3 flex gap-1.5"
                    >
                      <Power className="w-3.5 h-3.5" />
                      Terminate
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Historical Logs List */}
      <div className="space-y-3 pt-2">
        <div className="flex items-center gap-2 border-b border-border pb-2">
          <Calendar className="w-4 h-4 text-[var(--brand-primary)]" />
          <h3 className="text-xs font-bold text-[var(--text-primary)] uppercase tracking-wider">Historical Logs</h3>
        </div>

        <DataTable table={table} isLoading={isLoading} />
      </div>
    </PageContainer>
  );
}
