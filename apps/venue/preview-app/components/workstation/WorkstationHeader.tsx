"use client";

import { Monitor, Check, Clock, Upload, ArrowLeft, ArrowRight, ShieldCheck, CheckCircle2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { useSRRStore } from "@/store/use-srr-store";
import { useAuthStore } from "@/store/use-auth-store";

export function WorkstationHeader() {
  const { currentStep, setCurrentStep, speaker, sessions, selectedSessionIndex, lastSavedSecondsAgo, fileModified } = useSRRStore();
  const { stationNumber } = useAuthStore();
  const currentSession = (sessions && sessions[selectedSessionIndex]) || sessions?.[0] || null;

  const steps = [
    { num: 1, label: "Check-in" },
    { num: 2, label: "Setup" },
    { num: 3, label: "Preview" },
    { num: 4, label: "Finalize" },
  ];

  return (
    <header className="sticky top-0 z-30 flex h-[76px] w-full items-center justify-between border-b border-[var(--border)] bg-[var(--card)] px-6 lg:px-10 text-[var(--text)] shadow-sm">
      {/* Left: Brand & Step Navigator */}
      <div className="flex items-center gap-6">
        <div className="flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-xl bg-[var(--pri)] text-[var(--primary-contrast)] shadow-md">
            <Monitor className="size-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-black uppercase tracking-[0.2em] text-[var(--text)]">
                PREVIEW ROOM
              </span>
              <span className="text-[10px] text-[var(--muted)] font-bold">•</span>
              <span className="text-[10px] font-bold text-[var(--muted)]">
                Presentation Check
              </span>
            </div>
            <p className="text-[10px] font-bold text-[var(--pri)]">
              Workstation #{stationNumber ?? "Not configured"}
            </p>
          </div>
        </div>

        {/* Step Progression Bar */}
        <div className="hidden xl:flex items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--surf)] px-3 py-1.5 shadow-sm">
          <div className="flex items-center gap-1.5">
            {steps.map((s, idx) => {
              const isDone = currentStep > s.num;
              const isCurrent = currentStep === s.num;
              return (
                <div key={s.num} className="flex items-center gap-1.5">
                  <div
                    className={cn(
                      "flex size-5 items-center justify-center rounded-full text-[10px] font-black transition-all",
                      isDone
                        ? "bg-emerald-500 text-black shadow-sm"
                        : isCurrent
                        ? "bg-[var(--pri)] text-[var(--primary-contrast)] ring-2 ring-[var(--pri)]/40"
                        : "bg-[var(--raised)] text-[var(--muted)]"
                    )}
                  >
                    {isDone ? <Check className="size-3 stroke-[3]" /> : s.num}
                  </div>
                  {idx < steps.length - 1 && (
                    <div
                      className={cn(
                        "h-0.5 w-3 rounded-full",
                        isDone ? "bg-emerald-500" : "bg-[var(--border)]"
                      )}
                    />
                  )}
                </div>
              );
            })}
          </div>
          <span className="ml-2 text-[11px] font-bold text-[var(--text)]">
            Step {currentStep} of 4 — {steps[currentStep - 1]?.label}
          </span>
        </div>
      </div>

      {/* Center: Active Speaker & Session */}
      <div className="hidden md:flex flex-col items-center text-center">
        <p className="text-sm font-black text-[var(--text)] tracking-tight">
          {speaker?.full_name || "No speaker assigned"}
        </p>
        <p className="text-[11px] font-semibold text-[var(--muted)] truncate max-w-md">
          {currentSession?.title || "Waiting for intake assignment"}
        </p>
      </div>

      {/* Right: Status Badges & Quick Action */}
      <div className="flex items-center gap-3">
        {/* Saved Status Indicator */}
        {fileModified && (
          <div className="hidden sm:flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-[10px] font-bold text-emerald-400">
            <CheckCircle2 className="size-3" />
            <span>Saved • {lastSavedSecondsAgo} sec ago</span>
          </div>
        )}

        {/* Starts in Timer */}
        <div className="flex items-center gap-2 rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1 text-xs font-bold text-amber-400">
          <span className="text-[9px] font-black uppercase tracking-wider text-amber-300">
            SESSION STARTS IN
          </span>
          <span className="font-mono font-black text-sm">
            {currentSession?.starts_in_minutes == null ? "-" : currentSession.starts_in_minutes} min
          </span>
        </div>

        {/* Uploaded Badge */}
        <div className="flex items-center gap-1.5 rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1 text-[11px] font-black uppercase tracking-wider text-amber-400">
          <Upload className="size-3" />
          <span>Uploaded</span>
        </div>

        {/* Step Nav Helper */}
        {currentStep > 2 && (
          <button
            onClick={() => setCurrentStep(currentStep - 1)}
            className="flex size-8 items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--card)] text-[var(--muted)] hover:bg-[var(--raised)] hover:text-[var(--text)]"
            title="Go Back to Previous Step"
          >
            <ArrowLeft className="size-4" />
          </button>
        )}
      </div>
    </header>
  );
}
