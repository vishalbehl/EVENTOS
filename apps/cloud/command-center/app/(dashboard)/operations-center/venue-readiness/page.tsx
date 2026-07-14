"use client";

import { UnavailableRouteState } from "@/components/super-admin/ui/UnavailableRouteState";

export default function VenueReadinessPage() {
  return <UnavailableRouteState title="Venue Readiness" description="Track supplier attestations, scoped machine identities, synchronization health, presentation readiness, and incident ownership per event." breadcrumb={["Console", "Operations", "Venue Readiness"]} removed={["Hard-coded networking, power, A/V, and signage health scores.", "A browser-only diagnostic that marked failed checks as healthy.", "Readiness and SLA assertions without supplier attestations or machine telemetry."]} required={["An event-to-supplier assignment with contract, responsible contacts, sites, and operational scope.", "Expiring and revocable machine identities with event/site/device permissions and rotation metadata.", "Persisted readiness attestations, file/sync state, diagnostic evidence, and incident ownership.", "Venue-to-cloud authorization and tenant-isolation tests covering different suppliers across events."]} note="Hardware remains owned and operated by outsourced venue suppliers. EventX records accountability and scoped cloud access; suppliers never receive direct database access or organization-wide operational visibility." />;
}
