"use client";

import { useState, useMemo } from "react";
import {
  useAdminOrgs,
  useUpdateOrgStatus,
  useSubscriptionPlans,
  useAdminOrgUsage,
  useAdminOrgTimeline,
  useChangeOrgPlan,
  adminApi,
  AdminOrg,
} from "@/services/super-admin-service";
import { useAuthStore } from "@/store/use-auth-store";
import { useRouter } from "next/navigation";
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  ColumnDef,
  SortingState,
} from "@tanstack/react-table";
import {
  Building2,
  Search,
  RefreshCw,
  ShieldOff,
  ShieldCheck,
  ExternalLink,
  Filter,
  Eye,
  AlertTriangle,
  Download,
  Plus,
  User,
  Globe,
  Settings,
  ShieldAlert,
} from "lucide-react";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";
import { apiClient } from "@/lib/api-client";
import { formatDistanceToNow } from "date-fns";

// Reusable Custom UI Components
import { PageContainer } from "@/components/super-admin/ui/PageContainer";
import { SectionHeader } from "@/components/super-admin/ui/SectionHeader";
import { DataTable } from "@/components/super-admin/ui/DataTable";
import { StatusBadge } from "@/components/super-admin/ui/StatusBadge";

// ── Health Badge ──────────────────────────────────────────────

function HealthBadge({ score }: { score: number }) {
  const color = score >= 80 ? "text-[var(--success)]" : score >= 50 ? "text-[var(--warning)]" : "text-[var(--danger)]";
  const bgDot = score >= 80 ? "bg-[#10B981]" : score >= 50 ? "bg-[#F59E0B]" : "bg-[#EF4444]";
  return (
    <div className={`flex items-center gap-1.5 ${color}`}>
      <div className={`w-1.5 h-1.5 rounded-full ${bgDot}`} />
      <span className="text-xs font-bold tabular-nums">{score}%</span>
    </div>
  );
}

// ── Expanded Row Panel ────────────────────────────────────────

