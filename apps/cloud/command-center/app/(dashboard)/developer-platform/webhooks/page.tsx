"use client";

import { UnavailableRouteState } from "@/components/super-admin/ui/UnavailableRouteState";

export default function WebhooksConsolePage() {
  return (
    <UnavailableRouteState
      title="Webhooks Console"
      description="Manage webhook subscriptions, signing secrets, delivery attempts, replay, dead letters, and reconciliation."
      breadcrumb={["Console", "Developer", "Webhooks"]}
      removed={[
        "Static webhook delivery rows and tenant endpoint URLs.",
        "Fake refresh and redelivery flows using timers and success toasts.",
        "Metrics derived from local arrays instead of durable delivery attempts.",
      ]}
      required={[
        "Webhook subscription API with tenant scope, event types, signing secret rotation, and lifecycle state.",
        "Delivery-attempt ledger with status, payload classification, retry, replay, DLQ, and reconciliation.",
        "Idempotent replay endpoint with authorization, reason capture, audit events, and provider failure states.",
        "Signature, replay-window, tenant-isolation, rotation, and redaction tests.",
      ]}
      note="Webhook replay mutates external systems, so it must be durable, idempotent, audited, and never simulated."
    />
  );
}
