"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { apiClient, apiGet } from "@/lib/api-client";
import { DataTable, Panel } from "../OrganiserPrimitives";
import { AccessPage, type Permission, type UserRole } from "./shared";

const actions = ["VIEW", "CREATE", "EDIT", "APPROVE", "EXPORT", "DELETE", "CONFIGURE"] as const;

export function AccessPermissionsTab() {
  const client = useQueryClient();
  const [roleId, setRoleId] = useState("");
  const roles = useQuery({ queryKey: ["user-roles"], queryFn: () => apiGet<UserRole[]>("/rbac/roles") });
  const permissions = useQuery({ queryKey: ["permissions"], queryFn: () => apiGet<Permission[]>("/rbac/permissions") });
  const granted = useQuery({ queryKey: ["user-role-permissions", roleId], queryFn: () => apiGet<string[]>(`/rbac/roles/${roleId}/permissions`), enabled: Boolean(roleId) });
  const toggle = useMutation({ mutationFn: (code: string) => apiClient.post(`/rbac/roles/${roleId}/permissions/${encodeURIComponent(code)}/toggle`), onSuccess: async () => { await client.invalidateQueries({ queryKey: ["user-role-permissions", roleId] }); toast.success("Role permission updated."); }, onError: (reason: any) => toast.error(reason?.message || "The role permission could not be updated.") });
  const modules = Array.from(new Set((permissions.data || []).map(permission => permission.module || "GENERAL"))).sort();
  const permissionFor = (module: string, action: string) => (permissions.data || []).find(permission => (permission.module || "GENERAL") === module && (permission.code.toUpperCase().endsWith(`_${action}`) || permission.code.toUpperCase() === `${module}_${action}`));
  return <AccessPage><Panel title="Permission matrix" className="p-0"><div className="border-b border-[var(--op-border-soft)] p-4"><label className="text-sm font-medium text-[var(--op-text)]">Custom role<select className="op-select ml-3 min-w-56" value={roleId} onChange={(event) => setRoleId(event.target.value)}><option value="">Select role</option>{(roles.data || []).filter((role) => !role.is_system_role).map((role) => <option key={role.id} value={role.id}>{role.name}</option>)}</select></label></div><DataTable columns={["Operational domain", "View", "Create", "Edit", "Approve", "Export", "Delete", "Configure"]} rows={modules.map(module => [module, ...actions.map(action => { const permission = permissionFor(module, action); return permission ? <Button key={`${module}-${action}`} variant="outline" size="sm" title={permission.name || permission.code} disabled={!roleId || toggle.isPending} onClick={() => toggle.mutate(permission.code)}>{granted.data?.includes(permission.code) ? "Granted" : "Not granted"}</Button> : <span key={`${module}-${action}`} className="text-xs text-[var(--op-muted)]">Unavailable</span>; })])} empty={permissions.isError ? "Permissions are unavailable." : "No permissions found."} /></Panel></AccessPage>;
}
