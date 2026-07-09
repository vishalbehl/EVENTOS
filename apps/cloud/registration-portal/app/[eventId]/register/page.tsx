"use client";

import { useEffect, useState, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  Globe, AlertCircle, Calendar, CheckCircle2, ChevronRight,
  Upload, FileText, Check, Copy, ArrowLeft, ArrowRight, ShieldCheck,
  MapPin, Loader2, Sparkles, Building, User, Mail, Phone, Map, Users, X, Crop
} from "lucide-react";
import { toast } from "sonner";
import { CountryStateEntry, fetchCountryStates, getAllowedCountries, getStatesForCountry } from "@/lib/country-states";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

interface FormField {
  id: string;
  name: string;
  label: string;
  type: string; // text, date, select, checkbox, file, image
  is_default: boolean;
  is_required: boolean;
  is_active: boolean;
  options?: string[];
  placeholder?: string;
}

interface FormConfig {
  event_name: string;
  theme_color: string;
  logo_url?: string;
  is_live: boolean;
  fields: FormField[];
  payment_enabled?: boolean;
  currency?: string;
  active_prices?: Record<string, number>;
  active_gateway?: string;
  terms_and_conditions?: string;
  branding_settings?: Record<string, any>;
  start_date?: string;
  end_date?: string;
  location?: string;
  venue_name?: string;
  organizer_name?: string;
}

const THEME_PRESETS: Record<string, { bg: string, surf: string, card: string, color: string, sec: string }> = {
  midnight: { bg: '#080410', surf: '#120924', card: '#1d0f3a', color: '#7c3aed', sec: '#a78bfa' },
  ocean: { bg: '#060f1e', surf: '#0a182f', card: '#112547', color: '#0ea5e9', sec: '#38bdf8' },
  emerald: { bg: '#040f0c', surf: '#071914', card: '#0f2a22', color: '#10b981', sec: '#34d399' },
  sunset: { bg: '#0f0b04', surf: '#181107', card: '#2a1d0c', color: '#f59e0b', sec: '#fbbf24' },
  rose: { bg: '#0f0508', surf: '#190a10', card: '#2a101b', color: '#f43f5e', sec: '#fb7185' },
  slate: { bg: '#0b0f17', surf: '#151e2e', card: '#202c3f', color: '#94a3b8', sec: '#cbd5e1' },
};

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

