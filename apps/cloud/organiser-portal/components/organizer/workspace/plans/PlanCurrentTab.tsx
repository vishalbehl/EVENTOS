"use client";
import { Panel, StatusBadge } from "../OrganiserPrimitives";
import { CommercialRequestAction, PlansPage, usePlanData } from "./shared";
export function PlanCurrentTab() {
  const { current, plan, unrestricted } = usePlanData();
  const renewal = plan.current_period_end ? new Date(plan.current_period_end).toLocaleDateString() : null;
  return <PlansPage actions={unrestricted ? undefined : <CommercialRequestAction />}>
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(18rem,0.42fr)]">
      <Panel title="Current plan">
        <dl className="op-detail-list">
          <dt>Status</dt><dd><StatusBadge status={unrestricted ? "Internal Unlimited" : plan.status || "Unavailable"} /></dd>
          <dt>Plan</dt><dd>{unrestricted ? "Internal Unlimited" : plan.plan?.name || plan.plan_name || "Unavailable"}</dd>
          <dt>Renewal</dt><dd>{unrestricted ? "Not applicable" : renewal || "Unavailable"}</dd>
          <dt>Billing model</dt><dd>{unrestricted ? "Internal" : plan.plan?.billing_model || "Unavailable"}</dd>
          <dt>Renewal action</dt><dd>{unrestricted ? "No commercial action required" : plan.cancel_at_period_end ? "Ends at current period" : "Renews at period end"}</dd>
        </dl>
      </Panel>
      <Panel title="Evidence">
        <dl className="op-detail-list">
          <dt>Availability</dt><dd>{current.isError ? "Unavailable" : plan.availability || "Unavailable"}</dd>
          <dt>Source</dt><dd>{current.isError ? "Unavailable" : plan.source || "Unavailable"}</dd>
          <dt>Freshness</dt><dd>{plan.freshness_at ? new Date(plan.freshness_at).toLocaleString() : "Unavailable"}</dd>
        </dl>
      </Panel>
    </div>
  </PlansPage>;
}
