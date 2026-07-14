"use client";

import { UnavailableRouteState } from "@/components/super-admin/ui/UnavailableRouteState";

export default function ApplicationRegistryPage() {
  return (
    <UnavailableRouteState
      title="Application Registry"
      description="Track deployable cloud, venue, browser, mobile, and device applications from authoritative release evidence."
      breadcrumb={["Applications", "Registry"]}
      removed={[
        "A hard-coded application catalogue embedded in the platform router.",
        "Static versions and lifecycle states presented as current deployment data.",
        "An always-online indicator without health, environment, release, or observation evidence.",
      ]}
      required={[
        "Persisted application, version, environment, owner, release, and compatibility records.",
        "Observed health with freshness, source, degraded-state behavior, and deployment correlation.",
        "Cloud and outsourced-venue application scope without implying EventX ownership of supplier hardware.",
        "Release history, permissions, operational kill switches, mobile/device metadata, and audit evidence.",
      ]}
      note="Application availability must come from deployment and monitoring records, not a static list or an inferred online label."
    />
  );
}
