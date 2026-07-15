"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/store/use-auth-store";
import { OnboardingWizard } from "@/components/organizer/org/OrgWorkspace";

export default function OnboardingPage() {
  const router = useRouter();
  const { isAuthenticated, accessToken, user } = useAuthStore();
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (hydrated) {
      if (!isAuthenticated || !accessToken) {
        router.replace("/login");
      } else if (user?.onboarding_completed) {
        router.replace("/dashboard");
      }
    }
  }, [hydrated, isAuthenticated, accessToken, user, router]);

  if (!hydrated || !isAuthenticated || !accessToken || user?.onboarding_completed) {
    return (
      <div className="min-h-screen bg-[#050505] flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-[var(--pri)]" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#050505] text-[#f5f5f5] p-6 md:p-12 overflow-y-auto">
      <div className="max-w-6xl mx-auto">
        <OnboardingWizard />
      </div>
    </div>
  );
}
