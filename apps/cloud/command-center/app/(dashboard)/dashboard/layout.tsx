"use client";
import { ConsoleTabs } from "@/components/console/ConsoleTabs";
import { DASHBOARD_TABS } from "@/lib/console-registry";
export default function DashboardTabsLayout({ children }: { children: React.ReactNode }) { return <><ConsoleTabs tabs={DASHBOARD_TABS} label="Dashboard views" />{children}</>; }
