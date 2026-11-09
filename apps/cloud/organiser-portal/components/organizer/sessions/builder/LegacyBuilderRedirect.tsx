"use client";

import { useParams } from "next/navigation";
import { useEffect } from "react";

/** Compatibility entry point for historical programme/session agenda URLs. */
export function LegacyBuilderRedirect() {
  const params = useParams<{ eventId: string }>();

  useEffect(() => {
    const eventId = params?.eventId || window.location.pathname.split("/events/")[1]?.split("/")[0];
    if (eventId) {
      const target = `/events/${eventId}/sessions/builder`;
      if (window.location.pathname !== target) window.location.replace(target);
    }
  }, [params?.eventId]);

  return null;
}
