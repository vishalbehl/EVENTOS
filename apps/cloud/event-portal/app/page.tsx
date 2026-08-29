"use client";

import { motion } from "framer-motion";
import { BrandLogo } from "@/components/ui/brand-logo";
import { ArrowRight, Calendar, Sparkles } from "lucide-react";
import Link from "next/link";

export default function RootHomePage() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6 bg-[var(--base)] text-[var(--text)] relative overflow-hidden">
      {/* Background glow */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-96 h-96 bg-[color-mix(in_srgb,var(--pri)_15%,transparent)] rounded-full blur-3xl pointer-events-none" />

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="max-w-md w-full card p-8 rounded-2xl border border-[var(--border-default)] bg-[var(--card)] text-center relative z-10 shadow-2xl space-y-6"
      >
        <div className="flex justify-center">
          <BrandLogo name="Event OS" subtitle="Participant Portal" />
        </div>

        <div className="space-y-2">
          <h1 className="text-xl font-bold text-[var(--text)] tracking-tight">
            Welcome to the Event Portal
          </h1>
          <p className="text-xs text-[var(--muted)] leading-relaxed">
            Access your conference registration, download your digital badge pass, upload speaker slide decks, and view event schedules.
          </p>
        </div>

        <div className="p-4 rounded-xl bg-[var(--bg-surface-2)] border border-[var(--border-default)] text-left text-xs space-y-2">
          <div className="flex items-center gap-2 text-[var(--pri)] font-semibold">
            <Sparkles className="h-4 w-4" />
            <span>Looking for your event?</span>
          </div>
          <p className="text-[var(--muted)]">
            Please use the unique link provided in your registration confirmation or speaker invitation email (e.g. <code className="font-mono text-[var(--text)]">/&#123;eventId&#125;/login</code>).
          </p>
        </div>
      </motion.div>
    </div>
  );
}
