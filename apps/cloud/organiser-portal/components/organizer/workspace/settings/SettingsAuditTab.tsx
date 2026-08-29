"use client";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { apiGet } from "@/lib/api-client";
import { DataTable, Panel } from "../OrganiserPrimitives";
import { SettingsPage } from "./shared";
const resources =
  "organization_custom_field,organization_notification_rule,organization_security_policy,organization_brand_profile,integration_connection,oauth_client,api_key,webhook";
export function SettingsAuditTab() {
  const [page, setPage] = useState(1),
    [pageSize, setPageSize] = useState(10),
    query = useQuery({
      queryKey: ["organisation-settings", "audit", page, pageSize],
      queryFn: () =>
        apiGet<any>(
          `/organiser/audit?page=${page}&page_size=${pageSize}&resource=${resources}`,
        ),
    });
  const download = async () => {
    const storage = localStorage.getItem("obsidian-auth-storage"),
      token = storage ? JSON.parse(storage)?.state?.accessToken : null,
      response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000"}/api/v1/organiser/audit/export?resource=${resources}`,
        { headers: token ? { Authorization: `Bearer ${token}` } : {} },
      );
    if (!response.ok) throw new Error("Audit export failed");
    const url = URL.createObjectURL(await response.blob()),
      anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "organiser-settings-audit.csv";
    anchor.click();
    URL.revokeObjectURL(url);
  };
  return (
    <SettingsPage
      actions={
        <Button variant="outline" onClick={() => void download()}>
          <Download className="mr-2 h-4 w-4" />
          Export audit
        </Button>
      }
    >
      <Panel title="Settings audit" className="p-0">
        <DataTable
          columns={[
            "Action",
            "Resource",
            "Actor role",
            "Sensitivity",
            "Occurred",
          ]}
          rows={(query.data?.items || []).map((row: any) => [
            row.action,
            row.resource_type,
            row.actor_role || "Unavailable",
            row.is_sensitive ? "Sensitive" : "Standard",
            new Date(row.occurred_at).toLocaleString(),
          ])}
          empty={
            query.isLoading
              ? "Loading audit records..."
              : query.isError
                ? "Audit records are unavailable."
                : "No settings audit records found."
          }
          total={query.data?.total ?? 0}
          page={page}
          pageSize={pageSize}
          onPageChange={setPage}
          onPageSizeChange={setPageSize}
        />
      </Panel>
      <p className="text-xs text-[var(--op-muted)]">
        Source: {query.data?.source || "Unavailable"} · Freshness:{" "}
        {query.data?.freshness_at
          ? new Date(query.data.freshness_at).toLocaleString()
          : "Unavailable"}
      </p>
    </SettingsPage>
  );
}
