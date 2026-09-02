"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  X,
  FileText,
  Users,
  Building2,
  Tag,
  Clock,
  Calendar,
  Layers,
  Award,
  Trash2,
  Save,
  Plus,
  Video,
  Upload,
  CheckCircle2,
  Sparkles,
  ShieldCheck,
  Radio,
  FileSpreadsheet,
  Mic,
  UserCheck,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { RoomItem, TrackConfigItem } from "./RoomTrackSetup";

export const FACULTY_ROLES = [
  "Speaker",
  "Chairperson",
  "Co-Chair",
  "Moderator",
  "Anchor",
  "Panelist",
  "Discussant",
  "Judge",
  "Invited Faculty",
] as const;

export interface SessionFacultyMember {
  id: string;
  speakerId?: string;
  name: string;
  role: string;
  email?: string;
  presentationTitle?: string;
  durationMinutes?: number;
}

export interface SessionInspectorData {
  id: string;
  title: string;
  sessionType: string;
  trackId?: string;
  date: string;
  startTime: string;
  endTime: string;
  durationMinutes: number;
  roomId?: string;
  color?: string;
  moderators: string[];
  speakers: string[];
  faculty?: SessionFacultyMember[];
  description: string;
  cmeCredits: number;
  cmeEligible: boolean;
  presentations: Array<{
    id: string;
    title: string;
    speakerName: string;
    duration: number;
  }>;
  documents: Array<{
    id: string;
    name: string;
    size: string;
    type: string;
  }>;
  operations: {
    seatingLayout: string;
    capacityLimit: number;
    liveStreamUrl?: string;
    moderatorNotes?: string;
  };
}

interface SessionInspectorDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  session: SessionInspectorData | null;
  rooms: RoomItem[];
  tracks: TrackConfigItem[];
  availableSpeakers?: Array<{ id: string; name: string; email?: string; role?: string }>;
  onSave: (session: SessionInspectorData) => void;
  onDelete: (sessionId: string) => void;
}

