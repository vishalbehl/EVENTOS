"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil, Plus } from "lucide-react";
import { toast } from "sonner";
import { orgApi } from "@/components/organizer/org/org-api";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { apiClient, apiGet } from "@/lib/api-client";
import { DataTable, Panel, StatusBadge } from "../OrganiserPrimitives";
import { OrganisationPage } from "./shared";

type LocationRecord = { id?: string; version?: number; name: string; location_type: string; timezone: string; status: string; manager_user_id?: string | null; team_id?: string | null; address: Record<string, string>; contact: Record<string, string> };
type Member = { id: string; user_id?: string | null; name: string; is_active: boolean };
type Team = { id: string; name: string; status: string };
const emptyLocation = (timezone = "UTC"): LocationRecord => ({ name: "", location_type: "HEAD_OFFICE", timezone, status: "ACTIVE", manager_user_id: null, team_id: null, address: {}, contact: {} });

export function OrganisationLocationsTab() {
  const client = useQueryClient();
  const organisation = useQuery({ queryKey: ["organisation", "me"], queryFn: orgApi.me });
  const query = useQuery({ queryKey: ["organisation", "locations"], queryFn: () => apiGet<any>("/organiser/locations") });
  const members = useQuery({ queryKey: ["organisation", "branch-owner-options"], queryFn: () => apiGet<{ items: Member[] }>("/organiser/members?page=1&page_size=100&status=active") });
  const teams = useQuery({ queryKey: ["organisation", "branch-team-options"], queryFn: () => apiGet<{ items: Team[] }>("/organiser/teams?page=1&page_size=100") });
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<LocationRecord>(emptyLocation());
  const mutation = useMutation({
    mutationFn: () => form.id
      ? apiClient.put(`/organiser/locations/${form.id}`, form, { headers: { "If-Match": String(form.version) } })
      : apiClient.post("/organiser/locations", form),
    onSuccess: async () => { setOpen(false); await client.invalidateQueries({ queryKey: ["organisation", "locations"] }); toast.success(form.id ? "Location updated." : "Location created."); },
    onError: (error: any) => toast.error(error?.message || "Location could not be saved."),
  });
  const beginCreate = () => { setForm(emptyLocation(organisation.data?.organization.timezone || "UTC")); setOpen(true); };

  return <OrganisationPage>
    <Panel title="Workspaces & branches" action={<Button onClick={beginCreate}><Plus className="mr-2 h-4 w-4" />Add branch</Button>} className="p-0">
      <DataTable columns={["Branch", "Type", "Owner", "Team", "Timezone", "Status", "Action"]} rows={(query.data?.items || []).map((row: LocationRecord) => [row.name, row.location_type, members.data?.items.find(member => member.user_id === row.manager_user_id)?.name || "Unassigned", teams.data?.items.find(team => team.id === row.team_id)?.name || "Unassigned", row.timezone, <StatusBadge key={`${row.id}-status`} status={row.status} />, <Button key={`${row.id}-edit`} variant="outline" size="sm" onClick={() => { setForm(row); setOpen(true); }}><Pencil className="mr-2 h-3.5 w-3.5" />Edit</Button>])} empty={query.isError ? "Branches are unavailable." : "No organisation branches configured."} />
    </Panel>
    <Dialog open={open} onOpenChange={setOpen}><DialogContent><DialogHeader><DialogTitle>{form.id ? "Edit branch" : "Add branch"}</DialogTitle><DialogDescription>Assign operational accountability without mixing organiser teams with Command Center departments.</DialogDescription></DialogHeader><div className="op-form-grid">
      <label>Name<Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></label>
      <label>Type<select className="op-select" value={form.location_type} onChange={(e) => setForm({ ...form, location_type: e.target.value })}><option value="HEAD_OFFICE">Head office</option><option value="REGIONAL_OFFICE">Regional office</option><option value="VENUE">Venue</option><option value="WAREHOUSE">Warehouse</option><option value="OTHER">Other</option></select></label>
      <label>Timezone<Input value={form.timezone} onChange={(e) => setForm({ ...form, timezone: e.target.value })} /></label>
      <label>Status<select className="op-select" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}><option value="ACTIVE">Active</option><option value="INACTIVE">Inactive</option></select></label>
      <label>Branch owner<select className="op-select" value={form.manager_user_id || ""} onChange={(e) => setForm({ ...form, manager_user_id: e.target.value || null })}><option value="">Unassigned</option>{(members.data?.items || []).filter(member => member.is_active && member.user_id).map(member => <option key={member.id} value={member.user_id!}>{member.name}</option>)}</select></label>
      <label>Organiser team<select className="op-select" value={form.team_id || ""} onChange={(e) => setForm({ ...form, team_id: e.target.value || null })}><option value="">Unassigned</option>{(teams.data?.items || []).filter(team => team.status === "ACTIVE").map(team => <option key={team.id} value={team.id}>{team.name}</option>)}</select></label>
      <label>Address line<Input value={form.address.line1 || ""} onChange={(e) => setForm({ ...form, address: { ...form.address, line1: e.target.value } })} /></label>
      <label>City<Input value={form.address.city || ""} onChange={(e) => setForm({ ...form, address: { ...form.address, city: e.target.value } })} /></label>
    </div><DialogFooter><Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button><Button onClick={() => mutation.mutate()} disabled={!form.name.trim() || !form.timezone.trim() || mutation.isPending}>{mutation.isPending ? "Saving..." : "Save branch"}</Button></DialogFooter></DialogContent></Dialog>
  </OrganisationPage>;
}
