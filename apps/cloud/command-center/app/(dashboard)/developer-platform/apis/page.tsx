"use client";

import { UnavailableRouteState } from "@/components/super-admin/ui/UnavailableRouteState";

export default function ApiAnalyticsPage() {
  return (
    <UnavailableRouteState
      title="API Analytics"
      description="Monitor API traffic, latency, failure rates, API-key usage, and controlled revocation."
      breadcrumb={["Console", "Developer", "API Analytics"]}
      removed={[
        "Fallback mock API keys after backend failure.",
        "Static latency/status-code charts presented as real telemetry.",
        "Simulated API-key revocation on network or API failure.",
      ]}
      required={[
        "API telemetry endpoint with request IDs, tenant-safe aggregation, retention, and redaction controls.",
        "API-key lifecycle API with scope, expiry, rotation, revocation, last-use, and audit evidence.",
        "Provider/dependency degradation behavior that never grants access or hides failed revocation.",
        "Tests for key revocation, permission denial, telemetry privacy, and no-mock fallback on API failure.",
      ]}
      note="This page is security-sensitive: if revocation fails, the UI must show failure, not locally flip an active key to revoked."
    />
  );
}
