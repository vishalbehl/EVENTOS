/**
 * Super Admin Service — Event OS Control Plane
 * All typed API calls for the Super Admin Console.
 * Uses existing apiClient from lib/api-client.ts
 */

import { useQuery, useMutation, useQueryClient, QueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import { toast } from "sonner";
import { platformKey, adminKeys, queryKeys } from "@/lib/query-keys";
import type { ConsoleKey } from "@/lib/console-registry";
export { platformKey, adminKeys };

export interface ConsoleMetric { key: string; label: string; value: string | number; unit?: string | null; comparison?: number | null; comparison_label?: string | null; status?: "neutral" | "success" | "warning" | "danger"; destination?: string }
export interface ConsoleAttentionItem { id: string; label: string; severity: "info" | "warning" | "critical"; destination: string }
export interface ConsoleSummary { console_key: ConsoleKey; health: "healthy" | "degraded" | "down" | "unknown"; generated_at: string; metrics: ConsoleMetric[]; attention: ConsoleAttentionItem[]; recent_activity: Array<{ id: string; label: string; occurred_at: string; destination?: string }>; resource_count: number; capabilities: Record<string, { available: boolean; reason?: string }> }

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 2, staleTime: 30_000 },
    mutations: { retry: 0 },
  },
});

const API = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";

// ── Types ─────────────────────────────────────────────────────

export interface ActivityItem {
  org_id: string
  org_name: string
  org_slug?: string
  action: string
  amount: number | null
  occurred_at: string
}

export interface TrialExpiring {
  org_id: string
  org_name: string
  plan_name: string
  trial_ends_at: string
  days_remaining: number
}

export interface TopOrgByMrr {
  org_id: string
  org_name: string
  mrr: number
  plan_name: string
}

export interface DashboardMetrics {
  total_organizations: number
  active_organizations: number
  trial_organizations: number
  total_users: number
  mrr_current: number
  arr_current: number
  active_users_30d: number
  events_this_month: number
  open_tickets: number
  revenue_today_inr: number
  churn_rate: number
  orgs_trend: number[]
  users_trend: number[]
  mrr_trend: number[]
  events_trend: number[]
  revenue_trend: number[]
  subscriptions_active: number
  subscriptions_trial: number
  subscriptions_grace: number
  subscriptions_suspended: number
  subscriptions_expired: number
  subscriptions_cancelled: number
  recent_activity: ActivityItem[]
  trials_expiring: TrialExpiring[]
  top_orgs_by_mrr: TopOrgByMrr[]
  platform_status: 'healthy' | 'degraded' | 'down'
  services_degraded: number
  checked_at: string
}

export interface AdminOrg {
  id: string;
  name: string;
  slug: string;
  plan: string;
  status: string;
  health_score: number | null;
  health_status: string;
  created_at: string;
  is_active?: boolean;
  domain?: string;
  custom_domain?: string;
  suspension_reason?: string;
  suspended_at?: string;
  events_count?: number;
  mrr?: number | null;
}

export interface OrgDetail {
  id: string;
  name: string;
  slug: string;
  domain?: string;
  created_at: string;
  max_events?: number;
  max_users?: number;
  max_storage_gb?: number;
  max_registrations?: number;
  country?: string;
  timezone?: string;
  subscription: {
    plan: string;
    status: string;
    current_period_end?: string;
    stripe_customer_id?: string;
  };
  health: {
    score: number | null;
    status: string;
    warnings: string[];
  };
}

export interface OrgUsage {
  active_events_count: number;
  active_users_count: number;
  total_registrations_count: number;
  storage_used_bytes: number;
  last_calculated_at?: string;
}

export interface TimelineEvent {
  id: string;
  action_type: string;
  actor_id?: string;
  timestamp: string;
  metadata: Record<string, any>;
}

export interface SubscriptionPlan {
  id: string;
  name: string;
  tagline?: string;
  description?: string;
  billing_model: string;
  currency: string;
  price_per_event?: number;
  price_display: string;
  max_events: number;
  max_users: number;
  max_registrations?: number;
  max_speakers?: number;
  max_sessions?: number;
  max_rooms?: number;
  max_ticket_categories?: number;
  max_badge_templates?: number;
  max_certificate_templates?: number;
  max_emails_per_event?: number;
  storage_quota_mb: number;
  display_order: number;
  is_popular: boolean;
  color_hex?: string;
  razorpay_plan_id?: string;
  stripe_product_id?: string;
  stripe_price_id?: string;
  is_active: boolean;
  version?: number;
  lifecycle_status?: "DRAFT" | "REVIEW" | "PUBLISHED" | "RETIRED";
  effective_at?: string | null;
  retired_at?: string | null;
  created_at: string;
  subscribers_count?: number;
  mrr?: number;
}

export interface FeatureMatrixItem {
  key: string;
  name: string;
  description?: string;
  value_type?: "BOOLEAN" | "LIMIT" | "TIER" | "ENUM" | string;
  scope_type?: string;
  enforcement_mode?: "HARD" | "SOFT_WARNING" | "METERED_OVERAGE";
  default_value?: unknown;
  allowed_values?: string[];
  unit?: string | null;
  period?: string | null;
  version?: number;
}

export interface FeatureMatrixCategory {
  category: string;
  category_name: string;
  features: FeatureMatrixItem[];
}

export interface FeatureCatalogItem {
  id: string;
  key: string;
  name: string;
  description?: string | null;
  category: string;
  category_order: number;
  feature_order: number;
  is_active: boolean;
  value_type?: "BOOLEAN" | "LIMIT" | "TIER" | "ENUM" | string;
  scope_type?: string;
  enforcement_mode?: "HARD" | "SOFT_WARNING" | "METERED_OVERAGE";
  default_value?: any;
  allowed_values?: string[];
  unit?: string;
  period?: string;
  version?: number;
  portal_routes?: string[];
  backend_operations?: string[];
  required_permissions?: string[];
  metric_key?: string | null;
  dependencies?: string[];
  conflicts?: string[];
  owner_console?: string;
  owner_team?: string | null;
  risk_level?: string;
  lifecycle_status?: string;
  replacement_key?: string | null;
}

export interface FeatureCatalogPayload {
  key: string;
  name: string;
  description?: string | null;
  category: string;
  category_order?: number | null;
  feature_order?: number | null;
  is_active: boolean;
}

export interface Addon {
  id: string;
  key: string;
  name: string;
  description?: string;
  addon_type: "PLAN" | "VENUE";
  short_description?: string;
  image_url?: string;
  price_inr?: number;
  min_price_inr?: number;
  max_price_inr?: number;
  final_price?: number;
  billing_unit?: string;
  price_unit?: string;
  scope_type?: "ORGANIZATION" | "EVENT";
  consumption_model?: "NON_CONSUMABLE" | "QUOTA" | "METERED";
  unit_type?: string | null;
  available_for_plans: string[];
  is_optional_for_plan?: string;
  included_in_plan?: string;
  is_active: boolean;
  version?: number;
  lifecycle_status?: "DRAFT" | "REVIEW" | "PUBLISHED" | "RETIRED";
  effective_at?: string | null;
  retired_at?: string | null;
  created_at: string;
  feature_ids?: string[];
  feature_assignments?: AddonFeatureAssignment[];
  features_spec?: { category: string; feature: string; value: string; price?: number }[];
  hardware_spec?: { item_id: string; quantity: number; days: number }[];
  staff_spec?: { role_id: string; quantity: number; days: number }[];
  inclusions?: string[];
  exclusions?: string[];
  consumables_cost?: number;
  template_types?: ("registration" | "srr" | "room" | "other")[];
}


export interface OrgSubscription {
  id: string;
  organization_id: string;
  organization_name: string;
  organization_slug: string;
  plan_id: string;
  plan_name: string;
  status: string;
  stripe_customer_id?: string;
  stripe_subscription_id?: string;
  trial_ends_at?: string;
  current_period_end?: string;
  cancel_at_period_end: boolean;
  created_at: string;
}

export interface Subscription {
  id: string
  organization_id: string
  org_name: string
  org_slug: string
  plan_name: string
  plan_id: string
  plan_color_hex: string
  status: 'ACTIVE' | 'TRIAL' | 'GRACE_PERIOD' | 'SUSPENDED' | 'EXPIRED' | 'CANCELLED'
  trial_ends_at: string | null
  current_period_end: string | null
  stripe_customer_id: string | null
  stripe_subscription_id: string | null
  mrr: number
  mrr_inr: number
  days_until_trial_end: number | null
}

export interface Invoice {
  id: string;
  organization_id: string;
  org_name: string;
  organization_name?: string; // compatibility
  plan_name: string;
  amount: number;
  amount_inr: number;
  gst_amount: number;
  total_amount_inr: number;
  invoice_number: string;
  currency: string;
  status: string;
  stripe_invoice_id: string | null;
  due_date: string | null;
  paid_at: string | null;
  created_at: string;
  issued_at?: string; // compatibility
}

export interface RevenueAnalytics {
  mrr_by_month: { period: string; mrr: number; arr: number }[]
  mrr_by_plan: { plan: string; color_hex?: string; mrr: number; orgs: number }[]
  upgrades_this_month: number
  downgrades_this_month?: number
  arpu_inr?: number
  arpu: number
  summary: { mrr: number; arr: number; net_new_mrr?: number; churned_mrr?: number; expansion_mrr?: number }
  
  // Compatibility fields for existing page:
  metrics?: {
    mrr: number
    arr: number
    net_new_mrr: number
    churn_mrr: number
    expansion_mrr: number
    arpu: number
  }
  mrr_breakdown?: any[]
  country_revenue?: any[]
  upgrades_downgrades?: any[]
  cohort_retention?: any[]
}

export interface RevenueMetric {
  period: string;
  mrr: number;
  arr: number;
  addon_revenue: number;
}

export interface GlobalUser {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  role: string;
  platform_role?: string;
  is_active: boolean;
  is_platform_admin: boolean;
  is_2fa_enabled: boolean;
  organization_id: string;
  organization_name: string;
  last_login_at?: string;
  created_at: string;
}

export interface PlatformApplication {
  id: string;
  name: string;
  description: string;
  category: string;
  version: string;
  status: string;
}

export interface ImpersonationLog {
  id: string;
  organization_id: string;
  organization_name: string;
  actor_id?: string;
  action_type: string;
  timestamp: string;
  metadata: Record<string, any>;
  started_at?: string;
  ended_at?: string;
  impersonator_name?: string;
  impersonator_email?: string;
  target_user_name?: string;
  target_user_email?: string;
  target_organization_name?: string;
  reason?: string;
  ip_address?: string;
}

export interface PaginatedResponse<T> {
  total: number;
  items: T[];
}

export interface JobStats {
  total_jobs: number;
  active_jobs: number;
  total_executions: number;
  queued: number;
  running: number;
  succeeded: number;
  failed: number;
  retrying: number;
}

export interface JobExecution {
  id: string;
  job_id: string;
  status: "queued" | "running" | "success" | "failed" | "retrying";
  raw_status?: string;
  started_at?: string;
  finished_at?: string;
  duration_seconds?: number;
  task_name?: string;
  queue?: string;
  source?: string;
  organization_id?: string | null;
  event_id?: string | null;
  error_message?: string | null;
  capabilities?: { retry: boolean; cancel: boolean };
}

export interface OrganizationDossier {
  generated_at: string;
  profile: {
    id: string; name: string; slug: string; logo_url?: string | null; is_active: boolean;
    is_platform_org: boolean; billing_email?: string | null; custom_domain?: string | null;
    country: string; timezone: string; currency: string; language: string; portal_name?: string | null;
    date_format: string; time_format: string; organization_type?: string | null; industry?: string | null;
    expected_events_per_year?: string | null; average_attendees_per_event?: string | null;
    primary_goal?: string | null; enabled_modules: string[]; onboarding_completed: boolean;
    onboarding_step: number; created_at: string; updated_at: string; suspended_at?: string | null;
    suspension_reason?: string | null;
  };
  owner?: { id: string; name: string; email: string } | null;
  health: { score?: number | null; status: string; warnings: string[] };
  subscription?: { id: string; plan_id: string; plan_name: string; status: string; billing_model?: string | null; currency: string; price_per_event?: number | null; trial_ends_at?: string | null; current_period_end?: string | null; cancel_at_period_end: boolean; created_at: string } | null;
  subscription_history: OrganizationDossier["subscription"][];
  event_entitlement: { purchased: number; reserved: number; consumed: number; remaining: number; actual_events: number; activations: Record<string, number> };
  grants: Array<{ id: string; type: string; source: string; status: string; total?: number | null; consumed?: number | null; reserved?: number | null; valid_until?: string | null }>;
  capabilities: Array<{ id: string; key: string; name: string; category?: string | null; description?: string | null; enabled: boolean; source: "plan" | "addon" | "override" | "none"; extended: boolean; expires_at?: string | null; reason?: string | null }>;
  addons: Array<{ id: string; catalog_id: string; name: string; key: string; type: string; status: string; scope: string; quantity: number; unit_price: number; currency: string; purchased_at: string; expires_at?: string | null; event_id?: string | null; activation_id?: string | null }>;
  usage: { active_events: number; active_users: number; registrations: number; storage_bytes: number; calculated_at?: string | null };
  people: { members: number };
  billing: { invoice_count: number; invoiced_total: number; currency: string };
  availability: Record<string, boolean>;
}

export type CommercialReportType =
  | "hardware_catalog"
  | "staff_catalog"
  | "pricing_simulations"
  | "pricing_rules";

export interface CommercialExport {
  export_id: string;
  organization_id: string;
  report_type: CommercialReportType;
  status: "QUEUED" | "RUNNING" | "COMPLETED" | "FAILED";
  file_format: "xlsx" | "csv" | "pdf";
  created_at: string;
  completed_at?: string | null;
  expires_at?: string | null;
  failure_reason?: string | null;
}

export interface CommercialExportDownload {
  download_url: string;
  filename: string;
  expires_in: number;
}

export interface SecurityLog {
  id: string;
  event_type: string;
  severity: string;
  log_metadata: Record<string, any>;
  created_at: string;
}

export interface SystemChange {
  id: string;
  entity_type: string;
  change_type: string;
  changes: Record<string, any>;
  created_at: string;
}

