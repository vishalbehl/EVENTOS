"use client";
// Quota control: max_sessions is enforced by the API before creation.

import { useState, useMemo, useEffect } from "react";
import { useLimitAccess } from "@/lib/capabilities";
import { motion, AnimatePresence } from "framer-motion";
import { X, Plus, Calendar, Clock, MapPin, Hash, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useRooms } from "@/hooks/useRooms";
import { useEvent } from "@/hooks/useEvents";
import { apiPost } from "@/lib/api-client";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { fromDateTimeLocalString, formatApiError } from "@/lib/utils";
import { SESSION_CATEGORIES } from "@/types/models";

interface CreateSessionDialogProps {
  isOpen: boolean;
  onClose: () => void;
  eventId: string;
  preloadedRooms?: any[];
}

export function CreateSessionDialog({ isOpen, onClose, eventId, preloadedRooms }: CreateSessionDialogProps) {
  const queryClient = useQueryClient();
  const { data: fetchedRooms } = useRooms(eventId);
  const rooms = (preloadedRooms && preloadedRooms.length > 0) ? preloadedRooms : (fetchedRooms || []);
  const { data: event } = useEvent(eventId);
  const [loading, setLoading] = useState(false);

  const defaultStartTime = useMemo(() => {
    if (event?.start_date) {
      const d = new Date(event.start_date);
      d.setHours(9, 0, 0, 0);
      return d.toISOString().slice(0, 16);
    }
    const d = new Date();
    d.setHours(9, 0, 0, 0);
    return d.toISOString().slice(0, 16);
  }, [event]);

  const defaultEndTime = useMemo(() => {
    if (event?.start_date) {
      const d = new Date(event.start_date);
      d.setHours(10, 30, 0, 0);
      return d.toISOString().slice(0, 16);
    }
    const d = new Date();
    d.setHours(10, 30, 0, 0);
    return d.toISOString().slice(0, 16);
  }, [event]);

  const [formData, setFormData] = useState({
    name: "",
    session_code: "",
    room_id: "",
    start_time: defaultStartTime,
    end_time: defaultEndTime,
    category: "CONTENT",
    description: "",
    track: "",
    max_capacity: 100,
  });

  useEffect(() => {
    if (rooms.length > 0 && !formData.room_id) {
      setFormData(prev => ({ ...prev, room_id: rooms[0].id }));
    }
  }, [rooms, formData.room_id]);

  useEffect(() => {
    if (isOpen) {
      setFormData(prev => ({
        ...prev,
        start_time: defaultStartTime,
        end_time: defaultEndTime,
        room_id: rooms[0]?.id || "",
      }));
    }
  }, [isOpen, defaultStartTime, defaultEndTime, rooms]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name || !formData.room_id) {
      toast.error("Please fill in session name and choose a room");
      return;
    }

    const start = new Date(formData.start_time);
    const end = new Date(formData.end_time);
    if (end <= start) {
      toast.error("End time must be strictly after start time");
      return;
    }

    setLoading(true);
    try {
      await apiPost(`/events/${eventId}/sessions`, {
        ...formData,
        start_time: fromDateTimeLocalString(formData.start_time),
        end_time: fromDateTimeLocalString(formData.end_time),
      });

      toast.success("Session created successfully");
      queryClient.invalidateQueries({ queryKey: ["sessions", eventId] });
      queryClient.invalidateQueries({ queryKey: ["builder-sessions", eventId] });
      onClose();
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
          className="fixed inset-0 bg-black/60 z-[200] flex items-center justify-center p-4"
        >
          <motion.div
            initial={{ scale: 0.95, opacity: 0, y: 15 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.95, opacity: 0, y: 15 }}
            className="w-full max-w-xl rounded-lg border border-[var(--border-default)] bg-[var(--card)] shadow-2xl text-[var(--text-primary)] flex flex-col max-h-[90vh] overflow-hidden"
          >
            <div className="p-5 border-b border-[var(--border-subtle)] bg-[var(--bg-surface-2)] flex items-center justify-between flex-shrink-0">
              <div className="flex items-center gap-3">
                <div className="size-8 rounded-lg bg-[var(--pri)]/10 text-[var(--pri)] flex items-center justify-center border border-[var(--pri)]/20">
                  <Plus className="size-4" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-[var(--text-primary)] tracking-tight">Create New Session</h3>
                  <p className="text-[11px] text-[var(--text-secondary)]">Define a new conference session slot</p>
                </div>
              </div>
              <button 
                type="button"
                onClick={onClose} 
                className="size-8 rounded-md border border-[var(--border-default)] bg-[var(--card)] flex items-center justify-center text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)] transition-colors cursor-pointer shadow-sm"
              >
                <X className="size-4" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-5 space-y-4 text-xs">
              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1 col-span-1">
                  <label className="text-[11px] font-bold text-[var(--text-tertiary)] uppercase tracking-wider block">Session Code *</label>
                  <div className="relative">
                    <Hash className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-[var(--text-tertiary)]" />
                    <Input
                      required
                      value={formData.session_code}
                      onChange={e => setFormData({ ...formData, session_code: e.target.value.toUpperCase() })}
                      placeholder="e.g. S101"
                      className="h-9 bg-[var(--bg-surface-2)] border-[var(--border-default)] pl-8 text-xs font-bold uppercase rounded-lg"
                    />
                  </div>
                </div>
                <div className="space-y-1 col-span-2">
                  <label className="text-[11px] font-bold text-[var(--text-tertiary)] uppercase tracking-wider block">Session Name *</label>
                  <Input
                    required
                    value={formData.name}
                    onChange={e => setFormData({ ...formData, name: e.target.value })}
                    placeholder="e.g. Opening Keynote & Welcome"
                    className="h-9 bg-[var(--bg-surface-2)] border-[var(--border-default)] text-xs font-semibold rounded-lg"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[11px] font-bold text-[var(--text-tertiary)] uppercase tracking-wider block">Room *</label>
                  <div className="relative">
                    <MapPin className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-[var(--text-tertiary)]" />
                    <select
                      required
                      value={formData.room_id}
                      onChange={e => setFormData({ ...formData, room_id: e.target.value })}
                      className="h-9 w-full bg-[var(--bg-surface-2)] border border-[var(--border-default)] rounded-lg pl-8 pr-3 text-xs font-semibold text-[var(--text-primary)] focus:outline-none focus:border-[var(--pri)] cursor-pointer"
                    >
                      {rooms.map(r => (
                        <option key={r.id} value={r.id}>{r.name} (Cap: {r.capacity})</option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="space-y-1">
                  <label className="text-[11px] font-bold text-[var(--text-tertiary)] uppercase tracking-wider block">Category</label>
                  <select
                    value={formData.category}
                    onChange={e => setFormData({ ...formData, category: e.target.value })}
                    className="h-9 w-full bg-[var(--bg-surface-2)] border border-[var(--border-default)] rounded-lg px-3 text-xs font-semibold text-[var(--text-primary)] focus:outline-none focus:border-[var(--pri)] cursor-pointer"
                  >
                    {Object.keys(SESSION_CATEGORIES).map(c => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[11px] font-bold text-[var(--text-tertiary)] uppercase tracking-wider block">Start Time *</label>
                  <div className="relative">
                    <Clock className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-[var(--text-tertiary)]" />
                    <Input
                      type="datetime-local"
                      required
                      value={formData.start_time}
                      onChange={e => setFormData({ ...formData, start_time: e.target.value })}
                      className="h-9 bg-[var(--bg-surface-2)] border-[var(--border-default)] pl-8 text-xs font-semibold rounded-lg"
                    />
                  </div>
                </div>
                <div className="space-y-1">
                  <label className="text-[11px] font-bold text-[var(--text-tertiary)] uppercase tracking-wider block">End Time *</label>
                  <div className="relative">
                    <Clock className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-[var(--text-tertiary)]" />
                    <Input
                      type="datetime-local"
                      required
                      value={formData.end_time}
                      onChange={e => setFormData({ ...formData, end_time: e.target.value })}
                      className="h-9 bg-[var(--bg-surface-2)] border-[var(--border-default)] pl-8 text-xs font-semibold rounded-lg"
                    />
                  </div>
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-[11px] font-bold text-[var(--text-tertiary)] uppercase tracking-wider block">Track / Topic (Optional)</label>
                <Input
                  value={formData.track}
                  onChange={e => setFormData({ ...formData, track: e.target.value })}
                  placeholder="e.g. Artificial Intelligence, Cardiology"
                  className="h-9 bg-[var(--bg-surface-2)] border-[var(--border-default)] text-xs font-semibold rounded-lg"
                />
              </div>

              <div className="p-4 border-t border-[var(--border-subtle)] bg-[var(--bg-surface-2)] flex items-center justify-end gap-2.5 -mx-5 -mb-5 mt-4">
                <Button 
                  type="button" 
                  variant="outline" 
                  onClick={onClose}
                  className="h-9 px-4 rounded-lg border border-[var(--border-default)] bg-[var(--card)] text-xs font-semibold text-[var(--text-secondary)] hover:bg-[var(--bg-surface-hover)] cursor-pointer"
                >
                  Cancel
                </Button>
                <Button 
                  type="submit" 
                  disabled={loading}
                  className="h-9 px-4 bg-[var(--pri)] hover:opacity-90 text-[var(--primary-contrast)] font-bold text-xs rounded-lg shadow-sm border-0 cursor-pointer"
                >
                  {loading ? <Loader2 className="size-3.5 animate-spin mr-1.5" /> : null}
                  Create Session
                </Button>
              </div>
            </form>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
