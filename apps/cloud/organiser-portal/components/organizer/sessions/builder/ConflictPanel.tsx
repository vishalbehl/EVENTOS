"use client";

import { motion, AnimatePresence } from "framer-motion";
import { X, ArrowRight, CheckCircle2, ShieldAlert } from "lucide-react";
import { useSessionBuilderStore } from "@/store/useSessionBuilderStore";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export function ConflictPanel() {
  const isConflictPanelOpen = useSessionBuilderStore((s) => s.isConflictPanelOpen);
  const toggleConflictPanel = useSessionBuilderStore((s) => s.toggleConflictPanel);
  const conflicts = useSessionBuilderStore((s) => s.conflicts);
  const sessions = useSessionBuilderStore((s) => s.sessions);
  const setSelectedSessionId = useSessionBuilderStore((s) => s.setSelectedSessionId);

  if (!isConflictPanelOpen) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 bg-black/60 flex justify-end"
        onClick={toggleConflictPanel}
      >
        <motion.aside
          initial={{ x: "100%" }}
          animate={{ x: 0 }}
          exit={{ x: "100%" }}
          transition={{ type: "spring", damping: 25, stiffness: 200 }}
          onClick={(e) => e.stopPropagation()}
          className="w-full max-w-md bg-[var(--card)] border-l border-[var(--border-default)] h-full shadow-lg flex flex-col"
        >
          {/* Panel Header */}
          <div className="p-4 border-b border-[var(--border-default)] flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ShieldAlert className="h-4 w-4 text-rose-400" />
              <h3 className="font-semibold text-sm text-[var(--text-primary)] tracking-wide">
                Scheduling Conflicts ({conflicts.length})
              </h3>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={toggleConflictPanel}
              className="h-7 w-7 rounded-md text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>

          {/* Panel Body */}
          <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-3">
            {conflicts.length > 0 ? (
              conflicts.map((conflict, idx) => {
                const involvedSessions = sessions.filter((s) => conflict.session_ids.includes(s.id));

                return (
                  <div
                    key={idx}
                    className="p-3.5 rounded-lg border border-rose-500/30 bg-rose-500/10 flex flex-col gap-2.5"
                  >
                    <div className="flex items-center justify-between">
                      <Badge variant="destructive" className="text-[9px] font-semibold uppercase tracking-wider bg-rose-500/20 text-rose-400 border-rose-500/30 px-1.5 py-0">
                        {conflict.type.replace("_", " ")}
                      </Badge>
                      <span className="text-[10px] font-bold text-rose-400 uppercase">
                        {conflict.severity}
                      </span>
                    </div>

                    <p className="text-xs font-medium text-[var(--text-primary)] leading-snug">
                      {conflict.description}
                    </p>

                    {/* Involved Sessions */}
                    <div className="flex flex-col gap-1.5 pt-2 border-t border-rose-500/20">
                      <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-secondary)]">
                        Conflicting Sessions:
                      </span>
                      {involvedSessions.map((s) => (
                        <div
                          key={s.id}
                          onClick={() => {
                            setSelectedSessionId(s.id);
                            toggleConflictPanel();
                          }}
                          className="flex items-center justify-between p-2 rounded-md bg-[var(--card)] border border-[var(--border-default)] hover:border-[var(--pri)] cursor-pointer text-xs transition-all"
                        >
                          <div className="flex items-center gap-2">
                            <span className="font-mono font-bold text-[var(--pri)]">
                              {s.session_code}
                            </span>
                            <span className="font-medium text-[var(--text-primary)] truncate max-w-[180px]">
                              {s.name}
                            </span>
                          </div>
                          <ArrowRight className="h-3.5 w-3.5 text-[var(--text-secondary)]" />
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="flex flex-col items-center justify-center py-16 text-center text-[var(--text-secondary)]">
                <CheckCircle2 className="h-10 w-10 text-emerald-400 mb-2 opacity-80" />
                <h4 className="font-semibold text-sm text-[var(--text-primary)] mb-1">No Conflicts Found</h4>
                <p className="text-xs text-[var(--text-secondary)] max-w-xs">Your event schedule has zero room overlaps or speaker double-bookings.</p>
              </div>
            )}
          </div>
        </motion.aside>
      </motion.div>
    </AnimatePresence>
  );
}
