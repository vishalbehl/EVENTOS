"use client";

import { UnavailableRouteState } from "@/components/super-admin/ui/UnavailableRouteState";

export default function RequirementsReviewPage() {
  return (
    <UnavailableRouteState
      title="Service Request Requirements"
      description="Review event-scoped specifications, remarks, evidence, and attachments."
      breadcrumb={["Business", "Sales", "Service Requests", "Requirements"]}
      removed={[
        "Simulated attachment creation using a typed filename and random file size.",
        "Download controls without an authorization-gated storage contract.",
        "Browser-generated CSV export without a governed export record or audit trail.",
        "Frontend calls to requirements, remarks, and attachment endpoints that do not exist in the current backend.",
      ]}
      required={[
        "A tenant-safe Super Admin aggregate or an explicitly event-scoped delegated-access contract.",
        "Persisted requirement revisions, remarks, ownership, permissions, and immutable audit events.",
        "Private object-storage upload, quarantine, malware scanning, readiness state, and authorized download.",
        "Durable export jobs with classified output, expiry, access checks, and export audit records.",
      ]}
      note="The existing organizer API remains event-scoped and supports only service-request create, list, detail, submit, and approve. It is not reused as an unsafe global Command Center contract."
    />
  );
}
