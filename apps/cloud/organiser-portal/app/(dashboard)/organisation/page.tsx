import { redirect } from "next/navigation";
import { nestedTabRedirect } from "@/lib/organiser-route-redirects";

export default async function OrganisationPage({ searchParams }: { searchParams: Promise<{ tab?: string | string[] }> }) {
  const { tab } = await searchParams;
  redirect(nestedTabRedirect("organisation", tab, "profile", { overview: "profile", profile: "profile", details: "profile", branches: "branches", locations: "branches", documents: "documents", branding: "branding", preferences: "preferences" }));
}
