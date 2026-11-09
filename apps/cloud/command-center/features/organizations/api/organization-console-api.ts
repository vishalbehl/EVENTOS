"use client";

import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef } from "react";
import { apiClient } from "@/lib/api-client";
import { queryKeys } from "@/lib/query-keys";

// ── Workspace Keys (7 Operational Workspaces) ─────────────────

export type OrganizationWorkspaceKey =
  | "overview"
  | "commercial"
  | "events"
  | "operations"
  | "security"
  | "governance"
  | "internal-admin"
  | (string & {});

// ── Shared Primitives ─────────────────────────────────────────

export interface OrganizationDomainAvailability {
  available: boolean;
  reason?: string | null;
  configured?: boolean | null;
  freshness_at?: string | null;
}

export interface OrganizationConsoleMetric {
  key: string;
  label: string;
  value: string | number | null;
  unit?: string | null;
  available: boolean;
  source: string;
  freshness_at?: string | null;
}

export interface OrganizationHealthFactor {
  key: string;
  label: string;
  score?: number | null;
  status: "HEALTHY" | "ATTENTION" | "CRITICAL" | "NOT_MEASURED";
  evidence: string;
}

export interface OrganizationAttentionItem {
  key: string;
  severity: "INFO" | "WARNING" | "CRITICAL";
  title: string;
  detail: string;
  destination: string;
}

// ── Console Summary ───────────────────────────────────────────

export interface OrganizationConsoleSummary {
  generated_at: string;
  organization: {
    id: string;
    name: string;
    slug: string;
    logo_url?: string | null;
    is_active: boolean;
    organization_kind: "NORMAL" | "EMC" | "CLIENT";
    lifecycle_state: "ACTIVE" | "SUSPENDED" | "ARCHIVED";
    archived_at: string | null;
    profile_version: number;
    is_internal_unrestricted?: boolean;
    created_at: string;
    country: string;
    timezone: string;
    currency: string;
    data_region?: string | null;
    is_sandbox?: boolean;
    is_suspended?: boolean;
    suspension_reason?: string | null;
  };
  contract?: {
    id: string;
    status: string;
    offer_id?: string | null;
    offer_name: string;
    ends_at?: string | null;
    mrr?: number | null;
  } | null;
  metrics: OrganizationConsoleMetric[];
  health_score?: number | null;
  health_status: "HEALTHY" | "ATTENTION" | "CRITICAL" | "NOT_MEASURED";
  health_factors: OrganizationHealthFactor[];
  attention: OrganizationAttentionItem[];
  availability: Record<string, OrganizationDomainAvailability>;
  executive_summary: string;
}

// ── Domain Snapshot ───────────────────────────────────────────

export interface OrganizationDomainSnapshot {
  domain: string;
  generated_at: string;
  availability: OrganizationDomainAvailability;
  data: Record<string, unknown>;
}

// ── Event Console Types ───────────────────────────────────────

export interface OrganizationEventItem {
  id: string;
  organization_id: string;
  name: string;
  short_code: string;
  status: "draft" | "active" | "completed" | "cancelled" | "archived";
  start_date?: string | null;
  end_date?: string | null;
  location?: string | null;
  venue_name?: string | null;
  country?: string | null;
  state?: string | null;
  timezone: string;
  currency: string;
  offer_name?: string | null;
  registrations_count?: number;
  revenue?: number;
  features?: Record<string, boolean>;
  created_at: string;
  updated_at: string;
  is_maintenance?: boolean;
  is_read_only?: boolean;
}

// ── Commercial & Entitlement Types ────────────────────────────

export interface EntitlementItem {
  key: string;
  label: string;
  allowed: number | "unlimited" | boolean;
  used: number;
  unit?: string;
  overage_allowed?: boolean;
}

export interface ExtraUsageAllocationInput {
  resource_type: "storage" | "emails" | "sms" | "api_calls" | "registrations";
  quantity: number;
  reason: string;
}

export interface EntitlementOverrideRequestInput {
  event_id?: string;
  entitlement_key: string;
  operation: "REPLACE" | "INCREMENT" | "DECREMENT" | "UNLOCK" | "RESTRICT" | "RESET";
  requested_value: unknown;
  reason: string;
  case_reference: string;
  effective_at?: string;
  expires_at?: string;
}

export interface EntitlementOverrideRequestItem extends EntitlementOverrideRequestInput {
  id: string;
  status: "PENDING" | "APPROVED" | "REJECTED" | "REVOKED";
  version: number;
  requested_by: string;
  approved_by?: string | null;
  created_at: string;
  decided_at?: string | null;
  revocation_status?: "PENDING" | "APPROVED" | "REJECTED" | null;
  revocation_reason?: string | null;
  revocation_case_reference?: string | null;
  revocation_requested_by?: string | null;
  revocation_approved_by?: string | null;
  revocation_requested_at?: string | null;
  revoked_at?: string | null;
}

export interface ResolvedEntitlements {
  event_id: string;
  contract_id: string;
  contract_version: number;
  resolved_at: string;
  values: Record<string, unknown>;
  sources: Record<string, Array<Record<string, unknown>>>;
  capabilities: Record<string, {
    key: string;
    name?: string;
    value_type?: "BOOLEAN" | "TIER" | "ENUM";
    value: unknown;
    enabled: boolean;
    reason_code?: string | null;
    backend_mode: "ENFORCED" | "COMPOSITE" | "READ_ONLY" | "PROVIDER_REQUIRED" | "NOT_IMPLEMENTED";
    availability_note?: string | null;
    sources: Array<Record<string, unknown>>;
    operations: string[];
    dependencies?: string[];
    conflicts?: string[];
  }>;
  limits: Record<string, {
    key: string;
    allowed?: number | null;
    used: number;
    reserved: number;
    remaining?: number | null;
    unit?: string | null;
    period?: string | null;
    hard_ceiling?: number | null;
    enforcement_mode?: "HARD" | "SOFT_WARNING" | "METERED_OVERAGE";
    overage_policy?: Record<string, unknown>;
    sources?: Array<Record<string, unknown>>;
    reason_code?: string | null;
  }>;
  restrictions: Array<Record<string, unknown>>;
  flags: Record<string, unknown>;
  rollout_mode: "LEGACY" | "SHADOW" | "ENFORCED";
  freshness_at: string;
}

export interface DiscountInput {
  discount_type: "PERCENTAGE" | "FLAT" | "RECURRING";
  value: number;
  reason: string;
  expires_at?: string;
}

export interface CreditWalletAdjustmentInput {
  amount: number;
  type: "CREDIT" | "DEBIT";
  reason: string;
}

// ── Regional Settings Input ───────────────────────────────────

export interface RegionalSettingsUpdate {
  currency: string;
  timezone: string;
  country: string;
  data_region?: string;
  reason: string;
}

// ── Security Policy Types ─────────────────────────────────────

export interface SecurityPolicyUpdate {
  require_mfa: boolean;
  allowed_auth_methods: string[];
  password_policy: Record<string, unknown>;
  session_policy: Record<string, unknown>;
  trusted_device_policy: Record<string, unknown>;
  sso_config: Record<string, unknown>;
  sso_enforced: boolean;
  allowed_cidrs: string[];
  version: number;
  reason: string;
}

// ── Lifecycle Job Types ───────────────────────────────────────

export const destructiveLifecycleUnavailable = (jobType: string): boolean =>
  jobType === "MERGE" || jobType === "PURGE" || jobType === "DELETE";

export const destructiveLifecycleUnavailableReason =
  "Organization merge and purge are unavailable until ownership, retention and legal-hold workflows are implemented and verified. Existing data and history are preserved.";

export interface LifecycleJobCreate {
  job_type: "ARCHIVE" | "RESTORE" | "EXPORT" | "CLONE" | "MERGE" | "PURGE";
  target_organization_id?: string;
  reason: string;
}

