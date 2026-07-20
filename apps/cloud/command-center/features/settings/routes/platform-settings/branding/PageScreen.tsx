"use client";

import { UnavailableRouteState } from "@/components/super-admin/ui/UnavailableRouteState";

export default function PlatformBrandingPage() {
  return <UnavailableRouteState title="Platform Branding" description="Manage versioned global brand assets, design assignments, previews, publication, and rollback." breadcrumb={["Console", "Settings", "Branding"]} removed={["A copied general/SMTP settings page presented under the branding route.", "Timezone, maintenance, currency, SMTP, and Slack controls unrelated to platform branding.", "Secret fields and save behavior that did not belong to this domain."]} required={["A platform-branding schema for logos, marks, colors, typography, email identity, and approved assets.", "Private upload, malware scanning, preview, publish, rollback, cache invalidation, and compatibility workflows.", "Environment restrictions, permissions, reason capture, optimistic concurrency, and immutable audit.", "Tests proving platform branding cannot overwrite event or tenant-owned branding unexpectedly."]} />;
}
