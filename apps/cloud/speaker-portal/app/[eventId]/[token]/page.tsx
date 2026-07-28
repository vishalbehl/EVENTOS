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
  Award
} from "lucide-react";
import Link from "next/link";
import { DeadlineBanner, DeadlineCountdownBadge } from "@/components/DeadlineBanner";
import { cn } from "@/lib/utils";
import { useDeadlineStatus } from "@/hooks/useDeadlineStatus";
import { ImageCropper } from "@/components/ImageCropper";
import { SpeakerPortalLayout } from "@/components/SpeakerPortalLayout";
import { AbstractEditor } from "@/components/AbstractEditor";

const countries = [
  // ... (countries array continues)
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
  const [activeViewTalk, setActiveViewTalk] = useState<PortalTalk | null>(null);

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
  const [cvUrl, setCvUrl] = useState("");
  const [templateUrl, setTemplateUrl] = useState("");
  const [hasProfile, setHasProfile] = useState(false);

  // Countdown timer state
  const [countdown, setCountdown] = useState({ days: 0, hours: 0, minutes: 0, seconds: 0 });

  // Calculate days left to event start
  const daysLeft = (() => {
    if (!portal || !portal.start_date) return null;
    const start = new Date(portal.start_date);
    const now = new Date();
    start.setHours(0, 0, 0, 0);
    now.setHours(0, 0, 0, 0);
    const diffTime = start.getTime() - now.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays;
  })();

  // Pending Actions
  const pendingActions = (() => {
    const list: string[] = [];
    if (!portal) return list;
    if (!hasProfile) {
      list.push("Complete Speaker Profile");
    }
    const hasPendingUpload = portal.talks?.some(talk => talk.upload_status === "pending");
    if (hasPendingUpload) {
      list.push("Upload Talk Presentations");
    }
    const hasRejectedUpload = portal.talks?.some(talk => talk.upload_status === "rejected");
    if (hasRejectedUpload) {
      list.push("Re-upload Rejected Talk(s)");
    }
    if (!portal.srr_checked_in) {
      list.push("Verify slides at Speaker Ready Room");
    }
    return list;
  })();

  // Event Journey Progress tracker steps
  const steps = (() => {
    if (!portal) return [];
    const profileCompleted = (() => {
      if (profileMode === "form") return hasProfile;
      if (profileMode === "template") return !!templateUrl;
      if (profileMode === "cv") return !!cvUrl;
      return hasProfile;
    })();
    const hasRejectedTalks = portal.talks?.some(talk => talk.upload_status === "rejected");
    const talksUploaded = portal.talks && portal.talks.length > 0
      ? portal.talks.every(talk => talk.upload_status !== "pending" && talk.upload_status !== "rejected")
      : true;
    const slidesVerified = portal.srr_checked_in || (portal.talks && portal.talks.length > 0
      ? portal.talks.every(talk => ["valid", "approved"].includes(talk.upload_status))
      : false);
    const approvalCompleted = portal.srr_checked_in || (portal.talks && portal.talks.length > 0
      ? portal.talks.every(talk => talk.upload_status === "approved")
      : false);
    const ready = profileCompleted && talksUploaded && slidesVerified && approvalCompleted;

    return [
      { label: "Profile Intake", isCompleted: profileCompleted, isActive: !profileCompleted },
      { label: "Talk Upload", isCompleted: talksUploaded, isActive: profileCompleted && !talksUploaded, isRejected: profileCompleted && hasRejectedTalks },
      { label: "Slide Verification", isCompleted: slidesVerified, isActive: profileCompleted && talksUploaded && !slidesVerified },
      { label: "Approval Window", isCompleted: approvalCompleted, isActive: profileCompleted && talksUploaded && slidesVerified && !approvalCompleted },
      { label: "Speaker Ready", isCompleted: ready, isActive: profileCompleted && talksUploaded && slidesVerified && approvalCompleted }
    ];
  })();

  // Event countdown ticking effect
  useEffect(() => {
    if (!portal?.start_date) return;
    const start = new Date(portal.start_date).getTime();
    const update = () => {
      const now = new Date().getTime();
      const diff = start - now;
      if (diff <= 0) {
        setCountdown({ days: 0, hours: 0, minutes: 0, seconds: 0 });
        return;
      }
      const days = Math.floor(diff / (1000 * 60 * 60 * 24));
      const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((diff % (1000 * 60)) / 1000);
      setCountdown({ days, hours, minutes, seconds });
    };
    update();
    const timer = setInterval(update, 1000);
    return () => clearInterval(timer);
  }, [portal?.start_date]);

  // Ticket Passes JPEG and PDF download handlers
  const downloadTicketJPG = (code: string, isAccessPass: boolean, name: string, eventName: string) => {
    try {
      const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=250x250&bgcolor=FFFFFF&color=000000&data=${encodeURIComponent(code)}`;
      const canvas = document.createElement("canvas");
      canvas.width = 400;
      canvas.height = 500;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      // Draw background
      ctx.fillStyle = "#FFFFFF";
      ctx.fillRect(0, 0, 400, 500);

      // Draw border
      const themeColor = portal?.theme_color || "#6366F1";
      ctx.strokeStyle = themeColor;
      ctx.lineWidth = 8;
      ctx.strokeRect(4, 4, 392, 492);

      // Draw header
      ctx.fillStyle = themeColor;
      ctx.font = "bold 10px 'Segoe UI', sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(isAccessPass ? "ACCESS PASS" : "ENTRY PASS", 200, 35);

      ctx.fillStyle = "#1E1B4B";
      ctx.font = "bold 14px 'Segoe UI', sans-serif";
      ctx.fillText(eventName.toUpperCase(), 200, 58);

      // Load QR Image directly
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.src = qrUrl;
      img.onload = () => {
        try {
          // Draw QR
          ctx.drawImage(img, 100, 95, 200, 200);

          // Draw Name
          ctx.fillStyle = "#111827";
          ctx.font = "bold 18px 'Segoe UI', sans-serif";
          ctx.fillText(name.toUpperCase(), 200, 360);

          // Draw Code
          ctx.fillStyle = themeColor;
          ctx.font = "bold 14px monospace";
          ctx.fillText(isAccessPass ? `ACCESS CODE: ${code}` : `REG: ${code}`, 200, 395);

          // Draw Category badge
          ctx.fillStyle = "#F3F4F6";
          const roleLabel = isAccessPass ? "SPEAKER ACCESS" : "SPEAKER";
          const badgeWidth = Math.max(100, ctx.measureText(roleLabel).width + 30);
          const bx = 200 - badgeWidth / 2;
          const by = 425;
          const bw = badgeWidth;
          const bh = 28;
          const br = 14;

          ctx.beginPath();
          ctx.moveTo(bx + br, by);
          ctx.lineTo(bx + bw - br, by);
          ctx.quadraticCurveTo(bx + bw, by, bx + bw, by + br);
          ctx.lineTo(bx + bw, by + bh - br);
          ctx.quadraticCurveTo(bx + bw, by + bh, bx + bw - br, by + bh);
          ctx.lineTo(bx + br, by + bh - br);
          ctx.quadraticCurveTo(bx, by + bh, bx, by + bh - br);
          ctx.lineTo(bx, by + br);
          ctx.quadraticCurveTo(bx, by, bx + br, by);
          ctx.closePath();
          ctx.fill();

          ctx.fillStyle = "#4B5563";
          ctx.font = "bold 10px 'Segoe UI', sans-serif";
          ctx.fillText(roleLabel, 200, 442);

          // Export and download
          canvas.toBlob((outBlob) => {
            if (outBlob) {
              const downloadUrl = window.URL.createObjectURL(outBlob);
              const a = document.createElement("a");
              a.href = downloadUrl;
              const passName = isAccessPass ? "AccessPass" : "EntryPass";
              a.download = `${passName}_${name.replace(/\s+/g, "_")}_${code}.jpg`;
              document.body.appendChild(a);
              a.click();
              document.body.removeChild(a);
              window.URL.revokeObjectURL(downloadUrl);
            }
          }, "image/jpeg", 0.95);
        } catch (err) {
          console.error("Canvas drawing error", err);
          const a = document.createElement("a");
          a.href = qrUrl;
          a.download = `QR_${code}.jpg`;
          a.target = "_blank";
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
        }
      };
      img.onerror = () => {
        const a = document.createElement("a");
        a.href = qrUrl;
        a.download = `QR_${code}.jpg`;
        a.target = "_blank";
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      };
    } catch (e) {
      console.error(e);
    }
  };

  const downloadTicketPDF = (code: string, isAccessPass: boolean, name: string, eventName: string) => {
    const printWindow = window.open("", "_blank", "width=600,height=650");
    if (!printWindow) return;
    const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=250x250&bgcolor=FFFFFF&color=000000&data=${encodeURIComponent(code)}`;
    const themeColor = portal?.theme_color || "#6366f1";
    const headerLabel = isAccessPass ? "ACCESS PASS" : "ENTRY PASS";
    const subLabel = isAccessPass ? `ACCESS CODE: ${code}` : `REG: ${code}`;
    const roleLabel = isAccessPass ? "SPEAKER ACCESS" : "SPEAKER";

    const html = `
      <html>
        <head>
          <title>Pass - ${name}</title>
          <style>
            body { 
              font-family: 'Segoe UI', sans-serif; 
              margin: 0; padding: 0; background-color: #f3f4f6; 
              display: flex; justify-content: center; align-items: center; min-height: 100vh;
            }
            .ticket-card { 
              width: 380px; background: #ffffff; border: 6px solid ${themeColor}; border-radius: 24px; 
              padding: 30px; box-shadow: 0 10px 25px -5px rgba(0,0,0,0.1); text-align: center; box-sizing: border-box;
            }
            .header-label { font-size: 10px; font-weight: 800; color: ${themeColor}; letter-spacing: 0.25em; text-transform: uppercase; margin-bottom: 4px; }
            .event-name { font-size: 14px; font-weight: 800; color: #1e1b4b; text-transform: uppercase; margin-bottom: 20px; }
            .qr-container { background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 16px; padding: 10px; display: inline-block; margin-bottom: 20px; }
            .qr-img { width: 160px; height: 160px; display: block; }
            .attendee-name { font-size: 18px; font-weight: 800; color: #111827; text-transform: uppercase; margin-bottom: 6px; }
            .reg-no { font-family: monospace; font-size: 14px; font-weight: 700; color: ${themeColor}; margin-bottom: 20px; }
            .badge { display: inline-block; padding: 6px 16px; background-color: #f3f4f6; border: 1px solid #e5e7eb; color: #4b5563; font-size: 10px; font-weight: 800; border-radius: 9999px; text-transform: uppercase; }
            .print-btn { margin-top: 20px; padding: 10px 20px; background: ${themeColor}; color: white; border: none; border-radius: 8px; cursor: pointer; font-weight: bold; }
            @media print { body { background-color: #ffffff; } .ticket-card { box-shadow: none; } .print-btn { display: none; } }
          </style>
        </head>
        <body>
          <div class="ticket-card">
            <div class="header-label">${headerLabel}</div>
            <div class="event-name">${eventName}</div>
            <div class="qr-container"><img class="qr-img" src="${qrUrl}" alt="QR" /></div>
            <div class="attendee-name">${name}</div>
            <div class="reg-no">${subLabel}</div>
            <div class="badge">${roleLabel}</div>
            <br /><button class="print-btn" onclick="window.print()">Print Ticket</button>
          </div>
          <script>window.onload = function() { setTimeout(function() { window.print(); }, 500); }</script>
        </body>
      </html>
    `;
    printWindow.document.write(html);
    printWindow.document.close();
  };

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
          setCvUrl(p.cv_url || "");
          setTemplateUrl(p.template_url || "");
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
        if (res.data && res.data.template_url) {
          setTemplateUrl(res.data.template_url);
          setHasProfile(true);
          toast.success("Template uploaded successfully!", { id: loadingId });
          queryClient.invalidateQueries({ queryKey: ["portal-auth", eventId, token] });
        } else {
          toast.error("Failed to upload template.", { id: loadingId });
        }
      } catch (err: any) {
        toast.error(err.response?.data?.detail || "Failed to upload template.", { id: loadingId });
      }
    }
  };

  // Mode 3 CV Upload
  const handleUploadCV = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const file = e.target.files[0];
      const formData = new FormData();
      formData.append("file", file);

      const loadingId = toast.loading("Uploading CV...");
      try {
        const res = await apiClient.post(`/events/${eventId}/speakers/${portal.speaker_id}/profile/parse-cv?token=${token}`, formData, {
          headers: { "Content-Type": "multipart/form-data" }
        });
        if (res.data && res.data.cv_url) {
          setCvUrl(res.data.cv_url);
          setHasProfile(true);
          toast.success("CV uploaded successfully!", { id: loadingId });
          queryClient.invalidateQueries({ queryKey: ["portal-auth", eventId, token] });
        } else {
          toast.error("Failed to upload CV.", { id: loadingId });
        }
      } catch (err: any) {
        toast.error(err.response?.data?.detail || "Failed to upload CV.", { id: loadingId });
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
          <svg className="h-3.5 w-3.5 fill-current" viewBox="0 0 24 24"><path d="M19.43 12.98c.04-.32.07-.64.07-.98s-.03-.66-.07-.98l2.11-1.65c.19-.15.24-.42.12-.64l-2-3.46c-.12-.22-.39-.3-.61-.22l-2.49 1c-.52-.4-1.08-.73-1.69-.98l-.38-2.65C14.46.2 14.25 0 14 0h-4c-.25 0-.46.2-.49.45L9.13 3.1c-.61.25-1.17.59-1.69.98l-2.49-1c-.23-.09-.49 0-.61.22l-2 3.46c-.13.22-.07.49.12.64l2.11 1.65c-.04.32-.07.65-.07.98s.03.66.07.98l-2.11 1.65c-.19.15-.24.42-.12.64l2 3.46c.12.22.39.3.61.22l2.49-1c.52.4 1.08.73 1.69.98l.38 2.65c.03.25.24.45.49.45h4c.25 0 .46-.2.49-.45l.38-2.65c.61-.25 1.17-.59 1.69-.98l2.49 1c.23.09.49 0 .61-.22l2-3.46c.12-.22.07-.49-.12-.64l-2.11-1.65zM12 15.5c-1.93 0-3.5-1.57-3.5-3.5s1.57-3.5 3.5-3.5 3.5 1.57 3.5 3.5-1.57 3.5-3.5 3.5z" /></svg>
          Google Drive
        </span>
      );
    }
    if (lowerUrl.includes("onedrive.live.com") || lowerUrl.includes("sharepoint.com")) {
      return (
        <span className="inline-flex items-center gap-1.5 text-blue-400 font-bold">
          <svg className="h-3.5 w-3.5 fill-current" viewBox="0 0 24 24"><path d="M19.35 10.04C18.67 6.59 15.64 4 12 4 9.11 4 6.6 5.64 5.35 8.04 2.34 8.36 0 10.91 0 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96z" /></svg>
          OneDrive
        </span>
      );
    }
    if (lowerUrl.includes("dropbox.com")) {
      return (
        <span className="inline-flex items-center gap-1.5 text-indigo-400 font-bold">
          <svg className="h-3.5 w-3.5 fill-current" viewBox="0 0 24 24"><path d="M5.5 2L1 5.5l6.5 5.5L12 7.5 5.5 2zM1 12.5l4.5 3.5L12 11l-4.5-5.5L1 12.5zm16.5-7L12 2l-6.5 5.5L12 11l5.5-5.5zM12 11l6.5 5 4.5-3.5L16.5 7 12 11zm11 1.5l-4.5-3.5L12 14.5l4.5 5.5 6.5-6.5zM12 14.5l-5.5-5.5-4.5 3.5L8.5 19l3.5-4.5zm0 0.5l-4.5 4 4.5 3.5 4.5-3.5-4.5-4z" /></svg>
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
      country={portal.event_country}
      state={portal.event_state}
      organizerName={portal.organizer_name}
      email={portal.email}
      speakerName={speakerName}
      token={token}
      eventId={eventId}
    >
      <div className="min-h-screen flex flex-col w-full">
        {/* Sticky deadline banner */}
        <DeadlineBanner deadlineInfo={deadlineInfo} className="sticky top-0 z-[60]" />


        <main className="flex-1 max-w-7xl mx-auto w-full px-6 md:px-10 py-10 space-y-8">
          {/* Top Welcome Banner Section */}
          <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-6 bg-gradient-to-r from-indigo-500/10 via-purple-500/5 to-transparent p-6 rounded-[2rem] border border-white/5 shadow-2xl relative overflow-hidden text-left">
            <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />
            <div className="absolute -bottom-10 left-10 w-48 h-48 bg-purple-500/10 rounded-full blur-3xl pointer-events-none" />

            <div className="relative z-10 flex-1">
              <span className="text-[10px] font-black text-indigo-400 uppercase tracking-[0.25em] block mb-1">
                Speaker Control Center
              </span>
              <h2 className="text-2xl md:text-3xl font-black text-[#E8EAFF] tracking-tight flex items-center gap-2">
                Welcome back, {portal.first_name} {portal.last_name} 👋
              </h2>
              <p className="text-xs font-bold text-muted mt-2">
                {portal.event_name} {daysLeft !== null ? (
                  daysLeft > 0 ? (
                    <>begins in <span className="text-indigo-400 font-extrabold">{daysLeft} days</span>.</>
                  ) : daysLeft === 0 ? (
                    <span className="text-emerald-400 font-extrabold">begins today!</span>
                  ) : (
                    <>started <span className="text-muted font-extrabold">{Math.abs(daysLeft)} days ago</span>.</>
                  )
                ) : ""} You have <span className="text-purple-400 font-extrabold">{pendingActions.length} pending actions</span>.
              </p>

              {pendingActions.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-3">
                  {pendingActions.map((action, i) => (
                    <span key={i} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-purple-500/10 text-purple-300 border border-purple-500/20 text-[10px] font-bold">
                      <AlertCircle className="h-3 w-3 text-purple-400" />
                      {action}
                    </span>
                  ))}
                </div>
              )}

              {portal.talks?.some(talk => talk.upload_status === "rejected") && (
                <div className="mt-4 flex items-center gap-3 px-4 py-3 rounded-2xl bg-red-500/10 border border-red-500/20 text-red-300 max-w-xl">
                  <AlertCircle className="h-5 w-5 text-red-400 shrink-0" />
                  <div className="text-xs text-left">
                    <span className="font-black uppercase tracking-wider block">Action Required: Talk slide rejected</span>
                    <span className="font-bold text-red-300/80">Some of your talk submissions has been rejected by the review committee. Please review the reason below and upload a revised file.</span>
                  </div>
                </div>
              )}
            </div>

            {/* Event Countdown */}
            <div className="relative z-10 shrink-0 bg-[#0d0e1b]/40 backdrop-blur border border-white/5 p-4 rounded-2xl min-w-[280px]">
              <span className="text-[9px] font-black text-indigo-400 uppercase tracking-[0.25em] block mb-2.5 text-center">
                Event Begins In
              </span>
              <div className="grid grid-cols-4 gap-2">
                {[
                  { label: "Days", val: countdown.days },
                  { label: "Hours", val: countdown.hours },
                  { label: "Mins", val: countdown.minutes },
                  { label: "Secs", val: countdown.seconds }
                ].map((c, i) => (
                  <div key={i} className="p-2 bg-[#0d0e1b]/80 border border-white/5 rounded-xl text-center">
                    <span className="text-lg font-black text-[#E8EAFF] tracking-tight block">
                      {String(c.val).padStart(2, "0")}
                    </span>
                    <span className="text-[7px] font-black text-muted uppercase tracking-wider block mt-0.5">
                      {c.label}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Event Journey Progress Tracker */}
          <div className="glass-card p-6 rounded-[2rem] border border-white/5 relative overflow-hidden bg-stone-900/60">
            <div className="absolute inset-0 bg-gradient-to-b from-indigo-500/[0.02] to-transparent pointer-events-none" />
            <h3 className="text-[10px] font-black text-muted uppercase tracking-[0.2em] mb-6 flex items-center gap-2">
              <Award className="h-4 w-4 text-indigo-400" /> Event Journey Progress
            </h3>

            <div className="relative">
              {/* Background Line */}
              <div className="absolute top-4 md:top-5 left-[10%] right-[10%] h-0.5 bg-white/5" />

              {/* Glowing progress line */}
              {(() => {
                const completedCount = steps.filter(s => s.isCompleted).length;
                const progressPercent = ((completedCount - 1) / (steps.length - 1)) * 80;
                return (
                  <div
                    className="absolute top-4 md:top-5 left-[10%] h-0.5 bg-gradient-to-r from-indigo-500 to-emerald-500 shadow-[0_0_8px_rgba(99,102,241,0.5)] transition-all duration-500"
                    style={{ width: `${progressPercent}%` }}
                  />
                );
              })()}

              <div className="grid grid-cols-5 gap-2 sm:gap-6 relative z-10">
                {steps.map((step, idx) => {
                  const isCompleted = step.isCompleted;
                  const isActive = step.isActive;
                  const isRejected = (step as any).isRejected;
                  return (
                    <div key={idx} className="flex flex-col items-center text-center group">
                      {/* Step Node */}
                      <div className={`h-8 w-8 md:h-10 md:w-10 rounded-full flex items-center justify-center border transition-all duration-300 ${isCompleted
                        ? "bg-emerald-500/10 border-emerald-500 text-emerald-400 shadow-[0_0_12px_rgba(52,211,153,0.2)]"
                        : isRejected
                          ? "bg-red-500/10 border-red-500 text-red-400 shadow-[0_0_12px_rgba(239,68,68,0.2)]"
                          : isActive
                            ? "bg-indigo-500/10 border-indigo-500 text-indigo-400 shadow-[0_0_12px_rgba(99,102,241,0.2)]"
                            : "bg-[#0d0e1b] border-white/10 text-muted"
                        }`}>
                        {isCompleted ? (
                          <Check className="h-4 w-4 md:h-5 md:w-5" />
                        ) : isRejected ? (
                          <AlertCircle className="h-4 w-4 md:h-5 md:w-5 text-red-400 animate-pulse" />
                        ) : (
                          <span className="text-[10px] md:text-xs font-black">{idx + 1}</span>
                        )}
                      </div>
                      {/* Step Label */}
                      <span className={`text-[7px] sm:text-[8px] md:text-[10px] font-black uppercase tracking-wider mt-2.5 md:mt-3 transition-colors ${isCompleted
                        ? "text-emerald-400"
                        : isRejected
                          ? "text-red-400"
                          : isActive
                            ? "text-[#E8EAFF]"
                            : "text-muted"
                        }`}>
                        {step.label}
                      </span>
                      <span className="text-[6px] sm:text-[8px] md:text-[9px] font-bold text-muted mt-0.5 block opacity-80">
                        {isCompleted ? "Completed" : isRejected ? "Rejected" : isActive ? "Active" : "Locked"}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

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
                              {(() => {
                                const sortedTalks = [...portal.talks].sort((a, b) => {
                                  if (a.upload_status === "rejected" && b.upload_status !== "rejected") return -1;
                                  if (a.upload_status !== "rejected" && b.upload_status === "rejected") return 1;
                                  return 0;
                                });
                                return sortedTalks.map((talk) => (
                                  <div
                                    key={talk.session_speaker_id}
                                    className={cn(
                                      "glass-3d p-8 group hover-lift-3d flex flex-col lg:flex-row lg:items-center justify-between gap-8 rounded-[2.5rem]",
                                      talk.upload_status === "rejected" && "border-red-500/30 bg-red-500/[0.01]"
                                    )}
                                  >
                                    <div className="flex-1 space-y-4">
                                      <div className="flex flex-wrap items-center gap-3">
                                        <span className={cn(
                                          "badge",
                                          talk.upload_status === 'approved' ? 'badge-success' :
                                            talk.upload_status === 'uploaded' ? 'badge-info' :
                                              talk.upload_status === 'rejected' ? 'badge-danger' :
                                                'badge-warning'
                                        )}>
                                          {talk.upload_status}
                                        </span>
                                        <span className="text-[10px] font-black text-muted uppercase tracking-widest px-2 py-1 rounded bg-white/5 border border-white/5">
                                          {talk.session_code}
                                        </span>
                                      </div>

                                      <h3 className="text-2xl md:text-3xl font-black tracking-tighter group-hover:text-indigo-400 transition-colors text-left">
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
                                        <div className="flex items-center gap-2.5 text-sm font-bold text-muted">
                                          <MapPin className="h-4 w-4 text-indigo-400/70" />
                                          Room: {talk.room_name || "TBA"}
                                        </div>
                                      </div>

                                      <AbstractEditor
                                        eventId={eventId}
                                        token={token}
                                        talk={talk}
                                        enabled={portal.abstract_submission_enabled}
                                        denialReason={portal.abstract_submission_reason}
                                      />

                                      {talk.upload_status === "rejected" && talk.rejection_reason && (
                                        <div className="mt-4 flex items-start gap-2.5 px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 max-w-2xl text-left">
                                          <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                                          <div className="text-xs">
                                            <span className="font-black uppercase tracking-wider block mb-0.5">Rejection Reason:</span>
                                            <span className="font-bold text-red-300">{talk.rejection_reason}</span>
                                          </div>
                                        </div>
                                      )}
                                    </div>

                                    <div className="flex items-center gap-6">
                                      {talk.upload_status === 'pending' ? (
                                        isDeadlineLocked ? (
                                          <div className="flex flex-col items-center gap-3 text-center px-6">
                                            <Lock className="h-6 w-6 text-red-400" />
                                          </div>
                                        ) : (
                                          <Link
                                            href={`/${eventId}/${token}/upload?slot=${talk.session_speaker_id}`}
                                            className="btn-primary px-10 h-14 rounded-full font-black text-[11px] uppercase tracking-widest flex items-center justify-center gap-2"
                                          >
                                            Begin Upload <ChevronRight className="h-4 w-4" />
                                          </Link>
                                        )
                                      ) : (
                                        <button
                                          onClick={() => setActiveViewTalk(talk)}
                                          className="btn-primary px-10 h-14 rounded-full font-black text-[11px] uppercase tracking-widest flex items-center justify-center gap-2"
                                        >
                                          View Talk <ChevronRight className="h-4 w-4" />
                                        </button>
                                      )}
                                    </div>
                                  </div>
                                ));
                              })()}
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
                                  <span className="text-[9px] font-bold text-muted uppercase">PDF, DOCX, or PPTX format</span>
                                </div>
                                <input type="file" accept=".pdf,.docx,.pptx" onChange={handleUploadTemplate} className="hidden" />
                              </label>
                            </div>

                            {templateUrl && (
                              <div className="glass-3d p-6 rounded-[2rem] border-emerald-500/20 bg-emerald-950/10 flex flex-col sm:flex-row items-center justify-between gap-4">
                                <div className="flex items-center gap-3">
                                  <div className="h-10 w-10 rounded-full bg-emerald-500/10 flex items-center justify-center text-emerald-400">
                                    <Check className="h-5 w-5" />
                                  </div>
                                  <div className="text-left">
                                    <span className="text-xs font-black uppercase tracking-wider text-[#E8EAFF] block">Completed Template Uploaded</span>
                                    <span className="text-[10px] font-bold text-muted uppercase">Filename: {templateUrl.split('/').pop()}</span>
                                  </div>
                                </div>
                                <a
                                  href={templateUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="h-10 px-6 rounded-full bg-emerald-500 hover:bg-emerald-600 flex items-center justify-center gap-2 text-xs font-black uppercase tracking-widest text-white shadow-lg transition-all"
                                >
                                  <Download className="h-4 w-4" /> View Document
                                </a>
                              </div>
                            )}
                          </div>
                        )}

                        {profileMode === "cv" && (
                          <div className="space-y-6">
                            <div className="glass-3d p-8 rounded-[2.5rem] space-y-6">
                              <h3 className="text-xl font-black uppercase tracking-wider text-[#E8EAFF]">Intake Mode 3: CV Text Parser</h3>
                              <p className="text-xs text-muted leading-relaxed">
                                Upload your existing professional Curriculum Vitae (CV) or Resume as a PDF, DOCX, or PPTX document. Event OS's AI parsing heuristics will analyze and extract your job title, university/company affiliation, and a formatted bio snippet directly, allowing you to review them immediately.
                              </p>

                              <label className="w-full h-44 rounded-[2rem] border-2 border-dashed border-white/10 hover:border-indigo-500/50 hover:bg-indigo-500/5 flex flex-col items-center justify-center gap-4 cursor-pointer transition-all duration-300">
                                <FileText className="h-10 w-10 text-muted" />
                                <div className="text-center">
                                  <span className="text-xs font-black uppercase tracking-widest text-indigo-400 block mb-1">Upload CV Document</span>
                                  <span className="text-[9px] font-bold text-muted uppercase">PDF, DOCX, or PPTX format</span>
                                </div>
                                <input type="file" accept=".pdf,.docx,.pptx" onChange={handleUploadCV} className="hidden" />
                              </label>
                            </div>

                            {cvUrl && (
                              <div className="glass-3d p-6 rounded-[2rem] border-emerald-500/20 bg-emerald-950/10 flex flex-col sm:flex-row items-center justify-between gap-4">
                                <div className="flex items-center gap-3">
                                  <div className="h-10 w-10 rounded-full bg-emerald-500/10 flex items-center justify-center text-emerald-400">
                                    <Check className="h-5 w-5" />
                                  </div>
                                  <div className="text-left">
                                    <span className="text-xs font-black uppercase tracking-wider text-[#E8EAFF] block">CV Document Uploaded</span>
                                    <span className="text-[10px] font-bold text-muted uppercase">Filename: {cvUrl.split('/').pop()}</span>
                                  </div>
                                </div>
                                <a
                                  href={cvUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="h-10 px-6 rounded-full bg-emerald-500 hover:bg-emerald-600 flex items-center justify-center gap-2 text-xs font-black uppercase tracking-widest text-white shadow-lg transition-all"
                                >
                                  <Download className="h-4 w-4" /> View Document
                                </a>
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
            <div className="lg:col-span-4 flex flex-col gap-6 text-left">
              {/* Submission Deadline Card */}
              {deadlineInfo.status !== "no_deadline" && (
                <div className={cn(
                  "glass-3d rounded-[2rem] p-6 border relative overflow-hidden flex flex-col gap-4 bg-stone-900/60",
                  deadlineInfo.status === "passed"
                    ? "border-red-500/20 bg-red-950/10"
                    : deadlineInfo.status === "override"
                      ? "border-yellow-500/20 bg-yellow-950/10"
                      : deadlineInfo.status === "urgent"
                        ? "border-rose-500/20 bg-rose-950/10 shadow-[0_0_15px_rgba(239,68,68,0.1)]"
                        : "border-indigo-500/20 bg-indigo-950/10"
                )}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Clock className={cn(
                        "h-4 w-4",
                        deadlineInfo.status === "passed" ? "text-red-400" :
                          deadlineInfo.status === "override" ? "text-yellow-400" :
                            deadlineInfo.status === "urgent" ? "text-rose-400 animate-pulse" :
                              "text-indigo-400"
                      )} />
                      <span className="text-[10px] font-black uppercase tracking-[0.2em] text-[#E8EAFF]">
                        Submission Deadline
                      </span>
                    </div>
                    <span className={cn(
                      "text-[9px] font-black uppercase tracking-widest px-2.5 py-1 rounded-full border",
                      deadlineInfo.status === "passed" ? "bg-red-500/10 text-red-400 border-red-500/20" :
                        deadlineInfo.status === "override" ? "bg-yellow-500/10 text-yellow-400 border-yellow-500/20" :
                          deadlineInfo.status === "urgent" ? "bg-rose-500/10 text-rose-400 border-rose-500/20 animate-pulse" :
                            "bg-indigo-500/10 text-indigo-400 border-indigo-500/20"
                    )}>
                      {deadlineInfo.status === "passed" ? "Closed" :
                        deadlineInfo.status === "override" ? "Late submission" :
                          deadlineInfo.status === "urgent" ? "Urgent" :
                            "Active"}
                    </span>
                  </div>

                  <div className="flex flex-col mt-1">
                    <span className="text-sm font-black text-[#E8EAFF]">
                      {deadlineInfo.deadline ? new Date(deadlineInfo.deadline).toLocaleDateString("en-IN", {
                        day: "numeric",
                        month: "long",
                        year: "numeric",
                        timeZone: "Asia/Kolkata"
                      }) : ""}
                    </span>
                    <span className="text-xs font-bold text-muted mt-0.5">
                      {deadlineInfo.deadline ? new Date(deadlineInfo.deadline).toLocaleTimeString("en-IN", {
                        hour: "2-digit",
                        minute: "2-digit",
                        hour12: true,
                        timeZone: "Asia/Kolkata"
                      }) + " IST" : ""}
                    </span>
                  </div>

                  <div className="mt-1 text-xs font-bold border-t border-white/5 pt-3">
                    {deadlineInfo.status === "passed" ? (
                      <span className="text-red-400">
                        The upload window is now closed. Please reach out to the event administrator if you require an extension.
                      </span>
                    ) : deadlineInfo.status === "override" ? (
                      <span className="text-yellow-400">
                        Late submissions are currently allowed. Please upload your materials as soon as possible.
                      </span>
                    ) : (
                      <span className="text-muted">
                        Remaining time: <span className="text-indigo-400 font-extrabold">{deadlineInfo.label.includes("·") ? deadlineInfo.label.split("·")[1]?.trim() : deadlineInfo.label}</span>
                      </span>
                    )}
                  </div>
                </div>
              )}
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

              {/* QR pass card container */}
              <div className="flex flex-col gap-8 shrink-0">
                {portal.registration_mode_enabled ? (
                  portal.reg_no ? (
                    <div className="glass-card p-6 md:p-8 rounded-[2rem] border border-white/5 relative overflow-hidden bg-[#0d0e1b]/40 text-center animate-in fade-in duration-300">
                      <div className="absolute top-0 right-0 w-48 h-48 bg-indigo-500/5 rounded-full blur-3xl pointer-events-none" />
                      <div className="space-y-6">
                        {/* Ticket Pass */}
                        <div
                          className="w-full max-w-[280px] bg-white border-[6px] rounded-[24px] p-6 text-center relative overflow-hidden shadow-2xl mx-auto hover-lift-3d"
                          style={{ borderColor: portal.theme_color || "#6366f1" }}
                        >
                          <div
                            className="absolute top-0 left-0 right-0 h-1.5"
                            style={{ background: `linear-gradient(to right, ${portal.theme_color || "#6366f1"}, #a855f7)` }}
                          />
                          <span
                            className="text-[10px] font-extrabold uppercase tracking-[0.25em] block mb-1"
                            style={{ color: portal.theme_color || "#6366f1" }}
                          >
                            ENTRY PASS
                          </span>
                          <h4 className="text-xs font-extrabold text-[#1e1b4b] uppercase tracking-wider mb-2 max-w-full truncate">
                            {portal.event_name}
                          </h4>

                          {/* Perforated separator line */}
                          <div className="w-full flex items-center justify-between my-2">
                            <div className="h-4 w-4 bg-[#141526] rounded-full -ml-8 border-r" style={{ borderColor: `${portal.theme_color || "#6366f1"}33` }} />
                            <div className="flex-1 border-t border-dashed border-gray-300 mx-2" />
                            <div className="h-4 w-4 bg-[#141526] rounded-full -mr-8 border-l" style={{ borderColor: `${portal.theme_color || "#6366f1"}33` }} />
                          </div>

                          <div className="p-2.5 bg-[#f9fafb] border border-[#e5e7eb] rounded-2xl my-3 flex justify-center">
                            <img
                              src={`https://api.qrserver.com/v1/create-qr-code/?size=250x250&bgcolor=FFFFFF&color=000000&data=${encodeURIComponent(portal.reg_no)}`}
                              alt={`QR code for ${portal.reg_no}`}
                              className="w-32 h-32 rounded-xl block"
                            />
                          </div>

                          <h3 className="text-sm font-extrabold text-[#111827] uppercase tracking-wider mb-1 max-w-full truncate">
                            {speakerName}
                          </h3>
                          <span
                            className="text-xs font-mono font-bold tracking-widest block mb-3"
                            style={{ color: portal.theme_color || "#6366f1" }}
                          >
                            REG: {portal.reg_no}
                          </span>

                          <span className="inline-block px-4 py-1.5 bg-[#f3f4f6] border border-[#e5e7eb] text-[10px] font-extrabold text-[#4b5563] uppercase tracking-widest rounded-full">
                            SPEAKER
                          </span>
                        </div>

                        {/* Actions */}
                        <div className="space-y-3 pt-2 text-left">
                          <h4 className="text-sm font-black text-[#E8EAFF] tracking-tight text-center">Your Event Entry Pass</h4>
                          <button
                            onClick={() => downloadTicketJPG(portal.reg_no!, false, speakerName, portal.event_name)}
                            className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 text-xs font-black text-indigo-300 hover:bg-indigo-500/20 transition-all uppercase tracking-wider"
                          >
                            <Download className="h-4 w-4 text-indigo-400" /> Download Pass (JPG)
                          </button>
                          <button
                            onClick={() => downloadTicketPDF(portal.reg_no!, false, speakerName, portal.event_name)}
                            className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl bg-white/5 border border-white/10 text-xs font-black text-[#E8EAFF] hover:bg-white/10 transition-all uppercase tracking-wider"
                          >
                            <FileText className="h-4 w-4 text-indigo-400" /> Print Pass (PDF)
                          </button>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="glass-card p-6 md:p-8 rounded-[2rem] border border-white/5 relative overflow-hidden bg-[#0d0e1b]/40 text-center animate-in fade-in duration-300">
                      <div className="absolute top-0 right-0 w-48 h-48 bg-rose-500/5 rounded-full blur-3xl pointer-events-none" />
                      <div className="space-y-6">
                        <div
                          className="w-full max-w-[280px] bg-white border-[6px] rounded-[24px] p-6 text-center relative overflow-hidden shadow-2xl mx-auto hover-lift-3d"
                          style={{ borderColor: "#ef4444" }}
                        >
                          <div
                            className="absolute top-0 left-0 right-0 h-1.5 bg-rose-500"
                          />
                          <span
                            className="text-[10px] font-extrabold uppercase tracking-[0.25em] block mb-1 text-rose-500"
                          >
                            ENTRY PASS
                          </span>
                          <h4 className="text-xs font-extrabold text-[#1e1b4b] uppercase tracking-wider mb-2 max-w-full truncate">
                            {portal.event_name}
                          </h4>

                          {/* Perforated separator line */}
                          <div className="w-full flex items-center justify-between my-2">
                            <div className="h-4 w-4 bg-[#141526] rounded-full -ml-8 border-r border-rose-500/20" />
                            <div className="flex-1 border-t border-dashed border-gray-300 mx-2" />
                            <div className="h-4 w-4 bg-[#141526] rounded-full -mr-8 border-l border-rose-500/20" />
                          </div>

                          <div className="p-4 bg-rose-50 border border-rose-100 rounded-2xl my-3 flex flex-col items-center justify-center min-h-[144px]">
                            <AlertCircle className="h-8 w-8 text-rose-500 mb-2" />
                            <span className="text-[10px] font-black text-rose-700 uppercase tracking-widest">Registration Pending</span>
                          </div>

                          <h3 className="text-sm font-extrabold text-[#111827] uppercase tracking-wider mb-1 max-w-full truncate">
                            {speakerName}
                          </h3>
                          <span
                            className="text-xs font-mono font-bold tracking-widest block mb-3 text-rose-500"
                          >
                            Awaiting badge...
                          </span>

                          <span className="inline-block px-4 py-1.5 bg-[#f3f4f6] border border-[#e5e7eb] text-[10px] font-extrabold text-[#4b5563] uppercase tracking-widest rounded-full">
                            SPEAKER
                          </span>
                        </div>
                        <div className="space-y-3 pt-2 text-left">
                          <h4 className="text-sm font-black text-[#E8EAFF] tracking-tight text-center">Your Event Entry Pass</h4>
                          <p className="text-[11px] text-muted text-center leading-normal px-2">Please complete your registration via the registration portal or wait for organizer approval.</p>
                        </div>
                      </div>
                    </div>
                  )
                ) : (
                  <div className="glass-card p-6 md:p-8 rounded-[2rem] border border-white/5 relative overflow-hidden bg-[#0d0e1b]/40 text-center animate-in fade-in duration-300">
                    <div className="absolute top-0 right-0 w-48 h-48 bg-purple-500/5 rounded-full blur-3xl pointer-events-none" />
                    <div className="space-y-6">
                      {/* Ticket Pass */}
                      <div
                        className="w-full max-w-[280px] bg-white border-[6px] rounded-[24px] p-6 text-center relative overflow-hidden shadow-2xl mx-auto hover-lift-3d"
                        style={{ borderColor: portal.theme_color || "#6366f1" }}
                      >
                        <div
                          className="absolute top-0 left-0 right-0 h-1.5"
                          style={{ background: `linear-gradient(to right, ${portal.theme_color || "#6366f1"}, #a855f7)` }}
                        />
                        <span
                          className="text-[10px] font-extrabold uppercase tracking-[0.25em] block mb-1"
                          style={{ color: portal.theme_color || "#6366f1" }}
                        >
                          ACCESS PASS
                        </span>
                        <h4 className="text-xs font-extrabold text-[#1e1b4b] uppercase tracking-wider mb-2 max-w-full truncate">
                          {portal.event_name}
                        </h4>

                        {/* Perforated separator line */}
                        <div className="w-full flex items-center justify-between my-2">
                          <div className="h-4 w-4 bg-[#141526] rounded-full -ml-8 border-r" style={{ borderColor: `${portal.theme_color || "#6366f1"}33` }} />
                          <div className="flex-1 border-t border-dashed border-gray-300 mx-2" />
                          <div className="h-4 w-4 bg-[#141526] rounded-full -mr-8 border-l" style={{ borderColor: `${portal.theme_color || "#6366f1"}33` }} />
                        </div>

                        <div className="p-2.5 bg-[#f9fafb] border border-[#e5e7eb] rounded-2xl my-3 flex justify-center">
                          <img
                            src={`https://api.qrserver.com/v1/create-qr-code/?size=250x250&bgcolor=FFFFFF&color=000000&data=${encodeURIComponent(portal.speaker_code!)}`}
                            alt={`QR code for ${portal.speaker_code}`}
                            className="w-32 h-32 rounded-xl block"
                          />
                        </div>

                        <h3 className="text-sm font-extrabold text-[#111827] uppercase tracking-wider mb-1 max-w-full truncate">
                          {speakerName}
                        </h3>
                        <span
                          className="text-xs font-mono font-bold tracking-widest block mb-3"
                          style={{ color: portal.theme_color || "#6366f1" }}
                        >
                          ACCESS CODE: {portal.speaker_code}
                        </span>

                        <span className="inline-block px-4 py-1.5 bg-[#f3f4f6] border border-[#e5e7eb] text-[10px] font-extrabold text-[#4b5563] uppercase tracking-widest rounded-full">
                          SPEAKER ACCESS
                        </span>
                      </div>

                      {/* Actions */}
                      <div className="space-y-3 pt-2 text-left">
                        <h4 className="text-sm font-black text-[#E8EAFF] tracking-tight text-center">Your Speaker Room Access Pass</h4>
                        <button
                          onClick={() => downloadTicketJPG(portal.speaker_code!, true, speakerName, portal.event_name)}
                          className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 text-xs font-black text-indigo-300 hover:bg-indigo-500/20 transition-all uppercase tracking-wider"
                        >
                          <Download className="h-4 w-4 text-indigo-400" /> Download Pass (JPG)
                        </button>
                        <button
                          onClick={() => downloadTicketPDF(portal.speaker_code!, true, speakerName, portal.event_name)}
                          className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl bg-white/5 border border-white/10 text-xs font-black text-[#E8EAFF] hover:bg-white/10 transition-all uppercase tracking-wider"
                        >
                          <FileText className="h-4 w-4 text-indigo-400" /> Print Pass (PDF)
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </main>

        {/* View Talk Modal */}
        {activeViewTalk && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 p-4 backdrop-blur-sm">
            <div className="glass-3d w-full max-w-4xl h-[85vh] rounded-[2.5rem] border border-white/10 overflow-hidden flex flex-col">
              {/* Header */}
              <div className="px-8 py-5 border-b border-white/5 flex items-center justify-between">
                <div className="flex flex-col text-left">
                  <span className="text-[10px] font-black uppercase tracking-widest text-indigo-400">
                    {activeViewTalk.session_code} • Room: {activeViewTalk.room_name || "TBA"}
                  </span>
                  <h3 className="text-xl font-black text-white line-clamp-1">
                    {activeViewTalk.talk_title || activeViewTalk.session_name}
                  </h3>
                </div>
                <button
                  onClick={() => setActiveViewTalk(null)}
                  className="p-2.5 rounded-full bg-white/5 border border-white/10 hover:bg-white/10 text-white transition-all"
                  aria-label="Close modal"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              {/* Body */}
              <div className="flex-1 overflow-y-auto p-8 flex flex-col gap-6">
                {/* Info Card */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="glass-3d p-4 rounded-2xl flex flex-col justify-center text-left">
                    <span className="text-[10px] font-black text-muted uppercase tracking-wider mb-1">Status</span>
                    <div>
                      <span className={cn(
                        "badge text-[10px]",
                        activeViewTalk.upload_status === 'approved' ? 'badge-success' :
                          activeViewTalk.upload_status === 'uploaded' ? 'badge-info' :
                            activeViewTalk.upload_status === 'rejected' ? 'badge-danger' :
                              'badge-warning'
                      )}>
                        {activeViewTalk.upload_status}
                      </span>
                    </div>
                  </div>
                  <div className="glass-3d p-4 rounded-2xl flex flex-col justify-center text-left">
                    <span className="text-[10px] font-black text-muted uppercase tracking-wider mb-1">Uploaded File</span>
                    <span className="text-xs font-bold text-white truncate" title={activeViewTalk.filename || "Unknown"}>
                      {activeViewTalk.filename || "Presentation File"}
                    </span>
                  </div>
                  <div className="glass-3d p-4 rounded-2xl flex flex-col justify-center text-left">
                    <span className="text-[10px] font-black text-muted uppercase tracking-wider mb-1">Date & Time</span>
                    <span className="text-xs font-bold text-[#E8EAFF]">
                      {new Date(activeViewTalk.start_time).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' })}
                      {" "}
                      {new Date(activeViewTalk.start_time).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'Asia/Kolkata' })} IST
                    </span>
                  </div>
                </div>

                {/* Rejection notice if rejected */}
                {activeViewTalk.upload_status === "rejected" && activeViewTalk.rejection_reason && (
                  <div className="flex items-start gap-2.5 px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-left">
                    <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                    <div className="text-xs">
                      <span className="font-black uppercase tracking-wider block mb-0.5">Rejection Reason:</span>
                      <span className="font-bold text-red-300">{activeViewTalk.rejection_reason}</span>
                    </div>
                  </div>
                )}

                {/* Preview Container */}
                <div className="flex-1 min-h-[300px] glass-3d rounded-3xl border border-white/5 overflow-hidden flex flex-col bg-stone-950/40 relative">
                  <div className="absolute top-3 left-3 z-10">
                    <span className="px-2.5 py-1 text-[9px] font-black uppercase tracking-widest bg-black/60 border border-white/10 rounded-full text-white/70 backdrop-blur-sm">
                      Live Preview
                    </span>
                  </div>

                  <div className="flex-1 w-full h-full flex items-center justify-center p-4">
                    {(() => {
                      const lowerFilename = (activeViewTalk.filename || "").toLowerCase();
                      const isPDF = lowerFilename.endsWith(".pdf");
                      const isImage = lowerFilename.endsWith(".png") || lowerFilename.endsWith(".jpg") || lowerFilename.endsWith(".jpeg") || lowerFilename.endsWith(".webp");
                      const isVideo = lowerFilename.endsWith(".mp4") || lowerFilename.endsWith(".mov") || lowerFilename.endsWith(".m4v") || lowerFilename.endsWith(".webm");
                      const isPresentation = lowerFilename.endsWith(".pptx") || lowerFilename.endsWith(".ppt") || lowerFilename.endsWith(".key");

                      if (isPDF && (activeViewTalk.preview_url || activeViewTalk.download_url)) {
                        return (
                          <iframe
                            src={(activeViewTalk.preview_url || activeViewTalk.download_url) ?? undefined}
                            className="w-full h-full rounded-2xl border-none min-h-[320px]"
                          />
                        );
                      } else if (isImage && (activeViewTalk.preview_url || activeViewTalk.download_url)) {
                        return (
                          <img
                            src={(activeViewTalk.preview_url || activeViewTalk.download_url) ?? undefined}
                            alt={activeViewTalk.filename || "Preview"}
                            className="max-w-full max-h-[40vh] object-contain rounded-2xl border border-white/10"
                          />
                        );
                      } else if (isVideo && (activeViewTalk.preview_url || activeViewTalk.download_url)) {
                        return (
                          <video
                            src={(activeViewTalk.preview_url || activeViewTalk.download_url) ?? undefined}
                            controls
                            className="max-w-full max-h-[40vh] rounded-2xl border border-white/10 bg-black"
                          />
                        );
                      } else if (isPresentation && activeViewTalk.thumbnail_url) {
                        return (
                          <div className="flex flex-col items-center gap-4 text-center max-w-md p-4">
                            <img
                              src={activeViewTalk.thumbnail_url}
                              alt="First Slide Preview"
                              className="w-full max-h-[30vh] object-contain rounded-xl border border-white/10 shadow-lg"
                            />
                            <div className="space-y-1">
                              <span className="text-[10px] font-black text-indigo-400 uppercase tracking-widest block bg-indigo-500/10 border border-indigo-500/20 px-2.5 py-1 rounded-full w-fit mx-auto">
                                First Slide Preview
                              </span>
                              <p className="text-xs text-muted font-bold mt-2">
                                Full presentation files are not interactive inside the web browser. Please download the file below to view all slides.
                              </p>
                            </div>
                          </div>
                        );
                      } else if (activeViewTalk.thumbnail_url) {
                        return (
                          <div className="flex flex-col items-center gap-4 text-center max-w-md p-4">
                            <img
                              src={activeViewTalk.thumbnail_url}
                              alt="Preview"
                              className="w-full max-h-[30vh] object-contain rounded-xl border border-white/10"
                            />
                          </div>
                        );
                      } else {
                        return (
                          <div className="flex flex-col items-center gap-3 text-center p-8 max-w-sm">
                            <div className="h-12 w-12 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center text-muted">
                              <Presentation className="h-6 w-6 animate-pulse text-indigo-400" />
                            </div>
                            <h4 className="text-sm font-black uppercase tracking-wider text-white">Preview Generating</h4>
                            <p className="text-xs text-muted font-bold">
                              We are processing your talk file for browser preview. You can still download the original presentation directly.
                            </p>
                          </div>
                        );
                      }
                    })()}
                  </div>
                </div>
              </div>

              {/* Actions Footer */}
              <div className="px-8 py-6 border-t border-white/5 bg-white/[0.02] flex flex-wrap items-center justify-between gap-4">
                {activeViewTalk.download_url ? (
                  <a
                    href={activeViewTalk.download_url}
                    download={activeViewTalk.filename || "presentation"}
                    className="btn-primary px-8 h-12 rounded-full font-black text-[11px] uppercase tracking-widest flex items-center justify-center gap-2"
                  >
                    <Download className="h-4 w-4" /> Download Presentation
                  </a>
                ) : (
                  <div className="text-xs text-muted font-bold">Download URL unavailable</div>
                )}

                <div className="flex items-center gap-4">
                  {isDeadlineLocked ? (
                    <div className="flex items-center gap-2 text-red-400 text-xs font-black uppercase tracking-wider px-4 py-2 bg-red-500/10 border border-red-500/20 rounded-xl">
                      <Lock className="h-4 w-4" /> Submissions Closed
                    </div>
                  ) : (
                    <Link
                      href={`/${eventId}/${token}/upload?slot=${activeViewTalk.session_speaker_id}`}
                      onClick={() => setActiveViewTalk(null)}
                      className="px-6 h-12 rounded-full border border-white/10 hover:border-white/20 text-white font-black text-[11px] uppercase tracking-widest flex items-center justify-center gap-2 transition-all hover:bg-white/5"
                    >
                      Update Presentation
                    </Link>
                  )}
                  <button
                    onClick={() => setActiveViewTalk(null)}
                    className="px-6 h-12 rounded-full border border-white/10 hover:border-white/20 text-muted hover:text-white font-black text-[11px] uppercase tracking-widest transition-all"
                  >
                    Close
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

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
