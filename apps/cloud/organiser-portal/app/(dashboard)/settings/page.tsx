import { redirect } from "next/navigation";
import { nestedTabRedirect } from "@/lib/organiser-route-redirects";

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ tab?: string | string[] }> }) {
  const { tab } = await searchParams;
  redirect(nestedTabRedirect("settings", tab, "general", { general: "general", security: "security", notifications: "notifications", integrations: "integrations", developer: "api-webhooks", "api-webhooks": "api-webhooks", audit: "audit" }));
}
