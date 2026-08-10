"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Activity, AlertTriangle, ArrowRight, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { PageContainer } from "@/components/super-admin/ui/PageContainer";
import { SectionHeader } from "@/components/super-admin/ui/SectionHeader";
import { runtimeConfig } from "@/lib/runtime-config";
import { useAdminOrgs, useOperationsOverview, useOrgEvents } from "@/services/super-admin-service";

const destinations: Record<string, string> = { requests: "/operations-center/requests", risks: "/operations-center/risk-analysis", jobs: "/operations-center/jobs", storage: "/operations-center/storage", venue: "/operations-center/venue-readiness", venue_sync: "/operations-center/venue-readiness", source_api_keys: "/operations-center/venue-readiness", devices: "/operations-center/venue-readiness", cloud_db: "/operations-center/database" };
const tone: Record<string, string> = { HEALTHY: "text-success", DEGRADED: "text-warning", DOWN: "text-danger", UNAVAILABLE: "text-tertiary", STALE: "text-warning" };
const rows = <T,>(value: T[] | { items?: T[] } | undefined): T[] => Array.isArray(value) ? value : value?.items ?? [];

export default function OperationsCenterPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const organizationId = searchParams.get("organization_id") || "";
  const eventId = searchParams.get("event_id") || "";
  const sourceType = searchParams.get("source_type") || "";
  const params = {
    organization_id: organizationId || undefined,
    event_id: eventId || undefined,
    source_type: (sourceType || undefined) as any,
  };
  const organizations = useAdminOrgs({ limit: 200 });
  const events = useOrgEvents(organizationId);
  const organizationRows = rows(organizations.data);
  const eventRows = rows<{ id: string; name: string }>(events.data as any);
  const query = useOperationsOverview(params);
  const updateScope = (next: { organization_id?: string; event_id?: string; source_type?: string }) => {
    const sp = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(next)) {
      if (value) sp.set(key, value);
      else sp.delete(key);
    }
    if ("organization_id" in next) sp.delete("event_id");
    router.replace(`/operations-center${sp.toString() ? `?${sp.toString()}` : ""}`);
  };
  return <PageContainer>
    <SectionHeader title="Operations Center" description="Authoritative control-plane status with explicit freshness and degradation." breadcrumb={["Console", "Operations"]} actions={<Button variant="outline" size="sm" onClick={() => query.refetch()} disabled={query.isFetching}><RefreshCw className={`mr-2 h-4 w-4 ${query.isFetching ? "animate-spin" : ""}`} />Refresh</Button>} />
    <Card className="mb-5 grid gap-3 p-4 md:grid-cols-4">
      <select aria-label="Operations organization scope" value={organizationId} onChange={event => updateScope({ organization_id: event.target.value })} className="rounded-lg border border-border bg-surface px-3 py-2 text-sm">
        <option value="">All organizations</option>
        {organizationRows.map(org => <option key={org.id} value={org.id}>{org.name}</option>)}
      </select>
      <select aria-label="Operations event scope" value={eventId} onChange={event => updateScope({ event_id: event.target.value })} disabled={!organizationId} className="rounded-lg border border-border bg-surface px-3 py-2 text-sm disabled:opacity-50">
        <option value="">All events</option>
        {eventRows.map((event: { id: string; name: string }) => <option key={event.id} value={event.id}>{event.name}</option>)}
      </select>
      <select aria-label="Operations source type" value={sourceType} onChange={event => updateScope({ source_type: event.target.value })} className="rounded-lg border border-border bg-surface px-3 py-2 text-sm">
        <option value="">All sources</option>
        <option value="cloud">Cloud</option>
        <option value="registration_server">Registration Server</option>
        <option value="venue_server">Venue Server</option>
      </select>
      <div className="rounded-lg border border-border bg-surface-2 px-3 py-2 text-xs text-secondary">
        <p className="font-bold uppercase text-tertiary">{query.data?.deployment_profile || runtimeConfig.deploymentProfile}</p>
        <p>{query.data?.realtime?.mode || "hybrid"} · {query.data?.realtime?.transport || "polling fallback"}</p>
      </div>
    </Card>
    {query.isLoading ? <Card className="p-10 text-center text-secondary" role="status">Loading operational sources...</Card> : query.isError || !query.data ? <Card className="border-danger/30 bg-danger/5 p-6"><AlertTriangle className="h-5 w-5 text-danger" /><h2 className="mt-3 font-bold text-primary">Operations overview unavailable</h2><p className="mt-1 text-sm text-secondary">No fallback health state is displayed.</p></Card> : <>
      <Card className="mb-5 flex items-center justify-between p-5"><div><p className="text-xs uppercase tracking-widest text-tertiary">Overall state</p><p className={`mt-1 text-2xl font-black ${tone[query.data.overall_status] ?? "text-warning"}`}>{query.data.overall_status}</p><p className="mt-2 text-xs text-tertiary">Checked {new Date(query.data.checked_at).toLocaleString()} · Source URL {query.data.source_url || "not configured"}</p></div><Activity className="h-8 w-8 text-brand" /></Card>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{query.data.sources.map(source => <Card key={source.key} className="p-5"><div className="flex items-start justify-between"><div><p className="text-xs font-bold uppercase tracking-wider text-tertiary">{source.key}</p><p className={`mt-2 text-lg font-black ${tone[source.status] ?? "text-warning"}`}>{source.status}</p></div>{destinations[source.key] && <Link href={destinations[source.key]} className="rounded-lg p-2 text-tertiary hover:bg-surface-2 hover:text-primary" aria-label={`Open ${source.key}`}><ArrowRight className="h-4 w-4" /></Link>}</div><p className="mt-3 text-xs leading-5 text-secondary">{source.detail}</p><p className="mt-3 text-[10px] text-tertiary">{source.freshness_at ? new Date(source.freshness_at).toLocaleString() : "No freshness evidence"}</p></Card>)}</div>
    </>}
  </PageContainer>;
}
