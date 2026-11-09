"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuthStore } from "@/store/use-auth-store";
import { authService } from "@/services/auth-service";
import { orgApi } from "./org-api";
import type { ApiError } from "@/lib/api-client";

type Preview = Awaited<ReturnType<typeof orgApi.previewInvite>>;

export function AcceptInviteForm() {
  const search = useSearchParams();
  const user = useAuthStore(state => state.user);
  const hydrated = useAuthStore(state => state.hasHydrated);
  const [token, setToken] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mfaCode, setMfaCode] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [accepted, setAccepted] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retryAt, setRetryAt] = useState(0);
  const [seconds, setSeconds] = useState(0);
  const request = useRef<AbortController | null>(null);
  const reviewedToken = useRef("");
  const command = useRef<{ signature: string; key: string } | null>(null);

  useEffect(() => {
    const supplied = new URLSearchParams(window.location.hash.slice(1)).get("token") || search.get("token") || "";
    if (/^[A-Za-z0-9_-]{32,64}$/.test(supplied)) setToken(supplied);
    // New links use a fragment (not sent to server/referrers). Remove old query
    // tokens immediately too; never persist invitation credentials in storage.
    window.history.replaceState(window.history.state, "", window.location.pathname);
  }, [search]);

  useEffect(() => {
    request.current?.abort();
    setBusy(false); setPreview(null); setAccepted(null); command.current = null;
    return () => request.current?.abort();
  }, [user?.id]);

  useEffect(() => {
    const tick = () => setSeconds(Math.max(0, Math.ceil((retryAt - Date.now()) / 1000)));
    tick();
    if (!retryAt) return;
    const interval = window.setInterval(tick, 1000);
    return () => window.clearInterval(interval);
  }, [retryAt]);

  function failed(cause: ApiError) {
    if (cause.status === 429 || cause.status === 503) {
      setRetryAt(Date.now() + Math.max(1, cause.retryAfter || 5) * 1000);
      setError(`${cause.status === 429 ? "Too many requests." : "Access protection is unavailable."} Your form has been kept.${cause.correlationId ? ` Reference: ${cause.correlationId}` : ""}`);
    } else if (cause.status === 404) {
      setPreview(null);
      setError("This invitation is unavailable. Check that you signed in with the invited email, or ask the sender for a new link.");
    } else if (cause.status === 412) {
      setPreview(null); setError("The invitation changed. Review the latest link before accepting.");
    } else setError(cause.message || "The request could not be completed.");
  }

  async function login(event: FormEvent) {
    event.preventDefault();
    if (busy || seconds) return;
    setBusy(true); setError(null);
    try {
      await authService.login({ email: email.trim(), password, ...(mfaCode ? { mfa_code: mfaCode } : {}) });
      setPassword(""); setMfaCode("");
    } catch (cause) { failed(cause as ApiError); }
    finally { setBusy(false); }
  }

  async function review() {
    if (!user || busy || seconds || !/^[A-Za-z0-9_-]{32,64}$/.test(token)) return;
    request.current?.abort();
    const controller = new AbortController(); request.current = controller;
    setBusy(true); setError(null); setPreview(null);
    try {
      const result = await orgApi.previewInvite(token, controller.signal);
      if (!controller.signal.aborted) { reviewedToken.current = token; setPreview(result); }
    } catch (cause) { if (!controller.signal.aborted) failed(cause as ApiError); }
    finally { if (!controller.signal.aborted) setBusy(false); }
  }

  async function accept() {
    if (!user || !preview || busy || seconds) return;
    const signature = JSON.stringify([user.id, reviewedToken.current, preview.version]);
    if (command.current?.signature !== signature) command.current = { signature, key: crypto.randomUUID() };
    const controller = new AbortController(); request.current = controller;
    setBusy(true); setError(null);
    try {
      const result = await orgApi.acceptInvite(reviewedToken.current, preview.version, command.current.key, controller.signal);
      if (!controller.signal.aborted) { setAccepted(result.organization_name); setToken(""); setPreview(null); reviewedToken.current = ""; }
    } catch (cause) { if (!controller.signal.aborted) failed(cause as ApiError); }
    finally { if (!controller.signal.aborted) setBusy(false); }
  }

  return <main className="grid min-h-screen place-items-center bg-[var(--color-bg)] p-6 text-[var(--color-text-primary)]">
    <section className="w-full max-w-lg space-y-6 rounded-[28px] border border-[var(--color-border)] bg-[var(--color-surface-2)] p-8">
      <h1 className="text-xl font-bold">Join an organisation</h1>
      <p className="text-sm">Sign in with the invited email, review the organisation and role, then accept. The link alone does not grant access.</p>
      {!hydrated ? <p role="status">Checking your session…</p> : !user ? <form onSubmit={login} className="space-y-4">
        <label className="block text-sm">Invited email<Input type="email" autoComplete="username" value={email} onChange={event => setEmail(event.target.value)} required /></label>
        <label className="block text-sm">Password<Input type="password" autoComplete="current-password" value={password} onChange={event => setPassword(event.target.value)} required /></label>
        <label className="block text-sm">Authenticator code, if enabled<Input inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={mfaCode} onChange={event => setMfaCode(event.target.value)} /></label>
        <Button disabled={busy || seconds > 0} type="submit">{busy ? "Signing in…" : "Sign in"}</Button>
        <p className="text-sm">No account yet? Ask your organisation administrator to arrange account onboarding. This page does not create an account or another organisation.</p>
      </form> : accepted ? <div role="status" className="space-y-3">
        <p>Your membership in {accepted} is accepted.</p>
        <p className="text-sm">Your current organisation has not changed. Switching into newly joined organisations remains unavailable until context selection is enabled.</p>
        <a href="/dashboard" className="underline">Return to your current dashboard</a>
      </div> : <div className="space-y-4">
        <p className="text-sm">Signed in as {user.email}</p>
        <Button variant="outline" disabled={busy} onClick={async () => {
          setBusy(true);
          try { await authService.logout(); } finally { setBusy(false); }
        }}>Sign in again or use another account</Button>
        <label className="block text-sm">Invitation code<Input type="password" autoComplete="off" value={token} disabled={busy} onChange={event => { setToken(event.target.value); setPreview(null); }} /></label>
        <Button onClick={review} disabled={busy || seconds > 0 || !token}>{busy ? "Checking…" : "Review invitation"}</Button>
        {preview ? <div className="space-y-3 border-t border-[var(--color-border)] pt-4">
          <p className="font-medium">{preview.organization_name}</p><p className="text-sm">Role: {preview.org_role}. Expires {new Date(preview.expires_at).toLocaleString()}.</p>
          <Button onClick={accept} disabled={busy || seconds > 0}>Accept invitation</Button>
        </div> : null}
      </div>}
      {error ? <p role="alert" className="text-sm">{error}</p> : null}
      {seconds > 0 ? <p role="status" className="text-sm">Try again in {seconds}s.</p> : null}
    </section>
  </main>;
}
