"use client";

import { UnavailableRouteState } from "@/components/super-admin/ui/UnavailableRouteState";

export default function BuilderSiteBlogPage() {
  return (
    <UnavailableRouteState
      title="Site Blog"
      description="Author, schedule, publish, archive, and audit site blog content."
      breadcrumb={["Super Admin", "Builder", "Sites", "Blog"]}
      removed={[
        "Local blog create/update/delete behavior.",
        "Fake post success messages and editor-only content state.",
        "Blog workflow without author attribution, moderation, publish state, rollback, or audit.",
      ]}
      required={[
        "Blog post API with draft, scheduled, published, archived, and deleted lifecycle states.",
        "Author attribution, permission checks, content classification, audit events, and rollback.",
        "Preview/publish workflow with tenant-safe public rendering and failure handling.",
      ]}
    />
  );
}
