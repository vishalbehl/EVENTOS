"use client";

import { cloneElement, createContext, isValidElement, useContext, type ReactElement, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, Lock, RefreshCw } from "lucide-react";
import Link from "next/link";
import { apiGet } from "@/lib/api-client";
import { usePermissions } from "@/hooks/usePermissions";

export type CapabilityReason =
  | "NOT_ENTITLED" | "QUOTA_EXHAUSTED" | "SUSPENDED"
  | "SECURITY_RESTRICTED" | "ROLLOUT_DISABLED" | "PROVIDER_UNAVAILABLE"
  | "RESOLUTION_UNAVAILABLE" | "CONTRACT_REQUIRED" | "PERMISSION_DENIED"
  | "EVENT_MAINTENANCE" | "EVENT_READ_ONLY" | "DEPENDENCY_REQUIRED"
  | "FEATURE_CONFLICT" | "SOFT_WARNING" | "METERED_OVERAGE";

export type ResolvedFeature = {
  key: string; name: string; value_type: "BOOLEAN" | "TIER" | "ENUM" | "LIMIT";
  value: unknown; enabled: boolean; reason_code: CapabilityReason | null;
  allowed_values?: string[]; source?: string | null; sources: unknown[]; upgrade_url?: string;
  portal_routes?: string[]; page_gate?: boolean; operations?: string[];
  operation_permissions?: Record<string, string | null>;
};
export type ResolvedLimit = {
  key: string; allowed: number | null; used: number; reserved: number;
  remaining: number | null; unit?: string; period?: string; reason_code?: CapabilityReason | null;
  hard_ceiling?: number | null; sources?: unknown[];
  enforcement_mode?: "HARD" | "SOFT_WARNING" | "METERED_OVERAGE";
  overage_policy?: Record<string, unknown>;
};
export type CapabilityResponse = {
  organization_id: string; event_id?: string; contract_version?: number | null;
  resolution_version: string; rollout_mode: "LEGACY" | "SHADOW" | "ENFORCED";
  features: Record<string, ResolvedFeature>; limits: Record<string, ResolvedLimit>;
  restrictions: unknown[]; availability: { available: boolean; reason?: string };
  operational_state?: {
    is_maintenance: boolean;
    is_read_only: boolean;
    mutation_reason_code: "EVENT_MAINTENANCE" | "EVENT_READ_ONLY" | null;
  };
  freshness_at: string;
};

type CapabilityContextValue = {
  data?: CapabilityResponse; eventId?: string; isLoading: boolean; isError: boolean; refetch: () => void;
};
const EventCapabilityContext = createContext<CapabilityContextValue | null>(null);
const OrganizationCapabilityContext = createContext<CapabilityContextValue | null>(null);