export interface SupportTicket {
  id: string;
  organization_id: string;
  subject: string;
  description?: string;
  status: string;
  priority: string;
  created_at: string;
  assigned_agent?: string;
  is_escalated?: boolean;
}

export interface OrgFeature {
  id: string;
  key: string;
  name: string;
  is_enabled: boolean;
}

export interface SearchJob {
  id: string;
  organization_id: string;
  organization_name?: string;
  status: "queued" | "in_progress" | "completed" | "failed";
  entity_types?: string[];
  records_processed: number;
  created_at: string;
  finished_at?: string;
}

export interface GlobalSettings {
  timezone: string;
  maintenance_mode: boolean;
  broadcast_enabled: boolean;
  broadcast_message: string;
  currency: string;
  smtp_host: string;
  smtp_port: number;
  smtp_user: string;
  smtp_password_configured: boolean;
  support_email: string;
  slack_webhook_configured: boolean;
  security_max_lockout_attempts: number;
  security_idle_timeout_min: number;
  security_enforce_2fa_super_admin: boolean;
  security_enforce_2fa_org_admin: boolean;
  security_enforce_2fa_speaker: boolean;
  security_enforce_2fa_attendee: boolean;
  security_ip_allowlist: string;
}

export interface TicketComment {
  id: string;
  ticket_id: string;
  author_id: string;
  author_email: string;
  author_name: string;
  content: string;
  created_at: string;
}

export interface ServiceHealth {
  name: string;
  status: 'healthy' | 'degraded' | 'down' | 'unverified';
  response_ms: number | null;
  detail: string;
  worker_count?: number;
}

export interface PlatformHealth {
  overall: 'healthy' | 'degraded' | 'down';
  overall_status: 'healthy' | 'degraded' | 'down';
  services: ServiceHealth[];
  checked_at: string;
}

export interface SecurityEventItem {
  id: string;
  event_type: string;
  risk_level: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  severity_score: number;
  user_email: string | null;
  ip_address: string | null;
  geo_metadata: Record<string, unknown> | null;
  action_taken: string | null;
  correlation_id: string | null;
  occurred_at: string;
}

export interface SecurityEventsResponse {
  severity_summary: {
    CRITICAL: number;
    HIGH: number;
    MEDIUM: number;
    LOW: number;
    total_24h: number;
  };
  trend: Array<{
    day: string;
    low: number;
    medium: number;
    high: number;
    critical: number;
  }>;
  items: SecurityEventItem[];
  total: number;
  has_next: boolean;
}

export interface StatusCounts {
  ACTIVE: number;
  TRIAL: number;
  GRACE_PERIOD: number;
  SUSPENDED: number;
  EXPIRED: number;
  CANCELLED: number;
}

export interface OrgLimitOverrides {
  max_events?: number;
  max_users?: number;
  max_registrations?: number;
  max_rooms?: number;
  storage_quota_mb?: number;
  [key: string]: number | undefined;
}

export interface OrgDomain {
  id: string;
  domain: string;
  is_verified: boolean;
  created_at: string;
}

export interface OrgEvent {
  id: string;
  name: string;
  short_code: string;
  status: string;
  start_date: string | null;
  end_date: string | null;
  registration_count: number;
}

export interface OrganizationMember {
  id: string;
  user_id: string | null;
  name: string;
  first_name: string | null;
  last_name: string | null;
  email: string;
  user_role: string | null;
  org_role: "owner" | "admin" | "member" | "billing_only";
  accepted_at: string | null;
  invited_at: string | null;
  is_active: boolean;
  is_2fa_enabled: boolean;
  last_login_at: string | null;
  event_ids: string[];
}

export interface OrganizationProvisionPayload {
  name: string;
  slug: string;
  owner_email: string;
  owner_first_name: string;
  owner_last_name: string;
  country: string;
  timezone: string;
  reason: string;
}

export interface OrganizationProvisionResult {
  organization: AdminOrg;
  owner_invitation: { membership_id: string; email: string; token: string };
  replayed: boolean;
}

// ── React Query Keys ──────────────────────────────────────────

// ── API Functions ─────────────────────────────────────────────

export const adminApi = {
  getConsoleSummary: (consoleKey: ConsoleKey) => apiClient.get<ConsoleSummary>(`/superadmin/consoles/${consoleKey}/summary`),
  getDashboard: () =>
    apiClient.get<DashboardMetrics>("/platform/dashboard"),

  getOrgs: (params?: { skip?: number; limit?: number; search?: string }) =>
    apiClient.get<AdminOrg[]>("/platform/organizations", { params }),

  getOrgDetail: (id: string) =>
    apiClient.get<OrgDetail>(`/platform/organizations/${id}`),

  getOrgDossier: (id: string) =>
    apiClient.get<OrganizationDossier>(`/platform/organizations/${id}/dossier`),

  getOrgUsage: (id: string) =>
    apiClient.get<OrgUsage>(`/platform/organizations/${id}/usage`),

  getOrgTimeline: (id: string) =>
    apiClient.get<TimelineEvent[]>(`/platform/organizations/${id}/timeline`),

  getOrgFeatures: (id: string) =>
    apiClient.get<OrgFeature[]>(`/platform/organizations/${id}/features`),

  overrideOrgFeature: (id: string, featureId: string, isEnabled: boolean, reason?: string) =>
    apiClient.put(`/platform/organizations/${id}/features/overrides`, {
      feature_id: featureId,
      is_enabled: isEnabled,
      reason,
    }),

  updateOrgStatus: (id: string, isActive: boolean, reason: string) =>
    apiClient.patch<any>(`/platform/organizations/${id}/status`, {
      is_active: isActive,
      suspension_reason: reason,
    }),

  updateOrgDetail: (id: string, data: any) =>
    apiClient.put(`/platform/organisations/${id}`, data),


  getSubscriptionPlans: () =>
    apiClient.get<SubscriptionPlan[]>("/platform/subscription-plans"),

  createPlan: (data: Partial<SubscriptionPlan>, reason: string, idempotencyKey: string) =>
    apiClient.post<any>("/platform/subscription-plans", data, {
      headers: { "Idempotency-Key": idempotencyKey, "X-Admin-Reason": reason },
    }),

  updatePlan: (id: string, data: Partial<SubscriptionPlan>, version: number, reason: string, idempotencyKey: string) =>
    apiClient.patch<any>(`/platform/subscription-plans/${id}`, data, {
      headers: { "If-Match": String(version), "Idempotency-Key": idempotencyKey, "X-Admin-Reason": reason },
    }),

  getFeaturesCatalog: () =>
    apiClient.get<FeatureCatalogItem[]>("/platform/features"),

  getFeatureMatrix: () =>
    apiClient.get<FeatureMatrixCategory[]>("/platform/features/matrix"),

  getAddons: () =>
    apiClient.get<Addon[]>("/platform/addons"),

  createAddon: (data: any, reason: string, idempotencyKey: string) =>
    apiClient.post<any>("/platform/addons", data, {
      headers: { "Idempotency-Key": idempotencyKey, "X-Admin-Reason": reason },
    }),

  patchAddon: (addonId: string, data: any, version: number, reason: string, idempotencyKey: string) =>
    apiClient.patch<any>(`/platform/addons/${addonId}`, data, {
      headers: { "If-Match": String(version), "Idempotency-Key": idempotencyKey, "X-Admin-Reason": reason },
    }),

  deleteAddon: (addonId: string, version: number, reason: string, idempotencyKey: string) =>
    apiClient.delete(`/platform/addons/${addonId}`, {
      headers: { "If-Match": String(version), "Idempotency-Key": idempotencyKey, "X-Admin-Reason": reason },
    }),

  getPlanFeatures: (planId: string) =>
    apiClient.get<string[]>(`/platform/subscription-plans/${planId}/features`),

  updatePlanFeatures: (planId: string, featureKeys: string[]) =>
    apiClient.put(`/platform/subscription-plans/${planId}/features`, { feature_keys: featureKeys }),

  getSubscriptions: (params?: { skip?: number; limit?: number; status?: string; plan_id?: string }) =>
    apiClient.get<PaginatedResponse<OrgSubscription>>("/platform/subscriptions", { params }),

  getInvoices: (params?: { skip?: number; limit?: number; status?: string; org_id?: string }) =>
    apiClient.get<PaginatedResponse<Invoice>>("/platform/invoices", { params }),

  getRevenueMetrics: (months = 12) =>
    apiClient.get<RevenueMetric[]>("/platform/revenue-metrics", { params: { months } }),

  getGlobalUsers: (params?: { skip?: number; limit?: number; search?: string; org_id?: string; is_active?: boolean }) =>
    apiClient.get<PaginatedResponse<GlobalUser>>("/platform/global-users", { params }),

  getApplications: () =>
    apiClient.get<PlatformApplication[]>("/platform/applications"),

  getImpersonationLogs: (params?: { skip?: number; limit?: number }) =>
    apiClient.get<PaginatedResponse<ImpersonationLog>>("/platform/impersonation-logs", { params }),

  getJobStats: async () => {
    const response = await apiClient.get<any>("/platform/operations/jobs", { params: { limit: 1 } });
    return response.summary as JobStats;
  },

  getJobExecutions: async (params?: { status?: string; page?: number; page_size?: number }) => {
    const page = params?.page || 1;
    const pageSize = params?.page_size || 50;
    const response = await apiClient.get<any>("/platform/operations/jobs", {
      params: {
        status: params?.status,
        skip: (page - 1) * pageSize,
        limit: pageSize,
      },
    });
    return { items: response.items as JobExecution[], total: response.total as number, page, page_size: pageSize };
  },

  getSecurityLogs: (params?: { severity?: string; page?: number; page_size?: number }) =>
    apiClient.get<{ items: SecurityLog[]; total: number }>("/audit/security-logs", { params }),

  getSystemChanges: (params?: { entity_type?: string; page?: number; page_size?: number }) =>
    apiClient.get<{ items: SystemChange[]; total: number }>("/audit/system-changes", { params }),

  getWorkerLogs: (params?: { page?: number; page_size?: number }) =>
    apiClient.get<{ items: any[]; total: number }>("/audit/worker-logs", { params }),

  getSearchJobs: (params?: { organization_id?: string; page?: number; page_size?: number }) =>
    apiClient.get<{ items: SearchJob[]; total: number }>("/search/jobs", { params }),

  triggerReindex: (orgId: string, entityTypes?: string[]) =>
    apiClient.post<SearchJob>("/search/reindex", { organization_id: orgId, entity_types: entityTypes }),

  getSupportTickets: () =>
    apiClient.get<SupportTicket[]>("/support/tickets"),

  getTicketComments: (ticketId: string) =>
    apiClient.get<TicketComment[]>(`/support/tickets/${ticketId}/comments`),

  addTicketComment: (ticketId: string, content: string) =>
    apiClient.post<any>(`/support/tickets/${ticketId}/comments`, { content }),

  getGlobalSettings: () =>
    apiClient.get<GlobalSettings>("/global-settings"),

  updateGlobalSettings: (data: Partial<GlobalSettings>) =>
    apiClient.patch<GlobalSettings>("/global-settings", data),

  createFeatureCatalogItem: (data: FeatureCatalogPayload) =>
    apiClient.post<FeatureCatalogItem>("/platform/features", data),

  updateFeatureCatalogItem: (id: string, data: FeatureCatalogPayload) =>
    apiClient.patch<FeatureCatalogItem>(`/platform/features/${id}`, data),

  deleteFeatureCatalogItem: (id: string) =>
    apiClient.delete(`/platform/features/${id}`),

  reorderFeatureCategories: (categories: string[]) =>
    apiClient.patch("/platform/feature-categories/reorder", { categories }),

  reorderFeatures: (category: string, featureIds: string[]) =>
    apiClient.patch("/platform/feature-orders/reorder", { category, feature_ids: featureIds }),

  getHealth: () =>
    apiClient.get<PlatformHealth>("/platform/health"),

  getSubscriptionsHealthSummary: () =>
    apiClient.get<StatusCounts>("/platform/subscriptions/health-summary"),

  changeOrgPlan: (orgId: string, planId: string, reason: string) =>
    apiClient.patch<any>(`/platform/organizations/${orgId}/subscription/plan`, { plan_id: planId, reason }),

  extendTrial: (orgId: string, days: number, reason: string) =>
    apiClient.patch<any>(`/platform/organizations/${orgId}/trial/extend`, { days, reason }),

  applyCredit: (orgId: string, amount: number, currency: string, reason: string) =>
    apiClient.post<any>(`/platform/organizations/${orgId}/apply-credit`, { amount, currency, reason }),

  reset2FA: (userId: string, reason: string) =>
    apiClient.delete(`/platform/users/${userId}/2fa`, {
      data: { reason },
    }),

  getOrgLimits: (orgId: string) =>
    apiClient.get<Record<string, number>>(`/platform/organizations/${orgId}/limits`),

  updateOrgLimits: (orgId: string, limits: Record<string, number>, reason: string) =>
    apiClient.put(`/platform/organizations/${orgId}/limits`, { limits, reason }),

  getOrgDomains: (orgId: string) =>
    apiClient.get<OrgDomain[]>(`/platform/organizations/${orgId}/domains`),

  addOrgDomain: (orgId: string, domain: string, reason: string) =>
    apiClient.post<OrgDomain>(`/platform/organizations/${orgId}/domains`, { domain, reason }),

  deleteOrgDomain: (orgId: string, domainId: string, reason: string) =>
    apiClient.delete(`/platform/organizations/${orgId}/domains/${domainId}`, {
      data: { reason },
    }),

  verifyOrgDomain: (orgId: string, domainId: string, reason: string) =>
    apiClient.post<any>(`/platform/organizations/${orgId}/domains/${domainId}/verify`, { reason }),

  getOrgEvents: (orgId: string) =>
    apiClient.get<OrgEvent[]>(`/platform/organizations/${orgId}/events`),

  provisionOrganization: (payload: OrganizationProvisionPayload, idempotencyKey: string) =>
    apiClient.post<OrganizationProvisionResult>("/platform/organisations", payload, {
      headers: { "Idempotency-Key": idempotencyKey },
    }),

  getOrganizationMembers: (orgId: string) =>
    apiClient.get<OrganizationMember[]>(`/platform/organisations/${orgId}/members`),

  inviteOrganizationMember: (orgId: string, payload: { email: string; org_role: string; reason: string }) =>
    apiClient.post<{ membership_id: string; email: string; invite_token: string }>(`/platform/organisations/${orgId}/members`, payload),

  updateOrganizationMember: (orgId: string, memberId: string, orgRole: string, reason: string) =>
    apiClient.patch(`/platform/organisations/${orgId}/members/${memberId}`, { org_role: orgRole, reason }),

  removeOrganizationMember: (orgId: string, memberId: string, reason: string) =>
    apiClient.delete(`/platform/organisations/${orgId}/members/${memberId}`, { data: { reason } }),

  assignOrganizationMemberEvent: (orgId: string, memberId: string, eventId: string, permissions: Record<string, boolean>, reason: string) =>
    apiClient.put(`/platform/organisations/${orgId}/members/${memberId}/events/${eventId}`, { permissions, reason }, { headers: { "Idempotency-Key": crypto.randomUUID() } }),

  unassignOrganizationMemberEvent: (orgId: string, memberId: string, eventId: string, reason: string) =>
    apiClient.delete(`/platform/organisations/${orgId}/members/${memberId}/events/${eventId}`, { data: { reason } }),

  getOrgAddons: (orgId: string) =>
    apiClient.get<any[]>(`/platform/organizations/${orgId}/addons`),

  impersonateUser: (userId: string, data: { reason: string }) =>
    apiClient.post<{ access_token: string; token_type: string; expires_in: number; session_id: string }>(
      `/platform/impersonate/${userId}`,
      data
    ),

  getPaymentEvents: (params?: { limit?: number }) =>
    apiClient.get<any[]>("/platform/payment-events", { params }),

  deleteOrg: (orgId: string, reason: string) =>
    apiClient.delete(`/platform/organizations/${orgId}`, { data: { reason } }),

  updateUserStatus: (userId: string, isActive: boolean, reason: string) =>
    apiClient.patch<any>(`/platform/users/${userId}/status`, { is_active: isActive, reason }),

  updateUserPlatformRole: (userId: string, platformRole: "SUPER_ADMIN" | "SUPPORT_ADMIN" | "FINANCE_ADMIN" | "NONE", reason: string) =>
    apiClient.patch<{ message: string; platform_role: string | null }>(`/platform/users/${userId}/platform-role`, {
      platform_role: platformRole,
      reason,
    }),

  deleteOrgFeatureOverride: (orgId: string, featureId: string, reason: string) =>
    apiClient.delete(`/platform/organizations/${orgId}/features/overrides/${featureId}`, { data: { reason } }),

  getPlatformAudit: (params?: {
    action_type?: string;
    resource_type?: string;
    actor_user_id?: string;
    organization_id?: string;
    cursor?: string;
    limit?: number;
    is_sensitive?: boolean;
  }) =>
    apiClient.get<{ items: any[]; next_cursor: string | null; has_next: boolean }>("/platform/audit", { params }),

  patchPlanLimits: (planId: string, data: any) =>
    apiClient.patch<any>(`/platform/plans/${planId}`, data),

  updatePlanFeaturesBulk: (planId: string, featureKeys: string[]) =>
    apiClient.put(`/platform/plans/${planId}/features`, { feature_keys: featureKeys }),

  bulkExtendTrial: (data: { org_ids: string[]; days: number; reason: string }) =>
    apiClient.post<any>(`/platform/subscriptions/bulk-extend`, data),

  bulkChangePlan: (data: { org_ids: string[]; plan_id: string; reason: string }) =>
    apiClient.post<any>(`/platform/subscriptions/bulk-change-plan`, data),

  cancelSubscription: (subId: string, reason: string) =>
    apiClient.post<any>(`/platform/subscriptions/${subId}/cancel`, { reason }),

  reactivateSubscription: (subId: string, reason: string) =>
    apiClient.post<any>(`/platform/subscriptions/${subId}/reactivate`, { reason }),

  getInvoiceItems: (invoiceId: string) =>
    apiClient.get<any[]>(`/platform/invoices/${invoiceId}/items`),

  markInvoicePaid: (invoiceId: string, reason: string) =>
    apiClient.post<any>(`/platform/invoices/${invoiceId}/mark-paid`, { reason }),

  sendInvoiceReminder: (invoiceId: string, reason: string) =>
    apiClient.post<any>(`/platform/invoices/${invoiceId}/send-reminder`, { reason }),

  voidInvoice: (invoiceId: string, reason: string) =>
    apiClient.post<any>(`/platform/invoices/${invoiceId}/void`, { reason }),

  getRevenueAnalytics: () =>
    apiClient.get<any>("/platform/revenue/analytics"),

  forceLogoutUser: (userId: string, reason: string) =>
    apiClient.delete(`/platform/users/${userId}/sessions`, {
      data: { reason },
    }),

  exportAuditLogs: (payload: any) =>
    apiClient.post<any>(`/platform/audit/export`, payload),

  retryJobExecution: (_executionId: string) =>
    Promise.reject(new Error("Job retry requires a durable job-control API before it can be enabled.")),

  cancelJobExecution: (_executionId: string) =>
    Promise.reject(new Error("Job cancellation requires a durable job-control API before it can be enabled.")),

  endImpersonationSession: (sessionId: string) =>
    apiClient.post<any>(`/platform/impersonation/${sessionId}/end`),

  getJobFailures: (_executionId: string) =>
    Promise.reject(new Error("Job failure trace retrieval requires a durable job-control API before it can be enabled.")),
};

