"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  CheckCircle2, Clock, AlertCircle, XCircle, HelpCircle,
  User, Ticket, Calendar, MapPin, Mail, Phone, Building,
  Briefcase, Globe, Edit3, Save, X, ExternalLink,
  ChevronRight, Loader2, LogOut, Megaphone, ArrowLeft, ArrowRight
} from "lucide-react";
import { toast } from "sonner";

export const countryCodes = [
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

interface EventInfo { name: string; start_date: string | null; end_date: string | null; venue: string; support_email: string; announcements: string; program_url: string; theme_color?: string; }
interface RegistrationInfo { status: string; registration_id: string | null; submitted_at: string | null; waitlist_position: number | null; rejection_reason: string | null; }
interface ParticipantInfo { regno: string; name: string; email: string; phone: string; company: string; designation: string; country: string; role: string; paid_status: string; custom_fields: Record<string, unknown>; registered_at: string | null; }
interface PaymentInfo { status: string; amount: number; currency: string; payment_method: string; transaction_id: string; created_at: string; gateway_payment_id: string | null; discount_applied: number; }
interface DashboardData { event: EventInfo; registration: RegistrationInfo; participant: ParticipantInfo | null; payment: PaymentInfo | null; edits_locked: boolean; is_speaker: boolean; speaker_portal_url: string; }

function fmtDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" });
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string; icon: React.ReactNode }> = {
    approved:       { label: "Approved",       cls: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20", icon: <CheckCircle2 className="h-3.5 w-3.5" /> },
    submitted:      { label: "Submitted",      cls: "bg-indigo-500/10 text-indigo-400 border-indigo-500/20",   icon: <Clock className="h-3.5 w-3.5" /> },
    pending_review: { label: "Under Review",   cls: "bg-amber-500/10 text-amber-400 border-amber-500/20",     icon: <Clock className="h-3.5 w-3.5" /> },
    waitlisted:     { label: "Waitlisted",     cls: "bg-purple-500/10 text-purple-400 border-purple-500/20",  icon: <HelpCircle className="h-3.5 w-3.5" /> },
    rejected:       { label: "Not Approved",   cls: "bg-rose-500/10 text-rose-400 border-rose-500/20",        icon: <XCircle className="h-3.5 w-3.5" /> },
    not_registered: { label: "Not Registered", cls: "bg-white/5 text-[var(--muted)] border-white/10",         icon: <HelpCircle className="h-3.5 w-3.5" /> },
    closed:         { label: "Closed",         cls: "bg-white/5 text-[var(--muted)] border-white/10",         icon: <XCircle className="h-3.5 w-3.5" /> },
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
      name: event.name || "Event Registration",
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
        name: data?.participant?.name || "",
        email: data?.participant?.email || "",
        contact: data?.participant?.phone || ""
      },
      theme: {
        color: event.theme_color || "#6366F1"
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
      email: data.participant.email,
      phone: data.participant.phone, 
      company: data.participant.company, 
      designation: data.participant.designation, 
      country: data.participant.country 
    });
    setSaveError(null); setEditing(true);
  };

  const saveEdit = async () => {
    if (!token || !data?.participant) return;
    setSaving(true); setSaveError(null);

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
        name: editForm.name,
        phone: editForm.phone,
        company: editForm.company,
        designation: editForm.designation,
        country: editForm.country,
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
    <div className="min-h-screen flex items-center justify-center">
      <div className="space-y-4 w-full max-w-2xl px-6">
        {[1,2,3].map(i => <div key={i} className="h-32 bg-white/5 animate-pulse rounded-[2rem]" />)}
      </div>
    </div>
  );

  if (!data) return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="glass-3d p-10 text-center rounded-[2.5rem]">
        <AlertCircle className="h-12 w-12 text-rose-400 mx-auto mb-4 animate-pulse" />
        <p className="text-[var(--muted)] font-bold text-sm">Could not load your dashboard. Please refresh.</p>
      </div>
    </div>
  );

  const { event, registration, participant, payment, edits_locked, is_speaker, speaker_portal_url } = data;
  const isApproved = registration.status === "approved";

  const isRegistered = ["submitted", "pending_review", "approved", "waitlisted", "rejected"].includes(registration.status);

  return (
    <div className="min-h-screen pb-12">
      {/* Sticky header */}
      <div className="sticky top-0 z-20 border-b border-white/5 backdrop-blur-xl bg-[#080912]/80">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
          <div>
            <span className="text-[9px] font-black text-indigo-400 uppercase tracking-[0.3em] block">
              Registration Portal
            </span>
            <h1 className="text-base font-black text-[#E8EAFF] tracking-tighter leading-tight">{event.name}</h1>
          </div>
          <div className="flex items-center gap-4">
            <div className="hidden sm:flex items-center gap-2 bg-white/5 border border-white/5 px-3 py-1.5 rounded-full">
              <User className="h-3.5 w-3.5 text-indigo-400" />
              <span className="text-[10px] font-black text-[#E8EAFF] tracking-wide max-w-[150px] truncate">{participant?.email || "Attendee"}</span>
            </div>
            <button onClick={logout}
              className="flex items-center gap-1.5 text-xs font-black text-[var(--muted)] hover:text-[#E8EAFF] transition-colors px-3 py-2 rounded-xl hover:bg-white/5">
              <LogOut className="h-4 w-4 text-indigo-400" />Logout
            </button>
          </div>
        </div>
      </div>

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
                <h3 className="text-[10px] font-black text-[var(--muted)] uppercase tracking-widest text-left">Terms & Conditions</h3>
                <div className="p-4 rounded-xl bg-black/40 border border-white/5 max-h-36 overflow-y-auto text-xs text-[var(--muted)] leading-relaxed font-medium whitespace-pre-wrap text-left">
                  {formConfig?.terms_and_conditions || (
                    "1. Registration is non-transferable and non-refundable.\n2. Attendees must adhere to the Event Code of Conduct.\n3. The organizers reserve the right to modify the schedule without prior notice."
                  )}
                </div>
                <label className="flex items-start gap-3 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={agreedToTerms}
                    onChange={(e) => setAgreedToTerms(e.target.checked)}
                    className="h-4 w-4 bg-white/5 border border-white/10 rounded text-indigo-500 focus:ring-0 mt-0.5 cursor-pointer"
                  />
                  <span className="text-[10px] font-bold text-[var(--muted)] uppercase tracking-wider leading-relaxed text-left">
                    I have read and agree to the terms and conditions. <span className="text-indigo-400 font-bold">*</span>
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
            {/* Personalized Welcome Header */}
            <div className="mb-2">
              <h2 className="text-xl font-black text-[#E8EAFF] tracking-tight">
                Welcome, {participant?.name || "Attendee"}!
              </h2>
              <p className="text-[9px] text-[var(--muted)] font-black uppercase tracking-widest mt-0.5">
                Attendee Control Center
              </p>
            </div>

            {/* Speaker Banner */}
            <AnimatePresence>
              {is_speaker && !bannerDismissed && (
                <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}
                  className="rounded-[1.5rem] bg-indigo-500/10 border border-indigo-500/20 px-5 py-3.5 flex items-center justify-between">
                  <div className="flex items-center gap-3 flex-wrap">
                    <Megaphone className="h-4 w-4 text-indigo-400 shrink-0" />
                    <span className="text-xs font-bold text-[#E8EAFF]">You are also a speaker for this event.</span>
                    <a href={speaker_portal_url}
                      className="inline-flex items-center gap-1 text-xs font-black text-indigo-400 hover:text-indigo-300 underline underline-offset-2 transition-colors">
                      Go to Speaker Portal <ExternalLink className="h-3 w-3" />
                    </a>
                  </div>
                  <button onClick={() => setBannerDismissed(true)} className="ml-4 p-1.5 rounded-lg hover:bg-white/10 transition-colors" aria-label="Dismiss">
                    <X className="h-4 w-4 text-[var(--muted)]" />
                  </button>
                </motion.div>
              )}
            </AnimatePresence>

            {/* 2-Column Grid Layout */}
            <div className="grid grid-cols-1 md:grid-cols-12 gap-8 items-start">
          
          {/* Left Column (My Registration, Ticket / Checkout, Payment Details) */}
          <div className="md:col-span-7 space-y-6">
            
            {/* Section A — Registration Status */}
            <Section title="My Registration" icon={<CheckCircle2 className="h-4 w-4" />}>
              {registration.status === "not_registered" && (
                <div className="text-center py-4 space-y-4">
                  <p className="text-[var(--muted)] font-bold text-sm">You haven't registered for this event yet.</p>
                  <a href={`/${eventId}/register`}
                    className="btn-primary inline-flex items-center gap-2 px-6 h-11 rounded-full">
                    Register Now <ChevronRight className="h-4 w-4" />
                  </a>
                </div>
              )}

              {registration.status === "closed" && (
                <p className="text-[var(--muted)] text-sm font-bold text-center py-2">Registration for this event is currently closed.</p>
              )}

              {["submitted", "pending_review"].includes(registration.status) && (
                <div className="space-y-3">
                  <StatusBadge status={registration.status} />
                  <p className="text-xs font-bold text-[var(--muted)] leading-relaxed">
                    Your registration is under review. We'll notify you via email once processed.
                  </p>
                  {registration.submitted_at && (
                    <p className="text-[9px] font-black text-[var(--muted)] uppercase tracking-widest">
                      Submitted {fmtDate(registration.submitted_at)}
                    </p>
                  )}
                </div>
              )}

              {registration.status === "waitlisted" && (
                <div className="space-y-3">
                  <StatusBadge status="waitlisted" />
                  {registration.waitlist_position && (
                    <div className="inline-flex items-center gap-2 bg-purple-500/10 border border-purple-500/20 px-4 py-2 rounded-xl">
                      <span className="text-xs font-black text-purple-400 uppercase tracking-widest">
                        Queue #{registration.waitlist_position}
                      </span>
                    </div>
                  )}
                  <p className="text-xs font-bold text-[var(--muted)] leading-relaxed">
                    You're on the waitlist. We'll email you if a spot opens up.
                  </p>
                </div>
              )}

              {registration.status === "rejected" && (
                <div className="space-y-3">
                  <StatusBadge status="rejected" />
                  {registration.rejection_reason && (
                    <div className="bg-rose-500/10 border border-rose-500/20 rounded-xl px-4 py-3">
                      <p className="text-xs font-bold text-rose-400 leading-relaxed">
                        <span className="font-black uppercase tracking-wider">Reason: </span>
                        {registration.rejection_reason}
                      </p>
                    </div>
                  )}
                  {event.support_email && (
                    <p className="text-xs font-bold text-[var(--muted)]">
                      Questions?{" "}
                      <a href={`mailto:${event.support_email}`} className="text-indigo-400 hover:underline font-black">Contact support</a>
                    </p>
                  )}
                </div>
              )}

              {isApproved && (
                <div className="space-y-4">
                  <StatusBadge status="approved" />
                  <div className="grid grid-cols-2 gap-4 p-4 bg-white/5 border border-white/5 rounded-2xl">
                    <Field label="Registration No." value={participant?.regno || ((participant?.paid_status === "Paid" || getTicketBasePrice() === 0) ? "—" : "Pending Payment")} />
                    <Field label="Submitted" value={fmtDate(registration.submitted_at)} />
                  </div>
                </div>
              )}
            </Section>

            {/* Section B — Ticket (Only if Approved AND Paid/Free) */}
            {isApproved && participant && (participant.paid_status === "Paid" || getTicketBasePrice() === 0) && (
              <Section title="My Ticket" icon={<Ticket className="h-4 w-4" />}>
                <div className="flex flex-col lg:flex-row items-center gap-8">
                  {/* Visual Entry Pass Card in UI (Identical to Downloaded PDF & JPG formats) */}
                  <div className="w-full max-w-[320px] bg-white border-[6px] border-[#6366f1] rounded-[24px] p-6 text-center relative overflow-hidden shadow-2xl shrink-0 flex flex-col items-center mx-auto lg:mx-0">
                    <span className="text-[10px] font-extrabold text-[#6366f1] uppercase tracking-[0.25em] block mb-1">
                      ENTRY PASS
                    </span>
                    <h4 className="text-sm font-extrabold text-[#1e1b4b] uppercase tracking-wider mb-4 max-w-full truncate">
                      {event.name}
                    </h4>

                    <div className="p-2.5 bg-[#f9fafb] border border-[#e5e7eb] rounded-2xl mb-5">
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

                  {/* Right side download triggers & details */}
                  <div className="space-y-4 flex-1 w-full text-left">
                    <div>
                      <p className="text-[9px] font-black text-[var(--muted)] uppercase tracking-widest mb-1">Pass Verification Status</p>
                      <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-wider border bg-emerald-500/10 text-emerald-400 border-emerald-500/20">
                        {getTicketBasePrice() === 0 ? "✓ Free Category" : "✓ Paid"}
                      </span>
                    </div>

                    {payment && (
                      <div>
                        <p className="text-[9px] font-black text-[var(--muted)] uppercase tracking-widest mb-1">Transaction Ref</p>
                        <p className="text-xs font-semibold text-[#E8EAFF] font-mono">{payment.transaction_id.slice(0, 12).toUpperCase()}</p>
                      </div>
                    )}

                    <div className="pt-2 flex flex-wrap gap-2">
                      <button
                        onClick={() => downloadTicketJPG(participant.regno, participant.name, participant.role, event.name)}
                        className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-white/5 border border-white/10 text-[9px] font-black text-[#E8EAFF] hover:bg-indigo-500/20 hover:border-indigo-500/30 transition-all uppercase tracking-wider"
                      >
                        Download JPG
                      </button>
                      <button
                        onClick={() => downloadTicketPDF(participant.regno, participant.name, participant.role, event.name)}
                        className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-white/5 border border-white/10 text-[9px] font-black text-[#E8EAFF] hover:bg-indigo-500/20 hover:border-indigo-500/30 transition-all uppercase tracking-wider"
                      >
                        Download PDF
                      </button>
                    </div>
                  </div>
                </div>
              </Section>
            )}

            {/* "Payment Required" Checkout Card (If Approved BUT Unpaid and priced > 0) */}
            {isApproved && participant && participant.paid_status !== "Paid" && getTicketBasePrice() > 0 && (
              <Section title="Payment Required" icon={<AlertCircle className="h-4 w-4 text-amber-400" />}>
                <div className="space-y-4">
                  <div className="p-4 bg-amber-500/10 border border-amber-500/20 rounded-2xl">
                    <p className="text-xs font-bold text-amber-400 leading-relaxed">
                      Your registration has been approved! Please complete the payment to activate your ticket, assign your registration number, and view your entry pass.
                    </p>
                  </div>
                  
                  <div className="space-y-3">
                    <div className="flex justify-between items-center py-2 border-b border-white/5">
                      <span className="text-xs font-bold text-[var(--muted)]">Ticket Category</span>
                      <span className="text-xs font-black text-indigo-400 uppercase tracking-wider">{participant.role}</span>
                    </div>
                    
                    <div className="flex justify-between items-center py-2 border-b border-white/5">
                      <span className="text-xs font-bold text-[var(--muted)]">Base Price</span>
                      <span className="text-xs font-black text-[#E8EAFF]">
                        {formConfig?.currency || "INR"} {getTicketBasePrice().toLocaleString()}
                      </span>
                    </div>
                    
                    {appliedPromo && (
                      <div className="flex justify-between items-center py-2 border-b border-white/5 text-emerald-400">
                        <span className="text-xs font-bold">Promo Discount ({appliedPromo.code})</span>
                        <span className="text-xs font-black">
                          -{formConfig?.currency || "INR"} {appliedPromo.discount_amount.toLocaleString()}
                        </span>
                      </div>
                    )}
                    
                    <div className="flex justify-between items-center py-2 text-base">
                      <span className="text-sm font-black text-[#E8EAFF]">Total Amount</span>
                      <span className="text-base font-black text-indigo-400">
                        {formConfig?.currency || "INR"} {getTicketPrice().toLocaleString()}
                      </span>
                    </div>
                  </div>
                  
                  {/* Promo Code Input */}
                  {formConfig?.payment_enabled && (
                    <div className="space-y-2 pt-2">
                      <label className="text-[9px] font-black text-[var(--muted)] uppercase tracking-widest block">Promo Code</label>
                      <div className="flex gap-2">
                        <input
                          type="text"
                          placeholder="ENTER PROMO CODE"
                          value={promoCode}
                          onChange={(e) => setPromoCode(e.target.value.toUpperCase())}
                          disabled={appliedPromo !== null || validatingPromo}
                          className="input flex-1 uppercase tracking-wider"
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
                            {validatingPromo ? <Loader2 className="h-3 w-3 animate-spin" /> : "Apply"}
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                  
                  <button
                    onClick={() => setCheckoutStep("confirm")}
                    className="w-full btn-primary h-12 rounded-xl flex items-center justify-center gap-2 mt-4 font-black uppercase tracking-wider text-xs"
                  >
                    Proceed to Checkout
                  </button>
                </div>
              </Section>
            )}

            {/* Section E — Payment Details */}
            {payment && (
              <Section title="Payment Details" icon={<Briefcase className="h-4 w-4" />}>
                <div className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-4 bg-white/5 border border-white/5 rounded-2xl">
                    <Field label="Transaction Ref" value={payment.transaction_id.slice(0, 8).toUpperCase()} />
                    <Field label="Amount Paid" value={`${payment.currency} ${payment.amount.toLocaleString()}`} />
                    <Field label="Payment Method" value={payment.payment_method.toUpperCase()} />
                    <Field label="Payment Date" value={fmtDate(payment.created_at)} />
                  </div>
                  <button
                    onClick={() => downloadReceipt(payment, event, participant)}
                    className="btn-primary inline-flex items-center gap-2 px-5 h-10 rounded-xl text-xs"
                  >
                    Download Receipt <ChevronRight className="h-3.5 w-3.5" />
                  </button>
                </div>
              </Section>
            )}
          </div>
          
          {/* Right Column (My Details, Event Information, Announcements) */}
          <div className="md:col-span-5 space-y-6">
            
            {/* Section C — My Details */}
            {isRegistered && participant && (
              <Section title="My Details" icon={<User className="h-4 w-4" />}>
                <AnimatePresence mode="wait">
                  {!editing ? (
                    <motion.div key="view" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 mb-6">
                        <Field label="Full Name" value={participant.name} />
                        <Field label="Email" value={participant.email} />
                        <Field label="Phone" value={participant.phone} />
                        <Field label="Company" value={participant.company} />
                        <Field label="Designation" value={participant.designation} />
                        <Field label="Country" value={participant.country} />
                      </div>
                      <button onClick={edits_locked ? undefined : startEdit} disabled={edits_locked}
                        title={edits_locked ? "Edits locked — too close to the event date or registration closed" : undefined}
                        className="flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-500/10 border border-indigo-500/20
                                   text-indigo-400 font-black text-xs uppercase tracking-wider hover:bg-indigo-500/20
                                   disabled:opacity-40 disabled:cursor-not-allowed transition-all">
                        <Edit3 className="h-3.5 w-3.5" />
                        Edit Details
                        {edits_locked && (
                          <span className="ml-1 bg-amber-500/10 text-amber-400 border border-amber-500/20 px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider">
                            Locked
                          </span>
                        )}
                      </button>
                    </motion.div>
                  ) : (
                    <motion.div key="edit" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-4">
                      {(["name", "email", "phone", "company", "designation", "country"] as const).map(f => {
                        const isEmail = f === "email";
                        const isEmailChangeLocked = isEmail && ["submitted", "pending_review", "approved", "waitlisted", "rejected"].includes(data?.registration?.status || "");
                        
                        if (f === "phone") {
                          const rawValue = editForm.phone || "";
                          
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
                            setEditForm(prev => ({ ...prev, phone: combined }));
                          };
                          
                          return (
                            <div key={f} className="space-y-1.5">
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
                                  className={`input flex-1 ${
                                    isInvalid 
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
                        
                        return (
                          <div key={f}>
                            <label className="text-[9px] font-black text-[var(--muted)] uppercase tracking-widest block mb-1.5 capitalize">{f}</label>
                            <input type={isEmail ? "email" : "text"}
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

                      {saveError && (
                        <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-rose-500/10 border border-rose-500/20">
                          <AlertCircle className="h-4 w-4 text-rose-400 shrink-0" />
                          <p className="text-xs font-bold text-rose-400">{saveError}</p>
                        </div>
                      )}

                      <div className="flex gap-3 pt-1">
                        <button onClick={saveEdit} disabled={saving}
                          className="btn-primary flex items-center gap-2 px-6 h-11 rounded-full">
                          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                          Save
                        </button>
                        <button onClick={() => setEditing(false)}
                          className="flex items-center gap-2 px-6 h-11 rounded-xl bg-white/5 border border-white/10
                                     text-[var(--muted)] font-black text-xs uppercase tracking-wider hover:bg-white/10 transition-all">
                          <X className="h-4 w-4" />Cancel
                        </button>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </Section>
            )}

            {/* Section D — Event Information & Announcements (Only if Registered) */}
            {isRegistered && (
              <Section title="Event Information" icon={<Calendar className="h-4 w-4" />}>
                <div className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="flex items-start gap-3">
                      <Calendar className="h-4 w-4 text-indigo-400 mt-0.5 shrink-0" />
                      <div>
                        <p className="text-[9px] font-black text-[var(--muted)] uppercase tracking-widest mb-0.5">Dates</p>
                        <p className="text-sm font-semibold text-[#E8EAFF]">
                          {fmtDate(event.start_date)}
                          {event.end_date && event.end_date !== event.start_date && <> — {fmtDate(event.end_date)}</>}
                        </p>
                      </div>
                    </div>
                    {event.venue && (
                      <div className="flex items-start gap-3">
                        <MapPin className="h-4 w-4 text-indigo-400 mt-0.5 shrink-0" />
                        <div>
                          <p className="text-[9px] font-black text-[var(--muted)] uppercase tracking-widest mb-0.5">Venue</p>
                          <p className="text-sm font-semibold text-[#E8EAFF]">{event.venue}</p>
                        </div>
                      </div>
                    )}
                  </div>

                  {event.support_email && (
                    <div className="flex items-center gap-3">
                      <Mail className="h-4 w-4 text-indigo-400 shrink-0" />
                      <a href={`mailto:${event.support_email}`} className="text-sm font-black text-indigo-400 hover:underline">
                        {event.support_email}
                      </a>
                    </div>
                  )}

                  {event.announcements && (
                    <div className="space-y-4">
                      <p className="text-[9px] font-black text-indigo-400 uppercase tracking-[0.3em]">Announcements</p>
                      {Array.isArray(event.announcements) ? (
                        event.announcements.map((ann: any, idx: number) => {
                          const type = ann.type || "info";
                          const styles = {
                            info: { border: "border-indigo-500/20 bg-indigo-500/5", badge: "text-indigo-400 border-indigo-500/25", label: "Notice" },
                            warning: { border: "border-amber-500/20 bg-amber-500/5", badge: "text-amber-400 border-amber-500/25", label: "Warning" },
                            success: { border: "border-emerald-500/20 bg-emerald-500/5", badge: "text-emerald-400 border-emerald-500/25", label: "Update" },
                            error: { border: "border-rose-500/20 bg-rose-500/5", badge: "text-rose-400 border-rose-500/25", label: "Alert" }
                          }[type as "info" | "warning" | "success" | "error"] || { border: "border-indigo-500/20 bg-indigo-500/5", badge: "text-indigo-400 border-indigo-500/25", label: "Notice" };

                          return (
                            <div key={ann.id || idx} className={`border rounded-2xl px-5 py-4 ${styles.border}`}>
                              <div className="flex items-center gap-2 mb-1.5">
                                <span className={`inline-flex px-1.5 py-0.5 rounded border text-[8px] font-black uppercase tracking-wider ${styles.badge}`}>
                                  {styles.label}
                                </span>
                              </div>
                              <p className="text-xs font-bold text-[var(--muted)] whitespace-pre-line leading-relaxed">
                                {ann.message}
                              </p>
                            </div>
                          );
                        })
                      ) : (
                        <div className="bg-indigo-500/5 border border-indigo-500/20 rounded-2xl px-5 py-4">
                          <p className="text-xs font-bold text-[var(--muted)] whitespace-pre-line leading-relaxed">
                            {event.announcements}
                          </p>
                        </div>
                      )}
                    </div>
                  )}

                  <div className="pt-2 border-t border-white/5">
                    <p className="text-[9px] font-black text-[var(--muted)] uppercase tracking-widest mb-1.5">Event Program</p>
                    {event.program_url ? (
                      <a
                        href={event.program_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="btn-primary inline-flex items-center gap-2 px-5 h-10 rounded-xl text-xs"
                      >
                        Download Program <ChevronRight className="h-3.5 w-3.5" />
                      </a>
                    ) : (
                      <div className="space-y-1.5">
                        <button
                          disabled
                          className="inline-flex items-center gap-2 px-5 h-10 rounded-xl bg-white/5 border border-white/5 text-[var(--muted)] text-xs font-black cursor-not-allowed opacity-50"
                        >
                          Download Program
                        </button>
                        <p className="text-[9px] font-bold text-rose-400">Program not made now</p>
                      </div>
                    )}
                  </div>
                </div>
              </Section>
            )}

            {/* Special Notice for non-registered users when registration is closed */}
            {!isRegistered && registration.status === "closed" && (
              <Section title="Announcements" icon={<Megaphone className="h-4 w-4 text-rose-400" />}>
                <div className="border border-rose-500/20 bg-rose-500/5 rounded-2xl px-5 py-4">
                  <div className="flex items-center gap-2 mb-1.5">
                    <span className="inline-flex px-1.5 py-0.5 rounded border border-rose-500/25 text-[8px] font-black uppercase tracking-wider text-rose-400">
                      Alert
                    </span>
                  </div>
                  <p className="text-xs font-bold text-[var(--muted)] whitespace-pre-line leading-relaxed">
                    Registration is now closed.
                  </p>
                </div>
              </Section>
            )}
          </div>
        </div>
        </>)}
      </div>

      {/* OTP Verification Modal */}
      <AnimatePresence>
        {verifyingEmailChange && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-6 backdrop-blur-md bg-[#080912]/60">
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
                  className="btn-primary flex-1 h-11 rounded-xl flex items-center justify-center gap-2"
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
    </div>
  );
}
