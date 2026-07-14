"use client";

import { UnavailableRouteState } from "@/components/super-admin/ui/UnavailableRouteState";

export default function BuilderSiteEditorPage() {
  return (
    <UnavailableRouteState
      title="Site Visual Editor"
      description="Edit site pages, sections, drafts, previews, published versions, and rollback history."
      breadcrumb={["Super Admin", "Builder", "Sites", "Editor"]}
      removed={[
        "Local-only section add/remove/reorder operations.",
        "Fake draft-save, publish, and page-create success messages.",
        "Preset block mockups that were not persisted or rendered through a real page model.",
      ]}
      required={[
        "Page and section model with draft/published versions, optimistic locking, and rollback.",
        "Preview/render pipeline that is tenant-safe and cannot leak unpublished content.",
        "Publish job with audit, invalidation, failure handling, and permission checks.",
      ]}
      note="The visual editor should not publish or pretend to publish until a versioned content model exists."
    />
  );
}
