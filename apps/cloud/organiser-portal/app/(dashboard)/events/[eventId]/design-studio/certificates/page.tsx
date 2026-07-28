"use client";

import TemplateDesigner from "../../registration/template-designer/page";
import { useOperationAccess } from "@/lib/capabilities";

export default function CertificateDesignerPage() {
  const readAccess = useOperationAccess("certificates.templates.read");
  if (readAccess.loading) {
    return <div className="flex min-h-[320px] items-center justify-center text-sm text-muted">Checking certificate access...</div>;
  }
  if (!readAccess.enabled) {
    return (
      <div className="flex min-h-[320px] items-center justify-center rounded-3xl border border-amber-500/20 bg-amber-500/5 p-8 text-center text-sm text-amber-100">
        Certificate templates are unavailable: {(readAccess.reason || "RESOLUTION_UNAVAILABLE").replaceAll("_", " ").toLowerCase()}.
      </div>
    );
  }
  return <TemplateDesigner />;
}
