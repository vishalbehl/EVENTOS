/**
 * Super Admin Service — Event OS Control Plane
 * All typed API calls for the Super Admin Console.
 * Uses existing apiClient from lib/api-client.ts
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";

const API = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";

// ── Types ─────────────────────────────────────────────────────

export interface ActivityItem {
  org_id: string;
  org_name: string;
  action: string;
  amount: number | null;
  occurred_at: string;
}

export interface TrialExpiring {
  org_id: string;
  org_name: string;
  plan_name: string;
  trial_ends_at: string;
  days_remaining: number;
}

export interface DashboardMetrics {
  total_organizations: number;
  active_organizations: number;
  trial_organizations: number;
  total_users: number;
  total_events: number;
  total_active_events: number;
  total_registrations: number;
  storage_used_bytes: number;
  current_mrr: number;
  mrr_current: number;
  arr_current: number;
  venue_servers_online: number;
  active_users_30d: number;
  churn_rate: number;
  nps_score: number;
  open_tickets: number;
  events_this_month: number;
  revenue_today: number;
  orgs_trend: number[];
  users_trend: number[];
  mrr_trend: number[];
  events_trend: number[];
  subscriptions_active: number;
  subscriptions_trial: number;
  subscriptions_grace: number;
  subscriptions_suspended: number;
  subscriptions_expired: number;
  subscriptions_cancelled: number;
  recent_activity: ActivityItem[];
  trials_expiring: TrialExpiring[];
  platform_status: "healthy" | "degraded" | "down";
  services_degraded: number;
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
  description?: string;
  max_events: number;
  max_users: number;
  max_registrations: number;
  max_rooms: number;
  storage_quota_mb: number;
  stripe_product_id?: string;
  stripe_price_id?: string;
  is_active: boolean;
  created_at: string;
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
  status: 'ACTIVE' | 'TRIAL' | 'GRACE_PERIOD' | 'SUSPENDED' | 'EXPIRED' | 'CANCELLED'
  trial_ends_at: string | null
  current_period_end: string | null
  stripe_customer_id: string | null
  stripe_subscription_id: string | null
  mrr: number
}

export interface Invoice {
  id: string;
  organization_id: string;
  org_name: string;
  organization_name?: string; // compatibility
  plan_name: string;
  amount: number;
  currency: string;
  status: string;
  stripe_invoice_id: string | null;
  due_date: string;
  paid_at: string | null;
  created_at?: string;
  issued_at?: string; // compatibility
}

export interface RevenueAnalytics {
  mrr_by_month: { period: string; mrr: number; arr: number }[]
  mrr_by_plan: { plan: string; mrr: number; orgs: number }[]
  upgrades_this_month: number
  arpu: number
  summary: { mrr: number; arr: number }
  
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
  is_addon: boolean;
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
    apiClient.patch(`/platform/organizations/${id}/status`, {
      is_active: isActive,
      suspension_reason: reason,
    }),

  getSubscriptionPlans: () =>
    apiClient.get<SubscriptionPlan[]>("/platform/subscription-plans"),

  createPlan: (data: Partial<SubscriptionPlan>) =>
    apiClient.post("/platform/subscription-plans", data),

  updatePlan: (id: string, data: Partial<SubscriptionPlan>) =>
    apiClient.patch(`/platform/subscription-plans/${id}`, data),

  getFeaturesCatalog: () =>
    apiClient.get<any[]>("/platform/features"),

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
    apiClient.post(`/support/tickets/${ticketId}/comments`, { content }),

  getGlobalSettings: () =>
    apiClient.get<GlobalSettings>("/global-settings"),

  updateGlobalSettings: (data: Partial<GlobalSettings>) =>
    apiClient.patch<GlobalSettings>("/global-settings", data),

  createFeatureCatalogItem: (data: any) =>
    apiClient.post("/platform/features", data),

  updateFeatureCatalogItem: (id: string, data: any) =>
    apiClient.patch(`/platform/features/${id}`, data),

  deleteFeatureCatalogItem: (id: string) =>
    apiClient.delete(`/platform/features/${id}`),

  getHealth: () =>
    apiClient.get<ServiceHealth[]>("/platform/health"),

  getSubscriptionsHealthSummary: () =>
    apiClient.get<StatusCounts>("/platform/subscriptions/health-summary"),

  changeOrgPlan: (orgId: string, planId: string) =>
    apiClient.patch(`/platform/organizations/${orgId}/subscription/plan`, { plan_id: planId }),

  extendTrial: (orgId: string, days: number, reason: string) =>
    apiClient.patch(`/platform/organizations/${orgId}/trial/extend`, { days, reason }),

  applyCredit: (orgId: string, amount: number, currency: string, reason: string) =>
    apiClient.post(`/platform/organizations/${orgId}/apply-credit`, { amount, currency, reason }),

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
    apiClient.post(`/platform/organizations/${orgId}/domains/${domainId}/verify`),

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
    apiClient.patch(`/platform/users/${userId}/status`, { is_active: isActive }),

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
    apiClient.patch(`/platform/plans/${planId}`, data),

  updatePlanFeaturesBulk: (planId: string, featureKeys: string[]) =>
    apiClient.put(`/platform/plans/${planId}/features`, { feature_keys: featureKeys }),

  bulkExtendTrial: (data: { org_ids: string[]; days: number; reason: string }) =>
    apiClient.post(`/platform/subscriptions/bulk-extend`, data),

  bulkChangePlan: (data: { org_ids: string[]; plan_id: string }) =>
    apiClient.post(`/platform/subscriptions/bulk-change-plan`, data),

  cancelSubscription: (subId: string) =>
    apiClient.post(`/platform/subscriptions/${subId}/cancel`),

  reactivateSubscription: (subId: string) =>
    apiClient.post(`/platform/subscriptions/${subId}/reactivate`),

  getInvoiceItems: (invoiceId: string) =>
    apiClient.get<any[]>(`/platform/invoices/${invoiceId}/items`),

  markInvoicePaid: (invoiceId: string) =>
    apiClient.post(`/platform/invoices/${invoiceId}/mark-paid`),

  sendInvoiceReminder: (invoiceId: string) =>
    apiClient.post(`/platform/invoices/${invoiceId}/send-reminder`),

  voidInvoice: (invoiceId: string) =>
    apiClient.post(`/platform/invoices/${invoiceId}/void`),

  getRevenueAnalytics: () =>
    apiClient.get<any>("/platform/revenue/analytics"),

  forceLogoutUser: (userId: string) =>
    apiClient.delete(`/platform/users/${userId}/sessions`),

  exportAuditLogs: (payload: any) =>
    apiClient.post(`/platform/audit/export`, payload),

  retryJobExecution: (executionId: string) =>
    apiClient.post(`/jobs/executions/${executionId}/retry`),

  cancelJobExecution: (executionId: string) =>
    apiClient.delete(`/jobs/executions/${executionId}`),

  endImpersonationSession: (sessionId: string) =>
    apiClient.post(`/platform/impersonation/${sessionId}/end`),

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
    onSuccess: () => qc.invalidateQueries({ queryKey: adminKeys.subscriptionPlans }),
  });
};

export const useUpdatePlan = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }: { id: string } & Partial<SubscriptionPlan>) =>
      adminApi.updatePlan(id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: adminKeys.subscriptionPlans }),
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
  return useMutation({
    mutationFn: (userId: string) => adminApi.reset2FA(userId),
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

export const useUpdatePlanLimits = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ planId, data }: { planId: string; data: any }) =>
      adminApi.patchPlanLimits(planId, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: adminKeys.subscriptionPlans });
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
    mutationFn: (data: any) => adminApi.createFeatureCatalogItem(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: adminKeys.featuresCatalog });
    },
  });
};

export const useUpdateFeatureCatalogItem = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) => adminApi.updateFeatureCatalogItem(id, data),
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
      apiClient.get<{ items: Subscription[]; total: number }>("/platform/subscriptions", {
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
      apiClient.get<{ items: Invoice[]; summary: any }>("/platform/invoices", {
        params,
      }),
    staleTime: 30_000,
  });



