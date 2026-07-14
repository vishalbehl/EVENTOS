"use client";

import { UnavailableRouteState } from "@/components/super-admin/ui/UnavailableRouteState";

export default function PlatformNotificationSettingsPage() {
  return <UnavailableRouteState title="Notification Templates" description="Manage versioned transactional templates, variables, approvals, previews, test deliveries, publication, and provider compatibility." breadcrumb={["Console", "Settings", "Notifications"]} removed={["Hard-coded email templates presented as persisted platform content.", "A template save button that only displayed a success toast.", "A timed test-email action that never dispatched or created a delivery record."]} required={["A versioned template registry with channel, purpose, locale, schema, approval, and lifecycle metadata.", "Sanitized preview rendering with validated variables and injection-safe template processing.", "Durable authorization-gated test deliveries with consent-safe recipients, job state, provider result, and audit.", "Publish, rollback, dependency, provider-degradation, and accessibility tests."]} />;
}
