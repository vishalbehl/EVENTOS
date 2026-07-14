"use client";

import { UnavailableRouteState } from "@/components/super-admin/ui/UnavailableRouteState";

export default function BuilderSiteSeoPage() {
  return (
    <UnavailableRouteState
      title="Site SEO and Redirects"
      description="Configure persisted SEO metadata, sitemap behavior, canonical URLs, and redirect rules."
      breadcrumb={["Super Admin", "Builder", "Sites", "SEO"]}
      removed={[
        "Local redirect state and delete success toasts.",
        "Fake meta and sitemap save behavior.",
        "SEO controls that did not validate ownership, publish impact, or audit evidence.",
      ]}
      required={[
        "Site SEO API with optimistic versioning, validation, and tenant/site ownership checks.",
        "Redirect CRUD with conflict detection, preview, rollback, and audit records.",
        "Public-route invalidation contract and degraded-state behavior when publishing fails.",
      ]}
    />
  );
}
