"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import {
  X,
  Mail,
  Phone,
  Building2,
  Calendar,
  Pencil,
  Save,
  Globe,
  Loader2,
  AlertCircle,
  Presentation,
  ArrowRightLeft,
  Trash2,
  FileText,
  Clock,
  MapPin,
  CheckCircle2,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  cn,
  formatDateInTZ,
  formatTimeRangeInTZ,
  formatDateTimeInTZ,
  formatApiError,
} from "@/lib/utils";
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
import { useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import { toast } from "sonner";
import { useOperationAccess } from "@/lib/capabilities";

const countries = [
  "Afghanistan", "Albania", "Algeria", "Andorra", "Angola", "Antigua and Barbuda", "Argentina", "Armenia", "Australia", "Austria",
  "Azerbaijan", "Bahamas", "Bahrain", "Bangladesh", "Barbados", "Belarus", "Belgium", "Belize", "Benin", "Bhutan",
  "Bolivia", "Bosnia and Herzegovina", "Botswana", "Brazil", "Brunei", "Bulgaria", "Burkina Faso", "Burundi", "Cabo Verde",
  "Cambodia", "Cameroon", "Canada", "Central African Republic", "Chad", "Chile", "China", "Colombia", "Comoros",
  "Congo", "Costa Rica", "Croatia", "Cuba", "Cyprus", "Czech Republic", "Denmark", "Djibouti", "Dominica", "Dominican Republic",
  "Ecuador", "Egypt", "El Salvador", "Equatorial Guinea", "Eritrea", "Estonia", "Eswatini", "Ethiopia", "Fiji", "Finland",
  "France", "Gabon", "Gambia", "Georgia", "Germany", "Ghana", "Greece", "Grenada", "Guatemala", "Guinea", "Guinea-Bissau",
  "Guyana", "Haiti", "Honduras", "Hungary", "Iceland", "India", "Indonesia", "Iran", "Iraq", "Ireland", "Israel", "Italy",
  "Jamaica", "Japan", "Jordan", "Kazakhstan", "Kenya", "Kiribati", "Korea, North", "Korea, South", "Kosovo", "Kuwait",
  "Kyrgyzstan", "Laos", "Latvia", "Lebanon", "Lesotho", "Liberia", "Libya", "Liechtenstein", "Lithuania", "Luxembourg",
  "Madagascar", "Malawi", "Malaysia", "Maldives", "Mali", "Malta", "Marshall Islands", "Mauritania", "Mauritius", "Mexico",
  "Micronesia", "Moldova", "Monaco", "Mongolia", "Montenegro", "Morocco", "Mozambique", "Myanmar", "Namibia", "Nauru",
  "Nepal", "Netherlands", "New Zealand", "Nicaragua", "Niger", "Nigeria", "North Macedonia", "Norway", "Oman", "Pakistan",
  "Palau", "Panama", "Papua New Guinea", "Paraguay", "Peru", "Philippines", "Poland", "Portugal", "Qatar", "Romania",
  "Russia", "Rwanda", "Saint Kitts and Nevis", "Saint Lucia", "Saint Vincent", "Samoa", "San Marino", "Sao Tome and Principe",
  "Saudi Arabia", "Senegal", "Serbia", "Seychelles", "Sierra Leone", "Singapore", "Slovakia", "Slovenia", "Solomon Islands",
  "Somalia", "South Africa", "Spain", "Sri Lanka", "Sudan", "Suriname", "Sweden", "Switzerland", "Syria", "Taiwan",
  "Tajikistan", "Tanzania", "Thailand", "Timor-Leste", "Togo", "Tonga", "Trinidad and Tobago", "Tunisia", "Turkey",
  "Turkmenistan", "Tuvalu", "Uganda", "Ukraine", "United Arab Emirates", "United Kingdom", "United States", "Uruguay",
  "Uzbekistan", "Vanuatu", "Vatican City", "Venezuela", "Vietnam", "Yemen", "Zambia", "Zimbabwe",
];

interface SpeakerDrawerProps {
  speaker: SpeakerSummary;
  eventId: string;
  onClose: () => void;
}

type DrawerTab = "details" | "talks" | "profile";

export function SpeakerDrawer({ speaker, eventId, onClose }: SpeakerDrawerProps) {
  const queryClient = useQueryClient();
  const profileAccess = useOperationAccess("speakers.profiles.manage");
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

  // Profile States
  const [profileData, setProfileData] = useState<any | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileError, setProfileError] = useState("");
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [showPublicPreview, setShowPublicPreview] = useState(false);
  const [profileForm, setProfileForm] = useState({
    designation: "",
    title: "",
    organisation_name: "",
    department: "",
    city: "",
    country: "",
    bio: "",
    extended_bio: "",
    website_url: "",
    linkedin_url: "",
    twitter_url: "",
    research_interests: [] as string[],
    languages_spoken: [] as string[],
    photo_consent: false,
    profile_photo_url: "",
  });

  useEffect(() => {
    if (tab === "profile") {
      setProfileLoading(true);
      setProfileError("");
      apiClient
        .get<any>(`/events/${eventId}/speakers/${speaker.id}/profile`)
        .then((res) => {
          setProfileData(res);
          setProfileForm({
            designation: res.designation || "",
            title: res.title || "",
            organisation_name: res.organisation_name || "",
            department: res.department || "",
            city: res.city || "",
            country: res.country || "",
            bio: res.bio || "",
            extended_bio: res.extended_bio || "",
            website_url: res.website_url || "",
            linkedin_url: res.linkedin_url || "",
            twitter_url: res.twitter_url || "",
            research_interests: res.research_interests || [],
            languages_spoken: res.languages_spoken || [],
            photo_consent: res.photo_consent || false,
            profile_photo_url: res.profile_photo_url || "",
          });
        })
        .catch((err) => {
          if (err.response?.status === 404) {
            setProfileData(null);
            setProfileForm({
              designation: "",
              title: "",
              organisation_name: speaker.affiliation || "",
              department: "",
              city: "",
              country: speaker.country || "",
              bio: "",
              extended_bio: "",
              website_url: "",
              linkedin_url: "",
              twitter_url: "",
              research_interests: [],
              languages_spoken: [],
              photo_consent: false,
              profile_photo_url: "",
            });
          } else {
            setProfileError("Failed to load speaker profile.");
          }
        })
        .finally(() => {
          setProfileLoading(false);
        });
    }
  }, [tab, speaker.id, eventId, speaker.affiliation, speaker.country]);

  const handleSaveProfile = async () => {
    if (!profileAccess.enabled) {
      toast.error(
        `Speaker profile editing is unavailable: ${(profileAccess.reason || "RESOLUTION_UNAVAILABLE").replaceAll("_", " ").toLowerCase()}.`
      );
      return;
    }
    try {
      setProfileError("");
      const res = await apiClient.put<any>(
        `/events/${eventId}/speakers/${speaker.id}/profile`,
        profileForm
      );
      setProfileData(res);
      setIsEditingProfile(false);
      toast.success("Speaker profile saved successfully!");
      queryClient.invalidateQueries({ queryKey: ["speakers", eventId] });
    } catch (err: any) {
      setProfileError(formatApiError(err, "Failed to save profile."));
      toast.error("Failed to save speaker profile.");
    }
  };

  const { data: talks, isLoading: talksLoading } = useSpeakerTalks(eventId, speaker.id);
  const { data: allPosters } = usePosters(eventId);
  const updateSpeaker = useUpdateSpeaker(eventId);
  const deleteSpeaker = useDeleteSpeaker(eventId);

  const speakerPosters = allPosters?.filter((p) => p.speaker_id === speaker.id) || [];

  const [moveTalkTarget, setMoveTalkTarget] = useState<{
    id: string;
    sessionId: string;
    title: string;
  } | null>(null);

  // Lock body scroll while drawer is open
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  const totalSlots = (talks?.length ?? 0) + speakerPosters.length;
  const uploadedTalks =
    talks?.filter((t) =>
      ["uploaded", "approved", "valid", "pending_validation"].includes(t.file_status)
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
    if (
      !confirm(
        `Are you sure you want to delete ${speaker.first_name} ${speaker.last_name}? This will remove all talk assignments.`
      )
    ) {
      return;
    }
    try {
      await deleteSpeaker.mutateAsync(speaker.id);
      onClose();
    } catch {
      // toast handled in hook
    }
  };

  const tabs: { key: DrawerTab; label: string; icon: any }[] = [
    { key: "details", label: "Contact & Info", icon: Building2 },
    { key: "talks", label: `Talks (${totalSlots})`, icon: Presentation },
    { key: "profile", label: "Profile", icon: FileText },
  ];

  return (
    <>
      {/* Backdrop */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="fixed inset-0 bg-black/60 z-[90]"
      />

      {/* Drawer Panel */}
      <motion.div
        initial={{ x: "100%" }}
        animate={{ x: 0 }}
        exit={{ x: "100%" }}
        transition={{ type: "spring", stiffness: 300, damping: 30 }}
        className="fixed right-0 top-0 h-[100dvh] w-[600px] max-w-full z-[100] flex flex-col bg-[var(--card)] border-l border-[var(--border-default)] shadow-lg"
      >
        {/* Header */}
        <div className="flex-shrink-0 p-6 border-b border-[var(--border-subtle)]">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              {tab === "details" &&
                (isEditing ? (
                  <>
                    <button
                      type="button"
                      onClick={handleSave}
                      disabled={updateSpeaker.isPending}
                      className="flex items-center gap-1.5 h-8 px-3 rounded-md bg-[var(--pri)] text-[var(--primary-contrast)] font-bold text-xs shadow-sm hover:opacity-90 transition-opacity disabled:opacity-40 cursor-pointer"
                    >
                      {updateSpeaker.isPending ? (
                        <Loader2 className="size-3.5 animate-spin" />
                      ) : (
                        <Save className="size-3.5" />
                      )}
                      Save Changes
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setIsEditing(false);
                        setSaveError("");
                      }}
                      className="h-8 px-3 rounded-md border border-[var(--border-default)] bg-[var(--bg-surface-2)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] text-xs font-semibold cursor-pointer"
                    >
                      Cancel
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    onClick={() => setIsEditing(true)}
                    className="flex items-center gap-1.5 h-8 px-3 rounded-md border border-[var(--border-default)] bg-[var(--bg-surface-2)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] font-bold text-xs transition-colors cursor-pointer"
                  >
                    <Pencil className="size-3.5" />
                    Edit Speaker
                  </button>
                ))}

              {tab === "profile" &&
                !profileLoading &&
                !profileError &&
                (isEditingProfile ? (
                  <>
                    <button
                      type="button"
                      onClick={handleSaveProfile}
                      className="flex items-center gap-1.5 h-8 px-3 rounded-md bg-[var(--pri)] text-[var(--primary-contrast)] font-bold text-xs shadow-sm hover:opacity-90 transition-opacity cursor-pointer"
                    >
                      <Save className="size-3.5" /> Save Profile
                    </button>
                    <button
                      type="button"
                      onClick={() => setIsEditingProfile(false)}
                      className="h-8 px-3 rounded-md border border-[var(--border-default)] bg-[var(--bg-surface-2)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] text-xs font-semibold cursor-pointer"
                    >
                      Cancel
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    onClick={() => setIsEditingProfile(true)}
                    className="flex items-center gap-1.5 h-8 px-3 rounded-md border border-[var(--border-default)] bg-[var(--bg-surface-2)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] font-bold text-xs transition-colors cursor-pointer"
                  >
                    <Pencil className="size-3.5" /> Edit Profile
                  </button>
                ))}
            </div>

            <button
              type="button"
              onClick={onClose}
              className="flex size-8 items-center justify-center rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface-2)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)] transition-colors cursor-pointer"
            >
              <X className="size-4" />
            </button>
          </div>

          <div className="flex items-center gap-4 mb-4">
            <div className="flex size-14 shrink-0 items-center justify-center rounded-lg bg-[var(--pri)]/10 text-lg font-bold text-[var(--pri)] border border-[var(--pri)]/20">
              {form.first_name[0] || "?"}
              {form.last_name[0] || "?"}
            </div>
            <div className="flex-1 min-w-0">
              {isEditing ? (
                <div className="flex gap-2">
                  <input
                    value={form.first_name}
                    onChange={(e) => setForm((f) => ({ ...f, first_name: e.target.value }))}
                    placeholder="First name"
                    className="h-8 w-full rounded-md border border-[var(--border-default)] bg-[var(--bg-surface-2)] px-2.5 text-xs text-[var(--text-primary)] font-bold focus:border-[var(--pri)] focus:outline-none"
                  />
                  <input
                    value={form.last_name}
                    onChange={(e) => setForm((f) => ({ ...f, last_name: e.target.value }))}
                    placeholder="Last name"
                    className="h-8 w-full rounded-md border border-[var(--border-default)] bg-[var(--bg-surface-2)] px-2.5 text-xs text-[var(--text-primary)] font-bold focus:border-[var(--pri)] focus:outline-none"
                  />
                </div>
              ) : (
                <>
                  <h2 className="text-lg font-bold text-[var(--text-primary)] tracking-tight truncate">
                    {speaker.first_name} {speaker.last_name}
                  </h2>
                  <p className="text-xs font-medium text-[var(--pri)] truncate">
                    {speaker.affiliation || "Speaker"}
                  </p>
                </>
              )}
              <div className="flex gap-2 mt-2 flex-wrap">
                <span className="inline-flex items-center rounded bg-[var(--pri)]/10 text-[var(--pri)] text-[10px] font-bold px-2 py-0.5 border border-[var(--pri)]/20">
                  {speaker.upload_status.toUpperCase()}
                </span>
                <span className="inline-flex items-center rounded bg-[var(--bg-surface-2)] text-[var(--text-secondary)] text-[10px] font-bold px-2 py-0.5 border border-[var(--border-default)]">
                  {totalSlots} TALK{totalSlots !== 1 ? "S" : ""}
                </span>
              </div>
            </div>
          </div>

          {/* Save error */}
          {saveError && (
            <div className="flex items-center gap-2 p-3 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-600 dark:text-rose-400 text-xs font-medium mb-3">
              <AlertCircle className="size-4 shrink-0" />
              {saveError}
            </div>
          )}

          {/* Intake Progress */}
          {totalSlots > 0 && (
            <div className="p-3.5 rounded-lg bg-[var(--bg-surface-2)] border border-[var(--border-default)] mb-4">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">
                  Intake Progress
                </span>
                <span
                  className={cn(
                    "text-xs font-bold",
                    intakePct === 100
                      ? "text-emerald-600 dark:text-emerald-400"
                      : intakePct > 0
                      ? "text-[var(--pri)]"
                      : "text-[var(--text-tertiary)]"
                  )}
                >
                  {intakePct}%
                </span>
              </div>
              <div className="h-1.5 rounded-full bg-[var(--card)] overflow-hidden">
                <div
                  className={cn(
                    "h-full rounded-full transition-all duration-700",
                    intakePct === 100 ? "bg-emerald-500" : "bg-[var(--pri)]"
                  )}
                  style={{ width: `${intakePct}%` }}
                />
              </div>
              <p className="text-[10px] text-[var(--text-tertiary)] mt-1">
                {uploadedSlots} of {totalSlots} file{totalSlots !== 1 ? "s" : ""} submitted
              </p>
            </div>
          )}

          {/* Tab Bar */}
          <div className="flex gap-1 p-1 bg-[var(--bg-surface-2)] rounded-lg border border-[var(--border-default)]">
            {tabs.map((t) => (
              <button
                type="button"
                key={t.key}
                onClick={() => setTab(t.key)}
                className={cn(
                  "flex-1 flex items-center justify-center gap-1.5 h-8 rounded-md text-xs font-semibold transition-colors cursor-pointer",
                  tab === t.key
                    ? "bg-[var(--card)] text-[var(--text-primary)] shadow-sm font-bold border border-[var(--border-subtle)]"
                    : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                )}
              >
                <t.icon className="size-3.5" />
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* ── Scrollable body ─────────────────────────────── */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
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
              onMoveTalk={(t) =>
                setMoveTalkTarget({
                  id: t.session_speaker_id,
                  sessionId: t.session_id,
                  title: t.talk_title || "",
                })
              }
            />
          )}
          {tab === "profile" && (
            <ProfileTab
              speaker={speaker}
              eventId={eventId}
              profileForm={profileForm}
              setProfileForm={setProfileForm}
              profileLoading={profileLoading}
              profileError={profileError}
              isEditingProfile={isEditingProfile}
              setIsEditingProfile={setIsEditingProfile}
              showPublicPreview={showPublicPreview}
              setShowPublicPreview={setShowPublicPreview}
              onSaveProfile={handleSaveProfile}
            />
          )}
        </div>

        <MoveTalkDialog
          isOpen={!!moveTalkTarget}
          onClose={() => setMoveTalkTarget(null)}
          sessionSpeakerId={moveTalkTarget?.id || ""}
          currentSessionId={moveTalkTarget?.sessionId || ""}
          speakerName={`${speaker.first_name} ${speaker.last_name}`}
          talkTitle={moveTalkTarget?.title || ""}
        />

        {/* Footer Actions */}
        <div className="flex-shrink-0 p-4 border-t border-[var(--border-subtle)] bg-[var(--bg-surface-2)] flex gap-2.5">
          {tab === "profile" ? (
            isEditingProfile ? (
              <button
                type="button"
                onClick={handleSaveProfile}
                className="flex-1 h-9 rounded-lg bg-[var(--pri)] text-[var(--primary-contrast)] font-bold text-xs shadow-sm hover:opacity-90 transition-opacity cursor-pointer flex items-center justify-center gap-1.5"
              >
                <Save className="size-3.5" /> Save Profile
              </button>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => setIsEditingProfile(true)}
                  className="flex-1 h-9 rounded-lg border border-[var(--border-default)] bg-[var(--card)] text-[var(--text-primary)] font-semibold text-xs hover:bg-[var(--bg-surface-hover)] transition-colors cursor-pointer flex items-center justify-center gap-1.5"
                >
                  <Pencil className="size-3.5" /> Edit Profile
                </button>
                <button
                  type="button"
                  onClick={() => setShowPublicPreview(true)}
                  className="flex-1 h-9 rounded-lg bg-[var(--pri)] text-[var(--primary-contrast)] font-bold text-xs shadow-sm hover:opacity-90 transition-opacity cursor-pointer"
                >
                  Public Profile
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    try {
                      const loadingId = toast.loading("Sending request email...");
                      await apiClient.post(
                        `/events/${eventId}/emails/send-single`,
                        {
                          recipient: speaker.email,
                          template: "upload_invite",
                          link: `${window.location.origin}/${eventId}/${speaker.speaker_code || speaker.id}?tab=profile`,
                        },
                        { headers: { "Idempotency-Key": crypto.randomUUID() } }
                      );
                      toast.success("Profile update requested successfully!", { id: loadingId });
                    } catch (err: any) {
                      toast.error(formatApiError(err, "Failed to send request email."));
                    }
                  }}
                  className="flex size-9 items-center justify-center rounded-lg border border-[var(--border-default)] bg-[var(--card)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)] transition-colors cursor-pointer shrink-0"
                  title="Send Profile Request Email"
                >
                  <Mail className="size-4" />
                </button>
              </>
            )
          ) : (
            <>
              {isEditing ? (
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={updateSpeaker.isPending}
                  className="flex-1 h-9 rounded-lg bg-[var(--pri)] text-[var(--primary-contrast)] font-bold text-xs shadow-sm hover:opacity-90 transition-opacity disabled:opacity-40 cursor-pointer flex items-center justify-center gap-1.5"
                >
                  {updateSpeaker.isPending ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <Save className="size-3.5" />
                  )}
                  Save Changes
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setIsEditing(true)}
                  className="flex-1 h-9 rounded-lg bg-[var(--pri)] text-[var(--primary-contrast)] font-bold text-xs shadow-sm hover:opacity-90 transition-opacity cursor-pointer flex items-center justify-center gap-1.5"
                >
                  <Pencil className="size-3.5" /> Edit Speaker
                </button>
              )}

              <button
                type="button"
                onClick={handleDelete}
                disabled={deleteSpeaker.isPending}
                className="flex size-9 items-center justify-center rounded-lg border border-rose-500/20 bg-rose-500/5 text-rose-600 hover:bg-rose-500 hover:text-white transition-colors cursor-pointer shrink-0"
                title="Delete speaker"
              >
                {deleteSpeaker.isPending ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Trash2 className="size-4" />
                )}
              </button>
            </>
          )}
        </div>
      </motion.div>

      {/* Public Profile Preview Modal */}
      {showPublicPreview && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/60 p-4">
          <div className="w-[450px] max-w-full rounded-lg border border-[var(--border-default)] bg-[var(--card)] p-6 shadow-md flex flex-col space-y-4">
            <div className="flex items-center justify-between border-b border-[var(--border-subtle)] pb-3">
              <span className="text-xs font-bold uppercase tracking-wider text-[var(--text-primary)]">
                Public Profile Preview
              </span>
              <button
                type="button"
                onClick={() => setShowPublicPreview(false)}
                className="rounded-md p-1 text-[var(--text-tertiary)] hover:bg-[var(--bg-surface-hover)] hover:text-[var(--text-primary)] cursor-pointer"
              >
                <X className="size-4" />
              </button>
            </div>

            <div className="flex flex-col items-center text-center space-y-3 py-2">
              <div className="size-24 rounded-full border-2 border-[var(--border-default)] bg-[var(--bg-surface-2)] overflow-hidden flex items-center justify-center shadow-sm">
                {profileForm.profile_photo_url ? (
                  <img
                    src={profileForm.profile_photo_url}
                    alt={speaker.first_name}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <span className="text-2xl font-bold text-[var(--text-tertiary)]">
                    {speaker.first_name[0]}
                    {speaker.last_name[0]}
                  </span>
                )}
              </div>

              <div>
                <h2 className="text-base font-bold text-[var(--text-primary)] tracking-tight">
                  {profileForm.designation} {speaker.first_name} {speaker.last_name}
                </h2>
                <p className="text-xs font-semibold text-[var(--pri)] mt-0.5">
                  {profileForm.title || "Presenter"}
                </p>
                <p className="text-xs text-[var(--text-secondary)]">
                  {profileForm.organisation_name || speaker.affiliation || "Independent"}
                </p>
              </div>

              {profileForm.bio && (
                <div className="bg-[var(--bg-surface-2)] border border-[var(--border-default)] p-3 rounded-lg text-left text-xs text-[var(--text-secondary)] leading-relaxed italic w-full">
                  &ldquo;{profileForm.bio}&rdquo;
                </div>
              )}

              <div className="flex gap-4 pt-1 text-xs font-semibold text-[var(--pri)]">
                {profileForm.linkedin_url && (
                  <a
                    href={profileForm.linkedin_url}
                    target="_blank"
                    rel="noreferrer"
                    className="hover:underline"
                  >
                    LinkedIn
                  </a>
                )}
                {profileForm.twitter_url && (
                  <a
                    href={profileForm.twitter_url}
                    target="_blank"
                    rel="noreferrer"
                    className="hover:underline"
                  >
                    Twitter/X
                  </a>
                )}
                {profileForm.website_url && (
                  <a
                    href={profileForm.website_url}
                    target="_blank"
                    rel="noreferrer"
                    className="hover:underline"
                  >
                    Website
                  </a>
                )}
              </div>
            </div>

            <button
              type="button"
              onClick={() => setShowPublicPreview(false)}
              className="w-full h-9 rounded-lg bg-[var(--pri)] text-[var(--primary-contrast)] font-bold text-xs shadow-sm hover:opacity-90 transition-opacity cursor-pointer"
            >
              Close Preview
            </button>
          </div>
        </div>
      )}
    </>
  );
}

