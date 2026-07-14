"use client";

import { UnavailableRouteState } from "@/components/super-admin/ui/UnavailableRouteState";

export default function OperationsResourcesPage() {
  return <UnavailableRouteState title="Operations Resources" description="Manage internal assignments and outsourced supplier resources without treating third-party hardware or staff as EventX-owned inventory." breadcrumb={["Console", "Operations", "Resources"]} removed={["A fabricated crew roster with personal contact, travel, hotel, and event details.", "Browser-only hotel check-in and crew-status changes.", "Static staffing totals and subcontractor readiness claims."]} required={["Event-scoped supplier, contract, contact, assignment, travel, and responsibility records.", "Clear separation between EventX internal users and outsourced supplier personnel or hardware.", "Purpose-limited personal-data access, permissions, reason capture, retention, and audit evidence.", "Tenant/event isolation tests for supplier A on Event A and supplier B on Event B."]} note="Outsourced venue companies remain recorded as accountable suppliers per event; EventX does not need to own their hardware inventory, but it must retain contracts, scoped identities, readiness attestations, synchronization access, and incident ownership." />;
}
