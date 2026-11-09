"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { motion } from "framer-motion";
import {
  User,
  Mail,
  Phone,
  Building2,
  Briefcase,
  Globe2,
  FileText,
  ShieldCheck,
  Presentation,
  Award,
  CheckCircle2,
  Save,
  Loader2,
  Sparkles,
  QrCode,
  ArrowRight,
  AlertCircle,
  Ticket,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/lib/toast";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";

interface EventUserProfile {
  id: string;
  event_id: string;
  email: string;
  phone?: string | null;
  full_name?: string | null;
  title?: string | null;
  affiliation?: string | null;
  designation?: string | null;
  country?: string | null;
  avatar_url?: string | null;
  bio?: string | null;
  roles: string[];
  is_registered: boolean;
  is_speaker: boolean;
  is_reviewer: boolean;
  reviewer_status: string;
  profile_data?: Record<string, any>;
}

export default function ProfileSettingsPage() {
  const { eventId } = useParams<{ eventId: string }>();
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [profile, setProfile] = useState<EventUserProfile | null>(null);

  // Form Fields
  const [fullName, setFullName] = useState("");
  const [title, setTitle] = useState("");
  const [phone, setPhone] = useState("");
  const [affiliation, setAffiliation] = useState("");
  const [designation, setDesignation] = useState("");
  const [country, setCountry] = useState("");
  const [bio, setBio] = useState("");

  useEffect(() => {
    const token =
      localStorage.getItem(`portal_token_${eventId}`) ||
      localStorage.getItem(`portal_jwt_${eventId}`);

    if (!token) {
      toast.error("Please sign in to access your profile settings.");
      router.replace(`/${eventId}/login?redirect=profile`);
      return;
    }

    fetch(`${API_BASE}/api/v1/portal/users/${eventId}/me`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(async (res) => {
        if (!res.ok) {
          throw new Error("Unable to load profile data.");
        }
        const data: EventUserProfile = await res.json();
        setProfile(data);
        setFullName(data.full_name || "");
        setTitle(data.title || "");
        setPhone(data.phone || "");
        setAffiliation(data.affiliation || "");
        setDesignation(data.designation || "");
        setCountry(data.country || "");
        setBio(data.bio || "");
        localStorage.setItem(`events_user_${eventId}`, JSON.stringify(data));
      })
      .catch((err) => {
        toast.error(err.message || "Failed to load profile.");
      })
      .finally(() => setLoading(false));
  }, [eventId, router]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const token =
      localStorage.getItem(`portal_token_${eventId}`) ||
      localStorage.getItem(`portal_jwt_${eventId}`);

    if (!token) {
      toast.error("Authentication expired. Please log in again.");
      router.replace(`/${eventId}/login?redirect=profile`);
      return;
    }

    setSaving(true);

    try {
      const res = await fetch(`${API_BASE}/api/v1/portal/users/${eventId}/me`, {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          full_name: fullName.trim(),
          title: title.trim(),
          phone: phone.trim(),
          affiliation: affiliation.trim(),
          designation: designation.trim(),
          country: country.trim(),
          bio: bio.trim(),
        }),
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.detail || "Failed to save profile changes.");
      }

      const updatedProfile: EventUserProfile = await res.json();
      setProfile(updatedProfile);
      localStorage.setItem(`events_user_${eventId}`, JSON.stringify(updatedProfile));
      window.dispatchEvent(new Event("portal-auth-change"));

      toast.success("Profile updated successfully!");
    } catch (err: any) {
      toast.error(err.message || "An error occurred while saving profile.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <main className="min-h-[70vh] grid place-items-center bg-[var(--bg-base)] text-[var(--text)]">
        <div className="flex flex-col items-center gap-3">
          <div className="h-9 w-9 animate-spin rounded-full border-2 border-[var(--pri)] border-t-transparent" />
          <p className="text-xs font-bold text-[var(--muted)]">Loading Profile Settings...</p>
        </div>
      </main>
    );
  }

  const isReviewerAccepted =
    profile?.is_reviewer &&
    (profile?.reviewer_status === "ACCEPTED" || profile?.reviewer_status === "ACTIVE");

  return (
    <main className="min-h-screen bg-[var(--bg-base)] text-[var(--text)] pb-24 px-4 sm:px-8 pt-8">
      <div className="max-w-4xl mx-auto space-y-8">
        {/* Header Title */}
        <div className="space-y-2">
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full border border-[var(--sec)]/30 bg-[var(--sec)]/10 text-[var(--sec)] text-xs font-black uppercase tracking-wider shadow-sm">
            <Sparkles className="h-3.5 w-3.5 text-[var(--pri)]" />
            <span>Attendee Account Profile</span>
          </div>
          <h1 className="text-2xl sm:text-4xl font-black tracking-tight">
            Profile Settings &amp; Workspaces
          </h1>
          <p className="text-xs sm:text-sm text-[var(--muted)] max-w-xl">
            Manage your personal identity, affiliation, contact details, and view your verified
            conference credentials across event workspaces.
          </p>
        </div>

        {/* Workspace Credentials Summary Grid (Dashboard Sub-cards) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {/* Registration Pass */}
          <div className="p-5 rounded-2xl border-2 border-[var(--border-default)] bg-[var(--card)] shadow-sm space-y-2.5">
            <div className="flex items-center justify-between">
              <div className="w-8 h-8 rounded-xl bg-emerald-500/10 text-emerald-500 flex items-center justify-center">
                <Ticket className="w-4 h-4" />
              </div>
              <span
                className={`text-[9px] font-black uppercase px-2 py-0.5 rounded-full ${
                  profile?.is_registered
                    ? "bg-emerald-500/15 text-emerald-500"
                    : "bg-amber-500/15 text-amber-500"
                }`}
              >
                {profile?.is_registered ? "Registered" : "Pending"}
              </span>
            </div>
            <div>
              <div className="text-xs font-black truncate">Conference Entry</div>
              <div className="text-[10px] text-[var(--muted)]">Digital QR Pass</div>
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={() => router.push(`/${eventId}/dashboard`)}
              className="w-full text-[11px] h-8 rounded-xl border-[var(--border-default)] hover:border-[var(--pri)]/50 cursor-pointer"
            >
              View Pass
            </Button>
          </div>

          {/* Abstract Workspace */}
          <div className="p-5 rounded-2xl border-2 border-[var(--border-default)] bg-[var(--card)] shadow-sm space-y-2.5">
            <div className="flex items-center justify-between">
              <div className="w-8 h-8 rounded-xl bg-sky-500/10 text-sky-500 flex items-center justify-center">
                <FileText className="w-4 h-4" />
              </div>
              <span className="text-[9px] font-black uppercase px-2 py-0.5 rounded-full bg-sky-500/15 text-sky-500">
                Author
              </span>
            </div>
            <div>
              <div className="text-xs font-black truncate">Call for Abstracts</div>
              <div className="text-[10px] text-[var(--muted)]">Papers &amp; Submissions</div>
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={() => router.push(`/${eventId}/call-for-abstracts`)}
              className="w-full text-[11px] h-8 rounded-xl border-[var(--border-default)] hover:border-[var(--pri)]/50 cursor-pointer"
            >
              Author Portal
            </Button>
          </div>

          {/* Speaker Workspace */}
          <div className="p-5 rounded-2xl border-2 border-[var(--border-default)] bg-[var(--card)] shadow-sm space-y-2.5">
            <div className="flex items-center justify-between">
              <div className="w-8 h-8 rounded-xl bg-violet-500/10 text-violet-500 flex items-center justify-center">
                <Presentation className="w-4 h-4" />
              </div>
              <span
                className={`text-[9px] font-black uppercase px-2 py-0.5 rounded-full ${
                  profile?.is_speaker
                    ? "bg-violet-500/15 text-violet-500"
                    : "bg-slate-500/15 text-[var(--muted)]"
                }`}
              >
                {profile?.is_speaker ? "Faculty" : "None"}
              </span>
            </div>
            <div>
              <div className="text-xs font-black truncate">Speaker Center</div>
              <div className="text-[10px] text-[var(--muted)]">Slides &amp; Timings</div>
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={() => router.push(`/${eventId}/speaker`)}
              className="w-full text-[11px] h-8 rounded-xl border-[var(--border-default)] hover:border-[var(--pri)]/50 cursor-pointer"
            >
              Speaker Portal
            </Button>
          </div>

          {/* Reviewer Workspace (Conditioned) */}
          <div className="p-5 rounded-2xl border-2 border-[var(--border-default)] bg-[var(--card)] shadow-sm space-y-2.5">
            <div className="flex items-center justify-between">
              <div className="w-8 h-8 rounded-xl bg-indigo-500/10 text-indigo-500 flex items-center justify-center">
                <ShieldCheck className="w-4 h-4" />
              </div>
              <span
                className={`text-[9px] font-black uppercase px-2 py-0.5 rounded-full ${
                  isReviewerAccepted
                    ? "bg-indigo-500/15 text-indigo-500 font-extrabold"
                    : profile?.is_reviewer
                    ? "bg-amber-500/15 text-amber-500 font-bold"
                    : "bg-slate-500/15 text-[var(--muted)]"
                }`}
              >
                {isReviewerAccepted
                  ? "Accepted"
                  : profile?.is_reviewer
                  ? profile.reviewer_status
                  : "Not Invited"}
              </span>
            </div>
            <div>
              <div className="text-xs font-black truncate">Reviewer Center</div>
              <div className="text-[10px] text-[var(--muted)]">
                {isReviewerAccepted
                  ? "Peer Review Hub"
                  : profile?.is_reviewer
                  ? "Invitation Pending"
                  : "Restricted Access"}
              </div>
            </div>
            {isReviewerAccepted ? (
              <Button
                size="sm"
                variant="outline"
                onClick={() => router.push(`/${eventId}/review`)}
                className="w-full text-[11px] h-8 rounded-xl border-indigo-500/30 text-indigo-400 hover:bg-indigo-500/10 cursor-pointer font-bold"
              >
                Open Reviewer
              </Button>
            ) : (
              <div className="text-[10px] text-[var(--muted)] italic text-center py-1.5">
                {profile?.is_reviewer ? "Accept invite in email" : "Organizer invite required"}
              </div>
            )}
          </div>
        </div>

        {/* Profile Editor Form (Dashboard Card Token, No Glow) */}
        <form onSubmit={handleSave} className="space-y-6">
          <div className="rounded-[28px] border-2 border-[var(--border-default)] bg-[var(--card)] p-6 md:p-8 shadow-xl ring-1 ring-black/5 dark:ring-white/10 space-y-6">
            <div className="border-b-2 border-[var(--border-default)] pb-4 flex items-center justify-between">
              <div>
                <h2 className="text-base sm:text-lg font-black text-[var(--text)] flex items-center gap-2">
                  <User className="h-5 w-5 text-[var(--pri)]" />
                  <span>Personal &amp; Contact Information</span>
                </h2>
                <p className="text-xs text-[var(--muted)]">
                  These details will be used on your badge, presentation listing, and abstract authorship.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Title */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-[var(--text)]">Title / Honorific</label>
                <Input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. Dr., Prof., Mr., Ms."
                  className="rounded-xl border-[var(--border-default)] bg-[var(--bg-surface-2)] text-xs h-10"
                />
              </div>

              {/* Full Name */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-[var(--text)]">Full Name *</label>
                <Input
                  required
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="e.g. Dr. Alex Morgan"
                  className="rounded-xl border-[var(--border-default)] bg-[var(--bg-surface-2)] text-xs h-10"
                />
              </div>

              {/* Email (Read-Only) */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-[var(--text)]">Registered Email (Read-Only)</label>
                <div className="relative">
                  <Input
                    readOnly
                    disabled
                    value={profile?.email || ""}
                    className="rounded-xl border-[var(--border-default)] bg-[var(--bg-surface-2)]/60 text-xs h-10 pl-9 cursor-not-allowed opacity-80"
                  />
                  <Mail className="absolute left-3 top-3 h-4 w-4 text-[var(--muted)]" />
                </div>
              </div>

              {/* Phone */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-[var(--text)]">Phone / WhatsApp</label>
                <div className="relative">
                  <Input
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="e.g. +1 555 123 4567"
                    className="rounded-xl border-[var(--border-default)] bg-[var(--bg-surface-2)] text-xs h-10 pl-9"
                  />
                  <Phone className="absolute left-3 top-3 h-4 w-4 text-[var(--muted)]" />
                </div>
              </div>
            </div>

            <div className="border-t border-[var(--border-default)] pt-6">
              <h2 className="text-base sm:text-lg font-black text-[var(--text)] flex items-center gap-2 mb-1">
                <Building2 className="h-5 w-5 text-[var(--pri)]" />
                <span>Professional Affiliation &amp; Location</span>
              </h2>
              <p className="text-xs text-[var(--muted)] mb-4">
                Helps other delegates and session chairs correctly credit your institution.
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Affiliation / Institution */}
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-[var(--text)]">Institution / Hospital / Company</label>
                  <div className="relative">
                    <Input
                      value={affiliation}
                      onChange={(e) => setAffiliation(e.target.value)}
                      placeholder="e.g. Stanford University Medical Center"
                      className="rounded-xl border-[var(--border-default)] bg-[var(--bg-surface-2)] text-xs h-10 pl-9"
                    />
                    <Building2 className="absolute left-3 top-3 h-4 w-4 text-[var(--muted)]" />
                  </div>
                </div>

                {/* Designation / Role */}
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-[var(--text)]">Department / Designation</label>
                  <div className="relative">
                    <Input
                      value={designation}
                      onChange={(e) => setDesignation(e.target.value)}
                      placeholder="e.g. Associate Professor of Oncology"
                      className="rounded-xl border-[var(--border-default)] bg-[var(--bg-surface-2)] text-xs h-10 pl-9"
                    />
                    <Briefcase className="absolute left-3 top-3 h-4 w-4 text-[var(--muted)]" />
                  </div>
                </div>

                {/* Country */}
                <div className="space-y-1.5 sm:col-span-2">
                  <label className="text-xs font-bold text-[var(--text)]">Country / Region</label>
                  <div className="relative">
                    <Input
                      value={country}
                      onChange={(e) => setCountry(e.target.value)}
                      placeholder="e.g. United States, Germany, India"
                      className="rounded-xl border-[var(--border-default)] bg-[var(--bg-surface-2)] text-xs h-10 pl-9"
                    />
                    <Globe2 className="absolute left-3 top-3 h-4 w-4 text-[var(--muted)]" />
                  </div>
                </div>
              </div>
            </div>

            {/* Biography */}
            <div className="border-t border-[var(--border-default)] pt-6 space-y-1.5">
              <label className="text-xs font-bold text-[var(--text)]">Brief Professional Bio</label>
              <Textarea
                rows={3}
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                placeholder="Share your research interests, clinical specialties, and recent publications..."
                className="rounded-xl border-[var(--border-default)] bg-[var(--bg-surface-2)] text-xs resize-none"
              />
            </div>

            {/* Action Buttons */}
            <div className="flex items-center justify-end gap-3 pt-4 border-t border-[var(--border-default)]">
              <Button
                type="submit"
                disabled={saving}
                className="rounded-2xl text-white font-black text-xs px-6 h-11 shadow-lg flex items-center gap-2 cursor-pointer hover:opacity-90 bg-[var(--pri)]"
              >
                {saving ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>Saving...</span>
                  </>
                ) : (
                  <>
                    <Save className="h-4 w-4" />
                    <span>Save Profile Changes</span>
                  </>
                )}
              </Button>
            </div>
          </div>
        </form>
      </div>
    </main>
  );
}
