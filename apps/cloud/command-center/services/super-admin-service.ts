/**
 * Super Admin Service — EventX OS Control Plane
 * All typed API calls for the Super Admin Console.
 * Uses existing apiClient from lib/api-client.ts
 */

import { useQuery, useMutation, useQueryClient, QueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import { toast } from "sonner";

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
  nps_score: number
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
}

export interface AdminOrg {
  id: string;
  name: string;
  slug: string;
  plan: string;
  status: string;
  health_score: number;
  health_status: string;
  created_at: string;
  is_active?: boolean;
  domain?: string;
  custom_domain?: string;
  suspension_reason?: string;
  suspended_at?: string;
  events_count?: number;
  mrr?: number;
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
  country?: string;
  timezone?: string;
  subscription: {
    plan: string;
    status: string;
    current_period_end?: string;
    stripe_customer_id?: string;
  };
  health: {
    score: number;
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
  price_per_event_min?: number;
  price_per_event_max?: number;
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
  created_at: string;
  subscribers_count?: number;
  mrr?: number;
}

export interface FeatureMatrixItem {
  key: string;
  name: string;
  description?: string;
  display_basic: string;
  display_professional: string;
  display_enterprise: string;
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
  billing_unit?: string;
  available_for_plans: string[];
  is_optional_for_plan?: string;
  included_in_plan?: string;
  is_active: boolean;
  created_at: string;
  feature_ids?: string[];
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
  started_at?: string;
  finished_at?: string;
  duration_seconds?: number;
  task_name?: string;
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
  smtp_password: string;
  support_email: string;
  slack_webhook_url: string;
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
  service: string;
  status: string;
  latency_ms?: number;
  pool_usage_pct?: number;
  memory_usage_pct?: number;
  active_workers?: number;
  pending_tasks?: number;
  storage_usage_pct?: number;
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

// ── React Query Keys ──────────────────────────────────────────

export const adminKeys = {
  dashboard: ["admin", "dashboard"] as const,
  orgs: (params?: any) => ["admin", "orgs", params] as const,
  orgDetail: (id: string) => ["admin", "org", id] as const,
  orgUsage: (id: string) => ["admin", "org-usage", id] as const,
  orgTimeline: (id: string) => ["admin", "org-timeline", id] as const,
  orgFeatures: (id: string) => ["admin", "org-features", id] as const,
  subscriptionPlans: ["admin", "subscription-plans"] as const,
  featuresCatalog: ["admin", "features-catalog"] as const,
  featureMatrix: ["admin", "feature-matrix"] as const,
  addons: ["admin", "addons"] as const,
  planFeatures: (planId: string) => ["admin", "plan-features", planId] as const,
  subscriptions: (params?: any) => ["admin", "subscriptions", params] as const,
  invoices: (params?: any) => ["admin", "invoices", params] as const,
  revenue: ["admin", "revenue"] as const,
  globalUsers: (params?: any) => ["admin", "global-users", params] as const,
  applications: ["admin", "applications"] as const,
  impersonationLogs: (params?: any) => ["admin", "impersonation-logs", params] as const,
  jobStats: ["admin", "job-stats"] as const,
  jobExecutions: (params?: any) => ["admin", "job-executions", params] as const,
  securityLogs: (params?: any) => ["admin", "security-logs", params] as const,
  systemChanges: (params?: any) => ["admin", "system-changes", params] as const,
  auditLogs: (params?: any) => ["admin", "audit-logs", params] as const,
  searchJobs: (params?: any) => ["admin", "search-jobs", params] as const,
  supportTickets: ["admin", "support-tickets"] as const,
  supportComments: (ticketId: string) => ["admin", "support-comments", ticketId] as const,
  globalSettings: ["admin", "global-settings"] as const,
  platformHealth: ["admin", "platform-health"] as const,
  subscriptionsHealthSummary: ["admin", "subscriptions-health-summary"] as const,
  orgLimits: (orgId: string) => ["admin", "org-limits", orgId] as const,
  orgDomains: (orgId: string) => ["admin", "org-domains", orgId] as const,
  orgEvents: (orgId: string) => ["admin", "org-events", orgId] as const,
  paymentEvents: (params?: any) => ["admin", "payment-events", params] as const,
  revenueAnalytics: ["admin", "revenue-analytics"] as const,
  invoiceItems: (invId: string) => ["admin", "invoice-items", invId] as const,
};

// ── API Functions ─────────────────────────────────────────────

export const adminApi = {
  getDashboard: () =>
    apiClient.get<DashboardMetrics>("/platform/dashboard"),

  getOrgs: (params?: { skip?: number; limit?: number; search?: string }) =>
    apiClient.get<AdminOrg[]>("/platform/organizations", { params }),

  getOrgDetail: (id: string) =>
    apiClient.get<OrgDetail>(`/platform/organizations/${id}`),

  getOrgUsage: (id: string) =>
    apiClient.get<OrgUsage>(`/platform/organizations/${id}/usage`),

  getOrgTimeline: (id: string) =>
    apiClient.get<TimelineEvent[]>(`/platform/organizations/${id}/timeline`),

  getOrgFeatures: (id: string) =>
    apiClient.get<OrgFeature[]>(`/platform/organizations/${id}/features`),

  overrideOrgFeature: (id: string, featureId: string, isEnabled: boolean) =>
    apiClient.put(`/platform/organizations/${id}/features/overrides`, {
      feature_id: featureId,
      is_enabled: isEnabled,
    }),

  updateOrgStatus: (id: string, isActive: boolean, reason?: string) =>
    apiClient.patch<any>(`/platform/organizations/${id}/status`, {
      is_active: isActive,
      suspension_reason: reason,
    }),

  updateOrgDetail: (id: string, data: any) =>
    apiClient.put(`/platform/organisations/${id}`, data),


  getSubscriptionPlans: () =>
    apiClient.get<SubscriptionPlan[]>("/platform/subscription-plans"),

  createPlan: (data: Partial<SubscriptionPlan>) =>
    apiClient.post<any>("/platform/subscription-plans", data),

  updatePlan: (id: string, data: Partial<SubscriptionPlan>) =>
    apiClient.patch<any>(`/platform/subscription-plans/${id}`, data),

  getFeaturesCatalog: () =>
    apiClient.get<FeatureCatalogItem[]>("/platform/features"),

  getFeatureMatrix: () =>
    apiClient.get<FeatureMatrixCategory[]>("/platform/features/matrix"),

  getAddons: () =>
    apiClient.get<Addon[]>("/platform/addons"),

  createAddon: (data: any) =>
    apiClient.post<any>("/platform/addons", data),

  patchAddon: (addonId: string, data: any) =>
    apiClient.patch<any>(`/platform/addons/${addonId}`, data),

  deleteAddon: (addonId: string) =>
    apiClient.delete(`/platform/addons/${addonId}`),

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

  getJobStats: () =>
    apiClient.get<JobStats>("/jobs/stats"),

  getJobExecutions: (params?: { status?: string; page?: number; page_size?: number }) =>
    apiClient.get<{ items: JobExecution[]; total: number; page: number; page_size: number }>(
      "/jobs/executions", { params }
    ),

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
    apiClient.get<any>("/platform/health"),

  getSubscriptionsHealthSummary: () =>
    apiClient.get<StatusCounts>("/platform/subscriptions/health-summary"),

  changeOrgPlan: (orgId: string, planId: string) =>
    apiClient.patch<any>(`/platform/organizations/${orgId}/subscription/plan`, { plan_id: planId }),

  extendTrial: (orgId: string, days: number, reason: string) =>
    apiClient.patch<any>(`/platform/organizations/${orgId}/trial/extend`, { days, reason }),

  applyCredit: (orgId: string, amount: number, currency: string, reason: string) =>
    apiClient.post<any>(`/platform/organizations/${orgId}/apply-credit`, { amount, currency, reason }),

  reset2FA: (userId: string) =>
    apiClient.delete(`/platform/users/${userId}/2fa`),

  getOrgLimits: (orgId: string) =>
    apiClient.get<Record<string, number>>(`/platform/organizations/${orgId}/limits`),

  updateOrgLimits: (orgId: string, limits: Record<string, number>) =>
    apiClient.put(`/platform/organizations/${orgId}/limits`, limits),

  getOrgDomains: (orgId: string) =>
    apiClient.get<OrgDomain[]>(`/platform/organizations/${orgId}/domains`),

  addOrgDomain: (orgId: string, domain: string) =>
    apiClient.post<OrgDomain>(`/platform/organizations/${orgId}/domains`, { domain }),

  deleteOrgDomain: (orgId: string, domainId: string) =>
    apiClient.delete(`/platform/organizations/${orgId}/domains/${domainId}`),

  verifyOrgDomain: (orgId: string, domainId: string) =>
    apiClient.post<any>(`/platform/organizations/${orgId}/domains/${domainId}/verify`),

  getOrgEvents: (orgId: string) =>
    apiClient.get<OrgEvent[]>(`/platform/organizations/${orgId}/events`),

  getOrgAddons: (orgId: string) =>
    apiClient.get<any[]>(`/platform/organizations/${orgId}/addons`),

  impersonateUser: (userId: string, data: { reason: string }) =>
    apiClient.post<{ access_token: string; token_type: string; expires_in: number; session_id: string }>(
      `/platform/impersonate/${userId}`,
      data
    ),

  getPaymentEvents: (params?: { limit?: number }) =>
    apiClient.get<any[]>("/platform/payment-events", { params }),

  deleteOrg: (orgId: string) =>
    apiClient.delete(`/platform/organizations/${orgId}`),

  updateUserStatus: (userId: string, isActive: boolean) =>
    apiClient.patch<any>(`/platform/users/${userId}/status`, { is_active: isActive }),

  deleteOrgFeatureOverride: (orgId: string, featureId: string) =>
    apiClient.delete(`/platform/organizations/${orgId}/features/overrides/${featureId}`),

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

  bulkChangePlan: (data: { org_ids: string[]; plan_id: string }) =>
    apiClient.post<any>(`/platform/subscriptions/bulk-change-plan`, data),

  cancelSubscription: (subId: string) =>
    apiClient.post<any>(`/platform/subscriptions/${subId}/cancel`),

  reactivateSubscription: (subId: string) =>
    apiClient.post<any>(`/platform/subscriptions/${subId}/reactivate`),

  getInvoiceItems: (invoiceId: string) =>
    apiClient.get<any[]>(`/platform/invoices/${invoiceId}/items`),

  markInvoicePaid: (invoiceId: string) =>
    apiClient.post<any>(`/platform/invoices/${invoiceId}/mark-paid`),

  sendInvoiceReminder: (invoiceId: string) =>
    apiClient.post<any>(`/platform/invoices/${invoiceId}/send-reminder`),

  voidInvoice: (invoiceId: string) =>
    apiClient.post<any>(`/platform/invoices/${invoiceId}/void`),

  getRevenueAnalytics: () =>
    apiClient.get<any>("/platform/revenue/analytics"),

  forceLogoutUser: (userId: string) =>
    apiClient.delete(`/platform/users/${userId}/sessions`),

  exportAuditLogs: (payload: any) =>
    apiClient.post<any>(`/platform/audit/export`, payload),

  retryJobExecution: (executionId: string) =>
    apiClient.post<any>(`/jobs/executions/${executionId}/retry`),

  cancelJobExecution: (executionId: string) =>
    apiClient.delete(`/jobs/executions/${executionId}`),

  endImpersonationSession: (sessionId: string) =>
    apiClient.post<any>(`/platform/impersonation/${sessionId}/end`),

  getJobFailures: (executionId: string) =>
    apiClient.get<any>(`/jobs/executions/${executionId}/failures`),
};

// ── React Query Hooks ─────────────────────────────────────────

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
    mutationFn: (data: any) => adminApi.createAddon(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: adminKeys.addons });
    },
  });
};