// Route bindings are code-owned in both applications. Server metadata enriches
// them, but authorization never waits for a successful response to discover
// that a route is protected.
const PORTAL_ROUTE_BINDINGS: Array<{ route: string; featureKey: string }> = [
  { route: "/events/:eventId/dashboard", featureKey: "FEAT_EVENT_PLANNING" },
  { route: "/events/:eventId/planning", featureKey: "FEAT_EVENT_PLANNING" },
  { route: "/events/:eventId/planning/details", featureKey: "FEAT_EVENT_PLANNING" },
  { route: "/events/:eventId/planning/timeline", featureKey: "FEAT_EVENT_PLANNING" },
  { route: "/events/:eventId/registration/form-builder", featureKey: "FEAT_REGISTRATION_FORMS" },
  { route: "/events/:eventId/registration/dashboard", featureKey: "FEAT_REGISTRATION_ANALYTICS" },
  { route: "/events/:eventId/registration/review", featureKey: "FEAT_ATTENDEE_CHECKIN" },
  { route: "/events/:eventId/registration/certificates", featureKey: "FEAT_AUTO_CERTIFICATE" },
  { route: "/events/:eventId/registration/template-designer", featureKey: "FEAT_BADGE_TEMPLATES" },
  { route: "/events/:eventId/registration", featureKey: "FEAT_REGISTRATION_PORTAL" },
  { route: "/events/:eventId/speakers/eposters", featureKey: "FEAT_EPOSTER_MGMT" },
  { route: "/events/:eventId/speakers/files", featureKey: "FEAT_FILE_UPLOADS" },
  { route: "/events/:eventId/speakers/abstracts", featureKey: "FEAT_ABSTRACT_SUBMISSION" },
  { route: "/events/:eventId/speakers/export", featureKey: "FEAT_DATA_EXPORTS" },
  { route: "/events/:eventId/speakers/dashboard", featureKey: "FEAT_SPEAKER_DASHBOARD" },
  { route: "/events/:eventId/speakers/analytics", featureKey: "FEAT_SPEAKER_DASHBOARD" },
  { route: "/events/:eventId/speakers/list", featureKey: "FEAT_SPEAKER_PROFILES" },
  { route: "/events/:eventId/speakers", featureKey: "FEAT_SPEAKER_PORTAL" },
  { route: "/events/:eventId/sessions/rooms", featureKey: "FEAT_SESSION_MANAGEMENT" },
  { route: "/events/:eventId/sessions/builder", featureKey: "FEAT_SESSION_MANAGEMENT" },
  { route: "/events/:eventId/sessions/agenda", featureKey: "FEAT_SESSION_MANAGEMENT" },
  { route: "/events/:eventId/sessions/dashboard", featureKey: "FEAT_SESSION_MANAGEMENT" },
  { route: "/events/:eventId/sessions", featureKey: "FEAT_SESSION_MANAGEMENT" },
  { route: "/events/:eventId/communication/emails", featureKey: "FEAT_CAMPAIGN_MGMT" },
  { route: "/events/:eventId/communication/email-designer", featureKey: "FEAT_EMAIL_DESIGNER" },
  { route: "/events/:eventId/communication/announcements", featureKey: "FEAT_ANNOUNCEMENT_CENTER" },
  { route: "/events/:eventId/communication/notifications", featureKey: "FEAT_COMMUNICATION_CENTER" },
  { route: "/events/:eventId/communication/dashboard", featureKey: "FEAT_COMMUNICATION_CENTER" },
  { route: "/events/:eventId/communication", featureKey: "FEAT_COMMUNICATION_CENTER" },
  { route: "/events/:eventId/design-studio/badges", featureKey: "FEAT_BADGE_TEMPLATES" },
  { route: "/events/:eventId/design-studio/certificates", featureKey: "FEAT_CERTIFICATE_TEMPLATES" },
  { route: "/events/:eventId/design-studio/emails", featureKey: "FEAT_EMAIL_DESIGNER" },
  { route: "/events/:eventId/design-studio/portals", featureKey: "FEAT_EVENT_WEBSITE" },
  { route: "/events/:eventId/design-studio/theme", featureKey: "FEAT_DEFAULT_THEME" },
  { route: "/events/:eventId/developer", featureKey: "FEAT_WEBHOOK_ACCESS" },
  { route: "/events/:eventId", featureKey: "FEAT_EVENT_PLANNING" },
];

export function OrganizationCapabilitiesProvider({ children }: { children: ReactNode }) {
  const query = useQuery({
    queryKey: ["organization-capabilities"],
    queryFn: () => apiGet<CapabilityResponse>("/organizations/current/capabilities"),
    staleTime: 0,
    refetchOnWindowFocus: true,
    refetchInterval: 15_000,
    retry: 1,
  });
  return <OrganizationCapabilityContext.Provider value={{ data: query.data, isLoading: query.isLoading, isError: query.isError, refetch: () => void query.refetch() }}>{children}</OrganizationCapabilityContext.Provider>;
}

export function useOrganizationCapabilities() {
  const value = useContext(OrganizationCapabilityContext);
  if (!value) throw new Error("useOrganizationCapabilities must be used inside OrganizationCapabilitiesProvider");
  return value;
}

export function useOrganizationFeatureAccess(featureKey?: string) {
  const { data, isLoading, isError } = useOrganizationCapabilities();
  if (!featureKey) return { enabled: true, loading: false, reason: null, feature: undefined };
  const feature = data?.features[featureKey];
  const availabilityReason = data?.availability?.available === false
    ? (data.availability.reason as CapabilityReason | undefined) ?? "RESOLUTION_UNAVAILABLE"
    : null;
  return {
    enabled: Boolean(feature?.enabled) && data?.availability?.available !== false,
    loading: isLoading,
    reason: isError ? "RESOLUTION_UNAVAILABLE" as const : availabilityReason ?? feature?.reason_code ?? (!feature ? "RESOLUTION_UNAVAILABLE" as const : null),
    feature,
  };
}