function ExpandedRowPanel({ org, plans }: { org: AdminOrg; plans: any[] }) {
  const router = useRouter();
  const { data: usage, isLoading: usageLoading } = useAdminOrgUsage(org.id);
  const { data: timeline = [], isLoading: timelineLoading } = useAdminOrgTimeline(org.id);

  // Find plan limits
  const currentPlan = plans.find((p) => p.name.toUpperCase() === org.plan.toUpperCase());
  const maxEvents = currentPlan?.max_events || 3;
  const maxUsers = currentPlan?.max_users || 10;
  const maxStorageMb = currentPlan?.storage_quota_mb || 10240;

  const eventsCount = usage?.active_events_count || 0;
  const usersCount = usage?.active_users_count || 0;
  const storageBytes = usage?.storage_used_bytes || 0;
  const storageMb = storageBytes / (1024 * 1024);

  const formatBytes = (bytes: number) => {
    const gb = bytes / 1024 ** 3;
    if (gb >= 1) return `${gb.toFixed(1)} GB`;
    return `${(bytes / 1024 ** 2).toFixed(0)} MB`;
  };

  return (
    <div className="bg-surface-2/30 border border-border/40 rounded-xl p-5 grid grid-cols-1 md:grid-cols-3 gap-6 animate-in slide-in-from-top-4 duration-300">
      {/* Col 1: Details */}
      <div className="space-y-4">
        <h4 className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">Subscription Context</h4>
        <div className="space-y-2">
          <div className="flex justify-between items-center text-xs">
            <span className="text-[var(--text-tertiary)]">Active Tier</span>
            <span className="font-bold text-[var(--text-secondary)]">{org.plan}</span>
          </div>
          <div className="flex justify-between items-center text-xs">
            <span className="text-[var(--text-tertiary)]">Lifecycle Status</span>
            <StatusBadge status={org.status} />
          </div>
          {org.custom_domain && (
            <div className="flex justify-between items-center text-xs">
              <span className="text-[var(--text-tertiary)]">Custom Domain</span>
              <span className="font-mono text-violet-400">{org.custom_domain}</span>
            </div>
          )}
          <div className="flex justify-between items-center text-xs">
            <span className="text-[var(--text-tertiary)]">Created At</span>
            <span className="text-[var(--text-secondary)] font-mono">
              {org.created_at ? new Date(org.created_at).toLocaleDateString() : "—"}
            </span>
          </div>
        </div>
        <button
          onClick={() => router.push(`/super-admin/organizations/${org.id}`)}
          className="flex items-center gap-1.5 text-[11px] font-black uppercase text-violet-400 hover:text-violet-300 transition-colors pt-2"
        >
          Open Full Detail <ExternalLink className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Col 2: Usage Meters */}
      <div className="space-y-4">
        <h4 className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">Resource Usage</h4>
        {usageLoading ? (
          <div className="py-8 text-center text-[var(--text-tertiary)] text-xs flex items-center justify-center gap-2">
            <RefreshCw className="w-3.5 h-3.5 animate-spin" /> Fetching allocations…
          </div>
        ) : (
          <div className="space-y-3">
            {/* Events */}
            <div className="space-y-1">
              <div className="flex justify-between text-xs font-mono">
                <span className="text-[var(--text-tertiary)]">Active Events</span>
                <span className="text-[var(--text-secondary)]">
                  {eventsCount} / {maxEvents}
                </span>
              </div>
              <div className="h-1.5 rounded-full bg-surface-2 overflow-hidden">
                <div
                  className="h-full bg-violet-500 rounded-full"
                  style={{ width: `${Math.min(100, (eventsCount / maxEvents) * 100)}%` }}
                />
              </div>
            </div>

            {/* Users */}
            <div className="space-y-1">
              <div className="flex justify-between text-xs font-mono">
                <span className="text-[var(--text-tertiary)]">Active Users</span>
                <span className="text-[var(--text-secondary)]">
                  {usersCount} / {maxUsers}
                </span>
              </div>
              <div className="h-1.5 rounded-full bg-surface-2 overflow-hidden">
                <div
                  className="h-full bg-blue-500 rounded-full"
                  style={{ width: `${Math.min(100, (usersCount / maxUsers) * 100)}%` }}
                />
              </div>
            </div>

            {/* Storage */}
            <div className="space-y-1">
              <div className="flex justify-between text-xs font-mono">
                <span className="text-[var(--text-tertiary)]">Object Storage</span>
                <span className="text-[var(--text-secondary)] text-[11px]">
                  {formatBytes(storageBytes)} / {formatBytes(maxStorageMb * 1024 * 1024)}
                </span>
              </div>
              <div className="h-1.5 rounded-full bg-surface-2 overflow-hidden">
                <div
                  className="h-full bg-emerald-500 rounded-full"
                  style={{ width: `${Math.min(100, (storageMb / maxStorageMb) * 100)}%` }}
                />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Col 3: Billing Timeline */}
      <div className="space-y-4">
        <h4 className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">Billing Ledger (Last 5)</h4>
        {timelineLoading ? (
          <div className="py-8 text-center text-[var(--text-tertiary)] text-xs flex items-center justify-center gap-2">
            <RefreshCw className="w-3.5 h-3.5 animate-spin" /> Loading ledger…
          </div>
        ) : timeline.length === 0 ? (
          <p className="text-[11px] text-[var(--text-tertiary)] py-2">No billing events recorded</p>
        ) : (
          <div className="space-y-2 max-h-[140px] overflow-y-auto custom-scrollbar pr-1">
            {timeline.slice(0, 5).map((e) => (
              <div key={e.id} className="flex justify-between items-center p-1.5 rounded bg-surface-2 text-[11px]">
                <span className="font-bold text-[var(--text-secondary)] truncate max-w-[130px] uppercase font-mono tracking-wider">
                  {e.action_type.replace(/_/g, " ")}
                </span>
                <span className="text-[var(--text-tertiary)] font-mono">
                  {formatDistanceToNow(new Date(e.timestamp), { addSuffix: true })}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Suspend Confirmation Modal ────────────────────────────────

function SuspendModal({
  org,
  onClose,
  onSuccess,
}: {
  org: AdminOrg | null;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [reason, setReason] = useState("");
  const { mutateAsync: updateStatus, isPending } = useUpdateOrgStatus();

  if (!org) return null;

  const handleConfirm = async () => {
    if (!reason.trim()) {
      toast.error("Please enter a justification for suspension");
      return;
    }
    try {
      await updateStatus({ id: org.id, isActive: false, reason });
      toast.success(`${org.name} has been suspended`);
      onSuccess();
      onClose();
    } catch {
      toast.error("Failed to suspend organization");
    }
  };

  return (
    <>
      <div className="fixed inset-0 z-[1000] bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="fixed inset-0 z-[1001] flex items-center justify-center p-4">
        <div className="w-full max-w-md rounded-2xl border border-red-500/20 bg-[#0c0c10] shadow-2xl p-6 space-y-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-red-500/10">
              <ShieldAlert className="w-5 h-5 text-red-400" />
            </div>
            <div>
              <h3 className="text-sm font-black text-white uppercase tracking-wider">Suspend Organization</h3>
              <p className="text-[11px] text-white/40">{org.name}</p>
            </div>
          </div>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Please detail the reason for suspending this tenant..."
            className="w-full rounded-xl bg-white/5 border border-white/10 px-4 py-3 text-sm text-white placeholder-white/25 focus:outline-none focus:border-red-500/30 resize-none font-medium"
            rows={3}
          />
          <div className="flex gap-3 pt-2">
            <button
              onClick={onClose}
              className="flex-1 py-2.5 rounded-xl border border-white/10 text-[11px] uppercase tracking-wider text-white/50 hover:text-white hover:bg-white/5 transition-all font-black"
            >
              Cancel
            </button>
            <button
              onClick={handleConfirm}
              disabled={isPending}
              className="flex-1 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-[11px] uppercase tracking-wider text-white transition-all font-black disabled:opacity-40"
            >
              {isPending ? "Suspending…" : "Suspend Tenant"}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

// ── Inline Creation Panel ─────────────────────────────────────

function CreateOrgPanel({ onClose, plans, onSuccess }: { onClose: () => void; plans: any[]; onSuccess: () => void }) {
  const [formData, setFormData] = useState({
    org_name: "",
    slug: "",
    first_name: "",
    last_name: "",
    email: "",
    password: "",
    country: "US",
    timezone: "America/New_York",
  });
  const [loading, setLoading] = useState(false);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => {
      const updated = { ...prev, [name]: value };
      // Auto-generate slug from organization name
      if (name === "org_name") {
        updated.slug = value
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/(^-|-$)/g, "");
      }
      return updated;
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.org_name || !formData.slug || !formData.email || !formData.password) {
      toast.error("Please fill in all required fields");
      return;
    }
    setLoading(true);
    try {
      // Direct call to /auth/signup (ignores access token storage so super admin stays logged in)
      await apiClient.post("/auth/signup", {
        org_name: formData.org_name,
        slug: formData.slug,
        first_name: formData.first_name,
        last_name: formData.last_name,
        email: formData.email,
        password: formData.password,
        country: formData.country,
        timezone: formData.timezone,
      });
      toast.success("Organization provisioned successfully!");
      onSuccess();
      onClose();
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || "Failed to create organization");
    } finally {
      setLoading(false);
    }
  };

  return (
    <motion.div
      initial={{ height: 0, opacity: 0 }}
      animate={{ height: "auto", opacity: 1 }}
      exit={{ height: 0, opacity: 0 }}
      transition={{ duration: 0.3 }}
      className="overflow-hidden border border-violet-500/20 bg-violet-500/5 rounded-2xl p-5 mb-5 space-y-4"
    >
      <div className="flex items-center justify-between border-b border-white/5 pb-2">
        <div className="flex items-center gap-2">
          <Building2 className="w-5 h-5 text-violet-400" />
          <h3 className="text-sm font-black text-white uppercase tracking-wider">Provision New Tenant</h3>
        </div>
        <button onClick={onClose} className="text-[10px] font-bold text-white/40 hover:text-white uppercase tracking-wider">
          Cancel
        </button>
      </div>

      <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {/* Org details */}
        <div className="md:col-span-2 space-y-3">
          <h4 className="text-[10px] font-bold uppercase tracking-wider text-white/30">Organization Settings</h4>
          <div className="space-y-2">
            <input
              type="text"
              name="org_name"
              placeholder="Organization Name *"
              value={formData.org_name}
              onChange={handleChange}
              className="w-full rounded-xl bg-white/5 border border-white/10 px-3 py-2 text-xs text-white placeholder-white/20 focus:outline-none focus:border-violet-500/40"
              required
            />
            <div className="flex gap-2">
              <input
                type="text"
                name="slug"
                placeholder="Domain Slug *"
                value={formData.slug}
                onChange={handleChange}
                className="flex-1 rounded-xl bg-white/5 border border-white/10 px-3 py-2 text-xs text-white placeholder-white/20 focus:outline-none focus:border-violet-500/40"
                required
              />
              <input
                type="text"
                name="country"
                placeholder="Country (ISO) *"
                value={formData.country}
                onChange={handleChange}
                className="w-20 rounded-xl bg-white/5 border border-white/10 px-3 py-2 text-xs text-white text-center placeholder-white/20 focus:outline-none focus:border-violet-500/40"
                maxLength={2}
                required
              />
            </div>
          </div>
        </div>

        {/* Owner Details */}
        <div className="md:col-span-2 space-y-3">
          <h4 className="text-[10px] font-bold uppercase tracking-wider text-white/30">Owner Account</h4>
          <div className="space-y-2">
            <div className="flex gap-2">
              <input
                type="text"
                name="first_name"
                placeholder="First Name *"
                value={formData.first_name}
                onChange={handleChange}
                className="w-full rounded-xl bg-white/5 border border-white/10 px-3 py-2 text-xs text-white placeholder-white/20 focus:outline-none focus:border-violet-500/40"
                required
              />
              <input
                type="text"
                name="last_name"
                placeholder="Last Name *"
                value={formData.last_name}
                onChange={handleChange}
                className="w-full rounded-xl bg-white/5 border border-white/10 px-3 py-2 text-xs text-white placeholder-white/20 focus:outline-none focus:border-violet-500/40"
                required
              />
            </div>
            <input
              type="email"
              name="email"
              placeholder="Owner Email Address *"
              value={formData.email}
              onChange={handleChange}
              className="w-full rounded-xl bg-white/5 border border-white/10 px-3 py-2 text-xs text-white placeholder-white/20 focus:outline-none focus:border-violet-500/40"
              required
            />
            <input
              type="password"
              name="password"
              placeholder="Secure Password *"
              value={formData.password}
              onChange={handleChange}
              className="w-full rounded-xl bg-white/5 border border-white/10 px-3 py-2 text-xs text-white placeholder-white/20 focus:outline-none focus:border-violet-500/40"
              required
            />
          </div>
        </div>

        <div className="md:col-span-4 flex justify-end pt-2 border-t border-white/5">
          <button
            type="submit"
            disabled={loading}
            className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-700 text-xs font-black uppercase text-white shadow-lg transition-all disabled:opacity-40"
          >
            {loading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
            Provision Organization
          </button>
        </div>
      </form>
    </motion.div>
  );
}

// ── Main Component ────────────────────────────────────────────

export default function OrganizationsPage() {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [planFilter, setPlanFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [countryFilter, setCountryFilter] = useState("");
  const [sorting, setSorting] = useState<SortingState>([]);
  const [expandedRowId, setExpandedRowId] = useState<string | null>(null);
  const [suspendTarget, setSuspendTarget] = useState<AdminOrg | null>(null);
  const [showCreatePanel, setShowCreatePanel] = useState(false);
  const [changingPlanOrgId, setChangingPlanOrgId] = useState<string | null>(null);

  const { data: orgs = [], isLoading, refetch } = useAdminOrgs({ limit: 100 });
  const { data: plans = [] } = useSubscriptionPlans();
  const { mutateAsync: updateStatus } = useUpdateOrgStatus();
  const { mutateAsync: changePlan } = useChangeOrgPlan();

  // Impersonate owner handler
  const handleImpersonate = async (orgId: string, orgName: string) => {
    try {
      const res = await adminApi.getGlobalUsers({ org_id: orgId, limit: 10 });
      const owner = res.items.find((u) => u.role === "owner" || u.role === "admin") || res.items[0];
      if (!owner) {
        toast.error("No active user found in this organization to impersonate");
        return;
      }

      const impRes = await adminApi.impersonateUser(owner.id, {
        reason: `Support debugging session by Super Admin. Target User: ${owner.first_name} ${owner.last_name}`,
      });

      useAuthStore.getState().startImpersonation(
        {
          id: owner.id,
          email: owner.email,
          first_name: owner.first_name,
          last_name: owner.last_name,
          role: owner.role as any,
          organization_id: owner.organization_id,
          is_platform_admin: owner.is_platform_admin,
          platform_role: owner.platform_role,
        },
        impRes.access_token,
        orgName,
        `${owner.first_name} ${owner.last_name}`
      );

      toast.success(`Active impersonation started for ${owner.first_name} ${owner.last_name}`);
      window.open("/", "_blank");
    } catch {
      toast.error("Failed to establish impersonation session");
    }
  };

  const handleActivate = async (org: AdminOrg) => {
    try {
      await updateStatus({ id: org.id, isActive: true });
      toast.success(`${org.name} activated`);
      refetch();
    } catch {
      toast.error("Failed to activate organization");
    }
  };

  const handleChangePlan = async (orgId: string, planId: string) => {
    try {
      await changePlan({ orgId, planId });
      toast.success("Plan updated successfully");
      setChangingPlanOrgId(null);
      refetch();
    } catch {
      toast.error("Failed to change subscription plan");
    }
  };

  // Filter & Sort organizations locally on the client
  const filteredData = useMemo(() => {
    return orgs.filter((org) => {
      const matchSearch =
        !search ||
        org.name?.toLowerCase().includes(search.toLowerCase()) ||
        org.slug?.toLowerCase().includes(search.toLowerCase()) ||
        org.custom_domain?.toLowerCase().includes(search.toLowerCase());

      const matchPlan = !planFilter || org.plan.toUpperCase() === planFilter.toUpperCase();
      const matchStatus = !statusFilter || org.status.toUpperCase() === statusFilter.toUpperCase();
      // Country matching if country fields are available (or fall back)
      const matchCountry = !countryFilter || (org as any).country?.toUpperCase() === countryFilter.toUpperCase();

      return matchSearch && matchPlan && matchStatus && matchCountry;
    });
  }, [orgs, search, planFilter, statusFilter, countryFilter]);

  // Extract unique countries
  const countries = useMemo(() => {
    const list = orgs.map((o) => (o as any).country || "US");
    return Array.from(new Set(list));
  }, [orgs]);

  // TanStack columns
  const columns = useMemo<ColumnDef<AdminOrg>[]>(
    () => [
      {
        accessorKey: "name",
        header: "Organization",
        cell: ({ row }) => (
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-violet-500/30 to-purple-500/20 border border-violet-500/20 flex items-center justify-center text-[11px] font-black text-violet-300 uppercase flex-shrink-0">
              {row.original.name?.[0] || "?"}
            </div>
            <div className="min-w-0">
              <p
                onClick={(e) => {
                  e.stopPropagation();
                  router.push(`/super-admin/organizations/${row.original.id}`);
                }}
                className="text-[13px] font-bold text-[var(--text-primary)] hover:text-violet-400 hover:underline cursor-pointer truncate"
              >
                {row.original.name}
              </p>
              <p className="text-[10px] text-[var(--text-tertiary)] font-mono">{row.original.slug}</p>
            </div>
          </div>
        ),
      },
      {
        accessorKey: "plan",
        header: "Plan",
        cell: ({ row }) => (
          <div onClick={(e) => e.stopPropagation()}>
            {changingPlanOrgId === row.original.id ? (
              <select
                value={plans.find((p) => p.name.toUpperCase() === row.original.plan.toUpperCase())?.id || ""}
                onChange={(e) => handleChangePlan(row.original.id, e.target.value)}
                className="bg-surface border border-border rounded-lg px-2 py-1 text-xs text-[var(--text-primary)] focus:outline-none"
              >
                <option value="">Select Plan</option>
                {plans.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            ) : (
              <span className="text-xs font-bold text-[var(--text-secondary)]">{row.original.plan}</span>
            )}
          </div>
        ),
      },
      {
        accessorKey: "status",
        header: "Status",
        cell: ({ row }) => <StatusBadge status={row.original.status} />,
      },
      {
        accessorKey: "health_score",
        header: "Health",
        cell: ({ row }) => <HealthBadge score={row.original.health_score ?? 100} />,
      },
      {
        accessorKey: "events_count",
        header: "Events",
        cell: ({ row }) => <span className="text-xs font-bold font-mono text-[var(--text-secondary)]">{row.original.events_count ?? 0}</span>,
      },
      {
        accessorKey: "mrr",
        header: "MRR",
        cell: ({ row }) => <span className="text-xs font-bold font-mono text-[var(--text-secondary)]">${(row.original.mrr ?? 0).toFixed(2)}</span>,
      },
      {
        accessorKey: "created_at",
        header: "Created",
        cell: ({ row }) => (
          <span className="text-[11px] text-[var(--text-tertiary)] font-mono">
            {row.original.created_at ? new Date(row.original.created_at).toLocaleDateString() : "—"}
          </span>
        ),
      },
      {
        id: "actions",
        cell: ({ row }) => (
          <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
            <button
              onClick={() => router.push(`/super-admin/organizations/${row.original.id}`)}
              title="View Inspector"
              className="p-1.5 rounded-lg hover:bg-surface-2 text-[var(--text-tertiary)] hover:text-[var(--text-primary)] transition-colors"
            >
              <Eye className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() =>
                setChangingPlanOrgId(changingPlanOrgId === row.original.id ? null : row.original.id)
              }
              title="Edit Plan"
              className="p-1.5 rounded-lg hover:bg-surface-2 text-[var(--text-tertiary)] hover:text-violet-400 transition-colors"
            >
              <Settings className="w-3.5 h-3.5" />
            </button>
            {row.original.status === "SUSPENDED" ? (
              <button
                onClick={() => handleActivate(row.original)}
                title="Activate Tenant"
                className="p-1.5 rounded-lg hover:bg-emerald-500/10 text-[var(--text-tertiary)] hover:text-emerald-400 transition-colors"
              >
                <ShieldCheck className="w-3.5 h-3.5" />
              </button>
            ) : (
              <button
                onClick={() => setSuspendTarget(row.original)}
                title="Suspend Tenant"
                className="p-1.5 rounded-lg hover:bg-red-500/10 text-[var(--text-tertiary)] hover:text-[var(--text-danger)] transition-colors"
              >
                <ShieldOff className="w-3.5 h-3.5" />
              </button>
            )}
            <button
              onClick={() => handleImpersonate(orgs.find(o => o.id === row.original.id)?.id || row.original.id, row.original.name)}
              title="Impersonate Owner"
              className="p-1.5 rounded-lg hover:bg-orange-500/10 text-[var(--text-tertiary)] hover:text-orange-400 transition-colors"
            >
              <User className="w-3.5 h-3.5" />
            </button>
          </div>
        ),
      },
    ],
    [changingPlanOrgId, plans, router, orgs]
  );

  const table = useReactTable({
    data: filteredData,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
  });

  // CSV Exporter
  const handleExportCSV = () => {
    if (filteredData.length === 0) {
      toast.error("No data available to export");
      return;
    }
    const headers = ["ID", "Name", "Slug", "Plan", "Status", "Health Score", "MRR", "Created At"];
    const rows = filteredData.map((o) => [
      o.id,
      o.name,
      o.slug,
      o.plan,
      o.status,
      o.health_score,
      o.mrr,
      o.created_at,
    ]);
    const csvContent =
      "data:text/csv;charset=utf-8," +
      [headers.join(","), ...rows.map((r) => r.map((field) => `"${field}"`).join(","))].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `tenant-registry-${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success("CSV file downloaded successfully");
  };

  return (
    <PageContainer>
      {/* Header */}
      <SectionHeader
        title="Organization Registry"
        description="Manage multi-tenant limits, billing plans, and overrides"
        breadcrumb={["Super Admin", "Organizations"]}
        actions={
          <div className="flex gap-2">
            <button
              onClick={() => refetch()}
              className="p-2.5 rounded-xl bg-surface border border-border hover:bg-surface-hover transition-colors text-[var(--text-tertiary)] hover:text-[var(--text-primary)]"
            >
              <RefreshCw className={`w-4 h-4 ${isLoading ? "animate-spin" : ""}`} />
            </button>
            <button
              onClick={handleExportCSV}
              className="flex items-center gap-1.5 px-3 py-2.5 rounded-xl bg-surface border border-border hover:bg-surface-hover transition-all text-xs font-bold text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
            >
              <Download className="w-3.5 h-3.5" />
              Export CSV
            </button>
            <button
              onClick={() => setShowCreatePanel(!showCreatePanel)}
              className="flex items-center gap-1.5 px-3 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-700 transition-all text-xs font-black uppercase text-white shadow-lg"
            >
              <Plus className="w-3.5 h-3.5" />
              Create Org
            </button>
          </div>
        }
      />

      {/* Creation form */}
      <AnimatePresence>
        {showCreatePanel && (
          <CreateOrgPanel
            onClose={() => setShowCreatePanel(false)}
            plans={plans}
            onSuccess={() => refetch()}
          />
        )}
      </AnimatePresence>

      {/* Filter Toolbar */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-3 bg-surface-2/40 p-3 rounded-2xl border border-border">
        {/* Search */}
        <div className="relative md:col-span-2">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-tertiary)]" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name, slug, domain…"
            className="w-full pl-10 pr-4 py-2 rounded-xl bg-surface border border-border text-xs text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:outline-none focus:border-violet-500/40"
          />
        </div>

        {/* Plan Filter */}
        <div className="flex items-center gap-2 rounded-xl bg-surface border border-border px-3">
          <Filter className="w-3.5 h-3.5 text-[var(--text-tertiary)]" />
          <select
            value={planFilter}
            onChange={(e) => setPlanFilter(e.target.value)}
            className="w-full bg-transparent text-xs text-[var(--text-secondary)] focus:outline-none border-none py-1.5 cursor-pointer"
          >
            <option value="" className="bg-surface">All Plans</option>
            {Array.from(new Set(orgs.map((o) => o.plan))).map((p) => (
              <option key={p} value={p} className="bg-surface">
                {p}
              </option>
            ))}
          </select>
        </div>

        {/* Status Filter */}
        <div className="flex items-center gap-2 rounded-xl bg-surface border border-border px-3">
          <Filter className="w-3.5 h-3.5 text-[var(--text-tertiary)]" />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="w-full bg-transparent text-xs text-[var(--text-secondary)] focus:outline-none border-none py-1.5 cursor-pointer"
          >
            <option value="" className="bg-surface">All Statuses</option>
            {Array.from(new Set(orgs.map((o) => o.status))).map((s) => (
              <option key={s} value={s} className="bg-surface">
                {s}
              </option>
            ))}
          </select>
        </div>

        {/* Country Filter */}
        <div className="flex items-center gap-2 rounded-xl bg-surface border border-border px-3">
          <Globe className="w-3.5 h-3.5 text-[var(--text-tertiary)]" />
          <select
            value={countryFilter}
            onChange={(e) => setCountryFilter(e.target.value)}
            className="w-full bg-transparent text-xs text-[var(--text-secondary)] focus:outline-none border-none py-1.5 cursor-pointer"
          >
            <option value="" className="bg-surface">All Countries</option>
            {countries.map((c) => (
              <option key={c} value={c} className="bg-surface">
                {c}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Table grid */}
      <DataTable
        table={table}
        isLoading={isLoading}
        onRowClick={(org) => setExpandedRowId(expandedRowId === org.id ? null : org.id)}
      />

      {/* Collapsible Row Expansion rendered inline panel */}
      <AnimatePresence>
        {expandedRowId && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="px-5 py-4 border border-border bg-surface-2/10 rounded-2xl">
              {(() => {
                const matchedOrg = orgs.find((o) => o.id === expandedRowId);
                return matchedOrg ? (
                  <ExpandedRowPanel org={matchedOrg} plans={plans} />
                ) : (
                  <p className="text-[var(--text-tertiary)] text-xs">Error finding organization context</p>
                );
              })()}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Suspend Confirmation Dialog */}
      <SuspendModal
        org={suspendTarget}
        onClose={() => setSuspendTarget(null)}
        onSuccess={() => refetch()}
      />
    </PageContainer>
  );
}
