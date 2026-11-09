"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Layers3, MoreHorizontal, ShieldCheck, UserPlus, Users } from "lucide-react";
import { apiGet } from "@/lib/api-client";
import { accessContextCacheKey, useAuthStore } from "@/store/use-auth-store";
import { useAccessBootstrap } from "@/hooks/useAccessBootstrap";
import { MetricCard } from "../OrganiserPrimitives";
import { OrganiserSection, Unavailable } from "../OrganiserSection";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

export type TeamRecord = {
  id: string;
  name: string;
  description?: string | null;
  owner_member_id?: string | null;
  status?: string;
  version: number;
  member_count: number;
  members: Array<{ member_id: string; name: string; email: string }>;
  events: Array<{ event_id: string; event_name: string; permissions: Record<string, unknown>; authorization_version: 0 | 1 }>;
  updated_at?: string | null;
};

export const peopleTabs = [
  ["Team Members", "/people-teams/users"],
  ["Teams", "/people-teams/teams"],
  ["Invitations", "/people-teams/invitations"],
].map(([label, href]) => ({ label, href }));

export function PeoplePage({ actions, children, showMetrics = true }: { actions?: ReactNode; children: ReactNode; showMetrics?: boolean }) {
  const user = useAuthStore(state => state.user);
  const context = useAuthStore(state => state.activeContext);
  const contextKey = accessContextCacheKey(context, user?.organization_id);
  const access = useAccessBootstrap();
  const permitted = access.isSuccess && !access.isError && access.data.actions.includes("members:manage");
  const members = useQuery({
    queryKey: ["organisation", "member-summary", user?.id, contextKey, access.data?.policy_revision],
    queryFn: ({ signal }) => apiGet<{ total: number; active: number; pending: number; teams: number; role_assignments: number }>("/organiser/members/summary", { signal }),
    enabled: !!user && showMetrics && permitted,
    retry: false,
  });
  const records = permitted && !members.isError ? members.data : undefined;
  const unavailable = access.isError || members.isError;
  const missing = unavailable ? "Unavailable" : access.isSuccess && !permitted ? "Restricted" : "Loading…";
  const pageActions = <div className="flex items-center gap-2">{actions}<DropdownMenu><DropdownMenuTrigger asChild><Button variant="outline"><MoreHorizontal className="mr-2 size-4" />More</Button></DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuItem asChild><Link href="/people-teams/assignments">Assignments</Link></DropdownMenuItem><DropdownMenuItem asChild><Link href="/people-teams/activity">Activity</Link></DropdownMenuItem></DropdownMenuContent></DropdownMenu></div>;
  return <OrganiserSection title="People & Teams" description="Manage organiser members, teams, invitations, and event assignments." tabs={peopleTabs} actions={pageActions}>
    {showMetrics && unavailable ? <Unavailable>Organisation member totals are unavailable from the authoritative API.</Unavailable> : null}
    {showMetrics ? <div className="op-metric-grid">
      <MetricCard label="Team members" value={records?.total ?? missing} tone="purple" icon={<Users className="h-5 w-5" />} />
      <MetricCard label="Teams" value={records?.teams ?? missing} tone="blue" icon={<Layers3 className="h-5 w-5" />} />
      <MetricCard label="Roles assigned" value={records?.role_assignments ?? missing} tone="green" icon={<ShieldCheck className="h-5 w-5" />} />
      <MetricCard label="Pending invitations" value={records?.pending ?? missing} tone="amber" icon={<UserPlus className="h-5 w-5" />} />
    </div> : null}
    {children}
  </OrganiserSection>;
}
