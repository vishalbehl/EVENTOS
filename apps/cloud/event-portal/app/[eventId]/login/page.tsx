"use client";

import { useState, useEffect, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { motion } from "framer-motion";
import {
  ArrowRight, ShieldCheck, AlertCircle,
  Loader2, Sparkles, Calendar, MapPin,
  FileText, Users, Layers, ArrowLeft, Presentation, Mic, Download
} from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { ThemedIllustration } from "@/components/ui/themed-illustration";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";

type Step = "identifier" | "otp";

// ── Dynamic Icon Resolver for Stats ───────────────────────────────────────────
function getStatIcon(label?: string, iconKey?: string) {
  const l = `${label || ""} ${iconKey || ""}`.toLowerCase();
  if (l.includes("day") || l.includes("date") || l.includes("calendar")) {
    return Calendar;
  }
  if (l.includes("track") || l.includes("hall") || l.includes("room")) {
    return Layers;
  }
  if (l.includes("session") || l.includes("talk") || l.includes("workshop") || l.includes("presentation")) {
    return Presentation;
  }
  if (l.includes("speaker") || l.includes("faculty") || l.includes("keynote") || l.includes("expert")) {
    return Mic;
  }
  return Sparkles;
}

// ── 6-Box OTP Input Component ────────────────────────────────────────────────
function OtpBoxes({
  value,
  onChange,
  disabled
}: {
  value: string;
  onChange: (v: string) => void;
  disabled: boolean;
}) {
  const refs = useRef<Array<HTMLInputElement | null>>([]);

  const handleKey = (idx: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Backspace") {
      e.preventDefault();
      const next = [...value.padEnd(6, " ").split("")];
      if (next[idx].trim()) {
        next[idx] = " ";
        onChange(next.join("").trimEnd());
      } else if (idx > 0) {
        refs.current[idx - 1]?.focus();
        next[idx - 1] = " ";
        onChange(next.join("").trimEnd());
      }
    }
  };

  const handleChange = (idx: number, e: React.ChangeEvent<HTMLInputElement>) => {
    const char = e.target.value.replace(/\D/g, "").slice(-1);
    if (!char) return;
    const next = value.padEnd(6, " ").split("");
    next[idx] = char;
    onChange(next.join("").trimEnd());
    if (idx < 5) refs.current[idx + 1]?.focus();
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
    if (pasted) onChange(pasted);
  };

  return (
    <div className="flex gap-2 sm:gap-3 justify-center" onPaste={handlePaste}>
      {Array.from({ length: 6 }).map((_, i) => (
        <input
          key={i}
          ref={(el) => {
            refs.current[i] = el;
          }}
          type="text"
          inputMode="numeric"
          maxLength={1}
          value={value[i] || ""}
          disabled={disabled}
          onKeyDown={(e) => handleKey(i, e)}
          onChange={(e) => handleChange(i, e)}
          className="w-10 h-12 sm:w-11 sm:h-13 text-center text-xl font-black font-mono rounded-2xl bg-[var(--bg-surface-2)] border border-[var(--border-default)] focus:border-[var(--pri)] focus:ring-2 focus:ring-[var(--pri)]/20 text-[var(--text)] transition-all select-none"
        />
      ))}
    </div>
  );
}

function formatDateRange(startDateStr?: string, endDateStr?: string): string {
  if (!startDateStr) return "";
  const start = new Date(startDateStr);
  const startFormatted = start.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
  if (!endDateStr) return startFormatted;
  const end = new Date(endDateStr);
  if (
    start.getFullYear() === end.getFullYear() &&
    start.getMonth() === end.getMonth() &&
    start.getDate() === end.getDate()
  ) {
    return startFormatted;
  }
  const endFormatted = end.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
  return `${startFormatted} - ${endFormatted}`;
}

