"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Calendar, MapPin, Tag, Plus, Sparkles, Loader2, Hash } from "lucide-react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Switch } from "./ui/switch";
import { useCreateEvent, useUpdateEvent } from "@/hooks/useEvents";
import { cn } from "@/lib/utils";
import { EventSummary } from "@/types/backend";

interface CreateEventDialogProps {
  isOpen: boolean;
  onClose: () => void;
  eventToEdit?: EventSummary | null;
}

export function CreateEventDialog({ isOpen, onClose, eventToEdit }: CreateEventDialogProps) {
  const createEvent = useCreateEvent();
  const updateEvent = useUpdateEvent(eventToEdit?.id || "");
  const [loading, setLoading] = useState(false);

  const [formData, setFormData] = useState({
    name: "",
    short_code: "",
    location: "",
    start_date: "",
    end_date: "",
    status: "draft" as const,
    speaker_mode_enabled: true,
    registration_mode_enabled: true
  });

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [isOpen]);

  useEffect(() => {
    if (eventToEdit && isOpen) {
      setFormData({
        name: eventToEdit.name,
        short_code: eventToEdit.short_code,
        location: eventToEdit.location || "",
        start_date: eventToEdit.start_date ? new Date(eventToEdit.start_date).toISOString().split('T')[0] : "",
        end_date: eventToEdit.end_date ? new Date(eventToEdit.end_date).toISOString().split('T')[0] : "",
        status: eventToEdit.status as any,
        speaker_mode_enabled: (eventToEdit as any).speaker_mode_enabled ?? true,
        registration_mode_enabled: (eventToEdit as any).registration_mode_enabled ?? true
      });
    } else if (isOpen) {
      setFormData({
        name: "",
        short_code: "",
        location: "",
        start_date: "",
        end_date: "",
        status: "draft",
        speaker_mode_enabled: true,
        registration_mode_enabled: true
      });
    }
  }, [eventToEdit, isOpen]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (eventToEdit) {
        await updateEvent.mutateAsync(formData);
      } else {
        await createEvent.mutateAsync(formData);
      }
      onClose();
    } catch (error) {
      console.error("Failed to save event:", error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-[var(--base)]/80 backdrop-blur-md z-[200]"
          />

          {/* Dialog Container */}
          <div className="fixed inset-0 flex items-center justify-center z-[210] pointer-events-none p-4 md:p-8">
            <motion.div
              initial={{ scale: 0.95, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 20 }}
              className="w-full max-w-5xl glass-3d rounded-[3rem] border-default shadow-2xl pointer-events-auto flex flex-col h-full max-h-[95vh] overflow-hidden"
            >
              {/* Header */}
              <div className="p-8 border-b border-default flex-shrink-0">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="h-12 w-12 rounded-2xl bg-[var(--pri)]/10 flex items-center justify-center">
                      <Plus className="h-6 w-6 text-[var(--pri)]" />
                    </div>
                    <div>
                      <h3 className="text-xl font-black text-[var(--text)] tracking-tight">
                        {eventToEdit ? "Edit Event" : "Create New Event"}
                      </h3>
                      <p className="text-[11px] font-bold text-muted uppercase tracking-widest mt-0.5">
                        {eventToEdit ? "Update event details" : "Set up a new event"}
                      </p>
                    </div>
                  </div>
                  <button onClick={onClose} className="h-10 w-10 rounded-full border border-default flex items-center justify-center text-muted hover:text-[var(--text)] transition-all hover:rotate-90">
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </div>

              {/* Form Content */}
              <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-8 space-y-8 no-scrollbar">
                <div className="space-y-2">
                  <label className="text-[9px] font-black text-muted uppercase tracking-widest ml-1">Event Name *</label>
                  <div className="relative">
                    <Sparkles className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted" />
                    <Input
                      required
                      value={formData.name}
                      onChange={e => setFormData({ ...formData, name: e.target.value })}
                      placeholder="e.g. Global Tech Summit 2026"
                      className="h-12 glass-3d border-default pl-12 text-[13px] font-bold text-[var(--text)]"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <label className="text-[9px] font-black text-muted uppercase tracking-widest ml-1">Short Code *</label>
                    <div className="relative">
                      <Hash className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted" />
                      <Input
                        required
                        value={formData.short_code}
                        onChange={e => setFormData({ ...formData, short_code: e.target.value.toUpperCase() })}
                        placeholder="GTS26"
                        maxLength={10}
                        className="h-12 glass-3d border-default pl-12 text-[13px] font-bold text-[var(--text)] font-mono"
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="text-[9px] font-black text-muted uppercase tracking-widest ml-1">Location</label>
                    <div className="relative">
                      <MapPin className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted" />
                      <Input
                        required
                        value={formData.location}
                        onChange={e => setFormData({ ...formData, location: e.target.value })}
                        placeholder="San Francisco, CA"
                        className="h-12 glass-3d border-default pl-12 text-[13px] font-bold text-[var(--text)]"
                      />
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <label className="text-[9px] font-black text-muted uppercase tracking-widest ml-1">Start Date *</label>
                    <div className="relative">
                      <Calendar className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted" />
                      <Input
                        required
                        type="date"
                        value={formData.start_date}
                        onChange={e => setFormData({ ...formData, start_date: e.target.value })}
                        className="h-12 glass-3d border-default pl-12 text-[13px] font-bold text-[var(--text)] [color-scheme:dark]"
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="text-[9px] font-black text-muted uppercase tracking-widest ml-1">End Date *</label>
                    <div className="relative">
                      <Calendar className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted" />
                      <Input
                        required
                        type="date"
                        value={formData.end_date}
                        onChange={e => setFormData({ ...formData, end_date: e.target.value })}
                        className="h-12 glass-3d border-default pl-12 text-[13px] font-bold text-[var(--text)] [color-scheme:dark]"
                      />
                    </div>
                  </div>
                </div>

                {/* Event Features / Modes Switches */}
                <div className="glass-3d p-6 rounded-[2rem] border-default space-y-6">
                  <div>
                    <h4 className="text-[12px] font-black text-[var(--text)] uppercase tracking-wider">Event Features & Modes</h4>
                    <p className="text-muted text-[10px] font-bold uppercase tracking-widest mt-0.5">Enable the modules required for this conference. At least one must be active.</p>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="flex items-center justify-between p-5 rounded-2xl bg-white/5 border border-default/50 hover:border-[var(--pri)]/20 transition-all gap-4">
                      <div className="space-y-1">
                        <Label className="text-[12px] font-black text-[var(--text)] leading-none cursor-pointer" htmlFor="switch-speaker">Speaker Presentation Desk</Label>
                        <p className="text-muted text-[9px] font-bold uppercase tracking-wider leading-normal">Manage schedule, speakers, files & eposters</p>
                      </div>
                      <Switch
                        id="switch-speaker"
                        checked={formData.speaker_mode_enabled}
                        onCheckedChange={(checked) => {
                          if (!checked && !formData.registration_mode_enabled) return;
                          setFormData({ ...formData, speaker_mode_enabled: checked });
                        }}
                      />
                    </div>

                    <div className="flex items-center justify-between p-5 rounded-2xl bg-white/5 border border-default/50 hover:border-[var(--sec)]/20 transition-all gap-4">
                      <div className="space-y-1">
                        <Label className="text-[12px] font-black text-[var(--text)] leading-none cursor-pointer" htmlFor="switch-registration">On-Site Registration & Badges</Label>
                        <p className="text-muted text-[9px] font-bold uppercase tracking-wider leading-normal">Manage registrations, checkins & dynamic badge printing</p>
                      </div>
                      <Switch
                        id="switch-registration"
                        checked={formData.registration_mode_enabled}
                        onCheckedChange={(checked) => {
                          if (!checked && !formData.speaker_mode_enabled) return;
                          setFormData({ ...formData, registration_mode_enabled: checked });
                        }}
                      />
                    </div>
                  </div>
                </div>
              </form>

              {/* Footer */}
              <div className="p-8 border-t border-default bg-[color-mix(in_srgb,var(--base)_50%,transparent)] backdrop-blur-sm flex gap-4">
                <Button onClick={onClose} variant="ghost" className="flex-1 h-14 rounded-2xl text-[11px] font-black uppercase tracking-widest text-muted">
                  Cancel
                </Button>
                <Button
                  disabled={loading}
                  onClick={handleSubmit}
                  className="flex-[2] h-14 rounded-2xl bg-[var(--pri)] hover:bg-[var(--sec)] text-[var(--text)] font-black uppercase tracking-widest text-[11px] shadow-lg border-0"
                >
                  {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Plus className="h-4 w-4 mr-2" />}
                  {eventToEdit ? "Update Event" : "Create Event"}
                </Button>
              </div>
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  );
}
