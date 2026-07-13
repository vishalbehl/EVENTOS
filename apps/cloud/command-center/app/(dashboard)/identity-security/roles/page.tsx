"use client";

import { FormEvent, useMemo, useState } from "react";
import { ColumnDef, getCoreRowModel, getPaginationRowModel, useReactTable } from "@tanstack/react-table";
import { Edit3, KeyRound, Plus, RefreshCw, Search, ShieldCheck, Trash2, Users } from "lucide-react";
import { toast } from "sonner";

import { DataTable } from "@/components/super-admin/ui/DataTable";
import { MetricRow } from "@/components/super-admin/ui/MetricRow";
import { PageContainer } from "@/components/super-admin/ui/PageContainer";
import { SectionHeader } from "@/components/super-admin/ui/SectionHeader";
import { ConfirmDestructiveAction } from "@/components/super-admin/ui/ConfirmDestructiveAction";
import { RecoverableError } from "@/components/super-admin/ui/AsyncState";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import {
  PlatformRole,
  RolePayload,
  useCreatePlatformRole,
  useDeletePlatformRole,
  usePlatformRoles,
  useUpdatePlatformRole,
} from "@/services/platform-access-service";

const defaultPayload: RolePayload = {
  name: "",
  code: "",
  description: "",
  access_level: "DEPARTMENT",
  department_id: null,
};

function normalizeCode(value: string) {
  return value.trim().toUpperCase().replace(/[^A-Z0-9_]+/g, "_").replace(/^_+|_+$/g, "");
}

