"use client";

import { UnavailableRouteState } from "@/components/super-admin/ui/UnavailableRouteState";

export default function PlatformTemplatesPage() {
  return (
    <UnavailableRouteState
      title="Platform Templates"
      description="Administer reusable event, website, email, badge, certificate, and portal templates."
      breadcrumb={["Super Admin", "Platform", "Templates"]}
      removed={[
        "Static template catalogue and install counters.",
        "Draft creation modal with fake success toast and no persisted template record.",
        "Preview/edit/install controls without authorization, versioning, dependency, or audit behavior.",
      ]}
      required={[
        "Template catalogue API with template type, version, owner, compatibility, lifecycle, and dependencies.",
        "Create/edit/archive/install workflows with reason capture and audit evidence.",
        "Preview/render contract that cannot expose tenant data across organizations.",
        "Backend authorization tests and Playwright journeys for create, preview, install, and denied access.",
      ]}
      note="This route remains in navigation as a truthful placeholder until the Phase 9 template management contract is implemented."
    />
  );
}
