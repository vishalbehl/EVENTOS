"use client";

import { LayoutTemplate } from "lucide-react";
import {
  EnterpriseEmptyState,
  EnterprisePageIntro,
  EnterprisePanel,
} from "@/components/organizer/platform/EnterprisePortal";

export default function TemplatesPage() {
  return (
    <div className="space-y-6 pb-8">
      <EnterprisePageIntro
        title="Templates"
        subtitle="Store reusable assets, layouts, and launch-ready operating templates for your organizer team."
      />
      <EnterprisePanel className="border-dashed border-slate-200">
        <EnterpriseEmptyState
          icon={LayoutTemplate}
          title="Templates are coming here"
          description="This workspace can host reusable registration, communication, and event setup templates next."
          actionLabel="Browse Help"
          actionHref="/help-support"
        />
      </EnterprisePanel>
    </div>
  );
}
