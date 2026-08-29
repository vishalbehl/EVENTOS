"use client";

import { useParams } from "next/navigation";
import PortalStudio from "@/components/organizer/design-studio/PortalStudio";

export default function PortalStudioPage() {
  const params = useParams<{ eventId: string }>();
  const eventId = String(params.eventId);

  return (
    <main className="min-h-full p-4 sm:p-6">
      <PortalStudio eventId={eventId} />
    </main>
  );
}
