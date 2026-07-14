"use client";

import { UnavailableRouteState } from "@/components/super-admin/ui/UnavailableRouteState";

export default function OperationsCenterPage() {
  return (
    <UnavailableRouteState
      title="Operations Center"
      description="Provide a trustworthy aggregate of projects, suppliers, risks, venue readiness, jobs, database health, queues, storage, and search operations."
      breadcrumb={["Console", "Operations"]}
      removed={[
        "Hard-coded project, incident, SLA, staffing, uptime, and printer-allocation totals.",
        "A simulated loading delay and heartbeat control without a backend operation.",
        "Static incident records presented as current operational state.",
      ]}
      required={[
        "An aggregate API composed from authoritative project, supplier, risk, job, telemetry, and venue-readiness sources.",
        "Explicit unavailable/degraded source reporting so missing dependencies never appear healthy.",
        "Tenant and event scope for every operational record, with platform-admin authorization and audit evidence.",
        "Navigation and remediation links to the real source records behind every aggregate metric.",
      ]}
      note="The database, queue, search-job, and background-job child routes now expose real read paths. This landing aggregate remains disabled until the other operational domains have authoritative contracts."
    />
  );
}
