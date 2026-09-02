"use client";
import { MemberDirectory } from "./MemberDirectory";
import { useOrganizationLimitAccess } from "@/lib/capabilities";

export function PeopleMembersTab() {
  const access = useOrganizationLimitAccess("max_users");
  return <MemberDirectory memberInviteEnabled={!access.loading && access.enabled} />;
}