export default function LoginPage() {
  const { eventId } = useParams<{ eventId: string }>();
  const router = useRouter();

  const [eventData, setEventData] = useState<any>(null);
  const [step, setStep] = useState<Step>("identifier");
  const [identifier, setIdentifier] = useState("");
  const [otp, setOtp] = useState("");
  const [, setAuthMethod] = useState<"email" | "phone">("email");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resendCooldown, setResendCooldown] = useState(0);
  const [devOtp, setDevOtp] = useState<string | null>(null);
  const [programModalOpen, setProgramModalOpen] = useState(false);

  // If already logged in, redirect to dashboard
  useEffect(() => {
    const token = localStorage.getItem(`portal_token_${eventId}`);
    if (token) {
      router.replace(`/${eventId}/dashboard`);
    }
  }, [eventId, router]);

  // Fetch Event Info
  useEffect(() => {
    try {
      const cached = localStorage.getItem(`portal_theme_cache_${eventId}`);
      if (cached) {
        setEventData(JSON.parse(cached));
      }
    } catch (e) {}

    fetch(`${API_BASE}/api/v1/portal/registration/${eventId}/form`)
      .then((res) => (res.ok ? res.json() : null))
      .then((d) => {
        if (d) {
          setEventData(d);
          try {
            localStorage.setItem(`portal_theme_cache_${eventId}`, JSON.stringify(d));
          } catch (e) {}
        }
      })
      .catch(() => { });
  }, [eventId]);

  // Resend Countdown
  useEffect(() => {
    if (resendCooldown <= 0) return;
    const t = setInterval(() => setResendCooldown((c) => c - 1), 1000);
    return () => clearInterval(t);
  }, [resendCooldown]);

  // Auto submit 6 digit OTP
  useEffect(() => {
    if (otp.replace(/\s/g, "").length === 6 && step === "otp") {
      handleVerifyOtp();
    }
  }, [otp]);

  // ── Step 1: Send OTP ───────────────────────────────────────────────────────
  const handleSendOtp = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!identifier.trim()) {
      setError("Please enter your registered email or phone number.");
      return;
    }

    setLoading(true);
    setError(null);
    setDevOtp(null);

    const isEmail = identifier.includes("@");
    const payload = isEmail
      ? { email: identifier.trim().toLowerCase() }
      : { phone: identifier.trim() };

    try {
      const res = await fetch(`${API_BASE}/api/v1/portal/auth/${eventId}/request-otp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.detail || "Unable to find registration. Please check your details.");
      }

      setAuthMethod(isEmail ? "email" : "phone");
      setStep("otp");
      setResendCooldown(60);
      toast.success(`Verification code sent to ${identifier}`);

      if (data.dev_otp) {
        setDevOtp(data.dev_otp);
      }
    } catch (err: any) {
      setError(err.message);
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  // ── Step 2: Verify OTP ─────────────────────────────────────────────────────
  const handleVerifyOtp = async () => {
    const cleanOtp = otp.replace(/\s/g, "");
    if (cleanOtp.length !== 6) {
      setError("Please enter the complete 6-digit code.");
      return;
    }

    setLoading(true);
    setError(null);

    const isEmail = identifier.includes("@");
    const payload = {
      ...(isEmail
        ? { email: identifier.trim().toLowerCase() }
        : { phone: identifier.trim() }),
      otp: cleanOtp,
    };

    try {
      const res = await fetch(`${API_BASE}/api/v1/portal/auth/${eventId}/verify-otp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.detail || "Invalid verification code. Please try again.");
      }

      const jwtToken = data.access_token || data.token;
      const participantObj = data.participant || {
        email: identifier,
        role: data.role || "Delegate",
        name: data.name || (identifier.includes("@") ? identifier.split("@")[0] : identifier),
      };
      localStorage.setItem(`portal_token_${eventId}`, jwtToken);
      localStorage.setItem(`portal_jwt_${eventId}`, jwtToken);
      localStorage.setItem(`portal_participant_${eventId}`, JSON.stringify(participantObj));
      if (participantObj.regno) {
        localStorage.setItem(`portal_registered_${eventId}`, "true");
      } else {
        localStorage.removeItem(`portal_registered_${eventId}`);
      }

      toast.success("Welcome back! Loading your pass...");
      router.push(`/${eventId}/dashboard`);
    } catch (err: any) {
      setError(err.message);
      setOtp("");
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  const eventName = eventData?.event_name || "";
  const tagline = eventData?.tagline || "";
  const description = eventData?.description || "";
  const venue = eventData?.venue_name || eventData?.location || "";
  const dateFormatted = formatDateRange(eventData?.start_date, eventData?.end_date);

  const fallbackStats = [
    { label: "1 Day Conference", icon: "calendar" },
    { label: "0 Rooms / Tracks", icon: "tracks" },
    { label: "0 Sessions", icon: "sessions" },
    { label: "0 Speakers", icon: "speakers" },
  ];

  const stats: any[] = Array.isArray(eventData?.stats) && eventData.stats.length > 0
    ? eventData.stats
    : fallbackStats;
  const dataLoading = !eventData;

  return (
    <div suppressHydrationWarning className="w-full h-full flex flex-col justify-between px-4 sm:px-8 py-3 sm:py-5 select-none relative z-10">
      {/* ── Main 2-Column Hero & Login Card Grid ────────────────────────────── */}
      <div className="max-w-7xl mx-auto w-full flex-1 flex flex-col justify-center">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-14 items-center">

          {/* ── Left Column: Event Headline, Details & Big Stage Illustration ─ */}
          <div className="lg:col-span-7 space-y-4 md:space-y-6 text-left">
            <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-center">
              <div className="md:col-span-7 space-y-2 sm:space-y-3">
                {dataLoading ? (
                  <div className="space-y-3 animate-pulse">
                    <div className="h-12 w-4/5 bg-[var(--border-default)]/40 rounded-2xl" />
                    <div className="h-6 w-3/5 bg-[var(--border-default)]/30 rounded-xl" />
                    <div className="h-4 w-full bg-[var(--border-default)]/20 rounded-lg" />
                  </div>
                ) : (
                  <div className="space-y-2">
                    <motion.h1
                      initial={{ opacity: 0, y: 12 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.35 }}
                      className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-black tracking-tight text-[var(--pri)] uppercase font-sans leading-tight drop-shadow-sm"
                    >
                      {eventName}
                    </motion.h1>

                    {tagline && (
                      <motion.h2
                        initial={{ opacity: 0, y: 12 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.35, delay: 0.05 }}
                        className="text-base sm:text-lg md:text-xl font-extrabold text-[var(--sec)] tracking-tight"
                      >
                        {tagline}
                      </motion.h2>
                    )}

                    {description && (
                      <motion.p
                        initial={{ opacity: 0, y: 12 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.35, delay: 0.1 }}
                        className="text-xs sm:text-sm text-[var(--muted)] font-medium leading-relaxed max-w-xl line-clamp-3 border-l-2 border-[var(--pri)]/40 pl-3"
                      >
                        {description}
                      </motion.p>
                    )}
                  </div>
                )}
              </div>

              {/* Enlarged Dynamic Stage Illustration */}
              <div className="md:col-span-5 flex justify-center md:justify-end">
                <ThemedIllustration
                  name="conference-amico"
                  className="w-48 sm:w-56 md:w-64 max-w-[280px] drop-shadow-2xl hover:scale-105 transition-transform duration-500"
                  glow={true}
                  badge="Interactive Stage"
                />
              </div>
            </div>

            {/* Date & Location Badges */}
            {!dataLoading && (dateFormatted || venue) && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.35, delay: 0.15 }}
                className="flex flex-wrap items-center gap-x-6 gap-y-2 text-xs sm:text-sm font-semibold text-[var(--text)]"
              >
                {dateFormatted && (
                  <div className="flex items-center gap-2">
                    <Calendar className="h-4 w-4 text-[var(--pri)] shrink-0" />
                    <span className="uppercase tracking-wider font-bold">{dateFormatted}</span>
                  </div>
                )}
                {venue && (
                  <div className="flex items-center gap-2">
                    <MapPin className="h-4 w-4 text-[var(--sec)] shrink-0" />
                    <span>{venue}</span>
                  </div>
                )}
              </motion.div>
            )}

            {/* Action Buttons: View Program & Download Agenda */}
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35, delay: 0.2 }}
              className="flex flex-wrap items-center gap-3 pt-1"
            >
              <button
                type="button"
                onClick={() => {
                  if (eventData?.program_url) {
                    window.open(eventData.program_url, "_blank");
                  } else {
                    setProgramModalOpen(true);
                  }
                }}
                className="px-5 py-2.5 rounded-xl bg-[var(--pri)] hover:bg-[var(--pri)]/90 text-white text-xs font-black uppercase tracking-wider shadow-md shadow-[var(--pri)]/25 transition-all cursor-pointer flex items-center gap-2"
              >
                <FileText className="h-4 w-4" />
                <span>View Program</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  if (eventData?.program_url) {
                    const link = document.createElement("a");
                    link.href = eventData.program_url;
                    link.target = "_blank";
                    link.download = `${eventName || "Conference"}-Agenda.pdf`;
                    link.click();
                  } else {
                    setProgramModalOpen(true);
                  }
                }}
                className="px-5 py-2.5 rounded-xl bg-[var(--sec)] hover:bg-[var(--sec)]/90 text-white text-xs font-black uppercase tracking-wider shadow-md shadow-[var(--sec)]/25 transition-all cursor-pointer flex items-center gap-2"
              >
                <Download className="h-4 w-4 text-white" />
                <span>Download Agenda</span>
              </button>
            </motion.div>
          </div>

          {/* ── Right Column: Large, Premium Floating Glass Login / Access Card ── */}
          <div className="lg:col-span-5 flex justify-center">
            <motion.div
              initial={{ opacity: 0, scale: 0.97 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.35, delay: 0.1 }}
              className="w-full max-w-[400px] sm:max-w-[430px] rounded-[28px] p-6 sm:p-7 md:p-8 bg-[var(--card)]/95 border border-[var(--border-default)] backdrop-blur-2xl shadow-2xl relative overflow-hidden text-left"
            >
              {/* Top Accent Stripe */}
              <div
                className="absolute top-0 left-0 right-0 h-1.5 bg-[var(--sec)]"
              />

              {/* Ambient Dual-Tone Glow Bubbles */}
              <div className="absolute -top-16 -right-16 w-36 h-36 bg-[var(--sec)]/15 rounded-full blur-3xl pointer-events-none" />
              <div className="absolute -bottom-16 -left-16 w-36 h-36 bg-[var(--pri)]/15 rounded-full blur-3xl pointer-events-none" />

              {/* Header Badge & Enlarged ID Card Illustration */}
              <div className="text-center space-y-1 mb-4 relative z-10">
                <ThemedIllustration
                  name="id-card"
                  className="w-20 h-20 sm:w-24 sm:h-24 mx-auto mb-1 drop-shadow-md"
                  glow={false}
                />
                <span className="text-[10px] font-black uppercase tracking-[0.24em] text-[var(--muted)] block">
                  YOUR ATTENDEE PORTAL
                </span>
                <h3 className="text-lg sm:text-xl font-black text-[var(--text)] tracking-tight">
                  {step === "identifier" ? "Instant OTP Access" : "Enter Verification Code"}
                </h3>
                <p className="text-xs text-[var(--muted)] font-medium">
                  {step === "identifier"
                    ? "Enter your Email to Register & Access Pass."
                    : `6-digit code sent to ${identifier}`}
                </p>
              </div>

              {/* Error Alert */}
              {error && (
                <div className="p-3 mb-3 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-600 dark:text-rose-400 text-xs font-bold flex items-center gap-2.5 shadow-sm relative z-10">
                  <AlertCircle className="h-4 w-4 shrink-0 text-rose-500" />
                  <span className="leading-tight">{error}</span>
                </div>
              )}

              {/* Dev OTP Box */}
              {devOtp && (
                <div className="p-2.5 mb-3 rounded-xl bg-[var(--sec)]/10 border border-[var(--sec)]/30 text-[var(--sec)] text-xs font-bold text-center relative z-10">
                  Dev Auto-Fill OTP: <span className="font-mono font-black text-[var(--text)]">{devOtp}</span>
                </div>
              )}

              {/* Step 1: Identifier Input */}
              {step === "identifier" ? (
                <form onSubmit={handleSendOtp} className="space-y-3.5 relative z-10">
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black uppercase tracking-widest text-[var(--muted)] block">
                      Email Address
                    </label>
                    <input
                      type="text"
                      placeholder="abc@example.com"
                      value={identifier}
                      onChange={(e) => setIdentifier(e.target.value)}
                      disabled={loading}
                      className="w-full h-12 rounded-2xl bg-[var(--bg-surface-2)] border border-[var(--border-default)] focus:border-[var(--sec)] focus:ring-2 focus:ring-[var(--sec)]/20 text-[var(--text)] placeholder:text-[var(--muted)] text-sm font-semibold px-4 transition-all"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full h-12 rounded-2xl bg-[var(--pri)] hover:bg-[var(--pri)]/90 text-white text-xs font-black uppercase tracking-widest flex items-center justify-center gap-2 shadow-lg shadow-[var(--pri)]/30 transition-all cursor-pointer disabled:opacity-50 mt-2"
                  >
                    {loading ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <>
                        <span>Access My Portal</span>
                        <ArrowRight className="h-4 w-4" />
                      </>
                    )}
                  </button>
                </form>
              ) : (
                /* Step 2: OTP Verification */
                <div className="space-y-4 relative z-10">
                  <OtpBoxes value={otp} onChange={setOtp} disabled={loading} />

                  <button
                    type="button"
                    onClick={handleVerifyOtp}
                    disabled={loading || otp.replace(/\s/g, "").length !== 6}
                    className="w-full h-12 rounded-2xl bg-[var(--pri)] hover:bg-[var(--pri)]/90 text-white text-xs font-black uppercase tracking-widest flex items-center justify-center gap-2 shadow-lg shadow-[var(--pri)]/30 transition-all cursor-pointer disabled:opacity-50"
                  >
                    {loading ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <>
                        <span>Verify & Enter Portal</span>
                        <ArrowRight className="h-4 w-4" />
                      </>
                    )}
                  </button>

                  <div className="flex items-center justify-between text-xs font-bold pt-1">
                    <button
                      type="button"
                      onClick={() => {
                        setStep("identifier");
                        setOtp("");
                        setError(null);
                      }}
                      className="text-[var(--muted)] hover:text-[var(--text)] flex items-center gap-1 transition-colors cursor-pointer"
                    >
                      <ArrowLeft className="h-4 w-4" />
                      <span>Change</span>
                    </button>

                    <button
                      type="button"
                      disabled={resendCooldown > 0 || loading}
                      onClick={() => handleSendOtp()}
                      className="text-[var(--sec)] hover:underline disabled:opacity-40 disabled:no-underline cursor-pointer text-xs"
                    >
                      {resendCooldown > 0 ? `Resend in ${resendCooldown}s` : "Resend Code"}
                    </button>
                  </div>
                </div>
              )}

              {/* Secure Pass Badge */}
              <div className="mt-4 pt-3.5 border-t border-[var(--border-default)] flex items-center justify-center gap-1.5 text-[10px] font-bold text-[var(--muted)] uppercase tracking-wider">
                <ShieldCheck className="h-4 w-4 text-emerald-500" />
                <span>Verified Delegate Access Only</span>
              </div>
            </motion.div>
          </div>
        </div>
      </div>

      {/* ── Event Metrics / Dynamic Stats Strip: Pinned Flush directly above Footer ─── */}
      {stats.length > 0 && (
        <div className="max-w-7xl mx-auto w-full pt-3 pb-1 border-t border-[var(--border-default)]/50 shrink-0">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
            {stats.map((st, i) => {
              const IconComp = getStatIcon(st.label, st.icon);
              const isEven = i % 2 === 0;
              return (
                <div
                  key={i}
                  className={`flex items-center gap-3 p-2.5 sm:p-3 rounded-2xl bg-[var(--card)]/90 border border-[var(--border-default)] ${isEven ? "hover:border-[var(--pri)]/50" : "hover:border-[var(--sec)]/50"
                    } transition-all shadow-sm group text-left backdrop-blur-md`}
                >
                  <div
                    className={`h-9 w-9 sm:h-10 sm:w-10 rounded-xl ${isEven
                        ? "bg-[var(--pri)]/10 border border-[var(--pri)]/20 text-[var(--pri)]"
                        : "bg-[var(--sec)]/10 border border-[var(--sec)]/20 text-[var(--sec)]"
                      } flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform`}
                  >
                    <IconComp className="h-4 w-4 sm:h-5 sm:w-5" />
                  </div>
                  <div className="min-w-0">
                    <span className="text-xs sm:text-sm font-black text-[var(--text)] tracking-tight block truncate">
                      {st.label}
                    </span>
                    {st.value && (
                      <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--muted)] block truncate">
                        {st.value}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Program Modal ─────── */}
      <Dialog open={programModalOpen} onOpenChange={setProgramModalOpen}>
        <DialogContent className="sm:max-w-[480px] rounded-3xl p-6 bg-[var(--card)] border border-[var(--border-default)] text-[var(--text)]">
          <DialogHeader className="space-y-2 text-left">
            <div className="w-10 h-10 rounded-2xl bg-[var(--pri)]/10 border border-[var(--pri)]/20 flex items-center justify-center text-[var(--pri)] mb-1">
              <FileText className="h-5 w-5" />
            </div>
            <DialogTitle className="text-lg font-black tracking-tight text-[var(--text)]">
              Conference Program
            </DialogTitle>
            <DialogDescription className="text-xs text-[var(--muted)] leading-relaxed">
              The full scientific agenda and session schedule for {eventName || "this event"} will be published here once finalized by the committee.
            </DialogDescription>
          </DialogHeader>

          <div className="py-4 space-y-3">
            <div className="p-4 rounded-2xl bg-[var(--bg-surface-2)] border border-[var(--border-default)] space-y-1">
              <span className="text-[10px] font-black uppercase tracking-widest text-[var(--muted)] block">
                Track Structure
              </span>
              <p className="text-xs font-semibold text-[var(--text)]">
                {eventData?.tracks?.length
                  ? `${eventData.tracks.length} Specialized Tracks Configured`
                  : "Multi-track sessions & keynotes"}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setProgramModalOpen(false)}
            className="w-full h-11 rounded-xl bg-[var(--pri)] hover:bg-[var(--pri)]/90 text-white text-xs font-black uppercase tracking-wider transition-all cursor-pointer shadow-md shadow-[var(--pri)]/20"
          >
            Close
          </button>
        </DialogContent>
      </Dialog>
    </div>
  );
}
