"use client";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiGet } from "@/lib/api-client";
import { DataTable, Panel } from "../OrganiserPrimitives";
import { AccessPage } from "./shared";
export function AccessAuditTab() {
  const [page, setPage] = useState(1); const [pageSize, setPageSize] = useState(10);
  const query = useQuery({ queryKey: ["organisation", "access-audit", page, pageSize], queryFn: () => apiGet<any>(`/organiser/audit?page=${page}&page_size=${pageSize}&resource=user_role,user_role_assignment`) });
  const rows = query.data?.items || [];
  return <AccessPage><Panel title="Access audit" className="p-0"><DataTable columns={["Action", "Resource", "Actor role", "Occurred"]} rows={rows.map((row: any) => [row.action, row.resource_type, row.actor_role || "-", new Date(row.occurred_at).toLocaleString()])} empty={query.isError ? "Access audit is unavailable." : "No access changes found."} total={query.data?.total ?? rows.length} page={page} pageSize={pageSize} onPageChange={setPage} onPageSizeChange={setPageSize} /></Panel></AccessPage>;
}
