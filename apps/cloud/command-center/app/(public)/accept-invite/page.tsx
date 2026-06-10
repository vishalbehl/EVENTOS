"use client";

import { Suspense } from "react";
import { AcceptInviteForm } from "@/components/organizer/org/SignupWizard";

export default function AcceptInvitePage() {
  return (
    <Suspense fallback={null}>
      <AcceptInviteForm />
    </Suspense>
  );
}