export interface LifecycleJobOut {
  id: string;
  organization_id: string;
  target_organization_id?: string | null;
  job_type: string;
  status: string;
  reason: string;
  approvals: Array<{ decision: string; reason: string; actor_id: string; decided_at: string }>;
  created_at: string;
  updated_at: string;
  completed_at?: string | null;
  failure_reason?: string | null;
  dry_run_manifest: Record<string, unknown>;
  result_metadata: Record<string, unknown>;
  manifest_checksum: string;
  attempt_count: number;
  dispatch_attempts: number;
  next_dispatch_at: string | null;
  version: number;
  started_at?: string | null;
}

export interface OrganizationSearchResult {
  domain: string; resource_type: string; id: string; event_id?: string | null;
  title: string; subtitle?: string | null; status?: string | null; occurred_at?: string | null;
}

export interface OrganizationSearchResponse {
  items: OrganizationSearchResult[]; next_cursor?: string | null; has_more: boolean;
  sensitive_data_included: boolean; source: string[];
}

export interface ConsoleExportJob {
  id: string; organization_id: string; event_id?: string | null; status: string; domains: string[];
  include_sensitive: boolean; created_at: string; completed_at?: string | null; expires_at?: string | null; failure_reason?: string | null;
}

export interface OrganizationAuditPage {
  items: Array<Record<string, any> & { id: string; integrity_valid: boolean }>;
  next_cursor?: string | null;
  has_more: boolean;
  integrity: { verified: number; failed: number };
}

export interface ImpersonationHandoff {
  handoff_code: string;
  session_id: string;
  expires_at: string;
  target_user_id: string;
  single_use: true;
}

export interface OrganizerRolloutStatus {
  shadow_enabled: boolean;
  enforcement_enabled: boolean;
  activated_events: number;
  contracted_events: number;
  missing_contracts: number;
  comparisons: { sample_size: number; matched: number; diverged: number; stale: number; freshness_cutoff: string; latest_at?: string | null };
  items: Array<{ id: string; event_id: string; status: string; differences: Record<string, unknown>; resolution_version: string; compared_at: string; fresh: boolean }>;
  preflight: OrganizerRolloutPreflight;
}

export interface OrganizerRolloutIssue {
  code: string;
  message: string;
  event_id?: string | null;
  metadata: Record<string, unknown>;
}

export interface OrganizerRolloutPreflight {
  organization_id: string;
  generated_at: string;
  freshness_cutoff: string;
  ready_for_enforcement: boolean;
  blockers: OrganizerRolloutIssue[];
  warnings: OrganizerRolloutIssue[];
  rollout: {
    shadow_enabled: boolean;
    enforcement_enabled: boolean;
  };
  events: {
    activated: number;
    contracted: number;
    compared: number;
    matched: number;
    diverged: number;
    stale: number;
  };
  coverage: {
    feature_count: number;
    limit_count: number;
    missing_catalogue_keys: string[];
    unknown_catalogue_keys: string[];
    ungated_operations: string[];
    unenforced_limits: string[];
  };
  providers: Array<{
    channel: string;
    required_by_event_ids: string[];
    configured: boolean;
    provider?: string | null;
    state?: string | null;
    last_verified_at?: string | null;
    ready: boolean;
    reason?: string | null;
  }>;
  diagnostics: {
    since: string;
    by_type: Record<string, number>;
  };
  reconciliation: {
    latest_count: number;
    drifted_count: number;
  };
}

export interface CapabilityDiagnostics {
  organization_id: string;
  generated_at: string;
  window: { since: string; hours: number };
  availability: {
    available: boolean;
    source: string;
    freshness_at?: string | null;
    reason?: string | null;
  };
  rollout: {
    mode: "LEGACY" | "SHADOW" | "ENFORCED";
    latest_comparison_at?: string | null;
    latest_reconciliation_at?: string | null;
  };
  summary: {
    total: number;
    by_type: Record<string, number>;
    by_reason: Record<string, number>;
    gate_denials: number;
    resolution_failures: number;
    shadow_divergences: number;
    metering_drift: number;
    legacy_resolver_calls: number;
  };
  coverage: {
    feature_count: number;
    limit_count: number;
    missing_catalogue_keys: string[];
    unknown_catalogue_keys: string[];
    ungated_operations: string[];
    unenforced_limits: string[];
  };
  flag_hygiene: {
    total_flags: number;
    attention_count: number;
    items: Array<{
      id: string;
      flag_key: string;
      owner_team: string;
      updated_at: string;
      expires_at?: string | null;
      reasons: string[];
    }>;
  };
  items: Array<{
    id: string;
    event_id?: string | null;
    actor_user_id?: string | null;
    event_type: string;
    severity: string;
    reason_code?: string | null;
    capability_key?: string | null;
    operation_key?: string | null;
    limit_key?: string | null;
    source: string;
    request_id?: string | null;
    correlation_id?: string | null;
    metadata: Record<string, unknown>;
    occurred_at: string;
  }>;
}

export interface CommercialRequestItem {
  id: string;
  organization_id: string;
  product_family: string;
  request_type: string;
  requested_offer_codes: string[];
  requested_capacity: Record<string, unknown>;
  requirements: Record<string, unknown>;
  quote_id?: string | null;
  quote_reference?: string | null;
  status: string;
  version: number;
  created_at: string;
}

// ── Query Keys ────────────────────────────────────────────────

const keys = {
  summary: (orgId: string) => queryKeys.organizationConsole.domain(orgId, "summary"),
  domain: (orgId: string, domain: string) => queryKeys.organizationConsole.domain(orgId, domain),
  events: (orgId: string) => queryKeys.organizationConsole.domain(orgId, "events"),
  eventDetail: (orgId: string, eventId: string) => queryKeys.organizationConsole.event(orgId, eventId),
  overrides: (orgId: string) => queryKeys.organizationConsole.domain(orgId, "override-requests"),
  usage: (orgId: string, eventId?: string) =>
    queryKeys.organizationConsole.domain(orgId, `usage:${eventId ?? "organization"}`),
  entitlements: (orgId: string, eventId: string) =>
    queryKeys.organizationConsole.eventDomain(orgId, eventId, "entitlements"),
  financialAdjustments: (orgId: string) =>
    queryKeys.organizationConsole.domain(orgId, "financial-adjustments"),
  privilegedAccess: (orgId: string) =>
    queryKeys.organizationConsole.domain(orgId, "privileged-access"),
  eventRegistrations: (orgId: string, eventId: string, sensitive: boolean) =>
    queryKeys.organizationConsole.eventDomain(orgId, eventId, "registrations", sensitive),
  eventWorkspace: (orgId: string, eventId: string, workspace: string, sensitive: boolean) =>
    queryKeys.organizationConsole.eventDomain(orgId, eventId, "workspace", workspace, sensitive),
  lifecycleJobs: (orgId: string) =>
    queryKeys.organizationConsole.domain(orgId, "lifecycle-jobs"),
  search: (orgId: string, query: string) =>
    queryKeys.organizationConsole.domain(orgId, `search:${query}`),
  exports: (orgId: string) => queryKeys.organizationConsole.domain(orgId, "exports"),
  audit: (orgId: string) => queryKeys.organizationConsole.domain(orgId, "audit-cursor"),
  rollout: (orgId: string) => queryKeys.organizationConsole.domain(orgId, "rollout"),
  diagnostics: (orgId: string) => queryKeys.organizationConsole.domain(orgId, "diagnostics"),
  commercialRequests: (orgId: string) =>
    queryKeys.organizationConsole.domain(orgId, "commercial-requests"),
};

// ── Hooks — Summary & Domain ──────────────────────────────────

export const useOrganizationConsoleSummary = (orgId: string) =>
  useQuery({
    queryKey: keys.summary(orgId),
    queryFn: () =>
      apiClient.get<OrganizationConsoleSummary>(
        `/platform/organizations/${orgId}/console/summary`
      ),
    enabled: Boolean(orgId),
    staleTime: 15_000,
  });

