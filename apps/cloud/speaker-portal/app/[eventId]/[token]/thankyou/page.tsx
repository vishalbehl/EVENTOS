"use client";

import { useParams } from "next/navigation";
import { motion } from "framer-motion";
import { CheckCircle2, ChevronLeft, PartyPopper, Loader2 } from "lucide-react";
import Link from "next/link";
import { usePortalAuth } from "@/hooks/usePortal";
import { SpeakerPortalLayout } from "@/components/SpeakerPortalLayout";

export default function ThankYouPage() {
  const params = useParams();
  const token = params.token as string;
  const eventId = params.eventId as string;
  const { data: portal, isLoading } = usePortalAuth(eventId, token);

  if (isLoading) return (
    <div className="flex items-center justify-center min-h-screen">
      <Loader2 className="h-10 w-10 text-indigo-500 animate-spin" />
    </div>
  );

  const speakerName = portal ? `${portal.first_name} ${portal.last_name}` : "";

  return (
    <SpeakerPortalLayout
      branding={portal?.branding_settings || {}}
      termsAndConditions={portal?.terms_and_conditions}
      faqs={portal?.faqs}
      eventName={portal?.event_name}
      startDate={portal?.start_date}
      endDate={portal?.end_date}
      location={portal?.location}
      venueName={portal?.venue_name}
      organizerName={portal?.organizer_name}
      email={portal ? portal.email : ""}
      speakerName={speakerName}
      token={token}
      eventId={eventId}
    >
    <div className="min-h-screen flex flex-col w-full">
      
      <main className="flex-1 flex flex-col items-center justify-center p-6 relative">
        <motion.div 
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="glass-3d p-12 md:p-20 max-w-2xl w-full text-center relative overflow-hidden rounded-[3rem]"
        >
          {/* Success Glow */}
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-64 h-64 bg-emerald-500/10 blur-[100px] rounded-full pointer-events-none" />
          
          <div className="relative z-10">
            <motion.div 
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.2 }}
              className="h-24 w-24 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center mx-auto mb-10 shadow-[0_0_50px_rgba(16,185,129,0.2)]"
            >
              <CheckCircle2 className="h-12 w-12 text-emerald-400" />
            </motion.div>

            <motion.h1 
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.3 }}
              className="text-4xl md:text-5xl font-black tracking-tighter mb-6"
            >
              Submission <span className="text-emerald-400">Complete</span>
            </motion.h1>

            <motion.p 
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.4 }}
              className="text-lg text-muted font-bold leading-relaxed mb-12 max-w-md mx-auto"
            >
              Your presentation has been encrypted and received. Organizers will review the data and update your status shortly.
            </motion.p>

            <motion.div 
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.5 }}
              className="flex flex-col sm:flex-row gap-4 justify-center"
            >
              <Link 
                href={`/${eventId}/${token}`} 
                className="btn-primary px-10 h-14 flex items-center justify-center gap-3 rounded-full"
              >
                <ChevronLeft className="h-4 w-4" /> Return to Hub
              </Link>
            </motion.div>
          </div>
        </motion.div>

        <motion.div 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1 }}
          className="mt-12 flex items-center gap-3 text-[10px] font-black text-muted uppercase tracking-[0.3em]"
        >
          <PartyPopper className="h-4 w-4 text-emerald-400" /> Transmission Confirmed via EventOS Cloud
        </motion.div>
      </main>
    </div>
    </SpeakerPortalLayout>
  );
}
