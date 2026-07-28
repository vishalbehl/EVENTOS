"use client";

import { UnavailableRouteState } from "@/components/super-admin/ui/UnavailableRouteState";

export default function ApiCatalogPage() {
  return (
    <UnavailableRouteState
      title="API Catalog"
      description="Publish versioned Event API domains, authentication, scopes, pagination, errors, rate limits, idempotency, and deprecation guidance."
      breadcrumb={["Console", "Developer", "API Catalog"]}
      removed={[
        "Static API usage and latency charts that were not backed by authoritative telemetry.",
        "Invented request totals and status distributions presented as measured analytics.",
        "Analytics filters that changed only browser state.",
      ]}
      required={[
        "Versioned API-domain catalogue generated from reviewed OpenAPI contracts.",
        "Authentication, scope, pagination, RFC 9457 error, rate-limit, and idempotency guidance.",
        "Endpoint lifecycle, deprecation, changelog, examples, and webhook-event references.",
        "Contract drift checks proving published documentation matches active V1 routes.",
      ]}
      note="Developer analytics is outside the current product scope. The active portal keeps only a contract-backed API catalogue."
    />
  );
}
