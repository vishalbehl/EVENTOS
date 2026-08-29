import { redirect } from "next/navigation";
import { nestedTabRedirect } from "@/lib/organiser-route-redirects";

export default async function ReportsPage({ searchParams }: { searchParams: Promise<{ tab?: string | string[] }> }) {
  const { tab } = await searchParams;
  redirect(nestedTabRedirect("reports", tab, "overview", { overview: "overview", registrations: "registrations", revenue: "revenue", engagement: "engagement", events: "events", exports: "exports", custom: "custom", "custom-reports": "custom" }));
}
