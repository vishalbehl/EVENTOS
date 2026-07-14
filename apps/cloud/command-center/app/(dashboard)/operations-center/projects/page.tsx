"use client";

import { UnavailableRouteState } from "@/components/super-admin/ui/UnavailableRouteState";

export default function OperationsProjectsPage() {
  return <UnavailableRouteState title="Operations Projects" description="Track event delivery projects, dependencies, milestones, assignments, and deployment readiness." breadcrumb={["Console", "Operations", "Projects"]} removed={["Hard-coded Gantt tasks, assignees, dates, and completion totals.", "Browser-only task status cycling and dispatch controls.", "Operational health claims that were not derived from persisted project data."]} required={["A platform-admin project aggregate with explicit organization and event scope.", "Tenant-safe project, task, dependency, milestone, and assignment APIs.", "Permission, reason, optimistic concurrency, lifecycle validation, and audit coverage.", "Tests proving projects and supplier assignments cannot cross tenant or event boundaries."]} note="Event-scoped project APIs exist, but they are not a safe global Command Center contract until ownership checks and platform-admin authorization are complete." />;
}
