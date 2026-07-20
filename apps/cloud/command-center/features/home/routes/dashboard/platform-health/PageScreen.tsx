"use client"

import { Activity, AlertTriangle, CheckCircle2, CircleHelp, Database, RefreshCw, ShieldAlert, XCircle } from "lucide-react"

import { Button } from "@/components/ui/button"
import { PageContainer } from "@/components/super-admin/ui/PageContainer"
import { SectionHeader } from "@/components/super-admin/ui/SectionHeader"
import { cn } from "@/lib/utils"
import { ServiceHealth, useDatabaseStats, usePlatformHealth } from "@/services/super-admin-service"

const STATUS_STYLE: Record<ServiceHealth["status"], { label: string; className: string }> = {
  healthy: { label: "Healthy", className: "bg-success-muted text-success" },
  degraded: { label: "Degraded", className: "bg-warning-muted text-warning" },
  down: { label: "Down", className: "bg-danger-muted text-danger" },
  unverified: { label: "Unverified", className: "bg-info-muted text-info" },
}

function ServiceIcon({ status }: { status: ServiceHealth["status"] }) {
  if (status === "healthy") return <CheckCircle2 className="h-4 w-4 text-success" />
  if (status === "down") return <XCircle className="h-4 w-4 text-danger" />
  if (status === "unverified") return <CircleHelp className="h-4 w-4 text-info" />
  return <AlertTriangle className="h-4 w-4 text-warning" />
}

