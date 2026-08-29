"use client";
import { DataTable, Panel } from "../OrganiserPrimitives";
import { Unavailable } from "../OrganiserSection";
import { PlansPage, usePlanData } from "./shared";
export function PlanLimitsUsageTab() {
  const { current, plan, unrestricted } = usePlanData();
  const keys = Array.from(new Set([...Object.keys(plan.limits || {}), ...Object.keys(plan.usage || {})]));
  return <PlansPage><Panel title="Limits & usage" className="p-0">{current.isError ? <Unavailable>Limits and usage are unavailable.</Unavailable> : <DataTable columns={["Resource", "Used", "Limit", "Utilisation", "Reset", "Policy"]} rows={keys.map((key) => { const usage = plan.usage?.[key]; const limit = plan.limits?.[key]; const rawUsed = usage?.used ?? usage?.used_mb ?? (typeof usage === "number" ? usage : null); const used = rawUsed == null ? null : Number(rawUsed); const maximum = limit?.max ?? limit?.limit ?? usage?.max ?? usage?.max_mb ?? (typeof limit === "number" ? limit : null); const pct = used != null && maximum && Number(maximum) > 0 ? `${Math.round((used / Number(maximum)) * 100)}%` : unrestricted || maximum == null ? "Unlimited" : "Unavailable"; const resetAt = usage?.reset_at || limit?.reset_at; return [key.replaceAll("_", " "), used == null ? "Unavailable" : used.toLocaleString(), unrestricted || maximum == null ? "Unlimited" : Number(maximum).toLocaleString(), pct, resetAt ? new Date(resetAt).toLocaleString() : unrestricted ? "Not applicable" : "Unavailable", unrestricted ? "Internal unrestricted" : plan.source || "Plan entitlement"]; })} empty="No limit or usage measurements were returned." />}</Panel></PlansPage>;
}
