"use client";
import { useQuery } from "@tanstack/react-query";
import { apiGet } from "@/lib/api-client";
import { DataTable, Panel, StatusBadge } from "../OrganiserPrimitives";
import { AccessPage } from "./shared";
export function AccessCapabilitiesTab() {
  const query = useQuery({ queryKey: ["organisation-capabilities"], queryFn: () => apiGet<any>("/organizations/current/capabilities") });
  const features = Object.entries(query.data?.features || query.data?.capabilities || {}).sort(([left], [right]) => left.localeCompare(right));
  return <AccessPage><Panel title="Capability catalogue" className="p-0"><DataTable columns={["Operational domain", "Capability", "Entitlement", "Delegated operations", "Source", "Resolution"]} rows={features.map(([key, raw]) => { const value: any = raw; const domain = String(value?.owner_console || key.split("_")[1] || "GENERAL").replaceAll("_", " "); return [domain, value?.name || key, <StatusBadge key={`${key}-status`} status={value?.enabled === false || value === false ? "Locked" : "Available"} />, value?.operations?.length ? value.operations.join(", ") : "No delegated operations", value?.source || query.data?.source || "Resolver", value?.reason_code ? String(value.reason_code).replaceAll("_", " ") : "Resolved"]; })} empty={query.isLoading ? "Resolving capabilities..." : query.isError ? "Capability resolution is unavailable." : "No capability records returned."} /></Panel></AccessPage>;
}
