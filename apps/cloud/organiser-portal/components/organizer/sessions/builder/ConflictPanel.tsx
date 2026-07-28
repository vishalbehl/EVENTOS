"use client";

import { motion, AnimatePresence } from "framer-motion";
import { AlertTriangle, X, ArrowRight, CheckCircle2, ShieldAlert } from "lucide-react";
import { useSessionBuilderStore, SchedulingConflict } from "@/store/useSessionBuilderStore";
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
        className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex justify-end"
        onClick={toggleConflictPanel}
      >
        <motion.aside
          initial={{ x: "100%" }}
          animate={{ x: 0 }}
          exit={{ x: "100%" }}
          transition={{ type: "spring", damping: 25, stiffness: 200 }}
          onClick={(e) => e.stopPropagation()}
          className="w-full max-w-md bg-background border-l border-default h-full shadow-2xl flex flex-col"
        >
          {/* Panel Header */}
          <div className="p-6 border-b border-default flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ShieldAlert className="h-5 w-5 text-red-500" />
              <h3 className="font-black text-[16px] text-[var(--text)] tracking-tight">
                Scheduling Conflicts ({conflicts.length})
              </h3>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={toggleConflictPanel}
              className="h-8 w-8 rounded-full"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>

          {/* Panel Body */}
          <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-4">
            {conflicts.length > 0 ? (
              conflicts.map((conflict, idx) => {
                const involvedSessions = sessions.filter((s) => conflict.session_ids.includes(s.id));

                return (
                  <div
                    key={idx}
                    className="p-4 rounded-2xl border border-red-500/30 bg-red-500/10 flex flex-col gap-3"
                  >
                    <div className="flex items-center justify-between">
                      <Badge variant="destructive" className="text-[10px] font-bold uppercase tracking-wider">
                        {conflict.type.replace("_", " ")}
                      </Badge>
                      <span className="text-[10px] font-bold text-red-400 uppercase">
                        {conflict.severity}
                      </span>
                    </div>

                    <p className="text-[12px] font-semibold text-[var(--text)] leading-snug">
                      {conflict.description}
                    </p>

                    {/* Involved Sessions */}
                    <div className="flex flex-col gap-2 pt-2 border-t border-red-500/20">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-muted">
                        Conflicting Sessions:
                      </span>
                      {involvedSessions.map((s) => (
                        <div
                          key={s.id}
                          onClick={() => {
                            setSelectedSessionId(s.id);
                            toggleConflictPanel();
                          }}
                          className="flex items-center justify-between p-2 rounded-xl bg-background/80 border border-default hover:border-[var(--pri)] cursor-pointer text-[11px] transition-all"
                        >
                          <div className="flex items-center gap-2">
                            <span className="font-mono font-bold text-[var(--pri)]">
                              {s.session_code}
                            </span>
                            <span className="font-bold text-[var(--text)] truncate max-w-[180px]">
                              {s.name}
                            </span>
                          </div>
                          <ArrowRight className="h-3.5 w-3.5 text-muted" />
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="flex flex-col items-center justify-center py-20 text-center text-muted">
                <CheckCircle2 className="h-12 w-12 text-[var(--success)] mb-3 opacity-80" />
                <h4 className="font-black text-[16px] text-[var(--text)] mb-1">No Conflicts Found</h4>
                <p className="text-[12px]">Your event schedule has zero room overlaps or speaker conflicts.</p>
              </div>
            )}
          </div>
        </motion.aside>
      </motion.div>
    </AnimatePresence>
  );
}
