"use client";

import { useParams } from "next/navigation";
import { EventEmailStudio } from "@/components/organizer/emails/designer/EventEmailStudio";
import { CapabilityBoundary } from "@/lib/capabilities";

export default function EmailDesignerPage() {
  const params = useParams();

  return (
    <div className="h-full flex-1 flex flex-col min-h-0 relative w-full max-w-full overflow-hidden animate-in fade-in duration-700">
      {/* Ambient glow background */}
      <div className="absolute inset-0 z-0 pointer-events-none">
        <div className="absolute top-[-10%] right-[-5%] w-[400px] h-[400px] rounded-full blur-[100px] opacity-[0.07]" style={{ background: 'var(--color-primary-mid)' }} />
        <div className="absolute bottom-[-10%] left-[-5%] w-[300px] h-[300px] rounded-full blur-[100px] opacity-[0.06]" style={{ background: 'var(--color-accent-cyan)' }} />
      </div>

      <div className="relative z-10 flex flex-col h-full min-h-0">
        <CapabilityBoundary featureKey="FEAT_EMAIL_NOTIFICATIONS">
          <EventEmailStudio eventId={params.eventId as string} />
        </CapabilityBoundary>
      </div>
    </div>
  );
}
