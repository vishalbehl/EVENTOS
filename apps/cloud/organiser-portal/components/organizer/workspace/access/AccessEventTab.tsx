"use client";
import { AccessAssignments } from "./AccessAssignments";
import { useLimitAccess } from "@/lib/capabilities";

export function AccessEventTab() {
  const access = useLimitAccess("max_event_team_members");
  return <AccessAssignments scope="EVENT" />;
}
