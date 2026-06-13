"use client";

import { useState, useMemo, useEffect } from "react";
import { motion, AnimatePresence, Reorder } from "framer-motion";
import { 
  X, Calendar, Clock, MapPin, Users, Presentation, 
  CheckCircle2, AlertCircle, Loader2, Info, Building2,
  Trash2, GripVertical, Save, Edit3
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { apiGet, apiPost, apiDelete, apiPatch } from "@/lib/api-client";
import { cn, toDateTimeLocalString, fromDateTimeLocalString, formatTimeInTZ, formatDateInTZ } from "@/lib/utils";
import { toast } from "sonner";
import { useEvent } from "@/hooks/useEvents";
import { useRooms } from "@/hooks/useRooms";
import { SESSION_CATEGORIES } from "@/types/models";

interface SessionDetailDialogProps {
  isOpen: boolean;
  onClose: () => void;
  sessionId: string;
  eventId: string;
}

export function SessionDetailDialog({ isOpen, onClose, sessionId, eventId }: SessionDetailDialogProps) {
  const [session, setSession] = useState<any>(null);
  const { data: event } = useEvent(eventId);
  const { data: rooms } = useRooms(eventId);
  const eventTZ = session?.event_timezone || event?.timezone || 'UTC';
// ...

  const [loading, setLoading] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [speakers, setSpeakers] = useState<any[]>([]);
  const [saving, setSaving] = useState(false);
  const [editData, setEditData] = useState({
    name: "",
    moderator_name: "",
    start_time: "",
    end_time: "",
    room_id: "",
    session_type: "regular"
  });

  const fetchSession = async () => {
    setLoading(true);
    try {
      const data = await apiGet<any>(`/events/${eventId}/sessions/${sessionId}`);
      setSession(data);
      const tz = data.event_timezone || 'UTC';
      setEditData({
        name: data.name,
        moderator_name: data.moderator_name || "",
        start_time: toDateTimeLocalString(data.start_time, tz),
        end_time: toDateTimeLocalString(data.end_time, tz),
        room_id: data.room_id || "",
        session_type: data.session_type || "regular"
      });
      // Initialize speakers state for reordering
      const sortedSpeakers = (data.session_speakers || []).sort((a: any, b: any) => {
        if (a.start_time && b.start_time) {
          return new Date(a.start_time).getTime() - new Date(b.start_time).getTime();
        }
        return a.talk_order - b.talk_order;
      });
      setSpeakers(sortedSpeakers);
    } catch (err) {
      console.error(err);
      toast.error("Failed to load session details");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen && sessionId) {
      fetchSession();
      setIsEditing(false);
    }
  }, [isOpen, sessionId, eventId]);

  // Recalculate talk times when reordering or session start time changes
  const recalculatedSpeakers = useMemo(() => {
    if (!editData.start_time) return speakers;
    let currentTime = new Date(fromDateTimeLocalString(editData.start_time, eventTZ));
    return speakers.map(s => {
      const duration = s.talk_duration_minutes || 20;
      const start = new Date(currentTime);
      const end = new Date(currentTime.getTime() + duration * 60000);
      currentTime = end;
      return { ...s, start_time: start.toISOString(), end_time: end.toISOString() };
    });
  }, [speakers, editData.start_time, eventTZ]);

  const handleSaveAll = async () => {
    setSaving(true);
    try {
      const tz = session?.event_timezone || 'UTC';
      // 1. Update session metadata
      await apiPatch(`/events/${eventId}/sessions/${sessionId}`, {
        name: editData.name,
        moderator_name: editData.moderator_name,
        start_time: fromDateTimeLocalString(editData.start_time, tz),
        end_time: fromDateTimeLocalString(editData.end_time, tz),
        room_id: editData.room_id || null,
        session_type: editData.session_type
      });

      // 2. Update speaker order (backend now recalculates times)
      await apiPost(`/events/${eventId}/sessions/${sessionId}/reorder-speakers`, {
        ordered_ids: speakers.map(s => s.id)
      });

      toast.success("Session updated successfully");
      setIsEditing(false);
      fetchSession();
    } catch (err) {
      toast.error("Failed to update session");
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteTalk = async (talkId: string) => {
    if (!confirm("Are you sure you want to remove this speaker from the session?")) return;
    try {
      await apiDelete(`/events/${eventId}/sessions/${sessionId}/speakers/${talkId}`);
      toast.success("Speaker removed");
      setSpeakers(prev => prev.filter(s => s.id !== talkId));
    } catch (err) {
      toast.error("Failed to remove speaker");
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          key="session-dialog-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="fixed inset-0 bg-[var(--base)]/80 backdrop-blur-md z-[200]"
        />
      )}
      {isOpen && (
        <div key="session-dialog-content-wrapper" className="fixed inset-0 flex items-center justify-center z-[210] pointer-events-none p-4">
          <motion.div
          initial={{ scale: 0.95, opacity: 0, y: 20 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.95, opacity: 0, y: 20 }}
          className="w-full max-w-3xl glass-3d rounded-[2.5rem] border-default shadow-2xl pointer-events-auto flex flex-col max-h-[90vh] overflow-hidden"
        >
          {loading ? (
            <div className="p-20 flex flex-col items-center justify-center gap-4">
              <Loader2 className="h-10 w-10 text-[var(--pri)] animate-spin" />
              <p className="text-[11px] font-black text-muted uppercase tracking-widest">Retrieving Session Core...</p>
            </div>
          ) : session ? (
            <>
              {/* Header */}
              <div className="p-8 border-b border-default flex-shrink-0 bg-gradient-to-br from-[var(--pri)]/5 to-transparent">
                <div className="flex items-start justify-between gap-6 mb-8">
                  <div className="flex items-center gap-5">
                    <div className="h-16 w-16 rounded-3xl bg-[var(--pri)]/10 border border-[var(--pri)]/20 flex items-center justify-center text-xl font-black text-[var(--pri)]">
                      {session.session_code}
                    </div>
                    <div className="flex-1">
                      {isEditing ? (
                        <input 
                          value={editData.name}
                          onChange={e => setEditData({...editData, name: e.target.value})}
                          className="text-2xl font-black text-[var(--text)] tracking-tight leading-tight bg-transparent border-b border-[var(--pri)]/30 outline-none w-full"
                        />
                      ) : (
                        <h3 className="text-2xl font-black text-[var(--text)] tracking-tight leading-tight">
                          {session.name}
                        </h3>
                      )}
                      <div className="flex items-center gap-3 mt-2">
                        <Badge className="bg-[var(--pri)]/10 text-[var(--pri)] border-0 font-black text-[9px] uppercase tracking-widest px-3">
                          {session.session_type}
                        </Badge>
                        <Badge className={cn(
                          "border-0 font-black text-[9px] uppercase tracking-widest px-3",
                          session.status === 'scheduled' ? "bg-[var(--success)]/10 text-[var(--success)]" : "bg-[var(--warn)]/10 text-[var(--warn)]"
                        )}>
                          {session.status}
                        </Badge>
                      </div>
                    </div>
                  </div>
                  <button 
                    onClick={onClose}
                    className="h-10 w-10 rounded-full border border-default flex items-center justify-center text-muted hover:text-[var(--text)] transition-all bg-[var(--base)]/50"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                  <div className="flex items-center gap-3">
                    <div className="h-9 w-9 rounded-xl bg-[color-mix(in_srgb,var(--text)_5%,transparent)] flex items-center justify-center text-muted">
                      <Calendar className="h-4 w-4" />
                    </div>
                    <div>
                      <p className="text-[9px] font-black text-muted uppercase tracking-widest">Date</p>
                      <p className="text-[12px] font-bold text-[var(--text)]">
                        {formatDateInTZ(session.start_time, eventTZ)}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="h-9 w-9 rounded-xl bg-[color-mix(in_srgb,var(--text)_5%,transparent)] flex items-center justify-center text-muted">
                      <Clock className="h-4 w-4" />
                    </div>
                    {isEditing ? (
                      <div className="flex flex-col gap-1">
                        <input 
                          type="datetime-local"
                          value={editData.start_time}
                          onChange={e => setEditData({...editData, start_time: e.target.value})}
                          className="bg-transparent text-[10px] font-bold text-[var(--text)] outline-none border-b border-default"
                        />
                        <input 
                          type="datetime-local"
                          value={editData.end_time}
                          onChange={e => setEditData({...editData, end_time: e.target.value})}
                          className="bg-transparent text-[10px] font-bold text-[var(--text)] outline-none border-b border-default"
                        />
                      </div>
                    ) : (
                      <div>
                        <p className="text-[9px] font-black text-muted uppercase tracking-widest">Time Slot</p>
                        <p className="text-[12px] font-bold text-[var(--text)]">
                          {formatTimeInTZ(session.start_time, eventTZ)} – {formatTimeInTZ(session.end_time, eventTZ)}
                        </p>
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="h-9 w-9 rounded-xl bg-[color-mix(in_srgb,var(--text)_5%,transparent)] flex items-center justify-center text-muted">
                      <MapPin className="h-4 w-4" />
                    </div>
                    <div>
                      <p className="text-[9px] font-black text-muted uppercase tracking-widest">Hall / Room</p>
                      {isEditing ? (
                        <select 
                          value={editData.room_id}
                          onChange={e => setEditData({...editData, room_id: e.target.value})}
                          className="bg-transparent text-[11px] font-bold text-[var(--text)] outline-none border-b border-default w-full py-1"
                        >
                          <option value="">Unassigned</option>
                          {rooms?.map((r: any) => (
                            <option key={r.id} value={r.id}>{r.name}</option>
                          ))}
                        </select>
                      ) : (
                        <p className="text-[12px] font-bold text-[var(--text)]">{session.room_name || "TBD"}</p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="h-9 w-9 rounded-xl bg-[color-mix(in_srgb,var(--text)_5%,transparent)] flex items-center justify-center text-muted">
                      <Presentation className="h-4 w-4" />
                    </div>
                    <div>
                      <p className="text-[9px] font-black text-muted uppercase tracking-widest">Session Type</p>
                      {isEditing ? (
                        <select 
                          value={editData.session_type}
                          onChange={e => setEditData({...editData, session_type: e.target.value as any})}
                          className="bg-transparent text-[11px] font-bold text-[var(--text)] outline-none border-b border-default w-full py-1 cursor-pointer"
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
                      ) : (
                        <p className="text-[12px] font-bold text-[var(--text)] uppercase tracking-wider">{session.session_type}</p>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Body */}
              <div className="flex-1 overflow-y-auto p-8 no-scrollbar space-y-10">
                {/* Speaker Roster */}
                <section>
                  <div className="flex items-center justify-between mb-6">
                    <h4 className="text-[10px] font-black text-muted uppercase tracking-[0.2em] flex items-center gap-2">
                      <Users className="h-3 w-3" /> Presentation Roster
                    </h4>
                    <span className="text-[10px] font-black text-[var(--pri)] uppercase tracking-widest">
                      {speakers.length + (session.posters?.length || 0)} Slots
                    </span>
                  </div>
                  
                  {isEditing ? (
                    <Reorder.Group axis="y" values={speakers} onReorder={setSpeakers} className="space-y-4">
                      {recalculatedSpeakers.map((talk: any, idx: number) => (
                        <Reorder.Item 
                          value={speakers.find(s => s.id === talk.id)} 
                          key={talk.id || `reorder-${idx}`} 
                          className="group relative flex items-center gap-6 p-6 rounded-[1.8rem] bg-[color-mix(in_srgb,var(--text)_2%,transparent)] border border-default hover:border-[var(--pri)]/30 transition-all overflow-hidden cursor-grab active:cursor-grabbing"
                        >
                          <div className="h-10 w-10 flex items-center justify-center text-muted">
                            <GripVertical className="h-5 w-5" />
                          </div>

                          <div className="h-12 w-12 rounded-full bg-gradient-to-br from-[var(--pri)]/20 to-[var(--sec)]/20 border-2 border-[var(--base)] flex items-center justify-center text-sm font-black text-[var(--text)] shrink-0 shadow-sm">
                            {talk.speaker_first_name?.[0]}{talk.speaker_last_name?.[0]}
                          </div>
                          
                          <div className="min-w-0 flex-1">
                            <p className="text-[14px] font-black text-[var(--text)] tracking-tight">
                              {talk.speaker_first_name} {talk.speaker_last_name}
                            </p>
                            <div className="flex items-center gap-3 mt-1">
                              <span className="text-[10px] font-black text-[var(--pri)] uppercase tracking-widest">
                                {formatTimeInTZ(talk.start_time, eventTZ)} - {formatTimeInTZ(talk.end_time, eventTZ)}
                              </span>
                              <span className="text-[10px] font-bold text-muted uppercase">({talk.talk_duration_minutes || 20} min)</span>
                            </div>
                          </div>

                          <button 
                            onClick={() => handleDeleteTalk(talk.id)}
                            className="h-10 w-10 rounded-xl bg-red-500/10 text-red-500 flex items-center justify-center hover:bg-red-500 hover:text-white transition-all"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </Reorder.Item>
                      ))}
                    </Reorder.Group>
                  ) : (
                    <div className="space-y-4">
                      {/* Regular Talks */}
                      {speakers.map((talk: any, idx: number) => (
                        <div 
                          key={talk.id || `talk-${idx}`} 
                          className="group relative flex gap-6 p-6 rounded-[1.8rem] bg-[color-mix(in_srgb,var(--text)_2%,transparent)] border border-default hover:border-[var(--pri)]/30 transition-all overflow-hidden"
                        >
                          <div className="absolute top-0 right-0 h-12 w-12 bg-[var(--pri)]/5 flex items-center justify-center text-[10px] font-black text-muted rounded-bl-3xl border-l border-b border-default group-hover:bg-[var(--pri)]/10 transition-all">
                            #{idx + 1}
                          </div>

                          <div className="h-12 w-12 rounded-full bg-gradient-to-br from-[var(--pri)]/20 to-[var(--sec)]/20 border-2 border-[var(--base)] flex items-center justify-center text-sm font-black text-[var(--text)] shrink-0 shadow-sm">
                            {talk.speaker_first_name?.[0]}{talk.speaker_last_name?.[0]}
                          </div>
                          
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-3 mb-1">
                              <p className="text-[14px] font-black text-[var(--text)] tracking-tight">
                                {talk.speaker_first_name} {talk.speaker_last_name}
                              </p>
                              {(talk.speaker_upload_status === 'approved' || talk.speaker_upload_status === 'uploaded' || talk.speaker_upload_status === 'valid' || talk.speaker_upload_status === 'pending_validation') && (
                                <CheckCircle2 className="h-3.5 w-3.5 text-[var(--success)]" />
                              )}
                            </div>
                            <h5 className="text-[12px] font-bold text-muted leading-snug mb-3">
                              {talk.presentation_title || "Untitled Presentation"}
                            </h5>
                            
                            <div className="flex flex-wrap items-center gap-4">
                              {talk.start_time && (
                                <div className="flex items-center gap-1.5 text-[9px] font-black text-[var(--pri)] uppercase tracking-widest">
                                  <Clock className="h-3 w-3" /> {formatTimeInTZ(talk.start_time, eventTZ)}
                                  {talk.end_time && ` - ${formatTimeInTZ(talk.end_time, eventTZ)}`}
                                </div>
                              )}
                              <div className="flex items-center gap-1.5 text-[9px] font-black text-muted uppercase tracking-widest">
                                <Clock className="h-3 w-3 text-muted" /> {talk.talk_duration_minutes || 20} Min
                              </div>
                              <div className="flex items-center gap-1.5 text-[9px] font-black text-muted uppercase tracking-widest">
                                <Presentation className="h-3 w-3 text-[var(--sec)]" /> 
                                <span className={cn(
                                  (talk.speaker_upload_status === 'approved' || talk.speaker_upload_status === 'uploaded' || talk.speaker_upload_status === 'valid' || talk.speaker_upload_status === 'pending_validation') ? "text-[var(--success)]" : "text-[var(--warn)]"
                                )}>
                                  {talk.speaker_upload_status?.toUpperCase() || "PENDING"}
                                </span>
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}

                      {/* ePosters */}
                      {session.posters?.map((poster: any, idx: number) => (
                        <div 
                          key={poster.id} 
                          className="group relative flex gap-6 p-6 rounded-[1.8rem] bg-[color-mix(in_srgb,var(--sec)]/5,transparent)] border border-dashed border-[var(--sec)]/30 hover:border-[var(--sec)] transition-all overflow-hidden"
                        >
                          <div className="absolute top-0 right-0 h-12 w-12 bg-[var(--sec)]/5 flex items-center justify-center text-[10px] font-black text-[var(--sec)] rounded-bl-3xl border-l border-b border-[var(--sec)]/20">
                            EP
                          </div>

                          <div className="h-12 w-12 rounded-full bg-gradient-to-br from-[var(--sec)]/20 to-[var(--pri)]/20 border-2 border-[var(--base)] flex items-center justify-center text-sm font-black text-[var(--sec)] shrink-0 shadow-sm">
                            P
                          </div>
                          
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-3 mb-1">
                              <p className="text-[14px] font-black text-[var(--text)] tracking-tight">
                                {poster.title}
                              </p>
                              {poster.status === 'approved' && (
                                <CheckCircle2 className="h-3.5 w-3.5 text-[var(--success)]" />
                              )}
                            </div>
                            <h5 className="text-[12px] font-bold text-muted leading-snug mb-3 uppercase tracking-widest">
                              {poster.category || "General Poster"}
                            </h5>
                            
                            <div className="flex flex-wrap items-center gap-4">
                              <div className="flex items-center gap-1.5 text-[9px] font-black text-[var(--sec)] uppercase tracking-widest">
                                <Badge variant="outline" className="text-[8px] border-[var(--sec)]/30 text-[var(--sec)]">E-POSTER</Badge>
                              </div>
                              <div className="flex items-center gap-1.5 text-[9px] font-black text-muted uppercase tracking-widest">
                                <span className={cn(
                                  poster.status === 'approved' ? "text-[var(--success)]" : "text-[var(--warn)]"
                                )}>
                                  {poster.status?.toUpperCase() || "PENDING"}
                                </span>
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}

                      {speakers.length === 0 && (!session.posters || session.posters.length === 0) && (
                        <div className="text-center py-10 border-2 border-dashed border-default rounded-3xl">
                          <AlertCircle className="h-10 w-10 text-muted mx-auto mb-3 opacity-30" />
                          <p className="text-[11px] font-black text-muted uppercase tracking-widest">No presentations assigned to this session.</p>
                        </div>
                      )}
                    </div>
                  )}
                </section>
              </div>

              {/* Footer */}
              <div className="p-8 border-t border-default flex-shrink-0 flex items-center justify-between gap-4 bg-[color-mix(in_srgb,var(--base)_50%,transparent)] backdrop-blur-sm">
                <div className="flex items-center gap-6 flex-1">
                  <div className="flex flex-col w-full">
                    <span className="text-[9px] font-black text-muted uppercase tracking-widest">Moderator</span>
                    {isEditing ? (
                      <input 
                        value={editData.moderator_name}
                        onChange={e => setEditData({...editData, moderator_name: e.target.value})}
                        placeholder="Assign moderator..."
                        className="text-[11px] font-bold text-[var(--text)] bg-transparent border-b border-default outline-none w-full"
                      />
                    ) : (
                      <span className="text-[11px] font-bold text-[var(--text)]">{session.moderator_name || "Not Assigned"}</span>
                    )}
                  </div>
                </div>
                <div className="flex gap-3">
                  {isEditing ? (
                    <>
                      <Button 
                        variant="outline" 
                        onClick={() => setIsEditing(false)}
                        className="h-12 px-6 rounded-2xl border-default text-[10px] font-black uppercase tracking-widest"
                      >
                        Cancel
                      </Button>
                      <Button 
                        onClick={handleSaveAll}
                        disabled={saving}
                        className="h-12 px-8 rounded-2xl bg-[var(--pri)] text-[var(--text)] font-black uppercase tracking-widest text-[10px] border-0"
                      >
                        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />} Save Changes
                      </Button>
                    </>
                  ) : (
                    <Button 
                      onClick={() => setIsEditing(true)}
                      variant="outline" 
                      className="h-12 px-6 rounded-2xl border-default text-[10px] font-black uppercase tracking-widest"
                    >
                      <Edit3 className="mr-2 h-4 w-4" /> Edit Session
                    </Button>
                  )}
                </div>
              </div>
            </>
          ) : null}
        </motion.div>
      </div>
      )}
    </AnimatePresence>
  );
}