// ── React Query Hooks ─────────────────────────────────────────

export const useConsoleSummary = (consoleKey: ConsoleKey) =>
  useQuery({
    queryKey: platformKey("console-summary", consoleKey),
    queryFn: () => adminApi.getConsoleSummary(consoleKey),
    staleTime: 30_000,
    refetchInterval: 60_000,
  });

export const useAdminDashboard = () =>
  useQuery({
    queryKey: adminKeys.dashboard,
    queryFn: adminApi.getDashboard,
    refetchInterval: 30_000,
  });

export const useAdminOrgs = (params?: { skip?: number; limit?: number; search?: string }) =>
  useQuery({
    queryKey: adminKeys.orgs(params),
    queryFn: () => adminApi.getOrgs(params),
  });

export const useAdminOrgDetail = (id: string) =>
  useQuery({
    queryKey: adminKeys.orgDetail(id),
    queryFn: () => adminApi.getOrgDetail(id),
    enabled: !!id,
  });

export const useAdminOrgUsage = (id: string) =>
  useQuery({
    queryKey: adminKeys.orgUsage(id),
    queryFn: () => adminApi.getOrgUsage(id),
    enabled: !!id,
  });

export const useAdminOrgTimeline = (id: string) =>
  useQuery({
    queryKey: adminKeys.orgTimeline(id),
    queryFn: () => adminApi.getOrgTimeline(id),
    enabled: !!id,
  });

export const useAdminOrgFeatures = (id: string) =>
  useQuery({
    queryKey: adminKeys.orgFeatures(id),
    queryFn: () => adminApi.getOrgFeatures(id),
    enabled: !!id,
  });

export const useSubscriptionPlans = () =>
  useQuery({
    queryKey: adminKeys.subscriptionPlans,
    queryFn: adminApi.getSubscriptionPlans,
  });

export const useFeaturesCatalog = () =>
  useQuery({
    queryKey: adminKeys.featuresCatalog,
    queryFn: adminApi.getFeaturesCatalog,
  });

export const useFeatureMatrix = () =>
  useQuery({
    queryKey: adminKeys.featureMatrix,
    queryFn: adminApi.getFeatureMatrix,
  });

export const useAddons = () =>
  useQuery({
    queryKey: adminKeys.addons,
    queryFn: adminApi.getAddons,
  });

export const useCreateAddon = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ data, reason, idempotencyKey = crypto.randomUUID() }: { data: any; reason: string; idempotencyKey?: string }) =>
      adminApi.createAddon(data, reason, idempotencyKey),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: adminKeys.addons });
    },
  });
};

export const useUpdateAddon = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ addonId, data, version, reason, idempotencyKey = crypto.randomUUID() }: { addonId: string; data: any; version: number; reason: string; idempotencyKey?: string }) =>
      adminApi.patchAddon(addonId, data, version, reason, idempotencyKey),
    onSuccess: (_, { addonId }) => {
      queryClient.invalidateQueries({ queryKey: adminKeys.addons });
      queryClient.invalidateQueries({ queryKey: adminKeys.addonVersions(addonId) });
    },
  });
};

export const useDeleteAddon = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ addonId, version, reason, idempotencyKey = crypto.randomUUID() }: { addonId: string; version: number; reason: string; idempotencyKey?: string }) =>
      adminApi.deleteAddon(addonId, version, reason, idempotencyKey),
    onSuccess: (_, { addonId }) => {
      queryClient.invalidateQueries({ queryKey: adminKeys.addons });
      queryClient.invalidateQueries({ queryKey: adminKeys.addonVersions(addonId) });
    },
  });
};

export const useCommercialExports = (organizationId?: string) =>
  useQuery({
    queryKey: adminKeys.commercialExports(organizationId),
    queryFn: () => apiClient.get<CommercialExport[]>("/superadmin/reports/exports", {
      params: { organization_id: organizationId },
    }),
    enabled: !!organizationId,
    refetchInterval: query => query.state.data?.some(
      item => item.status === "QUEUED" || item.status === "RUNNING",
    ) ? 3_000 : false,
  });

export const useCreateCommercialExport = (organizationId?: string) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ reportType, reason, idempotencyKey }: {
      reportType: CommercialReportType;
      reason: string;
      idempotencyKey: string;
    }) => {
      if (!organizationId) throw new Error("Select an organization before requesting an export.");
      return apiClient.post<CommercialExport>("/superadmin/reports/exports", {
        organization_id: organizationId,
        report_type: reportType,
        reason,
      }, {
        headers: { "Idempotency-Key": idempotencyKey },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: adminKeys.commercialExports(organizationId) });
      toast.success("Commercial export queued");
    },
    onError: (error: any) => toast.error(error.message || "Commercial export could not be queued"),
  });
};

export const downloadCommercialExport = (exportId: string, organizationId: string) =>
  apiClient.get<CommercialExportDownload>(`/superadmin/reports/exports/${exportId}/download`, {
    params: { organization_id: organizationId },
  });

export const useUpdatePlanLimits = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ planId, data }: { planId: string; data: Partial<SubscriptionPlan> }) =>
      adminApi.patchPlanLimits(planId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: adminKeys.subscriptionPlans });
      queryClient.invalidateQueries({ queryKey: adminKeys.featureMatrix });
    },
  });
};

export const usePlanFeatures = (planId: string) =>
  useQuery({
    queryKey: adminKeys.planFeatures(planId),
    queryFn: () => adminApi.getPlanFeatures(planId),
    enabled: !!planId,
  });

export interface TypedFeatureAssignment {
  feature_key: string;
  name?: string;
  value_type: "BOOLEAN" | "LIMIT" | "TIER" | "ENUM" | string;
  value: any;
  scope_type?: string;
  enforcement_mode?: "HARD" | "SOFT_WARNING" | "METERED_OVERAGE";
  hard_ceiling?: number | null;
  allowed_values?: string[];
  unit?: string;
  period?: string;
}

export interface PlanTemplateVersion {
  id: string;
  version: number;
  lifecycle_status: string;
  change_type: string;
  snapshot: { template?: Record<string, unknown>; assignments?: TypedFeatureAssignment[] };
  reason: string;
  actor_user_id?: string | null;
  created_at: string;
}

export type AddonTemplateVersion = PlanTemplateVersion;

export const usePlanTemplateVersions = (planId: string) =>
  useQuery({
    queryKey: adminKeys.planVersions(planId),
    queryFn: () => apiClient.get<{ items: PlanTemplateVersion[]; next_cursor?: string | null }>(`/platform/subscription-plans/${planId}/versions`),
    enabled: Boolean(planId),
  });

export const useAddonTemplateVersions = (addonId: string) =>
  useQuery({
    queryKey: adminKeys.addonVersions(addonId),
    queryFn: () => apiClient.get<{ items: AddonTemplateVersion[]; next_cursor?: string | null }>(`/platform/addons/${addonId}/versions`),
    enabled: Boolean(addonId),
  });

export interface AddonFeatureAssignment extends TypedFeatureAssignment {
  operation: "REPLACE" | "INCREMENT" | "DECREMENT" | "UNLOCK";
  validity_days?: number | null;
  stackable?: boolean;
  max_quantity?: number | null;
}

export const useTypedPlanFeatures = (planId: string) =>
  useQuery({
    queryKey: adminKeys.typedPlanFeatures(planId),
    queryFn: async () => {
      const res = await apiClient.get<{ items: TypedFeatureAssignment[] }>(`/platform/subscription-plans/${planId}/feature-assignments`);
      return res || { items: [] };
    },
    enabled: !!planId,
  });

export const useUpdateTypedPlanFeatures = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ planId, planVersion, reason, idempotencyKey = crypto.randomUUID(), assignments }: { planId: string; planVersion: number; reason: string; idempotencyKey?: string; assignments: TypedFeatureAssignment[] }) => {
      const feature_keys = assignments.map((a) => a.feature_key);
      return await apiClient.put(`/platform/subscription-plans/${planId}/features`, { feature_keys, assignments }, {
        headers: { "If-Match": String(planVersion), "Idempotency-Key": idempotencyKey, "X-Admin-Reason": reason },
      });
    },
    onSuccess: (_, { planId }) => {
      queryClient.invalidateQueries({ queryKey: adminKeys.subscriptionPlans });
      queryClient.invalidateQueries({ queryKey: adminKeys.featureMatrix });
      queryClient.invalidateQueries({ queryKey: adminKeys.planFeatures(planId) });
      queryClient.invalidateQueries({ queryKey: adminKeys.typedPlanFeatures(planId) });
    },
  });
};

export const useAdminSubscriptions = (params?: { skip?: number; limit?: number; status?: string; plan_id?: string }) =>
  useQuery({
    queryKey: adminKeys.subscriptions(params),
    queryFn: () => adminApi.getSubscriptions(params),
  });

export const useAdminInvoices = (params?: { skip?: number; limit?: number; status?: string; org_id?: string }) =>
  useQuery({
    queryKey: adminKeys.invoices(params),
    queryFn: () => adminApi.getInvoices(params),
  });

export const useRevenueMetrics = (months = 12) =>
  useQuery({
    queryKey: adminKeys.revenue,
    queryFn: () => adminApi.getRevenueMetrics(months),
  });

