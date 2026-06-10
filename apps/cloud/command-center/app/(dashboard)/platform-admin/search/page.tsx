"use client";

import { useState, useEffect, useCallback } from "react";
import { useAuthStore } from "@/store/use-auth-store";
import {
  Search,
  RefreshCw,
  Zap,
  CheckCircle2,
  XCircle,
  Clock,
  Database,
  ChevronDown,
  AlertTriangle,
  Loader2,
} from "lucide-react";

// ── Types ─────────────────────────────────────────────────────

interface SearchJob {
  id: string;
  organization_id: string;
  status: "pending" | "indexing" | "completed" | "failed";
  created_at: string;
}

interface Organization {
  id: string;
  name: string;
  slug: string;
}

// ── Helpers ───────────────────────────────────────────────────

const JOB_STATUS_STYLES = {
  pending:   { bg: "bg-slate-500/10 border-slate-500/30 text-slate-300", icon: <Clock className="w-3 h-3" /> },
  indexing:  { bg: "bg-blue-500/10 border-blue-500/30 text-blue-300",   icon: <Loader2 className="w-3 h-3 animate-spin" /> },
  completed: { bg: "bg-emerald-500/10 border-emerald-500/30 text-emerald-300", icon: <CheckCircle2 className="w-3 h-3" /> },
  failed:    { bg: "bg-red-500/10 border-red-500/30 text-red-300",     icon: <XCircle className="w-3 h-3" /> },
};