export const useOrganizationDomain = (
  orgId: string,
  domain: OrganizationWorkspaceKey
) =>
  useQuery({
    queryKey: keys.domain(orgId, domain),
    queryFn: () =>
      apiClient.get<OrganizationDomainSnapshot>(
        `/platform/organizations/${orgId}/console/${domain}`
      ),
    enabled: Boolean(orgId) && domain !== "overview",
    staleTime: 15_000,
  });

export type BrandConfigurationPayload = {
  assets: Record<string, unknown>;
  tokens: Record<string, unknown>;
  templates: Record<string, unknown>;
  white_label?: {
    enabled: boolean;
    product_name?: string | null;
    hide_eventos_branding: boolean;
    footer_text?: string | null;
    support_url?: string | null;
  };
  login_page?: {
    enabled: boolean;
    headline?: string | null;
    subheading?: string | null;
    logo_asset_ref?: string | null;
    background_asset_ref?: string | null;
    support_url?: string | null;
    terms_url?: string | null;
    privacy_url?: string | null;
  };
  version: number;
  reason: string;
};

export const useUpdateOrganizationBranding = (orgId: string) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: BrandConfigurationPayload) =>
      apiClient.put(
        `/platform/organizations/${orgId}/console/branding`,
        payload,
        { headers: { "If-Match": String(payload.version) } },
      ),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: keys.domain(orgId, "branding") }),
  });
};

export const usePublishOrganizationBranding = (orgId: string) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (version: number) =>
      apiClient.post(
        `/platform/organizations/${orgId}/console/branding/publish`,
        {},
        { headers: { "If-Match": String(version) } },
      ),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: keys.domain(orgId, "branding") }),
  });
};

export const useOrganizationAudit = (orgId: string) => useInfiniteQuery({
  queryKey: keys.audit(orgId),
  initialPageParam: "",
  queryFn: ({ pageParam }) => apiClient.get<OrganizationAuditPage>(`/platform/organizations/${orgId}/console/audit?limit=100${pageParam ? `&cursor=${encodeURIComponent(pageParam)}` : ""}`),
  getNextPageParam: page => page.next_cursor || undefined,
  enabled: Boolean(orgId),
});

export const useCreateImpersonationHandoff = (orgId: string) => useMutation({
  mutationFn: (payload: { target_user_id: string; reason: string; case_reference: string }) => apiClient.post<ImpersonationHandoff>(`/platform/organizations/${orgId}/console/impersonation-handoffs`, payload),
});

export const useOrganizerRollout = (orgId: string) => useQuery({ queryKey: keys.rollout(orgId), queryFn: () => apiClient.get<OrganizerRolloutStatus>(`/platform/organizations/${orgId}/console/rollout`), enabled: Boolean(orgId) });

export const useCapabilityDiagnostics = (orgId: string) => useQuery({
  queryKey: keys.diagnostics(orgId),
  queryFn: () => apiClient.get<CapabilityDiagnostics>(
    `/platform/organizations/${orgId}/console/diagnostics?since_hours=24&limit=100`
  ),
  enabled: Boolean(orgId),
  refetchInterval: 30_000,
  staleTime: 15_000,
});

export const useUpdateOrganizerRollout = (orgId: string) => {
  const queryClient = useQueryClient();
  return useMutation({ mutationFn: (payload: { shadow_enabled: boolean; enforcement_enabled: boolean; reason: string }) => apiClient.patch(`/platform/organizations/${orgId}/console/rollout`, payload), onSuccess: () => queryClient.invalidateQueries({ queryKey: keys.rollout(orgId) }) });
};

// ── Hooks — Events Directory & Event Console ─────────────────

export const useOrganizationEvents = (orgId: string) =>
  useQuery({
    queryKey: keys.events(orgId),
    queryFn: async () => {
      const res = await apiClient.get<{ items: OrganizationEventItem[] }>(
        `/platform/organizations/${orgId}/console/events?limit=100`,
      );
      return res.items;
    },
    enabled: Boolean(orgId),
    staleTime: 15_000,
  });

export const useProvisionOrganizationEvent = (orgId: string) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: {
      data: {
        name: string;
        short_code: string;
        status: "draft" | "active";
        start_date: string;
        end_date: string;
        timezone: string;
        location?: string;
        venue_name?: string;
        country?: string;
        currency: string;
      };
      reason: string;
      case_reference: string;
    }) =>
      apiClient.post<OrganizationEventItem>(
        `/platform/organizations/${orgId}/console/events`,
        payload,
        { headers: { "Idempotency-Key": crypto.randomUUID() } },
      ),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: keys.events(orgId) }),
  });
};

export const useUpdateEventStatus = (orgId: string, eventId: string) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: { is_maintenance?: boolean; is_read_only?: boolean; reason: string; case_reference: string }) =>
      apiClient.patch(`/platform/organizations/${orgId}/console/events/${eventId}/operations`, payload),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: keys.events(orgId) }),
        queryClient.invalidateQueries({ queryKey: keys.eventDetail(orgId, eventId) }),
      ]);
    },
  });
};

// ── Hooks — Regional & Currency Settings ──────────────────────

export const useUpdateRegionalSettings = (orgId: string) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: RegionalSettingsUpdate) =>
      apiClient.put(`/platform/organizations/${orgId}/console/regional`, payload),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: keys.summary(orgId) }),
        queryClient.invalidateQueries({ queryKey: keys.domain(orgId, "governance") }),
      ]);
    },
  });
};

// ── Hooks — Extra Usage Allocation & Entitlements ─────────────

export const useAllocateExtraUsage = (orgId: string) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: ExtraUsageAllocationInput & { event_id?: string; reason: string; case_reference: string }) =>
      apiClient.post(`/platform/organizations/${orgId}/console/override-requests`, {
        event_id: payload.event_id,
        entitlement_key: `usage.${payload.resource_type}`,
        operation: "INCREMENT",
        requested_value: { quantity: payload.quantity, unit: payload.resource_type === "storage" ? "GB" : "count" },
        reason: payload.reason,
        case_reference: payload.case_reference,
      }, { headers: { "Idempotency-Key": crypto.randomUUID() } }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: keys.domain(orgId, "commercial") });
    },
  });
};

export const useUpdateEntitlementOverride = (orgId: string) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: EntitlementOverrideRequestInput) =>
      apiClient.post(`/platform/organizations/${orgId}/console/override-requests`, payload, {
        headers: { "Idempotency-Key": crypto.randomUUID() },
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: keys.domain(orgId, "commercial") });
    },
  });
};

export const useEntitlementOverrideRequests = (orgId: string) =>
  useQuery({
    queryKey: keys.overrides(orgId),
    queryFn: () => apiClient.get<{ items: EntitlementOverrideRequestItem[] }>(`/platform/organizations/${orgId}/console/override-requests`),
    enabled: Boolean(orgId),
  });

export const useDecideEntitlementOverride = (orgId: string) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, version, decision, reason }: { id: string; version: number; decision: "APPROVED" | "REJECTED"; reason: string }) =>
      apiClient.post(`/platform/organizations/${orgId}/console/override-requests/${id}/decision`, { decision, reason }, {
        headers: { "If-Match": String(version), "Idempotency-Key": crypto.randomUUID() },
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: keys.overrides(orgId) }),
  });
};

export const useRequestEntitlementOverrideRevocation = (orgId: string) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, version, reason, case_reference }: { id: string; version: number; reason: string; case_reference: string }) =>
      apiClient.post(`/platform/organizations/${orgId}/console/override-requests/${id}/revocation-request`, { reason, case_reference }, {
        headers: { "If-Match": String(version), "Idempotency-Key": crypto.randomUUID() },
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: keys.overrides(orgId) }),
  });
};

