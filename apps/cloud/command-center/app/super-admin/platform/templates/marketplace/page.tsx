"use client";

import { UnavailableRouteState } from "@/components/super-admin/ui/UnavailableRouteState";

export default function TemplateMarketplacePage() {
  return (
    <UnavailableRouteState
      title="Template Marketplace"
      description="Review, purchase, install, version, and remove compatible marketplace templates."
      breadcrumb={["Super Admin", "Platform", "Templates", "Marketplace"]}
      removed={[
        "Static marketplace listings and fake purchase state.",
        "Favorite and purchase success toasts that did not call provider, billing, install, or audit APIs.",
        "Installed-template counts derived from local UI state.",
      ]}
      required={[
        "Marketplace listing API with compatibility, supplier, review, pricing, and version metadata.",
        "Idempotent purchase/install workflow with billing, entitlement, dependency, and rollback behavior.",
        "Audit records for purchase, install, disable, and removal.",
        "Provider failure, retry, reconciliation, and permission-denied states.",
      ]}
      note="Marketplace actions are commercial and operational mutations; they must not be simulated in the production super-admin portal."
    />
  );
}
