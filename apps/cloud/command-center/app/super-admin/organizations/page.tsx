"use client";

import { useState } from "react";
import { useAdminOrgs, useUpdateOrgStatus, AdminOrg } from "@/services/super-admin-service";
import { useRouter } from "next/navigation";
import {
  Building2, Search, RefreshCw, MoreVertical, ShieldOff, ShieldCheck,
  ExternalLink, ChevronRight, Filter, TrendingUp, Eye,
  AlertTriangle, CheckCircle2, XCircle, Clock, Calendar,
} from "lucide-react";
import { toast } from "sonner";

// ── Status Badge ──────────────────────────────────────────────

const STATUS_STYLES: Record<string, string> = {
  ACTIVE: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
  TRIAL: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  SUSPENDED: "bg-red-500/10 text-red-400 border-red-500/20",
  EXPIRED: "bg-red-500/10 text-red-400 border-red-500/20",
  GRACE_PERIOD: "bg-amber-500/10 text-amber-400 border-amber-500/20",
  CANCELLED: "bg-slate-500/10 text-slate-400 border-slate-500/20",
  PENDING_PAYMENT: "bg-orange-500/10 text-orange-400 border-orange-500/20",
};

function StatusBadge({ status }: { status: string }) {
  const cls = STATUS_STYLES[status] || "bg-white/5 text-white/40 border-white/10";
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${cls}`}>
      {status}
    </span>
  );
}

function HealthBadge({ score }: { score: number }) {
  const color = score >= 80 ? "text-emerald-400" : score >= 50 ? "text-amber-400" : "text-red-400";
  const icon = score >= 80 ? <CheckCircle2 className="w-3 h-3" /> : score >= 50 ? <AlertTriangle className="w-3 h-3" /> : <XCircle className="w-3 h-3" />;
  return (
    <div className={`flex items-center gap-1.5 ${color}`}>
      {icon}
      <span className="text-[11px] font-bold tabular-nums">{score}%</span>
    </div>
  );
}

// ── Suspend Dialog ────────────────────────────────────────────

function SuspendDialog({
  org, onClose,
}: {
  org: AdminOrg | null;
  onClose: () => void;
}) {
  const [reason, setReason] = useState("");
  const { mutateAsync: updateStatus, isPending } = useUpdateOrgStatus();

  if (!org) return null;

  const handleSuspend = async () => {
    try {
      await updateStatus({ id: org.id, isActive: false, reason });
      toast.success(`${org.name} suspended`);
      onClose();
    } catch {
      toast.error("Failed to suspend organization");
    }
  };

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="w-full max-w-md rounded-2xl border border-red-500/20 bg-[#0e0e14] shadow-2xl p-6 space-y-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-red-500/10">
              <ShieldOff className="w-5 h-5 text-red-400" />
            </div>
            <div>
              <h3 className="text-sm font-black text-white">Suspend Organization</h3>
              <p className="text-[10px] text-white/40">{org.name}</p>
            </div>
          </div>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Suspension reason (optional)..."
            className="w-full rounded-xl bg-white/5 border border-white/10 px-4 py-3 text-sm text-white placeholder-white/20 focus:outline-none focus:border-red-500/30 resize-none"
            rows={3}
          />
          <div className="flex gap-3 pt-2">
            <button onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-white/10 text-sm text-white/50 hover:text-white hover:bg-white/5 transition-all font-bold">
              Cancel
            </button>
            <button
              onClick={handleSuspend}
              disabled={isPending}
              className="flex-1 py-2.5 rounded-xl bg-red-500/10 border border-red-500/30 text-sm text-red-400 hover:bg-red-500/20 transition-all font-bold disabled:opacity-40"
            >
              {isPending ? "Suspending…" : "Suspend"}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

// ── Main Component ────────────────────────────────────────────

export default function OrganizationsPage() {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const [suspendTarget, setSuspendTarget] = useState<AdminOrg | null>(null);
  const { mutateAsync: updateStatus } = useUpdateOrgStatus();
  const router = useRouter();
  const limit = 20;

  const { data: orgs = [], isLoading, refetch } = useAdminOrgs({
    skip: page * limit,
    limit,
  });

  const filtered = orgs.filter((o) =>
    !search ||
    o.name?.toLowerCase().includes(search.toLowerCase()) ||
    o.slug?.toLowerCase().includes(search.toLowerCase())
  );

  const handleActivate = async (org: AdminOrg) => {
    try {
      await updateStatus({ id: org.id, isActive: true });
      toast.success(`${org.name} activated`);
      refetch();
    } catch {
      toast.error("Failed to activate organization");
    }
  };

  return (
    <div className="space-y-5 animate-in fade-in duration-500">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-2xl bg-violet-500/10 border border-violet-500/20">
            <Building2 className="w-6 h-6 text-violet-400" />
          </div>
          <div>
            <h1 className="text-xl font-black text-white tracking-tight">All Organizations</h1>
            <p className="text-[11px] text-white/35">Manage all platform tenants · {orgs.length} loaded</p>
          </div>
        </div>
        <button
          onClick={() => refetch()}
          className="p-2.5 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 transition-colors text-white/40 hover:text-white"
        >
          <RefreshCw className={`w-4 h-4 ${isLoading ? "animate-spin" : ""}`} />
        </button>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-white/25" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name, slug, domain…"
          className="w-full pl-11 pr-4 py-3 rounded-xl bg-white/5 border border-white/10 text-sm text-white placeholder-white/20 focus:outline-none focus:border-violet-500/40 focus:bg-white/8 transition-all"
        />
      </div>

      {/* Table */}
      <div className="rounded-2xl border border-white/5 bg-white/3 backdrop-blur-sm overflow-hidden">
        {/* Table Header */}
        <div className="grid grid-cols-[2fr_1fr_1fr_1fr_1fr_auto] gap-4 px-5 py-3 border-b border-white/5">
          {["Organization", "Plan", "Status", "Health", "Created", "Actions"].map((h) => (
            <div key={h} className="text-[9px] font-bold uppercase tracking-[0.18em] text-white/25">{h}</div>
          ))}
        </div>

        {isLoading ? (
          <div className="p-8 flex items-center gap-2 text-white/25 text-sm">
            <RefreshCw className="w-4 h-4 animate-spin" /> Loading organizations…
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-10 text-center text-white/20 text-sm">
            {search ? "No organizations match your search" : "No organizations found"}
          </div>
        ) : (
          <div className="divide-y divide-white/3">
            {filtered.map((org) => (
              <div
                key={org.id}
                className="grid grid-cols-[2fr_1fr_1fr_1fr_1fr_auto] gap-4 px-5 py-4 hover:bg-white/3 transition-colors group items-center"
              >
                {/* Name */}
                <div className="min-w-0">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-violet-500/30 to-purple-500/20 border border-violet-500/20 flex items-center justify-center text-[11px] font-black text-violet-300 uppercase flex-shrink-0">
                      {org.name?.[0] || "?"}
                    </div>
                    <div className="min-w-0">
                      <p className="text-[13px] font-bold text-white/80 truncate">{org.name}</p>
                      <p className="text-[10px] text-white/30 font-mono">{org.slug}</p>
                    </div>
                  </div>
                </div>

                {/* Plan */}
                <div className="text-[12px] font-bold text-white/60">{org.plan || "NONE"}</div>

                {/* Status */}
                <StatusBadge status={org.status || "TRIAL"} />

                {/* Health */}
                <HealthBadge score={org.health_score ?? 100} />

                {/* Created */}
                <div className="text-[11px] text-white/30 font-mono">
                  {org.created_at ? new Date(org.created_at).toLocaleDateString() : "—"}
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={() => router.push(`/super-admin/organizations/${org.id}`)}
                    title="View Detail"
                    className="p-1.5 rounded-lg hover:bg-white/10 text-white/30 hover:text-white transition-colors"
                  >
                    <Eye className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => router.push(`/super-admin/events?org=${org.id}`)}
                    title="Open Event Explorer"
                    className="p-1.5 rounded-lg hover:bg-white/10 text-white/30 hover:text-violet-400 transition-colors"
                  >
                    <Calendar className="w-3.5 h-3.5" />
                  </button>
                  {org.status === "SUSPENDED" || !org.is_active ? (
                    <button
                      onClick={() => handleActivate(org)}
                      title="Activate"
                      className="p-1.5 rounded-lg hover:bg-emerald-500/10 text-white/30 hover:text-emerald-400 transition-colors"
                    >
                      <ShieldCheck className="w-3.5 h-3.5" />
                    </button>
                  ) : (
                    <button
                      onClick={() => setSuspendTarget(org)}
                      title="Suspend"
                      className="p-1.5 rounded-lg hover:bg-red-500/10 text-white/30 hover:text-red-400 transition-colors"
                    >
                      <ShieldOff className="w-3.5 h-3.5" />
                    </button>
                  )}
                  <button
                    onClick={() => router.push(`/super-admin/organizations/${org.id}`)}
                    title="Open Detail"
                    className="p-1.5 rounded-lg hover:bg-white/10 text-white/30 hover:text-white transition-colors"
                  >
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between px-1">
        <span className="text-[11px] text-white/25 font-mono">
          Page {page + 1} · {filtered.length} results
        </span>
        <div className="flex gap-2">
          <button
            onClick={() => setPage(Math.max(0, page - 1))}
            disabled={page === 0}
            className="px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-[11px] font-bold text-white/40 hover:text-white disabled:opacity-30 transition-all"
          >
            Previous
          </button>
          <button
            onClick={() => setPage(page + 1)}
            disabled={orgs.length < limit}
            className="px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-[11px] font-bold text-white/40 hover:text-white disabled:opacity-30 transition-all"
          >
            Next
          </button>
        </div>
      </div>

      {/* Suspend Dialog */}
      <SuspendDialog org={suspendTarget} onClose={() => setSuspendTarget(null)} />
    </div>
  );
}