export const useUpdateAddon = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ addonId, data }: { addonId: string; data: any }) =>
      adminApi.patchAddon(addonId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: adminKeys.addons });
    },
  });
};

export const useDeleteAddon = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (addonId: string) => adminApi.deleteAddon(addonId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: adminKeys.addons }),
  });
};

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

export const useGlobalUsers = (params?: { skip?: number; limit?: number; search?: string; org_id?: string; is_active?: boolean }) =>
  useQuery({
    queryKey: adminKeys.globalUsers(params),
    queryFn: () => adminApi.getGlobalUsers(params),
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
    mutationFn: ({ id, isActive, reason }: { id: string; isActive: boolean; reason?: string }) =>
      adminApi.updateOrgStatus(id, isActive, reason),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "orgs"] });
    },
  });
};

export const useOverrideFeature = (orgId: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ featureId, isEnabled }: { featureId: string; isEnabled: boolean }) =>
      adminApi.overrideOrgFeature(orgId, featureId, isEnabled),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: adminKeys.orgFeatures(orgId) });
    },
  });
};

export const useCreatePlan = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<SubscriptionPlan>) => adminApi.createPlan(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: adminKeys.subscriptionPlans });
      qc.invalidateQueries({ queryKey: adminKeys.featureMatrix });
    },
  });
};

