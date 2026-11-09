"use client";

import { useEffect, useState } from "react";
import { useCloudCommercialAccount, useCreateEmcWorkspace } from "@/hooks/useCloudCommercial";
import { useAuthStore } from "@/store/use-auth-store";
import type { ApiError } from "@/lib/api-client";
import { Button } from "@/components/ui/button";

function AttachmentForm() {
  const account = useCloudCommercialAccount();
  const mutation = useCreateEmcWorkspace();
  const [organizationId, setOrganizationId] = useState("");
  const [reason, setReason] = useState("");
  const [reviewRequired, setReviewRequired] = useState(false);
  const [notice, setNotice] = useState("");
  const [retryAt, setRetryAt] = useState(0);
  const [seconds, setSeconds] = useState(0);
  const failure = mutation.error as ApiError | null;
  useEffect(() => {
    if (!retryAt) return;
    const tick = () => setSeconds(Math.max(0, Math.ceil((retryAt - Date.now()) / 1000)));
    tick();
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, [retryAt]);
  const version = account.isError ? undefined : account.data?.version;
  const blocked = mutation.isPending || account.isFetching || account.isError || seconds > 0 || reviewRequired || !Number.isInteger(version);
  async function attach() {
    if (blocked || reason.trim().length < 5) return;
    setNotice("");
    try {
      await mutation.mutateAsync({ organization_id: organizationId.trim(), reason: reason.trim(), version });
      setOrganizationId(""); setReason("");
      setNotice("Commercial client link saved. Operational delegation remains governed by the approved relationship.");
    } catch (error) {
      const failed = error as ApiError;
      if (failed.status === 412) setReviewRequired(true);
      if (failed.retryAfter) { setRetryAt(Date.now() + failed.retryAfter * 1000); setSeconds(failed.retryAfter); }
    }
  }
  return <div className="rounded-xl border border-[var(--border-subtle)] p-4">
    <h3 className="font-medium">Link an approved client</h3>
    <p className="mt-1 text-xs text-[var(--text-secondary)]">An active, client-owner-approved EMC relationship is required. This commercial link does not grant access or replace client consent.</p>
    {failure ? <p role="alert" className="mt-3 text-sm">{failure.status === 412 ? "The commercial account changed. Reload and review it before trying again." : failure.status === 404 ? "An active approved client relationship is not available." : failure.message}
      {seconds > 0 ? ` Retry in ${seconds} seconds.` : ""}{failure.correlationId ? ` Reference: ${failure.correlationId}` : ""}</p> : null}
    {account.isError ? <p role="alert" className="mt-3 text-sm">Commercial account access is unavailable. No cached version can authorise this change.</p> : null}
    {notice ? <p role="status" className="mt-3 text-sm">{notice}</p> : null}
    <form className="mt-3 space-y-3" onSubmit={event => { event.preventDefault(); void attach(); }}>
      <label className="block text-sm">Approved client organisation ID<input value={organizationId} onChange={event => setOrganizationId(event.target.value)} maxLength={36} required disabled={mutation.isPending} className="input mt-1 h-9 w-full rounded-md px-3 text-sm" /></label>
      <label className="block text-sm">Reason for commercial link<input value={reason} onChange={event => setReason(event.target.value)} minLength={5} maxLength={1000} required disabled={mutation.isPending} className="input mt-1 h-9 w-full rounded-md px-3 text-sm" /></label>
      <Button type="submit" className="w-full" variant="outline" disabled={blocked || !organizationId.trim() || reason.trim().length < 5}>{mutation.isPending ? "Saving…" : "Save commercial client link"}</Button>
    </form>
    <Button type="button" className="mt-3" variant="outline" disabled={mutation.isPending || account.isFetching || seconds > 0} onClick={async () => {
      const result = await account.refetch();
      if (!result.isError && Number.isInteger(result.data?.version)) { setReviewRequired(false); mutation.reset(); }
    }}>Reload and review account</Button>
  </div>;
}

export function CommercialClientAttachment() {
  const user = useAuthStore(state => state.user);
  const supportSession = useAuthStore(state => state.impersonationSessionId);
  return user ? <AttachmentForm key={`${user.id}:${user.organization_id}:${supportSession ?? "direct"}`} /> : null;
}
