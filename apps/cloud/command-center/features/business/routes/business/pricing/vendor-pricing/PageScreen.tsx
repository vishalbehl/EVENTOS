"use client";

import { UnavailableRouteState } from "@/components/super-admin/ui/UnavailableRouteState";

export default function VendorPricingPage() {
  return (
    <UnavailableRouteState
      title="Vendor Pricing & Rates"
      description="Manage B2B supplier rates, outsourcing margins, negotiated catalog prices, and procurement contracts."
      breadcrumb={["Console", "Pricing", "Vendor Pricing"]}
      removed={[
        "Static vendor markup sheets and simulated margin adjustments.",
        "Local-only vendor listings with fabricated contact details and credit ratings.",
      ]}
      required={[
        "Authoritative procurement API (procurement_router) exposing vendor registry, service quotes, and contract limits.",
        "Tenant-isolated and event-scoped rates to prevent vendor A from seeing vendor B quotes.",
        "Immutable audit event recording, approval flows, and reason capture for rate overrides.",
        "Unit and E2E tests validating security-assurance boundaries for external suppliers.",
      ]}
      note="The database tables for Vendor, VendorService, and procurement_router exist, but are not yet wired to the frontend. This console will be unlocked once client API contracts are defined in super-admin-service.ts."
    />
  );
}
