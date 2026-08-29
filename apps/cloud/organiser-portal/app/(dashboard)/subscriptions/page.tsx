import { redirect } from "next/navigation";

export default function SubscriptionsLegacyPage() {
  redirect("/plans-entitlements/current");
}