export const useDecideEntitlementOverrideRevocation = (orgId: string) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, version, decision, reason }: { id: string; version: number; decision: "APPROVED" | "REJECTED"; reason: string }) =>
      apiClient.post(`/platform/organizations/${orgId}/console/override-requests/${id}/revocation-decision`, { decision, reason }, {
        headers: { "If-Match": String(version), "Idempotency-Key": crypto.randomUUID() },
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: keys.overrides(orgId) }),
  });
};

export const useCommercialRequests = (orgId: string) => useQuery({
  queryKey: keys.commercialRequests(orgId),
  queryFn: () => apiClient.get<CommercialRequestItem[]>(`/platform/commercial/requests?organization_id=${encodeURIComponent(orgId)}`),
  enabled: Boolean(orgId),
});

export const useDecideCommercialRequest = (orgId: string) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, version, decision, reason, quote_reference }: { id: string; version: number; decision: "APPROVED" | "REJECTED" | "QUOTE_ISSUED"; reason: string; quote_reference?: string }) =>
      apiClient.post(`/platform/commercial/requests/${id}/decision`, {
        decision,
        reason,
        quote_reference,
      }, { headers: { "If-Match": String(version), "Idempotency-Key": crypto.randomUUID() } }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: keys.commercialRequests(orgId) }),
        queryClient.invalidateQueries({ queryKey: keys.domain(orgId, "billing") }),
        queryClient.invalidateQueries({ queryKey: keys.summary(orgId) }),
      ]);
    },
  });
};

export type CapabilityRestrictionItem = {
  id: string; event_id?: string | null; capability_key?: string | null;
  restriction_type: string; reason_code: string; reason: string; case_reference: string;
  status: "PENDING" | "APPROVED" | "REJECTED" | "REVOKED" | "EXPIRED"; expires_at?: string | null; version: number;
  revocation_status?: "PENDING" | "APPROVED" | "REJECTED" | null;
  revocation_reason?: string | null;
  revocation_case_reference?: string | null;
};

export const useCapabilityRestrictions = (orgId: string) => useQuery({
  queryKey: keys.domain(orgId, "capability-restrictions"),
  queryFn: () => apiClient.get<{ items: CapabilityRestrictionItem[] }>(`/platform/organizations/${orgId}/console/restrictions`),
  enabled: Boolean(orgId),
});

export const useRequestCapabilityRestriction = (orgId: string) => {
  const queryClient = useQueryClient();
  return useMutation({ mutationFn: (payload: { event_id?: string; capability_key?: string; restriction_type: "SECURITY" | "OPERATIONAL" | "COMPLIANCE" | "SUSPENSION"; reason_code: "SUSPENDED" | "SECURITY_RESTRICTED" | "ROLLOUT_DISABLED" | "PROVIDER_UNAVAILABLE"; reason: string; case_reference: string; expires_at?: string }) => apiClient.post(`/platform/organizations/${orgId}/console/restrictions`, payload, { headers: { "Idempotency-Key": crypto.randomUUID() } }), onSuccess: () => queryClient.invalidateQueries({ queryKey: keys.domain(orgId, "capability-restrictions") }) });
};

export const useDecideCapabilityRestriction = (orgId: string) => {
  const queryClient = useQueryClient();
  return useMutation({ mutationFn: ({ id, version, decision, reason }: { id: string; version: number; decision: "APPROVED" | "REJECTED"; reason: string }) => apiClient.post(`/platform/organizations/${orgId}/console/restrictions/${id}/decision`, { decision, reason }, { headers: { "If-Match": String(version), "Idempotency-Key": crypto.randomUUID() } }), onSuccess: () => queryClient.invalidateQueries({ queryKey: keys.domain(orgId, "capability-restrictions") }) });
};

export const useRequestCapabilityRestrictionRevocation = (orgId: string) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, version, reason, case_reference }: { id: string; version: number; reason: string; case_reference: string }) =>
      apiClient.post(`/platform/organizations/${orgId}/console/restrictions/${id}/revocation-request`, { reason, case_reference }, { headers: { "If-Match": String(version), "Idempotency-Key": crypto.randomUUID() } }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: keys.domain(orgId, "capability-restrictions") }),
  });
};

export const useDecideCapabilityRestrictionRevocation = (orgId: string) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, version, decision, reason }: { id: string; version: number; decision: "APPROVED" | "REJECTED"; reason: string }) =>
      apiClient.post(`/platform/organizations/${orgId}/console/restrictions/${id}/revocation-decision`, { decision, reason }, { headers: { "If-Match": String(version), "Idempotency-Key": crypto.randomUUID() } }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: keys.domain(orgId, "capability-restrictions") }),
  });
};

export const useResolvedEntitlements = (orgId: string, eventId: string) =>
  useQuery({
    queryKey: keys.entitlements(orgId, eventId),
    queryFn: () => apiClient.get<ResolvedEntitlements>(`/platform/organizations/${orgId}/console/events/${eventId}/entitlements/resolved`),
    enabled: Boolean(orgId && eventId),
  });

export const useOrganizationUsage = (orgId: string, eventId?: string) =>
  useQuery({
    queryKey: keys.usage(orgId, eventId),
    queryFn: () => apiClient.get<{ items: Array<{ metric_key: string; unit: string; quantity: number; freshness_at?: string }> }>(`/platform/organizations/${orgId}/console/usage${eventId ? `?event_id=${eventId}` : ""}`),
    enabled: Boolean(orgId),
  });

export const useApplyDiscount = (orgId: string) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: DiscountInput) =>
      apiClient.post(`/platform/organizations/${orgId}/console/financial-adjustments`, { adjustment_type: "DISCOUNT", amount: payload.value, currency: "INR", reason: payload.reason, case_reference: "COMMAND-CENTER", expires_at: payload.expires_at, details: { discount_type: payload.discount_type } }, { headers: { "Idempotency-Key": crypto.randomUUID() } }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: keys.domain(orgId, "commercial") });
    },
  });
};

export const useAdjustCreditWallet = (orgId: string) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: CreditWalletAdjustmentInput) =>
      apiClient.post(`/platform/organizations/${orgId}/console/financial-adjustments`, { adjustment_type: payload.type, amount: payload.amount, currency: "INR", reason: payload.reason, case_reference: "COMMAND-CENTER", details: { source: "CREDIT_WALLET" } }, { headers: { "Idempotency-Key": crypto.randomUUID() } }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: keys.domain(orgId, "commercial") });
    },
  });
};

export interface FinancialAdjustmentItem {
  id: string; adjustment_type: "CREDIT" | "DEBIT" | "DISCOUNT"; amount: number; currency: string;
  reason: string; case_reference: string; status: "PENDING" | "APPROVED" | "REJECTED";
  requested_by: string; approved_by?: string | null; created_at: string; effective_at?: string | null;
  version: number;
}

export const useFinancialAdjustments = (orgId: string) => useQuery({
  queryKey: keys.financialAdjustments(orgId),
  queryFn: () => apiClient.get<{ items: FinancialAdjustmentItem[] }>(`/platform/organizations/${orgId}/console/financial-adjustments`),
  enabled: Boolean(orgId),
});

export const useDecideFinancialAdjustment = (orgId: string) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, version, decision, reason }: { id: string; version: number; decision: "APPROVED" | "REJECTED"; reason: string }) => apiClient.post(`/platform/organizations/${orgId}/console/financial-adjustments/${id}/decision`, { decision, reason }, { headers: { "If-Match": String(version), "Idempotency-Key": crypto.randomUUID() } }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: keys.financialAdjustments(orgId) }),
  });
};

export interface PrivilegedAccessSessionItem { id: string; field_categories: string[]; case_reference: string; created_at: string; expires_at: string; revoked_at?: string | null; active: boolean }

export const usePrivilegedAccessSessions = (orgId: string) => useQuery({
  queryKey: keys.privilegedAccess(orgId),
  queryFn: () => apiClient.get<{ items: PrivilegedAccessSessionItem[] }>(`/platform/organizations/${orgId}/console/privileged-access-sessions`),
  enabled: Boolean(orgId),
});

