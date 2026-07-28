"use client";

import React, { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  Sparkles,
  Plus,
  CheckCircle2,
  Calendar,
  ArrowRight,
  ShieldCheck,
  Zap,
  Building2,
  Clock,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { EventSummary } from "@/types/backend";

interface PlanActivationTargetModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedPlan: { id?: string; name: string; price?: number | null } | null;
  selectedAddonNames?: string[];
  events: EventSummary[];
  onApplyToCurrentEvent: (eventId: string) => Promise<void>;
  onCreateNewEvent: () => void;
}

export function PlanActivationTargetModal({
  open,
  onOpenChange,
  selectedPlan,
  selectedAddonNames = [],
  events,
  onApplyToCurrentEvent,
  onCreateNewEvent,
}: PlanActivationTargetModalProps) {
  const [selectedEventId, setSelectedEventId] = useState<string>(events[0]?.id || "");
  const [mode, setMode] = useState<"current" | "new">("current");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const selectedEvent = events.find((e) => e.id === selectedEventId) || events[0];

  const handleSubmit = async () => {
    if (mode === "new") {
      onOpenChange(false);
      onCreateNewEvent();
    } else if (mode === "current" && (selectedEventId || selectedEvent?.id)) {
      try {
        setIsSubmitting(true);
        await onApplyToCurrentEvent(selectedEventId || selectedEvent.id);
        onOpenChange(false);
      } finally {
        setIsSubmitting(false);
      }
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="border-white/10 bg-[#0c0c12] text-white rounded-3xl p-6 max-w-xl shadow-2xl overflow-hidden border-t-2 border-t-[#e0ff00]">
        <DialogHeader className="space-y-2 text-left">
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-[rgba(224,255,0,0.3)] bg-[rgba(224,255,0,0.1)] px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-[#e0ff00]">
              <Sparkles className="h-3.5 w-3.5" />
              Plan Upgrade Target
            </span>
          </div>

          <DialogTitle className="text-xl font-extrabold tracking-tight text-white">
            How would you like to apply your new plan?
          </DialogTitle>
          <DialogDescription className="text-xs text-[var(--color-text-muted)] leading-relaxed">
            You currently have active event(s) in your workspace. Choose whether to upgrade your existing event or setup a new event.
          </DialogDescription>
        </DialogHeader>

        {/* Selected Plan Summary Banner */}
        {selectedPlan && (
          <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3.5 flex items-center justify-between">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-[#e0ff00]">Selected Plan</p>
              <p className="text-sm font-bold text-white">{selectedPlan.name}</p>
            </div>
            {selectedAddonNames.length > 0 && (
              <div className="text-right">
                <p className="text-[10px] uppercase text-[var(--color-text-muted)]">Add-ons</p>
                <p className="text-xs text-white/80 font-mono">+{selectedAddonNames.length} selected</p>
              </div>
            )}
          </div>
        )}

        {/* Option Selection Cards */}
        <div className="space-y-3 my-2">
          {/* Option 1: Use Current Event */}
          {events.length > 0 && (
            <div
              onClick={() => setMode("current")}
              className={cn(
                "relative cursor-pointer rounded-2xl border p-4 transition-all duration-200",
                mode === "current"
                  ? "border-[#e0ff00] bg-[rgba(224,255,0,0.05)] shadow-[0_0_20px_rgba(224,255,0,0.1)]"
                  : "border-white/10 bg-white/[0.02] hover:border-white/20 hover:bg-white/[0.04]"
              )}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                  <div className={cn(
                    "flex h-9 w-9 items-center justify-center rounded-xl shrink-0 mt-0.5",
                    mode === "current" ? "bg-[#e0ff00] text-black" : "bg-white/10 text-white"
                  )}>
                    <Zap className="h-5 w-5" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h4 className="text-sm font-bold text-white">Use Current Event</h4>
                      <span className="rounded-full bg-[#e0ff00]/20 text-[#e0ff00] text-[9px] font-bold px-2 py-0.5 uppercase tracking-wider">
                        Recommended
                      </span>
                    </div>
                    <p className="text-xs text-[var(--color-text-muted)] mt-0.5 leading-normal">
                      Apply feature entitlements and capacity directly to your existing event without re-entering setup details.
                    </p>

                    {/* Event Selector dropdown if multiple */}
                    {events.length > 1 ? (
                      <div className="mt-3" onClick={(e) => e.stopPropagation()}>
                        <label className="text-[10px] uppercase font-bold text-[var(--color-text-muted)] block mb-1">
                          Select Event:
                        </label>
                        <select
                          value={selectedEventId || events[0]?.id}
                          onChange={(e) => setSelectedEventId(e.target.value)}
                          className="w-full rounded-lg border border-white/20 bg-black/60 px-3 py-1.5 text-xs text-white focus:outline-none focus:border-[#e0ff00]"
                        >
                          {events.map((ev) => (
                            <option key={ev.id} value={ev.id} className="bg-neutral-900 text-white">
                              {ev.name} ({ev.short_code})
                            </option>
                          ))}
                        </select>
                      </div>
                    ) : selectedEvent ? (
                      <div className="mt-2.5 inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] font-mono text-white/90">
                        <Building2 className="h-3.5 w-3.5 text-[#e0ff00]" />
                        <span className="font-bold">{selectedEvent.name}</span>
                        <span className="text-white/40">({selectedEvent.short_code})</span>
                      </div>
                    ) : null}
                  </div>
                </div>

                <div className="shrink-0 mt-1">
                  <div className={cn(
                    "h-5 w-5 rounded-full border flex items-center justify-center transition-all",
                    mode === "current" ? "border-[#e0ff00] bg-[#e0ff00]" : "border-white/30"
                  )}>
                    {mode === "current" && <CheckCircle2 className="h-3.5 w-3.5 text-black" />}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Option 2: Create New Event */}
          <div
            onClick={() => setMode("new")}
            className={cn(
              "relative cursor-pointer rounded-2xl border p-4 transition-all duration-200",
              mode === "new"
                ? "border-[#e0ff00] bg-[rgba(224,255,0,0.05)] shadow-[0_0_20px_rgba(224,255,0,0.1)]"
                : "border-white/10 bg-white/[0.02] hover:border-white/20 hover:bg-white/[0.04]"
            )}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-3">
                <div className={cn(
                  "flex h-9 w-9 items-center justify-center rounded-xl shrink-0 mt-0.5",
                  mode === "new" ? "bg-[#e0ff00] text-black" : "bg-white/10 text-white"
                )}>
                  <Plus className="h-5 w-5" />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-white">Create New Event</h4>
                  <p className="text-xs text-[var(--color-text-muted)] mt-0.5 leading-normal">
                    Keep your existing event as trial/demo and set up a brand-new event workspace with this plan.
                  </p>
                </div>
              </div>

              <div className="shrink-0 mt-1">
                <div className={cn(
                  "h-5 w-5 rounded-full border flex items-center justify-center transition-all",
                  mode === "new" ? "border-[#e0ff00] bg-[#e0ff00]" : "border-white/30"
                )}>
                  {mode === "new" && <CheckCircle2 className="h-3.5 w-3.5 text-black" />}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Modal Actions */}
        <div className="flex items-center justify-end gap-3 mt-4 pt-3 border-t border-white/10">
          <Button
            type="button"
            variant="ghost"
            onClick={() => onOpenChange(false)}
            className="text-xs text-white/70 hover:text-white hover:bg-white/10"
          >
            Cancel
          </Button>
          <Button
            type="button"
            disabled={isSubmitting}
            onClick={handleSubmit}
            className="h-10 rounded-xl px-5 bg-[#e0ff00] text-black hover:bg-[#d0ef00] font-bold text-xs gap-2"
          >
            {isSubmitting ? (
              "Applying..."
            ) : mode === "current" ? (
              <>
                Apply to {selectedEvent?.name || "Current Event"}
                <ArrowRight className="h-4 w-4" />
              </>
            ) : (
              <>
                Continue to Create Event
                <ArrowRight className="h-4 w-4" />
              </>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
