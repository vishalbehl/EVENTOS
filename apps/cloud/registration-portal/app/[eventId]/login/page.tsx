"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { Mail, ArrowRight, RotateCcw, ShieldCheck, AlertCircle, Loader2 } from "lucide-react";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";

type Step = "email" | "otp";

// ── OTP 6-box input ───────────────────────────────────────────────────────

function OtpBoxes({ value, onChange, disabled }: { value: string; onChange: (v: string) => void; disabled: boolean }) {
  const refs = useRef<Array<HTMLInputElement | null>>([]);

  const handleKey = (idx: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Backspace") {
      e.preventDefault();
      const next = [...value.padEnd(6, " ").split("")];
      if (next[idx].trim()) { next[idx] = " "; onChange(next.join("").trimEnd()); }
      else if (idx > 0) { refs.current[idx - 1]?.focus(); next[idx - 1] = " "; onChange(next.join("").trimEnd()); }
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
    <div className="flex gap-3 justify-center" onPaste={handlePaste}>
      {Array.from({ length: 6 }).map((_, i) => (
        <input
          key={i}
          ref={(el) => { refs.current[i] = el; }}
          type="text"
          inputMode="numeric"
          maxLength={1}
          disabled={disabled}
          value={(value[i] || "").trim()}
          onChange={(e) => handleChange(i, e)}
          onKeyDown={(e) => handleKey(i, e)}
          onClick={() => refs.current[i]?.select()}
          aria-label={`OTP digit ${i + 1}`}
          className="w-11 h-14 text-center text-2xl font-black rounded-xl
                     border border-white/10 bg-white/5 text-[#E8EAFF]
                     focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20
                     disabled:opacity-30 transition-all duration-150 outline-none
                     placeholder-white/20"
          style={{ fontVariantNumeric: "tabular-nums", fontFamily: "monospace" }}
        />
      ))}
    </div>
  );
}

// ── Countdown ─────────────────────────────────────────────────────────────

function Countdown({ seconds, onEnd }: { seconds: number; onEnd: () => void }) {
  const [rem, setRem] = useState(seconds);
  useEffect(() => {
    setRem(seconds);
    const id = setInterval(() => setRem(s => { if (s <= 1) { clearInterval(id); onEnd(); return 0; } return s - 1; }), 1000);
    return () => clearInterval(id);
  }, [seconds]);
  const m = String(Math.floor(rem / 60)).padStart(2, "0");
  const s = String(rem % 60).padStart(2, "0");
  return <span className="font-mono text-indigo-400 font-black tabular-nums">{m}:{s}</span>;
}

// ── Page ──────────────────────────────────────────────────────────────────

export default function OTPLoginPage() {
  const { eventId } = useParams<{ eventId: string }>();
  const router = useRouter();

  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [registrationClosed, setRegistrationClosed] = useState(false);
  const [otpExpired, setOtpExpired] = useState(false);
  const [canResend, setCanResend] = useState(false);
  const [failCount, setFailCount] = useState(0);

  useEffect(() => {
    if (otp.replace(/\s/g, "").length === 6 && step === "otp" && !loading) verifyOtp();
  }, [otp]);

  const requestOtp = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!email.trim()) return;
    setLoading(true); setError(null);
    try {
      const res = await fetch(`${API_BASE}/api/v1/portal/auth/request-otp`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim().toLowerCase(), event_id: eventId }),
      });
      if (res.status === 403) { setRegistrationClosed(true); return; }
      if (res.status === 429) { setError("Too many requests. Please wait 15 minutes."); return; }
      setStep("otp"); setOtpExpired(false); setCanResend(false);
      setTimeout(() => setCanResend(true), 60_000);
    } catch { setError("Network error. Please check your connection."); }
    finally { setLoading(false); }
  };

  const verifyOtp = useCallback(async () => {
    const clean = otp.replace(/\s/g, "");
    if (clean.length < 6) return;
    setLoading(true); setError(null);
    try {
      const res = await fetch(`${API_BASE}/api/v1/portal/auth/verify-otp`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim().toLowerCase(), event_id: eventId, otp: clean }),
      });
      if (res.ok) {
        const data = await res.json();
        localStorage.setItem(`portal_token_${eventId}`, data.access_token);
        router.push(`/${eventId}/dashboard`); return;
      }
      const data = await res.json();
      setFailCount(c => c + 1); setOtp("");
      setError(data.detail || "Invalid OTP. Please try again.");
    } catch { setError("Network error. Please check your connection."); }
    finally { setLoading(false); }
  }, [otp, email, eventId, router]);

  const resendOtp = async () => {
    if (!canResend) return;
    setLoading(true); setError(null); setOtp("");
    try {
      const res = await fetch(`${API_BASE}/api/v1/portal/auth/resend-otp`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim().toLowerCase(), event_id: eventId }),
      });
      if (res.status === 429) { setError("Too many requests. Please wait 15 minutes."); return; }
      setOtpExpired(false); setCanResend(false);
      setTimeout(() => setCanResend(true), 60_000);
    } catch { setError("Network error. Please check your connection."); }
    finally { setLoading(false); }
  };

  // ── Registration closed ───────────────────────────────────────
  if (registrationClosed) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <motion.div
          initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
          className="glass-3d p-10 max-w-md w-full text-center rounded-[2.5rem] relative overflow-hidden"
        >
          <div className="absolute top-0 right-0 w-24 h-24 bg-rose-500/10 rounded-full blur-2xl pointer-events-none" />
          <div className="h-20 w-20 rounded-full bg-rose-500/10 border border-rose-500/20 flex items-center justify-center mx-auto mb-6">
            <AlertCircle className="h-10 w-10 text-rose-400 animate-pulse" />
          </div>
          <h1 className="text-2xl font-black text-[#E8EAFF] uppercase tracking-tighter mb-3">Registration Closed</h1>
          <p className="text-[var(--muted)] font-bold text-sm leading-relaxed">
            Online registration for this event is currently closed.
            Please contact the organiser for assistance.
          </p>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <motion.div
        initial={{ y: 24, opacity: 0 }} animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.4, ease: "easeOut" }}
        className="glass-3d p-8 sm:p-10 max-w-md w-full rounded-[2.5rem] relative overflow-hidden"
      >
        {/* Ambient glow */}
        <div className="absolute top-0 left-0 w-32 h-32 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />

        {/* Header */}
        <div className="text-center mb-8 relative">
          <div className="h-14 w-14 rounded-2xl glass-3d flex items-center justify-center border border-indigo-500/30 mx-auto mb-5 shadow-xl relative overflow-hidden group">
            <div className="absolute inset-0 bg-indigo-500/5 group-hover:bg-indigo-500/10 transition-colors" />
            <ShieldCheck className="h-6 w-6 text-indigo-400 relative z-10 drop-shadow-[0_0_8px_rgba(99,102,241,0.5)]" />
          </div>
          <span className="text-[9px] font-black text-indigo-400 uppercase tracking-[0.3em] block">
            Attendee Portal
          </span>
          <h1 className="text-2xl font-black text-[#E8EAFF] tracking-tighter mt-1">
            {step === "email" ? "Access Your Registration" : "Enter Your Code"}
          </h1>
          <p className="text-[var(--muted)] text-xs font-bold mt-2 leading-relaxed">
            {step === "email"
              ? "Enter the email you registered with. We'll send a one-time code."
              : `We sent a 6-digit code to ${email}`}
          </p>
        </div>

        <AnimatePresence mode="wait">
          {/* Step 1 — Email */}
          {step === "email" && (
            <motion.form key="email" initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }}
              onSubmit={requestOtp} className="space-y-4">
              <div className="relative">
                <Mail className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-indigo-400" />
                <input
                  type="email" required value={email} onChange={e => setEmail(e.target.value)}
                  placeholder="your@email.com" autoFocus disabled={loading}
                  className="input !pl-12"
                />
              </div>

              {error && (
                <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }}
                  className="flex items-center gap-2 px-4 py-3 rounded-xl bg-rose-500/10 border border-rose-500/20">
                  <AlertCircle className="h-4 w-4 text-rose-400 shrink-0" />
                  <p className="text-xs font-bold text-rose-400">{error}</p>
                </motion.div>
              )}

              <button type="submit" disabled={loading || !email} className="btn-primary w-full h-12 rounded-full flex items-center justify-center gap-2">
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <><span>Send OTP</span><ArrowRight className="h-4 w-4" /></>}
              </button>
            </motion.form>
          )}

          {/* Step 2 — OTP */}
          {step === "otp" && (
            <motion.div key="otp" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}
              className="space-y-5">
              <OtpBoxes value={otp} onChange={setOtp} disabled={loading} />

              {!otpExpired ? (
                <p className="text-center text-xs font-bold text-[var(--muted)]">
                  Expires in <Countdown seconds={600} onEnd={() => setOtpExpired(true)} />
                </p>
              ) : (
                <p className="text-center text-xs font-black text-amber-400">OTP expired — please resend.</p>
              )}

              {failCount >= 2 && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                  className="px-4 py-2.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-center">
                  <p className="text-xs font-black text-amber-400">
                    {5 - failCount} attempt{5 - failCount !== 1 ? "s" : ""} remaining
                  </p>
                </motion.div>
              )}

              {error && (
                <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }}
                  className="flex items-center gap-2 px-4 py-3 rounded-xl bg-rose-500/10 border border-rose-500/20">
                  <AlertCircle className="h-4 w-4 text-rose-400 shrink-0" />
                  <p className="text-xs font-bold text-rose-400">{error}</p>
                </motion.div>
              )}

              <button onClick={verifyOtp} disabled={loading || otp.replace(/\s/g, "").length < 6}
                className="btn-primary w-full h-12 rounded-full flex items-center justify-center gap-2">
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Verify & Login"}
              </button>

              <div className="flex items-center justify-between pt-1">
                <button onClick={() => { setStep("email"); setOtp(""); setError(null); }}
                  className="text-xs font-bold text-[var(--muted)] hover:text-[#E8EAFF] transition-colors">
                  ← Change email
                </button>
                <button onClick={resendOtp} disabled={!canResend || loading}
                  className="flex items-center gap-1.5 text-xs font-black text-indigo-400 hover:text-indigo-300 disabled:text-white/20 disabled:cursor-not-allowed transition-colors">
                  <RotateCcw className="h-3 w-3" />
                  {canResend ? "Resend OTP" : <span className="text-[var(--muted)] font-bold">Resend in <Countdown seconds={60} onEnd={() => setCanResend(true)} /></span>}
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  );
}