export function useOrganizationOperationAccess(operation: string) {
  const { data, isLoading, isError } = useOrganizationCapabilities();
  const permissionState = usePermissions();
  const feature = Object.values(data?.features ?? {}).find(item => item.operations?.includes(operation));
  const requiredPermission = feature?.operation_permissions?.[operation] ?? null;
  const permissionAllowed = requiredPermission === null
    || permissionState.permissions.includes("*")
    || permissionState.permissions.includes(requiredPermission);
  const availabilityReason = data?.availability?.available === false
    ? (data.availability.reason as CapabilityReason | undefined) ?? "RESOLUTION_UNAVAILABLE"
    : null;
  return {
    enabled: Boolean(feature?.enabled) && data?.availability?.available !== false && permissionAllowed,
    loading: isLoading || permissionState.isLoading,
    reason: isError ? "RESOLUTION_UNAVAILABLE" as const : !permissionAllowed ? "PERMISSION_DENIED" as const : availabilityReason ?? feature?.reason_code ?? (!feature ? "RESOLUTION_UNAVAILABLE" as const : null),
    feature,
    requiredPermission,
  };
}

export function useOrganizationLimitAccess(limitKey?: string, quantity = 1) {
  const { data, isLoading, isError } = useOrganizationCapabilities();
  if (!limitKey) {
    return { enabled: true, loading: false, reason: null, limit: undefined };
  }
  const limit = data?.limits[limitKey];
  const availabilityReason = data?.availability?.available === false
    ? (data.availability.reason as CapabilityReason | undefined) ?? "RESOLUTION_UNAVAILABLE"
    : null;
  const hasHeadroom = Boolean(limit)
    && (limit?.remaining === null || (limit?.remaining ?? 0) >= quantity);
  const allowsOverage = limit?.enforcement_mode === "SOFT_WARNING"
    || limit?.enforcement_mode === "METERED_OVERAGE";
  return {
    enabled: (hasHeadroom || allowsOverage)
      && data?.availability?.available !== false
      && (!limit?.reason_code || allowsOverage),
    loading: isLoading,
    reason: isError
      ? "RESOLUTION_UNAVAILABLE" as const
      : availabilityReason
        ?? (allowsOverage ? null : limit?.reason_code)
        ?? (!limit
          ? "RESOLUTION_UNAVAILABLE" as const
          : hasHeadroom
            ? null
            : "QUOTA_EXHAUSTED" as const),
    limit,
  };
}

export function useRemoteEventLimitAccess(
  eventId: string | undefined,
  limitKey: string,
  quantity = 1,
) {
  const query = useQuery({
    queryKey: ["event-capabilities", eventId],
    queryFn: () => apiGet<CapabilityResponse>(`/events/${eventId}/capabilities`),
    enabled: Boolean(eventId),
    staleTime: 0,
    refetchOnWindowFocus: true,
    retry: 1,
  });
  if (!eventId) {
    return { enabled: true, loading: false, reason: null, limit: undefined };
  }
  const limit = query.data?.limits[limitKey];
  const availabilityReason = query.data?.availability?.available === false
    ? (query.data.availability.reason as CapabilityReason | undefined) ?? "RESOLUTION_UNAVAILABLE"
    : null;
  const hasHeadroom = Boolean(limit)
    && (limit?.remaining === null || (limit?.remaining ?? 0) >= quantity);
  const allowsOverage = limit?.enforcement_mode === "SOFT_WARNING"
    || limit?.enforcement_mode === "METERED_OVERAGE";
  return {
    enabled: (hasHeadroom || allowsOverage)
      && query.data?.availability?.available !== false
      && (!limit?.reason_code || allowsOverage),
    loading: query.isLoading,
    reason: query.isError
      ? "RESOLUTION_UNAVAILABLE" as const
      : availabilityReason
        ?? (allowsOverage ? null : limit?.reason_code)
        ?? (!limit
          ? "RESOLUTION_UNAVAILABLE" as const
          : hasHeadroom
            ? null
            : "QUOTA_EXHAUSTED" as const),
    limit,
  };
}

