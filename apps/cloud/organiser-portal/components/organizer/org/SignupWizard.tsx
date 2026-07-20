"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Box, ChevronRight, Eye, EyeOff, Loader2, Lock, Mail, Check,
  ClipboardList, FileImage, Building2, BarChart3, User, ShieldCheck, Fingerprint
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useAuthStore } from "@/store/use-auth-store";
import { cn } from "@/lib/utils";
import { orgApi } from "@/components/organizer/org/org-api";
import { authService } from "@/services/auth-service";
import bgImage from "../../../../../../public/login/bg.png";
import logoImage from "../../../../../../public/logo/1.png";

type SignupForm = {
  first_name: string;
  last_name: string;
  email: string;
  password: string;
};

const initialForm: SignupForm = {
  first_name: "",
  last_name: "",
  email: "",
  password: "",
};

export function LoginPageForm({ onToggleFlip }: { onToggleFlip?: (flip: boolean) => void }) {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);

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
        router.push("/onboarding");
      }, 2000);
    } catch (error: any) {
      toast.error(error.message || "Authentication rejected by terminal.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      {step === 1 ? (
        <form onSubmit={handleLogin} className="space-y-4">
          <div className="flex flex-col space-y-1 text-center">
            <h2 className="text-xs font-black uppercase tracking-[0.3em] text-[var(--pri)]">
              Welcome Back
            </h2>
            <p className="text-xl font-bold tracking-tight text-white">
              Sign in to your account
            </p>
          </div>

          <div className="space-y-3">
            <div className="space-y-1.5">
              <label className="text-[10px] font-black uppercase tracking-wider text-[#8b8b95] px-1">
                Email address
              </label>
              <div className="relative rounded-xl border border-white/[0.08] bg-[#0c0c0e] focus-within:border-[var(--pri)]/50 focus-within:ring-2 focus-within:ring-[var(--pri)]/10 transition-all duration-300 overflow-hidden">
                <Mail className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@company.com"
                  className="w-full h-11 bg-transparent pl-10 pr-4 text-sm font-semibold text-white focus:outline-none focus:ring-0 placeholder:text-[#5f6068]"
                  required
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-[10px] font-black uppercase tracking-wider text-[#8b8b95] px-1">
                Password
              </label>
              <div className="relative rounded-xl border border-white/[0.08] bg-[#0c0c0e] focus-within:border-[var(--pri)]/50 focus-within:ring-2 focus-within:ring-[var(--pri)]/10 transition-all duration-300 overflow-hidden">
                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter password"
                  className="w-full h-11 bg-transparent pl-10 pr-10 text-sm font-semibold text-white focus:outline-none focus:ring-0 placeholder:text-[#5f6068]"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-white transition-colors"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
          </div>

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
                Remember device
              </span>
            </button>
            <span className="text-[11px] font-bold text-[var(--pri)] hover:underline cursor-pointer">
              Forgot password?
            </span>
          </div>

          <Button
            type="submit"
            disabled={loading}
            className="w-full h-11 bg-[var(--pri)] hover:bg-[#e0ff00] text-black font-black uppercase tracking-wider text-[11px] rounded-2xl shadow-[0_15px_30px_rgba(224,255,0,0.12)] border-0 active:scale-[0.98] transition-all flex items-center justify-center gap-2"
          >
            {loading ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              <>
                Sign In <ChevronRight className="h-4 w-4" />
              </>
            )}
          </Button>

          <div className="relative flex py-1 items-center">
            <div className="flex-grow border-t border-white/[0.06]"></div>
            <span className="flex-shrink mx-3 text-[9px] font-black uppercase tracking-widest text-[#8b8b95]">
              Or Continue With
            </span>
            <div className="flex-grow border-t border-white/[0.06]"></div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              className="h-10 rounded-xl border border-white/[0.06] bg-[#0c0c0e] hover:bg-white/[0.02] flex items-center justify-center gap-2 text-xs font-bold text-white transition-all active:scale-95"
            >
              <svg className="h-4 w-4" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
              </svg>
              Google
            </button>
            <button
              type="button"
              className="h-10 rounded-xl border border-white/[0.06] bg-[#0c0c0e] hover:bg-white/[0.02] flex items-center justify-center gap-2 text-xs font-bold text-white transition-all active:scale-95"
            >
              <svg className="h-4 w-4" viewBox="0 0 23 23">
                <rect x="0" y="0" width="11" height="11" fill="#f25022" />
                <rect x="12" y="0" width="11" height="11" fill="#7fba00" />
                <rect x="0" y="12" width="11" height="11" fill="#00a4ef" />
                <rect x="12" y="12" width="11" height="11" fill="#ffb900" />
              </svg>
              Microsoft
            </button>
          </div>

          <div className="text-center text-xs font-bold text-[#8b8b95]">
            New to EventOS?{" "}
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                onToggleFlip?.(true);
              }}
              className="text-[var(--pri)] hover:underline font-bold"
            >
              Create account
            </button>
          </div>
        </form>
      ) : (
        <div className="space-y-4 text-center py-4">
          <div className="space-y-2">
            <h2 className="text-xl font-bold text-white tracking-tight">Security Check</h2>
            <p className="text-[11px] text-[var(--pri)] font-black uppercase tracking-widest flex items-center justify-center gap-2">
              <ShieldCheck className="h-4 w-4" /> Identity Validated
            </p>
          </div>
          <div className="flex justify-center">
            <div className="relative h-16 w-16 flex items-center justify-center">
              <div className="absolute inset-0 bg-[var(--pri)]/20 blur-xl rounded-full animate-pulse" />
              <Fingerprint className="h-10 w-10 text-[var(--pri)] relative z-10" />
            </div>
          </div>
          <div className="flex gap-2 justify-center">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div key={i} className="h-10 w-8 rounded-xl border border-white/[0.08] bg-[#0c0c0e] flex items-center justify-center">
                <div className="h-1 w-1 rounded-full bg-[var(--pri)] animate-pulse" />
              </div>
            ))}
          </div>
          <Button disabled className="w-full h-11 bg-white/5 border border-white/[0.08] text-[#8b8b95] font-black uppercase tracking-wider text-[11px] rounded-2xl flex items-center justify-center gap-2">
            Signing you in... <Loader2 className="h-4 w-4 animate-spin text-[var(--pri)]" />
          </Button>
        </div>
      )}
    </div>
  );
}

