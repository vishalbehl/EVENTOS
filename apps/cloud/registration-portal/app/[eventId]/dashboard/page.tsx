"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  CheckCircle2, Clock, AlertCircle, XCircle, HelpCircle,
  User, Ticket, Calendar, MapPin, Mail, Phone, Building,
  Briefcase, Globe, Edit3, Save, X, ExternalLink,
  ChevronRight, Loader2, LogOut, Megaphone, ArrowLeft, ArrowRight,
  Check, FileText, Share2, Download, Award, Linkedin, Send, Sparkles, Map, Users, Crop,
  Image as ImageIcon
} from "lucide-react";
import { toast } from "sonner";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { fetchCountryStates, getAllowedCountries, getStatesForCountry, CountryStateEntry } from "@/lib/country-states";


const countryCodes = [
  { code: "+91", iso: "IN", name: "India" },
  { code: "+1", iso: "US/CA", name: "United States / Canada" },
  { code: "+44", iso: "GB", name: "United Kingdom" },
  { code: "+61", iso: "AU", name: "Australia" },
  { code: "+64", iso: "NZ", name: "New Zealand" },
  { code: "+65", iso: "SG", name: "Singapore" },
  { code: "+971", iso: "AE", name: "United Arab Emirates" },
  { code: "+49", iso: "DE", name: "Germany" },
  { code: "+33", iso: "FR", name: "France" },
  { code: "+39", iso: "IT", name: "Italy" },
  { code: "+34", iso: "ES", name: "Spain" },
  { code: "+81", iso: "JP", name: "Japan" },
  { code: "+86", iso: "CN", name: "China" },
  { code: "+82", iso: "KR", name: "South Korea" },
  { code: "+92", iso: "PK", name: "Pakistan" },
  { code: "+880", iso: "BD", name: "Bangladesh" },
  { code: "+94", iso: "LK", name: "Sri Lanka" },
  { code: "+977", iso: "NP", name: "Nepal" },
  { code: "+353", iso: "IE", name: "Ireland" },
  { code: "+31", iso: "NL", name: "Netherlands" },
  { code: "+41", iso: "CH", name: "Switzerland" },
  { code: "+60", iso: "MY", name: "Malaysia" },
  { code: "+66", iso: "TH", name: "Thailand" },
  { code: "+62", iso: "ID", name: "Indonesia" },
  { code: "+63", iso: "PH", name: "Philippines" },
  { code: "+27", iso: "ZA", name: "South Africa" },
  { code: "+55", iso: "BR", name: "Brazil" },
  { code: "+52", iso: "MX", name: "Mexico" },
  { code: "+966", iso: "SA", name: "Saudi Arabia" },
  { code: "+90", iso: "TR", name: "Turkey" },
  { code: "+20", iso: "EG", name: "Egypt" },
  { code: "+234", iso: "NG", name: "Nigeria" },
  { code: "+254", iso: "KE", name: "Kenya" },
  { code: "+32", iso: "BE", name: "Belgium" },
  { code: "+43", iso: "AT", name: "Austria" },
  { code: "+45", iso: "DK", name: "Denmark" },
  { code: "+46", iso: "SE", name: "Sweden" },
  { code: "+47", iso: "NO", name: "Norway" },
  { code: "+48", iso: "PL", name: "Poland" },
  { code: "+973", iso: "BH", name: "Bahrain" },
  { code: "+965", iso: "KW", name: "Kuwait" },
  { code: "+968", iso: "OM", name: "Oman" },
  { code: "+974", iso: "QA", name: "Qatar" },
  { code: "+351", iso: "PT", name: "Portugal" },
  { code: "+30", iso: "GR", name: "Greece" },
  { code: "+358", iso: "FI", name: "Finland" },
  { code: "+352", iso: "LU", name: "Luxembourg" },
  { code: "+7", iso: "RU/KZ", name: "Russia / Kazakhstan" },
].sort((a, b) => {
  if (a.code === "+91") return -1;
  if (b.code === "+91") return 1;
  if (a.code === "+1") return -1;
  if (b.code === "+1") return 1;
  return a.iso.localeCompare(b.iso);
});

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";

interface EventInfo { name: string; start_date: string | null; end_date: string | null; venue: string; support_email: string; announcements: string; program_url: string; theme_color?: string; faqs?: any[]; }
interface RegistrationInfo { status: string; registration_id: string | null; submitted_at: string | null; waitlist_position: number | null; rejection_reason: string | null; }
interface ParticipantInfo { regno: string; name: string; first_name?: string; last_name?: string; email: string; phone: string; company: string; designation: string; country: string; role: string; paid_status: string; custom_fields: Record<string, unknown>; registered_at: string | null; }
interface PaymentInfo { status: string; amount: number; currency: string; payment_method: string; transaction_id: string; created_at: string; gateway_payment_id: string | null; discount_applied: number; }
interface DashboardData { event: EventInfo; registration: RegistrationInfo; participant: ParticipantInfo | null; payment: PaymentInfo | null; edits_locked: boolean; is_speaker: boolean; speaker_portal_url: string; }

function fmtDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" });
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string; icon: React.ReactNode }> = {
    approved: { label: "Approved", cls: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20", icon: <CheckCircle2 className="h-3.5 w-3.5" /> },
    submitted: { label: "Submitted", cls: "bg-indigo-500/10 text-indigo-400 border-indigo-500/20", icon: <Clock className="h-3.5 w-3.5" /> },
    pending_review: { label: "Under Review", cls: "bg-amber-500/10 text-amber-400 border-amber-500/20", icon: <Clock className="h-3.5 w-3.5" /> },
    waitlisted: { label: "Waitlisted", cls: "bg-purple-500/10 text-purple-400 border-purple-500/20", icon: <HelpCircle className="h-3.5 w-3.5" /> },
    rejected: { label: "Not Approved", cls: "bg-rose-500/10 text-rose-400 border-rose-500/20", icon: <XCircle className="h-3.5 w-3.5" /> },
    not_registered: { label: "Not Registered", cls: "bg-white/5 text-[var(--muted)] border-white/10", icon: <HelpCircle className="h-3.5 w-3.5" /> },
    closed: { label: "Closed", cls: "bg-white/5 text-[var(--muted)] border-white/10", icon: <XCircle className="h-3.5 w-3.5" /> },
  };
  const s = map[status] ?? map["not_registered"];
  return (
    <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-wider border ${s.cls}`}>
      {s.icon}{s.label}
    </span>
  );
}

function QRCode({ value }: { value: string }) {
  return (
    <img
      src={`https://api.qrserver.com/v1/create-qr-code/?size=180x180&bgcolor=0F1228&color=6366F1&data=${encodeURIComponent(value)}`}
      alt={`QR code for ${value}`}
      className="w-36 h-36 rounded-2xl border border-white/10 shadow-lg"
    />
  );
}

function Section({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
      className="glass-card rounded-[2rem] overflow-hidden">
      <div className="flex items-center gap-3 px-6 py-4 border-b border-white/5">
        <span className="text-indigo-400">{icon}</span>
        <h2 className="text-[10px] font-black text-[var(--muted)] uppercase tracking-[0.2em]">{title}</h2>
      </div>
      <div className="p-6">{children}</div>
    </motion.div>
  );
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <p className="text-[9px] font-black text-[var(--muted)] uppercase tracking-widest mb-0.5">{label}</p>
      <p className="text-sm text-[#E8EAFF] font-semibold">{value || "—"}</p>
    </div>
  );
}

