"use client";

import { UnavailableRouteState } from "@/components/super-admin/ui/UnavailableRouteState";

export default function FeatureFlagsPage() {
  return (
    <UnavailableRouteState
      title="Application Release Flags"
      description="Control application rollouts and operational safeguards independently from tenant licensing."
      breadcrumb={["Applications", "Release Flags"]}
      removed={[
        "Tenant entitlement overrides presented as generic application feature flags.",
        "One-click commercial entitlement changes without required reason capture.",
        "A control surface that mixed release flags, operational kill switches, and subscription access.",
      ]}
      required={[
        "Separate persisted registries for release flags, experiments, and operational kill switches.",
        "Environment, application, rollout percentage, tenant targeting, expiry, owner, and rollback metadata.",
        "Privileged authorization, required reason, step-up where policy requires it, and immutable audit history.",
        "Tenant entitlements must continue through activation snapshots and their dedicated billing administration surface.",
      ]}
      note="Release controls decide how software is deployed. Entitlements decide what a licensed tenant may use. They must never share mutation semantics."
    />
  );
}
