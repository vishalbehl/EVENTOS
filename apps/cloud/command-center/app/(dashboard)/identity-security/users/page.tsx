"use client";

import React, { useState, useMemo } from "react";
import { 
  useGlobalUsers, 
  useUpdateUserStatus, 
  useReset2FA, 
  useForceLogoutUser, 
  useImpersonateUser, 
  useAdminOrgs,
  GlobalUser 
} from "@/services/super-admin-service";
import { 
  useReactTable, 
  getCoreRowModel, 
  getPaginationRowModel, 
  getSortedRowModel, 
  getFilteredRowModel, 
  ColumnDef 
} from "@tanstack/react-table";
import { 
  Users, RefreshCw, Search, ShieldAlert, Key, UserCheck, UserX, Eye, Shield, 
  LogOut, Filter, Calendar, ChevronDown, CheckCircle2, XCircle, ArrowUpDown, ChevronRight,
  ShieldCheck, HelpCircle, Lock, MoreHorizontal, Download
} from "lucide-react";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/store/use-auth-store";
import type { UserRole } from "@/types/models";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { 
  DropdownMenu, 
  DropdownMenuContent, 
  DropdownMenuItem, 
  DropdownMenuSeparator, 
  DropdownMenuTrigger 
} from "@/components/ui/dropdown-menu";
import { PageContainer } from "@/components/super-admin/ui/PageContainer";
import { SectionHeader } from "@/components/super-admin/ui/SectionHeader";
import { StatusBadge } from "@/components/super-admin/ui/StatusBadge";
import { MetricRow } from "@/components/super-admin/ui/MetricRow";
import { DataTable } from "@/components/super-admin/ui/DataTable";

const APP_ROLES = ["owner", "admin", "member"];

