"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { Shield, ArrowRight, Command, Mail, Key, Loader2, AlertCircle, RotateCcw, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { apiClient } from "@/lib/api-client";
import { usePortalConfig } from "@/hooks/usePortal";
import { SpeakerPortalLayout } from "@/components/SpeakerPortalLayout";

type LoginMode = "code" | "email";
type Step = "email" | "otp";

// ── OTP 6-box input ───────────────────────────────────────────────────────
function OtpBoxes({ value, onChange, disabled }: { value: string; onChange: (v: string) => void; disabled: boolean }) {
  const refs = useRef<Array<HTMLInputElement | null>>([]);

  const handleKey = (idx: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Backspace") {
      e.preventDefault();
      const next = [...value.padEnd(6, " ").split("")];
      if (next[idx].trim()) { next[idx] = " "; onChange(next.join("").replace(/,/g, "").trimEnd()); }
      else if (idx > 0) { refs.current[idx - 1]?.focus(); next[idx - 1] = " "; onChange(next.join("").replace(/,/g, "").trimEnd()); }
    }
  };

  const handleChange = (idx: number, e: React.ChangeEvent<HTMLInputElement>) => {
    const char = e.target.value.replace(/\D/g, "").slice(-1);
    if (!char) return;
    const next = value.padEnd(6, " ").split("");
    next[idx] = char;
    onChange(next.join("").replace(/,/g, "").trimEnd());
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

export default function SpeakerPortalLoginPage() {
  const { eventId } = useParams<{ eventId: string }>();
  const router = useRouter();

  // Fetch public event configurations
  const { data: config, isLoading: configLoading, error: configError } = usePortalConfig(eventId);

  const [loginMode, setLoginMode] = useState<LoginMode>("code");
  const [code, setCode] = useState("");
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [step, setStep] = useState<Step>("email");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [otpExpired, setOtpExpired] = useState(false);
  const [canResend, setCanResend] = useState(false);
  const [failCount, setFailCount] = useState(0);

  useEffect(() => {
    if (otp.replace(/\s/g, "").length === 6 && step === "otp" && !loading) {
      verifyOtp();
    }
  }, [otp]);

  const handleCodeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (code.trim().length < 4) {
      toast.error("Please enter a valid speaker code.");
      return;
    }
    
    setLoading(true);
    setError(null);
    try {
      // Verify that this access code works and is scoped to this event
      const res = await apiClient.get(`/portal/auth/${eventId}/${code.trim()}`);
      toast.success("Access code verified successfully!");
      // Redirect to the event-scoped dashboard using the resolved speaker token
      router.push(`/${eventId}/${res.data.upload_token}`);
    } catch (err: any) {
      const msg = err.response?.data?.detail || "Invalid access code for this event.";
      setError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  const requestOtp = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!email.trim()) return;
    setLoading(true); setError(null);
    try {
      await apiClient.post("/portal/speaker/request-otp", {
        email: email.trim().toLowerCase(),
        event_id: eventId
      });
      setStep("otp"); setOtpExpired(false); setCanResend(false);
      setTimeout(() => setCanResend(true), 60_000);
      toast.success("OTP sent to your registered email address.");
    } catch (err: any) {
      const msg = err.response?.data?.detail || "Failed to request OTP. Please verify your email.";
      setError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  const verifyOtp = useCallback(async () => {
    const clean = otp.replace(/\s/g, "");
    if (clean.length < 6) return;
    setLoading(true); setError(null);
    try {
      const res = await apiClient.post("/portal/speaker/verify-otp", {
        email: email.trim().toLowerCase(),
        event_id: eventId,
        otp: clean
      });
      const data = res.data;
      toast.success("Authentication successful!");
      router.push(`/${eventId}/${data.token}`);
    } catch (err: any) {
      const msg = err.response?.data?.detail || "Invalid OTP. Please try again.";
      setFailCount(c => c + 1); setOtp("");
      setError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }, [otp, email, eventId, router]);

  const resendOtp = async () => {
    if (!canResend) return;
    setLoading(true); setError(null); setOtp("");
    try {
      await apiClient.post("/portal/speaker/request-otp", {
        email: email.trim().toLowerCase(),
        event_id: eventId
      });
      setOtpExpired(false); setCanResend(false);
      setTimeout(() => setCanResend(true), 60_000);
      toast.success("A fresh OTP has been sent to your email.");
    } catch (err: any) {
      const msg = err.response?.data?.detail || "Failed to resend OTP.";
      setError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  // ── Render Loading state ──
  if (configLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-10 w-10 text-indigo-500 animate-spin" />
          <span className="text-[10px] font-black text-muted uppercase tracking-[0.3em]">Scoping Event Environment</span>
        </div>
      </div>
    );
  }

  // ── Render Event Not Found / Error State ──
  if (configError || !config) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <motion.div
          initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
          className="glass-3d p-10 max-w-md w-full text-center rounded-[2.5rem] relative overflow-hidden"
        >
          <div className="h-20 w-20 rounded-full bg-rose-500/10 border border-rose-500/20 flex items-center justify-center mx-auto mb-6">
            <AlertCircle className="h-10 w-10 text-rose-400" />
          </div>
          <h1 className="text-2xl font-black text-[#E8EAFF] uppercase tracking-tighter mb-3">Event Not Found</h1>
          <p className="text-muted font-bold text-sm leading-relaxed mb-6">
            The Event ID you specified does not exist or has been archived. Please check the URL or contact your organiser.
          </p>
          <button onClick={() => router.push("/")} className="btn-primary w-full h-12 rounded-full">
            Back to Home
          </button>
        </motion.div>
      </div>
    );
  }

  // ── Render Speaker Portal Draft Mode (Inactive) State ──
  if (!config.speaker_mode_enabled) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <motion.div
          initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
          className="glass-3d p-10 max-w-md w-full text-center rounded-[2.5rem] relative overflow-hidden"
        >
          <div className="absolute top-0 right-0 w-24 h-24 bg-rose-500/10 rounded-full blur-2xl pointer-events-none" />
          <div className="h-20 w-20 rounded-full bg-rose-500/10 border border-rose-500/20 flex items-center justify-center mx-auto mb-6">
            <AlertTriangle className="h-10 w-10 text-rose-400 animate-pulse" />
          </div>
          <h1 className="text-2xl font-black text-[#E8EAFF] uppercase tracking-tighter mb-3">Portal Closed</h1>
          <p className="text-muted font-bold text-sm leading-relaxed mb-4">
            The speaker portal for <strong>{config.event_name}</strong> is currently set to Draft or has closed.
          </p>
          <p className="text-muted text-xs">
            Submissions are not being accepted at this time. Please contact the event organizer for details.
          </p>
        </motion.div>
      </div>
    );
  }

  return (
    <SpeakerPortalLayout
      branding={config.branding_settings || {}}
      eventName={config.event_name}
      startDate={config.start_date}
      endDate={config.end_date}
      location={config.location}
      venueName={config.venue_name}
      country={config.country}
      organizerName={config.organizer_name}
    >
    <div className="flex flex-col items-center justify-center min-h-[60vh] p-6 relative">
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="glass-3d p-12 max-w-md w-full relative group overflow-hidden"
      >
        {/* Animated Accent Line */}
        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-[var(--pri)] to-transparent opacity-50" />
        
        <header className="mb-8 text-center relative z-10">
          <div className="flex justify-center mb-6">
            <div className="h-16 w-16 rounded-2xl bg-[var(--pri)]/10 border border-[var(--pri)]/20 flex items-center justify-center shadow-2xl group-hover:scale-110 transition-transform duration-500">
              <Command className="h-8 w-8 text-[var(--pri)]" />
            </div>
          </div>
          <span className="text-[9px] font-black text-[var(--pri)] uppercase tracking-[0.3em] block mb-1">
            {config.event_name}
          </span>
          <h1 className="text-3xl font-black tracking-tighter text-glow-indigo mb-2">
            Speaker <span className="text-[var(--pri)]">Portal</span>
          </h1>
          <p className="text-muted text-[10px] font-black uppercase tracking-[0.2em]">Secure Speaker Access</p>
        </header>

        {/* Auth Mode Toggle */}
        {step === "email" && (
          <div className="relative flex gap-1 p-1 rounded-xl bg-white/5 border border-white/5 mb-8">
            <button
              onClick={() => { setLoginMode("code"); setError(null); }}
              className={`flex-1 py-2 text-[10px] font-black uppercase tracking-wider rounded-lg transition-all ${
                loginMode === "code" ? "bg-[var(--pri)] text-white shadow-lg" : "text-muted hover:text-[#E8EAFF]"
              }`}
            >
              Access Code
            </button>
            <button
              onClick={() => { setLoginMode("email"); setError(null); }}
              className={`flex-1 py-2 text-[10px] font-black uppercase tracking-wider rounded-lg transition-all ${
                loginMode === "email" ? "bg-[var(--pri)] text-white shadow-lg" : "text-muted hover:text-[#E8EAFF]"
              }`}
            >
              Email & OTP
            </button>
          </div>
        )}

        <AnimatePresence mode="wait">
          {loginMode === "code" ? (
            <motion.form 
              key="code-login"
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 10 }}
              onSubmit={handleCodeSubmit} 
              className="space-y-6 relative z-10"
            >
              <div className="space-y-2">
                <label className="text-[10px] font-black text-muted uppercase tracking-widest ml-1">Unique Access Code</label>
                <div className="relative group">
                  <input
                    type="text"
                    placeholder="A1B2C3D4"
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    className="input text-center text-2xl tracking-[0.3em] uppercase font-mono h-16"
                    maxLength={20}
                    autoFocus
                    disabled={loading}
                  />
                  <Shield className="absolute right-4 top-1/2 -translate-y-1/2 h-5 w-5 text-muted/30 group-focus-within:text-[var(--pri)] transition-colors" />
                </div>
              </div>

              {error && (
                <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }}
                  className="flex items-center gap-2 px-4 py-3 rounded-xl bg-rose-500/10 border border-rose-500/20">
                  <AlertCircle className="h-4 w-4 text-rose-400 shrink-0" />
                  <p className="text-xs font-bold text-rose-400">{error}</p>
                </motion.div>
              )}
              
              <button 
                type="submit" 
                disabled={loading}
                className="btn-primary w-full h-14 text-xs tracking-widest flex items-center justify-center gap-3 rounded-full"
              >
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : (
                  <>
                    Access Dashboard <ArrowRight className="h-4 w-4" />
                  </>
                )}
              </button>
            </motion.form>
          ) : (
            <motion.div
              key="email-login"
              initial={{ opacity: 0, x: 10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -10 }}
              className="space-y-6"
            >
              <AnimatePresence mode="wait">
                {step === "email" ? (
                  <motion.form key="email-step" onSubmit={requestOtp} className="space-y-4">
                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-muted uppercase tracking-widest ml-1">Registered Email Address</label>
                      <div className="relative">
                        <Mail className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--pri)]" />
                        <input
                          type="email"
                          required
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          placeholder="your@email.com"
                          className="input !pl-12 h-14"
                          disabled={loading}
                          autoFocus
                        />
                      </div>
                    </div>

                    {error && (
                      <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }}
                        className="flex items-center gap-2 px-4 py-3 rounded-xl bg-rose-500/10 border border-rose-500/20">
                        <AlertCircle className="h-4 w-4 text-rose-400 shrink-0" />
                        <p className="text-xs font-bold text-rose-400">{error}</p>
                      </motion.div>
                    )}

                    <button
                      type="submit"
                      disabled={loading || !email}
                      className="btn-primary w-full h-14 text-xs tracking-widest flex items-center justify-center gap-3 rounded-full"
                    >
                      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : (
                        <>
                          Send OTP <ArrowRight className="h-4 w-4" />
                        </>
                      )}
                    </button>
                  </motion.form>
                ) : (
                  <motion.div key="otp-step" className="space-y-5">
                    <OtpBoxes value={otp} onChange={setOtp} disabled={loading} />

                    {!otpExpired ? (
                      <p className="text-center text-xs font-bold text-muted">
                        Expires in <Countdown seconds={600} onEnd={() => setOtpExpired(true)} />
                      </p>
                    ) : (
                      <p className="text-center text-xs font-black text-amber-400">OTP expired — please resend.</p>
                    )}

                    {error && (
                      <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }}
                        className="flex items-center gap-2 px-4 py-3 rounded-xl bg-rose-500/10 border border-rose-500/20">
                        <AlertCircle className="h-4 w-4 text-rose-400 shrink-0" />
                        <p className="text-xs font-bold text-rose-400">{error}</p>
                      </motion.div>
                    )}

                    <button
                      onClick={verifyOtp}
                      disabled={loading || otp.replace(/\s/g, "").length < 6}
                      className="btn-primary w-full h-14 text-xs tracking-widest flex items-center justify-center gap-3 rounded-full"
                    >
                      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Verify & Login"}
                    </button>

                    <div className="flex items-center justify-between pt-1">
                      <button
                        onClick={() => { setStep("email"); setOtp(""); setError(null); }}
                        className="text-xs font-bold text-muted hover:text-[#E8EAFF] transition-colors"
                      >
                        ← Change email
                      </button>
                      <button
                        onClick={resendOtp}
                        disabled={!canResend || loading}
                        className="flex items-center gap-1.5 text-xs font-black text-[var(--pri)] hover:text-indigo-300 disabled:text-white/20 disabled:cursor-not-allowed transition-colors"
                      >
                        <RotateCcw className="h-3 w-3" />
                        {canResend ? "Resend OTP" : <span className="text-muted font-bold">Resend in <Countdown seconds={60} onEnd={() => setCanResend(true)} /></span>}
                      </button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          )}
        </AnimatePresence>

        <footer className="mt-12 pt-8 border-t border-white/5 text-center">
          <p className="text-xs font-medium text-muted leading-relaxed">
            {loginMode === "code" 
              ? "Can't find your code? Access details were sent to your registered email address."
              : "OTP login requires both Registration and Speaker portal features to be active for the event."}
          </p>
        </footer>
      </motion.div>

      <div className="mt-8 text-[10px] font-black text-muted uppercase tracking-[0.4em] opacity-30">
        Powered by EventOS Platform
      </div>
    </div>
    </SpeakerPortalLayout>
  );
}
