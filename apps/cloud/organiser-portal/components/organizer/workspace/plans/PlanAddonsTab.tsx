"use client";
import { DataTable, Panel, StatusBadge } from "../OrganiserPrimitives";
import { asList, CommercialRequestAction, PlansPage, usePlanData } from "./shared";

const statusLabel: Record<string, string> = {
  ACTIVE: "Active",
  AVAILABLE: "Available to request",
  EXPIRED: "Expired",
  INCLUDED: "Included in plan",
  PENDING: "Pending request",
  UNRESTRICTED: "Internal unlimited",
};

export function PlanAddonsTab() {
  const { addonStatuses: query, unrestricted } = usePlanData();
  return <PlansPage actions={unrestricted ? undefined : <CommercialRequestAction />}>
    <Panel title="Add-ons" className="p-0">
      <DataTable
        columns={["Add-on", "Type", "Access", "Scope", "Quantity", "Expires"]}
        rows={asList(query.data).map((addon) => [
          addon.name || addon.key,
          addon.addon_type || "Plan",
          <StatusBadge key={`${addon.id || addon.key}-status`} status={statusLabel[addon.status] || addon.status || "Unavailable"} />,
          asList(addon.scopes).length ? asList(addon.scopes).join(", ") : addon.status === "INCLUDED" || addon.status === "UNRESTRICTED" ? "Organisation" : "-",
          addon.quantity || (addon.status === "INCLUDED" || addon.status === "UNRESTRICTED" ? "Unlimited" : "-"),
          addon.expires_at ? new Date(addon.expires_at).toLocaleDateString() : "-",
        ])}
        empty={query.isError ? "Add-on access is unavailable." : "No add-ons returned."}
      />
    </Panel>
  </PlansPage>;
}
