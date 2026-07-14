"use client";

import { UnavailableRouteState } from "@/components/super-admin/ui/UnavailableRouteState";

export default function OperationalAnalyticsPage() {
  return (
    <UnavailableRouteState
      title="Operational Analytics"
      description="Inspect authoritative cross-platform cost, reliability, workload, and supplier performance projections."
      breadcrumb={["Operations Center", "Analytics"]}
      removed={[
        "Hard-coded revenue, COGS, gross-margin, SLA, deployment, and supplier-cost charts.",
        "Static AI recommendations presented as measured operational findings.",
        "A report-export control without a durable job, classified output, or download authorization.",
      ]}
      required={[
        "Defined metric ownership, calculation windows, tenant scope, freshness, and degraded-source reporting.",
        "Authoritative financial, job, deployment, incident, communication, storage, and supplier projections.",
        "Privacy-safe telemetry with reconciliation, quality indicators, and service-specific availability behavior.",
        "Durable report jobs, access-controlled downloads, retention, and export audit evidence.",
      ]}
      note="Operational analytics must remain unavailable rather than showing illustrative values that could be mistaken for production health or financial performance."
    />
  );
}
