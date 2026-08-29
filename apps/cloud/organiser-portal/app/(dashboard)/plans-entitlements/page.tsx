import { redirect } from "next/navigation";
import { nestedTabRedirect } from "@/lib/organiser-route-redirects";

export default async function PlansEntitlementsPage({ searchParams }: { searchParams: Promise<{ tab?: string | string[] }> }) {
  const { tab } = await searchParams;
  redirect(nestedTabRedirect("plans-entitlements", tab, "overview", { overview: "overview", current: "overview", "current-plan": "overview", features: "features", limits: "limits-usage", usage: "limits-usage", "limits-usage": "limits-usage", addons: "addons", "add-ons": "addons", history: "history" }));
}
