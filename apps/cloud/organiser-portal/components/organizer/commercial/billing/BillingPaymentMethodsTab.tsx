"use client";

import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter, useSearchParams } from "next/navigation";
import { CreditCard, ExternalLink, Plus, ShieldCheck, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { apiClient, apiGet } from "@/lib/api-client";
import { DataTable, Panel, StatusBadge } from "../../workspace/OrganiserPrimitives";
import { asList, CommercialPage, useBillingQueryScope } from "./shared";

type PaymentMethod = { id: string; provider: string; card_brand?: string | null; card_last4?: string | null; expires_month?: number | null; expires_year?: number | null; is_default: boolean; version: number; created_at: string };
type SetupResponse = { provider: string; mode: "redirect"; url: string; setup_id: string; expires_at: string };
type SetupStatus = { id: string; status: "PENDING" | "COMPLETED" | "EXPIRED" | "FAILED"; expires_at: string; completed_at?: string | null };

export function BillingPaymentMethodsTab() {
  const client = useQueryClient();
  const scope = useBillingQueryScope();
  const router = useRouter();
  const params = useSearchParams();
  const callbackStatus = params.get("payment_method");
  const setupStorageKey = `eventos.payment-method-setup:${scope.join(":")}`;
  const setupKey = useRef(crypto.randomUUID());
  const defaultKeys = useRef(new Map<string, string>());
  const removeKey = useRef(crypto.randomUUID());
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [setupOpen, setSetupOpen] = useState(false);
  const [provider, setProvider] = useState<"STRIPE" | "RAZORPAY">("STRIPE");
  const [callbackSetupId, setCallbackSetupId] = useState<string | null>(null);
  const [removing, setRemoving] = useState<PaymentMethod | null>(null);
  const [reason, setReason] = useState("");
  const query = useQuery({
    queryKey: ["organiser", "billing", ...scope, "payment-methods", page, pageSize],
    queryFn: () => apiGet<any>(`/organiser/billing/payment-methods?page=${page}&page_size=${pageSize}`),
  });
  const setupStatus = useQuery({
    queryKey: ["organiser", "billing", ...scope, "payment-method-setup", callbackSetupId],
    queryFn: ({ signal }) => apiGet<SetupStatus>(`/organiser/billing/payment-method-setups/${callbackSetupId}`, { signal }),
    enabled: callbackStatus === "complete" && Boolean(callbackSetupId),
    retry: false,
    refetchInterval: (state) => state.state.data?.status === "PENDING" ? 3000 : false,
  });

  useEffect(() => {
    if (callbackStatus === "complete") {
      const storedSetupId = window.sessionStorage.getItem(setupStorageKey);
      if (storedSetupId) {
        setCallbackSetupId(storedSetupId);
        toast.info("Your provider confirmed the setup. Waiting for the signed webhook to finish securely.");
      } else {
        toast.error("This provider return cannot be matched to a secure setup session.");
        router.replace("/commercial/payment-methods");
      }
    }
    if (callbackStatus === "cancelled") {
      window.sessionStorage.removeItem(setupStorageKey);
      toast.info("Payment-method setup was cancelled. No card details were stored.");
      router.replace("/commercial/payment-methods");
    }
  }, [callbackStatus, router, setupStorageKey]);

  useEffect(() => {
    const state = setupStatus.data?.status;
    if (state === "COMPLETED") {
      window.sessionStorage.removeItem(setupStorageKey);
      void client.invalidateQueries({ queryKey: ["organiser", "billing"] });
      toast.success("Payment method added securely.");
      router.replace("/commercial/payment-methods");
    } else if (state === "EXPIRED" || state === "FAILED") {
      window.sessionStorage.removeItem(setupStorageKey);
      toast.error("The provider setup did not complete. Start a new secure session to try again.");
      router.replace("/commercial/payment-methods");
    } else if (setupStatus.isError) {
      window.sessionStorage.removeItem(setupStorageKey);
      toast.error("The secure setup status is unavailable. Refresh payment methods before trying again.");
      router.replace("/commercial/payment-methods");
    }
  }, [client, router, setupStatus.data?.status, setupStatus.isError, setupStorageKey]);

  const setup = useMutation({
    mutationFn: () => apiClient.post<SetupResponse>("/organiser/billing/payment-methods/setup-session", {
      provider,
      return_url: `${window.location.origin}/commercial/payment-methods`,
    }, { headers: { "Idempotency-Key": setupKey.current } }),
    onSuccess: (result) => {
      setupKey.current = crypto.randomUUID();
      window.sessionStorage.setItem(setupStorageKey, result.setup_id);
      window.location.assign(result.url);
    },
    onError: (error: any) => toast.error(error?.code === "STEP_UP_REQUIRED" ? "Recent MFA verification is required before changing payment methods." : error?.message || "A hosted setup session could not be created."),
  });

  const setDefault = useMutation({
    mutationFn: (method: PaymentMethod) => apiClient.patch(`/organiser/billing/payment-methods/${method.id}/default`, {}, { headers: {
      "If-Match": String(method.version), "Idempotency-Key": defaultKeys.current.get(method.id) || (() => { const key = crypto.randomUUID(); defaultKeys.current.set(method.id, key); return key; })(),
    } }),
    onSuccess: async (_, method) => { defaultKeys.current.delete(method.id); await client.invalidateQueries({ queryKey: ["organiser", "billing"] }); toast.success("Default payment method updated."); },
    onError: (error: any) => toast.error(error?.status === 412 ? "This method changed elsewhere. Refresh and try again." : error?.message || "Default method could not be updated."),
  });

  const remove = useMutation({
    mutationFn: ({ method, auditReason, retryKey }: { method: PaymentMethod; auditReason: string; retryKey: string }) => apiClient.delete(`/organiser/billing/payment-methods/${method.id}`, { data: { reason: auditReason }, headers: {
      "If-Match": String(method.version), "Idempotency-Key": retryKey,
    } }),
    onSuccess: async () => { setRemoving(null); setReason(""); await client.invalidateQueries({ queryKey: ["organiser", "billing"] }); toast.success("Payment method removed from billing use."); },
    onError: (error: any) => toast.error(error?.status === 412 ? "This method changed elsewhere. Refresh and try again." : error?.message || "Payment method could not be removed."),
  });

  const methods = asList(query.data) as PaymentMethod[];
  return <CommercialPage actions={<Button onClick={() => setSetupOpen(true)}><Plus className="mr-2 size-4" />Add payment method</Button>}>
    <div className="grid gap-4 xl:grid-cols-[1fr_280px]">
      <Panel title="Payment methods" description="Card entry happens only on the configured payment provider." className="p-0">
        <DataTable total={query.data?.total || 0} page={page} pageSize={pageSize} onPageChange={setPage} onPageSizeChange={setPageSize} columns={["Provider", "Method", "Expiry", "Status", "Actions"]} rows={methods.map((row) => [
          <span key="provider" className="inline-flex items-center gap-2 font-bold"><CreditCard className="size-4 text-[var(--org-purple)]" />{row.provider}</span>,
          row.card_last4 ? `${row.card_brand || "Card"} ending ${row.card_last4}` : "Stored provider method",
          row.expires_month && row.expires_year ? `${String(row.expires_month).padStart(2, "0")}/${String(row.expires_year).slice(-2)}` : "Unavailable",
          row.is_default ? <StatusBadge key="status" status="Default" /> : <StatusBadge key="status" status="Active" />,
          <div key="actions" className="flex items-center gap-2">{!row.is_default ? <Button size="sm" variant="outline" disabled={setDefault.isPending} onClick={() => setDefault.mutate(row)}>Make default</Button> : null}<Button size="icon" variant="outline" aria-label={`Remove ${row.card_brand || "card"} ending ${row.card_last4 || "unknown"}`} onClick={() => { setRemoving(row); setReason(""); removeKey.current = crypto.randomUUID(); }}><Trash2 className="size-3.5" /></Button></div>,
        ])} empty={query.isError ? "Payment methods are unavailable." : query.isLoading ? "Loading payment methods…" : "No payment methods have been added."} />
      </Panel>
      <Panel title="Secure provider flow"><div className="space-y-4 text-sm text-[var(--op-muted)]"><div className="flex items-start gap-3"><ShieldCheck className="mt-0.5 size-5 shrink-0 text-emerald-600" /><p>EventOS stores only the provider reference, brand, last four digits and expiry. PAN and CVC never enter this application.</p></div><div className="flex items-start gap-3"><ExternalLink className="mt-0.5 size-5 shrink-0 text-[var(--org-purple)]" /><p>Setup completes only after a signed provider webhook. Returning to this page alone cannot create a saved method.</p></div></div></Panel>
    </div>

    <Dialog open={setupOpen} onOpenChange={setSetupOpen}><DialogContent><DialogHeader><DialogTitle>Add a payment method</DialogTitle><DialogDescription>You will continue to a provider-hosted secure setup experience.</DialogDescription></DialogHeader><label className="text-sm font-bold">Provider<select className="input mt-2 h-10 w-full rounded-xl px-3" value={provider} onChange={(event) => setProvider(event.target.value as "STRIPE" | "RAZORPAY")}><option value="STRIPE">Stripe</option><option value="RAZORPAY">Razorpay</option></select></label>{provider === "RAZORPAY" ? <p className="rounded-xl bg-amber-50 p-3 text-xs text-amber-800 dark:bg-amber-950/30 dark:text-amber-200">Razorpay saved-card tokenisation must be enabled for the platform account. The API will fail safely if it is not configured.</p> : null}<DialogFooter><Button variant="outline" onClick={() => setSetupOpen(false)}>Cancel</Button><Button disabled={setup.isPending} onClick={() => setup.mutate()}>{setup.isPending ? "Creating secure session…" : "Continue to provider"}</Button></DialogFooter></DialogContent></Dialog>

    <Dialog open={Boolean(removing)} onOpenChange={(open) => { if (!open) setRemoving(null); }}><DialogContent><DialogHeader><DialogTitle>Remove payment method?</DialogTitle><DialogDescription>An auto-renewing contract must retain another valid method. Historical invoices keep their original provider references.</DialogDescription></DialogHeader><label className="text-sm font-bold">Audit reason<textarea className="op-textarea mt-2 min-h-24" value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Explain why this payment method is being removed" /></label><DialogFooter><Button variant="outline" onClick={() => setRemoving(null)}>Cancel</Button><Button variant="destructive" disabled={!removing || reason.trim().length < 12 || remove.isPending} onClick={() => removing && remove.mutate({ method: removing, auditReason: reason.trim(), retryKey: removeKey.current })}>{remove.isPending ? "Removing…" : "Remove method"}</Button></DialogFooter></DialogContent></Dialog>
  </CommercialPage>;
}
