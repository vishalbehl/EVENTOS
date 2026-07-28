"use client";

import { useState, useMemo } from "react";
import {
  useAdminOrgs,
  useSubscriptionPlans,
  useProvisionOrganization,
  adminApi,
  AdminOrg,
} from "@/services/super-admin-service";
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
  Filter,
  Download,
  Plus,
  Globe,
  ChevronRight,
} from "lucide-react";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";

import { PageContainer } from "@/components/super-admin/ui/PageContainer";
import { SectionHeader } from "@/components/super-admin/ui/SectionHeader";
import { DataTable } from "@/components/super-admin/ui/DataTable";
import { StatusBadge } from "@/components/super-admin/ui/StatusBadge";

// ── Health Badge ──────────────────────────────────────────────

function HealthBadge({ score }: { score: number | null | undefined }) {
  if (score == null) {
    return <span className="text-xs font-medium text-[var(--text-tertiary)]">—</span>;
  }
  const color =
    score >= 80
      ? "text-[var(--status-success)]"
      : score >= 50
      ? "text-[var(--status-warning)]"
      : "text-[var(--status-danger)]";
  const bgDot =
    score >= 80
      ? "bg-[var(--status-success)]"
      : score >= 50
      ? "bg-[var(--status-warning)]"
      : "bg-[var(--status-danger)]";
  return (
    <div className={`flex items-center gap-1.5 ${color}`}>
      <div className={`w-1.5 h-1.5 rounded-full ${bgDot}`} />
      <span className="text-xs font-bold tabular-nums">{score}%</span>
    </div>
  );
}

// ── Inline Creation Panel ─────────────────────────────────────

