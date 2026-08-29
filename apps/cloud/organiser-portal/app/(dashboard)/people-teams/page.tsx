import { redirect } from "next/navigation";
import { nestedTabRedirect } from "@/lib/organiser-route-redirects";

export default async function PeopleTeamsPage({ searchParams }: { searchParams: Promise<{ tab?: string | string[] }> }) {
  const { tab } = await searchParams;
  redirect(nestedTabRedirect("people-teams", tab, "users", { users: "users", members: "users", invitations: "invitations", teams: "teams", "organiser-teams": "teams", "team-members": "team-members", assignments: "team-members" }));
}
