"use client";

import { UnavailableRouteState } from "@/components/super-admin/ui/UnavailableRouteState";

export default function CostBreakdownPage() {
  return (
    <UnavailableRouteState
      title="Quote Cost Breakdown"
      description="Inspect the persisted commercial calculation behind a quote."
      breadcrumb={["Business", "Sales", "Quotes", "Cost Breakdown"]}
      removed={[
        "Fabricated logistics charges, GST, per-line margin percentages, and grand totals.",
        "Fallback event and organization names that could misrepresent the quote owner.",
        "Fake duplicate success, non-functional PDF download, and non-functional quote dispatch controls.",
        "A frontend request to a cost-breakdown endpoint that does not exist in the backend.",
      ]}
      required={[
        "A canonical persisted cost-breakdown endpoint with typed category and line-item values.",
        "Calculation-version and pricing-rule provenance for every displayed amount.",
        "Idempotent quote duplication and dispatch operations with authorization and audit records.",
        "Authorization-gated PDF generation/download with persisted job and export evidence.",
      ]}
      note="No amount is recomputed in the browser. This route will be re-enabled only when every displayed total comes from the same persisted calculation used by quote and proposal outputs."
    />
  );
}
