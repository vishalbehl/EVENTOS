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
import { useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import { toast } from "sonner";

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
  "Uzbekistan", "Vanuatu", "Vatican City", "Venezuela", "Vietnam", "Yemen", "Zambia", "Zimbabwe"
];

interface SpeakerDrawerProps {
  speaker: SpeakerSummary;
  eventId: string;
  onClose: () => void;
}

type DrawerTab = "details" | "talks" | "profile";

export function SpeakerDrawer({ speaker, eventId, onClose }: SpeakerDrawerProps) {
  const queryClient = useQueryClient();
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
    profile_photo_url: ""
  });

  // Sync profile on tab focus
  useEffect(() => {
    if (tab === "profile") {
      setProfileLoading(true);
      setProfileError("");
      apiClient.get<any>(`/events/${eventId}/speakers/${speaker.id}/profile`)
        .then(res => {
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
            profile_photo_url: res.profile_photo_url || ""
          });
        })
        .catch(err => {
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
              profile_photo_url: ""
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
    try {
      setProfileError("");
      const res = await apiClient.put<any>(`/events/${eventId}/speakers/${speaker.id}/profile`, profileForm);
      setProfileData(res);
      setIsEditingProfile(false);
      toast.success("Speaker profile saved successfully!");
      queryClient.invalidateQueries({ queryKey: ["speakers", eventId] });
    } catch (err: any) {
      setProfileError(err.response?.data?.detail || "Failed to save profile.");
      toast.error("Failed to save speaker profile.");
    }
  };

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
                {tab === "details" && (
                  isEditing ? (
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
                  )
                )}

                {tab === "profile" && !profileLoading && !profileError && (
                  isEditingProfile ? (
                    <>
                      <Button
                        size="sm"
                        onClick={handleSaveProfile}
                        className="h-9 px-4 bg-[var(--pri)] hover:bg-[var(--sec)] text-[var(--text)] font-black text-[10px] uppercase tracking-widest rounded-xl border-0"
                      >
                        <Save className="h-3.5 w-3.5 mr-1.5" />
                        Save Profile
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setIsEditingProfile(false)}
                        className="h-9 px-4 text-muted hover:text-[var(--text)] text-[10px] font-black uppercase tracking-widest rounded-xl"
                      >
                        Cancel
                      </Button>
                    </>
                  ) : (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setIsEditingProfile(true)}
                      className="h-9 px-4 border-default bg-[color-mix(in_srgb,var(--text)_5%,transparent)] text-muted hover:text-[var(--text)] font-black text-[10px] uppercase tracking-widest rounded-xl"
                    >
                      <Pencil className="h-3.5 w-3.5 mr-1.5" />
                      Edit Profile
                    </Button>
                  )
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
            {tab === "profile" ? (
              isEditingProfile ? (
                <Button 
                  onClick={handleSaveProfile}
                  className="flex-1 h-11 bg-[var(--pri)] hover:bg-[var(--sec)] text-[var(--text)] font-black uppercase tracking-widest text-[10px] rounded-xl border-0 shadow-lg"
                >
                  <Save className="mr-2 h-4 w-4" /> Save Profile
                </Button>
              ) : (
                <>
                  <Button 
                    onClick={() => setIsEditingProfile(true)}
                    className="flex-1 h-11 bg-[color-mix(in_srgb,var(--text)_5%,transparent)] border-default text-muted hover:text-[var(--text)] font-black uppercase tracking-widest text-[10px] rounded-xl border"
                  >
                    <Pencil className="mr-2 h-4 w-4" /> Edit Profile
                  </Button>
                  <Button 
                    onClick={() => setShowPublicPreview(true)}
                    className="flex-1 h-11 bg-[var(--pri)] hover:bg-[var(--sec)] text-[var(--text)] font-black uppercase tracking-widest text-[10px] rounded-xl border-0 shadow-lg"
                  >
                    View Public Profile
                  </Button>
                  <Button
                    onClick={async () => {
                      try {
                        const loadingId = toast.loading("Sending request email...");
                        await apiClient.post(`/events/${eventId}/emails/send-single`, {
                          recipient: speaker.email,
                          template: "upload_invite",
                          link: `${window.location.origin}/${eventId}/${speaker.speaker_code || speaker.id}?tab=profile`
                        });
                        toast.success("Profile update requested successfully!", { id: loadingId });
                      } catch (err: any) {
                        toast.error(err.response?.data?.detail || "Failed to send request email.");
                      }
                    }}
                    variant="outline"
                    className="h-11 px-5 border-default bg-[color-mix(in_srgb,var(--text)_5%,transparent)] text-muted hover:text-[var(--text)] rounded-xl"
                  >
                    <Mail className="h-4 w-4" />
                  </Button>
                </>
              )
            ) : (
              <>
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
                    <Pencil className="mr-2 h-4 w-4" /> Edit Speaker
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
              </>
            )}
          </div>

        </div>
      </motion.div>

      {/* Public Profile Preview Modal */}
      {showPublicPreview && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-[var(--base)]/90 backdrop-blur-md p-4">
          <div className="glass-3d w-[450px] max-w-full rounded-[2.5rem] border border-default overflow-hidden flex flex-col p-6 space-y-6">
            <div className="flex items-center justify-between border-b border-default pb-4">
              <span className="text-[10px] font-black uppercase tracking-widest text-[var(--text)]">Public Profile Preview</span>
              <button 
                onClick={() => setShowPublicPreview(false)} 
                className="h-8 w-8 rounded-full border border-default flex items-center justify-center text-muted hover:text-[var(--text)]"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            
            <div className="flex flex-col items-center text-center space-y-4">
              <div className="h-28 w-28 rounded-full border-4 border-[var(--pri)]/20 bg-stone-900 overflow-hidden flex items-center justify-center shadow-xl">
                {profileForm.profile_photo_url ? (
                  <img src={profileForm.profile_photo_url} alt={speaker.first_name} className="h-full w-full object-cover" />
                ) : (
                  <span className="text-3xl font-black text-muted">{speaker.first_name[0]}{speaker.last_name[0]}</span>
                )}
              </div>
              
              <div>
                <h2 className="text-xl font-black text-[var(--text)] tracking-tight">
                  {profileForm.designation} {speaker.first_name} {speaker.last_name}
                </h2>
                <p className="text-xs font-bold text-[var(--pri)] uppercase tracking-[0.2em] mt-1">
                  {profileForm.title || "Presenter"}
                </p>
                <p className="text-xs text-muted font-bold mt-0.5">
                  {profileForm.organisation_name || speaker.affiliation || "Independent"}
                </p>
              </div>

              {profileForm.bio && (
                <div className="bg-[color-mix(in_srgb,var(--text)_3%,transparent)] border border-default p-4 rounded-2xl text-left">
                  <p className="text-xs font-medium text-muted leading-relaxed italic">
                    "{profileForm.bio}"
                  </p>
                </div>
              )}

              <div className="flex gap-4 pt-2">
                {profileForm.linkedin_url && (
                  <a href={profileForm.linkedin_url} target="_blank" rel="noreferrer" className="text-xs font-bold text-[var(--pri)] hover:underline flex items-center gap-1">
                    LinkedIn
                  </a>
                )}
                {profileForm.twitter_url && (
                  <a href={profileForm.twitter_url} target="_blank" rel="noreferrer" className="text-xs font-bold text-[var(--pri)] hover:underline flex items-center gap-1">
                    Twitter/X
                  </a>
                )}
                {profileForm.website_url && (
                  <a href={profileForm.website_url} target="_blank" rel="noreferrer" className="text-xs font-bold text-[var(--pri)] hover:underline flex items-center gap-1">
                    Website
                  </a>
                )}
              </div>
            </div>

            <Button
              onClick={() => setShowPublicPreview(false)}
              className="w-full h-11 bg-[var(--pri)] hover:bg-[var(--sec)] text-[var(--text)] font-black uppercase tracking-widest text-[10px] rounded-xl border-0 shadow-lg"
            >
              Close Preview
            </Button>
          </div>
        </div>
      )}
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
  eventId,
  profileForm,
  setProfileForm,
  profileLoading,
  profileError,
  isEditingProfile,
  onSaveProfile
}: ProfileTabProps) {

  const getProfileCompleteness = () => {
    let score = 0;
    if (profileForm.profile_photo_url && profileForm.profile_photo_url.trim()) {
      score += 20;
    }
    if (profileForm.bio && profileForm.bio.trim()) {
      const words = profileForm.bio.trim().split(/\s+/).filter(Boolean);
      if (words.length > 20) score += 25;
    }
    if (profileForm.designation && profileForm.designation.trim() && profileForm.organisation_name && profileForm.organisation_name.trim()) {
      score += 15;
    }
    if (
      (profileForm.website_url && profileForm.website_url.trim()) ||
      (profileForm.linkedin_url && profileForm.linkedin_url.trim()) ||
      (profileForm.twitter_url && profileForm.twitter_url.trim())
    ) {
      score += 10;
    }
    if (profileForm.extended_bio && profileForm.extended_bio.trim()) {
      const words = profileForm.extended_bio.trim().split(/\s+/).filter(Boolean);
      if (words.length > 50) score += 20;
    }
    if (profileForm.research_interests && profileForm.research_interests.filter((i: string) => i.trim()).length >= 2) {
      score += 10;
    }
    return score;
  };

  if (profileLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-10 gap-3">
        <Loader2 className="h-8 w-8 animate-spin text-[var(--pri)]" />
        <span className="text-xs font-bold text-muted">Loading Speaker Profile...</span>
      </div>
    );
  }

  if (profileError) {
    return (
      <div className="text-center py-10 text-[var(--dan)] flex flex-col items-center gap-2">
        <AlertCircle className="h-8 w-8" />
        <span className="text-xs font-bold">{profileError}</span>
      </div>
    );
  }

  const score = getProfileCompleteness();
  let ringColor = "stroke-[var(--dan)]";
  let textColor = "text-[var(--dan)]";
  if (score >= 80) {
    ringColor = "stroke-[var(--success)]";
    textColor = "text-[var(--success)]";
  } else if (score >= 50) {
    ringColor = "stroke-[var(--warn)]";
    textColor = "text-[var(--warn)]";
  }

  return (
    <div className="space-y-6">
      {/* SVG Completeness Ring */}
      <div className="p-4 rounded-2xl bg-[color-mix(in_srgb,var(--text)_3%,transparent)] border border-default flex items-center justify-around gap-6">
        <div className="relative h-28 w-28 flex items-center justify-center shrink-0">
          <svg className="absolute inset-0 h-full w-full transform -rotate-90">
            <circle cx="56" cy="56" r="48" className="stroke-default fill-none" strokeWidth="8" />
            <circle 
              cx="56" 
              cy="56" 
              r="48" 
              className={cn("fill-none transition-all duration-1000", ringColor)} 
              strokeWidth="8" 
              strokeDasharray={301} 
              strokeDashoffset={301 - (301 * score) / 100}
              strokeLinecap="round"
            />
          </svg>
          <div className="text-center">
            <span className={cn("text-2xl font-black tracking-tighter", textColor)}>{score}%</span>
            <span className="text-[7px] font-black uppercase tracking-widest text-muted block mt-0.5">Complete</span>
          </div>
        </div>

        <div className="text-left flex-1 min-w-0">
          <h4 className="text-xs font-black uppercase tracking-[0.2em] text-[var(--text)] mb-1">Profile Completeness</h4>
          <p className="text-[10px] text-muted leading-relaxed">
            Completing details ensures correct information displays on digital signage and print booklets.
          </p>
        </div>
      </div>

      {/* Edit Form / Details Display */}
      <div className="space-y-4">
        {isEditingProfile ? (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-[9px] font-black text-muted uppercase">Designation</label>
                <select
                  value={profileForm.designation}
                  onChange={(e) => setProfileForm((f: any) => ({ ...f, designation: e.target.value }))}
                  className="w-full h-9 rounded-lg bg-[color-mix(in_srgb,var(--text)_5%,transparent)] border border-default px-3 text-xs font-bold text-[var(--text)] outline-none focus:border-[var(--pri)]"
                >
                  <option value="" className="bg-[var(--surf)]">Select Designation</option>
                  <option value="Dr." className="bg-[var(--surf)]">Dr.</option>
                  <option value="Prof." className="bg-[var(--surf)]">Prof.</option>
                  <option value="Mr." className="bg-[var(--surf)]">Mr.</option>
                  <option value="Ms." className="bg-[var(--surf)]">Ms.</option>
                  <option value="Mx." className="bg-[var(--surf)]">Mx.</option>
                  <option value="Other" className="bg-[var(--surf)]">Other</option>
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-[9px] font-black text-muted uppercase">Job Title</label>
                <Input
                  value={profileForm.title}
                  onChange={(e) => setProfileForm((f: any) => ({ ...f, title: e.target.value }))}
                  placeholder="e.g. Chief Scientist"
                  className="h-9 bg-[color-mix(in_srgb,var(--text)_5%,transparent)] border-default rounded-lg text-xs font-bold"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-[9px] font-black text-muted uppercase">Organisation</label>
                <Input
                  value={profileForm.organisation_name}
                  onChange={(e) => setProfileForm((f: any) => ({ ...f, organisation_name: e.target.value }))}
                  className="h-9 bg-[color-mix(in_srgb,var(--text)_5%,transparent)] border-default rounded-lg text-xs font-bold"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[9px] font-black text-muted uppercase">Department</label>
                <Input
                  value={profileForm.department}
                  onChange={(e) => setProfileForm((f: any) => ({ ...f, department: e.target.value }))}
                  className="h-9 bg-[color-mix(in_srgb,var(--text)_5%,transparent)] border-default rounded-lg text-xs font-bold"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-[9px] font-black text-muted uppercase">City</label>
                <Input
                  value={profileForm.city}
                  onChange={(e) => setProfileForm((f: any) => ({ ...f, city: e.target.value }))}
                  className="h-9 bg-[color-mix(in_srgb,var(--text)_5%,transparent)] border-default rounded-lg text-xs font-bold"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[9px] font-black text-muted uppercase">Country</label>
                <select
                  value={profileForm.country}
                  onChange={(e) => setProfileForm((f: any) => ({ ...f, country: e.target.value }))}
                  className="w-full h-9 rounded-lg bg-[color-mix(in_srgb,var(--text)_5%,transparent)] border border-default px-3 text-xs font-bold text-[var(--text)] outline-none focus:border-[var(--pri)]"
                >
                  <option value="" className="bg-[var(--surf)]">Select Country</option>
                  {countries.map(c => (
                    <option key={c} value={c} className="bg-[var(--surf)]">{c}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-[9px] font-black text-muted uppercase">Short Bio</label>
              <textarea
                value={profileForm.bio}
                onChange={(e) => setProfileForm((f: any) => ({ ...f, bio: e.target.value }))}
                rows={3}
                placeholder="Short bio (max 150 words)..."
                className="w-full rounded-lg bg-[color-mix(in_srgb,var(--text)_5%,transparent)] border border-default p-3 text-xs font-bold text-[var(--text)] focus:border-[var(--pri)] outline-none resize-none"
              />
            </div>

            <div className="space-y-1">
              <label className="text-[9px] font-black text-muted uppercase">Extended Bio</label>
              <textarea
                value={profileForm.extended_bio}
                onChange={(e) => setProfileForm((f: any) => ({ ...f, extended_bio: e.target.value }))}
                rows={4}
                placeholder="Full bio (max 400 words)..."
                className="w-full rounded-lg bg-[color-mix(in_srgb,var(--text)_5%,transparent)] border border-default p-3 text-xs font-bold text-[var(--text)] focus:border-[var(--pri)] outline-none resize-none"
              />
            </div>

            <div className="space-y-1">
              <label className="text-[9px] font-black text-muted uppercase">Website URL</label>
              <Input
                value={profileForm.website_url}
                onChange={(e) => setProfileForm((f: any) => ({ ...f, website_url: e.target.value }))}
                className="h-9 bg-[color-mix(in_srgb,var(--text)_5%,transparent)] border-default rounded-lg text-xs font-bold"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-[9px] font-black text-muted uppercase">LinkedIn URL</label>
                <Input
                  value={profileForm.linkedin_url}
                  onChange={(e) => setProfileForm((f: any) => ({ ...f, linkedin_url: e.target.value }))}
                  className="h-9 bg-[color-mix(in_srgb,var(--text)_5%,transparent)] border-default rounded-lg text-xs font-bold"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[9px] font-black text-muted uppercase">Twitter URL</label>
                <Input
                  value={profileForm.twitter_url}
                  onChange={(e) => setProfileForm((f: any) => ({ ...f, twitter_url: e.target.value }))}
                  className="h-9 bg-[color-mix(in_srgb,var(--text)_5%,transparent)] border-default rounded-lg text-xs font-bold"
                />
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center gap-4 pb-4 border-b border-default">
              <div className="h-16 w-16 rounded-full border-2 border-default bg-[color-mix(in_srgb,var(--text)_5%,transparent)] overflow-hidden shrink-0 flex items-center justify-center">
                {profileForm.profile_photo_url ? (
                  <img src={profileForm.profile_photo_url} alt="Speaker avatar" className="h-full w-full object-cover" />
                ) : (
                  <Building2 className="h-8 w-8 text-muted" />
                )}
              </div>
              <div>
                <h3 className="text-md font-bold text-[var(--text)]">
                  {profileForm.designation} {speaker.first_name} {speaker.last_name}
                </h3>
                <p className="text-xs text-muted font-bold">
                  {profileForm.title || "No Title"} · {profileForm.organisation_name || "No Organisation"}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4 text-xs">
              <div>
                <span className="text-[9px] font-black text-muted uppercase block">Department</span>
                <span className="font-bold text-[var(--text)]">{profileForm.department || "—"}</span>
              </div>
              <div>
                <span className="text-[9px] font-black text-muted uppercase block">Location</span>
                <span className="font-bold text-[var(--text)]">
                  {profileForm.city && profileForm.country ? `${profileForm.city}, ${profileForm.country}` : profileForm.city || profileForm.country || "—"}
                </span>
              </div>
              <div className="col-span-2">
                <span className="text-[9px] font-black text-muted uppercase block">Research Interests</span>
                <div className="flex flex-wrap gap-1 mt-1">
                  {profileForm.research_interests.length > 0 ? (
                    profileForm.research_interests.map((ri: string) => (
                      <span key={ri} className="px-2 py-0.5 rounded bg-[color-mix(in_srgb,var(--pri)_15%,transparent)] text-[var(--pri)] text-[10px] font-black">{ri}</span>
                    ))
                  ) : "—"}
                </div>
              </div>
              <div className="col-span-2">
                <span className="text-[9px] font-black text-muted uppercase block">Languages Spoken</span>
                <div className="flex flex-wrap gap-1 mt-1">
                  {profileForm.languages_spoken.length > 0 ? (
                    profileForm.languages_spoken.map((l: string) => (
                      <span key={l} className="px-2 py-0.5 rounded bg-[color-mix(in_srgb,var(--sec)_15%,transparent)] text-[var(--sec)] text-[10px] font-black">{l}</span>
                    ))
                  ) : "—"}
                </div>
              </div>
              {profileForm.bio && (
                <div className="col-span-2">
                  <span className="text-[9px] font-black text-muted uppercase block">Short Bio</span>
                  <p className="text-muted leading-relaxed font-bold italic mt-1">{profileForm.bio}</p>
                </div>
              )}
              {profileForm.extended_bio && (
                <div className="col-span-2">
                  <span className="text-[9px] font-black text-muted uppercase block">Extended Bio</span>
                  <p className="text-muted leading-relaxed font-bold italic mt-1">{profileForm.extended_bio}</p>
                </div>
              )}
              <div className="col-span-2 flex gap-4 pt-2">
                {profileForm.website_url && (
                  <a href={profileForm.website_url} target="_blank" rel="noreferrer" className="text-xs font-black text-[var(--pri)] hover:underline">Website</a>
                )}
                {profileForm.linkedin_url && (
                  <a href={profileForm.linkedin_url} target="_blank" rel="noreferrer" className="text-xs font-black text-[var(--pri)] hover:underline">LinkedIn</a>
                )}
                {profileForm.twitter_url && (
                  <a href={profileForm.twitter_url} target="_blank" rel="noreferrer" className="text-xs font-black text-[var(--pri)] hover:underline">Twitter/X</a>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

