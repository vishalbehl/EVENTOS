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
import { DeadlineBanner, DeadlineCountdownBadge } from "@/components/DeadlineBanner";
import { cn } from "@/lib/utils";
import { useDeadlineStatus } from "@/hooks/useDeadlineStatus";
import { ImageCropper } from "@/components/ImageCropper";
import { SpeakerPortalLayout } from "@/components/SpeakerPortalLayout";

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
  const [title, setTitle] = useState("");
  const [organisationName, setOrganisationName] = useState("");
  const [state, setState] = useState("");
  const [department, setDepartment] = useState("");
  const [city, setCity] = useState("");
  const [country, setCountry] = useState("");
  const [shortBio, setShortBio] = useState("");
  const [extendedBio, setExtendedBio] = useState("");
  const [researchInterests, setResearchInterests] = useState<string[]>([]);
  const [languagesSpoken, setLanguagesSpoken] = useState<string[]>([]);
  const [websiteUrl, setWebsiteUrl] = useState("");
  const [linkedinUrl, setLinkedinUrl] = useState("");
  const [twitterUrl, setTwitterUrl] = useState("");
  const [photoConsent, setPhotoConsent] = useState(false);
  const [photoUrl, setPhotoUrl] = useState("");

  // Tag inputs
  const [tagInput, setTagInput] = useState("");
  const [langInput, setLangInput] = useState("");

  // Extracted CV/Template Data State for review
  const [extractedData, setExtractedData] = useState<any | null>(null);
  const [hasProfile, setHasProfile] = useState(false);

  // Sync profile details on load
  useEffect(() => {
    if (portal) {
      if (portal.profile_settings?.enabled_methods) {
        const em = portal.profile_settings.enabled_methods;
        if (em.form) setProfileMode("form");
        else if (em.template) setProfileMode("template");
        else if (em.cv) setProfileMode("cv");
      }
      apiClient.get(`/events/${eventId}/speakers/${portal.speaker_id}/profile?token=${token}`)
        .then(res => {
          const p = res.data;
          setDesignation(p.designation || "");
          setTitle(p.title || "");
          setOrganisationName(p.organisation_name || "");
          setDepartment(p.department || "");
          setCity(p.city || "");
          setState(p.state || "");
          setCountry(p.country || "");
          setShortBio(p.bio || "");
          setExtendedBio(p.extended_bio || "");
          setResearchInterests(p.research_interests || []);
          setLanguagesSpoken(p.languages_spoken || []);
          setWebsiteUrl(p.website_url || "");
          setLinkedinUrl(p.linkedin_url || "");
          setTwitterUrl(p.twitter_url || "");
          setPhotoConsent(p.photo_consent || false);
          setPhotoUrl(p.profile_photo_url || "");
          setHasProfile(true);
        })
        .catch(() => {
          // If profile not found, fallback to defaults from portal speaker details
          setHasProfile(false);
          const isPrefix = ["Dr.", "Prof.", "Mr.", "Ms.", "Mx."].includes(portal.designation || "");
          if (isPrefix) {
            setDesignation(portal.designation || "");
            setTitle("");
          } else {
            setDesignation("Other");
            setTitle(portal.designation || "");
          }
          setOrganisationName(portal.affiliation || "");
          setCountry(portal.country || "");
          setState(portal.state || "");
          setShortBio(portal.bio || "");
          setPhotoUrl(portal.photo_url || "");
          setResearchInterests(portal.research_interests || []);
          setLinkedinUrl(portal.social_links?.linkedin || "");
          setTwitterUrl(portal.social_links?.twitter || "");
        });
    }
  }, [portal, eventId, token]);

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

  // Bio Word Counters
  const getShortBioWordCount = () => {
    return shortBio ? shortBio.trim().split(/\s+/).filter(Boolean).length : 0;
  };

  const getExtendedBioWordCount = () => {
    return extendedBio ? extendedBio.trim().split(/\s+/).filter(Boolean).length : 0;
  };

  // Profile completeness calculation
  const getCompleteness = () => {
    let score = 0;
    if (photoUrl && photoUrl.trim()) {
      score += 20;
    }
    if (shortBio && shortBio.trim()) {
      const words = shortBio.trim().split(/\s+/).filter(Boolean);
      if (words.length > 20) score += 25;
    }
    if (designation && designation.trim() && organisationName && organisationName.trim()) {
      score += 15;
    }
    if (
      (websiteUrl && websiteUrl.trim()) ||
      (linkedinUrl && linkedinUrl.trim()) ||
      (twitterUrl && twitterUrl.trim())
    ) {
      score += 10;
    }
    if (extendedBio && extendedBio.trim()) {
      const words = extendedBio.trim().split(/\s+/).filter(Boolean);
      if (words.length > 50) score += 20;
    }
    if (researchInterests && researchInterests.filter(i => i.trim()).length >= 2) {
      score += 10;
    }
    return score;
  };

  // Add tag handlers
  const handleAddTag = (e: React.KeyboardEvent) => {
    if ((e.key === "Enter" || e.key === ",") && tagInput.trim()) {
      e.preventDefault();
      const val = tagInput.replace(/,/g, "").trim();
      if (val && !researchInterests.includes(val) && researchInterests.length < 10) {
        setResearchInterests([...researchInterests, val]);
      }
      setTagInput("");
    }
  };

  const handleRemoveTag = (tag: string) => {
    setResearchInterests(researchInterests.filter((t) => t !== tag));
  };

  const handleAddLang = (e: React.KeyboardEvent) => {
    if ((e.key === "Enter" || e.key === ",") && langInput.trim()) {
      e.preventDefault();
      const val = langInput.replace(/,/g, "").trim();
      if (val && !languagesSpoken.includes(val)) {
        setLanguagesSpoken([...languagesSpoken, val]);
      }
      setLangInput("");
    }
  };

  const handleRemoveLang = (lang: string) => {
    setLanguagesSpoken(languagesSpoken.filter((l) => l !== lang));
  };

  // Structured form submit
  const handleSaveProfile = async () => {
    const shortWordCount = getShortBioWordCount();
    if (shortWordCount > 150) {
      toast.error("Short Biography exceeds 150 words limit.");
      return;
    }
    const extWordCount = getExtendedBioWordCount();
    if (extWordCount > 400) {
      toast.error("Extended Biography exceeds 400 words limit.");
      return;
    }

    const loadingId = toast.loading("Saving profile...");
    try {
      await apiClient.put(`/events/${eventId}/speakers/${portal.speaker_id}/profile?token=${token}`, {
        designation,
        title,
        organisation_name: organisationName,
        department,
        city,
        state,
        country,
        bio: shortBio,
        extended_bio: extendedBio,
        research_interests: researchInterests,
        languages_spoken: languagesSpoken,
        website_url: websiteUrl,
        linkedin_url: linkedinUrl,
        twitter_url: twitterUrl,
        photo_consent: photoConsent,
        profile_photo_url: photoUrl
      });
      toast.success("Profile saved successfully!", { id: loadingId });
      setHasProfile(true);
      queryClient.invalidateQueries({ queryKey: ["portal-auth", eventId, token] });
    } catch (err: any) {
      toast.error(err.response?.data?.detail || "Failed to save profile.", { id: loadingId });
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
      const uploadedUrl = res.data.photo_url;
      setPhotoUrl(uploadedUrl);
      
      // Update profile
      await apiClient.put(`/events/${eventId}/speakers/${portal.speaker_id}/profile?token=${token}`, {
        designation,
        title,
        organisation_name: organisationName,
        department,
        city,
        state,
        country,
        bio: shortBio,
        extended_bio: extendedBio,
        research_interests: researchInterests,
        languages_spoken: languagesSpoken,
        website_url: websiteUrl,
        linkedin_url: linkedinUrl,
        twitter_url: twitterUrl,
        photo_consent: photoConsent,
        profile_photo_url: uploadedUrl
      });
      
      toast.success("Photo uploaded successfully!", { id: loadingId });
      queryClient.invalidateQueries({ queryKey: ["portal-auth", eventId, token] });
    } catch (err) {
      toast.error("Failed to upload cropped photo.", { id: loadingId });
    }
  };

  // Mode 1 Template Download Pre-Filled
  const handleDownloadTemplate = () => {
    window.open(`${apiClient.defaults.baseURL || 'http://127.0.0.1:8000/api/v1'}/events/${eventId}/speakers/${portal.speaker_id}/profile/template?token=${token}`, "_blank");
  };

  // Mode 1 Template Upload
  const handleUploadTemplate = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const file = e.target.files[0];
      const formData = new FormData();
      formData.append("file", file);

      const loadingId = toast.loading("Uploading template...");
      try {
        const res = await apiClient.post(`/events/${eventId}/speakers/${portal.speaker_id}/profile/parse-template?token=${token}`, formData, {
          headers: { "Content-Type": "multipart/form-data" }
        });
        if (res.data) {
          const parsed = res.data;
          if (!parsed.designation && !parsed.organisation_name && !parsed.bio && !parsed.extended_bio) {
            toast.error("We couldn't extract information automatically. Please fill the form manually.", { id: loadingId });
          } else {
            setExtractedData(parsed);
            toast.success("Template parsed! Review and confirm details below.", { id: loadingId });
          }
        }
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
        const res = await apiClient.post(`/events/${eventId}/speakers/${portal.speaker_id}/profile/parse-cv?token=${token}`, formData, {
          headers: { "Content-Type": "multipart/form-data" }
        });
        if (res.data) {
          const parsed = res.data;
          if (!parsed.designation && !parsed.organisation_name && !parsed.bio) {
            toast.error("We couldn't extract information automatically. Please fill the form manually.", { id: loadingId });
          } else {
            setExtractedData(parsed);
            toast.success("CV parsed! Review and confirm details below.", { id: loadingId });
          }
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
    <SpeakerPortalLayout
      branding={portal.branding_settings || {}}
      termsAndConditions={portal.terms_and_conditions}
      faqs={portal.faqs}
      eventName={portal.event_name}
      startDate={portal.start_date}
      endDate={portal.end_date}
      location={portal.location}
      venueName={portal.venue_name}
      organizerName={portal.organizer_name}
      email={portal.email}
      speakerName={speakerName}
      token={token}
      eventId={eventId}
    >
    <div className="min-h-screen flex flex-col w-full">
      {/* Sticky deadline banner */}
      <DeadlineBanner deadlineInfo={deadlineInfo} className="sticky top-0 z-[60]" />


      {/* 12-Column Responsive Layout Grid */}
      <main className="flex-1 max-w-7xl mx-auto w-full px-6 md:px-10 py-10">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-stretch">
          {/* Left Column (8 cols) */}
          <div className="lg:col-span-8 flex flex-col h-full">
            {/* Premium Glassmorphic Tab Navigation */}
            <div className="flex gap-2 p-1.5 bg-stone-900/60 backdrop-blur-md rounded-2xl mb-6 max-w-md shrink-0">
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
            </div>

            {/* Tab Content */}
            <div className="flex-1 flex flex-col">
              <AnimatePresence mode="wait">
                {activeTab === "dashboard" && (
                  <motion.div
                    key="dashboard"
                    initial={{ opacity: 0, y: 15 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -15 }}
                    className="space-y-12 flex-1 flex flex-col justify-stretch"
                  >
                    {/* original landing layout */}
                    <div className="space-y-12">
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


            </motion.div>
          )}

          {activeTab === "profile" && (
            <motion.div
              key="profile"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              className="grid grid-cols-1 md:grid-cols-3 gap-10 items-start"
            >
              {/* Form & Mode Selectors */}
              <div className="md:col-span-2 space-y-8">
                {/* Mode Select Buttons */}
                <div className="flex gap-4 border-b border-white/5 pb-4">
                  {(!portal.profile_settings || portal.profile_settings.enabled_methods?.form) && (
                    <button
                      onClick={() => setProfileMode("form")}
                      className={cn(
                        "pb-3 text-xs font-black uppercase tracking-widest border-b-2 transition-all",
                        profileMode === "form" ? "border-indigo-500 text-indigo-400" : "border-transparent text-muted hover:text-white"
                      )}
                    >
                      Structured Form
                    </button>
                  )}
                  {(!portal.profile_settings || portal.profile_settings.enabled_methods?.template) && (
                    <button
                      onClick={() => setProfileMode("template")}
                      className={cn(
                        "pb-3 text-xs font-black uppercase tracking-widest border-b-2 transition-all",
                        profileMode === "template" ? "border-indigo-500 text-indigo-400" : "border-transparent text-muted hover:text-white"
                      )}
                    >
                      Template Intake
                    </button>
                  )}
                  {(!portal.profile_settings || portal.profile_settings.enabled_methods?.cv) && (
                    <button
                      onClick={() => setProfileMode("cv")}
                      className={cn(
                        "pb-3 text-xs font-black uppercase tracking-widest border-b-2 transition-all",
                        profileMode === "cv" ? "border-indigo-500 text-indigo-400" : "border-transparent text-muted hover:text-white"
                      )}
                    >
                      Upload CV (PDF)
                    </button>
                  )}
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
                        <select
                          value={designation}
                          onChange={(e) => setDesignation(e.target.value)}
                          className="w-full h-12 rounded-2xl bg-white/5 border border-white/10 px-4 text-sm font-bold focus:border-indigo-500/50 outline-none text-[#E8EAFF] appearance-none"
                        >
                          <option value="" className="bg-stone-900">Select Designation</option>
                          <option value="Dr." className="bg-stone-900">Dr.</option>
                          <option value="Prof." className="bg-stone-900">Prof.</option>
                          <option value="Mr." className="bg-stone-900">Mr.</option>
                          <option value="Ms." className="bg-stone-900">Ms.</option>
                          <option value="Mx." className="bg-stone-900">Mx.</option>
                          <option value="Other" className="bg-stone-900">Other</option>
                        </select>
                      </div>

                      <div className="space-y-2">
                        <label className="text-[10px] font-black uppercase tracking-wider text-muted">Job Title / Position</label>
                        <input
                          type="text"
                          value={title}
                          onChange={(e) => setTitle(e.target.value)}
                          placeholder="e.g. Chief Scientist"
                          className="w-full h-12 rounded-2xl bg-white/5 border border-white/10 px-4 text-sm font-bold focus:border-indigo-500/50 outline-none text-[#E8EAFF]"
                        />
                      </div>

                      <div className="space-y-2">
                        <label className="text-[10px] font-black uppercase tracking-wider text-muted">First Name (Read-only)</label>
                        <input
                          type="text"
                          value={portal.first_name || ""}
                          readOnly
                          className="w-full h-12 rounded-2xl bg-white/5 border border-white/10 px-4 text-sm font-bold text-muted outline-none cursor-not-allowed opacity-60"
                        />
                      </div>

                      <div className="space-y-2">
                        <label className="text-[10px] font-black uppercase tracking-wider text-muted">Last Name (Read-only)</label>
                        <input
                          type="text"
                          value={portal.last_name || ""}
                          readOnly
                          className="w-full h-12 rounded-2xl bg-white/5 border border-white/10 px-4 text-sm font-bold text-muted outline-none cursor-not-allowed opacity-60"
                        />
                      </div>

                      <div className="space-y-2">
                        <label className="text-[10px] font-black uppercase tracking-wider text-muted">Organisation / Institution</label>
                        <input
                          type="text"
                          value={organisationName}
                          onChange={(e) => setOrganisationName(e.target.value)}
                          placeholder="e.g. Stanford University"
                          className="w-full h-12 rounded-2xl bg-white/5 border border-white/10 px-4 text-sm font-bold focus:border-indigo-500/50 outline-none text-[#E8EAFF]"
                        />
                      </div>

                      <div className="space-y-2">
                        <label className="text-[10px] font-black uppercase tracking-wider text-muted">Department</label>
                        <input
                          type="text"
                          value={department}
                          onChange={(e) => setDepartment(e.target.value)}
                          placeholder="e.g. Department of Computer Science"
                          className="w-full h-12 rounded-2xl bg-white/5 border border-white/10 px-4 text-sm font-bold focus:border-indigo-500/50 outline-none text-[#E8EAFF]"
                        />
                      </div>

                      <div className="space-y-2">
                        <label className="text-[10px] font-black uppercase tracking-wider text-muted">City</label>
                        <input
                          type="text"
                          value={city}
                          onChange={(e) => setCity(e.target.value)}
                          placeholder="e.g. Stanford"
                          className="w-full h-12 rounded-2xl bg-white/5 border border-white/10 px-4 text-sm font-bold focus:border-indigo-500/50 outline-none text-[#E8EAFF]"
                        />
                      </div>

                      <div className="space-y-2">
                        <label className="text-[10px] font-black uppercase tracking-wider text-muted">State / Province</label>
                        <input
                          type="text"
                          value={state}
                          onChange={(e) => setState(e.target.value)}
                          placeholder="e.g. California"
                          className="w-full h-12 rounded-2xl bg-white/5 border border-white/10 px-4 text-sm font-bold focus:border-indigo-500/50 outline-none text-[#E8EAFF]"
                        />
                      </div>

                      <div className="space-y-2">
                        <label className="text-[10px] font-black uppercase tracking-wider text-muted">Country</label>
                        <select
                          value={country}
                          onChange={(e) => setCountry(e.target.value)}
                          className="w-full h-12 rounded-2xl bg-white/5 border border-white/10 px-4 text-sm font-bold focus:border-indigo-500/50 outline-none text-[#E8EAFF] appearance-none"
                        >
                          <option value="" className="bg-stone-900">Select Country</option>
                          {countries.map(c => (
                            <option key={c} value={c} className="bg-stone-900">{c}</option>
                          ))}
                        </select>
                      </div>
                    </div>

                    {/* Biography blocks */}
                    <div className="space-y-6">
                      <div className="space-y-2">
                        <div className="flex justify-between">
                          <label className="text-[10px] font-black uppercase tracking-wider text-muted">Short Biography (max 150 words)</label>
                          <span className={cn(
                            "text-[10px] font-black uppercase",
                            getShortBioWordCount() > 150 ? "text-red-400" : "text-muted"
                          )}>
                            {getShortBioWordCount()} / 150 words
                          </span>
                        </div>
                        <textarea
                          rows={4}
                          value={shortBio}
                          onChange={(e) => setShortBio(e.target.value)}
                          placeholder="Provide a brief biography (will be used in schedule details)..."
                          className="w-full rounded-2xl bg-white/5 border border-white/10 p-4 text-sm font-bold focus:border-indigo-500/50 outline-none text-[#E8EAFF] resize-none"
                        />
                      </div>

                      <div className="space-y-2">
                        <div className="flex justify-between">
                          <label className="text-[10px] font-black uppercase tracking-wider text-muted">Extended Biography (max 400 words)</label>
                          <span className={cn(
                            "text-[10px] font-black uppercase",
                            getExtendedBioWordCount() > 400 ? "text-red-400" : "text-muted"
                          )}>
                            {getExtendedBioWordCount()} / 400 words
                          </span>
                        </div>
                        <textarea
                          rows={6}
                          value={extendedBio}
                          onChange={(e) => setExtendedBio(e.target.value)}
                          placeholder="Provide a full detailed biography for your public profile..."
                          className="w-full rounded-2xl bg-white/5 border border-white/10 p-4 text-sm font-bold focus:border-indigo-500/50 outline-none text-[#E8EAFF] resize-none"
                        />
                      </div>
                    </div>

                    {/* Tags section */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4 border-t border-white/5">
                      {/* Research Interests */}
                      <div className="space-y-3">
                        <label className="text-[10px] font-black uppercase tracking-wider text-muted">Research Interests (Press Enter, max 10)</label>
                        <div className="flex flex-wrap gap-2 p-3 rounded-2xl bg-white/5 border border-white/10 min-h-[50px] items-center">
                          {researchInterests.map((interest) => (
                            <span key={interest} className="inline-flex items-center gap-1 bg-indigo-500/20 text-indigo-400 border border-indigo-500/25 px-2.5 py-1 rounded-lg text-xs font-bold">
                              {interest}
                              <button onClick={() => handleRemoveTag(interest)} className="hover:text-white transition-colors">
                                <X className="h-3 w-3" />
                              </button>
                            </span>
                          ))}
                          {researchInterests.length < 10 && (
                            <input
                              type="text"
                              value={tagInput}
                              onChange={(e) => setTagInput(e.target.value)}
                              onKeyDown={handleAddTag}
                              placeholder={researchInterests.length === 0 ? "e.g. AI, Bioinformatics" : "Add..."}
                              className="bg-transparent outline-none flex-1 text-xs font-bold text-[#E8EAFF] min-w-[80px]"
                            />
                          )}
                        </div>
                      </div>

                      {/* Languages Spoken */}
                      <div className="space-y-3">
                        <label className="text-[10px] font-black uppercase tracking-wider text-muted">Languages Spoken (Press Enter)</label>
                        <div className="flex flex-wrap gap-2 p-3 rounded-2xl bg-white/5 border border-white/10 min-h-[50px] items-center">
                          {languagesSpoken.map((lang) => (
                            <span key={lang} className="inline-flex items-center gap-1 bg-indigo-500/20 text-indigo-400 border border-indigo-500/25 px-2.5 py-1 rounded-lg text-xs font-bold">
                              {lang}
                              <button onClick={() => handleRemoveLang(lang)} className="hover:text-white transition-colors">
                                <X className="h-3 w-3" />
                              </button>
                            </span>
                          ))}
                          <input
                            type="text"
                            value={langInput}
                            onChange={(e) => setLangInput(e.target.value)}
                            onKeyDown={handleAddLang}
                            placeholder={languagesSpoken.length === 0 ? "e.g. English, Spanish" : "Add..."}
                            className="bg-transparent outline-none flex-1 text-xs font-bold text-[#E8EAFF] min-w-[80px]"
                          />
                        </div>
                      </div>
                    </div>

                    {/* Website and Social links */}
                    <div className="space-y-4 pt-4 border-t border-white/5">
                      <h4 className="text-[11px] font-black uppercase tracking-wider text-indigo-400">Website & Social Connections</h4>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div className="space-y-1">
                          <label className="text-[9px] font-black uppercase tracking-wider text-muted">Personal Website</label>
                          <input
                            type="text"
                            value={websiteUrl}
                            onChange={(e) => setWebsiteUrl(e.target.value)}
                            placeholder="https://..."
                            className="w-full h-12 rounded-2xl bg-white/5 border border-white/10 px-4 text-sm font-bold focus:border-indigo-500/50 outline-none text-[#E8EAFF]"
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="text-[9px] font-black uppercase tracking-wider text-muted">LinkedIn Profile</label>
                          <div className="relative">
                            <Linkedin className="absolute left-4 top-3.5 h-5 w-5 text-muted" />
                            <input
                              type="text"
                              value={linkedinUrl}
                              onChange={(e) => setLinkedinUrl(e.target.value)}
                              placeholder="LinkedIn URL"
                              className="w-full h-12 rounded-2xl bg-white/5 border border-white/10 pl-12 pr-4 text-sm font-bold focus:border-indigo-500/50 outline-none text-[#E8EAFF]"
                            />
                          </div>
                        </div>
                        <div className="space-y-1">
                          <label className="text-[9px] font-black uppercase tracking-wider text-muted">Twitter / X Profile</label>
                          <div className="relative">
                            <Twitter className="absolute left-4 top-3.5 h-5 w-5 text-muted" />
                            <input
                              type="text"
                              value={twitterUrl}
                              onChange={(e) => setTwitterUrl(e.target.value)}
                              placeholder="Twitter/X URL"
                              className="w-full h-12 rounded-2xl bg-white/5 border border-white/10 pl-12 pr-4 text-sm font-bold focus:border-indigo-500/50 outline-none text-[#E8EAFF]"
                            />
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Consent checkbox */}
                    <div className="pt-4 border-t border-white/5 flex items-start gap-3">
                      <input
                        type="checkbox"
                        id="photoConsent"
                        checked={photoConsent}
                        onChange={(e) => setPhotoConsent(e.target.checked)}
                        className="mt-1 h-4 w-4 rounded border-white/10 bg-white/5 text-indigo-500 focus:ring-indigo-500/50"
                      />
                      <label htmlFor="photoConsent" className="text-xs text-muted font-bold cursor-pointer select-none leading-relaxed">
                        I hereby consent to CPMS utilizing my profile photo, name, designation, and biography for promotional event booklets, printed materials, and digital signage.
                      </label>
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
                  <div className="space-y-6">
                    <div className="glass-3d p-8 rounded-[2.5rem] space-y-8">
                      <h3 className="text-xl font-black uppercase tracking-wider text-[#E8EAFF]">Intake Mode 1: Document Templates</h3>
                      <p className="text-xs text-muted leading-relaxed">
                        Download a pre-filled template in Word format containing your session, talk details and slots. Edit it inside Microsoft Office, fill in your details, paste your profile photo inside the designated areas, and re-upload the file below. Our system parses it automatically.
                      </p>

                      {/* Downloads */}
                      <div className="grid grid-cols-1 gap-4">
                        <button 
                          onClick={handleDownloadTemplate}
                          className="h-16 rounded-2xl bg-white/5 hover:bg-white/10 border border-white/10 flex items-center justify-between px-6 group transition-all text-left"
                        >
                          <div>
                            <span className="text-xs font-black uppercase tracking-wider text-[#E8EAFF] block">Word Template</span>
                            <span className="text-[10px] font-bold text-muted uppercase">Pre-filled DOCX</span>
                          </div>
                          <Download className="h-5 w-5 text-indigo-400 group-hover:scale-110 transition-transform" />
                        </button>
                      </div>

                      {/* Upload Template Area */}
                      <label className="w-full h-44 rounded-[2rem] border-2 border-dashed border-white/10 hover:border-indigo-500/50 hover:bg-indigo-500/5 flex flex-col items-center justify-center gap-4 cursor-pointer transition-all duration-300">
                        <FileUp className="h-10 w-10 text-muted" />
                        <div className="text-center">
                          <span className="text-xs font-black uppercase tracking-widest text-indigo-400 block mb-1">Re-upload Completed Template</span>
                          <span className="text-[9px] font-bold text-muted uppercase">DOCX format only</span>
                        </div>
                        <input type="file" accept=".docx" onChange={handleUploadTemplate} className="hidden" />
                      </label>
                    </div>

                    {extractedData && (
                      <div className="glass-3d p-6 rounded-[2rem] border-indigo-500/20 bg-indigo-950/10 space-y-4">
                        <div className="flex items-center justify-between">
                          <h4 className="text-sm font-black uppercase tracking-wider text-[#E8EAFF] flex items-center gap-2">
                            <Sparkles className="h-4 w-4 text-indigo-400 animate-pulse" /> Review Extracted Info
                          </h4>
                          <span className="text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded bg-indigo-500/20 text-indigo-400">
                            AI Extracted
                          </span>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                          {extractedData.designation && (
                            <div>
                              <span className="text-muted font-bold block uppercase text-[9px]">Designation</span>
                              <span className="text-[#E8EAFF] font-bold">{extractedData.designation}</span>
                            </div>
                          )}
                          {extractedData.organisation_name && (
                            <div>
                              <span className="text-muted font-bold block uppercase text-[9px]">Organisation</span>
                              <span className="text-[#E8EAFF] font-bold">{extractedData.organisation_name}</span>
                            </div>
                          )}
                          {extractedData.department && (
                            <div>
                              <span className="text-muted font-bold block uppercase text-[9px]">Department</span>
                              <span className="text-[#E8EAFF] font-bold">{extractedData.department}</span>
                            </div>
                          )}
                          {extractedData.website_url && (
                            <div>
                              <span className="text-muted font-bold block uppercase text-[9px]">Website</span>
                              <span className="text-[#E8EAFF] font-bold">{extractedData.website_url}</span>
                            </div>
                          )}
                          {extractedData.linkedin_url && (
                            <div>
                              <span className="text-muted font-bold block uppercase text-[9px]">LinkedIn</span>
                              <span className="text-[#E8EAFF] font-bold">{extractedData.linkedin_url}</span>
                            </div>
                          )}
                          {extractedData.research_interests && extractedData.research_interests.length > 0 && (
                            <div className="col-span-2">
                              <span className="text-muted font-bold block uppercase text-[9px]">Research Interests</span>
                              <div className="flex flex-wrap gap-1 mt-1">
                                {extractedData.research_interests.map((ri: string) => (
                                  <span key={ri} className="px-2 py-0.5 rounded bg-indigo-500/10 text-indigo-400 text-[10px] font-bold">{ri}</span>
                                ))}
                              </div>
                            </div>
                          )}
                          {extractedData.bio && (
                            <div className="col-span-2">
                              <span className="text-muted font-bold block uppercase text-[9px]">Short Bio</span>
                              <p className="text-muted font-medium italic mt-1 leading-relaxed">{extractedData.bio}</p>
                            </div>
                          )}
                          {extractedData.extended_bio && (
                            <div className="col-span-2">
                              <span className="text-muted font-bold block uppercase text-[9px]">Extended Bio</span>
                              <p className="text-muted font-medium italic mt-1 leading-relaxed">{extractedData.extended_bio}</p>
                            </div>
                          )}
                        </div>
                        <div className="flex gap-4 pt-4 border-t border-white/5">
                          <button
                            onClick={() => {
                              if (extractedData.designation) setDesignation(extractedData.designation);
                              if (extractedData.organisation_name) setOrganisationName(extractedData.organisation_name);
                              if (extractedData.department) setDepartment(extractedData.department);
                              if (extractedData.website_url) setWebsiteUrl(extractedData.website_url);
                              if (extractedData.linkedin_url) setLinkedinUrl(extractedData.linkedin_url);
                              if (extractedData.research_interests) setResearchInterests(extractedData.research_interests);
                              if (extractedData.bio) setShortBio(extractedData.bio);
                              if (extractedData.extended_bio) setExtendedBio(extractedData.extended_bio);
                              setExtractedData(null);
                              setProfileMode("form");
                              toast.success("Details copied to form. You can now edit them!");
                            }}
                            className="flex-1 h-10 rounded-full border border-white/10 text-xs font-black uppercase tracking-widest text-[#E8EAFF] hover:bg-white/5 transition-all"
                          >
                            Edit in Form
                          </button>
                          <button
                            onClick={async () => {
                              const loadingId = toast.loading("Saving profile...");
                              try {
                                await apiClient.put(`/events/${eventId}/speakers/${portal.speaker_id}/profile?token=${token}`, {
                                  designation: extractedData.designation || designation,
                                  title: extractedData.title || title,
                                  organisation_name: extractedData.organisation_name || organisationName,
                                  department: extractedData.department || department,
                                  city: extractedData.city || city,
                                  state: state,
                                  country: extractedData.country || country,
                                  bio: extractedData.bio || shortBio,
                                  extended_bio: extractedData.extended_bio || extendedBio,
                                  research_interests: extractedData.research_interests || researchInterests,
                                  languages_spoken: languagesSpoken,
                                  website_url: extractedData.website_url || websiteUrl,
                                  linkedin_url: extractedData.linkedin_url || linkedinUrl,
                                  twitter_url: extractedData.twitter_url || twitterUrl,
                                  photo_consent: photoConsent,
                                  profile_photo_url: photoUrl
                                });
                                toast.success("Profile saved successfully!", { id: loadingId });
                                if (extractedData.designation) setDesignation(extractedData.designation);
                                if (extractedData.organisation_name) setOrganisationName(extractedData.organisation_name);
                                if (extractedData.department) setDepartment(extractedData.department);
                                if (extractedData.website_url) setWebsiteUrl(extractedData.website_url);
                                if (extractedData.linkedin_url) setLinkedinUrl(extractedData.linkedin_url);
                                if (extractedData.research_interests) setResearchInterests(extractedData.research_interests);
                                if (extractedData.bio) setShortBio(extractedData.bio);
                                if (extractedData.extended_bio) setExtendedBio(extractedData.extended_bio);
                                setExtractedData(null);
                                setHasProfile(true);
                                queryClient.invalidateQueries({ queryKey: ["portal-auth", eventId, token] });
                              } catch (err: any) {
                                toast.error(err.response?.data?.detail || "Failed to save profile.", { id: loadingId });
                              }
                            }}
                            className="flex-1 h-10 rounded-full bg-indigo-500 hover:bg-indigo-600 text-xs font-black uppercase tracking-widest text-white shadow-lg transition-all"
                          >
                            Confirm & Save
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {profileMode === "cv" && (
                  <div className="space-y-6">
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

                    {extractedData && (
                      <div className="glass-3d p-6 rounded-[2rem] border-indigo-500/20 bg-indigo-950/10 space-y-4">
                        <div className="flex items-center justify-between">
                          <h4 className="text-sm font-black uppercase tracking-wider text-[#E8EAFF] flex items-center gap-2">
                            <Sparkles className="h-4 w-4 text-indigo-400 animate-pulse" /> Review Extracted Info
                          </h4>
                          <span className="text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded bg-indigo-500/20 text-indigo-400">
                            AI Extracted
                          </span>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                          {extractedData.designation && (
                            <div>
                              <span className="text-muted font-bold block uppercase text-[9px]">Designation</span>
                              <span className="text-[#E8EAFF] font-bold">{extractedData.designation}</span>
                            </div>
                          )}
                          {extractedData.organisation_name && (
                            <div>
                              <span className="text-muted font-bold block uppercase text-[9px]">Organisation</span>
                              <span className="text-[#E8EAFF] font-bold">{extractedData.organisation_name}</span>
                            </div>
                          )}
                          {extractedData.department && (
                            <div>
                              <span className="text-muted font-bold block uppercase text-[9px]">Department</span>
                              <span className="text-[#E8EAFF] font-bold">{extractedData.department}</span>
                            </div>
                          )}
                          {extractedData.website_url && (
                            <div>
                              <span className="text-muted font-bold block uppercase text-[9px]">Website</span>
                              <span className="text-[#E8EAFF] font-bold">{extractedData.website_url}</span>
                            </div>
                          )}
                          {extractedData.linkedin_url && (
                            <div>
                              <span className="text-muted font-bold block uppercase text-[9px]">LinkedIn</span>
                              <span className="text-[#E8EAFF] font-bold">{extractedData.linkedin_url}</span>
                            </div>
                          )}
                          {extractedData.research_interests && extractedData.research_interests.length > 0 && (
                            <div className="col-span-2">
                              <span className="text-muted font-bold block uppercase text-[9px]">Research Interests</span>
                              <div className="flex flex-wrap gap-1 mt-1">
                                {extractedData.research_interests.map((ri: string) => (
                                  <span key={ri} className="px-2 py-0.5 rounded bg-indigo-500/10 text-indigo-400 text-[10px] font-bold">{ri}</span>
                                ))}
                              </div>
                            </div>
                          )}
                          {extractedData.bio && (
                            <div className="col-span-2">
                              <span className="text-muted font-bold block uppercase text-[9px]">Short Bio</span>
                              <p className="text-muted font-medium italic mt-1 leading-relaxed">{extractedData.bio}</p>
                            </div>
                          )}
                          {extractedData.extended_bio && (
                            <div className="col-span-2">
                              <span className="text-muted font-bold block uppercase text-[9px]">Extended Bio</span>
                              <p className="text-muted font-medium italic mt-1 leading-relaxed">{extractedData.extended_bio}</p>
                            </div>
                          )}
                        </div>
                        <div className="flex gap-4 pt-4 border-t border-white/5">
                          <button
                            onClick={() => {
                              if (extractedData.designation) setDesignation(extractedData.designation);
                              if (extractedData.organisation_name) setOrganisationName(extractedData.organisation_name);
                              if (extractedData.department) setDepartment(extractedData.department);
                              if (extractedData.website_url) setWebsiteUrl(extractedData.website_url);
                              if (extractedData.linkedin_url) setLinkedinUrl(extractedData.linkedin_url);
                              if (extractedData.research_interests) setResearchInterests(extractedData.research_interests);
                              if (extractedData.bio) setShortBio(extractedData.bio);
                              if (extractedData.extended_bio) setExtendedBio(extractedData.extended_bio);
                              setExtractedData(null);
                              setProfileMode("form");
                              toast.success("Details copied to form. You can now edit them!");
                            }}
                            className="flex-1 h-10 rounded-full border border-white/10 text-xs font-black uppercase tracking-widest text-[#E8EAFF] hover:bg-white/5 transition-all"
                          >
                            Edit in Form
                          </button>
                          <button
                            onClick={async () => {
                              const loadingId = toast.loading("Saving profile...");
                              try {
                                await apiClient.put(`/events/${eventId}/speakers/${portal.speaker_id}/profile?token=${token}`, {
                                  designation: extractedData.designation || designation,
                                  title: extractedData.title || title,
                                  organisation_name: extractedData.organisation_name || organisationName,
                                  department: extractedData.department || department,
                                  city: extractedData.city || city,
                                  state: state,
                                  country: extractedData.country || country,
                                  bio: extractedData.bio || shortBio,
                                  extended_bio: extractedData.extended_bio || extendedBio,
                                  research_interests: extractedData.research_interests || researchInterests,
                                  languages_spoken: languagesSpoken,
                                  website_url: extractedData.website_url || websiteUrl,
                                  linkedin_url: extractedData.linkedin_url || linkedinUrl,
                                  twitter_url: extractedData.twitter_url || twitterUrl,
                                  photo_consent: photoConsent,
                                  profile_photo_url: photoUrl
                                });
                                toast.success("Profile saved successfully!", { id: loadingId });
                                if (extractedData.designation) setDesignation(extractedData.designation);
                                if (extractedData.organisation_name) setOrganisationName(extractedData.organisation_name);
                                if (extractedData.department) setDepartment(extractedData.department);
                                if (extractedData.website_url) setWebsiteUrl(extractedData.website_url);
                                if (extractedData.linkedin_url) setLinkedinUrl(extractedData.linkedin_url);
                                if (extractedData.research_interests) setResearchInterests(extractedData.research_interests);
                                if (extractedData.bio) setShortBio(extractedData.bio);
                                if (extractedData.extended_bio) setExtendedBio(extractedData.extended_bio);
                                setExtractedData(null);
                                setHasProfile(true);
                                queryClient.invalidateQueries({ queryKey: ["portal-auth", eventId, token] });
                              } catch (err: any) {
                                toast.error(err.response?.data?.detail || "Failed to save profile.", { id: loadingId });
                              }
                            }}
                            className="flex-1 h-10 rounded-full bg-indigo-500 hover:bg-indigo-600 text-xs font-black uppercase tracking-widest text-white shadow-lg transition-all"
                          >
                            Confirm & Save
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Right Side: Completeness Score Ring */}
              <div className="space-y-6 md:sticky md:top-24">
                <div className="glass-3d p-8 rounded-[2.5rem] bg-indigo-950/10 border-indigo-500/10 text-center space-y-6">
                  <div>
                    <h4 className="text-xs font-black uppercase tracking-[0.2em] text-[#E8EAFF] mb-1">Profile Completeness</h4>
                    <p className="text-[9px] font-bold text-muted uppercase">Completing your profile improves badge visibility</p>
                  </div>

                  {/* Circular Score Ring */}
                  {(() => {
                    const score = getCompleteness();
                    let ringColor = "stroke-red-500";
                    let textColor = "text-red-400";
                    if (score >= 80) {
                      ringColor = "stroke-emerald-500";
                      textColor = "text-emerald-400";
                    } else if (score >= 50) {
                      ringColor = "stroke-amber-500";
                      textColor = "text-amber-400";
                    }
                    return (
                      <div className="relative h-40 w-40 mx-auto flex items-center justify-center">
                        <svg className="absolute inset-0 h-full w-full transform -rotate-90">
                          <circle cx="80" cy="80" r="70" className="stroke-white/5 fill-none" strokeWidth="12" />
                          <circle 
                            cx="80" 
                            cy="80" 
                            r="70" 
                            className={cn("fill-none transition-all duration-1000", ringColor)} 
                            strokeWidth="12" 
                            strokeDasharray={440} 
                            strokeDashoffset={440 - (440 * score) / 100}
                            strokeLinecap="round"
                          />
                        </svg>
                        <div className="text-center">
                          <span className={cn("text-4xl font-black tracking-tighter", textColor)}>{score}%</span>
                          <span className="text-[8px] font-black uppercase tracking-widest text-muted block mt-1">Complete</span>
                        </div>
                      </div>
                    );
                  })()}

                  <div className="text-left space-y-3 pt-4 border-t border-white/5">
                    <h5 className="text-[9px] font-black uppercase tracking-wider text-muted">Required Milestones</h5>
                    <div className="grid grid-cols-1 gap-2 text-xs font-bold">
                      <div className="flex items-center gap-2">
                        {photoUrl ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <div className="h-3.5 w-3.5 rounded-full border-2 border-white/10" />}
                        <span className={photoUrl ? "text-muted line-through" : "text-[#E8EAFF]"}>Profile Photo (20%)</span>
                      </div>
                      <div className="flex items-center gap-2">
                        {shortBio ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <div className="h-3.5 w-3.5 rounded-full border-2 border-white/10" />}
                        <span className={shortBio ? "text-muted line-through" : "text-[#E8EAFF]"}>Short Biography (25%)</span>
                      </div>
                      <div className="flex items-center gap-2">
                        {(designation && organisationName) ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <div className="h-3.5 w-3.5 rounded-full border-2 border-white/10" />}
                        <span className={(designation && organisationName) ? "text-muted line-through" : "text-[#E8EAFF]"}>Designation & Organization (15%)</span>
                      </div>
                      <div className="flex items-center gap-2">
                        {(websiteUrl || linkedinUrl || twitterUrl) ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <div className="h-3.5 w-3.5 rounded-full border-2 border-white/10" />}
                        <span className={(websiteUrl || linkedinUrl || twitterUrl) ? "text-muted line-through" : "text-[#E8EAFF]"}>Social Connections (10%)</span>
                      </div>
                      <div className="flex items-center gap-2">
                        {extendedBio ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <div className="h-3.5 w-3.5 rounded-full border-2 border-white/10" />}
                        <span className={extendedBio ? "text-muted line-through" : "text-[#E8EAFF]"}>Extended Biography (20%)</span>
                      </div>
                      <div className="flex items-center gap-2">
                        {(researchInterests && researchInterests.length >= 2) ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <div className="h-3.5 w-3.5 rounded-full border-2 border-white/10" />}
                        <span className={(researchInterests && researchInterests.length >= 2) ? "text-muted line-through" : "text-[#E8EAFF]"}>Research Interests (10%)</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
            </div> {/* End of Tab Content */}
          </div> {/* End of Left Column */}

          {/* Right Column: Standalone Announcements (4 cols) */}
          <div className="lg:col-span-4 flex flex-col gap-6">
            <div className="glass-3d rounded-[2rem] overflow-hidden border border-white/5 flex flex-col bg-stone-900/60">
              <div className="flex items-center justify-between px-6 py-5 border-b border-white/5 bg-white/[0.01] shrink-0">
                <div className="flex items-center gap-3">
                  <span className="text-indigo-400"><Bell className="h-4.5 w-4.5" /></span>
                  <h2 className="text-[10px] font-black text-muted uppercase tracking-[0.2em]">Announcements</h2>
                </div>
                {portal.announcements && portal.announcements.length > 0 && (
                  <span className="h-5 min-w-5 px-1.5 flex items-center justify-center bg-indigo-500 text-white text-[9px] font-black rounded-full shadow-[0_0_8px_rgba(99,102,241,0.5)] shrink-0 animate-pulse">
                    {portal.announcements.length}
                  </span>
                )}
              </div>

              <div className="p-6 overflow-y-auto flex-1 max-h-[600px] space-y-4">
                {!portal.announcements || portal.announcements.length === 0 ? (
                  <p className="text-xs text-muted text-center py-8 font-bold">No notifications or announcements at this time.</p>
                ) : (
                  <div className="space-y-4 text-left">
                    {portal.announcements.map((ann: any, idx: number) => {
                      const isExpanded = !!expandedAnnouncements[ann.id];
                      return (
                        <div
                          key={ann.id || idx}
                          className={cn(
                            "border rounded-[1.5rem] overflow-hidden transition-all duration-300",
                            ann.type === "critical" ? "border-rose-500/20 bg-rose-500/[0.02]" :
                            ann.type === "warning" ? "border-amber-500/20 bg-amber-500/[0.02]" :
                            "border-indigo-500/20 bg-indigo-500/[0.02]"
                          )}
                        >
                          {/* Header: Clickable to toggle collapse */}
                          <div
                            onClick={() => setExpandedAnnouncements({ ...expandedAnnouncements, [ann.id]: !isExpanded })}
                            className="px-4 py-3 flex items-center justify-between cursor-pointer hover:bg-white/[0.02] transition-colors"
                          >
                            <div className="flex-1 min-w-0 pr-2">
                              <div className="flex flex-wrap items-center gap-1.5 mb-1">
                                {ann.is_pinned && (
                                  <span className="inline-flex items-center gap-0.5 text-[8px] font-black uppercase text-indigo-400 tracking-wide">
                                    📌 Pinned
                                  </span>
                                )}
                                <span className={cn(
                                  "inline-flex px-1.5 py-0.5 rounded-full border text-[7px] font-black uppercase tracking-wider",
                                  ann.type === "critical" ? "bg-rose-500/10 text-rose-400 border-rose-500/20" :
                                  ann.type === "warning" ? "bg-amber-500/10 text-amber-400 border-amber-500/20" :
                                  "bg-indigo-500/10 text-indigo-400 border-indigo-500/20"
                                )}>
                                  {ann.type}
                                </span>
                                {ann.created_at && (
                                  <span className="text-[7px] font-bold text-muted uppercase tracking-wider">
                                    {new Date(ann.created_at).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
                                  </span>
                                )}
                              </div>
                              <h4 className="text-xs font-black text-[#E8EAFF] tracking-tight truncate">
                                {ann.title}
                              </h4>
                            </div>
                            <div className="flex items-center gap-1 shrink-0">
                              <ChevronRight
                                className={cn(
                                  "h-3.5 w-3.5 text-muted transition-transform duration-300",
                                  isExpanded && "rotate-90 text-indigo-400"
                                )}
                              />
                            </div>
                          </div>

                          {/* Expandable Body */}
                          <AnimatePresence initial={false}>
                            {isExpanded && (
                              <motion.div
                                initial={{ height: 0 }}
                                animate={{ height: "auto" }}
                                exit={{ height: 0 }}
                                className="overflow-hidden"
                              >
                                <div className="px-4 pb-4 pt-1 border-t border-white/5 space-y-3">
                                  <p className="text-xs text-muted leading-relaxed whitespace-pre-wrap">
                                    {ann.message}
                                  </p>
                                  {ann.attachments && ann.attachments.length > 0 && (
                                    <div className="flex flex-wrap gap-2 pt-3 border-t border-white/5">
                                      {ann.attachments.map((att: any, aIdx: number) => (
                                        <button
                                          key={aIdx}
                                          onClick={() => handleAttachmentClick(att)}
                                          className="h-8 px-3 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-[10px] font-bold text-[#E8EAFF] transition-all flex items-center gap-1.5"
                                        >
                                          {att.type === "file" ? (
                                            <>
                                              <FileText className="h-3.5 w-3.5 text-indigo-400" />
                                              <span>{att.name}</span>
                                            </>
                                          ) : (
                                            <>
                                              {getDriveIcon(att.url)}
                                              <span>{att.name || "View Link"}</span>
                                            </>
                                          )}
                                        </button>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              </motion.div>
                            )}
                          </AnimatePresence>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            {/* Access QR card */}
            <div className="glass-3d p-8 rounded-[2.5rem] bg-indigo-950/10 border-indigo-500/10 text-center space-y-6 shrink-0">
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

    </div>
    </SpeakerPortalLayout>
  );
}
