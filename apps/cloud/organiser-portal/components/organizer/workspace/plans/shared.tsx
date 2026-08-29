"use client";

import { useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CreditCard, Gauge, Package, Plus, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { orgApi } from "@/components/organizer/org/org-api";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useAddons, useAddonStatuses, useCheckout, useCurrentPlan, useFeatureMatrix, usePlans } from "@/hooks/useBilling";
import { MetricCard } from "../OrganiserPrimitives";
import { OrganiserSection } from "../OrganiserSection";

export const planTabs = [["Overview", "/plans-entitlements/overview"], ["Features", "/plans-entitlements/features"], ["Limits & Usage", "/plans-entitlements/limits-usage"], ["Add-ons", "/plans-entitlements/addons"], ["Entitlement History", "/plans-entitlements/history"]].map(([label, href]) => ({ label, href }));
export const asList = (value: any): any[] => Array.isArray(value) ? value : Array.isArray(value?.items) ? value.items : [];

export function usePlanData() {
  const current = useCurrentPlan();
  const features = useFeatureMatrix();
  const addons = useAddons();
  const addonStatuses = useAddonStatuses();
  const plan: any = current.data || {};
  const unrestricted = Boolean(
    plan.unrestricted
      || plan.is_internal_unrestricted
      || plan.status === "INTERNAL_UNLIMITED"
      || plan.source === "INTERNAL_UNRESTRICTED_ORGANIZATION",
  );
  return { current, features, addons, addonStatuses, plan, unrestricted };
}

export function PlansPage({ actions, children }: { actions?: ReactNode; children: ReactNode }) {
  const { current, features, addonStatuses, plan, unrestricted } = usePlanData();
  return <OrganiserSection title="Plans & Entitlements" description="Review plan access, features, limits, add-ons, usage, and requests." tabs={planTabs} actions={actions}>
    <div className="op-metric-grid">
      <MetricCard label="Current plan" value={unrestricted ? "Internal Unlimited" : plan.plan?.name || plan.plan_name || "Unavailable"} tone="purple" icon={<CreditCard className="h-5 w-5" />} />
      <MetricCard label="Features" value={features.isError ? "Unavailable" : asList(features.data).length} tone="green" icon={<ShieldCheck className="h-5 w-5" />} />
      <MetricCard label="Add-ons" value={addonStatuses.isError ? "Unavailable" : asList(addonStatuses.data).filter((item) => ["ACTIVE", "INCLUDED", "UNRESTRICTED"].includes(item.status)).length} tone="amber" icon={<Package className="h-5 w-5" />} />
      <MetricCard label="Limits" value={current.isError ? "Unavailable" : unrestricted ? "Unlimited" : "Plan controlled"} tone="blue" icon={<Gauge className="h-5 w-5" />} />
    </div>
    {children}
  </OrganiserSection>;
}

export function CommercialRequestAction() {
  const client = useQueryClient();
  const plans = usePlans();
  const addons = useAddons();
  const checkout = useCheckout();
  const organisation = useQuery({ queryKey: ["organisation", "me"], queryFn: orgApi.me });
  const [open, setOpen] = useState(false);
  const [request, setRequest] = useState({ plan_name: "", addon_keys: [] as string[], billing_name: "", billing_email: "", billing_phone: "", gst_number: "", reason: "" });
  const begin = () => { const org = organisation.data?.organization; const user = (organisation.data as any)?.user; setRequest((value) => ({ ...value, billing_name: value.billing_name || (org as any)?.billing_name || org?.name || user?.full_name || "", billing_email: value.billing_email || org?.billing_email || user?.email || "", billing_phone: value.billing_phone || (org as any)?.billing_phone || (org as any)?.phone || user?.phone || "" })); setOpen(true); };
  const submit = async () => { try { await checkout.mutateAsync({ ...request, gst_number: request.gst_number || null }); await client.invalidateQueries({ queryKey: ["organisation", "commercial-access-requests"] }); setOpen(false); toast.success("Commercial access request submitted."); } catch (error: any) { toast.error(error?.message || "Commercial request could not be submitted."); } };
  return <><Button onClick={begin}><Plus className="mr-2 h-4 w-4" />Request access</Button><Dialog open={open} onOpenChange={setOpen}><DialogContent className="max-w-xl"><DialogHeader><DialogTitle>Request plan or add-on access</DialogTitle><DialogDescription>This creates a governed commercial request. Access changes only after approval.</DialogDescription></DialogHeader><div className="op-form-grid"><label>Plan<select className="op-select" value={request.plan_name} onChange={(event) => setRequest({ ...request, plan_name: event.target.value })}><option value="">Select plan</option>{asList(plans.data).filter((item) => item.is_active !== false).map((item) => <option key={item.id || item.name} value={item.name}>{item.name}</option>)}</select></label><label>Billing name<Input value={request.billing_name} onChange={(event) => setRequest({ ...request, billing_name: event.target.value })} /></label><label>Billing email<Input type="email" value={request.billing_email} onChange={(event) => setRequest({ ...request, billing_email: event.target.value })} /></label><label>Billing phone<Input value={request.billing_phone} onChange={(event) => setRequest({ ...request, billing_phone: event.target.value })} /></label><label>GST number<Input value={request.gst_number} onChange={(event) => setRequest({ ...request, gst_number: event.target.value })} /></label><label>Reason<Input value={request.reason} onChange={(event) => setRequest({ ...request, reason: event.target.value })} /></label></div><fieldset><legend className="mb-2 text-sm font-medium">Optional add-ons</legend><div className="grid gap-2 sm:grid-cols-2">{asList(addons.data).filter((item) => item.is_active !== false).map((item) => { const key = item.key || item.addon_key; return <label key={item.id || key} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={request.addon_keys.includes(key)} onChange={(event) => setRequest({ ...request, addon_keys: event.target.checked ? [...request.addon_keys, key] : request.addon_keys.filter((value) => value !== key) })} />{item.name || key}</label>; })}</div></fieldset><DialogFooter><Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button><Button onClick={submit} disabled={!request.plan_name || !request.billing_name.trim() || !request.billing_email.trim() || !request.billing_phone.trim() || !request.reason.trim() || checkout.isPending}>{checkout.isPending ? "Submitting..." : "Submit request"}</Button></DialogFooter></DialogContent></Dialog></>;
}
