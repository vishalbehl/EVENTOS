"use client";

import { UnavailableRouteState } from "@/components/super-admin/ui/UnavailableRouteState";

export default function KnowledgeBasePage() {
  return (
    <UnavailableRouteState
      title="Knowledge Base"
      description="Versioned support guidance and controlled publishing."
      breadcrumb={["Console", "Support", "Knowledge Base"]}
      removed={[
        "Static SLA charts, fabricated agent performance, and invented compliance percentages.",
        "Local refresh actions that reported success without reading authoritative support data.",
        "AI recommendations without a governed model run, source evidence, or approval record.",
      ]}
      required={[
        "Tenant-aware article, category, revision, draft, review, and publication records.",
        "Search, permissions, audit history, optimistic versions, and archival behavior.",
        "Authoring, approval, publication, rollback, and accessibility journey tests.",
      ]}
      note="Support ticket SLA state remains available through the real ticket contracts. This page will be enabled only when the knowledge-article source of truth is implemented."
    />
  );
}
