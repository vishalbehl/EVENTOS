"use client";

import { UnavailableRouteState } from "@/components/super-admin/ui/UnavailableRouteState";

export default function BuilderSitesPage() {
  return (
    <UnavailableRouteState
      title="Builder Sites"
      description="Manage event and tenant websites, redirects, SEO metadata, publishing state, and ownership."
      breadcrumb={["Super Admin", "Builder", "Sites"]}
      removed={[
        "Local redirect creation/deletion that never persisted.",
        "Fake sitemap and meta-save success messages.",
        "Site administration controls without site ownership, publish status, audit, or rollback contracts.",
      ]}
      required={[
        "Site catalogue API with tenant/event ownership, lifecycle, domains, redirects, SEO, and publish status.",
        "Idempotent create/update/publish workflows with authorization, audit, rollback, and version history.",
        "Download/preview/public URL behavior that is gated by tenant and site permissions.",
        "Tests for cross-tenant denial, publish failure, rollback, and audit evidence.",
      ]}
      note="Builder-site management is Phase 9 work. It must be contract-backed before production admins can mutate routing or public content."
    />
  );
}