export const useUpdatePlan = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }: { id: string } & Partial<SubscriptionPlan>) =>
      adminApi.updatePlan(id, data),
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
      qc.invalidateQueries({ queryKey: ["admin", "search-jobs"] });
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
    mutationFn: ({ orgId, planId }: { orgId: string; planId: string }) =>
      adminApi.changeOrgPlan(orgId, planId),
    onSuccess: (_, variables) => {
      qc.invalidateQueries({ queryKey: adminKeys.orgDetail(variables.orgId) });
      qc.invalidateQueries({ queryKey: ["admin", "orgs"] });
      qc.invalidateQueries({ queryKey: ["admin-orgs"] });
      qc.invalidateQueries({ queryKey: ["admin-subscriptions"] });
      qc.invalidateQueries({ queryKey: ["admin", "subscriptions"] });
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
      qc.invalidateQueries({ queryKey: ["admin", "subscriptions"] });
      qc.invalidateQueries({ queryKey: adminKeys.subscriptionsHealthSummary });
      qc.invalidateQueries({ queryKey: ["admin-subscriptions"] });
      qc.invalidateQueries({ queryKey: ["admin-dashboard"] });
      qc.invalidateQueries({ queryKey: ["admin", "dashboard"] });
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
      qc.invalidateQueries({ queryKey: ["admin", "invoices"] });
    },
  });
};