/* ── Details Tab ────────────────────────────────────────────── */
type FormState = {
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  country: string;
  affiliation: string;
};

function DetailsTab({
  speaker,
  form,
  setForm,
  isEditing,
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
      <h4 className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">
        Contact Details
      </h4>
      <div className="space-y-2">
        {fields.map((f) => (
          <div
            key={f.key}
            className="flex items-center gap-3 p-3 rounded-lg bg-[var(--bg-surface-2)] border border-[var(--border-default)]"
          >
            <div className="flex size-8 items-center justify-center rounded-lg bg-[var(--card)] border border-[var(--border-subtle)] text-[var(--text-secondary)] shrink-0">
              <f.icon className="size-4" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-tertiary)] mb-0.5">
                {f.label}
              </p>
              {isEditing ? (
                <input
                  type={f.type || "text"}
                  value={form[f.key]}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, [f.key]: e.target.value }))
                  }
                  className="h-7 w-full rounded border border-[var(--border-default)] bg-[var(--card)] px-2 text-xs font-medium text-[var(--text-primary)] focus:border-[var(--pri)] focus:outline-none"
                />
              ) : (
                <p className="text-xs font-semibold text-[var(--text-primary)] truncate">
                  {(speaker as any)[f.key] || "—"}
                </p>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Check-in status */}
      <div className="flex items-center gap-3 p-3 rounded-lg bg-[var(--bg-surface-2)] border border-[var(--border-default)]">
        <div className="flex size-8 items-center justify-center rounded-lg bg-[var(--card)] border border-[var(--border-subtle)] text-[var(--text-secondary)] shrink-0">
          <Calendar className="size-4" />
        </div>
        <div className="flex-1">
          <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-tertiary)] mb-0.5">
            Check-In Status
          </p>
          <p className="text-xs font-semibold text-[var(--text-primary)]">
            {speaker.checked_in_at
              ? `Checked in at ${formatDateTimeInTZ(speaker.checked_in_at, "Asia/Kolkata")}`
              : "Not yet checked in"}
          </p>
        </div>
      </div>
    </div>
  );
}