export const useCreatePrivilegedAccessSession = (orgId: string) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: { reason: string; case_reference: string; field_categories: Array<"IDENTITY" | "CONTACT" | "PAYMENT" | "AUTHENTICATION">; duration_minutes: number }) => apiClient.post(`/platform/organizations/${orgId}/console/privileged-access-sessions`, payload),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: keys.privilegedAccess(orgId) }),
  });
};

export const useRevokePrivilegedAccessSession = (orgId: string) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (sessionId: string) => apiClient.delete(`/platform/organizations/${orgId}/console/privileged-access-sessions/${sessionId}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: keys.privilegedAccess(orgId) }),
  });
};

export interface EventRegistrationItem { id: string; participant_id?: string | null; status: string; registration_data: Record<string, unknown>; submitted_at: string; reviewed_by?: string | null; reviewed_at?: string | null; review_notes?: string | null; waitlist_position?: number | null; rejection_reason?: string | null }

export const useEventRegistrationWorkspace = (orgId: string, eventId: string, includeSensitive = false, privilegedAccessSession?: string) => useQuery({
  queryKey: keys.eventRegistrations(orgId, eventId, includeSensitive),
  queryFn: () => apiClient.get<{ items: EventRegistrationItem[]; next_cursor?: string | null; has_more: boolean; sensitive_data_included: boolean; freshness_at: string; source: string }>(`/platform/organizations/${orgId}/console/events/${eventId}/workspace/registrations?include_sensitive=${includeSensitive}`, { headers: privilegedAccessSession ? { "X-Privileged-Access-Session": privilegedAccessSession } : undefined }),
  enabled: Boolean(orgId && eventId),
});

export const useCorrectEventRegistration = (orgId: string, eventId: string) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ registrationId, status, reason, case_reference, rejection_reason }: { registrationId: string; status: "APPROVED" | "REJECTED" | "WAITLISTED"; reason: string; case_reference: string; rejection_reason?: string }) => apiClient.post(`/platform/organizations/${orgId}/console/events/${eventId}/workspace/registrations/${registrationId}/correction`, { status, reason, case_reference, rejection_reason }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: keys.eventDetail(orgId, eventId) }),
  });
};

export interface EventDomainWorkspace { workspace: string; event_id: string; generated_at: string; availability: { available: boolean; reason?: string; freshness_at?: string }; source: string; sensitive_data_included: boolean; data: Record<string, unknown> }

export const useEventDomainWorkspace = (orgId: string, eventId: string, workspace: string, includeSensitive = false, privilegedAccessSession?: string) => useQuery({
  queryKey: keys.eventWorkspace(orgId, eventId, workspace, includeSensitive),
  queryFn: () => apiClient.get<EventDomainWorkspace>(`/platform/organizations/${orgId}/console/events/${eventId}/workspace/${workspace}?include_sensitive=${includeSensitive}&include_archived=${["attendees", "speakers", "sessions", "rooms", "integrations", "communications", "templates"].includes(workspace)}`, { headers: privilegedAccessSession ? { "X-Privileged-Access-Session": privilegedAccessSession } : undefined }),
  enabled: Boolean(orgId && eventId) && ["overview", "settings", "operations", "attendees", "speakers", "abstracts", "sessions", "rooms", "communications", "templates", "files", "payments", "tickets", "checkins", "users", "jobs", "integrations", "analytics", "audit"].includes(workspace),
});

export const useUpdateEventSettings = (orgId: string, eventId: string) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ version, idempotencyKey, ...payload }: {
      data: Record<string, unknown>; reason: string; case_reference: string;
      version: number; idempotencyKey: string;
    }) => apiClient.patch<{ version: number }>(
      `/platform/organizations/${orgId}/console/events/${eventId}/settings`, payload,
      { headers: { "If-Match": String(version), "Idempotency-Key": idempotencyKey } }),
    retry: false,
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: keys.events(orgId) }),
        queryClient.invalidateQueries({ queryKey: keys.eventDetail(orgId, eventId) }),
        queryClient.invalidateQueries({ queryKey: keys.eventWorkspace(orgId, eventId, "settings", false) }),
        queryClient.invalidateQueries({ queryKey: keys.eventWorkspace(orgId, eventId, "settings", true) }),
      ]);
    },
  });
};

export const useCreateEventWorkspaceResource = (orgId: string, eventId: string, workspace: string) => {
  const queryClient = useQueryClient();
  return useMutation({ mutationFn: (payload: { data: Record<string, unknown>; reason: string; case_reference: string }) => apiClient.post(`/platform/organizations/${orgId}/console/events/${eventId}/workspace/${workspace}`, payload, { headers: { "Idempotency-Key": crypto.randomUUID() } }), onSuccess: () => queryClient.invalidateQueries({ queryKey: keys.eventDetail(orgId, eventId) }) });
};

export const useUpdateEventWorkspaceResource = (orgId: string, eventId: string, workspace: string) => {
  const queryClient = useQueryClient();
  return useMutation({ mutationFn: ({ resourceId, version, ...payload }: { resourceId: string; version?: number; data: Record<string, unknown>; reason: string; case_reference: string }) => apiClient.patch(`/platform/organizations/${orgId}/console/events/${eventId}/workspace/${workspace}/${resourceId}`, payload, { headers: { "Idempotency-Key": crypto.randomUUID(), ...(version ? { "If-Match": String(version) } : {}) } }), onSuccess: () => queryClient.invalidateQueries({ queryKey: keys.eventDetail(orgId, eventId) }) });
};

export const useArchiveEventWorkspaceResource = (orgId: string, eventId: string, workspace: string) => {
  const queryClient = useQueryClient();
  return useMutation({ mutationFn: ({ resourceId, version, reason, case_reference }: { resourceId: string; version?: number; reason: string; case_reference: string }) => apiClient.delete(`/platform/organizations/${orgId}/console/events/${eventId}/workspace/${workspace}/${resourceId}`, { headers: { "Idempotency-Key": crypto.randomUUID(), ...(version ? { "If-Match": String(version) } : {}) }, data: { reason, case_reference } }), onSuccess: () => queryClient.invalidateQueries({ queryKey: keys.eventDetail(orgId, eventId) }) });
};

export const useRestoreEventWorkspaceResource = (orgId: string, eventId: string, workspace: string) => {
  const queryClient = useQueryClient();
  return useMutation({ mutationFn: ({ resourceId, version, reason, case_reference }: { resourceId: string; version?: number; reason: string; case_reference: string }) => apiClient.post(`/platform/organizations/${orgId}/console/events/${eventId}/workspace/${workspace}/${resourceId}/restore`, { reason, case_reference }, { headers: { "Idempotency-Key": crypto.randomUUID(), ...(version ? { "If-Match": String(version) } : {}) } }), onSuccess: () => queryClient.invalidateQueries({ queryKey: keys.eventDetail(orgId, eventId) }) });
};

export type EventWorkspaceAction = "APPROVE" | "REJECT" | "LOCK" | "UNLOCK" | "RETRY_PROCESSING" | "RETRY_JOB" | "SEND" | "RESEND_FAILED" | "CANCEL" | "RECORD_REFUND" | "SET_PRICING" | "CHECK_IN" | "REMOVE_CHECK_IN" | "ASSIGN_USER" | "UNASSIGN_USER" | "START_REVIEW" | "REQUEST_REVISION" | "ISSUE_CONFIRMATION_QR" | "ROTATE_CONFIRMATION_QR";

export const useExecuteEventWorkspaceAction = (orgId: string, eventId: string, workspace: string) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ resourceId, ...payload }: { resourceId: string; action: EventWorkspaceAction; reason: string; case_reference: string; approved_request_id?: string; data?: Record<string, unknown> }) => apiClient.post(`/platform/organizations/${orgId}/console/events/${eventId}/workspace/${workspace}/${resourceId}/actions`, payload, { headers: { "Idempotency-Key": crypto.randomUUID() } }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: keys.eventDetail(orgId, eventId) }),
  });
};

// ── Hooks — Internal Admin & Impersonation ────────────────────

export const useSecurityPolicyUpdate = (orgId: string) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: SecurityPolicyUpdate) =>
      apiClient.put(`/platform/organizations/${orgId}/console/security/policy`, payload, { headers: { "If-Match": String(payload.version) } }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: keys.summary(orgId) }),
        queryClient.invalidateQueries({ queryKey: keys.domain(orgId, "security") }),
      ]);
    },
  });
};

export const useRevokeTrustedDevice = (orgId: string) => {
  const queryClient = useQueryClient();
  return useMutation({ mutationFn: ({ deviceId, reason }: { deviceId: string; reason: string }) => apiClient.post(`/platform/organizations/${orgId}/console/security/trusted-devices/${deviceId}/revoke`, { reason }), onSuccess: () => queryClient.invalidateQueries({ queryKey: keys.domain(orgId, "security") }) });
};

export const useRevokeOrganizationSessions = (orgId: string) => useMutation({ mutationFn: (reason: string) => apiClient.post(`/platform/organizations/${orgId}/console/security/sessions/revoke-all`, { reason }) });

export const useUpdateOrganizationMember = (orgId: string) => {
  const queryClient = useQueryClient();
  const receipt = useRef({ signature: "", key: "" });
  return useMutation({ retry: false, mutationFn: ({ memberId, orgRole, reason, version }: { memberId: string; orgRole: string; reason: string; version: number }) => {
    const signature = JSON.stringify([orgId, memberId, orgRole, reason, version]);
    if (receipt.current.signature !== signature) receipt.current = { signature, key: crypto.randomUUID() };
    return apiClient.patch(`/platform/organisations/${orgId}/members/${memberId}`, { org_role: orgRole, reason },
      { headers: { "If-Match": String(version), "Idempotency-Key": receipt.current.key } });
  }, onSuccess: () => queryClient.invalidateQueries({ queryKey: keys.domain(orgId, "members") }) });
};

export const useOrganizationMemberDirectory = (orgId: string, cursor: string | null) => useQuery({
  queryKey: [...keys.domain(orgId, "members"), "directory", cursor],
  queryFn: ({ signal }) => apiClient.get<{ items: Array<Record<string, any>>; next_cursor: string | null; has_next: boolean }>(
    `/platform/organisations/${orgId}/member-directory`, { params: { cursor: cursor ?? undefined, limit: 50 }, signal }),
  enabled: !!orgId, retry: false, staleTime: 0,
});

export const useInviteOrganizationMember = (orgId: string) => {
  const queryClient = useQueryClient();
  const receipt = useRef({ signature: "", key: "" });
  return useMutation({ retry: false, mutationFn: (payload: { email: string; org_role: string; reason: string }) => {
    const signature = JSON.stringify([orgId, payload]);
    if (receipt.current.signature !== signature) receipt.current = { signature, key: crypto.randomUUID() };
    return apiClient.post<{ invite_token: string | null; replayed: boolean; message: string }>(`/platform/organisations/${orgId}/members`, payload,
      { headers: { "Idempotency-Key": receipt.current.key } });
  }, onSuccess: () => queryClient.invalidateQueries({ queryKey: keys.domain(orgId, "members") }) });
};

export const useRemoveOrganizationMember = (orgId: string) => {
  const queryClient = useQueryClient();
  const receipt = useRef({ signature: "", key: "" });
  return useMutation({ retry: false, mutationFn: ({ memberId, reason, version }: { memberId: string; reason: string; version: number }) => {
    const signature = JSON.stringify([orgId, memberId, reason, version]);
    if (receipt.current.signature !== signature) receipt.current = { signature, key: crypto.randomUUID() };
    return apiClient.delete(`/platform/organisations/${orgId}/members/${memberId}`, { data: { reason },
      headers: { "If-Match": String(version), "Idempotency-Key": receipt.current.key } });
  }, onSuccess: () => queryClient.invalidateQueries({ queryKey: keys.domain(orgId, "members") }) });
};

export const useReplaceOrganizationInvitation = (orgId: string) => {
  const queryClient = useQueryClient();
  const receipt = useRef({ signature: "", key: "" });
  return useMutation({ retry: false, mutationFn: ({ memberId, reason, version }: { memberId: string; reason: string; version: number }) => {
    const signature = JSON.stringify([orgId, memberId, reason, version]);
    if (receipt.current.signature !== signature) receipt.current = { signature, key: crypto.randomUUID() };
    return apiClient.post<{ invite_token: string | null; version: number }>(`/platform/organisations/${orgId}/members/${memberId}/invitation/resend`, { reason },
      { headers: { "If-Match": String(version), "Idempotency-Key": receipt.current.key } });
  }, onSuccess: () => queryClient.invalidateQueries({ queryKey: keys.domain(orgId, "members") }) });
};

export const useSetOrganizationMemberEvent = (orgId: string) => {
  const queryClient = useQueryClient();
  const receipt = useRef({ signature: "", key: "" });
  return useMutation({ retry: false, mutationFn: ({ memberId, eventId, assigned, reason, version }: { memberId: string; eventId: string; assigned: boolean; reason: string; version: number }) => {
    const signature = JSON.stringify([orgId, memberId, eventId, assigned, reason, version]);
    if (receipt.current.signature !== signature) receipt.current = { signature, key: crypto.randomUUID() };
    const headers = { "If-Match": String(version), "Idempotency-Key": receipt.current.key };
    const path = `/platform/organisations/${orgId}/members/${memberId}/events/${eventId}`;
    return assigned ? apiClient.put(path, { permissions: { "EVENTS:VIEW": true }, reason }, { headers }) : apiClient.delete(path, { headers, data: { reason } });
  }, onSuccess: () => queryClient.invalidateQueries({ queryKey: keys.domain(orgId, "members") }) });
};

export type OrganizationTeam = { id: string; name: string; description?: string | null; version: number; member_ids: string[]; events: Array<{ event_id: string; permissions: Record<string, unknown>; authorization_version: 0 | 1 }>; created_at: string; updated_at: string };
export type OrganizationTeamMutation = Pick<OrganizationTeam, "id" | "name" | "description" | "version" | "updated_at"> & {
  status: "ACTIVE" | "ARCHIVED"; owner_member_id: string | null; deleted_at: string | null; policy_revision: number; correlation_id: string;
};

export const useOrganizationTeams = (orgId: string) => useQuery({ queryKey: keys.domain(orgId, "teams"), retry: false, staleTime: 0,
  queryFn: ({ signal }) => apiClient.get<{ items: OrganizationTeam[] }>(`/platform/organizations/${orgId}/console/teams`, { signal }), enabled: Boolean(orgId) });

export const useCreateOrganizationTeam = (orgId: string) => {
  const queryClient = useQueryClient();
  const receipt = useRef<{ signature: string; key: string } | null>(null);
  return useMutation({ retry: false, mutationFn: (payload: { name: string; description?: string; reason: string }) => {
    const signature = JSON.stringify({ orgId, payload });
    if (receipt.current?.signature !== signature) receipt.current = { signature, key: crypto.randomUUID() };
    return apiClient.post<OrganizationTeam>(`/platform/organizations/${orgId}/console/teams`, payload,
      { headers: { "Idempotency-Key": receipt.current.key } });
  }, onSuccess: () => { receipt.current = null; return queryClient.invalidateQueries({ queryKey: keys.domain(orgId, "teams") }); } });
};

export const useUpdateOrganizationTeam = (orgId: string) => {
  const queryClient = useQueryClient();
  const receipt = useRef<{ signature: string; key: string } | null>(null);
  return useMutation({ retry: false, mutationFn: ({ teamId, version, ...payload }: { teamId: string; version: number; name: string; description?: string; reason: string }) => {
    const signature = JSON.stringify({ orgId, teamId, version, payload });
    if (receipt.current?.signature !== signature) receipt.current = { signature, key: crypto.randomUUID() };
    return apiClient.patch<OrganizationTeamMutation>(`/platform/organizations/${orgId}/console/teams/${teamId}`, payload,
      { headers: { "If-Match": String(version), "Idempotency-Key": receipt.current.key } });
  }, onSuccess: () => { receipt.current = null; return queryClient.invalidateQueries({ queryKey: keys.domain(orgId, "teams") }); } });
};

export const useArchiveOrganizationTeam = (orgId: string) => {
  const queryClient = useQueryClient();
  const receipt = useRef<{ signature: string; key: string } | null>(null);
  return useMutation({ retry: false, mutationFn: ({ teamId, version, reason }: { teamId: string; version: number; reason: string }) => {
    const payload = { reason }; const signature = JSON.stringify({ orgId, teamId, version, payload });
    if (receipt.current?.signature !== signature) receipt.current = { signature, key: crypto.randomUUID() };
    return apiClient.delete<OrganizationTeamMutation>(`/platform/organizations/${orgId}/console/teams/${teamId}`,
      { headers: { "If-Match": String(version), "Idempotency-Key": receipt.current.key }, data: payload });
  }, onSuccess: () => { receipt.current = null; return queryClient.invalidateQueries({ queryKey: keys.domain(orgId, "teams") }); } });
};

export const useSetOrganizationTeamMember = (orgId: string) => {
  const queryClient = useQueryClient();
  const receipt = useRef<{ signature: string; key: string } | null>(null);
  return useMutation({ retry: false, mutationFn: ({ teamId, memberId, assigned, reason, version }: { teamId: string; memberId: string; assigned: boolean; reason: string; version: number }) => {
    const signature = JSON.stringify({ orgId, teamId, memberId, assigned, reason, version });
    if (receipt.current?.signature !== signature) receipt.current = { signature, key: crypto.randomUUID() };
    const headers = { "If-Match": String(version), "Idempotency-Key": receipt.current.key };
    const path = `/platform/organizations/${orgId}/console/teams/${teamId}/members/${memberId}`;
    return assigned ? apiClient.put<TeamMemberMutation>(path, { reason }, { headers })
      : apiClient.delete<TeamMemberMutation>(path, { data: { reason }, headers });
  }, onSuccess: () => { receipt.current = null; return queryClient.invalidateQueries({ queryKey: keys.domain(orgId, "teams") }); } });
};

type TeamMemberMutation = { team_id: string; member_id: string; assigned: boolean; team_version: number; policy_revision: number; correlation_id: string };

export const useSetOrganizationTeamEvent = (orgId: string) => {
  const queryClient = useQueryClient();
  const receipt = useRef<{ signature: string; key: string } | null>(null);
  return useMutation({ retry: false, mutationFn: ({ teamId, eventId, assigned, permissions, reason, version }: { teamId: string; eventId: string; assigned: boolean; permissions: Record<string, boolean>; reason: string; version: number }) => {
    const signature = JSON.stringify({ orgId, teamId, eventId, assigned, permissions, reason, version });
    if (receipt.current?.signature !== signature) receipt.current = { signature, key: crypto.randomUUID() };
    const headers = { "If-Match": String(version), "Idempotency-Key": receipt.current.key };
    const path = `/platform/organizations/${orgId}/console/teams/${teamId}/events/${eventId}`;
    return assigned ? apiClient.put<TeamEventMutation>(path, { reason, permissions }, { headers })
      : apiClient.delete<TeamEventMutation>(path, { data: { reason }, headers });
  }, onSuccess: () => { receipt.current = null; return queryClient.invalidateQueries({ queryKey: keys.domain(orgId, "teams") }); } });
};

type TeamEventMutation = { team_id: string; event_id: string; assigned: boolean; authorization_version: 0 | 1; permissions: Record<string, boolean>; team_version: number; policy_revision: number; correlation_id: string };

export const useOrganizationTeamEventActions = (orgId: string, eventId: string) => useQuery({
  queryKey: [...keys.domain(orgId, "teams"), "grantable-actions", eventId], enabled: !!orgId && !!eventId,
  retry: false, staleTime: 0, queryFn: ({ signal }) => apiClient.get<{ event_id: string; actions: string[] }>(
    `/platform/organizations/${orgId}/console/teams/event-actions`, { signal, params: { event_id: eventId } }),
});

type NotificationRulePayload = { name: string; trigger_key: string; channel: "EMAIL" | "SMS" | "WHATSAPP" | "PUSH" | "IN_APP" | "WEBHOOK"; recipients: Record<string, unknown>; conditions: Record<string, unknown>; escalation_policy: Record<string, unknown>; is_enabled: boolean; reason: string; template_id?: string };
type NotificationChannelPayload = { channel: "EMAIL" | "SMS" | "WHATSAPP" | "PUSH" | "IN_APP" | "WEBHOOK"; provider: string; state: "UNAVAILABLE" | "CONFIGURED" | "ACTIVE" | "PAUSED" | "DEGRADED"; secret_reference?: string; configuration: Record<string, unknown>; reason: string };
const invalidateNotifications = (queryClient: ReturnType<typeof useQueryClient>, orgId: string) => queryClient.invalidateQueries({ queryKey: keys.domain(orgId, "notifications") });

export const useCreateNotificationRule = (orgId: string) => { const queryClient = useQueryClient(); return useMutation({ mutationFn: (payload: NotificationRulePayload) => apiClient.post(`/platform/organizations/${orgId}/console/notification-rules`, payload), onSuccess: () => invalidateNotifications(queryClient, orgId) }); };
export const useUpdateNotificationRule = (orgId: string) => { const queryClient = useQueryClient(); return useMutation({ mutationFn: ({ ruleId, version, ...payload }: NotificationRulePayload & { ruleId: string; version: number }) => apiClient.patch(`/platform/organizations/${orgId}/console/notification-rules/${ruleId}`, payload, { headers: { "If-Match": String(version) } }), onSuccess: () => invalidateNotifications(queryClient, orgId) }); };
export const useArchiveNotificationRule = (orgId: string) => { const queryClient = useQueryClient(); return useMutation({ mutationFn: ({ ruleId, version, reason }: { ruleId: string; version: number; reason: string }) => apiClient.delete(`/platform/organizations/${orgId}/console/notification-rules/${ruleId}`, { headers: { "If-Match": String(version) }, data: { reason } }), onSuccess: () => invalidateNotifications(queryClient, orgId) }); };
export const useCreateNotificationChannel = (orgId: string) => { const queryClient = useQueryClient(); return useMutation({ mutationFn: (payload: NotificationChannelPayload) => apiClient.post(`/platform/organizations/${orgId}/console/notification-channels`, payload), onSuccess: () => invalidateNotifications(queryClient, orgId) }); };
export const useUpdateNotificationChannel = (orgId: string) => { const queryClient = useQueryClient(); return useMutation({ mutationFn: ({ channelId, version, ...payload }: NotificationChannelPayload & { channelId: string; version: number }) => apiClient.patch(`/platform/organizations/${orgId}/console/notification-channels/${channelId}`, payload, { headers: { "If-Match": String(version) } }), onSuccess: () => invalidateNotifications(queryClient, orgId) }); };
export const useArchiveNotificationChannel = (orgId: string) => { const queryClient = useQueryClient(); return useMutation({ mutationFn: ({ channelId, version, reason }: { channelId: string; version: number; reason: string }) => apiClient.delete(`/platform/organizations/${orgId}/console/notification-channels/${channelId}`, { headers: { "If-Match": String(version) }, data: { reason } }), onSuccess: () => invalidateNotifications(queryClient, orgId) }); };
export const useVerifyNotificationChannel = (orgId: string) => { const queryClient = useQueryClient(); return useMutation({ mutationFn: ({ channelId, version, reason, caseReference }: { channelId: string; version: number; reason: string; caseReference?: string }) => apiClient.post(`/platform/organizations/${orgId}/console/notification-channels/${channelId}/verify`, { reason, case_reference: caseReference }, { headers: { "If-Match": String(version) } }), onSuccess: () => invalidateNotifications(queryClient, orgId) }); };


export const useCreateOrganizationApiKey = (orgId: string) => {
  const queryClient = useQueryClient();
  return useMutation({ mutationFn: ({ payload, idempotencyKey }: { payload: { name: string; expires_in_days?: number; reason: string; case_reference: string }; idempotencyKey: string }) => apiClient.post<{ id: string; name: string; prefix: string; plaintext_key?: string | null; secret_available: boolean }>(`/platform/organizations/${orgId}/console/api-keys`, payload, { headers: { "Idempotency-Key": idempotencyKey } }), onSuccess: () => queryClient.invalidateQueries({ queryKey: keys.domain(orgId, "api-webhooks") }) });
};

export const useRevokeOrganizationApiKey = (orgId: string) => {
  const queryClient = useQueryClient();
  return useMutation({ mutationFn: ({ keyId, reason }: { keyId: string; reason: string }) => apiClient.post(`/platform/organizations/${orgId}/console/api-keys/${keyId}/revoke`, { reason }), onSuccess: () => queryClient.invalidateQueries({ queryKey: keys.domain(orgId, "api-webhooks") }) });
};

export const useCreateIntegrationConnection = (orgId: string) => {
  const queryClient = useQueryClient();
  return useMutation({ mutationFn: ({ payload, idempotencyKey }: { payload: { provider_id: string; reason: string; case_reference: string }; idempotencyKey: string }) => apiClient.post(`/platform/organizations/${orgId}/console/integrations/connections`, payload, { headers: { "Idempotency-Key": idempotencyKey } }), onSuccess: () => queryClient.invalidateQueries({ queryKey: keys.domain(orgId, "integrations") }) });
};

export const useUpdateIntegrationConnection = (orgId: string) => {
  const queryClient = useQueryClient();
  return useMutation({ mutationFn: ({ connectionId, version, ...payload }: { connectionId: string; version: number; is_active: boolean; reason: string; case_reference: string }) => apiClient.patch(`/platform/organizations/${orgId}/console/integrations/connections/${connectionId}`, payload, { headers: { "If-Match": String(version) } }), onSuccess: () => queryClient.invalidateQueries({ queryKey: keys.domain(orgId, "integrations") }) });
};

export const useCreateLifecycleJob = (orgId: string) => {
  const queryClient = useQueryClient();
  const receipt = useRef({ signature: "", key: "" });
  return useMutation({
    retry: false,
    mutationFn: async ({
      payload,
      idempotencyKey,
      stepUpToken,
      organizationVersion,
    }: {
      payload: LifecycleJobCreate;
      idempotencyKey: string;
      stepUpToken?: string;
      organizationVersion: number;
    }) => {
      if (destructiveLifecycleUnavailable(payload.job_type)) throw new Error(destructiveLifecycleUnavailableReason);
      if (!Number.isInteger(organizationVersion) || organizationVersion < 1) throw new Error("Reload the organisation before requesting a lifecycle change.");
      const signature = JSON.stringify([orgId, payload, organizationVersion]);
      if (receipt.current.signature !== signature) receipt.current = { signature, key: idempotencyKey };
      return apiClient.post<LifecycleJobOut>(
        `/platform/organizations/${orgId}/console/advanced/jobs`,
        payload,
        {
          headers: {
            "Idempotency-Key": receipt.current.key,
            "If-Match": String(organizationVersion),
            ...(stepUpToken ? { "X-Step-Up-Token": stepUpToken } : {}),
          },
        }
      );
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: keys.summary(orgId) }),
        queryClient.invalidateQueries({ queryKey: keys.domain(orgId, "internal-admin") }),
        queryClient.invalidateQueries({ queryKey: keys.lifecycleJobs(orgId) }),
      ]);
    },
  });
};

export const useLifecycleJobs = (orgId: string) => useQuery({
  queryKey: keys.lifecycleJobs(orgId),
  queryFn: ({ signal }) => apiClient.get<LifecycleJobOut[]>(`/platform/organizations/${orgId}/console/advanced/jobs`, { signal }),
  enabled: !!orgId, retry: false, staleTime: 0,
  refetchInterval: (query) => query.state.status !== "error" && query.state.data?.some((job) => ["PENDING", "RETRY_PENDING", "RUNNING"].includes(job.status)) ? 3000 : false,
});

export const useDecideLifecycleJob = (orgId: string) => {
  const queryClient = useQueryClient();
  const receipt = useRef({ signature: "", key: "" });
  return useMutation({
    retry: false,
    mutationFn: ({ jobId, decision, reason, version }: { jobId: string; decision: "APPROVED" | "REJECTED"; reason: string; version: number }) => {
      const signature = JSON.stringify([orgId, jobId, decision, reason, version]);
      if (receipt.current.signature !== signature) receipt.current = { signature, key: crypto.randomUUID() };
      return apiClient.post<LifecycleJobOut>(`/platform/organizations/${orgId}/console/advanced/jobs/${jobId}/approval`, { decision, reason, version },
        { headers: { "If-Match": String(version), "Idempotency-Key": receipt.current.key } });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: keys.lifecycleJobs(orgId) }),
  });
};

export const useRetryLifecycleJob = (orgId: string) => {
  const queryClient = useQueryClient();
  const receipt = useRef({ signature: "", key: "" });
  return useMutation({
    retry: false,
    mutationFn: ({ jobId, reason, version }: { jobId: string; reason: string; version: number }) => {
      const signature = JSON.stringify([orgId, jobId, reason, version]);
      if (receipt.current.signature !== signature) receipt.current = { signature, key: crypto.randomUUID() };
      return apiClient.post<LifecycleJobOut>(`/platform/organizations/${orgId}/console/advanced/jobs/${jobId}/retry`, { decision: "APPROVED", reason, version },
        { headers: { "If-Match": String(version), "Idempotency-Key": receipt.current.key } });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: keys.lifecycleJobs(orgId) }),
  });
};

export const useOrganizationConsoleSearch = (orgId: string, query: string) => useQuery({
  queryKey: keys.search(orgId, query.trim()),
  queryFn: () => apiClient.get<OrganizationSearchResponse>(`/platform/organizations/${orgId}/console/search`, { params: { q: query.trim(), limit: 20 } }),
  enabled: query.trim().length >= 2,
  staleTime: 15_000,
});

export const useConsoleExports = (orgId: string) => useQuery({
  queryKey: keys.exports(orgId), queryFn: () => apiClient.get<ConsoleExportJob[]>(`/platform/organizations/${orgId}/console/exports`),
  refetchInterval: query => query.state.data?.some(job => ["QUEUED", "RUNNING"].includes(job.status)) ? 3000 : false,
});

export const useCreateConsoleExport = (orgId: string) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ payload, idempotencyKey, privilegedAccessSession }: { payload: { domains: string[]; event_id?: string; include_sensitive: boolean; reason: string; case_reference: string }; idempotencyKey: string; privilegedAccessSession?: string }) => apiClient.post<ConsoleExportJob>(`/platform/organizations/${orgId}/console/exports`, payload, { headers: { "Idempotency-Key": idempotencyKey, ...(privilegedAccessSession ? { "X-Privileged-Access-Session": privilegedAccessSession } : {}) } }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: keys.exports(orgId) }),
  });
};

export const downloadConsoleExport = (orgId: string, exportId: string) => apiClient.get<{ download_url: string; filename: string; expires_in: number }>(`/platform/organizations/${orgId}/console/exports/${exportId}/download`);
