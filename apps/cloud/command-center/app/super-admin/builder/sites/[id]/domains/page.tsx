"use client";

import { UnavailableRouteState } from "@/components/super-admin/ui/UnavailableRouteState";

export default function BuilderSiteDomainsPage() {
  return (
    <UnavailableRouteState
      title="Site Domains"
      description="Register, verify, rotate, and remove custom domains for builder sites."
      breadcrumb={["Super Admin", "Builder", "Sites", "Domains"]}
      removed={[
        "Local domain registration and deletion state.",
        "Simulated DNS polling and certificate provisioning success.",
        "Domain controls with no ownership, DNS evidence, certificate, rollback, or audit contract.",
      ]}
      required={[
        "Domain registry API with tenant/site ownership, DNS challenge state, certificate state, and audit events.",
        "Asynchronous verification job with replay protection, timeout handling, and provider reconciliation.",
        "Authorization and step-up policy for adding or removing public domains.",
      ]}
    />
  );
}
