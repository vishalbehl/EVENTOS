"use client";

import { OrganizationEmailStudio } from "@/components/organizer/emails/designer/OrganizationEmailStudio";
import { useAuthStore } from "@/store/use-auth-store";

export default function OrganizationEmailTemplatesPage() {
  const organizationId = useAuthStore((state) => state.user?.organization_id);
  if (!organizationId) {
    return <div className="grid h-full min-h-0 flex-1 place-items-center text-sm text-muted-foreground">Organisation context is unavailable.</div>;
  }

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden">
      <OrganizationEmailStudio organizationId={organizationId} />
    </div>
  );
}
