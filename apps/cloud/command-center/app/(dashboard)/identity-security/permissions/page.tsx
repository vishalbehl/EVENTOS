"use client";

import { useMemo, useState } from "react";
import { KeyRound, RefreshCw, Search, ShieldCheck, Sparkles, ToggleLeft } from "lucide-react";
import { toast } from "sonner";

import { RecoverableError } from "@/components/super-admin/ui/AsyncState";
import { MetricRow } from "@/components/super-admin/ui/MetricRow";
import { PageContainer } from "@/components/super-admin/ui/PageContainer";
import { SectionHeader } from "@/components/super-admin/ui/SectionHeader";
import { StatusBadge } from "@/components/super-admin/ui/StatusBadge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  PlatformPermission,
  usePlatformPermissions,
  usePlatformRoles,
  useRolePermissions,
  useSeedPlatformPermissions,
  useToggleRolePermission,
} from "@/services/platform-access-service";

function groupPermissions(permissions: PlatformPermission[]) {
  return permissions.reduce<Record<string, PlatformPermission[]>>((groups, permission) => {
    const key = permission.module || "GENERAL";
    groups[key] = groups[key] || [];
    groups[key].push(permission);
    return groups;
  }, {});
}

export default function PlatformPermissionsPage() {
  const [search, setSearch] = useState("");
  const [selectedRoleId, setSelectedRoleId] = useState<string | undefined>();

  const rolesQuery = usePlatformRoles({ limit: 100 });
  const permissionsQuery = usePlatformPermissions();
  const rolePermissionsQuery = useRolePermissions(selectedRoleId);
  const seedPermissions = useSeedPlatformPermissions();
  const togglePermission = useToggleRolePermission();

  const roles = rolesQuery.data || [];
  const permissions = permissionsQuery.data || [];
  const selectedRole = roles.find((role) => role.id === selectedRoleId);
  const assignedCodes = new Set(rolePermissionsQuery.data || []);

  const filteredPermissions = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return permissions;
    return permissions.filter((permission) =>
      [permission.code, permission.name, permission.module, permission.description || ""]
        .join(" ")
        .toLowerCase()
        .includes(needle),
    );
  }, [permissions, search]);

  const groupedPermissions = useMemo(() => groupPermissions(filteredPermissions), [filteredPermissions]);
  const moduleCount = Object.keys(groupPermissions(permissions)).length;

  const metrics = [
    { label: "Catalogue permissions", value: permissions.length, icon: KeyRound },
    { label: "Modules", value: moduleCount, icon: ShieldCheck },
    { label: "Mapped to selected role", value: assignedCodes.size, icon: ToggleLeft },
  ];

  const hasError = rolesQuery.isError || permissionsQuery.isError;
  const error = rolesQuery.error || permissionsQuery.error;

  return (
    <PageContainer>
      <SectionHeader
        title="Permission Matrix"
        description="Inspect the platform permission catalogue and manage permission mappings per role."
        breadcrumb={["Console", "Identity", "Permissions"]}
        actions={
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                rolesQuery.refetch();
                permissionsQuery.refetch();
                rolePermissionsQuery.refetch();
              }}
            >
              <RefreshCw
                className={cn(
                  "mr-2 size-4",
                  (rolesQuery.isFetching || permissionsQuery.isFetching || rolePermissionsQuery.isFetching) && "animate-spin",
                )}
              />
              Refresh
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={seedPermissions.isPending}
              onClick={async () => {
                try {
                  await seedPermissions.mutateAsync();
                  toast.success("Permission catalogue seeded.");
                } catch (seedError: any) {
                  toast.error(seedError?.message || "Could not seed permissions.");
                }
              }}
            >
              <Sparkles className="mr-2 size-4" />
              Seed Catalogue
            </Button>
          </div>
        }
      />

      <MetricRow metrics={metrics} />

      {hasError ? (
        <RecoverableError
          title="Permission data could not be loaded"
          description={(error as Error)?.message || "The platform permissions API rejected the request."}
          action={{
            label: "Retry",
            onClick: () => {
              rolesQuery.refetch();
              permissionsQuery.refetch();
            },
          }}
        />
      ) : (
        <div className="grid gap-6 xl:grid-cols-[320px_minmax(0,1fr)]">
          <aside className="rounded-xl border border-border bg-surface p-4">
            <div className="mb-4">
              <h2 className="text-sm font-semibold text-[var(--text-primary)]">Roles</h2>
              <p className="text-xs text-[var(--text-secondary)]">Select a role to edit its permission mapping.</p>
            </div>
            <div className="space-y-2">
              {rolesQuery.isLoading ? (
                Array.from({ length: 5 }).map((_, index) => (
                  <div key={index} className="h-14 animate-pulse rounded-lg bg-surface-2" />
                ))
              ) : roles.length === 0 ? (
                <p className="rounded-lg border border-border bg-surface-2 p-4 text-xs text-[var(--text-secondary)]">
                  No roles are available yet. Create roles before assigning permissions.
                </p>
              ) : (
                roles.map((role) => {
                  const selected = role.id === selectedRoleId;
                  return (
                    <button
                      key={role.id}
                      type="button"
                      onClick={() => setSelectedRoleId(role.id)}
                      className={cn(
                        "w-full rounded-lg border p-3 text-left transition-colors",
                        selected
                          ? "border-[var(--brand-primary)] bg-[var(--brand-primary-muted)]"
                          : "border-border bg-surface-2 hover:bg-surface-hover",
                      )}
                    >
                      <span className="block text-sm font-semibold text-[var(--text-primary)]">{role.name}</span>
                      <span className="block font-mono text-[10px] uppercase tracking-wider text-[var(--text-tertiary)]">
                        {role.code}
                      </span>
                      <span className="mt-2 flex items-center justify-between text-[10px] text-[var(--text-secondary)]">
                        {role.permissions_count} permissions
                        <StatusBadge status={role.users_count > 0 ? "active" : "pending"} />
                      </span>
                    </button>
                  );
                })
              )}
            </div>
          </aside>

          <section className="space-y-4">
            <div className="rounded-xl border border-border bg-surface p-4">
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div>
                  <h2 className="text-sm font-semibold text-[var(--text-primary)]">
                    {selectedRole ? `Permissions for ${selectedRole.name}` : "Permission Catalogue"}
                  </h2>
                  <p className="text-xs text-[var(--text-secondary)]">
                    {selectedRole
                      ? "Toggles update the backend role-permission mapping immediately."
                      : "Select a role to enable mutation controls."}
                  </p>
                </div>
                <div className="relative w-full md:max-w-xs">
                  <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[var(--text-tertiary)]" />
                  <label className="sr-only" htmlFor="permission-search">Search permissions</label>
                  <Input
                    id="permission-search"
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="Search permissions..."
                    className="border border-border bg-surface-2 pl-9"
                  />
                </div>
              </div>
            </div>

            {permissionsQuery.isLoading ? (
              <div className="rounded-xl border border-border bg-surface p-4">
                {Array.from({ length: 8 }).map((_, index) => (
                  <div key={index} className="mb-3 h-14 animate-pulse rounded-lg bg-surface-2 last:mb-0" />
                ))}
              </div>
            ) : filteredPermissions.length === 0 ? (
              <div className="rounded-xl border border-border bg-surface p-8 text-center">
                <p className="text-sm font-semibold text-[var(--text-primary)]">No matching permissions</p>
                <p className="mt-1 text-xs text-[var(--text-secondary)]">Try a different module, code, or description.</p>
              </div>
            ) : (
              Object.entries(groupedPermissions).map(([module, items]) => (
                <div key={module} className="rounded-xl border border-border bg-surface">
                  <div className="flex items-center justify-between border-b border-border px-4 py-3">
                    <h3 className="font-mono text-xs font-semibold uppercase tracking-wider text-[var(--text-primary)]">
                      {module}
                    </h3>
                    <span className="text-xs text-[var(--text-tertiary)]">{items.length} permissions</span>
                  </div>
                  <div className="divide-y divide-border/60">
                    {items.map((permission) => {
                      const enabled = assignedCodes.has(permission.code);
                      return (
                        <div key={permission.id} className="flex flex-col gap-3 p-4 md:flex-row md:items-center md:justify-between">
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="text-sm font-semibold text-[var(--text-primary)]">{permission.name}</p>
                              <span className="rounded border border-border bg-surface-2 px-1.5 py-0.5 font-mono text-[10px] text-[var(--text-tertiary)]">
                                {permission.code}
                              </span>
                            </div>
                            {permission.description && (
                              <p className="mt-1 text-xs leading-5 text-[var(--text-secondary)]">{permission.description}</p>
                            )}
                          </div>
                          <Button
                            type="button"
                            size="sm"
                            variant={enabled ? "primary" : "outline"}
                            disabled={!selectedRoleId || togglePermission.isPending || rolePermissionsQuery.isLoading}
                            onClick={async () => {
                              if (!selectedRoleId) return;
                              try {
                                await togglePermission.mutateAsync({ roleId: selectedRoleId, permissionId: permission.id });
                                toast.success(enabled ? "Permission removed from role." : "Permission added to role.");
                              } catch (toggleError: any) {
                                toast.error(toggleError?.message || "Could not update role permission.");
                              }
                            }}
                          >
                            {enabled ? "Enabled" : "Disabled"}
                          </Button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))
            )}
          </section>
        </div>
      )}
    </PageContainer>
  );
}
