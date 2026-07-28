import type { QueryClient, QueryKey } from "@tanstack/react-query";

export type QueryParams = object | undefined;

export function stableParams(params: QueryParams) {
  if (!params) return undefined;
  return Object.fromEntries(
    Object.entries(params)
      .filter(([, value]) => value !== undefined && value !== "")
      .sort(([left], [right]) => left.localeCompare(right)),
  );
}

const tenant = (organizationId?: string | null) => ["tenant", organizationId ?? "platform"] as const;
const event = (organizationId: string | null | undefined, eventId: string) =>
  [...tenant(organizationId), "event", eventId] as const;

export const platformKey = (...segments: readonly unknown[]) => ["platform-admin", ...segments] as const;
const organizationConsole = (organizationId: string) =>
  platformKey("organization-console", organizationId);
const organizationConsoleDomain = (organizationId: string, domain: string) =>
  [...organizationConsole(organizationId), domain] as const;
const organizationConsoleEvent = (organizationId: string, eventId: string) =>
  [...organizationConsole(organizationId), "event", eventId] as const;

export const queryKeys = {
  tenant,
  permissions: {
    all: (organizationId?: string | null) => [...tenant(organizationId), "permissions"] as const,
    effective: (organizationId: string | null | undefined, eventId?: string) =>
      [...tenant(organizationId), "permissions", "effective", { eventId: eventId || null }] as const,
  },
  events: {
    all: (organizationId?: string | null) => [...tenant(organizationId), "events"] as const,
    list: (organizationId: string | null | undefined, params?: QueryParams) =>
      [...tenant(organizationId), "events", "list", stableParams(params)] as const,
    detail: (organizationId: string | null | undefined, eventId: string) =>
      [...event(organizationId, eventId), "detail"] as const,
    speakers: (organizationId: string | null | undefined, eventId: string, params?: QueryParams) =>
      [...event(organizationId, eventId), "speakers", stableParams(params)] as const,
    speakerTalks: (organizationId: string | null | undefined, eventId: string, speakerId?: string | null) =>
      [...event(organizationId, eventId), "speakers", speakerId ?? null, "talks"] as const,
    sessions: (organizationId: string | null | undefined, eventId: string, params?: QueryParams) =>
      [...event(organizationId, eventId), "sessions", stableParams(params)] as const,
    rooms: (organizationId: string | null | undefined, eventId: string) =>
      [...event(organizationId, eventId), "rooms"] as const,
    roomAnalytics: (organizationId: string | null | undefined, eventId: string) =>
      [...event(organizationId, eventId), "rooms", "analytics"] as const,
    roomDevices: (organizationId: string | null | undefined, eventId: string, roomId: string) =>
      [...event(organizationId, eventId), "rooms", roomId, "devices"] as const,
    posters: (organizationId: string | null | undefined, eventId: string, params?: QueryParams) =>
      [...event(organizationId, eventId), "posters", stableParams(params)] as const,
    poster: (organizationId: string | null | undefined, eventId: string, posterId?: string | null) =>
      [...event(organizationId, eventId), "posters", posterId ?? null] as const,
    posterCategories: (organizationId: string | null | undefined, eventId: string) =>
      [...event(organizationId, eventId), "posters", "categories"] as const,
    files: (organizationId: string | null | undefined, eventId: string, params?: QueryParams) =>
      [...event(organizationId, eventId), "files", stableParams(params)] as const,
    analytics: (organizationId: string | null | undefined, eventId: string, view: string, params?: QueryParams) =>
      [...event(organizationId, eventId), "analytics", view, stableParams(params)] as const,
    emailTemplates: (organizationId: string | null | undefined, eventId: string) =>
      [...event(organizationId, eventId), "communications", "email-templates"] as const,
    campaigns: (organizationId: string | null | undefined, eventId: string) =>
      [...event(organizationId, eventId), "communications", "campaigns"] as const,
  },
  organizations: {
    all: ["platform-admin", "organizations"] as const,
    list: (params?: QueryParams) => ["platform-admin", "organizations", "list", stableParams(params)] as const,
    detail: (organizationId: string) => ["platform-admin", "organization", organizationId] as const,
  },
  organizationConsole: {
    all: organizationConsole,
    domain: organizationConsoleDomain,
    event: organizationConsoleEvent,
    eventDomain: (
      organizationId: string,
      eventId: string,
      domain: string,
      ...segments: readonly unknown[]
    ) => [...organizationConsoleEvent(organizationId, eventId), domain, ...segments] as const,
  },
  admin: {
    all: ["platform-admin"] as const,
    domain: (domain: string, params?: QueryParams) =>
      ["platform-admin", domain, stableParams(params)] as const,
  },
} as const;