export default function SystemHealthPage() {
  const health = usePlatformHealth()
  const database = useDatabaseStats()

  const refreshAll = () => {
    health.refetch()
    database.refetch()
  }

  const isRefreshing = health.isFetching || database.isFetching
  const actionableServices = health.data?.services.filter((service) => service.status !== "healthy") ?? []

  return (
    <PageContainer>
      <SectionHeader
        title="Infrastructure Health"
        description="Current dependency snapshots and PostgreSQL diagnostics. Historical uptime requires a metrics backend and is not inferred here."
        breadcrumb={["Console", "Operations", "Infrastructure"]}
        actions={
          <Button variant="outline" onClick={refreshAll} size="sm" disabled={isRefreshing}>
            <RefreshCw className={cn("mr-2 h-3.5 w-3.5", isRefreshing && "animate-spin")} />
            Refresh
          </Button>
        }
      />

      {health.error && (
        <div className="flex items-start gap-3 rounded-xl border border-danger/20 bg-danger-muted p-4" role="alert">
          <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-danger" />
          <div>
            <h2 className="text-sm font-semibold text-primary">Health collection unavailable</h2>
            <p className="mt-1 text-xs text-secondary">No service state is assumed while the health endpoint is unavailable.</p>
          </div>
        </div>
      )}

      {!health.error && actionableServices.length > 0 && (
        <div className="flex items-start gap-3 rounded-xl border border-warning/20 bg-warning-muted p-4" role="status">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-warning" />
          <div>
            <h2 className="text-sm font-semibold text-primary">Dependency attention required</h2>
            <p className="mt-1 text-xs text-secondary">
              {actionableServices.length} service check{actionableServices.length === 1 ? "" : "s"} are degraded, down, or not independently verified. No automatic remediation is implied.
            </p>
          </div>
        </div>
      )}

      <section aria-labelledby="dependency-snapshots-title">
        <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 id="dependency-snapshots-title" className="text-sm font-semibold text-primary">Dependency snapshots</h2>
            <p className="text-xs text-secondary">Each card states exactly what the collector verified.</p>
          </div>
          {health.data?.checked_at && (
            <p className="text-xs text-tertiary">Checked {new Date(health.data.checked_at).toLocaleString("en-IN")}</p>
          )}
        </div>

        {health.isLoading ? (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4" role="status" aria-label="Loading dependency health">
            {Array.from({ length: 4 }).map((_, index) => <div key={index} className="h-32 animate-pulse rounded-xl bg-surface-2" />)}
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
            {(health.data?.services ?? []).map((service) => {
              const style = STATUS_STYLE[service.status]
              return (
                <article key={service.name} className="rounded-xl border border-border bg-surface p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-2.5">
                      <div className="rounded-lg border border-border bg-surface-2 p-2"><ServiceIcon status={service.status} /></div>
                      <h3 className="text-xs font-bold text-primary">{service.name}</h3>
                    </div>
                    <span className={cn("rounded-full px-2 py-1 text-[10px] font-bold", style.className)}>{style.label}</span>
                  </div>
                  <p className="mt-4 text-xs leading-relaxed text-secondary">{service.detail}</p>
                  <p className="mt-2 font-mono text-[10px] text-tertiary">
                    {service.response_ms === null ? "Response time not measured" : `${service.response_ms} ms response`}
                  </p>
                </article>
              )
            })}
          </div>
        )}
      </section>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <section className="space-y-4 rounded-xl border border-border bg-surface p-5 xl:col-span-2" aria-labelledby="postgres-diagnostics-title">
          <div>
            <h2 id="postgres-diagnostics-title" className="flex items-center gap-2 text-sm font-bold text-primary">
              <Database className="h-4 w-4 text-brand-primary" /> PostgreSQL diagnostics
            </h2>
            <p className="text-xs text-tertiary">Current values from PostgreSQL statistics views.</p>
          </div>

          {database.error ? (
            <p className="rounded-lg border border-danger/20 bg-danger-muted p-4 text-xs text-danger" role="alert">Database diagnostics could not be loaded.</p>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                <Metric label="Active connections" value={database.data ? database.data.connections.active.toLocaleString("en-IN") : "Not loaded"} />
                <Metric label="Total connections" value={database.data ? database.data.connections.total.toLocaleString("en-IN") : "Not loaded"} />
                <Metric label="Cache hit ratio" value={database.data ? `${database.data.cache_hit_ratio.toFixed(2)}%` : "Not loaded"} />
                <Metric label="Dead tuples" value={database.data ? database.data.dead_tuples.toLocaleString("en-IN") : "Not loaded"} />
              </div>

              <div>
                <h3 className="mb-2 text-[10px] font-bold uppercase tracking-wider text-tertiary">Slow-query visibility</h3>
                {!database.data ? (
                  <p className="text-xs text-secondary">Loading diagnostics...</p>
                ) : !database.data.slow_query_stats_available ? (
                  <p className="rounded-lg border border-info/20 bg-info-muted p-3 text-xs text-secondary">`pg_stat_statements` is unavailable, so historical slow-query claims are not shown.</p>
                ) : database.data.slow_queries.length === 0 ? (
                  <p className="text-xs text-secondary">No queries above the configured threshold were returned.</p>
                ) : (
                  <pre className="max-h-24 overflow-auto rounded-lg border border-border bg-surface-2 p-3 text-[10px] text-brand-primary">{database.data.slow_queries[0].query}</pre>
                )}
              </div>

              <div className="overflow-x-auto">
                <h3 className="mb-2 text-[10px] font-bold uppercase tracking-wider text-tertiary">Largest tables</h3>
                <table className="w-full text-left text-xs">
                  <thead><tr className="border-b border-border text-tertiary"><th scope="col" className="py-2 pr-4">Table</th><th scope="col" className="py-2">Disk size</th></tr></thead>
                  <tbody className="divide-y divide-border">
                    {(database.data?.table_sizes ?? []).map((table) => (
                      <tr key={table.name}><td className="py-2 pr-4 font-mono text-primary">{table.name}</td><td className="py-2 font-mono text-brand-primary">{table.size}</td></tr>
                    ))}
                    {database.data?.table_sizes.length === 0 && <tr><td colSpan={2} className="py-8 text-center text-secondary">No table-size data returned.</td></tr>}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </section>

        <aside className="rounded-xl border border-border bg-surface p-5" aria-labelledby="diagnostics-boundary-title">
          <Activity className="h-5 w-5 text-info" />
          <h2 id="diagnostics-boundary-title" className="mt-3 text-sm font-bold text-primary">Diagnostics boundary</h2>
          <p className="mt-2 text-xs leading-relaxed text-secondary">
            Redis memory, key sizes, cache-hit rate, connected clients, WebSocket health, and historical uptime are not available from an authoritative collector yet.
          </p>
          <p className="mt-3 text-xs leading-relaxed text-tertiary">
            These values remain intentionally unavailable rather than being estimated. Add them only after authenticated metrics collection and retention are implemented.
          </p>
        </aside>
      </div>
    </PageContainer>
  )
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border bg-surface-2 p-3">
      <span className="block text-[9px] font-bold uppercase tracking-wider text-tertiary">{label}</span>
      <span className="mt-1 block font-mono text-sm font-bold text-primary">{value}</span>
    </div>
  )
}
