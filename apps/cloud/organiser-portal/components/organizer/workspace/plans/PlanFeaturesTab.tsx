"use client";
import { useState } from "react";
import { useFeatureMatrix } from "@/hooks/useBilling";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DataTable, Panel, StatusBadge } from "../OrganiserPrimitives";
import { asList, PlansPage } from "./shared";
export function PlanFeaturesTab() {
  const query = useFeatureMatrix();
  const [selected, setSelected] = useState<any | null>(null);
  return <PlansPage><Panel title="Feature entitlements" className="p-0"><DataTable columns={["Feature", "Domain", "Scope", "Availability", "Source", "Action"]} rows={asList(query.data).map((feature) => [feature.name || feature.key, feature.category || "General", feature.scope_type || "Unavailable", <StatusBadge key={`${feature.id}-status`} status={feature.enabled ? "Available" : "Unavailable"} />, feature.source_type || "Unavailable", <Button key={`${feature.id}-detail`} size="sm" variant="outline" onClick={() => setSelected(feature)}>Details</Button>])} empty={query.isLoading ? "Loading effective entitlements..." : query.isError ? "Feature entitlements are unavailable." : "No feature entitlements returned."} /></Panel><Dialog open={Boolean(selected)} onOpenChange={(open) => !open && setSelected(null)}><DialogContent><DialogHeader><DialogTitle>{selected?.name || "Entitlement detail"}</DialogTitle><DialogDescription>{selected?.description || "Effective organisation capability and its authoritative source."}</DialogDescription></DialogHeader><dl className="op-detail-list"><dt>Key</dt><dd>{selected?.key}</dd><dt>Domain</dt><dd>{selected?.category || "General"}</dd><dt>Scope</dt><dd>{selected?.scope_type || "Unavailable"}</dd><dt>State</dt><dd>{selected?.enabled ? "Available" : "Unavailable"}</dd><dt>Source</dt><dd>{selected?.source_type || "Unavailable"}</dd><dt>Value</dt><dd>{selected?.value == null ? "Unavailable" : String(selected.value)}</dd><dt>Resolution</dt><dd>{selected?.denial_reason || "No action required"}</dd></dl></DialogContent></Dialog></PlansPage>;
}