export const useGlobalUsers = (
  params?: { skip?: number; limit?: number; search?: string; org_id?: string; is_active?: boolean },
  options?: { enabled?: boolean },
) =>
  useQuery({
    queryKey: adminKeys.globalUsers(params),
    queryFn: () => adminApi.getGlobalUsers(params),
    enabled: options?.enabled ?? true,
  });

export const useOrganizationDossier = (id: string) =>
  useQuery({
    queryKey: adminKeys.orgDossier(id),
    queryFn: () => adminApi.getOrgDossier(id),
    enabled: !!id,
  });

export const usePlatformApplications = () =>
  useQuery({
    queryKey: adminKeys.applications,
    queryFn: adminApi.getApplications,
  });

export const useImpersonationLogs = (params?: { skip?: number; limit?: number }) =>
  useQuery({
    queryKey: adminKeys.impersonationLogs(params),
    queryFn: () => adminApi.getImpersonationLogs(params),
  });

export const useJobStats = () =>
  useQuery({
    queryKey: adminKeys.jobStats,
    queryFn: adminApi.getJobStats,
    refetchInterval: 5_000,
  });

export const useJobExecutions = (params?: { status?: string; page?: number; page_size?: number }) =>
  useQuery({
    queryKey: adminKeys.jobExecutions(params),
    queryFn: () => adminApi.getJobExecutions(params),
    refetchInterval: 5_000,
  });

export const useSecurityLogs = (params?: { severity?: string; page?: number; page_size?: number }) =>
  useQuery({
    queryKey: adminKeys.securityLogs(params),
    queryFn: () => adminApi.getSecurityLogs(params),
    refetchInterval: 10_000,
  });

export const useSystemChanges = (params?: { entity_type?: string; page?: number; page_size?: number }) =>
  useQuery({
    queryKey: adminKeys.systemChanges(params),
    queryFn: () => adminApi.getSystemChanges(params),
  });

export const useWorkerLogs = (params?: { page?: number; page_size?: number }) =>
  useQuery({
    queryKey: adminKeys.auditLogs(params),
    queryFn: () => adminApi.getWorkerLogs(params),
  });

export const useSearchJobs = (params?: { organization_id?: string; page?: number; page_size?: number }) =>
  useQuery({
    queryKey: adminKeys.searchJobs(params),
    queryFn: () => adminApi.getSearchJobs(params),
    refetchInterval: 5000,
  });

export const useAdminSupportTickets = () =>
  useQuery({
    queryKey: adminKeys.supportTickets,
    queryFn: adminApi.getSupportTickets,
  });

export const useTicketComments = (ticketId: string) =>
  useQuery({
    queryKey: adminKeys.supportComments(ticketId),
    queryFn: () => adminApi.getTicketComments(ticketId),
    enabled: !!ticketId,
  });

export const useGlobalSettings = () =>
  useQuery({
    queryKey: adminKeys.globalSettings,
    queryFn: adminApi.getGlobalSettings,
  });

export const usePlatformHealth = () =>
  useQuery({
    queryKey: adminKeys.platformHealth,
    queryFn: adminApi.getHealth,
    refetchInterval: 15_000,
  });

export const useSubscriptionHealthSummary = () =>
  useQuery({
    queryKey: adminKeys.subscriptionsHealthSummary,
    queryFn: adminApi.getSubscriptionsHealthSummary,
  });

export const useOrgLimits = (orgId: string) =>
  useQuery({
    queryKey: adminKeys.orgLimits(orgId),
    queryFn: () => adminApi.getOrgLimits(orgId),
    enabled: !!orgId,
  });

export const useOrgDomains = (orgId: string) =>
  useQuery({
    queryKey: adminKeys.orgDomains(orgId),
    queryFn: () => adminApi.getOrgDomains(orgId),
    enabled: !!orgId,
  });

export const useOrgEvents = (orgId: string) =>
  useQuery({
    queryKey: adminKeys.orgEvents(orgId),
    queryFn: () => adminApi.getOrgEvents(orgId),
    enabled: !!orgId,
  });

export const usePlatformPaymentEvents = (params?: { limit?: number }) =>
  useQuery({
    queryKey: adminKeys.paymentEvents(params),
    queryFn: () => adminApi.getPaymentEvents(params),
  });

// ── Mutations ─────────────────────────────────────────────────

export const useUpdateOrgStatus = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, isActive, reason }: { id: string; isActive: boolean; reason: string }) =>
      adminApi.updateOrgStatus(id, isActive, reason),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: platformKey("admin", "orgs") });
      qc.invalidateQueries({ queryKey: platformKey("admin", "orgs") });
    },
  });
};

export const useOverrideFeature = (orgId: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ featureId, isEnabled, reason }: { featureId: string; isEnabled: boolean; reason?: string }) =>
      adminApi.overrideOrgFeature(orgId, featureId, isEnabled, reason),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: adminKeys.orgFeatures(orgId) });
    },
  });
};

export const useCreatePlan = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ data, reason, idempotencyKey = crypto.randomUUID() }: { data: Partial<SubscriptionPlan>; reason: string; idempotencyKey?: string }) =>
      adminApi.createPlan(data, reason, idempotencyKey),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: adminKeys.subscriptionPlans });
      qc.invalidateQueries({ queryKey: adminKeys.featureMatrix });
    },
  });
};

export const useUpdatePlan = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, version, reason, idempotencyKey = crypto.randomUUID(), data }: { id: string; version: number; reason: string; idempotencyKey?: string; data: Partial<SubscriptionPlan> }) =>
      adminApi.updatePlan(id, data, version, reason, idempotencyKey),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: adminKeys.subscriptionPlans });
      qc.invalidateQueries({ queryKey: adminKeys.featureMatrix });
    },
  });
};

export const useUpdatePlanFeatures = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ planId, featureKeys }: { planId: string; featureKeys: string[] }) =>
      adminApi.updatePlanFeatures(planId, featureKeys),
    onSuccess: (_, variables) => {
      qc.invalidateQueries({ queryKey: adminKeys.planFeatures(variables.planId) });
    },
  });
};

export const useTriggerReindex = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ orgId, entityTypes }: { orgId: string; entityTypes?: string[] }) =>
      adminApi.triggerReindex(orgId, entityTypes),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: platformKey("admin", "search-jobs") });
      qc.invalidateQueries({ queryKey: platformKey("admin", "search-jobs") });
    },
  });
};

export const useAddTicketComment = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ ticketId, content }: { ticketId: string; content: string }) =>
      adminApi.addTicketComment(ticketId, content),
    onSuccess: (_, variables) => {
      qc.invalidateQueries({ queryKey: adminKeys.supportTickets });
      qc.invalidateQueries({ queryKey: adminKeys.supportComments(variables.ticketId) });
    },
  });
};

export const useUpdateGlobalSettings = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<GlobalSettings>) => adminApi.updateGlobalSettings(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: adminKeys.globalSettings });
    },
  });
};

export const useChangePlan = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ orgId, planId, reason }: { orgId: string; planId: string; reason: string }) =>
      adminApi.changeOrgPlan(orgId, planId, reason),
    onSuccess: (_, variables) => {
      qc.invalidateQueries({ queryKey: adminKeys.orgDetail(variables.orgId) });
      qc.invalidateQueries({ queryKey: platformKey("admin", "orgs") });
      qc.invalidateQueries({ queryKey: platformKey("admin-orgs") });
      qc.invalidateQueries({ queryKey: platformKey("admin-subscriptions") });
      qc.invalidateQueries({ queryKey: platformKey("admin", "subscriptions") });
      qc.invalidateQueries({ queryKey: platformKey("admin", "orgs") });
      qc.invalidateQueries({ queryKey: platformKey("admin-orgs") });
      qc.invalidateQueries({ queryKey: platformKey("admin-subscriptions") });
      qc.invalidateQueries({ queryKey: platformKey("admin", "subscriptions") });
    },
  });
};

export const useChangeOrgPlan = useChangePlan;

export const useExtendTrial = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ orgId, days, reason }: { orgId: string; days: number; reason: string }) =>
      adminApi.extendTrial(orgId, days, reason),
    onSuccess: (_, variables) => {
      qc.invalidateQueries({ queryKey: adminKeys.orgDetail(variables.orgId) });
      qc.invalidateQueries({ queryKey: platformKey("admin", "subscriptions") });
      qc.invalidateQueries({ queryKey: platformKey("admin", "subscriptions") });
      qc.invalidateQueries({ queryKey: adminKeys.subscriptionsHealthSummary });
      qc.invalidateQueries({ queryKey: platformKey("admin-subscriptions") });
      qc.invalidateQueries({ queryKey: platformKey("admin-dashboard") });
      qc.invalidateQueries({ queryKey: platformKey("admin", "dashboard") });
      qc.invalidateQueries({ queryKey: platformKey("admin-subscriptions") });
      qc.invalidateQueries({ queryKey: platformKey("admin-dashboard") });
      qc.invalidateQueries({ queryKey: platformKey("admin", "dashboard") });
    },
  });
};

export const useApplyCredit = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ orgId, amount, currency, reason }: { orgId: string; amount: number; currency: string; reason: string }) =>
      adminApi.applyCredit(orgId, amount, currency, reason),
    onSuccess: (_, variables) => {
      qc.invalidateQueries({ queryKey: adminKeys.orgTimeline(variables.orgId) });
      qc.invalidateQueries({ queryKey: platformKey("admin", "invoices") });
      qc.invalidateQueries({ queryKey: platformKey("admin", "invoices") });
    },
  });
};

export const useReset2FA = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ userId, reason }: { userId: string; reason: string }) =>
      adminApi.reset2FA(userId, reason),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: adminKeys.globalUsers() });
    },
  });
};

export const useUpdateOrgLimits = (orgId: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ limits, reason }: { limits: Record<string, number>; reason: string }) =>
      adminApi.updateOrgLimits(orgId, limits, reason),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: adminKeys.orgLimits(orgId) });
    },
  });
};

export const useUpdateOrgDetail = (orgId: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: any) => adminApi.updateOrgDetail(orgId, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: adminKeys.orgDetail(orgId) });
      qc.invalidateQueries({ queryKey: platformKey("admin", "orgs") });
      qc.invalidateQueries({ queryKey: platformKey("admin", "orgs") });
    },
  });
};


export const useAddOrgDomain = (orgId: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ domain, reason }: { domain: string; reason: string }) =>
      adminApi.addOrgDomain(orgId, domain, reason),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: adminKeys.orgDomains(orgId) });
    },
  });
};

export const useDeleteOrgDomain = (orgId: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ domainId, reason }: { domainId: string; reason: string }) =>
      adminApi.deleteOrgDomain(orgId, domainId, reason),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: adminKeys.orgDomains(orgId) });
    },
  });
};

export const useVerifyOrgDomain = (orgId: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ domainId, reason }: { domainId: string; reason: string }) =>
      adminApi.verifyOrgDomain(orgId, domainId, reason),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: adminKeys.orgDomains(orgId) });
      qc.invalidateQueries({ queryKey: adminKeys.orgDetail(orgId) });
    },
  });
};

export const useImpersonateUser = () => {
  return useMutation({
    mutationFn: ({ userId, reason }: { userId: string; reason: string }) =>
      adminApi.impersonateUser(userId, { reason }),
  });
};

export const useUpdateUserStatus = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ userId, isActive, reason }: { userId: string; isActive: boolean; reason: string }) =>
      adminApi.updateUserStatus(userId, isActive, reason),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: adminKeys.globalUsers() });
    },
  });
};

export const useUpdateUserPlatformRole = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ userId, platformRole, reason }: {
      userId: string;
      platformRole: "SUPER_ADMIN" | "SUPPORT_ADMIN" | "FINANCE_ADMIN" | "NONE";
      reason: string;
    }) => adminApi.updateUserPlatformRole(userId, platformRole, reason),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: adminKeys.globalUsers() });
    },
  });
};

export const useOrganizationMembers = (orgId: string) =>
  useQuery({
    queryKey: adminKeys.orgMembers(orgId),
    queryFn: () => adminApi.getOrganizationMembers(orgId),
    enabled: !!orgId,
  });

export const useProvisionOrganization = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ payload, idempotencyKey }: { payload: OrganizationProvisionPayload; idempotencyKey: string }) =>
      adminApi.provisionOrganization(payload, idempotencyKey),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.organizations.all }),
  });
};

export const useInviteOrganizationMember = (orgId: string) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: { email: string; org_role: string; reason: string }) => adminApi.inviteOrganizationMember(orgId, payload),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: adminKeys.orgMembers(orgId) }),
  });
};

export const useUpdateOrganizationMember = (orgId: string) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ memberId, orgRole, reason }: { memberId: string; orgRole: string; reason: string }) =>
      adminApi.updateOrganizationMember(orgId, memberId, orgRole, reason),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: adminKeys.orgMembers(orgId) }),
  });
};

export const useRemoveOrganizationMember = (orgId: string) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ memberId, reason }: { memberId: string; reason: string }) =>
      adminApi.removeOrganizationMember(orgId, memberId, reason),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: adminKeys.orgMembers(orgId) }),
  });
};

export const useSetOrganizationMemberEvent = (orgId: string) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ memberId, eventId, assigned, reason }: { memberId: string; eventId: string; assigned: boolean; reason: string }) =>
      assigned
        ? adminApi.assignOrganizationMemberEvent(orgId, memberId, eventId, {}, reason)
        : adminApi.unassignOrganizationMemberEvent(orgId, memberId, eventId, reason),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: adminKeys.orgMembers(orgId) }),
  });
};

export const useDeleteOrgFeatureOverride = (orgId: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ featureId, reason }: { featureId: string; reason: string }) =>
      adminApi.deleteOrgFeatureOverride(orgId, featureId, reason),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: adminKeys.orgFeatures(orgId) });
    },
  });
};

export const usePlatformAudit = (params?: {
  action_type?: string;
  resource_type?: string;
  actor_user_id?: string;
  organization_id?: string;
  cursor?: string;
  limit?: number;
  is_sensitive?: boolean;
}) =>
  useQuery({
    queryKey: adminKeys.auditLogs(params),
    queryFn: () => adminApi.getPlatformAudit(params),
  });

