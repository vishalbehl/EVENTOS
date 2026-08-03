"use client";

import { OrganizationEmailStudio } from "@/components/organizer/emails/designer/OrganizationEmailStudio";
import { useAuthStore } from "@/store/use-auth-store";

export default function OrganizationEmailTemplatesPage() {
  const organizationId = useAuthStore((state) => state.user?.organization_id);
  if (!organizationId) {
    return <div className="grid h-full min-h-0 flex-1 place-items-center text-sm text-muted-foreground">Organisation context is unavailable.</div>;
  }

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col gap-4 overflow-hidden p-6">
      <header className="flex-none">
        <p className="text-xs font-bold uppercase tracking-[.18em] text-muted-foreground">Organisation settings</p>
        <h1 className="text-2xl font-semibold">Email template library</h1>
        <p className="mt-1 text-sm text-muted-foreground">Publish reusable templates for every event, then make event-only changes when needed.</p>
      </header>
      <div className="flex min-h-0 flex-1 overflow-hidden">
        <OrganizationEmailStudio organizationId={organizationId} />
      </div>
    </div>
  );
}
