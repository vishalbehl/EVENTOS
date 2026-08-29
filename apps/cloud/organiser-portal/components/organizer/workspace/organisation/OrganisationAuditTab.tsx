"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiGet } from "@/lib/api-client";
import { DataTable, Panel } from "../OrganiserPrimitives";
import { OrganisationPage } from "./shared";

export function OrganisationAuditTab() {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const query = useQuery({ queryKey: ["organisation", "audit", page, pageSize], queryFn: () => apiGet<any>(`/organiser/audit?page=${page}&page_size=${pageSize}`) });
  return <OrganisationPage><Panel title="Organisation audit" className="p-0"><DataTable columns={["Action", "Resource", "Actor role", "Occurred"]} rows={(query.data?.items || []).map((row: any) => [row.action, row.resource_type, row.actor_role || "-", new Date(row.occurred_at).toLocaleString()])} empty={query.isError ? "Audit records are unavailable." : "No organisation audit records found."} total={query.data?.total ?? 0} page={page} pageSize={pageSize} onPageChange={setPage} onPageSizeChange={setPageSize} /></Panel></OrganisationPage>;
}
