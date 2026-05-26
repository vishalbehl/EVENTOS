"use client";

import { useEffect } from "react";
import { useParams, useRouter } from "next/navigation";

/**
 * /{eventId} — entry point
 *
 * Redirects immediately to the OTP login page.
 * Flow: /{eventId} → /{eventId}/login → /{eventId}/dashboard
 *
 * The registration form lives at /{eventId}/register and is linked
 * from the dashboard when the attendee's status is "not_registered".
 */
export default function EventRoot() {
  const { eventId } = useParams<{ eventId: string }>();
  const router = useRouter();

  useEffect(() => {
    router.replace(`/${eventId}/login`);
  }, [eventId, router]);

  // Blank screen while the redirect happens — practically instant
  return null;
}
