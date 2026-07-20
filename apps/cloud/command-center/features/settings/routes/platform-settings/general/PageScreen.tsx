"use client";

import { UnavailableRouteState } from "@/components/super-admin/ui/UnavailableRouteState";

export default function GeneralPlatformSettingsPage() {
  return <UnavailableRouteState title="General Platform Settings" description="Manage versioned regional, currency, maintenance, broadcast, support, and provider configuration." breadcrumb={["Console", "Settings", "General"]} removed={["A mixed general/SMTP form that exposed stored secret values through the read API.", "Maintenance and broadcast toggles that were persisted but not enforced by runtime request paths.", "Global mutations without reason capture, versioning, preview, rollback, or audit evidence."]} required={["A versioned platform-configuration service with environment restrictions, validation, preview, and rollback.", "Runtime consumers and tests proving maintenance, broadcast, timezone, and currency policies are enforced.", "A write-only secret-manager integration for SMTP and provider credentials; secrets must never be returned.", "Step-up policy where required, reason capture, optimistic concurrency, cache invalidation, and immutable audit."]} note="The underlying read API is now Super Admin-only and sanitized. Secret updates are blocked until a dedicated secret-management workflow exists." />;
}
