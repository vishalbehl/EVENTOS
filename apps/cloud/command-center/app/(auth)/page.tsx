"use client";

import { FormEvent, useEffect, useId, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Activity, Check, ChevronRight, KeyRound, Loader2, Lock, Mail, ShieldCheck } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { authService } from "@/services/auth-service";
import { ApiError } from "@/lib/api-client";
import { useAuthStore } from "@/store/use-auth-store";

export default function AdminLoginPage() {
  const router = useRouter();
  const { isAuthenticated, accessToken, user, hasHydrated } = useAuthStore();
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mfaCode, setMfaCode] = useState("");
  const [rememberMe, setRememberMe] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [restored, setRestored] = useState(false);
  const emailId = useId();
  const passwordId = useId();
  const mfaId = useId();
  const rememberId = useId();

  useEffect(() => {
    if (!isAuthenticated || !accessToken || !user) return;
    const isAdmin = user.platform_role === "SUPER_ADMIN" || user.is_platform_admin || user.role === "super_admin";
    if (isAdmin) router.replace("/dashboard/overview");
  }, [isAuthenticated, accessToken, user, router]);

  useEffect(() => {
    if (!hasHydrated || restored || isAuthenticated) return;
    setRestored(true);
    void authService.restore().then((active) => {
      if (active) router.replace("/dashboard/overview");
    });
  }, [hasHydrated, restored, isAuthenticated, router]);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = window.setInterval(() => setCooldown((value) => Math.max(0, value - 1)), 1000);
    return () => window.clearInterval(timer);
  }, [cooldown]);

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
      if (error instanceof ApiError && error.status === 429) setCooldown(error.retryAfter || 900);
      toast.error(error instanceof Error ? error.message : "Authentication failed.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="relative min-h-svh overflow-x-hidden bg-[#050505] text-[#f4f4f5] selection:bg-white selection:text-black">
      <div aria-hidden className="pointer-events-none absolute inset-0 opacity-40 [background-image:linear-gradient(rgba(255,255,255,.025)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.025)_1px,transparent_1px)] [background-size:48px_48px]" />
      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/35 to-transparent" />

      <div className="relative mx-auto flex min-h-svh w-full max-w-[1440px] flex-col px-5 py-5 sm:px-8 sm:py-8 lg:px-12">
        <header className="flex items-center justify-between border-b border-white/[0.09] pb-5">
          <Image src="/logo.png" alt="eventos IT" width={185} height={49} priority className="w-[148px] sm:w-[168px]" style={{ height: "auto" }} />
          <div className="flex items-center gap-2.5 text-[11px] text-white/48">
            <span className="relative flex size-2">
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400 opacity-40 motion-reduce:animate-none" />
              <span className="relative inline-flex size-2 rounded-full bg-emerald-400" />
            </span>
            Identity service available
          </div>
        </header>

        <div className="grid flex-1 items-center gap-12 py-10 lg:grid-cols-[minmax(0,1fr)_440px] lg:gap-20 xl:gap-28">
          <motion.section
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: "easeOut" }}
            className="hidden max-w-2xl lg:block"
          >
            <div className="mb-10 flex items-center gap-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-white/42">
              <span className="h-px w-9 bg-white/30" /> Command center / Restricted access
            </div>
            <h1 className="max-w-xl text-[clamp(3rem,5.2vw,5.5rem)] font-semibold leading-[0.94] tracking-[-0.055em] text-white">
              Operate the platform with confidence.
            </h1>
            <p className="mt-7 max-w-lg text-base leading-7 text-white/48">
              Secure access to organization controls, revenue operations, infrastructure, identity, and support workflows.
            </p>

            <div className="mt-14 grid max-w-xl grid-cols-3 border-y border-white/[0.09] py-5">
              {[
                ["MFA", "Required"],
                ["Session", "Protected"],
                ["Activity", "Audited"],
              ].map(([label, value], index) => (
                <div key={label} className={index ? "border-l border-white/[0.09] pl-6" : ""}>
                  <p className="text-[10px] uppercase tracking-[0.16em] text-white/30">{label}</p>
                  <p className="mt-1.5 text-sm font-medium text-white/78">{value}</p>
                </div>
              ))}
            </div>
          </motion.section>

          <motion.section
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45, delay: 0.08, ease: "easeOut" }}
            className="w-full"
            aria-labelledby="login-title"
          >
            <div className="border border-white/[0.12] bg-[#0b0b0c]/95 shadow-[0_28px_80px_rgba(0,0,0,.42)]">
              <div className="flex items-center justify-between border-b border-white/[0.09] px-6 py-5 sm:px-8">
                <div className="flex items-center gap-3">
                  <span className="grid size-9 place-items-center border border-white/[0.12] bg-white/[0.045]">
                    <ShieldCheck aria-hidden className="size-4 text-white/80" />
                  </span>
                  <div>
                    <p className="text-xs font-semibold text-white/88">Privileged sign in</p>
                    <p className="mt-0.5 text-[10px] text-white/34">Super administrator</p>
                  </div>
                </div>
                <Activity aria-label="Identity service online" className="size-4 text-emerald-400" />
              </div>

              <div className="px-6 py-7 sm:px-8 sm:py-8">
                <h2 id="login-title" className="text-[28px] font-semibold tracking-[-0.035em] text-white">Verify your identity</h2>
                <p className="mt-2 text-sm leading-6 text-white/42">Enter your administrator credentials and current authenticator code.</p>

                <form onSubmit={handleLogin} className="mt-8 space-y-5" noValidate>
            <div className="space-y-2">
              <label htmlFor={emailId} className="text-[11px] font-medium text-white/66">
                Work email
              </label>
              <div className="relative border border-white/[0.12] bg-white/[0.025] transition-colors focus-within:border-white/40 focus-within:bg-white/[0.04]">
                <Mail aria-hidden className="absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-white/30" />
                <Input
                  id={emailId}
                  type="email"
                  autoComplete="username"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="admin@example.com"
                  className="h-12 rounded-none border-0 bg-transparent pl-11 text-[13px] font-medium text-white placeholder:text-white/22 focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-white/30"
                  required
                  disabled={loading}
                />
              </div>
            </div>

            <div className="space-y-2">
              <label htmlFor={passwordId} className="text-[11px] font-medium text-white/66">
                Password
              </label>
              <div className="relative border border-white/[0.12] bg-white/[0.025] transition-colors focus-within:border-white/40 focus-within:bg-white/[0.04]">
                <Lock aria-hidden className="absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-white/30" />
                <Input
                  id={passwordId}
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  className="h-12 rounded-none border-0 bg-transparent pl-11 text-[13px] font-medium text-white focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-white/30"
                  required
                  disabled={loading}
                />
              </div>
            </div>

            <div className="space-y-2">
              <label htmlFor={mfaId} className="text-[11px] font-medium text-white/66">
                Authenticator code
              </label>
              <div className="relative border border-white/[0.12] bg-white/[0.025] transition-colors focus-within:border-white/40 focus-within:bg-white/[0.04]">
                <KeyRound aria-hidden className="absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-white/30" />
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
                  placeholder="000000"
                  className="h-12 rounded-none border-0 bg-transparent pl-11 font-mono text-[13px] font-semibold tracking-[0.35em] text-white placeholder:tracking-[0.35em] placeholder:text-white/18 focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-white/30"
                  required
                  disabled={loading}
                />
              </div>
              <p id={`${mfaId}-help`} className="text-[10px] leading-4 text-white/32">
                Use the six-digit code from your registered authenticator.
              </p>
            </div>

            <div className="flex items-start gap-3 border-y border-white/[0.08] py-4">
              <input
                id={rememberId}
                type="checkbox"
                checked={rememberMe}
                onChange={(event) => setRememberMe(event.target.checked)}
                className="mt-0.5 size-4 rounded-none border-white/20 bg-white/5 accent-white"
                disabled={loading}
              />
              <div>
                <label htmlFor={rememberId} className="block text-[11px] font-medium text-white/70">Remember this device</label>
                <p className="mt-1 text-[10px] leading-4 text-white/32">Keep the secure session available for up to 30 days.</p>
              </div>
            </div>

            <Button
              type="submit"
              disabled={loading || cooldown > 0}
              className="group flex h-12 w-full items-center justify-center gap-2 rounded-none border border-white bg-white text-[11px] font-semibold text-black shadow-none transition-colors hover:bg-[#dedede] focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-[#0b0b0c]"
            >
              {loading ? <Loader2 aria-label="Verifying identity" className="size-4 animate-spin" /> : cooldown > 0 ? `Try again in ${Math.ceil(cooldown / 60)} min` : <>Continue to command center <ChevronRight aria-hidden className="size-4 transition-transform group-hover:translate-x-0.5" /></>}
            </Button>
                </form>
              </div>

              <div className="flex items-center gap-2 border-t border-white/[0.09] bg-white/[0.018] px-6 py-4 text-[10px] text-white/32 sm:px-8">
                <Check aria-hidden className="size-3.5 text-emerald-400" /> Credentials are encrypted in transit and access is audited.
              </div>
            </div>
          </motion.section>
        </div>

        <footer className="flex flex-col gap-3 border-t border-white/[0.09] pt-5 text-[10px] text-white/28 sm:flex-row sm:items-center sm:justify-between">
          <p>© 2026 eventos IT. Authorized personnel only.</p>
          <p>Security policy · Session monitoring enabled</p>
        </footer>
      </div>
    </main>
  );
}