export const useOrgAddons = (orgId: string) =>
  useQuery({
    queryKey: platformKey("admin", "org-addons", orgId),
    queryFn: () => adminApi.getOrgAddons(orgId),
    enabled: !!orgId,
  });

export const useDeleteOrg = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ orgId, reason }: { orgId: string; reason: string }) => adminApi.deleteOrg(orgId, reason),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: platformKey("admin", "orgs") });
      qc.invalidateQueries({ queryKey: platformKey("admin", "orgs") });
    },
  });
};


export const useUpdatePlanFeaturesBulk = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ planId, featureKeys }: { planId: string; featureKeys: string[] }) =>
      adminApi.updatePlanFeaturesBulk(planId, featureKeys),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: adminKeys.planFeatures(vars.planId) });
      qc.invalidateQueries({ queryKey: platformKey("admin", "org-features") });
      qc.invalidateQueries({ queryKey: platformKey("admin", "org-features") });
      qc.invalidateQueries({ queryKey: adminKeys.featureMatrix });
    },
  });
};

export const useBulkExtendTrial = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { org_ids: string[]; days: number; reason: string }) =>
      adminApi.bulkExtendTrial(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: platformKey("admin", "subscriptions") });
      qc.invalidateQueries({ queryKey: platformKey("admin", "subscriptions") });
      qc.invalidateQueries({ queryKey: adminKeys.subscriptionsHealthSummary });
    },
  });
};

export const useBulkChangePlan = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { org_ids: string[]; plan_id: string; reason: string }) =>
      adminApi.bulkChangePlan(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: platformKey("admin", "subscriptions") });
      qc.invalidateQueries({ queryKey: platformKey("admin", "orgs") });
      qc.invalidateQueries({ queryKey: platformKey("admin", "subscriptions") });
      qc.invalidateQueries({ queryKey: platformKey("admin", "orgs") });
    },
  });
};

export const useCancelSubscription = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ subId, reason }: { subId: string; reason: string }) =>
      adminApi.cancelSubscription(subId, reason),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: platformKey("admin", "subscriptions") });
      qc.invalidateQueries({ queryKey: platformKey("admin", "subscriptions") });
      qc.invalidateQueries({ queryKey: adminKeys.subscriptionsHealthSummary });
    },
  });
};

export const useReactivateSubscription = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ subId, reason }: { subId: string; reason: string }) =>
      adminApi.reactivateSubscription(subId, reason),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: platformKey("admin", "subscriptions") });
      qc.invalidateQueries({ queryKey: platformKey("admin", "subscriptions") });
      qc.invalidateQueries({ queryKey: adminKeys.subscriptionsHealthSummary });
    },
  });
};

export const useInvoiceItems = (invoiceId: string) =>
  useQuery({
    queryKey: adminKeys.invoiceItems(invoiceId),
    queryFn: () => adminApi.getInvoiceItems(invoiceId),
    enabled: !!invoiceId,
  });

export const useMarkInvoicePaid = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ invoiceId, reason }: { invoiceId: string; reason: string }) =>
      adminApi.markInvoicePaid(invoiceId, reason),
    onSuccess: (_, { invoiceId }) => {
      qc.invalidateQueries({ queryKey: platformKey("admin", "invoices") });
      qc.invalidateQueries({ queryKey: platformKey("admin", "invoices") });
      qc.invalidateQueries({ queryKey: adminKeys.invoiceItems(invoiceId) });
    },
  });
};

export const useSendInvoiceReminder = () =>
  useMutation({
    mutationFn: ({ invoiceId, reason }: { invoiceId: string; reason: string }) =>
      adminApi.sendInvoiceReminder(invoiceId, reason),
  });

export const useVoidInvoice = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ invoiceId, reason }: { invoiceId: string; reason: string }) =>
      adminApi.voidInvoice(invoiceId, reason),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: platformKey("admin", "invoices") });
      qc.invalidateQueries({ queryKey: platformKey("admin-invoices") });
      qc.invalidateQueries({ queryKey: platformKey("admin", "invoices") });
      qc.invalidateQueries({ queryKey: platformKey("admin-invoices") });
    },
  });
};

// Redefined below in extended commercial api hooks section

export const useForceLogoutUser = () =>
  useMutation({
    mutationFn: ({ userId, reason }: { userId: string; reason: string }) =>
      adminApi.forceLogoutUser(userId, reason),
  });

export const useExportAuditLogs = () =>
  useMutation({
    mutationFn: (payload: any) => adminApi.exportAuditLogs(payload),
  });

export const useRetryJobExecution = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (executionId: string) => adminApi.retryJobExecution(executionId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: platformKey("admin", "job-executions") });
      qc.invalidateQueries({ queryKey: platformKey("admin", "job-stats") });
      qc.invalidateQueries({ queryKey: platformKey("admin", "job-executions") });
      qc.invalidateQueries({ queryKey: platformKey("admin", "job-stats") });
    },
  });
};

export const useCancelJobExecution = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (executionId: string) => adminApi.cancelJobExecution(executionId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: platformKey("admin", "job-executions") });
      qc.invalidateQueries({ queryKey: platformKey("admin", "job-stats") });
      qc.invalidateQueries({ queryKey: platformKey("admin", "job-executions") });
      qc.invalidateQueries({ queryKey: platformKey("admin", "job-stats") });
    },
  });
};

export const useEndImpersonationSession = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (sessionId: string) => adminApi.endImpersonationSession(sessionId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: platformKey("admin", "impersonation-logs") });
      qc.invalidateQueries({ queryKey: platformKey("admin", "impersonation-logs") });
    },
  });
};

export const useCreateFeatureCatalogItem = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: FeatureCatalogPayload) => adminApi.createFeatureCatalogItem(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: adminKeys.featuresCatalog });
    },
  });
};

export const useUpdateFeatureCatalogItem = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: FeatureCatalogPayload }) => adminApi.updateFeatureCatalogItem(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: adminKeys.featuresCatalog });
    },
  });
};

export const useDeleteFeatureCatalogItem = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => adminApi.deleteFeatureCatalogItem(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: adminKeys.featuresCatalog });
    },
  });
};

export const useReorderFeatureCategories = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (categories: string[]) => adminApi.reorderFeatureCategories(categories),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: adminKeys.featuresCatalog });
    },
  });
};

export const useReorderFeatures = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ category, featureIds }: { category: string; featureIds: string[] }) =>
      adminApi.reorderFeatures(category, featureIds),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: adminKeys.featuresCatalog });
    },
  });
};

export const useJobFailures = (executionId: string) =>
  useQuery({
    queryKey: platformKey("admin", "job-failures", executionId),
    queryFn: () => adminApi.getJobFailures(executionId),
    enabled: !!executionId,
  });

export const useSubscriptions = (params?: {
  status?: string;
  search?: string;
  plan_id?: string;
  skip?: number;
  limit?: number;
}) =>
  useQuery({
    queryKey: platformKey("admin-subscriptions", params),
    queryFn: () =>
      apiClient.get<{
        items: Subscription[];
        total: number;
        summary: { total_mrr_inr: number; at_risk_count: number };
      }>("/platform/subscriptions", {
        params,
      }),
    staleTime: 30_000,
  });

export const useRevenueAnalytics = (period = "12m") =>
  useQuery({
    queryKey: platformKey("admin-revenue-analytics", period),
    queryFn: () =>
      apiClient.get<RevenueAnalytics>("/platform/revenue/analytics", {
        params: { period },
      }),
    staleTime: 60_000,
  });

export const useInvoices = (params?: {
  status?: string;
  search?: string;
  skip?: number;
  limit?: number;
  org_id?: string;
}) =>
  useQuery({
    queryKey: platformKey("admin-invoices", params),
    queryFn: () =>
      apiClient.get<{ items: Invoice[]; summary: any; total: number }>("/platform/invoices", {
        params,
      }),
    staleTime: 30_000,
  });

export const useSecurityEvents = (params?: { severity?: string; event_type?: string; skip?: number; limit?: number }) =>
  useQuery({
    queryKey: platformKey('security-events', params),
    queryFn: () => apiClient.get<SecurityEventsResponse>('/platform/security/events', { params }),
    refetchInterval: 30_000,  // auto-refresh every 30s
    staleTime: 15_000,
  });

export const useAuditLogs = (params: {
  action_type?: string
  resource_type?: string
  actor_user_id?: string
  organization_id?: string
  is_sensitive?: boolean
  date_from?: string
  date_to?: string
  include_state?: boolean
  skip?: number
  limit?: number
}) =>
  useQuery({
    queryKey: platformKey('audit-logs', params),
    queryFn: () => apiClient.get<any>('/platform/audit', { params }),
    staleTime: 10_000,
  });

export const useForceLogout = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (userId: string) => apiClient.delete<any>(`/platform/users/${userId}/sessions`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: platformKey('admin-users') }),
  });
};

export interface DatabaseStats {
  connections: {
    total: number
    active: number
    idle: number
    waiting: number
  }
  slow_queries: Array<{
    query: string
    avg_ms: number
    calls: number
  }>
  slow_query_stats_available: boolean
  table_sizes: Array<{
    name: string
    size: string
    bytes: number
  }>
  cache_hit_ratio: number
  database_size_bytes: number
  dead_tuples: number
  migration?: { current_revision?: string | null; expected_revision?: string | null; status: string }
  rls?: { enabled_tables: number; forced_tables: number; status: string }
  backup?: { status: string; latest_backup_at?: string | null; latest_restore_test_at?: string | null }
  freshness_at?: string
}

export interface QuoteLineItemInput {
  category: string
  name: string
  description?: string | null
  quantity: number
  duration_days: number
  unit_rate: number
}

export interface CommercialQuote {
  id: string
  organization_id: string
  event_id: string
  service_request_id?: string | null
  quote_number: string
  title: string
  status: string
  currency: string
  validity_days: number
  valid_until?: string | null
  discount_type: "NONE" | "PERCENTAGE" | "FIXED"
  discount_value: string
  tax_rate: string
  subtotal: string
  discount_amount: string
  taxable_amount: string
  tax_amount: string
  total_amount: string
  version: number
  internal_notes?: string | null
  created_at: string
  updated_at: string
  line_items: Array<QuoteLineItemInput & { id: string; line_subtotal: string; sort_order: number }>
}

export interface QuotePayload {
  organization_id: string
  event_id: string
  service_request_id?: string | null
  title: string
  currency: string
  validity_days: number
  discount_type: "NONE" | "PERCENTAGE" | "FIXED"
  discount_value: number
  tax_rate: number
  internal_notes?: string | null
  line_items: QuoteLineItemInput[]
}

export interface QuoteTotals {
  subtotal: string
  discount_amount: string
  taxable_amount: string
  tax_amount: string
  total_amount: string
}

export interface QuoteApprovalStep {
  id: string
  workflow_id: string
  organization_id: string
  step_order: number
  name: string
  assigned_user_id?: string | null
  required_permission: string
  status: string
  decided_by?: string | null
  decision_reason?: string | null
  decided_at?: string | null
}

export interface QuoteApprovalWorkflow {
  id: string
  organization_id: string
  quote_id: string
  quote_version: number
  status: string
  workflow_version: number
  submission_reason: string
  submitted_by: string
  submitted_at: string
  completed_at?: string | null
  steps: QuoteApprovalStep[]
}

export interface ProposalSnapshotLineItem {
  category: string
  name: string
  description?: string | null
  quantity: string
  duration_days: number
  unit_rate: string
  line_subtotal: string
  sort_order: number
}

export interface ProposalSnapshot {
  quote_id: string
  organization_id: string
  event_id: string
  service_request_id?: string | null
  quote_number: string
  title: string
  status: string
  currency: string
  validity_days: number
  valid_until?: string | null
  discount_type: string
  discount_value: string
  tax_rate: string
  subtotal: string
  discount_amount: string
  taxable_amount: string
  tax_amount: string
  total_amount: string
  version: number
  line_items: ProposalSnapshotLineItem[]
}

export interface ProposalVersion {
  id: string
  organization_id: string
  proposal_id: string
  version: number
  source_quote_id: string
  source_quote_version: number
  snapshot_json: ProposalSnapshot
  reason: string
  created_by: string
  created_at: string
}

export interface CommercialProposal {
  id: string
  organization_id: string
  event_id?: string | null
  quote_id?: string | null
  proposal_number?: string | null
  title: string
  status: string
  current_version: number
  created_by?: string | null
  created_at: string
  updated_at: string
  versions: ProposalVersion[]
}

export interface ProposalDocument {
  export_id: string
  proposal_id: string
  proposal_version: number
  status: "QUEUED" | "RUNNING" | "COMPLETED" | "FAILED" | "CANCELLED"
  file_format: string
  created_at: string
  completed_at?: string | null
  expires_at?: string | null
  failure_reason?: string | null
}

export interface ProposalDocumentDownload {
  download_url: string
  expires_in: number
  filename: string
}

export interface ProposalShare {
  id: string
  proposal_id: string
  proposal_version: number
  recipient_name: string
  recipient_email: string
  status: "ACTIVE" | "EXPIRED" | "REVOKED" | "ACCEPTED" | "REJECTED"
  expires_at: string
  created_by: string
  created_at: string
  last_accessed_at?: string | null
  access_count: number
  decision?: string | null
  decision_reason?: string | null
  signer_name?: string | null
  signer_title?: string | null
  decided_at?: string | null
  revoked_at?: string | null
  revocation_reason?: string | null
}

export interface ProposalShareCreated extends ProposalShare {
  token: string
}

export interface PublicProposal {
  proposal_id: string
  proposal_number?: string | null
  title: string
  proposal_version: number
  recipient_name: string
  status: string
  expires_at: string
  snapshot: ProposalSnapshot
  decided_at?: string | null
}

export interface PublicProposalDecisionResult {
  proposal_id: string
  proposal_version: number
  decision: "ACCEPTED" | "REJECTED"
  signer_name: string
  decided_at: string
}

export interface QueueStat {
  name: string
  depth: number
  status: 'HEALTHY' | 'DEGRADED' | 'OVERLOADED'
  oldest_message_age_seconds?: number | null
  dead_letter_depth?: number | null
  worker_status?: string
  freshness_at?: string
}

