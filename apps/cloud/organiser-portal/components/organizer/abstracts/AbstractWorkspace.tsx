"use client";

import { AbstractView } from "./AbstractShell";
import { AbstractDashboardView } from "./AbstractDashboardView";
import { AbstractSetupView } from "./AbstractSetupView";
import { AbstractSubmissionsView } from "./AbstractSubmissionsView";
import { AbstractReviewersView } from "./AbstractReviewersView";
import { AbstractEvaluationView } from "./AbstractEvaluationView";
import { AbstractRubricView } from "./AbstractRubricView";
import { AbstractExportsView } from "./AbstractExportsView";
import { AbstractPortalSettingsView } from "./AbstractPortalSettingsView";

export function AbstractWorkspace({ view }: { view: AbstractView }) {
  switch (view) {
    case "dashboard":
      return <AbstractDashboardView />;
    case "setup":
      return <AbstractSetupView />;
    case "reviewers":
      return <AbstractReviewersView />;
    case "evaluation":
    case "rubric":
      return <AbstractEvaluationView />;
    case "portal-settings":
      return <AbstractPortalSettingsView />;
    case "decisions":
      return <AbstractSubmissionsView mode="decisions" />;
    case "accepted":
      return <AbstractSubmissionsView mode="accepted" />;
    case "exports":
      return <AbstractExportsView />;
    case "submissions":
    default:
      return <AbstractSubmissionsView mode="submissions" />;
  }
}

export default AbstractWorkspace;

// Re-export all view components and shell primitives for convenience
export * from "./AbstractShell";
export * from "./AbstractDashboardView";
export * from "./AbstractSubmissionsView";
export * from "./AbstractReviewersView";
export * from "./AbstractSetupView";
export * from "./AbstractEvaluationView";
export * from "./AbstractRubricView";
export * from "./AbstractExportsView";
