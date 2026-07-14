"use client";

import { UnavailableRouteState } from "@/components/super-admin/ui/UnavailableRouteState";

export default function OperationsDeploymentsPage() {
  return (
    <UnavailableRouteState
      title="Deployment Runbooks"
      description="Manage event-scoped deployment checklists, approvals, execution jobs, evidence, logs, and rollback procedures."
      breadcrumb={["Console", "Operations", "Deployments"]}
      removed={[
        "A hard-coded runbook, environment, region, commands, and security status.",
        "Timed browser execution that generated successful terminal output without running a job.",
        "Pause, resume, reset, and clear controls that changed only local state.",
      ]}
      required={[
        "Tenant- and event-scoped deployment, checklist, execution, approval, and evidence records.",
        "Durable jobs with idempotency, progress, cancellation policy, failure details, and rollback state.",
        "Step-up authentication, command allowlisting, supplier/device scope, reason capture, and immutable audit.",
        "Tests for unauthorized command execution, redelivery, timeout, partial failure, cancellation, and rollback.",
      ]}
      note="Event-scoped deployment models exist, but their current endpoints do not yet prove project ownership or provide a safe platform-admin execution contract. No shell or venue command is executed from this page."
    />
  );
}