export default function PlatformRolesPage() {
  const [search, setSearch] = useState("");
  const [draft, setDraft] = useState<RolePayload>(defaultPayload);
  const [editingRoleId, setEditingRoleId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<PlatformRole | null>(null);

  const params = useMemo(() => ({ search: search || undefined, limit: 100 }), [search]);
  const rolesQuery = usePlatformRoles(params);
  const createRole = useCreatePlatformRole();
  const updateRole = useUpdatePlatformRole();
  const deleteRole = useDeletePlatformRole();

  const roles = rolesQuery.data || [];
  const isSaving = createRole.isPending || updateRole.isPending;
  const selectedRole = roles.find((role) => role.id === editingRoleId);

  const metrics = [
    { label: "Roles", value: roles.length, icon: ShieldCheck },
    { label: "Assigned users", value: roles.reduce((sum, role) => sum + (role.users_count || 0), 0), icon: Users },
    { label: "Permission links", value: roles.reduce((sum, role) => sum + (role.permissions_count || 0), 0), icon: KeyRound },
  ];

  const resetDraft = () => {
    setDraft(defaultPayload);
    setEditingRoleId(null);
  };

  const editRole = (role: PlatformRole) => {
    setEditingRoleId(role.id);
    setDraft({
      name: role.name,
      code: role.code,
      description: role.description || "",
      access_level: role.access_level || "DEPARTMENT",
      department_id: role.department_id || null,
    });
  };

  const submitRole = async (event: FormEvent) => {
    event.preventDefault();
    const payload = {
      ...draft,
      name: draft.name.trim(),
      code: normalizeCode(draft.code || draft.name),
      description: draft.description?.trim() || null,
      department_id: draft.department_id || null,
    };

    if (!payload.name || !payload.code) {
      toast.error("Role name and code are required.");
      return;
    }

    try {
      if (editingRoleId) {
        await updateRole.mutateAsync({ roleId: editingRoleId, payload });
        toast.success("Role updated.");
      } else {
        await createRole.mutateAsync(payload);
        toast.success("Role created.");
      }
      resetDraft();
    } catch (error: any) {
      toast.error(error?.message || "Could not save role.");
    }
  };

  const columns: ColumnDef<PlatformRole>[] = useMemo(
    () => [
      {
        accessorKey: "name",
        header: "Role",
        cell: ({ row }) => (
          <div className="min-w-0">
            <p className="text-sm font-semibold text-[var(--text-primary)]">{row.original.name}</p>
            <p className="font-mono text-[10px] uppercase tracking-wider text-[var(--text-tertiary)]">{row.original.code}</p>
          </div>
        ),
      },
      {
        accessorKey: "department_name",
        header: "Scope",
        cell: ({ row }) => (
          <span className="text-xs text-[var(--text-secondary)]">{row.original.department_name || "Global"}</span>
        ),
      },
      {
        accessorKey: "access_level",
        header: "Access Level",
        cell: ({ row }) => (
          <span className="rounded-md border border-border bg-surface-2 px-2 py-1 font-mono text-[10px] text-[var(--text-secondary)]">
            {row.original.access_level}
          </span>
        ),
      },
      {
        accessorKey: "permissions_count",
        header: "Permissions",
        cell: ({ row }) => <span className="font-mono text-xs">{row.original.permissions_count}</span>,
      },
      {
        accessorKey: "users_count",
        header: "Users",
        cell: ({ row }) => <span className="font-mono text-xs">{row.original.users_count}</span>,
      },
      {
        id: "actions",
        header: "",
        cell: ({ row }) => (
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => editRole(row.original)} aria-label={`Edit ${row.original.name}`}>
              <Edit3 className="size-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="text-[var(--status-danger)]"
              onClick={() => setDeleteTarget(row.original)}
              aria-label={`Delete ${row.original.name}`}
            >
              <Trash2 className="size-4" />
            </Button>
          </div>
        ),
      },
    ],
    [],
  );

  const table = useReactTable({
    data: roles,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
  });

  return (
    <PageContainer>
      <SectionHeader
        title="Platform Roles"
        description="Manage the role catalogue used by organization teams and platform assignments."
        breadcrumb={["Console", "Identity", "Roles"]}
        actions={
          <Button variant="outline" size="sm" onClick={() => rolesQuery.refetch()}>
            <RefreshCw className={cn("mr-2 size-4", rolesQuery.isFetching && "animate-spin")} />
            Refresh
          </Button>
        }
      />

      <MetricRow metrics={metrics} />

      {rolesQuery.isError ? (
        <RecoverableError
          title="Roles could not be loaded"
          description={(rolesQuery.error as Error)?.message || "The platform roles API rejected the request."}
          action={{ label: "Retry", onClick: () => rolesQuery.refetch() }}
        />
      ) : (
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
          <div className="space-y-4">
            <div className="rounded-xl border border-border bg-surface p-4">
              <label className="sr-only" htmlFor="role-search">Search roles</label>
              <div className="relative max-w-sm">
                <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[var(--text-tertiary)]" />
                <Input
                  id="role-search"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search roles..."
                  className="border border-border bg-surface-2 pl-9"
                />
              </div>
            </div>
            <DataTable table={table} isLoading={rolesQuery.isLoading} ariaLabel="Platform roles" />
          </div>

          <form onSubmit={submitRole} className="rounded-xl border border-border bg-surface p-5">
            <div className="mb-5 flex items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold text-[var(--text-primary)]">
                  {selectedRole ? "Edit Role" : "Create Role"}
                </h2>
                <p className="text-xs text-[var(--text-secondary)]">
                  Changes are persisted through the platform roles API.
                </p>
              </div>
              {selectedRole && (
                <Button type="button" variant="ghost" size="sm" onClick={resetDraft}>
                  New
                </Button>
              )}
            </div>

            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-xs font-medium text-[var(--text-secondary)]" htmlFor="role-name">Name</label>
                <Input
                  id="role-name"
                  value={draft.name}
                  onChange={(event) => setDraft((value) => ({ ...value, name: event.target.value }))}
                  placeholder="Event Operations Lead"
                  required
                  className="border border-border bg-surface-2"
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-medium text-[var(--text-secondary)]" htmlFor="role-code">Code</label>
                <Input
                  id="role-code"
                  value={draft.code}
                  onChange={(event) => setDraft((value) => ({ ...value, code: normalizeCode(event.target.value) }))}
                  placeholder="EVENT_OPERATIONS_LEAD"
                  required
                  className="border border-border bg-surface-2 font-mono"
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-medium text-[var(--text-secondary)]" htmlFor="role-access-level">Access Level</label>
                <select
                  id="role-access-level"
                  value={draft.access_level}
                  onChange={(event) => setDraft((value) => ({ ...value, access_level: event.target.value }))}
                  className="h-10 w-full rounded-md border border-border bg-surface-2 px-3 text-sm text-[var(--text-primary)]"
                >
                  <option value="GLOBAL">GLOBAL</option>
                  <option value="DEPARTMENT">DEPARTMENT</option>
                  <option value="TEAM">TEAM</option>
                </select>
              </div>
              <div className="space-y-2">
                <label className="text-xs font-medium text-[var(--text-secondary)]" htmlFor="role-description">Description</label>
                <Textarea
                  id="role-description"
                  value={draft.description || ""}
                  onChange={(event) => setDraft((value) => ({ ...value, description: event.target.value }))}
                  placeholder="Describe when this role should be assigned."
                  className="border-border bg-surface-2"
                />
              </div>
              <Button type="submit" disabled={isSaving} className="w-full">
                <Plus className="mr-2 size-4" />
                {isSaving ? "Saving..." : selectedRole ? "Update Role" : "Create Role"}
              </Button>
            </div>
          </form>
        </div>
      )}

      <ConfirmDestructiveAction
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title="Delete platform role"
        description="This removes the role record through the platform roles API. Existing assignments may block deletion."
        confirmLabel="Delete role"
        requireReason
        resourceName={deleteTarget?.name}
        pending={deleteRole.isPending}
        onConfirm={async () => {
          if (!deleteTarget) return;
          try {
            await deleteRole.mutateAsync(deleteTarget.id);
            toast.success("Role deleted.");
            setDeleteTarget(null);
          } catch (error: any) {
            toast.error(error?.message || "Could not delete role.");
          }
        }}
      />
    </PageContainer>
  );
}
