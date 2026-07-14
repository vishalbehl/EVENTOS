"use client";

import { UnavailableRouteState } from "@/components/super-admin/ui/UnavailableRouteState";

export default function IntegrationsPage() {
  return (
    <UnavailableRouteState
      title="Integrations Manager"
      description="Configure provider credentials, health checks, synchronization, disable controls, and incident evidence."
      breadcrumb={["Console", "Developer", "Integrations"]}
      removed={[
        "Static Stripe/Postmark/R2/Firebase provider cards.",
        "Randomized latency and status updates after fake health checks.",
        "Success toasts that implied provider credentials and connectivity were verified.",
      ]}
      required={[
        "Integration catalogue API with provider type, credential state, health, tenant scope, and lifecycle.",
        "Secret-safe credential setup, rotation, expiry, revocation, and last-use visibility.",
        "Provider health checks backed by real probe records, alerts, and degradation policy.",
        "Permission, reason, audit, redaction, and failure-state tests for every provider mutation.",
      ]}
      note="Provider health must come from recorded checks or provider events, not UI timers."
    />
  );
}
