import { redirect } from "next/navigation";
import { nestedTabRedirect } from "@/lib/organiser-route-redirects";

export default async function PlansEntitlementsPage({ searchParams }: { searchParams: Promise<{ tab?: string | string[] }> }) {
  const { tab } = await searchParams;
  redirect(nestedTabRedirect("commercial", tab, "overview", {
    overview: "overview",
    current: "workspace",
    features: "workspace",
    limits: "usage",
    "limits-usage": "usage",
    addons: "capacity",
    requests: "requests",
    usage: "usage",
    history: "history",
  }));
}
