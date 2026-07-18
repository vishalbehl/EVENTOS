import type { LucideIcon } from "lucide-react";
import {
  Activity, AppWindow, BarChart3, Bell, BookOpen, Box, Building2,
  Calculator, ClipboardList, Code2, CreditCard, Database, FileSearch,
  FileSpreadsheet, FileText, Gauge, History, KeyRound, Landmark,
  LayoutDashboard, Library, Mail, Palette, Percent, Plug, Receipt, Languages,
  Search, Settings, Shield, ShieldCheck, SlidersHorizontal, Terminal,
  Ticket, Users, WalletCards, Webhook,
} from "lucide-react";

export type ConsoleKey = "home" | "business" | "revenue" | "operations" | "security" | "developer" | "support";

export interface ConsoleNavigationItem { label: string; href: string; icon: LucideIcon; keywords?: string[]; matchers?: string[] }
export interface ConsoleNavigationGroup { label: string; items: ConsoleNavigationItem[] }
export interface ConsoleTabDefinition { label: string; href: string; icon?: LucideIcon }
export interface ConsoleDefinition {
  key: ConsoleKey; name: string; shortName: string; description: string;
  dashboardRoute: string; icon: LucideIcon; accent: string;
  matchers: string[]; navigation: ConsoleNavigationGroup[];
}

const item = (label: string, href: string, icon: LucideIcon, keywords?: string[]): ConsoleNavigationItem => ({ label, href, icon, keywords });

export const CONSOLE_REGISTRY: Record<ConsoleKey, ConsoleDefinition> = {
  home: { key: "home", name: "Command Center", shortName: "Home", description: "Platform-wide posture, organizations, activity and reporting.", dashboardRoute: "/dashboard/overview", icon: LayoutDashboard, accent: "var(--chart-1)", matchers: ["/dashboard", "/organizations", "/reports", "/design-system"], navigation: [
    { label: "Command center", items: [item("Overview", "/dashboard/overview", LayoutDashboard), item("Platform health", "/dashboard/platform-health", Activity), item("Live activity", "/dashboard/live-activity", Bell), item("Console access", "/dashboard/consoles", AppWindow)] },
    { label: "Platform", items: [item("Organizations", "/organizations", Building2), item("Analytics", "/reports/analytics", BarChart3), item("Reports & exports", "/reports/exports", FileSpreadsheet)] },
  ] },
  business: { key: "business", name: "Business Console", shortName: "Business", description: "Commercial pipeline, pricing, proposals and subscriptions.", dashboardRoute: "/business/dashboard", icon: Building2, accent: "var(--chart-4)", matchers: ["/business/dashboard", "/business/crm", "/business/sales", "/business/pricing", "/business/subscription"], navigation: [
    { label: "Overview", items: [item("Business dashboard", "/business/dashboard", LayoutDashboard), item("CRM", "/business/crm", Users)] },
    { label: "Sales", items: [item("Service requests", "/business/sales/service-requests", ClipboardList), item("Quotes", "/business/sales/quotes", Calculator), item("Proposals", "/business/sales/proposals/create", FileText)] },
    { label: "Pricing", items: [{ ...item("Catalogue", "/business/pricing/catalogue", Box, ["hardware", "staff", "vendor", "margin", "history"]), matchers: ["/business/pricing/hardware-catalog", "/business/pricing/staff-catalog", "/business/pricing/vendor-pricing", "/business/pricing/price-history", "/business/pricing/margin-rules"] }, item("Templates", "/business/pricing/templates", Library), item("Pricing simulator", "/business/pricing/pricing-simulator", Calculator), item("Saved simulations", "/business/pricing/saved-simulations", History)] },
    { label: "Subscriptions", items: [item("Plans", "/business/subscription/plans", SlidersHorizontal), item("Add-ons", "/business/subscription/add-ons", CreditCard), item("Entitlements", "/business/subscription/entitlements", ShieldCheck)] },
  ] },
  revenue: { key: "revenue", name: "Revenue Console", shortName: "Revenue", description: "Revenue health, collections, taxation and financial control.", dashboardRoute: "/business/revenue", icon: Landmark, accent: "var(--chart-2)", matchers: ["/business/revenue", "/finance"], navigation: [
    { label: "Overview", items: [item("Revenue dashboard", "/business/revenue", LayoutDashboard)] },
    { label: "Finance", items: [item("Invoices", "/finance/invoices", FileSpreadsheet), item("Transactions", "/finance/transactions", WalletCards), item("Payments", "/finance/payments", CreditCard), item("Credit notes", "/finance/credit-notes", FileText), item("Taxes", "/finance/taxes", Percent), item("Financial audit", "/finance/financial-audit-trail", Landmark)] },
  ] },
  operations: { key: "operations", name: "Operations Console", shortName: "Operations", description: "Service health, workloads, infrastructure and venue readiness.", dashboardRoute: "/operations-center", icon: Gauge, accent: "var(--chart-3)", matchers: ["/operations-center"], navigation: [
    { label: "Operations", items: [item("Operations dashboard", "/operations-center", LayoutDashboard), item("Requests", "/operations-center/requests", FileText), item("Venue readiness", "/operations-center/venue-readiness", Activity), item("Risk analysis", "/operations-center/risk-analysis", Shield), item("Jobs", "/operations-center/jobs", ClipboardList), item("Database", "/operations-center/database", Database), item("Storage & queues", "/operations-center/storage", Box), item("Search jobs", "/operations-center/search", Search)] },
  ] },
  security: { key: "security", name: "Security Console", shortName: "Security", description: "Identity, access governance, audit and threat posture.", dashboardRoute: "/identity-security", icon: ShieldCheck, accent: "var(--chart-5)", matchers: ["/identity-security"], navigation: [
    { label: "Security", items: [item("Security dashboard", "/identity-security", LayoutDashboard), item("Users", "/identity-security/users", Users), item("Roles", "/identity-security/roles", ShieldCheck), item("Permissions", "/identity-security/permissions", Shield), item("Access reviews", "/identity-security/access-reviews", KeyRound), item("Audit logs", "/identity-security/audit-logs", FileSearch), item("Security events", "/identity-security/security-events", Bell), item("Impersonation", "/identity-security/impersonation", Users)] },
  ] },
  developer: { key: "developer", name: "Developer Console", shortName: "Developer", description: "APIs, credentials, integrations, delivery and applications.", dashboardRoute: "/developer-platform", icon: Terminal, accent: "var(--chart-1)", matchers: ["/developer-platform", "/applications"], navigation: [
    { label: "Developer platform", items: [item("Developer dashboard", "/developer-platform", LayoutDashboard), item("API catalogue", "/developer-platform/apis", Code2), item("API keys", "/developer-platform/api-keys", KeyRound), item("Webhooks", "/developer-platform/webhooks", Webhook), item("Integrations", "/developer-platform/integrations", Plug), item("Logs", "/developer-platform/logs", FileText)] },
    { label: "Applications", items: [item("Application registry", "/applications/registry", AppWindow), item("Feature flags", "/applications/feature-flags", SlidersHorizontal)] },
  ] },
  support: { key: "support", name: "Support Console", shortName: "Support", description: "Customer support, SLA risk and service communication.", dashboardRoute: "/support-center", icon: Ticket, accent: "var(--chart-3)", matchers: ["/support-center"], navigation: [
    { label: "Support", items: [item("Support dashboard", "/support-center", LayoutDashboard), item("Tickets", "/support-center/tickets", Ticket), item("Knowledge base", "/support-center/knowledge-base", BookOpen), item("Announcements", "/support-center/announcements", Bell)] },
  ] },
};

