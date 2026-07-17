"use client";

import Link from "next/link";
import { Activity, AlertTriangle, ArrowRight, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { PageContainer } from "@/components/super-admin/ui/PageContainer";
import { SectionHeader } from "@/components/super-admin/ui/SectionHeader";
import { useOperationsOverview } from "@/services/super-admin-service";

const destinations: Record<string, string> = { requests: "/operations-center/requests", risks: "/operations-center/risk-analysis", jobs: "/operations-center/jobs", storage: "/operations-center/storage", venue: "/operations-center/venue-readiness" };
const tone: Record<string, string> = { HEALTHY: "text-success", DEGRADED: "text-warning", DOWN: "text-danger", UNAVAILABLE: "text-tertiary", STALE: "text-warning" };

export default function OperationsCenterPage() {
  const query = useOperationsOverview();
  return <PageContainer>
    <SectionHeader title="Operations Center" description="Authoritative control-plane status with explicit freshness and degradation." breadcrumb={["Console", "Operations"]} actions={<Button variant="outline" size="sm" onClick={() => query.refetch()} disabled={query.isFetching}><RefreshCw className={`mr-2 h-4 w-4 ${query.isFetching ? "animate-spin" : ""}`} />Refresh</Button>} />
    {query.isLoading ? <Card className="p-10 text-center text-secondary" role="status">Loading operational sources...</Card> : query.isError || !query.data ? <Card className="border-danger/30 bg-danger/5 p-6"><AlertTriangle className="h-5 w-5 text-danger" /><h2 className="mt-3 font-bold text-primary">Operations overview unavailable</h2><p className="mt-1 text-sm text-secondary">No fallback health state is displayed.</p></Card> : <>
      <Card className="mb-5 flex items-center justify-between p-5"><div><p className="text-xs uppercase tracking-widest text-tertiary">Overall state</p><p className={`mt-1 text-2xl font-black ${tone[query.data.overall_status] ?? "text-warning"}`}>{query.data.overall_status}</p></div><Activity className="h-8 w-8 text-brand" /></Card>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{query.data.sources.map(source => <Card key={source.key} className="p-5"><div className="flex items-start justify-between"><div><p className="text-xs font-bold uppercase tracking-wider text-tertiary">{source.key}</p><p className={`mt-2 text-lg font-black ${tone[source.status] ?? "text-warning"}`}>{source.status}</p></div>{destinations[source.key] && <Link href={destinations[source.key]} className="rounded-lg p-2 text-tertiary hover:bg-surface-2 hover:text-primary" aria-label={`Open ${source.key}`}><ArrowRight className="h-4 w-4" /></Link>}</div><p className="mt-3 text-xs leading-5 text-secondary">{source.detail}</p><p className="mt-3 text-[10px] text-tertiary">{source.freshness_at ? new Date(source.freshness_at).toLocaleString() : "No freshness evidence"}</p></Card>)}</div>
    </>}
  </PageContainer>;
}
