"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  Lock, Mail, ChevronRight, Loader2, Box, Eye, EyeOff, Globe, Zap, ShieldCheck, Fingerprint, Check
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { authService } from "@/services/auth-service";
import { useAuthStore } from "@/store/use-auth-store";
import { toast } from "sonner";
import Link from "next/link";
import { PublicShell } from "@/components/organizer/org/SignupWizard";
import bgImage from "../../../../../public/login/bg.png";

export default function LoginPage() {
  const router = useRouter();
  const { isAuthenticated, accessToken } = useAuthStore();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);

  useEffect(() => {
    if (isAuthenticated && accessToken) {
      router.push("/dashboard");
    }
  }, [isAuthenticated, accessToken, router]);

  const handleLogin = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!email || !password) {
      toast.error("Credentials required.");
      return;
    }

    setLoading(true);
    try {
      await authService.login({ email, password }, rememberMe);
      sessionStorage.setItem("session_active", "true");
      toast.success("Security handshake complete. Verifying environment...");
      setStep(2);
      setTimeout(() => {
        router.push("/dashboard");
      }, 2000);
    } catch (error: any) {
      toast.error(error.message || "Authentication rejected by terminal.");
    } finally {
      setLoading(false);
    }
  };

  if (isAuthenticated && accessToken && step === 1) {
    return null;
  }

  return (
    <PublicShell
      eyebrow="Welcome Back"
      title="Your all-in-one event management platform"
      subtitle="Manage speakers, registrations, sessions, and analytics — everything you need to run a great event, in one place."
      sideImage={bgImage}
    >
      <div className="flex flex-col space-y-2">
        <h2 className="text-xs font-black uppercase tracking-[0.3em] text-[var(--pri)]">
          Welcome Back
        </h2>
        <p className="text-2xl font-bold tracking-tight text-white">
          Sign in to your EventOS account
        </p>
      </div>

      <AnimatePresence mode="wait">
        {step === 1 ? (
          <motion.form
            key="login-form"
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -15 }}
            onSubmit={handleLogin}
            className="space-y-6"
          >
            <div className="space-y-5">
              {/* Email */}
              <div className="space-y-2.5">
                <label className="text-[10px] font-black uppercase tracking-wider text-[#8b8b95] px-1">
                  Email address
                </label>
                <div className="relative rounded-2xl border border-white/[0.08] bg-[#0c0c0e] focus-within:border-[var(--pri)]/50 focus-within:ring-2 focus-within:ring-[var(--pri)]/10 transition-all duration-300 overflow-hidden">
                  <Mail className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@company.com"
                    className="w-full h-14 bg-transparent pl-12 pr-5 text-sm font-semibold text-white focus:outline-none focus:ring-0 placeholder:text-[#5f6068]"
                    required
                  />
                </div>
              </div>

              {/* Password */}
              <div className="space-y-2.5">
                <label className="text-[10px] font-black uppercase tracking-wider text-[#8b8b95] px-1">
                  Password
                </label>
                <div className="relative rounded-2xl border border-white/[0.08] bg-[#0c0c0e] focus-within:border-[var(--pri)]/50 focus-within:ring-2 focus-within:ring-[var(--pri)]/10 transition-all duration-300 overflow-hidden">
                  <Lock className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                  <input
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter your password"
                    className="w-full h-14 bg-transparent pl-12 pr-12 text-sm font-semibold text-white focus:outline-none focus:ring-0 placeholder:text-[#5f6068]"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-white transition-colors"
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>
            </div>

            {/* Remember & Forgot Access Key */}
            <div className="flex items-center justify-between px-1">
              <button
                type="button"
                onClick={() => setRememberMe(!rememberMe)}
                className="flex items-center gap-2 group cursor-pointer"
              >
                <div className={cn(
                  "h-4 w-4 rounded border border-white/20 flex items-center justify-center transition-all bg-[#0c0c0e]",
                  rememberMe && "border-[var(--pri)] bg-[var(--pri)]/10"
                )}>
                  {rememberMe && <Check className="h-3 w-3 text-[var(--pri)] stroke-[3]" />}
                </div>
                <span className="text-[11px] font-bold text-[#8b8b95] group-hover:text-white transition-colors">
                  Remember this device
                </span>
              </button>
              <span className="text-[11px] font-bold text-[var(--pri)] hover:underline cursor-pointer">
                Forgot password?
              </span>
            </div>

            {/* Login Button */}
            <Button
              type="submit"
              disabled={loading}
              className="w-full h-14 bg-[var(--pri)] hover:bg-[#e0ff00] text-black font-black uppercase tracking-wider text-[11px] rounded-2xl shadow-[0_15px_30px_rgba(224,255,0,0.12)] border-0 active:scale-[0.98] transition-all flex items-center justify-center gap-2"
            >
              {loading ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <>
                  Sign In <ChevronRight className="h-4 w-4" />
                </>
              )}
            </Button>

            {/* Social Login Separator */}
            <div className="relative flex py-2 items-center">
              <div className="flex-grow border-t border-white/[0.06]"></div>
              <span className="flex-shrink mx-4 text-[9px] font-black uppercase tracking-widest text-[#8b8b95]">
                Or Continue With
              </span>
              <div className="flex-grow border-t border-white/[0.06]"></div>
            </div>

            {/* Social Logins */}
            <div className="grid grid-cols-2 gap-4">
              <button
                type="button"
                className="h-12 rounded-xl border border-white/[0.06] bg-[#0c0c0e] hover:bg-white/[0.02] flex items-center justify-center gap-2 text-xs font-bold text-white transition-all active:scale-95"
              >
                <svg className="h-4 w-4" viewBox="0 0 24 24">
                  <path
                    fill="currentColor"
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                  />
                  <path
                    fill="currentColor"
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  />
                  <path
                    fill="currentColor"
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                  />
                  <path
                    fill="currentColor"
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                  />
                </svg>
                Google
              </button>
              <button
                type="button"
                className="h-12 rounded-xl border border-white/[0.06] bg-[#0c0c0e] hover:bg-white/[0.02] flex items-center justify-center gap-2 text-xs font-bold text-white transition-all active:scale-95"
              >
                <svg className="h-4 w-4 text-[#00a4ef]" viewBox="0 0 23 23">
                  <path fill="currentColor" d="M0 0h11v11H0zM12 0h11v11H12zM0 12h11v11H0zM12 12h11v11H12z" />
                </svg>
                Microsoft
              </button>
            </div>
          </motion.form>
        ) : (
          <motion.div
            key="mfa-form"
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-8 text-center"
          >
            <div className="space-y-2">
              <h2 className="text-xl font-bold text-white tracking-tight">Security Check</h2>
              <p className="text-[12px] text-[var(--pri)] font-black uppercase tracking-widest flex items-center justify-center gap-2">
                <ShieldCheck className="h-4 w-4" /> Identity Validated
              </p>
            </div>
            <div className="flex justify-center py-4">
              <div className="relative h-20 w-20 flex items-center justify-center">
                <div className="absolute inset-0 bg-[var(--pri)]/20 blur-2xl rounded-full animate-pulse" />
                <Fingerprint className="h-12 w-12 text-[var(--pri)] relative z-10" />
              </div>
            </div>
            <div className="flex gap-3 justify-center">
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <div key={i} className="h-12 w-10 rounded-xl border border-white/[0.08] bg-[#0c0c0e] flex items-center justify-center">
                  <div className="h-1.5 w-1.5 rounded-full bg-[var(--pri)] animate-pulse" />
                </div>
              ))}
            </div>
            <Button disabled className="w-full h-14 bg-white/5 border border-white/[0.08] text-[#8b8b95] font-black uppercase tracking-wider text-[11px] rounded-2xl flex items-center justify-center gap-2">
              Signing you in... <Loader2 className="h-4 w-4 animate-spin text-[var(--pri)]" />
            </Button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Footer Link */}
      <div className="text-center">
        <p className="text-xs text-[#8b8b95] font-medium">
          New to EventOS?{" "}
          <Link
            href="/signup"
            className="text-[var(--pri)] hover:underline font-bold transition-all"
          >
            Create account
          </Link>
        </p>
      </div>
    </PublicShell>
  );
}
