"use client";

import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { Activity, AlertTriangle, ExternalLink, RefreshCw } from "lucide-react";
import { useOrganizationDomain } from "@/features/organizations/api/organization-console-api";
import { LoadingPage, OrgCard, OrgDataTable, OrgMetricCard, OrgPageHeader, OrgSectionTitle, OrgStatusBadge, OrgTabBar, UnavailableDomain } from "@/features/organizations/components/OrgPageShared";

export default function OperationsPageScreen() {
  const { orgId } = useParams<{ orgId: string }>();
  const router = useRouter();
  const [activeTab, setActiveTab] = useState("jobs");
  const query = useOrganizationDomain(orgId, "operations");
  if (query.isLoading) return <LoadingPage />;
  if (query.isError || !query.data?.availability?.available) return <UnavailableDomain reason={query.data?.availability?.reason ?? "Organization operations evidence could not be loaded."} />;
  const data = query.data.data as any;
  const jobs: any[] = data.jobs ?? [];
  const failures: any[] = data.failures ?? [];
  const providers: any[] = data.provider_connections ?? [];
  const running = jobs.filter(job => ["pending", "uploaded", "validating", "importing", "in_progress", "processing"].includes(String(job.status).toLowerCase())).length;
  const tabs = [{ key: "jobs", label: "Background Jobs" }, { key: "failures", label: "Failures" }, { key: "providers", label: "External Services" }, { key: "readiness", label: "Readiness & Incidents" }];

  const jobColumns = [
    { key: "job", header: "Job", render: (job: any) => <div><p className="text-xs font-bold text-[var(--text-primary)]">{job.job_type}</p><p className="text-[10px] font-mono text-[var(--text-tertiary)]">{job.id}</p></div> },
    { key: "event", header: "Event", render: (job: any) => <div><p className="text-xs text-[var(--text-primary)]">{job.event_name}</p><p className="text-[10px] font-mono text-[var(--text-tertiary)]">{job.event_id}</p></div> },
    { key: "label", header: "Work item", render: (job: any) => <span className="text-xs text-[var(--text-secondary)]">{job.label || "Not recorded"}</span> },
    { key: "status", header: "Status", render: (job: any) => <OrgStatusBadge status={job.status} /> },
    { key: "created", header: "Created", render: (job: any) => <span className="text-[10px] font-mono text-[var(--text-tertiary)]">{job.created_at ? new Date(job.created_at).toLocaleString() : "Not recorded"}</span> },
  ];

  return <div className="space-y-6 p-6">
    <OrgPageHeader icon={Activity} title="Operations Workspace" description="Organization-scoped jobs, delivery failures, external-service connections, and operational evidence." generatedAt={query.data.generated_at} actions={<button onClick={() => void query.refetch()} className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--border-default)] px-3 py-2 text-xs font-bold"><RefreshCw className="h-3.5 w-3.5" />Refresh evidence</button>} />
    <div className="grid grid-cols-2 gap-4 md:grid-cols-4"><OrgMetricCard label="Recorded jobs" value={jobs.length} /><OrgMetricCard label="In progress" value={running} /><OrgMetricCard label="Failed" value={failures.length} /><OrgMetricCard label="Provider connections" value={providers.length} /></div>
    <OrgTabBar tabs={tabs} active={activeTab} onChange={setActiveTab} />
    {activeTab === "jobs" && <OrgCard><OrgSectionTitle>Organization job ledger</OrgSectionTitle><p className="mb-3 text-xs text-[var(--text-tertiary)]">Import, venue synchronization, and presentation processing records from authoritative domain tables.</p><OrgDataTable columns={jobColumns} rows={jobs} keyFn={(job: any) => `${job.job_type}-${job.id}`} emptyMessage="No organization jobs have been recorded" /></OrgCard>}
    {activeTab === "failures" && <OrgCard><OrgSectionTitle>Delivery and processing failures</OrgSectionTitle><OrgDataTable columns={[...jobColumns, { key: "error", header: "Recorded error", render: (job: any) => <pre className="max-w-sm whitespace-pre-wrap text-[10px] text-[var(--status-danger)]">{job.error_detail == null ? "No error detail recorded" : typeof job.error_detail === "string" ? job.error_detail : JSON.stringify(job.error_detail)}</pre> }]} rows={failures} keyFn={(job: any) => `${job.job_type}-${job.id}`} emptyMessage="No failed jobs are recorded" /></OrgCard>}
    {activeTab === "providers" && <OrgCard><div className="flex items-start justify-between gap-4"><div><OrgSectionTitle>Organization provider connections</OrgSectionTitle><p className="mb-3 text-xs text-[var(--text-tertiary)]">Only this organization’s connection state is shown. Catalogue and platform policy remain in Developer and Operations consoles.</p></div><button onClick={() => router.push(`/organizations/${orgId}/security`)} className="inline-flex items-center gap-1 text-xs font-bold text-[var(--brand-primary)]">Manage tenant connections<ExternalLink className="h-3 w-3" /></button></div><OrgDataTable columns={[{ key: "provider", header: "Provider", render: (row: any) => <span className="text-xs font-bold">{row.provider_name}</span> }, { key: "status", header: "Connection", render: (row: any) => <OrgStatusBadge status={row.is_active ? "ACTIVE" : "PAUSED"} /> }, { key: "version", header: "Version", render: (row: any) => <span className="font-mono text-xs">v{row.version}</span> }]} rows={providers} keyFn={(row: any) => row.id} emptyMessage="No provider connections are configured" /></OrgCard>}
    {activeTab === "readiness" && <div className="grid gap-5 md:grid-cols-2"><OrgCard><OrgSectionTitle>Maintenance and read-only mode</OrgSectionTitle><div className="mt-3 flex gap-3 rounded-xl border border-[var(--status-warning)]/20 p-3"><AlertTriangle className="h-4 w-4 shrink-0 text-[var(--status-warning)]" /><p className="text-xs text-[var(--text-secondary)]">{data.maintenance_mode?.reason ?? "Not measured"}</p></div></OrgCard><OrgCard><OrgSectionTitle>Incident timeline</OrgSectionTitle><div className="mt-3 flex gap-3 rounded-xl border border-[var(--status-warning)]/20 p-3"><AlertTriangle className="h-4 w-4 shrink-0 text-[var(--status-warning)]" /><p className="text-xs text-[var(--text-secondary)]">{data.incident_timeline?.reason ?? "Not measured"}</p></div></OrgCard></div>}
  </div>;
}
