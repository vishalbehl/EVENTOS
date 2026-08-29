"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, ArrowRightLeft, Calendar, MapPin, Check, Loader2 } from "lucide-react";
import { useSessions } from "@/hooks/useSessions";
import { apiPatch } from "@/lib/api-client";
import { toast } from "sonner";
import { useParams } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";

interface MoveTalkDialogProps {
  isOpen: boolean;
  onClose: () => void;
  sessionSpeakerId: string;
  currentSessionId: string;
  speakerName: string;
  talkTitle: string;
}

export function MoveTalkDialog({
  isOpen,
  onClose,
  sessionSpeakerId,
  currentSessionId,
  speakerName,
  talkTitle,
}: MoveTalkDialogProps) {
  const params = useParams();
  const eventIdStr = (params?.eventId as string) || "";
  const queryClient = useQueryClient();
  const { data: sessions } = useSessions(eventIdStr);

  const [targetSessionId, setTargetSessionId] = useState("");
  const [loading, setLoading] = useState(false);

  const handleMove = async () => {
    if (!targetSessionId) return;
    setLoading(true);
    try {
      await apiPatch(
        `/events/${eventIdStr}/sessions/${currentSessionId}/speakers/${sessionSpeakerId}`,
        {
          session_id: targetSessionId,
        }
      );
      toast.success("Talk successfully moved to new session.");
      queryClient.invalidateQueries({ queryKey: ["speaker-talks"] });
      queryClient.invalidateQueries({ queryKey: ["sessions", eventIdStr] });
      onClose();
    } catch {
      toast.error("Failed to move talk.");
    } finally {
      setLoading(false);
    }
  };

  const selectedSession = sessions?.find((s) => s.id === targetSessionId);

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60">
          <motion.div
            initial={{ scale: 0.96, opacity: 0, y: 8 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.96, opacity: 0, y: 8 }}
            transition={{ duration: 0.15 }}
            className="w-full max-w-lg rounded-lg border border-[var(--border-default)] bg-[var(--card)] p-6 shadow-md flex flex-col space-y-4"
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b border-[var(--border-subtle)] pb-3">
              <div className="flex items-center gap-2.5">
                <div className="flex size-8 items-center justify-center rounded-lg bg-[var(--pri)]/10 text-[var(--pri)] border border-[var(--pri)]/20">
                  <ArrowRightLeft className="size-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-[var(--text-primary)]">Move Presentation</h3>
                  <p className="text-[11px] text-[var(--text-secondary)]">Reassigning slot for {speakerName}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="rounded-md p-1 text-[var(--text-tertiary)] hover:bg-[var(--bg-surface-hover)] hover:text-[var(--text-primary)] transition-colors cursor-pointer"
              >
                <X className="size-4" />
              </button>
            </div>

            <div className="space-y-4">
              <div className="p-3 rounded-lg bg-[var(--bg-surface-2)] border border-[var(--border-default)]">
                <span className="text-[10px] font-bold uppercase text-[var(--text-tertiary)] block">
                  Active Presentation
                </span>
                <p className="text-xs font-semibold text-[var(--text-primary)] mt-0.5">
                  &ldquo;{talkTitle || "Untitled Presentation"}&rdquo;
                </p>
              </div>

              <div className="space-y-1">
                <label className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-tertiary)] block mb-1">
                  Target Session / Hall
                </label>
                <select
                  value={targetSessionId}
                  onChange={(e) => setTargetSessionId(e.target.value)}
                  className="h-9 w-full rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface-2)] px-3 text-xs text-[var(--text-primary)] focus:border-[var(--pri)] focus:outline-none cursor-pointer"
                >
                  <option value="">Select target session...</option>
                  {sessions
                    ?.filter((s) => s.id !== currentSessionId)
                    .map((s) => (
                      <option key={s.id} value={s.id}>
                        [{s.session_code}] {s.name}
                      </option>
                    ))}
                </select>
              </div>

              {selectedSession && (
                <div className="p-3 rounded-lg bg-[var(--pri)]/5 border border-[var(--pri)]/20 space-y-1 text-xs">
                  <div className="flex items-center gap-2 font-medium text-[var(--text-primary)]">
                    <Calendar className="size-3.5 text-[var(--pri)]" />
                    <span>
                      {new Date(selectedSession.start_time).toLocaleDateString()} @{" "}
                      {new Date(selectedSession.start_time).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-[var(--text-secondary)]">
                    <MapPin className="size-3.5 text-[var(--pri)]" />
                    <span>Room / Hall allocation active</span>
                  </div>
                </div>
              )}
            </div>

            {/* Actions */}
            <div className="flex items-center justify-end gap-2.5 border-t border-[var(--border-subtle)] pt-3">
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg border border-[var(--border-default)] bg-[var(--card)] px-4 py-2 text-xs font-semibold text-[var(--text-secondary)] hover:bg-[var(--bg-surface-hover)] transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={!targetSessionId || loading}
                onClick={handleMove}
                className="flex items-center gap-2 rounded-lg bg-[var(--pri)] px-5 py-2 text-xs font-bold text-[var(--primary-contrast)] shadow-sm hover:opacity-90 disabled:opacity-40 transition-all cursor-pointer"
              >
                {loading ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />}
                Confirm Move
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
