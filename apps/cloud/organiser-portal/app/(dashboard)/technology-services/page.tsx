"use client";

import { useEffect } from "react";
import { useRouter, useParams } from "next/navigation";

export default function TechnologyServicesIndex() {
  const router = useRouter();
  const { eventId } = useParams();

  useEffect(() => {
    router.replace(`/technology-services/dashboard`);
  }, [router]);

  return null;
}