export default function GlobalUsersPage() {
  const [page, setPage] = useState(0);
  const limit = 20;

  // Search & Filter state
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [selectedRole, setSelectedRole] = useState("ALL");
  const [selectedOrg, setSelectedOrg] = useState("ALL");
  const [selected2FA, setSelected2FA] = useState("ALL");
  const [selectedStatus, setSelectedStatus] = useState("ALL");

  // Queries
  const { data: orgs = [] } = useAdminOrgs({ limit: 100 });
  const { data, isLoading, refetch } = useGlobalUsers({
    skip: page * limit,
    limit,
    search: debouncedSearch || undefined,
  });

  const users = data?.items || [];

  // Mutations
  const updateStatus = useUpdateUserStatus();
  const reset2FA = useReset2FA();
  const forceLogout = useForceLogoutUser();
  const impersonate = useImpersonateUser();

  // Search Debouncer
  const handleSearchChange = (v: string) => {
    setSearch(v);
    clearTimeout((window as any).__userSearchTimer);
    (window as any).__userSearchTimer = setTimeout(() => {
      setDebouncedSearch(v);
      setPage(0);
    }, 400);
  };

  // Client-side filtering
  const filteredUsers = useMemo(() => {
    return users.filter(user => {
      const matchRole = selectedRole === "ALL" || 
        (selectedRole === "SUPER" && user.is_platform_admin) || 
        user.role === selectedRole;
      
      const matchOrg = selectedOrg === "ALL" || user.organization_id === selectedOrg;
      
      const match2FA = selected2FA === "ALL" || 
        (selected2FA === "ON" && user.is_2fa_enabled) || 
        (selected2FA === "OFF" && !user.is_2fa_enabled);
        
      const matchStatus = selectedStatus === "ALL" || 
        (selectedStatus === "ACTIVE" && user.is_active) || 
        (selectedStatus === "INACTIVE" && !user.is_active);

      return matchRole && matchOrg && match2FA && matchStatus;
    });
  }, [users, selectedRole, selectedOrg, selected2FA, selectedStatus]);

  // Impersonate handler
  const handleImpersonate = async (user: GlobalUser) => {
    try {
      const res = await impersonate.mutateAsync({
        userId: user.id,
        reason: "Administrative support session"
      });
      if (res.access_token) {
        const displayName = `${user.first_name || ""} ${user.last_name || ""}`.trim() || user.email;
        useAuthStore.getState().startImpersonation(
          {
            id: user.id,
            email: user.email,
            first_name: user.first_name || "",
            last_name: user.last_name || "",
            role: (user.role || "viewer") as UserRole,
            organization_id: user.organization_id,
            is_2fa_enabled: user.is_2fa_enabled,
            is_platform_admin: user.is_platform_admin,
            platform_role: user.platform_role,
          },
          res.access_token,
          user.organization_name || "Unknown organization",
          displayName
        );
        toast.success(`Impersonation session started for ${displayName}`);
        window.open("/", "_blank", "noopener,noreferrer");
      }
    } catch {
      toast.error("Failed to initialize impersonation session");
    }
  };

  // Reset 2FA handler
  const handleReset2FA = async (userId: string) => {
    try {
      await reset2FA.mutateAsync(userId);
      toast.success("2FA reset successfully");
      refetch();
    } catch {
      toast.error("Failed to reset 2FA settings");
    }
  };

  // Force Logout handler
  const handleForceLogout = async (userId: string) => {
    try {
      await forceLogout.mutateAsync(userId);
      toast.success("User sessions revoked successfully");
      refetch();
    } catch {
      toast.error("Failed to revoke user sessions");
    }
  };

  // Toggle active status
  const handleToggleStatus = async (user: GlobalUser) => {
    try {
      const nextActive = !user.is_active;
      await updateStatus.mutateAsync({
        userId: user.id,
        isActive: nextActive
      });
      toast.success(`User is now ${nextActive ? "Active" : "Deactivated"}`);
      refetch();
    } catch {
      toast.error("Failed to update status");
    }
  };

  // TanStack Table columns
  const columns: ColumnDef<GlobalUser>[] = useMemo(() => [
    {
      accessorKey: "email",
      header: "User",
      cell: ({ row }) => {
        const u = row.original;
        const name = `${u.first_name || ""} ${u.last_name || ""}`.trim();
        const initials = u.first_name ? u.first_name[0].toUpperCase() : u.email[0].toUpperCase();

        return (
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-[var(--brand-primary-muted)] border border-[var(--brand-primary)]/15 flex items-center justify-center font-bold text-[var(--brand-primary)] text-xs">
              {initials}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <p className="text-xs font-semibold text-[var(--text-primary)] leading-tight">{name || "Unnamed User"}</p>
                {u.is_platform_admin && (
                  <span title="Super Admin">
                    <ShieldCheck className="w-3.5 h-3.5 text-[var(--brand-primary)]" />
                  </span>
                )}
              </div>
              <p className="text-[10px] text-[var(--text-tertiary)] font-mono">{u.email}</p>
            </div>
          </div>
        );
      }
    },
    {
      accessorKey: "organization_name",
      header: "Organization",
      cell: ({ row }) => (
        <span className="text-xs text-[var(--text-secondary)] font-medium">
          {row.original.organization_name || "—"}
        </span>
      )
    },
    {
      accessorKey: "role",
      header: "Role",
      cell: ({ row }) => (
        <span className="text-[10px] font-bold uppercase tracking-wider font-mono text-[var(--text-secondary)] bg-surface-2 border border-border rounded px-1.5 py-0.5">
          {row.original.role || "MEMBER"}
        </span>
      )
    },
    {
      accessorKey: "platform_role",
      header: "Platform Role",
      cell: ({ row }) => (
        <span className="text-[10px] text-[var(--text-tertiary)] font-mono">
          {row.original.platform_role || "—"}
        </span>
      )
    },
    {
      accessorKey: "is_2fa_enabled",
      header: "2FA",
      cell: ({ row }) => (
        <div className="flex items-center justify-center w-8">
          {row.original.is_2fa_enabled ? (
            <ShieldCheck className="w-4 h-4 text-[var(--success)]" />
          ) : (
            <Shield className="w-4 h-4 text-[var(--text-tertiary)]" />
          )}
        </div>
      )
    },
    {
      accessorKey: "last_login_at",
      header: "Last Login",
      cell: ({ row }) => (
        <span className="text-[10px] text-[var(--text-secondary)] font-mono">
          {row.original.last_login_at ? formatDistanceToNow(new Date(row.original.last_login_at), { addSuffix: true }) : "Never"}
        </span>
      )
    },
    {
      accessorKey: "is_active",
      header: "Status",
      cell: ({ row }) => <StatusBadge status={row.original.is_active ? "active" : "disabled"} />,
    },
    {
      id: "assurance",
      header: "Assurance",
      cell: ({ row }) => {
        const user = row.original;
        const requiresReview = !user.is_active || (user.is_platform_admin && !user.is_2fa_enabled);
        const label = requiresReview ? "Review" : user.is_2fa_enabled ? "MFA" : "Basic";
        const color = requiresReview
          ? "text-[var(--warning)]"
          : user.is_2fa_enabled
            ? "text-[var(--success)]"
            : "text-[var(--text-tertiary)]";
        return (
          <span className={cn("font-mono text-xs font-semibold", color)}>
            {label}
          </span>
        );
      }
    },
    {
      id: "actions",
      header: "",
      cell: ({ row }) => {
        const u = row.original;
        return (
          <div className="flex justify-end">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="h-8 w-8 p-0 border border-transparent hover:bg-surface-hover/30">
                  <span className="sr-only">Open menu</span>
                  <MoreHorizontal className="h-4 w-4 text-[var(--text-secondary)]" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="bg-surface border-border text-[var(--text-primary)] w-[180px]">
                <DropdownMenuItem onClick={() => handleImpersonate(u)} className="text-xs cursor-pointer flex gap-2">
                  <Eye className="w-3.5 h-3.5 text-orange-400" />
                  Impersonate
                </DropdownMenuItem>
                <DropdownMenuItem 
                  onClick={() => window.location.href = `/security/audit?actor=${u.id}`} 
                  className="text-xs cursor-pointer flex gap-2"
                >
                  <Calendar className="w-3.5 h-3.5 text-violet-400" />
                  View Audit Trail
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => handleToggleStatus(u)} className="text-xs cursor-pointer flex gap-2">
                  {u.is_active ? <UserX className="w-3.5 h-3.5 text-[var(--danger)]" /> : <UserCheck className="w-3.5 h-3.5 text-[var(--success)]" />}
                  {u.is_active ? "Deactivate User" : "Activate User"}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleReset2FA(u.id)} className="text-xs cursor-pointer flex gap-2">
                  <Key className="w-3.5 h-3.5 text-violet-400" />
                  Reset 2FA
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => handleForceLogout(u.id)} className="text-xs cursor-pointer flex gap-2 text-[var(--danger)] focus:text-[var(--danger)]">
                  <LogOut className="w-3.5 h-3.5 text-[var(--danger)]" />
                  Force Logout
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        );
      }
    }
  ], []);

  const table = useReactTable({
    data: filteredUsers,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
  });

  // KPI Metrics
  const metrics = useMemo(() => {
    const visibleCount = users.length;
    const activeCount = users.filter((user) => user.is_active).length;
    const twoFactorCount = users.filter((user) => user.is_2fa_enabled).length;
    const platformAdminCount = users.filter((user) => user.is_platform_admin || Boolean(user.platform_role)).length;
    const disabledCount = users.filter((user) => !user.is_active).length;
    const twoFactorPercent = visibleCount > 0 ? Math.round((twoFactorCount / visibleCount) * 100) : 0;

    return [
      { label: "Total Users", value: data?.total ?? visibleCount, icon: Users },
      { label: "Visible Active", value: activeCount, icon: UserCheck },
      { label: "2FA Visible", value: `${twoFactorCount}/${visibleCount}`, icon: ShieldCheck, delta: `${twoFactorPercent}%` },
      { label: "Platform Admins", value: platformAdminCount, icon: Shield },
      { label: "Disabled Visible", value: disabledCount, icon: UserX },
    ];
  }, [data?.total, users]);

  return (
    <PageContainer>
      <SectionHeader
        title="Global User Management"
        description="Verify platform credentials, revoke user sessions, and initiate support impersonation tunnels."
        breadcrumb={["Console", "Security", "Users"]}
        actions={
          <div className="flex gap-2">
            <Button variant="outline" size="sm" className="border-border">
              <Download className="w-3.5 h-3.5 mr-2 text-[var(--text-tertiary)]" />
              Export CSV
            </Button>
            <Button variant="outline" onClick={() => refetch()} size="sm" className="border-border">
              <RefreshCw className={cn("w-3.5 h-3.5 mr-2", isLoading && "animate-spin")} />
              Refresh
            </Button>
          </div>
        }
      />

      {/* Metric Row */}
      <MetricRow metrics={metrics} />

      {/* Filter Row */}
      <div className="rounded-xl border border-border bg-surface p-4 flex flex-wrap gap-4 items-center">
        <div className="relative max-w-xs w-full">
          <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 transform -translate-y-1/2 text-[var(--text-tertiary)]" />
          <input
            type="text"
            value={search}
            onChange={(e) => handleSearchChange(e.target.value)}
            placeholder="Search users..."
            className="w-full bg-surface-2 border border-border rounded-xl pl-9 pr-4 py-1.5 text-xs text-[var(--text-primary)] focus:outline-none focus:border-[var(--brand-primary)]"
          />
        </div>

        <div className="flex items-center gap-2">
          <span className="text-[10px] font-bold text-[var(--text-tertiary)] uppercase tracking-wider">Role:</span>
          <select value={selectedRole} onChange={(e) => setSelectedRole(e.target.value)} className="bg-surface border border-border rounded-lg text-xs py-1 px-2.5 focus:outline-none cursor-pointer">
            <option value="ALL">All Roles</option>
            <option value="SUPER">Super Admins</option>
            {APP_ROLES.map(r => (
              <option key={r} value={r}>{r.toUpperCase()}</option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-[10px] font-bold text-[var(--text-tertiary)] uppercase tracking-wider">2FA:</span>
          <select value={selected2FA} onChange={(e) => setSelected2FA(e.target.value)} className="bg-surface border border-border rounded-lg text-xs py-1 px-2.5 focus:outline-none cursor-pointer">
            <option value="ALL">All</option>
            <option value="ON">Enabled</option>
            <option value="OFF">Disabled</option>
          </select>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-[10px] font-bold text-[var(--text-tertiary)] uppercase tracking-wider">Status:</span>
          <select value={selectedStatus} onChange={(e) => setSelectedStatus(e.target.value)} className="bg-surface border border-border rounded-lg text-xs py-1 px-2.5 focus:outline-none cursor-pointer">
            <option value="ALL">All</option>
            <option value="ACTIVE">Active</option>
            <option value="INACTIVE">Deactivated</option>
          </select>
        </div>
      </div>

      {/* Main Data Table */}
      <DataTable table={table} isLoading={isLoading} />
    </PageContainer>
  );
}
