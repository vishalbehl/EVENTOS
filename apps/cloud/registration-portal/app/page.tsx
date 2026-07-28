"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Globe, ArrowRight, HelpCircle } from "lucide-react";
import { toast } from "sonner";

export default function RegistrationPortalHome() {
  const [eventId, setEventId] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!eventId.trim()) {
      toast.error("Please enter a valid Event ID.");
      return;
    }

    setIsSubmitting(true);
    setTimeout(() => {
      router.push(`/${eventId.trim()}`);
    }, 600);
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen p-6 relative">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="glass-3d p-12 max-w-md w-full relative group overflow-hidden border-indigo-500/10 rounded-[3rem] bg-indigo-950/5"
      >
        {/* Animated Accent Line */}
        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-indigo-500 to-transparent opacity-50" />

        <header className="mb-10 text-center relative z-10">
          <div className="flex justify-center mb-6">
            <div className="h-16 w-16 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center shadow-2xl group-hover:scale-110 transition-transform duration-500">
              <Globe className="h-8 w-8 text-indigo-400" />
            </div>
          </div>
          <h1 className="text-3xl font-black tracking-tighter text-glow-indigo mb-2">
            Registration <span className="text-indigo-400">Desk</span>
          </h1>
          <p className="text-muted text-[10px] font-black uppercase tracking-[0.2em]">Public Intake Portal</p>
        </header>

        <form onSubmit={handleSubmit} className="space-y-6 relative z-10">
          <div className="space-y-2">
            <label className="text-[10px] font-black text-muted uppercase tracking-widest ml-1">Event Identification Code</label>
            <div className="relative group">
              <input
                type="text"
                placeholder="event-id"
                value={eventId}
                onChange={(e) => setEventId(e.target.value)}
                className="input text-center text-xl tracking-wider font-semibold h-16"
                maxLength={50}
                autoFocus
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            className="btn-primary w-full h-14 text-xs tracking-widest flex items-center justify-center gap-3 rounded-full"
          >
            {isSubmitting ? "Routing..." : (
              <>
                Open Registration Form <ArrowRight className="h-4 w-4" />
              </>
            )}
          </button>
        </form>

        <footer className="mt-12 pt-8 border-t border-white/5 text-center flex items-center justify-center gap-2 text-muted">
          <HelpCircle className="h-4 w-4" />
          <p className="text-[10px] font-bold">
            Please use the registration link shared by your organizer.
          </p>
        </footer>
      </motion.div>

      <div className="mt-8 text-[10px] font-black text-muted uppercase tracking-[0.4em] opacity-30">
        Powered by Event OS Platform
      </div>
    </div>
  );
}
