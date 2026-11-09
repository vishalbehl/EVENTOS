"use client";

import { Suspense } from "react";
import { AcceptInviteForm } from "@/components/organizer/org/AcceptInviteForm";

export default function AcceptInvitePage() {
  return (
    <Suspense fallback={<p role="status">Loading invitation…</p>}>
      <AcceptInviteForm />
    </Suspense>
  );
}
