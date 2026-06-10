/**
 * Super Admin Service — EventX OS Control Plane
 * All typed API calls for the Super Admin Console.
 * Uses existing apiClient from lib/api-client.ts
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";

const API = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";

// ── Types ─────────────────────────────────────────────────────

export interface DashboardMetrics {
  total_organizations: number;
  active_organizations: number;
  total_active_events: number;
  total_registrations: number;
  storage_used_bytes: number;
  current_mrr: number;
  venue_servers_online: number;
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
}

export interface OrgDetail {
  id: string;
  name: string;
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

export interface Invoice {
  id: string;
  organization_id: string;
  organization_name: string;
  amount: number;
  status: string;
  stripe_invoice_id?: string;
  issued_at: string;
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

  updateGlobalSettings: (data: { timezone: string }) =>
    apiClient.patch<GlobalSettings>("/global-settings", data),
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

export const useAdminSubscriptions = (params?: { skip?: number; limit?: number; status?: string }) =>
  useQuery({
    queryKey: adminKeys.subscriptions(params),
    queryFn: () => adminApi.getSubscriptions(params),
  });

export const useAdminInvoices = (params?: { skip?: number; limit?: number; status?: string }) =>
  useQuery({
    queryKey: adminKeys.invoices(params),
    queryFn: () => adminApi.getInvoices(params),
  });

export const useRevenueMetrics = (months = 12) =>
  useQuery({
    queryKey: adminKeys.revenue,
    queryFn: () => adminApi.getRevenueMetrics(months),
  });

export const useGlobalUsers = (params?: { skip?: number; limit?: number; search?: string; is_active?: boolean }) =>
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
    mutationFn: (data: { timezone: string }) => adminApi.updateGlobalSettings(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: adminKeys.globalSettings });
    },
  });
};
