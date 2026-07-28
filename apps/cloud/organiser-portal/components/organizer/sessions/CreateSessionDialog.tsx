"use client";

import { useState, useMemo, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Plus, Calendar, Clock, MapPin, User, Hash, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useRooms } from "@/hooks/useRooms";
import { useEvent } from "@/hooks/useEvents";
import { apiPost } from "@/lib/api-client";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { fromDateTimeLocalString, formatApiError } from "@/lib/utils";
import { SESSION_CATEGORIES } from "@/types/models";
import { CapabilityAction } from "@/lib/capabilities";

interface CreateSessionDialogProps {
  isOpen: boolean;
  onClose: () => void;
  eventId: string;
}

export function CreateSessionDialog({ isOpen, onClose, eventId }: CreateSessionDialogProps) {
  const queryClient = useQueryClient();
  const { data: rooms } = useRooms(eventId);
  const { data: event } = useEvent(eventId);
  const [loading, setLoading] = useState(false);

  const [formData, setFormData] = useState({
    session_code: "",
    name: "",
    room_id: "",
    session_type: "KEYNOTE",
    selected_date: "",
    start_time_only: "09:00",
    end_time_only: "10:00",
    moderator_name: "",
    description: "",
  });

  const eventDates = useMemo(() => {
    if (!event?.start_date || !event?.end_date) return [];
    const dates = [];
    let curr = new Date(event.start_date);
    const end = new Date(event.end_date);
    while (curr <= end) {
      dates.push(new Date(curr).toISOString().split('T')[0]);
      curr.setDate(curr.getDate() + 1);
    }
    return dates;
  }, [event]);

  useEffect(() => {
    if (eventDates.length > 0 && !formData.selected_date) {
      setFormData(prev => ({ ...prev, selected_date: eventDates[0] }));
    }
  }, [eventDates]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (!formData.selected_date) throw new Error("Please select a date");
      const tz = event?.timezone || 'UTC';

      // Combine date and time
      const startTime = fromDateTimeLocalString(`${formData.selected_date}T${formData.start_time_only}`, tz);
      const endTime = fromDateTimeLocalString(`${formData.selected_date}T${formData.end_time_only}`, tz);

      const payload = {
        session_code: formData.session_code,
        name: formData.name,
        room_id: formData.room_id || null,
        session_type: formData.session_type,
        start_time: startTime,
        end_time: endTime,
        moderator_name: formData.moderator_name,
        description: formData.description,
      };

      await apiPost(`/events/${eventId}/sessions`, payload);
      toast.success("Session created successfully");
      queryClient.invalidateQueries({ queryKey: ["sessions", eventId] });
      onClose();
      // Reset
      setFormData({
        session_code: "", name: "", room_id: "", session_type: "KEYNOTE",
        selected_date: eventDates[0] || "",
        start_time_only: "09:00", end_time_only: "10:00", 
        moderator_name: "", description: ""
      });
    } catch (err: any) {
      toast.error(formatApiError(err, "Failed to create session"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          key="create-session-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="fixed inset-0 bg-[var(--base)]/80 backdrop-blur-md z-[200]"
        />
      )}
      {isOpen && (
        <div key="create-session-wrapper" className="fixed inset-0 flex items-center justify-center z-[210] pointer-events-none p-4">
          <motion.div
            initial={{ scale: 0.95, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.95, opacity: 0, y: 20 }}
            className="w-full max-w-2xl glass-3d rounded-[2.5rem] border-default shadow-2xl pointer-events-auto flex flex-col max-h-[90vh] overflow-hidden"
          >
            <div className="p-8 border-b border-default flex-shrink-0">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="h-12 w-12 rounded-2xl bg-[var(--pri)]/10 flex items-center justify-center">
                    <Plus className="h-6 w-6 text-[var(--pri)]" />
                  </div>
                  <div>
                    <h3 className="text-xl font-black text-[var(--text)] tracking-tight">Create New Session</h3>
                    <p className="text-[11px] font-bold text-muted uppercase tracking-widest mt-0.5">Define a new academic slot</p>
                  </div>
                </div>
                <button onClick={onClose} className="h-10 w-10 rounded-full border border-default flex items-center justify-center text-muted hover:text-[var(--text)]">
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-8 space-y-8 no-scrollbar">
              <div className="grid grid-cols-3 gap-6">
                <div className="space-y-2 col-span-1">
                  <label className="text-[9px] font-black text-muted uppercase tracking-widest ml-1">Session Code *</label>
                  <div className="relative">
                    <Hash className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted" />
                    <Input
                      required
                      value={formData.session_code}
                      onChange={e => setFormData({ ...formData, session_code: e.target.value })}
                      placeholder="e.g. S101"
                      className="h-12 glass-3d border-default pl-12 text-[13px] font-bold"
                    />
                  </div>
                </div>
                <div className="space-y-2 col-span-2">
                  <label className="text-[9px] font-black text-muted uppercase tracking-widest ml-1">Session Name *</label>
                  <Input
                    required
                    value={formData.name}
                    onChange={e => setFormData({ ...formData, name: e.target.value })}
                    placeholder="e.g. Quantum Computing Frontiers"
                    className="h-12 glass-3d border-default px-5 text-[13px] font-bold"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label className="text-[9px] font-black text-muted uppercase tracking-widest ml-1">Hall / Room *</label>
                  <div className="relative">
                    <MapPin className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted" />
                    <select
                      required
                      value={formData.room_id}
                      onChange={e => setFormData({ ...formData, room_id: e.target.value })}
                      className="w-full h-12 glass-3d border-default rounded-xl pl-12 pr-4 text-[13px] font-bold text-[var(--text)] appearance-none focus:outline-none"
                    >
                      <option key="placeholder" value="">Select Room...</option>
                      {rooms?.map((r: any, idx: number) => <option key={r.id || `room-${idx}`} value={r.id}>{r.name}</option>)}
                    </select>
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-[9px] font-black text-muted uppercase tracking-widest ml-1">Session Type</label>
                  <select
                    value={formData.session_type}
                    onChange={e => setFormData({ ...formData, session_type: e.target.value })}
                    className="w-full h-12 glass-3d border-default rounded-xl px-4 text-[13px] font-bold text-[var(--text)] focus:outline-none cursor-pointer"
                  >
                    {Object.entries(SESSION_CATEGORIES).map(([category, types]) => (
                      <optgroup key={category} label={category} className="bg-[var(--surf)] text-[9px] font-black tracking-widest text-muted uppercase">
                        {types.map(t => (
                          <option key={t.value} value={t.value} className="bg-[var(--base)] text-[var(--text)] font-semibold">
                            {t.label}
                          </option>
                        ))}
                      </optgroup>
                    ))}
                  </select>
                </div>
              </div>

              <div className="space-y-6">
                <div className="space-y-2">
                  <label className="text-[9px] font-black text-muted uppercase tracking-widest ml-1">Conference Day *</label>
                  <div className="relative">
                    <Calendar className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted" />
                    <select
                      required
                      value={formData.selected_date}
                      onChange={e => setFormData({ ...formData, selected_date: e.target.value })}
                      className="w-full h-12 glass-3d border-default rounded-xl pl-12 pr-4 text-[13px] font-bold text-[var(--text)] appearance-none focus:outline-none"
                    >
                      <option value="">Select Day...</option>
                      {eventDates.map(d => (
                        <option key={d} value={d}>
                          {new Date(d).toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'short', timeZone: 'Asia/Kolkata' })}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <label className="text-[9px] font-black text-muted uppercase tracking-widest ml-1">Start Time *</label>
                    <div className="relative">
                      <Clock className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted" />
                      <Input
                        required
                        type="time"
                        value={formData.start_time_only}
                        onChange={e => setFormData({ ...formData, start_time_only: e.target.value })}
                        className="h-12 glass-3d border-default pl-12 text-[13px] font-bold"
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="text-[9px] font-black text-muted uppercase tracking-widest ml-1">End Time *</label>
                    <div className="relative">
                      <Clock className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted" />
                      <Input
                        required
                        type="time"
                        value={formData.end_time_only}
                        onChange={e => setFormData({ ...formData, end_time_only: e.target.value })}
                        className="h-12 glass-3d border-default pl-12 text-[13px] font-bold"
                      />
                    </div>
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-[9px] font-black text-muted uppercase tracking-widest ml-1">Moderator Name</label>
                <div className="relative">
                  <User className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted" />
                  <Input
                    value={formData.moderator_name}
                    onChange={e => setFormData({ ...formData, moderator_name: e.target.value })}
                    placeholder="e.g. Dr. Jane Smith"
                    className="h-12 glass-3d border-default pl-12 text-[13px] font-bold"
                  />
                </div>
              </div>
            </form>

            <div className="p-8 border-t border-default bg-[color-mix(in_srgb,var(--base)_50%,transparent)] backdrop-blur-sm flex gap-4">
              <Button onClick={onClose} variant="ghost" className="flex-1 h-14 rounded-2xl text-[11px] font-black uppercase tracking-widest text-muted">
                Cancel
              </Button>
              <CapabilityAction operation="sessions.manage">
                <Button
                  disabled={loading}
                  onClick={handleSubmit}
                  className="flex-[2] h-14 rounded-2xl bg-[var(--pri)] hover:bg-[var(--sec)] text-[var(--text)] font-black uppercase tracking-widest text-[11px] shadow-lg border-0"
                >
                  {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Plus className="h-4 w-4 mr-2" />}
                  Register Session
                </Button>
              </CapabilityAction>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
