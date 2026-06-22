"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  ShieldCheck, Lock, Mail, ChevronRight, Loader2,
  Cpu, Fingerprint, Globe, Zap
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { authService } from "@/services/auth-service";
import { useAuthStore } from "@/store/use-auth-store";
import { toast } from "sonner";

export default function AdminLoginPage() {
  const router = useRouter();
  const { isAuthenticated, accessToken, user, logout } = useAuthStore();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(false);

  // If already authenticated as admin, redirect to overview console
  useEffect(() => {
    if (isAuthenticated && accessToken && user) {
      const isAdmin = user.platform_role === "SUPER_ADMIN" || user.is_platform_admin || user.role === "super_admin";
      if (isAdmin) {
        router.push("/overview");
      }
    }
  }, [isAuthenticated, accessToken, user, router]);

  const handleLogin = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!email || !password) {
      toast.error("Credentials required.");
      return;
    }

    setLoading(true);
    try {
      const data = await authService.login({ email, password }, rememberMe);
      const isAdmin = data.user.platform_role === "SUPER_ADMIN" || data.user.is_platform_admin || data.user.role === "super_admin";
      
      if (!isAdmin) {
        toast.error("Access Denied: Administrator privileges required.");
        await authService.logout();
        return;
      }

      toast.success("Identity verified. Accessing Control Plane.");
      setStep(2);
      setTimeout(() => {
        router.push("/overview");
      }, 2000);
    } catch (error: any) {
      toast.error(error.message || "Authentication failed.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#07070a] flex items-center justify-center relative overflow-hidden px-6">
      {/* Background gradients themed with deep violet/purple */}
      <div className="absolute inset-0 z-0 overflow-hidden pointer-events-none">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,color-mix(in_srgb,var(--pri)_15%,transparent)_0%,transparent_60%)] animate-pulse" />
        <div className="absolute top-0 left-0 w-full h-full opacity-15">
          <div className="absolute top-1/4 left-1/4 w-[500px] h-[500px] bg-purple-600 rounded-full blur-[150px] animate-blob" />
          <div className="absolute top-3/4 right-1/4 w-[400px] h-[400px] bg-violet-800 rounded-full blur-[150px] animate-blob animation-delay-2000" />
        </div>
        <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-20 brightness-75 contrast-150" />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.8 }}
        className="w-full max-w-[440px] z-10"
      >
        <div className="rounded-[2.5rem] p-10 border border-purple-500/20 bg-[#0e0d16]/80 backdrop-blur-md shadow-[0_30px_60px_-15px_rgba(139,92,246,0.2)] relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-purple-500 via-violet-600 to-indigo-500" />
          
          <div className="relative z-10">
            {/* Header / Logo */}
            <div className="flex flex-col items-center mb-10">
              <div className="h-16 w-16 rounded-2xl bg-purple-500/10 border border-purple-500/30 flex items-center justify-center shadow-[0_10px_20px_rgba(139,92,246,0.15)] mb-4">
                <ShieldCheck className="h-8 w-8 text-purple-400 drop-shadow-[0_0_8px_rgba(139,92,246,0.5)]" />
              </div>
              <h1 className="text-2xl font-black tracking-tight text-white">
                Platform Control Plane
              </h1>
              <p className="text-[9px] font-black uppercase tracking-[0.25em] text-purple-400/60 mt-1">Super Admin Console</p>
            </div>

            <AnimatePresence mode="wait">
              {step === 1 ? (
                <motion.form
                  key="admin-login-form"
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 10 }}
                  onSubmit={handleLogin}
                  className="space-y-5"
                >
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <label className="text-[9px] font-black uppercase tracking-[0.2em] text-white/40 px-1">Admin Identity</label>
                      <div className="relative rounded-2xl border border-white/10 bg-white/3 overflow-hidden focus-within:border-purple-500/40 transition-colors">
                        <Mail className="absolute left-4 top-1/2 -translate-y-1/2 h-4.5 w-4.5 text-white/30" />
                        <Input
                          type="email"
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          placeholder="admin@eventos.com"
                          className="h-13 bg-transparent border-0 rounded-2xl pl-12 text-[13px] font-bold text-white focus-visible:ring-0 placeholder:text-white/20"
                          required
                        />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <label className="text-[9px] font-black uppercase tracking-[0.2em] text-white/40 px-1">Access Key</label>
                      <div className="relative rounded-2xl border border-white/10 bg-white/3 overflow-hidden focus-within:border-purple-500/40 transition-colors">
                        <Lock className="absolute left-4 top-1/2 -translate-y-1/2 h-4.5 w-4.5 text-white/30" />
                        <Input
                          type="password"
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          placeholder="••••••••••••"
                          className="h-13 bg-transparent border-0 rounded-2xl pl-12 text-[13px] font-bold text-white focus-visible:ring-0 placeholder:text-white/20"
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
                          "relative h-5 w-10 rounded-full transition-all duration-300 p-0.5 border border-white/10",
                          rememberMe ? "bg-purple-600/30 border-purple-500/40" : "bg-white/5"
                        )}
                      >
                        <motion.div
                          animate={{ x: rememberMe ? 20 : 0 }}
                          className="h-3.5 w-3.5 rounded-full bg-white shadow-md"
                        />
                      </button>
                      <span className="text-[9px] font-black uppercase tracking-widest text-white/40">Remember Session</span>
                    </div>
                  </div>

                  <div className="pt-3 space-y-3">
                    <Button
                      type="submit"
                      disabled={loading}
                      className="w-full h-13 bg-purple-600 hover:bg-purple-500 text-white font-black uppercase tracking-[0.2em] text-[11px] rounded-full shadow-[0_10px_20px_rgba(139,92,246,0.2)] border-0 active:scale-98 transition-all flex items-center justify-center gap-2"
                    >
                      {loading ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <>Initialize Session <ChevronRight className="h-4 w-4" /></>
                      )}
                    </Button>

                    <button
                      type="button"
                      onClick={() => {
                        setEmail("admin@eventos.com");
                        setPassword("admin123");
                      }}
                      className="w-full py-2 text-[9px] font-black uppercase tracking-[0.25em] text-purple-400/40 hover:text-purple-400 transition-colors border border-dashed border-purple-500/10 rounded-xl"
                    >
                      Control Plane Fast Login
                    </button>
                  </div>
                </motion.form>
              ) : (
                <motion.div
                  key="mfa-checkpoint"
                  initial={{ opacity: 0, x: 10 }}
                  animate={{ opacity: 1, x: 0 }}
                  className="space-y-6 text-center"
                >
                  <div className="space-y-1">
                    <h2 className="text-lg font-bold text-white tracking-tight">Security Checkpoint</h2>
                    <p className="text-[10px] text-purple-400 font-black uppercase tracking-widest flex items-center justify-center gap-1.5">
                      <ShieldCheck className="h-3.5 w-3.5" /> Identity Validated
                    </p>
                  </div>
                  <div className="flex justify-center py-2">
                    <div className="relative h-16 w-16 flex items-center justify-center">
                      <div className="absolute inset-0 bg-purple-500/20 blur-xl rounded-full animate-pulse" />
                      <Fingerprint className="h-10 w-10 text-purple-400 relative z-10" />
                    </div>
                  </div>
                  <div className="flex gap-2 justify-center">
                    {[1, 2, 3, 4, 5, 6].map(i => (
                      <div key={i} className="h-10 w-8 rounded-lg border border-purple-500/10 bg-purple-500/5 flex items-center justify-center">
                        <div className="h-1.5 w-1.5 rounded-full bg-purple-400 animate-pulse" />
                      </div>
                    ))}
                  </div>
                  <Button disabled className="w-full h-13 bg-white/5 text-white/30 font-black uppercase tracking-[0.2em] text-[11px] rounded-full border-0">
                    Synchronizing... <Loader2 className="ml-2 h-4 w-4 animate-spin" />
                  </Button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

        <div className="mt-8 flex items-center justify-between px-6 opacity-20 text-white">
          <div className="flex items-center gap-2 text-[9px] font-bold uppercase tracking-widest">
            <Cpu className="h-3.5 w-3.5" />
            <span>Secure Node</span>
          </div>
          <div className="flex items-center gap-2 text-[9px] font-bold uppercase tracking-widest">
            <Zap className="h-3.5 w-3.5" />
            <span>Ecosystem OK</span>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