export const CONSOLE_KEYS = Object.keys(CONSOLE_REGISTRY) as ConsoleKey[];

export function resolveConsoleKey(pathname?: string | null): ConsoleKey {
  const path = pathname || "/dashboard/overview";
  for (const key of CONSOLE_KEYS.filter((value) => value !== "home")) {
    if (CONSOLE_REGISTRY[key].matchers.some((prefix) => path === prefix || path.startsWith(`${prefix}/`))) return key;
  }
  return "home";
}

export function isNavigationItemActive(pathname: string, href: string, matchers: string[] = []) {
  return pathname === href || matchers.some((matcher) => pathname === matcher || pathname.startsWith(`${matcher}/`)) || (href !== "/operations-center" && href !== "/identity-security" && href !== "/developer-platform" && href !== "/support-center" && pathname.startsWith(`${href}/`));
}

export const DASHBOARD_TABS: ConsoleTabDefinition[] = [
  { label: "Overview", href: "/dashboard/overview", icon: LayoutDashboard },
  { label: "Platform health", href: "/dashboard/platform-health", icon: Activity },
  { label: "Live activity", href: "/dashboard/live-activity", icon: Bell },
  { label: "Console access", href: "/dashboard/consoles", icon: AppWindow },
];

export const SETTINGS_TABS: ConsoleTabDefinition[] = [
  { label: "General", href: "/platform-settings/general", icon: Settings },
  { label: "Branding", href: "/platform-settings/branding", icon: Palette },
  { label: "Localization", href: "/platform-settings/localization", icon: Languages },
  { label: "Notifications", href: "/platform-settings/notifications", icon: Mail },
  { label: "Authentication", href: "/platform-settings/authentication", icon: ShieldCheck },
  { label: "Interface standards", href: "/platform-settings/interface-standards", icon: SlidersHorizontal },
];
