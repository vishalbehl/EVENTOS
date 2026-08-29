export type CompletionState = "complete" | "partial" | "legacy" | "redirect" | "missing" | "deferred-editor";

export type CompletionEntry = {
  workspace: "organiser" | "event";
  area: string;
  tab: string;
  route: string;
  owner: string;
  backend: string[];
  actions: string[];
  permission: string;
  entitlement: string | null;
  requiredStates: string[];
  status: CompletionState;
};

const states = ["loading", "empty", "no-results", "locked", "forbidden", "error", "partial-failure"];
const organiser = (area: string, tab: string, route: string, owner: string, backend: string[], actions: string[], status: CompletionState = "complete"): CompletionEntry => ({ workspace: "organiser", area, tab, route, owner, backend, actions, permission: "tenant-and-route-policy", entitlement: null, requiredStates: states, status });

export const organiserCompletionManifest: CompletionEntry[] = [
  organiser("Home","Overview","/dashboard/overview","DashboardOverviewPage",["GET /organiser/dashboard"],["open filtered metric","create event","invite person","create team","review access","view plan"]),
  organiser("Home","Needs Attention","/dashboard/needs-attention","DashboardNeedsAttentionPage",["GET /organiser/needs-attention"],["filter","open","assign","snooze","resolve"]),
  organiser("Home","Activity","/dashboard/activity","DashboardActivityPage",["GET /organiser/dashboard"],["filter","open audit"]),
  organiser("Organisation","Profile","/organisation/profile","OrganisationDetailsTab",["GET/PUT /organiser/organisation/profile"],["edit","save","discard"]),
  organiser("Organisation","Workspaces & Branches","/organisation/branches","OrganisationLocationsTab",["GET/POST/PUT /organiser/locations"],["create","edit","assign owner","assign team"]),
  organiser("Organisation","Documents","/organisation/documents","OrganisationDocumentsTab",["GET/POST/DELETE /organiser/documents","POST /organiser/documents/{id}/replace","GET /organiser/documents/{id}/history"],["upload","replace","history","download","archive"]),
  organiser("Organisation","Branding","/organisation/branding","OrganisationBrandingTab",["GET/PUT /organiser/organisation/profile"],["preview","save","discard"]),
  organiser("Organisation","Preferences","/organisation/preferences","OrganisationPreferencesTab",["GET/PUT /organiser/organisation/profile"],["save","discard"]),
  organiser("People & Teams","Users","/people-teams/users","PeopleMembersTab",["GET /organiser/members","PATCH /organiser/members/{id}/status","PATCH /organiser/members/{id}/role"],["invite","change role","suspend","reactivate","open drawer","bulk action"]),
  organiser("People & Teams","Invitations","/people-teams/invitations","PeopleInvitationsTab",["GET /organiser/members","POST/DELETE /organiser/invitations/{id}"],["resend","revoke","modify"]),
  organiser("People & Teams","Teams","/people-teams/teams","PeopleTeamsTab",["GET/POST/PATCH/DELETE /organiser/teams"],["create","edit","archive"]),
  organiser("People & Teams","Team Members","/people-teams/team-members","PeopleAssignmentsTab",["GET /organiser/teams"],["add member","remove member","assign event"]),
  organiser("Access & Roles","Roles","/access-roles/roles","AccessRolesTab",["GET /organiser/access/roles"],["create","clone","edit"]),
  organiser("Access & Roles","Capabilities","/access-roles/capabilities","AccessCapabilitiesTab",["GET /entitlements/features"],["inspect entitlement"]),
  organiser("Access & Roles","Assignments","/access-roles/assignments","AccessAssignments",["GET /organiser/access/assignments"],["assign","preview","revoke"]),
  organiser("Access & Roles","Permission Matrix","/access-roles/permission-matrix","AccessPermissionsTab",["GET /rbac/permissions"],["grant","revoke"]),
  organiser("Access & Roles","Approval Rules","/access-roles/approval-rules","AccessApprovalRulesTab",["GET /organiser/access/approval-rules"],["create","edit","archive"]),
  organiser("Access & Roles","Access Audit","/access-roles/audit","AccessAuditTab",["GET /organiser/audit"],["filter","export"]),
  organiser("Plans & Entitlements","Overview","/plans-entitlements/overview","PlanCurrentTab",["GET /subscriptions/current"],["request change"]),
  organiser("Plans & Entitlements","Features","/plans-entitlements/features","PlanFeaturesTab",["GET /entitlements/features"],["inspect","request access"]),
  organiser("Plans & Entitlements","Limits & Usage","/plans-entitlements/limits-usage","PlanLimitsUsageTab",["GET /subscriptions/current"],["inspect usage"]),
  organiser("Plans & Entitlements","Add-ons","/plans-entitlements/addons","PlanAddonsTab",["GET /organiser/addons/status"],["request add-on"]),
  organiser("Plans & Entitlements","Entitlement History","/plans-entitlements/history","PlanHistoryTab",["GET /organiser/audit"],["inspect source"]),
  organiser("Events","Events","/events","EventsListTab",["GET /organiser/events"],["open","readiness","access","duplicate","archive","restore"]),
  ...["overview","subscription","invoices","payments","receipts","tax"].map(tab=>organiser("Billing",tab[0].toUpperCase()+tab.slice(1),`/billing/${tab}`,`Billing${tab[0].toUpperCase()+tab.slice(1)}Tab`,["GET /organiser/billing/{section}"],["inspect","download","update"])),
  ...["general","security","notifications","integrations","api-webhooks","audit"].map(tab=>organiser("Settings",tab,`/settings/${tab}`,`Settings${tab}Tab`,["GET /organiser/settings/{domain}"],["inspect","update"])),
];
