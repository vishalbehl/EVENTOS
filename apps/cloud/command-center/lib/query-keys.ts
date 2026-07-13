type QueryParams = Record<string, unknown> | undefined;

function stableParams(params: QueryParams) {
  if (!params) return undefined;
  return Object.fromEntries(
    Object.entries(params)
      .filter(([, value]) => value !== undefined && value !== "")
      .sort(([left], [right]) => left.localeCompare(right)),
  );
}

export const queryKeys = {
  permissions: {
    all: ["permissions"] as const,
    effective: (eventId?: string) => ["permissions", "effective", { eventId: eventId || null }] as const,
  },
  events: {
    all: ["events"] as const,
    detail: (eventId: string) => ["events", eventId] as const,
    speakers: (eventId: string, params?: QueryParams) => ["events", eventId, "speakers", stableParams(params)] as const,
    emailTemplates: (eventId: string) => ["events", eventId, "communications", "email-templates"] as const,
    campaigns: (eventId: string) => ["events", eventId, "communications", "campaigns"] as const,
  },
  organizations: {
    all: ["organizations"] as const,
    list: (params?: QueryParams) => ["organizations", "list", stableParams(params)] as const,
    detail: (organizationId: string) => ["organizations", organizationId] as const,
  },
  admin: {
    all: ["admin"] as const,
    domain: (domain: string, params?: QueryParams) => ["admin", domain, stableParams(params)] as const,
  },
} as const;
