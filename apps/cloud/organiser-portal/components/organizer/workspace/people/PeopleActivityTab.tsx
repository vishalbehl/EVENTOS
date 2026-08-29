"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiGet } from "@/lib/api-client";
import { DataTable, Panel } from "../OrganiserPrimitives";
import { PeoplePage } from "./shared";

export function PeopleActivityTab() {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const query = useQuery({ queryKey: ["organisation", "member-activity", page, pageSize], queryFn: () => apiGet<any>(`/organiser/audit?page=${page}&page_size=${pageSize}&resource=organization_member,organization_team,organization_team_member,organization_team_event,user_role_assignment`) });
  const rows = query.data?.items || [];
  return <PeoplePage><Panel title="Access activity" className="p-0"><DataTable columns={["Action", "Resource", "Actor role", "Occurred"]} rows={rows.map((row: any) => [row.action, row.resource_type, row.actor_role || "-", new Date(row.occurred_at).toLocaleString()])} empty={query.isError ? "Member activity is unavailable." : "No member activity found."} total={query.data?.total ?? rows.length} page={page} pageSize={pageSize} onPageChange={setPage} onPageSizeChange={setPageSize} /></Panel></PeoplePage>;
}
