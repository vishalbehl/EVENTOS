"use client";

import { useSearchParams } from "next/navigation";
import { EventsListTab } from "@/components/organizer/workspace/events/EventsListTab";

export default function EventsPage() {
  const searchParams = useSearchParams();
  const statusParam = searchParams.get("status") || "all";
  const validStatus = [
    "all",
    "active",
    "upcoming",
    "drafts",
    "archived",
    "live",
    "completed",
  ].includes(statusParam)
    ? (statusParam as any)
    : "all";

  return <EventsListTab status={validStatus} />;
}
