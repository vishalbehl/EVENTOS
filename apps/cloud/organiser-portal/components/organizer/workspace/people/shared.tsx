"use client";

import type { ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { UserPlus, Users } from "lucide-react";
import { orgApi } from "@/components/organizer/org/org-api";
import { MetricCard } from "../OrganiserPrimitives";
import { OrganiserSection, Unavailable } from "../OrganiserSection";

export type TeamRecord = {
  id: string;
  name: string;
  description?: string | null;
  owner_member_id?: string | null;
  status?: string;
  version: number;
  member_count: number;
  members: Array<{ member_id: string; name: string; email: string }>;
  events: Array<{ event_id: string; event_name: string; permissions: Record<string, unknown> }>;
  updated_at?: string | null;
};

export const peopleTabs = [
  ["Users", "/people-teams/users"],
  ["Invitations", "/people-teams/invitations"],
  ["Teams", "/people-teams/teams"],
  ["Team Members", "/people-teams/team-members"],
].map(([label, href]) => ({ label, href }));

export function PeoplePage({ actions, children, showMetrics = true }: { actions?: ReactNode; children: ReactNode; showMetrics?: boolean }) {
  const members = useQuery({ queryKey: ["organisation", "members"], queryFn: orgApi.members });
  const records = members.data || [];
  return <OrganiserSection title="People & Teams" description="Manage organiser members, teams, invitations, and event assignments." tabs={peopleTabs} actions={actions}>
    {members.isError ? <Unavailable>Organisation members are unavailable from the authoritative API.</Unavailable> : null}
    {showMetrics ? <div className="op-metric-grid">
      <MetricCard label="Total members" value={members.isError ? "Unavailable" : records.length} tone="purple" icon={<Users className="h-5 w-5" />} />
      <MetricCard label="Active" value={members.isError ? "Unavailable" : records.filter((member) => member.is_active && member.accepted_at).length} tone="green" icon={<Users className="h-5 w-5" />} />
      <MetricCard label="Pending invitations" value={members.isError ? "Unavailable" : records.filter((member) => !member.accepted_at).length} tone="amber" icon={<UserPlus className="h-5 w-5" />} />
    </div> : null}
    {children}
  </OrganiserSection>;
}
