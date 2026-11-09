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
  organiser("Home","Overview","/dashboard","OrganisationWorkspaceOverview",["GET /organisations/me","GET /organiser/organisation/profile","GET /organiser/members/summary","GET /rbac/summary","GET /organiser/billing/summary","GET /organiser/locations","GET /organiser/documents","GET /organiser/audit"],["review organisation health","manage plan","manage team and access","review usage","open quick actions"]),
  organiser("Organisation","Profile","/organisation/profile","OrganisationDetailsTab",["GET/PUT /organiser/organisation/profile"],["edit","save with version","discard","preview public page"]),
  organiser("Organisation","Branding","/organisation/branding","OrganisationBrandingTab",["GET/PUT /organiser/settings/branding","POST /files/upload","GET /organiser/public-brand-assets/{organization_id}/{kind}"],["upload managed asset","wait for scan","preview","save with version","discard"]),
  organiser("Organisation","Contact & Address","/organisation/contact-address","OrganisationContactTab",["GET/PUT /organiser/organisation/profile"],["edit validated contact fields","select country and state","save with version","discard"]),
  organiser("Organisation","Preferences","/organisation/preferences","OrganisationPreferencesTab",["GET/PUT /organiser/organisation/profile"],["edit locale","save with version","discard"]),
  organiser("Organisation","Compliance & Legal","/organisation/compliance","OrganisationComplianceTab",["GET /organiser/documents"],["open terms","open privacy policy","open compliance documents","open certificates"]),
  organiser("Organisation","Activity & Audit","/organisation/audit","OrganisationAuditTab",["GET /organiser/audit"],["search","filter module","filter actor role","filter date","paginate"]),
  organiser("Organisation","Workspaces & Branches","/organisation/branches","OrganisationLocationsTab",["GET/POST/PUT /organiser/locations"],["create","edit","assign owner","assign team"]),
  organiser("Organisation","Documents","/organisation/documents","OrganisationDocumentsTab",["GET/POST/DELETE /organiser/documents","POST /organiser/documents/{id}/replace","GET /organiser/documents/{id}/history"],["upload","replace","history","download scan-ready asset","archive"]),
  organiser("People & Teams","Team Members","/people-teams/users","PeopleMembersTab",["GET /organiser/members/cursor","GET /organiser/members/summary","PATCH /organiser/members/{id}/status","PATCH /organiser/members/{id}/role"],["search","filter","invite","change role","suspend","reactivate","open drawer","bulk action"]),
  organiser("People & Teams","Teams","/people-teams/teams","PeopleTeamsTab",["GET/POST/PATCH/DELETE /organiser/teams"],["create","edit","archive","manage assignments"]),
  organiser("People & Teams","Invitations","/people-teams/invitations","PeopleInvitationsTab",["GET /organiser/members","POST/DELETE /organiser/invitations/{id}"],["resend","revoke","inspect state"]),
  organiser("Access & Roles","Roles","/access-roles/roles","AccessRolesTab",["GET /rbac/summary","GET/POST/PATCH /organiser/access/roles"],["search","filter","create","clone","edit","archive","inspect assignments"]),
  organiser("Access & Roles","Access Policies","/access-roles/access-policies","AccessPoliciesTab",["GET /rbac/summary","GET /rbac/permissions","GET /organiser/access/assignments","GET /organiser/access/approval-rules","GET /organiser/audit"],["inspect capabilities","assign","preview matrix","manage approvals","inspect audit"]),
  organiser("Commercial","Overview","/commercial/overview","CloudCommercialWorkspace",["GET /access/bootstrap","GET /commercial/account","GET /commercial/overview","GET /organiser/billing/summary"],["validate organisation/account classification","inspect current plan","inspect usage","inspect billing cycle","open invoice","manage payment methods"]),
  organiser("Commercial","Plans & Add-ons","/commercial/workspace","CloudCommercialWorkspace",["GET /commercial/catalog","POST /commercial/pricing/preview","POST /commercial/checkout","POST /commercial/requests"],["compare immutable offers","preview pricing","checkout with stable receipt","request quotation with stable receipt"]),
  organiser("Commercial","Orders","/commercial/requests","CloudCommercialWorkspace",["GET/POST /commercial/requests","POST /commercial/requests/{id}/accept-quote"],["inspect request","submit request","accept quotation with version and stable receipt"]),
  organiser("Commercial","Invoices","/commercial/invoices","BillingInvoicesTab",["GET /organiser/billing/invoices"],["inspect","download"]),
  organiser("Commercial","Payments","/commercial/payments","BillingTransactionsTab",["GET /organiser/billing/payments","GET /organiser/billing/transactions"],["inspect payment","inspect reconciliation","open receipt"]),
  organiser("Commercial","Payment Methods","/commercial/payment-methods","BillingPaymentMethodsTab",["GET /organiser/billing/payment-methods","POST /organiser/billing/payment-methods/setup-session","GET /organiser/billing/payment-method-setups/{id}","PATCH /organiser/billing/payment-methods/{id}/default","DELETE /organiser/billing/payment-methods/{id}"],["start hosted setup","wait for signed webhook","set default with version","retire with version"]),
  organiser("Commercial","History & Tax","/commercial/billing-history","CommercialBillingHistory",["GET /organiser/billing/receipts","GET /organiser/billing/transactions","GET /organiser/billing/credits","GET /organiser/billing/tax","GET /commercial/contracts"],["inspect transactions","download receipts","inspect credits","manage tax profile","inspect immutable contracts"]),
  organiser("Commercial","Usage","/commercial/usage","CloudCommercialWorkspace",["GET /commercial/usage"],["inspect bounded usage"]),
  organiser("Commercial","Capacity","/commercial/capacity","CloudCommercialWorkspace",["GET/POST /commercial/capacity-purchases"],["inspect capacity","purchase capacity"]),
  organiser("Commercial","Contract history","/commercial/history","CloudCommercialWorkspace",["GET /commercial/contracts"],["inspect immutable contract source"]),
  organiser("Compatibility","Plans overview","/plans-entitlements/overview","CommercialCompatibilityTab",["GET /commercial/overview"],["open commercial overview"],"redirect"),
  organiser("Compatibility","Plan features","/plans-entitlements/features","CommercialCompatibilityTab",["GET /commercial/catalog"],["inspect commercial offers"],"redirect"),
  organiser("Compatibility","Limits and usage","/plans-entitlements/limits-usage","CommercialCompatibilityTab",["GET /commercial/usage"],["inspect usage"],"redirect"),
  organiser("Compatibility","Capacity add-ons","/plans-entitlements/addons","CommercialCompatibilityTab",["GET /commercial/capacity-purchases"],["purchase capacity"],"redirect"),
  organiser("Compatibility","Commercial history","/plans-entitlements/history","CommercialCompatibilityTab",["GET /commercial/contracts"],["inspect source"],"redirect"),
  organiser("Compatibility","Legacy billing routes","/billing/*","CommercialCompatibilityRedirect",[],["redirect to Commercial"],"redirect"),
  organiser("Events","All events","/events","EventsListTab",["GET /organiser/events","POST /organiser/events/import","POST /organiser/events/{id}/duplicate","DELETE /events/{id}","POST /organiser/events/{id}/restore"],["search","filter status","switch grid/list","create","import","open","duplicate","archive with version","restore with version"]),
  organiser("Settings","appearance","/settings/appearance","SettingsAppearanceTab",["Local persisted UI preferences"],["select component mode","select background artwork"]),
  ...["general","security","notifications","integrations","api-webhooks","audit"].map(tab=>organiser("Settings",tab,`/settings/${tab}`,`Settings${tab}Tab`,["GET /organiser/settings/{domain}"],["inspect","update"])),
];
