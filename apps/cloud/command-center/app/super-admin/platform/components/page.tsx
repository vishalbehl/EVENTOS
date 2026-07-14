"use client";

import { UnavailableRouteState } from "@/components/super-admin/ui/UnavailableRouteState";

export default function PlatformComponentsPage() {
  return (
    <UnavailableRouteState
      title="Platform Components"
      description="Manage reusable builder component schemas, compatibility, versions, previews, and release lifecycle."
      breadcrumb={["Super Admin", "Platform", "Components"]}
      removed={[
        "A hard-coded component catalogue presented as persisted platform inventory.",
        "Local selection and editing controls backed only by browser state.",
        "A schema-update action that displayed success without saving or validating a schema.",
      ]}
      required={[
        "A persisted component registry with validated schemas, versions, ownership, and compatibility metadata.",
        "Draft, preview, publish, deprecate, and rollback operations with optimistic concurrency.",
        "Permission checks, reason capture, dependency checks, and immutable audit records.",
        "Tests for schema validation, incompatible changes, denied publication, rollback, and active-site dependencies.",
      ]}
      note="Component definitions can affect every generated site. This route stays disabled until schema changes are validated, versioned, and safely reversible."
    />
  );
}
