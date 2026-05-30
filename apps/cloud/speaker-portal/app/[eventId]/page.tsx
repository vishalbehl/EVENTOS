"use client";

import { useEffect } from "react";
import { useParams, useRouter } from "next/navigation";

export default function EventRoot() {
  const { eventId } = useParams<{ eventId: string }>();
  const router = useRouter();

  useEffect(() => {
    router.replace(`/${eventId}/login`);
  }, [eventId, router]);

  return null;
}