export const useReset2FA = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (userId: string) => apiClient.delete(`/platform/users/${userId}/2fa`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin-users'] }),
  });
};

export const useUpdateOrgLimits = (orgId: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (limits: Record<string, number>) => adminApi.updateOrgLimits(orgId, limits),
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
      qc.invalidateQueries({ queryKey: ["admin", "orgs"] });
    },
  });
};


export const useAddOrgDomain = (orgId: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (domain: string) => adminApi.addOrgDomain(orgId, domain),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: adminKeys.orgDomains(orgId) });
    },
  });
};

export const useDeleteOrgDomain = (orgId: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (domainId: string) => adminApi.deleteOrgDomain(orgId, domainId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: adminKeys.orgDomains(orgId) });
    },
  });
};

export const useVerifyOrgDomain = (orgId: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (domainId: string) => adminApi.verifyOrgDomain(orgId, domainId),
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
    mutationFn: ({ userId, isActive }: { userId: string; isActive: boolean }) =>
      adminApi.updateUserStatus(userId, isActive),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "global-users"] });
    },
  });
};

export const useDeleteOrgFeatureOverride = (orgId: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (featureId: string) =>
      adminApi.deleteOrgFeatureOverride(orgId, featureId),
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
    queryKey: ["admin", "org-addons", orgId],
    queryFn: () => adminApi.getOrgAddons(orgId),
    enabled: !!orgId,
  });

export const useDeleteOrg = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (orgId: string) => adminApi.deleteOrg(orgId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "orgs"] });
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
      qc.invalidateQueries({ queryKey: ["admin", "org-features"] });
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
      qc.invalidateQueries({ queryKey: ["admin", "subscriptions"] });
      qc.invalidateQueries({ queryKey: adminKeys.subscriptionsHealthSummary });
    },
  });
};

export const useBulkChangePlan = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { org_ids: string[]; plan_id: string }) =>
      adminApi.bulkChangePlan(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "subscriptions"] });
      qc.invalidateQueries({ queryKey: ["admin", "orgs"] });
    },
  });
};

export const useCancelSubscription = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (subId: string) => adminApi.cancelSubscription(subId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "subscriptions"] });
      qc.invalidateQueries({ queryKey: adminKeys.subscriptionsHealthSummary });
    },
  });
};

export const useReactivateSubscription = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (subId: string) => adminApi.reactivateSubscription(subId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "subscriptions"] });
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
    mutationFn: (invoiceId: string) => adminApi.markInvoicePaid(invoiceId),
    onSuccess: (_, invoiceId) => {
      qc.invalidateQueries({ queryKey: ["admin", "invoices"] });
      qc.invalidateQueries({ queryKey: adminKeys.invoiceItems(invoiceId) });
    },
  });
};

export const useSendInvoiceReminder = () =>
  useMutation({
    mutationFn: (invoiceId: string) => adminApi.sendInvoiceReminder(invoiceId),
  });

export const useVoidInvoice = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (invoiceId: string) => adminApi.voidInvoice(invoiceId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "invoices"] });
    },
  });
};

// Redefined below in extended commercial api hooks section

export const useForceLogoutUser = () =>
  useMutation({
    mutationFn: (userId: string) => adminApi.forceLogoutUser(userId),
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
      qc.invalidateQueries({ queryKey: ["admin", "job-executions"] });
      qc.invalidateQueries({ queryKey: ["admin", "job-stats"] });
    },
  });
};

export const useCancelJobExecution = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (executionId: string) => adminApi.cancelJobExecution(executionId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "job-executions"] });
      qc.invalidateQueries({ queryKey: ["admin", "job-stats"] });
    },
  });
};

export const useEndImpersonationSession = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (sessionId: string) => adminApi.endImpersonationSession(sessionId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "impersonation-logs"] });
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
    queryKey: ["admin", "job-failures", executionId],
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
    queryKey: ["admin-subscriptions", params],
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
    queryKey: ["admin-revenue-analytics", period],
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
    queryKey: ["admin-invoices", params],
    queryFn: () =>
      apiClient.get<{ items: Invoice[]; summary: any; total: number }>("/platform/invoices", {
        params,
      }),
    staleTime: 30_000,
  });

export const useSecurityEvents = (params?: { severity?: string; event_type?: string; skip?: number }) =>
  useQuery({
    queryKey: ['security-events', params],
    queryFn: () => apiClient.get<any>('/platform/security/events', { params }),
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
    queryKey: ['audit-logs', params],
    queryFn: () => apiClient.get<any>('/platform/audit', { params }),
    staleTime: 10_000,
  });

