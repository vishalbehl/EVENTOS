"use client";

import { FormEvent, useEffect, useId, useState } from "react";
import { useRouter } from "next/navigation";
import { motion, useReducedMotion } from "framer-motion";
import { ChevronRight, KeyRound, Loader2, Lock, Mail, ShieldCheck } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { authService } from "@/services/auth-service";
import { useAuthStore } from "@/store/use-auth-store";

export default function AdminLoginPage() {
  const router = useRouter();
  const prefersReducedMotion = useReducedMotion();
  const { isAuthenticated, accessToken, user } = useAuthStore();
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mfaCode, setMfaCode] = useState("");
  const [rememberMe, setRememberMe] = useState(false);
  const emailId = useId();
  const passwordId = useId();
  const mfaId = useId();
  const rememberId = useId();

  useEffect(() => {
    if (!isAuthenticated || !accessToken || !user) return;
    const isAdmin = user.platform_role === "SUPER_ADMIN" || user.is_platform_admin || user.role === "super_admin";
    if (isAdmin) router.replace("/dashboard/overview");
  }, [isAuthenticated, accessToken, user, router]);

  const handleLogin = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!email.trim() || !password) {
      toast.error("Email and password are required.");
      return;
    }
    if (!/^\d{6}$/.test(mfaCode)) {
      toast.error("Enter the six-digit code from your authenticator app.");
      return;
    }

    setLoading(true);
    try {
      await authService.login(
        { email: email.trim(), password, mfa_code: mfaCode },
        rememberMe,
      );
      toast.success("Identity and MFA verified.");
      router.replace("/dashboard/overview");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Authentication failed.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#07070a] px-6">
      <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_45%,rgba(124,58,237,0.16)_0%,transparent_58%)]" />
        <div className="absolute left-1/4 top-1/4 h-[500px] w-[500px] rounded-full bg-purple-600/10 blur-[150px]" />
        <div className="absolute bottom-0 right-1/4 h-[400px] w-[400px] rounded-full bg-indigo-800/10 blur-[150px]" />
      </div>

      <motion.div
        initial={prefersReducedMotion ? false : { opacity: 0, y: 20, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: prefersReducedMotion ? 0 : 0.45 }}
        className="z-10 w-full max-w-[440px]"
      >
        <div className="relative overflow-hidden rounded-[2.5rem] border border-purple-500/20 bg-[#0e0d16]/90 p-8 shadow-[0_30px_60px_-15px_rgba(139,92,246,0.2)] backdrop-blur-md sm:p-10">
          <div aria-hidden className="absolute left-0 top-0 h-1 w-full bg-gradient-to-r from-purple-500 via-violet-600 to-indigo-500" />

          <div className="mb-8 flex flex-col items-center text-center">
            <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl border border-purple-500/30 bg-purple-500/10 shadow-[0_10px_20px_rgba(139,92,246,0.15)]">
              <ShieldCheck aria-hidden className="h-8 w-8 text-purple-400" />
            </div>
            <h1 className="text-2xl font-black tracking-tight text-white">Platform Control Plane</h1>
            <p className="mt-1 text-[9px] font-black uppercase tracking-[0.25em] text-purple-400/70">Super Admin Console</p>
          </div>

          <form onSubmit={handleLogin} className="space-y-4" noValidate>
            <div className="space-y-2">
              <label htmlFor={emailId} className="px-1 text-[9px] font-black uppercase tracking-[0.2em] text-white/50">
                Admin identity
              </label>
              <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03] transition-colors focus-within:border-purple-500/50">
                <Mail aria-hidden className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-white/35" />
                <Input
                  id={emailId}
                  type="email"
                  autoComplete="username"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="admin@example.com"
                  className="h-13 rounded-2xl border-0 bg-transparent pl-12 text-[13px] font-bold text-white placeholder:text-white/20 focus-visible:ring-0"
                  required
                  disabled={loading}
                />
              </div>
            </div>

            <div className="space-y-2">
              <label htmlFor={passwordId} className="px-1 text-[9px] font-black uppercase tracking-[0.2em] text-white/50">
                Password
              </label>
              <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03] transition-colors focus-within:border-purple-500/50">
                <Lock aria-hidden className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-white/35" />
                <Input
                  id={passwordId}
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  className="h-13 rounded-2xl border-0 bg-transparent pl-12 text-[13px] font-bold text-white focus-visible:ring-0"
                  required
                  disabled={loading}
                />
              </div>
            </div>

            <div className="space-y-2">
              <label htmlFor={mfaId} className="px-1 text-[9px] font-black uppercase tracking-[0.2em] text-white/50">
                Authenticator code
              </label>
              <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03] transition-colors focus-within:border-purple-500/50">
                <KeyRound aria-hidden className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-white/35" />
                <Input
                  id={mfaId}
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  pattern="[0-9]{6}"
                  maxLength={6}
                  value={mfaCode}
                  onChange={(event) => setMfaCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
                  aria-describedby={`${mfaId}-help`}
                  className="h-13 rounded-2xl border-0 bg-transparent pl-12 font-mono text-[13px] font-bold tracking-[0.35em] text-white focus-visible:ring-0"
                  required
                  disabled={loading}
                />
              </div>
              <p id={`${mfaId}-help`} className="px-1 text-[10px] leading-4 text-white/40">
                Privileged accounts require a current six-digit TOTP code.
              </p>
            </div>

            <div className="flex items-center gap-2 px-1 py-1">
              <input
                id={rememberId}
                type="checkbox"
                checked={rememberMe}
                onChange={(event) => setRememberMe(event.target.checked)}
                className="h-4 w-4 rounded border-white/20 bg-white/5 accent-purple-600"
                disabled={loading}
              />
              <label htmlFor={rememberId} className="text-[10px] font-bold text-white/50">
                Keep this privileged session after closing the tab
              </label>
            </div>

            <Button
              type="submit"
              disabled={loading}
              className="mt-2 flex h-13 w-full items-center justify-center gap-2 rounded-full border-0 bg-purple-600 text-[11px] font-black uppercase tracking-[0.2em] text-white shadow-[0_10px_20px_rgba(139,92,246,0.2)] hover:bg-purple-500"
            >
              {loading ? <Loader2 aria-label="Verifying identity" className="h-4 w-4 animate-spin" /> : <>Verify and continue <ChevronRight aria-hidden className="h-4 w-4" /></>}
            </Button>
          </form>
        </div>

        <p className="mt-6 text-center text-[9px] font-bold uppercase tracking-[0.2em] text-white/25">
          Password and MFA verification required
        </p>
      </motion.div>
    </main>
  );
}
