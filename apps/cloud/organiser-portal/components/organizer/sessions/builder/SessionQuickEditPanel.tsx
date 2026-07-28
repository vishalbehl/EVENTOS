"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Trash2, Copy, Save, Clock, MapPin, Users, CheckCircle2, UserX } from "lucide-react";
import { useSessionBuilderStore, BuilderSession } from "@/store/useSessionBuilderStore";
import { useDuplicateSession } from "@/hooks/useSessionBuilder";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

interface SessionQuickEditPanelProps {
  eventId: string;
}

export function SessionQuickEditPanel({ eventId }: SessionQuickEditPanelProps) {
  const isQuickEditOpen = useSessionBuilderStore((s) => s.isQuickEditOpen);
  const toggleQuickEdit = useSessionBuilderStore((s) => s.toggleQuickEdit);
  const selectedSessionId = useSessionBuilderStore((s) => s.selectedSessionId);
  const sessions = useSessionBuilderStore((s) => s.sessions);
  const rooms = useSessionBuilderStore((s) => s.rooms);
  const tracks = useSessionBuilderStore((s) => s.tracks);
  const updateSession = useSessionBuilderStore((s) => s.updateSession);
  const deleteSession = useSessionBuilderStore((s) => s.deleteSession);
  const removeSpeakerFromSession = useSessionBuilderStore((s) => s.removeSpeakerFromSession);

  const duplicateMutation = useDuplicateSession(eventId);

  const currentSession = sessions.find((s) => s.id === selectedSessionId);

  const [form, setForm] = useState<Partial<BuilderSession>>({});

  useEffect(() => {
    if (currentSession) {
      setForm({ ...currentSession });
    }
  }, [currentSession]);

  if (!isQuickEditOpen || !currentSession) return null;

  const handleSave = () => {
    if (selectedSessionId && form) {
      updateSession(selectedSessionId, form);
      toggleQuickEdit(false);
    }
  };

  const handleDelete = () => {
    if (selectedSessionId && confirm("Are you sure you want to delete this session?")) {
      deleteSession(selectedSessionId);
      toggleQuickEdit(false);
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
        className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex justify-end"
        onClick={() => toggleQuickEdit(false)}
      >
        <motion.aside
          initial={{ x: "100%" }}
          animate={{ x: 0 }}
          exit={{ x: "100%" }}
          transition={{ type: "spring", damping: 25, stiffness: 200 }}
          onClick={(e) => e.stopPropagation()}
          className="w-full max-w-lg bg-background border-l border-default h-full shadow-2xl flex flex-col"
        >
          {/* Header */}
          <div className="p-6 border-b border-default flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-black uppercase text-muted bg-[color-mix(in_srgb,var(--text)_10%,transparent)] px-2 py-0.5 rounded">
                  {currentSession.session_code}
                </span>
                <Badge variant="outline" className="text-[10px] uppercase font-bold">
                  {currentSession.session_type}
                </Badge>
              </div>
              <h3 className="font-black text-[16px] text-[var(--text)] tracking-tight mt-1">
                Edit Session
              </h3>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => toggleQuickEdit(false)}
              className="h-8 w-8 rounded-full"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>

          {/* Form Body */}
          <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-5 text-[12px]">
            {/* Title */}
            <div>
              <label className="font-bold text-muted block mb-1 uppercase text-[10px]">
                Session Name
              </label>
              <Input
                value={form.name || ""}
                onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
                className="font-bold text-[13px] rounded-xl"
              />
            </div>

            {/* Room Assignment */}
            <div>
              <label className="font-bold text-muted block mb-1 uppercase text-[10px]">
                Allocated Room / Hall
              </label>
              <select
                value={form.room_id || ""}
                onChange={(e) => {
                  const rId = e.target.value || null;
                  const rName = rooms.find((r) => r.id === rId)?.name || null;
                  setForm((prev) => ({ ...prev, room_id: rId, room_name: rName }));
                }}
                className="w-full p-2.5 rounded-xl border border-default bg-background font-bold text-[12px] outline-none"
              >
                <option value="">(Unassigned)</option>
                {rooms.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name} ({r.room_type})
                  </option>
                ))}
              </select>
            </div>

            {/* Times */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="font-bold text-muted block mb-1 uppercase text-[10px]">
                  Start Time
                </label>
                <Input
                  type="datetime-local"
                  value={form.start_time ? form.start_time.slice(0, 16) : ""}
                  onChange={(e) => setForm((prev) => ({ ...prev, start_time: e.target.value }))}
                  className="rounded-xl font-mono text-[11px]"
                />
              </div>

              <div>
                <label className="font-bold text-muted block mb-1 uppercase text-[10px]">
                  End Time
                </label>
                <Input
                  type="datetime-local"
                  value={form.end_time ? form.end_time.slice(0, 16) : ""}
                  onChange={(e) => setForm((prev) => ({ ...prev, end_time: e.target.value }))}
                  className="rounded-xl font-mono text-[11px]"
                />
              </div>
            </div>

            {/* Description */}
            <div>
              <label className="font-bold text-muted block mb-1 uppercase text-[10px]">
                Description
              </label>
              <textarea
                rows={3}
                value={form.description || ""}
                onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))}
                className="w-full p-3 rounded-xl border border-default bg-background text-[12px] font-medium outline-none resize-none"
                placeholder="Session overview, topics covered..."
              />
            </div>

            {/* Assigned Speakers */}
            <div>
              <label className="font-bold text-muted block mb-2 uppercase text-[10px]">
                Assigned Speakers ({currentSession.speakers?.length || 0})
              </label>
              <div className="flex flex-col gap-2">
                {currentSession.speakers && currentSession.speakers.length > 0 ? (
                  currentSession.speakers.map((spk) => (
                    <div
                      key={spk.id}
                      className="flex items-center justify-between p-3 rounded-xl border border-default bg-[color-mix(in_srgb,var(--text)_2%,transparent)]"
                    >
                      <div className="flex items-center gap-2.5">
                        <div className="h-7 w-7 rounded-full bg-[var(--pri)]/20 text-[var(--pri)] font-black flex items-center justify-center text-[10px]">
                          {spk.full_name.charAt(0)}
                        </div>
                        <div>
                          <div className="font-bold text-[12px]">{spk.full_name}</div>
                          <div className="text-[10px] text-muted">{spk.email}</div>
                        </div>
                      </div>

                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => removeSpeakerFromSession(currentSession.id, spk.id)}
                        className="h-7 w-7 text-red-400 hover:text-red-500 hover:bg-red-500/10 rounded-lg"
                        title="Remove speaker"
                      >
                        <UserX className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  ))
                ) : (
                  <div className="text-[11px] text-muted italic p-3 border border-dashed rounded-xl text-center">
                    No speakers assigned yet. Select a speaker from the left palette to assign.
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Footer Actions */}
          <div className="p-4 border-t border-default flex items-center justify-between bg-[color-mix(in_srgb,var(--text)_2%,transparent)]">
            <div className="flex items-center gap-2">
              <Button
                variant="destructive"
                size="sm"
                onClick={handleDelete}
                className="h-9 px-3 rounded-xl text-[11px] font-bold"
              >
                <Trash2 className="h-3.5 w-3.5 mr-1" /> Delete
              </Button>

              <Button
                variant="outline"
                size="sm"
                onClick={handleDuplicate}
                className="h-9 px-3 rounded-xl text-[11px] font-bold"
              >
                <Copy className="h-3.5 w-3.5 mr-1" /> Duplicate
              </Button>
            </div>

            <Button
              onClick={handleSave}
              className="h-9 px-5 bg-[var(--pri)] text-white font-black text-[11px] uppercase tracking-wider rounded-xl shadow-md border-0"
            >
              <Save className="h-3.5 w-3.5 mr-1.5" /> Save Changes
            </Button>
          </div>
        </motion.aside>
      </motion.div>
    </AnimatePresence>
  );
}
