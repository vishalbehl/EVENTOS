"use client";

import { UnavailableRouteState } from "@/components/super-admin/ui/UnavailableRouteState";

export default function AIDashboardPage() {
  return (
    <UnavailableRouteState
      title="AI Operations Dashboard"
      description="Monitor governed AI requests, provider health, token usage, cost, policy decisions, and failures."
      breadcrumb={["AI Workspace", "Dashboard"]}
      removed={[
        "A backend response containing authoritative-looking zero metrics without a usage ledger.",
        "A configuration link to a route that does not exist.",
        "Charts that implied request, token, cost, success-rate, and model telemetry were available.",
      ]}
      required={[
        "Durable AI run and usage ledgers with tenant, event, user, model, purpose, token, cost, and outcome scope.",
        "Provider health, pricing-version provenance, reconciliation, redaction, and degraded-state behavior.",
        "Permission-safe aggregates that prevent tenant prompts or personal data from entering platform telemetry.",
        "Retention, budget alerts, audit evidence, and cost-allocation contracts.",
      ]}
      note="An empty telemetry source is not equivalent to measured zero usage. The dashboard stays disabled until completeness and freshness can be proven."
    />
  );
}
