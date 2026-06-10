"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, ArrowRightLeft, Calendar, MapPin, Check, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useSessions } from "@/hooks/useSessions";
import { apiPatch } from "@/lib/api-client";
import { cn } from "@/lib/utils";
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
  isOpen, onClose, sessionSpeakerId, currentSessionId, speakerName, talkTitle 
}: MoveTalkDialogProps) {
  const { eventId } = useParams();
  const eventIdStr = eventId as string;
  const queryClient = useQueryClient();
  const { data: sessions } = useSessions(eventIdStr);

  const [targetSessionId, setTargetSessionId] = useState("");
  const [loading, setLoading] = useState(false);

  const handleMove = async () => {
    if (!targetSessionId) return;
    setLoading(true);
    try {
      // Endpoint: PATCH /events/{event_id}/sessions/{session_id}/speakers/{session_speaker_id}
      await apiPatch(`/events/${eventIdStr}/sessions/${currentSessionId}/speakers/${sessionSpeakerId}`, {
        session_id: targetSessionId
      });
      toast.success("Talk successfully moved to new session");
      // Refresh both the speaker's talks and the general sessions
      queryClient.invalidateQueries({ queryKey: ["speaker-talks"] });
      queryClient.invalidateQueries({ queryKey: ["sessions", eventIdStr] });
      onClose();
    } catch (err: any) {
      toast.error("Failed to move talk");
    } finally {
      setLoading(false);
    }
  };

  const selectedSession = sessions?.find(s => s.id === targetSessionId);

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-[var(--base)]/80 backdrop-blur-md z-[200]"
          />
          <div className="fixed inset-0 flex items-center justify-center z-[210] pointer-events-none p-4">
            <motion.div
              initial={{ scale: 0.95, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 20 }}
              className="w-full max-w-lg glass-3d rounded-[2.5rem] border-default shadow-2xl pointer-events-auto overflow-hidden"
            >
              <div className="p-8">
                <div className="flex items-center justify-between mb-8">
                  <div className="flex items-center gap-4">
                    <div className="h-12 w-12 rounded-2xl bg-[var(--sec)]/10 flex items-center justify-center">
                      <ArrowRightLeft className="h-6 w-6 text-[var(--sec)]" />
                    </div>
                    <div>
                      <h3 className="text-xl font-black text-[var(--text)] tracking-tight">Move Presentation</h3>
                      <p className="text-[11px] font-bold text-muted uppercase tracking-widest mt-0.5">Reassigning slot: {speakerName}</p>
                    </div>
                  </div>
                  <button onClick={onClose} className="h-10 w-10 rounded-full border border-default flex items-center justify-center text-muted hover:text-[var(--text)] transition-all">
                    <X className="h-4 w-4" />
                  </button>
                </div>

                <div className="space-y-6">
                  <div className="p-4 rounded-xl bg-muted/5 border border-default">
                    <p className="text-[10px] font-black text-muted uppercase tracking-widest mb-1">Active Presentation</p>
                    <p className="text-[13px] font-bold text-[var(--text)] italic">"{talkTitle || 'Untitled Presentation'}"</p>
                  </div>

                  <div className="space-y-3">
                    <label className="text-[10px] font-black text-muted uppercase tracking-widest ml-1">Target Session / Hall</label>
                    <select 
                      value={targetSessionId}
                      onChange={e => setTargetSessionId(e.target.value)}
                      className="w-full h-12 glass-3d border-default rounded-2xl px-4 text-[13px] font-bold text-[var(--text)] appearance-none focus:outline-none focus:border-[var(--pri)]/50 transition-all"
                    >
                      <option value="">Select target session...</option>
                      {sessions?.filter(s => s.id !== currentSessionId).map(s => (
                        <option key={s.id} value={s.id}>
                          [{s.session_code}] {s.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  {selectedSession && (
                    <motion.div 
                      initial={{ opacity: 0, scale: 0.95 }}
                      animate={{ opacity: 1, scale: 1 }}
                      className="p-5 rounded-2xl bg-[var(--pri)]/5 border border-[var(--pri)]/20 flex gap-4"
                    >
                      <div className="space-y-2">
                         <div className="flex items-center gap-2 text-[11px] font-bold text-[var(--text)]">
                            <Calendar className="h-3.5 w-3.5 text-[var(--pri)]" />
                            {new Date(selectedSession.start_time).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' })} @ {new Date(selectedSession.start_time).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'Asia/Kolkata' })} IST
                         </div>
                         <div className="flex items-center gap-2 text-[11px] font-bold text-[var(--text)]">
                            <MapPin className="h-3.5 w-3.5 text-[var(--sec)]" />
                            Hall / Room Assignment Pending
                         </div>
                      </div>
                    </motion.div>
                  )}
                </div>

                <div className="mt-10 flex gap-4">
                  <Button
                    onClick={onClose}
                    variant="ghost"
                    className="flex-1 h-14 rounded-2xl text-[11px] font-black uppercase tracking-widest text-muted hover:text-[var(--text)]"
                  >
                    Cancel
                  </Button>
                  <Button
                    disabled={!targetSessionId || loading}
                    onClick={handleMove}
                    className="flex-[2] h-14 rounded-2xl bg-[var(--pri)] hover:bg-[var(--sec)] text-[var(--text)] font-black uppercase tracking-widest text-[11px] shadow-lg border-0"
                  >
                    {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Check className="h-4 w-4 mr-2" />}
                    Confirm Move
                  </Button>
                </div>
              </div>
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  );
}
