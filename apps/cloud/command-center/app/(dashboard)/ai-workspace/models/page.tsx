"use client";

import { UnavailableRouteState } from "@/components/super-admin/ui/UnavailableRouteState";

export default function ModelsPage() {
  return (
    <UnavailableRouteState
      title="AI Model Registry"
      description="Govern approved providers, model versions, routing policy, pricing, safety controls, and health."
      breadcrumb={["AI Workspace", "Models"]}
      removed={[
        "A hard-coded provider and model catalogue presented as active configuration.",
        "Browser-only routing strategy, fallback model, and auto-routing controls.",
        "Static exchange-rate conversion and active/healthy labels without provider evidence.",
        "Configure controls that did not persist or audit any change.",
      ]}
      required={[
        "Persisted provider/model versions, capabilities, residency, pricing versions, and lifecycle state.",
        "Secret-manager-backed credentials with rotation, expiry, revocation, and connectivity verification.",
        "Versioned routing and fallback policy with approval, rollback, kill switches, and audit history.",
        "Observed latency, failures, usage, budget impact, safety policy, and provider degradation behavior.",
      ]}
      note="Model availability and cost cannot be inferred from a static catalogue. Every enabled route must reference an approved provider configuration and policy version."
    />
  );
}