export function SignupWizardForm({ onToggleFlip }: { onToggleFlip?: (flip: boolean) => void }) {
  const router = useRouter();
  const [form, setForm] = useState(initialForm);
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const setAuth = useAuthStore((state) => state.setAuth);

  const submit = async () => {
    setLoading(true);
    try {
      const cleanFirstName = form.first_name.trim();
      const orgName = `${cleanFirstName}'s Organisation`;
      const tempSlug = `org-${cleanFirstName.toLowerCase().replace(/[^a-z0-9]/g, "") || "workspace"}-${Math.random().toString(36).substring(2, 7)}`;

      const result = await orgApi.signup({
        org_name: orgName,
        slug: tempSlug,
        first_name: cleanFirstName,
        last_name: form.last_name.trim(),
        email: form.email.trim(),
        password: form.password,
        country: "IN",
        timezone: "Asia/Kolkata",
      });

      setAuth(result.user, result.access_token);
      toast.success("Profile initialized. Starting workspace setup...");
      router.push("/onboarding");
    } catch (error: any) {
      toast.error(error.message || "Failed to establish profile.");
    } finally {
      setLoading(false);
    }
  };

  const isFormValid = form.first_name.trim() && form.last_name.trim() && form.email.includes("@") && form.password.length >= 8;

  return (
    <div className="space-y-4">
      <div className="flex flex-col space-y-1 text-center">
        <h2 className="text-xs font-black uppercase tracking-[0.3em] text-[var(--pri)]">
          Create account
        </h2>
        <p className="text-xl font-bold tracking-tight text-white">
          Set up your organizer profile
        </p>
      </div>

      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <label className="text-[10px] font-black uppercase tracking-wider text-[#8b8b95] px-1">First Name</label>
            <div className="relative rounded-xl border border-white/[0.08] bg-[#0c0c0e] focus-within:border-[var(--pri)]/50 focus-within:ring-2 focus-within:ring-[var(--pri)]/10 transition-all overflow-hidden">
              <input
                type="text"
                value={form.first_name}
                onChange={(e) => setForm({ ...form, first_name: e.target.value })}
                placeholder="John"
                className="w-full h-11 bg-transparent pl-4 pr-4 text-sm font-semibold text-white focus:outline-none focus:ring-0 placeholder:text-[#5f6068]"
                required
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <label className="text-[10px] font-black uppercase tracking-wider text-[#8b8b95] px-1">Last Name</label>
            <div className="relative rounded-xl border border-white/[0.08] bg-[#0c0c0e] focus-within:border-[var(--pri)]/50 focus-within:ring-2 focus-within:ring-[var(--pri)]/10 transition-all overflow-hidden">
              <input
                type="text"
                value={form.last_name}
                onChange={(e) => setForm({ ...form, last_name: e.target.value })}
                placeholder="Doe"
                className="w-full h-11 bg-transparent pl-4 pr-4 text-sm font-semibold text-white focus:outline-none focus:ring-0 placeholder:text-[#5f6068]"
                required
              />
            </div>
          </div>
        </div>

        <div className="space-y-1.5">
          <label className="text-[10px] font-black uppercase tracking-wider text-[#8b8b95] px-1">Work Email</label>
          <div className="relative rounded-xl border border-white/[0.08] bg-[#0c0c0e] focus-within:border-[var(--pri)]/50 focus-within:ring-2 focus-within:ring-[var(--pri)]/10 transition-all overflow-hidden">
            <Mail className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              placeholder="name@company.com"
              className="w-full h-11 bg-transparent pl-10 pr-4 text-sm font-semibold text-white focus:outline-none focus:ring-0 placeholder:text-[#5f6068]"
              required
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <label className="text-[10px] font-black uppercase tracking-wider text-[#8b8b95] px-1">Password</label>
          <div className="relative rounded-xl border border-white/[0.08] bg-[#0c0c0e] focus-within:border-[var(--pri)]/50 focus-within:ring-2 focus-within:ring-[var(--pri)]/10 transition-all overflow-hidden">
            <Lock className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
              type={showPassword ? "text" : "password"}
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              placeholder="At least 8 characters"
              className="w-full h-11 bg-transparent pl-10 pr-10 text-sm font-semibold text-white focus:outline-none focus:ring-0 placeholder:text-[#5f6068]"
              required
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-white transition-colors"
            >
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </div>
      </div>

      <Button
        onClick={submit}
        disabled={loading || !isFormValid}
        className="w-full h-11 bg-[var(--pri)] hover:bg-[#e0ff00] text-black font-black uppercase tracking-wider text-[11px] rounded-2xl shadow-[0_15px_30px_rgba(224,255,0,0.12)] border-0 active:scale-[0.98] transition-all flex items-center justify-center gap-2"
      >
        {loading ? (
          <Loader2 className="h-5 w-5 animate-spin" />
        ) : (
          <>
            Create Account <ChevronRight className="h-4 w-4" />
          </>
        )}
      </Button>

      <div className="relative flex py-1 items-center">
        <div className="flex-grow border-t border-white/[0.06]"></div>
        <span className="flex-shrink mx-3 text-[9px] font-black uppercase tracking-widest text-[#8b8b95]">
          Or Sign Up With
        </span>
        <div className="flex-grow border-t border-white/[0.06]"></div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <button
          type="button"
          className="h-10 rounded-xl border border-white/[0.06] bg-[#0c0c0e] hover:bg-white/[0.02] flex items-center justify-center gap-2 text-xs font-bold text-white transition-all active:scale-95"
        >
          <svg className="h-4 w-4" viewBox="0 0 24 24">
            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
          </svg>
          Google
        </button>
        <button
          type="button"
          className="h-10 rounded-xl border border-white/[0.06] bg-[#0c0c0e] hover:bg-white/[0.02] flex items-center justify-center gap-2 text-xs font-bold text-white transition-all active:scale-95"
        >
          <svg className="h-4 w-4" viewBox="0 0 23 23">
            <rect x="0" y="0" width="11" height="11" fill="#f25022" />
            <rect x="12" y="0" width="11" height="11" fill="#7fba00" />
            <rect x="0" y="12" width="11" height="11" fill="#00a4ef" />
            <rect x="12" y="12" width="11" height="11" fill="#ffb900" />
          </svg>
          Microsoft
        </button>
      </div>

      <div className="text-center text-xs font-bold text-[#8b8b95]">
        Already have an account?{" "}
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            onToggleFlip?.(false);
          }}
          className="text-[var(--pri)] hover:underline font-bold"
        >
          Sign in
        </button>
      </div>
    </div>
  );
}

