"use client";

import { UnavailableRouteState } from "@/components/super-admin/ui/UnavailableRouteState";

export default function AIAgentsPage() {
  return (
    <UnavailableRouteState
      title="AI Agents"
      description="Govern platform AI agents, approval policies, execution runs, cost, redaction, and audit evidence."
      breadcrumb={["AI Workspace", "Agents"]}
      removed={[
        "Copied prompt-library screen that did not represent an agent registry.",
        "Local-only create/edit/delete/favorite controls with no durable agent contract.",
        "Agent success-rate and usage displays that were not backed by a run ledger.",
      ]}
      required={[
        "Agent registry API with versioned definitions, ownership, scopes, and lifecycle state.",
        "Run ledger, approval policy, cost tracking, redaction policy, and immutable audit events.",
        "Permission and step-up rules for creating, enabling, disabling, or approving autonomous actions.",
        "Playwright success and denial journeys plus backend authorization tests.",
      ]}
      note="This page belongs to Command Center Phase 7. It can be re-enabled only after agent execution cannot perform privileged mutation without an explicit approved policy."
    />
  );
}
