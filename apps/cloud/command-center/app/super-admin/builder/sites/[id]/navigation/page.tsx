"use client";

import { UnavailableRouteState } from "@/components/super-admin/ui/UnavailableRouteState";

export default function BuilderSiteNavigationPage() {
  return (
    <UnavailableRouteState
      title="Site Navigation"
      description="Manage persisted navigation menus, hierarchy, route targets, and publish versions."
      breadcrumb={["Super Admin", "Builder", "Sites", "Navigation"]}
      removed={[
        "Local navigation add/delete behavior.",
        "Fake hierarchy-save success toast.",
        "Menu controls without route validation, draft/publish versioning, rollback, or audit.",
      ]}
      required={[
        "Navigation API with item CRUD, hierarchy validation, draft and published versions.",
        "Route-target validation against pages, public routes, and tenant/site ownership.",
        "Audit events and publish invalidation after menu changes.",
      ]}
    />
  );
}
