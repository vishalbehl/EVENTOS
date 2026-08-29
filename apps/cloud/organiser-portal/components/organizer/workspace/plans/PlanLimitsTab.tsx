"use client";
import { DataTable, Panel } from "../OrganiserPrimitives";
import { Unavailable } from "../OrganiserSection";
import { PlansPage, usePlanData } from "./shared";
export function PlanLimitsTab() { const { current, plan, unrestricted } = usePlanData(); return <PlansPage><Panel title="Plan limits" className="p-0">{current.isError ? <Unavailable>Plan limits are unavailable.</Unavailable> : <DataTable columns={["Resource", "Limit", "Policy"]} rows={Object.entries(plan.limits || {}).map(([key, value]: [string, any]) => [key.replaceAll("_", " "), unrestricted || value == null ? "Unlimited" : typeof value === "object" ? value.max ?? value.limit ?? "Configured" : String(value), unrestricted ? "Internal unrestricted" : "Plan entitlement"])} empty="No limit records returned." />}</Panel></PlansPage>; }
