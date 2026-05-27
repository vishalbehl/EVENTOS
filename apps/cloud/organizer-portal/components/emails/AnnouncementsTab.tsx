"use client";

import { useState, useEffect } from "react";
import { 
  Megaphone, X, Save, Loader2, Info, AlertTriangle, CheckCircle, AlertCircle
} from "lucide-react";
import { useEvent, useUpdateEvent } from "@/hooks/useEvents";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";

export default function AnnouncementsTab({ eventId }: { eventId: string }) {
  const { data: event } = useEvent(eventId);
  const updateEvent = useUpdateEvent(eventId);

  const [announcementList, setAnnouncementList] = useState<Array<{ id: string; message: string; type: "info" | "warning" | "success" | "error" }>>([]);
  const [newMsg, setNewMsg] = useState("");
  const [newType, setNewType] = useState<"info" | "warning" | "success" | "error">("info");
  const [savingSettings, setSavingSettings] = useState(false);

  useEffect(() => {
    if (event?.registration_settings) {
      const rawAnnouncements = event.registration_settings.announcements;
      if (Array.isArray(rawAnnouncements)) {
        setAnnouncementList(rawAnnouncements);
      } else if (typeof rawAnnouncements === "string" && rawAnnouncements.trim()) {
        setAnnouncementList([{ id: "default", message: rawAnnouncements, type: "info" }]);
      } else {
        setAnnouncementList([]);
      }
    }
  }, [event]);

  const handleSaveSettings = async () => {
    setSavingSettings(true);
    try {
      const currentSettings = event?.registration_settings || {};
      await updateEvent.mutateAsync({
        registration_settings: {
          ...currentSettings,
          announcements: announcementList,
        },
      });
      toast.success("Announcements and alerts updated successfully!");
    } catch {
      toast.error("Failed to update announcements.");
    } finally {
      setSavingSettings(false);
    }
  };

  const handleAddAnnouncement = () => {
    if (!newMsg.trim()) return;
    setAnnouncementList((prev) => [
      ...prev,
      {
        id: crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2),
        message: newMsg.trim(),
        type: newType,
      },
    ]);
    setNewMsg("");
  };

  const handleDeleteAnnouncement = (idx: number) => {
    setAnnouncementList((prev) => prev.filter((_, i) => i !== idx));
  };

  return (
    <div className="w-full max-w-7xl mx-auto flex flex-col flex-1 min-h-0 space-y-6 px-4 md:px-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* Header section (Header + Save button) */}
      <div className="flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <Megaphone className="h-5 w-5 text-[var(--pri)] animate-pulse" />
          <div>
            <h2 className="text-sm font-black uppercase tracking-[0.2em] text-[var(--text)]">Portal Announcements & Alerts</h2>
            <p className="text-[9px] font-black uppercase tracking-widest text-muted mt-0.5">
              Broadcast alerts and notices directly on the public registration portal homepage.
            </p>
          </div>
        </div>
        <button
          onClick={handleSaveSettings}
          disabled={savingSettings}
          className="flex items-center gap-2 h-10 px-6 bg-[var(--pri)] hover:bg-[var(--pri-hover)] text-white rounded-xl text-[10px] font-black uppercase tracking-widest disabled:opacity-50 transition-all hover-lift-3d shadow-lg shadow-[var(--pri)]/25 shrink-0"
        >
          {savingSettings ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
          Save Changes
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 flex-1 min-h-0">
        {/* Left side: Composer (adding announcement) */}
        <div className="lg:col-span-5 h-full flex flex-col min-h-0">
          <Card className="glass-3d rounded-[2rem] p-8 border-default bg-[color-mix(in_srgb,var(--text)_3%,transparent)] flex flex-col h-full min-h-0 justify-between">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.15em] text-[var(--text)] mb-4">Create Announcement Card</p>
              
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-[8px] font-black uppercase tracking-widest text-muted block">Alert Broadcast Message</label>
                  <textarea
                    placeholder="E.g. Check-in gates close 15 minutes before the opening session. Please bring your registration QR code..."
                    value={newMsg}
                    onChange={e => setNewMsg(e.target.value)}
                    rows={4}
                    className="w-full bg-background border border-default focus:border-[var(--pri)] focus:ring-0 rounded-xl px-4 py-2.5 text-xs text-[var(--text)] font-semibold transition-all resize-none placeholder:text-muted/50"
                  />
                </div>
                
                <div className="space-y-1.5">
                  <label className="text-[8px] font-black uppercase tracking-widest text-muted block">Broadcast Tone</label>
                  <select
                    value={newType}
                    onChange={e => setNewType(e.target.value as any)}
                    className="w-full h-12 bg-background border border-default focus:border-[var(--pri)] focus:ring-0 rounded-xl px-3 text-xs text-[var(--text)] font-semibold transition-all cursor-pointer"
                  >
                    <option value="info">Notice (Indigo)</option>
                    <option value="warning">Warning (Amber)</option>
                    <option value="success">Update (Green)</option>
                    <option value="error">Alert (Rose)</option>
                  </select>
                </div>
              </div>
            </div>
 
            <button
              type="button"
              onClick={handleAddAnnouncement}
              disabled={!newMsg.trim()}
              className="w-full inline-flex items-center justify-center gap-1.5 h-10 px-5 bg-white/5 hover:bg-white/10 border border-default text-xs font-black uppercase tracking-widest text-[#E8EAFF] rounded-xl transition-all hover:border-[var(--pri)]/40 disabled:opacity-50 disabled:pointer-events-none mt-4 shrink-0"
            >
              Add to Broadcast List
            </button>
          </Card>
        </div>
 
        {/* Right side: Active broadcast list */}
        <div className="lg:col-span-7 h-full flex flex-col min-h-0">
          <Card className="glass-3d rounded-[2rem] p-8 border-default bg-[color-mix(in_srgb,var(--text)_3%,transparent)] flex flex-col h-full min-h-0 justify-between">
            <div className="flex flex-col flex-1 min-h-0">
              <label className="text-[10px] font-black uppercase tracking-widest text-muted block shrink-0 mb-4">Active Broadcasts</label>
              
              <div className="flex-1 overflow-y-auto pr-2 space-y-3 custom-scrollbar min-h-0">
                {announcementList.length > 0 ? (
                  announcementList.map((ann, idx) => {
                    const styles = {
                      info: { border: "border-indigo-500/20 bg-indigo-500/5", badge: "text-indigo-400 border-indigo-500/25", label: "Notice" },
                      warning: { border: "border-amber-500/20 bg-amber-500/5", badge: "text-amber-400 border-amber-500/25", label: "Warning" },
                      success: { border: "border-emerald-500/20 bg-emerald-500/5", badge: "text-emerald-400 border-emerald-500/25", label: "Update" },
                      error: { border: "border-rose-500/20 bg-rose-500/5", badge: "text-rose-400 border-rose-500/25", label: "Alert" }
                    }[ann.type] || { border: "border-indigo-500/20 bg-indigo-500/5", badge: "text-indigo-400 border-indigo-500/25", label: "Notice" };

                    return (
                      <div key={ann.id || idx} className={`flex items-start justify-between border rounded-2xl p-4 gap-4 transition-all duration-300 ${styles.border}`}>
                        <div className="space-y-1 flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className={`inline-flex px-1.5 py-0.5 rounded border text-[8px] font-black uppercase tracking-wider ${styles.badge}`}>
                              {styles.label}
                            </span>
                          </div>
                          <p className="text-xs font-semibold text-[var(--text)] whitespace-pre-line leading-relaxed break-words">
                            {ann.message}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleDeleteAnnouncement(idx)}
                          className="flex items-center justify-center p-1.5 rounded-lg bg-white/5 border border-white/5 hover:bg-rose-500/10 hover:border-rose-500/20 text-muted hover:text-rose-400 transition-all shrink-0"
                          title="Remove announcement"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    );
                  })
                ) : (
                  <div className="p-8 border border-dashed border-white/10 rounded-2xl text-center text-xs font-semibold text-muted italic bg-white/[0.01]">
                    No active broadcasts. Use the composer on the left to publish an announcement.
                  </div>
                )}
              </div>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