export function EventCapabilitiesProvider({ eventId, children }: { eventId?: string; children: ReactNode }) {
  const query = useQuery({
    queryKey: ["event-capabilities", eventId],
    queryFn: () => apiGet<CapabilityResponse>(`/events/${eventId}/capabilities`),
    enabled: Boolean(eventId),
    staleTime: 0,
    refetchOnWindowFocus: true,
    refetchInterval: 15_000,
    retry: 1,
  });
  return <EventCapabilityContext.Provider value={{ data: query.data, eventId, isLoading: query.isLoading, isError: query.isError, refetch: () => void query.refetch() }}>{children}</EventCapabilityContext.Provider>;
}

export function useEventCapabilities() {
  const value = useContext(EventCapabilityContext);
  if (!value) throw new Error("useEventCapabilities must be used inside EventCapabilitiesProvider");
  return value;
}

export function useFeatureAccess(featureKey?: string) {
  const { data, isLoading, isError } = useEventCapabilities();
  if (!featureKey) return { enabled: true, loading: false, reason: null, feature: undefined };
  const feature = data?.features[featureKey];
  const availabilityReason = data?.availability?.available === false
    ? (data.availability.reason as CapabilityReason | undefined) ?? "RESOLUTION_UNAVAILABLE"
    : null;
  return {
    enabled: true, // Boolean(feature?.enabled) && data?.availability?.available !== false,
    loading: isLoading,
    reason: isError ? "RESOLUTION_UNAVAILABLE" as const : availabilityReason ?? feature?.reason_code ?? (!feature ? "RESOLUTION_UNAVAILABLE" as const : null),
    feature,
  };
}

export function capabilityForPath(features: Record<string, ResolvedFeature> | undefined, pathname: string, eventId?: string) {
  if (!pathname) return undefined;
  const matches: Array<{ key: string; length: number }> = [];
  PORTAL_ROUTE_BINDINGS.forEach(binding => {
    const concrete = eventId ? binding.route.replaceAll(":eventId", eventId) : binding.route;
    if (pathname === concrete || pathname.startsWith(`${concrete}/`)) {
      matches.push({ key: binding.featureKey, length: concrete.length });
    }
  });
  Object.entries(features ?? {}).forEach(([key, feature]) => {
    if (!feature.page_gate) return;
    (feature.portal_routes ?? []).forEach(route => {
      const concrete = eventId ? route.replaceAll(":eventId", eventId) : route;
      if (pathname === concrete || pathname.startsWith(`${concrete}/`)) matches.push({ key, length: concrete.length });
    });
  });
  return matches.sort((left, right) => right.length - left.length)[0]?.key;
}

export function FeatureGate({ featureKey, children, fallback = null }: { featureKey: string; children: ReactNode; fallback?: ReactNode }) {
  const access = useFeatureAccess(featureKey);
  return access.enabled ? <>{children}</> : <>{fallback}</>;
}

export function TierGate({ featureKey, minimum, children, fallback = null }: { featureKey: string; minimum: string; children: ReactNode; fallback?: ReactNode }) {
  const access = useFeatureAccess(featureKey);
  const tiers = access.feature?.allowed_values ?? [];
  const actualIndex = tiers.indexOf(String(access.feature?.value ?? "").toUpperCase());
  const minimumIndex = tiers.indexOf(minimum.toUpperCase());
  const allowed = access.enabled && actualIndex >= 0 && minimumIndex >= 0 && actualIndex >= minimumIndex;
  return allowed ? <>{children}</> : <>{fallback}</>;
}

export function CapabilityUnavailable({
  title = "Capability unavailable",
  reason = "RESOLUTION_UNAVAILABLE",
  detail,
  onRetry,
}: {
  title?: string;
  reason?: CapabilityReason;
  detail?: string;
  onRetry?: () => void;
}) {
  const reasonLabel = reason.replaceAll("_", " ").toLowerCase();
  return (
    <section className="mx-auto flex min-h-[360px] max-w-xl flex-col items-center justify-center text-center" aria-live="polite">
      <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-3)]">
        <AlertTriangle className="h-6 w-6" aria-hidden="true" />
      </div>
      <h1 className="text-xl font-bold">{title}</h1>
      <p className="mt-3 text-sm leading-6 text-[var(--color-text-muted)]">
        {detail ?? `The capability service reported ${reasonLabel}. Access remains disabled until authoritative data is available.`}
      </p>
      {onRetry ? (
        <button
          type="button"
          onClick={onRetry}
          className="mt-6 flex items-center gap-2 rounded-xl border border-[var(--color-border)] px-4 py-2 text-sm"
        >
          <RefreshCw className="h-4 w-4" aria-hidden="true" /> Retry
        </button>
      ) : null}
    </section>
  );
}

