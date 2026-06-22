"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function DeveloperRootPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/developer/analytics");
  }, [router]);

  return null;
}
