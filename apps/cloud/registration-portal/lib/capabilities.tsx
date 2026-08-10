"use client";

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";

export type PublicCapabilityReason =
  | "NOT_ENTITLED" | "CONTRACT_REQUIRED" | "SUSPENDED"
  | "SECURITY_RESTRICTED" | "ROLLOUT_DISABLED" | "PROVIDER_UNAVAILABLE"
  | "QUOTA_EXHAUSTED" | "RESOLUTION_UNAVAILABLE";

export type PublicRegistrationCapabilities = {
  event_id: string;
  resolution_version: string;
  availability: { available: boolean; reason?: PublicCapabilityReason };
  features: Record<string, { enabled: boolean; reason_code?: PublicCapabilityReason | null; value?: unknown }>;
  limits: Record<string, { allowed?: number | null; remaining?: number | null; reason_code?: PublicCapabilityReason | null }>;
  freshness_at: string;
};

type CapabilityState = {
  data?: PublicRegistrationCapabilities;
  isLoading: boolean;
  isError: boolean;
  refetch: () => void;
};

const CapabilityContext = createContext<CapabilityState | null>(null);

export function usePublicRegistrationCapabilityQuery(eventId?: string): CapabilityState {
  const [data, setData] = useState<PublicRegistrationCapabilities>();
  const [isLoading, setLoading] = useState(Boolean(eventId));
  const [isError, setError] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const cacheRef = useRef(new Map<string, { etag?: string; data: PublicRegistrationCapabilities }>());

  useEffect(() => {
    if (!eventId) {
      setData(undefined);
      setLoading(false);
      setError(false);
      return;
    }
    const controller = new AbortController();
    const apiBase = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";
    const cached = cacheRef.current.get(eventId);
    setLoading(true);
    setError(false);
    fetch(`${apiBase}/api/v1/portal/registration/${eventId}/capabilities`, {
      headers: cached?.etag ? { "If-None-Match": cached.etag } : undefined,
      signal: controller.signal,
    })
      .then(async (response) => {
        if (response.status === 304 && cached) return cached.data;
        if (!response.ok) throw new Error(`Capability request failed (${response.status})`);
        const value = await response.json() as PublicRegistrationCapabilities;
        cacheRef.current.set(eventId, {
          etag: response.headers.get("ETag") ?? undefined,
          data: value,
        });
        return value;
      })
      .then((value) => { if (!controller.signal.aborted) setData(value); })
      .catch(() => { if (!controller.signal.aborted) setError(true); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [eventId, refresh]);

  return { data, isLoading, isError, refetch: () => setRefresh((value) => value + 1) };
}

export function RegistrationCapabilitiesProvider({ value, children }: { value: CapabilityState; children: ReactNode }) {
  return <CapabilityContext.Provider value={value}>{children}</CapabilityContext.Provider>;
}

export function useRegistrationCapabilities() {
  const value = useContext(CapabilityContext);
  if (!value) throw new Error("useRegistrationCapabilities must be used inside RegistrationCapabilitiesProvider");
  return value;
}

export function hasPublicFeature(
  data: PublicRegistrationCapabilities | undefined,
  featureKey: string,
) {
  return Boolean(data?.availability?.available && data.features[featureKey]?.enabled);
}

export function publicCapabilityReason(data: PublicRegistrationCapabilities | undefined): PublicCapabilityReason {
  return (data?.availability?.reason
    ?? data?.features.FEAT_REGISTRATION_PORTAL?.reason_code
    ?? "RESOLUTION_UNAVAILABLE") as PublicCapabilityReason;
}
