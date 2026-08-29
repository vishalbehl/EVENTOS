"use client";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Save } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { apiClient, apiGet } from "@/lib/api-client";
import { Panel } from "../OrganiserPrimitives";
import { BillingPage } from "./shared";
const initialTax = { billing_name: "", billing_email: "", billing_phone: "", gst_number: "", country: "IN", currency: "INR" };
export function BillingTaxTab() {
  const client = useQueryClient(); const query = useQuery({ queryKey: ["organiser", "billing", "tax"], queryFn: () => apiGet<any>("/organiser/billing/tax") });
  const [tax, setTax] = useState(initialTax); const [error, setError] = useState<string | null>(null);
  useEffect(() => { if (!query.data) return; setTax({ billing_name: query.data.billing_name || "", billing_email: query.data.billing_email || "", billing_phone: query.data.billing_phone || "", gst_number: query.data.gst_number || "", country: query.data.country || "IN", currency: query.data.currency || "INR" }); }, [query.data]);
  const save = useMutation({ mutationFn: () => apiClient.put("/organiser/billing/tax", { ...tax, billing_phone: tax.billing_phone || null, gst_number: tax.gst_number || null }, { headers: { "If-Match": String(query.data?.version || 0) } }), onSuccess: async () => { setError(null); await client.invalidateQueries({ queryKey: ["organiser", "billing", "tax"] }); toast.success("Billing profile saved."); }, onError: (reason: any) => { const message = reason?.message || "The billing profile could not be saved."; setError(message); toast.error(message); } });
  return <BillingPage><Panel title="Tax profile" action={<Button onClick={() => save.mutate()} disabled={save.isPending || query.isError}><Save className="mr-2 h-4 w-4" />{save.isPending ? "Saving..." : "Save changes"}</Button>}><div className="op-form-grid"><label>Billing name<Input value={tax.billing_name} onChange={(event) => setTax({ ...tax, billing_name: event.target.value })} /></label><label>Billing email<Input type="email" value={tax.billing_email} onChange={(event) => setTax({ ...tax, billing_email: event.target.value })} /></label><label>Billing phone<Input value={tax.billing_phone} onChange={(event) => setTax({ ...tax, billing_phone: event.target.value })} /></label><label>GST number<Input value={tax.gst_number} onChange={(event) => setTax({ ...tax, gst_number: event.target.value })} /></label><label>Country<Input maxLength={2} value={tax.country} onChange={(event) => setTax({ ...tax, country: event.target.value.toUpperCase() })} /></label><label>Currency<Input maxLength={10} value={tax.currency} onChange={(event) => setTax({ ...tax, currency: event.target.value.toUpperCase() })} /></label></div>{error ? <p role="alert" className="mt-4 text-sm text-[var(--op-danger)]">{error}</p> : null}{query.isError ? <p className="op-state-copy">Tax profile is unavailable.</p> : null}</Panel></BillingPage>;
}
