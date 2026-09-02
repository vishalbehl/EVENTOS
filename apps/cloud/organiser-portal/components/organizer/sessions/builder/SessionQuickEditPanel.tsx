"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Trash2, Copy, Save, UserX, FileText, Settings, AlignLeft, GripVertical, Users, Loader2 } from "lucide-react";
import { useSessionBuilderStore, BuilderSession } from "@/store/useSessionBuilderStore";
import { useDuplicateSession, useRemoveSpeakerFromSession } from "@/hooks/useSessionBuilder";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { cn, toDateTimeLocalString, fromDateTimeLocalString } from "@/lib/utils";
import { apiPost, apiPatch, apiDelete } from "@/lib/api-client";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

interface SessionQuickEditPanelProps {
  eventId: string;
}

export function SessionQuickEditPanel({ eventId }: SessionQuickEditPanelProps) {
  const queryClient = useQueryClient();
  const isQuickEditOpen = useSessionBuilderStore((s) => s.isQuickEditOpen);
  const toggleQuickEdit = useSessionBuilderStore((s) => s.toggleQuickEdit);
  const selectedSessionId = useSessionBuilderStore((s) => s.selectedSessionId);
  const sessions = useSessionBuilderStore((s) => s.sessions);
  const rooms = useSessionBuilderStore((s) => s.rooms);
  const updateSession = useSessionBuilderStore((s) => s.updateSession);
  const deleteSession = useSessionBuilderStore((s) => s.deleteSession);
  const { mutate: removeSpeakerFromSession } = useRemoveSpeakerFromSession(eventId);
  const eventTimezone = useSessionBuilderStore((s) => s.eventTimezone);

  const duplicateMutation = useDuplicateSession(eventId);

  const currentSession = sessions.find((s) => s.id === selectedSessionId);

  const [form, setForm] = useState<Partial<BuilderSession>>({});
  const [activeTab, setActiveTab] = useState<"overview" | "talks" | "speakers" | "files">("overview");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (currentSession) {
      setForm({ ...currentSession });
    }
  }, [currentSession]);

  if (!isQuickEditOpen || !currentSession) return null;

  const handleSave = async () => {
    if (selectedSessionId && form) {
      setSaving(true);
      try {
        let finalRoomId = form.room_id;
        
        if (form.room_name) {
          const matchingRoom = rooms.find((r) => r.name.toLowerCase() === form.room_name?.trim().toLowerCase());
          if (matchingRoom) {
            finalRoomId = matchingRoom.id;
          } else {
            try {
              const newRoom = await apiPost<any>(`/events/${eventId}/rooms`, {
                name: form.room_name.trim(),
                room_type: "ROOM",
                capacity: 50,
                screen_count: 1
              });
              finalRoomId = newRoom.id;
            } catch (e) {
              console.error("Failed to create room", e);
            }
          }
        } else {
          finalRoomId = null;
        }

        const payload = {
          name: form.name,
          session_code: form.session_code ? form.session_code.trim().toUpperCase() : undefined,
          room_id: finalRoomId,
          start_time: form.start_time,
          end_time: form.end_time,
          description: form.description || null,
          session_type: form.session_type,
          moderator_name: form.moderator_name || null,
        };

        if (!selectedSessionId.startsWith("temp_")) {
          await apiPatch(`/events/${eventId}/sessions/${selectedSessionId}`, payload);
        }

        updateSession(selectedSessionId, { ...form, room_id: finalRoomId, room_name: form.room_name });
        queryClient.invalidateQueries({ queryKey: ["sessions", eventId] });
        queryClient.invalidateQueries({ queryKey: ["session-builder-snapshot", eventId] });
        toast.success("Session updated successfully");
        toggleQuickEdit(false);
      } catch (err: any) {
        toast.error(err?.message || "Failed to save session changes");
      } finally {
        setSaving(false);
      }
    }
  };

  const handleDelete = async () => {
    if (selectedSessionId && confirm("Are you sure you want to delete this session?")) {
      try {
        if (!selectedSessionId.startsWith("temp_")) {
          await apiDelete(`/events/${eventId}/sessions/${selectedSessionId}`);
        }
        deleteSession(selectedSessionId);
        queryClient.invalidateQueries({ queryKey: ["sessions", eventId] });
        queryClient.invalidateQueries({ queryKey: ["session-builder-snapshot", eventId] });
        toast.success("Session deleted successfully");
        toggleQuickEdit(false);
      } catch (err: any) {
        toast.error("Failed to delete session");
      }
    }
  };

  const handleDuplicate = () => {
    if (selectedSessionId) {
      duplicateMutation.mutate({ sessionId: selectedSessionId, offsetMinutes: 60 });
      toggleQuickEdit(false);
    }
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 bg-black/60 flex justify-end"
        onClick={() => toggleQuickEdit(false)}
      >
        <motion.aside
          initial={{ x: "100%" }}
          animate={{ x: 0 }}
          exit={{ x: "100%" }}
          transition={{ type: "spring", damping: 25, stiffness: 200 }}
          onClick={(e) => e.stopPropagation()}
          className="w-full max-w-lg bg-[var(--card)] border-l border-[var(--border-default)] h-full shadow-lg flex flex-col"
        >
          {/* Header */}
          <div className="p-4 border-b border-[var(--border-default)] flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-bold uppercase text-[var(--pri)] bg-[var(--pri)]/10 px-1.5 py-0.5 rounded">
                  {currentSession.session_code}
                </span>
                <Badge variant="outline" className="text-[10px] uppercase font-semibold border-[var(--border-subtle)]">
                  {currentSession.session_type}
                </Badge>
                {currentSession.is_published ? (
                  <span className="text-[9px] font-semibold uppercase tracking-wider px-1.5 py-0 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                    Published
                  </span>
                ) : (
                  <span className="text-[9px] font-semibold uppercase tracking-wider px-1.5 py-0 rounded bg-amber-500/10 text-amber-400 border border-amber-500/30">
                    Draft
                  </span>
                )}
              </div>
              <h3 className="font-semibold text-sm text-[var(--text-primary)] tracking-tight mt-1 line-clamp-1">
                {currentSession.name}
              </h3>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => toggleQuickEdit(false)}
              className="h-7 w-7 rounded-md text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>

          {/* Tabs */}
          <div className="flex items-center border-b border-[var(--border-default)] bg-[var(--surface-subtle)] px-3 gap-3">
            {[
              { id: "overview", label: "Overview", icon: Settings },
              { id: "talks", label: "Talks", icon: AlignLeft },
              { id: "speakers", label: "Speakers", icon: Users },
              { id: "files", label: "Files", icon: FileText },
            ].map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as any)}
                  className={cn(
                    "flex items-center gap-1.5 py-2.5 border-b-2 text-xs font-semibold transition-all",
                    isActive
                      ? "border-[var(--pri)] text-[var(--pri)]"
                      : "border-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                  )}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {tab.label}
                </button>
              );
            })}
          </div>

          {/* Form Body */}
          <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4 text-xs">
            {activeTab === "overview" && (
              <motion.div initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col gap-4">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="font-semibold text-[var(--text-secondary)] block mb-1 uppercase text-[10px] tracking-wider">Session ID</label>
                    <Input
                      value={form.session_code || ""}
                      onChange={(e) => setForm({ ...form, session_code: e.target.value.toUpperCase() })}
                      className="font-semibold text-xs rounded-md font-mono uppercase bg-[var(--card)] border-[var(--border-default)] text-[var(--text-primary)]"
                    />
                  </div>
                  <div>
                    <label className="font-semibold text-[var(--text-secondary)] block mb-1 uppercase text-[10px] tracking-wider">Session Name</label>
                    <Input
                      value={form.name || ""}
                      onChange={(e) => setForm({ ...form, name: e.target.value })}
                      className="font-semibold text-xs rounded-md bg-[var(--card)] border-[var(--border-default)] text-[var(--text-primary)]"
                    />
                  </div>
                </div>
                <div>
                  <label className="font-semibold text-[var(--text-secondary)] block mb-1 uppercase text-[10px] tracking-wider">Allocated Room / Hall</label>
                  <select
                    value={form.room_id || ""}
                    onChange={(e) => {
                      const selectedId = e.target.value || null;
                      const selectedRoomObj = rooms.find((r) => r.id === selectedId);
                      setForm({ ...form, room_id: selectedId, room_name: selectedRoomObj ? selectedRoomObj.name : null });
                    }}
                    className="w-full h-9 border border-[var(--border-default)] rounded-md px-3 font-medium text-xs text-[var(--text-primary)] bg-[var(--card)] focus:outline-none cursor-pointer"
                  >
                    <option value="">No Room (Unallocated)</option>
                    {rooms.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.name} {r.code ? `(${r.code})` : ""}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="font-semibold text-[var(--text-secondary)] block mb-1 uppercase text-[10px] tracking-wider">Start Time</label>
                    <Input
                      type="datetime-local"
                      value={form.start_time ? toDateTimeLocalString(form.start_time, eventTimezone).slice(0, 16) : ""}
                      onChange={(e) => setForm({ ...form, start_time: fromDateTimeLocalString(e.target.value, eventTimezone) })}
                      className="rounded-md font-mono text-xs bg-[var(--card)] border-[var(--border-default)] text-[var(--text-primary)] [color-scheme:dark]"
                    />
                  </div>
                  <div>
                    <label className="font-semibold text-[var(--text-secondary)] block mb-1 uppercase text-[10px] tracking-wider">End Time</label>
                    <Input
                      type="datetime-local"
                      value={form.end_time ? toDateTimeLocalString(form.end_time, eventTimezone).slice(0, 16) : ""}
                      onChange={(e) => setForm({ ...form, end_time: fromDateTimeLocalString(e.target.value, eventTimezone) })}
                      className="rounded-md font-mono text-xs bg-[var(--card)] border-[var(--border-default)] text-[var(--text-primary)] [color-scheme:dark]"
                    />
                  </div>
                </div>
                <div>
                  <label className="font-semibold text-[var(--text-secondary)] block mb-1 uppercase text-[10px] tracking-wider">Description</label>
                  <textarea
                    rows={4}
                    value={form.description || ""}
                    onChange={(e) => setForm({ ...form, description: e.target.value })}
                    className="w-full p-2.5 rounded-md border border-[var(--border-default)] bg-[var(--card)] text-xs text-[var(--text-primary)] font-normal outline-none resize-none focus:border-[var(--pri)]"
                    placeholder="Session overview, topics covered..."
                  />
                </div>
              </motion.div>
            )}

            {activeTab === "talks" && (
              <motion.div initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }}>
                <div className="flex justify-between items-center mb-3">
                  <label className="font-semibold text-[var(--text-secondary)] uppercase text-[10px] tracking-wider">Talk Sequence</label>
                  <Button size="sm" variant="outline" className="h-6 text-[10px] font-semibold rounded-md px-2 border-[var(--border-default)]">Add Talk</Button>
                </div>
                
                <div className="flex flex-col gap-2">
                  {form.talks && form.talks.length > 0 ? (
                    form.talks.map((talk) => (
                      <div key={talk.id} className="flex items-center gap-2.5 p-2.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-subtle)] shadow-xs">
                        <GripVertical className="h-3.5 w-3.5 text-[var(--text-tertiary)] cursor-grab" />
                        <div className="flex-1 min-w-0">
                          <div className="font-semibold text-xs text-[var(--text-primary)] truncate">{talk.title}</div>
                          <div className="text-[10px] text-[var(--text-secondary)]">{talk.speaker_names?.join(", ") || "No speaker"}</div>
                        </div>
                        <div className="font-mono text-[10px] font-bold text-[var(--brand-primary)] bg-[var(--brand-primary-muted)] px-1.5 py-0.5 rounded">
                          {talk.duration_minutes}m
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="text-center py-8 border border-dashed border-[var(--border-default)] rounded-lg text-[var(--text-tertiary)] text-xs">
                      No talks scheduled for this session.
                    </div>
                  )}
                </div>
              </motion.div>
            )}

            {activeTab === "speakers" && (
              <motion.div initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }}>
                <label className="font-semibold text-[var(--text-secondary)] block mb-2 uppercase text-[10px] tracking-wider">
                  Assigned Speakers ({currentSession.speakers?.length || 0})
                </label>
                <div className="flex flex-col gap-2">
                  {currentSession.speakers && currentSession.speakers.length > 0 ? (
                    currentSession.speakers.map((spk) => (
                      <div key={spk.id} className="flex items-center justify-between p-2.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-subtle)]">
                        <div className="flex items-center gap-2.5">
                          <div className="h-7 w-7 rounded-full bg-[var(--brand-primary-muted)] text-[var(--brand-primary)] font-bold flex items-center justify-center text-xs">
                            {spk.full_name.charAt(0)}
                          </div>
                          <div>
                            <div className="font-semibold text-xs text-[var(--text-primary)]">{spk.full_name}</div>
                            <div className="text-[10px] text-[var(--text-secondary)]">{spk.email}</div>
                          </div>
                        </div>
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => removeSpeakerFromSession({ sessionId: currentSession.id, speakerId: spk.id })}
                          className="h-6 w-6 text-[var(--text-secondary)] hover:text-rose-400 hover:bg-rose-500/10 rounded-md"
                          title="Remove speaker"
                        >
                          <UserX className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    ))
                  ) : (
                    <div className="text-xs text-[var(--text-tertiary)] italic p-3 border border-dashed border-[var(--border-default)] rounded-lg text-center">
                      No speakers assigned yet. Drag a speaker from the left palette.
                    </div>
                  )}
                </div>
              </motion.div>
            )}

            {activeTab === "files" && (
              <motion.div initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} className="text-center py-8 border border-dashed border-[var(--border-default)] rounded-lg text-[var(--text-tertiary)] text-xs">
                <FileText className="h-6 w-6 mx-auto mb-2 opacity-40" />
                <p>Presentation files will appear here once uploaded by speakers.</p>
              </motion.div>
            )}
          </div>

          {/* Footer Actions */}
          <div className="p-3.5 border-t border-[var(--border-default)] flex items-center justify-between bg-[var(--surface-subtle)]">
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleDelete}
                className="h-8 px-2.5 rounded-md text-xs font-medium border-[var(--border-default)] text-rose-400 hover:bg-rose-500/10 hover:border-rose-500/30"
              >
                <Trash2 className="h-3.5 w-3.5 mr-1" /> Delete
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleDuplicate}
                className="h-8 px-2.5 rounded-md text-xs font-medium border-[var(--border-default)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
              >
                <Copy className="h-3.5 w-3.5 mr-1" /> Duplicate
              </Button>
            </div>
            <Button
              disabled={saving}
              onClick={handleSave}
              className="h-8 px-3.5 bg-[var(--pri)] hover:bg-[var(--pri)]/90 text-black font-semibold text-xs tracking-wide rounded-md shadow-xs border-0 flex items-center gap-1.5"
            >
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />} Save Changes
            </Button>
          </div>
        </motion.aside>
      </motion.div>
    </AnimatePresence>
  );
}
