"use client";

import { UnavailableRouteState } from "@/components/super-admin/ui/UnavailableRouteState";

export default function RateLimitsPage() {
  return (
    <UnavailableRouteState
      title="Rate Limit Policies"
      description="Inspect and manage API throttling, WAF lockouts, route limits, and usage-policy changes."
      breadcrumb={["Console", "Developer", "Rate Limits"]}
      removed={[
        "Hard-coded rate-limit rules and blocked-request counts.",
        "Fake refresh flow that used a timer and success toast.",
        "Modify controls that did not call a persisted policy, authorization, or audit contract.",
      ]}
      required={[
        "Rate-limit policy API with route scope, tenant scope, method, thresholds, lifecycle, and versioning.",
        "Usage and blocked-request metrics from authoritative counters or logs, not local arrays.",
        "Permission, reason capture, audit events, rollback, and cache invalidation for policy changes.",
        "Tests for policy creation/update, denied mutation, cache behavior, and degraded metrics.",
      ]}
      note="Redis or edge counters may support enforcement, but PostgreSQL/audit records must remain the source of truth for policy changes."
    />
  );
}