export interface OperationsSourceStatus { key: string; status: "HEALTHY" | "DEGRADED" | "DOWN" | "UNAVAILABLE" | "STALE"; freshness_at?: string | null; detail: string }
export interface OperationsOverview { overall_status: string; checked_at: string; sources: OperationsSourceStatus[] }
export interface StorageTelemetry { provider_status: string; provider_detail: string; total_objects: number; total_bytes: number; capacity_bytes: number | null; by_status: Array<{ status: string; count: number; bytes: number }>; freshness_at: string }
export interface OperationalRequest { id: string; organization_id: string; event_id: string; request_number: string; title: string; description?: string | null; status: string; priority: string; request_type: string; version: number; created_at: string; updated_at: string }
export interface CursorResponse<T> { items: T[]; next_cursor?: string | null; has_next: boolean }
export interface OperationalRisk { id: string; organization_id: string; event_id: string; project_id: string; title: string; description?: string | null; severity: string; probability: string; category?: string | null; impact?: string | null; owner_user_id?: string | null; due_date?: string | null; mitigation_plan?: string | null; status: string; version: number; accepted_by?: string | null; accepted_at?: string | null; resolved_at?: string | null }
export interface OperationsProject { id: string; organization_id: string; event_id: string; name: string; project_code: string; status: string }
export interface VenueReadinessItem { id: string; organization_id: string; event_id: string; event_name: string; vendor_id: string; supplier_name: string; contract_reference?: string | null; responsibility_scope: Record<string, unknown>; starts_on?: string | null; ends_on?: string | null; status: string; readiness_status: string; latest_attestation_at?: string | null; device_count: number; online_device_count: number; expired_credentials: number; open_incidents: number; sync_failures: number }
export interface ProcurementVendor { id: string; name: string; type: string; status: string; city: string; country: string }

export const useDatabaseStats = () =>
  useQuery({
    queryKey: platformKey('db-stats'),
    queryFn: () => apiClient.get<DatabaseStats>('/platform/operations/database'),
    refetchInterval: 30_000,
    staleTime: 15_000,
  });

export const useOperationsOverview = () => useQuery({
  queryKey: platformKey('operations-overview'),
  queryFn: () => apiClient.get<OperationsOverview>('/platform/operations/overview'),
  refetchInterval: 30_000,
  staleTime: 10_000,
});

export const useStorageTelemetry = () => useQuery({
  queryKey: platformKey('operations-storage'),
  queryFn: () => apiClient.get<StorageTelemetry>('/platform/operations/storage'),
  refetchInterval: 30_000,
  staleTime: 10_000,
});

export const useOperationalRequests = (params?: Record<string, string | number | undefined>) => useQuery({
  queryKey: platformKey('operations-requests', params),
  queryFn: () => apiClient.get<CursorResponse<OperationalRequest>>('/platform/operations/requests', { params }),
});

export const useOperationalRequestMutation = () => {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: { id: string; action: 'patch' | 'assign' | 'transition'; body: Record<string, unknown> }) => input.action === 'patch'
      ? apiClient.patch<OperationalRequest>(`/platform/operations/requests/${input.id}`, input.body)
      : apiClient.post<OperationalRequest>(`/platform/operations/requests/${input.id}/${input.action}`, input.body),
    onSuccess: () => client.invalidateQueries({ queryKey: platformKey('operations-requests') }),
  });
};

export const useOperationalRisks = (params?: Record<string, string | number | undefined>) => useQuery({
  queryKey: platformKey('operations-risks', params),
  queryFn: () => apiClient.get<{ items: OperationalRisk[] }>('/platform/operations/risks', { params }),
});

export const useOperationsProjects = (params?: Record<string, string | undefined>) => useQuery({
  queryKey: platformKey('operations-projects', params),
  queryFn: () => apiClient.get<{ items: OperationsProject[] }>('/platform/operations/projects', { params }),
});

export const useRiskMutation = () => {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: { id?: string; action: 'create' | 'patch' | 'accept' | 'resolve' | 'actions' | 'comments' | 'evidence'; body: Record<string, unknown>; idempotencyKey?: string }) => {
      if (input.action === 'create') return apiClient.post<OperationalRisk>('/platform/operations/risks', input.body);
      if (input.action === 'patch') return apiClient.patch<OperationalRisk>(`/platform/operations/risks/${input.id}`, input.body);
      return apiClient.post<OperationalRisk>(`/platform/operations/risks/${input.id}/${input.action}`, input.body, { headers: input.idempotencyKey ? { 'Idempotency-Key': input.idempotencyKey } : undefined });
    },
    onSuccess: () => client.invalidateQueries({ queryKey: platformKey('operations-risks') }),
  });
};

export const useVenueReadiness = (params?: Record<string, string | undefined>) => useQuery({
  queryKey: platformKey('operations-venue-readiness', params),
  queryFn: () => apiClient.get<{ items: VenueReadinessItem[]; freshness_at: string }>('/platform/operations/venue/readiness', { params }),
  refetchInterval: 30_000,
});

export const useProcurementVendors = () => useQuery({
  queryKey: platformKey('procurement-vendors'),
  queryFn: () => apiClient.get<ProcurementVendor[]>('/vendors', { params: { status: 'ACTIVE', limit: 200 } }),
});

export const useVenueMutation = () => {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: { path: string; body: Record<string, unknown>; idempotencyKey?: string }) => apiClient.post(`/platform/operations/venue/${input.path}`, input.body, { headers: input.idempotencyKey ? { 'Idempotency-Key': input.idempotencyKey } : undefined }),
    onSuccess: () => client.invalidateQueries({ queryKey: platformKey('operations-venue-readiness') }),
  });
};

export const useJobControl = () => {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: { source: string; jobId: string; action: 'retry' | 'cancel'; organizationId: string; eventId?: string | null; reason: string; idempotencyKey: string }) => apiClient.post(`/platform/operations/jobs/${input.source}/${input.jobId}/${input.action}`, { organization_id: input.organizationId, event_id: input.eventId, reason: input.reason }, { headers: { 'Idempotency-Key': input.idempotencyKey } }),
    onSuccess: () => client.invalidateQueries({ queryKey: platformKey('bg-jobs') }),
  });
};

export const useTriggerSearchReindex = () => {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: { organizationId: string; entityTypes?: string[]; reason: string; idempotencyKey: string }) => apiClient.post<SearchJob>('/search/reindex', { organization_id: input.organizationId, entity_types: input.entityTypes, reason: input.reason }, { headers: { 'Idempotency-Key': input.idempotencyKey } }),
    onSuccess: () => client.invalidateQueries({ queryKey: adminKeys.searchJobs() }),
  });
};

export const useBackgroundJobs = (params?: { status?: string; queue?: string; skip?: number; limit?: number }) =>
  useQuery({
    queryKey: platformKey('bg-jobs', params),
    queryFn: () => apiClient.get<any>('/platform/operations/jobs', { params }),
    refetchInterval: params?.status === undefined ? 10_000 : 30_000,
    staleTime: 5_000,
  });

export const useOrgFeatureOverrides = (orgId: string) =>
  useQuery({
    queryKey: platformKey('org-feature-overrides', orgId),
    queryFn: () => apiClient.get<any[]>(`/platform/organizations/${orgId}/feature-overrides`),
    enabled: !!orgId,
    staleTime: 30_000,
  });

export const useSaveFeatureOverrides = () =>
  useMutation({
    mutationFn: (data: { orgId: string; overrides: { feature_id: string; override: boolean | null }[]; reason: string }) =>
      apiClient.put<any>(`/platform/organizations/${data.orgId}/feature-overrides`, {
        overrides: data.overrides,
        reason: data.reason,
      }),
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: platformKey('org-feature-overrides', vars.orgId) });
      queryClient.invalidateQueries({ queryKey: platformKey('admin-users') });
      queryClient.invalidateQueries({ queryKey: platformKey('org-feature-overrides', vars.orgId) });
      queryClient.invalidateQueries({ queryKey: platformKey('admin-users') });
    },
  });


// Helper functions — add at bottom of service file
export const formatExactINR = (value: number | undefined | null): string => {
  if (value === undefined || value === null || isNaN(value)) return "₹0";
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(value);
};

export const formatINR = (value: number | undefined | null, exact = true): string => {
  if (value === undefined || value === null || isNaN(value)) return "₹0";
  if (exact) return formatExactINR(value);
  if (value >= 10_000_000) return `₹${(value / 10_000_000).toFixed(2)}Cr`;
  if (value >= 100_000) return `₹${(value / 100_000).toFixed(2)}L`;
  if (value >= 1_000) return `₹${(value / 1_000).toFixed(1)}K`;
  return `₹${value.toFixed(0)}`;
};

export const formatMRR = (value: number | undefined | null): string => {
  if (value === undefined || value === null || isNaN(value)) return "₹0"
  return `₹${(value/1000).toFixed(0)}K`
}

export const calcDelta = (trend: number[]): number => {
  if (!trend || trend.length < 2) return 0
  const last = trend[trend.length - 1]
  const prev = trend[trend.length - 2]
  if (prev === 0) return 0
  return Math.round(((last - prev) / prev) * 100 * 10) / 10
}

// ── Phase 4 Hooks ─────────────────────────────────

export interface PaymentGateway {
  id: string
  name: string
  provider: string
  mode: 'LIVE' | 'TEST'
  is_active: boolean
  success_rate: number
  transactions_count: number
  volume_mtd_inr: number
  last_checked_at: string | null
}

export interface TaxRule {
  id: string
  name: string
  tax_type: string
  rate: number
  state_region: string
  is_active: boolean
}

export interface PricingRule {
  id: string
  name: string
  value: number
  is_active: boolean
}

export interface TaxConfigResponse {
  tax_rules: TaxRule[]
  pricing_rules: PricingRule[]
  tax_summary_distribution: { type: string; value: number }[]
}

export interface FinancialTransaction {
  id: string
  organization_id: string
  org_name: string
  amount_inr: number
  gateway: string
  status: 'COMPLETED' | 'FAILED' | 'REFUNDED' | 'PENDING'
  created_at: string
}

export interface FinancialAuditTrailEntry {
  id: string
  organization_id: string
  org_name: string
  activity_type: string
  performed_by_name: string
  amount: number | null
  occurred_at: string
}

export interface AIDashboardResponse {
  total_requests: number
  tokens_used: number
  total_cost_inr: number
  avg_cost_per_1k_tokens: number
  success_rate: number
  requests_over_time: { date: string; successful: number; failed: number }[]
  tokens_over_time: { date: string; model: string; tokens: number }[]
  usage_by_model: { model: string; value: number }[]
  cost_trend: { date: string; cost: number }[]
  top_use_cases: { use_case: string; requests: number; cost: number }[]
}

export interface AIPrompt {
  id: string
  name: string
  category: string
  use_case: string
  model: string
  usage_count: number
  success_rate: number
  last_used_at: string | null
  created_by_name: string
}

export interface AIModel {
  name: string
  provider: string
  type: string
  context: string
  cost_in: number
  cost_out: number
  status: 'ACTIVE' | 'INACTIVE'
  usage_7d: number
}

export const usePaymentGateways = () =>
  useQuery({
    queryKey: platformKey('payment-gateways'),
    queryFn: () => apiClient.get<{ items: PaymentGateway[]; trend: any[] }>('/platform/financial/gateways'),
    refetchInterval: 60_000,
    staleTime: 30_000,
  })

export const useTaxConfig = () =>
  useQuery({
    queryKey: platformKey('tax-config'),
    queryFn: () => apiClient.get<TaxConfigResponse>('/platform/financial/tax-config'),
    staleTime: 60_000,
  })

export const useFinancialTransactions = (params?: { skip?: number; limit?: number; status?: string }) =>
  useQuery({
    queryKey: platformKey('financial-transactions', params),
    queryFn: () => apiClient.get<{ items: FinancialTransaction[]; total: number; summary: any }>('/platform/financial/transactions', { params }),
    staleTime: 30_000,
  })

export const useFinancialAuditTrail = (params?: { date_from?: string; date_to?: string; activity_type?: string; org_id?: string; skip?: number; limit?: number }) =>
  useQuery({
    queryKey: platformKey('financial-audit-trail', params),
    queryFn: () => apiClient.get<{ items: FinancialAuditTrailEntry[]; total: number }>('/platform/financial/audit-trail', { params }),
    staleTime: 30_000,
  })

export const useQueueStats = () =>
  useQuery({
    queryKey: platformKey('queue-stats'),
    queryFn: () => apiClient.get<QueueStat[]>('/platform/operations/queues'),
    refetchInterval: 10_000,
    staleTime: 5_000,
  })

export const useAIDashboard = () =>
  useQuery({
    queryKey: platformKey('ai-dashboard'),
    queryFn: () => apiClient.get<AIDashboardResponse>('/platform/ai/dashboard'),
    staleTime: 30_000,
  })

export const usePromptLibrary = () =>
  useQuery({
    queryKey: platformKey('prompt-library'),
    queryFn: () => apiClient.get<AIPrompt[]>('/platform/ai/prompts'),
    staleTime: 30_000,
  })

export const useModelManagement = () =>
  useQuery({
    queryKey: platformKey('model-management'),
    queryFn: () => apiClient.get<{ models: AIModel[]; auto_routing: boolean; routing_strategy: string; fallback_model: string }>('/platform/ai/models'),
    staleTime: 30_000,
  })


// --- COMMERCIAL CATALOG CATALOG HOOKS & INTERFACES ---

export interface HardwareItem {
  id: string
  item_code: string
  name: string
  category_name: string
  pricing_unit: string      // 'PER_EVENT' | 'PER_DAY'
  cost_price: number
  selling_price: number
  inventory_count: number | null
  status: string
  is_active: boolean
  created_at: string
  category_id: string
  [key: string]: any        // allow extra cols from DB
}

export interface StaffRole {
  id: string
  role_code: string
  name: string
  grade?: string            // G1/G2/G3/G4 if column exists
  cost_per_day: number
  selling_per_day: number
  margin_pct: number
  availability_count?: number
  is_active: boolean
  [key: string]: any
}

export interface PricingRule {
  id: string
  name: string
  rule_code?: string
  is_default: boolean
  hardware_markup_pct: number
  staffing_markup_pct: number
  management_fee_pct: number
  contingency_pct: number
  gst_pct: number
  is_active: boolean
  created_at: string
  updated_at: string
  description?: string
  [key: string]: any
}

export interface SimulationResult {
  hardware_subtotal: number
  staffing_subtotal: number
  markup_fees: number
  management_fee: number
  contingency: number
  pre_gst_total: number
  gst_amount: number
  total_amount: number
  line_items: {
    name: string; quantity: number; days: number
    unit_cost: number; total: number
  }[]
}

