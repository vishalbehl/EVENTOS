"use client";

import { UnavailableRouteState } from "@/components/super-admin/ui/UnavailableRouteState";

export default function PlatformLocalizationPage() {
  return <UnavailableRouteState title="Platform Localization" description="Manage supported locales, translation catalogues, fallback rules, formatting, publication, and rollback." breadcrumb={["Console", "Settings", "Localization"]} removed={["A copied general/SMTP settings page presented as localization management.", "Currency and timezone controls without locale catalogues or translation lifecycle.", "Unrelated provider secret fields and save actions."]} required={["A versioned locale and translation catalogue with fallback and completeness status.", "Date, time, number, currency, timezone, pluralization, and right-to-left formatting policy.", "Preview, publish, rollback, cache invalidation, and missing-key diagnostics.", "Permissions, reason capture, audit evidence, and accessibility review for translated critical journeys."]} />;
}