export function SessionInspectorDrawer({
  isOpen,
  onClose,
  session,
  rooms,
  tracks,
  availableSpeakers = [],
  onSave,
  onDelete,
}: SessionInspectorDrawerProps) {
  const [activeTab, setActiveTab] = useState<
    "details" | "faculty" | "presentations" | "documents" | "operations"
  >("details");

  const [formState, setFormState] = useState<SessionInspectorData | null>(null);
  const [newFacultyName, setNewFacultyName] = useState("");
  const [newFacultyRole, setNewFacultyRole] = useState<string>("Speaker");
  const [selectedSpeakerId, setSelectedSpeakerId] = useState<string>("");

  useEffect(() => {
    if (session) {
      // Ensure faculty is populated from speakers/moderators if not present
      let initialFaculty: SessionFacultyMember[] = session.faculty || [];
      if (initialFaculty.length === 0) {
        session.moderators?.forEach((m, idx) => {
          initialFaculty.push({
            id: `mod-${idx}-${Date.now()}`,
            name: m,
            role: "Moderator",
          });
        });
        session.speakers?.forEach((s, idx) => {
          initialFaculty.push({
            id: `spk-${idx}-${Date.now()}`,
            name: s,
            role: "Speaker",
          });
        });
      }

      setFormState({
        ...session,
        faculty: initialFaculty,
      });
      setActiveTab("details");
    }
  }, [session]);

  if (!isOpen || !formState) return null;

  const handleChange = (field: keyof SessionInspectorData, value: any) => {
    setFormState((prev) => (prev ? { ...prev, [field]: value } : null));
  };

  const handleOpsChange = (field: keyof SessionInspectorData["operations"], value: any) => {
    setFormState((prev) =>
      prev
        ? {
            ...prev,
            operations: {
              ...prev.operations,
              [field]: value,
            },
          }
        : null
    );
  };

  const handleAddFaculty = () => {
    let nameToAdd = newFacultyName.trim();
    let speakerIdToAdd: string | undefined = undefined;

    if (selectedSpeakerId) {
      const match = availableSpeakers.find((s) => s.id === selectedSpeakerId);
      if (match) {
        nameToAdd = match.name;
        speakerIdToAdd = match.id;
      }
    }

    if (!nameToAdd) return;

    const newMember: SessionFacultyMember = {
      id: `fac-${Date.now()}`,
      speakerId: speakerIdToAdd,
      name: nameToAdd,
      role: newFacultyRole || "Speaker",
      durationMinutes: 15,
    };

    const updatedFaculty = [...(formState.faculty || []), newMember];
    
    // Sync backward-compatible arrays
    const updatedModerators = updatedFaculty
      .filter((f) => ["Moderator", "Chairperson", "Co-Chair", "Anchor"].includes(f.role))
      .map((f) => f.name);
    const updatedSpeakers = updatedFaculty
      .filter((f) => ["Speaker", "Panelist", "Discussant", "Judge"].includes(f.role))
      .map((f) => f.name);

    setFormState({
      ...formState,
      faculty: updatedFaculty,
      moderators: updatedModerators,
      speakers: updatedSpeakers,
    });

    setNewFacultyName("");
    setSelectedSpeakerId("");
  };

  const handleRemoveFaculty = (id: string) => {
    const updatedFaculty = (formState.faculty || []).filter((f) => f.id !== id);
    const updatedModerators = updatedFaculty
      .filter((f) => ["Moderator", "Chairperson", "Co-Chair", "Anchor"].includes(f.role))
      .map((f) => f.name);
    const updatedSpeakers = updatedFaculty
      .filter((f) => ["Speaker", "Panelist", "Discussant", "Judge"].includes(f.role))
      .map((f) => f.name);

    setFormState({
      ...formState,
      faculty: updatedFaculty,
      moderators: updatedModerators,
      speakers: updatedSpeakers,
    });
  };

  const handleUpdateFacultyRole = (id: string, newRole: string) => {
    const updatedFaculty = (formState.faculty || []).map((f) =>
      f.id === id ? { ...f, role: newRole } : f
    );
    setFormState({ ...formState, faculty: updatedFaculty });
  };

  const handleSaveSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave(formState);
    toast.success("Session changes saved successfully");
    onClose();
  };

  const getRoleBadgeStyle = (role: string) => {
    switch (role) {
      case "Anchor":
        return "bg-purple-500/10 text-purple-600 border-purple-500/20";
      case "Chairperson":
        return "bg-indigo-500/10 text-indigo-600 border-indigo-500/20";
      case "Co-Chair":
        return "bg-blue-500/10 text-blue-600 border-blue-500/20";
      case "Moderator":
        return "bg-emerald-500/10 text-emerald-600 border-emerald-500/20";
      case "Panelist":
        return "bg-amber-500/10 text-amber-600 border-amber-500/20";
      case "Judge":
        return "bg-rose-500/10 text-rose-600 border-rose-500/20";
      case "Discussant":
        return "bg-cyan-500/10 text-cyan-600 border-cyan-500/20";
      default:
        return "bg-[var(--pri)]/10 text-[var(--pri)] border-[var(--pri)]/20";
    }
  };

  return (
    <AnimatePresence>
      {/* Backdrop */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm"
      />

      {/* Drawer */}
      <motion.div
        initial={{ x: "100%" }}
        animate={{ x: 0 }}
        exit={{ x: "100%" }}
        transition={{ type: "spring", damping: 25, stiffness: 220 }}
        className="fixed inset-y-0 right-0 z-50 flex w-full max-w-xl flex-col bg-[var(--card)] shadow-2xl border-l border-[var(--border-default)]"
      >
        {/* Drawer Header */}
        <div className="flex items-center justify-between border-b border-[var(--border-default)] px-5 py-4 bg-[var(--surface-subtle)]">
          <div className="flex items-center gap-2.5">
            <div
              className="size-3.5 rounded-full ring-2 ring-white/20"
              style={{ backgroundColor: formState.color || "#3b82f6" }}
            />
            <div>
              <h2 className="text-base font-bold text-[var(--text-primary)] leading-tight line-clamp-1">
                {formState.title || "Session Details"}
              </h2>
              <span className="text-[11px] text-[var(--text-secondary)] font-mono">
                {formState.sessionType} • {formState.startTime} - {formState.endTime} ({formState.durationMinutes} min)
              </span>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="flex size-8 items-center justify-center rounded-lg text-[var(--text-secondary)] hover:bg-[var(--bg-surface-2)] hover:text-[var(--text-primary)] transition-colors cursor-pointer"
          >
            <X className="size-4" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-[var(--border-default)] bg-[var(--card)] px-5 pt-2 gap-1 overflow-x-auto">
          {[
            { id: "details", label: "Details", icon: FileText },
            { id: "faculty", label: `Faculty (${formState.faculty?.length || 0})`, icon: Users },
            { id: "presentations", label: `Talks (${formState.presentations?.length || 0})`, icon: Mic },
            { id: "operations", label: "Operations", icon: Building2 },
          ].map((t) => {
            const Icon = t.icon;
            const isActive = activeTab === t.id;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setActiveTab(t.id as any)}
                className={cn(
                  "flex items-center gap-1.5 border-b-2 px-3.5 py-2 text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap",
                  isActive
                    ? "border-[var(--pri)] text-[var(--pri)] font-bold"
                    : "border-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                )}
              >
                <Icon className="size-3.5" />
                {t.label}
              </button>
            );
          })}
        </div>

        {/* Form Content */}
        <form onSubmit={handleSaveSubmit} className="flex-1 overflow-y-auto p-5 space-y-4 min-h-0">
          {/* TAB 1: DETAILS */}
          {activeTab === "details" && (
            <div className="space-y-4">
              <div className="space-y-1">
                <label className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-tertiary)] block mb-1">
                  Session Title *
                </label>
                <input
                  required
                  value={formState.title}
                  onChange={(e) => handleChange("title", e.target.value)}
                  placeholder="e.g. Grand Opening Plenary & Panel Debate"
                  className="h-9 w-full rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface-2)] px-3 text-xs text-[var(--text-primary)] focus:border-[var(--pri)] focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-tertiary)] block mb-1">
                    Session Type
                  </label>
                  <select
                    value={formState.sessionType}
                    onChange={(e) => handleChange("sessionType", e.target.value)}
                    className="h-9 w-full rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface-2)] px-2.5 text-xs text-[var(--text-primary)] focus:border-[var(--pri)] focus:outline-none cursor-pointer"
                  >
                    <option value="Plenary">Plenary / Keynote</option>
                    <option value="Scientific Session">Scientific Session</option>
                    <option value="Workshop">Workshop / CME</option>
                    <option value="Panel">Panel Discussion</option>
                    <option value="Symposium">Industry Symposium</option>
                    <option value="Ceremony">Ceremony & Inauguration</option>
                    <option value="Break">Break / Networking</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-tertiary)] block mb-1">
                    Conference Track
                  </label>
                  <select
                    value={formState.trackId || ""}
                    onChange={(e) => handleChange("trackId", e.target.value)}
                    className="h-9 w-full rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface-2)] px-2.5 text-xs text-[var(--text-primary)] focus:border-[var(--pri)] focus:outline-none cursor-pointer"
                  >
                    <option value="">General Track</option>
                    {tracks.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1">
                  <label className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-tertiary)] block mb-1">
                    Start Time
                  </label>
                  <input
                    type="time"
                    value={formState.startTime}
                    onChange={(e) => handleChange("startTime", e.target.value)}
                    className="h-9 w-full rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface-2)] px-2.5 text-xs font-mono text-[var(--text-primary)] focus:border-[var(--pri)] focus:outline-none"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-tertiary)] block mb-1">
                    End Time
                  </label>
                  <input
                    type="time"
                    value={formState.endTime}
                    onChange={(e) => handleChange("endTime", e.target.value)}
                    className="h-9 w-full rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface-2)] px-2.5 text-xs font-mono text-[var(--text-primary)] focus:border-[var(--pri)] focus:outline-none"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-tertiary)] block mb-1">
                    Duration (Min)
                  </label>
                  <input
                    type="number"
                    value={formState.durationMinutes}
                    onChange={(e) =>
                      handleChange("durationMinutes", parseInt(e.target.value) || 0)
                    }
                    className="h-9 w-full rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface-2)] px-2.5 text-xs font-mono text-[var(--text-primary)] focus:border-[var(--pri)] focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-tertiary)] block mb-1">
                    Assigned Room
                  </label>
                  <select
                    value={formState.roomId || ""}
                    onChange={(e) => handleChange("roomId", e.target.value)}
                    className="h-9 w-full rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface-2)] px-2.5 text-xs text-[var(--text-primary)] focus:border-[var(--pri)] focus:outline-none cursor-pointer"
                  >
                    <option value="">Select room...</option>
                    {rooms.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.name} {r.code ? `(${r.code})` : ""}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-tertiary)] block mb-1">
                    Color Accent
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={formState.color || "#3b82f6"}
                      onChange={(e) => handleChange("color", e.target.value)}
                      className="size-9 rounded-lg border border-[var(--border-default)] p-1 bg-[var(--bg-surface-2)] cursor-pointer"
                    />
                    <input
                      value={formState.color || "#3b82f6"}
                      onChange={(e) => handleChange("color", e.target.value)}
                      className="h-9 flex-1 rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface-2)] px-2.5 text-xs font-mono text-[var(--text-primary)] focus:border-[var(--pri)] focus:outline-none"
                    />
                  </div>
                </div>
              </div>

              {/* Description */}
              <div className="space-y-1">
                <label className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-tertiary)] block mb-1">
                  Description & Session Abstract
                </label>
                <textarea
                  rows={3}
                  value={formState.description}
                  onChange={(e) => handleChange("description", e.target.value)}
                  placeholder="Overview of the session, learning objectives, and agenda flow..."
                  className="w-full rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface-2)] p-2.5 text-xs text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:border-[var(--pri)] focus:outline-none"
                />
              </div>

              {/* CME Accreditation */}
              <div className="flex items-center justify-between rounded-lg border border-[var(--border-default)] bg-[var(--surface-subtle)] p-3">
                <div className="flex items-center gap-2">
                  <Award className="size-4 text-amber-500" />
                  <div>
                    <span className="text-xs font-bold text-[var(--text-primary)]">
                      CME Credit Accreditation
                    </span>
                    <p className="text-[10px] text-[var(--text-secondary)]">
                      Accreditation points awarded for attendance
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <input
                    type="number"
                    step={0.5}
                    min={0}
                    value={formState.cmeCredits}
                    onChange={(e) =>
                      handleChange("cmeCredits", parseFloat(e.target.value) || 0)
                    }
                    className="h-8 w-16 rounded-md border border-[var(--border-default)] bg-[var(--card)] px-2 text-xs font-mono text-center text-[var(--text-primary)]"
                  />
                  <label className="flex items-center gap-1.5 text-xs font-medium cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={formState.cmeEligible}
                      onChange={(e) => handleChange("cmeEligible", e.target.checked)}
                      className="rounded border-[var(--border-default)] accent-[var(--pri)]"
                    />
                    Eligible
                  </label>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: FACULTY & MULTI-ROLE ASSIGNMENT */}
          {activeTab === "faculty" && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-xs font-bold text-[var(--text-primary)]">
                    Session Faculty & Designated Roles
                  </h3>
                  <p className="text-[11px] text-[var(--text-secondary)]">
                    Assign Anchors, Chairpersons, Moderators, Panelists, and Speakers.
                  </p>
                </div>
                <span className="rounded-full bg-[var(--pri)]/10 px-2 py-0.5 text-[10px] font-bold text-[var(--pri)]">
                  {formState.faculty?.length || 0} Assigned
                </span>
              </div>

              {/* Add Faculty Form */}
              <div className="rounded-xl border border-[var(--border-default)] bg-[var(--surface-subtle)] p-3.5 space-y-3">
                <span className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-tertiary)] block">
                  Add Faculty / Presenter
                </span>

                <div className="grid grid-cols-12 gap-2">
                  <div className="col-span-4">
                    <select
                      value={newFacultyRole}
                      onChange={(e) => setNewFacultyRole(e.target.value)}
                      className="h-9 w-full rounded-lg border border-[var(--border-default)] bg-[var(--card)] px-2 text-xs font-semibold text-[var(--text-primary)] focus:border-[var(--pri)] focus:outline-none cursor-pointer"
                    >
                      {FACULTY_ROLES.map((r) => (
                        <option key={r} value={r}>
                          {r}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="col-span-6">
                    {availableSpeakers.length > 0 ? (
                      <select
                        value={selectedSpeakerId}
                        onChange={(e) => {
                          setSelectedSpeakerId(e.target.value);
                          if (e.target.value) {
                            const spk = availableSpeakers.find((s) => s.id === e.target.value);
                            if (spk) setNewFacultyName(spk.name);
                          }
                        }}
                        className="h-9 w-full rounded-lg border border-[var(--border-default)] bg-[var(--card)] px-2.5 text-xs text-[var(--text-primary)] focus:border-[var(--pri)] focus:outline-none cursor-pointer"
                      >
                        <option value="">Select registered faculty / speaker...</option>
                        {availableSpeakers.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.name} {s.role ? `(${s.role})` : ""}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <input
                        value={newFacultyName}
                        onChange={(e) => setNewFacultyName(e.target.value)}
                        placeholder="Enter person's full name..."
                        className="h-9 w-full rounded-lg border border-[var(--border-default)] bg-[var(--card)] px-2.5 text-xs text-[var(--text-primary)] focus:border-[var(--pri)] focus:outline-none"
                      />
                    )}
                  </div>

                  <div className="col-span-2">
                    <button
                      type="button"
                      onClick={handleAddFaculty}
                      className="h-9 w-full rounded-lg bg-[var(--pri)] text-[var(--primary-contrast)] text-xs font-bold flex items-center justify-center gap-1 hover:brightness-110 cursor-pointer shadow-sm"
                    >
                      <Plus className="size-3.5" />
                      Add
                    </button>
                  </div>
                </div>

                {availableSpeakers.length > 0 && (
                  <div className="flex items-center gap-2 pt-1">
                    <span className="text-[10px] text-[var(--text-tertiary)]">Or enter ad-hoc name:</span>
                    <input
                      value={newFacultyName}
                      onChange={(e) => {
                        setNewFacultyName(e.target.value);
                        setSelectedSpeakerId("");
                      }}
                      placeholder="e.g. Dr. Jane Doe"
                      className="h-7 flex-1 rounded-md border border-[var(--border-default)] bg-[var(--card)] px-2 text-xs text-[var(--text-primary)] focus:border-[var(--pri)] focus:outline-none"
                    />
                  </div>
                )}
              </div>

              {/* Faculty List */}
              <div className="space-y-2">
                {(formState.faculty || []).length === 0 ? (
                  <div className="rounded-xl border border-dashed border-[var(--border-default)] p-6 text-center">
                    <Users className="mx-auto size-8 text-[var(--text-tertiary)]" />
                    <p className="mt-2 text-xs font-semibold text-[var(--text-primary)]">
                      No Faculty Assigned Yet
                    </p>
                    <p className="text-[11px] text-[var(--text-secondary)]">
                      Add Anchors, Session Chairs, Moderators, or Panelists above.
                    </p>
                  </div>
                ) : (
                  (formState.faculty || []).map((fac, idx) => (
                    <div
                      key={fac.id}
                      className="flex items-center justify-between rounded-xl border border-[var(--border-default)] bg-[var(--card)] p-3 shadow-xs hover:border-[var(--pri)]/40 transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <div className="flex size-7 items-center justify-center rounded-full bg-[var(--bg-surface-2)] text-xs font-bold text-[var(--text-secondary)]">
                          {idx + 1}
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-bold text-[var(--text-primary)]">
                              {fac.name}
                            </span>
                            <span
                              className={cn(
                                "rounded-md border px-2 py-0.5 text-[10px] font-bold tracking-wide",
                                getRoleBadgeStyle(fac.role)
                              )}
                            >
                              {fac.role}
                            </span>
                          </div>
                          {fac.presentationTitle && (
                            <p className="text-[11px] text-[var(--text-secondary)] italic line-clamp-1">
                              Talk: {fac.presentationTitle}
                            </p>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <select
                          value={fac.role}
                          onChange={(e) => handleUpdateFacultyRole(fac.id, e.target.value)}
                          className="h-7 rounded-md border border-[var(--border-default)] bg-[var(--bg-surface-2)] px-2 text-[10px] font-semibold text-[var(--text-primary)] cursor-pointer"
                        >
                          {FACULTY_ROLES.map((r) => (
                            <option key={r} value={r}>
                              {r}
                            </option>
                          ))}
                        </select>

                        <button
                          type="button"
                          onClick={() => handleRemoveFaculty(fac.id)}
                          className="flex size-7 items-center justify-center rounded-md text-[var(--text-tertiary)] hover:bg-rose-500/10 hover:text-rose-600 transition-colors cursor-pointer"
                        >
                          <Trash2 className="size-3.5" />
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {/* TAB 3: PRESENTATIONS */}
          {activeTab === "presentations" && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-xs font-bold text-[var(--text-primary)]">
                    Session Talks & Oral Presentations
                  </h3>
                  <p className="text-[11px] text-[var(--text-secondary)]">
                    Sequence sub-talks and individual deck durations.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    const newP = {
                      id: `pres-${Date.now()}`,
                      title: `Presentation #${(formState.presentations?.length || 0) + 1}`,
                      speakerName: formState.faculty?.[0]?.name || "Faculty Speaker",
                      duration: 15,
                    };
                    setFormState({
                      ...formState,
                      presentations: [...(formState.presentations || []), newP],
                    });
                  }}
                  className="flex items-center gap-1 text-xs font-bold text-[var(--pri)] hover:underline cursor-pointer"
                >
                  <Plus className="size-3" /> Add Talk
                </button>
              </div>

              <div className="space-y-2">
                {(formState.presentations || []).map((pres, idx) => (
                  <div
                    key={pres.id}
                    className="rounded-lg border border-[var(--border-default)] bg-[var(--surface-subtle)] p-3 space-y-2"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-[var(--text-primary)]">
                        Talk #{idx + 1}
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          setFormState({
                            ...formState,
                            presentations: (formState.presentations || []).filter(
                              (p) => p.id !== pres.id
                            ),
                          });
                        }}
                        className="text-[var(--text-tertiary)] hover:text-rose-500 cursor-pointer"
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    </div>

                    <input
                      value={pres.title}
                      onChange={(e) => {
                        const updated = (formState.presentations || []).map((p) =>
                          p.id === pres.id ? { ...p, title: e.target.value } : p
                        );
                        setFormState({ ...formState, presentations: updated });
                      }}
                      placeholder="Talk title..."
                      className="h-8 w-full rounded-md border border-[var(--border-default)] bg-[var(--card)] px-2.5 text-xs text-[var(--text-primary)]"
                    />

                    <div className="grid grid-cols-2 gap-2">
                      <select
                        value={pres.speakerName}
                        onChange={(e) => {
                          const updated = (formState.presentations || []).map((p) =>
                            p.id === pres.id ? { ...p, speakerName: e.target.value } : p
                          );
                          setFormState({ ...formState, presentations: updated });
                        }}
                        className="h-8 rounded-md border border-[var(--border-default)] bg-[var(--card)] px-2 text-xs"
                      >
                        {(formState.faculty || []).map((f) => (
                          <option key={f.id} value={f.name}>
                            {f.name} ({f.role})
                          </option>
                        ))}
                      </select>

                      <div className="flex items-center gap-1.5">
                        <input
                          type="number"
                          value={pres.duration}
                          onChange={(e) => {
                            const updated = (formState.presentations || []).map((p) =>
                              p.id === pres.id
                                ? { ...p, duration: parseInt(e.target.value) || 0 }
                                : p
                            );
                            setFormState({ ...formState, presentations: updated });
                          }}
                          className="h-8 w-16 rounded-md border border-[var(--border-default)] bg-[var(--card)] px-2 text-center text-xs"
                        />
                        <span className="text-[11px] text-[var(--text-secondary)]">min</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* TAB 4: OPERATIONS */}
          {activeTab === "operations" && (
            <div className="space-y-4">
              <div className="space-y-1">
                <label className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-tertiary)] block mb-1">
                  Seating Layout
                </label>
                <select
                  value={formState.operations.seatingLayout}
                  onChange={(e) => handleOpsChange("seatingLayout", e.target.value)}
                  className="h-9 w-full rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface-2)] px-2.5 text-xs text-[var(--text-primary)]"
                >
                  <option value="Theater">Theater (Maximum Capacity)</option>
                  <option value="Classroom">Classroom (With Tables)</option>
                  <option value="Banquet">Round Banquet Tables</option>
                  <option value="U-Shape">U-Shape Interactive</option>
                  <option value="Hollow Square">Hollow Square Discussion</option>
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-tertiary)] block mb-1">
                  Live Stream & Broadcast URL
                </label>
                <input
                  type="url"
                  value={formState.operations.liveStreamUrl || ""}
                  onChange={(e) => handleOpsChange("liveStreamUrl", e.target.value)}
                  placeholder="https://stream.conference.org/hall-a"
                  className="h-9 w-full rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface-2)] px-3 text-xs text-[var(--text-primary)]"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-tertiary)] block mb-1">
                  Moderator & Operational Notes
                </label>
                <textarea
                  rows={4}
                  value={formState.operations.moderatorNotes || ""}
                  onChange={(e) => handleOpsChange("moderatorNotes", e.target.value)}
                  placeholder="Notes for session chair: Introduce speakers, keep strictly to 15 min per talk, reserve 10 min for Q&A."
                  className="w-full rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface-2)] p-2.5 text-xs text-[var(--text-primary)]"
                />
              </div>
            </div>
          )}

          {/* Drawer Footer Actions */}
          <div className="pt-4 border-t border-[var(--border-default)] flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={() => onDelete(formState.id)}
              className="flex items-center gap-1.5 rounded-lg border border-rose-500/30 px-3 py-2 text-xs font-semibold text-rose-600 hover:bg-rose-500/10 cursor-pointer transition-colors"
            >
              <Trash2 className="size-3.5" />
              Delete Session
            </button>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg border border-[var(--border-default)] px-4 py-2 text-xs font-semibold text-[var(--text-secondary)] hover:bg-[var(--bg-surface-2)] cursor-pointer"
              >
                Cancel
              </button>

              <button
                type="submit"
                className="flex items-center gap-1.5 rounded-lg bg-[var(--pri)] px-4 py-2 text-xs font-bold text-[var(--primary-contrast)] hover:brightness-110 cursor-pointer shadow-sm"
              >
                <Save className="size-3.5" />
                Save Changes
              </button>
            </div>
          </div>
        </form>
      </motion.div>
    </AnimatePresence>
  );
}
