"use client";

import { useDeferredValue, useEffect, useState } from "react";
import { CalendarDays, Search } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { apiGet } from "@/lib/api-client";
import { usePortalQueryScope } from "@/hooks/useAccessBootstrap";
import { DataTable, Panel, StatusBadge } from "../OrganiserPrimitives";
import { OrganisationPage } from "./shared";

type AuditItem = {
  id: string;
  action: string;
  resource_type: string;
  actor_role?: string | null;
  occurred_at: string;
};

export function OrganisationAuditTab() {
  const scope = usePortalQueryScope();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [search, setSearch] = useState("");
  const [resource, setResource] = useState("");
  const [actorRole, setActorRole] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const deferredSearch = useDeferredValue(search.trim());

  useEffect(() => setPage(1), [deferredSearch, resource, actorRole, fromDate, toDate]);

  const query = useQuery({
    queryKey: ["organisation", ...scope, "audit", page, pageSize, deferredSearch, resource, actorRole, fromDate, toDate],
    queryFn: () => {
      const params = new URLSearchParams({ page: String(page), page_size: String(pageSize) });
      if (deferredSearch) params.set("search", deferredSearch);
      if (resource) params.set("resource_type", resource);
      if (actorRole) params.set("actor_role", actorRole);
      if (fromDate) params.set("occurred_from", `${fromDate}T00:00:00.000Z`);
      if (toDate) params.set("occurred_to", `${toDate}T23:59:59.999Z`);
      return apiGet<{ items: AuditItem[]; total: number }>(`/organiser/audit?${params}`);
    },
  });

  return (
    <OrganisationPage>
      <Panel title="Activity & audit" description="Review key organisation changes and configuration activity." className="p-0">
        <div className="organisation-audit-toolbar">
          <label className="organisation-audit-search"><Search className="size-4" aria-hidden /><input aria-label="Search audit activity" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search by action, user role, or module…" /></label>
          <select aria-label="Filter by module" value={resource} onChange={(event) => setResource(event.target.value)}>
            <option value="">All modules</option>
            <option value="organization_profile">Organisation</option>
            <option value="organization_branding">Branding</option>
            <option value="organization_location">Addresses</option>
            <option value="organization_document">Documents</option>
            <option value="organization_member">Members</option>
            <option value="role">Access & roles</option>
          </select>
          <select aria-label="Filter by actor role" value={actorRole} onChange={(event) => setActorRole(event.target.value)}>
            <option value="">All user roles</option>
            <option value="owner">Owner</option>
            <option value="admin">Admin</option>
            <option value="member">Member</option>
          </select>
          <label className="organisation-audit-date"><CalendarDays className="size-4" aria-hidden /><input aria-label="Activity start date" type="date" value={fromDate} onChange={(event) => setFromDate(event.target.value)} /><span>–</span><input aria-label="Activity end date" type="date" value={toDate} min={fromDate || undefined} onChange={(event) => setToDate(event.target.value)} /></label>
        </div>
        <DataTable
          columns={["Date & time", "Action", "Module", "User role", "Status"]}
          rows={(query.data?.items || []).map((row) => [
            new Date(row.occurred_at).toLocaleString("en-IN"),
            <span key={`${row.id}-action`} className="font-semibold text-[var(--text-primary)]">{humanize(row.action)}</span>,
            humanize(row.resource_type),
            humanize(row.actor_role || "System"),
            <StatusBadge key={`${row.id}-status`} status="Completed" />,
          ])}
          empty={query.isLoading ? "Loading organisation activity…" : query.isError ? "Audit records are unavailable." : "No organisation activity matches these filters."}
          total={query.data?.total ?? 0}
          page={page}
          pageSize={pageSize}
          onPageChange={setPage}
          onPageSizeChange={setPageSize}
        />
      </Panel>
    </OrganisationPage>
  );
}

function humanize(value: string) {
  return value.replace(/[_-]+/g, " ").toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase());
}
