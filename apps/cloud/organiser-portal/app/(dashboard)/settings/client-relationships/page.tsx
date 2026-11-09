"use client";
import { useState } from "react";
import { useAuthStore } from "@/store/use-auth-store";
import { SettingsPage, useSettingsAccess } from "@/components/organizer/workspace/settings/shared";
import { ContextDirectory, type OrganizationSelection } from "@/components/organizer/workspace/access/ContextDirectory";
import { ClientRelationships } from "@/components/organizer/workspace/access/ClientRelationships";
import { Panel } from "@/components/organizer/workspace/OrganiserPrimitives";

export default function ClientRelationshipsPage() {
  const user = useAuthStore(state => state.user);
  const access = useSettingsAccess();
  const [selected, setSelected] = useState<OrganizationSelection | null>(null);
  const permitted = access.data?.access_mode === "DIRECT" &&
    (access.data.organization_kind === "EMC" || access.data.organization_kind === "CLIENT") &&
    access.data.actions.includes("relationships:manage");

  return <SettingsPage>
    {access.isPending ? <Panel title="Relationship access"><p role="status">Checking relationship administration access…</p></Panel> : null}
    {access.isError || (!access.isPending && !permitted) ? <Panel title="Relationship access">
      <p role="alert">Client relationship administration is not available in this normal-organiser context.</p>
    </Panel> : null}
    {permitted ? <>
      <ContextDirectory onSelect={setSelected} />
      {user && selected ? <ClientRelationships key={`${user.id}:${selected.organization_id}`} organizationId={selected.organization_id} /> :
        <p className="p-4 text-sm">Select your EMC or client organisation above to manage its relationships.</p>}
    </> : null}
  </SettingsPage>;
}
