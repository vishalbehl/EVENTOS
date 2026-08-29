"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/store/use-auth-store";
import { OnboardingWizard } from "@/components/organizer/onboarding/OnboardingWizard";
import { OrganizationCapabilitiesProvider } from "@/lib/capabilities";

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
      <div className="flex min-h-screen items-center justify-center bg-[var(--op-page-bg)]">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--op-border)] border-t-[var(--op-primary)]" />
      </div>
    );
  }

  return (
    <OrganizationCapabilitiesProvider>
      <div className="min-h-screen bg-[var(--op-page-bg)] text-[var(--op-text)]">
        <OnboardingWizard />
      </div>
    </OrganizationCapabilitiesProvider>
  );
}
