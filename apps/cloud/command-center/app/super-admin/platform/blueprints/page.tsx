"use client";

import { UnavailableRouteState } from "@/components/super-admin/ui/UnavailableRouteState";

export default function PlatformBlueprintsPage() {
  return (
    <UnavailableRouteState
      title="Platform Blueprints"
      description="Install governed event, tenant, portal, and workflow blueprints with rollback and evidence."
      breadcrumb={["Super Admin", "Platform", "Blueprints"]}
      removed={[
        "Static blueprint catalogue and fake install counters.",
        "Tenant install form that only displayed a success toast.",
        "Blueprint install flow with no job, tenant scoping, rollback, dependency validation, or audit event.",
      ]}
      required={[
        "Blueprint registry API with version, compatibility, dependencies, owner, and lifecycle.",
        "Durable installation job with idempotency, target-tenant authorization, rollback, and progress tracking.",
        "Audit and evidence records for install, failure, retry, rollback, and override.",
        "Cross-tenant tests proving a blueprint cannot mutate the wrong organization.",
      ]}
      note="Blueprint installation is high-risk platform automation and must wait for a durable job contract."
    />
  );
}