function JobStatusBadge({ status }: { status: string }) {
  const s = JOB_STATUS_STYLES[status as keyof typeof JOB_STATUS_STYLES] ?? JOB_STATUS_STYLES.pending;
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider border ${s.bg}`}>
      {s.icon}
      {status}
    </span>
  );
}

const ENTITY_TYPES = [
  { id: "events",       label: "Events",       icon: "🗓️" },
  { id: "speakers",     label: "Speakers",     icon: "🎤" },
  { id: "participants", label: "Participants", icon: "👥" },
  { id: "sessions",     label: "Sessions",     icon: "📋" },
];

// ── Main Component ────────────────────────────────────────────

export default function SearchReindexPage() {
  const { accessToken } = useAuthStore();
  const API = process.env.NEXT_PUBLIC_API_URL;

  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [selectedOrg, setSelectedOrg] = useState<string>("");
  const [selectedTypes, setSelectedTypes] = useState<string[]>(ENTITY_TYPES.map((e) => e.id));
  const [jobs, setJobs] = useState<SearchJob[]>([]);
  const [triggering, setTriggering] = useState(false);
  const [lastJobId, setLastJobId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Load organizations
  useEffect(() => {
    if (!accessToken) return;
    fetch(`${API}/api/v1/organisations?page_size=100`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
      .then((r) => r.json())
      .then((d) => {
        const orgs: Organization[] = d.items ?? d.organizations ?? d ?? [];
        setOrganizations(orgs);
        if (orgs.length > 0 && !selectedOrg) setSelectedOrg(orgs[0].id);
      })
      .catch(console.error);
  }, [accessToken, API]);

  // Fetch job history
  const fetchJobs = useCallback(async () => {
    if (!accessToken) return;
    try {
      const url = `${API}/api/v1/search/jobs?page_size=20${selectedOrg ? `&organization_id=${selectedOrg}` : ""}`;
      const r = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
      if (r.ok) {
        const d = await r.json();
        setJobs(d.items ?? []);
      }
    } catch (e) {
      console.error("Fetch jobs failed:", e);
    } finally {
      setLoading(false);
    }
  }, [accessToken, API, selectedOrg]);

  useEffect(() => {
    fetchJobs();
    const interval = setInterval(fetchJobs, 5000);
    return () => clearInterval(interval);
  }, [fetchJobs]);

  // Toggle entity type
  const toggleType = (type: string) => {
    setSelectedTypes((prev) =>
      prev.includes(type) ? prev.filter((t) => t !== type) : [...prev, type]
    );
  };

  // Trigger reindex
  const triggerReindex = async () => {
    if (!selectedOrg || selectedTypes.length === 0 || triggering) return;
    setTriggering(true);
    try {
      const r = await fetch(`${API}/api/v1/search/reindex`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          organization_id: selectedOrg,
          entity_types: selectedTypes,
        }),
      });
      if (r.ok) {
        const job = await r.json();
        setLastJobId(job.id);
        await fetchJobs();
      }
    } catch (e) {
      console.error("Trigger reindex failed:", e);
    } finally {
      setTriggering(false);
    }
  };

  const orgName = organizations.find((o) => o.id === selectedOrg)?.name ?? "Unknown";
  const activeJob = jobs.find((j) => j.status === "indexing");

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-2xl bg-violet-500/10 border border-violet-500/20">
            <Search className="w-6 h-6 text-violet-400" />
          </div>
          <div>
            <h1 className="text-xl font-black text-white tracking-tight">Search Reindex</h1>
            <p className="text-[11px] text-white/40 font-medium">
              Manage the global full-text search index per organization
            </p>
          </div>
        </div>
        <button
          onClick={fetchJobs}
          className="p-2.5 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 transition-colors text-white/60 hover:text-white"
        >
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      {/* Active indexing banner */}
      {activeJob && (
        <div className="flex items-center gap-3 rounded-2xl border border-blue-500/30 bg-blue-500/10 px-5 py-4">
          <Loader2 className="w-5 h-5 text-blue-400 animate-spin flex-shrink-0" />
          <div>
            <p className="text-sm font-bold text-blue-300">Indexing in progress</p>
            <p className="text-[11px] text-blue-300/60 font-mono">{activeJob.id}</p>
          </div>
        </div>
      )}

      {/* Reindex trigger panel */}
      <div className="rounded-2xl border border-white/10 bg-white/3 backdrop-blur-sm overflow-hidden">
        <div className="px-6 py-5 border-b border-white/5">
          <div className="flex items-center gap-2.5">
            <Zap className="w-4 h-4 text-violet-400" />
            <h2 className="text-sm font-black text-white/90">Trigger Reindex</h2>
          </div>
        </div>

        <div className="px-6 py-5 space-y-5">
          {/* Org selector */}
          <div className="space-y-1.5">
            <label className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/40">
              Organization
            </label>
            <div className="relative">
              <select
                value={selectedOrg}
                onChange={(e) => setSelectedOrg(e.target.value)}
                className="w-full appearance-none rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white font-medium focus:outline-none focus:border-violet-500/50 cursor-pointer"
              >
                {organizations.map((org) => (
                  <option key={org.id} value={org.id} className="bg-[#1a1a2e]">
                    {org.name}
                  </option>
                ))}
              </select>
              <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30 pointer-events-none" />
            </div>
          </div>

          {/* Entity type toggles */}
          <div className="space-y-2">
            <label className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/40">
              Entity Types
            </label>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {ENTITY_TYPES.map((t) => {
                const active = selectedTypes.includes(t.id);
                return (
                  <button
                    key={t.id}
                    onClick={() => toggleType(t.id)}
                    className={`flex items-center gap-2 rounded-xl border px-4 py-3 text-sm font-bold transition-all duration-150 ${
                      active
                        ? "border-violet-500/40 bg-violet-500/10 text-violet-300"
                        : "border-white/10 bg-white/3 text-white/30 hover:border-white/20 hover:text-white/60"
                    }`}
                  >
                    <span>{t.icon}</span>
                    {t.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Trigger button */}
          <button
            onClick={triggerReindex}
            disabled={!selectedOrg || selectedTypes.length === 0 || triggering || !!activeJob}
            className="flex items-center gap-2.5 rounded-xl border border-violet-500/30 bg-violet-500/10 px-5 py-3 text-sm font-black text-violet-300 hover:bg-violet-500/20 hover:border-violet-500/50 transition-all duration-150 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {triggering ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Zap className="w-4 h-4" />
            )}
            {triggering ? "Enqueueing…" : "Trigger Full Reindex"}
          </button>

          {lastJobId && (
            <p className="text-[10px] text-emerald-400 font-mono">
              ✓ Job enqueued: {lastJobId}
            </p>
          )}
        </div>
      </div>

      {/* Job History */}
      <div className="rounded-2xl border border-white/5 bg-white/3 backdrop-blur-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-white/5 flex items-center gap-2">
          <Database className="w-4 h-4 text-white/40" />
          <span className="text-sm font-black text-white/80">Reindex Job History</span>
        </div>

        {loading ? (
          <div className="flex items-center gap-2 p-8 text-white/30 text-sm">
            <RefreshCw className="w-4 h-4 animate-spin" /> Loading jobs…
          </div>
        ) : jobs.length === 0 ? (
          <div className="p-8 text-center text-white/30 text-sm">
            No reindex jobs found. Trigger your first reindex above.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-white/5">
                  {["Job ID", "Organization", "Status", "Created At"].map((h) => (
                    <th key={h} className="px-5 py-3 text-[9px] font-bold uppercase tracking-[0.18em] text-white/30">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {jobs.map((job) => (
                  <tr key={job.id} className="border-b border-white/3 hover:bg-white/3 transition-colors">
                    <td className="px-5 py-3.5 font-mono text-[11px] text-white/50">
                      {job.id.slice(0, 8)}…
                    </td>
                    <td className="px-5 py-3.5 text-[11px] text-white/60">
                      {organizations.find((o) => o.id === job.organization_id)?.name ?? job.organization_id.slice(0, 8)}
                    </td>
                    <td className="px-5 py-3.5">
                      <JobStatusBadge status={job.status} />
                    </td>
                    <td className="px-5 py-3.5 text-[11px] text-white/40 font-mono">
                      {new Date(job.created_at).toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
