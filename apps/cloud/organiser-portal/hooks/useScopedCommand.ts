"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { apiClient, type ApiError } from "@/lib/api-client";
import { accessContextCacheKey, useAuthStore } from "@/store/use-auth-store";

/** Explicit retries only; retain the original receipt while the request is unchanged. */
export function useScopedCommand(eventId: string) {
  const { user, activeContext } = useAuthStore();
  const scope = `${user?.id}:${accessContextCacheKey(activeContext, user?.organization_id)}:${eventId}`;
  const mounted = useRef(true);
  const busy = useRef(false);
  const receipt = useRef<{ fingerprint: string; key: string } | null>(null);
  const [pending, setPending] = useState(false);
  const [failure, setFailure] = useState<ApiError | null>(null);
  const [retryAt, setRetryAt] = useState<number | null>(null);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);
  const isCurrent = useCallback(() => {
    const current = useAuthStore.getState();
    const liveScope = `${current.user?.id}:${accessContextCacheKey(current.activeContext, current.user?.organization_id)}:${eventId}`;
    return mounted.current && liveScope === scope && current.isAuthenticated && !current.isContextSwitching;
  }, [scope, eventId]);
  const execute = async <T,>(method: "post" | "put" | "patch" | "delete", path: string,
    payload: unknown, version?: number | null): Promise<T | null> => {
    if (!isCurrent() || busy.current || (version !== undefined && (!version || !Number.isInteger(version)))) {
      throw new Error("Reload the current configuration or wait for its pending save.");
    }
    busy.current = true;
    setPending(true);
    setFailure(null);
    setRetryAt(null);
    try {
      // Do not retain credential bodies inside retry fingerprints.
      const bytes = new TextEncoder().encode(JSON.stringify([scope, method, path, version, payload]));
      const hash = await crypto.subtle.digest("SHA-256", bytes);
      if (!isCurrent()) return null;
      const fingerprint = Array.from(new Uint8Array(hash), byte => byte.toString(16).padStart(2, "0")).join("");
      if (receipt.current?.fingerprint !== fingerprint) receipt.current = { fingerprint, key: crypto.randomUUID() };
      const headers: Record<string, string> = { "Idempotency-Key": receipt.current.key };
      if (version !== undefined) headers["If-Match"] = String(version);
      const result = method === "delete"
        ? await apiClient.delete<T>(path, { headers, data: payload })
        : await apiClient[method]<T>(path, payload, { headers });
      if (!isCurrent()) return null;
      receipt.current = null;
      return result;
    } catch (error: unknown) {
      if (isCurrent()) {
        const problem = error as Partial<ApiError> | null;
        const safe = { message: typeof problem?.message === "string" ? problem.message : "The change was not saved.",
          status: problem?.status, code: problem?.code, correlationId: problem?.correlationId,
          retryAfter: problem?.retryAfter };
        setFailure(safe);
        if (typeof safe.retryAfter === "number" && Number.isFinite(safe.retryAfter) && safe.retryAfter > 0) {
          setRetryAt(Date.now() + Math.min(safe.retryAfter, 86400) * 1000);
        }
      }
      throw error;
    } finally {
      busy.current = false;
      if (isCurrent()) setPending(false);
    }
  };
  return { execute, pending, isCurrent, failure, retryAt };
}
