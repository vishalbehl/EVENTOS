"use client";
import { PageContainer } from "@/components/super-admin/ui/PageContainer";
import { SectionHeader } from "@/components/super-admin/ui/SectionHeader";
import { ConsoleAccessCard } from "@/components/console/ConsoleAccessCard";
import { CONSOLE_KEYS, CONSOLE_REGISTRY } from "@/lib/console-registry";

export default function ConsoleDirectoryPage() {
  return <PageContainer><SectionHeader title="Console access" description="Enter a focused operational workspace. Navigation automatically follows the selected console." breadcrumb={["Command Center", "Console access"]} /><div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">{CONSOLE_KEYS.filter((key) => key !== "home").map((key) => <ConsoleAccessCard key={key} definition={CONSOLE_REGISTRY[key]} />)}</div></PageContainer>;
}
