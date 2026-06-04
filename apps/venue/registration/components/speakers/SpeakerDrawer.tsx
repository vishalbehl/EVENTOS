"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import {
  X, Mail, Phone, MapPin, Building2, CheckCircle2,
  Clock, FileText, Calendar, Pencil, Save, Globe,
  Loader2, AlertCircle, Presentation, ArrowRightLeft,
  Trash2
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { cn, formatDateInTZ, formatTimeRangeInTZ, formatDateTimeInTZ } from "@/lib/utils";
import {
  SpeakerSummary,
  SpeakerTalk,
  useSpeakerTalks,
  useUpdateSpeaker,
  useDeleteSpeaker,
} from "@/hooks/useSpeakers";

import { usePosters } from "@/hooks/usePosters";
import { MoveTalkDialog } from "./MoveTalkDialog";
import { SPEAKER_TYPES } from "@/types/backend";

interface SpeakerDrawerProps {
  speaker: SpeakerSummary;
  eventId: string;
  onClose: () => void;
}

type DrawerTab = "details" | "talks";

export function SpeakerDrawer({ speaker, eventId, onClose }: SpeakerDrawerProps) {
  const [tab, setTab] = useState<DrawerTab>("details");
  const [isEditing, setIsEditing] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [form, setForm] = useState({
    first_name: speaker.first_name,
    last_name: speaker.last_name,
    email: speaker.email,
    phone: speaker.phone || "",
    country: speaker.country || "",
    affiliation: speaker.affiliation || "",
  });

  const { data: talks, isLoading: talksLoading } = useSpeakerTalks(eventId, speaker.id);
  const { data: allPosters } = usePosters(eventId);
  const updateSpeaker = useUpdateSpeaker(eventId);
  const deleteSpeaker = useDeleteSpeaker(eventId);


  const speakerPosters = allPosters?.filter(p => p.speaker_id === speaker.id) || [];

  const [moveTalkTarget, setMoveTalkTarget] = useState<{
    id: string;
    sessionId: string;
    title: string;
  } | null>(null);

  // Lock body scroll while drawer is open
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, []);

  // Intake progress (combined Talks + Posters)
  const totalSlots = (talks?.length ?? 0) + speakerPosters.length;
  const uploadedTalks = talks?.filter(
    (t) => ["uploaded", "approved", "valid", "pending_validation"].includes(t.file_status)
  ).length ?? 0;
  const uploadedPosters = speakerPosters.filter(
    (p) => p.status === "submitted" || p.status === "approved"
  ).length;

  const uploadedSlots = uploadedTalks + uploadedPosters;
  const intakePct = totalSlots > 0 ? Math.round((uploadedSlots / totalSlots) * 100) : 0;

  const handleSave = async () => {
    setSaveError("");
    try {
      await updateSpeaker.mutateAsync({
        speakerId: speaker.id,
        data: {
          first_name: form.first_name.trim(),
          last_name: form.last_name.trim(),
          email: form.email.trim(),
          phone: form.phone.trim() || undefined,
          country: form.country.trim() || undefined,
          affiliation: form.affiliation.trim() || undefined,
        },
      });
      setIsEditing(false);
    } catch (err: any) {
      const detail = err?.response?.data?.detail;
      setSaveError(
        Array.isArray(detail)
          ? detail.map((d: any) => d.msg).join("; ")
          : detail ?? "Failed to save changes."
      );
    }
  };

  const handleDelete = async () => {
    if (!confirm(`Are you sure you want to delete ${speaker.first_name} ${speaker.last_name}? This will remove all talk assignments.`)) {
      return;
    }
    try {
      await deleteSpeaker.mutateAsync(speaker.id);
      onClose();
    } catch (err) {
      // toast handled in hook
    }
  };

  const tabs: { key: DrawerTab; label: string; icon: typeof FileText }[] = [

    { key: "details", label: "Contact & Info", icon: Building2 },
    { key: "talks", label: `Talks (${totalSlots})`, icon: Presentation },
  ];

  return (
    <>
      {/* Backdrop */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="fixed inset-0 bg-[var(--base)]/80 backdrop-blur-md z-[90]"
      />

      {/* Drawer Panel — fixed, no scroll affecting page */}
      <motion.div
        initial={{ x: "100%" }}
        animate={{ x: 0 }}
        exit={{ x: "100%" }}
        transition={{ type: "spring", stiffness: 300, damping: 30 }}
        className="fixed right-0 top-0 h-[100dvh] w-[600px] max-w-full z-[100] flex flex-col"
        style={{ willChange: "transform" }}
      >
        <div className="h-full flex flex-col glass-3d border-l border-default shadow-[-50px_0_100px_color-mix(in_srgb,var(--base)_50%,transparent)]">

          {/* ── Header ─────────────────────────────────────── */}
          <div className="flex-shrink-0 p-7 border-b border-default">
            {/* Action buttons row */}
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-2">
                {isEditing ? (
                  <>
                    <Button
                      size="sm"
                      onClick={handleSave}
                      disabled={updateSpeaker.isPending}
                      className="h-9 px-4 bg-[var(--pri)] hover:bg-[var(--sec)] text-[var(--text)] font-black text-[10px] uppercase tracking-widest rounded-xl border-0"
                    >
                      {updateSpeaker.isPending ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
                      ) : (
                        <Save className="h-3.5 w-3.5 mr-1.5" />
                      )}
                      Save Changes
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => { setIsEditing(false); setSaveError(""); }}
                      className="h-9 px-4 text-muted hover:text-[var(--text)] text-[10px] font-black uppercase tracking-widest rounded-xl"
                    >
                      Cancel
                    </Button>
                  </>
                ) : (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setIsEditing(true)}
                    className="h-9 px-4 border-default bg-[color-mix(in_srgb,var(--text)_5%,transparent)] text-muted hover:text-[var(--text)] font-black text-[10px] uppercase tracking-widest rounded-xl"
                  >
                    <Pencil className="h-3.5 w-3.5 mr-1.5" />
                    Edit Speaker
                  </Button>
                )}
              </div>
              <button
                onClick={onClose}
                className="h-9 w-9 rounded-full glass-3d border-default flex items-center justify-center text-muted hover:text-[var(--text)] transition-all"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Speaker identity */}
            <div className="flex items-center gap-5 mb-5">
              <div className="h-16 w-16 rounded-2xl bg-gradient-to-br from-[var(--pri)]/20 to-[var(--sec)]/20 border border-default flex items-center justify-center text-xl font-black text-[var(--text)] shadow-lg flex-shrink-0">
                {(form.first_name[0] || "?")}{(form.last_name[0] || "?")}
              </div>
              <div className="flex-1 min-w-0">
                {isEditing ? (
                  <div className="flex gap-2">
                    <Input
                      value={form.first_name}
                      onChange={(e) => setForm(f => ({ ...f, first_name: e.target.value }))}
                      placeholder="First name"
                      className="h-9 bg-[color-mix(in_srgb,var(--text)_5%,transparent)] border-default rounded-lg text-[13px] font-bold"
                    />
                    <Input
                      value={form.last_name}
                      onChange={(e) => setForm(f => ({ ...f, last_name: e.target.value }))}
                      placeholder="Last name"
                      className="h-9 bg-[color-mix(in_srgb,var(--text)_5%,transparent)] border-default rounded-lg text-[13px] font-bold"
                    />
                  </div>
                ) : (
                  <>
                    <h2 className="text-xl font-black text-[var(--text)] tracking-tight truncate">
                      {speaker.first_name} {speaker.last_name}
                    </h2>
                    <p className="text-[11px] font-black text-[var(--pri)] uppercase tracking-[0.2em] truncate">
                      {speaker.affiliation || "Speaker"}
                    </p>
                  </>
                )}
                <div className="flex gap-2 mt-2 flex-wrap">
                  <Badge className="bg-[var(--pri)]/15 text-[var(--pri)] border-0 text-[9px] font-black px-2 py-0.5">
                    {speaker.upload_status.toUpperCase()}
                  </Badge>
                  <Badge className="bg-[var(--sec)]/15 text-[var(--sec)] border-0 text-[9px] font-black px-2 py-0.5">
                    {totalSlots} TALK{totalSlots !== 1 ? "S" : ""}
                  </Badge>
                </div>
              </div>
            </div>

            {/* Save error */}
            {saveError && (
              <div className="flex items-center gap-2 p-3 rounded-xl bg-[var(--dan)]/10 border border-[var(--dan)]/20 text-[var(--dan)] text-[11px] font-bold mb-4">
                <AlertCircle className="h-4 w-4 shrink-0" />
                {saveError}
              </div>
            )}

            {/* Intake Progress */}
            {totalSlots > 0 && (
              <div className="p-4 rounded-2xl bg-[color-mix(in_srgb,var(--text)_3%,transparent)] border border-default mb-5">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[10px] font-black text-muted uppercase tracking-[0.2em]">Intake Progress</span>
                  <span className={cn(
                    "text-[12px] font-black",
                    intakePct === 100 ? "text-[var(--success)]" : intakePct > 0 ? "text-[var(--pri)]" : "text-muted"
                  )}>
                    {intakePct}%
                  </span>
                </div>
                <div className="h-2 rounded-full bg-[color-mix(in_srgb,var(--text)_8%,transparent)] overflow-hidden">
                  <div
                    className={cn(
                      "h-full rounded-full transition-all duration-700",
                      intakePct === 100
                        ? "bg-gradient-to-r from-[var(--success)] to-[var(--sec)]"
                        : "bg-gradient-to-r from-[var(--pri)] to-[var(--sec)]"
                    )}
                    style={{ width: `${intakePct}%` }}
                  />
                </div>
                <p className="text-[10px] text-muted mt-1.5">
                  {uploadedSlots} of {totalSlots} file{totalSlots !== 1 ? "s" : ""} submitted
                </p>
              </div>
            )}

            {/* Tab Bar */}
            <div className="flex gap-1 p-1 glass-3d rounded-xl border-default">
              {tabs.map((t) => (
                <button
                  key={t.key}
                  onClick={() => setTab(t.key)}
                  className={cn(
                    "flex-1 flex items-center justify-center gap-1.5 h-9 rounded-lg text-[11px] font-bold transition-all",
                    tab === t.key
                      ? "bg-[var(--pri)] text-[var(--text)] shadow"
                      : "text-muted hover:text-[var(--text)] hover:bg-[color-mix(in_srgb,var(--text)_5%,transparent)]"
                  )}
                >
                  <t.icon className="h-3.5 w-3.5" />
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          {/* ── Scrollable body ─────────────────────────────── */}
          <div className="flex-1 overflow-y-auto">
            <div className="p-7 space-y-5">
              {tab === "details" && (
                <DetailsTab
                  speaker={speaker}
                  form={form}
                  setForm={setForm}
                  isEditing={isEditing}
                />
              )}
              {tab === "talks" && (
                <TalksTab
                  talks={talks || []}
                  posters={speakerPosters}
                  loading={talksLoading}
                  onMoveTalk={(t) => setMoveTalkTarget({
                    id: t.session_speaker_id,
                    sessionId: t.session_id,
                    title: t.talk_title || ""
                  })}
                />
              )}
            </div>
          </div>

          <MoveTalkDialog
            isOpen={!!moveTalkTarget}
            onClose={() => setMoveTalkTarget(null)}
            sessionSpeakerId={moveTalkTarget?.id || ""}
            currentSessionId={moveTalkTarget?.sessionId || ""}
            speakerName={`${speaker.first_name} ${speaker.last_name}`}
            talkTitle={moveTalkTarget?.title || ""}
          />

          <div className="flex-shrink-0 p-6 border-t border-default flex gap-3">
            {isEditing ? (
              <Button 
                onClick={handleSave}
                disabled={updateSpeaker.isPending}
                className="flex-1 h-11 bg-[var(--pri)] hover:bg-[var(--sec)] text-[var(--text)] font-black uppercase tracking-widest text-[10px] rounded-xl border-0 shadow-lg"
              >
                {updateSpeaker.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                Save Changes
              </Button>
            ) : (
              <Button 
                onClick={() => setIsEditing(true)}
                className="flex-1 h-11 bg-[var(--pri)] hover:bg-[var(--sec)] text-[var(--text)] font-black uppercase tracking-widest text-[10px] rounded-xl border-0 shadow-lg"
              >
                <Pencil className="mr-2 h-4 w-4" /> Edit Profile
              </Button>
            )}

            <Button variant="outline" className="h-11 px-5 border-default bg-[color-mix(in_srgb,var(--text)_5%,transparent)] text-muted hover:text-[var(--text)] rounded-xl">
              <Mail className="h-4 w-4" />
            </Button>
            <Button 
              variant="outline" 
              onClick={handleDelete}
              disabled={deleteSpeaker.isPending}
              className="h-11 px-5 border-default bg-[var(--dan)]/5 text-[var(--dan)] hover:bg-[var(--dan)] hover:text-white rounded-xl transition-all"
            >
              {deleteSpeaker.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
            </Button>
          </div>

        </div>
      </motion.div>
    </>
  );
}

/* ── Details Tab ────────────────────────────────────────────── */
type FormState = {
  first_name: string; last_name: string; email: string;
  phone: string; country: string; affiliation: string;
};

function DetailsTab({
  speaker, form, setForm, isEditing,
}: {
  speaker: SpeakerSummary;
  form: FormState;
  setForm: React.Dispatch<React.SetStateAction<FormState>>;
  isEditing: boolean;
}) {
  const fields: {
    key: keyof FormState;
    label: string;
    icon: typeof Mail;
    type?: string;
  }[] = [
      { key: "email", label: "Email", icon: Mail, type: "email" },
      { key: "phone", label: "Phone", icon: Phone, type: "tel" },
      { key: "affiliation", label: "Organization", icon: Building2 },
      { key: "country", label: "Country", icon: Globe },
    ];

  return (
    <div className="space-y-4">
      <h4 className="text-[10px] font-black text-muted uppercase tracking-[0.2em]">Contact Details</h4>
      <div className="space-y-2">
        {fields.map((f) => (
          <div
            key={f.key}
            className="flex items-center gap-4 p-3.5 rounded-xl bg-[color-mix(in_srgb,var(--text)_3%,transparent)] border border-default hover:border-[var(--pri)]/30 transition-colors group"
          >
            <div className="h-9 w-9 rounded-lg bg-[color-mix(in_srgb,var(--text)_5%,transparent)] flex items-center justify-center shrink-0 group-hover:bg-[var(--pri)]/10 transition-colors">
              <f.icon className="h-4 w-4 text-muted group-hover:text-[var(--pri)] transition-colors" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[9px] font-black text-muted uppercase tracking-[0.2em] mb-0.5">{f.label}</p>
              {isEditing ? (
                <Input
                  type={f.type || "text"}
                  value={form[f.key]}
                  onChange={(e) => setForm((prev) => ({ ...prev, [f.key]: e.target.value }))}
                  className="h-8 bg-transparent border-0 border-b border-default rounded-none px-0 text-[13px] font-bold text-[var(--text)] focus-visible:ring-0 focus-visible:border-[var(--pri)]"
                />
              ) : (
                <p className="text-[13px] font-bold text-[var(--text)] truncate">
                  {(speaker as any)[f.key] || "—"}
                </p>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Check-in status */}
      <div className="flex items-center gap-4 p-3.5 rounded-xl bg-[color-mix(in_srgb,var(--text)_3%,transparent)] border border-default">
        <div className="h-9 w-9 rounded-lg bg-[color-mix(in_srgb,var(--text)_5%,transparent)] flex items-center justify-center shrink-0">
          <Calendar className="h-4 w-4 text-muted" />
        </div>
        <div className="flex-1">
          <p className="text-[9px] font-black text-muted uppercase tracking-[0.2em] mb-0.5">Check-In Status</p>
          <p className="text-[13px] font-bold text-[var(--text)]">
            {speaker.checked_in_at
              ? `✓ ${formatDateTimeInTZ(speaker.checked_in_at, 'Asia/Kolkata')}`
              : "Not yet checked in"}
          </p>
        </div>
      </div>

      {/* Email logs */}
      {(speaker.email_logs?.length ?? 0) > 0 && (
        <>
          <h4 className="text-[10px] font-black text-muted uppercase tracking-[0.2em] pt-2">
            Communication Log
          </h4>
          <div className="space-y-3 relative before:absolute before:left-[7px] before:top-2 before:bottom-2 before:w-[1px] before:bg-[color-mix(in_srgb,var(--text)_5%,transparent)]">
            {speaker.email_logs?.map((log, i) => (
              <div key={i} className="relative pl-8">
                <div className={cn(
                  "absolute left-0 top-1.5 h-3.5 w-3.5 rounded-full border-4 border-[var(--surf)]",
                  log.status === "sent" ? "bg-[var(--pri)]" : "bg-[var(--dan)]"
                )} />
                <p className="text-[12px] font-bold text-muted">{log.subject}</p>
                <p className="text-[10px] font-black text-muted uppercase tracking-widest mt-1">
                  {log.status.toUpperCase()} · {formatDateInTZ(log.sent_at, 'Asia/Kolkata')}
                </p>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

/* ── Talks Tab ──────────────────────────────────────────────── */
function TalksTab({
  talks,
  posters,
  loading,
  onMoveTalk
}: {
  talks: SpeakerTalk[];
  posters: any[];
  loading: boolean;
  onMoveTalk: (t: SpeakerTalk) => void;
}) {
  if (loading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-28 w-full rounded-xl bg-[color-mix(in_srgb,var(--text)_5%,transparent)]" />
        ))}
      </div>
    );
  }

  if (talks.length === 0 && posters.length === 0) {
    return (
      <div className="text-center py-16">
        <Presentation className="h-10 w-10 text-muted mx-auto mb-4 opacity-40" />
        <p className="text-[13px] font-bold text-muted">No talks assigned yet.</p>
        <p className="text-[11px] text-muted opacity-60 mt-1">
          Import a schedule or manually assign this speaker to a session.
        </p>
      </div>
    );
  }

  const sessionStatusStyle: Record<string, string> = {
    scheduled: "bg-[var(--pri)]/15 text-[var(--pri)]",
    in_progress: "bg-[var(--warn)]/15 text-[var(--warn)]",
    completed: "bg-[var(--success)]/15 text-[var(--success)]",
    cancelled: "bg-[var(--dan)]/15 text-[var(--dan)]",
  };

  const fileStatusStyle: Record<string, string> = {
    approved: "bg-[var(--success)]/15 text-[var(--success)]",
    uploaded: "bg-[var(--sec)]/15 text-[var(--sec)]",
    pending_validation: "bg-[var(--sec)]/15 text-[var(--sec)]",
    valid: "bg-[var(--sec)]/15 text-[var(--sec)]",
    rejected: "bg-[var(--dan)]/15 text-[var(--dan)]",
    pending: "bg-[var(--warn)]/15 text-[var(--warn)]",
  };

  return (
    <div className="space-y-6">
      <h4 className="text-[10px] font-black text-muted uppercase tracking-[0.2em]">
        {talks.length + posters.length} total assignment{talks.length + posters.length !== 1 ? "s" : ""}
      </h4>

      {/* Talks Section */}
      {talks.length > 0 && (
        <div className="space-y-4">
          <p className="text-[10px] font-black text-[var(--pri)] uppercase tracking-widest flex items-center gap-2">
            <Presentation className="h-3 w-3" /> Oral Presentations
          </p>
          {talks.map((talk, idx) => {
            const dateStr = formatDateInTZ(talk.start_time, talk.event_timezone);
            const timeStr = formatTimeRangeInTZ(talk.start_time, talk.end_time, talk.event_timezone);

            return (
              <div
                key={talk.session_speaker_id}
                className="rounded-xl border border-default overflow-hidden group/talk"
              >
                {/* Session header stripe */}
                <div className="px-4 py-2.5 bg-[color-mix(in_srgb,var(--text)_4%,transparent)] border-b border-default flex items-center justify-between gap-3">
                  <div className="min-w-0 flex-1 flex items-center gap-2 flex-wrap">
                    <span className="text-[9px] font-black text-muted uppercase tracking-widest shrink-0">
                      {talk.session_code}
                    </span>
                    <span className="text-[12px] font-bold text-[var(--text)] truncate max-w-[200px]">
                      {talk.session_name}
                    </span>
                    {talk.speaker_type ? (() => {
                      const typeConfig = SPEAKER_TYPES.find(t => t.code === talk.speaker_type);
                      const color = typeConfig?.color || "#64748b";
                      return (
                        <span 
                          className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold shrink-0"
                          style={{
                            backgroundColor: `${color}26`, // 15% opacity
                            color: color
                          }}
                        >
                          {talk.speaker_type}
                        </span>
                      );
                    })() : (
                      <span 
                        className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold shrink-0"
                        style={{
                          backgroundColor: "#64748b26",
                          color: "#64748b"
                        }}
                      >
                        —
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => onMoveTalk(talk)}
                      className="h-7 px-2.5 text-[9px] font-black uppercase tracking-widest text-[var(--sec)] hover:bg-[var(--sec)]/10 opacity-0 group-hover/talk:opacity-100 transition-all"
                    >
                      <ArrowRightLeft className="h-3 w-3 mr-1" /> Move
                    </Button>
                    <Badge className={cn("text-[8px] font-black px-2 py-0.5 border-0 shrink-0", sessionStatusStyle[talk.session_status] || sessionStatusStyle.scheduled)}>
                      {talk.session_status.toUpperCase()}
                    </Badge>
                  </div>
                </div>

                {/* Talk body */}
                <div className="p-4 space-y-3 bg-[color-mix(in_srgb,var(--text)_2%,transparent)]">
                  {/* Talk title */}
                  <p className="text-[13px] font-bold text-[var(--text)] leading-snug">
                    {talk.talk_title || <span className="text-muted italic">No title assigned</span>}
                  </p>

                  {/* Meta row */}
                  <div className="flex flex-wrap gap-4 text-[10px] font-bold text-muted">
                    <span className="flex items-center gap-1.5">
                      <Calendar className="h-3 w-3 text-[var(--pri)]" />
                      {dateStr}
                    </span>
                    <span className="flex items-center gap-1.5">
                      <Clock className="h-3 w-3 text-[var(--pri)]" />
                      {timeStr}
                    </span>
                    {talk.room_name && (
                      <span className="flex items-center gap-1.5">
                        <MapPin className="h-3 w-3 text-[var(--pri)]" />
                        {talk.room_name}
                      </span>
                    )}
                  </div>

                  {/* File status + progress */}
                  <div className="flex items-center justify-between">
                    <Badge className={cn("text-[8px] font-black px-2.5 py-1 border-0", fileStatusStyle[talk.file_status] || fileStatusStyle.pending)}>
                      <FileText className="h-2.5 w-2.5 mr-1" />
                      {talk.file_status === "approved"
                        ? "✓ APPROVED"
                        : ["uploaded", "valid", "pending_validation"].includes(talk.file_status)
                          ? "UPLOADED"
                          : talk.file_status === "rejected"
                            ? "REJECTED"
                            : "AWAITING FILE"}
                    </Badge>
                    <div className="flex items-center gap-2">
                      <div className="h-1.5 w-20 rounded-full bg-[color-mix(in_srgb,var(--text)_8%,transparent)] overflow-hidden">
                        <div
                          className={cn(
                            "h-full rounded-full transition-all",
                            talk.file_status === "approved"
                              ? "bg-[var(--success)]"
                              : ["uploaded", "valid", "pending_validation"].includes(talk.file_status)
                                ? "bg-[var(--sec)]"
                                : talk.file_status === "rejected"
                                  ? "bg-[var(--dan)]"
                                  : "bg-[var(--warn)]"
                          )}
                          style={{
                            width: `${talk.file_status === "pending" ? 0 : 100}%`,
                          }}
                        />
                      </div>
                      <span className="text-[9px] font-black text-muted">
                        {talk.files_uploaded}/{talk.files_total}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Posters Section */}
      {posters.length > 0 && (
        <div className="space-y-4">
          <p className="text-[10px] font-black text-[var(--sec)] uppercase tracking-widest flex items-center gap-2">
            <FileText className="h-3 w-3" /> ePosters
          </p>
          {posters.map((poster) => (
            <div
              key={poster.id}
              className="rounded-xl border border-default overflow-hidden bg-[color-mix(in_srgb,var(--text)_2%,transparent)]"
            >
              <div className="px-4 py-2.5 bg-[color-mix(in_srgb,var(--text)_4%,transparent)] border-b border-default flex items-center justify-between">
                <span className="text-[9px] font-black text-muted uppercase tracking-widest">
                  ID: {poster.id.slice(0, 8)}
                </span>
                <Badge className={cn(
                  "text-[8px] font-black px-2 py-0.5 border-0",
                  poster.status === 'approved' ? "bg-[var(--success)]/15 text-[var(--success)]" :
                    poster.status === 'submitted' ? "bg-[var(--sec)]/15 text-[var(--sec)]" :
                      "bg-[var(--warn)]/15 text-[var(--warn)]"
                )}>
                  {poster.status.toUpperCase()}
                </Badge>
              </div>
              <div className="p-4 space-y-2">
                <p className="text-[13px] font-bold text-[var(--text)] leading-snug">{poster.title}</p>
                <div className="flex items-center gap-3 text-[10px] font-bold text-muted">
                  <Badge variant="outline" className="text-[8px] opacity-70">{poster.category}</Badge>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