function CreateOrgPanel({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
  const [formData, setFormData] = useState({
    org_name: "",
    slug: "",
    first_name: "",
    last_name: "",
    email: "",
    country: "US",
    timezone: "America/New_York",
    reason: "",
  });
  const [invitationToken, setInvitationToken] = useState<string | null>(null);
  const provision = useProvisionOrganization();

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => {
      const updated = { ...prev, [name]: value };
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
    if (!formData.org_name || !formData.slug || !formData.email || !formData.first_name || !formData.last_name) {
      toast.error("Please fill in all required fields");
      return;
    }
    if (formData.reason.trim().length < 12) {
      toast.error("An audit reason of at least 12 characters is required.");
      return;
    }
    try {
      const result = await provision.mutateAsync({
        idempotencyKey: crypto.randomUUID(),
        payload: {
          name: formData.org_name.trim(),
          slug: formData.slug.trim(),
          owner_email: formData.email.trim(),
          owner_first_name: formData.first_name.trim(),
          owner_last_name: formData.last_name.trim(),
          country: formData.country.trim().toUpperCase(),
          timezone: formData.timezone.trim(),
          reason: formData.reason.trim(),
        },
      });
      setInvitationToken(result.owner_invitation.token);
      toast.success(result.replayed ? "Existing provisioning result recovered" : "Organization provisioned");
      onSuccess();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Organization provisioning failed");
    }
  };

  return (
    <motion.div
      initial={{ height: 0, opacity: 0 }}
      animate={{ height: "auto", opacity: 1 }}
      exit={{ height: 0, opacity: 0 }}
      transition={{ duration: 0.3 }}
      className="overflow-hidden border border-[var(--brand-primary)]/20 bg-[var(--brand-primary)]/5 rounded-2xl p-5 mb-5 space-y-4"
    >
      <div className="flex items-center justify-between border-b border-[var(--border-subtle)] pb-2">
        <div className="flex items-center gap-2">
          <Building2 className="w-5 h-5 text-[var(--brand-primary)]" />
          <h3 className="text-sm font-black text-[var(--text-primary)] uppercase tracking-wider">Provision New Tenant</h3>
        </div>
        <button onClick={onClose} className="text-[10px] font-bold text-[var(--text-tertiary)] hover:text-[var(--text-primary)] uppercase tracking-wider">
          Cancel
        </button>
      </div>

      <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="md:col-span-2 space-y-3">
          <h4 className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">Organization Settings</h4>
          <div className="space-y-2">
            <input
              type="text"
              name="org_name"
              placeholder="Organization Name *"
              value={formData.org_name}
              onChange={handleChange}
              className="w-full rounded-xl bg-[var(--bg-surface-3)] border border-[var(--border-default)] px-3 py-2 text-xs text-[var(--text-primary)] placeholder-[var(--text-tertiary)] focus:outline-none focus:border-[var(--brand-primary)]/40"
              required
            />
            <div className="flex gap-2">
              <input
                type="text"
                name="slug"
                placeholder="Domain Slug *"
                value={formData.slug}
                onChange={handleChange}
                className="flex-1 rounded-xl bg-[var(--bg-surface-3)] border border-[var(--border-default)] px-3 py-2 text-xs text-[var(--text-primary)] placeholder-[var(--text-tertiary)] focus:outline-none focus:border-[var(--brand-primary)]/40"
                required
              />
              <input
                type="text"
                name="country"
                placeholder="ISO"
                value={formData.country}
                onChange={handleChange}
                className="w-16 rounded-xl bg-[var(--bg-surface-3)] border border-[var(--border-default)] px-3 py-2 text-xs text-[var(--text-primary)] text-center placeholder-[var(--text-tertiary)] focus:outline-none focus:border-[var(--brand-primary)]/40"
                maxLength={2}
                required
              />
            </div>
          </div>
        </div>

        <div className="md:col-span-2 space-y-3">
          <h4 className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">Owner Account</h4>
          <div className="space-y-2">
            <div className="flex gap-2">
              <input
                type="text"
                name="first_name"
                placeholder="First Name *"
                value={formData.first_name}
                onChange={handleChange}
                className="w-full rounded-xl bg-[var(--bg-surface-3)] border border-[var(--border-default)] px-3 py-2 text-xs text-[var(--text-primary)] placeholder-[var(--text-tertiary)] focus:outline-none focus:border-[var(--brand-primary)]/40"
                required
              />
              <input
                type="text"
                name="last_name"
                placeholder="Last Name *"
                value={formData.last_name}
                onChange={handleChange}
                className="w-full rounded-xl bg-[var(--bg-surface-3)] border border-[var(--border-default)] px-3 py-2 text-xs text-[var(--text-primary)] placeholder-[var(--text-tertiary)] focus:outline-none focus:border-[var(--brand-primary)]/40"
                required
              />
            </div>
            <input
              type="email"
              name="email"
              placeholder="Owner Email Address *"
              value={formData.email}
              onChange={handleChange}
              className="w-full rounded-xl bg-[var(--bg-surface-3)] border border-[var(--border-default)] px-3 py-2 text-xs text-[var(--text-primary)] placeholder-[var(--text-tertiary)] focus:outline-none focus:border-[var(--brand-primary)]/40"
              required
            />
            <input
              type="text"
              name="reason"
              placeholder="Provisioning approval reason *"
              value={formData.reason}
              onChange={handleChange}
              className="w-full rounded-xl bg-[var(--bg-surface-3)] border border-[var(--border-default)] px-3 py-2 text-xs text-[var(--text-primary)] placeholder-[var(--text-tertiary)] focus:outline-none focus:border-[var(--brand-primary)]/40"
              minLength={12}
              required
            />
          </div>
        </div>

        {invitationToken && (
          <div className="md:col-span-4 rounded-xl border border-[var(--status-success)]/20 bg-[var(--status-success)]/5 p-3">
            <p className="text-xs font-bold text-[var(--status-success)]">Owner invitation created</p>
            <p className="mt-1 break-all font-mono text-[10px] text-[var(--text-secondary)]">{invitationToken}</p>
            <button
              type="button"
              className="mt-2 text-[10px] font-bold uppercase text-[var(--status-success)]"
              onClick={() => navigator.clipboard.writeText(invitationToken)}
            >
              Copy one-time invitation token
            </button>
          </div>
        )}
        <div className="md:col-span-4 flex justify-end pt-2 border-t border-[var(--border-subtle)]">
          <button
            type="submit"
            disabled={provision.isPending}
            className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-[var(--brand-primary)] hover:bg-[var(--brand-primary-hover)] text-xs font-black uppercase text-[var(--primary-contrast)] shadow-lg transition-all disabled:opacity-40"
          >
            {provision.isPending ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
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
  const [showCreate, setShowCreate] = useState(false);

  const { data: orgs = [], isLoading, refetch } = useAdminOrgs({ limit: 100 });
  const { data: plans = [] } = useSubscriptionPlans();

  const filteredData = useMemo(() => {
    return orgs.filter((org) => {
      const matchSearch =
        !search ||
        org.name?.toLowerCase().includes(search.toLowerCase()) ||
        org.slug?.toLowerCase().includes(search.toLowerCase()) ||
        org.custom_domain?.toLowerCase().includes(search.toLowerCase());
      const matchPlan = !planFilter || org.plan.toUpperCase() === planFilter.toUpperCase();
      const matchStatus = !statusFilter || org.status.toUpperCase() === statusFilter.toUpperCase();
      const matchCountry = !countryFilter || (org as any).country?.toUpperCase() === countryFilter.toUpperCase();
      return matchSearch && matchPlan && matchStatus && matchCountry;
    });
  }, [orgs, search, planFilter, statusFilter, countryFilter]);

  const countries = useMemo(() => {
    const list = orgs.map((o) => (o as any).country || "US");
    return Array.from(new Set(list));
  }, [orgs]);

  const columns = useMemo<ColumnDef<AdminOrg>[]>(
    () => [
      {
        accessorKey: "name",
        header: "Organization",
        cell: ({ row }) => (
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-[var(--brand-primary)]/30 to-[var(--brand-secondary)]/20 border border-[var(--brand-primary)]/20 flex items-center justify-center text-[11px] font-black text-[var(--brand-primary)] uppercase flex-shrink-0">
              {row.original.name?.[0] || "?"}
            </div>
            <div className="min-w-0">
              <p className="text-[13px] font-bold text-[var(--text-primary)] truncate">
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
          <span className="text-xs font-bold text-[var(--text-secondary)]">{row.original.plan}</span>
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
        cell: ({ row }) => <HealthBadge score={row.original.health_score} />,
      },
      {
        accessorKey: "events_count",
        header: "Events",
        cell: ({ row }) => (
          <span className="text-xs font-bold font-mono text-[var(--text-secondary)]">
            {row.original.events_count ?? 0}
          </span>
        ),
      },
      {
        accessorKey: "mrr",
        header: "MRR",
        cell: ({ row }) =>
          row.original.mrr == null ? (
            <span className="text-xs text-[var(--text-tertiary)]">—</span>
          ) : (
            <span className="text-xs font-bold font-mono text-[var(--text-secondary)]">
              ${row.original.mrr.toFixed(2)}
            </span>
          ),
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
        id: "open",
        cell: () => (
          <div className="flex items-center justify-end">
            <ChevronRight className="w-4 h-4 text-[var(--text-tertiary)]" />
          </div>
        ),
      },
    ],
    []
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

  const handleExportCSV = () => {
    if (filteredData.length === 0) {
      toast.error("No data available to export");
      return;
    }
    const headers = ["ID", "Name", "Slug", "Plan", "Status", "Health Score", "MRR", "Created At"];
    const rows = filteredData.map((o) => [o.id, o.name, o.slug, o.plan, o.status, o.health_score, o.mrr, o.created_at]);
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
      <SectionHeader
        title="Organization Registry"
        description="Click any organization to open its management console"
        breadcrumb={["Super Admin", "Organizations"]}
        actions={
          <div className="flex gap-2">
            <button
              onClick={() => refetch()}
              className="p-2.5 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-default)] hover:bg-[var(--bg-surface-hover)] transition-colors text-[var(--text-tertiary)] hover:text-[var(--text-primary)]"
            >
              <RefreshCw className={`w-4 h-4 ${isLoading ? "animate-spin" : ""}`} />
            </button>
            <button
              onClick={handleExportCSV}
              className="flex items-center gap-1.5 px-3 py-2.5 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-default)] hover:bg-[var(--bg-surface-hover)] transition-all text-xs font-bold text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
            >
              <Download className="w-3.5 h-3.5" />
              Export CSV
            </button>
            <button
              type="button"
              onClick={() => setShowCreate((open) => !open)}
              className="flex items-center gap-1.5 rounded-xl bg-[var(--brand-primary)] px-3 py-2.5 text-xs font-black uppercase text-[var(--primary-contrast)] shadow-lg transition-colors hover:bg-[var(--brand-primary-hover)]"
            >
              <Plus className="w-3.5 h-3.5" />
              Provision organization
            </button>
          </div>
        }
      />

      <AnimatePresence>
        {showCreate && (
          <CreateOrgPanel
            onClose={() => setShowCreate(false)}
            onSuccess={() => refetch()}
          />
        )}
      </AnimatePresence>

      {/* Filter Toolbar */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-3 bg-[var(--bg-surface-2)]/40 p-3 rounded-2xl border border-[var(--border-default)]">
        <div className="relative md:col-span-2">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-tertiary)]" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name, slug, domain…"
            className="w-full pl-10 pr-4 py-2 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-default)] text-xs text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:outline-none focus:border-[var(--brand-primary)]/40"
          />
        </div>

        <div className="flex items-center gap-2 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-default)] px-3">
          <Filter className="w-3.5 h-3.5 text-[var(--text-tertiary)]" />
          <select
            value={planFilter}
            onChange={(e) => setPlanFilter(e.target.value)}
            className="w-full bg-transparent text-xs text-[var(--text-secondary)] focus:outline-none border-none py-1.5 cursor-pointer"
          >
            <option value="">All Plans</option>
            {Array.from(new Set(orgs.map((o) => o.plan))).map((p) => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-2 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-default)] px-3">
          <Filter className="w-3.5 h-3.5 text-[var(--text-tertiary)]" />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="w-full bg-transparent text-xs text-[var(--text-secondary)] focus:outline-none border-none py-1.5 cursor-pointer"
          >
            <option value="">All Statuses</option>
            {Array.from(new Set(orgs.map((o) => o.status))).map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-2 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-default)] px-3">
          <Globe className="w-3.5 h-3.5 text-[var(--text-tertiary)]" />
          <select
            value={countryFilter}
            onChange={(e) => setCountryFilter(e.target.value)}
            className="w-full bg-transparent text-xs text-[var(--text-secondary)] focus:outline-none border-none py-1.5 cursor-pointer"
          >
            <option value="">All Countries</option>
            {countries.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Table — clicking a row opens the org console */}
      <DataTable
        table={table}
        isLoading={isLoading}
        onRowClick={(org) => router.push(`/organizations/${org.id}/overview`)}
      />
    </PageContainer>
  );
}