export const useForceLogout = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (userId: string) => apiClient.delete<any>(`/platform/users/${userId}/sessions`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin-users'] }),
  });
};

export const useDatabaseStats = () =>
  useQuery({
    queryKey: ['db-stats'],
    queryFn: () => apiClient.get<any>('/platform/operations/database'),
    refetchInterval: 30_000,
    staleTime: 15_000,
  });

export const useBackgroundJobs = (params?: { status?: string; queue?: string; skip?: number }) =>
  useQuery({
    queryKey: ['bg-jobs', params],
    queryFn: () => apiClient.get<any>('/platform/operations/jobs', { params }),
    refetchInterval: params?.status === undefined ? 10_000 : 30_000,
    staleTime: 5_000,
  });

export const useOrgFeatureOverrides = (orgId: string) =>
  useQuery({
    queryKey: ['org-feature-overrides', orgId],
    queryFn: () => apiClient.get<any[]>(`/platform/organizations/${orgId}/feature-overrides`),
    enabled: !!orgId,
    staleTime: 30_000,
  });

export const useSaveFeatureOverrides = () =>
  useMutation({
    mutationFn: (data: { orgId: string; overrides: { feature_id: string; override: boolean | null }[] }) =>
      apiClient.put<any>(`/platform/organizations/${data.orgId}/feature-overrides`, data.overrides),
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ['org-feature-overrides', vars.orgId] });
      queryClient.invalidateQueries({ queryKey: ['admin-users'] });
    },
  });


// Helper functions — add at bottom of service file
export const formatINR = (value: number | undefined | null): string => {
  if (value === undefined || value === null || isNaN(value)) return "₹0"
  if (value >= 10_000_000) return `₹${(value/10_000_000).toFixed(2)}Cr`
  if (value >= 100_000) return `₹${(value/100_000).toFixed(2)}L`
  if (value >= 1_000) return `₹${(value/1_000).toFixed(1)}K`
  return `₹${value.toFixed(0)}`
}

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
    queryKey: ['payment-gateways'],
    queryFn: () => apiClient.get<{ items: PaymentGateway[]; trend: any[] }>('/platform/financial/gateways'),
    refetchInterval: 60_000,
    staleTime: 30_000,
  })

export const useTaxConfig = () =>
  useQuery({
    queryKey: ['tax-config'],
    queryFn: () => apiClient.get<TaxConfigResponse>('/platform/financial/tax-config'),
    staleTime: 60_000,
  })

export const useFinancialTransactions = (params?: { skip?: number; limit?: number; status?: string }) =>
  useQuery({
    queryKey: ['financial-transactions', params],
    queryFn: () => apiClient.get<{ items: FinancialTransaction[]; total: number; summary: any }>('/platform/financial/transactions', { params }),
    staleTime: 30_000,
  })

export const useFinancialAuditTrail = (params?: { date_from?: string; date_to?: string; activity_type?: string; org_id?: string; skip?: number; limit?: number }) =>
  useQuery({
    queryKey: ['financial-audit-trail', params],
    queryFn: () => apiClient.get<{ items: FinancialAuditTrailEntry[]; total: number }>('/platform/financial/audit-trail', { params }),
    staleTime: 30_000,
  })

export const useQueueStats = () =>
  useQuery({
    queryKey: ['queue-stats'],
    queryFn: () => apiClient.get<any[]>('/platform/operations/queues'),
    refetchInterval: 10_000,
    staleTime: 5_000,
  })

export const useAIDashboard = () =>
  useQuery({
    queryKey: ['ai-dashboard'],
    queryFn: () => apiClient.get<AIDashboardResponse>('/platform/ai/dashboard'),
    staleTime: 30_000,
  })

export const usePromptLibrary = () =>
  useQuery({
    queryKey: ['prompt-library'],
    queryFn: () => apiClient.get<AIPrompt[]>('/platform/ai/prompts'),
    staleTime: 30_000,
  })

export const useModelManagement = () =>
  useQuery({
    queryKey: ['model-management'],
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
    queryKey: ['hardware-catalog', params],
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
    queryKey: ['hardware-categories'],
    queryFn: () =>
      apiClient.get<any[]>('/inventory/superadmin/catalog/hardware/categories'),
    staleTime: 5_000,
  })

export const useStaffCatalog = (params?: {
  search?: string; skip?: number; limit?: number
}) =>
  useQuery({
    queryKey: ['staff-catalog', params],
    queryFn: () =>
      apiClient.get<{ items: StaffRole[]; total: number; summary: any }>(
        '/commercial/superadmin/catalog/staff', { params }
      ),
    staleTime: 60_000,
  })

