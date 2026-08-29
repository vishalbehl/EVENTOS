"use client";

import { useEffect } from "react";
import { useParams, useRouter } from "next/navigation";

export default function EventRootPage() {
  const { eventId } = useParams<{ eventId: string }>();
  const router = useRouter();

  useEffect(() => {
    // If attendee token exists, go straight to dashboard; else to login
    const token = localStorage.getItem(`portal_token_${eventId}`);
    if (token) {
      router.replace(`/${eventId}/dashboard`);
    } else {
      router.replace(`/${eventId}/login`);
    }
  }, [eventId, router]);

  return null;
}
