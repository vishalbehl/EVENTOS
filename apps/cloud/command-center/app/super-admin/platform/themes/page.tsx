"use client";

import { UnavailableRouteState } from "@/components/super-admin/ui/UnavailableRouteState";

export default function PlatformThemesPage() {
  return (
    <UnavailableRouteState
      title="Platform Themes"
      description="Manage versioned design tokens, previews, publishing, rollback, and tenant-safe theme assignments."
      breadcrumb={["Super Admin", "Platform", "Themes"]}
      removed={[
        "Local-only design-token creation that disappeared after navigation or reload.",
        "A save action that claimed database persistence without calling a backend contract.",
        "Theme controls without versioning, publish state, rollback, authorization, or audit evidence.",
      ]}
      required={[
        "A tenant-scoped theme registry API with validated token schemas and lifecycle states.",
        "Versioned preview, publish, assignment, and rollback workflows with optimistic concurrency.",
        "Permission checks, reason capture, cache invalidation, and immutable audit records for global changes.",
        "Tests for denied mutation, tenant isolation, publish conflicts, rollback, and preview failure.",
      ]}
      note="A legacy theme-engine API exists, but it does not yet satisfy the Command Center contract: its read path is not a versioned platform catalogue and its apply operation does not persist a complete audited theme assignment."
    />
  );
}
