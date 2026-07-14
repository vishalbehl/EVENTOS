"use client";

import { UnavailableRouteState } from "@/components/super-admin/ui/UnavailableRouteState";

export default function ProviderLogsPage() {
  return (
    <UnavailableRouteState
      title="Provider and Security Logs"
      description="Inspect redacted provider logs, correlation IDs, immutable audit evidence, exports, and verification state."
      breadcrumb={["Console", "Developer", "Logs"]}
      removed={[
        "Simulated cryptographic verification and tamper detection.",
        "Local hash-copy and export controls without immutable evidence contracts.",
        "Client-side filters that implied complete server-side log search and compliance verification.",
      ]}
      required={[
        "Immutable provider/security log API with tenant-safe filters, cursor pagination, retention, and redaction.",
        "Verification endpoint backed by stored hashes or append-only evidence, not client simulation.",
        "Authorization-gated export job with watermarking, audit evidence, and download controls.",
        "Tests for tamper evidence, sensitive-data redaction, export authorization, and no cross-tenant leakage.",
      ]}
      note="Until ADR-014 audit immutability is implemented, this page must not claim cryptographic verification."
    />
  );
}