export const useHardwareCatalog = (params?: {
  category?: string; status?: string; search?: string; pricing_unit?: string
  skip?: number; limit?: number
}) =>
  useQuery({
    queryKey: platformKey('hardware-catalog', params),
    queryFn: () =>
      apiClient.get<{
        items: HardwareItem[]
        total: number
        summary: any
        active_categories: string[]
        active_pricing_units: string[]
        next_item_code?: string
      }>(
        '/inventory/superadmin/catalog/hardware', { params }
      ),
    staleTime: 60_000,
  })

export const useHardwareCategories = () =>
  useQuery({
    queryKey: platformKey('hardware-categories'),
    queryFn: () =>
      apiClient.get<any[]>('/inventory/superadmin/catalog/hardware/categories'),
    staleTime: 5_000,
  })

export const useStaffCatalog = (params?: {
  search?: string; skip?: number; limit?: number
}) =>
  useQuery({
    queryKey: platformKey('staff-catalog', params),
    queryFn: () =>
      apiClient.get<{ items: StaffRole[]; total: number; summary: any }>(
        '/commercial/superadmin/catalog/staff', { params }
      ),
    staleTime: 60_000,
  })

export const usePricingRules = () =>
  useQuery({
    queryKey: platformKey('pricing-rules'),
    queryFn: () =>
      apiClient.get<PricingRule[]>('/pricing/superadmin/catalog/pricing-rules'),
    staleTime: 120_000,
  })

export const useRunPricingSimulation = () =>
  useMutation({
    mutationFn: (body: {
      pricing_rule_id: string
      name?: string
      event_city_tier: string
      event_days: number
      attendee_count: number
      room_count: number
      counter_count: number
      srr_stations: number
      selected_hardware: { hardware_item_id: string; quantity: number }[]
      selected_staff: { staff_role_id: string; quantity: number; days: number }[]
      snapshot?: Record<string, any>
    }) =>
      apiClient.post<SimulationResult>(
        '/pricing/superadmin/catalog/pricing-simulator/run', body
      ),
  })

export const useCatalogTemplates = () =>
  useQuery({
    queryKey: platformKey('catalog-templates'),
    queryFn: () =>
      apiClient.get<{
        room_templates: any[]
        registration_templates: any[]
        srr_templates: any[]
      }>('/pricing/superadmin/catalog/templates'),
    staleTime: 300_000,
  })

export const useCreateTemplate = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: any) =>
      apiClient.post<any>('/pricing/superadmin/catalog/templates', body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: platformKey('catalog-templates') })
      toast.success('Template created successfully')
    },
    onError: (e: any) => toast.error(e?.response?.data?.detail || e.message),
  })
}

export const useUpdateTemplate = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ slug, ...body }: { slug: string; [key: string]: any }) =>
      apiClient.put(`/pricing/superadmin/catalog/templates/${slug}`, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: platformKey('catalog-templates') })
      toast.success('Template updated successfully')
    },
    onError: (e: any) => toast.error(e?.response?.data?.detail || e.message),
  })
}

export const useDuplicateTemplate = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (slug: string) =>
      apiClient.post<any>(`/pricing/superadmin/catalog/templates/${slug}/duplicate`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: platformKey('catalog-templates') })
      toast.success('Template duplicated successfully')
    },
    onError: (e: any) => toast.error(e?.response?.data?.detail || e.message),
  })
}

export const useSetDefaultTemplate = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (slug: string) =>
      apiClient.post<any>(`/pricing/superadmin/catalog/templates/${slug}/default`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: platformKey('catalog-templates') })
      toast.success('Default template set successfully')
    },
    onError: (e: any) => toast.error(e?.response?.data?.detail || e.message),
  })
}

export const useDeleteTemplate = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (slug: string) =>
      apiClient.delete(`/pricing/superadmin/catalog/templates/${slug}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: platformKey('catalog-templates') })
      toast.success('Template deleted successfully')
    },
    onError: (e: any) => toast.error(e?.response?.data?.detail || e.message),
  })
}

export const useCreateHardwareItem = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: Partial<HardwareItem>) =>
      apiClient.post<any>('/inventory/superadmin/catalog/hardware', body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: platformKey('hardware-catalog') })
      toast.success('Hardware item created')
    },
    onError: (e: any) => toast.error(e?.response?.data?.detail || e.message),
  })
}

export const useUpdateHardwareItem = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...body }: Partial<HardwareItem> & { id: string }) =>
      apiClient.patch<any>(`/inventory/superadmin/catalog/hardware/${id}`, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: platformKey('hardware-catalog') })
      toast.success('Hardware item updated')
    },
    onError: (e: any) => toast.error(e?.response?.data?.detail || e.message),
  })
}

export const useDeleteHardwareItem = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) =>
      apiClient.delete(`/inventory/superadmin/catalog/hardware/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: platformKey('hardware-catalog') })
      toast.success('Hardware item deleted')
    },
    onError: (e: any) => toast.error(e?.response?.data?.detail || e.message),
  })
}

export const useImportHardwareExcel = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (formData: FormData) =>
      apiClient.post<any>('/inventory/superadmin/catalog/hardware/import', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      }),
    onSuccess: (res: any) => {
      qc.invalidateQueries({ queryKey: platformKey('hardware-catalog') })
      toast.success(`Imported ${res?.data?.count || 0} hardware items successfully`)
    },
    onError: (e: any) => toast.error(e?.response?.data?.detail || e.message),
  })
}

export const useCreateStaffRole = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: any) =>
      apiClient.post<any>('/commercial/superadmin/catalog/staff', body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: platformKey('staff-catalog') })
      toast.success('Staff role created')
    },
    onError: (e: any) => toast.error(e?.response?.data?.detail || e.message),
  })
}

export const useUpdateStaffRole = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...body }: any) =>
      apiClient.patch<any>(`/commercial/superadmin/catalog/staff/${id}`, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: platformKey('staff-catalog') })
      toast.success('Staff role updated')
    },
    onError: (e: any) => toast.error(e?.response?.data?.detail || e.message),
  })
}

export const useDeleteStaffRole = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) =>
      apiClient.delete(`/commercial/superadmin/catalog/staff/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: platformKey('staff-catalog') })
      toast.success('Staff role deleted')
    },
    onError: (e: any) => toast.error(e?.response?.data?.detail || e.message),
  })
}

export const useCreatePricingRule = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: any) =>
      apiClient.post<any>('/pricing/superadmin/catalog/pricing-rules', body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: platformKey('pricing-rules') })
      toast.success('Pricing rule created')
    },
    onError: (e: any) => toast.error(e?.response?.data?.detail || e.message),
  })
}

export const useUpdatePricingRule = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...body }: any) =>
      apiClient.patch<any>(`/pricing/superadmin/catalog/pricing-rules/${id}`, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: platformKey('pricing-rules') })
      toast.success('Pricing rule updated')
    },
    onError: (e: any) => toast.error(e?.response?.data?.detail || e.message),
  })
}

export const useImportStaffExcel = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (formData: FormData) =>
      apiClient.post<any>('/commercial/superadmin/catalog/staff/import', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      }),
    onSuccess: (res: any) => {
      qc.invalidateQueries({ queryKey: platformKey('staff-catalog') })
      toast.success(`Imported ${res?.data?.count || 0} staff roles successfully`)
    },
    onError: (e: any) => toast.error(e?.response?.data?.detail || e.message),
  })
}

export const usePricingSimulations = () =>
  useQuery({
    queryKey: platformKey('pricing-simulations'),
    queryFn: () =>
      apiClient.get<any[]>('/pricing/simulations'),
    staleTime: 30_000,
  })

export const useDeletePricingSimulation = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) =>
      apiClient.delete(`/pricing/simulations/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: platformKey('pricing-simulations') })
      toast.success('Simulation run deleted successfully')
    },
    onError: (e: any) => toast.error(e?.response?.data?.detail || e.message),
  })
}

// ── Service Requests Workflow Hooks ─────────────────────────────────

export interface ServiceRequestKpiResponse {
  total: number
  open: number
  status_counts: Record<string, number>
}

export interface ServiceRequestKanbanCard {
  id: string
  request_number: string
  title: string
  priority: string
  request_type: string
  status: string
  created_at: string
  updated_at: string
}

export interface ServiceRequestKanbanColumn {
  key: string
  label: string
  count: number
  cards: ServiceRequestKanbanCard[]
}

export interface ServiceRequestKanbanResponse {
  columns: ServiceRequestKanbanColumn[]
  limit: number
  offset: number
}

export const useServiceRequestsKpi = (organizationId: string, eventId: string) =>
  useQuery({
    queryKey: platformKey('service-requests-kpi', organizationId, eventId),
    queryFn: () => apiClient.get<ServiceRequestKpiResponse>('/service-requests/kpi-strip', {
      params: { organization_id: organizationId, event_id: eventId },
    }),
    enabled: !!organizationId && !!eventId,
  })

export const useServiceRequestsKanban = (organizationId: string, eventId: string, limit = 10, offset = 0) =>
  useQuery({
    queryKey: platformKey('service-requests-kanban', organizationId, eventId, limit, offset),
    queryFn: () => apiClient.get<ServiceRequestKanbanResponse>('/service-requests/kanban-columns', {
      params: { organization_id: organizationId, event_id: eventId, limit, offset },
    }),
    enabled: !!organizationId && !!eventId,
  })

export const useCreateServiceRequest = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ eventId, organizationId, ...body }: { eventId: string; organizationId: string; title: string; description?: string; priority?: string; request_type?: string }) =>
      apiClient.post<any>('/service-requests', body, {
        params: { event_id: eventId, organization_id: organizationId },
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: platformKey('service-requests-kpi') })
      qc.invalidateQueries({ queryKey: platformKey('service-requests-kanban') })
      toast.success('Service Request created successfully')
    },
    onError: (e: any) => toast.error(e?.response?.data?.detail || e.message),
  })
}

export const useUpdateServiceRequest = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...body }: { id: string; title?: string; description?: string; priority?: string; status?: string }) =>
      apiClient.patch<any>(`/service-requests/${id}`, body),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: platformKey('service-requests-kpi') })
      qc.invalidateQueries({ queryKey: platformKey('service-requests-kanban') })
      qc.invalidateQueries({ queryKey: platformKey('service-request-overview', vars.id) })
      qc.invalidateQueries({ queryKey: platformKey('service-request-history', vars.id) })
      qc.invalidateQueries({ queryKey: platformKey('service-request-activity', vars.id) })
      toast.success('Service Request updated successfully')
    },
    onError: (e: any) => toast.error(e?.response?.data?.detail || e.message),
  })
}

export const useSubmitServiceRequest = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => apiClient.post<any>(`/service-requests/${id}/submit`),
    onSuccess: (_, id) => {
      qc.invalidateQueries({ queryKey: platformKey('service-requests-kpi') })
      qc.invalidateQueries({ queryKey: platformKey('service-requests-kanban') })
      qc.invalidateQueries({ queryKey: platformKey('service-request-overview', id) })
      qc.invalidateQueries({ queryKey: platformKey('service-request-history', id) })
      qc.invalidateQueries({ queryKey: platformKey('service-request-activity', id) })
      toast.success('Service Request submitted successfully')
    },
    onError: (e: any) => toast.error(e?.response?.data?.detail || e.message),
  })
}

export const useApproveServiceRequest = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => apiClient.post<any>(`/service-requests/${id}/approve`),
    onSuccess: (_, id) => {
      qc.invalidateQueries({ queryKey: platformKey('service-requests-kpi') })
      qc.invalidateQueries({ queryKey: platformKey('service-requests-kanban') })
      qc.invalidateQueries({ queryKey: platformKey('service-request-overview', id) })
      qc.invalidateQueries({ queryKey: platformKey('service-request-history', id) })
      qc.invalidateQueries({ queryKey: platformKey('service-request-activity', id) })
      toast.success('Service Request approved successfully')
    },
    onError: (e: any) => toast.error(e?.response?.data?.detail || e.message),
  })
}

export const useServiceRequestHistory = (id: string) =>
  useQuery({
    queryKey: platformKey('service-request-history', id),
    queryFn: () => apiClient.get<any>(`/service-requests/${id}/history`),
    enabled: !!id,
  })

export const useServiceRequestOverview = (id: string) =>
  useQuery({
    queryKey: platformKey('service-request-overview', id),
    queryFn: () => apiClient.get<any>(`/service-requests/${id}/overview`),
    enabled: !!id,
  })

export const useServiceRequestRequirements = (id: string) =>
  useQuery({
    queryKey: platformKey('service-request-requirements', id),
    queryFn: () => apiClient.get<any>(`/service-requests/${id}/requirements`),
    enabled: !!id,
  })

export const useUpdateServiceRequestRequirements = (id: string) => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: { requirement_type: string; requirement_data: any }) =>
      apiClient.patch<any>(`/service-requests/${id}/requirements`, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: platformKey('service-request-requirements', id) })
      qc.invalidateQueries({ queryKey: platformKey('service-request-activity', id) })
      toast.success('Requirements updated')
    },
    onError: (e: any) => toast.error(e?.response?.data?.detail || e.message),
  })
}

export const useServiceRequestRemarks = (id: string) =>
  useQuery({
    queryKey: platformKey('service-request-remarks', id),
    queryFn: () => apiClient.get<any>(`/service-requests/${id}/remarks`),
    enabled: !!id,
  })

export const useAddServiceRequestRemark = (id: string) => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: { remark_text: string }) =>
      apiClient.post<any>(`/service-requests/${id}/remarks`, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: platformKey('service-request-remarks', id) })
      qc.invalidateQueries({ queryKey: platformKey('service-request-activity', id) })
      toast.success('Remark added')
    },
    onError: (e: any) => toast.error(e?.response?.data?.detail || e.message),
  })
}

export const useServiceRequestAttachments = (id: string, reqType: string) =>
  useQuery({
    queryKey: platformKey('service-request-attachments', id, reqType),
    queryFn: () => apiClient.get<any>(`/service-requests/${id}/attachments?requirement_type=${reqType}`),
    enabled: !!id && !!reqType,
  })

