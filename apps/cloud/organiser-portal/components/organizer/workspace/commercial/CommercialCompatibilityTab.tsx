"use client";

import { CloudCommercialWorkspace } from "@/components/organizer/commercial/CloudCommercialWorkspace";

type CommercialView = "overview" | "workspace" | "events" | "capacity" | "usage" | "requests" | "history";

export function CommercialCompatibilityTab({ view }: { view: CommercialView }) {
  return <CloudCommercialWorkspace view={view} />;
}
