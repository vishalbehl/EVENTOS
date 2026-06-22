"use client";

import { useState } from "react";
import { useSearchJobs, useTriggerReindex, useAdminOrgs } from "@/services/super-admin-service";
import {
  Search, RefreshCw, AlertTriangle, CheckCircle2, Play,
  FolderSync, ShieldCheck, Database, Calendar
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { toast } from "sonner";

const ENTITY_TYPES = [
  { key: "events", label: "Events" },
  { key: "speakers", label: "Speakers" },
  { key: "participants", label: "Participants" },
  { key: "sessions", label: "Sessions" },
];

export default function SearchIndexesPage() {
  const [selectedOrgId, setSelectedOrgId] = useState<string>("");
  const [selectedEntities, setSelectedEntities] = useState<string[]>(["events", "speakers", "participants", "sessions"]);
  const [page, setPage] = useState(1);
  const pageSize = 15;

  const { data: orgs = [], isLoading: orgsLoading } = useAdminOrgs({ limit: 200 });
  const { data: jobsData, isLoading: jobsLoading, refetch: refetchJobs } = useSearchJobs({
    page,
    page_size: pageSize,
  });

  const triggerReindexMutation = useTriggerReindex();

  const jobs = jobsData?.items || [];
  const totalJobs = jobsData?.total || 0;
  const totalPages = Math.ceil(totalJobs / pageSize);

  const toggleEntity = (key: string) => {
    setSelectedEntities((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
    );
  };

  const handleTriggerReindex = async () => {
    if (!selectedOrgId) {
      toast.error("Please select an organization");
      return;
    }
    if (selectedEntities.length === 0) {
      toast.error("Please select at least one entity type");
      return;
    }

    try {
      await triggerReindexMutation.mutateAsync({
        orgId: selectedOrgId,
        entityTypes: selectedEntities,
      });
      toast.success("Reindexing job triggered successfully");
      refetchJobs();
    } catch (err: any) {
      toast.error(err?.message || "Failed to trigger reindex");
    }
  };

  // Helper to map org ID to name
  const getOrgName = (orgId: string) => {
    const org = orgs.find((o) => o.id === orgId);
    return org ? org.name : orgId.slice(0, 8) + "…";
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "completed":
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold border bg-emerald-500/10 text-emerald-400 border-emerald-500/20">
            <CheckCircle2 className="w-2.5 h-2.5" /> Completed
          </span>
        );
      case "failed":
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold border bg-red-500/10 text-red-400 border-red-500/20">
            <AlertTriangle className="w-2.5 h-2.5" /> Failed
          </span>
        );
      case "in_progress":
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold border bg-amber-500/10 text-amber-400 border-amber-500/20 animate-pulse">
            <Play className="w-2.5 h-2.5 animate-spin" /> In Progress
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold border bg-blue-500/10 text-blue-400 border-blue-500/20">
            Queued
          </span>
        );
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-2xl bg-cyan-500/10 border border-cyan-500/20">
            <FolderSync className="w-6 h-6 text-cyan-400" />
          </div>
          <div>
            <h1 className="text-xl font-black text-white">Search Indexes</h1>
            <p className="text-[11px] text-white/35">Manage Elasticsearch index documents and trigger manual reindexing</p>
          </div>
        </div>
        <button
          onClick={() => refetchJobs()}
          className="p-2.5 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 transition-colors text-white/40 hover:text-white"
        >
          <RefreshCw className={`w-4 h-4 ${jobsLoading ? "animate-spin" : ""}`} />
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
        {/* Index Control Panel */}
        <div className="lg:col-span-1 rounded-2xl border border-white/5 bg-white/3 p-5 space-y-5">
          <div>
            <h3 className="text-sm font-black text-white flex items-center gap-2">
              <Database className="w-4 h-4 text-cyan-400" /> Reindex Controller
            </h3>
            <p className="text-[10px] text-white/30 mt-0.5">Enqueue a search reindexing job for any tenant</p>
          </div>

          <div className="space-y-4">
            {/* Org Selector */}
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold uppercase tracking-wider text-white/40">Select Organization</label>
              <select
                value={selectedOrgId}
                onChange={(e) => setSelectedOrgId(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl bg-white/5 border border-white/15 text-xs text-white focus:outline-none focus:border-cyan-500/40"
              >
                <option value="" className="bg-[var(--surf)]">Choose Tenant Org…</option>
                {orgs.map((org) => (
                  <option key={org.id} value={org.id} className="bg-[var(--surf)]">
                    {org.name} ({org.slug})
                  </option>
                ))}
              </select>
            </div>

            {/* Entity Checkboxes */}
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold uppercase tracking-wider text-white/40">Entity Types</label>
              <div className="grid grid-cols-2 gap-2">
                {ENTITY_TYPES.map((et) => {
                  const checked = selectedEntities.includes(et.key);
                  return (
                    <button
                      key={et.key}
                      onClick={() => toggleEntity(et.key)}
                      className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border text-left transition-all ${
                        checked
                          ? "bg-cyan-500/5 border-cyan-500/30 text-cyan-400"
                          : "bg-white/3 border-white/5 text-white/35 hover:border-white/10"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        readOnly
                        className="rounded border-white/10 text-cyan-500 focus:ring-0 bg-transparent"
                      />
                      <span className="text-[11px] font-bold">{et.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Action Trigger */}
            <button
              onClick={handleTriggerReindex}
              disabled={triggerReindexMutation.isPending}
              className="w-full py-3 rounded-xl bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white text-[11px] font-bold uppercase tracking-widest transition-all shadow-lg shadow-cyan-500/10 disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {triggerReindexMutation.isPending ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" /> Enqueuing…
                </>
              ) : (
                <>
                  <Play className="w-3.5 h-3.5" /> Trigger Reindexing
                </>
              )}
            </button>
          </div>
        </div>

        {/* Reindexing History */}
        <div className="lg:col-span-2 rounded-2xl border border-white/5 bg-white/3 overflow-hidden">
          <div className="px-5 py-4 border-b border-white/5 flex items-center justify-between">
            <div>
              <h3 className="text-sm font-black text-white">Reindexing History</h3>
              <p className="text-[10px] text-white/30">Asynchronous reindex queue operations log</p>
            </div>
          </div>

          <div className="grid grid-cols-[1.5fr_1.5fr_1.2fr_1fr_1.5fr] gap-4 px-5 py-3 border-b border-white/5">
            {["Organization", "Entities", "Status", "Processed", "Created At"].map((h) => (
              <div key={h} className="text-[9px] font-bold uppercase tracking-[0.18em] text-white/25">{h}</div>
            ))}
          </div>

          {jobsLoading ? (
            <div className="p-8 flex items-center gap-2 text-white/25 text-sm">
              <RefreshCw className="w-4 h-4 animate-spin" /> Loading jobs list…
            </div>
          ) : jobs.length === 0 ? (
            <div className="p-10 text-center text-white/20 text-sm">
              No recent indexing jobs found
            </div>
          ) : (
            <div className="divide-y divide-white/3">
              {jobs.map((job) => (
                <div key={job.id} className="grid grid-cols-[1.5fr_1.5fr_1.2fr_1fr_1.5fr] gap-4 px-5 py-4 hover:bg-white/3 transition-colors items-center">
                  <div className="min-w-0">
                    <p className="text-[13px] font-bold text-white/75 truncate">{getOrgName(job.organization_id)}</p>
                    <p className="text-[9px] text-white/25 truncate font-mono">Job ID: {job.id.slice(0, 8)}…</p>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {job.entity_types?.map((et) => (
                      <span key={et} className="px-1.5 py-0.5 rounded bg-white/5 border border-white/5 text-[9px] font-mono text-white/40">
                        {et}
                      </span>
                    )) || <span className="text-white/20 font-mono text-[9px]">all</span>}
                  </div>
                  <div>{getStatusBadge(job.status)}</div>
                  <p className="text-[11px] font-mono text-white/50">{job.records_processed ?? 0} records</p>
                  <p className="text-[11px] text-white/30 font-mono">
                    {formatDistanceToNow(new Date(job.created_at), { addSuffix: true })}
                  </p>
                </div>
              ))}
            </div>
          )}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between p-4 border-t border-white/5">
              <span className="text-[11px] text-white/25 font-mono">
                Page {page} of {totalPages} · {totalJobs} jobs
              </span>
              <div className="flex gap-2">
                <button
                  onClick={() => setPage(Math.max(1, page - 1))}
                  disabled={page === 1}
                  className="px-3 py-1 rounded bg-white/5 border border-white/10 text-[10px] font-bold text-white/40 hover:text-white disabled:opacity-35 transition-all"
                >
                  Previous
                </button>
                <button
                  onClick={() => setPage(Math.min(totalPages, page + 1))}
                  disabled={page === totalPages}
                  className="px-3 py-1 rounded bg-white/5 border border-white/10 text-[10px] font-bold text-white/40 hover:text-white disabled:opacity-35 transition-all"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
