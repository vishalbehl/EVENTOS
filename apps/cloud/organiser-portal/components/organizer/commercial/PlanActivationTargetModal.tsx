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
  ArrowRight,
  Zap,
  Building2,
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
      <DialogContent className="border border-[var(--border-default)] bg-[var(--card)] text-[var(--text-primary)] rounded-lg p-5 max-w-lg shadow-2xl overflow-hidden">
        <DialogHeader className="space-y-1 text-left pb-3 border-b border-[var(--border-subtle)]">
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1 rounded px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider bg-[var(--pri)]/10 text-[var(--pri)] border border-[var(--pri)]/20">
              <Sparkles className="size-3" />
              Plan Upgrade Target
            </span>
          </div>

          <DialogTitle className="text-base font-bold tracking-tight text-[var(--text-primary)]">
            How would you like to apply your new plan?
          </DialogTitle>
          <DialogDescription className="text-xs text-[var(--text-secondary)] leading-relaxed">
            Choose whether to upgrade your existing event workspace or configure a brand-new event.
          </DialogDescription>
        </DialogHeader>

        {/* Selected Plan Summary Banner */}
        {selectedPlan && (
          <div className="rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface-2)] p-3 flex items-center justify-between text-xs">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">Selected Plan</p>
              <p className="font-bold text-[var(--text-primary)]">{selectedPlan.name}</p>
            </div>
            {selectedAddonNames.length > 0 && (
              <div className="text-right">
                <p className="text-[10px] font-bold uppercase text-[var(--text-tertiary)]">Add-ons</p>
                <p className="font-mono text-xs font-semibold text-[var(--pri)]">+{selectedAddonNames.length} selected</p>
              </div>
            )}
          </div>
        )}

        {/* Option Selection Cards */}
        <div className="space-y-2.5 my-1 text-xs">
          {/* Option 1: Use Current Event */}
          {events.length > 0 && (
            <div
              onClick={() => setMode("current")}
              className={cn(
                "relative cursor-pointer rounded-lg border p-3.5 transition-colors",
                mode === "current"
                  ? "border-[var(--pri)] bg-[var(--pri)]/5 ring-1 ring-[var(--pri)]"
                  : "border-[var(--border-default)] bg-[var(--bg-surface-2)] hover:border-[var(--border-strong)]"
              )}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                  <div className={cn(
                    "size-8 rounded-lg flex items-center justify-center shrink-0 mt-0.5 transition-colors",
                    mode === "current" ? "bg-[var(--pri)] text-[var(--primary-contrast)]" : "bg-[var(--card)] border border-[var(--border-default)] text-[var(--text-secondary)]"
                  )}>
                    <Zap className="size-4" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h4 className="text-xs font-bold text-[var(--text-primary)]">Use Current Event</h4>
                      <span className="rounded px-1.5 py-0.2 bg-[var(--pri)]/10 text-[var(--pri)] text-[9px] font-bold uppercase tracking-wider border border-[var(--pri)]/20">
                        Recommended
                      </span>
                    </div>
                    <p className="text-[11px] text-[var(--text-secondary)] mt-0.5 leading-normal">
                      Apply feature entitlements and capacity directly to your existing event.
                    </p>

                    {/* Event Selector dropdown if multiple */}
                    {events.length > 1 ? (
                      <div className="mt-2" onClick={(e) => e.stopPropagation()}>
                        <label className="text-[10px] uppercase font-bold text-[var(--text-tertiary)] block mb-1">
                          Select Event:
                        </label>
                        <select
                          value={selectedEventId || events[0]?.id}
                          onChange={(e) => setSelectedEventId(e.target.value)}
                          className="w-full rounded-lg border border-[var(--border-default)] bg-[var(--card)] px-2.5 py-1 text-xs text-[var(--text-primary)] focus:outline-none focus:border-[var(--pri)] cursor-pointer"
                        >
                          {events.map((ev) => (
                            <option key={ev.id} value={ev.id}>
                              {ev.name} ({ev.short_code})
                            </option>
                          ))}
                        </select>
                      </div>
                    ) : selectedEvent ? (
                      <div className="mt-2 inline-flex items-center gap-1.5 rounded-md border border-[var(--border-default)] bg-[var(--card)] px-2 py-0.5 text-[11px] text-[var(--text-secondary)] font-semibold">
                        <Building2 className="size-3 text-[var(--pri)]" />
                        <span className="font-bold text-[var(--text-primary)]">{selectedEvent.name}</span>
                        <span>({selectedEvent.short_code})</span>
                      </div>
                    ) : null}
                  </div>
                </div>

                <div className="shrink-0 mt-0.5">
                  <div className={cn(
                    "size-4 rounded-full border flex items-center justify-center transition-colors",
                    mode === "current" ? "border-[var(--pri)] bg-[var(--pri)] text-[var(--primary-contrast)]" : "border-[var(--border-default)]"
                  )}>
                    {mode === "current" && <CheckCircle2 className="size-3" />}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Option 2: Create New Event */}
          <div
            onClick={() => setMode("new")}
            className={cn(
              "relative cursor-pointer rounded-lg border p-3.5 transition-colors",
              mode === "new"
                ? "border-[var(--pri)] bg-[var(--pri)]/5 ring-1 ring-[var(--pri)]"
                : "border-[var(--border-default)] bg-[var(--bg-surface-2)] hover:border-[var(--border-strong)]"
            )}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-3">
                <div className={cn(
                  "size-8 rounded-lg flex items-center justify-center shrink-0 mt-0.5 transition-colors",
                  mode === "new" ? "bg-[var(--pri)] text-[var(--primary-contrast)]" : "bg-[var(--card)] border border-[var(--border-default)] text-[var(--text-secondary)]"
                )}>
                  <Plus className="size-4" />
                </div>
                <div>
                  <h4 className="text-xs font-bold text-[var(--text-primary)]">Create New Event</h4>
                  <p className="text-[11px] text-[var(--text-secondary)] mt-0.5 leading-normal">
                    Keep your existing event and initialize a brand-new workspace slot with this plan.
                  </p>
                </div>
              </div>

              <div className="shrink-0 mt-0.5">
                <div className={cn(
                  "size-4 rounded-full border flex items-center justify-center transition-colors",
                  mode === "new" ? "border-[var(--pri)] bg-[var(--pri)] text-[var(--primary-contrast)]" : "border-[var(--border-default)]"
                )}>
                  {mode === "new" && <CheckCircle2 className="size-3" />}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Modal Actions */}
        <div className="flex items-center justify-end gap-2.5 mt-3 pt-3 border-t border-[var(--border-subtle)]">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            className="h-9 px-4 rounded-lg border border-[var(--border-default)] bg-[var(--card)] text-xs font-semibold text-[var(--text-secondary)] hover:bg-[var(--bg-surface-hover)] cursor-pointer"
          >
            Cancel
          </Button>
          <Button
            type="button"
            disabled={isSubmitting}
            onClick={handleSubmit}
            className="h-9 rounded-lg px-4 bg-[var(--pri)] hover:opacity-90 text-[var(--primary-contrast)] font-bold text-xs shadow-sm border-0 cursor-pointer flex items-center gap-1.5"
          >
            {isSubmitting ? (
              "Applying..."
            ) : mode === "current" ? (
              <>
                Apply to {selectedEvent?.name || "Current Event"}
                <ArrowRight className="size-3.5" />
              </>
            ) : (
              <>
                Continue to Create Event
                <ArrowRight className="size-3.5" />
              </>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
