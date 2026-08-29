"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { apiClient, apiGet } from "@/lib/api-client";
import { DataTable, Panel, StatusBadge } from "../OrganiserPrimitives";
import { Unavailable } from "../OrganiserSection";
import { OrganisationPage } from "./shared";

export function OrganisationIntegrationsTab() {
  const client = useQueryClient();
  const query = useQuery({ queryKey: ["organisation", "integrations"], queryFn: () => apiGet<any>("/organiser/integrations") });
  const providers = useQuery({ queryKey: ["organisation", "integration-providers"], queryFn: () => apiGet<Array<{ id: string; name: string }>>("/developer/integration-providers") });
  const [open, setOpen] = useState(false);
  const [providerId, setProviderId] = useState("");
  const refresh = () => client.invalidateQueries({ queryKey: ["organisation", "integrations"] });
  const connect = useMutation({ mutationFn: () => apiClient.post("/developer/integration-connections", { provider_id: providerId }, { headers: { "Idempotency-Key": crypto.randomUUID() } }), onSuccess: async () => { setOpen(false); setProviderId(""); await refresh(); toast.success("Integration connected."); }, onError: (error: any) => toast.error(error?.message || "Integration could not be connected.") });
  const toggle = async (row: any) => { try { await apiClient.patch(`/developer/integration-connections/${row.id}`, { is_active: !row.is_active }, { headers: { "Idempotency-Key": crypto.randomUUID(), "If-Match": String(row.version) } }); await refresh(); toast.success(row.is_active ? "Integration deactivated." : "Integration activated."); } catch (error: any) { toast.error(error?.message || "Integration status could not be changed."); } };

  return <OrganisationPage>
    <Panel title="Integrations" action={<Button onClick={() => setOpen(true)} disabled={providers.isError}><Plus className="mr-2 h-4 w-4" />Connect provider</Button>} className="p-0"><DataTable columns={["Provider", "Status", "Version", "Action"]} rows={(query.data?.items || []).map((row: any) => [row.provider, <StatusBadge key={`${row.id}-status`} status={row.is_active ? "Active" : "Inactive"} />, row.version, <Button key={`${row.id}-toggle`} variant="outline" size="sm" onClick={() => toggle(row)}>{row.is_active ? "Deactivate" : "Activate"}</Button>])} empty={query.isError ? "Integration status is unavailable." : "No integrations connected."} /></Panel>
    <Dialog open={open} onOpenChange={setOpen}><DialogContent><DialogHeader><DialogTitle>Connect integration</DialogTitle><DialogDescription>Select an available provider. The server enforces plan, capability, and integration limits.</DialogDescription></DialogHeader><label>Provider<select className="op-select mt-2 w-full" value={providerId} onChange={(e) => setProviderId(e.target.value)}><option value="">Select provider</option>{(providers.data || []).map((provider) => <option key={provider.id} value={provider.id}>{provider.name}</option>)}</select></label>{providers.isError ? <Unavailable>Integration providers are unavailable or your role cannot manage integrations.</Unavailable> : null}<DialogFooter><Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button><Button onClick={() => connect.mutate()} disabled={!providerId || connect.isPending}>{connect.isPending ? "Connecting..." : "Connect"}</Button></DialogFooter></DialogContent></Dialog>
  </OrganisationPage>;
}