export const useAddServiceRequestAttachment = (id: string) => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: { requirement_type: string; filename: string; file_size: number }) =>
      apiClient.post<any>(`/service-requests/${id}/attachments`, payload),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: platformKey('service-request-attachments', id, vars.requirement_type) })
      qc.invalidateQueries({ queryKey: platformKey('service-request-activity', id) })
      toast.success('Attachment uploaded')
    },
    onError: (e: any) => toast.error(e?.response?.data?.detail || e.message),
  })
}

export const useServiceRequestPlanning = (id: string) =>
  useQuery({
    queryKey: platformKey('service-request-planning', id),
    queryFn: () => apiClient.get<any>(`/service-requests/${id}/resource-planning`),
    enabled: !!id,
  })

export const useRecalculateServiceRequestPlanning = (id: string) => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => apiClient.post<any>(`/service-requests/${id}/resource-planning/recalculate`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: platformKey('service-request-planning', id) })
      qc.invalidateQueries({ queryKey: platformKey('service-request-activity', id) })
      toast.success('Resource plan recalculated successfully')
    },
    onError: (e: any) => toast.error(e?.response?.data?.detail || e.message),
  })
}

export const useUpdateHardwareQuantity = (id: string) => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: { id: string; quantity: number }) =>
      apiClient.patch<any>(`/service-requests/${id}/resource-planning/hardware`, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: platformKey('service-request-planning', id) })
      toast.success('Hardware quantity updated')
    },
    onError: (e: any) => toast.error(e?.response?.data?.detail || e.message),
  })
}

export const useUpdateStaffQuantity = (id: string) => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: { id: string; quantity: number; days: number }) =>
      apiClient.patch<any>(`/service-requests/${id}/resource-planning/staff`, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: platformKey('service-request-planning', id) })
      toast.success('Staff role configuration updated')
    },
    onError: (e: any) => toast.error(e?.response?.data?.detail || e.message),
  })
}

export const useServiceRequestQuotes = (id: string) =>
  useQuery({
    queryKey: platformKey('service-request-quotes', id),
    queryFn: () => apiClient.get<any>(`/service-requests/${id}/quotes`),
    enabled: !!id,
  })

export const useServiceRequestDocuments = (id: string) =>
  useQuery({
    queryKey: platformKey('service-request-documents', id),
    queryFn: () => apiClient.get<any>(`/service-requests/${id}/documents`),
    enabled: !!id,
  })

export const useServiceRequestActivityLogs = (id: string) =>
  useQuery({
    queryKey: platformKey('service-request-activity', id),
    queryFn: () => apiClient.get<any>(`/service-requests/${id}/activity-logs`),
    enabled: !!id,
  })

// ── B2B Quoting & Proposals React Query Hooks ───────────────────────

export const useAllQuotes = (requestId?: string, status?: string, organizationId?: string) =>
  useQuery({
    queryKey: platformKey('all-quotes', organizationId, requestId, status),
    queryFn: () => apiClient.get<CommercialQuote[]>(`/service-requests/all-quotes`, {
      params: { organization_id: organizationId, request_id: requestId, status }
    }),
    enabled: !!organizationId || !!requestId,
  })

export const useQuoteDetail = (quoteId: string, organizationId?: string) =>
  useQuery({
    queryKey: platformKey('quote-detail', organizationId, quoteId),
    queryFn: () => apiClient.get<CommercialQuote>(`/service-requests/quotes/${quoteId}`, {
      params: { organization_id: organizationId },
    }),
    enabled: !!quoteId,
  })

export const useCreateQuote = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ payload, idempotencyKey }: { payload: QuotePayload; idempotencyKey: string }) =>
      apiClient.post<CommercialQuote>(`/service-requests/quotes`, payload, {
        headers: { 'Idempotency-Key': idempotencyKey },
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: platformKey('all-quotes') })
      toast.success('Draft quote created')
    },
    onError: (e: any) => toast.error(e?.response?.data?.detail || e.message)
  })
}

export const useCalculateQuote = () =>
  useMutation({
    mutationFn: (payload: Pick<QuotePayload, 'line_items' | 'discount_type' | 'discount_value' | 'tax_rate'>) =>
      apiClient.post<QuoteTotals>(`/service-requests/quotes/calculate`, payload),
  })

export const useUpdateQuote = (quoteId: string, organizationId?: string) => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: Omit<QuotePayload, 'organization_id' | 'event_id' | 'service_request_id'> & { expected_version: number; reason: string }) =>
      apiClient.patch<CommercialQuote>(`/service-requests/quotes/${quoteId}`, payload, {
        params: { organization_id: organizationId },
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: platformKey('all-quotes') })
      qc.invalidateQueries({ queryKey: platformKey('quote-detail', quoteId) })
      qc.invalidateQueries({ queryKey: platformKey('quote-cost-breakdown', quoteId) })
      toast.success('Quote updated')
    },
    onError: (e: any) => toast.error(e?.response?.data?.detail || e.message)
  })
}

export const useQuoteCostBreakdown = (quoteId: string) =>
  useQuery({
    queryKey: platformKey('quote-cost-breakdown', quoteId),
    queryFn: () => apiClient.get<any>(`/service-requests/quotes/${quoteId}/cost-breakdown`),
    enabled: !!quoteId,
  })

export const useQuoteRevisions = (quoteId: string) =>
  useQuery({
    queryKey: platformKey('quote-revisions', quoteId),
    queryFn: () => apiClient.get<any>(`/service-requests/quotes/${quoteId}/revisions`),
    enabled: !!quoteId,
  })

export const useCreateQuoteRevision = (quoteId: string) => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: { notes: string[] }) => apiClient.post<any>(`/service-requests/quotes/${quoteId}/revisions`, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: platformKey('quote-revisions', quoteId) })
      qc.invalidateQueries({ queryKey: platformKey('quote-detail', quoteId) })
      toast.success('Quote revision created successfully')
    },
    onError: (e: any) => toast.error(e?.response?.data?.detail || e.message)
  })
}

export const useQuoteApproval = (quoteId: string, organizationId?: string) =>
  useQuery({
    queryKey: platformKey('quote-approval', organizationId, quoteId),
    queryFn: () => apiClient.get<QuoteApprovalWorkflow | null>(`/service-requests/quotes/${quoteId}/approval`, {
      params: { organization_id: organizationId },
    }),
    enabled: !!quoteId,
  })

export const useSubmitQuoteApproval = (quoteId: string, organizationId?: string) => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ expectedQuoteVersion, reason, idempotencyKey }: { expectedQuoteVersion: number; reason: string; idempotencyKey: string }) =>
      apiClient.post<QuoteApprovalWorkflow>(`/service-requests/quotes/${quoteId}/approval/submit`, {
        expected_quote_version: expectedQuoteVersion,
        reason,
      }, {
        params: { organization_id: organizationId },
        headers: { 'Idempotency-Key': idempotencyKey },
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: platformKey('quote-approval', organizationId, quoteId) })
      qc.invalidateQueries({ queryKey: platformKey('quote-detail', organizationId, quoteId) })
      qc.invalidateQueries({ queryKey: platformKey('all-quotes') })
      toast.success('Quote submitted for approval')
    },
    onError: (e: any) => toast.error(e.message || 'Quote submission failed'),
  })
}

export const useActionApprovalStep = (quoteId: string, organizationId?: string) => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ stepId, action, reason, expectedWorkflowVersion, idempotencyKey }: { stepId: string; action: 'APPROVE' | 'REJECT'; reason: string; expectedWorkflowVersion: number; idempotencyKey: string }) =>
      apiClient.post<QuoteApprovalWorkflow>(`/service-requests/quotes/${quoteId}/approval/steps/${stepId}/action`, {
        action,
        reason,
        expected_workflow_version: expectedWorkflowVersion,
      }, {
        params: { organization_id: organizationId },
        headers: { 'Idempotency-Key': idempotencyKey },
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: platformKey('quote-approval', organizationId, quoteId) })
      qc.invalidateQueries({ queryKey: platformKey('quote-detail', organizationId, quoteId) })
      qc.invalidateQueries({ queryKey: platformKey('all-quotes') })
      toast.success('Approval decision recorded')
    },
    onError: (e: any) => toast.error(e.message || 'Approval decision failed')
  })
}

export const useConvertQuoteToProposal = (quoteId: string, organizationId?: string) => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ expectedQuoteVersion, reason, idempotencyKey }: { expectedQuoteVersion: number; reason: string; idempotencyKey: string }) =>
      apiClient.post<CommercialProposal>(`/service-requests/quotes/${quoteId}/proposal`, {
        expected_quote_version: expectedQuoteVersion,
        reason,
      }, {
        params: { organization_id: organizationId },
        headers: { 'Idempotency-Key': idempotencyKey },
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: platformKey('quote-detail', organizationId, quoteId) })
      qc.invalidateQueries({ queryKey: platformKey('all-proposals') })
      toast.success('Approved quote converted to an immutable proposal')
    },
    onError: (e: any) => toast.error(e.message || 'Proposal conversion failed'),
  })
}

export const useProposalDetail = (propId: string, organizationId?: string) =>
  useQuery({
    queryKey: platformKey('proposal-detail', organizationId, propId),
    queryFn: () => apiClient.get<CommercialProposal>(`/service-requests/proposals/${propId}`, {
      params: { organization_id: organizationId },
    }),
    enabled: !!propId,
  })

export const useProposalDocuments = (propId: string, organizationId?: string) =>
  useQuery({
    queryKey: platformKey('proposal-documents', organizationId, propId),
    queryFn: () => apiClient.get<ProposalDocument[]>(`/service-requests/proposals/${propId}/documents`, {
      params: { organization_id: organizationId },
    }),
    enabled: !!propId,
    refetchInterval: query => query.state.data?.some(document => document.status === 'QUEUED' || document.status === 'RUNNING') ? 3_000 : false,
  })

export const useGenerateProposalDocument = (propId: string, organizationId?: string) => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ expectedVersion, reason, idempotencyKey }: { expectedVersion: number; reason: string; idempotencyKey: string }) =>
      apiClient.post<ProposalDocument>(`/service-requests/proposals/${propId}/documents`, {
        expected_version: expectedVersion,
        reason,
      }, {
        params: { organization_id: organizationId },
        headers: { 'Idempotency-Key': idempotencyKey },
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: platformKey('proposal-documents', organizationId, propId) })
      toast.success('Proposal PDF queued for generation')
    },
    onError: (e: any) => toast.error(e.message || 'Proposal PDF generation could not be queued')
  })
}

export const downloadProposalDocument = (propId: string, exportId: string, organizationId?: string) =>
  apiClient.get<ProposalDocumentDownload>(`/service-requests/proposals/${propId}/documents/${exportId}/download`, {
    params: { organization_id: organizationId },
  })

export const useProposalVersionHistory = (propId: string, organizationId?: string) =>
  useQuery({
    queryKey: platformKey('proposal-version-history', organizationId, propId),
    queryFn: () => apiClient.get<ProposalVersion[]>(`/service-requests/proposals/${propId}/version-history`, {
      params: { organization_id: organizationId },
    }),
    enabled: !!propId,
  })

export const useProposalShares = (propId: string, organizationId?: string) =>
  useQuery({
    queryKey: platformKey('proposal-shares', organizationId, propId),
    queryFn: () => apiClient.get<ProposalShare[]>(`/service-requests/proposals/${propId}/shares`, {
      params: { organization_id: organizationId },
    }),
    enabled: !!propId,
  })

export const useCreateProposalShare = (propId: string, organizationId?: string) => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ expectedVersion, recipientName, recipientEmail, expiresInHours, reason, idempotencyKey }: { expectedVersion: number; recipientName: string; recipientEmail: string; expiresInHours: number; reason: string; idempotencyKey: string }) =>
      apiClient.post<ProposalShareCreated>(`/service-requests/proposals/${propId}/shares`, {
        expected_version: expectedVersion,
        recipient_name: recipientName,
        recipient_email: recipientEmail,
        expires_in_hours: expiresInHours,
        reason,
      }, {
        params: { organization_id: organizationId },
        headers: { 'Idempotency-Key': idempotencyKey },
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: platformKey('proposal-shares', organizationId, propId) })
      toast.success('Secure proposal link created')
    },
    onError: (e: any) => toast.error(e.message || 'Proposal link could not be created'),
  })
}

export const useRevokeProposalShare = (propId: string, organizationId?: string) => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ shareId, reason, idempotencyKey }: { shareId: string; reason: string; idempotencyKey: string }) =>
      apiClient.post<ProposalShare>(`/service-requests/proposals/${propId}/shares/${shareId}/revoke`, { reason }, {
        params: { organization_id: organizationId },
        headers: { 'Idempotency-Key': idempotencyKey },
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: platformKey('proposal-shares', organizationId, propId) })
      toast.success('Proposal link revoked')
    },
    onError: (e: any) => toast.error(e.message || 'Proposal link could not be revoked'),
  })
}

export const usePublicProposal = (token: string) =>
  useQuery({
    queryKey: platformKey('public-proposal', token.length, token.slice(-12)),
    queryFn: () => apiClient.get<PublicProposal>('/public/proposals/share', {
      headers: { Authorization: `ProposalShare ${token}` },
    }),
    enabled: !!token,
    retry: false,
    staleTime: Number.POSITIVE_INFINITY,
  })

export const useDecidePublicProposal = (token: string) =>
  useMutation({
    mutationFn: ({ decision, signerName, signerTitle, reason, consentConfirmed, idempotencyKey }: { decision: 'ACCEPTED' | 'REJECTED'; signerName: string; signerTitle?: string; reason: string; consentConfirmed: boolean; idempotencyKey: string }) =>
      apiClient.post<PublicProposalDecisionResult>('/public/proposals/share/decision', {
        decision,
        signer_name: signerName,
        signer_title: signerTitle || null,
        reason,
        consent_confirmed: consentConfirmed,
      }, { headers: { Authorization: `ProposalShare ${token}`, 'Idempotency-Key': idempotencyKey } }),
    onSuccess: result => toast.success(`Proposal ${result.decision.toLowerCase()}`),
    onError: (e: any) => toast.error(e.message || 'Your proposal decision could not be recorded'),
  })

export const usePricingRulesCatalog = () =>
  useQuery({
    queryKey: platformKey('pricing-rules-catalog'),
    queryFn: () => apiClient.get<any>(`/service-requests/pricing-rules-catalog`),
  })