/* ── Talks Tab ──────────────────────────────────────────────── */
function TalksTab({
  talks,
  posters,
  loading,
  onMoveTalk,
}: {
  talks: SpeakerTalk[];
  posters: any[];
  loading: boolean;
  onMoveTalk: (t: SpeakerTalk) => void;
}) {
  if (loading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="h-24 w-full rounded-lg bg-[var(--bg-surface-2)] border border-[var(--border-default)] animate-pulse"
          />
        ))}
      </div>
    );
  }

  if (talks.length === 0 && posters.length === 0) {
    return (
      <div className="text-center py-12 text-xs text-[var(--text-secondary)]">
        <Presentation className="size-8 text-[var(--text-tertiary)] mx-auto mb-2" />
        <p className="font-semibold">No talks assigned yet.</p>
        <p className="text-[11px] text-[var(--text-tertiary)] mt-0.5">
          Assign this speaker to a session slot.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {talks.length > 0 && (
        <div className="space-y-3">
          <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--pri)] flex items-center gap-1.5">
            <Presentation className="size-3.5" /> Oral Presentations ({talks.length})
          </p>
          {talks.map((talk) => {
            const dateStr = formatDateInTZ(talk.start_time, talk.event_timezone);
            const timeStr = formatTimeRangeInTZ(talk.start_time, talk.end_time, talk.event_timezone);

            return (
              <div
                key={talk.session_speaker_id}
                className="rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface-2)] overflow-hidden"
              >
                <div className="px-3.5 py-2 border-b border-[var(--border-subtle)] bg-[var(--card)] flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 truncate">
                    <span className="font-mono text-[10px] font-bold text-[var(--text-tertiary)]">
                      {talk.session_code}
                    </span>
                    <span className="text-xs font-bold text-[var(--text-primary)] truncate">
                      {talk.session_name}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => onMoveTalk(talk)}
                    className="flex items-center gap-1 rounded border border-[var(--border-default)] bg-[var(--bg-surface-2)] px-2 py-0.5 text-[10px] font-semibold text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)] cursor-pointer shrink-0"
                  >
                    <ArrowRightLeft className="size-3" /> Move
                  </button>
                </div>

                <div className="p-3.5 space-y-2">
                  <p className="text-xs font-semibold text-[var(--text-primary)]">
                    {talk.talk_title || <span className="text-[var(--text-tertiary)] italic">No title assigned</span>}
                  </p>
                  <div className="flex flex-wrap items-center gap-3 text-[11px] text-[var(--text-secondary)]">
                    <span className="flex items-center gap-1">
                      <Calendar className="size-3 text-[var(--pri)]" /> {dateStr}
                    </span>
                    <span className="flex items-center gap-1">
                      <Clock className="size-3 text-[var(--pri)]" /> {timeStr}
                    </span>
                    {talk.room_name && (
                      <span className="flex items-center gap-1">
                        <MapPin className="size-3 text-[var(--pri)]" /> {talk.room_name}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {posters.length > 0 && (
        <div className="space-y-3">
          <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--sec)] flex items-center gap-1.5">
            <FileText className="size-3.5" /> ePosters ({posters.length})
          </p>
          {posters.map((poster) => (
            <div
              key={poster.id}
              className="p-3 rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface-2)] space-y-1.5"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-[var(--text-primary)]">{poster.title}</span>
                <span className="rounded bg-[var(--card)] border border-[var(--border-subtle)] px-1.5 py-0.5 text-[9px] font-bold uppercase text-[var(--text-tertiary)]">
                  {poster.status}
                </span>
              </div>
              <span className="text-[11px] text-[var(--text-secondary)]">{poster.category}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ── Profile Tab ────────────────────────────────────────────── */
interface ProfileTabProps {
  speaker: SpeakerSummary;
  eventId: string;
  profileForm: any;
  setProfileForm: React.Dispatch<React.SetStateAction<any>>;
  profileLoading: boolean;
  profileError: string;
  isEditingProfile: boolean;
  setIsEditingProfile: (val: boolean) => void;
  showPublicPreview: boolean;
  setShowPublicPreview: (val: boolean) => void;
  onSaveProfile: () => void;
}

function ProfileTab({
  speaker,
  profileForm,
  setProfileForm,
  profileLoading,
  profileError,
  isEditingProfile,
}: ProfileTabProps) {
  if (profileLoading) {
    return (
      <div className="py-12 text-center text-xs text-[var(--text-secondary)]">
        <Loader2 className="size-6 text-[var(--pri)] animate-spin mx-auto mb-2" />
        Loading profile details...
      </div>
    );
  }

  if (profileError) {
    return (
      <div className="p-4 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-600 text-xs font-medium">
        <AlertCircle className="size-4 shrink-0 inline mr-1" />
        {profileError}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {isEditingProfile ? (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-[10px] font-bold uppercase text-[var(--text-tertiary)]">Designation</label>
              <select
                value={profileForm.designation}
                onChange={(e) => setProfileForm((f: any) => ({ ...f, designation: e.target.value }))}
                className="h-8 w-full rounded-md border border-[var(--border-default)] bg-[var(--bg-surface-2)] px-2.5 text-xs text-[var(--text-primary)] focus:border-[var(--pri)] focus:outline-none"
              >
                <option value="">Select</option>
                <option value="Dr.">Dr.</option>
                <option value="Prof.">Prof.</option>
                <option value="Mr.">Mr.</option>
                <option value="Ms.">Ms.</option>
                <option value="Mx.">Mx.</option>
              </select>
            </div>

            <div className="space-y-1">
              <label className="text-[10px] font-bold uppercase text-[var(--text-tertiary)]">Job Title</label>
              <input
                value={profileForm.title}
                onChange={(e) => setProfileForm((f: any) => ({ ...f, title: e.target.value }))}
                placeholder="e.g. Chief Scientist"
                className="h-8 w-full rounded-md border border-[var(--border-default)] bg-[var(--bg-surface-2)] px-2.5 text-xs text-[var(--text-primary)] focus:border-[var(--pri)] focus:outline-none"
              />
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-[10px] font-bold uppercase text-[var(--text-tertiary)]">Organisation Name</label>
            <input
              value={profileForm.organisation_name}
              onChange={(e) => setProfileForm((f: any) => ({ ...f, organisation_name: e.target.value }))}
              className="h-8 w-full rounded-md border border-[var(--border-default)] bg-[var(--bg-surface-2)] px-2.5 text-xs text-[var(--text-primary)] focus:border-[var(--pri)] focus:outline-none"
            />
          </div>

          <div className="space-y-1">
            <label className="text-[10px] font-bold uppercase text-[var(--text-tertiary)]">Short Bio</label>
            <textarea
              value={profileForm.bio}
              onChange={(e) => setProfileForm((f: any) => ({ ...f, bio: e.target.value }))}
              rows={3}
              placeholder="Short bio for programme booklet..."
              className="w-full rounded-md border border-[var(--border-default)] bg-[var(--bg-surface-2)] p-2 text-xs text-[var(--text-primary)] focus:border-[var(--pri)] focus:outline-none resize-none"
            />
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="p-4 rounded-lg bg-[var(--bg-surface-2)] border border-[var(--border-default)] space-y-2">
            <span className="text-[10px] font-bold uppercase text-[var(--text-tertiary)] block">Biography</span>
            <p className="text-xs text-[var(--text-primary)] leading-relaxed">
              {profileForm.bio || "No biography provided yet."}
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="p-3 rounded-lg bg-[var(--bg-surface-2)] border border-[var(--border-default)]">
              <span className="text-[10px] font-bold uppercase text-[var(--text-tertiary)] block">Organization</span>
              <p className="text-xs font-semibold text-[var(--text-primary)] mt-0.5">
                {profileForm.organisation_name || speaker.affiliation || "—"}
              </p>
            </div>
            <div className="p-3 rounded-lg bg-[var(--bg-surface-2)] border border-[var(--border-default)]">
              <span className="text-[10px] font-bold uppercase text-[var(--text-tertiary)] block">Location</span>
              <p className="text-xs font-semibold text-[var(--text-primary)] mt-0.5">
                {profileForm.city && profileForm.country
                  ? `${profileForm.city}, ${profileForm.country}`
                  : profileForm.country || "—"}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
