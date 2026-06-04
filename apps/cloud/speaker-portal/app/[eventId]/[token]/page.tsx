"use client";

import { usePortalAuth } from "@/hooks/usePortal";
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
  Bell, HelpCircle, Linkedin, Twitter, Tag, X, Sparkles, Check
} from "lucide-react";
import Link from "next/link";
import { PortalHeader } from "@/components/PortalHeader";
import { DeadlineBanner, DeadlineCountdownBadge } from "@/components/DeadlineBanner";
import { cn } from "@/lib/utils";
import { useDeadlineStatus } from "@/hooks/useDeadlineStatus";
import { ImageCropper } from "@/components/ImageCropper";

export default function SpeakerLandingPage() {
  const params = useParams();
  const router = useRouter();
  const token = params.token as string;
  const eventId = params.eventId as string;
  const queryClient = useQueryClient();

  const { data: portal, isLoading, error } = usePortalAuth(eventId, token);
  const deadlineInfo = useDeadlineStatus(
    portal?.upload_deadline ?? null,
    portal?.allow_override ?? false
  );

  // Tab State
  const [activeTab, setActiveTab] = useState<"dashboard" | "profile" | "announcements">("dashboard");

  // Profile Intake Mode State
  const [profileMode, setProfileMode] = useState<"form" | "template" | "cv">("form");

  // Cropper Modal State
  const [showCropper, setShowCropper] = useState(false);

  // PDF Viewer / Lightbox State
  const [pdfViewerUrl, setPdfViewerUrl] = useState<string | null>(null);
  const [lightboxImageUrl, setLightboxImageUrl] = useState<string | null>(null);

  // Announcement Expanded IDs
  const [expandedAnnouncements, setExpandedAnnouncements] = useState<Record<string, boolean>>({});

  // Structured Form States
  const [designation, setDesignation] = useState("");
  const [affiliation, setAffiliation] = useState("");
  const [country, setCountry] = useState("");
  const [phone, setPhone] = useState("");
  const [bio, setBio] = useState("");
  const [linkedin, setLinkedin] = useState("");
  const [twitter, setTwitter] = useState("");
  const [orcid, setOrcid] = useState("");
  const [github, setGithub] = useState("");
  const [photoUrl, setPhotoUrl] = useState("");
  const [researchInterests, setResearchInterests] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState("");

  // Sync portal data into form states when loaded
  useEffect(() => {
    if (portal) {
      setDesignation(portal.designation || "");
      setAffiliation(portal.affiliation || "");
      setCountry(portal.country || "");
      setPhone(portal.phone || "");
      setBio(portal.bio || "");
      setPhotoUrl(portal.photo_url || "");
      setLinkedin(portal.social_links?.linkedin || "");
      setTwitter(portal.social_links?.twitter || "");
      setOrcid(portal.social_links?.orcid || "");
      setGithub(portal.social_links?.github || "");
      setResearchInterests(portal.research_interests || []);
    }
  }, [portal]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="flex flex-col items-center gap-4">
          <div className="h-12 w-12 border-4 border-indigo-500/20 border-t-indigo-500 rounded-full animate-spin" />
          <div className="text-xs font-black text-muted uppercase tracking-[0.3em]">Authenticating</div>
        </div>
      </div>
    );
  }

  if (error || !portal) {
    let errorMessage = "The security token or access code you provided is invalid or has expired.";
    if (error) {
      const axiosError = error as any;
      if (axiosError.response?.data?.detail) {
        errorMessage = axiosError.response.data.detail;
      }
    }

    return (
      <div className="flex flex-col items-center justify-center min-h-screen p-6">
        <motion.div 
          initial={{ scale: 0.95, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="glass-3d p-10 max-w-md text-center"
        >
          <div className="h-20 w-20 rounded-full bg-red-500/10 border border-red-500/20 flex items-center justify-center mx-auto mb-6">
            <AlertCircle className="h-10 w-10 text-red-400" />
          </div>
          <h1 className="text-2xl font-black mb-4 text-red-400 uppercase tracking-tighter">Access Denied</h1>
          <p className="text-muted font-bold text-sm mb-8 leading-relaxed">
            {errorMessage}
          </p>
          <button 
            onClick={() => router.push(`/${eventId}/login`)}
            className="btn-primary w-full h-12"
          >
            Go Back
          </button>
        </motion.div>
      </div>
    );
  }

  const speakerName = `${portal.first_name} ${portal.last_name}`;
  const isDeadlineLocked = deadlineInfo.isLocked;

  // Bio Word Counter
  const getBioWordCount = () => {
    return bio ? bio.trim().split(/\s+/).filter(Boolean).length : 0;
  };

  // Add tag handler
  const handleAddTag = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && tagInput.trim()) {
      e.preventDefault();
      if (!researchInterests.includes(tagInput.trim())) {
        setResearchInterests([...researchInterests, tagInput.trim()]);
      }
      setTagInput("");
    }
  };

  const handleRemoveTag = (tag: string) => {
    setResearchInterests(researchInterests.filter((t) => t !== tag));
  };

  // Structured form submit
  const handleSaveProfile = async () => {
    const wordCount = getBioWordCount();
    if (wordCount > 400) {
      toast.error("Biography exceeds 400 words limit.");
      return;
    }

    try {
      await apiClient.patch(`/portal/profile?token=${token}`, {
        designation,
        affiliation,
        country,
        bio,
        phone,
        social_links: { linkedin, twitter, orcid, github },
        research_interests: researchInterests,
        photo_url: photoUrl
      });
      toast.success("Profile saved successfully!");
      queryClient.invalidateQueries({ queryKey: ["portal-auth", eventId, token] });
    } catch (err: any) {
      toast.error(err.response?.data?.detail || "Failed to save profile.");
    }
  };

  // Cropper Upload callback
  const handleCropImage = async (blob: Blob) => {
    setShowCropper(false);
    const formData = new FormData();
    formData.append("file", blob, "profile_photo.png");

    const loadingId = toast.loading("Uploading photo...");
    try {
      const res = await apiClient.post(`/portal/profile/photo?token=${token}`, formData, {
        headers: { "Content-Type": "multipart/form-data" }
      });
      setPhotoUrl(res.data.photo_url);
      toast.success("Photo uploaded successfully!", { id: loadingId });
      queryClient.invalidateQueries({ queryKey: ["portal-auth", eventId, token] });
    } catch (err) {
      toast.error("Failed to upload cropped photo.", { id: loadingId });
    }
  };

  // Mode 1 Template Download Pre-Filled
  const handleDownloadTemplate = (format: "docx" | "pptx") => {
    window.open(`${apiClient.defaults.baseURL || 'http://127.0.0.1:8000/api/v1'}/portal/profile/template?token=${token}&format=${format}`, "_blank");
  };

  // Mode 1 Template Upload
  const handleUploadTemplate = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const file = e.target.files[0];
      const formData = new FormData();
      formData.append("file", file);

      const loadingId = toast.loading("Uploading template...");
      try {
        await apiClient.post(`/portal/profile/template/upload?token=${token}`, formData, {
          headers: { "Content-Type": "multipart/form-data" }
        });
        toast.success("Template parsed and profile updated!", { id: loadingId });
        queryClient.invalidateQueries({ queryKey: ["portal-auth", eventId, token] });
      } catch (err: any) {
        toast.error(err.response?.data?.detail || "Failed to parse template.", { id: loadingId });
      }
    }
  };

  // Mode 3 CV Upload
  const handleUploadCV = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const file = e.target.files[0];
      const formData = new FormData();
      formData.append("file", file);

      const loadingId = toast.loading("Analyzing CV...");
      try {
        const res = await apiClient.post(`/portal/profile/cv/upload?token=${token}`, formData, {
          headers: { "Content-Type": "multipart/form-data" }
        });
        
        // Extract values
        if (res.data) {
          setDesignation(res.data.designation || "");
          setAffiliation(res.data.affiliation || "");
          setBio(res.data.bio || "");
          setProfileMode("form");
          toast.success("CV parsed! Review and confirm details below.", { id: loadingId });
        }
      } catch (err: any) {
        toast.error(err.response?.data?.detail || "Failed to analyze CV.", { id: loadingId });
      }
    }
  };

  // Attachment click handler
  const handleAttachmentClick = async (att: any) => {
    if (att.type === "file") {
      const ext = att.name.split(".").pop()?.toLowerCase();
      if (ext === "pdf") {
        // Native rendering via short-lived signed URL
        try {
          const res = await apiClient.get(`/portal/announcements/signed-url`, {
            params: { storage_path: att.storage_path }
          });
          setPdfViewerUrl(res.data.url);
        } catch (err) {
          toast.error("Could not load PDF document.");
        }
      } else if (["jpg", "jpeg", "png", "webp", "gif"].includes(ext || "")) {
        // Image lightbox
        setLightboxImageUrl(att.url);
      } else {
        // Direct download
        window.open(att.url, "_blank");
      }
    } else {
      // Direct open drive/external link in tab
      window.open(att.url, "_blank");
    }
  };

  const getDriveIcon = (url: string) => {
    const lowerUrl = url.toLowerCase();
    if (lowerUrl.includes("drive.google.com")) {
      return (
        <span className="inline-flex items-center gap-1.5 text-yellow-500 font-bold">
          <svg className="h-3.5 w-3.5 fill-current" viewBox="0 0 24 24"><path d="M19.43 12.98c.04-.32.07-.64.07-.98s-.03-.66-.07-.98l2.11-1.65c.19-.15.24-.42.12-.64l-2-3.46c-.12-.22-.39-.3-.61-.22l-2.49 1c-.52-.4-1.08-.73-1.69-.98l-.38-2.65C14.46.2 14.25 0 14 0h-4c-.25 0-.46.2-.49.45L9.13 3.1c-.61.25-1.17.59-1.69.98l-2.49-1c-.23-.09-.49 0-.61.22l-2 3.46c-.13.22-.07.49.12.64l2.11 1.65c-.04.32-.07.65-.07.98s.03.66.07.98l-2.11 1.65c-.19.15-.24.42-.12.64l2 3.46c.12.22.39.3.61.22l2.49-1c.52.4 1.08.73 1.69.98l.38 2.65c.03.25.24.45.49.45h4c.25 0 .46-.2.49-.45l.38-2.65c.61-.25 1.17-.59 1.69-.98l2.49 1c.23.09.49 0 .61-.22l2-3.46c.12-.22.07-.49-.12-.64l-2.11-1.65zM12 15.5c-1.93 0-3.5-1.57-3.5-3.5s1.57-3.5 3.5-3.5 3.5 1.57 3.5 3.5-1.57 3.5-3.5 3.5z"/></svg>
          Google Drive
        </span>
      );
    }
    if (lowerUrl.includes("onedrive.live.com") || lowerUrl.includes("sharepoint.com")) {
      return (
        <span className="inline-flex items-center gap-1.5 text-blue-400 font-bold">
          <svg className="h-3.5 w-3.5 fill-current" viewBox="0 0 24 24"><path d="M19.35 10.04C18.67 6.59 15.64 4 12 4 9.11 4 6.6 5.64 5.35 8.04 2.34 8.36 0 10.91 0 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96z"/></svg>
          OneDrive
        </span>
      );
    }
    if (lowerUrl.includes("dropbox.com")) {
      return (
        <span className="inline-flex items-center gap-1.5 text-indigo-400 font-bold">
          <svg className="h-3.5 w-3.5 fill-current" viewBox="0 0 24 24"><path d="M5.5 2L1 5.5l6.5 5.5L12 7.5 5.5 2zM1 12.5l4.5 3.5L12 11l-4.5-5.5L1 12.5zm16.5-7L12 2l-6.5 5.5L12 11l5.5-5.5zM12 11l6.5 5 4.5-3.5L16.5 7 12 11zm11 1.5l-4.5-3.5L12 14.5l4.5 5.5 6.5-6.5zM12 14.5l-5.5-5.5-4.5 3.5L8.5 19l3.5-4.5zm0 0.5l-4.5 4 4.5 3.5 4.5-3.5-4.5-4z"/></svg>
          Dropbox
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1.5 text-emerald-400 font-bold">
        <Sparkles className="h-3.5 w-3.5" />
        External Link
      </span>
    );
  };

  return (
    <div className="min-h-screen flex flex-col">
      {portal.theme_color && (
        <style dangerouslySetInnerHTML={{ __html: `
          :root {
            --pri: ${portal.theme_color};
            --sec: color-mix(in srgb, ${portal.theme_color} 80%, white);
          }
        `}} />
      )}
      {/* Sticky deadline banner */}
      <DeadlineBanner deadlineInfo={deadlineInfo} className="sticky top-0 z-[60]" />

      <PortalHeader speakerName={speakerName} email={portal.email} token={token} eventId={eventId} />

      {/* Premium Glassmorphic Tab Navigation */}
      <div className="max-w-7xl mx-auto w-full px-6 md:px-10 mt-8">
        <div className="flex gap-2 p-1.5 bg-stone-900/60 backdrop-blur-md rounded-2xl border border-white/5 max-w-md">
          <button
            onClick={() => setActiveTab("dashboard")}
            className={cn(
              "flex-1 py-3 px-4 rounded-xl text-xs font-black uppercase tracking-wider transition-all flex items-center justify-center gap-2",
              activeTab === "dashboard" ? "bg-indigo-500 text-white shadow-lg" : "text-muted hover:text-white"
            )}
          >
            <Presentation className="h-4 w-4" /> My Talks
          </button>
          <button
            onClick={() => setActiveTab("profile")}
            className={cn(
              "flex-1 py-3 px-4 rounded-xl text-xs font-black uppercase tracking-wider transition-all flex items-center justify-center gap-2",
              activeTab === "profile" ? "bg-indigo-500 text-white shadow-lg" : "text-muted hover:text-white"
            )}
          >
            <User className="h-4 w-4" /> Profile
          </button>
          <button
            onClick={() => setActiveTab("announcements")}
            className={cn(
              "flex-1 py-3 px-4 rounded-xl text-xs font-black uppercase tracking-wider transition-all flex items-center justify-center gap-2 relative",
              activeTab === "announcements" ? "bg-indigo-500 text-white shadow-lg" : "text-muted hover:text-white"
            )}
          >
            <Bell className="h-4 w-4" /> Bulletins
            {portal.announcements && portal.announcements.length > 0 && (
              <span className="absolute -top-1 -right-1 h-5 w-5 bg-indigo-500 text-[10px] font-black rounded-full flex items-center justify-center border-2 border-stone-950 text-white animate-pulse">
                {portal.announcements.length}
              </span>
            )}
          </button>
        </div>
      </div>

      <main className="flex-1 max-w-7xl mx-auto w-full px-6 md:px-10 py-10">
        <AnimatePresence mode="wait">
          {activeTab === "dashboard" && (
            <motion.div
              key="dashboard"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              className="space-y-12"
            >
              {/* original landing layout */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-10 items-start">
                <div className="lg:col-span-2 space-y-12">
                  {/* Presentations */}
                  <div className="space-y-6">
                    <div className="flex items-center justify-between border-b border-white/5 pb-4">
                      <h2 className="text-[12px] font-black text-muted uppercase tracking-[0.3em] flex items-center gap-3">
                        <Presentation className="h-4 w-4 text-indigo-400" /> Required Uploads
                      </h2>
                      <DeadlineCountdownBadge deadlineInfo={deadlineInfo} />
                    </div>

                    {portal.talks.length === 0 ? (
                      <div className="glass-3d p-20 text-center text-muted font-black uppercase tracking-widest italic rounded-[2.5rem]">
                        No active presentation assignments found
                      </div>
                    ) : (
                      <div className="grid gap-6">
                        {portal.talks.map((talk) => (
                          <div 
                            key={talk.session_speaker_id}
                            className="glass-3d p-8 group hover-lift-3d flex flex-col lg:flex-row lg:items-center justify-between gap-8 rounded-[2.5rem]"
                          >
                            <div className="flex-1 space-y-4">
                              <div className="flex flex-wrap items-center gap-3">
                                <span className={cn(
                                  "badge",
                                  talk.upload_status === 'approved' ? 'badge-success' :
                                  talk.upload_status === 'uploaded' ? 'badge-info' :
                                  'badge-warning'
                                )}>
                                  {talk.upload_status}
                                </span>
                                <span className="text-[10px] font-black text-muted uppercase tracking-widest px-2 py-1 rounded bg-white/5 border border-white/5">
                                  {talk.session_code}
                                </span>
                              </div>
                              
                              <h3 className="text-2xl md:text-3xl font-black tracking-tighter group-hover:text-indigo-400 transition-colors">
                                {talk.talk_title || talk.session_name}
                              </h3>
                              
                              <div className="flex flex-wrap gap-x-8 gap-y-3">
                                <div className="flex items-center gap-2.5 text-sm font-bold text-muted">
                                  <Calendar className="h-4 w-4 text-indigo-400/70" />
                                  {new Date(talk.start_time).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' })}
                                </div>
                                <div className="flex items-center gap-2.5 text-sm font-bold text-muted">
                                  <Clock className="h-4 w-4 text-indigo-400/70" />
                                  {new Date(talk.start_time).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'Asia/Kolkata' })} IST
                                </div>
                              </div>
                            </div>

                            <div className="flex items-center gap-6">
                              {isDeadlineLocked ? (
                                <div className="flex flex-col items-center gap-3 text-center px-6">
                                  <Lock className="h-6 w-6 text-red-400" />
                                </div>
                              ) : (
                                <Link 
                                  href={`/${eventId}/${token}/upload?slot=${talk.session_speaker_id}`}
                                  className="btn-primary px-10 h-14 rounded-full font-black text-[11px] uppercase tracking-widest flex items-center justify-center gap-2"
                                >
                                  {talk.upload_status === 'pending' ? 'Begin Upload' : 'Update Files'} <ChevronRight className="h-4 w-4" />
                                </Link>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Posters */}
                  {portal.posters && portal.posters.length > 0 && (
                    <div className="space-y-6">
                      <div className="flex items-center justify-between border-b border-white/5 pb-4">
                        <h2 className="text-[12px] font-black text-muted uppercase tracking-[0.3em] flex items-center gap-3">
                          <Monitor className="h-4 w-4 text-indigo-400" /> Digital Posters
                        </h2>
                      </div>
                      <div className="grid gap-6">
                        {portal.posters.map((poster) => (
                          <div 
                            key={poster.id}
                            className="glass-3d p-8 group hover-lift-3d flex flex-col lg:flex-row lg:items-center justify-between gap-8 rounded-[2.5rem]"
                          >
                            <div className="flex-1 space-y-4">
                              <span className="badge badge-info">{poster.status}</span>
                              <h3 className="text-2xl font-black">{poster.title}</h3>
                              <p className="text-sm font-bold text-muted">{poster.category || "General"}</p>
                            </div>
                            <Link 
                              href={`/${eventId}/${token}/upload?poster=${poster.id}`}
                              className="btn-primary px-10 h-14 rounded-full font-black text-[11px] uppercase tracking-widest flex items-center justify-center"
                            >
                              Upload PDF
                            </Link>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* Right side pass */}
                <div className="space-y-10 lg:sticky lg:top-24">
                  {/* Access QR card */}
                  <div className="glass-3d p-8 rounded-[2.5rem] bg-indigo-950/10 border-indigo-500/10 text-center space-y-6">
                    <div>
                      <span className="text-[9px] font-black text-indigo-400 uppercase tracking-[0.3em] block mb-1">Your Digital Badge</span>
                      <h3 className="text-xl font-black text-[#E8EAFF]">Entry QR Pass</h3>
                    </div>
                    <div className="relative mx-auto max-w-[200px] aspect-[2/3] rounded-[1.5rem] overflow-hidden border border-white/10 bg-white shadow-2xl">
                      <img 
                        src={`${apiClient.defaults.baseURL || 'http://127.0.0.1:8000/api/v1'}/portal/speaker-qr/${portal.speaker_id}/download?format=jpg`} 
                        alt="QR Pass"
                        className="w-full h-full object-contain"
                      />
                    </div>
                    <div>
                      <span className="text-[10px] font-black text-muted uppercase tracking-widest block mb-1">Access Code</span>
                      <span className="text-lg font-black text-indigo-400">{portal.speaker_code}</span>
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {activeTab === "profile" && (
            <motion.div
              key="profile"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              className="grid grid-cols-1 lg:grid-cols-3 gap-10 items-start"
            >
              {/* Form & Mode Selectors */}
              <div className="lg:col-span-2 space-y-8">
                {/* Mode Select Buttons */}
                <div className="flex gap-4 border-b border-white/5 pb-4">
                  <button
                    onClick={() => setProfileMode("form")}
                    className={cn(
                      "pb-3 text-xs font-black uppercase tracking-widest border-b-2 transition-all",
                      profileMode === "form" ? "border-indigo-500 text-indigo-400" : "border-transparent text-muted hover:text-white"
                    )}
                  >
                    Structured Form
                  </button>
                  <button
                    onClick={() => setProfileMode("template")}
                    className={cn(
                      "pb-3 text-xs font-black uppercase tracking-widest border-b-2 transition-all",
                      profileMode === "template" ? "border-indigo-500 text-indigo-400" : "border-transparent text-muted hover:text-white"
                    )}
                  >
                    Template Intake
                  </button>
                  <button
                    onClick={() => setProfileMode("cv")}
                    className={cn(
                      "pb-3 text-xs font-black uppercase tracking-widest border-b-2 transition-all",
                      profileMode === "cv" ? "border-indigo-500 text-indigo-400" : "border-transparent text-muted hover:text-white"
                    )}
                  >
                    Upload CV (PDF)
                  </button>
                </div>

                {/* Form Rendering */}
                {profileMode === "form" && (
                  <div className="glass-3d p-8 rounded-[2.5rem] space-y-6">
                    <h3 className="text-xl font-black uppercase tracking-wider text-[#E8EAFF]">Structured Profile Details</h3>

                    {/* Avatar Cropper Section */}
                    <div className="flex items-center gap-6 pb-6 border-b border-white/5">
                      <div className="relative h-24 w-24 rounded-full border-2 border-indigo-500/20 overflow-hidden bg-stone-900 flex items-center justify-center">
                        {photoUrl ? (
                          <img src={photoUrl} alt="Speaker avatar" className="h-full w-full object-cover" />
                        ) : (
                          <User className="h-10 w-10 text-muted" />
                        )}
                      </div>
                      <div>
                        <button
                          onClick={() => setShowCropper(true)}
                          className="h-10 px-5 rounded-full border border-white/10 text-xs font-black uppercase tracking-widest hover:border-indigo-500/30 text-indigo-400 transition-all flex items-center gap-2"
                        >
                          <FileImage className="h-4 w-4" /> Crop Profile Photo
                        </button>
                        <p className="text-[10px] font-bold text-muted uppercase mt-2">Required for final printed booklets</p>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div className="space-y-2">
                        <label className="text-[10px] font-black uppercase tracking-wider text-muted">Designation</label>
                        <input
                          type="text"
                          value={designation}
                          onChange={(e) => setDesignation(e.target.value)}
                          placeholder="e.g. Associate Professor"
                          className="w-full h-12 rounded-2xl bg-white/5 border border-white/10 px-4 text-sm font-bold focus:border-indigo-500/50 outline-none text-[#E8EAFF]"
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-[10px] font-black uppercase tracking-wider text-muted">Affiliation / Organization</label>
                        <input
                          type="text"
                          value={affiliation}
                          onChange={(e) => setAffiliation(e.target.value)}
                          placeholder="e.g. Stanford University"
                          className="w-full h-12 rounded-2xl bg-white/5 border border-white/10 px-4 text-sm font-bold focus:border-indigo-500/50 outline-none text-[#E8EAFF]"
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-[10px] font-black uppercase tracking-wider text-muted">Country</label>
                        <input
                          type="text"
                          value={country}
                          onChange={(e) => setCountry(e.target.value)}
                          placeholder="e.g. Germany"
                          className="w-full h-12 rounded-2xl bg-white/5 border border-white/10 px-4 text-sm font-bold focus:border-indigo-500/50 outline-none text-[#E8EAFF]"
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-[10px] font-black uppercase tracking-wider text-muted">Contact Phone</label>
                        <input
                          type="text"
                          value={phone}
                          onChange={(e) => setPhone(e.target.value)}
                          placeholder="e.g. +49 111 222333"
                          className="w-full h-12 rounded-2xl bg-white/5 border border-white/10 px-4 text-sm font-bold focus:border-indigo-500/50 outline-none text-[#E8EAFF]"
                        />
                      </div>
                    </div>

                    {/* Biography block */}
                    <div className="space-y-2">
                      <div className="flex justify-between">
                        <label className="text-[10px] font-black uppercase tracking-wider text-muted">Biography</label>
                        <span className={cn(
                          "text-[10px] font-black uppercase",
                          getBioWordCount() > 400 ? "text-red-400" : "text-muted"
                        )}>
                          {getBioWordCount()} / 400 words
                        </span>
                      </div>
                      <textarea
                        rows={6}
                        value={bio}
                        onChange={(e) => setBio(e.target.value)}
                        placeholder="Type your biography details here..."
                        className="w-full rounded-2xl bg-white/5 border border-white/10 p-4 text-sm font-bold focus:border-indigo-500/50 outline-none text-[#E8EAFF] resize-none"
                      />
                    </div>

                    {/* Social links */}
                    <div className="space-y-4 pt-4 border-t border-white/5">
                      <h4 className="text-[11px] font-black uppercase tracking-wider text-indigo-400">Social Connections</h4>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="relative">
                          <Linkedin className="absolute left-4 top-3.5 h-5 w-5 text-muted" />
                          <input
                            type="text"
                            value={linkedin}
                            onChange={(e) => setLinkedin(e.target.value)}
                            placeholder="LinkedIn URL"
                            className="w-full h-12 rounded-2xl bg-white/5 border border-white/10 pl-12 pr-4 text-sm font-bold focus:border-indigo-500/50 outline-none text-[#E8EAFF]"
                          />
                        </div>
                        <div className="relative">
                          <Twitter className="absolute left-4 top-3.5 h-5 w-5 text-muted" />
                          <input
                            type="text"
                            value={twitter}
                            onChange={(e) => setTwitter(e.target.value)}
                            placeholder="Twitter/X URL"
                            className="w-full h-12 rounded-2xl bg-white/5 border border-white/10 pl-12 pr-4 text-sm font-bold focus:border-indigo-500/50 outline-none text-[#E8EAFF]"
                          />
                        </div>
                      </div>
                    </div>

                    {/* Research Interests tag input */}
                    <div className="space-y-3 pt-4 border-t border-white/5">
                      <label className="text-[10px] font-black uppercase tracking-wider text-muted">Research Interests (Press Enter)</label>
                      <div className="flex flex-wrap gap-2 p-3 rounded-2xl bg-white/5 border border-white/10">
                        {researchInterests.map((interest) => (
                          <span key={interest} className="inline-flex items-center gap-1 bg-indigo-500/20 text-indigo-400 border border-indigo-500/25 px-2.5 py-1 rounded-lg text-xs font-bold">
                            {interest}
                            <button onClick={() => handleRemoveTag(interest)} className="hover:text-white transition-colors">
                              <X className="h-3 w-3" />
                            </button>
                          </span>
                        ))}
                        <input
                          type="text"
                          value={tagInput}
                          onChange={(e) => setTagInput(e.target.value)}
                          onKeyDown={handleAddTag}
                          placeholder={researchInterests.length === 0 ? "e.g. Machine Learning, Neuroscience" : "Add interest..."}
                          className="bg-transparent outline-none flex-1 text-xs font-bold text-[#E8EAFF] min-w-[120px]"
                        />
                      </div>
                    </div>

                    {/* Save Action */}
                    <div className="pt-4 flex justify-end">
                      <button
                        onClick={handleSaveProfile}
                        className="btn-primary px-8 h-12 rounded-full font-black text-xs uppercase tracking-widest flex items-center gap-2"
                      >
                        Save Profile Changes <Check className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                )}

                {profileMode === "template" && (
                  <div className="glass-3d p-8 rounded-[2.5rem] space-y-8">
                    <h3 className="text-xl font-black uppercase tracking-wider text-[#E8EAFF]">Intake Mode 1: Document Templates</h3>
                    <p className="text-xs text-muted leading-relaxed">
                      Download a pre-filled template in Word or PowerPoint format containing your session, talk details and slots. Edit it inside Microsoft Office, fill in your details, paste your profile photo inside the designated areas, and re-upload the file below. Our system parses it automatically.
                    </p>

                    {/* Downloads */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <button 
                        onClick={() => handleDownloadTemplate("docx")}
                        className="h-16 rounded-2xl bg-white/5 hover:bg-white/10 border border-white/10 flex items-center justify-between px-6 group transition-all text-left"
                      >
                        <div>
                          <span className="text-xs font-black uppercase tracking-wider text-[#E8EAFF] block">Word Template</span>
                          <span className="text-[10px] font-bold text-muted uppercase">Pre-filled DOCX</span>
                        </div>
                        <Download className="h-5 w-5 text-indigo-400 group-hover:scale-110 transition-transform" />
                      </button>

                      <button 
                        onClick={() => handleDownloadTemplate("pptx")}
                        className="h-16 rounded-2xl bg-white/5 hover:bg-white/10 border border-white/10 flex items-center justify-between px-6 group transition-all text-left"
                      >
                        <div>
                          <span className="text-xs font-black uppercase tracking-wider text-[#E8EAFF] block">PowerPoint Slide</span>
                          <span className="text-[10px] font-bold text-muted uppercase">Pre-filled PPTX</span>
                        </div>
                        <Download className="h-5 w-5 text-indigo-400 group-hover:scale-110 transition-transform" />
                      </button>
                    </div>

                    {/* Upload Template Area */}
                    <label className="w-full h-44 rounded-[2rem] border-2 border-dashed border-white/10 hover:border-indigo-500/50 hover:bg-indigo-500/5 flex flex-col items-center justify-center gap-4 cursor-pointer transition-all duration-300">
                      <FileUp className="h-10 w-10 text-muted" />
                      <div className="text-center">
                        <span className="text-xs font-black uppercase tracking-widest text-indigo-400 block mb-1">Re-upload Completed Template</span>
                        <span className="text-[9px] font-bold text-muted uppercase">DOCX or PPTX formats</span>
                      </div>
                      <input type="file" accept=".docx,.pptx" onChange={handleUploadTemplate} className="hidden" />
                    </label>
                  </div>
                )}

                {profileMode === "cv" && (
                  <div className="glass-3d p-8 rounded-[2.5rem] space-y-6">
                    <h3 className="text-xl font-black uppercase tracking-wider text-[#E8EAFF]">Intake Mode 3: CV Text Parser</h3>
                    <p className="text-xs text-muted leading-relaxed">
                      Upload your existing professional Curriculum Vitae (CV) or Resume as a PDF document. EventOS's AI parsing heuristics will analyze and extract your job title, university/company affiliation, and a formatted bio snippet directly, allowing you to review them immediately.
                    </p>

                    <label className="w-full h-44 rounded-[2rem] border-2 border-dashed border-white/10 hover:border-indigo-500/50 hover:bg-indigo-500/5 flex flex-col items-center justify-center gap-4 cursor-pointer transition-all duration-300">
                      <FileText className="h-10 w-10 text-muted" />
                      <div className="text-center">
                        <span className="text-xs font-black uppercase tracking-widest text-indigo-400 block mb-1">Upload CV Document</span>
                        <span className="text-[9px] font-bold text-muted uppercase">PDF format only</span>
                      </div>
                      <input type="file" accept=".pdf" onChange={handleUploadCV} className="hidden" />
                    </label>
                  </div>
                )}
              </div>

              {/* Right Side: Completeness Score Ring */}
              <div className="space-y-6 lg:sticky lg:top-24">
                <div className="glass-3d p-8 rounded-[2.5rem] bg-indigo-950/10 border-indigo-500/10 text-center space-y-6">
                  <div>
                    <h4 className="text-xs font-black uppercase tracking-[0.2em] text-[#E8EAFF] mb-1">Profile Completeness</h4>
                    <p className="text-[9px] font-bold text-muted uppercase">Completing your profile improves badge visibility</p>
                  </div>

                  {/* Circular Score Ring */}
                  <div className="relative h-40 w-40 mx-auto flex items-center justify-center">
                    <svg className="absolute inset-0 h-full w-full transform -rotate-90">
                      <circle cx="80" cy="80" r="70" className="stroke-white/5 fill-none" strokeWidth="12" />
                      <circle 
                        cx="80" 
                        cy="80" 
                        r="70" 
                        className="stroke-indigo-500 fill-none transition-all duration-1000" 
                        strokeWidth="12" 
                        strokeDasharray={440} 
                        strokeDashoffset={440 - (440 * (portal.profile_completeness || 0)) / 100}
                        strokeLinecap="round"
                      />
                    </svg>
                    <div className="text-center">
                      <span className="text-4xl font-black text-[#E8EAFF] tracking-tighter">{portal.profile_completeness || 0}%</span>
                      <span className="text-[8px] font-black uppercase tracking-widest text-indigo-400 block mt-1">Complete</span>
                    </div>
                  </div>

                  <div className="text-left space-y-3 pt-4 border-t border-white/5">
                    <h5 className="text-[9px] font-black uppercase tracking-wider text-muted">Required Milestones</h5>
                    <div className="grid grid-cols-1 gap-2 text-xs font-bold">
                      <div className="flex items-center gap-2">
                        {portal.photo_url ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <div className="h-3.5 w-3.5 rounded-full border-2 border-white/10" />}
                        <span className={portal.photo_url ? "text-muted line-through" : "text-[#E8EAFF]"}>Profile Photo (20%)</span>
                      </div>
                      <div className="flex items-center gap-2">
                        {portal.bio ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <div className="h-3.5 w-3.5 rounded-full border-2 border-white/10" />}
                        <span className={portal.bio ? "text-muted line-through" : "text-[#E8EAFF]"}>Short Biography (20%)</span>
                      </div>
                      <div className="flex items-center gap-2">
                        {portal.designation ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <div className="h-3.5 w-3.5 rounded-full border-2 border-white/10" />}
                        <span className={portal.designation ? "text-muted line-through" : "text-[#E8EAFF]"}>Designation (15%)</span>
                      </div>
                      <div className="flex items-center gap-2">
                        {portal.affiliation ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <div className="h-3.5 w-3.5 rounded-full border-2 border-white/10" />}
                        <span className={portal.affiliation ? "text-muted line-through" : "text-[#E8EAFF]"}>Organization (15%)</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {activeTab === "announcements" && (
            <motion.div
              key="announcements"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              className="space-y-6 max-w-4xl mx-auto"
            >
              <div className="border-b border-white/5 pb-4">
                <h2 className="text-xs font-black text-muted uppercase tracking-[0.3em] flex items-center gap-3">
                  <Bell className="h-4 w-4 text-indigo-400" /> Event bulletins & campaigns
                </h2>
              </div>

              {!portal.announcements || portal.announcements.length === 0 ? (
                <div className="glass-3d p-20 text-center text-muted font-black uppercase tracking-widest italic rounded-[2.5rem]">
                  No bulletins or announcements posted yet
                </div>
              ) : (
                <div className="grid gap-6">
                  {portal.announcements.map((ann) => {
                    const isExpanded = !!expandedAnnouncements[ann.id];
                    return (
                      <div 
                        key={ann.id}
                        className={cn(
                          "glass-3d p-8 rounded-[2.5rem] relative overflow-hidden transition-all duration-300 border-l-4",
                          ann.type === "critical" ? "border-l-rose-500 bg-rose-500/5" :
                          ann.type === "warning" ? "border-l-amber-500 bg-amber-500/5" :
                          "border-l-indigo-500 bg-indigo-500/5"
                        )}
                      >
                        {ann.is_pinned && (
                          <span className="absolute top-4 right-8 bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-widest">
                            Pinned
                          </span>
                        )}

                        <div className="space-y-4">
                          <div className="flex items-center gap-3">
                            <span className={cn(
                              "text-[8px] font-black uppercase tracking-widest px-2.5 py-0.5 rounded-full",
                              ann.type === "critical" ? "bg-rose-500/10 text-rose-400" :
                              ann.type === "warning" ? "bg-amber-500/10 text-amber-400" :
                              "bg-indigo-500/10 text-indigo-400"
                            )}>
                              {ann.type}
                            </span>
                            <span className="text-[10px] font-bold text-muted">
                              {new Date(ann.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                            </span>
                          </div>

                          <h3 
                            onClick={() => setExpandedAnnouncements({ ...expandedAnnouncements, [ann.id]: !isExpanded })}
                            className="text-xl font-black text-[#E8EAFF] tracking-tight cursor-pointer hover:text-indigo-400 transition-colors"
                          >
                            {ann.title}
                          </h3>

                          {/* Body - collapsible */}
                          {(isExpanded || ann.message.length < 200) ? (
                            <p className="text-sm font-medium text-muted leading-relaxed whitespace-pre-wrap">
                              {ann.message}
                            </p>
                          ) : (
                            <p className="text-sm font-medium text-muted leading-relaxed">
                              {ann.message.slice(0, 200)}...
                              <button 
                                onClick={() => setExpandedAnnouncements({ ...expandedAnnouncements, [ann.id]: true })}
                                className="text-indigo-400 ml-2 font-black uppercase tracking-wider text-[10px] hover:underline"
                              >
                                Read More
                              </button>
                            </p>
                          )}

                          {/* Attachments Chips */}
                          {ann.attachments && ann.attachments.length > 0 && (
                            <div className="flex flex-wrap gap-2 pt-4 border-t border-white/5">
                              {ann.attachments.map((att: any, idx: number) => {
                                const isDrive = att.type === "file" ? false : att.url.includes("drive.google.com") || att.url.includes("onedrive.live.com") || att.url.includes("sharepoint.com") || att.url.includes("dropbox.com");
                                return (
                                  <button
                                    key={idx}
                                    onClick={() => handleAttachmentClick(att)}
                                    className="h-10 px-4 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-bold text-[#E8EAFF] transition-all flex items-center gap-2"
                                  >
                                    {att.type === "file" ? (
                                      <>
                                        <FileText className="h-4 w-4 text-indigo-400" />
                                        <span>{att.name}</span>
                                      </>
                                    ) : (
                                      <>
                                        {getDriveIcon(att.url)}
                                        <span>{att.name || "View Link"}</span>
                                      </>
                                    )}
                                  </button>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* PDF Viewer Iframe Modal */}
      {pdfViewerUrl && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 p-4">
          <div className="glass-3d w-full max-w-5xl h-[85vh] rounded-[2.5rem] border border-white/10 overflow-hidden flex flex-col">
            <div className="px-8 py-5 border-b border-white/5 flex items-center justify-between">
              <span className="text-xs font-black uppercase tracking-widest text-[#E8EAFF]">PDF Document Viewer</span>
              <button 
                onClick={() => setPdfViewerUrl(null)} 
                className="px-4 py-1.5 rounded-full border border-white/10 text-[10px] font-black uppercase tracking-widest hover:border-white/20 text-muted hover:text-white transition-all"
              >
                Close
              </button>
            </div>
            <div className="flex-1 bg-stone-900">
              <iframe src={pdfViewerUrl} className="w-full h-full border-none" />
            </div>
          </div>
        </div>
      )}

      {/* Lightbox Modal */}
      {lightboxImageUrl && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/95 p-4" onClick={() => setLightboxImageUrl(null)}>
          <div className="relative max-w-4xl max-h-[85vh]" onClick={(e) => e.stopPropagation()}>
            <img src={lightboxImageUrl} alt="Lightbox View" className="max-w-full max-h-[85vh] object-contain rounded-[2rem] border border-white/10 shadow-2xl" />
            <button 
              onClick={() => setLightboxImageUrl(null)} 
              className="absolute top-4 right-4 h-10 w-10 rounded-full bg-black/50 border border-white/10 flex items-center justify-center text-white hover:bg-black/80 transition-all"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>
      )}

      {/* Profile Photo Cropper Modal */}
      {showCropper && (
        <ImageCropper 
          onCrop={handleCropImage} 
          onClose={() => setShowCropper(false)} 
        />
      )}

      <footer className="mt-auto py-12 px-10 border-t border-white/5 flex flex-col md:flex-row items-center justify-between gap-6">
        <div className="text-[10px] font-black text-muted uppercase tracking-[0.4em] opacity-40">
          © 2026 EventOS Platform Intelligence
        </div>
      </footer>
    </div>
  );
}
