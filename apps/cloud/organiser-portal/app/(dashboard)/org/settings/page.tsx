import { Suspense } from "react";
import { OrgSettingsPage } from "@/components/organizer/org/OrgWorkspace";
import { Skeleton } from "@/components/ui/skeleton";

export default function OrganisationSettingsRoute() {
  return (
    <Suspense
      fallback={
        <div className="space-y-4 p-6">
          <Skeleton className="h-10 w-64" />
          <Skeleton className="h-64 w-full" />
        </div>
      }
    >
      <OrgSettingsPage />
    </Suspense>
  );
}
