"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  CheckCircle2, Clock, AlertCircle, XCircle, HelpCircle,
  User, Ticket, Calendar, MapPin, Mail, Phone, Building,
  Briefcase, Globe, Edit3, Save, X, ExternalLink, ChevronRight,
  ChevronDown, Loader2, Megaphone, ArrowRight, Check, FileText,
  Download, Award, Sparkles, Presentation, CreditCard, Tag,
  ShieldCheck, Wallet, Bookmark, Layers, Printer, Info, AlertTriangle, Lock
} from "lucide-react";
import { toast } from "sonner";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { COUNTRY_DIAL_CODES, getDialCodeForCountry } from "@/lib/country-dial-codes";
import { fallbackCountryStates, getStatesForCountry } from "@/lib/country-states";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";

const TITLE_OPTIONS = ["Dr.", "Prof.", "Mr.", "Ms.", "Mrs."];

function parseFullName(title?: string, firstName?: string, lastName?: string, fullName?: string) {
  let titleOut = title || "Dr.";
  let firstOut = (firstName || "").trim();
  let lastOut = (lastName || "").trim();
  const full = (fullName || "").trim();

  const titleMatches = ["Dr.", "Dr", "Prof.", "Prof", "Mr.", "Mr", "Mrs.", "Mrs", "Ms.", "Ms", "Mx."];

  if (full) {
    let cleaned = full;
    for (const t of titleMatches) {
      if (cleaned.toLowerCase().startsWith(t.toLowerCase() + " ")) {
        titleOut = t.endsWith(".") ? t : `${t}.`;
        cleaned = cleaned.slice(t.length).trim();
        break;
      }
    }
    const parts = cleaned.split(/\s+/).filter(Boolean);

    if (!firstOut && parts.length > 0) {
      firstOut = parts[0];
      if (!lastOut && parts.length > 1) {
        lastOut = parts.slice(1).join(" ");
      }
    } else if (
      lastOut.toLowerCase() === full.toLowerCase() ||
      lastOut.toLowerCase() === cleaned.toLowerCase() ||
      (firstOut && lastOut.toLowerCase() === firstOut.toLowerCase())
    ) {
      if (parts.length > 1) {
        firstOut = parts[0];
        lastOut = parts.slice(1).join(" ");
      } else {
        lastOut = "";
      }
    }
  }

  for (const t of titleMatches) {
    if (firstOut.toLowerCase().startsWith(t.toLowerCase() + " ")) {
      titleOut = t.endsWith(".") ? t : `${t}.`;
      firstOut = firstOut.slice(t.length).trim();
      break;
    }
  }

  if (firstOut && lastOut.toLowerCase().startsWith(firstOut.toLowerCase() + " ")) {
    lastOut = lastOut.slice(firstOut.length).trim();
  }

  return {
    title: TITLE_OPTIONS.includes(titleOut) ? titleOut : "Dr.",
    first_name: firstOut,
    last_name: lastOut,
  };
}

