"use client";
import type { ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { Building2, KeyRound, Lock, Settings } from "lucide-react";
import { orgApi } from "@/components/organizer/org/org-api";
import { MetricCard } from "../OrganiserPrimitives";
import { OrganiserSection } from "../OrganiserSection";
export const settingsTabs = [["General", "/settings/general"], ["Security", "/settings/security"], ["Notifications", "/settings/notifications"], ["Integrations", "/settings/integrations"], ["API & Webhooks", "/settings/api-webhooks"], ["Audit Logs", "/settings/audit"]].map(([label, href]) => ({ label, href }));
export function SettingsPage({ actions, children }: { actions?: ReactNode; children: ReactNode }) { const org = useQuery({ queryKey: ["organisation", "me"], queryFn: orgApi.me }); const data = org.data?.organization; return <OrganiserSection title="Settings" description="Manage organisation defaults, security, notifications, integrations, API access, and audit records." tabs={settingsTabs} actions={actions}><div className="op-metric-grid"><MetricCard label="Workspace" value={data?.is_active ? "Active" : "Unavailable"} tone="green" icon={<Settings className="h-5 w-5" />} /><MetricCard label="Organisation" value={data?.name || "Unavailable"} tone="purple" icon={<Building2 className="h-5 w-5" />} /><MetricCard label="Security" value="Permission controlled" tone="blue" icon={<Lock className="h-5 w-5" />} /><MetricCard label="Developer access" value="Capability controlled" tone="amber" icon={<KeyRound className="h-5 w-5" />} /></div>{children}</OrganiserSection>; }
