"use client";

import { useParams } from "next/navigation";
import { useEvent } from "@/hooks/useEvents";
import { AgendaBuilderSuite } from "@/components/organizer/agenda/AgendaBuilderSuite";

export default function MasterAgendaPage() {
  const params = useParams();
  const eventIdStr = (params?.eventId as string) || "";
  const { data: event } = useEvent(eventIdStr);

  return (
    <div className="p-4 sm:p-6 bg-[var(--background)] min-h-screen">
      <AgendaBuilderSuite
        eventId={eventIdStr}
        eventName={event?.name || "Cardiology Congress 2026"}
        initialView="overview"
      />
    </div>
  );
}
