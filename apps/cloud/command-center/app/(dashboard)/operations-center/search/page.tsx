"use client";

import { useState } from "react";
import { AlertTriangle, CheckCircle2, Clock3, FolderSync, RefreshCw, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { PageContainer } from "@/components/super-admin/ui/PageContainer";
import { SectionHeader } from "@/components/super-admin/ui/SectionHeader";
import { useAdminOrgs, useSearchJobs } from "@/services/super-admin-service";

const PAGE_SIZE = 15;

function formatTimestamp(value: string): string {
  const timestamp = new Date(value);
  return Number.isNaN(timestamp.getTime()) ? "Unknown" : timestamp.toLocaleString();
}

export default function SearchOperationsPage() {
  const [page, setPage] = useState(1);
  const jobsQuery = useSearchJobs({ page, page_size: PAGE_SIZE });
  const organizationsQuery = useAdminOrgs({ limit: 200 });
  const jobs = jobsQuery.data?.items ?? [];
  const total = jobsQuery.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const organizationName = (organizationId: string) => {
    return organizationsQuery.data?.find((organization) => organization.id === organizationId)?.name ?? organizationId;
  };

  return (
    <PageContainer>
      <SectionHeader
        title="Search Index Operations"
        description="Observe persisted tenant reindex jobs. Manual reindex remains disabled until reason capture, idempotency, audit, and durable queue acknowledgement are added."
        breadcrumb={["Console", "Operations", "Search"]}
        actions={
          <Button variant="outline" size="sm" onClick={() => jobsQuery.refetch()} disabled={jobsQuery.isFetching}>
            <RefreshCw className={`mr-2 h-3.5 w-3.5 ${jobsQuery.isFetching ? "animate-spin" : ""}`} />
            Refresh history
          </Button>
        }
      />

      <Card className="rounded-2xl border-amber-500/20 bg-amber-500/5 p-5">
        <div className="flex items-start gap-3">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-300" />
          <div><h2 className="text-sm font-bold text-primary">Manual reindex is temporarily unavailable</h2><p className="mt-1 text-xs leading-5 text-secondary">The existing backend creates a real job, but the privileged operation does not yet capture an administrative reason, idempotency key, immutable audit event, or confirmed queue-delivery result.</p></div>
        </div>
      </Card>

      <Card className="overflow-hidden rounded-2xl border-border bg-surface">
        <div className="border-b border-border px-5 py-4"><h2 className="flex items-center gap-2 text-sm font-bold text-primary"><Search className="h-4 w-4" /> Reindex job history</h2><p className="mt-1 text-xs text-secondary">Server-persisted jobs across organizations.</p></div>
        {jobsQuery.isLoading ? (
          <div className="flex min-h-64 items-center justify-center gap-3 text-sm text-secondary" role="status"><RefreshCw className="h-5 w-5 animate-spin" /> Loading search jobs</div>
        ) : jobsQuery.isError ? (
          <div className="flex min-h-64 items-center justify-center p-6 text-center"><div><AlertTriangle className="mx-auto h-6 w-6 text-danger" /><h3 className="mt-3 text-sm font-bold text-primary">Search history unavailable</h3><p className="mt-2 text-xs text-secondary">No fallback jobs are displayed.</p></div></div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs" aria-label="Search reindex job history">
              <thead className="bg-surface-2 text-tertiary"><tr><th className="px-5 py-3 font-semibold">Organization</th><th className="px-5 py-3 font-semibold">Entities</th><th className="px-5 py-3 font-semibold">Status</th><th className="px-5 py-3 font-semibold">Processed</th><th className="px-5 py-3 font-semibold">Created</th></tr></thead>
              <tbody className="divide-y divide-border/60">
                {jobs.map((job) => (
                  <tr key={job.id}>
                    <td className="px-5 py-3 text-primary">{organizationName(job.organization_id)}</td>
                    <td className="px-5 py-3 text-secondary">{job.entity_types?.length ? job.entity_types.join(", ") : "All supported entities"}</td>
                    <td className="px-5 py-3"><span className={`inline-flex items-center gap-1.5 ${job.status === "completed" ? "text-success" : job.status === "failed" ? "text-danger" : "text-warning"}`}>{job.status === "completed" ? <CheckCircle2 className="h-3.5 w-3.5" /> : job.status === "failed" ? <AlertTriangle className="h-3.5 w-3.5" /> : <Clock3 className="h-3.5 w-3.5" />}{job.status.replace("_", " ")}</span></td>
                    <td className="px-5 py-3 text-secondary">{job.records_processed.toLocaleString()}</td>
                    <td className="px-5 py-3 text-secondary">{formatTimestamp(job.created_at)}</td>
                  </tr>
                ))}
                {!jobs.length && <tr><td colSpan={5} className="px-5 py-10 text-center text-secondary"><FolderSync className="mx-auto mb-3 h-6 w-6" />No reindex jobs found.</td></tr>}
              </tbody>
            </table>
          </div>
        )}
        <div className="flex items-center justify-between border-t border-border px-5 py-3 text-xs text-secondary">
          <span>{total.toLocaleString()} total jobs</span>
          <div className="flex items-center gap-2"><Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((current) => current - 1)}>Previous</Button><span>Page {page} of {totalPages}</span><Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage((current) => current + 1)}>Next</Button></div>
        </div>
      </Card>
    </PageContainer>
  );
}