export function UnifiedAuthContainer({ initialFlipped = false }: { initialFlipped?: boolean }) {
  const [isFlipped, setIsFlipped] = useState(initialFlipped);
  const router = useRouter();

  useEffect(() => {
    setIsFlipped(window.location.pathname === "/signup");
    const handlePopState = () => {
      setIsFlipped(window.location.pathname === "/signup");
    };
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  const handleToggle = (flip: boolean) => {
    setIsFlipped(flip);
    const path = flip ? "/signup" : "/login";
    window.history.pushState(null, "", path);
  };

  const bgUrl = bgImage.src;
  const logoUrl = logoImage.src;

  const features = [
    { name: "Registration Management ", icon: ClipboardList },
    { name: "Speaker Management", icon: User },
    { name: "Eposter & Files", icon: FileImage },
    { name: "Venue Operations", icon: Building2 },
    { name: "Analytics & Reporting", icon: BarChart3 },
  ];

  const eyebrow = isFlipped ? "Get Started" : "Welcome Back";
  const title = isFlipped ? "Create your EventOS account" : "Your all-in-one event management platform";
  const subtitle = isFlipped
    ? "Set up your profile to start building, planning, and managing your events today."
    : "Manage speakers, registrations, sessions, and analytics — everything you need to run a great event, in one place.";

  return (
    <div className="relative h-screen max-h-screen w-screen overflow-hidden font-sans bg-[#050505] text-[#f5f5f5]">
      <div
        className="absolute inset-0 z-0 bg-cover bg-center bg-no-repeat scale-105 transition-all duration-700"
        style={{ backgroundImage: `url(${bgUrl})` }}
      />

      <div className="relative z-10 h-full w-full grid lg:grid-cols-[1fr_560px] overflow-hidden">
        <div className="hidden lg:flex flex-col justify-between p-12 border-r border-white/[0.04] relative h-full overflow-hidden">
          <div className="my-auto relative max-w-xl">
            <motion.div
              key={isFlipped ? "signup-text" : "login-text"}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.4 }}
              className="bg-black/40 backdrop-blur-md rounded-2xl border border-white/10 px-8 py-7 space-y-4 shadow-[0_20px_60px_rgba(0,0,0,0.5)]"
            >
              <span className="text-xs font-black uppercase tracking-[0.25em] text-[var(--pri)]">
                {eyebrow}
              </span>
              <h1 className="text-5xl font-black tracking-tight leading-[1.05] text-white">
                {title}
              </h1>
              <p className="text-sm font-medium text-white/80 leading-relaxed">
                {subtitle}
              </p>
            </motion.div>
          </div>

          <div className="grid grid-cols-5 gap-3 w-full border-t border-white/10 pt-6 relative">
            {features.map((feat) => {
              const Icon = feat.icon;
              return (
                <div
                  key={feat.name}
                  className="flex flex-col items-center justify-center gap-2 bg-black/50 backdrop-blur-md p-3.5 rounded-2xl border border-white/10 shadow-[0_15px_30px_rgba(0,0,0,0.4)] text-center"
                >
                  <Icon className="h-7 w-7 text-[var(--pri)] filter drop-shadow-[0_0_8px_rgba(224,255,0,0.3)]" />
                  <span className="text-[9px] font-black uppercase tracking-wider text-white/95 leading-tight">
                    {feat.name}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        <div className="h-full flex flex-col items-center justify-center p-6 md:p-8 relative overflow-hidden">
          <div className="relative w-full max-w-[440px] perspective-1000">
            <motion.div
              animate={{
                rotateY: isFlipped ? 180 : 0,
                y: [-4, 4, -4],
              }}
              transition={{
                rotateY: { duration: 0.45, ease: [0.4, 0, 0.2, 1] },
                y: { duration: 6, repeat: Infinity, ease: "easeInOut" },
              }}
              className="relative w-full preserve-3d"
              style={{ height: isFlipped ? "560px" : "500px" }}
            >
              <motion.div
                animate={{
                  opacity: [0.5, 0.85, 0.5],
                  scale: [0.99, 1.02, 0.99],
                }}
                transition={{
                  duration: 3.5,
                  repeat: Infinity,
                  ease: "easeInOut",
                }}
                className="absolute -inset-1.5 rounded-[30px] bg-gradient-to-r from-[#e0ff00] via-[#6366f1] to-[#e0ff00] bg-[length:200%_200%] blur-xl opacity-75 animate-gradient-sweep"
              />

              <div
                className="absolute inset-0 rounded-[28px] border border-white/15 bg-[#0a0a0e]/95 backdrop-blur-2xl p-6 md:p-8 shadow-[0_25px_70px_rgba(0,0,0,0.85)] flex flex-col justify-between backface-hidden"
                style={{ pointerEvents: isFlipped ? "none" : "auto" }}
              >
                <div className="space-y-4 flex-1 flex flex-col justify-center">
                  <div className="flex justify-center mb-1">
                    <img
                      src={logoUrl}
                      alt="EventOS Logo"
                      className="h-20 w-auto object-contain filter drop-shadow-[0_4px_16px_rgba(0,0,0,0.5)]"
                    />
                  </div>
                  <LoginPageForm onToggleFlip={handleToggle} />
                </div>
              </div>

              <div
                className="absolute inset-0 rounded-[28px] border border-white/15 bg-[#0a0a0e]/95 backdrop-blur-2xl p-6 md:p-8 shadow-[0_25px_70px_rgba(0,0,0,0.85)] flex flex-col justify-between backface-hidden"
                style={{
                  transform: "rotateY(180deg)",
                  pointerEvents: isFlipped ? "auto" : "none",
                }}
              >
                <div className="space-y-4 flex-1 flex flex-col justify-center">
                  <div className="flex justify-center mb-1">
                    <img
                      src={logoUrl}
                      alt="EventOS Logo"
                      className="h-20 w-auto object-contain filter drop-shadow-[0_4px_16px_rgba(0,0,0,0.5)]"
                    />
                  </div>
                  <SignupWizardForm onToggleFlip={handleToggle} />
                </div>
              </div>
            </motion.div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function SignupWizard() {
  return <UnifiedAuthContainer initialFlipped={true} />;
}

export function AcceptInviteForm() {
  const router = useRouter();
  const search = useSearchParams();
  const token = search.get("token") || "";
  const setAuth = useAuthStore((state) => state.setAuth);
  const [form, setForm] = useState({ first_name: "", last_name: "", password: "", confirm_password: "" });
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    if (!token || form.password.length < 8 || form.password !== form.confirm_password) {
      toast.error("Check the invite link and password fields.");
      return;
    }
    setLoading(true);
    try {
      const result = await orgApi.acceptInvite({ token, first_name: form.first_name, last_name: form.last_name, password: form.password });
      setAuth(result.user, result.access_token);
      router.push("/dashboard");
    } catch (error: any) {
      toast.error(error.message || "Could not accept invitation.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="w-full max-w-lg bg-[#0a0a0e]/95 backdrop-blur-2xl rounded-[28px] p-8 border border-white/15 shadow-2xl">
        <div className="space-y-6">
          <h2 className="text-xl font-bold text-white">Accept Invitation</h2>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <input type="text" placeholder="First Name" className="w-full h-11 bg-transparent border border-white/10 rounded-xl px-4 text-sm" value={form.first_name} onChange={e => setForm({...form, first_name: e.target.value})} />
              <input type="text" placeholder="Last Name" className="w-full h-11 bg-transparent border border-white/10 rounded-xl px-4 text-sm" value={form.last_name} onChange={e => setForm({...form, last_name: e.target.value})} />
            </div>
            <input type="password" placeholder="Password" className="w-full h-11 bg-transparent border border-white/10 rounded-xl px-4 text-sm" value={form.password} onChange={e => setForm({...form, password: e.target.value})} />
            <input type="password" placeholder="Confirm Password" className="w-full h-11 bg-transparent border border-white/10 rounded-xl px-4 text-sm" value={form.confirm_password} onChange={e => setForm({...form, confirm_password: e.target.value})} />
            <Button onClick={submit} className="w-full h-11 bg-[var(--pri)] text-black font-black uppercase tracking-wider rounded-xl">
              {loading ? <Loader2 className="animate-spin" /> : "Accept"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