export default function AttendeeExecutiveDashboard() {
  const { eventId } = useParams<{ eventId: string }>();
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<any>(null);

  // Profile Edit Modal State
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState<{
    title: string;
    first_name: string;
    last_name: string;
    email: string;
    phone_dial: string;
    phone_number: string;
    designation: string;
    company: string;
    country: string;
    state: string;
    custom_fields: Record<string, any>;
  }>({
    title: "Dr.",
    first_name: "",
    last_name: "",
    email: "",
    phone_dial: "+91",
    phone_number: "",
    designation: "",
    company: "",
    country: "India",
    state: "",
    custom_fields: {},
  });
  const [saving, setSaving] = useState(false);

  // Modals & UI States
  const [receiptModalOpen, setReceiptModalOpen] = useState(false);
  const [paymentModalOpen, setPaymentModalOpen] = useState(false);
  const [allAnnouncementsOpen, setAllAnnouncementsOpen] = useState(false);
  const [expandedAnnouncements, setExpandedAnnouncements] = useState<Record<string, boolean>>({});

  // Payment Checkout States
  const [couponCode, setCouponCode] = useState("");
  const [validatingCoupon, setValidatingCoupon] = useState(false);
  const [appliedCoupon, setAppliedCoupon] = useState<{
    code: string;
    discount_amount: number;
    total_price: number;
  } | null>(null);
  const [submittingPayment, setSubmittingPayment] = useState(false);

  const tokenKey = `portal_token_${eventId}`;

  const fetchDashboard = useCallback(async () => {
    const token = localStorage.getItem(tokenKey);
    if (!token) {
      router.replace(`/${eventId}/login`);
      return;
    }

    try {
      const res = await fetch(`${API_BASE}/api/v1/portal/dashboard`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (res.status === 401) {
        localStorage.removeItem(tokenKey);
        router.replace(`/${eventId}/login`);
        return;
      }

      if (!res.ok) throw new Error("Failed to load registration dashboard");

      const dashData = await res.json();
      setData(dashData);

      const p = dashData?.participant || {};
      const reg = dashData?.registration || {};

      // Parse phone into dial code & number
      let rawPhone = p.phone || reg.registration_data?.phone || "";
      let foundDial = "+91";
      let plainPhone = rawPhone;

      for (const item of COUNTRY_DIAL_CODES) {
        if (rawPhone.startsWith(item.dial_code)) {
          foundDial = item.dial_code;
          plainPhone = rawPhone.slice(item.dial_code.length).trim();
          break;
        }
      }

      const initialCountry = p.country || reg.registration_data?.country || "India";
      if (!rawPhone) {
        foundDial = getDialCodeForCountry(initialCountry);
      }

      const parsed = parseFullName(
        p.title || reg.registration_data?.title || reg.title,
        p.first_name || reg.registration_data?.first_name,
        p.last_name || reg.registration_data?.last_name,
        p.name || reg.name || reg.registration_data?.name
      );

      setEditForm({
        title: parsed.title,
        first_name: parsed.first_name,
        last_name: parsed.last_name,
        email: p.email || reg.email || reg.registration_data?.email || "",
        phone_dial: foundDial,
        phone_number: plainPhone,
        designation: p.designation || reg.registration_data?.designation || "",
        company: p.company || reg.registration_data?.company || "",
        country: initialCountry,
        state: p.state || reg.registration_data?.state || "",
        custom_fields: p.custom_fields || reg.registration_data?.custom_fields || {},
      });
    } catch (err) {
      console.error("Dashboard error", err);
      toast.error("Failed to load dashboard.");
    } finally {
      setLoading(false);
    }
  }, [eventId, router, tokenKey]);

  useEffect(() => {
    fetchDashboard();
  }, [fetchDashboard]);

  // Handle saving updated profile details
  const handleSaveProfile = async () => {
    const token = localStorage.getItem(tokenKey);
    if (!token) return;

    setSaving(true);
    try {
      const fullPhone = editForm.phone_number.trim()
        ? `${editForm.phone_dial} ${editForm.phone_number.trim()}`
        : "";
      const constructedName = `${editForm.title} ${editForm.first_name.trim()} ${editForm.last_name.trim()}`.trim();

      const payload = {
        name: constructedName,
        first_name: editForm.first_name.trim(),
        last_name: editForm.last_name.trim(),
        title: editForm.title,
        phone: fullPhone,
        designation: editForm.designation.trim(),
        company: editForm.company.trim(),
        country: editForm.country,
        state: editForm.state,
        custom_fields: editForm.custom_fields,
      };

      const res = await fetch(`${API_BASE}/api/v1/portal/attendee/details`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || "Failed to update profile");
      }

      const updated = await res.json();
      toast.success("Profile details updated successfully!");
      if (updated.new_token) {
        localStorage.setItem(tokenKey, updated.new_token);
      }
      setEditing(false);
      await fetchDashboard();
    } catch (err: any) {
      toast.error(err.message || "Failed to save profile changes.");
    } finally {
      setSaving(false);
    }
  };

  // Validate and apply promo coupon for unpaid attendee
  const handleApplyCoupon = async (roleName: string) => {
    if (!couponCode.trim()) return;
    setValidatingCoupon(true);
    try {
      const res = await fetch(`${API_BASE}/api/v1/portal/registration/${eventId}/validate-coupon`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: couponCode.trim(), role: roleName || "Delegate" }),
      });
      const valData = await res.json();
      if (!res.ok) throw new Error(valData.detail || "Invalid coupon code.");
      setAppliedCoupon({
        code: couponCode.trim().toUpperCase(),
        discount_amount: Number(valData.discount_amount || 0),
        total_price: Number(valData.final_price || 0),
      });
      toast.success(`Coupon ${couponCode.toUpperCase()} applied!`);
    } catch (err: any) {
      toast.error(err.message || "Failed to apply coupon.");
    } finally {
      setValidatingCoupon(false);
    }
  };

  // Complete Payment via Active Gateway
  const handleCompletePayment = async () => {
    const token = localStorage.getItem(tokenKey);
    if (!token) return;
    setSubmittingPayment(true);
    try {
      // 1. Initialize checkout session
      const checkoutRes = await fetch(`${API_BASE}/api/v1/portal/attendee/payment/checkout`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          promo_code: appliedCoupon?.code || "",
          redirect_base_url: typeof window !== "undefined" ? window.location.href : "",
        }),
      });
      const checkoutData = await checkoutRes.json();
      if (!checkoutRes.ok) throw new Error(checkoutData.detail || "Failed to initialize payment.");

      // 2. Confirm and finalize the payment transaction
      const confirmRes = await fetch(`${API_BASE}/api/v1/portal/attendee/payment/confirm`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          transaction_id: checkoutData.transaction_id,
          gateway_order_id: checkoutData.payment_details?.gateway_order_id,
          gateway_payment_id: `pay_${Date.now()}`,
          simulated: true,
        }),
      });
      const confirmData = await confirmRes.json();
      if (!confirmRes.ok) throw new Error(confirmData.detail || "Failed to confirm payment.");

      toast.success("Payment completed successfully! 🎉");
      setPaymentModalOpen(false);
      await fetchDashboard();
      setReceiptModalOpen(true);
    } catch (err: any) {
      toast.error(err.message || "Payment process failed.");
    } finally {
      setSubmittingPayment(false);
    }
  };

  // Printable Tax Invoice / Payment Receipt Window
  const downloadReceipt = (payment: any, event: any, participant: any) => {
    if (!payment) {
      toast.error("No payment transaction details found.");
      return;
    }
    try {
      const printWindow = window.open("", "_blank", "width=850,height=900");
      if (!printWindow) {
        toast.error("Popup blocked. Please allow popups to print receipt.");
        return;
      }

      const eventName = event?.name || "";
      const shortCode = event?.short_code || event?.code || "";
      const dateFormatted = payment?.created_at
        ? new Date(payment.created_at).toLocaleDateString("en-IN", {
            day: "numeric",
            month: "long",
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit",
          })
        : new Date().toLocaleDateString("en-IN");

      const currency = payment?.currency || "INR";
      const amount = Number(payment?.amount || 0).toLocaleString("en-IN");
      const discount = Number(payment?.discount_applied || 0).toLocaleString("en-IN");
      const txnId = (payment?.transaction_id || payment?.gateway_payment_id || "TXN-DIRECT").toUpperCase();
      const method = (payment?.payment_method || "Online Payment").toUpperCase();
      const attendeeName =
        participant?.name ||
        `${participant?.first_name || ""} ${participant?.last_name || ""}`.trim() ||
        "Attendee";
      const attendeeEmail = participant?.email || "";
      const attendeeReg = participant?.regno || "";
      const supportEmail = event?.support_email || "support@eventos.io";

      const pri = typeof window !== "undefined"
        ? getComputedStyle(document.documentElement).getPropertyValue("--pri").trim() || event?.primary_color || "#6366f1"
        : event?.primary_color || "#6366f1";
      const sec = typeof window !== "undefined"
        ? getComputedStyle(document.documentElement).getPropertyValue("--sec").trim() || event?.secondary_color || "#8b5cf6"
        : event?.secondary_color || "#8b5cf6";

      printWindow.document.write(`
        <!DOCTYPE html>
        <html>
          <head>
            <title>Tax Invoice - ${txnId}</title>
            <meta charset="utf-8" />
            <style>
              @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;600;700;800;900&display=swap');
              * { box-sizing: border-box; margin: 0; padding: 0; }
              body {
                font-family: 'Plus Jakarta Sans', sans-serif;
                color: #0f172a;
                background-color: #f8fafc;
                padding: 40px 20px;
                line-height: 1.5;
              }
              .invoice-card {
                max-width: 680px;
                margin: 0 auto;
                background: #ffffff;
                border: 1px solid #e2e8f0;
                border-radius: 24px;
                padding: 40px;
                box-shadow: 0 20px 40px -10px rgba(0, 0, 0, 0.08);
                position: relative;
                overflow: hidden;
              }
              .top-gradient-strip {
                height: 6px;
                background: linear-gradient(90deg, ${pri}, ${sec});
                margin: -40px -40px 28px -40px;
              }
              .header-bar {
                display: flex;
                justify-content: space-between;
                align-items: flex-start;
                border-bottom: 2px solid #f1f5f9;
                padding-bottom: 24px;
                margin-bottom: 28px;
              }
              .brand-title {
                font-size: 20px;
                font-weight: 900;
                color: #0f172a;
              }
              .brand-sub {
                font-size: 11px;
                font-weight: 700;
                text-transform: uppercase;
                letter-spacing: 0.1em;
                color: ${pri};
                margin-top: 2px;
              }
              .receipt-badge {
                display: inline-block;
                padding: 6px 14px;
                background: linear-gradient(135deg, ${pri}14, ${sec}14);
                color: ${pri};
                border: 1px solid ${pri}40;
                border-radius: 9999px;
                font-size: 11px;
                font-weight: 800;
                text-transform: uppercase;
                letter-spacing: 0.08em;
              }
              .grid-2 {
                display: grid;
                grid-template-columns: 1fr 1fr;
                gap: 24px;
                margin-bottom: 28px;
              }
              .meta-label {
                font-size: 10px;
                font-weight: 800;
                text-transform: uppercase;
                letter-spacing: 0.08em;
                color: #64748b;
                margin-bottom: 4px;
              }
              .meta-value {
                font-size: 14px;
                font-weight: 700;
                color: #0f172a;
              }
              .table-wrap {
                width: 100%;
                border: 1px solid #e2e8f0;
                border-radius: 14px;
                overflow: hidden;
                margin-bottom: 28px;
              }
              table {
                width: 100%;
                border-collapse: collapse;
              }
              th {
                background: #f8fafc;
                padding: 12px 16px;
                font-size: 11px;
                font-weight: 800;
                text-transform: uppercase;
                letter-spacing: 0.06em;
                color: #475569;
                border-bottom: 1px solid #e2e8f0;
              }
              td {
                padding: 14px 16px;
                font-size: 13px;
                font-weight: 600;
                color: #1e293b;
                border-bottom: 1px solid #f1f5f9;
              }
              .role-tag {
                display: inline-block;
                padding: 3px 10px;
                background: linear-gradient(135deg, ${pri}15, ${sec}15);
                color: ${pri};
                border: 1px solid ${pri}30;
                border-radius: 6px;
                font-size: 11px;
                font-weight: 700;
                text-transform: uppercase;
              }
              .total-row {
                background: #f8fafc;
                font-weight: 800;
                font-size: 15px;
                color: #0f172a;
              }
              .footer-note {
                border-top: 1px dashed #cbd5e1;
                padding-top: 20px;
                text-align: center;
                font-size: 11px;
                font-weight: 600;
                color: #64748b;
              }
              @media print {
                body { background: #fff; padding: 0; }
                .invoice-card { border: none; box-shadow: none; padding: 20px; }
              }
            </style>
          </head>
          <body>
            <div class="invoice-card">
              <div class="top-gradient-strip"></div>
              <div class="header-bar">
                <div>
                  <div class="brand-title">${eventName}</div>
                  <div class="brand-sub">Official Tax Invoice & Payment Receipt • ${shortCode}</div>
                </div>
                <div class="receipt-badge">Paid & Confirmed</div>
              </div>

              <div class="grid-2">
                <div>
                  <div class="meta-label">Billed To</div>
                  <div class="meta-value">${attendeeName}</div>
                  ${attendeeReg ? `<div style="font-size: 12px; color: ${pri}; font-weight: 700; margin-top: 2px;">Reg #: ${attendeeReg}</div>` : ""}
                  <div style="font-size: 12px; color: #475569; font-weight: 500; margin-top: 2px;">${attendeeEmail}</div>
                </div>
                <div>
                  <div class="meta-label">Transaction Reference</div>
                  <div class="meta-value" style="font-family: monospace; font-size: 12px;">${txnId}</div>
                  <div style="font-size: 12px; color: #475569; font-weight: 500; margin-top: 4px;">Date: ${dateFormatted}</div>
                  <div style="font-size: 12px; color: #475569; font-weight: 500;">Method: ${method}</div>
                </div>
              </div>

              <div class="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Item Description</th>
                      <th>Category</th>
                      <th style="text-align: right;">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td>
                        <div style="font-weight: 700;">Conference Delegate Registration</div>
                        <div style="font-size: 11px; color: #64748b;">${eventName}</div>
                      </td>
                      <td><span class="role-tag">${participant?.role || "Delegate"}</span></td>
                      <td style="text-align: right; font-weight: 700;">${currency} ${amount}</td>
                    </tr>
                    ${
                      Number(payment?.discount_applied || 0) > 0
                        ? `<tr>
                            <td colspan="2" style="color: #059669; font-weight: 600;">Promo / Coupon Discount</td>
                            <td style="text-align: right; color: #059669; font-weight: 700;">-${currency} ${discount}</td>
                          </tr>`
                        : ""
                    }
                    <tr class="total-row">
                      <td colspan="2" style="font-weight: 800; font-size: 14px; text-transform: uppercase; letter-spacing: 0.05em;">Total Amount Paid</td>
                      <td style="text-align: right; font-size: 16px; font-weight: 900; color: ${pri};">${currency} ${amount}</td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <div class="footer-note">
                This is a computer-generated tax invoice and does not require a physical signature.<br />
                For any billing assistance, please contact <strong>${supportEmail}</strong>
              </div>
            </div>
            <script>
              window.onload = function() {
                setTimeout(function() {
                  window.print();
                }, 300);
              };
            </script>
          </body>
        </html>
      `);
      printWindow.document.close();
    } catch {
      toast.error("Failed to generate tax invoice.");
    }
  };

  // Download Ticket JPG matching PDF ticket layout (with Primary/Secondary Gradient Header)
  const downloadTicketJPG = (regno: string, name: string, role: string, eventName: string) => {
    try {
      const canvas = document.createElement("canvas");
      canvas.width = 440;
      canvas.height = 620;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      const pri = typeof window !== "undefined"
        ? getComputedStyle(document.documentElement).getPropertyValue("--pri").trim() || "#6366f1"
        : "#6366f1";
      const sec = typeof window !== "undefined"
        ? getComputedStyle(document.documentElement).getPropertyValue("--sec").trim() || "#8b5cf6"
        : "#8b5cf6";

      // Outer background (Crisp White Ticket Body)
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, 440, 620);

      // Top Theme Gradient Header
      const grad = ctx.createLinearGradient(0, 0, 440, 115);
      grad.addColorStop(0, pri);
      grad.addColorStop(1, sec);
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, 440, 115);

      // Event title & ticket label
      ctx.fillStyle = "#ffffff";
      ctx.font = "900 17px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(eventName.length > 28 ? eventName.slice(0, 28) + "..." : eventName, 220, 52);

      ctx.fillStyle = "rgba(255,255,255,0.9)";
      ctx.font = "bold 10px sans-serif";
      ctx.fillText("OFFICIAL ATTENDEE ENTRY PASS", 220, 78);

      // Attendee Name
      ctx.fillStyle = "#0f172a";
      ctx.font = "900 20px sans-serif";
      ctx.fillText(name.length > 24 ? name.slice(0, 24) + "..." : name, 220, 158);

      // Role Pill Badge with Gradient Fill
      const badgeGrad = ctx.createLinearGradient(130, 172, 310, 198);
      badgeGrad.addColorStop(0, pri);
      badgeGrad.addColorStop(1, sec);
      ctx.fillStyle = badgeGrad;
      ctx.beginPath();
      ctx.roundRect(130, 172, 180, 26, 13);
      ctx.fill();
      ctx.fillStyle = "#ffffff";
      ctx.font = "bold 11px sans-serif";
      ctx.fillText(role.toUpperCase(), 220, 190);

      // Registration Number Box
      ctx.fillStyle = "#64748b";
      ctx.font = "bold 12px monospace";
      ctx.fillText(`REG ID: ${regno}`, 220, 224);

      // QR Code Container Box
      ctx.strokeStyle = "#e2e8f0";
      ctx.lineWidth = 1.5;
      ctx.strokeRect(110, 240, 220, 220);

      // Standard Black on White QR Code Image (no color bleeding)
      const qrImg = new Image();
      qrImg.crossOrigin = "Anonymous";
      qrImg.src = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&bgcolor=FFFFFF&color=000000&data=${encodeURIComponent(
        regno
      )}`;
      
      const finalizeDownload = () => {
        ctx.fillStyle = "#64748b";
        ctx.font = "11px sans-serif";
        ctx.fillText("Present this pass at the reception desk", 220, 495);
        ctx.fillText("for check-in and instant badge printing", 220, 515);

        // Gradient divider bar
        const bottomGrad = ctx.createLinearGradient(30, 545, 410, 545);
        bottomGrad.addColorStop(0, pri);
        bottomGrad.addColorStop(1, sec);
        ctx.strokeStyle = bottomGrad;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(30, 545);
        ctx.lineTo(410, 545);
        ctx.stroke();

        ctx.fillStyle = "#94a3b8";
        ctx.font = "bold 9px sans-serif";
        ctx.fillText("OFFICIAL EVENT PASS • EVENTOS PLATFORM", 220, 580);

        const a = document.createElement("a");
        a.download = `${regno}_entry_pass.jpg`;
        a.href = canvas.toDataURL("image/jpeg", 0.95);
        a.click();
        toast.success("Official Entry Pass image downloaded!");
      };

      qrImg.onload = () => {
        ctx.drawImage(qrImg, 120, 250, 200, 200);
        finalizeDownload();
      };
      qrImg.onerror = () => {
        finalizeDownload();
      };
    } catch {
      toast.error("Failed to generate pass image.");
    }
  };

  // Printable Ticket Window (PDF format with Primary/Secondary Gradient Styling)
  const downloadTicketPDF = (regno: string, name: string, role: string, eventName: string) => {
    try {
      const printWindow = window.open("", "_blank", "width=700,height=900");
      if (!printWindow) {
        toast.error("Popup blocked. Please allow popups to view ticket.");
        return;
      }
      
      const pri = typeof window !== "undefined"
        ? getComputedStyle(document.documentElement).getPropertyValue("--pri").trim() || "#6366f1"
        : "#6366f1";
      const sec = typeof window !== "undefined"
        ? getComputedStyle(document.documentElement).getPropertyValue("--sec").trim() || "#8b5cf6"
        : "#8b5cf6";

      printWindow.document.write(`
        <!DOCTYPE html>
        <html>
          <head>
            <title>${regno} - Entry Pass Ticket</title>
            <meta charset="utf-8" />
            <style>
              @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;600;700;900&display=swap');
              * { box-sizing: border-box; margin: 0; padding: 0; }
              body {
                font-family: 'Plus Jakarta Sans', sans-serif;
                background: #f8fafc;
                display: flex;
                align-items: center;
                justify-content: center;
                min-height: 100vh;
                padding: 24px;
              }
              .ticket {
                background: #ffffff;
                border: 2px solid #e2e8f0;
                border-top: 5px solid ${pri};
                border-radius: 24px;
                width: 380px;
                overflow: hidden;
                box-shadow: 0 20px 40px rgba(0,0,0,0.08);
              }
              .ticket-header {
                background: linear-gradient(135deg, ${pri}, ${sec});
                padding: 28px 24px;
                text-align: center;
                color: #ffffff;
              }
              .event-title {
                font-size: 17px;
                font-weight: 900;
                margin-bottom: 4px;
              }
              .ticket-type {
                font-size: 10px;
                font-weight: 700;
                text-transform: uppercase;
                letter-spacing: 0.12em;
                opacity: 0.9;
              }
              .ticket-body {
                padding: 28px 24px;
                text-align: center;
              }
              .attendee-name {
                font-size: 20px;
                font-weight: 900;
                color: #0f172a;
                margin-bottom: 6px;
              }
              .role-badge {
                display: inline-block;
                padding: 4px 14px;
                background: linear-gradient(135deg, ${pri}18, ${sec}18);
                color: ${pri};
                border: 1px solid ${pri}40;
                border-radius: 9999px;
                font-size: 10px;
                font-weight: 800;
                text-transform: uppercase;
                letter-spacing: 0.08em;
                margin-bottom: 16px;
              }
              .reg-box {
                font-family: monospace;
                font-size: 12px;
                font-weight: 700;
                color: #64748b;
                margin-bottom: 16px;
              }
              .qr-box {
                display: flex;
                justify-content: center;
                margin-bottom: 16px;
              }
              .qr-box img {
                width: 180px;
                height: 180px;
                border-radius: 12px;
                border: 1.5px solid ${pri}30;
                padding: 6px;
                background: #fff;
              }
              .instruction {
                font-size: 11px;
                color: #64748b;
                line-height: 1.5;
              }
              @media print {
                body { background: #fff; padding: 0; }
                .ticket { border: none; box-shadow: none; width: 100%; max-width: 400px; margin: 0 auto; }
              }
            </style>
          </head>
          <body>
            <div class="ticket">
              <div class="ticket-header">
                <div class="event-title">${eventName}</div>
                <div class="ticket-type">Official Attendee Entry Ticket</div>
              </div>
              <div class="ticket-body">
                <div class="attendee-name">${name}</div>
                <div class="role-badge">${role}</div>
                <div class="reg-box">REG #: ${regno}</div>
                <div class="qr-box">
                  <img src="https://api.qrserver.com/v1/create-qr-code/?size=220x220&bgcolor=FFFFFF&color=000000&data=${encodeURIComponent(
                    regno
                  )}" />
                </div>
                <div class="instruction">
                  Present this pass at the registration desk for check-in and instant badge printing.
                </div>
              </div>
            </div>
            <script>
              window.onload = function() {
                setTimeout(function() {
                  window.print();
                }, 300);
              };
            </script>
          </body>
        </html>
      `);
      printWindow.document.close();
    } catch {
      toast.error("Failed to generate ticket.");
    }
  };

  if (loading) {
    return (
      <div className="min-h-[80vh] flex flex-col items-center justify-center p-4">
        <Loader2 className="h-9 w-9 animate-spin text-[var(--pri)] mb-3" />
        <span className="text-xs font-black uppercase tracking-widest text-[var(--muted)]">
          Loading Attendee Dashboard...
        </span>
      </div>
    );
  }

  const event = data?.event || {};
  const participant = data?.participant;
  const registration = data?.registration || {};
  const payment = data?.payment;

  // Check speaker entitlement
  const registeredRole = (participant?.role || registration?.role || "").toLowerCase();
  const SPEAKER_ROLE_KEYWORDS = ["speaker", "faculty", "keynote", "invited", "panelist", "moderator"];
  const isSpeaker = data?.is_speaker || SPEAKER_ROLE_KEYWORDS.some((kw) => registeredRole.includes(kw));

  // If user logged in but not yet registered
  const isNotRegistered = !participant && !registration?.regno;
  const announcements = event.announcements || [];

  const attendeeName = participant?.name
    ? participant.name
    : participant?.first_name
    ? `${participant.first_name} ${participant.last_name || ""}`.trim()
    : registration.name || "";
  const firstName = participant?.first_name || attendeeName.split(" ")[0] || "Attendee";
  const roleName = (participant?.role || registration.role || "").toUpperCase();
  const regno = participant?.regno || registration.regno || "";
  const eventName = event.name || "";

  const formatDateTime = (dStr?: string | null) => {
    if (!dStr) return "";
    try {
      const d = new Date(dStr);
      if (isNaN(d.getTime())) return "";
      const datePart = d.toLocaleDateString("en-IN", {
        day: "numeric",
        month: "short",
        year: "numeric",
      });
      const timePart = d.toLocaleTimeString("en-IN", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: true,
      });
      return `${datePart}, ${timePart}`;
    } catch {
      return "";
    }
  };

  const registeredAtRaw =
    participant?.registered_at ||
    participant?.created_at ||
    registration?.submitted_at ||
    registration?.created_at ||
    registration?.registration_data?.created_at ||
    null;

  const updatedAtRaw =
    participant?.updated_at ||
    registration?.updated_at ||
    null;

  const registeredOnFormatted = formatDateTime(registeredAtRaw);
  const updatedOnFormatted = formatDateTime(updatedAtRaw);

  const isProfileUpdated = Boolean(
    updatedAtRaw &&
    registeredAtRaw &&
    Math.abs(new Date(updatedAtRaw).getTime() - new Date(registeredAtRaw).getTime()) > 5000
  );

  const dbPricing = data?.pricing;
  const activeTier = dbPricing?.active_tier || "Standard";
  const currency = dbPricing?.currency || event?.currency || "INR";
  
  // Resolve base price using dbPricing.base_price, active_prices mapping, or registration data
  let basePrice = Number(dbPricing?.base_price || 0);
  if (basePrice === 0 && dbPricing?.active_prices) {
    if (roleName && dbPricing.active_prices[roleName] !== undefined) {
      basePrice = Number(dbPricing.active_prices[roleName]);
    } else if (roleName) {
      for (const [rK, rV] of Object.entries(dbPricing.active_prices)) {
        if (rK.toLowerCase() === roleName.toLowerCase()) {
          basePrice = Number(rV);
          break;
        }
      }
    }
  }
  if (basePrice === 0 && (registration?.registration_data?.amount_paid || registration?.registration_data?.amount)) {
    basePrice = Number(registration.registration_data.amount_paid || registration.registration_data.amount || 0);
  }

  const isPaid = (
    participant?.paid_status === "Paid" ||
    payment?.status === "completed" ||
    data?.registration?.paid_status === "Paid" ||
    data?.registration?.registration_data?.paid_status === "Paid"
  );

  const paymentAmount = payment?.amount
    ? `${payment.currency || currency} ${Number(payment.amount).toLocaleString("en-IN")}`
    : isPaid
    ? "Settled"
    : basePrice > 0
    ? `${currency} ${Number(basePrice).toLocaleString("en-IN")}`
    : "Payment Pending";

  // Check if attendee profile has missing fields
  const isProfileIncomplete = !participant?.designation || !participant?.company || !participant?.phone || !participant?.country;

  // Available states based on country
  const stateOptions = getStatesForCountry(fallbackCountryStates, editForm.country);

  return (
    <div className="min-h-screen pb-16 bg-transparent text-[var(--text)] transition-colors duration-200 relative z-10">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 pt-8 space-y-8">
        
        {/* ── Top Welcome Greeting Banner + Top-Right Edit Button ─────────────── */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 text-left">
          <div className="space-y-1">
            <motion.h1
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="text-2xl sm:text-3xl md:text-4xl font-extrabold text-[var(--text)] tracking-tight flex items-center gap-2"
            >
              {firstName ? `Hello, ${firstName} 👋` : "Welcome 👋"}
            </motion.h1>
            <motion.p
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.05 }}
              className="text-xs sm:text-sm text-[var(--muted)] font-medium"
            >
              {isNotRegistered
                ? `Complete your registration to get access to ${eventName || "the event"}.`
                : `Here's everything you need for ${eventName || "your conference experience"}.`}
            </motion.p>
          </div>

          {!isNotRegistered && (
            <motion.button
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              type="button"
              onClick={() => setEditing(true)}
              className="h-11 px-5 rounded-2xl border-2 border-[var(--border-default)] bg-[var(--card)] hover:border-[var(--pri)] hover:bg-[var(--bg-surface-hover)] text-[var(--text)] text-xs font-black uppercase tracking-wider flex items-center gap-2 shadow-sm transition-all cursor-pointer shrink-0 sm:self-center"
            >
              <Edit3 className="h-4 w-4 text-[var(--pri)]" />
              <span>Edit Profile</span>
            </motion.button>
          )}
        </div>

        {/* ── Unregistered User: Complete Registration Card ──────────────────── */}
        {isNotRegistered && (
          <motion.div
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            className="p-6 md:p-8 rounded-[24px] border-2 border-dashed border-[var(--pri)]/30 bg-[var(--pri)]/5 text-center space-y-4"
          >
            <div className="h-14 w-14 mx-auto rounded-full bg-[var(--pri)]/10 border border-[var(--pri)]/20 flex items-center justify-center">
              <Ticket className="h-7 w-7 text-[var(--pri)]" />
            </div>
            <div className="space-y-1">
              <h2 className="text-base font-black text-[var(--text)] tracking-tight">
                🎤 Complete Your Registration
              </h2>
              <p className="text-xs text-[var(--muted)] font-medium leading-relaxed max-w-sm mx-auto">
                You're verified but haven't registered yet. Complete your registration to receive your entry pass, QR code, and event access.
              </p>
            </div>
            <button
              type="button"
              onClick={() => router.push(`/${eventId}/register`)}
              className="px-8 py-3 rounded-xl bg-[var(--pri)] hover:opacity-95 text-[var(--primary-contrast,#ffffff)] text-xs font-black uppercase tracking-widest flex items-center gap-2 mx-auto transition-all cursor-pointer shadow-lg shadow-[var(--pri)]/25"
            >
              <span>Open Registration Form</span>
              <ArrowRight className="h-4 w-4 text-[var(--primary-contrast,#ffffff)]" />
            </button>
          </motion.div>
        )}

        {/* ── Speaker Access Banner (visible to speaker-role attendees) ──────── */}
        {!isNotRegistered && isSpeaker && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="p-5 rounded-2xl bg-[var(--sec)]/10 border-2 border-[var(--sec)]/30 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 text-left"
          >
            <div className="flex items-start gap-3">
              <div className="h-10 w-10 rounded-xl bg-[var(--sec)]/20 flex items-center justify-center text-[var(--sec)] shrink-0">
                <Presentation className="h-5 w-5" />
              </div>
              <div className="space-y-0.5">
                <span className="text-xs font-black uppercase tracking-wider text-[var(--sec)] block">
                  🎤 Speaker & Faculty Workspace
                </span>
                <p className="text-[11px] text-[var(--text-secondary)] leading-relaxed">
                  You are registered as a speaker. Upload presentation slides, folders with tree validation, or attach drive links.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => router.push(`/${eventId}/speaker`)}
              className="px-5 py-2.5 rounded-xl bg-[var(--sec)] hover:opacity-95 text-white text-xs font-black uppercase tracking-wider flex items-center gap-2 transition-all cursor-pointer shadow-md shadow-[var(--sec)]/20 shrink-0"
            >
              <span>Open Speaker Center</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </button>
          </motion.div>
        )}

        {/* ── MAIN 2-COLUMN STRUCTURE: ENTRY PASS (LEFT) & ANNOUNCEMENTS (RIGHT) ── */}
        {!isNotRegistered && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch text-left">
            
            {/* ── Column 1: Entry Pass Card (7 Columns) ────────────────────────── */}
            <div className="lg:col-span-7 flex flex-col space-y-3">
              <span className="text-xs font-extrabold text-[var(--text)] tracking-tight block">
                Your Official Entry Pass
              </span>

              <motion.div
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 }}
                className="flex-1 flex flex-col justify-between rounded-[28px] border-2 border-[var(--border-default)] bg-[var(--card)] backdrop-blur-xl p-6 md:p-7 shadow-xl ring-1 ring-black/5 dark:ring-white/10 relative overflow-hidden space-y-6"
              >
                <div className="flex flex-col sm:flex-row items-center sm:items-start gap-6">
                  
                  {/* Pass QR Box or Locked Pass Box */}
                  {isPaid ? (
                    <div className="p-3 bg-white rounded-2xl border-2 border-gray-200 shadow-md shrink-0">
                      <img
                        src={`https://api.qrserver.com/v1/create-qr-code/?size=240x240&bgcolor=FFFFFF&color=000000&data=${encodeURIComponent(
                          regno
                        )}`}
                        alt={`QR code for ${regno}`}
                        className="w-36 h-36 object-contain block bg-white"
                      />
                    </div>
                  ) : (
                    <div className="p-4 bg-[var(--bg-surface-2)] rounded-2xl border-2 border-dashed border-amber-500/40 shadow-sm shrink-0 flex flex-col items-center justify-center text-center w-36 h-36">
                      <div className="h-10 w-10 rounded-full bg-amber-500/10 border border-amber-500/20 flex items-center justify-center mb-1.5">
                        <Lock className="h-5 w-5 text-amber-500" />
                      </div>
                      <span className="text-[10px] font-black uppercase text-amber-500 tracking-wider">Pass Locked</span>
                      <span className="text-[9px] text-[var(--muted)] font-medium">Payment Required</span>
                    </div>
                  )}

                  {/* Pass Details Info */}
                  <div className="space-y-3 text-center sm:text-left flex-1 min-w-0">
                    <div className="space-y-1">
                      <h2 className="text-xl md:text-2xl font-black text-[var(--text)] uppercase tracking-tight truncate">
                        {attendeeName}
                      </h2>
                      <span className="inline-block px-3 py-1 rounded-lg bg-gradient-to-r from-[var(--pri)]/15 to-[var(--sec)]/15 text-[var(--text)] border border-[var(--pri)]/30 text-[10px] font-black uppercase tracking-wider">
                        {roleName || "DELEGATE"}
                      </span>
                    </div>

                    <div className="space-y-1 pt-1">
                      <span className="font-semibold block text-[10px] uppercase tracking-wider text-[var(--muted)]">
                        Registration Number
                      </span>
                      <span className="font-mono font-black text-sm text-[var(--text)] block">
                        {regno || "Pending Confirmation"}
                      </span>
                    </div>

                    {isPaid ? (
                      <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-500 text-[10px] font-black uppercase tracking-wider">
                        <Check className="h-3.5 w-3.5 stroke-[3]" />
                        <span>Confirmed &amp; Ready</span>
                      </div>
                    ) : (
                      <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-500 text-[10px] font-black uppercase tracking-wider">
                        <Clock className="h-3.5 w-3.5 stroke-[3]" />
                        <span>Payment Required</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Bottom Pass Actions */}
                <div className="flex flex-wrap items-center gap-2.5 pt-5 border-t-2 border-[var(--border-default)]">
                  {isPaid ? (
                    <>
                      <button
                        type="button"
                        onClick={() => downloadTicketJPG(regno, attendeeName, roleName, eventName)}
                        className="h-10 px-4 rounded-xl bg-[var(--pri)] hover:opacity-95 text-[var(--primary-contrast,#ffffff)] text-xs font-black uppercase tracking-wider transition-all cursor-pointer shadow-sm flex items-center gap-1.5"
                      >
                        <Download className="h-4 w-4 text-[var(--primary-contrast,#ffffff)]" />
                        <span>Download Pass</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => downloadTicketPDF(regno, attendeeName, roleName, eventName)}
                        className="h-10 px-4 rounded-xl border-2 border-[var(--border-default)] bg-[var(--bg-surface-2)] hover:border-[var(--pri)]/50 hover:bg-[var(--bg-surface-hover)] text-[var(--text)] text-xs font-bold uppercase tracking-wider transition-all cursor-pointer shadow-sm flex items-center gap-1.5"
                      >
                        <Printer className="h-4 w-4 text-[var(--pri)]" />
                        <span>Printable PDF</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setReceiptModalOpen(true)}
                        className="h-10 px-4 rounded-xl border-2 border-[var(--border-default)] bg-[var(--bg-surface-2)] hover:border-[var(--sec)]/50 hover:bg-[var(--bg-surface-hover)] text-[var(--text)] text-xs font-bold uppercase tracking-wider transition-all cursor-pointer shadow-sm flex items-center gap-1.5 sm:ml-auto"
                      >
                        <FileText className="h-4 w-4 text-[var(--sec)]" />
                        <span>View Tax Invoice</span>
                      </button>
                    </>
                  ) : (
                    <div className="w-full flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/25">
                      <div className="space-y-0.5">
                        <span className="text-[11px] font-black text-amber-500 uppercase tracking-wider block">
                          Pass Activation Required
                        </span>
                        <span className="text-xs text-[var(--text)] font-semibold block">
                          Complete payment to unlock your official pass, QR badge, and conference access.
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => setPaymentModalOpen(true)}
                        className="h-10 px-5 rounded-xl bg-[var(--pri)] hover:opacity-95 text-[var(--primary-contrast,#ffffff)] text-xs font-black uppercase tracking-wider transition-all cursor-pointer shadow-md shadow-[var(--pri)]/25 flex items-center gap-2 shrink-0"
                      >
                        <CreditCard className="h-4 w-4 text-[var(--primary-contrast,#ffffff)]" />
                        <span>Complete Payment</span>
                        <ArrowRight className="h-3.5 w-3.5 text-[var(--primary-contrast,#ffffff)]" />
                      </button>
                    </div>
                  )}
                </div>
              </motion.div>
            </div>

            {/* ── Column 2: Latest Announcements Card (5 Columns) ──────────────── */}
            <div className="lg:col-span-5 flex flex-col space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-extrabold text-[var(--text)] tracking-tight">
                  Announcements &amp; Notices
                </span>
                {announcements.length > 2 && (
                  <button
                    type="button"
                    onClick={() => setAllAnnouncementsOpen(true)}
                    className="text-xs font-bold text-[var(--muted)] hover:text-[var(--text)] transition-colors cursor-pointer"
                  >
                    View all ({announcements.length})
                  </button>
                )}
              </div>

              <motion.div
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.15 }}
                className="flex-1 flex flex-col justify-between rounded-[28px] border-2 border-[var(--border-default)] bg-[var(--card)] backdrop-blur-xl p-6 md:p-7 shadow-xl ring-1 ring-black/5 dark:ring-white/10 space-y-4"
              >
                <div className="flex-1 overflow-y-auto max-h-[300px] space-y-3 pr-1">
                  
                  {/* Action Announcement: Profile Incomplete Notification */}
                  {isProfileIncomplete && (
                    <motion.div
                      initial={{ opacity: 0, scale: 0.98 }}
                      animate={{ opacity: 1, scale: 1 }}
                      className="p-4 rounded-2xl bg-amber-500/10 border-2 border-amber-500/30 text-left space-y-2"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5">
                          <AlertTriangle className="h-4 w-4 text-amber-500" />
                          <span className="text-[10px] font-black uppercase tracking-wider text-amber-500">
                            Action Required
                          </span>
                        </div>
                      </div>
                      <p className="text-xs font-bold text-[var(--text)]">
                        Please complete / update your registration details for badge printing.
                      </p>
                      <button
                        type="button"
                        onClick={() => setEditing(true)}
                        className="px-3.5 py-1.5 rounded-lg bg-amber-500 text-white text-[11px] font-black uppercase tracking-wider hover:bg-amber-600 transition-all cursor-pointer shadow-sm flex items-center gap-1"
                      >
                        <span>Update Details</span>
                        <ArrowRight className="h-3 w-3" />
                      </button>
                    </motion.div>
                  )}

                  {/* Published Announcements */}
                  {announcements.length > 0 ? (
                    announcements.slice(0, 3).map((ann: any, idx: number) => {
                      const isExpanded = !!expandedAnnouncements[ann.id || idx];
                      const toggle = () =>
                        setExpandedAnnouncements((prev) => ({
                          ...prev,
                          [ann.id || idx]: !prev[ann.id || idx],
                        }));
                      return (
                        <div
                          key={ann.id || idx}
                          onClick={toggle}
                          className="p-4 rounded-2xl border-2 border-[var(--border-default)] bg-[var(--bg-surface-2)] hover:border-[var(--pri)]/40 transition-colors cursor-pointer space-y-2"
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <span className="px-2 py-0.5 rounded-md bg-[var(--pri)]/10 text-[var(--text)] text-[9px] font-black uppercase tracking-wider border border-[var(--pri)]/20">
                                {ann.type || "Update"}
                              </span>
                              <h3 className="text-xs font-bold text-[var(--text)] truncate max-w-[170px]">
                                {ann.title}
                              </h3>
                            </div>
                            <span className="text-[10px] text-[var(--muted)] font-mono shrink-0">
                              {ann.created_at
                                ? new Date(ann.created_at).toLocaleDateString("en-IN", {
                                    day: "numeric",
                                    month: "short",
                                  })
                                : "Recent"}
                            </span>
                          </div>

                          {isExpanded && (
                            <div className="pt-2 border-t border-[var(--border-default)] text-xs text-[var(--text-secondary)] leading-relaxed">
                              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                                {ann.content || ann.message || ""}
                              </ReactMarkdown>
                            </div>
                          )}
                        </div>
                      );
                    })
                  ) : (
                    <div className="p-6 rounded-2xl border-2 border-[var(--border-default)] bg-[var(--bg-surface-2)] text-center my-auto">
                      <p className="text-xs text-[var(--muted)] font-medium">
                        No announcements posted yet. Real-time updates from organizers will appear here.
                      </p>
                    </div>
                  )}
                </div>

                <div className="pt-3 border-t border-[var(--border-default)] flex items-center justify-between text-[11px] text-[var(--muted)]">
                  <span>Stay informed with live alerts</span>
                  <span className="font-bold text-[var(--muted)] flex items-center gap-1">
                    <Sparkles className="h-3 w-3 text-[var(--pri)]" />
                    <span>Real-time</span>
                  </span>
                </div>
              </motion.div>
            </div>

          </div>
        )}

        {/* ── 4 Status KPI Cards Row (Registration, Payment, Badge, Certificate) ── */}
        {!isNotRegistered && (
          <div className="space-y-3 text-left">
            <span className="text-xs font-extrabold text-[var(--text)] tracking-tight block">
              Registration Status Overview
            </span>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              
              {/* Card 1: Registration */}
              <motion.div
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.15 }}
                className="p-5 rounded-2xl border-2 border-[var(--border-default)] bg-[var(--card)] backdrop-blur-xl shadow-xl ring-1 ring-black/5 dark:ring-white/10 space-y-3 relative overflow-hidden"
              >
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold text-[var(--muted)]">Registration</span>
                  <span className="text-[10px] font-black uppercase text-emerald-500">Confirmed</span>
                </div>

                <div className="space-y-1.5">
                  <div>
                    <span className="text-[10px] text-[var(--muted)] font-medium block">Registered on</span>
                    <span className="text-xs font-bold text-[var(--text)] block font-mono">
                      {registeredOnFormatted || "Confirmed & Active"}
                    </span>
                  </div>

                  {isProfileUpdated && updatedOnFormatted && (
                    <div className="pt-1 border-t border-[var(--border-default)]">
                      <span className="text-[10px] text-[var(--muted)] font-medium block">Updated on</span>
                      <span className="text-[11px] font-semibold text-[var(--text)] block font-mono">
                        {updatedOnFormatted}
                      </span>
                    </div>
                  )}
                </div>

                <div className="pt-1 flex justify-end">
                  <div className="h-7 w-7 rounded-lg bg-[var(--pri)]/10 text-[var(--pri)] flex items-center justify-center">
                    <Bookmark className="h-3.5 w-3.5" />
                  </div>
                </div>
              </motion.div>

              {/* Card 2: Payment (Clickable to open receipt dialog or payment modal) */}
              <motion.div
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
                onClick={() => {
                  if (isPaid) {
                    setReceiptModalOpen(true);
                  } else {
                    setPaymentModalOpen(true);
                  }
                }}
                className={`p-5 rounded-2xl border-2 border-[var(--border-default)] bg-[var(--card)] backdrop-blur-xl ${
                  isPaid ? "hover:border-emerald-500/50" : "hover:border-amber-500/50"
                } shadow-xl ring-1 ring-black/5 dark:ring-white/10 space-y-3 relative overflow-hidden cursor-pointer transition-all`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold text-[var(--muted)]">Payment</span>
                  <span className={`text-[10px] font-black uppercase ${isPaid ? "text-emerald-500" : "text-amber-500"}`}>
                    {isPaid ? "Paid" : "Unpaid"}
                  </span>
                </div>

                <div>
                  <span className="text-[10px] text-[var(--muted)] font-medium block">
                    {isPaid ? "Amount (Click for Receipt)" : "Action Required (Click to Pay)"}
                  </span>
                  <span className="text-xs font-black text-[var(--text)]">{paymentAmount}</span>
                </div>

                <div className="pt-1 flex justify-end">
                  <div className={`h-7 w-7 rounded-lg ${isPaid ? "bg-emerald-500/10 text-emerald-500" : "bg-amber-500/10 text-amber-500"} flex items-center justify-center`}>
                    <CreditCard className="h-3.5 w-3.5" />
                  </div>
                </div>
              </motion.div>

              {/* Card 3: Badge */}
              <motion.div
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.25 }}
                className="p-5 rounded-2xl border-2 border-[var(--border-default)] bg-[var(--card)] backdrop-blur-xl shadow-xl ring-1 ring-black/5 dark:ring-white/10 space-y-3 relative overflow-hidden"
              >
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold text-[var(--muted)]">Physical Badge</span>
                  <span className={`text-[10px] font-black uppercase ${isPaid ? "text-emerald-500" : "text-amber-500"}`}>
                    {isPaid ? "Ready" : "On Hold"}
                  </span>
                </div>

                <div>
                  <span className="text-[10px] text-[var(--muted)] font-medium block">
                    {isPaid ? "Collect at venue" : "Pending Payment"}
                  </span>
                  <span className="text-xs font-bold text-[var(--text)]">
                    {isPaid ? "Registration Desk" : "Unlocks after payment"}
                  </span>
                </div>

                <div className="pt-1 flex justify-end">
                  <div className="h-7 w-7 rounded-lg bg-[var(--sec)]/10 text-[var(--sec)] flex items-center justify-center">
                    <Tag className="h-3.5 w-3.5" />
                  </div>
                </div>
              </motion.div>

              {/* Card 4: Certificate */}
              <motion.div
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 }}
                className="p-5 rounded-2xl border-2 border-[var(--border-default)] bg-[var(--card)] backdrop-blur-xl shadow-xl ring-1 ring-black/5 dark:ring-white/10 space-y-3 relative overflow-hidden"
              >
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold text-[var(--muted)]">Certificate</span>
                  <span className="text-[10px] font-bold uppercase text-[var(--muted)]">Pending</span>
                </div>

                <div>
                  <span className="text-[10px] text-[var(--muted)] font-medium block">Available after</span>
                  <span className="text-xs font-bold text-[var(--text)]">Event Conclusion</span>
                </div>

                <div className="pt-1 flex justify-end">
                  <div className="h-7 w-7 rounded-lg bg-[var(--sec)]/10 text-[var(--sec)] flex items-center justify-center">
                    <Award className="h-3.5 w-3.5" />
                  </div>
                </div>
              </motion.div>
            </div>
          </div>
        )}

        {/* ── Section: Full Event Overview Details ───────────────────────────── */}
        <div className="space-y-3 text-left">
          <span className="text-xs font-extrabold text-[var(--text)] tracking-tight block">
            Event Overview & Location Details
          </span>

          <div className="p-6 md:p-7 rounded-[28px] border-2 border-[var(--border-default)] bg-[var(--card)] backdrop-blur-xl shadow-xl ring-1 ring-black/5 dark:ring-white/10 space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              
              {/* Col 1: Dates & Mode */}
              <div className="space-y-3 p-4 rounded-2xl bg-[var(--bg-surface-2)] border border-[var(--border-default)]">
                <div className="flex items-center gap-2 font-black text-xs uppercase tracking-wider text-[var(--text)]">
                  <Calendar className="h-4 w-4 text-[var(--pri)]" />
                  <span>Dates &amp; Schedule</span>
                </div>
                <div className="space-y-1">
                  <span className="text-sm font-bold text-[var(--text)] block">
                    {event.start_date
                      ? `${new Date(event.start_date).toLocaleDateString("en-IN", {
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                        })} ${
                          event.end_date && event.end_date !== event.start_date
                            ? ` - ${new Date(event.end_date).toLocaleDateString("en-IN", {
                                day: "numeric",
                                month: "short",
                                year: "numeric",
                              })}`
                            : ""
                        }`
                      : "Dates Announced Soon"}
                  </span>
                  <span className="text-[11px] text-[var(--muted)] font-medium block">
                    Mode: <strong className="text-[var(--text)]">{event.mode || "In-Person"}</strong> • Timezone: <strong className="text-[var(--text)]">{event.timezone || "IST"}</strong>
                  </span>
                </div>
              </div>

              {/* Col 2: Venue & Location */}
              <div className="space-y-3 p-4 rounded-2xl bg-[var(--bg-surface-2)] border border-[var(--border-default)]">
                <div className="flex items-center gap-2 font-black text-xs uppercase tracking-wider text-[var(--text)]">
                  <MapPin className="h-4 w-4 text-[var(--sec)]" />
                  <span>Venue &amp; Location</span>
                </div>
                <div className="space-y-1">
                  <span className="text-sm font-bold text-[var(--text)] block">
                    {event.venue_name || event.venue || "Official Venue Announced Soon"}
                  </span>
                  <span className="text-[11px] text-[var(--muted)] font-medium block truncate">
                    {event.location || event.state || event.country || "Main Convention Center"}
                  </span>
                </div>
              </div>

              {/* Col 3: Support & Organiser */}
              <div className="space-y-3 p-4 rounded-2xl bg-[var(--bg-surface-2)] border border-[var(--border-default)]">
                <div className="flex items-center gap-2 font-black text-xs uppercase tracking-wider text-[var(--text)]">
                  <Mail className="h-4 w-4 text-[var(--pri)]" />
                  <span>Organiser Support</span>
                </div>
                <div className="space-y-1">
                  <span className="text-sm font-bold text-[var(--text)] block truncate">
                    {event.support_email || "support@eventos.io"}
                  </span>
                  <span className="text-[11px] text-[var(--muted)] font-medium block">
                    {event.organizer_name ? `Organised by ${event.organizer_name}` : "Official Conference Secretariat"}
                  </span>
                </div>
              </div>

            </div>

            {/* Event Description (if provided) */}
            {event.description && (
              <div className="pt-2 border-t border-[var(--border-default)]">
                <span className="text-[10px] font-black uppercase tracking-widest text-[var(--muted)] block mb-1">
                  About the Event
                </span>
                <p className="text-xs text-[var(--text-secondary)] leading-relaxed line-clamp-3">
                  {event.description}
                </p>
              </div>
            )}
          </div>
        </div>

      </div>

      {/* ── DIALOG: EDIT PROFILE MODAL (Matches Registration Form Builder) ─── */}
      <Dialog open={editing} onOpenChange={setEditing}>
        <DialogContent className="max-w-xl rounded-[28px] bg-[var(--card)] border-2 border-[var(--border-default)] p-6 md:p-8 space-y-6">
          <DialogHeader>
            <DialogTitle className="text-xl font-black text-[var(--text)]">
              Edit Registration Profile
            </DialogTitle>
            <DialogDescription className="text-xs text-[var(--muted)]">
              Update your badge designation, name, and contact details.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2 text-left max-h-[65vh] overflow-y-auto pr-1">
            
            {/* Title + First Name + Last Name in a single row */}
            <div className="space-y-1.5">
              <label className="text-[11px] font-black uppercase tracking-wider text-[var(--muted)] block">
                Full Name <span className="text-rose-500">*</span>
              </label>
              <div className="grid grid-cols-12 gap-2">
                <div className="col-span-3">
                  <select
                    value={editForm.title}
                    onChange={(e) => setEditForm((p) => ({ ...p, title: e.target.value }))}
                    className="w-full h-12 px-2.5 rounded-xl text-xs font-bold bg-[var(--bg-surface-2)] border-2 border-[var(--border-default)] text-[var(--text)] cursor-pointer"
                  >
                    {TITLE_OPTIONS.map((t) => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                </div>
                <div className="col-span-4">
                  <input
                    type="text"
                    placeholder="First Name"
                    value={editForm.first_name}
                    onChange={(e) => setEditForm((p) => ({ ...p, first_name: e.target.value }))}
                    className="w-full h-12 px-3 rounded-xl text-xs font-semibold bg-[var(--bg-surface-2)] border-2 border-[var(--border-default)] text-[var(--text)] focus:border-[var(--pri)]"
                  />
                </div>
                <div className="col-span-5">
                  <input
                    type="text"
                    placeholder="Last Name"
                    value={editForm.last_name}
                    onChange={(e) => setEditForm((p) => ({ ...p, last_name: e.target.value }))}
                    className="w-full h-12 px-3 rounded-xl text-xs font-semibold bg-[var(--bg-surface-2)] border-2 border-[var(--border-default)] text-[var(--text)] focus:border-[var(--pri)]"
                  />
                </div>
              </div>
            </div>

            {/* Email (Readonly Verified) */}
            <div className="space-y-1.5">
              <label className="text-[11px] font-black uppercase tracking-wider text-[var(--muted)] block">
                Email Address
              </label>
              <input
                type="email"
                readOnly
                value={editForm.email}
                className="w-full h-12 px-4 rounded-xl text-xs font-semibold bg-[var(--bg-surface-2)]/60 border-2 border-[var(--border-default)] text-[var(--muted)] cursor-not-allowed"
              />
            </div>

            {/* Mobile with Country Dial Code dropdown */}
            <div className="space-y-1.5">
              <label className="text-[11px] font-black uppercase tracking-wider text-[var(--muted)] block">
                Mobile Number
              </label>
              <div className="grid grid-cols-12 gap-2">
                <div className="col-span-4">
                  <select
                    value={editForm.phone_dial}
                    onChange={(e) => setEditForm((p) => ({ ...p, phone_dial: e.target.value }))}
                    className="w-full h-12 px-2.5 rounded-xl text-xs font-bold bg-[var(--bg-surface-2)] border-2 border-[var(--border-default)] text-[var(--text)] cursor-pointer"
                  >
                    {COUNTRY_DIAL_CODES.map((c) => (
                      <option key={c.code + c.dial_code} value={c.dial_code}>
                        {c.flag} {c.dial_code} ({c.name})
                      </option>
                    ))}
                  </select>
                </div>
                <div className="col-span-8">
                  <input
                    type="tel"
                    placeholder="Mobile number"
                    value={editForm.phone_number}
                    onChange={(e) => setEditForm((p) => ({ ...p, phone_number: e.target.value }))}
                    className="w-full h-12 px-4 rounded-xl text-xs font-semibold bg-[var(--bg-surface-2)] border-2 border-[var(--border-default)] text-[var(--text)] focus:border-[var(--pri)]"
                  />
                </div>
              </div>
            </div>

            {/* Country & State Dynamic Dropdowns */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-[11px] font-black uppercase tracking-wider text-[var(--muted)] block">
                  Country
                </label>
                <select
                  value={editForm.country}
                  onChange={(e) => {
                    const selectedC = e.target.value;
                    const newDial = getDialCodeForCountry(selectedC);
                    setEditForm((p) => ({
                      ...p,
                      country: selectedC,
                      phone_dial: newDial,
                      state: "",
                    }));
                  }}
                  className="w-full h-12 px-3 rounded-xl text-xs font-bold bg-[var(--bg-surface-2)] border-2 border-[var(--border-default)] text-[var(--text)] cursor-pointer"
                >
                  {fallbackCountryStates.map((c) => (
                    <option key={c.country} value={c.country}>{c.country}</option>
                  ))}
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="text-[11px] font-black uppercase tracking-wider text-[var(--muted)] block">
                  State / Province
                </label>
                {stateOptions.length > 0 ? (
                  <select
                    value={editForm.state}
                    onChange={(e) => setEditForm((p) => ({ ...p, state: e.target.value }))}
                    className="w-full h-12 px-3 rounded-xl text-xs font-bold bg-[var(--bg-surface-2)] border-2 border-[var(--border-default)] text-[var(--text)] cursor-pointer"
                  >
                    <option value="">Select state/province</option>
                    {stateOptions.map((st) => (
                      <option key={st} value={st}>{st}</option>
                    ))}
                  </select>
                ) : (
                  <input
                    type="text"
                    placeholder="Enter state"
                    value={editForm.state}
                    onChange={(e) => setEditForm((p) => ({ ...p, state: e.target.value }))}
                    className="w-full h-12 px-4 rounded-xl text-xs font-semibold bg-[var(--bg-surface-2)] border-2 border-[var(--border-default)] text-[var(--text)] focus:border-[var(--pri)]"
                  />
                )}
              </div>
            </div>

            {/* Designation & Organization */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-[11px] font-black uppercase tracking-wider text-[var(--muted)] block">
                  Designation / Job Title
                </label>
                <input
                  type="text"
                  placeholder="e.g. Senior Consultant"
                  value={editForm.designation}
                  onChange={(e) => setEditForm((p) => ({ ...p, designation: e.target.value }))}
                  className="w-full h-12 px-4 rounded-xl text-xs font-semibold bg-[var(--bg-surface-2)] border-2 border-[var(--border-default)] text-[var(--text)] focus:border-[var(--pri)]"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-[11px] font-black uppercase tracking-wider text-[var(--muted)] block">
                  Organization / Hospital
                </label>
                <input
                  type="text"
                  placeholder="e.g. AIIMS New Delhi"
                  value={editForm.company}
                  onChange={(e) => setEditForm((p) => ({ ...p, company: e.target.value }))}
                  className="w-full h-12 px-4 rounded-xl text-xs font-semibold bg-[var(--bg-surface-2)] border-2 border-[var(--border-default)] text-[var(--text)] focus:border-[var(--pri)]"
                />
              </div>
            </div>

          </div>

          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={() => setEditing(false)}
              className="h-12 px-6 rounded-xl border-2 border-[var(--border-default)] hover:bg-[var(--bg-surface-hover)] text-xs font-bold text-[var(--muted)] hover:text-[var(--text)] cursor-pointer transition-all"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSaveProfile}
              disabled={saving}
              className="h-12 px-8 rounded-xl bg-[var(--pri)] hover:opacity-95 text-[var(--primary-contrast,#ffffff)] text-xs font-black uppercase tracking-wider flex items-center gap-2 transition-all cursor-pointer shadow-lg shadow-[var(--pri)]/25 disabled:opacity-50"
            >
              {saving ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin text-[var(--primary-contrast,#ffffff)]" />
                  <span>Saving...</span>
                </>
              ) : (
                <>
                  <Save className="h-4 w-4 text-[var(--primary-contrast,#ffffff)]" />
                  <span>Save Changes</span>
                </>
              )}
            </button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── DIALOG: PAYMENT RECEIPT / TAX INVOICE PREVIEW ──────────────────── */}
      <Dialog open={receiptModalOpen} onOpenChange={setReceiptModalOpen}>
        <DialogContent className="max-w-2xl rounded-[28px] bg-[var(--card)] border-2 border-[var(--border-default)] p-6 md:p-8 space-y-6 overflow-hidden">
          {/* Top Gradient Accent Stripe */}
          <div className="h-1.5 -mx-6 -mt-6 sm:-mx-8 sm:-mt-8 rounded-t-[26px] bg-gradient-to-r from-[var(--pri)] to-[var(--sec)]" />

          <DialogHeader>
            <DialogTitle className="text-xl font-black text-[var(--text)] flex items-center gap-2">
              <FileText className="h-5 w-5 text-[var(--pri)]" />
              <span>Official Tax Invoice &amp; Receipt</span>
            </DialogTitle>
            <DialogDescription className="text-xs text-[var(--muted)]">
              Preview your confirmed payment transaction and download the official PDF receipt.
            </DialogDescription>
          </DialogHeader>

          {/* Receipt Preview Box */}
          <div className="p-6 rounded-2xl bg-[var(--bg-surface-2)] border-2 border-[var(--border-default)] space-y-6 text-left relative overflow-hidden">
            <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-[var(--pri)] to-[var(--sec)]" />
            <div className="flex items-start justify-between border-b border-[var(--border-default)] pb-4 pt-1">
              <div>
                <h3 className="font-black text-base text-[var(--text)]">{eventName}</h3>
                <p className="text-[11px] font-bold text-[var(--pri)] uppercase tracking-wider mt-0.5">
                  Tax Invoice • {event?.short_code || "CONF"}
                </p>
              </div>
              <span className="px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-500 text-[10px] font-black uppercase tracking-wider">
                Paid &amp; Confirmed
              </span>
            </div>

            <div className="grid grid-cols-2 gap-4 text-xs">
              <div className="space-y-1">
                <span className="text-[10px] font-black uppercase tracking-wider text-[var(--muted)] block">
                  Billed To
                </span>
                <span className="font-bold text-[var(--text)] block">{attendeeName}</span>
                <span className="text-[11px] font-mono text-[var(--pri)] block">{regno}</span>
                <span className="text-[11px] text-[var(--muted)] block">{participant?.email}</span>
              </div>

              <div className="space-y-1 text-right sm:text-left">
                <span className="text-[10px] font-black uppercase tracking-wider text-[var(--muted)] block">
                  Transaction Info
                </span>
                <span className="font-mono font-bold text-[var(--text)] block text-[11px]">
                  {payment?.transaction_id || payment?.gateway_payment_id || "TXN-DIRECT"}
                </span>
                <span className="text-[11px] text-[var(--muted)] block">
                  {payment?.created_at ? new Date(payment.created_at).toLocaleDateString("en-IN") : "Confirmed"}
                </span>
                <span className="text-[11px] text-[var(--muted)] block">
                  Method: {payment?.payment_method || "Online"}
                </span>
              </div>
            </div>

            {/* Line items */}
            <div className="border border-[var(--border-default)] rounded-xl overflow-hidden bg-[var(--card)]">
              <div className="grid grid-cols-12 p-3 bg-[var(--bg-surface-3)] font-black text-[10px] uppercase tracking-wider text-[var(--muted)] border-b border-[var(--border-default)]">
                <div className="col-span-8">Description</div>
                <div className="col-span-4 text-right">Amount</div>
              </div>
              <div className="grid grid-cols-12 p-3 text-xs font-semibold border-b border-[var(--border-default)]">
                <div className="col-span-8">Delegate Registration - {roleName || "Standard"}</div>
                <div className="col-span-4 text-right font-bold text-[var(--text)]">{paymentAmount}</div>
              </div>
              {Number(payment?.discount_applied || 0) > 0 && (
                <div className="grid grid-cols-12 p-3 text-xs font-semibold text-emerald-500 border-b border-[var(--border-default)]">
                  <div className="col-span-8">Discount Applied</div>
                  <div className="col-span-4 text-right font-bold">
                    -{payment?.currency || "INR"} {Number(payment.discount_applied).toLocaleString()}
                  </div>
                </div>
              )}
              <div className="grid grid-cols-12 p-3 text-xs font-black bg-[var(--bg-surface-2)]">
                <div className="col-span-8 uppercase tracking-wider">Total Paid</div>
                <div className="col-span-4 text-right text-[var(--pri)] text-sm">{paymentAmount}</div>
              </div>
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={() => setReceiptModalOpen(false)}
              className="h-12 px-6 rounded-xl border-2 border-[var(--border-default)] hover:bg-[var(--bg-surface-hover)] text-xs font-bold text-[var(--muted)] hover:text-[var(--text)] cursor-pointer transition-all"
            >
              Close
            </button>
            <button
              type="button"
              onClick={() => downloadReceipt(payment, event, participant)}
              className="h-12 px-8 rounded-xl bg-[var(--pri)] hover:opacity-95 text-[var(--primary-contrast,#ffffff)] text-xs font-black uppercase tracking-wider flex items-center gap-2 transition-all cursor-pointer shadow-lg shadow-[var(--pri)]/25"
            >
              <Printer className="h-4 w-4 text-[var(--primary-contrast,#ffffff)]" />
              <span>Print / Download Tax Invoice</span>
            </button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── DIALOG: ALL ANNOUNCEMENTS MODAL ─────────────────────────────────── */}
      <Dialog open={allAnnouncementsOpen} onOpenChange={setAllAnnouncementsOpen}>
        <DialogContent className="max-w-lg rounded-[28px] bg-[var(--card)] border-2 border-[var(--border-default)] p-6 md:p-8 space-y-6">
          <DialogHeader>
            <DialogTitle className="text-xl font-black text-[var(--text)]">Official Announcements</DialogTitle>
            <DialogDescription className="text-xs text-[var(--muted)]">
              All published notices and schedule updates for {eventName}.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-1 text-left mt-3">
            {announcements.length > 0 ? (
              announcements.map((ann: any, idx: number) => (
                <div key={idx} className="p-4 rounded-2xl bg-[var(--bg-surface-2)] border-2 border-[var(--border-default)] space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="px-2 py-0.5 rounded-md bg-[var(--pri)]/10 text-[var(--pri)] text-[9px] font-black uppercase tracking-wider">
                      {ann.type || "Update"}
                    </span>
                    <span className="text-[10px] text-[var(--muted)] font-mono">
                      {ann.created_at ? new Date(ann.created_at).toLocaleDateString("en-IN") : "Recent"}
                    </span>
                  </div>
                  <h4 className="text-xs font-bold text-[var(--text)]">{ann.title}</h4>
                  <div className="text-xs text-[var(--text-secondary)] leading-relaxed">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{ann.content || ann.message || ""}</ReactMarkdown>
                  </div>
                </div>
              ))
            ) : (
              <p className="text-xs text-[var(--muted)] text-center py-6">No announcements available.</p>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* ── DIALOG: PAYMENT CHECKOUT MODAL ──────────────────────────────────── */}
      <Dialog open={paymentModalOpen} onOpenChange={setPaymentModalOpen}>
        <DialogContent className="max-w-lg rounded-[28px] bg-[var(--card)] border-2 border-[var(--border-default)] p-6 md:p-8 space-y-6">
          <DialogHeader>
            <DialogTitle className="text-xl font-black text-[var(--text)] flex items-center gap-2">
              <CreditCard className="h-5 w-5 text-[var(--pri)]" />
              <span>Complete Registration Payment</span>
            </DialogTitle>
            <DialogDescription className="text-xs text-[var(--muted)]">
              Complete your conference registration payment to unlock your official entry pass, QR badge, and conference access.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 text-left">
            {/* Attendee Summary Box */}
            <div className="p-4 rounded-2xl bg-[var(--bg-surface-2)] border-2 border-[var(--border-default)] space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-black uppercase tracking-wider text-[var(--muted)]">
                  Delegate Details
                </span>
                <span className="px-2 py-0.5 rounded-md bg-[var(--pri)]/10 text-[var(--pri)] text-[9px] font-black uppercase tracking-wider">
                  {roleName || "Delegate"}
                </span>
              </div>
              <div className="space-y-0.5">
                <h4 className="text-sm font-black text-[var(--text)]">{attendeeName}</h4>
                <p className="text-xs text-[var(--muted)] font-medium">{participant?.email || registration?.email}</p>
              </div>
            </div>

            {/* Promo Code Input */}
            <div className="space-y-1.5">
              <label className="text-[11px] font-black uppercase tracking-wider text-[var(--muted)] block">
                Have a Promo Coupon?
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="e.g. EARLYBIRD / VIPPASS"
                  value={couponCode}
                  onChange={(e) => setCouponCode(e.target.value.toUpperCase())}
                  disabled={!!appliedCoupon || validatingCoupon}
                  className="flex-1 h-12 px-4 rounded-xl text-xs font-mono font-bold uppercase bg-[var(--bg-surface-2)] border-2 border-[var(--border-default)] text-[var(--text)] focus:border-[var(--pri)] disabled:opacity-50"
                />
                {appliedCoupon ? (
                  <button
                    type="button"
                    onClick={() => {
                      setAppliedCoupon(null);
                      setCouponCode("");
                    }}
                    className="h-12 px-4 rounded-xl border-2 border-rose-500/30 bg-rose-500/10 hover:bg-rose-500/20 text-rose-500 text-xs font-bold transition-all cursor-pointer"
                  >
                    Remove
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => handleApplyCoupon(roleName)}
                    disabled={!couponCode.trim() || validatingCoupon}
                    className="h-12 px-5 rounded-xl bg-[var(--bg-surface-2)] hover:bg-[var(--bg-surface-hover)] border-2 border-[var(--border-default)] hover:border-[var(--pri)] text-xs font-bold text-[var(--text)] flex items-center gap-1.5 transition-all cursor-pointer disabled:opacity-50"
                  >
                    {validatingCoupon && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                    <span>Apply</span>
                  </button>
                )}
              </div>
              {appliedCoupon && (
                <p className="text-[11px] font-bold text-emerald-500 flex items-center gap-1">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  <span>Coupon {appliedCoupon.code} applied successfully!</span>
                </p>
              )}
            </div>

            {/* Itemized Pricing Box */}
            {(() => {
              let modalBasePrice = Number(dbPricing?.base_price || 0);
              if (modalBasePrice === 0 && dbPricing?.active_prices) {
                if (roleName && dbPricing.active_prices[roleName] !== undefined) {
                  modalBasePrice = Number(dbPricing.active_prices[roleName]);
                } else if (roleName) {
                  for (const [rK, rV] of Object.entries(dbPricing.active_prices)) {
                    if (rK.toLowerCase() === roleName.toLowerCase()) {
                      modalBasePrice = Number(rV);
                      break;
                    }
                  }
                }
              }
              if (modalBasePrice === 0 && (registration?.registration_data?.amount_paid || registration?.registration_data?.amount)) {
                modalBasePrice = Number(registration.registration_data.amount_paid || registration.registration_data.amount || 0);
              }
              const tierName = dbPricing?.active_tier || "Standard Tier";
              const curr = dbPricing?.currency || event?.currency || "INR";
              const finalAmount = appliedCoupon ? appliedCoupon.total_price : modalBasePrice;
              const activeGateway = dbPricing?.active_gateway || event?.registration_settings?.active_gateway || "simulated";

              return (
                <>
                  <div className="p-4 rounded-2xl bg-[var(--bg-surface-2)] border border-[var(--border-default)] space-y-2.5">
                    <div className="flex items-center justify-between text-xs font-semibold text-[var(--muted)]">
                      <span>{roleName || "Delegate"} ({tierName})</span>
                      <span className="font-bold text-[var(--text)]">
                        {modalBasePrice > 0 ? `${curr} ${Number(modalBasePrice).toLocaleString("en-IN")}` : "Free / Complimentary"}
                      </span>
                    </div>
                    {appliedCoupon && (
                      <div className="flex items-center justify-between text-xs font-bold text-emerald-500">
                        <span>Coupon Discount ({appliedCoupon.code})</span>
                        <span>- {curr} {Number(appliedCoupon.discount_amount).toLocaleString("en-IN")}</span>
                      </div>
                    )}
                    <div className="pt-2 border-t border-[var(--border-default)] flex items-center justify-between">
                      <span className="text-xs font-black uppercase tracking-wider text-[var(--text)]">Total Payable</span>
                      <span className="text-lg font-black text-[var(--pri)]">
                        {finalAmount > 0 ? `${curr} ${Number(finalAmount).toLocaleString("en-IN")}` : "Complimentary Pass"}
                      </span>
                    </div>
                  </div>

                  {/* Gateway Security Indicator */}
                  <div className="flex items-center gap-2 p-3 rounded-xl bg-[var(--pri)]/5 border border-[var(--pri)]/15 text-[11px] text-[var(--muted)]">
                    <ShieldCheck className="h-4 w-4 text-[var(--pri)] shrink-0" />
                    <span>
                      Payment method configured by organizer: <strong className="text-[var(--text)] capitalize">{activeGateway} Gateway</strong>.
                    </span>
                  </div>

                  <div className="flex items-center justify-end gap-3 pt-2">
                    <button
                      type="button"
                      onClick={() => setPaymentModalOpen(false)}
                      className="h-12 px-6 rounded-xl border-2 border-[var(--border-default)] hover:bg-[var(--bg-surface-hover)] text-xs font-bold text-[var(--muted)] hover:text-[var(--text)] cursor-pointer transition-all"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={handleCompletePayment}
                      disabled={submittingPayment}
                      className="h-12 px-8 rounded-xl bg-[var(--pri)] hover:opacity-95 text-[var(--primary-contrast,#ffffff)] text-xs font-black uppercase tracking-wider flex items-center gap-2 transition-all cursor-pointer shadow-lg shadow-[var(--pri)]/25 disabled:opacity-50"
                    >
                      {submittingPayment ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin text-[var(--primary-contrast,#ffffff)]" />
                          <span>Processing...</span>
                        </>
                      ) : (
                        <>
                          <CreditCard className="h-4 w-4 text-[var(--primary-contrast,#ffffff)]" />
                          <span>{finalAmount > 0 ? `Pay & Activate Pass (${curr} ${Number(finalAmount).toLocaleString("en-IN")})` : "Activate Complimentary Pass"}</span>
                        </>
                      )}
                    </button>
                  </div>
                </>
              );
            })()}
          </div>
        </DialogContent>
      </Dialog>

    </div>
  );
}
