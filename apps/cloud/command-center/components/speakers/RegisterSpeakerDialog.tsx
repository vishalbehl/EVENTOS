"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, UserPlus, Mail, Info, Check, Loader2, ListOrdered, Calendar, Clock, Presentation } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

import { useEmailTemplates } from "@/hooks/useEmails";
import { useSessions } from "@/hooks/useSessions";
import { usePosterCategories } from "@/hooks/usePosters";
import { apiPost } from "@/lib/api-client";
import { SPEAKER_TYPES } from "@/types/backend";

import { cn, formatDateInTZ, formatTimeInTZ } from "@/lib/utils";
import { toast } from "sonner";
import { useParams } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";

interface RegisterSpeakerDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

export function RegisterSpeakerDialog({ isOpen, onClose }: RegisterSpeakerDialogProps) {
  const { eventId } = useParams();
  const eventIdStr = eventId as string;
  const queryClient = useQueryClient();
  const { data: templates } = useEmailTemplates(eventIdStr);
  const { data: sessions } = useSessions(eventIdStr);

  const [mode, setMode] = useState<"manual" | "invite">("manual");
  const [loading, setLoading] = useState(false);

  // Form State
  const [formData, setFormData] = useState({
    first_name: "",
    last_name: "",
    email: "",
    phone: "",
    affiliation: "",
    country: "",
    template_id: "",
  });

  const [talks, setTalks] = useState<Array<{
    session_id: string;
    presentation_title: string;
    start_time: string;
    end_time: string;
    talk_duration_minutes: number;
    speaker_type: string;
    authors?: string;
    category?: string;
    abstract?: string;
    filter_date?: string;
    filter_hall?: string;
  }>>([]);


  const { data: categories } = usePosterCategories(eventIdStr);
  const [showCustomCategory, setShowCustomCategory] = useState<Record<number, boolean>>({});


  const addTalk = () => {

    setTalks([...talks, { 
      session_id: "", 
      presentation_title: "", 
      start_time: "", 
      end_time: "", 
      talk_duration_minutes: 0,
      speaker_type: "",
      authors: `${formData.first_name} ${formData.last_name}`.trim(),
      category: "",
      abstract: ""
    }]);
  };



  const removeTalk = (index: number) => {
    setTalks(talks.filter((_, i) => i !== index));
  };

  const calculateDuration = (start: string, end: string) => {
    if (!start || !end) return 0;
    try {
      const diff = new Date(end).getTime() - new Date(start).getTime();
      return Math.max(0, Math.round(diff / (1000 * 60)));
    } catch {
      return 0;
    }
  };


  const updateTalk = (index: number, field: string, value: any) => {
    const newTalks = [...talks];
    const talk = { ...newTalks[index], [field]: value };

    // Auto-update duration if times change
    if (field === 'start_time' || field === 'end_time') {
      talk.talk_duration_minutes = calculateDuration(talk.start_time, talk.end_time);
    }

    // Auto-fill from session if session_id changes
    if (field === 'session_id' && value) {
      const session = sessions?.find(s => s.id === value);
      if (session) {
        // Auto-fill times for all sessions to provide a starting point
        // Format as YYYY-MM-DDTHH:mm for local handling
        const sTime = session.start_time ? new Date(session.start_time) : null;
        const eTime = session.end_time ? new Date(session.end_time) : null;
        
        if (sTime) talk.start_time = sTime.toISOString().slice(0, 16);
        if (eTime) talk.end_time = eTime.toISOString().slice(0, 16);
        
        talk.talk_duration_minutes = calculateDuration(talk.start_time, talk.end_time);
      }
    }

    if (field === 'start_time_local' || field === 'end_time_local') {
      const session = sessions?.find(s => s.id === talk.session_id);
      if (session && session.start_time) {
        const datePart = new Date(session.start_time).toISOString().split('T')[0];
        const newFull = `${datePart}T${value}`;
        if (field === 'start_time_local') talk.start_time = newFull;
        else talk.end_time = newFull;
        talk.talk_duration_minutes = calculateDuration(talk.start_time, talk.end_time);
      }
    }

    // Auto-populate defaultDuration when speaker_type changes
    if (field === 'speaker_type' && value) {
      const typeConfig = SPEAKER_TYPES.find(t => t.code === value);
      if (typeConfig && (!talk.talk_duration_minutes || talk.talk_duration_minutes === 0)) {
        talk.talk_duration_minutes = typeConfig.defaultDuration;
      }
    }

    newTalks[index] = talk;
    setTalks(newTalks);
  };



  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await apiPost(`/events/${eventIdStr}/speakers/manual-register`, {
        ...formData,
        send_invite: mode === "invite",
        template_id: formData.template_id || null,
        phone: formData.phone || "",
        affiliation: formData.affiliation || "",
        country: formData.country || "",
        talks: talks.map(t => ({
          ...t,
          session_id: t.session_id || null,
          start_time: t.start_time ? new Date(t.start_time).toISOString() : null,
          end_time: t.end_time ? new Date(t.end_time).toISOString() : null,
        })).filter(t => t.session_id),
      });
      toast.success(mode === "manual" ? "Speaker registered successfully" : "Invitation sent successfully");
      queryClient.invalidateQueries({ queryKey: ["speakers", eventIdStr] });
      onClose();
      // Reset
      setFormData({
        first_name: "", last_name: "", email: "", phone: "", 
        affiliation: "", country: "", template_id: "",
      });
      setTalks([]);

    } catch (err: any) {
      const detail = err.response?.data?.detail;
      const msg = Array.isArray(detail) 
        ? detail.map((d: any) => d.msg).join(", ") 
        : typeof detail === 'string' ? detail : "Registration failed";
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

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
              className="w-full max-w-2xl glass-3d rounded-[2.5rem] border-default shadow-2xl pointer-events-auto flex flex-col max-h-[90vh] overflow-hidden relative"
            >
              <button 
                onClick={onClose}
                className="absolute top-8 right-8 h-10 w-10 rounded-full border border-default flex items-center justify-center text-muted hover:text-[var(--text)] transition-all z-10"
              >
                <X className="h-4 w-4" />
              </button>

              {/* Scrollable Form */}
              <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-8 space-y-8 no-scrollbar">
                {/* Integrated Header */}
                <div className="space-y-6">
                  <div className="flex items-center gap-4">
                    <div className="h-12 w-12 rounded-2xl bg-[var(--pri)]/10 flex items-center justify-center">
                      <UserPlus className="h-6 w-6 text-[var(--pri)]" />
                    </div>
                    <div>
                      <h3 className="text-xl font-black text-[var(--text)] tracking-tight">Register New Speaker</h3>
                      <p className="text-[11px] font-bold text-muted uppercase tracking-widest mt-0.5">Expansion of the academic core</p>
                    </div>
                  </div>

                  {/* Tabs Integrated */}
                  <div className="flex gap-1 p-1 glass-3d rounded-xl border-default max-w-sm">
                    <button
                      type="button"
                      onClick={() => setMode("manual")}
                      className={cn(
                        "flex-1 flex items-center justify-center gap-2 py-2 text-[10px] font-black uppercase tracking-widest rounded-lg transition-all",
                        mode === "manual" ? "bg-[var(--pri)] text-[var(--text)] shadow-md" : "text-muted hover:text-[var(--text)]"
                      )}
                    >
                      <Info className="h-3.5 w-3.5" /> Manual Entry
                    </button>
                    <button
                      type="button"
                      onClick={() => setMode("invite")}
                      className={cn(
                        "flex-1 flex items-center justify-center gap-2 py-2 text-[10px] font-black uppercase tracking-widest rounded-lg transition-all",
                        mode === "invite" ? "bg-[var(--pri)] text-[var(--text)] shadow-md" : "text-muted hover:text-[var(--text)]"
                      )}
                    >
                      <Mail className="h-3.5 w-3.5" /> Quick Invite
                    </button>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <label className="text-[9px] font-black text-muted uppercase tracking-widest ml-1">First Name *</label>
                    <Input 
                      required
                      value={formData.first_name}
                      onChange={e => setFormData({...formData, first_name: e.target.value})}
                      placeholder="e.g. Alan" 
                      className="h-12 glass-3d border-default focus:border-[var(--pri)]/50 px-5 text-[13px] font-bold" 
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[9px] font-black text-muted uppercase tracking-widest ml-1">Last Name *</label>
                    <Input 
                      required
                      value={formData.last_name}
                      onChange={e => setFormData({...formData, last_name: e.target.value})}
                      placeholder="e.g. Turing" 
                      className="h-12 glass-3d border-default focus:border-[var(--pri)]/50 px-5 text-[13px] font-bold" 
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-[9px] font-black text-muted uppercase tracking-widest ml-1">Email Address *</label>
                  <Input 
                    required
                    type="email"
                    value={formData.email}
                    onChange={e => setFormData({...formData, email: e.target.value})}
                    placeholder="turing@enigma.org" 
                    className="h-12 glass-3d border-default focus:border-[var(--pri)]/50 px-5 text-[13px] font-bold" 
                  />
                </div>

                {mode === "manual" && (
                  <motion.div 
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="space-y-8"
                  >
                    <div className="grid grid-cols-2 gap-6">
                      <div className="space-y-2">
                        <label className="text-[9px] font-black text-muted uppercase tracking-widest ml-1">Phone *</label>
                        <Input 
                          required
                          value={formData.phone}
                          onChange={e => setFormData({...formData, phone: e.target.value})}
                          placeholder="+1 234 567 890" 
                          className="h-12 glass-3d border-default focus:border-[var(--pri)]/50 px-5 text-[13px] font-bold" 
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-[9px] font-black text-muted uppercase tracking-widest ml-1">Affiliation / Org *</label>
                        <Input 
                          required
                          value={formData.affiliation}
                          onChange={e => setFormData({...formData, affiliation: e.target.value})}
                          placeholder="Kings College, Cambridge" 
                          className="h-12 glass-3d border-default focus:border-[var(--pri)]/50 px-5 text-[13px] font-bold" 
                        />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <label className="text-[9px] font-black text-muted uppercase tracking-widest ml-1">Country *</label>
                      <Input 
                        required
                        value={formData.country}
                        onChange={e => setFormData({...formData, country: e.target.value})}
                        placeholder="e.g. United Kingdom" 
                        className="h-12 glass-3d border-default focus:border-[var(--pri)]/50 px-5 text-[13px] font-bold" 
                      />
                    </div>

                    <div className="space-y-6">
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-3">
                          <ListOrdered className="h-4 w-4 text-[var(--pri)]" />
                          <h4 className="text-[12px] font-black text-[var(--text)] uppercase tracking-tighter">Talk Assignments</h4>
                        </div>
                        <Button 
                          type="button"
                          onClick={addTalk}
                          className="h-9 px-6 rounded-xl bg-[var(--pri)] text-white hover:bg-[var(--sec)] border-0 text-[11px] font-black uppercase tracking-widest shadow-lg transition-all active:scale-95"
                        >
                          Add
                        </Button>


                      </div>

                      <div className="space-y-4">
                        {talks.map((talk, idx) => {
                          const selectedSession = sessions?.find(s => s.id === talk.session_id);
                          const isEposter = selectedSession?.session_type === 'poster' || selectedSession?.session_type === 'eposter';

                          return (
                            <div key={idx} className="p-6 rounded-[1.5rem] bg-[var(--pri)]/5 border border-[var(--pri)]/20 space-y-5 relative group/talk">
                              <button 
                                type="button"
                                onClick={() => removeTalk(idx)}
                                className="absolute top-4 right-4 h-7 w-7 rounded-full bg-[var(--dan)]/10 text-[var(--dan)] flex items-center justify-center opacity-0 group-hover/talk:opacity-100 transition-all hover:bg-[var(--dan)]"
                              >
                                <X className="h-3.5 w-3.5" />
                              </button>

                                <div className="grid grid-cols-2 gap-3 mb-1 animate-in fade-in slide-in-from-top-1">
                                  <div className="space-y-1">
                                    <label className="text-[8px] font-black text-muted/60 uppercase tracking-widest ml-1">Filter by Date</label>
                                    <select 
                                      value={talk.filter_date || ""}
                                      onChange={e => updateTalk(idx, 'filter_date', e.target.value)}
                                      className="w-full h-9 glass-3d border-default rounded-lg px-3 text-[11px] font-bold text-muted appearance-none focus:outline-none focus:border-[var(--pri)]/50"
                                    >
                                      <option value="">All Dates</option>
                                      {Array.from(new Set(sessions?.map(s => s.start_time.split('T')[0]))).sort().map(d => (
                                        <option key={d} value={d}>{new Date(d).toLocaleDateString('en-IN', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'Asia/Kolkata' })}</option>
                                      ))}
                                    </select>
                                  </div>
                                  <div className="space-y-1">
                                    <label className="text-[8px] font-black text-muted/60 uppercase tracking-widest ml-1">Filter by Hall</label>
                                    <select 
                                      value={talk.filter_hall || ""}
                                      onChange={e => updateTalk(idx, 'filter_hall', e.target.value)}
                                      className="w-full h-9 glass-3d border-default rounded-lg px-3 text-[11px] font-bold text-muted appearance-none focus:outline-none focus:border-[var(--pri)]/50"
                                    >
                                      <option value="">All Halls</option>
                                      {Array.from(new Set(sessions?.map(s => s.room_name).filter(Boolean))).sort().map(h => (
                                        <option key={h} value={h}>{h}</option>
                                      ))}
                                    </select>
                                  </div>
                                </div>

                                <div className="space-y-2">
                                  <div className="flex items-center justify-between">
                                    <label className="text-[9px] font-black text-muted uppercase tracking-widest ml-1">Target Session</label>
                                    {selectedSession && (
                                      <span className="text-[9px] font-bold text-[var(--pri)] uppercase tracking-tight mr-1">
                                        Session Time: {formatTimeInTZ(selectedSession.start_time, selectedSession.event_timezone || "UTC")} - {formatTimeInTZ(selectedSession.end_time, selectedSession.event_timezone || "UTC")}
                                      </span>
                                    )}
                                  </div>
                                  <select 
                                    value={talk.session_id}
                                    onChange={e => updateTalk(idx, 'session_id', e.target.value)}
                                    className="w-full h-12 glass-3d border-default rounded-xl px-4 text-[13px] font-bold text-[var(--text)] appearance-none focus:outline-none focus:border-[var(--pri)]/50"
                                  >
                                    <option value="">Select a Session...</option>
                                    {sessions?.filter(s => {
                                      if (talk.filter_date && !s.start_time.startsWith(talk.filter_date)) return false;
                                      if (talk.filter_hall && s.room_name !== talk.filter_hall) return false;
                                      return true;
                                    }).map(s => <option key={s.id} value={s.id}>[{s.session_code}] {s.name}</option>)}
                                  </select>
                                </div>

                                <div className="space-y-2">
                                  <label className="text-[9px] font-black text-muted uppercase tracking-widest ml-1">Speaker Type / Role</label>
                                  <select 
                                    value={talk.speaker_type || ""}
                                    onChange={e => updateTalk(idx, 'speaker_type', e.target.value)}
                                    className="w-full h-12 glass-3d border-default rounded-xl px-4 text-[13px] font-bold text-[var(--text)] appearance-none focus:outline-none focus:border-[var(--pri)]/50"
                                  >
                                    <option value="">Select Speaker Type...</option>
                                    {SPEAKER_TYPES.map(t => (
                                      <option key={t.code} value={t.code}>{t.label}</option>
                                    ))}
                                  </select>
                                  {talk.speaker_type && SPEAKER_TYPES.find(t => t.code === talk.speaker_type)?.uploadRequired === false && (
                                    <p className="text-[10px] text-muted flex items-center gap-1.5 mt-1 font-bold">
                                      <Info className="h-3.5 w-3.5 text-[var(--pri)]" />
                                      This speaker type does not require a file upload.
                                    </p>
                                  )}
                                </div>



                              <div className="space-y-2">
                                <label className="text-[9px] font-black text-muted uppercase tracking-widest ml-1">Presentation Topic</label>
                                <Input 
                                  value={talk.presentation_title}
                                  onChange={e => updateTalk(idx, 'presentation_title', e.target.value)}
                                  placeholder="e.g. On Computable Numbers..." 
                                  className="h-12 glass-3d border-default focus:border-[var(--pri)]/50 px-5 text-[13px] font-bold" 
                                />
                              </div>

                              {!isEposter ? (
                                <div className="p-5 rounded-2xl bg-[var(--pri)]/5 border border-[var(--pri)]/20 animate-in fade-in slide-in-from-bottom-2 space-y-4">
                                  <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                      <div className="h-8 w-8 rounded-lg bg-[var(--pri)]/10 flex items-center justify-center">
                                        <Presentation className="h-4 w-4 text-[var(--pri)]" />
                                      </div>
                                      <div>
                                        <p className="text-[10px] font-black text-[var(--pri)] uppercase tracking-widest">Oral Presentation Slot</p>
                                        <p className="text-[11px] font-bold text-muted">Adjust specific timings for this speaker</p>
                                      </div>
                                    </div>
                                    <Badge variant="outline" className="text-[9px] font-black border-default bg-white text-[var(--pri)] px-3">
                                      {talk.talk_duration_minutes} Min
                                    </Badge>
                                  </div>

                                  <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-1.5">
                                      <label className="text-[9px] font-black text-muted uppercase tracking-widest ml-1">Slot Start</label>
                                      <div className="relative">
                                        <Clock className="absolute left-3.5 top-1/2 -translate-y-1/2 h-3 w-3 text-muted" />
                                        <Input 
                                          type="time"
                                          value={talk.start_time ? talk.start_time.split('T')[1]?.slice(0, 5) : ""}
                                          onChange={e => updateTalk(idx, 'start_time_local', e.target.value)}
                                          className="h-10 glass-3d border-default pl-10 text-[12px] font-bold rounded-xl focus:border-[var(--pri)]/50" 
                                        />
                                      </div>
                                    </div>
                                    <div className="space-y-1.5">
                                      <label className="text-[9px] font-black text-muted uppercase tracking-widest ml-1">Slot End</label>
                                      <div className="relative">
                                        <Clock className="absolute left-3.5 top-1/2 -translate-y-1/2 h-3 w-3 text-muted" />
                                        <Input 
                                          type="time"
                                          value={talk.end_time ? talk.end_time.split('T')[1]?.slice(0, 5) : ""}
                                          onChange={e => updateTalk(idx, 'end_time_local', e.target.value)}
                                          className="h-10 glass-3d border-default pl-10 text-[12px] font-bold rounded-xl focus:border-[var(--pri)]/50" 
                                        />
                                      </div>
                                    </div>
                                  </div>
                                  <div className="pt-2 border-t border-[var(--pri)]/10">
                                    <p className="text-[10px] font-bold text-muted flex items-center gap-2">
                                      <Calendar className="h-3 w-3" />
                                      Session Date: {formatDateInTZ(selectedSession?.start_time || "", selectedSession?.event_timezone || "UTC")}
                                    </p>
                                  </div>

                                </div>
                              ) : (
                                <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2">

                                  <div className="p-5 rounded-2xl bg-[var(--sec)]/5 border border-[var(--sec)]/20 space-y-4">
                                    <div className="flex items-center gap-3">
                                      <div className="h-8 w-8 rounded-lg bg-[var(--sec)]/10 flex items-center justify-center">
                                        <Clock className="h-4 w-4 text-[var(--sec)]" />
                                      </div>
                                      <div>
                                        <p className="text-[10px] font-black text-[var(--sec)] uppercase tracking-widest">ePoster Session Detected</p>
                                        <p className="text-[11px] font-bold text-muted">Inheriting timings from session: {formatDateInTZ(selectedSession?.start_time || "", selectedSession?.event_timezone || "UTC")} {formatTimeInTZ(selectedSession?.start_time || "", selectedSession?.event_timezone || "UTC")}</p>
                                      </div>
                                    </div>

                                    <div className="space-y-4 pt-2">
                                      <div className="space-y-2">
                                        <label className="text-[9px] font-black text-muted uppercase tracking-widest ml-1">Author(s) *</label>
                                        <Input 
                                          value={talk.authors}
                                          onChange={e => updateTalk(idx, 'authors', e.target.value)}
                                          placeholder="e.g. Alan Turing, Joan Clarke" 
                                          className="h-10 glass-3d border-default px-4 text-[12px] font-bold rounded-xl focus:border-[var(--pri)]/50" 
                                        />
                                      </div>

                                      <div className="space-y-2">
                                        <label className="text-[9px] font-black text-muted uppercase tracking-widest ml-1">Category / Theme</label>
                                        <div className="relative">
                                          <select 
                                            value={showCustomCategory[idx] ? "custom" : talk.category}
                                            onChange={e => {
                                              const val = e.target.value;
                                              if (val === "custom") {
                                                setShowCustomCategory({ ...showCustomCategory, [idx]: true });
                                                updateTalk(idx, 'category', "");
                                              } else {
                                                setShowCustomCategory({ ...showCustomCategory, [idx]: false });
                                                updateTalk(idx, 'category', val);
                                              }
                                            }}
                                            className="w-full h-12 glass-3d border-default rounded-xl px-4 text-[13px] font-bold text-[var(--text)] appearance-none focus:outline-none focus:border-[var(--pri)]/50"
                                          >
                                            <option value="">Select Category...</option>
                                            {categories?.map(c => <option key={c} value={c}>{c}</option>)}
                                            <option value="custom">+ Enter Custom Category...</option>
                                          </select>
                                          <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none">
                                            <ListOrdered className="h-3 w-3 text-muted" />
                                          </div>
                                        </div>

                                        {(showCustomCategory[idx] || (categories?.length === 0 && !talk.category)) ? (
                                          <motion.div 
                                            initial={{ opacity: 0, y: -10 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            className="pt-2"
                                          >
                                            <Input 
                                              value={talk.category}
                                              onChange={e => updateTalk(idx, 'category', e.target.value)}
                                              placeholder="Type new category name..." 
                                              className="h-10 glass-3d border-default px-4 text-[12px] font-bold rounded-xl focus:border-[var(--pri)]/50" 
                                            />
                                          </motion.div>
                                        ) : null}

                                      </div>


                                      <div className="space-y-2">
                                        <label className="text-[9px] font-black text-muted uppercase tracking-widest ml-1">Abstract / Summary</label>
                                        <textarea 
                                          value={talk.abstract}
                                          onChange={e => updateTalk(idx, 'abstract', e.target.value)}
                                          placeholder="Enter a brief summary of the poster content..." 
                                          className="w-full min-h-[100px] glass-3d border border-default rounded-2xl p-4 text-[12px] font-bold focus:outline-none focus:border-[var(--pri)]/50 resize-none no-scrollbar shadow-inner"
                                        />
                                      </div>
                                    </div>
                                  </div>
                                </div>

                              )}
                            </div>
                          );
                        })}
                        
                        {talks.length === 0 && (
                          <div className="text-center p-8 border-2 border-dashed border-default rounded-3xl opacity-50">
                            <p className="text-[11px] font-bold text-muted">No talks assigned yet. Add one if known.</p>
                          </div>
                        )}
                      </div>
                    </div>

                  </motion.div>
                )}

                {mode === "invite" && (
                  <motion.div 
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="p-6 rounded-[1.5rem] bg-[var(--pri)]/5 border border-[var(--pri)]/20 space-y-4"
                  >
                    <div className="flex items-center gap-3 mb-2">
                      <Mail className="h-4 w-4 text-[var(--pri)]" />
                      <h4 className="text-[12px] font-black text-[var(--text)] uppercase tracking-tighter">Automatic Invitation</h4>
                    </div>
                    <p className="text-[11px] text-muted font-bold leading-relaxed">
                      We will immediately send an email with the speaker portal link and QR code. 
                      The speaker can fill in their own bio and upload files later.
                    </p>
                    <div className="space-y-2">
                      <label className="text-[9px] font-black text-muted uppercase tracking-widest ml-1">Invite Template</label>
                      <select 
                        required={mode === "invite"}
                        value={formData.template_id}
                        onChange={e => setFormData({...formData, template_id: e.target.value})}
                        className="w-full h-12 glass-3d border-default rounded-xl px-4 text-[13px] font-bold text-[var(--text)] appearance-none focus:outline-none focus:border-[var(--pri)]/50"
                      >
                        <option value="">Select Invite Template...</option>
                        {templates?.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                      </select>
                    </div>
                  </motion.div>
                )}
              </form>

              {/* Footer */}
              <div className="p-8 border-t border-default flex-shrink-0 bg-[color-mix(in_srgb,var(--base)_50%,transparent)] backdrop-blur-sm flex gap-4">
                <Button
                  onClick={onClose}
                  variant="ghost"
                  className="flex-1 h-14 rounded-2xl text-[11px] font-black uppercase tracking-widest text-muted hover:text-[var(--text)]"
                >
                  Cancel
                </Button>
                <Button
                  disabled={loading || talks.length === 0 || talks.some(t => !t.session_id)}
                  onClick={handleSubmit}
                  className="flex-[2] h-14 rounded-2xl bg-[var(--pri)] hover:bg-[var(--sec)] text-[var(--text)] font-black uppercase tracking-widest text-[11px] shadow-lg border-0 disabled:opacity-50 disabled:cursor-not-allowed"
                >

                  {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : mode === "manual" ? <Check className="h-4 w-4 mr-2" /> : <Mail className="h-4 w-4 mr-2" />}
                  {mode === "manual" ? "Finalize Registration" : "Send Quick Invite"}
                </Button>
              </div>
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  );
}