export const usePricingRules = () =>
  useQuery({
    queryKey: ['pricing-rules'],
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
    queryKey: ['catalog-templates'],
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
      qc.invalidateQueries({ queryKey: ['catalog-templates'] })
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
      qc.invalidateQueries({ queryKey: ['catalog-templates'] })
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
      qc.invalidateQueries({ queryKey: ['catalog-templates'] })
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
      qc.invalidateQueries({ queryKey: ['catalog-templates'] })
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
      qc.invalidateQueries({ queryKey: ['catalog-templates'] })
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
      qc.invalidateQueries({ queryKey: ['hardware-catalog'] })
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
      qc.invalidateQueries({ queryKey: ['hardware-catalog'] })
      toast.success('Hardware item updated')
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
      qc.invalidateQueries({ queryKey: ['hardware-catalog'] })
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
      qc.invalidateQueries({ queryKey: ['staff-catalog'] })
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
      qc.invalidateQueries({ queryKey: ['staff-catalog'] })
      toast.success('Staff role updated')
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
      qc.invalidateQueries({ queryKey: ['pricing-rules'] })
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
      qc.invalidateQueries({ queryKey: ['pricing-rules'] })
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
      qc.invalidateQueries({ queryKey: ['staff-catalog'] })
      toast.success(`Imported ${res?.data?.count || 0} staff roles successfully`)
    },
    onError: (e: any) => toast.error(e?.response?.data?.detail || e.message),
  })
}

export const usePricingSimulations = () =>
  useQuery({
    queryKey: ['pricing-simulations'],
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
      qc.invalidateQueries({ queryKey: ['pricing-simulations'] })
      toast.success('Simulation run deleted successfully')
    },
    onError: (e: any) => toast.error(e?.response?.data?.detail || e.message),
  })
}

// ── Service Requests Workflow Hooks ─────────────────────────────────

export const useServiceRequestsKpi = (eventId: string) =>
  useQuery({
    queryKey: ['service-requests-kpi', eventId],
    queryFn: () => apiClient.get<any>(`/service-requests/kpi-strip?event_id=${eventId}`),
    enabled: !!eventId,
  })

export const useServiceRequestsKanban = (eventId: string, limit = 10, offset = 0) =>
  useQuery({
    queryKey: ['service-requests-kanban', eventId, limit, offset],
    queryFn: () => apiClient.get<any>(`/service-requests/kanban-columns?event_id=${eventId}&limit=${limit}&offset=${offset}`),
    enabled: !!eventId,
  })

export const useCreateServiceRequest = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ eventId, ...body }: { eventId: string; title: string; description?: string; priority?: string; request_type?: string }) =>
      apiClient.post<any>(`/service-requests?event_id=${eventId}`, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['service-requests-kpi'] })
      qc.invalidateQueries({ queryKey: ['service-requests-kanban'] })
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
      qc.invalidateQueries({ queryKey: ['service-requests-kpi'] })
      qc.invalidateQueries({ queryKey: ['service-requests-kanban'] })
      qc.invalidateQueries({ queryKey: ['service-request-overview', vars.id] })
      qc.invalidateQueries({ queryKey: ['service-request-history', vars.id] })
      qc.invalidateQueries({ queryKey: ['service-request-activity', vars.id] })
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
      qc.invalidateQueries({ queryKey: ['service-requests-kpi'] })
      qc.invalidateQueries({ queryKey: ['service-requests-kanban'] })
      qc.invalidateQueries({ queryKey: ['service-request-overview', id] })
      qc.invalidateQueries({ queryKey: ['service-request-history', id] })
      qc.invalidateQueries({ queryKey: ['service-request-activity', id] })
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
      qc.invalidateQueries({ queryKey: ['service-requests-kpi'] })
      qc.invalidateQueries({ queryKey: ['service-requests-kanban'] })
      qc.invalidateQueries({ queryKey: ['service-request-overview', id] })
      qc.invalidateQueries({ queryKey: ['service-request-history', id] })
      qc.invalidateQueries({ queryKey: ['service-request-activity', id] })
      toast.success('Service Request approved successfully')
    },
    onError: (e: any) => toast.error(e?.response?.data?.detail || e.message),
  })
}

export const useServiceRequestHistory = (id: string) =>
  useQuery({
    queryKey: ['service-request-history', id],
    queryFn: () => apiClient.get<any>(`/service-requests/${id}/history`),
    enabled: !!id,
  })

export const useServiceRequestOverview = (id: string) =>
  useQuery({
    queryKey: ['service-request-overview', id],
    queryFn: () => apiClient.get<any>(`/service-requests/${id}/overview`),
    enabled: !!id,
  })

export const useServiceRequestRequirements = (id: string) =>
  useQuery({
    queryKey: ['service-request-requirements', id],
    queryFn: () => apiClient.get<any>(`/service-requests/${id}/requirements`),
    enabled: !!id,
  })

