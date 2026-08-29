"use client";

import type { ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { KeyRound, ShieldCheck } from "lucide-react";
import { apiGet } from "@/lib/api-client";
import { MetricCard } from "../OrganiserPrimitives";
import { OrganiserSection } from "../OrganiserSection";

export type UserRole = { id: string; name: string; description?: string; is_system_role?: boolean; users_count?: number; scope?: string; version: number };
export type Permission = { id?: string; code: string; name?: string; module?: string; description?: string };
export type RoleAssignment = { id: string; user_id: string; user_name: string; user_email: string; role_id: string; role_name: string; scope: "ORGANIZATION" | "EVENT"; event_id?: string | null; event_name?: string | null; assigned_at: string };

export const accessTabs = [["Roles", "/access-roles/roles"], ["Capabilities", "/access-roles/capabilities"], ["Assignments", "/access-roles/assignments"], ["Permission Matrix", "/access-roles/permission-matrix"], ["Approval Rules", "/access-roles/approval-rules"], ["Access Audit", "/access-roles/audit"]].map(([label, href]) => ({ label, href }));

export function AccessPage({ actions, children }: { actions?: ReactNode; children: ReactNode }) {
  const roles = useQuery({ queryKey: ["user-roles"], queryFn: () => apiGet<UserRole[]>("/rbac/roles") });
  const permissions = useQuery({ queryKey: ["permissions"], queryFn: () => apiGet<Permission[]>("/rbac/permissions") });
  return <OrganiserSection title="Access & Roles" description="Control user roles, permissions, capabilities, and event access." tabs={accessTabs} actions={actions}>
    <div className="op-metric-grid"><MetricCard label="User roles" value={roles.isError ? "Unavailable" : roles.data?.length ?? 0} tone="purple" icon={<ShieldCheck className="h-5 w-5" />} /><MetricCard label="Permissions" value={permissions.isError ? "Unavailable" : permissions.data?.length ?? 0} tone="blue" icon={<KeyRound className="h-5 w-5" />} /></div>
    {children}
  </OrganiserSection>;
}
