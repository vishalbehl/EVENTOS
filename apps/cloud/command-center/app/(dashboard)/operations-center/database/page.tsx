"use client";

import { Activity, AlertTriangle, Clock, Database, HardDrive, RefreshCw, Table2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { MetricRow } from "@/components/super-admin/ui/MetricRow";
import { PageContainer } from "@/components/super-admin/ui/PageContainer";
import { SectionHeader } from "@/components/super-admin/ui/SectionHeader";
import { useDatabaseStats } from "@/services/super-admin-service";

function formatBytes(bytes: number): string {
  if (bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const unitIndex = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / 1024 ** unitIndex).toFixed(unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
}

export default function DatabaseOperationsPage() {
  const databaseQuery = useDatabaseStats();
  const stats = databaseQuery.data;

  const refresh = async () => {
    const result = await databaseQuery.refetch();
    if (result.error) {
      toast.error("Database telemetry could not be refreshed");
      return;
    }
    toast.success("Database telemetry refreshed");
  };

  return (
    <PageContainer>
      <SectionHeader
        title="Database Operations"
        description="Live PostgreSQL connection, cache, relation-size, and slow-query snapshots. Historical charts are shown only when a real metrics store is available."
        breadcrumb={["Console", "Operations", "Database"]}
        actions={
          <Button variant="outline" size="sm" onClick={refresh} disabled={databaseQuery.isFetching}>
            <RefreshCw className={`mr-2 h-3.5 w-3.5 ${databaseQuery.isFetching ? "animate-spin" : ""}`} />
            Refresh snapshot
          </Button>
        }
      />

      {databaseQuery.isLoading ? (
        <Card className="flex min-h-72 items-center justify-center rounded-2xl border-border bg-surface">
          <div className="flex items-center gap-3 text-sm text-secondary" role="status">
            <RefreshCw className="h-5 w-5 animate-spin" /> Loading database telemetry
          </div>
        </Card>
      ) : databaseQuery.isError || !stats ? (
        <Card className="rounded-2xl border-danger/30 bg-danger/5 p-6">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-5 w-5 text-danger" />
            <div className="space-y-2">
              <h2 className="text-sm font-bold text-primary">Database telemetry unavailable</h2>
              <p className="text-xs leading-5 text-secondary">No fallback values are displayed. Confirm database permissions and monitoring views, then retry.</p>
              <Button variant="outline" size="sm" onClick={refresh}>Retry</Button>
            </div>
          </div>
        </Card>
      ) : (
        <div className="space-y-6">
          <MetricRow
            metrics={[
              { label: "Active connections", value: `${stats.connections.active} / ${stats.connections.total}`, icon: Activity },
              { label: "Waiting on locks", value: stats.connections.waiting, icon: Clock },
              { label: "Cache hit ratio", value: `${stats.cache_hit_ratio.toFixed(2)}%`, icon: Database },
              { label: "Database size", value: formatBytes(stats.database_size_bytes), icon: HardDrive },
              { label: "Dead tuples", value: stats.dead_tuples.toLocaleString(), icon: Table2 },
            ]}
          />
          <div className="grid gap-4 md:grid-cols-3">
            <Card className="p-5"><p className="text-xs uppercase tracking-wider text-tertiary">Migration revision</p><p className="mt-2 break-all font-mono text-sm text-primary">{stats.migration?.current_revision || "UNVERIFIED"}</p><p className="mt-2 text-xs text-secondary">{stats.migration?.status || "UNVERIFIED"}</p></Card>
            <Card className="p-5"><p className="text-xs uppercase tracking-wider text-tertiary">RLS enforcement</p><p className="mt-2 text-xl font-black text-primary">{stats.rls ? `${stats.rls.forced_tables}/${stats.rls.enabled_tables}` : "UNVERIFIED"}</p><p className="mt-2 text-xs text-secondary">Forced / enabled tenant tables observed</p></Card>
            <Card className="p-5"><p className="text-xs uppercase tracking-wider text-tertiary">Backup and restore</p><p className="mt-2 text-xl font-black text-warning">{stats.backup?.status || "UNVERIFIED"}</p><p className="mt-2 text-xs text-secondary">No backup claim is made without external evidence.</p></Card>
          </div>

          <div className="grid gap-6 xl:grid-cols-2">
            <Card className="overflow-hidden rounded-2xl border-border bg-surface">
              <div className="border-b border-border px-5 py-4">
                <h2 className="text-sm font-bold text-primary">Largest relations</h2>
                <p className="mt-1 text-xs text-secondary">Current PostgreSQL relation-size snapshot.</p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs" aria-label="Largest database relations">
                  <thead className="bg-surface-2 text-tertiary">
                    <tr><th className="px-5 py-3 font-semibold">Relation</th><th className="px-5 py-3 font-semibold">Size</th></tr>
                  </thead>
                  <tbody className="divide-y divide-border/60">
                    {stats.table_sizes.length ? stats.table_sizes.map((relation) => (
                      <tr key={relation.name}><td className="px-5 py-3 font-mono text-primary">{relation.name}</td><td className="px-5 py-3 text-secondary">{relation.size}</td></tr>
                    )) : <tr><td colSpan={2} className="px-5 py-8 text-center text-secondary">No relation-size data returned.</td></tr>}
                  </tbody>
                </table>
              </div>
            </Card>

            <Card className="overflow-hidden rounded-2xl border-border bg-surface">
              <div className="border-b border-border px-5 py-4">
                <h2 className="text-sm font-bold text-primary">Slow statements</h2>
                <p className="mt-1 text-xs text-secondary">Statements above the backend monitoring threshold.</p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs" aria-label="Slow database statements">
                  <thead className="bg-surface-2 text-tertiary">
                    <tr><th className="px-5 py-3 font-semibold">Query</th><th className="px-5 py-3 font-semibold">Average</th><th className="px-5 py-3 font-semibold">Calls</th></tr>
                  </thead>
                  <tbody className="divide-y divide-border/60">
                    {stats.slow_queries.length ? stats.slow_queries.map((statement) => (
                      <tr key={`${statement.query}-${statement.avg_ms}-${statement.calls}`}>
                        <td className="max-w-md truncate px-5 py-3 font-mono text-primary" title={statement.query}>{statement.query}</td>
                        <td className="px-5 py-3 text-secondary">{statement.avg_ms.toLocaleString()} ms</td>
                        <td className="px-5 py-3 text-secondary">{statement.calls.toLocaleString()}</td>
                      </tr>
                    )) : <tr><td colSpan={3} className="px-5 py-8 text-center text-secondary">{stats.slow_query_stats_available ? "No statements exceeded the monitoring threshold." : "pg_stat_statements telemetry is unavailable."}</td></tr>}
                  </tbody>
                </table>
              </div>
            </Card>
          </div>
        </div>
      )}
    </PageContainer>
  );
}