export const useUpdateServiceRequestRequirements = (id: string) => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: { requirement_type: string; requirement_data: any }) =>
      apiClient.patch<any>(`/service-requests/${id}/requirements`, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['service-request-requirements', id] })
      qc.invalidateQueries({ queryKey: ['service-request-activity', id] })
      toast.success('Requirements updated')
    },
    onError: (e: any) => toast.error(e?.response?.data?.detail || e.message),
  })
}

export const useServiceRequestRemarks = (id: string) =>
  useQuery({
    queryKey: ['service-request-remarks', id],
    queryFn: () => apiClient.get<any>(`/service-requests/${id}/remarks`),
    enabled: !!id,
  })

export const useAddServiceRequestRemark = (id: string) => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: { remark_text: string }) =>
      apiClient.post<any>(`/service-requests/${id}/remarks`, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['service-request-remarks', id] })
      qc.invalidateQueries({ queryKey: ['service-request-activity', id] })
      toast.success('Remark added')
    },
    onError: (e: any) => toast.error(e?.response?.data?.detail || e.message),
  })
}

export const useServiceRequestAttachments = (id: string, reqType: string) =>
  useQuery({
    queryKey: ['service-request-attachments', id, reqType],
    queryFn: () => apiClient.get<any>(`/service-requests/${id}/attachments?requirement_type=${reqType}`),
    enabled: !!id && !!reqType,
  })

export const useAddServiceRequestAttachment = (id: string) => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: { requirement_type: string; filename: string; file_size: number }) =>
      apiClient.post<any>(`/service-requests/${id}/attachments`, payload),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['service-request-attachments', id, vars.requirement_type] })
      qc.invalidateQueries({ queryKey: ['service-request-activity', id] })
      toast.success('Attachment uploaded')
    },
    onError: (e: any) => toast.error(e?.response?.data?.detail || e.message),
  })
}

export const useServiceRequestPlanning = (id: string) =>
  useQuery({
    queryKey: ['service-request-planning', id],
    queryFn: () => apiClient.get<any>(`/service-requests/${id}/resource-planning`),
    enabled: !!id,
  })

export const useRecalculateServiceRequestPlanning = (id: string) => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => apiClient.post<any>(`/service-requests/${id}/resource-planning/recalculate`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['service-request-planning', id] })
      qc.invalidateQueries({ queryKey: ['service-request-activity', id] })
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
      qc.invalidateQueries({ queryKey: ['service-request-planning', id] })
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
      qc.invalidateQueries({ queryKey: ['service-request-planning', id] })
      toast.success('Staff role configuration updated')
    },
    onError: (e: any) => toast.error(e?.response?.data?.detail || e.message),
  })
}

export const useServiceRequestQuotes = (id: string) =>
  useQuery({
    queryKey: ['service-request-quotes', id],
    queryFn: () => apiClient.get<any>(`/service-requests/${id}/quotes`),
    enabled: !!id,
  })

export const useServiceRequestDocuments = (id: string) =>
  useQuery({
    queryKey: ['service-request-documents', id],
    queryFn: () => apiClient.get<any>(`/service-requests/${id}/documents`),
    enabled: !!id,
  })

export const useServiceRequestActivityLogs = (id: string) =>
  useQuery({
    queryKey: ['service-request-activity', id],
    queryFn: () => apiClient.get<any>(`/service-requests/${id}/activity-logs`),
    enabled: !!id,
  })

// ── B2B Quoting & Proposals React Query Hooks ───────────────────────

export const useAllQuotes = (requestId?: string, status?: string) =>
  useQuery({
    queryKey: ['all-quotes', requestId, status],
    queryFn: () => apiClient.get<any>(`/service-requests/all-quotes`, {
      params: { request_id: requestId, status }
    }),
  })

export const useQuoteDetail = (quoteId: string) =>
  useQuery({
    queryKey: ['quote-detail', quoteId],
    queryFn: () => apiClient.get<any>(`/service-requests/quotes/${quoteId}`),
    enabled: !!quoteId,
  })

export const useCreateQuote = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: any) => apiClient.post<any>(`/service-requests/quotes`, payload),
    onSuccess: (res: any) => {
      qc.invalidateQueries({ queryKey: ['all-quotes'] })
      toast.success('Quote generated successfully')
    },
    onError: (e: any) => toast.error(e?.response?.data?.detail || e.message)
  })
}

export const useUpdateQuote = (quoteId: string) => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: any) => apiClient.patch<any>(`/service-requests/quotes/${quoteId}`, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['all-quotes'] })
      qc.invalidateQueries({ queryKey: ['quote-detail', quoteId] })
      qc.invalidateQueries({ queryKey: ['quote-cost-breakdown', quoteId] })
      toast.success('Quote updated')
    },
    onError: (e: any) => toast.error(e?.response?.data?.detail || e.message)
  })
}

