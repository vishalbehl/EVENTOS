"use client";

import { UnavailableRouteState } from "@/components/super-admin/ui/UnavailableRouteState";

export default function AIAutomationPage() {
  return (
    <UnavailableRouteState
      title="AI Automation"
      description="Create policy-governed AI automations with durable executions and human approval boundaries."
      breadcrumb={["AI Workspace", "Automation"]}
      removed={[
        "A static usage-limits placeholder without persistence or runtime enforcement.",
        "Copy suggesting tenant token quotas and credit rules could be configured when no contract existed.",
      ]}
      required={[
        "Versioned automation rules, triggers, actions, scopes, owners, approvals, and lifecycle state.",
        "Durable runs with idempotency, retry, cancellation, failure reason, and reconciliation.",
        "Tenant/event limits enforced by authoritative usage and entitlement services.",
        "Explicit policy preventing autonomous privileged mutations without approved human or system authority.",
      ]}
      note="AI automation is a durable workflow capability, not a browser settings form. Limits must be enforced server-side and every privileged action must be attributable."
    />
  );
}
