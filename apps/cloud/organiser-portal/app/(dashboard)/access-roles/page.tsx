import { redirect } from "next/navigation";
import { nestedTabRedirect } from "@/lib/organiser-route-redirects";

export default async function AccessRolesPage({ searchParams }: { searchParams: Promise<{ tab?: string | string[] }> }) {
  const { tab } = await searchParams;
  redirect(nestedTabRedirect("access-roles", tab, "roles", { roles: "roles", "user-roles": "roles", capabilities: "capabilities", assignments: "assignments", "workspace-access": "assignments", "event-access": "assignments", permissions: "permission-matrix", "permission-matrix": "permission-matrix", "approval-rules": "approval-rules", audit: "audit" }));
}
