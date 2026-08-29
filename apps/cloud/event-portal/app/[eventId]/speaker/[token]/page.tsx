"use client";

import { usePortalAuth, PortalTalk } from "@/hooks/usePortal";
import { useParams, useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { useState, useRef, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import { toast } from "sonner";
import {
  Calendar, Clock, MapPin, FileUp, CheckCircle2,
  AlertCircle, ChevronRight, Presentation, LogOut,
  FileVideo, Info, History, ArrowRight, Zap, ShieldCheck,
  Monitor, FileText, Lock, QrCode, Download, FileImage, User,
  Bell, HelpCircle, Linkedin, Twitter, Tag, X, Sparkles, Check,
  Award, Upload, Loader2, Camera
} from "lucide-react";
import { DeadlineBanner } from "@/components/DeadlineBanner";
import { useDeadlineStatus } from "@/hooks/useDeadlineStatus";
import { ImageCropper } from "@/components/ImageCropper";
import { AbstractEditor } from "@/components/AbstractEditor";
import { TermsModal, RecordingRights } from "@/components/TermsModal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { cn, formatInTZ, UPLOAD_STATUS_COLOR, UPLOAD_STATUS_LABEL } from "@/lib/utils";

export default function DirectSpeakerWorkspacePage() {
  const params = useParams();
  const router = useRouter();
  const token = (params.token as string) || "";
  const eventId = (params.eventId as string) || "";
  const queryClient = useQueryClient();

  const { data: portal, isLoading, error } = usePortalAuth(eventId, token);
  const deadlineInfo = useDeadlineStatus(
    portal?.upload_deadline ?? null,
    portal?.allow_override ?? false
  );

  const [activeTab, setActiveTab] = useState<"dashboard" | "profile" | "announcements">("dashboard");
  const [showCropper, setShowCropper] = useState(false);
  const [showTermsModal, setShowTermsModal] = useState(false);
  const [uploadingFile, setUploadingFile] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);

  // Profile Form state
  const [bio, setBio] = useState("");
  const [designation, setDesignation] = useState("");
  const [affiliation, setAffiliation] = useState("");
  const [country, setCountry] = useState("");
  const [photoUrl, setPhotoUrl] = useState("");
  const [savingProfile, setSavingProfile] = useState(false);

  useEffect(() => {
    if (portal) {
      setBio(portal.bio || "");
      setDesignation(portal.designation || "");
      setAffiliation(portal.affiliation || "");
      setCountry(portal.country || "");
      setPhotoUrl(portal.photo_url || "");
    }
  }, [portal]);

  const handleSlideUpload = async (e: React.ChangeEvent<HTMLInputElement>, talk: PortalTalk) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadingFile(true);
    setUploadProgress(15);

    try {
      // Request upload URL
      const presignRes = await apiClient.post(`/portal/upload-url`, {
        session_speaker_id: talk.session_speaker_id,
        filename: file.name,
        file_size_bytes: file.size,
        mime_type: file.type || "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      }, {
        params: { token },
        headers: { "Idempotency-Key": crypto.randomUUID() },
      });

      setUploadProgress(45);
      const { upload_url, file_id } = presignRes.data;

      if (upload_url) {
        await fetch(upload_url, {
          method: "PUT",
          body: file,
          headers: { "Content-Type": file.type || "application/octet-stream" },
        });
      }

      setUploadProgress(85);

      // Confirm upload
      await apiClient.post(`/portal/confirm-upload`, {
        file_id,
        session_speaker_id: talk.session_speaker_id,
      }, {
        params: { token },
      });

      setUploadProgress(100);
      toast.success(`Slide deck "${file.name}" uploaded successfully!`);
      queryClient.invalidateQueries({ queryKey: ["portal-auth", eventId, token] });
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || "Failed to upload presentation slides");
    } finally {
      setUploadingFile(false);
      setUploadProgress(0);
    }
  };

  const handleCropComplete = async (blob: Blob) => {
    try {
      const formData = new FormData();
      formData.append("photo", blob, "headshot.jpg");
      const res = await apiClient.post(`/portal/speakers/me/photo?token=${token}`, formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      if (res.data?.photo_url) {
        setPhotoUrl(res.data.photo_url);
        toast.success("Headshot updated successfully");
      }
    } catch (err) {
      toast.error("Failed to upload photo");
    }
  };

  const handleSaveProfile = async () => {
    setSavingProfile(true);
    try {
      await apiClient.patch(`/portal/speakers/me?token=${token}`, {
        bio,
        designation,
        affiliation,
        country,
      });
      toast.success("Speaker profile saved successfully");
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || "Failed to update profile");
    } finally {
      setSavingProfile(false);
    }
  };

  if (isLoading) {
    return (
      <div className="py-24 flex flex-col items-center justify-center gap-3">
        <Loader2 className="h-8 w-8 animate-spin text-[var(--pri)]" />
        <p className="text-xs text-[var(--muted)]">Authenticating speaker workspace...</p>
      </div>
    );
  }

  if (error || !portal) {
    return (
      <div className="max-w-md mx-auto py-16 text-center space-y-4">
        <div className="h-16 w-16 rounded-full bg-[var(--status-danger-muted)] border border-[var(--status-danger)]/40 flex items-center justify-center mx-auto">
          <AlertCircle className="h-8 w-8 text-[var(--status-danger)]" />
        </div>
        <h2 className="text-xl font-bold text-[var(--text)]">Invalid or Expired Speaker Link</h2>
        <p className="text-xs text-[var(--muted)] leading-relaxed">
          The speaker token provided is invalid or has expired. Please check your invitation email or sign in with your email OTP.
        </p>
        <Button onClick={() => router.push(`/${eventId}/login`)}>
          Go to Sign In
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-12">
      
      {/* ── TOP NAVIGATION BACK TO DASHBOARD ────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[var(--border-default)] pb-4">
        <Button
          variant="outline"
          size="sm"
          onClick={() => router.push(`/${eventId}/dashboard`)}
          className="flex items-center gap-2 text-xs font-semibold hover:bg-[var(--bg-surface-2)]"
        >
          <ArrowRight className="h-4 w-4 rotate-180" />
          <span>← Back to Registration Dashboard</span>
        </Button>
      </div>

      {/* Deadline Warning Banner */}
      <DeadlineBanner deadlineInfo={deadlineInfo} />

      {/* Speaker Header Card */}
      <Card className="p-6 rounded-2xl border border-[var(--border-default)] bg-[var(--card)] shadow-md">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="relative">
              {photoUrl ? (
                <img src={photoUrl} alt="Speaker Photo" className="h-16 w-16 rounded-2xl object-cover border border-[var(--border-default)] shadow-sm" />
              ) : (
                <div className="h-16 w-16 rounded-2xl bg-[var(--pri)] text-[var(--primary-contrast)] font-extrabold text-2xl flex items-center justify-center shadow-md">
                  {portal.first_name?.[0]?.toUpperCase() || "S"}
                </div>
              )}
              <button
                onClick={() => setShowCropper(true)}
                className="absolute -bottom-1 -right-1 p-1.5 rounded-full bg-[var(--card)] border border-[var(--border-default)] text-[var(--text)] hover:bg-[var(--bg-surface-hover)] shadow-sm"
                title="Change Photo"
              >
                <Camera className="h-3.5 w-3.5 text-[var(--pri)]" />
              </button>
            </div>

            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-lg sm:text-xl font-bold text-[var(--text)]">
                  {portal.first_name} {portal.last_name}
                </h1>
                <Badge variant="purple">Faculty / Speaker</Badge>
              </div>
              <p className="text-xs text-[var(--muted)] mt-0.5">
                {portal.designation ? `${portal.designation} · ` : ""}{portal.affiliation || portal.email}
              </p>
              <p className="text-[11px] text-[var(--text-secondary)] mt-0.5">
                Event: <span className="font-semibold text-[var(--text)]">{portal.event_name}</span>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setShowTermsModal(true)} className="flex items-center gap-1.5 text-xs">
              <ShieldCheck className="h-3.5 w-3.5 text-[var(--pri)]" />
              Speaker Declarations
            </Button>
          </div>
        </div>
      </Card>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)} className="space-y-6">
        <TabsList className="flex flex-wrap h-auto p-1.5 gap-1 justify-start">
          <TabsTrigger value="dashboard" className="flex items-center gap-1.5">
            <Presentation className="h-4 w-4" />
            <span>My Presentations ({portal.talks?.length || 0})</span>
          </TabsTrigger>
          <TabsTrigger value="profile" className="flex items-center gap-1.5">
            <User className="h-4 w-4" />
            <span>Speaker Bio & Photo</span>
          </TabsTrigger>
          {portal.announcements?.length > 0 && (
            <TabsTrigger value="announcements" className="flex items-center gap-1.5">
              <Bell className="h-4 w-4" />
              <span>Announcements ({portal.announcements.length})</span>
            </TabsTrigger>
          )}
        </TabsList>

        {/* TAB 1: PRESENTATIONS & SLIDES */}
        <TabsContent value="dashboard" className="space-y-6">
          <div className="space-y-4">
            {portal.talks?.map((talk) => (
              <Card key={talk.session_speaker_id} className="border border-[var(--border-default)] bg-[var(--card)] shadow-sm">
                <CardHeader className="pb-3 border-b border-[var(--border-default)]">
                  <div className="flex flex-wrap justify-between items-start gap-2">
                    <div>
                      <div className="flex items-center gap-2">
                        {talk.track_name && (
                          <span className="px-2 py-0.5 rounded-md bg-[var(--pri)]/10 text-[var(--pri)] border border-[var(--pri)]/20 text-[10px] font-black uppercase tracking-wider">
                            {talk.track_name}
                          </span>
                        )}
                        <span className="font-mono text-xs font-bold text-[var(--pri)]">{talk.session_code}</span>
                        <Badge className={cn("text-[10px]", UPLOAD_STATUS_COLOR[talk.upload_status] || "")}>
                          {UPLOAD_STATUS_LABEL[talk.upload_status] || talk.upload_status.toUpperCase()}
                        </Badge>
                      </div>
                      <CardTitle className="text-base font-bold mt-1.5 text-[var(--text)]">
                        {talk.talk_title || talk.session_name}
                      </CardTitle>
                      <CardDescription className="text-xs text-[var(--muted)] mt-0.5">
                        Session: {talk.session_name} · Room: <span className="font-semibold text-[var(--text)]">{talk.room_name || "TBA"}</span>
                      </CardDescription>
                    </div>

                    <div className="text-xs text-[var(--muted)] flex items-center gap-1.5 bg-[var(--bg-surface-2)] px-3 py-1.5 rounded-lg border border-[var(--border-default)]">
                      <Clock className="h-3.5 w-3.5 text-[var(--pri)]" />
                      <span>{formatInTZ(talk.start_time)}</span>
                    </div>
                  </div>
                </CardHeader>

                <CardContent className="space-y-5 pt-4 text-xs">
                  {/* File Dropzone */}
                  <div className="p-6 rounded-xl border-2 border-dashed border-[var(--border-default)] bg-[var(--bg-surface-2)] hover:border-[var(--pri)] transition-colors text-center space-y-3">
                    <div className="mx-auto h-12 w-12 rounded-xl bg-[color-mix(in_srgb,var(--pri)_12%,transparent)] flex items-center justify-center">
                      <FileUp className="h-6 w-6 text-[var(--pri)]" />
                    </div>

                    <div>
                      <p className="font-bold text-sm text-[var(--text)]">
                        {talk.filename ? `Current File: ${talk.filename}` : "Upload Slide Deck (PPTX / PDF)"}
                      </p>
                      <p className="text-xs text-[var(--muted)] mt-0.5">
                        Max file size: {portal.max_file_size_mb || 250}MB. Supported formats: .pptx, .pdf
                      </p>
                    </div>

                    {uploadingFile ? (
                      <div className="max-w-xs mx-auto space-y-2">
                        <div className="h-2 w-full bg-[var(--bg-surface-3)] rounded-full overflow-hidden">
                          <div className="h-full bg-[var(--pri)] transition-all duration-300" style={{ width: `${uploadProgress}%` }} />
                        </div>
                        <span className="text-[11px] text-[var(--muted)]">Uploading file... {uploadProgress}%</span>
                      </div>
                    ) : (
                      <label className="inline-flex">
                        <Button asChild size="sm" disabled={talk.is_locked || deadlineInfo.isLocked} className="cursor-pointer">
                          <span>
                            <Upload className="h-3.5 w-3.5 mr-1.5" />
                            {talk.filename ? "Replace Presentation" : "Choose Presentation File"}
                          </span>
                        </Button>
                        <input
                          type="file"
                          accept=".pptx,.pdf,.ppt"
                          disabled={talk.is_locked || deadlineInfo.isLocked}
                          onChange={(e) => handleSlideUpload(e, talk)}
                          className="hidden"
                        />
                      </label>
                    )}

                    {talk.download_url && (
                      <div className="pt-2">
                        <a
                          href={talk.download_url}
                          target="_blank"
                          rel="noreferrer"
                          className="text-xs text-[var(--pri)] hover:underline inline-flex items-center gap-1 font-semibold"
                        >
                          <Download className="h-3.5 w-3.5" />
                          Download Uploaded Copy
                        </a>
                      </div>
                    )}
                  </div>

                  {/* Abstract Section */}
                  <AbstractEditor
                    eventId={eventId}
                    token={token}
                    talk={talk}
                    enabled={portal.abstract_submission_enabled}
                    denialReason={portal.abstract_submission_reason}
                  />
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        {/* TAB 2: SPEAKER BIO & PROFILE */}
        <TabsContent value="profile" className="space-y-6">
          <Card className="border border-[var(--border-default)] bg-[var(--card)]">
            <CardHeader>
              <CardTitle className="text-base font-bold">Faculty Biography & Details</CardTitle>
              <CardDescription className="text-xs text-[var(--muted)]">
                This bio and photo will appear on the conference website and mobile program guide
              </CardDescription>
            </CardHeader>

            <CardContent className="space-y-4 text-xs">
              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <label className="font-semibold block mb-1.5">Designation</label>
                  <Input value={designation} onChange={(e) => setDesignation(e.target.value)} placeholder="Professor of Medicine" />
                </div>
                <div>
                  <label className="font-semibold block mb-1.5">Affiliation / Institution</label>
                  <Input value={affiliation} onChange={(e) => setAffiliation(e.target.value)} placeholder="Oxford University Hospitals" />
                </div>
                <div>
                  <label className="font-semibold block mb-1.5">Country</label>
                  <Input value={country} onChange={(e) => setCountry(e.target.value)} placeholder="United Kingdom" />
                </div>
              </div>

              <div>
                <label className="font-semibold block mb-1.5">Biography</label>
                <Textarea
                  rows={5}
                  value={bio}
                  onChange={(e) => setBio(e.target.value)}
                  placeholder="Share a brief overview of your clinical background, research focus, and achievements..."
                />
              </div>
            </CardContent>

            <CardFooter className="flex justify-end border-t border-[var(--border-default)] pt-4">
              <Button onClick={handleSaveProfile} disabled={savingProfile} size="sm">
                {savingProfile ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save Profile"}
              </Button>
            </CardFooter>
          </Card>
        </TabsContent>

        {/* TAB 3: ANNOUNCEMENTS */}
        {portal.announcements?.length > 0 && (
          <TabsContent value="announcements" className="space-y-4">
            {portal.announcements.map((ann: any, idx: number) => (
              <Card key={idx} className="border border-[var(--border-default)] bg-[var(--card)] p-4 space-y-2 text-xs">
                <div className="flex items-center gap-2 text-[var(--pri)] font-bold">
                  <Bell className="h-4 w-4" />
                  <span>{ann.title || "Organiser Notice"}</span>
                </div>
                <p className="text-[var(--text)] leading-relaxed">{ann.message || ann.body}</p>
                {ann.created_at && (
                  <span className="text-[10px] text-[var(--muted)] block">{new Date(ann.created_at).toLocaleDateString()}</span>
                )}
              </Card>
            ))}
          </TabsContent>
        )}

      </Tabs>

      {/* Image Cropper Modal */}
      {showCropper && (
        <ImageCropper onCrop={handleCropComplete} onClose={() => setShowCropper(false)} />
      )}

      {/* Terms Modal */}
      <TermsModal
        isOpen={showTermsModal}
        onClose={() => setShowTermsModal(false)}
        onAccept={async (rights) => {
          try {
            await apiClient.post(`/portal/speakers/me/terms?token=${token}`, { rights });
            toast.success("Declarations recorded successfully");
            setShowTermsModal(false);
          } catch {
            toast.error("Failed to record terms acceptance");
          }
        }}
        isSubmitting={false}
      />

    </div>
  );
}
