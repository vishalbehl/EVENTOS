import { redirect } from "next/navigation";

export default function UsersLegacyPage() {
  redirect("/people-teams/members");
}