export const useQuoteCostBreakdown = (quoteId: string) =>
  useQuery({
    queryKey: ['quote-cost-breakdown', quoteId],
    queryFn: () => apiClient.get<any>(`/service-requests/quotes/${quoteId}/cost-breakdown`),
    enabled: !!quoteId,
  })

export const useQuoteRevisions = (quoteId: string) =>
  useQuery({
    queryKey: ['quote-revisions', quoteId],
    queryFn: () => apiClient.get<any>(`/service-requests/quotes/${quoteId}/revisions`),
    enabled: !!quoteId,
  })

export const useCreateQuoteRevision = (quoteId: string) => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: { notes: string[] }) => apiClient.post<any>(`/service-requests/quotes/${quoteId}/revisions`, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['quote-revisions', quoteId] })
      qc.invalidateQueries({ queryKey: ['quote-detail', quoteId] })
      toast.success('Quote revision created successfully')
    },
    onError: (e: any) => toast.error(e?.response?.data?.detail || e.message)
  })
}

export const useQuoteApproval = (quoteId: string) =>
  useQuery({
    queryKey: ['quote-approval', quoteId],
    queryFn: () => apiClient.get<any>(`/service-requests/quotes/${quoteId}/approval`),
    enabled: !!quoteId,
  })

export const useActionApprovalStep = (quoteId: string) => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ stepId, action, comment }: { stepId: string; action: string; comment?: string }) =>
      apiClient.post<any>(`/service-requests/quotes/${quoteId}/approval/steps/${stepId}/action`, { action, comment }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['quote-approval', quoteId] })
      qc.invalidateQueries({ queryKey: ['quote-detail', quoteId] })
      toast.success('Approval step updated successfully')
    },
    onError: (e: any) => toast.error(e?.response?.data?.detail || e.message)
  })
}

export const useAllProposals = (requestId?: string, status?: string) =>
  useQuery({
    queryKey: ['all-proposals', requestId, status],
    queryFn: () => apiClient.get<any>(`/service-requests/proposals/list`, {
      params: { request_id: requestId, status }
    }),
  })

export const useProposalDetail = (propId: string) =>
  useQuery({
    queryKey: ['proposal-detail', propId],
    queryFn: () => apiClient.get<any>(`/service-requests/proposals/${propId}`),
    enabled: !!propId,
  })

export const useCreateProposal = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: any) => apiClient.post<any>(`/service-requests/proposals`, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['all-proposals'] })
      toast.success('Proposal created successfully')
    },
    onError: (e: any) => toast.error(e?.response?.data?.detail || e.message)
  })
}

export const useUpdateProposal = (propId: string) => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: any) => apiClient.patch<any>(`/service-requests/proposals/${propId}`, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['all-proposals'] })
      qc.invalidateQueries({ queryKey: ['proposal-detail', propId] })
      toast.success('Proposal updated')
    },
    onError: (e: any) => toast.error(e?.response?.data?.detail || e.message)
  })
}

export const useProposalDocuments = (propId: string) =>
  useQuery({
    queryKey: ['proposal-documents', propId],
    queryFn: () => apiClient.get<any>(`/service-requests/proposals/${propId}/documents`),
    enabled: !!propId,
  })

export const useGenerateProposalDocuments = (propId: string) => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => apiClient.post<any>(`/service-requests/proposals/${propId}/documents/generate`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['proposal-documents', propId] })
      toast.success('Document generation triggered asynchronously')
    },
    onError: (e: any) => toast.error(e?.response?.data?.detail || e.message)
  })
}

export const useProposalVersionHistory = (propId: string) =>
  useQuery({
    queryKey: ['proposal-version-history', propId],
    queryFn: () => apiClient.get<any>(`/service-requests/proposals/${propId}/version-history`),
    enabled: !!propId,
  })

export const useCreateProposalVersion = (propId: string) => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: { description: string; changes_count?: number }) =>
      apiClient.post<any>(`/service-requests/proposals/${propId}/versions`, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['proposal-version-history', propId] })
      qc.invalidateQueries({ queryKey: ['proposal-detail', propId] })
      toast.success('Proposal version successfully created')
    },
    onError: (e: any) => toast.error(e?.response?.data?.detail || e.message)
  })
}

export const usePricingRulesCatalog = () =>
  useQuery({
    queryKey: ['pricing-rules-catalog'],
    queryFn: () => apiClient.get<any>(`/service-requests/pricing-rules-catalog`),
  })

export const useCreateProposalShareLink = (propId: string) =>
  useMutation({
    mutationFn: (payload: { expires_in_hours: number }) =>
      apiClient.post<any>(`/service-requests/proposals/${propId}/share`, payload),
    onSuccess: () => {
      toast.success('Configurable public share link copied')
    },
    onError: (e: any) => toast.error(e?.response?.data?.detail || e.message)
  })