export default function PublicRegistrationPortal() {
  const { eventId } = useParams();
  const router = useRouter();
  const apiBase = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [config, setConfig] = useState<FormConfig | null>(null);
  const [loginEmail, setLoginEmail] = useState("");

  const [activeSlide, setActiveSlide] = useState(0);

  const selectedThemeId = config?.branding_settings?.theme || 'midnight';
  const themeColors = THEME_PRESETS[selectedThemeId] || THEME_PRESETS.midnight;

  const defaultHeaderBanners = [
    "https://images.unsplash.com/photo-1540575467063-178a50c2df87?q=80&w=2070",
    "https://images.unsplash.com/photo-1505373877841-8d25f7d46678?q=80&w=2012",
    "https://images.unsplash.com/photo-1511578314322-379afb476865?q=80&w=2069"
  ];

  useEffect(() => {
    const banners = config?.branding_settings?.header_images;
    if (!banners || banners.length <= 1) return;
    const interval = setInterval(() => {
      setActiveSlide(prev => (prev + 1) % banners.length);
    }, 5000);
    return () => clearInterval(interval);
  }, [config]);

  const getJourneySteps = () => {
    const steps = [
      { id: "email", label: "Verify Email", status: "completed" },
      { id: "form", label: "Intake Form", status: formStep === "form" && !successData ? "active" : (formStep === "preview" || successData ? "completed" : "pending") },
      { id: "review", label: "Review Details", status: formStep === "preview" && !successData ? "active" : (successData ? "completed" : "pending") }
    ];

    const isPaid = config?.payment_enabled && getTicketBasePrice() > 0;
    if (isPaid) {
      steps.push({
        id: "payment",
        label: "Payment",
        status: successData ? "completed" : "pending"
      });
    }

    steps.push({
      id: "complete",
      label: isPaid ? "Pass Issued" : "Registered",
      status: successData ? "active" : "pending"
    });

    return steps;
  };

  // Form submission state
  const [formData, setFormData] = useState<Record<string, any>>({});
  const [uploadingField, setUploadingField] = useState<string | null>(null);
  const [countryStates, setCountryStates] = useState<CountryStateEntry[]>([]);

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
    const field = config?.fields?.find((f: any) => f.id === fieldId) || { label: fieldId };
    setUploadingField(fieldId);
    try {
      const uploadForm = new FormData();
      uploadForm.append("file", file);
      uploadForm.append("field_name", field.label);
      const fullNameVal = formData.name || `${formData.first_name || ""} ${formData.last_name || ""}`.trim() || "";
      if (fullNameVal) {
        uploadForm.append("username", fullNameVal);
      }

      const res = await fetch(`${apiBase}/api/v1/portal/registration/${eventId}/upload`, {
        method: "POST",
        body: uploadForm
      });

      if (!res.ok) {
        throw new Error("Upload failed");
      }

      const data = await res.json();
      if (data.status === "success" && data.url) {
        handleInputChange(fieldId, data.url);
        toast.success(`Uploaded ${file.name} successfully!`);
      } else {
        throw new Error("Invalid response format");
      }
    } catch (err) {
      console.error(err);
      toast.error("File upload failed. Please try again.");
    } finally {
      setUploadingField(null);
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

  // Payment states
  const [promoCode, setPromoCode] = useState("");
  const [validatingPromo, setValidatingPromo] = useState(false);
  const [appliedPromo, setAppliedPromo] = useState<{
    code: string;
    discount_amount: number;
    total_price: number;
  } | null>(null);
  const [verifyingPayment, setVerifyingPayment] = useState(false);

  // Registration success state
  const [successData, setSuccessData] = useState<{
    regno: string;
    name: string;
    role: string;
    message: string;
    status?: string;
    waitlist_position?: number;
  } | null>(null);

  const [copied, setCopied] = useState(false);
  const [formStep, setFormStep] = useState<"form" | "preview">("form");
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [countdown, setCountdown] = useState(10);
  const [tcModalOpen, setTcModalOpen] = useState(false);

  const getEffectiveFieldType = (field: FormField) => {
    if (field.id === "email") return "email";
    if (field.id === "phone") return "phone";
    if (field.id === "country") return "country";
    if (field.id === "role") return "select";
    return field.type;
  };

  useEffect(() => {
    if (!eventId) return;
    const token = localStorage.getItem(`portal_token_${eventId}`);
    if (!token) {
      toast.error("Please login first to access the registration form.");
      router.push(`/${eventId}/login`);
      return;
    }

    const checkRegistrationStatus = async () => {
      try {
        const res = await fetch(`${apiBase}/api/v1/portal/dashboard`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (res.status === 401) {
          localStorage.removeItem(`portal_token_${eventId}`);
          router.push(`/${eventId}/login`);
          return;
        }
        if (res.ok) {
          const d = await res.json();
          const status = d.registration?.status;
          const isReg = ["submitted", "pending_review", "approved", "waitlisted", "rejected"].includes(status);
          if (isReg) {
            router.replace(`/${eventId}/dashboard`);
            return;
          }
        }
      } catch (e) {
        console.error("Failed to check registration status:", e);
      }
      fetchFormConfig();
    };

    checkRegistrationStatus();
  }, [eventId]);

  useEffect(() => {
    fetchCountryStates().then(setCountryStates);
  }, []);

  useEffect(() => {
    if (!eventId) return;
    const queryParams = new URLSearchParams(window.location.search);
    const statusParam = queryParams.get("status");
    const sessionId = queryParams.get("session_id");

    if (statusParam === "success" && sessionId) {
      verifyRedirectPayment(sessionId);
    }
  }, [eventId]);

  useEffect(() => {
    if (!successData) return;
    setCountdown(10);
    const timer = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) {
          clearInterval(timer);
          router.push(`/${eventId}/dashboard`);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [successData, eventId, router]);

  const verifyRedirectPayment = async (sessionId: string) => {
    setVerifyingPayment(true);
    try {
      const gateway = sessionId.startsWith("sim_") ? "simulated" : "stripe";
      const res = await fetch(`${apiBase}/api/v1/portal/registration/${eventId}/payment/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          gateway,
          session_id: sessionId
        })
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.detail || "Payment verification failed.");
      }
      setSuccessData({
        regno: data.regno,
        name: data.name,
        role: data.role,
        message: data.message,
        status: data.status
      });
      toast.success("Payment verified successfully!");
      // Clear URL query parameters
      router.replace(`/${eventId}/register`);
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || "Failed to verify your payment.");
    } finally {
      setVerifyingPayment(false);
    }
  };

  const getTicketBasePrice = () => {
    const selectedRole = formData.role || "";
    if (!config?.payment_enabled || !config?.active_prices) return 0;
    return config.active_prices[selectedRole] || 0;
  };

  const getTicketPrice = () => {
    const base = getTicketBasePrice();
    if (appliedPromo) {
      return appliedPromo.total_price;
    }
    return base;
  };

  const handleApplyPromo = async () => {
    if (!promoCode.trim()) return;
    setValidatingPromo(true);
    try {
      const selectedRole = formData.role || "";
      const res = await fetch(`${apiBase}/api/v1/portal/registration/${eventId}/promo/validate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: promoCode,
          role: selectedRole
        })
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.detail || "Invalid promo code.");
      }
      setAppliedPromo({
        code: data.code,
        discount_amount: data.discount_amount,
        total_price: data.total_price
      });
      toast.success(`Promo code applied! Saved ${config?.currency || "INR"} ${data.discount_amount}`);
    } catch (err: any) {
      toast.error(err.message || "Failed to apply promo code.");
      setAppliedPromo(null);
    } finally {
      setValidatingPromo(false);
    }
  };

  const handleRazorpayPayment = async (details: any) => {
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
      setSubmitting(false);
      return;
    }

    const options = {
      key: details.key_id,
      amount: details.amount,
      currency: details.currency,
      name: config?.event_name || "Event Registration",
      description: `Registration for ${formData.role}`,
      order_id: details.gateway_order_id,
      handler: async function (response: any) {
        setSubmitting(true);
        try {
          const verifyRes = await fetch(`${apiBase}/api/v1/portal/registration/${eventId}/payment/verify`, {
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
          if (!verifyRes.ok) {
            throw new Error(verifyData.detail || "Payment verification failed.");
          }
          setSuccessData({
            regno: verifyData.regno,
            name: verifyData.name,
            role: verifyData.role,
            message: verifyData.message,
            status: verifyData.status
          });
          toast.success("Payment completed successfully!");
        } catch (err: any) {
          toast.error(err.message || "Failed to verify Razorpay payment.");
        } finally {
          setSubmitting(false);
        }
      },
      prefill: {
        name: formData.name || `${formData.first_name || ""} ${formData.last_name || ""}`.trim() || "",
        email: formData.email || "",
        contact: formData.phone || ""
      },
      theme: {
        color: config?.theme_color || "#6366F1"
      },
      modal: {
        ondismiss: function () {
          setSubmitting(false);
        }
      }
    };

    const rzp = new (window as any).Razorpay(options);
    rzp.open();
  };

  const fetchFormConfig = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${apiBase}/api/v1/portal/registration/${eventId}/form?t=${Date.now()}`, {
        cache: "no-store"
      });
      if (!res.ok) {
        throw new Error("Failed to fetch event registration form.");
      }
      const data: FormConfig = await res.json();
      setConfig(data);

      // Initialize default values
      const initialForm: Record<string, any> = {};
      data.fields.forEach(f => {
        if (f.is_active) {
          const fieldType = getEffectiveFieldType(f);
          if (fieldType === "checkbox") {
            initialForm[f.id] = [];
          } else if (fieldType === "select") {
            initialForm[f.id] = f.options && f.options.length > 0 ? f.options[0] : "";
          } else if (fieldType === "country") {
            initialForm[f.id] = f.options && f.options.length === 1 ? f.options[0] : "";
            initialForm[`${f.id}_state`] = "";
          } else {
            initialForm[f.id] = "";
          }
        }
      });

      // Parse email from token and merge it
      const token = localStorage.getItem(`portal_token_${eventId}`);
      if (token) {
        try {
          const base64Url = token.split('.')[1];
          const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
          const jsonPayload = decodeURIComponent(atob(base64).split('').map(function (c) {
            return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
          }).join(''));
          const payload = JSON.parse(jsonPayload);
          if (payload && payload.email) {
            setLoginEmail(payload.email);
            initialForm["email"] = payload.email;
          }
        } catch (e) {
          console.error("Failed to parse token email", e);
        }
      }

      setFormData(initialForm);
    } catch (err: any) {
      console.error(err);
      toast.error("Could not fetch registration form. Please check the URL.");
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (fieldId: string, value: any) => {
    setFormData(prev => ({
      ...prev,
      [fieldId]: value
    }));
    if (fieldId === "role") {
      setAppliedPromo(null);
      setPromoCode("");
    }
  };

  const handleCheckboxChange = (fieldId: string, option: string, checked: boolean) => {
    const current = formData[fieldId] || [];
    let updated: string[];
    if (checked) {
      updated = [...current, option];
    } else {
      updated = current.filter((o: string) => o !== option);
    }
    handleInputChange(fieldId, updated);
  };

  // Upload file to backend storage
  const handleFileUpload = async (fieldId: string, file: File) => {
    const field = config?.fields?.find((f: any) => f.id === fieldId);
    const fieldType = field ? getEffectiveFieldType(field) : "file";

    if (fieldType === "image") {
      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result === "string") {
          setImageToEdit(reader.result);
          setEditingFieldId(fieldId);
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
      await executeFileUpload(fieldId, file);
    }
  };

  const handleProceedToPreview = (e: React.FormEvent) => {
    e.preventDefault();
    if (!config) return;

    // Validate required fields
    const missingFields: string[] = [];
    config.fields.forEach(field => {
      if (field.is_active && field.is_required) {
        const fieldType = getEffectiveFieldType(field);
        const val = formData[field.id];
        if (val === undefined || val === null || (typeof val === "string" && !val.trim()) || (Array.isArray(val) && val.length === 0)) {
          missingFields.push(field.label);
        }
        // Validate state for country type
        if (fieldType === "country" && typeof val === "string" && val.trim()) {
          const stateVal = formData[`${field.id}_state`];
          if (!stateVal || (typeof stateVal === "string" && !stateVal.trim())) {
            missingFields.push("State/Province");
          }
        }
      }
    });

    if (missingFields.length > 0) {
      toast.error(`Please fill in the required fields: ${missingFields.join(", ")}`);
      return;
    }

    // Format validation
    let validationError = "";
    config.fields.forEach(field => {
      if (field.is_active) {
        const fieldType = getEffectiveFieldType(field);
        const val = formData[field.id];
        if (val && typeof val === "string" && val.trim()) {
          const stripped = val.trim();
          if (fieldType === "email") {
            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            if (!emailRegex.test(stripped)) {
              validationError = `Please enter a valid email address for '${field.label}'.`;
            }
          } else if (fieldType === "phone") {
            let foundCc = "";
            for (const cc of countryCodes) {
              if (stripped.startsWith(cc.code)) {
                foundCc = cc.code;
                break;
              }
            }
            const numPart = foundCc ? stripped.slice(foundCc.length) : stripped;
            if (numPart.length < 7 || numPart.length > 15 || !/^\d+$/.test(numPart)) {
              validationError = `Phone number for '${field.label}' must contain numbers only and be between 7 and 15 digits.`;
            }
          }
        }
      }
    });

    if (validationError) {
      toast.error(validationError);
      return;
    }

    setFormStep("preview");
  };

  const handleFinalSubmit = async () => {
    if (!config) return;
    if (!agreedToTerms) {
      toast.error("Please accept the Terms & Conditions to proceed.");
      return;
    }

    setSubmitting(true);
    try {
      if (config.payment_enabled && getTicketPrice() > 0) {
        const checkoutRes = await fetch(`${apiBase}/api/v1/portal/registration/${eventId}/payment/checkout`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            formData: formData,
            promo_code: appliedPromo ? appliedPromo.code : null,
            redirect_base_url: window.location.origin + `/${eventId}/register`
          })
        });
        const checkoutData = await checkoutRes.json();
        if (!checkoutRes.ok) {
          throw new Error(checkoutData.detail || "Checkout initialization failed.");
        }

        if (checkoutData.checkout_required) {
          const { provider, checkout_url } = checkoutData.payment_details;
          if (provider === "stripe" || provider === "simulated") {
            toast.loading("Redirecting to payment gateway...");
            window.location.href = checkout_url;
            return;
          } else if (provider === "razorpay") {
            await handleRazorpayPayment(checkoutData.payment_details);
            return;
          }
        } else {
          setSuccessData({
            regno: checkoutData.regno,
            name: checkoutData.name,
            role: checkoutData.role,
            message: checkoutData.message,
            status: checkoutData.status,
            waitlist_position: checkoutData.waitlist_position
          });
          toast.success(checkoutData.status === "waitlisted" ? "Added to waitlist!" : "Registration submitted!");
        }
      } else {
        const res = await fetch(`${apiBase}/api/v1/portal/registration/${eventId}/register`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(formData)
        });

        const result = await res.json();
        if (!res.ok) {
          throw new Error(result.detail || "Registration failed.");
        }

        setSuccessData({
          regno: result.regno,
          name: result.name,
          role: result.role,
          message: result.message,
          status: result.status,
          waitlist_position: result.waitlist_position
        });
        toast.success(result.status === "waitlisted" ? "Added to waitlist!" : "Registration submitted!");
      }
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || "Something went wrong during registration.");
    } finally {
      setSubmitting(false);
    }
  };

  const copyRegNo = () => {
    if (!successData) return;
    navigator.clipboard.writeText(successData.regno);
    setCopied(true);
    toast.success("Registration number copied!");
    setTimeout(() => setCopied(false), 2000);
  };

  const getFieldIcon = (fieldId: string) => {
    switch (fieldId) {
      case "name":
      case "first_name":
      case "last_name": return <User className="h-4 w-4 text-indigo-400" />;
      case "email": return <Mail className="h-4 w-4 text-indigo-400" />;
      case "phone": return <Phone className="h-4 w-4 text-indigo-400" />;
      case "company": return <Building className="h-4 w-4 text-indigo-400" />;
      case "designation": return <Sparkles className="h-4 w-4 text-indigo-400" />;
      case "country": return <Map className="h-4 w-4 text-indigo-400" />;
      case "role": return <Users className="h-4 w-4 text-indigo-400" />;
      default: return null;
    }
  };

  const getCountryChoices = (field: FormField) => getAllowedCountries(field.options, countryStates);

  // Render Skeleton Loaders
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <style dangerouslySetInnerHTML={{
          __html: `
          :root {
            --base: ${themeColors.bg};
            --surf: ${themeColors.surf};
            --card: ${themeColors.card};
            --pri: ${themeColors.color};
            --sec: ${themeColors.sec};
          }
        `}} />
        <div className="w-full max-w-xl space-y-6">
          <div className="h-8 bg-white/5 animate-pulse rounded-xl w-1/3 mx-auto" />
          <div className="h-32 bg-white/5 animate-pulse rounded-[2.5rem]" />
          <div className="space-y-4">
            <div className="h-12 bg-white/5 animate-pulse rounded-xl" />
            <div className="h-12 bg-white/5 animate-pulse rounded-xl" />
            <div className="h-12 bg-white/5 animate-pulse rounded-xl" />
          </div>
        </div>
      </div>
    );
  }

  // Verifying Payment screen
  if (verifyingPayment) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <style dangerouslySetInnerHTML={{
          __html: `
          :root {
            --base: ${themeColors.bg};
            --surf: ${themeColors.surf};
            --card: ${themeColors.card};
            --pri: ${themeColors.color};
            --sec: ${themeColors.sec};
          }
        `}} />
        <div className="glass-3d p-10 text-center rounded-[2.5rem] bg-[#0d0e1b]/85 border border-indigo-500/20 space-y-4">
          <Loader2 className="h-10 w-10 text-indigo-400 mx-auto animate-spin" />
          <p className="text-[#E8EAFF] font-black uppercase tracking-[0.2em] text-[10px]">Verifying payment, please wait...</p>
        </div>
      </div>
    );
  }

  // Render Portal Inactive state
  if (!config || !config.is_live) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-6">
        <style dangerouslySetInnerHTML={{
          __html: `
          :root {
            --base: ${themeColors.bg};
            --surf: ${themeColors.surf};
            --card: ${themeColors.card};
            --pri: ${themeColors.color};
            --sec: ${themeColors.sec};
          }
        `}} />
        <motion.div
          initial={{ scale: 0.95, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="glass-3d p-10 max-w-md text-center border-rose-500/10 rounded-[2.5rem] bg-indigo-950/5 relative overflow-hidden"
        >
          <div className="absolute top-0 right-0 w-24 h-24 bg-rose-500/10 rounded-full blur-2xl pointer-events-none" />
          <div className="h-20 w-20 rounded-full bg-rose-500/10 border border-rose-500/20 flex items-center justify-center mx-auto mb-6">
            <AlertCircle className="h-10 w-10 text-rose-400 animate-pulse" />
          </div>
          <h1 className="text-2xl font-black mb-4 text-[#E8EAFF] uppercase tracking-tighter">Registration Closed</h1>
          <p className="text-muted font-bold text-sm mb-6 leading-relaxed">
            The registration portal for <span className="text-indigo-400">{config?.event_name || "this event"}</span> is currently inactive or draft.
          </p>
          <div className="text-[10px] font-black text-muted uppercase tracking-[0.4em] opacity-40">
            EventX OS Intelligence Desk
          </div>
        </motion.div>
      </div>
    );
  }

  // Render Success receipt Screen
  if (successData) {
    const isWaitlisted = successData.status === "waitlisted";
    const isSubmitted = successData.status === "submitted";

    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <style dangerouslySetInnerHTML={{
          __html: `
          :root {
            --base: ${themeColors.bg};
            --surf: ${themeColors.surf};
            --card: ${themeColors.card};
            --pri: ${themeColors.color};
            --sec: ${themeColors.sec};
          }
        `}} />
        <motion.div
          initial={{ scale: 0.95, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className={`glass-3d p-10 max-w-lg w-full text-center rounded-[3rem] bg-[#0d0e1b]/80 relative overflow-hidden space-y-8 border ${isWaitlisted
              ? "border-amber-500/20"
              : isSubmitted
                ? "border-indigo-500/20"
                : "border-emerald-500/20"
            }`}
        >
          <div className={`absolute top-0 right-0 w-32 h-32 rounded-full blur-3xl pointer-events-none ${isWaitlisted
              ? "bg-amber-500/10"
              : isSubmitted
                ? "bg-indigo-500/10"
                : "bg-emerald-500/10"
            }`} />

          <div className={`h-20 w-20 rounded-full flex items-center justify-center mx-auto border ${isWaitlisted
              ? "bg-amber-500/10 border-amber-500/20"
              : isSubmitted
                ? "bg-indigo-500/10 border-indigo-500/20"
                : "bg-emerald-500/10 border-emerald-500/20"
            }`}>
            {isWaitlisted ? (
              <AlertCircle className="h-10 w-10 text-amber-400 animate-pulse" />
            ) : isSubmitted ? (
              <Loader2 className="h-10 w-10 text-indigo-400 animate-spin" />
            ) : (
              <CheckCircle2 className="h-10 w-10 text-emerald-400 animate-bounce" />
            )}
          </div>

          <div className="space-y-2">
            <span className={`text-[9px] font-black uppercase tracking-[0.3em] block ${isWaitlisted
                ? "text-amber-400"
                : isSubmitted
                  ? "text-indigo-400"
                  : "text-emerald-400"
              }`}>
              {isWaitlisted
                ? "Waitlist Registered"
                : isSubmitted
                  ? "Submission Pending Review"
                  : "Registration Successful"}
            </span>
            <h1 className="text-3xl font-black text-[#E8EAFF] tracking-tighter">
              {isWaitlisted
                ? "Hold Tight!"
                : isSubmitted
                  ? "Application Received"
                  : "Welcome Aboard!"}
            </h1>
            <p className="text-muted font-bold text-xs leading-relaxed max-w-sm mx-auto">
              {isWaitlisted
                ? `You have been added to the waitlist for ${config.event_name}.`
                : isSubmitted
                  ? `Your registration for ${config.event_name} is under review.`
                  : `You have been registered for ${config.event_name}.`}
            </p>
          </div>

          <div className="p-6 rounded-[2rem] bg-white/5 border border-white/5 space-y-4">
            <div className="flex flex-col items-center">
              <span className="text-[9px] font-black text-muted uppercase tracking-widest mb-1">
                Participant Name
              </span>
              <span className="text-lg font-black text-[#E8EAFF]">
                {successData.name}
              </span>
            </div>

            <div className="flex justify-between items-center px-4 py-2 bg-white/5 border border-white/5 rounded-xl">
              <span className="text-[9px] font-black text-muted uppercase tracking-widest">
                Category
              </span>
              <span className="text-xs font-black text-indigo-400 uppercase tracking-widest">
                {successData.role}
              </span>
            </div>

            <div className="flex justify-between items-center px-4 py-2 bg-white/5 border border-white/5 rounded-xl">
              <span className="text-[9px] font-black text-muted uppercase tracking-widest">
                Transaction Status
              </span>
              <span className={`text-xs font-black uppercase tracking-widest ${isWaitlisted ? "text-purple-400" : isSubmitted ? "text-indigo-400" : "text-emerald-400"
                }`}>
                {isWaitlisted ? "N/A (Waitlisted)" : config.payment_enabled && getTicketPrice() > 0 ? "SUCCESSFUL" : "Completed (Free)"}
              </span>
            </div>

            {config.payment_enabled && getTicketPrice() > 0 && !isWaitlisted && !isSubmitted && (
              <div className="flex justify-between items-center px-4 py-2 bg-white/5 border border-white/5 rounded-xl">
                <span className="text-[9px] font-black text-muted uppercase tracking-widest">
                  Amount Paid
                </span>
                <span className="text-xs font-black text-emerald-400">
                  {config.currency || "INR"} {getTicketPrice().toLocaleString()}
                </span>
              </div>
            )}

            {isWaitlisted ? (
              <div className="flex flex-col items-center pt-2 border-t border-white/5">
                <span className="text-[9px] font-black text-amber-400 uppercase tracking-widest mb-1">
                  Waitlist Position
                </span>
                <span className="text-2xl font-black text-[#E8EAFF] tracking-wider uppercase">
                  #{successData.waitlist_position || 1}
                </span>
              </div>
            ) : isSubmitted ? (
              <div className="flex justify-between items-center px-4 py-2 bg-white/5 border border-white/5 rounded-xl">
                <span className="text-[9px] font-black text-muted uppercase tracking-widest">
                  Status
                </span>
                <span className="text-xs font-black text-amber-400 uppercase tracking-widest">
                  Pending Review
                </span>
              </div>
            ) : (
              <div className="flex flex-col items-center pt-2 border-t border-white/5">
                <span className="text-[9px] font-black text-muted uppercase tracking-widest mb-1">
                  Your Registration Number
                </span>
                <div className="flex items-center gap-2">
                  <span className="text-2xl font-black text-[#E8EAFF] tracking-wider uppercase">
                    {successData.regno}
                  </span>
                  <button
                    onClick={copyRegNo}
                    className="h-8 w-8 rounded-lg bg-white/5 hover:bg-white/10 flex items-center justify-center border border-white/10 active:scale-95 transition-all"
                  >
                    {copied ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
                  </button>
                </div>
              </div>
            )}
          </div>

          <p className="text-[10px] font-bold text-muted leading-relaxed max-w-[280px] mx-auto">
            {isWaitlisted
              ? "We will automatically promote and approve your registration as capacity frees up."
              : isSubmitted
                ? "The event organizers will review your submission shortly. You will be notified via email."
                : "Please keep this registration number safe. You will need it to print your badge at the registration desk."}
          </p>

          <div className="pt-2">
            <button
              onClick={() => {
                router.push(`/${eventId}/dashboard`);
              }}
              className="btn-primary w-full h-12 rounded-full text-xs font-black uppercase tracking-widest"
            >
              Back to Dashboard
            </button>
            <p className="text-[10px] font-bold text-muted mt-3">
              Redirecting to dashboard in {countdown} seconds...
            </p>
          </div>
        </motion.div>
      </div>
    );
  }

  // Render main form questionnaire
  return (
    <div className="w-full py-2 flex flex-col items-center">
      <style dangerouslySetInnerHTML={{
        __html: `
        :root {
          --base: ${themeColors.bg};
          --surf: ${themeColors.surf};
          --card: ${themeColors.card};
          --pri: ${themeColors.color};
          --sec: ${themeColors.sec};
        }
      `}} />


      {/* ── Event Journey Progress ── */}
      <div className="w-full max-w-6xl mb-10">
        <div className="glass-3d px-8 py-5 border border-white/5 bg-[#0f1228]/50 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="shrink-0 text-left">
            <span className="text-[8px] font-black uppercase tracking-[0.25em] text-indigo-300">Registration Flow</span>
            <h3 className="text-xs font-black uppercase tracking-wider text-[var(--text)] mt-0.5">Journey Progress</h3>
          </div>
          <div className="flex-1 flex items-center justify-between relative max-w-3xl mx-auto w-full">
            {(() => {
              const steps = getJourneySteps();
              return steps.map((step, idx) => {
                const isActive = step.status === "active";
                const isCompleted = step.status === "completed";
                return (
                  <div key={step.id} className="flex-1 flex items-center relative group">
                    {/* Step Bubble */}
                    <div className="flex flex-col items-center z-10 mx-auto">
                      <div className={`h-8 w-8 rounded-full flex items-center justify-center border text-[10px] font-black transition-all ${isCompleted
                          ? "bg-indigo-500 border-indigo-400 text-white shadow-[0_0_15px_rgba(99,102,241,0.5)]"
                          : isActive
                            ? "bg-[#0d0e1b] border-indigo-500 text-indigo-400 shadow-[0_0_10px_rgba(99,102,241,0.2)]"
                            : "bg-[#0d0e1b] border-white/10 text-muted"
                        }`}>
                        {isCompleted ? <Check className="h-4 w-4" /> : idx + 1}
                      </div>
                      <span className={`text-[8px] font-black uppercase tracking-widest mt-2 whitespace-nowrap ${isActive ? "text-indigo-400" : isCompleted ? "text-[#E8EAFF]" : "text-muted"
                        }`}>
                        {step.label}
                      </span>
                    </div>

                    {/* Connecting Line */}
                    {idx < steps.length - 1 && (
                      <div className="absolute top-[16px] left-[50%] right-[-50%] h-[1.5px] z-0 bg-white/5">
                        <div className={`h-full bg-indigo-500 transition-all duration-500 ${isCompleted ? "w-full" : "w-0"
                          }`} />
                      </div>
                    )}
                  </div>
                );
              });
            })()}
          </div>
        </div>
      </div>

      {/* Back to Dashboard Link */}
      <div className="w-full max-w-6xl mb-6 flex justify-start">
        <button
          type="button"
          onClick={() => {
            const hasToken = localStorage.getItem(`portal_token_${eventId}`);
            if (hasToken) {
              router.push(`/${eventId}/dashboard`);
            } else {
              router.push(`/${eventId}/login`);
            }
          }}
          className="inline-flex items-center gap-2 text-xs font-black text-muted hover:text-[#E8EAFF] transition-colors"
        >
          <ArrowLeft className="h-4 w-4 text-indigo-400" /> Back to Dashboard
        </button>
      </div>

      {formStep === "preview" ? (
        <div className="w-full max-w-2xl space-y-6">
          <motion.div
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            className="w-full glass-3d p-6 md:p-10 rounded-[2.5rem] bg-[#0d0e1b]/80 space-y-8 relative overflow-hidden shadow-2xl border border-indigo-500/20"
          >
            <div className="absolute top-0 left-0 w-32 h-32 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />

            <div className="border-b border-white/5 pb-4 flex items-center justify-between">
              <div>
                <h2 className="text-xl font-black text-[#E8EAFF] tracking-tight uppercase">Confirm Details</h2>
                <p className="text-[10px] text-muted font-bold uppercase tracking-wider mt-1">Please review your information before proceeding</p>
              </div>
              <button
                type="button"
                onClick={() => setFormStep("form")}
                className="px-4 py-2 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 text-xs font-black uppercase tracking-widest text-muted hover:text-[#E8EAFF] transition-all"
              >
                Edit Form
              </button>
            </div>

            {/* Data Table */}
            <div className="space-y-3">
              {config.fields.filter(f => f.is_active).map(field => {
                const val = formData[field.id];
                let displayVal = "";
                if (Array.isArray(val)) {
                  displayVal = val.join(", ");
                } else if (val) {
                  displayVal = val.toString();
                }

                if (!displayVal) return null;

                return (
                  <div key={field.id} className="flex flex-col sm:flex-row sm:items-center justify-between p-3.5 bg-white/5 border border-white/5 rounded-xl gap-2">
                    <span className="text-[9px] font-black text-muted uppercase tracking-widest">{field.label}</span>
                    <span className="text-xs font-semibold text-[#E8EAFF] text-right truncate max-w-xs">{displayVal}</span>
                  </div>
                );
              })}
              {/* State/Province if country has a state key */}
              {config.fields.filter(f => f.is_active && getEffectiveFieldType(f) === "country").map(field => {
                const stateVal = formData[`${field.id}_state`];
                if (!stateVal) return null;
                return (
                  <div key={`${field.id}_state`} className="flex flex-col sm:flex-row sm:items-center justify-between p-3.5 bg-white/5 border border-white/5 rounded-xl gap-2">
                    <span className="text-[9px] font-black text-muted uppercase tracking-widest">State / Province</span>
                    <span className="text-xs font-semibold text-[#E8EAFF] text-right truncate max-w-xs">{stateVal}</span>
                  </div>
                );
              })}
            </div>

            {/* Terms and Conditions — Markdown rendered with modal */}
            <div className="space-y-4 pt-4 border-t border-white/5">
              <div className="flex items-center justify-between">
                <h3 className="text-[10px] font-black text-muted uppercase tracking-widest">Terms &amp; Conditions</h3>
                <button
                  type="button"
                  onClick={() => setTcModalOpen(true)}
                  className="text-[9px] font-black text-indigo-400 hover:text-indigo-300 uppercase tracking-widest flex items-center gap-1 transition-colors"
                >
                  <FileText className="h-3 w-3" />
                  View Full T&amp;C
                </button>
              </div>
              {/* Inline compact preview (rendered markdown) */}
              <div className="p-4 rounded-xl bg-black/40 border border-white/5 max-h-36 overflow-y-auto text-left prose prose-invert prose-xs max-w-none
                prose-headings:text-[#E8EAFF] prose-headings:font-black prose-headings:text-xs
                prose-p:text-muted prose-p:text-[11px] prose-p:leading-relaxed prose-p:my-1
                prose-li:text-muted prose-li:text-[11px] prose-li:my-0
                prose-strong:text-[#E8EAFF] prose-em:text-indigo-300
                prose-a:text-indigo-400 prose-hr:border-white/10 prose-ul:my-1 prose-ol:my-1">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                  {config.terms_and_conditions || "## Terms & Conditions\n\n1. Registration is non-transferable and non-refundable.\n2. Attendees must adhere to the Event Code of Conduct.\n3. The organizers reserve the right to modify the schedule without prior notice."}
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
                <span className="text-[10px] font-bold text-muted uppercase tracking-wider leading-relaxed text-left group-hover:text-[#E8EAFF] transition-colors">
                  I have read and agree to the terms and conditions above. <span className="text-indigo-400 font-bold">*</span>
                  <span className="block text-indigo-400/60 mt-0.5 normal-case font-medium tracking-normal">Click &ldquo;View Full T&amp;C&rdquo; above to read the complete document.</span>
                </span>
              </label>
            </div>

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
                      className="h-8 w-8 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center text-muted hover:text-[#E8EAFF] transition-all"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                  <div className="p-8 overflow-y-auto flex-1 prose prose-invert max-w-none tnc-markdown
                    prose-headings:text-[#E8EAFF] prose-headings:font-black prose-headings:tracking-tight
                    prose-h1:text-xl prose-h2:text-base prose-h3:text-sm prose-h4:text-xs
                    prose-p:text-muted prose-p:text-sm prose-p:leading-relaxed
                    prose-li:text-muted prose-li:text-sm
                    prose-strong:text-[#E8EAFF] prose-em:text-indigo-300
                    prose-a:text-indigo-400 prose-a:no-underline hover:prose-a:underline
                    prose-hr:border-white/10 prose-ul:space-y-1 prose-ol:space-y-1">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                      {config.terms_and_conditions || "## Terms & Conditions\n\n1. Registration is non-transferable and non-refundable.\n2. Attendees must adhere to the Event Code of Conduct.\n3. The organizers reserve the right to modify the schedule without prior notice."}
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
                      <span className="text-[10px] font-bold text-muted uppercase tracking-wider leading-relaxed group-hover:text-[#E8EAFF] transition-colors">
                        I have read and agree to the Terms &amp; Conditions above. <span className="text-indigo-400">*</span>
                      </span>
                    </label>
                    <button
                      type="button"
                      onClick={() => setTcModalOpen(false)}
                      className="w-full h-11 rounded-full btn-primary text-xs font-black uppercase tracking-widest"
                    >
                      {agreedToTerms ? "Agreed — Close" : "Close"}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex gap-4 pt-4 border-t border-white/5">
              <button
                type="button"
                onClick={() => setFormStep("form")}
                className="flex-1 h-14 rounded-full border border-white/10 hover:bg-white/5 text-xs font-black uppercase tracking-widest text-muted hover:text-[#E8EAFF] transition-all flex items-center justify-center gap-2"
              >
                <ArrowLeft className="h-4 w-4 text-indigo-400" /> Back to Edit
              </button>
              <button
                type="button"
                onClick={handleFinalSubmit}
                disabled={submitting || !agreedToTerms}
                className="flex-[2] h-14 rounded-full btn-primary flex items-center justify-center gap-3 shadow-lg disabled:opacity-50"
              >
                {submitting ? (
                  <>Processing... <Loader2 className="h-4 w-4 animate-spin" /></>
                ) : (
                  <>
                    {config.payment_enabled && getTicketPrice() > 0 ? "Proceed to Payment" : "Confirm Registration"}
                    <ArrowRight className="h-4 w-4" />
                  </>
                )}
              </button>
            </div>
          </motion.div>
        </div>
      ) : (
        <div className="w-full max-w-6xl grid grid-cols-1 md:grid-cols-12 gap-8 items-start">

          {/* Left Column: Registration Form (col-span-7) */}
          <div className="md:col-span-7 space-y-6">
            <motion.form
              onSubmit={handleProceedToPreview}
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              className="w-full glass-3d p-6 md:p-10 rounded-[2.5rem] bg-white/5 space-y-8 relative overflow-hidden shadow-2xl"
            >
              <div className="absolute top-0 left-0 w-32 h-32 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />

              <div className="border-b border-white/5 pb-4">
                <h2 className="text-xl font-black text-[#E8EAFF] tracking-tight uppercase">Registration Details</h2>
                <p className="text-[10px] text-muted font-bold uppercase tracking-wider mt-1">Please enter your information below to register</p>
              </div>

              <div className="space-y-6">
                {(() => {
                  const activeFields = config.fields.filter(f => f.is_active);
                  const renderedFields: React.ReactNode[] = [];

                  const renderField = (field: FormField) => {
                    const fieldType = getEffectiveFieldType(field);
                    return (
                      <div key={field.id} className="space-y-2">
                        <label className="text-[10px] font-black text-muted uppercase tracking-widest flex items-center gap-1.5">
                          {field.label}
                          {field.is_required && <span className="text-indigo-400 font-bold">*</span>}
                        </label>

                        {/* Text Input Types */}
                        {fieldType === "text" && (
                          <div className="relative">
                            {getFieldIcon(field.id) && (
                              <div className="absolute left-4 top-1/2 -translate-y-1/2">
                                {getFieldIcon(field.id)}
                              </div>
                            )}
                            <input
                              type="text"
                              required={field.is_required}
                              placeholder={field.placeholder || `Enter ${field.label.toLowerCase()}...`}
                              value={formData[field.id] || ""}
                              onChange={(e) => handleInputChange(field.id, e.target.value)}
                              className={`h-12 w-full bg-white/5 border border-white/10 rounded-xl font-semibold text-xs text-[#E8EAFF] focus:border-indigo-500 focus:ring-0 transition-all ${getFieldIcon(field.id) ? "pl-12 pr-4" : "px-4"
                                }`}
                            />
                          </div>
                        )}

                        {/* Email Input Types */}
                        {fieldType === "email" && (
                          <div className="relative">
                            {getFieldIcon(field.id) && (
                              <div className="absolute left-4 top-1/2 -translate-y-1/2">
                                {getFieldIcon(field.id)}
                              </div>
                            )}
                            <input
                              type="email"
                              required={field.is_required}
                              disabled={field.id === "email"}
                              placeholder={field.placeholder || `Enter ${field.label.toLowerCase()}...`}
                              value={formData[field.id] || ""}
                              onChange={(e) => handleInputChange(field.id, e.target.value)}
                              className={`h-12 w-full bg-white/5 border border-white/10 rounded-xl font-semibold text-xs text-[#E8EAFF]/50 cursor-not-allowed focus:border-indigo-500 focus:ring-0 transition-all ${getFieldIcon(field.id) ? "pl-12 pr-4" : "px-4"
                                }`}
                            />
                            {field.id === "email" && (
                              <p className="text-[10px] text-indigo-400 mt-1 font-bold">Bound to your verified login email.</p>
                            )}
                          </div>
                        )}

                        {/* Phone Input Types with Country Code Select */}
                        {fieldType === "phone" && (
                          (() => {
                            const rawValue = formData[field.id] || "";

                            // Parse country code and number
                            let selectedCc = "+91"; // default
                            let numVal = rawValue;

                            for (const cc of countryCodes) {
                              if (rawValue.startsWith(cc.code)) {
                                selectedCc = cc.code;
                                numVal = rawValue.slice(cc.code.length);
                                break;
                              }
                            }

                            // Real-time validation
                            const isInvalid = numVal.length > 0 && (numVal.length < 7 || numVal.length > 15 || !/^\d+$/.test(numVal));

                            const handlePhoneChange = (newCc: string, newNum: string) => {
                              const filteredNum = newNum.replace(/\D/g, "");
                              const combined = newCc + filteredNum;
                              handleInputChange(field.id, combined);
                            };

                            return (
                              <div className="space-y-1.5 w-full">
                                <div className="flex gap-2">
                                  <div className="w-[120px] shrink-0 relative">
                                    <select
                                      value={selectedCc}
                                      onChange={(e) => handlePhoneChange(e.target.value, numVal)}
                                      className="h-12 w-full bg-[#0d0e1b] border border-white/10 rounded-xl px-3 font-semibold text-xs text-[#E8EAFF] focus:border-indigo-500 focus:ring-0 transition-all cursor-pointer"
                                    >
                                      {countryCodes.map(cc => (
                                        <option key={cc.code} value={cc.code} className="bg-[#080912]">
                                          {cc.code} ({cc.iso})
                                        </option>
                                      ))}
                                    </select>
                                  </div>
                                  <div className="relative flex-1">
                                    {getFieldIcon(field.id) && (
                                      <div className="absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none">
                                        {getFieldIcon(field.id)}
                                      </div>
                                    )}
                                    <input
                                      type="text"
                                      required={field.is_required}
                                      placeholder={field.placeholder || "Enter phone number..."}
                                      value={numVal}
                                      onChange={(e) => handlePhoneChange(selectedCc, e.target.value)}
                                      className={`h-12 w-full bg-white/5 border rounded-xl font-semibold text-xs text-[#E8EAFF] focus:ring-0 transition-all ${isInvalid
                                          ? "border-rose-500/50 focus:border-rose-500"
                                          : "border-white/10 focus:border-indigo-500"
                                        } ${getFieldIcon(field.id) ? "pl-12 pr-4" : "px-4"}`}
                                    />
                                  </div>
                                </div>
                                {isInvalid && (
                                  <motion.p
                                    initial={{ opacity: 0, y: -4 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    className="text-[10px] text-rose-400 font-bold text-left pl-2"
                                  >
                                    Phone number must contain numbers only and be between 7 and 15 digits.
                                  </motion.p>
                                )}
                              </div>
                            );
                          })()
                        )}

                        {/* Country Input Types */}
                        {fieldType === "country" && (
                          (() => {
                            const countries = getCountryChoices(field);
                            const selectedCountry = formData[field.id] || (countries.length === 1 ? countries[0] : "");
                            const states = getStatesForCountry(countryStates, selectedCountry);

                            return (
                              <div className="space-y-4">
                                <div className="relative">
                                  {getFieldIcon(field.id) && (
                                    <div className="absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none">
                                      {getFieldIcon(field.id)}
                                    </div>
                                  )}
                                  {countries.length === 1 ? (
                                    <select
                                      disabled
                                      value={countries[0]}
                                      className="h-12 w-full bg-[#0d0e1b] border border-white/10 rounded-xl pl-12 pr-4 font-semibold text-xs text-[#E8EAFF] opacity-100 focus:border-indigo-500 focus:ring-0 transition-all cursor-not-allowed"
                                    >
                                      <option value={countries[0]} className="bg-[#080912]">{countries[0]}</option>
                                    </select>
                                  ) : (
                                    <select
                                      required={field.is_required}
                                      value={selectedCountry}
                                      onChange={(e) => {
                                        handleInputChange(field.id, e.target.value);
                                        handleInputChange(`${field.id}_state`, "");
                                      }}
                                      className={`h-12 w-full bg-[#0d0e1b] border border-white/10 rounded-xl font-semibold text-xs text-[#E8EAFF] focus:border-indigo-500 focus:ring-0 transition-all cursor-pointer ${getFieldIcon(field.id) ? "pl-12 pr-4" : "px-4"
                                        }`}
                                    >
                                      <option value="" className="bg-[#080912]">Select Country...</option>
                                      {countries.map((country) => (
                                        <option key={country} value={country} className="bg-[#080912]">{country}</option>
                                      ))}
                                    </select>
                                  )}
                                </div>

                                {selectedCountry && (
                                  <div className="space-y-2 animate-in fade-in duration-200">
                                    <label className="text-[10px] font-black text-muted uppercase tracking-widest flex items-center gap-1.5">
                                      State / Province
                                      {field.is_required && <span className="text-indigo-400 font-bold">*</span>}
                                    </label>
                                    <div className="relative">
                                      <div className="absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none">
                                        <MapPin className="h-4 w-4 text-indigo-400" />
                                      </div>
                                      {states.length ? (
                                        <select
                                          required={field.is_required}
                                          value={formData[`${field.id}_state`] || ""}
                                          onChange={(e) => handleInputChange(`${field.id}_state`, e.target.value)}
                                          className="h-12 w-full bg-[#0d0e1b] border border-white/10 rounded-xl pl-12 pr-4 font-semibold text-xs text-[#E8EAFF] focus:border-indigo-500 focus:ring-0 transition-all cursor-pointer"
                                        >
                                          <option value="" className="bg-[#080912]">Select State / Province...</option>
                                          {states.map((state) => (
                                            <option key={state} value={state} className="bg-[#080912]">{state}</option>
                                          ))}
                                        </select>
                                      ) : (
                                        <input
                                          type="text"
                                          required={field.is_required}
                                          value={formData[`${field.id}_state`] || ""}
                                          onChange={(e) => handleInputChange(`${field.id}_state`, e.target.value)}
                                          placeholder="Enter state / province..."
                                          className="h-12 w-full bg-[#0d0e1b] border border-white/10 rounded-xl pl-12 pr-4 font-semibold text-xs text-[#E8EAFF] focus:border-indigo-500 focus:ring-0 transition-all"
                                        />
                                      )}
                                    </div>
                                  </div>
                                )}
                              </div>
                            );
                          })()
                        )}

                        {/* Date Selector */}
                        {fieldType === "date" && (
                          <input
                            type="date"
                            required={field.is_required}
                            value={formData[field.id] || ""}
                            onChange={(e) => handleInputChange(field.id, e.target.value)}
                            className="h-12 w-full bg-white/5 border border-white/10 rounded-xl px-4 font-semibold text-xs text-[#E8EAFF] focus:border-indigo-500 focus:ring-0 transition-all cursor-pointer"
                          />
                        )}

                        {/* Dropdown Select option menu */}
                        {fieldType === "select" && (
                          <div className="relative">
                            {getFieldIcon(field.id) && (
                              <div className="absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none">
                                {getFieldIcon(field.id)}
                              </div>
                            )}
                            <select
                              value={formData[field.id] || ""}
                              onChange={(e) => handleInputChange(field.id, e.target.value)}
                              className={`h-12 w-full bg-[#0d0e1b] border border-white/10 rounded-xl font-semibold text-xs text-[#E8EAFF] focus:border-indigo-500 focus:ring-0 transition-all cursor-pointer ${getFieldIcon(field.id) ? "pl-12 pr-4" : "px-4"
                                }`}
                            >
                              {(field.options || []).map((opt) => (
                                <option key={opt} value={opt} className="bg-[#080912]">
                                  {opt}
                                </option>
                              ))}
                            </select>
                          </div>
                        )}

                        {/* Checkboxes Choice list */}
                        {fieldType === "checkbox" && (
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-white/5 border border-white/5 p-4 rounded-2xl">
                            {(field.options || []).map((opt) => {
                              const isChecked = (formData[field.id] || []).includes(opt);
                              return (
                                <label key={opt} className="flex items-center gap-3 cursor-pointer select-none">
                                  <input
                                    type="checkbox"
                                    checked={isChecked}
                                    onChange={(e) => handleCheckboxChange(field.id, opt, e.target.checked)}
                                    className="h-4 w-4 bg-white/5 border border-white/10 rounded text-indigo-500 focus:ring-0 cursor-pointer"
                                  />
                                  <span className="text-xs font-bold text-muted uppercase tracking-wider">{opt}</span>
                                </label>
                              );
                            })}
                          </div>
                        )}

                        {/* File or Image Upload widget */}
                        {(fieldType === "image" || fieldType === "file") && (
                          <div className="space-y-3">
                            {formData[field.id] ? (
                              <div className="flex items-center justify-between p-4 bg-emerald-500/5 border border-emerald-500/20 rounded-2xl">
                                <div className="flex items-center gap-3">
                                  <div className="h-8 w-8 bg-emerald-500/10 rounded-xl flex items-center justify-center shrink-0 border border-emerald-500/20">
                                    <Check className="h-4 w-4 text-emerald-400" />
                                  </div>
                                  <div className="min-w-0">
                                    <p className="text-xs font-black text-[#E8EAFF] uppercase tracking-wider truncate">File Uploaded</p>
                                    <a
                                      href={formData[field.id]}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="text-[9px] text-indigo-400 font-bold hover:underline truncate block"
                                    >
                                      View Uploaded File
                                    </a>
                                  </div>
                                </div>
                                <button
                                  type="button"
                                  onClick={() => handleInputChange(field.id, "")}
                                  className="text-[9px] font-black uppercase tracking-widest text-muted hover:text-rose-400 transition-colors"
                                >
                                  Change File
                                </button>
                              </div>
                            ) : (
                              <label className="flex flex-col items-center justify-center border border-dashed border-white/10 hover:border-indigo-500/40 rounded-2xl p-6 bg-white/5 hover:bg-white/10 transition-all cursor-pointer relative group">
                                <input
                                  type="file"
                                  accept={fieldType === "image" ? "image/*" : ".pdf,.docx,.xlsx,.doc"}
                                  onChange={(e) => {
                                    const file = e.target.files?.[0];
                                    if (file) handleFileUpload(field.id, file);
                                  }}
                                  disabled={uploadingField !== null}
                                  className="hidden"
                                />

                                {uploadingField === field.id ? (
                                  <div className="flex flex-col items-center gap-2">
                                    <Loader2 className="h-6 w-6 text-indigo-400 animate-spin" />
                                    <span className="text-[9px] font-black text-muted uppercase tracking-widest">Uploading...</span>
                                  </div>
                                ) : (
                                  <div className="flex flex-col items-center gap-2 text-center">
                                    <Upload className="h-5 w-5 text-indigo-400 group-hover:scale-110 transition-transform" />
                                    <div>
                                      <span className="text-[10px] font-black text-muted uppercase tracking-widest block">
                                        Select {fieldType === "image" ? "Image" : "Document"}
                                      </span>
                                      <span className="text-[8px] font-bold text-muted/60 uppercase tracking-wider mt-1 block">
                                        Max 10MB
                                      </span>
                                    </div>
                                  </div>
                                )}
                              </label>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  };

                  for (let i = 0; i < activeFields.length; i++) {
                    const field = activeFields[i];
                    if (field.id === "first_name") {
                      const lastNameField = activeFields.find(f => f.id === "last_name");
                      renderedFields.push(
                        <div key="name_row" className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          {renderField(field)}
                          {lastNameField && renderField(lastNameField)}
                        </div>
                      );
                      continue;
                    }
                    if (field.id === "last_name") {
                      const firstNameActive = activeFields.some(f => f.id === "first_name");
                      if (firstNameActive) continue;
                    }
                    renderedFields.push(renderField(field));
                  }
                  return renderedFields;
                })()}
              </div>

              {/* Pricing & Promo Code Section */}
              {config.payment_enabled && (
                <div className="p-6 rounded-2xl bg-white/5 border border-white/5 space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-black text-muted uppercase tracking-widest">Ticket Price ({formData.role || "Delegate"})</span>
                    <span className="text-sm font-black text-[#E8EAFF]">
                      {config.currency || "INR"} {getTicketBasePrice().toLocaleString()}
                    </span>
                  </div>

                  {/* Promo Code Input */}
                  <div className="space-y-2 pt-2 border-t border-white/5">
                    <label className="text-[10px] font-black text-muted uppercase tracking-widest block">Promo Code</label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        placeholder="ENTER PROMO CODE..."
                        value={promoCode}
                        onChange={(e) => setPromoCode(e.target.value.toUpperCase())}
                        disabled={validatingPromo || !!appliedPromo}
                        className="h-10 flex-1 bg-[#0d0e1b] border border-white/10 rounded-xl px-4 font-semibold text-xs text-[#E8EAFF] uppercase focus:border-indigo-500 focus:ring-0 transition-all"
                      />
                      {appliedPromo ? (
                        <button
                          type="button"
                          onClick={() => { setAppliedPromo(null); setPromoCode(""); }}
                          className="h-10 px-4 rounded-xl border border-rose-500/20 bg-rose-500/10 text-rose-400 text-xs font-black uppercase tracking-wider hover:bg-rose-500/20 transition-all"
                        >
                          Remove
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={handleApplyPromo}
                          disabled={validatingPromo || !promoCode.trim()}
                          className="h-10 px-6 rounded-xl btn-primary text-xs shrink-0 flex items-center justify-center"
                        >
                          {validatingPromo ? <Loader2 className="h-4 w-4 animate-spin" /> : "Apply"}
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Applied Promo summary */}
                  {appliedPromo && (
                    <div className="flex justify-between items-center text-xs font-bold text-emerald-400">
                      <span>Discount Applied:</span>
                      <span>-{config.currency || "INR"} {appliedPromo.discount_amount.toLocaleString()}</span>
                    </div>
                  )}

                  <div className="flex justify-between items-center pt-3 border-t border-white/5">
                    <span className="text-[10px] font-black text-indigo-400 uppercase tracking-[0.2em]">Total Amount</span>
                    <span className="text-xl font-black text-indigo-400 tracking-wider">
                      {config.currency || "INR"} {getTicketPrice().toLocaleString()}
                    </span>
                  </div>
                </div>
              )}

              {/* Submit Action */}
              <div className="pt-4">
                <button
                  type="submit"
                  disabled={submitting || uploadingField !== null}
                  className="btn-primary w-full h-14 rounded-full flex items-center justify-center gap-3 shadow-lg"
                >
                  {submitting ? (
                    <>Processing... <Loader2 className="h-4 w-4 animate-spin" /></>
                  ) : (
                    <>Review & Confirm <ArrowRight className="h-4 w-4" /></>
                  )}
                </button>
              </div>
            </motion.form>
          </div>

          {/* Right Column: Event Info on top (col-span-5) */}
          <div className="md:col-span-5 space-y-6 md:sticky md:top-8">
            <motion.div
              initial={{ y: -20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              className="w-full glass-3d p-8 rounded-[2.5rem] bg-white/5 border border-white/10 space-y-6 relative overflow-hidden shadow-2xl"
            >
              <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />

              <div className="flex items-center gap-4">
                {config.logo_url ? (
                  <img
                    src={config.logo_url}
                    alt="Event Logo"
                    className="h-16 object-contain rounded-xl border border-white/10 bg-white/5 p-2"
                  />
                ) : (
                  <div className="h-14 w-14 glass-3d rounded-2xl flex items-center justify-center border-indigo-500/30 shadow-xl">
                    <Globe className="h-6 w-6 text-indigo-400" />
                  </div>
                )}

                <div>
                  <span className="text-[9px] font-black text-indigo-400 uppercase tracking-[0.3em] block">
                    Featured Event
                  </span>
                  <h1 className="text-xl md:text-2xl font-black text-[#E8EAFF] tracking-tighter leading-tight mt-0.5">
                    {config.event_name}
                  </h1>
                </div>
              </div>

              <div className="pt-6 border-t border-white/5 space-y-4">
                <h3 className="text-xs font-black text-[#E8EAFF] uppercase tracking-widest">Available Categories</h3>
                {(() => {
                  const roleField = config.fields.find(f => f.id === "role");
                  const allowedRoles = roleField && roleField.is_active ? (roleField.options || []) : [];
                  const filteredPrices = Object.entries(config.active_prices || {}).filter(([role]) => allowedRoles.includes(role));
                  return filteredPrices.length > 0 ? (
                    <div className="space-y-2">
                      {filteredPrices.map(([role, price]) => (
                        <div key={role} className="flex justify-between items-center px-4 py-2.5 bg-white/5 border border-white/5 rounded-xl">
                          <span className="text-[10px] font-black text-muted uppercase tracking-widest">{role}</span>
                          <span className="text-xs font-black text-indigo-400">
                            {config.currency || "INR"} {price.toLocaleString()}
                          </span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-[10px] font-bold text-muted uppercase tracking-wider">Free Registration</p>
                  );
                })()}
              </div>

              <div className="pt-6 border-t border-white/5 space-y-3">
                <h3 className="text-xs font-black text-[#E8EAFF] uppercase tracking-widest">Instructions</h3>
                <div className="space-y-2.5">
                  <div className="flex gap-3">
                    <div className="h-5 w-5 rounded-full bg-indigo-500/10 flex items-center justify-center shrink-0 border border-indigo-500/20">
                      <Check className="h-3 w-3 text-indigo-400" />
                    </div>
                    <p className="text-[10px] font-bold text-[#b4b6d4] leading-relaxed uppercase tracking-wider">
                      Registration is tied to your verified email account.
                    </p>
                  </div>
                  <div className="flex gap-3">
                    <div className="h-5 w-5 rounded-full bg-indigo-500/10 flex items-center justify-center shrink-0 border border-indigo-500/20">
                      <Check className="h-3 w-3 text-indigo-400" />
                    </div>
                    <p className="text-[10px] font-bold text-[#b4b6d4] leading-relaxed uppercase tracking-wider">
                      Make sure to upload required identification/documents.
                    </p>
                  </div>
                  <div className="flex gap-3">
                    <div className="h-5 w-5 rounded-full bg-indigo-500/10 flex items-center justify-center shrink-0 border border-indigo-500/20">
                      <Check className="h-3 w-3 text-indigo-400" />
                    </div>
                    <p className="text-[10px] font-bold text-[#b4b6d4] leading-relaxed uppercase tracking-wider">
                      Once submitted, your status and details can be viewed on the dashboard.
                    </p>
                  </div>
                </div>
              </div>

              <div className="pt-6 border-t border-white/5">
                <div className="text-[10px] font-black text-muted uppercase tracking-[0.4em] opacity-40 text-center">
                  EventX OS Intelligence Desk
                </div>
              </div>
            </motion.div>
          </div>
        </div>
      )}

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

    </div>
  );
}