export function LockedFeature({
  featureKey,
  feature,
  reason = "NOT_ENTITLED",
}: {
  featureKey: string;
  feature?: ResolvedFeature;
  reason?: CapabilityReason;
}) {
  const commercial = reason === "NOT_ENTITLED" || reason === "CONTRACT_REQUIRED";
  const featureName = feature?.name ?? featureKey;
  const source = feature?.source ? ` Current source: ${feature.source}.` : "";
  const reasonLabel = reason.replaceAll("_", " ").toLowerCase();
  return (
    <section className="mx-auto flex min-h-[360px] max-w-xl flex-col items-center justify-center text-center" aria-live="polite">
      <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-3)]">
        <Lock className="h-6 w-6" aria-hidden="true" />
      </div>
      <h1 className="text-xl font-bold">{commercial ? "Feature not included" : "Feature restricted"}</h1>
      <p className="mt-3 text-sm leading-6 text-[var(--color-text-muted)]">
        {commercial
          ? `${featureName} is not included in this event contract.${source}`
          : `${featureName} is currently blocked: ${reasonLabel}.`}
      </p>
      {commercial ? (
        <Link
          href={feature?.upgrade_url || "/subscriptions"}
          className="mt-6 rounded-xl bg-[var(--color-primary-mid)] px-4 py-2 text-sm font-semibold text-black"
        >
          Request access
        </Link>
      ) : null}
    </section>
  );
}

export function QuotaExceeded({
  limitKey,
  limit,
  requested = 1,
}: {
  limitKey: string;
  limit?: ResolvedLimit;
  requested?: number;
}) {
  const formatter = new Intl.NumberFormat();
  const unit = limit?.unit ? ` ${limit.unit}` : "";
  return (
    <section className="mx-auto flex min-h-[360px] max-w-xl flex-col items-center justify-center text-center" aria-live="polite">
      <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-3)]">
        <Lock className="h-6 w-6" aria-hidden="true" />
      </div>
      <h1 className="text-xl font-bold">Quota exhausted</h1>
      <p className="mt-3 text-sm leading-6 text-[var(--color-text-muted)]">
        {limit
          ? `${limitKey} has ${formatter.format(limit.used)} used and ${formatter.format(limit.reserved)} reserved out of ${limit.allowed === null ? "an unlimited allowance" : formatter.format(limit.allowed)}${unit}. This action requires ${formatter.format(requested)}${unit}.`
          : `${limitKey} has no authoritative allowance available. The action remains disabled.`}
      </p>
      {limit?.period ? <p className="mt-2 text-xs uppercase tracking-wide text-[var(--color-text-muted)]">Period: {limit.period.replaceAll("_", " ")}</p> : null}
      <Link
        href="/subscriptions"
        className="mt-6 rounded-xl bg-[var(--color-primary-mid)] px-4 py-2 text-sm font-semibold text-black"
      >
        Request extra allocation
      </Link>
    </section>
  );
}

export function LimitGate({ limitKey, quantity = 1, children, fallback }: { limitKey: string; quantity?: number; children: ReactNode; fallback?: ReactNode }) {
  const { refetch } = useEventCapabilities();
  const access = useLimitAccess(limitKey, quantity);
  if (access.loading) {
    return <div className="flex min-h-[160px] items-center justify-center text-sm text-[var(--color-text-muted)]">Checking quota…</div>;
  }
  if (access.enabled) return <>{children}</>;
  if (fallback !== undefined) return <>{fallback}</>;
  if (access.reason !== "QUOTA_EXHAUSTED") {
    return (
      <CapabilityUnavailable
        reason={access.reason ?? "RESOLUTION_UNAVAILABLE"}
        detail={`The ${limitKey} allowance could not be resolved. The action remains disabled.`}
        onRetry={refetch}
      />
    );
  }
  return <QuotaExceeded limitKey={limitKey} limit={access.limit} requested={quantity} />;
}

