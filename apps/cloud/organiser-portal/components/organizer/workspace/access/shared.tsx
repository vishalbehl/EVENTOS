"use client";

import type { ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { KeyRound, LockKeyhole, ShieldCheck, Users } from "lucide-react";
import { apiGet } from "@/lib/api-client";
import { MetricCard } from "../OrganiserPrimitives";
import { OrganiserSection } from "../OrganiserSection";
import { accessContextCacheKey, useAuthStore } from "@/store/use-auth-store";
import { useAccessBootstrap } from "@/hooks/useAccessBootstrap";

export type UserRole = { id: string; name: string; description?: string; is_system_role?: boolean; users_count?: number; scope?: string; version: number };
export type Permission = { id?: string; code: string; name?: string; module?: string; description?: string };
export type RoleAssignment = { id: string; user_id: string; user_name: string; user_email: string; role_id: string; role_name: string; scope: "ORGANIZATION" | "EVENT"; event_id?: string | null; event_name?: string | null; assigned_at: string; version: number };

export const accessTabs = [["Roles", "/access-roles/roles"], ["Access Policies", "/access-roles/access-policies"]].map(([label, href]) => ({ label, href }));

export function AccessPage({ actions, children }: { actions?: ReactNode; children: ReactNode }) {
  const userId = useAuthStore(state => state.user?.id);
  const userOrganizationId = useAuthStore(state => state.user?.organization_id);
  const context = useAuthStore(state => state.activeContext);
  const contextKey = accessContextCacheKey(context, userOrganizationId);
  const access = useAccessBootstrap();
  const summary = useQuery({ queryKey: ["access-summary", userId, contextKey, access.data?.policy_revision], enabled: !!userId && access.isSuccess,
    staleTime: 0, retry: false, queryFn: ({ signal }) => apiGet<{ roles_count: number; permissions_count: number; role_assignments_count: number; custom_roles_count: number; system_roles_count: number; policy_revision: number }>("/rbac/summary", { signal }) });
  return <OrganiserSection title="Access & Roles" description="Define roles, manage permissions, and control access to your organisation and events." tabs={accessTabs} actions={actions}>
    <div className="op-metric-grid"><MetricCard label="Total roles" value={summary.isError ? "Unavailable" : summary.isPending ? "Loading…" : summary.data?.roles_count ?? "Unavailable"} tone="purple" icon={<ShieldCheck className="h-5 w-5" />} /><MetricCard label="Role assignments" value={summary.isError ? "Unavailable" : summary.isPending ? "Loading…" : summary.data?.role_assignments_count ?? "Unavailable"} tone="blue" icon={<Users className="h-5 w-5" />} /><MetricCard label="Custom roles" value={summary.isError ? "Unavailable" : summary.isPending ? "Loading…" : summary.data?.custom_roles_count ?? "Unavailable"} tone="green" icon={<KeyRound className="h-5 w-5" />} /><MetricCard label="System roles" value={summary.isError ? "Unavailable" : summary.isPending ? "Loading…" : summary.data?.system_roles_count ?? "Unavailable"} tone="amber" icon={<LockKeyhole className="h-5 w-5" />} /></div>
    {children}
  </OrganiserSection>;
}