export const adminKeys = {
  dashboard: queryKeys.admin.domain("dashboard"),
  orgs: (params?: QueryParams) => queryKeys.organizations.list(params),
  orgDetail: queryKeys.organizations.detail,
  orgUsage: (id: string) => ["platform-admin", "organization", id, "usage"] as const,
  orgTimeline: (id: string) => ["platform-admin", "organization", id, "timeline"] as const,
  orgFeatures: (id: string) => ["platform-admin", "organization", id, "features"] as const,
  subscriptionPlans: queryKeys.admin.domain("subscription-plans"),
  featuresCatalog: queryKeys.admin.domain("features-catalog"),
  featureMatrix: queryKeys.admin.domain("feature-matrix"),
  addons: queryKeys.admin.domain("addons"),
  addonVersions: (addonId: string) => queryKeys.admin.domain("addon-versions", { addonId }),
  planVersions: (planId: string) => queryKeys.admin.domain("plan-versions", { planId }),
  typedPlanFeatures: (planId: string) => queryKeys.admin.domain("typed-plan-features", { planId }),
  planFeatures: (planId: string) => ["platform-admin", "plan", planId, "features"] as const,
  subscriptions: (params?: QueryParams) => queryKeys.admin.domain("subscriptions", params),
  invoices: (params?: QueryParams) => queryKeys.admin.domain("invoices", params),
  revenue: queryKeys.admin.domain("revenue"),
  globalUsers: (params?: QueryParams) => queryKeys.admin.domain("global-users", params),
  applications: queryKeys.admin.domain("applications"),
  impersonationLogs: (params?: QueryParams) => queryKeys.admin.domain("impersonation-logs", params),
  jobStats: queryKeys.admin.domain("job-stats"),
  jobExecutions: (params?: QueryParams) => queryKeys.admin.domain("job-executions", params),
  securityLogs: (params?: QueryParams) => queryKeys.admin.domain("security-logs", params),
  systemChanges: (params?: QueryParams) => queryKeys.admin.domain("system-changes", params),
  auditLogs: (params?: QueryParams) => queryKeys.admin.domain("audit-logs", params),
  searchJobs: (params?: QueryParams) => queryKeys.admin.domain("search-jobs", params),
  supportTickets: queryKeys.admin.domain("support-tickets"),
  supportComments: (ticketId: string) => ["platform-admin", "support-tickets", ticketId, "comments"] as const,
  globalSettings: queryKeys.admin.domain("global-settings"),
  platformHealth: queryKeys.admin.domain("platform-health"),
  subscriptionsHealthSummary: queryKeys.admin.domain("subscriptions-health-summary"),
  orgLimits: (orgId: string) => ["platform-admin", "organization", orgId, "limits"] as const,
  orgDomains: (orgId: string) => ["platform-admin", "organization", orgId, "domains"] as const,
  orgEvents: (orgId: string) => ["platform-admin", "organization", orgId, "events"] as const,
  orgMembers: (orgId: string) => ["platform-admin", "organization", orgId, "members"] as const,
  orgAddons: (orgId: string) => ["platform-admin", "organization", orgId, "addons"] as const,
  orgDossier: (orgId: string) => queryKeys.admin.domain("organization-dossier", { organizationId: orgId }),
  paymentEvents: (params?: QueryParams) => queryKeys.admin.domain("payment-events", params),
  revenueAnalytics: queryKeys.admin.domain("revenue-analytics"),
  invoiceItems: (invoiceId: string) => ["platform-admin", "invoices", invoiceId, "items"] as const,
  commercialExports: (organizationId?: string) =>
    ["platform-admin", "commercial-exports", organizationId ?? "all"] as const,
} as const;

export async function invalidateQueryContract(queryClient: QueryClient, keys: readonly QueryKey[]) {
  await Promise.all(keys.map((queryKey) => queryClient.invalidateQueries({ queryKey })));
}