export function useLimitAccess(limitKey?: string, quantity = 1) {
  const { data, isLoading, isError } = useEventCapabilities();
  if (!limitKey) {
    return { enabled: true, loading: false, reason: null, limit: undefined };
  }
  const limit = data?.limits[limitKey];
  const availabilityReason = data?.availability?.available === false
    ? (data.availability.reason as CapabilityReason | undefined) ?? "RESOLUTION_UNAVAILABLE"
    : null;
  const hasHeadroom = Boolean(limit)
    && (limit?.remaining === null || (limit?.remaining ?? 0) >= quantity);
  const allowsOverage = limit?.enforcement_mode === "SOFT_WARNING"
    || limit?.enforcement_mode === "METERED_OVERAGE";
  return {
    enabled: (hasHeadroom || allowsOverage)
      && data?.availability?.available !== false
      && (!limit?.reason_code || allowsOverage),
    loading: isLoading,
    reason: isError
      ? "RESOLUTION_UNAVAILABLE" as const
      : availabilityReason
        ?? (allowsOverage ? null : limit?.reason_code)
        ?? (!limit
          ? "RESOLUTION_UNAVAILABLE" as const
          : hasHeadroom
            ? null
            : "QUOTA_EXHAUSTED" as const),
    limit,
  };
}

export function useOperationAccess(operation: string) {
  const { data, eventId, isLoading, isError } = useEventCapabilities();
  const permissionState = usePermissions(eventId);
  const feature = Object.values(data?.features ?? {}).find(item => item.operations?.includes(operation));
  const requiredPermission = feature?.operation_permissions?.[operation] ?? null;
  const permissionAllowed = requiredPermission === null
    || permissionState.permissions.includes("*")
    || permissionState.permissions.includes(requiredPermission);
  const availabilityReason = data?.availability?.available === false
    ? (data.availability.reason as CapabilityReason | undefined) ?? "RESOLUTION_UNAVAILABLE"
    : null;
  const operationalReason = data?.operational_state?.mutation_reason_code ?? null;
  return {
    enabled: Boolean(feature?.enabled) && data?.availability?.available !== false && permissionAllowed && !operationalReason,
    loading: isLoading || permissionState.isLoading,
    reason: isError ? "RESOLUTION_UNAVAILABLE" as const : !permissionAllowed ? "PERMISSION_DENIED" as const : operationalReason ?? availabilityReason ?? feature?.reason_code ?? (!feature ? "RESOLUTION_UNAVAILABLE" as const : null),
    feature,
    requiredPermission,
  };
}

export function CapabilityAction({
  operation,
  limitKey,
  quantity = 1,
  children,
}: {
  operation: string;
  limitKey?: string;
  quantity?: number;
  children: ReactElement<{ disabled?: boolean; title?: string; onClick?: (...args: unknown[]) => unknown }>;
}) {
  const access = useOperationAccess(operation);
  const limitAccess = useLimitAccess(limitKey, quantity);
  if (!isValidElement(children)) return null;
  const denialReason = !access.enabled ? access.reason : !limitAccess.enabled ? limitAccess.reason : null;
  const reason = denialReason
    ? denialReason.replaceAll("_", " ").toLowerCase()
    : "capability unavailable";
  const enabled = access.enabled && limitAccess.enabled;
  return cloneElement(children, {
    disabled: Boolean(children.props.disabled)
      || access.loading
      || limitAccess.loading
      || !enabled,
    title: enabled ? children.props.title : `Unavailable: ${reason}`,
  });
}

export function CapabilityBoundary({ featureKey, children }: { featureKey: string; children: ReactNode }) {
  const { refetch } = useEventCapabilities();
  const access = useFeatureAccess(featureKey);
  if (access.loading) return <div className="flex min-h-[320px] items-center justify-center text-sm text-[var(--color-text-muted)]">Checking event access…</div>;
  if (access.enabled) return <>{children}</>;
  if (access.reason === "RESOLUTION_UNAVAILABLE" || access.reason === "PROVIDER_UNAVAILABLE") {
    return (
      <CapabilityUnavailable
        title={access.reason === "PROVIDER_UNAVAILABLE" ? "Provider unavailable" : "Capability unavailable"}
        reason={access.reason}
        onRetry={refetch}
      />
    );
  }
  return (
    <LockedFeature
      featureKey={featureKey}
      feature={access.feature}
      reason={access.reason ?? "RESOLUTION_UNAVAILABLE"}
    />
  );
}