export default function PortalDashboardPage() {
  const { eventId } = useParams<{ eventId: string }>();
  const router = useRouter();

  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [bannerDismissed, setBannerDismissed] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState<Partial<ParticipantInfo>>({});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [tcModalOpen, setTcModalOpen] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [chatMessages, setChatMessages] = useState<Array<{ sender: "user" | "bot"; text: string }>>([
    { sender: "bot", text: "Hello! Welcome to EventOS support. How can I help you today?" }
  ]);
  const [chatInput, setChatInput] = useState("");
  const [connectedStates, setConnectedStates] = useState<Record<number, boolean>>({});
  const [faqOpenIndex, setFaqOpenIndex] = useState<number | null>(null);
  const [countdown, setCountdown] = useState({ days: 0, hours: 0, minutes: 0, seconds: 0 });
  const [countryStates, setCountryStates] = useState<CountryStateEntry[]>([]);

  useEffect(() => {
    fetchCountryStates().then(setCountryStates);
  }, []);

  const [activeTab, setActiveTab] = useState<"ticket" | "profile">("ticket");
  const [expandedAnnouncements, setExpandedAnnouncements] = useState<Record<string, boolean>>({});
  const [pdfViewerUrl, setPdfViewerUrl] = useState<string | null>(null);
  const [pdfViewerTitle, setPdfViewerTitle] = useState<string>("");
  const [lightboxImageUrl, setLightboxImageUrl] = useState<string | null>(null);
  const [lightboxTitle, setLightboxTitle] = useState<string>("");

  const [verifyingEmailChange, setVerifyingEmailChange] = useState(false);
  const [otpInput, setOtpInput] = useState("");
  const [otpError, setOtpError] = useState<string | null>(null);
  const [otpSending, setOtpSending] = useState(false);

  const [formConfig, setFormConfig] = useState<any>(null);
  const [promoCode, setPromoCode] = useState("");
  const [validatingPromo, setValidatingPromo] = useState(false);
  const [appliedPromo, setAppliedPromo] = useState<{
    code: string;
    discount_amount: number;
    total_price: number;
  } | null>(null);
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [checkoutSubmitting, setCheckoutSubmitting] = useState(false);
  const [verifyingPayment, setVerifyingPayment] = useState(false);
  const [checkoutStep, setCheckoutStep] = useState<"init" | "confirm">("init");
  const [showPaymentSuccess, setShowPaymentSuccess] = useState(false);
  const [successCountdown, setSuccessCountdown] = useState(10);

  const tempEvent = data?.event;
  const tempRegistration = data?.registration;
  const tempParticipant = data?.participant;
  const tempPayment = data?.payment;
  const tempEditsLocked = data?.edits_locked;
  const tempIsSpeaker = data?.is_speaker;
  const tempSpeakerPortalUrl = data?.speaker_portal_url;

  // Calculate missing profile items & percent based ONLY on active required form fields
  const profileCompletion = (() => {
    if (!tempParticipant) return { percent: 0, missing: [] };

    const missing: string[] = [];
    let requiredCount = 0;
    let filledCount = 0;

    // If formConfig fields are loaded, check them. Otherwise check standard registration fields.
    if (formConfig?.fields && formConfig.fields.length > 0) {
      formConfig.fields.forEach((field: any) => {
        if (field.is_active && field.is_required) {
          requiredCount++;
          let val: any = null;
          if (field.is_default) {
            val = (tempParticipant as any)[field.name];
          } else {
            val = (tempParticipant.custom_fields as any)?.[field.name];
          }
          if (val && String(val).trim() !== "") {
            filledCount++;
          } else {
            missing.push(field.label);
          }
        }
      });
    } else {
      // Fallback check standard required fields
      const standardFields = [
        { name: "name", label: "Full Name" },
        { name: "email", label: "Email Address" },
        { name: "phone", label: "Phone Number" }
      ];
      standardFields.forEach(f => {
        requiredCount++;
        const val = (tempParticipant as any)[f.name];
        if (val && String(val).trim() !== "") {
          filledCount++;
        } else {
          missing.push(f.label);
        }
      });
    }

    const percent = requiredCount > 0 ? Math.round((filledCount / requiredCount) * 100) : 100;
    return { percent, missing };
  })();
  const profileCompletionPercent = profileCompletion.percent;
  const missingProfileItems = profileCompletion.missing;

  // Announcements List formatting and sorting
  const announcementsList = (() => {
    if (!tempEvent) return [];
    let list: any[] = [];
    if (tempEvent.announcements) {
      if (Array.isArray(tempEvent.announcements)) {
        list = [...tempEvent.announcements];
      } else if (typeof tempEvent.announcements === "string") {
        try {
          const parsed = JSON.parse(tempEvent.announcements);
          if (Array.isArray(parsed)) {
            list = parsed;
          } else {
            list = [{ message: tempEvent.announcements, type: "info" }];
          }
        } catch {
          list = [{ message: tempEvent.announcements, type: "info" }];
        }
      }
    }

    // Dynamic warning announcement for missing required fields (Auto-announcement feature)
    if (missingProfileItems.length > 0) {
      list.unshift({
        id: "missing-fields-alert",
        message: `Action Required: New details are needed to complete your registration. Please fill in the following pending field(s): ${missingProfileItems.join(", ")}.`,
        type: "warning",
        created_at: new Date().toISOString()
      });
    }

    // Sort announcements by created_at descending (newest on top)
    list.sort((a, b) => {
      const timeA = a.created_at ? new Date(a.created_at).getTime() : 0;
      const timeB = b.created_at ? new Date(b.created_at).getTime() : 0;
      if (timeA && timeB) return timeB - timeA;
      const idA = typeof a.id === "number" ? a.id : 0;
      const idB = typeof b.id === "number" ? b.id : 0;
      if (idA && idB) return idB - idA;
      return 0;
    });

    return list;
  })();

  useEffect(() => {
    if (announcementsList && announcementsList.length > 0) {
      const firstId = announcementsList[0].id || "0";
      setExpandedAnnouncements(prev => {
        if (Object.keys(prev).length === 0) {
          return { [firstId]: true };
        }
        return prev;
      });
    }
  }, [announcementsList]);


  const handleAttachmentClick = async (att: any) => {
    if (att.type === "link") {
      window.open(att.url, "_blank", "noopener,noreferrer");
      return;
    }

    if (att.type === "file" && att.storage_path) {
      const filename = att.name || "";
      const ext = filename.split(".").pop()?.toLowerCase() || "";
      const toastId = toast.loading("Opening attachment...");
      try {
        const res = await fetch(`${API_BASE}/api/v1/portal/announcements/signed-url?storage_path=${encodeURIComponent(att.storage_path)}`);
        if (!res.ok) throw new Error("Failed to get file URL");
        const d = await res.json();
        toast.dismiss(toastId);

        if (ext === "pdf") {
          setPdfViewerUrl(d.url);
          setPdfViewerTitle(att.name);
        } else if (["png", "jpg", "jpeg", "webp", "gif"].includes(ext)) {
          setLightboxImageUrl(d.url);
          setLightboxTitle(att.name);
        } else {
          window.open(d.url, "_blank");
        }
      } catch (err: any) {
        toast.error(err.message || "Failed to load attachment.", { id: toastId });
      }
    }
  };

  const getAttachmentIcon = (att: any) => {
    if (att.type === "link") {
      const url = att.url || "";
      if (url.includes("drive.google.com") || url.includes("docs.google.com")) {
        return (
          <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="none">
            <path d="M7.784 14.417L14.773 2.25H9.227L2.239 14.417h5.545z" fill="#0066DA" />
            <path d="M16.216 14.417L9.227 26.583h5.546L21.76 14.417H16.216z" fill="#00A859" />
            <path d="M20.625 22.083L13.636 9.917h5.546l6.989 12.166H20.625z" fill="#FFCC00" />
          </svg>
        );
      }
      if (url.includes("onedrive") || url.includes("sharepoint.com") || url.includes("live.com")) {
        return (
          <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="none">
            <path d="M19.35 10.04C18.67 6.59 15.64 4 12 4 9.11 4 6.6 5.64 5.35 8.04 2.34 8.36 0 10.91 0 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96z" fill="#0078D4" />
          </svg>
        );
      }
      if (url.includes("dropbox.com")) {
        return (
          <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="#0061FE">
            <path d="M6 2L1 5.3L6 8.7L11 5.3L6 2Z" />
            <path d="M18 2L13 5.3L18 8.7L23 5.3L18 2Z" />
            <path d="M1 11.7L6 15L11 11.7L6 8.3L1 11.7Z" />
            <path d="M23 11.7L18 15L13 11.7L18 8.3L23 11.7Z" />
            <path d="M6 16.3V21.3L11 18V13L6 16.3Z" />
            <path d="M18 16.3V21.3L13 18V13L18 16.3Z" />
          </svg>
        );
      }
      return <ExternalLink className="h-4 w-4 text-indigo-400 shrink-0" />;
    }

    const filename = att.name || "";
    const ext = filename.split(".").pop()?.toLowerCase() || "";
    if (ext === "pdf") {
      return <FileText className="h-4 w-4 text-rose-400 shrink-0" />;
    }
    if (["png", "jpg", "jpeg", "webp", "gif"].includes(ext)) {
      return <ImageIcon className="h-4 w-4 text-emerald-400 shrink-0" />;
    }
    if (["docx", "doc"].includes(ext)) {
      return <FileText className="h-4 w-4 text-blue-400 shrink-0" />;
    }
    if (["xlsx", "xls", "csv"].includes(ext)) {
      return <FileText className="h-4 w-4 text-emerald-500 shrink-0" />;
    }
    return <FileText className="h-4 w-4 text-indigo-400 shrink-0" />;
  };

  // Image Editor States
  const [imageEditorOpen, setImageEditorOpen] = useState(false);
  const [imageToEdit, setImageToEdit] = useState<string | null>(null);
  const [editingFieldId, setEditingFieldId] = useState<string | null>(null);
  const [originalFileName, setOriginalFileName] = useState<string>("");
  const [cropPercent, setCropPercent] = useState({ x: 0, y: 0, w: 1, h: 1 });
  const [imgSize, setImgSize] = useState({ width: 0, height: 0 });
  const [cropAspect, setCropAspect] = useState<"1:1" | "4:3" | "16:9" | "free">("1:1");
  const [cropShape, setCropShape] = useState<"rect" | "circle">("rect");
  const [filterBrightness, setFilterBrightness] = useState(100);
  const [filterContrast, setFilterContrast] = useState(100);
  const cropperDragRef = useRef<any>(null);

  const applyAspectToCrop = (ratioStr: "1:1" | "4:3" | "16:9" | "free", currentImgWidth = imgSize.width, currentImgHeight = imgSize.height) => {
    if (ratioStr === "free") {
      setCropPercent({ x: 0, y: 0, w: 1, h: 1 });
      return;
    }
    const R = ratioStr === "1:1" ? 1.0 : ratioStr === "4:3" ? 4 / 3 : 16 / 9;
    const imgWidth = currentImgWidth || 300;
    const imgHeight = currentImgHeight || 300;
    const imgRatio = imgWidth / imgHeight;

    let w = 1.0;
    let h = 1.0;

    if (imgRatio > R) {
      h = 1.0;
      w = R / imgRatio;
    } else {
      w = 1.0;
      h = imgRatio / R;
    }

    const x = (1.0 - w) / 2;
    const y = (1.0 - h) / 2;
    setCropPercent({ x, y, w, h });
  };

  const handleSelectAspect = (ratio: "1:1" | "4:3" | "16:9" | "free") => {
    setCropAspect(ratio);
    if (ratio !== "1:1") setCropShape("rect");
    applyAspectToCrop(ratio);
  };

  const handleImageLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget;
    const measuredWidth = img.clientWidth;
    const measuredHeight = img.clientHeight;
    setImgSize({ width: measuredWidth, height: measuredHeight });
    applyAspectToCrop(cropAspect, measuredWidth, measuredHeight);
  };

  const handleMouseDownMove = (e: React.MouseEvent) => {
    e.stopPropagation();
    cropperDragRef.current = {
      type: "move",
      startX: e.clientX,
      startY: e.clientY,
      startCropX: cropPercent.x,
      startCropY: cropPercent.y,
      startCropW: cropPercent.w,
      startCropH: cropPercent.h
    };
  };

  const handleMouseDownResize = (e: React.MouseEvent, handle: "tl" | "tr" | "bl" | "br" | "t" | "b" | "l" | "r") => {
    e.stopPropagation();
    cropperDragRef.current = {
      type: "resize",
      handle,
      startX: e.clientX,
      startY: e.clientY,
      startCropX: cropPercent.x,
      startCropY: cropPercent.y,
      startCropW: cropPercent.w,
      startCropH: cropPercent.h
    };
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!cropperDragRef.current || imgSize.width === 0 || imgSize.height === 0) return;

    const drag = cropperDragRef.current;
    const dx = e.clientX - drag.startX;
    const dy = e.clientY - drag.startY;
    const ndx = dx / imgSize.width;
    const ndy = dy / imgSize.height;

    if (drag.type === "move") {
      let newX = drag.startCropX + ndx;
      let newY = drag.startCropY + ndy;
      newX = Math.max(0, Math.min(1 - drag.startCropW, newX));
      newY = Math.max(0, Math.min(1 - drag.startCropH, newY));
      setCropPercent(prev => ({ ...prev, x: newX, y: newY }));
    } else if (drag.type === "resize") {
      const handle = drag.handle;
      const sX = drag.startCropX;
      const sY = drag.startCropY;
      const sW = drag.startCropW;
      const sH = drag.startCropH;

      const getAspectNum = (ratio: "1:1" | "4:3" | "16:9" | "free") => {
        if (ratio === "1:1") return 1.0;
        if (ratio === "4:3") return 4 / 3;
        if (ratio === "16:9") return 16 / 9;
        return null;
      };

      const R = getAspectNum(cropAspect);

      if (R !== null) {
        if (handle === "br") {
          let newW = sW + ndx;
          newW = Math.min(1 - sX, Math.max(0.05, newW));
          let newH = (newW * imgSize.width) / (imgSize.height * R);
          if (sY + newH > 1.0) {
            newH = 1.0 - sY;
            newW = (newH * imgSize.height * R) / imgSize.width;
          }
          setCropPercent({ x: sX, y: sY, w: newW, h: newH });
        } else if (handle === "tr") {
          let newW = sW + ndx;
          newW = Math.min(1 - sX, Math.max(0.05, newW));
          let newH = (newW * imgSize.width) / (imgSize.height * R);
          if (sY + sH - newH < 0) {
            newH = sY + sH;
            newW = (newH * imgSize.height * R) / imgSize.width;
          }
          const newY = sY + sH - newH;
          setCropPercent({ x: sX, y: newY, w: newW, h: newH });
        } else if (handle === "bl") {
          let newW = sW - ndx;
          newW = Math.min(sX + sW, Math.max(0.05, newW));
          let newH = (newW * imgSize.width) / (imgSize.height * R);
          if (sY + newH > 1.0) {
            newH = 1.0 - sY;
            newW = (newH * imgSize.height * R) / imgSize.width;
          }
          const newX = sX + sW - newW;
          setCropPercent({ x: newX, y: sY, w: newW, h: newH });
        } else if (handle === "tl") {
          let newW = sW - ndx;
          newW = Math.min(sX + sW, Math.max(0.05, newW));
          let newH = (newW * imgSize.width) / (imgSize.height * R);
          if (sY + sH - newH < 0) {
            newH = sY + sH;
            newW = (newH * imgSize.height * R) / imgSize.width;
          }
          const newX = sX + sW - newW;
          const newY = sY + sH - newH;
          setCropPercent({ x: newX, y: newY, w: newW, h: newH });
        }
      } else {
        let newX = sX;
        let newY = sY;
        let newW = sW;
        let newH = sH;

        if (handle === "tl") {
          newX = Math.max(0, Math.min(sX + sW - 0.05, sX + ndx));
          newW = sX + sW - newX;
          newY = Math.max(0, Math.min(sY + sH - 0.05, sY + ndy));
          newH = sY + sH - newY;
        } else if (handle === "tr") {
          newW = Math.max(0.05, Math.min(1 - sX, sW + ndx));
          newY = Math.max(0, Math.min(sY + sH - 0.05, sY + ndy));
          newH = sY + sH - newY;
        } else if (handle === "bl") {
          newX = Math.max(0, Math.min(sX + sW - 0.05, sX + ndx));
          newW = sX + sW - newX;
          newH = Math.max(0.05, Math.min(1 - sY, sH + ndy));
        } else if (handle === "br") {
          newW = Math.max(0.05, Math.min(1 - sX, sW + ndx));
          newH = Math.max(0.05, Math.min(1 - sY, sH + ndy));
        } else if (handle === "t") {
          newY = Math.max(0, Math.min(sY + sH - 0.05, sY + ndy));
          newH = sY + sH - newY;
        } else if (handle === "b") {
          newH = Math.max(0.05, Math.min(1 - sY, sH + ndy));
        } else if (handle === "l") {
          newX = Math.max(0, Math.min(sX + sW - 0.05, sX + ndx));
          newW = sX + sW - newX;
        } else if (handle === "r") {
          newW = Math.max(0.05, Math.min(1 - sX, sW + ndx));
        }
        setCropPercent({ x: newX, y: newY, w: newW, h: newH });
      }
    }
  };

  const handleMouseUp = () => {
    cropperDragRef.current = null;
  };

  const dataURLtoFile = (dataurl: string, filename: string): File => {
    const arr = dataurl.split(',');
    const mime = arr[0].match(/:(.*?);/)?.[1] || 'image/png';
    const bstr = atob(arr[1]);
    let n = bstr.length;
    const u8arr = new Uint8Array(n);
    while (n--) {
      u8arr[n] = bstr.charCodeAt(n);
    }
    return new File([u8arr], filename, { type: mime });
  };

  const executeFileUpload = async (fieldId: string, file: File) => {
    const field = formConfig?.fields?.find((f: any) => f.id === fieldId) || { label: fieldId, name: fieldId };
    const fieldName = field.name || fieldId;
    const toastId = toast.loading(`Uploading ${field.label.toLowerCase()}...`);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("field_name", field.label);
      if (data?.participant?.regno) {
        fd.append("regno", data.participant.regno);
      }
      if (data?.participant?.name) {
        fd.append("username", data.participant.name);
      }
      const res = await fetch(`${API_BASE}/api/v1/portal/registration/${eventId}/upload`, {
        method: "POST",
        body: fd,
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.detail || "Upload failed");

      setEditForm((prev: any) => ({
        ...prev,
        custom_fields: {
          ...(prev.custom_fields || {}),
          [fieldName]: d.url
        }
      }));
      toast.success(`${field.label} uploaded!`, { id: toastId });
    } catch (err: any) {
      toast.error(err.message || "Failed to upload file.", { id: toastId });
    }
  };

  const handleCropSubmit = () => {
    if (!imageToEdit) return;
    const img = new Image();
    img.onload = async () => {
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      const sx = cropPercent.x * img.width;
      const sy = cropPercent.y * img.height;
      const sw = cropPercent.w * img.width;
      const sh = cropPercent.h * img.height;

      canvas.width = sw;
      canvas.height = sh;

      ctx.fillStyle = "rgba(0,0,0,0)";
      ctx.fillRect(0, 0, sw, sh);

      if (cropShape === "circle" && cropAspect === "1:1") {
        ctx.beginPath();
        ctx.arc(sw / 2, sh / 2, sw / 2, 0, Math.PI * 2);
        ctx.clip();
      }

      ctx.filter = `brightness(${filterBrightness}%) contrast(${filterContrast}%)`;
      ctx.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);

      const croppedUrl = canvas.toDataURL("image/png");
      const croppedFile = dataURLtoFile(croppedUrl, originalFileName || "profile.png");

      setImageEditorOpen(false);
      setImageToEdit(null);

      if (editingFieldId) {
        await executeFileUpload(editingFieldId, croppedFile);
      }
    };
    img.src = imageToEdit;
  };


  const handleSendChatMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim()) return;
    const msg = chatInput.trim();
    setChatMessages(prev => [...prev, { sender: "user", text: msg }]);
    setChatInput("");
    setTimeout(() => {
      setChatMessages(prev => [...prev, {
        sender: "bot",
        text: "Thank you for contacting organizer support. We have received your query and will reply shortly!"
      }]);
    }, 1000);
  };

  const token = typeof window !== "undefined" ? localStorage.getItem(`portal_token_${eventId}`) : null;

  const fetchDashboard = useCallback(async () => {
    if (!token) { router.push(`/${eventId}/login`); return; }
    try {
      const res = await fetch(`${API_BASE}/api/v1/portal/dashboard`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.status === 401) { localStorage.removeItem(`portal_token_${eventId}`); router.push(`/${eventId}/login`); return; }
      setData(await res.json());
    } catch { /* show loading state */ }
    finally { setLoading(false); }
  }, [token, eventId, router]);

  useEffect(() => { fetchDashboard(); }, [fetchDashboard]);

  useEffect(() => {
    if (!data?.event?.start_date) return;
    const start = new Date(data.event.start_date).getTime();
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
  }, [data?.event?.start_date]);


  useEffect(() => {
    if (!showPaymentSuccess) return;
    setSuccessCountdown(10);
    const timer = setInterval(() => {
      setSuccessCountdown(prev => {
        if (prev <= 1) {
          clearInterval(timer);
          setShowPaymentSuccess(false);
          setCheckoutStep("init");
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [showPaymentSuccess]);

  useEffect(() => {
    const shouldBlock = editing || tcModalOpen || !!pdfViewerUrl || !!lightboxImageUrl;
    if (shouldBlock) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [editing, tcModalOpen, pdfViewerUrl, lightboxImageUrl]);

  useEffect(() => {
    const fetchFormConfig = async () => {
      try {
        const res = await fetch(`${API_BASE}/api/v1/portal/registration/${eventId}/form`);
        if (res.ok) {
          setFormConfig(await res.json());
        }
      } catch (err) {
        console.error("Failed to fetch form config on dashboard:", err);
      }
    };
    if (eventId) fetchFormConfig();
  }, [eventId]);

  const verifyRedirectPayment = async (sessionId: string) => {
    setVerifyingPayment(true);
    try {
      const gateway = sessionId.startsWith("sim_") ? "simulated" : "stripe";
      const res = await fetch(`${API_BASE}/api/v1/portal/registration/${eventId}/payment/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          gateway,
          session_id: sessionId
        })
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.detail || "Payment verification failed.");
      toast.success("Payment verified successfully!");
      router.replace(`/${eventId}/dashboard`);
      await fetchDashboard();
      setShowPaymentSuccess(true);
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || "Failed to verify payment.");
    } finally {
      setVerifyingPayment(false);
    }
  };

  useEffect(() => {
    if (!eventId) return;
    const queryParams = new URLSearchParams(window.location.search);
    const statusParam = queryParams.get("status");
    const sessionId = queryParams.get("session_id");

    if (statusParam === "success" && sessionId) {
      verifyRedirectPayment(sessionId);
    }
  }, [eventId]);

  const getTicketBasePrice = () => {
    const role = data?.participant?.role || "";
    if (!formConfig?.payment_enabled || !formConfig?.active_prices) return 0;
    return formConfig.active_prices[role] || 0;
  };

  const getTicketPrice = () => {
    const base = getTicketBasePrice();
    if (appliedPromo) {
      return appliedPromo.total_price;
    }
    return base;
  };

  const handlePromoApply = async () => {
    const role = data?.participant?.role || "";
    if (!promoCode.trim()) return;
    setValidatingPromo(true);
    try {
      const res = await fetch(`${API_BASE}/api/v1/portal/registration/${eventId}/promo/validate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: promoCode,
          role: role
        })
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.detail || "Invalid promo code.");
      setAppliedPromo({
        code: d.code,
        discount_amount: d.discount_amount,
        total_price: d.total_price
      });
      toast.success(`Promo code applied! Saved ${formConfig?.currency || "INR"} ${d.discount_amount}`);
    } catch (err: any) {
      toast.error(err.message || "Failed to apply promo code.");
      setAppliedPromo(null);
    } finally {
      setValidatingPromo(false);
    }
  };

  const handleRazorpayDashboardPayment = async (details: any) => {
    const loadRazorpay = () => {
      return new Promise((resolve) => {
        const script = document.createElement("script");
        script.src = "https://checkout.razorpay.com/v1/checkout.js";
        script.onload = () => resolve(true);
        script.onerror = () => resolve(false);
        document.body.appendChild(script);
      });
    };

    const loaded = await loadRazorpay();
    if (!loaded) {
      toast.error("Razorpay SDK failed to load. Please try again.");
      return;
    }

    const options = {
      key: details.key_id,
      amount: details.amount,
      currency: details.currency,
      name: data?.event?.name || "Event Registration",
      description: `Registration Payment for ${data?.participant?.role}`,
      order_id: details.gateway_order_id,
      handler: async function (response: any) {
        setCheckoutSubmitting(true);
        try {
          const verifyRes = await fetch(`${API_BASE}/api/v1/portal/registration/${eventId}/payment/verify`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              gateway: "razorpay",
              razorpay_order_id: response.razorpay_order_id,
              razorpay_payment_id: response.razorpay_payment_id,
              razorpay_signature: response.razorpay_signature
            })
          });
          const verifyData = await verifyRes.json();
          if (!verifyRes.ok) throw new Error(verifyData.detail || "Payment verification failed.");
          toast.success("Payment completed and verified successfully!");
          await fetchDashboard();
          setShowPaymentSuccess(true);
        } catch (err: any) {
          toast.error(err.message || "Failed to verify Razorpay payment.");
        } finally {
          setCheckoutSubmitting(false);
        }
      },
      prefill: {
        name: data?.participant?.name || `${data?.participant?.first_name || ""} ${data?.participant?.last_name || ""}`.trim() || "",
        email: data?.participant?.email || "",
        contact: data?.participant?.phone || ""
      },
      theme: {
        color: data?.event?.theme_color || "#6366F1"
      },
      modal: {
        ondismiss: function () {
          setCheckoutSubmitting(false);
        }
      }
    };

    const rzp = new (window as any).Razorpay(options);
    rzp.open();
  };

  const handleCheckoutSubmit = async () => {
    if (!token || !data?.participant) return;
    if (!agreedToTerms) {
      toast.error("Please accept the Terms & Conditions to proceed.");
      return;
    }
    setCheckoutSubmitting(true);
    try {
      const res = await fetch(`${API_BASE}/api/v1/portal/attendee/payment/checkout`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          promo_code: appliedPromo ? appliedPromo.code : null,
          redirect_base_url: window.location.origin + `/${eventId}/dashboard`
        })
      });
      const checkoutData = await res.json();
      if (!res.ok) throw new Error(checkoutData.detail || "Checkout failed.");

      if (checkoutData.checkout_required) {
        const { provider, checkout_url } = checkoutData.payment_details;
        if (provider === "stripe" || provider === "simulated") {
          toast.loading("Redirecting to payment gateway...");
          window.location.href = checkout_url;
        } else if (provider === "razorpay") {
          await handleRazorpayDashboardPayment(checkoutData.payment_details);
        }
      } else {
        toast.success("Payment completed successfully!");
        await fetchDashboard();
        setShowPaymentSuccess(true);
      }
    } catch (err: any) {
      toast.error(err.message || "Payment checkout failed.");
    } finally {
      setCheckoutSubmitting(false);
    }
  };

  const startEdit = () => {
    if (!data?.participant) return;
    setEditForm({
      name: data.participant.name,
      first_name: data.participant.first_name,
      last_name: data.participant.last_name,
      email: data.participant.email,
      phone: data.participant.phone,
      company: data.participant.company,
      designation: data.participant.designation,
      country: data.participant.country,
      custom_fields: data.participant.custom_fields || {}
    });
    setSaveError(null); setEditing(true);
  };

  const saveEdit = async () => {
    if (!token || !data?.participant) return;
    setSaving(true); setSaveError(null);

    // Country & State validation
    const countryField = formConfig?.fields?.find((field: any) => field.name === "country" || field.id === "country");
    if (countryField?.is_required) {
      if (!editForm.country || !editForm.country.trim()) {
        setSaveError("Country is required.");
        setSaving(false);
        return;
      }
      const selectedCountry = editForm.country || "";
      const states = getStatesForCountry(countryStates, selectedCountry);
      const stateVal = (editForm.custom_fields as any)?.["country_state"] || "";
      if (states.length > 0 && (!stateVal || !stateVal.trim())) {
        setSaveError("State/Province is required.");
        setSaving(false);
        return;
      }
    }

    if (editForm.phone) {
      let foundCc = "";
      for (const cc of countryCodes) {
        if (editForm.phone.startsWith(cc.code)) {
          foundCc = cc.code;
          break;
        }
      }
      const numPart = foundCc ? editForm.phone.slice(foundCc.length) : editForm.phone;
      if (numPart.length < 7 || numPart.length > 15 || !/^\d+$/.test(numPart)) {
        setSaveError("Phone number must contain numbers only and be between 7 and 15 digits.");
        setSaving(false);
        return;
      }
    }

    const emailChanged = editForm.email && editForm.email.toLowerCase() !== data.participant.email.toLowerCase();
    const isRegistered = ["submitted", "pending_review", "approved", "waitlisted", "rejected"].includes(data?.registration?.status || "");

    if (emailChanged) {
      if (isRegistered) {
        setSaveError("Email address cannot be changed after registration.");
        setSaving(false);
        return;
      }
      setOtpSending(true);
      try {
        const res = await fetch(`${API_BASE}/api/v1/portal/attendee/request-email-update`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ new_email: editForm.email })
        });
        if (!res.ok) {
          const d = await res.json();
          setSaveError(d.detail || "Failed to send email verification OTP.");
          setSaving(false);
          return;
        }
        setVerifyingEmailChange(true);
        setOtpInput("");
        setOtpError(null);
      } catch {
        setSaveError("Network error. Please try again.");
        setSaving(false);
      } finally {
        setOtpSending(false);
      }
    } else {
      await applyDetailsUpdate({});
    }
  };

  const applyDetailsUpdate = async (extraParams: { new_email?: string; otp?: string }) => {
    if (!token) return;
    setSaving(true);
    try {
      const payload = {
        name: editForm.name || `${editForm.first_name || ""} ${editForm.last_name || ""}`.trim() || "",
        first_name: editForm.first_name,
        last_name: editForm.last_name,
        phone: editForm.phone,
        company: editForm.company,
        designation: editForm.designation,
        country: editForm.country,
        custom_fields: editForm.custom_fields || {},
        ...extraParams
      };
      const res = await fetch(`${API_BASE}/api/v1/portal/attendee/details`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(payload),
      });
      if (res.status === 403) { setSaveError("Edits are locked for this event."); setSaving(false); return; }
      if (!res.ok) {
        const d = await res.json();
        if (extraParams.otp) {
          setOtpError(d.detail || "Verification failed.");
        } else {
          setSaveError(d.detail || "Save failed.");
        }
        setSaving(false);
        return;
      }

      const resData = await res.json();
      if (resData.new_token) {
        localStorage.setItem(`portal_token_${eventId}`, resData.new_token);
      }

      setVerifyingEmailChange(false);
      setEditing(false);
      await fetchDashboard();
    } catch {
      setSaveError("Network error. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const downloadTicketJPG = (regno: string, name: string, role: string, eventName: string) => {
    try {
      const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=250x250&bgcolor=FFFFFF&color=000000&data=${encodeURIComponent(regno)}`;

      const canvas = document.createElement("canvas");
      canvas.width = 400;
      canvas.height = 500;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      // Draw background
      ctx.fillStyle = "#FFFFFF";
      ctx.fillRect(0, 0, 400, 500);

      // Draw border
      ctx.strokeStyle = "#6366F1";
      ctx.lineWidth = 8;
      ctx.strokeRect(4, 4, 392, 492);

      // Draw header
      ctx.fillStyle = "#6366F1";
      ctx.font = "bold 10px 'Segoe UI', sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("ENTRY PASS", 200, 35);

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

          // Draw Reg No
          ctx.fillStyle = "#6366F1";
          ctx.font = "bold 14px monospace";
          ctx.fillText(`REG: ${regno}`, 200, 395);

          // Draw Category badge (using compatible drawing)
          ctx.fillStyle = "#F3F4F6";
          const badgeWidth = Math.max(100, ctx.measureText(role.toUpperCase()).width + 30);
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
          ctx.fillText(role.toUpperCase(), 200, 442);

          // Export and download
          canvas.toBlob((outBlob) => {
            if (outBlob) {
              const downloadUrl = window.URL.createObjectURL(outBlob);
              const a = document.createElement("a");
              a.href = downloadUrl;
              a.download = `Ticket_${name.replace(/\s+/g, "_")}_${regno}.jpg`;
              document.body.appendChild(a);
              a.click();
              document.body.removeChild(a);
              window.URL.revokeObjectURL(downloadUrl);
            }
          }, "image/jpeg", 0.95);
        } catch (err) {
          console.error("Canvas draw or export error", err);
          // Fallback: download the QR directly
          const a = document.createElement("a");
          a.href = qrUrl;
          a.download = `QR_${regno}.jpg`;
          a.target = "_blank";
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
        }
      };

      img.onerror = () => {
        console.error("Failed to load QR image on canvas");
        // Fallback: download the QR directly
        const a = document.createElement("a");
        a.href = qrUrl;
        a.download = `QR_${regno}.jpg`;
        a.target = "_blank";
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      };
    } catch (e) {
      console.error("Failed to generate ticket JPG", e);
    }
  };

  const downloadTicketPDF = (regno: string, name: string, role: string, eventName: string) => {
    const printWindow = window.open("", "_blank", "width=600,height=650");
    if (!printWindow) return;

    const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=250x250&bgcolor=FFFFFF&color=000000&data=${encodeURIComponent(regno)}`;

    const html = `
      <html>
        <head>
          <title>Ticket - ${name}</title>
          <style>
            body { 
              font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; 
              margin: 0; 
              padding: 0; 
              background-color: #f3f4f6; 
              display: flex; 
              justify-content: center; 
              align-items: center; 
              min-height: 100vh;
            }
            .ticket-card { 
              width: 380px; 
              background: #ffffff; 
              border: 6px solid #6366f1; 
              border-radius: 24px; 
              padding: 30px; 
              box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1);
              text-align: center;
              box-sizing: border-box;
            }
            .header-label {
              font-size: 10px;
              font-weight: 800;
              color: #6366f1;
              letter-spacing: 0.25em;
              text-transform: uppercase;
              margin-bottom: 4px;
            }
            .event-name {
              font-size: 16px;
              font-weight: 800;
              color: #1e1b4b;
              margin: 0 0 20px 0;
              text-transform: uppercase;
            }
            .qr-container {
              display: inline-block;
              padding: 10px;
              border: 1px solid #e5e7eb;
              border-radius: 16px;
              background-color: #f9fafb;
              margin-bottom: 24px;
            }
            .qr-image {
              width: 200px;
              height: 200px;
              display: block;
            }
            .attendee-name {
              font-size: 18px;
              font-weight: 800;
              color: #111827;
              margin: 0 0 6px 0;
              text-transform: uppercase;
            }
            .reg-no {
              font-size: 14px;
              font-weight: 800;
              color: #6366f1;
              margin: 0 0 12px 0;
              font-family: monospace;
              letter-spacing: 0.1em;
            }
            .category-badge {
              display: inline-block;
              background-color: #f3f4f6;
              border: 1px solid #e5e7eb;
              color: #4b5563;
              font-size: 10px;
              font-weight: 800;
              text-transform: uppercase;
              letter-spacing: 0.1em;
              padding: 6px 16px;
              border-radius: 9999px;
            }
            @media print {
              body { background-color: #ffffff; }
              .ticket-card { 
                box-shadow: none; 
                border-color: #6366f1 !important; 
                margin: auto;
              }
              @page {
                size: auto;
                margin: 0;
              }
            }
          </style>
        </head>
        <body>
          <div class="ticket-card">
            <div class="header-label">ENTRY PASS</div>
            <div class="event-name">${eventName}</div>
            
            <div class="qr-container">
              <img class="qr-image" src="${qrUrl}" alt="Ticket QR Code" />
            </div>
            
            <div class="attendee-name">${name}</div>
            <div class="reg-no">REG: ${regno}</div>
            <div class="category-badge">${role}</div>
          </div>
          <script>
            window.onload = function() {
              setTimeout(function() {
                window.print();
              }, 500);
            };
          </script>
        </body>
      </html>
    `;
    printWindow.document.write(html);
    printWindow.document.close();
  };

  const downloadReceipt = (payment: PaymentInfo, event: EventInfo, participant: ParticipantInfo | null) => {
    const printWindow = window.open("", "_blank", "width=800,height=600");
    if (!printWindow) {
      return;
    }

    const html = `
      <html>
        <head>
          <title>Payment Receipt - ${event.name}</title>
          <style>
            body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; padding: 40px; color: #333; }
            .receipt-box { max-width: 600px; margin: 0 auto; border: 1px solid #eee; padding: 30px; border-radius: 12px; box-shadow: 0 4px 12px rgba(0,0,0,0.05); }
            .header { display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #6366f1; padding-bottom: 20px; margin-bottom: 25px; }
            .header h1 { font-size: 24px; font-weight: 800; color: #1e1b4b; margin: 0; }
            .details-grid { display: grid; grid-template-cols: 1fr 1fr; gap: 15px; margin-bottom: 25px; }
            .detail-item label { font-size: 10px; text-transform: uppercase; letter-spacing: 0.1em; color: #888; font-weight: 700; display: block; margin-bottom: 3px; }
            .detail-item span { font-size: 14px; font-weight: 600; color: #222; }
            .footer { text-align: center; font-size: 11px; color: #999; border-top: 1px solid #eee; padding-top: 20px; margin-top: 25px; }
            @media print {
              body { padding: 0; }
              .receipt-box { border: none; box-shadow: none; }
            }
          </style>
        </head>
        <body>
          <div class="receipt-box">
            <div class="header">
              <div>
                <h1>PAYMENT RECEIPT</h1>
                <span style="font-size: 11px; color: #666;">${event.name}</span>
              </div>
              <span style="font-size: 20px; font-weight: 900; color: #6366f1;">EventOS</span>
            </div>
            <div class="details-grid">
              <div class="detail-item">
                <label>Transaction ID</label>
                <span>${payment.transaction_id.toUpperCase()}</span>
              </div>
              <div class="detail-item">
                <label>Payment Method</label>
                <span>${payment.payment_method.toUpperCase()}</span>
              </div>
              <div class="detail-item">
                <label>Amount Paid</label>
                <span>${payment.currency} ${payment.amount.toLocaleString()}</span>
              </div>
              <div class="detail-item">
                <label>Discount Applied</label>
                <span>${payment.currency} ${payment.discount_applied.toLocaleString()}</span>
              </div>
              <div class="detail-item">
                <label>Status</label>
                <span style="color: #059669; font-weight: 800;">COMPLETED</span>
              </div>
              <div class="detail-item">
                <label>Payment Date</label>
                <span>${new Date(payment.created_at).toLocaleString("en-IN")}</span>
              </div>
              <div class="detail-item">
                <label>Attendee Name</label>
                <span>${participant?.name || "Attendee"}</span>
              </div>
              <div class="detail-item">
                <label>Email Address</label>
                <span>${participant?.email || "—"}</span>
              </div>
            </div>
            <div class="footer">
              Thank you for your registration. For support, contact ${event.support_email || "the organizers"}.
            </div>
          </div>
          <script>
            window.onload = function() {
              window.print();
            };
          </script>
        </body>
      </html>
    `;
    printWindow.document.write(html);
    printWindow.document.close();
  };

  const logout = () => { localStorage.removeItem(`portal_token_${eventId}`); router.push(`/${eventId}/login`); };

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-[#080912]">
      <div className="space-y-4 w-full max-w-2xl px-6">
        <div className="h-8 bg-white/5 animate-pulse rounded-lg w-1/4" />
        {[1, 2, 3].map(i => (
          <div key={i} className="h-32 bg-white/5 animate-pulse rounded-[2rem]" />
        ))}
      </div>
    </div>
  );

  if (!data) return (
    <div className="min-h-screen flex items-center justify-center bg-[#080912] p-6">
      <div className="glass-3d p-10 text-center rounded-[2.5rem] border border-rose-500/20 max-w-md w-full">
        <AlertCircle className="h-12 w-12 text-rose-400 mx-auto mb-4 animate-pulse" />
        <h3 className="text-[#E8EAFF] font-black text-sm uppercase tracking-wider mb-2">Sync Error</h3>
        <p className="text-[var(--muted)] font-bold text-xs">Could not load your attendee dashboard. Please try refreshing or login again.</p>
        <button onClick={fetchDashboard} className="mt-6 px-6 h-10 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-black uppercase tracking-wider rounded-xl transition-all">
          Refresh Connection
        </button>
      </div>
    </div>
  );

  const event = data.event;
  const registration = data.registration;
  const participant = data.participant;
  const payment = data.payment;
  const edits_locked = data.edits_locked;
  const is_speaker = data.is_speaker;
  const speaker_portal_url = data.speaker_portal_url;

  const isApproved = registration?.status === "approved";
  const isRegistered = registration ? ["submitted", "pending_review", "approved", "waitlisted", "rejected"].includes(registration.status) : false;

  // Compute days left
  const daysLeft = (() => {
    if (!event || !event.start_date) return null;
    const start = new Date(event.start_date);
    const now = new Date();
    start.setHours(0, 0, 0, 0);
    now.setHours(0, 0, 0, 0);
    const diffTime = start.getTime() - now.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays;
  })();


  // Pending Actions
  const pendingActions: string[] = [];
  if (registration.status === "not_registered") {
    pendingActions.push("Submit Registration Form");
  }
  if (registration.status === "approved" && participant?.paid_status !== "Paid" && getTicketBasePrice() > 0) {
    pendingActions.push("Complete Ticket Payment");
  }
  if (missingProfileItems.length > 0 && isRegistered) {
    pendingActions.push("Complete Profile Checklist");
  }

  // Steps for the journey progress timeline
  const steps = [
    {
      label: "Registration Completed",
      isCompleted: isRegistered,
      isActive: isRegistered
    },
    {
      label: "Payment Completed",
      isCompleted: participant?.paid_status === "Paid" || getTicketBasePrice() === 0,
      isActive: isRegistered
    },
    {
      label: "Profile Completion",
      isCompleted: missingProfileItems.length === 0,
      isActive: isRegistered
    },
    {
      label: "Badge Generated",
      isCompleted: isApproved && (participant?.paid_status === "Paid" || getTicketBasePrice() === 0),
      isActive: isApproved
    },
    {
      label: "Check-in Status",
      isCompleted: !!(participant?.custom_fields?.checked_in || participant?.custom_fields?.check_in),
      isActive: isApproved && (participant?.paid_status === "Paid" || getTicketBasePrice() === 0)
    }
  ];

  const labelMap: Record<string, string> = {
    name: "Full Name",
    first_name: "First Name",
    last_name: "Last Name",
    email: "Email Address",
    phone: "Phone Number",
    company: "Company / Organization",
    designation: "Designation / Job Title",
    country: "Country"
  };

  return (
    <div className="min-h-screen pb-12 bg-[#080912] text-[#E8EAFF] font-sans selection:bg-indigo-500/30 selection:text-indigo-200">

      <div className="max-w-6xl mx-auto px-4 pt-6 space-y-6">
        {showPaymentSuccess ? (
          <div className="max-w-md mx-auto">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="w-full glass-card p-8 rounded-[3rem] bg-[#0d0e1b]/80 border border-emerald-500/20 text-center space-y-6 shadow-2xl relative overflow-hidden"
            >
              <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />

              <div className="h-16 w-16 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center mx-auto">
                <CheckCircle2 className="h-8 w-8 text-emerald-400 animate-bounce" />
              </div>

              <div className="space-y-2">
                <span className="text-[9px] font-black uppercase tracking-[0.3em] text-emerald-400 block animate-pulse">
                  Payment Successful
                </span>
                <h2 className="text-2xl font-black text-[#E8EAFF] tracking-tighter">
                  Thank You!
                </h2>
                <p className="text-xs font-bold text-[var(--muted)] leading-relaxed">
                  Your ticket has been successfully activated.
                </p>
              </div>

              {/* Transaction Details */}
              <div className="p-5 rounded-2xl bg-white/5 border border-white/5 space-y-3 text-left">
                {payment?.transaction_id && (
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-[9px] font-black text-[var(--muted)] uppercase tracking-widest">Transaction ID</span>
                    <span className="font-mono text-[#E8EAFF] font-semibold">{payment.transaction_id.slice(0, 12).toUpperCase()}</span>
                  </div>
                )}
                <div className="flex justify-between items-center text-xs">
                  <span className="text-[9px] font-black text-[var(--muted)] uppercase tracking-widest">Amount Paid</span>
                  <span className="font-semibold text-emerald-400">
                    {payment?.currency || "INR"} {payment?.amount?.toLocaleString() || "0"}
                  </span>
                </div>
                {payment?.payment_method && (
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-[9px] font-black text-[var(--muted)] uppercase tracking-widest">Payment Method</span>
                    <span className="font-semibold text-[#E8EAFF] uppercase">{payment.payment_method}</span>
                  </div>
                )}
                <div className="flex justify-between items-center text-xs">
                  <span className="text-[9px] font-black text-[var(--muted)] uppercase tracking-widest">Registration No.</span>
                  <span className="font-mono font-black text-indigo-400">{participant?.regno || "—"}</span>
                </div>
              </div>

              <div className="pt-2">
                <button
                  onClick={() => {
                    setShowPaymentSuccess(false);
                    setCheckoutStep("init");
                  }}
                  className="w-full btn-primary h-12 rounded-full text-xs font-black uppercase tracking-widest"
                >
                  Back to Dashboard
                </button>
                <p className="text-[10px] font-bold text-[var(--muted)] mt-3">
                  Redirecting to dashboard in {successCountdown} seconds...
                </p>
              </div>
            </motion.div>
          </div>
        ) : checkoutStep === "confirm" ? (
          <div className="max-w-2xl mx-auto">
            <motion.div
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              className="w-full glass-card p-6 md:p-10 rounded-[2.5rem] bg-[#0d0e1b]/80 space-y-8 relative overflow-hidden shadow-2xl border border-indigo-500/20"
            >
              <div className="absolute top-0 left-0 w-32 h-32 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />

              <div className="border-b border-white/5 pb-4 flex items-center justify-between">
                <div>
                  <h2 className="text-xl font-black text-[#E8EAFF] tracking-tight uppercase">Confirm Order</h2>
                  <p className="text-[10px] text-[var(--muted)] font-bold uppercase tracking-wider mt-1">Review checkout details before payment</p>
                </div>
                <button
                  onClick={() => setCheckoutStep("init")}
                  className="px-4 py-2 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 text-xs font-black uppercase tracking-widest text-[var(--muted)] hover:text-[#E8EAFF] transition-all"
                >
                  Cancel
                </button>
              </div>

              {/* Checkout Details Table */}
              <div className="space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between p-3.5 bg-white/5 border border-white/5 rounded-xl gap-2 text-left">
                  <span className="text-[9px] font-black text-[var(--muted)] uppercase tracking-widest">Attendee Name</span>
                  <span className="text-xs font-semibold text-[#E8EAFF]">{participant?.name}</span>
                </div>
                <div className="flex flex-col sm:flex-row sm:items-center justify-between p-3.5 bg-white/5 border border-white/5 rounded-xl gap-2 text-left">
                  <span className="text-[9px] font-black text-[var(--muted)] uppercase tracking-widest">Email Address</span>
                  <span className="text-xs font-semibold text-[#E8EAFF]">{participant?.email}</span>
                </div>
                <div className="flex flex-col sm:flex-row sm:items-center justify-between p-3.5 bg-white/5 border border-white/5 rounded-xl gap-2 text-left">
                  <span className="text-[9px] font-black text-[var(--muted)] uppercase tracking-widest">Category / Role</span>
                  <span className="text-xs font-semibold text-[#E8EAFF] uppercase tracking-wider">{participant?.role}</span>
                </div>

                {/* Costs details */}
                <div className="mt-4 pt-4 border-t border-white/5 space-y-2 font-bold">
                  <div className="flex justify-between items-center text-xs text-[var(--muted)]">
                    <span>Base Ticket Price</span>
                    <span>{formConfig?.currency || "INR"} {getTicketBasePrice().toLocaleString()}</span>
                  </div>
                  {appliedPromo && (
                    <div className="flex justify-between items-center text-xs text-emerald-400">
                      <span>Promo Discount ({appliedPromo.code})</span>
                      <span>-{formConfig?.currency || "INR"} {appliedPromo.discount_amount.toLocaleString()}</span>
                    </div>
                  )}
                  <div className="flex justify-between items-center pt-2 border-t border-white/5 text-sm">
                    <span className="font-black text-[#E8EAFF]">Total Payable</span>
                    <span className="font-black text-indigo-400">
                      {formConfig?.currency || "INR"} {getTicketPrice().toLocaleString()}
                    </span>
                  </div>
                </div>
              </div>

              {/* Terms and Conditions block */}
              <div className="space-y-4 pt-4 border-t border-white/5">
                <div className="flex items-center justify-between">
                  <h3 className="text-[10px] font-black text-[var(--muted)] uppercase tracking-widest text-left">Terms &amp; Conditions</h3>
                  <button
                    type="button"
                    onClick={() => setTcModalOpen(true)}
                    className="text-[9px] font-black text-indigo-400 hover:text-indigo-300 uppercase tracking-widest flex items-center gap-1 transition-colors"
                  >
                    <FileText className="h-3 w-3" />
                    View Full T&amp;C
                  </button>
                </div>
                <div className="p-4 rounded-xl bg-black/40 border border-white/5 max-h-36 overflow-y-auto text-left prose prose-invert prose-xs max-w-none
                  prose-headings:text-[#E8EAFF] prose-headings:font-black prose-headings:text-xs
                  prose-p:text-[var(--muted)] prose-p:text-[11px] prose-p:leading-relaxed prose-p:my-1
                  prose-li:text-[var(--muted)] prose-li:text-[11px] prose-li:my-0
                  prose-strong:text-[#E8EAFF] prose-em:text-indigo-300
                  prose-a:text-indigo-400 prose-hr:border-white/10 prose-ul:my-1 prose-ol:my-1">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                    {formConfig?.terms_and_conditions || "## Terms & Conditions\n\n1. Registration is non-transferable and non-refundable.\n2. Attendees must adhere to the Event Code of Conduct.\n3. The organizers reserve the right to modify the schedule without prior notice."}
                  </ReactMarkdown>
                </div>
                <label className="flex items-start gap-3 cursor-pointer select-none group">
                  <div className={`mt-0.5 h-4 w-4 rounded border flex items-center justify-center shrink-0 transition-all ${agreedToTerms ? "bg-indigo-500 border-indigo-500" : "bg-white/5 border-white/20 group-hover:border-indigo-400/50"
                    }`}>
                    <input
                      type="checkbox"
                      checked={agreedToTerms}
                      onChange={(e) => setAgreedToTerms(e.target.checked)}
                      className="sr-only"
                    />
                    {agreedToTerms && <Check className="h-2.5 w-2.5 text-white" />}
                  </div>
                  <span className="text-[10px] font-bold text-[var(--muted)] uppercase tracking-wider leading-relaxed text-left group-hover:text-[#E8EAFF] transition-colors">
                    I have read and agree to the terms and conditions above. <span className="text-indigo-400 font-bold">*</span>
                    <span className="block text-indigo-400/60 mt-0.5 normal-case font-medium tracking-normal font-bold">Click &ldquo;View Full T&amp;C&rdquo; above to read the complete document.</span>
                  </span>
                </label>
              </div>

              {/* Action Buttons */}
              <div className="flex gap-4 pt-4 border-t border-white/5">
                <button
                  onClick={() => setCheckoutStep("init")}
                  className="flex-1 h-14 rounded-full border border-white/10 hover:bg-white/5 text-xs font-black uppercase tracking-widest text-[var(--muted)] hover:text-[#E8EAFF] transition-all flex items-center justify-center gap-2"
                >
                  <ArrowLeft className="h-4 w-4 text-indigo-400" /> Cancel
                </button>
                <button
                  onClick={handleCheckoutSubmit}
                  disabled={checkoutSubmitting || !agreedToTerms}
                  className="flex-[2] h-14 rounded-full btn-primary flex items-center justify-center gap-3 shadow-lg disabled:opacity-50 font-black uppercase tracking-widest text-xs"
                >
                  {checkoutSubmitting ? (
                    <>Processing... <Loader2 className="h-4 w-4 animate-spin" /></>
                  ) : (
                    <>
                      Pay Now <ArrowRight className="h-4 w-4" />
                    </>
                  )}
                </button>
              </div>
            </motion.div>
          </div>
        ) : (
          <>
            {/* Top Welcome Banner Section */}
            <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-6 bg-gradient-to-r from-indigo-500/10 via-purple-500/5 to-transparent p-6 rounded-[2rem] border border-white/5 shadow-2xl relative overflow-hidden">
              <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />
              <div className="absolute -bottom-10 left-10 w-48 h-48 bg-purple-500/10 rounded-full blur-3xl pointer-events-none" />
              
              <div className="relative z-10 flex-1">
                <span className="text-[10px] font-black text-indigo-400 uppercase tracking-[0.25em] block mb-1">
                  Attendee Control Center
                </span>
                <h2 className="text-2xl md:text-3xl font-black text-[#E8EAFF] tracking-tight flex items-center gap-2">
                  Welcome back, {participant?.name || "Attendee"} 👋
                </h2>
                <p className="text-xs font-bold text-[var(--muted)] mt-2">
                  {event.name} {daysLeft !== null ? (
                    daysLeft > 0 ? (
                      <>begins in <span className="text-indigo-400 font-extrabold">{daysLeft} days</span>.</>
                    ) : daysLeft === 0 ? (
                      <span className="text-emerald-400 font-extrabold font-bold">begins today!</span>
                    ) : (
                      <>started <span className="text-[var(--muted)] font-extrabold">{Math.abs(daysLeft)} days ago</span>.</>
                    )
                  ) : ""} You have <span className="text-purple-400 font-extrabold font-bold">{pendingActions.length} pending actions</span>.
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
              </div>

              {/* Event Countdown integrated on Welcome Card (Right side) */}
              {isRegistered && (
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
                        <span className="text-[7px] font-black text-[var(--muted)] uppercase tracking-wider block mt-0.5">
                          {c.label}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Speaker Portal Integration Section */}
            {is_speaker && (
              <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                className="glass-card p-6 md:p-8 rounded-[2rem] border border-indigo-500/20 bg-indigo-500/[0.02] text-left space-y-4 relative overflow-hidden"
              >
                <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-500/5 rounded-full blur-2xl pointer-events-none" />
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-full bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400">
                    <Users className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="text-lg font-black text-[#E8EAFF] tracking-tight">Presenter & Speaker Hub</h3>
                    <p className="text-xs text-[var(--muted)] font-bold mt-1">You are a speaker for this event.</p>
                  </div>
                </div>

                <p className="text-xs font-bold text-[var(--muted)] leading-relaxed">
                  Please access the Speaker Portal to upload your presentation talks, manage digital poster submissions, review slot details, and download your Speaker Ready Room QR Access pass.
                </p>

                <div className="pt-2">
                  <a
                    href={speaker_portal_url}
                    target="_blank"
                    rel="noreferrer"
                    className="btn-primary inline-flex items-center justify-center gap-2 px-6 h-11 text-xs uppercase tracking-wider font-black rounded-full"
                  >
                    Access Speaker Portal <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                </div>
              </motion.div>
            )}

            {/* Event Journey Progress Tracker */}
            {isRegistered && (
              <div className="glass-card p-6 rounded-[2rem] border border-white/5 relative overflow-hidden">
                <div className="absolute inset-0 bg-gradient-to-b from-indigo-500/[0.02] to-transparent pointer-events-none" />
                <h3 className="text-[10px] font-black text-[var(--muted)] uppercase tracking-[0.2em] mb-6 flex items-center gap-2">
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
                      return (
                        <div key={idx} className="flex flex-col items-center text-center group">
                          {/* Step Node */}
                          <div className={`h-8 w-8 md:h-10 md:w-10 rounded-full flex items-center justify-center border transition-all duration-300 ${isCompleted
                              ? "bg-emerald-500/10 border-emerald-500 text-emerald-400 shadow-[0_0_12px_rgba(52,211,153,0.2)]"
                              : isActive
                                ? "bg-indigo-500/10 border-indigo-500 text-indigo-400 shadow-[0_0_12px_rgba(99,102,241,0.2)]"
                                : "bg-[#0d0e1b] border-white/10 text-[var(--muted)]"
                            }`}>
                            {isCompleted ? (
                              <Check className="h-4 w-4 md:h-5 md:w-5" />
                            ) : (
                              <span className="text-[10px] md:text-xs font-black">{idx + 1}</span>
                            )}
                          </div>
                          {/* Step Label */}
                          <span className={`text-[7px] sm:text-[8px] md:text-[10px] font-black uppercase tracking-wider mt-2.5 md:mt-3 transition-colors ${isCompleted
                              ? "text-emerald-400"
                              : isActive
                                ? "text-[#E8EAFF]"
                                : "text-[var(--muted)]"
                            }`}>
                            {step.label}
                          </span>
                          <span className="text-[6px] sm:text-[8px] md:text-[9px] font-bold text-[var(--muted)] mt-0.5 block opacity-80">
                            {isCompleted ? "Completed" : isActive ? "Active" : "Locked"}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}

            {/* 12-Column Responsive Layout Grid - Row 1 */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-stretch">
              {/* Left Column (8 cols) */}
              <div className="lg:col-span-8 flex flex-col h-full">
                {/* Tab Selector */}
                {isRegistered && (
                  <div className="flex gap-2 p-1.5 bg-white/[0.03] border border-white/10 rounded-2xl mb-6 backdrop-blur-md shrink-0">
                    <button
                      onClick={() => setActiveTab("ticket")}
                      className={`flex-1 flex items-center justify-center gap-2 py-3 text-xs font-black uppercase tracking-wider rounded-xl transition-all ${activeTab === "ticket"
                          ? "bg-indigo-500/10 border border-indigo-500/20 text-indigo-300 shadow-[0_0_12px_rgba(99,102,241,0.15)]"
                          : "text-[var(--muted)] hover:text-[#E8EAFF] border border-transparent"
                        }`}
                    >
                      <Ticket className="h-4 w-4" /> My Ticket
                    </button>
                    <button
                      onClick={() => setActiveTab("profile")}
                      className={`flex-1 flex items-center justify-center gap-2 py-3 text-xs font-black uppercase tracking-wider rounded-xl transition-all relative ${activeTab === "profile"
                          ? "bg-indigo-500/10 border border-indigo-500/20 text-indigo-300 shadow-[0_0_12px_rgba(99,102,241,0.15)]"
                          : "text-[var(--muted)] hover:text-[#E8EAFF] border border-transparent"
                        }`}
                    >
                      <User className="h-4 w-4" /> My Profile
                      {missingProfileItems.length > 0 && (
                        <span className="h-5 min-w-5 px-1.5 flex items-center justify-center bg-indigo-500 text-white text-[9px] font-black rounded-full shadow-[0_0_8px_rgba(99,102,241,0.5)] shrink-0 animate-pulse">
                          {missingProfileItems.length}
                        </span>
                      )}
                    </button>
                  </div>
                )}

                {/* Tab Content */}
                <div className="flex-1 flex flex-col">
                  {/* Ticket Tab Content */}
                  {(!isRegistered || activeTab === "ticket") && (
                    <div className="space-y-6 flex-1 flex flex-col justify-stretch">
                      {/* Registration prompts / non-approved notices */}
                      {!isRegistered && (
                        <div className="glass-card p-6 md:p-8 rounded-[2rem] border border-indigo-500/20 bg-indigo-500/[0.02] text-center space-y-5 flex-1 flex flex-col justify-center">
                          <div className="h-12 w-12 rounded-full bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center mx-auto text-indigo-400">
                            <User className="h-6 w-6" />
                          </div>
                          <div>
                            <h3 className="text-lg font-black text-[#E8EAFF] tracking-tight">Complete Your Registration</h3>
                            <p className="text-xs text-[var(--muted)] font-bold mt-1">You are currently logged in but haven't submitted the registration form yet.</p>
                          </div>
                          <div>
                            <a href={`/${eventId}/register`} className="btn-primary inline-flex items-center gap-2 px-8 h-12 rounded-full font-black uppercase text-xs tracking-wider">
                              Open Registration Form <ChevronRight className="h-4 w-4" />
                            </a>
                          </div>
                        </div>
                      )}

                      {isRegistered && registration.status === "waitlisted" && (
                        <div className="glass-card p-6 md:p-8 rounded-[2rem] border border-purple-500/20 bg-purple-500/[0.02] text-center space-y-4 flex-1 flex flex-col justify-center">
                          <div className="h-12 w-12 rounded-full bg-purple-500/10 border border-purple-500/20 flex items-center justify-center mx-auto text-purple-400">
                            <Clock className="h-6 w-6" />
                          </div>
                          <div>
                            <h3 className="text-lg font-black text-[#E8EAFF] tracking-tight">Waitlisted</h3>
                            <p className="text-xs text-[var(--muted)] font-bold mt-1">We are currently at capacity, but we have placed you on the waitlist.</p>
                          </div>
                          {registration.waitlist_position && (
                            <div>
                              <div className="inline-flex items-center gap-2 bg-purple-500/10 border border-purple-500/20 px-4 py-2 rounded-xl">
                                <span className="text-xs font-black text-purple-400 uppercase tracking-widest">
                                  Queue Position: #{registration.waitlist_position}
                                </span>
                              </div>
                            </div>
                          )}
                          <p className="text-xs font-bold text-[var(--muted)] max-w-md mx-auto leading-relaxed">
                            We will contact you immediately via email at <span className="text-[#E8EAFF]">{participant?.email}</span> if a spot opens up. Thank you for your patience!
                          </p>
                        </div>
                      )}

                      {isRegistered && registration.status === "rejected" && (
                        <div className="glass-card p-6 md:p-8 rounded-[2rem] border border-rose-500/20 bg-rose-500/[0.02] text-center space-y-4 flex-1 flex flex-col justify-center">
                          <div className="h-12 w-12 rounded-full bg-rose-500/10 border border-rose-500/20 flex items-center justify-center mx-auto text-rose-400">
                            <XCircle className="h-6 w-6" />
                          </div>
                          <div>
                            <h3 className="text-lg font-black text-[#E8EAFF] tracking-tight">Registration Status: Not Approved</h3>
                            <p className="text-xs text-[var(--muted)] font-bold mt-1">Unfortunately, your registration request for this event could not be approved.</p>
                          </div>
                          {registration.rejection_reason && (
                            <div className="bg-rose-500/10 border border-rose-500/20 rounded-xl px-4 py-3 max-w-md mx-auto w-full">
                              <p className="text-xs font-bold text-rose-400 leading-relaxed text-left">
                                <span className="font-black uppercase tracking-wider block mb-1">Feedback from Organizers:</span>
                                {registration.rejection_reason}
                              </p>
                            </div>
                          )}
                          {event.support_email && (
                            <p className="text-xs font-bold text-[var(--muted)]">
                              If you believe this is a misunderstanding, please reach out to us at{" "}
                              <a href={`mailto:${event.support_email}`} className="text-indigo-400 hover:underline font-black">{event.support_email}</a>
                            </p>
                          )}
                        </div>
                      )}

                      {isRegistered && ["submitted", "pending_review"].includes(registration.status) && (
                        <div className="glass-card p-6 md:p-8 rounded-[2rem] border border-amber-500/20 bg-amber-500/[0.02] text-center space-y-4 flex-1 flex flex-col justify-center">
                          <div className="h-12 w-12 rounded-full bg-amber-500/10 border border-amber-500/20 flex items-center justify-center mx-auto text-amber-400">
                            <Clock className="h-6 w-6" />
                          </div>
                          <div>
                            <h3 className="text-lg font-black text-[#E8EAFF] tracking-tight">Registration Under Review</h3>
                            <p className="text-xs text-[var(--muted)] font-bold mt-1">Thank you for submitting your registration. Our team is currently reviewing your details.</p>
                          </div>
                          <p className="text-xs font-bold text-[var(--muted)] max-w-md mx-auto leading-relaxed">
                            We will process your registration shortly and send a confirmation email once a decision has been reached. Please check back later.
                          </p>
                          {registration.submitted_at && (
                            <p className="text-[9px] font-black text-[var(--muted)] uppercase tracking-widest">
                              Submitted on {fmtDate(registration.submitted_at)}
                            </p>
                          )}
                        </div>
                      )}

                      {/* Digital Ticket Pass (Approved and Paid/Free) */}
                      {isApproved && participant && (participant.paid_status === "Paid" || getTicketBasePrice() === 0) && (
                        <div className="glass-card p-6 md:p-8 rounded-[2rem] border border-white/5 relative overflow-hidden bg-[#0d0e1b]/40 text-center animate-in fade-in duration-300 flex-1 flex flex-col justify-center animate-lift">
                          {/* Glowing Accent */}
                          <div className="absolute top-0 right-0 w-48 h-48 bg-indigo-500/5 rounded-full blur-3xl pointer-events-none" />
                          <div className="absolute bottom-0 left-0 w-48 h-48 bg-purple-500/5 rounded-full blur-3xl pointer-events-none" />

                          <div className="flex flex-col lg:flex-row items-center gap-8 relative z-10">
                            {/* Ticket Pass */}
                            <div className="w-full max-w-[320px] bg-white border-[6px] border-[#6366f1] rounded-[24px] p-6 text-center relative overflow-hidden shadow-2xl shrink-0 flex flex-col items-center mx-auto lg:mx-0 hover-lift-3d">
                              <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-indigo-500 to-purple-500" />
                              <span className="text-[10px] font-extrabold text-[#6366f1] uppercase tracking-[0.25em] block mb-1">
                                ENTRY PASS
                              </span>
                              <h4 className="text-sm font-extrabold text-[#1e1b4b] uppercase tracking-wider mb-2 max-w-full truncate">
                                {event.name}
                              </h4>

                              {/* Perforated separator line */}
                              <div className="w-full flex items-center justify-between my-2">
                                <div className="h-4 w-4 bg-[#0d0e1b] rounded-full -ml-8 border-r border-[#6366f1]/20" />
                                <div className="flex-1 border-t border-dashed border-gray-300 mx-2" />
                                <div className="h-4 w-4 bg-[#0d0e1b] rounded-full -mr-8 border-l border-[#6366f1]/20" />
                              </div>

                              <div className="p-2.5 bg-[#f9fafb] border border-[#e5e7eb] rounded-2xl my-3">
                                <img
                                  src={`https://api.qrserver.com/v1/create-qr-code/?size=250x250&bgcolor=FFFFFF&color=000000&data=${encodeURIComponent(participant.regno)}`}
                                  alt={`QR code for ${participant.regno}`}
                                  className="w-36 h-36 rounded-xl block"
                                />
                              </div>

                              <h3 className="text-base font-extrabold text-[#111827] uppercase tracking-wider mb-1 max-w-full truncate">
                                {participant.name}
                              </h3>
                              <span className="text-xs font-mono font-bold text-[#6366f1] tracking-widest block mb-3">
                                REG: {participant.regno || "—"}
                              </span>

                              <span className="inline-block px-4 py-1.5 bg-[#f3f4f6] border border-[#e5e7eb] text-[10px] font-extrabold text-[#4b5563] uppercase tracking-widest rounded-full">
                                {participant.role}
                              </span>
                            </div>

                            {/* Right details / Actions */}
                            <div className="flex-1 w-full text-left space-y-5">
                              <div className="space-y-1">
                                <h4 className="text-lg font-black text-[#E8EAFF] tracking-tight">Your Digital Pass is Ready!</h4>
                                <p className="text-xs text-[var(--muted)] font-bold leading-relaxed">Present this pass at the registration desk for check-in and instantaneous badge generation.</p>
                              </div>

                              <div className="grid grid-cols-2 gap-4 py-2 border-y border-white/5">
                                <div>
                                  <span className="text-[9px] font-black text-[var(--muted)] uppercase tracking-widest block mb-0.5">Attendee Category</span>
                                  <span className="text-xs font-extrabold text-indigo-400 uppercase tracking-wider">{participant.role}</span>
                                </div>
                                <div>
                                  <span className="text-[9px] font-black text-[var(--muted)] uppercase tracking-widest block mb-0.5">Verification Status</span>
                                  <span className="inline-flex items-center gap-1 text-[10px] font-black uppercase text-emerald-400">
                                    <CheckCircle2 className="h-3.5 w-3.5" /> Verified
                                  </span>
                                </div>
                              </div>

                              {/* Action Buttons */}
                              <div className="pt-4 flex flex-col gap-3">
                                <button
                                  onClick={() => downloadTicketJPG(participant.regno, participant.name, participant.role, event.name)}
                                  className="w-full flex items-center justify-center gap-2.5 py-4 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 text-xs font-black text-indigo-300 hover:bg-indigo-500/20 hover:border-indigo-500/30 transition-all uppercase tracking-wider"
                                >
                                  <Download className="h-4.5 w-4.5 text-indigo-400" /> Download Pass (JPG Image)
                                </button>
                                <button
                                  onClick={() => downloadTicketPDF(participant.regno, participant.name, participant.role, event.name)}
                                  className="w-full flex items-center justify-center gap-2.5 py-4 rounded-2xl bg-white/5 border border-white/10 text-xs font-black text-[#E8EAFF] hover:bg-white/10 hover:border-white/20 transition-all uppercase tracking-wider"
                                >
                                  <FileText className="h-4.5 w-4.5 text-indigo-400" /> Download Ticket (PDF Document)
                                </button>
                              </div>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Checkout Payment required section */}
                      {isApproved && participant && participant.paid_status !== "Paid" && getTicketBasePrice() > 0 && (
                        <div className="glass-card p-6 md:p-8 rounded-[2rem] border border-amber-500/20 bg-amber-500/[0.02] relative overflow-hidden space-y-6 flex-1 flex flex-col justify-between">
                          <div className="flex items-start gap-4">
                            <div className="h-10 w-10 rounded-full bg-amber-500/10 border border-amber-500/20 flex items-center justify-center shrink-0 text-amber-400">
                              <AlertCircle className="h-5 w-5" />
                            </div>
                            <div className="space-y-1">
                              <h3 className="text-base font-black text-[#E8EAFF]">Payment Verification Pending</h3>
                              <p className="text-xs text-[var(--muted)] font-bold leading-relaxed">
                                Your event registration is fully approved! Complete checkout to activate your entry ticket and unlock agenda selection.
                              </p>
                            </div>
                          </div>

                          <div className="p-5 rounded-2xl bg-white/5 border border-white/5 space-y-3 text-left">
                            <div className="flex justify-between items-center py-1.5 border-b border-white/5 text-xs text-[var(--muted)] font-bold">
                              <span>Ticket Category</span>
                              <span className="text-[#E8EAFF] uppercase tracking-wider">{participant.role}</span>
                            </div>

                            <div className="flex justify-between items-center py-1.5 border-b border-white/5 text-xs text-[var(--muted)] font-bold">
                              <span>Base Cost</span>
                              <span className="text-[#E8EAFF]">{formConfig?.currency || "INR"} {getTicketBasePrice().toLocaleString()}</span>
                            </div>

                            {appliedPromo && (
                              <div className="flex justify-between items-center py-1.5 border-b border-white/5 text-xs text-emerald-400 font-bold">
                                <span>Discount Applied ({appliedPromo.code})</span>
                                <span>-{formConfig?.currency || "INR"} {appliedPromo.discount_amount.toLocaleString()}</span>
                              </div>
                            )}

                            <div className="flex justify-between items-center pt-2 text-sm font-bold">
                              <span className="text-[#E8EAFF]">Total Payable</span>
                              <span className="text-indigo-400 font-black">{formConfig?.currency || "INR"} {getTicketPrice().toLocaleString()}</span>
                            </div>
                          </div>

                          {/* Promo validation */}
                          {formConfig?.payment_enabled && (
                            <div className="space-y-2 text-left">
                              <label className="text-[9px] font-black text-[var(--muted)] uppercase tracking-widest block">Apply Promo Coupon</label>
                              <div className="flex gap-2">
                                <input
                                  type="text"
                                  placeholder="PROMO CODE"
                                  value={promoCode}
                                  onChange={(e) => setPromoCode(e.target.value.toUpperCase())}
                                  disabled={appliedPromo !== null || validatingPromo}
                                  className="input flex-1 uppercase tracking-wider text-xs h-11 py-2"
                                />
                                {appliedPromo ? (
                                  <button
                                    onClick={() => {
                                      setPromoCode("");
                                      setAppliedPromo(null);
                                    }}
                                    className="px-4 bg-rose-500/10 border border-rose-500/20 text-rose-400 hover:bg-rose-500/20 rounded-xl text-xs font-black uppercase tracking-wider transition-all"
                                  >
                                    Remove
                                  </button>
                                ) : (
                                  <button
                                    onClick={handlePromoApply}
                                    disabled={!promoCode.trim() || validatingPromo}
                                    className="px-5 bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 hover:bg-indigo-500/20 disabled:opacity-40 disabled:cursor-not-allowed rounded-xl text-xs font-black uppercase tracking-wider transition-all"
                                  >
                                    {validatingPromo ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Apply"}
                                  </button>
                                )}
                              </div>
                            </div>
                          )}

                          <button
                            onClick={() => setCheckoutStep("confirm")}
                            className="w-full btn-primary h-12 rounded-full flex items-center justify-center gap-2 mt-4 font-black uppercase tracking-widest text-xs"
                          >
                            Proceed to Checkout
                          </button>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Profile Tab Content */}
                  {isRegistered && activeTab === "profile" && participant && (
                    <div className="glass-card p-6 md:p-8 rounded-[2rem] border border-white/5 relative overflow-hidden flex-1 flex flex-col justify-between space-y-6 bg-[#0d0e1b]/40">
                      {/* Glowing Accent */}
                      <div className="absolute top-0 right-0 w-48 h-48 bg-indigo-500/5 rounded-full blur-3xl pointer-events-none" />
                      <div className="absolute bottom-0 left-0 w-48 h-48 bg-purple-500/5 rounded-full blur-3xl pointer-events-none" />

                      <div className="relative z-10 space-y-6 flex-grow flex flex-col justify-between">
                        {/* Profile Header and Strength */}
                        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white/5 border border-white/5 p-5 rounded-2xl">
                          <div>
                            <span className="text-[9px] font-black text-indigo-400 uppercase tracking-widest block">Profile Completeness</span>
                            <h3 className="text-lg font-black text-[#E8EAFF] mt-1">{profileCompletionPercent}% Complete</h3>
                          </div>
                          {/* Progress bar */}
                          <div className="flex-grow max-w-[200px] w-full sm:mx-4">
                            <div className="w-full bg-white/5 rounded-full h-2 overflow-hidden">
                              <div className="bg-gradient-to-r from-indigo-500 to-purple-500 h-full rounded-full transition-all duration-500" style={{ width: `${profileCompletionPercent}%` }} />
                            </div>
                          </div>
                          {missingProfileItems.length === 0 ? (
                            <span className="px-3 py-1.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-[9px] font-black uppercase tracking-wider shrink-0">
                              ✓ Completed
                            </span>
                          ) : (
                            <span className="px-3 py-1.5 rounded-full bg-purple-500/10 text-purple-400 border border-purple-500/20 text-[9px] font-black uppercase tracking-wider shrink-0">
                              Pending Fields
                            </span>
                          )}
                        </div>

                        {/* List of Pending Fields if any */}
                        {missingProfileItems.length > 0 && (
                          <div className="p-4 bg-purple-500/5 border border-purple-500/10 rounded-2xl text-left">
                            <span className="text-[9px] font-black text-purple-400 uppercase tracking-widest block mb-2">Required Fields Pending</span>
                            <div className="flex flex-wrap gap-2">
                              {missingProfileItems.map((item, i) => (
                                <span key={i} className="px-2.5 py-1 rounded-xl bg-[#0d0e1b] border border-purple-500/20 text-xs font-bold text-purple-300">
                                  {item}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Contact Information Fields Grid */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 pt-2">
                          <div className="flex items-start gap-3">
                            <User className="h-4.5 w-4.5 text-indigo-400 mt-0.5 shrink-0" />
                            <div>
                              <p className="text-[9px] font-black text-[var(--muted)] uppercase tracking-widest mb-0.5">Full Name</p>
                              <p className="text-sm font-semibold text-[#E8EAFF]">{participant.name}</p>
                            </div>
                          </div>
                          <div className="flex items-start gap-3">
                            <Mail className="h-4.5 w-4.5 text-indigo-400 mt-0.5 shrink-0" />
                            <div>
                              <p className="text-[9px] font-black text-[var(--muted)] uppercase tracking-widest mb-0.5">Email Address</p>
                              <p className="text-sm font-semibold text-[#E8EAFF] truncate max-w-[220px]">{participant.email}</p>
                            </div>
                          </div>
                          <div className="flex items-start gap-3">
                            <Phone className="h-4.5 w-4.5 text-indigo-400 mt-0.5 shrink-0" />
                            <div>
                              <p className="text-[9px] font-black text-[var(--muted)] uppercase tracking-widest mb-0.5">Phone Number</p>
                              <p className="text-sm font-semibold text-[#E8EAFF]">{participant.phone || "—"}</p>
                            </div>
                          </div>
                          <div className="flex items-start gap-3">
                            <Building className="h-4.5 w-4.5 text-indigo-400 mt-0.5 shrink-0" />
                            <div>
                              <p className="text-[9px] font-black text-[var(--muted)] uppercase tracking-widest mb-0.5">Company / Organization</p>
                              <p className="text-sm font-semibold text-[#E8EAFF]">{participant.company || "—"}</p>
                            </div>
                          </div>
                          <div className="flex items-start gap-3">
                            <Briefcase className="h-4.5 w-4.5 text-indigo-400 mt-0.5 shrink-0" />
                            <div>
                              <p className="text-[9px] font-black text-[var(--muted)] uppercase tracking-widest mb-0.5">Designation</p>
                              <p className="text-sm font-semibold text-[#E8EAFF]">{participant.designation || "—"}</p>
                            </div>
                          </div>
                          <div className="flex items-start gap-3">
                            <Globe className="h-4.5 w-4.5 text-indigo-400 mt-0.5 shrink-0" />
                            <div>
                              <p className="text-[9px] font-black text-[var(--muted)] uppercase tracking-widest mb-0.5">Country / State</p>
                              <p className="text-sm font-semibold text-[#E8EAFF]">
                                {participant.country || "—"}
                                {(participant.custom_fields as any)?.country_state ? `, ${(participant.custom_fields as any).country_state}` : ""}
                              </p>
                            </div>
                          </div>
                        </div>

                        {/* Edit Button */}
                        <div className="pt-6 border-t border-white/5">
                          <button
                            onClick={() => { if (!editing) startEdit(); }}
                            disabled={edits_locked}
                            className="w-full sm:w-auto px-8 py-3.5 rounded-xl bg-indigo-500/10 border border-indigo-500/20 hover:bg-indigo-500/20 disabled:opacity-50 transition-all font-black uppercase text-[10px] text-indigo-400 tracking-wider flex items-center justify-center gap-1.5 font-bold"
                          >
                            <Edit3 className="h-3.5 w-3.5" /> Edit Profile Details
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Right Column: Standalone Announcements (4 cols) */}
              <div className="lg:col-span-4 flex flex-col h-full">
                <div className="glass-card rounded-[2rem] overflow-hidden border border-white/5 h-full flex flex-col bg-[#0d0e1b]/40">
                  <div className="flex items-center justify-between px-6 py-5 border-b border-white/5 bg-white/[0.01] shrink-0">
                    <div className="flex items-center gap-3">
                      <span className="text-indigo-400"><Megaphone className="h-4.5 w-4.5" /></span>
                      <h2 className="text-[10px] font-black text-[var(--muted)] uppercase tracking-[0.2em]">Announcements</h2>
                    </div>
                    {announcementsList.length > 0 && (
                      <span className="h-5 min-w-5 px-1.5 flex items-center justify-center bg-indigo-500 text-white text-[9px] font-black rounded-full shadow-[0_0_8px_rgba(99,102,241,0.5)] shrink-0">
                        {announcementsList.length}
                      </span>
                    )}
                  </div>

                  <div className="p-6 overflow-y-auto flex-1 max-h-[550px] space-y-4">
                    {announcementsList.length === 0 ? (
                      <p className="text-xs text-[var(--muted)] text-center py-8 font-bold">No notifications or announcements at this time.</p>
                    ) : (
                      <div className="space-y-4 text-left">
                        {announcementsList.map((ann: any, idx: number) => {
                          const type = ann.type || "info";
                          const isPinned = ann.is_pinned;
                          const isExpanded = !!expandedAnnouncements[ann.id || idx];

                          const styles = {
                            critical: {
                              border: "border-rose-500/20 bg-rose-500/[0.02]",
                              badge: "bg-rose-500/10 text-rose-400 border-rose-500/20",
                              label: "Critical",
                            },
                            warning: {
                              border: "border-amber-500/20 bg-amber-500/[0.02]",
                              badge: "bg-amber-500/10 text-amber-400 border-amber-500/20",
                              label: "Warning",
                            },
                            info: {
                              border: "border-indigo-500/20 bg-indigo-500/[0.02]",
                              badge: "bg-indigo-500/10 text-indigo-400 border-indigo-500/20",
                              label: "Info",
                            },
                            success: {
                              border: "border-emerald-500/20 bg-emerald-500/[0.02]",
                              badge: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
                              label: "Success",
                            }
                          }[type as "critical" | "warning" | "info" | "success"] || {
                            border: "border-indigo-500/20 bg-indigo-500/[0.02]",
                            badge: "bg-indigo-500/10 text-indigo-400 border-indigo-500/20",
                            label: "Notice",
                          };

                          const toggleExpand = () => {
                            setExpandedAnnouncements(prev => ({
                              ...prev,
                              [ann.id || idx]: !prev[ann.id || idx]
                            }));
                          };

                          return (
                            <div
                              key={ann.id || idx}
                              className={`border rounded-[1.5rem] overflow-hidden transition-all duration-300 ${styles.border}`}
                            >
                              {/* Header: Clickable to toggle collapse */}
                              <div
                                onClick={toggleExpand}
                                className="px-4 py-3 flex items-center justify-between cursor-pointer hover:bg-white/[0.02] transition-colors"
                              >
                                <div className="flex-1 min-w-0 pr-2">
                                  <div className="flex flex-wrap items-center gap-1.5 mb-1">
                                    {isPinned && (
                                      <span className="inline-flex items-center gap-0.5 text-[8px] font-black uppercase text-indigo-400 tracking-wide">
                                        📌 Pinned
                                      </span>
                                    )}
                                    <span className={`inline-flex px-1.5 py-0.5 rounded-full border text-[7px] font-black uppercase tracking-wider ${styles.badge}`}>
                                      {styles.label}
                                    </span>
                                    {ann.created_at && (
                                      <span className="text-[7px] font-bold text-[var(--muted)] uppercase tracking-wider">
                                        {new Date(ann.created_at).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
                                      </span>
                                    )}
                                  </div>
                                  <h4 className="text-xs font-black text-[#E8EAFF] tracking-tight truncate">
                                    {ann.title || "Announcement Update"}
                                  </h4>
                                </div>
                                <div className="flex items-center gap-1 shrink-0">
                                  <ChevronRight
                                    className={`h-3.5 w-3.5 text-[var(--muted)] transition-transform duration-300 ${isExpanded ? "rotate-90 text-indigo-400" : ""}`}
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
                                      <div className="prose prose-invert prose-xs max-w-none text-left leading-relaxed
                                        prose-headings:text-[#E8EAFF] prose-headings:font-black prose-headings:text-[10px]
                                        prose-p:text-[var(--muted)] prose-p:text-[10px] prose-p:leading-relaxed prose-p:my-1
                                        prose-li:text-[var(--muted)] prose-li:text-[10px] prose-li:my-0
                                        prose-strong:text-[#E8EAFF] prose-em:text-indigo-300
                                        prose-a:text-indigo-400 prose-hr:border-white/10 prose-ul:my-1 prose-ol:my-1">
                                        <ReactMarkdown remarkPlugins={[remarkGfm]}>
                                          {ann.message || ""}
                                        </ReactMarkdown>
                                      </div>

                                      {/* Attachments Section */}
                                      {ann.attachments && ann.attachments.length > 0 && (
                                        <div className="space-y-1.5 pt-1.5 border-t border-white/5">
                                          <span className="text-[8px] font-black text-[var(--muted)] uppercase tracking-widest block">
                                            Attachments ({ann.attachments.length})
                                          </span>
                                          <div className="flex flex-col gap-1">
                                            {ann.attachments.map((att: any, attIdx: number) => (
                                              <button
                                                key={attIdx}
                                                onClick={(e) => {
                                                  e.stopPropagation();
                                                  handleAttachmentClick(att);
                                                }}
                                                className="inline-flex items-center gap-2 px-2 py-1 bg-white/5 border border-white/10 hover:bg-white/10 hover:border-white/20 text-[9px] font-bold rounded-lg transition-all text-[#E8EAFF] w-full text-left"
                                              >
                                                {getAttachmentIcon(att)}
                                                <span className="truncate flex-1">{att.name}</span>
                                                {att.type === "link" && <ExternalLink className="h-2.5 w-2.5 opacity-60 shrink-0" />}
                                              </button>
                                            ))}
                                          </div>
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
              </div>
            </div>

            {/* Row 2 Grid: Payment Details Card (Left, 8-col) and Event Details Card (Right, 4-col) */}
            {isRegistered && (
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-stretch mt-8">
                {/* Left Column: Payment Details */}
                <div className="lg:col-span-8 flex flex-col h-full">
                  {payment ? (
                    <div className="glass-card rounded-[2rem] overflow-hidden border border-white/5 h-full flex flex-col justify-between bg-[#0d0e1b]/40">
                      <div className="flex items-center gap-3 px-6 py-5 border-b border-white/5 bg-white/[0.01] shrink-0">
                        <span className="text-indigo-400"><Ticket className="h-4 w-4" /></span>
                        <h2 className="text-[10px] font-black text-[var(--muted)] uppercase tracking-[0.2em]">Payment Details</h2>
                      </div>
                      <div className="p-6 flex-1 flex flex-col justify-between space-y-4">
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-left">
                          <Field label="Transaction ID" value={payment.transaction_id.toUpperCase()} />
                          <Field label="Amount Paid" value={`${payment.currency} ${payment.amount.toLocaleString()}`} />
                          <Field label="Payment Date" value={new Date(payment.created_at).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })} />
                          <Field label="Payment Method" value={payment.payment_method ? payment.payment_method.toUpperCase() : "—"} />
                          {payment.discount_applied > 0 ? (
                            <Field label="Discount Applied" value={`${payment.currency} ${payment.discount_applied.toLocaleString()}`} />
                          ) : (
                            <Field label="Discount Applied" value="None" />
                          )}
                        </div>
                        <div className="mt-4 pt-4 border-t border-white/5 flex justify-end">
                          <button
                            onClick={() => downloadReceipt(payment, event, participant)}
                            className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-indigo-500/10 border border-indigo-500/20 hover:bg-indigo-500/20 text-xs font-black text-indigo-400 transition-all uppercase tracking-wider font-bold"
                          >
                            <FileText className="h-4 w-4" /> Download Receipt
                          </button>
                        </div>
                      </div>
                    </div>
                  ) : isApproved && participant && participant.paid_status !== "Paid" && getTicketBasePrice() > 0 ? (
                    <div className="glass-card rounded-[2rem] border border-amber-500/20 bg-amber-500/[0.02] relative overflow-hidden p-6 h-full flex flex-col justify-center items-center text-center">
                      <Ticket className="h-8 w-8 text-amber-500/40 mb-2 animate-pulse" />
                      <h4 className="text-xs font-black text-[#E8EAFF] uppercase tracking-wider">Payment Verification Pending</h4>
                      <p className="text-[10px] text-[var(--muted)] mt-1 max-w-xs font-bold">Please complete checkout in the ticket panel above to view transaction receipt details.</p>
                    </div>
                  ) : (
                    <div className="glass-card rounded-[2rem] overflow-hidden border border-white/5 h-full p-6 flex flex-col justify-center items-center text-center bg-white/[0.01]">
                      <Ticket className="h-8 w-8 text-indigo-400/40 mb-2" />
                      <h4 className="text-xs font-black text-[#E8EAFF] uppercase tracking-wider">No Payment Required</h4>
                      <p className="text-[10px] text-[var(--muted)] mt-1 max-w-xs font-bold">This is a free event or no transactions are associated with your registration.</p>
                    </div>
                  )}
                </div>

                {/* Right Column: Event Details Card */}
                <div className="lg:col-span-4 flex flex-col h-full">
                  <div className="glass-card rounded-[2rem] overflow-hidden border border-white/5 h-full flex flex-col justify-between bg-[#0d0e1b]/40">
                    <div className="flex items-center gap-3 px-6 py-5 border-b border-white/5 bg-white/[0.01] shrink-0">
                      <span className="text-indigo-400"><Calendar className="h-4 w-4" /></span>
                      <h2 className="text-[10px] font-black text-[var(--muted)] uppercase tracking-[0.2em]">Event Details</h2>
                    </div>
                    <div className="p-6 flex-1 flex flex-col justify-between space-y-6">
                      <div className="space-y-4 text-left">
                        <div className="flex items-start gap-3">
                          <Calendar className="h-4.5 w-4.5 text-indigo-400 mt-0.5 shrink-0" />
                          <div>
                            <p className="text-[8px] font-black text-[var(--muted)] uppercase tracking-widest mb-0.5">Dates</p>
                            <p className="text-xs font-semibold text-[#E8EAFF]">
                              {fmtDate(event.start_date)}
                              {event.end_date && event.end_date !== event.start_date && <> — {fmtDate(event.end_date)}</>}
                            </p>
                          </div>
                        </div>

                        {event.venue && (
                          <div className="flex items-start gap-3">
                            <MapPin className="h-4.5 w-4.5 text-indigo-400 mt-0.5 shrink-0" />
                            <div>
                              <p className="text-[8px] font-black text-[var(--muted)] uppercase tracking-widest mb-0.5">Venue</p>
                              <p className="text-xs font-semibold text-[#E8EAFF] leading-relaxed">{event.venue}</p>
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Program PDF link */}
                      <div className="pt-4 border-t border-white/5">
                        {event.program_url ? (
                          <a
                            href={event.program_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="w-full btn-primary h-11 rounded-xl flex items-center justify-center gap-2 text-xs font-black uppercase tracking-wider font-bold"
                          >
                            <FileText className="h-4 w-4" /> Download Program PDF
                          </a>
                        ) : (
                          <div className="space-y-1 text-center">
                            <button
                              disabled
                              className="w-full h-11 rounded-xl bg-white/5 border border-white/5 text-[var(--muted)] text-xs font-black cursor-not-allowed opacity-50 flex items-center justify-center gap-2 font-bold"
                            >
                              <FileText className="h-4 w-4" /> Program PDF Pending
                            </button>
                            <p className="text-[9px] font-bold text-rose-400 mt-1">Program schedule pending upload.</p>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
              </div>
            </div>
          )}
        </>
        )}
      </div>

      {/* Edit Details Drawer/Modal */}
      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-4 overflow-y-auto animate-in fade-in duration-200">
          <div className="relative w-full max-w-2xl bg-[#0d0e1b] border border-indigo-500/20 rounded-[2.5rem] shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="px-8 py-5 border-b border-white/5 flex items-center justify-between bg-white/[0.01] shrink-0">
              <div className="flex items-center gap-2">
                <User className="h-4 w-4 text-indigo-400" />
                <h3 className="text-sm font-black uppercase tracking-[0.25em] text-[#E8EAFF]">Edit Profile Details</h3>
              </div>
              <button
                onClick={() => setEditing(false)}
                className="h-8 w-8 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center text-[var(--muted)] hover:text-[#E8EAFF] transition-all"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="p-8 overflow-y-auto flex-1 space-y-6 text-left">
              {saveError && (
                <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-rose-500/10 border border-rose-500/20">
                  <AlertCircle className="h-4 w-4 text-rose-400 shrink-0" />
                  <p className="text-xs font-bold text-rose-400">{saveError}</p>
                </div>
              )}

              {/* Two Column Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {(["first_name", "last_name", "email", "phone", "company", "designation", "country"] as const).map(f => {
                  const isEmail = f === "email";
                  const isEmailChangeLocked = isEmail && ["submitted", "pending_review", "approved", "waitlisted", "rejected"].includes(data?.registration?.status || "");

                  if (f === "phone") {
                    const rawValue = editForm.phone || "";
                    let selectedCc = "+91";
                    let numVal = rawValue;

                    for (const cc of countryCodes) {
                      if (rawValue.startsWith(cc.code)) {
                        selectedCc = cc.code;
                        numVal = rawValue.slice(cc.code.length);
                        break;
                      }
                    }

                    const isInvalid = numVal.length > 0 && (numVal.length < 7 || numVal.length > 15 || !/^\d+$/.test(numVal));

                    const handlePhoneChange = (newCc: string, newNum: string) => {
                      const filteredNum = newNum.replace(/\D/g, "");
                      const combined = newCc + filteredNum;
                      setEditForm(prev => ({ ...prev, phone: combined }));
                    };

                    return (
                      <div key={f} className="space-y-1.5 sm:col-span-2">
                        <label className="text-[9px] font-black text-[var(--muted)] uppercase tracking-widest block mb-1">Phone Number</label>
                        <div className="flex gap-2">
                          <div className="w-[110px] shrink-0 relative">
                            <select
                              value={selectedCc}
                              onChange={(e) => handlePhoneChange(e.target.value, numVal)}
                              className="h-11 w-full bg-[#0d0e1b] border border-white/10 rounded-xl px-3 font-semibold text-xs text-[#E8EAFF] focus:border-indigo-500 focus:ring-0 transition-all cursor-pointer"
                            >
                              {countryCodes.map(cc => (
                                <option key={cc.code} value={cc.code} className="bg-[#080912]">
                                  {cc.code} ({cc.iso})
                                </option>
                              ))}
                            </select>
                          </div>
                          <input
                            type="text"
                            placeholder="Enter phone number..."
                            value={numVal}
                            onChange={(e) => handlePhoneChange(selectedCc, e.target.value)}
                            className={`input flex-1 ${isInvalid
                                ? "border-rose-500/50 focus:border-rose-500"
                                : "border-white/10 focus:border-indigo-500"
                              }`}
                          />
                        </div>
                        {isInvalid && (
                          <motion.p
                            initial={{ opacity: 0, y: -4 }}
                            animate={{ opacity: 1, y: 0 }}
                            className="text-[9px] text-rose-400 font-bold text-left pl-2"
                          >
                            Phone number must contain numbers only and be between 7 and 15 digits.
                          </motion.p>
                        )}
                      </div>
                    );
                  }

                  if (f === "country") {
                    const countryField = formConfig?.fields?.find((field: any) => field.name === "country" || field.id === "country");
                    const countries = getAllowedCountries(countryField?.options, countryStates);
                    return (
                      <div key={f} className="space-y-1.5">
                        <label className="text-[9px] font-black text-[var(--muted)] uppercase tracking-widest block mb-1">
                          Country
                        </label>
                        <select
                          value={editForm.country || ""}
                          onChange={(e) => {
                            const selected = e.target.value;
                            setEditForm(prev => ({
                              ...prev,
                              country: selected,
                              custom_fields: {
                                ...(prev.custom_fields || {}),
                                country_state: ""
                              }
                            }));
                          }}
                          className="h-11 w-full bg-[#0d0e1b] border border-white/10 rounded-xl px-3 font-semibold text-xs text-[#E8EAFF] focus:border-indigo-500 focus:ring-0 transition-all cursor-pointer"
                        >
                          <option value="" className="bg-[#080912]">Select Country...</option>
                          {countries.map((country) => (
                            <option key={country} value={country} className="bg-[#080912]">{country}</option>
                          ))}
                        </select>
                      </div>
                    );
                  }

                  return (
                    <div key={f} className="space-y-1.5">
                      <label className="text-[9px] font-black text-[var(--muted)] uppercase tracking-widest block mb-1">
                        {labelMap[f] || f}
                      </label>
                      <input
                        type={isEmail ? "email" : "text"}
                        disabled={isEmailChangeLocked}
                        value={(editForm as Record<string, string>)[f] || ""}
                        onChange={e => setEditForm(prev => ({ ...prev, [f]: e.target.value }))}
                        className={`input ${isEmailChangeLocked ? "opacity-50 cursor-not-allowed bg-white/5" : ""}`}
                      />
                      {isEmailChangeLocked && (
                        <p className="text-[9px] text-indigo-400 mt-1 font-bold">Email address cannot be changed after registration.</p>
                      )}
                    </div>
                  );
                })}

                {editForm.country && (
                  (() => {
                    const countryField = formConfig?.fields?.find((field: any) => field.name === "country" || field.id === "country");
                    const selectedCountry = editForm.country || "";
                    const states = getStatesForCountry(countryStates, selectedCountry);
                    return (
                      <div className="space-y-1.5">
                        <label className="text-[9px] font-black text-[var(--muted)] uppercase tracking-widest block mb-1">
                          State / Province {(countryField?.is_required || false) && <span className="text-indigo-400 font-bold">*</span>}
                        </label>
                        {states.length > 0 ? (
                          <select
                            value={(editForm.custom_fields as any)?.["country_state"] || ""}
                            onChange={(e) => {
                              const selectedState = e.target.value;
                              setEditForm(prev => ({
                                ...prev,
                                custom_fields: {
                                  ...(prev.custom_fields || {}),
                                  country_state: selectedState
                                }
                              }));
                            }}
                            className="h-11 w-full bg-[#0d0e1b] border border-white/10 rounded-xl px-3 font-semibold text-xs text-[#E8EAFF] focus:border-indigo-500 focus:ring-0 transition-all cursor-pointer"
                          >
                            <option value="" className="bg-[#080912]">Select State...</option>
                            {states.map((state) => (
                              <option key={state} value={state} className="bg-[#080912]">{state}</option>
                            ))}
                          </select>
                        ) : (
                          <input
                            type="text"
                            placeholder="Enter state / province..."
                            value={(editForm.custom_fields as any)?.["country_state"] || ""}
                            onChange={(e) => {
                              const textState = e.target.value;
                              setEditForm(prev => ({
                                ...prev,
                                custom_fields: {
                                  ...(prev.custom_fields || {}),
                                  country_state: textState
                                }
                              }));
                            }}
                            className="input text-xs"
                          />
                        )}
                      </div>
                    );
                  })()
                )}
              </div>

              {/* Custom Fields Edit Section */}
              {formConfig?.fields?.filter((field: any) => !field.is_default && field.is_active).length > 0 && (
                <div className="pt-6 border-t border-white/5 space-y-4">
                  <h4 className="text-[10px] font-black text-indigo-400 uppercase tracking-[0.2em] mb-4">Event Requirements</h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {formConfig.fields.filter((field: any) => !field.is_default && field.is_active).map((field: any) => {
                      const value = (editForm.custom_fields as Record<string, any>)?.[field.name] || "";
                      const handleCustomFieldChange = (val: any) => {
                        setEditForm(prev => ({
                          ...prev,
                          custom_fields: {
                            ...(prev.custom_fields || {}),
                            [field.name]: val
                          }
                        }));
                      };

                      if (field.type === "select") {
                        return (
                          <div key={field.id} className="space-y-1.5">
                            <label className="text-[9px] font-black text-[var(--muted)] uppercase tracking-widest block mb-1">
                              {field.label} {field.is_required && <span className="text-indigo-400">*</span>}
                            </label>
                            <select
                              value={value}
                              onChange={(e) => handleCustomFieldChange(e.target.value)}
                              className="h-11 w-full bg-[#0d0e1b] border border-white/10 rounded-xl px-3 font-semibold text-xs text-[#E8EAFF] focus:border-indigo-500 focus:ring-0 transition-all cursor-pointer"
                            >
                              <option value="" className="bg-[#080912]">Select an option...</option>
                              {field.options?.map((opt: string) => (
                                <option key={opt} value={opt} className="bg-[#080912]">{opt}</option>
                              ))}
                            </select>
                          </div>
                        );
                      }

                      if (field.type === "checkbox") {
                        const isChecked = !!value;
                        return (
                          <div key={field.id} className="sm:col-span-2 py-1">
                            <label className="flex items-start gap-3 cursor-pointer select-none group">
                              <div className={`mt-0.5 h-4 w-4 rounded border flex items-center justify-center shrink-0 transition-all ${isChecked ? "bg-indigo-500 border-indigo-500" : "bg-white/5 border-white/20 group-hover:border-indigo-400/50"
                                }`}>
                                <input
                                  type="checkbox"
                                  checked={isChecked}
                                  onChange={(e) => handleCustomFieldChange(e.target.checked)}
                                  className="sr-only"
                                />
                                {isChecked && <Check className="h-2.5 w-2.5 text-white" />}
                              </div>
                              <span className="text-[10px] font-bold text-[var(--muted)] uppercase tracking-wider leading-relaxed text-left group-hover:text-[#E8EAFF] transition-colors">
                                {field.label} {field.is_required && <span className="text-indigo-400">*</span>}
                              </span>
                            </label>
                          </div>
                        );
                      }

                      if (field.type === "image" || field.type === "file") {
                        return (
                          <div key={field.id} className="sm:col-span-2 space-y-1.5">
                            <label className="text-[9px] font-black text-[var(--muted)] uppercase tracking-widest block mb-1">
                              {field.label} {field.is_required && <span className="text-indigo-400">*</span>}
                            </label>
                            <div className="flex gap-2">
                              <input
                                type="text"
                                placeholder={`Enter ${field.label.toLowerCase()} URL...`}
                                value={value}
                                onChange={(e) => handleCustomFieldChange(e.target.value)}
                                className="input flex-1 text-xs"
                              />
                              <label className="px-4 py-2.5 rounded-xl bg-white/5 border border-white/10 text-[10px] font-black text-[#E8EAFF] hover:bg-indigo-500/20 hover:border-indigo-500/30 transition-all cursor-pointer uppercase tracking-wider flex items-center justify-center shrink-0">
                                Upload
                                <input
                                  type="file"
                                  accept={field.type === "image" ? "image/*" : "*"}
                                  onChange={async (e) => {
                                    const file = e.target.files?.[0];
                                    if (!file) return;

                                    if (field.type === "image") {
                                      const reader = new FileReader();
                                      reader.onload = () => {
                                        if (typeof reader.result === "string") {
                                          setImageToEdit(reader.result);
                                          setEditingFieldId(field.id);
                                          setOriginalFileName(file.name);
                                          setCropAspect("1:1");
                                          setCropShape("rect");
                                          setFilterBrightness(100);
                                          setFilterContrast(100);
                                          setImageEditorOpen(true);
                                        }
                                      };
                                      reader.readAsDataURL(file);
                                    } else {
                                      const toastId = toast.loading(`Uploading ${field.label.toLowerCase()}...`);
                                      try {
                                        const fd = new FormData();
                                        fd.append("file", file);
                                        fd.append("field_name", field.label);
                                        if (data?.participant?.regno) {
                                          fd.append("regno", data.participant.regno);
                                        }
                                        if (data?.participant?.name) {
                                          fd.append("username", data.participant.name);
                                        }
                                        const res = await fetch(`${API_BASE}/api/v1/portal/registration/${eventId}/upload`, {
                                          method: "POST",
                                          body: fd,
                                        });
                                        const d = await res.json();
                                        if (!res.ok) throw new Error(d.detail || "Upload failed");
                                        handleCustomFieldChange(d.url);
                                        toast.success(`${field.label} uploaded!`, { id: toastId });
                                      } catch (err: any) {
                                        toast.error(err.message || "Failed to upload file.", { id: toastId });
                                      }
                                    }
                                  }}
                                  className="sr-only"
                                />
                              </label>
                            </div>
                          </div>
                        );
                      }

                      return (
                        <div key={field.id} className="space-y-1.5">
                          <label className="text-[9px] font-black text-[var(--muted)] uppercase tracking-widest block mb-1">
                            {field.label} {field.is_required && <span className="text-indigo-400">*</span>}
                          </label>
                          <input
                            type="text"
                            placeholder={`Enter ${field.label.toLowerCase()}...`}
                            value={value}
                            onChange={(e) => handleCustomFieldChange(e.target.value)}
                            className="input text-xs"
                          />
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            <div className="px-8 py-5 border-t border-white/5 bg-white/[0.01] shrink-0 flex gap-3 justify-end">
              <button onClick={() => setEditing(false)}
                className="px-6 h-11 rounded-xl bg-white/5 border border-white/10 text-[var(--muted)] font-black text-xs uppercase tracking-wider hover:bg-white/10 transition-all">
                Cancel
              </button>
              <button onClick={saveEdit} disabled={saving}
                className="btn-primary flex items-center gap-2 px-6 h-11 rounded-full font-bold">
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}

      {/* T&C Full Preview Modal */}
      {tcModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-4 animate-in fade-in duration-200">
          <div className="relative w-full max-w-2xl bg-[#0d0e1b] border border-indigo-500/20 rounded-[2.5rem] shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="px-8 py-5 border-b border-white/5 flex items-center justify-between bg-white/[0.01] shrink-0">
              <div className="flex items-center gap-2">
                <FileText className="h-4 w-4 text-indigo-400" />
                <h3 className="text-sm font-black uppercase tracking-[0.25em] text-[#E8EAFF]">Terms &amp; Conditions</h3>
              </div>
              <button
                onClick={() => setTcModalOpen(false)}
                className="h-8 w-8 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center text-[var(--muted)] hover:text-[#E8EAFF] transition-all"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="p-8 overflow-y-auto flex-1 prose prose-invert max-w-none text-left
              prose-headings:text-[#E8EAFF] prose-headings:font-black prose-headings:tracking-tight
              prose-h1:text-xl prose-h2:text-base prose-h3:text-sm prose-h4:text-xs
              prose-p:text-[var(--muted)] prose-p:text-sm prose-p:leading-relaxed
              prose-li:text-[var(--muted)] prose-li:text-sm
              prose-strong:text-[#E8EAFF] prose-em:text-indigo-300
              prose-a:text-indigo-400 prose-a:no-underline hover:prose-a:underline
              prose-hr:border-white/10 prose-ul:space-y-1 prose-ol:space-y-1">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {formConfig?.terms_and_conditions || "## Terms & Conditions\n\n1. Registration is non-transferable and non-refundable.\n2. Attendees must adhere to the Event Code of Conduct.\n3. The organizers reserve the right to modify the schedule without prior notice."}
              </ReactMarkdown>
            </div>
            <div className="px-8 py-5 border-t border-white/5 bg-white/[0.01] shrink-0 space-y-3">
              <label className="flex items-start gap-3 cursor-pointer select-none group">
                <div className={`mt-0.5 h-4 w-4 rounded border flex items-center justify-center shrink-0 transition-all ${agreedToTerms ? "bg-indigo-500 border-indigo-500" : "bg-white/5 border-white/20 group-hover:border-indigo-400/50"
                  }`}>
                  <input
                    type="checkbox"
                    checked={agreedToTerms}
                    onChange={(e) => setAgreedToTerms(e.target.checked)}
                    className="sr-only"
                  />
                  {agreedToTerms && <Check className="h-2.5 w-2.5 text-white" />}
                </div>
                <span className="text-[10px] font-bold text-[var(--muted)] uppercase tracking-wider leading-relaxed text-left group-hover:text-[#E8EAFF] transition-colors">
                  I have read and agree to the Terms &amp; Conditions above. <span className="text-indigo-400">*</span>
                </span>
              </label>
              <button
                type="button"
                onClick={() => setTcModalOpen(false)}
                className="w-full h-11 rounded-full btn-primary text-xs font-black uppercase tracking-widest font-bold"
              >
                {agreedToTerms ? "Agreed — Close" : "Close"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Floating Live Chat drawer */}
      <AnimatePresence>
        {chatOpen && (
          <div className="fixed bottom-6 right-6 z-50 w-full max-w-[360px] bg-[#0d0e1b] border border-indigo-500/20 rounded-[2rem] shadow-2xl overflow-hidden flex flex-col h-[450px] animate-in slide-in-from-bottom-6 fade-in duration-300">
            <div className="px-6 py-4 border-b border-white/5 flex items-center justify-between bg-gradient-to-r from-indigo-500/10 to-transparent">
              <div className="flex items-center gap-2">
                <div className="h-2 w-2 rounded-full bg-emerald-400 animate-ping" />
                <h3 className="text-xs font-black uppercase tracking-wider text-[#E8EAFF]">Live Support</h3>
              </div>
              <button
                onClick={() => setChatOpen(false)}
                className="h-7 w-7 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center text-[var(--muted)] hover:text-[#E8EAFF] transition-all"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Messages */}
            <div className="flex-1 p-6 overflow-y-auto space-y-4 text-left">
              {chatMessages.map((msg, i) => (
                <div key={i} className={`flex ${msg.sender === "user" ? "justify-end" : "justify-start"}`}>
                  <div className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-xs ${msg.sender === "user"
                      ? "bg-indigo-500 text-white rounded-tr-none"
                      : "bg-white/5 border border-white/5 text-[#E8EAFF] rounded-tl-none font-bold"
                    }`}>
                    {msg.text}
                  </div>
                </div>
              ))}
            </div>

            {/* Input */}
            <form onSubmit={handleSendChatMessage} className="p-4 border-t border-white/5 bg-black/40 flex gap-2">
              <input
                type="text"
                placeholder="Type a message..."
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                className="h-10 bg-[#080912] border border-white/10 rounded-xl px-3 font-semibold text-xs text-[#E8EAFF] focus:border-indigo-500 focus:ring-0 flex-1 outline-none"
              />
              <button
                type="submit"
                className="h-10 w-10 rounded-xl bg-indigo-500 hover:bg-indigo-600 flex items-center justify-center text-white shrink-0 transition-colors"
              >
                <Send className="h-4 w-4" />
              </button>
            </form>
          </div>
        )}
      </AnimatePresence>

      {/* OTP Verification Modal */}
      <AnimatePresence>
        {verifyingEmailChange && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-6 backdrop-blur-md bg-[#080912]/60 animate-in fade-in duration-200">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="glass-card rounded-[2.5rem] p-8 max-w-md w-full border border-indigo-500/20 text-center space-y-6"
            >
              <h3 className="text-sm font-black text-[#E8EAFF] uppercase tracking-[0.2em]">Verify Email Update</h3>
              <p className="text-xs font-bold text-[var(--muted)] leading-relaxed">
                An OTP has been sent to your new email address: <span className="text-indigo-400">{editForm.email}</span>.
                Please enter it below to confirm.
              </p>

              <div className="space-y-3">
                <input
                  type="text"
                  placeholder="6-DIGIT CODE"
                  maxLength={6}
                  value={otpInput}
                  onChange={(e) => setOtpInput(e.target.value.replace(/\D/g, ""))}
                  className="h-12 w-full text-center tracking-[0.4em] font-mono font-black bg-[#0d0e1b] border border-white/10 rounded-xl text-lg text-[#E8EAFF] focus:border-indigo-500 focus:ring-0 transition-all"
                />
                {otpError && <p className="text-[10px] font-black text-rose-400 uppercase tracking-wider">{otpError}</p>}
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => applyDetailsUpdate({ new_email: editForm.email, otp: otpInput })}
                  disabled={saving || otpInput.length < 6}
                  className="btn-primary flex-1 h-11 rounded-xl flex items-center justify-center gap-2 font-bold"
                >
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Verify & Save"}
                </button>
                <button
                  onClick={() => setVerifyingEmailChange(false)}
                  className="h-11 px-5 bg-white/5 border border-white/10 hover:bg-white/10 text-muted rounded-xl text-xs font-black uppercase tracking-wider transition-all"
                >
                  Cancel
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Image Editor & Cropper Dialog Modal */}
      {imageEditorOpen && imageToEdit && (
        <div className="fixed inset-0 bg-black/85 backdrop-blur-xl z-[9999] flex items-center justify-center animate-in fade-in duration-200 p-4 select-none">
          <div className="max-w-3xl w-full bg-zinc-950 border border-zinc-800 rounded-3xl shadow-2xl overflow-hidden flex flex-col h-[550px]">
            {/* Modal Header */}
            <div className="px-6 py-4 border-b border-zinc-850 flex items-center justify-between shrink-0">
              <div>
                <h3 className="text-sm font-black uppercase tracking-widest text-zinc-100 flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-indigo-500 animate-pulse" />
                  Image Studio Editor
                </h3>
                <span className="text-[9px] font-bold text-zinc-500 uppercase tracking-wider block mt-0.5">Crop, frame, and filter your image</span>
              </div>
              <button
                type="button"
                onClick={() => {
                  setImageEditorOpen(false);
                  setImageToEdit(null);
                }}
                className="p-1.5 bg-zinc-900 border border-zinc-800 rounded-full hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 transition-all"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Modal Content */}
            <div className="flex-1 min-h-0 flex flex-col md:flex-row">
              {/* Left Column: Visual Crop Preview Canvas Area */}
              <div className="flex-1 bg-zinc-900/40 border-b md:border-b-0 md:border-r border-zinc-805 p-6 flex flex-col items-center justify-center gap-4 relative overflow-hidden">
                <div className="relative select-none max-w-[450px] max-h-[350px] flex items-center justify-center">
                  <img
                    src={imageToEdit}
                    className="max-w-[450px] max-h-[350px] object-contain select-none pointer-events-none rounded-xl"
                    style={{
                      filter: `brightness(${filterBrightness}%) contrast(${filterContrast}%)`,
                    }}
                    onLoad={handleImageLoad}
                    alt="Visual Editor"
                  />

                  {/* Cropper Workspace Overlay */}
                  {imgSize.width > 0 && (
                    <div
                      style={{
                        position: "absolute",
                        width: imgSize.width,
                        height: imgSize.height,
                        top: "50%",
                        left: "50%",
                        transform: "translate(-50%, -50%)",
                      }}
                      className="overflow-hidden select-none cursor-default animate-in fade-in duration-150"
                      onMouseMove={handleMouseMove}
                      onMouseUp={handleMouseUp}
                      onMouseLeave={handleMouseUp}
                    >
                      {/* Dark Overlays for non-selected crop area */}
                      {/* Top Overlay */}
                      <div
                        style={{
                          position: "absolute",
                          top: 0,
                          left: 0,
                          width: "100%",
                          height: `${cropPercent.y * 100}%`,
                        }}
                        className="bg-black/60"
                      />
                      {/* Bottom Overlay */}
                      <div
                        style={{
                          position: "absolute",
                          top: `${(cropPercent.y + cropPercent.h) * 100}%`,
                          left: 0,
                          width: "100%",
                          height: `${(1 - (cropPercent.y + cropPercent.h)) * 100}%`,
                        }}
                        className="bg-black/60"
                      />
                      {/* Left Overlay */}
                      <div
                        style={{
                          position: "absolute",
                          top: `${cropPercent.y * 100}%`,
                          left: 0,
                          width: `${cropPercent.x * 100}%`,
                          height: `${cropPercent.h * 100}%`,
                        }}
                        className="bg-black/60"
                      />
                      {/* Right Overlay */}
                      <div
                        style={{
                          position: "absolute",
                          top: `${cropPercent.y * 100}%`,
                          left: `${(cropPercent.x + cropPercent.w) * 100}%`,
                          width: `${(1 - (cropPercent.x + cropPercent.w)) * 100}%`,
                          height: `${cropPercent.h * 100}%`,
                        }}
                        className="bg-black/60"
                      />

                      {/* Crop Box Selector Outline */}
                      <div
                        style={{
                          position: "absolute",
                          left: `${cropPercent.x * 100}%`,
                          top: `${cropPercent.y * 100}%`,
                          width: `${cropPercent.w * 100}%`,
                          height: `${cropPercent.h * 100}%`,
                          borderRadius: (cropShape === "circle" && cropAspect === "1:1") ? "50%" : "0px",
                        }}
                        className="border-2 border-indigo-500 shadow-[0_0_20px_rgba(99,102,241,0.3)] cursor-move"
                        onMouseDown={handleMouseDownMove}
                      >
                        {/* Grid lines helper */}
                        <div className="absolute inset-0 pointer-events-none border border-white/20 flex items-center justify-center">
                          <div className="w-full h-1/3 border-y border-white/20 absolute top-1/3" />
                          <div className="h-full w-1/3 border-x border-white/20 absolute left-1/3" />
                        </div>

                        {/* Resize Handles */}
                        {/* Corners */}
                        <div
                          onMouseDown={(e) => handleMouseDownResize(e, "tl")}
                          className="h-3 w-3 bg-white border-2 border-indigo-500 absolute -top-1.5 -left-1.5 rounded-sm shadow-md cursor-nwse-resize z-10 hover:scale-125 transition-transform"
                        />
                        <div
                          onMouseDown={(e) => handleMouseDownResize(e, "tr")}
                          className="h-3 w-3 bg-white border-2 border-indigo-500 absolute -top-1.5 -right-1.5 rounded-sm shadow-md cursor-nesw-resize z-10 hover:scale-125 transition-transform"
                        />
                        <div
                          onMouseDown={(e) => handleMouseDownResize(e, "bl")}
                          className="h-3 w-3 bg-white border-2 border-indigo-500 absolute -bottom-1.5 -left-1.5 rounded-sm shadow-md cursor-nesw-resize z-10 hover:scale-125 transition-transform"
                        />
                        <div
                          onMouseDown={(e) => handleMouseDownResize(e, "br")}
                          className="h-3 w-3 bg-white border-2 border-indigo-500 absolute -bottom-1.5 -right-1.5 rounded-sm shadow-md cursor-nwse-resize z-10 hover:scale-125 transition-transform"
                        />

                        {/* Edges - only show for freeform cropping */}
                        {cropAspect === "free" && (
                          <>
                            <div
                              onMouseDown={(e) => handleMouseDownResize(e, "t")}
                              className="h-1.5 w-5 bg-white border border-indigo-500 absolute -top-1 left-1/2 -translate-x-1/2 rounded-full shadow-md cursor-ns-resize z-10 hover:scale-110 transition-transform"
                            />
                            <div
                              onMouseDown={(e) => handleMouseDownResize(e, "b")}
                              className="h-1.5 w-5 bg-white border border-indigo-500 absolute -bottom-1 left-1/2 -translate-x-1/2 rounded-full shadow-md cursor-ns-resize z-10 hover:scale-110 transition-transform"
                            />
                            <div
                              onMouseDown={(e) => handleMouseDownResize(e, "l")}
                              className="h-5 w-1.5 bg-white border border-indigo-500 absolute top-1/2 -translate-y-1/2 -left-1 rounded-full shadow-md cursor-ew-resize z-10 hover:scale-110 transition-transform"
                            />
                            <div
                              onMouseDown={(e) => handleMouseDownResize(e, "r")}
                              className="h-5 w-1.5 bg-white border border-indigo-500 absolute top-1/2 -translate-y-1/2 -right-1 rounded-full shadow-md cursor-ew-resize z-10 hover:scale-110 transition-transform"
                            />
                          </>
                        )}
                      </div>
                    </div>
                  )}
                </div>
                <span className="text-[9px] font-black text-indigo-400 uppercase tracking-widest bg-indigo-500/10 px-3 py-1 rounded-full border border-indigo-500/20">
                  Drag corners to crop • Drag box to move
                </span>
              </div>

              {/* Right Column: Settings Panel */}
              <div className="w-full md:w-[280px] p-6 overflow-y-auto space-y-4 flex flex-col justify-start bg-zinc-950">
                {/* Crop Shapes and Aspect Ratios */}
                <div className="space-y-2">
                  <label className="text-[9px] font-black uppercase tracking-wider text-zinc-500 block">Aspect Ratio</label>
                  <div className="grid grid-cols-2 gap-2">
                    {(["1:1", "4:3", "16:9", "free"] as const).map(ratio => (
                      <button
                        key={ratio}
                        type="button"
                        onClick={() => handleSelectAspect(ratio)}
                        className={`h-7 px-2.5 rounded-xl border text-[9px] font-bold uppercase tracking-wider transition-all ${cropAspect === ratio ? "bg-indigo-500 border-indigo-500 text-white shadow-lg shadow-indigo-500/20" : "bg-zinc-900 border-zinc-800 text-zinc-400 hover:border-zinc-700"}`}
                      >
                        {ratio === "free" ? "Freeform" : ratio}
                      </button>
                    ))}
                  </div>
                </div>

                {cropAspect === "1:1" && (
                  <div className="space-y-2">
                    <label className="text-[9px] font-black uppercase tracking-wider text-zinc-500 block">Frame Shape</label>
                    <div className="grid grid-cols-2 gap-2">
                      {(["rect", "circle"] as const).map(shape => (
                        <button
                          key={shape}
                          type="button"
                          onClick={() => setCropShape(shape)}
                          className={`h-7 px-2.5 rounded-xl border text-[9px] font-bold uppercase tracking-wider transition-all ${cropShape === shape ? "bg-indigo-500 border-indigo-500 text-white shadow-lg shadow-indigo-500/20" : "bg-zinc-900 border-zinc-800 text-zinc-400 hover:border-zinc-700"}`}
                        >
                          {shape === "rect" ? "Square" : "Circular"}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Brightness & Contrast filters */}
                <div className="space-y-3 pt-3 border-t border-zinc-900">
                  <div className="space-y-1">
                    <div className="flex items-center justify-between text-[9px] font-bold text-zinc-400 uppercase tracking-wider">
                      <span>Brightness</span>
                      <span className="text-indigo-400 font-mono text-[10px]">{filterBrightness}%</span>
                    </div>
                    <input
                      type="range"
                      min="50"
                      max="150"
                      value={filterBrightness}
                      onChange={e => setFilterBrightness(parseInt(e.target.value))}
                      className="w-full h-1 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-indigo-500"
                    />
                  </div>

                  <div className="space-y-1">
                    <div className="flex items-center justify-between text-[9px] font-bold text-zinc-400 uppercase tracking-wider">
                      <span>Contrast</span>
                      <span className="text-indigo-400 font-mono text-[10px]">{filterContrast}%</span>
                    </div>
                    <input
                      type="range"
                      min="50"
                      max="150"
                      value={filterContrast}
                      onChange={e => setFilterContrast(parseInt(e.target.value))}
                      className="w-full h-1 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-indigo-500"
                    />
                  </div>
                </div>

                <div className="pt-4 border-t border-zinc-900 mt-auto flex gap-2">
                  <button
                    type="button"
                    onClick={handleCropSubmit}
                    className="flex-grow h-9 px-4 bg-indigo-500 hover:bg-indigo-600 text-white font-black uppercase tracking-widest text-[9px] rounded-xl flex items-center justify-center gap-1.5 transition-all shadow-lg shadow-indigo-500/10"
                  >
                    <Check className="h-3.5 w-3.5" />
                    Crop & Upload
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setImageEditorOpen(false);
                      setImageToEdit(null);
                    }}
                    className="h-9 px-3 bg-zinc-900 border border-zinc-800 hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 font-black uppercase tracking-widest text-[9px] rounded-xl transition-all"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Custom PDFViewerModal */}
      {pdfViewerUrl && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/85 backdrop-blur-md p-4 animate-in fade-in duration-200">
          <div className="relative w-full max-w-4xl bg-[#0d0e1b] border border-indigo-500/20 rounded-[2.5rem] shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="px-8 py-5 border-b border-white/5 flex items-center justify-between bg-white/[0.01] shrink-0">
              <div className="flex items-center gap-2">
                <FileText className="h-4 w-4 text-indigo-400" />
                <h3 className="text-sm font-black uppercase tracking-[0.25em] text-[#E8EAFF] truncate max-w-[200px] sm:max-w-md">
                  {pdfViewerTitle}
                </h3>
              </div>
              <button
                onClick={() => {
                  setPdfViewerUrl(null);
                  setPdfViewerTitle("");
                }}
                className="h-8 w-8 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center text-[var(--muted)] hover:text-[#E8EAFF] transition-all"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="p-4 flex-1 bg-black/20">
              <iframe
                src={pdfViewerUrl}
                className="w-full h-[65vh] rounded-2xl border border-white/10 bg-white"
                title="PDF Document Viewer"
              />
            </div>
            <div className="px-8 py-4 border-t border-white/5 bg-white/[0.01] shrink-0 flex justify-end">
              <button
                onClick={() => {
                  setPdfViewerUrl(null);
                  setPdfViewerTitle("");
                }}
                className="px-6 h-10 rounded-xl bg-white/5 border border-white/10 text-[var(--muted)] font-black text-xs uppercase tracking-wider hover:bg-white/10 transition-all"
              >
                Close Viewer
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Image Lightbox Modal */}
      {lightboxImageUrl && (
        <div
          className="fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-black/95 backdrop-blur-md p-4 animate-in fade-in duration-200"
          onClick={() => {
            setLightboxImageUrl(null);
            setLightboxTitle("");
          }}
        >
          <div className="absolute top-4 right-4 flex items-center gap-3 z-10">
            <span className="text-xs font-black text-white/60 uppercase tracking-widest bg-white/5 border border-white/10 px-3 py-1 rounded-full">
              {lightboxTitle}
            </span>
            <button
              onClick={() => {
                setLightboxImageUrl(null);
                setLightboxTitle("");
              }}
              className="h-9 w-9 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-all"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
          <div className="max-w-4xl max-h-[85vh] overflow-hidden rounded-2xl border border-white/10 shadow-2xl relative" onClick={(e) => e.stopPropagation()}>
            <img
              src={lightboxImageUrl}
              alt={lightboxTitle}
              className="max-w-full max-h-[85vh] object-contain rounded-2xl"
            />
          </div>
        </div>
      )}
    </div>
  );
}
