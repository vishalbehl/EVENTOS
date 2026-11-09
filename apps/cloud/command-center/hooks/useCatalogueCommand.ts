"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { apiClient, ApiError } from "@/lib/api-client";
import { useAuthStore } from "@/store/use-auth-store";

/** Explicit operator retry, scoped to the current platform identity. */
export function useCatalogueCommand() {
  const user = useAuthStore(state => state.user);
  const scope = `${user?.id}:${user?.organization_id}`;
  const mounted = useRef(true);
  const busy = useRef(false);
  const receipt = useRef<{ fingerprint: string; key: string } | null>(null);
  const [pending, setPending] = useState(false);
  const [failure, setFailure] = useState<{ message: string; status?: number; retryAfter?: number; correlationId?: string } | null>(null);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);
  const isCurrent = useCallback(() => {
    const state = useAuthStore.getState();
    return mounted.current && state.isAuthenticated && `${state.user?.id}:${state.user?.organization_id}` === scope;
  }, [scope]);
  const execute = async <T,>(method: "post" | "put" | "patch" | "delete", path: string, data: unknown, version?: number) => {
    if (!isCurrent() || busy.current) throw new Error("Wait for the current operation or reload your session.");
    if (version !== undefined && (!Number.isInteger(version) || version < 1)) throw new Error("Reload the current configuration before saving.");
    busy.current = true;
    setPending(true);
    setFailure(null);
    try {
      const bytes = new TextEncoder().encode(JSON.stringify([scope, method, path, data, version]));
      const hash = await crypto.subtle.digest("SHA-256", bytes);
      if (!isCurrent()) return null;
      const fingerprint = Array.from(new Uint8Array(hash), value => value.toString(16).padStart(2, "0")).join("");
      if (receipt.current?.fingerprint !== fingerprint) receipt.current = { fingerprint, key: crypto.randomUUID() };
      const headers: Record<string, string> = { "Idempotency-Key": receipt.current.key };
      if (version !== undefined) headers["If-Match"] = String(version);
      const result = method === "delete"
        ? await apiClient.delete<T>(path, { headers })
        : await apiClient[method]<T>(path, data, { headers });
      if (!isCurrent()) return null;
      receipt.current = null;
      return result;
    } catch (error: unknown) {
      if (isCurrent()) {
        const problem = error instanceof ApiError ? error : null;
        setFailure({ message: error instanceof Error ? error.message : "The change was not saved.",
          status: problem?.status, retryAfter: problem?.retryAfter, correlationId: problem?.correlationId });
      }
      throw error;
    } finally {
      busy.current = false;
      if (isCurrent()) setPending(false);
    }
  };
  return { execute, isCurrent, pending, failure };
}
