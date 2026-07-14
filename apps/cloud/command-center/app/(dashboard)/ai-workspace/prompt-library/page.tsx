"use client";

import { UnavailableRouteState } from "@/components/super-admin/ui/UnavailableRouteState";

export default function PromptLibraryPage() {
  return (
    <UnavailableRouteState
      title="Prompt Library"
      description="Manage platform prompt templates, versions, approvals, model compatibility, and usage evidence."
      breadcrumb={["AI Workspace", "Prompt Library"]}
      removed={[
        "Local-only new-prompt form whose save button did not persist a prompt.",
        "Star/edit/delete action icons with no backend mutation, permission, or audit contract.",
        "Mock tab filtering and empty-state copy that implied prompt creation was production-ready.",
      ]}
      required={[
        "Prompt CRUD API with versioning, scope, ownership, model compatibility, and rollback.",
        "Approval workflow, audit events, usage metrics, and redaction/classification metadata.",
        "Permission model separating prompt viewing, editing, publishing, and emergency disabling.",
        "Typed DTOs, loading/empty/error/denied states, and tests for success plus authorization denial.",
      ]}
      note="Prompt management should be implemented as a governed AI workspace feature, not as local UI state."
    />
  );
}
