"use client";

import { motion } from "framer-motion";
import {
  Monitor,
  ArrowRight,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuthStore } from "@/store/use-auth-store";

export function IdleStandbyView({
  onStartSession,
  eventName,
  statusMessage,
  isError = false,
}: {
  onStartSession: () => void;
  eventName?: string | null;
  statusMessage?: string | null;
  isError?: boolean;
}) {
  const { stationNumber } = useAuthStore();

  return (
    <div className="relative flex min-h-[calc(100vh-80px)] flex-col items-center justify-center p-6 text-center select-none overflow-hidden">
      {/* Theme-Responsive 3D Isometric SRR Workstation Background Art */}
      <div className="pointer-events-none absolute inset-0 -z-0 select-none overflow-hidden">
        <img
          src="/backgrounds/workstation-idle-light.png"
          alt="SRR Workstation Idle Light"
          className="absolute inset-0 size-full w-full h-full object-cover object-center dark:hidden"
        />
        <img
          src="/backgrounds/workstation-idle-dark.png"
          alt="SRR Workstation Idle Dark"
          className="absolute inset-0 size-full w-full h-full object-cover object-center hidden dark:block"
        />
        <div className="absolute inset-0 bg-white/10 dark:bg-black/20 backdrop-blur-[0.5px]" />
      </div>

      {/* Central Ambient Glow */}
      <div className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 h-[550px] w-[900px] rounded-full bg-[radial-gradient(circle_at_center,rgba(6,182,212,0.12),rgba(59,130,246,0.06),transparent_65%)] blur-3xl" />

      <motion.div
        initial={{ opacity: 0, y: 15 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="relative z-10 w-full max-w-4xl space-y-8"
      >
        {/* Event Header Pill */}
        <div className="inline-flex items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--card)] px-5 py-2 shadow-2xl backdrop-blur-md">
          <span className="flex size-2 rounded-full bg-emerald-400 animate-pulse" />
          <span className="text-[11px] font-black uppercase tracking-[0.25em] text-[var(--pri)]">
            {eventName || "VENUE EVENT NOT LOADED"}
          </span>
        </div>

        {/* Main Station Emblem & Welcome Greeting */}
        <div className="space-y-4">
          <div className="mx-auto flex size-24 items-center justify-center rounded-3xl border border-[var(--border)] bg-[var(--card)] text-[var(--pri)] shadow-2xl ring-1 ring-white/10">
            <Monitor className="size-12" />
          </div>

          <div className="space-y-2">
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-black tracking-tight text-[var(--text)]">
              WORKSTATION #{stationNumber ?? "NOT CONFIGURED"}
            </h1>
            <p className="text-sm sm:text-base font-bold uppercase tracking-[0.3em] text-[var(--muted)]">
              SPEAKER READY ROOM (SRR) • LOCAL STAGING NODE
            </p>
          </div>

          <div className="max-w-xl mx-auto rounded-2xl border border-[var(--border)] bg-[var(--card)]/90 p-5 shadow-xl backdrop-blur-sm space-y-2">
            <h2 className="text-lg font-black text-[var(--text)]">
              {isError ? "Workstation Needs Configuration" : "Waiting for Speaker Assignment"}
            </h2>
            <p className="text-xs text-[var(--muted)] leading-relaxed">
              {statusMessage || "This workstation is enrolled and ready. Scan the speaker badge at the intake scanner to assign a real Venue Server session."}
            </p>
          </div>
        </div>

        {/* Quick Launch CTA Button */}
        <div className="pt-2">
          <Button
            size="xl"
            onClick={onStartSession}
            className="h-16 px-10 rounded-2xl bg-[var(--pri)] hover:bg-[var(--pri)]/90 text-[var(--primary-contrast)] font-black text-base uppercase tracking-wider gap-3 shadow-2xl hover:scale-[1.02] transition-all"
          >
            <Sparkles className="size-5" />
            Waiting for SRR intake assignment
            <ArrowRight className="size-5" />
          </Button>
        </div>
      </motion.div>
    </div>
  );
}
