"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  ShieldCheck, Lock, Mail, ChevronRight, Loader2,
  Box, Fingerprint, Globe, Zap
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { authService } from "@/services/auth-service";
import { useAuthStore } from "@/store/use-auth-store";
import { toast } from "sonner";
import Link from "next/link";

export default function LoginPage() {
  const router = useRouter();
  const { isAuthenticated, accessToken } = useAuthStore();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(false);

  // If already authenticated, redirect directly to appropriate dashboard
  useEffect(() => {
    if (isAuthenticated && accessToken) {
      router.push("/dashboard");
    }
  }, [isAuthenticated, accessToken, router]);

  const handleLogin = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!email || !password) {
      toast.error("Security credentials required.");
      return;
    }

    setLoading(true);
    try {
      await authService.login({ email, password }, rememberMe);
      sessionStorage.setItem("session_active", "true");
      toast.success("Identity verified. Accessing EventOS ecosystem.");
      setStep(2);
      setTimeout(() => {
        router.push("/dashboard");
      }, 2000);
    } catch (error: any) {
      toast.error(error.message || "Authentication failed.");
    } finally {
      setLoading(false);
    }
  };

  if (isAuthenticated && accessToken) {
    return null; // Prevent showing login form while redirecting
  }

  return (
    <div className="min-h-screen bg-[var(--base)] flex items-center justify-center relative overflow-hidden px-6">
      {/* Optimized Background System */}
      <div className="absolute inset-0 z-0 overflow-hidden pointer-events-none">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,color-mix(in_srgb,var(--pri)_13%,transparent)_0%,transparent_50%)] animate-pulse" />
        <div className="absolute top-0 left-0 w-full h-full opacity-10">
          <div className="absolute top-1/4 left-1/4 w-[500px] h-[500px] bg-[var(--pri)] rounded-full blur-[150px] animate-blob" />
          <div className="absolute top-3/4 right-1/4 w-[400px] h-[400px] bg-[var(--sec)] rounded-full blur-[150px] animate-blob animation-delay-2000" />
        </div>

        {/* Static Grid for texture without recalculation overhead */}
        <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-20 brightness-100 contrast-150" />
      </div>

      {/* Login Card */}
      <motion.div
        initial={{ opacity: 0, y: 20, scale: 0.95, rotateX: 10 }}
        animate={{ opacity: 1, y: 0, scale: 1, rotateX: 0 }}
        transition={{ duration: 0.8, ease: [0.34, 1.56, 0.64, 1] }}
        className="w-full max-w-[440px] z-10 perspective-1000"
      >
        <div className="glass-3d rounded-[2.5rem] p-10 border-default shadow-[0_30px_60px_-15px_color-mix(in_srgb,var(--base)_50%,transparent)] relative overflow-hidden group">
          <div className="absolute inset-0 bg-gradient-to-br from-white/[0.05] to-transparent pointer-events-none" />

          <div className="relative z-10">
            {/* Logo with 3D Flip */}
            <motion.div
              initial={{ rotateY: 180 }}
              animate={{ rotateY: 0 }}
              transition={{ duration: 1, delay: 0.5, ease: "easeOut" }}
              className="flex flex-col items-center mb-10"
            >
              <div className="h-16 w-16 glass-3d rounded-2xl flex items-center justify-center border-[var(--pri)]/30 shadow-[0_10px_20px_color-mix(in_srgb,var(--pri)_20%,transparent)] mb-4 preserve-3d">
                <Box className="h-8 w-8 text-[var(--pri)] drop-shadow-[0_0_8px_color-mix(in_srgb,var(--pri)_50%,transparent)]" />
              </div>
              <h1 className="text-3xl font-black tracking-tighter text-[var(--text)] text-glow-indigo">
                Event<span className="text-[var(--sec)]">OS</span>
              </h1>
              <p className="text-[10px] font-black uppercase tracking-[0.4em] text-[var(--pri)]/60 mt-1">Enterprise Management</p>
              <Link href="/signup" className="mt-4 text-[10px] font-black uppercase tracking-[0.2em] text-[var(--sec)] hover:text-[var(--pri)] transition-colors">
                New organisation? Start free <ChevronRight className="inline h-3 w-3" />
              </Link>
            </motion.div>

            <AnimatePresence mode="wait">
              {step === 1 ? (
                <motion.form
                  key="login-form"
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 20 }}
                  onSubmit={handleLogin}
                  className="space-y-6"
                >
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <label className="text-[10px] font-black uppercase tracking-[0.2em] text-muted px-1">Identity Terminal</label>
                      <div className="relative neomorphic-inset rounded-2xl group/input transition-all duration-300 focus-within:border-glow-cyan overflow-hidden">
                        <Mail className="absolute left-4 top-1/2 -translate-y-1/2 h-4.5 w-4.5 text-muted group-focus-within/input:text-[var(--sec)] transition-colors z-10" />
                        <Input
                          type="email"
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          placeholder="admin@eventos.com"
                          className="h-14 bg-transparent border-0 rounded-2xl pl-12 text-[14px] font-bold text-[var(--text)] focus-visible:ring-0 placeholder:text-muted"
                          required
                          suppressHydrationWarning
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-black uppercase tracking-[0.2em] text-muted px-1">Access Key</label>
                      <div className="relative neomorphic-inset rounded-2xl group/input transition-all duration-300 focus-within:border-glow-cyan overflow-hidden">
                        <Lock className="absolute left-4 top-1/2 -translate-y-1/2 h-4.5 w-4.5 text-muted group-focus-within/input:text-[var(--sec)] transition-colors z-10" />
                        <Input
                          type="password"
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          placeholder="••••••••••••"
                          className="h-14 bg-transparent border-0 rounded-2xl pl-12 text-[14px] font-bold text-[var(--text)] focus-visible:ring-0 placeholder:text-muted"
                          required
                        />
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between px-1">
                    <div className="flex items-center gap-3">
                      <button
                        type="button"
                        onClick={() => setRememberMe(!rememberMe)}
                        className={cn(
                          "relative h-5 w-10 rounded-full transition-all duration-500 neomorphic-inset",
                          rememberMe ? "bg-[var(--pri)]/40 border-[var(--pri)]/30 shadow-[0_0_10px_color-mix(in_srgb,var(--pri)_30%,transparent)]" : "bg-[color-mix(in_srgb,var(--text)_5%,transparent)]"
                        )}
                      >
                        <motion.div
                          animate={{ x: rememberMe ? 22 : 2 }}
                          className="absolute top-1 left-0.5 h-3 w-3 rounded-full bg-[var(--text)] shadow-md"
                        />
                      </button>
                      <span className="text-[10px] font-black uppercase tracking-widest text-muted">Remember</span>
                    </div>
                    <span className="text-[10px] font-black uppercase tracking-widest text-[var(--pri)] hover:text-[var(--sec)] cursor-pointer transition-colors">Recovery</span>
                  </div>

                  <div className="pt-4 space-y-4">
                    <Button
                      type="submit"
                      disabled={loading}
                      className="w-full h-14 bg-[var(--pri)] hover:bg-[var(--sec)] text-[var(--text)] font-black uppercase tracking-[0.2em] text-[12px] rounded-full shadow-[0_15px_30px_color-mix(in_srgb,var(--pri)_30%,transparent)] border-0 active:scale-95 transition-all group/btn"
                    >
                      {loading ? (
                        <Loader2 className="h-5 w-5 animate-spin" />
                      ) : (
                        <>Initialize Shell <ChevronRight className="ml-2 h-4 w-4 group-hover/btn:translate-x-1 transition-transform" /></>
                      )}
                    </Button>
                  </div>
                </motion.form>
              ) : (
                <motion.div
                  key="mfa-form"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  className="space-y-8 text-center"
                >
                  <div className="space-y-2">
                    <h2 className="text-xl font-bold text-[var(--text)] tracking-tight">Security Check</h2>
                    <p className="text-[12px] text-[var(--sec)] font-black uppercase tracking-widest flex items-center justify-center gap-2">
                      <ShieldCheck className="h-4 w-4" /> Identity Validated
                    </p>
                  </div>
                  <div className="flex justify-center py-4">
                    <div className="relative h-20 w-20 flex items-center justify-center">
                      <div className="absolute inset-0 bg-[var(--sec)]/20 blur-2xl rounded-full animate-pulse" />
                      <Fingerprint className="h-12 w-12 text-[var(--sec)] relative z-10" />
                    </div>
                  </div>
                  <div className="flex gap-3 justify-center">
                    {[1, 2, 3, 4, 5, 6].map(i => (
                      <div key={i} className="h-12 w-10 rounded-xl neomorphic-inset flex items-center justify-center">
                        <div className="h-1.5 w-1.5 rounded-full bg-[var(--sec)] animate-pulse" />
                      </div>
                    ))}
                  </div>
                  <Button disabled className="w-full h-14 bg-[color-mix(in_srgb,var(--text)_5%,transparent)] text-muted font-black uppercase tracking-[0.2em] text-[12px] rounded-full border-0">
                    Synchronizing... <Loader2 className="ml-2 h-4 w-4 animate-spin" />
                  </Button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

        {/* Global Footer */}
        <div className="mt-12 flex items-center justify-between px-6 opacity-30">
          <div className="flex items-center gap-2 text-[10px] font-bold text-[var(--text)] uppercase tracking-widest cursor-pointer hover:text-[var(--pri)] transition-colors">
            <Globe className="h-3.5 w-3.5" />
            <span>Support</span>
          </div>
          <div className="flex items-center gap-2 text-[10px] font-bold text-[var(--text)] uppercase tracking-widest cursor-pointer hover:text-[var(--sec)] transition-colors">
            <Zap className="h-3.5 w-3.5" />
            <span>Status</span>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
