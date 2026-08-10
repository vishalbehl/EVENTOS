"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Calendar, MapPin, Tag, Plus, Sparkles, Loader2, Hash, Globe, Mail, Phone, Users } from "lucide-react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Switch } from "./ui/switch";
import { useCreateEvent, useUpdateEvent } from "@/hooks/useEvents";
import { cn } from "@/lib/utils";
import { EventSummary } from "@/types/backend";
import { CountryStateEntry, fetchCountryStates, getStatesForCountry } from "@/lib/country-states";

interface CreateEventDialogProps {
  isOpen: boolean;
  onClose: () => void;
  eventToEdit?: EventSummary | null;
}

export function CreateEventDialog({ isOpen, onClose, eventToEdit }: CreateEventDialogProps) {
  const createEvent = useCreateEvent();
  const updateEvent = useUpdateEvent(eventToEdit?.id || "");
  const [loading, setLoading] = useState(false);

  const [globalTimezone, setGlobalTimezone] = useState("Asia/Kolkata");

  const [formData, setFormData] = useState({
    name: "",
    short_code: "",
    location: "",
    venue_name: "",
    country: "",
    state: "",
    organizer_details: {
      name: "",
      email: "",
      phone: "",
      website: ""
    },
    start_date: "",
    end_date: "",
    timezone: "Asia/Kolkata",
    status: "draft" as const,
    speaker_settings: { enabled: true, window_required: true },
    registration_settings: { enabled: true, registration_allowed: true, participants_list_allowed: true }
  });

  const [countryStates, setCountryStates] = useState<CountryStateEntry[]>([]);

  useEffect(() => {
    fetchCountryStates().then(setCountryStates).catch(console.error);

    // Fetch global timezone
    const apiBase = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8001";
    fetch(`${apiBase}/api/v1/global-settings`, {
      headers: {
        'Authorization': `Bearer ${localStorage.getItem("accessToken") || ""}`
      }
    })
      .then(res => {
        if (res.ok) return res.json();
        throw new Error();
      })
      .then(data => {
        if (data && data.timezone) {
          setGlobalTimezone(data.timezone);
          if (!eventToEdit) {
            setFormData(prev => ({ ...prev, timezone: data.timezone }));
          }
        }
      })
      .catch(() => {});
  }, [eventToEdit]);

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
      const details = (eventToEdit as any).organizer_details || { name: "", email: "", phone: "", website: "" };
      const speakerSettings = (eventToEdit as any).speaker_settings || { enabled: true, window_required: true };
      const registrationSettings = (eventToEdit as any).registration_settings || { enabled: true, registration_allowed: true, participants_list_allowed: true };
      setFormData({
        name: eventToEdit.name,
        short_code: eventToEdit.short_code,
        location: eventToEdit.location || "",
        venue_name: eventToEdit.venue_name || "",
        country: (eventToEdit as any).country || "",
        state: (eventToEdit as any).state || "",
        organizer_details: {
          name: details.name || eventToEdit.organizer_name || "",
          email: details.email || "",
          phone: details.phone || "",
          website: details.website || ""
        },
        start_date: eventToEdit.start_date ? new Date(eventToEdit.start_date).toISOString().split('T')[0] : "",
        end_date: eventToEdit.end_date ? new Date(eventToEdit.end_date).toISOString().split('T')[0] : "",
        timezone: (eventToEdit as any).timezone || globalTimezone,
        status: eventToEdit.status as any,
        speaker_settings: { enabled: speakerSettings.enabled ?? true, window_required: speakerSettings.window_required ?? true },
        registration_settings: { enabled: registrationSettings.enabled ?? true, registration_allowed: registrationSettings.registration_allowed ?? true, participants_list_allowed: registrationSettings.participants_list_allowed ?? true },
      });
    } else if (isOpen) {
      setFormData({
        name: "",
        short_code: "",
        location: "",
        venue_name: "",
        country: "",
        state: "",
        organizer_details: {
          name: "",
          email: "",
          phone: "",
          website: ""
        },
        start_date: "",
        end_date: "",
        timezone: globalTimezone,
        status: "draft",
        speaker_settings: { enabled: true, window_required: true },
        registration_settings: { enabled: true, registration_allowed: true, participants_list_allowed: true },
      });
    }
  }, [eventToEdit, isOpen, globalTimezone]);

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
            className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[200]"
          />

          {/* Dialog Container */}
          <div className="fixed inset-0 flex items-center justify-center z-[210] pointer-events-none p-4 md:p-8">
            <motion.div
              initial={{ scale: 0.95, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 20 }}
              className="w-full max-w-5xl bg-[var(--card)] rounded-[3rem] border border-[var(--border)] shadow-2xl pointer-events-auto flex flex-col h-full max-h-[95vh] overflow-hidden text-[var(--text)]"
            >
              {/* Header */}
              <div className="p-8 border-b border-[var(--border)] bg-[var(--surf)] flex-shrink-0">
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
                  <button onClick={onClose} className="h-10 w-10 rounded-full border border-[var(--border)] flex items-center justify-center text-muted hover:text-[var(--text)] transition-all hover:rotate-90">
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
                      className="h-12 bg-[var(--surf)] border-[var(--border)] pl-12 text-[13px] font-bold text-[var(--text)]"
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
                        className="h-12 bg-[var(--surf)] border-[var(--border)] pl-12 text-[13px] font-bold text-[var(--text)] font-mono"
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="text-[9px] font-black text-muted uppercase tracking-widest ml-1">Venue Center Name</label>
                    <div className="relative">
                      <Sparkles className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted" />
                      <Input
                        value={formData.venue_name}
                        onChange={e => setFormData({ ...formData, venue_name: e.target.value })}
                        placeholder="e.g. Grand Plaza Hotel"
                        className="h-12 bg-[var(--surf)] border-[var(--border)] pl-12 text-[13px] font-bold text-[var(--text)]"
                      />
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-6">
                  <div className="space-y-2">
                    <label className="text-[9px] font-black text-muted uppercase tracking-widest ml-1">Country</label>
                    <div className="relative">
                      <Globe className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted pointer-events-none" />
                      <select
                        value={formData.country}
                        onChange={e => setFormData({ ...formData, country: e.target.value, state: "" })}
                        className="w-full h-12 bg-[var(--surf)] border border-[var(--border)] pl-12 pr-4 text-[13px] font-bold text-[var(--text)] rounded-xl outline-none focus:border-[var(--pri)]/50 transition-all appearance-none"
                      >
                        <option value="" disabled className="bg-[var(--base)] text-muted">Select Country</option>
                        {countryStates.map(c => (
                          <option key={c.country} value={c.country} className="bg-[var(--base)] text-[var(--text)]">{c.country}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="text-[9px] font-black text-muted uppercase tracking-widest ml-1">State / Province</label>
                    <div className="relative">
                      <MapPin className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted pointer-events-none" />
                      <select
                        value={formData.state}
                        onChange={e => setFormData({ ...formData, state: e.target.value })}
                        disabled={!formData.country}
                        className="w-full h-12 bg-[var(--surf)] border border-[var(--border)] pl-12 pr-4 text-[13px] font-bold text-[var(--text)] rounded-xl outline-none focus:border-[var(--pri)]/50 transition-all appearance-none disabled:opacity-50"
                      >
                        <option value="" className="bg-[var(--base)] text-muted">Select State</option>
                        {getStatesForCountry(countryStates, formData.country).map(s => (
                          <option key={s} value={s} className="bg-[var(--base)] text-[var(--text)]">{s}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="text-[9px] font-black text-muted uppercase tracking-widest ml-1">Street / City Details</label>
                    <div className="relative">
                      <MapPin className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted" />
                      <Input
                        value={formData.location}
                        onChange={e => setFormData({ ...formData, location: e.target.value })}
                        placeholder="e.g. 5th Avenue, California"
                        className="h-12 bg-[var(--surf)] border-[var(--border)] pl-12 text-[13px] font-bold text-[var(--text)]"
                      />
                    </div>
                  </div>
                </div>

                {/* Organizer Contact Info */}
                <div className="bg-[var(--raised)] p-6 rounded-[2rem] border border-[var(--border)] space-y-6">
                  <div>
                    <h4 className="text-[12px] font-black text-[var(--text)] uppercase tracking-wider">Organizer Contact Info</h4>
                    <p className="text-muted text-[10px] font-bold uppercase tracking-widest mt-0.5">Specify organizer details and public contact channels.</p>
                  </div>

                  <div className="grid grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <label className="text-[9px] font-black text-muted uppercase tracking-widest ml-1">Organizer Name</label>
                      <div className="relative">
                        <Users className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted" />
                        <Input
                          value={formData.organizer_details.name}
                          onChange={e => setFormData({
                            ...formData,
                            organizer_details: { ...formData.organizer_details, name: e.target.value }
                          })}
                          placeholder="e.g. Tech Solutions Inc."
                          className="h-12 bg-[var(--surf)] border-[var(--border)] pl-12 text-[13px] font-bold text-[var(--text)]"
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <label className="text-[9px] font-black text-muted uppercase tracking-widest ml-1">Organizer Email</label>
                      <div className="relative">
                        <Mail className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted" />
                        <Input
                          type="email"
                          value={formData.organizer_details.email}
                          onChange={e => setFormData({
                            ...formData,
                            organizer_details: { ...formData.organizer_details, email: e.target.value }
                          })}
                          placeholder="org@example.com"
                          className="h-12 bg-[var(--surf)] border-[var(--border)] pl-12 text-[13px] font-bold text-[var(--text)]"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <label className="text-[9px] font-black text-muted uppercase tracking-widest ml-1">Organizer Phone</label>
                      <div className="relative">
                        <Phone className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted" />
                        <Input
                          value={formData.organizer_details.phone}
                          onChange={e => setFormData({
                            ...formData,
                            organizer_details: { ...formData.organizer_details, phone: e.target.value }
                          })}
                          placeholder="+1 555 1234"
                          className="h-12 bg-[var(--surf)] border-[var(--border)] pl-12 text-[13px] font-bold text-[var(--text)]"
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <label className="text-[9px] font-black text-muted uppercase tracking-widest ml-1">Organizer Website</label>
                      <div className="relative">
                        <Globe className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted" />
                        <Input
                          value={formData.organizer_details.website}
                          onChange={e => setFormData({
                            ...formData,
                            organizer_details: { ...formData.organizer_details, website: e.target.value }
                          })}
                          placeholder="www.organizer.com"
                          className="h-12 bg-[var(--surf)] border-[var(--border)] pl-12 text-[13px] font-bold text-[var(--text)]"
                        />
                      </div>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-6">
                  <div className="space-y-2">
                    <label className="text-[9px] font-black text-muted uppercase tracking-widest ml-1">Start Date *</label>
                    <div className="relative">
                      <Calendar className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted" />
                      <Input
                        required
                        type="date"
                        value={formData.start_date}
                        onChange={e => setFormData({ ...formData, start_date: e.target.value })}
                        className="h-12 bg-[var(--surf)] border-[var(--border)] pl-12 text-[13px] font-bold text-[var(--text)] [color-scheme:dark]"
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
                        className="h-12 bg-[var(--surf)] border-[var(--border)] pl-12 text-[13px] font-bold text-[var(--text)] [color-scheme:dark]"
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="text-[9px] font-black text-muted uppercase tracking-widest ml-1">Event Timezone *</label>
                    <div className="relative">
                      <Globe className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted pointer-events-none" />
                      <select
                        required
                        value={formData.timezone}
                        onChange={e => setFormData({ ...formData, timezone: e.target.value })}
                        className="w-full h-12 bg-[var(--surf)] border border-[var(--border)] pl-12 pr-4 text-[13px] font-bold text-[var(--text)] rounded-xl outline-none focus:border-[var(--pri)]/50 transition-all cursor-pointer"
                      >
                        <option value="Asia/Kolkata">Asia/Kolkata (IST - UTC+05:30)</option>
                        <option value="UTC">UTC (Coordinated Universal Time - UTC+00:00)</option>
                        <option value="America/New_York">America/New_York (EST/EDT - UTC-05:00/04:00)</option>
                        <option value="America/Chicago">America/Chicago (CST/CDT - UTC-06:00/05:00)</option>
                        <option value="America/Denver">America/Denver (MST/MDT - UTC-07:00/06:00)</option>
                        <option value="America/Los_Angeles">America/Los_Angeles (PST/PDT - UTC-08:00/07:00)</option>
                        <option value="Europe/London">Europe/London (GMT/BST - UTC+00:00/01:00)</option>
                        <option value="Europe/Paris">Europe/Paris (CET/CEST - UTC+01:00/02:00)</option>
                        <option value="Asia/Singapore">Asia/Singapore (SGT - UTC+08:00)</option>
                        <option value="Asia/Tokyo">Asia/Tokyo (JST - UTC+09:00)</option>
                      </select>
                    </div>
                  </div>
                </div>

                {/* Event Features / Modes Switches */}
                <div className="bg-[var(--raised)] p-6 rounded-[2rem] border border-[var(--border)] space-y-6">
                  <div>
                    <h4 className="text-[12px] font-black text-[var(--text)] uppercase tracking-wider">Event Features & Modes</h4>
                    <p className="text-muted text-[10px] font-bold uppercase tracking-widest mt-0.5">Enable the modules required for this conference. At least one must be active.</p>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="flex items-center justify-between p-5 rounded-2xl bg-[var(--surf)] border border-[var(--border)] hover:border-[var(--pri)]/20 transition-all gap-4">
                      <div className="space-y-1">
                        <Label className="text-[12px] font-black text-[var(--text)] leading-none cursor-pointer" htmlFor="switch-speaker">Speaker Presentation Desk</Label>
                        <p className="text-muted text-[9px] font-bold uppercase tracking-wider leading-normal">Manage schedule, speakers, files & eposters</p>
                      </div>
                      <Switch
                        id="switch-speaker"
                        checked={formData.speaker_settings.enabled}
                        onCheckedChange={(checked) => {
                          if (!checked && !formData.registration_settings.enabled) return;
                          setFormData({ ...formData, speaker_settings: { ...formData.speaker_settings, enabled: checked } });
                        }}
                      />
                    </div>

                    <div className="flex items-center justify-between p-5 rounded-2xl bg-[var(--surf)] border border-[var(--border)] hover:border-[var(--sec)]/20 transition-all gap-4">
                      <div className="space-y-1">
                        <Label className="text-[12px] font-black text-[var(--text)] leading-none cursor-pointer" htmlFor="switch-registration">On-Site Registration & Badges</Label>
                        <p className="text-muted text-[9px] font-bold uppercase tracking-wider leading-normal">Manage registrations, checkins & dynamic badge printing</p>
                      </div>
                      <Switch
                        id="switch-registration"
                        checked={formData.registration_settings.enabled}
                        onCheckedChange={(checked) => {
                          if (!checked && !formData.speaker_settings.enabled) return;
                          setFormData({ ...formData, registration_settings: { ...formData.registration_settings, enabled: checked } });
                        }}
                      />
                    </div>
                  </div>
                </div>
              </form>

              {/* Footer */}
              <div className="p-8 border-t border-[var(--border)] bg-[var(--surf)] flex gap-4">
                <Button onClick={onClose} variant="ghost" className="flex-1 h-14 rounded-2xl text-[11px] font-black uppercase tracking-widest text-muted">
                  Cancel
                </Button>
                <Button
                  disabled={loading}
                  onClick={handleSubmit}
                  className="flex-[2] h-14 rounded-2xl bg-[var(--pri)] hover:bg-[var(--sec)] text-[var(--primary-contrast)] font-black uppercase tracking-widest text-[11px] shadow-lg border-0"
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
