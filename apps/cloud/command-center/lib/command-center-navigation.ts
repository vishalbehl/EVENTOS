import type { LucideIcon } from "lucide-react";
import {
  Activity, BarChart3, Bell, Building2, Calculator, ClipboardList,
  Code2, CreditCard, Database, FileSpreadsheet, FileText, Globe, Landmark,
  LayoutDashboard, Library, Mail, Palette, Settings, ShieldCheck,
  Terminal, Users,
} from "lucide-react";

export interface CommandCenterDestination {
  label: string;
  href: string;
  group: string;
  keywords: string[];
  icon: LucideIcon;
}

export const COMMAND_CENTER_DESTINATIONS: CommandCenterDestination[] = [
  { label: "Overview", href: "/dashboard/overview", group: "Dashboard", keywords: ["home", "metrics"], icon: LayoutDashboard },
  { label: "Platform health", href: "/dashboard/platform-health", group: "Dashboard", keywords: ["services", "status"], icon: Activity },
  { label: "Live activity", href: "/dashboard/live-activity", group: "Dashboard", keywords: ["events", "stream"], icon: Bell },
  { label: "Organizations", href: "/organizations", group: "Tenancy", keywords: ["tenant", "customers"], icon: Building2 },
  { label: "Service requests", href: "/business/sales/service-requests", group: "Commercial", keywords: ["requirements", "sales"], icon: ClipboardList },
  { label: "Quotes", href: "/business/sales/quotes", group: "Commercial", keywords: ["pricing", "revisions"], icon: Calculator },
  { label: "Create quote", href: "/business/sales/quotes/create", group: "Commercial", keywords: ["new", "pricing"], icon: Calculator },
  { label: "Create proposal", href: "/business/sales/proposals/create", group: "Commercial", keywords: ["document", "sales"], icon: FileText },
  { label: "CRM", href: "/business/crm", group: "Commercial", keywords: ["accounts", "contacts", "opportunities"], icon: Users },
  { label: "Pricing simulator", href: "/business/pricing/pricing-simulator", group: "Pricing", keywords: ["calculate", "estimate"], icon: Calculator },
  { label: "Pricing templates", href: "/business/pricing/templates", group: "Pricing", keywords: ["room", "registration", "srr"], icon: Library },
  { label: "Plans", href: "/business/subscription/plans", group: "Licensing", keywords: ["subscription", "limits"], icon: CreditCard },
  { label: "Add-ons", href: "/business/subscription/add-ons", group: "Licensing", keywords: ["entitlement", "catalog"], icon: CreditCard },
  { label: "Entitlements", href: "/business/subscription/entitlements", group: "Licensing", keywords: ["grant", "activation", "snapshot"], icon: ShieldCheck },
  { label: "Invoices", href: "/finance/invoices", group: "Finance", keywords: ["billing", "reconciliation"], icon: FileSpreadsheet },
  { label: "Payments", href: "/finance/payments", group: "Finance", keywords: ["transactions", "reconciliation"], icon: CreditCard },
  { label: "Credit notes", href: "/finance/credit-notes", group: "Finance", keywords: ["refund", "adjustment"], icon: FileText },
  { label: "Financial audit", href: "/finance/financial-audit-trail", group: "Finance", keywords: ["ledger", "evidence"], icon: Landmark },
  { label: "Operations center", href: "/operations-center", group: "Operations", keywords: ["control", "services"], icon: Settings },
  { label: "Jobs", href: "/operations-center/jobs", group: "Operations", keywords: ["worker", "queue"], icon: ClipboardList },
  { label: "Storage", href: "/operations-center/storage", group: "Operations", keywords: ["files", "quarantine"], icon: Database },
  { label: "Venue readiness", href: "/operations-center/venue-readiness", group: "Operations", keywords: ["supplier", "sync"], icon: Activity },
  { label: "Users", href: "/identity-security/users", group: "Identity and security", keywords: ["accounts", "sessions"], icon: Users },
  { label: "Roles", href: "/identity-security/roles", group: "Identity and security", keywords: ["rbac", "access"], icon: ShieldCheck },
  { label: "Permissions", href: "/identity-security/permissions", group: "Identity and security", keywords: ["rbac", "matrix"], icon: ShieldCheck },
  { label: "Audit logs", href: "/identity-security/audit-logs", group: "Identity and security", keywords: ["evidence", "history"], icon: FileText },
  { label: "Security events", href: "/identity-security/security-events", group: "Identity and security", keywords: ["alerts", "risk"], icon: Bell },
  { label: "API keys", href: "/developer-platform/api-keys", group: "Developer platform", keywords: ["credentials", "token"], icon: Code2 },
  { label: "Webhooks", href: "/developer-platform/webhooks", group: "Developer platform", keywords: ["delivery", "signatures"], icon: Terminal },
  { label: "Integrations", href: "/developer-platform/integrations", group: "Developer platform", keywords: ["providers", "connections"], icon: Terminal },
  { label: "Email templates", href: "/applications/templates/email", group: "Templates", keywords: ["email", "designer", "studio", "waypoint", "defaults"], icon: Mail },
  { label: "Website templates", href: "/applications/templates/website", group: "Templates", keywords: ["website", "landing", "builder", "grapesjs", "templates"], icon: Globe },
  { label: "Form templates", href: "/applications/templates/form", group: "Templates", keywords: ["form", "builder", "questionnaire", "registration", "survey", "abstract", "templates"], icon: ClipboardList },
  { label: "Support tickets", href: "/support-center/tickets", group: "Support", keywords: ["sla", "customers"], icon: ClipboardList },
  { label: "Announcements", href: "/support-center/announcements", group: "Support", keywords: ["maintenance", "broadcast"], icon: Bell },
  { label: "Platform settings", href: "/platform-settings/general", group: "Settings", keywords: ["configuration"], icon: Settings },
  { label: "Authentication settings", href: "/platform-settings/authentication", group: "Settings", keywords: ["mfa", "security"], icon: ShieldCheck },
  { label: "UI component catalogue", href: "/design-system", group: "Standards", keywords: ["design", "accessibility", "tokens"], icon: Palette },
  { label: "Reports and exports", href: "/reports/exports", group: "Reports", keywords: ["download", "jobs"], icon: BarChart3 },
];

export function searchDestinations(query: string) {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return COMMAND_CENTER_DESTINATIONS;
  return COMMAND_CENTER_DESTINATIONS.filter((destination) =>
    [destination.label, destination.group, ...destination.keywords]
      .join(" ")
      .toLowerCase()
      .includes(normalized),
  );
}
