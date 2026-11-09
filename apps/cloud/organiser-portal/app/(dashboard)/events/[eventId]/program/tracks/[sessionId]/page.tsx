"use client";

import { useState, useEffect, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft,
  Calendar,
  Clock,
  MapPin,
  Users,
  Mic,
  Plus,
  Trash2,
  Save,
  CheckCircle2,
  AlertCircle,
  Loader2,
  FileText,
  Upload,
  MoveUp,
  MoveDown,
  Tag,
  ShieldCheck,
  Building2,
  Sparkles,
  Layers,
  Edit,
  UserPlus,
  Award,
  SlidersHorizontal,
  ExternalLink,
  Presentation,
  Check,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { useEvent } from "@/hooks/useEvents";
import { useRooms } from "@/hooks/useRooms";
import { useTracks, useSpeakers } from "@/hooks/useSpeakers";
import {
  useSessionDetail,
  useUpdateSession,
  useAddSessionSpeaker,
  useUpdateSessionSpeaker,
  useRemoveSessionSpeaker,
  useReorderSessionSpeakers,
} from "@/hooks/useSessions";
import {
  toDateTimeLocalString,
  fromDateTimeLocalString,
  getFallbackTimezone,
  formatTimeInTZ,
  formatDateInTZ,
} from "@/lib/utils";
import { toast } from "sonner";
import { apiPost } from "@/lib/api-client";

type TabKey = "details" | "speakers" | "faculty" | "materials";

const FACULTY_ROLES = [
  { value: "Chairperson", label: "Chairperson", color: "text-purple-400 bg-purple-500/10 border-purple-500/25" },
  { value: "Co-Chair", label: "Co-Chairperson", color: "text-indigo-400 bg-indigo-500/10 border-indigo-500/25" },
  { value: "Moderator", label: "Session Moderator", color: "text-amber-400 bg-amber-500/10 border-amber-500/25" },
  { value: "Panelist", label: "Panelist / Discussant", color: "text-blue-400 bg-blue-500/10 border-blue-500/25" },
  { value: "Keynote Speaker", label: "Keynote Speaker", color: "text-rose-400 bg-rose-500/10 border-rose-500/25" },
  { value: "Judge", label: "Judge / Evaluator", color: "text-emerald-400 bg-emerald-500/10 border-emerald-500/25" },
  { value: "Timekeeper", label: "Timekeeper / Stage Manager", color: "text-slate-400 bg-slate-500/10 border-slate-500/25" },
];

export default function SessionEditorPage() {
  const params = useParams();
  const router = useRouter();
  const eventId = params?.eventId as string;
  const sessionId = params?.sessionId as string;

  const { data: event } = useEvent(eventId);
  const { data: rooms = [] } = useRooms(eventId);
  const { data: tracks = [] } = useTracks(eventId);
  const { data: allSpeakers = [] } = useSpeakers(eventId);

  const { data: session, isLoading, refetch } = useSessionDetail(eventId, sessionId);
  const updateSessionMutation = useUpdateSession(eventId);
  const addSpeakerMutation = useAddSessionSpeaker(eventId, sessionId);
  const updateSpeakerMutation = useUpdateSessionSpeaker(eventId, sessionId);
  const removeSpeakerMutation = useRemoveSessionSpeaker(eventId, sessionId);
  const reorderSpeakersMutation = useReorderSessionSpeakers(eventId, sessionId);

  const activeTz = session?.event_timezone || event?.timezone || getFallbackTimezone();

  const [activeTab, setActiveTab] = useState<TabKey>("details");
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  // Core session form state
  const [formData, setFormData] = useState({
    name: "",
    session_code: "",
    session_type: "regular",
    track_id: "",
    room_id: "",
    start_time: "",
    end_time: "",
    description: "",
    moderator_name: "",
    max_capacity: 100,
    live_stream_url: "",
    operations_notes: "",
  });

  // Modal dialog states
  const [isAddTalkOpen, setIsAddTalkOpen] = useState(false);
  const [isAddFacultyOpen, setIsAddFacultyOpen] = useState(false);
  const [editingTalk, setEditingTalk] = useState<any | null>(null);

  // New Talk Form
  const [newTalk, setNewTalk] = useState({
    speaker_id: "",
    new_speaker_name: "",
    new_speaker_email: "",
    new_speaker_affiliation: "",
    presentation_title: "",
    talk_duration_minutes: 20,
    abstract_summary: "",
  });

  // New Faculty Form
  const [newFaculty, setNewFaculty] = useState({
    name: "",
    email: "",
    affiliation: "",
    role: "Chairperson",
    notes: "",
  });

  // Load session data into form
  useEffect(() => {
    if (session) {
      setFormData({
        name: session.name || "",
        session_code: session.session_code || "",
        session_type: session.session_type || "regular",
        track_id: session.track_id || "",
        room_id: session.room_id || "",
        start_time: session.start_time ? toDateTimeLocalString(session.start_time, activeTz) : "",
        end_time: session.end_time ? toDateTimeLocalString(session.end_time, activeTz) : "",
        description: session.description || "",
        moderator_name: session.moderator_name || "",
        max_capacity: session.max_capacity || 100,
        live_stream_url: session.live_stream_url || "",
        operations_notes: session.operations_notes || "",
      });
      setDirty(false);
    }
  }, [session, activeTz]);

  const handleFieldChange = (field: string, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    setDirty(true);
  };

  // Save Core Session Settings
  const handleSaveSettings = async () => {
    if (!formData.name.trim()) {
      toast.error("Please enter a session name");
      return;
    }
    setSaving(true);
    try {
      const payload: any = {
        name: formData.name.trim(),
        session_code: formData.session_code.trim().toUpperCase(),
        session_type: formData.session_type,
        track_id: formData.track_id || null,
        room_id: formData.room_id || null,
        description: formData.description.trim() || null,
        moderator_name: formData.moderator_name.trim() || null,
        operations_notes: formData.operations_notes.trim() || null,
      };

      if (formData.start_time) {
        payload.start_time = fromDateTimeLocalString(formData.start_time, activeTz);
      }
      if (formData.end_time) {
        payload.end_time = fromDateTimeLocalString(formData.end_time, activeTz);
      }

      await updateSessionMutation.mutateAsync({ sessionId, data: payload });
      setDirty(false);
    } catch (err: any) {
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  // Talks list sorted
  const speakersList = useMemo(() => {
    return (session?.session_speakers || []).slice().sort((a: any, b: any) => (a.talk_order || 0) - (b.talk_order || 0));
  }, [session?.session_speakers]);

  // People / Faculty list
  const peopleList = useMemo(() => {
    return session?.session_people || [];
  }, [session?.session_people]);

  // Reorder Talk Handlers
  const handleMoveTalk = async (index: number, direction: "up" | "down") => {
    const targetIndex = direction === "up" ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= speakersList.length) return;

    const newOrder = [...speakersList];
    const temp = newOrder[index];
    newOrder[index] = newOrder[targetIndex];
    newOrder[targetIndex] = temp;

    const orderedIds = newOrder.map(s => s.id);
    await reorderSpeakersMutation.mutateAsync(orderedIds);
  };

  // Add Talk & Speaker Handler
  const handleAddTalk = async () => {
    if (!newTalk.presentation_title.trim()) {
      toast.error("Please enter a presentation title");
      return;
    }

    let speakerId = newTalk.speaker_id;

    // Quick-create speaker if custom name entered
    if (!speakerId && newTalk.new_speaker_name.trim()) {
      try {
        const parts = newTalk.new_speaker_name.trim().split(" ");
        const firstName = parts[0] || "Speaker";
        const lastName = parts.slice(1).join(" ") || "Faculty";
        const createdSpeaker = await apiPost<any>(`/events/${eventId}/speakers`, {
          first_name: firstName,
          last_name: lastName,
          email: newTalk.new_speaker_email.trim() || `speaker_${Date.now()}@eventos.internal`,
          affiliation: newTalk.new_speaker_affiliation.trim() || null,
        });
        speakerId = createdSpeaker.id;
      } catch (e: any) {
        toast.error("Failed to create speaker profile");
        return;
      }
    }

    if (!speakerId) {
      toast.error("Please select an existing speaker or enter speaker details");
      return;
    }

    await addSpeakerMutation.mutateAsync({
      speaker_id: speakerId,
      presentation_title: newTalk.presentation_title.trim(),
      talk_duration_minutes: Number(newTalk.talk_duration_minutes) || 20,
      talk_order: speakersList.length,
    });

    setIsAddTalkOpen(false);
    setNewTalk({
      speaker_id: "",
      new_speaker_name: "",
      new_speaker_email: "",
      new_speaker_affiliation: "",
      presentation_title: "",
      talk_duration_minutes: 20,
      abstract_summary: "",
    });
  };

  // Add Faculty Member / Committee Role Handler
  const handleAddFaculty = async () => {
    if (!newFaculty.name.trim()) {
      toast.error("Please enter a faculty name");
      return;
    }

    try {
      // If adding a moderator, update session moderator_name directly
      if (newFaculty.role === "Moderator") {
        await updateSessionMutation.mutateAsync({
          sessionId,
          data: { moderator_name: newFaculty.name.trim() },
        });
      } else {
        // Also register as faculty role
        await apiPost(`/events/${eventId}/sessions/${sessionId}/speakers`, {
          speaker_id: null,
          role: newFaculty.role,
          presentation_title: `${newFaculty.role}: ${newFaculty.name.trim()} (${newFaculty.affiliation || ""})`,
          is_confirmed: true,
        }).catch(() => {});
        await refetch();
      }

      setIsAddFacultyOpen(false);
      setNewFaculty({
        name: "",
        email: "",
        affiliation: "",
        role: "Chairperson",
        notes: "",
      });
      toast.success(`${newFaculty.role} assigned to session`);
    } catch (e: any) {
      toast.error("Failed to assign faculty member");
    }
  };

  // Delete Talk Handler
  const handleDeleteTalk = async (sessionSpeakerId: string) => {
    if (confirm("Remove this talk from the session?")) {
      await removeSpeakerMutation.mutateAsync(sessionSpeakerId);
    }
  };

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] space-y-4">
        <Loader2 className="w-8 h-8 animate-spin text-[var(--pri)]" />
        <p className="text-xs text-[var(--text-secondary)] font-medium">Loading session workspace...</p>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="p-8 text-center">
        <AlertCircle className="w-10 h-10 text-rose-400 mx-auto mb-3" />
        <h2 className="text-lg font-bold text-[var(--text)]">Session not found</h2>
        <p className="text-xs text-[var(--text-secondary)] mt-1 mb-4">
          The requested session could not be retrieved.
        </p>
        <Button onClick={() => router.push(`/events/${eventId}/program/tracks`)} size="sm">
          Return to Sessions
        </Button>
      </div>
    );
  }

  const trackInfo = tracks.find(t => t.id === session.track_id);
  const trackName = trackInfo?.name || session.track_name || "General Track";
  const roomName = session.room?.name || session.room_name || "Unassigned Stage";

  return (
    <div className="space-y-6 p-6 min-h-screen max-w-7xl mx-auto">
      {/* Top Breadcrumb & Action Bar */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 border-b border-[var(--border)]/20 pb-4">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => router.push(`/events/${eventId}/program/tracks`)}
            className="h-8 px-2.5 text-xs font-bold rounded-xl text-[var(--text-secondary)] hover:text-[var(--text)] hover:bg-[var(--bg-surface-2)] cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4 mr-1.5" />
            Back to Sessions
          </Button>

          <div className="h-4 w-[1px] bg-[var(--border)]/30" />

          <div className="flex items-center gap-2">
            <Badge className="bg-[var(--pri)]/15 text-[var(--pri)] border border-[var(--pri)]/30 text-xs font-black">
              {session.session_code || "SES"}
            </Badge>
            <h1 className="text-lg md:text-xl font-black text-[var(--text)] truncate max-w-lg">
              {formData.name || session.name}
            </h1>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          {dirty && (
            <span className="text-[11px] font-bold text-amber-400 flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping" />
              Unsaved changes
            </span>
          )}

          <Button
            onClick={handleSaveSettings}
            disabled={saving || !dirty}
            className={`h-9 px-4 text-xs font-bold rounded-xl cursor-pointer transition-all ${
              dirty
                ? "bg-[var(--pri)] hover:bg-[var(--pri)]/90 text-white shadow-lg shadow-[var(--pri)]/20"
                : "bg-[var(--bg-surface-2)] text-[var(--muted)] border border-[var(--border)]/30"
            }`}
          >
            {saving ? (
              <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
            ) : (
              <Save className="w-3.5 h-3.5 mr-1.5" />
            )}
            Save Changes
          </Button>
        </div>
      </div>

      {/* Hero Session Summary Header */}
      <div className="p-5 rounded-3xl bg-[var(--card)] border border-[var(--border)]/30 flex flex-wrap items-center justify-between gap-4 shadow-sm">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[var(--bg-surface-2)] border border-[var(--border)]/20 text-xs font-semibold text-[var(--text)]">
            <Tag className="w-3.5 h-3.5 text-purple-400" />
            <span>Track: <strong>{trackName}</strong></span>
          </div>

          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[var(--bg-surface-2)] border border-[var(--border)]/20 text-xs font-semibold text-[var(--text)]">
            <MapPin className="w-3.5 h-3.5 text-amber-400" />
            <span>Room: <strong>{roomName}</strong></span>
          </div>

          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[var(--bg-surface-2)] border border-[var(--border)]/20 text-xs font-semibold text-[var(--text)]">
            <Calendar className="w-3.5 h-3.5 text-indigo-400" />
            <span>{session.start_time ? formatDateInTZ(session.start_time, activeTz) : "Unscheduled"}</span>
          </div>

          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[var(--bg-surface-2)] border border-[var(--border)]/20 text-xs font-semibold text-[var(--text)]">
            <Clock className="w-3.5 h-3.5 text-emerald-400" />
            <span>
              {session.start_time ? formatTimeInTZ(session.start_time, activeTz) : "--:--"} –{" "}
              {session.end_time ? formatTimeInTZ(session.end_time, activeTz) : "--:--"}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Badge className="bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 text-[11px] font-bold px-3 py-1">
            {speakersList.length} {speakersList.length === 1 ? "Talk Slot" : "Talk Slots"}
          </Badge>
          <Badge className="bg-indigo-500/15 text-indigo-300 border border-indigo-500/30 text-[11px] font-bold px-3 py-1 uppercase">
            {session.status || "Scheduled"}
          </Badge>
        </div>
      </div>

      {/* Tabs Navigation */}
      <div className="flex items-center gap-2 border-b border-[var(--border)]/20 pb-1">
        {[
          { key: "details", label: "Session Settings", icon: SlidersHorizontal, count: null },
          { key: "speakers", label: "Speakers & Assigned Talks", icon: Mic, count: speakersList.length },
          { key: "faculty", label: "Committee & Roles (Chair, Panel, etc.)", icon: Users, count: peopleList.length + (session.moderator_name ? 1 : 0) },
          { key: "materials", label: "Slides & AV Notes", icon: FileText, count: null },
        ].map(tab => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setActiveTab(tab.key as TabKey)}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              activeTab === tab.key
                ? "bg-[var(--pri)] text-white shadow-md shadow-[var(--pri)]/20"
                : "text-[var(--text-secondary)] hover:text-[var(--text)] hover:bg-[var(--bg-surface-2)]"
            }`}
          >
            <tab.icon className="w-4 h-4" />
            <span>{tab.label}</span>
            {tab.count !== null && (
              <span
                className={`px-1.5 py-0.2 rounded-md text-[10px] font-black ${
                  activeTab === tab.key ? "bg-white/20 text-white" : "bg-[var(--border)]/30 text-[var(--muted)]"
                }`}
              >
                {tab.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* TAB 1: Core Session Settings */}
      {activeTab === "details" && (
        <Card className="border-[var(--border)]/30 bg-[var(--card)] rounded-3xl p-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Title & Code */}
            <div className="space-y-2 md:col-span-2">
              <label className="text-xs font-bold text-[var(--text)]">Session Title / Subject</label>
              <Input
                value={formData.name}
                onChange={e => handleFieldChange("name", e.target.value)}
                placeholder="e.g. Plenary Keynote: Future of Artificial Intelligence"
                className="h-10 text-sm font-semibold rounded-xl bg-[var(--bg-surface-2)] border-[var(--border)]/30"
              />
            </div>

            <div className="space-y-2">
              <label className="text-xs font-bold text-[var(--text)]">Session Code / Identifier</label>
              <Input
                value={formData.session_code}
                onChange={e => handleFieldChange("session_code", e.target.value.toUpperCase())}
                placeholder="e.g. KEY-01, TRACK-A"
                className="h-10 text-xs font-mono font-bold rounded-xl bg-[var(--bg-surface-2)] border-[var(--border)]/30"
              />
            </div>

            <div className="space-y-2">
              <label className="text-xs font-bold text-[var(--text)]">Session Format / Category</label>
              <select
                value={formData.session_type}
                onChange={e => handleFieldChange("session_type", e.target.value)}
                className="w-full h-10 px-3 text-xs font-semibold rounded-xl bg-[var(--bg-surface-2)] border border-[var(--border)]/30 text-[var(--text)] cursor-pointer"
              >
                <option value="regular">Standard Presentation</option>
                <option value="keynote">Keynote / Plenary</option>
                <option value="workshop">Interactive Workshop</option>
                <option value="panel">Panel Discussion</option>
                <option value="symposium">Scientific Symposium</option>
                <option value="oral_abstract">Oral Abstract Session</option>
                <option value="poster_discussion">Poster Discussion</option>
              </select>
            </div>

            {/* Track & Room */}
            <div className="space-y-2">
              <label className="text-xs font-bold text-[var(--text)]">Conference Track / Theme</label>
              <select
                value={formData.track_id}
                onChange={e => handleFieldChange("track_id", e.target.value)}
                className="w-full h-10 px-3 text-xs font-semibold rounded-xl bg-[var(--bg-surface-2)] border border-[var(--border)]/30 text-[var(--text)] cursor-pointer"
              >
                <option value="">No Track Assigned</option>
                {tracks.map(t => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-bold text-[var(--text)]">Allocated Hall / Room</label>
              <select
                value={formData.room_id}
                onChange={e => handleFieldChange("room_id", e.target.value)}
                className="w-full h-10 px-3 text-xs font-semibold rounded-xl bg-[var(--bg-surface-2)] border border-[var(--border)]/30 text-[var(--text)] cursor-pointer"
              >
                <option value="">Unassigned Room</option>
                {rooms.map(r => (
                  <option key={r.id} value={r.id}>
                    {r.name} {r.room_type ? `(${r.room_type})` : ""}
                  </option>
                ))}
              </select>
            </div>

            {/* Timings */}
            <div className="space-y-2">
              <label className="text-xs font-bold text-[var(--text)]">Start Date & Time ({activeTz})</label>
              <Input
                type="datetime-local"
                value={formData.start_time}
                onChange={e => handleFieldChange("start_time", e.target.value)}
                className="h-10 text-xs rounded-xl bg-[var(--bg-surface-2)] border-[var(--border)]/30"
              />
            </div>

            <div className="space-y-2">
              <label className="text-xs font-bold text-[var(--text)]">End Date & Time ({activeTz})</label>
              <Input
                type="datetime-local"
                value={formData.end_time}
                onChange={e => handleFieldChange("end_time", e.target.value)}
                className="h-10 text-xs rounded-xl bg-[var(--bg-surface-2)] border-[var(--border)]/30"
              />
            </div>

            {/* Description */}
            <div className="space-y-2 md:col-span-2">
              <label className="text-xs font-bold text-[var(--text)]">Session Description / Synopsis</label>
              <Textarea
                rows={4}
                value={formData.description}
                onChange={e => handleFieldChange("description", e.target.value)}
                placeholder="Provide a comprehensive synopsis for delegates, learning objectives, and abstract theme."
                className="text-xs rounded-xl bg-[var(--bg-surface-2)] border-[var(--border)]/30 leading-relaxed"
              />
            </div>

            {/* Moderator Quick Override */}
            <div className="space-y-2">
              <label className="text-xs font-bold text-[var(--text)]">Lead Session Moderator</label>
              <Input
                value={formData.moderator_name}
                onChange={e => handleFieldChange("moderator_name", e.target.value)}
                placeholder="e.g. Dr. Jane Doe"
                className="h-10 text-xs rounded-xl bg-[var(--bg-surface-2)] border-[var(--border)]/30"
              />
            </div>

            <div className="space-y-2">
              <label className="text-xs font-bold text-[var(--text)]">Max Seating Capacity</label>
              <Input
                type="number"
                value={formData.max_capacity}
                onChange={e => handleFieldChange("max_capacity", Number(e.target.value))}
                placeholder="100"
                className="h-10 text-xs rounded-xl bg-[var(--bg-surface-2)] border-[var(--border)]/30"
              />
            </div>
          </div>

          <div className="mt-8 pt-5 border-t border-[var(--border)]/20 flex justify-end">
            <Button
              onClick={handleSaveSettings}
              disabled={saving}
              className="h-9 px-5 text-xs font-bold bg-[var(--pri)] hover:bg-[var(--pri)]/90 text-white rounded-xl cursor-pointer"
            >
              {saving ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Save className="w-3.5 h-3.5 mr-1.5" />}
              Save Session Settings
            </Button>
          </div>
        </Card>
      )}

      {/* TAB 2: Speakers & Assigned Talks */}
      {activeTab === "speakers" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-bold text-[var(--text)]">Assigned Presentations & Talks</h2>
              <p className="text-xs text-[var(--text-secondary)]">
                Manage the presentation sequence, allocated talk times, and assigned speakers.
              </p>
            </div>

            <Button
              onClick={() => setIsAddTalkOpen(true)}
              className="h-9 px-4 text-xs font-bold bg-[var(--pri)] text-white rounded-xl cursor-pointer shadow-sm"
            >
              <Plus className="w-3.5 h-3.5 mr-1.5" />
              Assign Talk & Speaker
            </Button>
          </div>

          {speakersList.length === 0 ? (
            <div className="text-center py-16 px-4 rounded-3xl border border-dashed border-[var(--border)]/40 bg-[var(--card)]">
              <Mic className="w-8 h-8 text-[var(--pri)] mx-auto mb-2 opacity-80" />
              <h3 className="text-sm font-bold text-[var(--text)]">No talks assigned yet</h3>
              <p className="text-xs text-[var(--text-secondary)] max-w-sm mx-auto mt-1 mb-4">
                Assign presentations and faculty speakers to this session schedule.
              </p>
              <Button onClick={() => setIsAddTalkOpen(true)} size="sm" className="h-8 text-xs font-bold rounded-xl">
                <Plus className="w-3.5 h-3.5 mr-1.5" />
                Assign First Speaker
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              {speakersList.map((talk: any, index: number) => {
                const spName = talk.full_name || `${talk.speaker?.first_name || ""} ${talk.speaker?.last_name || ""}`.trim() || "Faculty Speaker";
                const spAffiliation = talk.speaker?.affiliation || "Invited Faculty";
                const talkStart = talk.start_time ? formatTimeInTZ(talk.start_time, activeTz) : "--:--";
                const talkEnd = talk.end_time ? formatTimeInTZ(talk.end_time, activeTz) : "--:--";

                return (
                  <div
                    key={talk.id}
                    className="p-4 rounded-2xl bg-[var(--card)] border border-[var(--border)]/30 flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-sm hover:border-[var(--pri)]/40 transition-all"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      {/* Order Controls */}
                      <div className="flex flex-col items-center gap-1 shrink-0 bg-[var(--bg-surface-2)] p-1 rounded-xl border border-[var(--border)]/20">
                        <button
                          type="button"
                          onClick={() => handleMoveTalk(index, "up")}
                          disabled={index === 0}
                          className="p-1 rounded text-[var(--text-secondary)] hover:text-[var(--text)] disabled:opacity-20 cursor-pointer"
                          title="Move talk earlier"
                        >
                          <MoveUp className="w-3 h-3" />
                        </button>
                        <span className="text-[10px] font-black font-mono text-[var(--pri)]">#{index + 1}</span>
                        <button
                          type="button"
                          onClick={() => handleMoveTalk(index, "down")}
                          disabled={index === speakersList.length - 1}
                          className="p-1 rounded text-[var(--text-secondary)] hover:text-[var(--text)] disabled:opacity-20 cursor-pointer"
                          title="Move talk later"
                        >
                          <MoveDown className="w-3 h-3" />
                        </button>
                      </div>

                      {/* Talk & Speaker Info */}
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          <h4 className="text-sm font-bold text-[var(--text)] truncate">
                            {talk.presentation_title || "Untitled Presentation"}
                          </h4>
                          <Badge variant="outline" className="text-[10px] font-semibold">
                            {talk.talk_duration_minutes || 20} min
                          </Badge>
                          {talk.upload_status === "approved" && (
                            <Badge className="bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-[10px]">
                              Deck Ready
                            </Badge>
                          )}
                        </div>

                        <div className="flex items-center gap-3 text-xs text-[var(--text-secondary)] font-medium">
                          <span className="flex items-center gap-1 text-[var(--text)] font-semibold">
                            <Mic className="w-3 h-3 text-indigo-400" />
                            {spName}
                          </span>
                          <span className="text-[var(--muted)]">({spAffiliation})</span>
                          <span className="flex items-center gap-1">
                            <Clock className="w-3 h-3 text-emerald-400" />
                            {talkStart} – {talkEnd}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-2 shrink-0">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDeleteTalk(talk.id || talk.session_speaker_id)}
                        className="h-8 px-2.5 text-xs text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 rounded-xl cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5 mr-1" />
                        Remove
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* TAB 3: Faculty & Committee Roles (Panelists, Moderators, Chairs, etc.) */}
      {activeTab === "faculty" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-bold text-[var(--text)]">Session Leadership & Panel Members</h2>
              <p className="text-xs text-[var(--text-secondary)]">
                Assign Chairpersons, Co-Chairs, Moderators, Panelists, Keynotes, and Evaluators.
              </p>
            </div>

            <Button
              onClick={() => setIsAddFacultyOpen(true)}
              className="h-9 px-4 text-xs font-bold bg-[var(--pri)] text-white rounded-xl cursor-pointer shadow-sm"
            >
              <UserPlus className="w-3.5 h-3.5 mr-1.5" />
              Assign Role / Person
            </Button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {/* Primary Moderator Card if configured */}
            {session.moderator_name && (
              <div className="p-4 rounded-2xl bg-[var(--card)] border border-amber-500/30 shadow-sm flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <Badge className="bg-amber-500/15 text-amber-300 border border-amber-500/30 text-[10px] font-bold">
                      Session Moderator
                    </Badge>
                    <CheckCircle2 className="w-3.5 h-3.5 text-amber-400" />
                  </div>
                  <h4 className="text-sm font-bold text-[var(--text)]">{session.moderator_name}</h4>
                  <p className="text-xs text-[var(--text-secondary)] mt-0.5">Session Lead & Stage Host</p>
                </div>
                <div className="mt-4 pt-3 border-t border-[var(--border)]/20 text-[11px] text-[var(--muted)]">
                  Configured on Session Header
                </div>
              </div>
            )}

            {/* Custom Assigned People from SessionPeople */}
            {peopleList.map((person: any) => {
              const roleConfig = FACULTY_ROLES.find(r => r.value === person.role) || {
                color: "text-indigo-400 bg-indigo-500/10 border-indigo-500/20",
                label: person.role || "Faculty",
              };

              return (
                <div
                  key={person.id}
                  className="p-4 rounded-2xl bg-[var(--card)] border border-[var(--border)]/30 shadow-sm flex flex-col justify-between"
                >
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <Badge className={`text-[10px] font-bold border ${roleConfig.color}`}>
                        {person.role || "Faculty"}
                      </Badge>
                      <button
                        type="button"
                        onClick={() => handleDeleteTalk(person.id)}
                        className="text-[var(--muted)] hover:text-rose-400 transition-colors cursor-pointer"
                        title="Remove role"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    <h4 className="text-sm font-bold text-[var(--text)]">{person.name || person.presentation_title}</h4>
                    {person.notes && (
                      <p className="text-xs text-[var(--text-secondary)] mt-1">{person.notes}</p>
                    )}
                  </div>

                  <div className="mt-4 pt-3 border-t border-[var(--border)]/20 flex items-center justify-between text-[11px] text-[var(--muted)]">
                    <span>{person.is_confirmed ? "Confirmed" : "Pending Confirmation"}</span>
                    {person.is_confirmed && <Check className="w-3.5 h-3.5 text-emerald-400" />}
                  </div>
                </div>
              );
            })}

            {!session.moderator_name && peopleList.length === 0 && (
              <div className="md:col-span-3 text-center py-16 px-4 rounded-3xl border border-dashed border-[var(--border)]/40 bg-[var(--card)]">
                <Users className="w-8 h-8 text-indigo-400 mx-auto mb-2 opacity-80" />
                <h3 className="text-sm font-bold text-[var(--text)]">No committee members assigned</h3>
                <p className="text-xs text-[var(--text-secondary)] max-w-sm mx-auto mt-1 mb-4">
                  Add Session Chairs, Moderators, or Panelists to lead this session.
                </p>
                <Button onClick={() => setIsAddFacultyOpen(true)} size="sm" className="h-8 text-xs font-bold rounded-xl">
                  <UserPlus className="w-3.5 h-3.5 mr-1.5" />
                  Assign Session Chair / Moderator
                </Button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 4: Materials & AV Setup */}
      {activeTab === "materials" && (
        <Card className="border-[var(--border)]/30 bg-[var(--card)] rounded-3xl p-6">
          <div className="space-y-6">
            <div>
              <h3 className="text-sm font-bold text-[var(--text)]">Audio-Visual & Operations Instructions</h3>
              <p className="text-xs text-[var(--text-secondary)] mt-0.5">
                Notes for room technicians, stage managers, live-streaming, and presentation equipment.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-xs font-bold text-[var(--text)]">Live Stream / Broadcast URL</label>
                <Input
                  value={formData.live_stream_url}
                  onChange={e => handleFieldChange("live_stream_url", e.target.value)}
                  placeholder="https://stream.eventos.io/live/hall-a"
                  className="h-10 text-xs rounded-xl bg-[var(--bg-surface-2)] border-[var(--border)]/30"
                />
              </div>

              <div className="space-y-2 md:col-span-2">
                <label className="text-xs font-bold text-[var(--text)]">Technician & Stage Notes</label>
                <Textarea
                  rows={3}
                  value={formData.operations_notes}
                  onChange={e => handleFieldChange("operations_notes", e.target.value)}
                  placeholder="e.g. 2 wireless lapel mics for chairs, 1 podium mic, HDMI preview monitor on stage."
                  className="text-xs rounded-xl bg-[var(--bg-surface-2)] border-[var(--border)]/30 leading-relaxed"
                />
              </div>
            </div>

            <div className="pt-4 border-t border-[var(--border)]/20 flex justify-end">
              <Button
                onClick={handleSaveSettings}
                disabled={saving}
                className="h-9 px-5 text-xs font-bold bg-[var(--pri)] hover:bg-[var(--pri)]/90 text-white rounded-xl cursor-pointer"
              >
                {saving ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Save className="w-3.5 h-3.5 mr-1.5" />}
                Save AV Setup
              </Button>
            </div>
          </div>
        </Card>
      )}

      {/* DIALOG: Assign Talk & Speaker */}
      <Dialog open={isAddTalkOpen} onOpenChange={setIsAddTalkOpen}>
        <DialogContent className="max-w-lg rounded-3xl bg-[var(--card)] border border-[var(--border)]/40">
          <DialogHeader>
            <DialogTitle className="text-base font-bold text-[var(--text)]">
              Assign Talk & Faculty Speaker
            </DialogTitle>
            <DialogDescription className="text-xs text-[var(--text-secondary)]">
              Link an existing speaker or quick-add a new presenter with their presentation title.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-[var(--text)]">Presentation / Talk Title *</label>
              <Input
                value={newTalk.presentation_title}
                onChange={e => setNewTalk(prev => ({ ...prev, presentation_title: e.target.value }))}
                placeholder="e.g. Clinical Trial Outcomes and AI Diagnostics"
                className="h-9 text-xs rounded-xl bg-[var(--bg-surface-2)] border-[var(--border)]/30 font-semibold"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-[var(--text)]">Select Existing Speaker</label>
              <select
                value={newTalk.speaker_id}
                onChange={e => setNewTalk(prev => ({ ...prev, speaker_id: e.target.value }))}
                className="w-full h-9 px-3 text-xs font-medium rounded-xl bg-[var(--bg-surface-2)] border border-[var(--border)]/30 text-[var(--text)] cursor-pointer"
              >
                <option value="">-- Choose from Event Faculty ({allSpeakers.length}) --</option>
                {allSpeakers.map(sp => (
                  <option key={sp.id} value={sp.id}>
                    {sp.first_name} {sp.last_name} ({sp.affiliation || sp.email})
                  </option>
                ))}
              </select>
            </div>

            {!newTalk.speaker_id && (
              <div className="p-3.5 rounded-2xl bg-[var(--bg-surface-2)] border border-[var(--border)]/30 space-y-3">
                <p className="text-[11px] font-bold text-indigo-400 uppercase tracking-wider">
                  Or Quick-Add New Speaker Profile
                </p>
                <div className="space-y-2">
                  <Input
                    value={newTalk.new_speaker_name}
                    onChange={e => setNewTalk(prev => ({ ...prev, new_speaker_name: e.target.value }))}
                    placeholder="Full Name (e.g. Dr. Arthur Conan)"
                    className="h-8 text-xs rounded-xl bg-[var(--card)] border-[var(--border)]/30"
                  />
                  <Input
                    value={newTalk.new_speaker_email}
                    onChange={e => setNewTalk(prev => ({ ...prev, new_speaker_email: e.target.value }))}
                    placeholder="Email Address"
                    className="h-8 text-xs rounded-xl bg-[var(--card)] border-[var(--border)]/30"
                  />
                  <Input
                    value={newTalk.new_speaker_affiliation}
                    onChange={e => setNewTalk(prev => ({ ...prev, new_speaker_affiliation: e.target.value }))}
                    placeholder="Institution / Affiliation"
                    className="h-8 text-xs rounded-xl bg-[var(--card)] border-[var(--border)]/30"
                  />
                </div>
              </div>
            )}

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-[var(--text)]">Allocated Talk Duration (Minutes)</label>
              <Input
                type="number"
                value={newTalk.talk_duration_minutes}
                onChange={e => setNewTalk(prev => ({ ...prev, talk_duration_minutes: Number(e.target.value) }))}
                placeholder="20"
                className="h-9 text-xs rounded-xl bg-[var(--bg-surface-2)] border-[var(--border)]/30"
              />
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button variant="ghost" size="sm" onClick={() => setIsAddTalkOpen(false)} className="h-8 text-xs">
              Cancel
            </Button>
            <Button onClick={handleAddTalk} size="sm" className="h-8 text-xs font-bold bg-[var(--pri)] text-white rounded-xl">
              Add Talk to Session
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* DIALOG: Assign Faculty Member / Committee Role */}
      <Dialog open={isAddFacultyOpen} onOpenChange={setIsAddFacultyOpen}>
        <DialogContent className="max-w-md rounded-3xl bg-[var(--card)] border border-[var(--border)]/40">
          <DialogHeader>
            <DialogTitle className="text-base font-bold text-[var(--text)]">
              Assign Session Leadership Role
            </DialogTitle>
            <DialogDescription className="text-xs text-[var(--text-secondary)]">
              Assign a Chairperson, Moderator, Panelist, or Evaluator.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-[var(--text)]">Role Category *</label>
              <select
                value={newFaculty.role}
                onChange={e => setNewFaculty(prev => ({ ...prev, role: e.target.value }))}
                className="w-full h-9 px-3 text-xs font-bold rounded-xl bg-[var(--bg-surface-2)] border border-[var(--border)]/30 text-[var(--text)] cursor-pointer"
              >
                {FACULTY_ROLES.map(r => (
                  <option key={r.value} value={r.value}>
                    {r.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-[var(--text)]">Faculty Name *</label>
              <Input
                value={newFaculty.name}
                onChange={e => setNewFaculty(prev => ({ ...prev, name: e.target.value }))}
                placeholder="e.g. Prof. Robert Oppenheimer"
                className="h-9 text-xs rounded-xl bg-[var(--bg-surface-2)] border-[var(--border)]/30 font-semibold"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-[var(--text)]">Email Address</label>
              <Input
                value={newFaculty.email}
                onChange={e => setNewFaculty(prev => ({ ...prev, email: e.target.value }))}
                placeholder="robert@university.edu"
                className="h-9 text-xs rounded-xl bg-[var(--bg-surface-2)] border-[var(--border)]/30"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-[var(--text)]">Affiliation / Department</label>
              <Input
                value={newFaculty.affiliation}
                onChange={e => setNewFaculty(prev => ({ ...prev, affiliation: e.target.value }))}
                placeholder="Department of Physics, Institute of Advanced Study"
                className="h-9 text-xs rounded-xl bg-[var(--bg-surface-2)] border-[var(--border)]/30"
              />
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button variant="ghost" size="sm" onClick={() => setIsAddFacultyOpen(false)} className="h-8 text-xs">
              Cancel
            </Button>
            <Button onClick={handleAddFaculty} size="sm" className="h-8 text-xs font-bold bg-[var(--pri)] text-white rounded-xl">
              Assign Role
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
