"use client";

import { FormEvent, useEffect, useId, useRef, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import {
  ArrowRight, BarChart3, Check, Eye, EyeOff,
  KeyRound, Layers3, Loader2, Lock, Mail, ScanLine, ShieldCheck, UserRound,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { authService } from "@/services/auth-service";
import { ApiError } from "@/lib/api-client";
import { useAuthStore } from "@/store/use-auth-store";

const capabilities = [
  { icon: ShieldCheck, title: "Enterprise security", text: "Advanced protection with zero-trust architecture." },
  { icon: Layers3, title: "Unified management", text: "Manage every organization from one secure command center." },
  { icon: BarChart3, title: "Operational intelligence", text: "Real-time visibility and actionable platform insights." },
  { icon: UserRound, title: "Role-based access", text: "Granular permissions and audit-ready access controls." },
];

function BrandLockup({ compact = false }: { compact?: boolean }) {
  return (
    <div className="flex items-center gap-3" aria-label="Eventos">
      <span className={compact ? "grid size-9 place-items-center overflow-visible" : "grid size-10 place-items-center overflow-visible"}>
        <Image src="/brand/eventos-emblem-metal.png" alt="" width={compact ? 42 : 48} height={compact ? 42 : 48} className="size-full scale-[2.15] object-contain" priority />
      </span>
      <span className={`${compact ? "text-lg" : "text-xl"} font-semibold uppercase tracking-[0.32em] text-white`}>Eventos</span>
    </div>
  );
}

export default function AdminLoginPage() {
  const router = useRouter();
  const { isAuthenticated, accessToken, user, hasHydrated } = useAuthStore();
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [authStep, setAuthStep] = useState<"credentials" | "mfa">("credentials");
  const [mfaCode, setMfaCode] = useState("");
  const [rememberMe, setRememberMe] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [restored, setRestored] = useState(false);
  const mfaRef = useRef<HTMLInputElement>(null);
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
    if (!email.trim() || !password) return void toast.error("Email and password are required.");
    if (authStep === "credentials") {
      setAuthStep("mfa");
      window.setTimeout(() => mfaRef.current?.focus(), 120);
      return;
    }
    if (!/^\d{6}$/.test(mfaCode)) return void toast.error("Enter the six-digit code from your authenticator app.");
    setLoading(true);
    try {
      await authService.login({ email: email.trim(), password, mfa_code: mfaCode }, rememberMe);
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
    <main className="relative h-svh overflow-hidden bg-black text-[#f4f4f5] selection:bg-white selection:text-black">
      <div aria-hidden className="pointer-events-none absolute inset-0 opacity-50 [background-image:radial-gradient(circle_at_50%_45%,rgba(255,255,255,.055),transparent_31%),linear-gradient(rgba(255,255,255,.018)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.018)_1px,transparent_1px)] [background-size:auto,40px_40px,40px_40px]" />
      <div aria-hidden className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_35%,#000_82%)]" />

      <div className="login-canvas relative mx-auto flex h-full min-h-0 w-full max-w-[2200px] flex-col px-5 py-4 sm:px-8 lg:px-10 xl:px-12 2xl:px-16 [@media(max-height:760px)]:py-2">
        <header className="login-header z-50 flex min-h-16 shrink-0 items-center justify-between gap-4 rounded-[22px] border border-white/10 bg-[#080808]/90 px-5 py-3 shadow-[0_16px_45px_rgba(0,0,0,.42),inset_0_1px_0_rgba(255,255,255,.035)] backdrop-blur-xl [@media(max-height:760px)]:min-h-12 [@media(max-height:760px)]:py-2">
          <BrandLockup />
          <div className="flex shrink-0 items-center gap-3 rounded-full border border-white/10 bg-white/[0.018] px-4 py-2.5 text-[10px] text-white/72 sm:px-5 sm:text-[11px]">
            <span className="relative flex size-2"><span className="absolute size-full animate-ping rounded-full bg-white/40 motion-reduce:animate-none" /><span className="relative size-2 rounded-full bg-white" /></span>
            Identity service available
          </div>
        </header>

        <div className="login-stage grid flex-1 items-center gap-8 py-8 lg:min-h-0 lg:grid-cols-[minmax(0,1fr)_minmax(400px,460px)] xl:gap-16 [@media(max-height:900px)]:py-4">
          <motion.section initial={{ opacity: 0, x: -14 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: .55 }} className="hidden min-w-0 lg:block">
            <div className="grid grid-cols-[minmax(315px,.72fr)_minmax(320px,1fr)] items-center gap-3">
              <div className="relative z-10">
                <div className="mb-7 flex items-center gap-4 text-[10px] font-semibold uppercase tracking-[0.28em] text-white/74 [@media(max-height:900px)]:mb-4"><ScanLine className="size-5" /> Command center / Restricted access</div>
                <h1 className="font-mono text-[clamp(3.1rem,4vw,4.5rem)] font-medium leading-[.96] tracking-[-.07em] text-white [@media(max-height:900px)]:text-[3.35rem]">Precision.<br />Control.<br /><span className="text-white/76">Excellence.</span></h1>
                <div className="mt-7 h-px max-w-sm bg-gradient-to-r from-white via-white/35 to-transparent [@media(max-height:900px)]:mt-4" />
                <p className="mt-5 max-w-sm text-sm leading-7 text-white/52 [@media(max-height:900px)]:mt-3 [@media(max-height:900px)]:text-xs [@media(max-height:900px)]:leading-5">The centralized hub for managing organizations, infrastructure, subscriptions, and critical platform operations.</p>
              </div>

              <div className="relative aspect-square w-full max-h-[470px] max-w-[470px] place-self-center [@media(max-height:900px)]:max-h-[350px] [@media(max-height:900px)]:max-w-[350px]">
                <div aria-hidden className="absolute inset-[7%] rounded-full border border-white/10 [background-image:repeating-radial-gradient(circle,transparent_0_42px,rgba(255,255,255,.08)_43px_44px),linear-gradient(rgba(255,255,255,.055)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.055)_1px,transparent_1px)] [background-size:auto,38px_38px,38px_38px]" />
                <div aria-hidden className="absolute inset-[17%] animate-[spin_40s_linear_infinite] rounded-full border border-dashed border-white/20 motion-reduce:animate-none" />
                <div aria-hidden className="absolute left-1/2 top-[8%] h-[84%] w-px bg-gradient-to-b from-transparent via-white/28 to-transparent" />
                <div aria-hidden className="absolute left-[8%] top-1/2 h-px w-[84%] bg-gradient-to-r from-transparent via-white/28 to-transparent" />
                <div className="absolute inset-[21%] rounded-full bg-white/[0.025] shadow-[0_0_90px_rgba(255,255,255,.09)]" />
                <Image src="/brand/eventos-emblem-metal.png" alt="Eventos command center emblem" fill priority unoptimized sizes="(min-width: 1280px) 430px, 340px" className="z-20 scale-[1.7] object-contain p-[15%] drop-shadow-[0_28px_24px_rgba(0,0,0,.8)]" />
                {["left-[13%] top-1/2", "right-[14%] top-1/2", "left-1/2 top-[13%]", "bottom-[14%] left-1/2"].map((position) => <span key={position} aria-hidden className={`absolute ${position} size-1.5 rounded-full border border-black bg-white shadow-[0_0_8px_white]`} />)}
              </div>
            </div>

            <div className="mt-9 grid grid-cols-4 gap-3 [@media(max-height:900px)]:mt-5">
              {capabilities.map(({ icon: Icon, title, text }, index) => (
                <motion.article key={title} initial={{ opacity: 0, y: 12, scale: .98 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ delay: .15 + index * .06, duration: .42 }} className="group relative min-h-[190px] overflow-hidden rounded-[26px] border border-white/12 bg-gradient-to-b from-white/[0.055] to-white/[0.012] px-4 py-5 text-center shadow-[0_18px_50px_rgba(0,0,0,.35),inset_0_1px_0_rgba(255,255,255,.04)] transition-[transform,border-color,background-color] duration-300 hover:-translate-y-1 hover:border-white/28 hover:bg-white/[0.055] [@media(max-height:900px)]:min-h-[142px] [@media(max-height:900px)]:rounded-[20px] [@media(max-height:900px)]:py-3">
                  <span aria-hidden className="absolute inset-x-7 top-0 h-px bg-gradient-to-r from-transparent via-white/60 to-transparent opacity-0 transition-opacity group-hover:opacity-100" />
                  <span className="relative mx-auto grid size-16 place-items-center rounded-[22px] border border-white/14 bg-white/[0.055] shadow-[0_12px_32px_rgba(0,0,0,.45),inset_0_1px_0_rgba(255,255,255,.07)] transition-transform duration-300 group-hover:scale-105 [@media(max-height:900px)]:size-11 [@media(max-height:900px)]:rounded-[15px]"><span aria-hidden className="absolute inset-2 rounded-xl border border-white/[0.06]" /><Icon className="relative size-7 text-white/88 [@media(max-height:900px)]:size-5" /></span>
                  <h2 className="mt-4 text-xs font-semibold text-white/92 [@media(max-height:900px)]:mt-2 [@media(max-height:900px)]:text-[10px]">{title}</h2>
                  <p className="mt-2 text-[11px] leading-5 text-white/48 [@media(max-height:900px)]:text-[9px] [@media(max-height:900px)]:leading-4">{text}</p>
                </motion.article>
              ))}
            </div>
          </motion.section>

          <motion.section initial={{ opacity: 0, y: 18, scale: .985 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ duration: .55, delay: .08, ease: [0.2, 0.8, 0.2, 1] }} aria-labelledby="login-title" className="login-panel relative mx-auto w-full max-w-[460px]">
            <div aria-hidden className="pointer-events-none absolute -inset-8 rounded-[52px] bg-[radial-gradient(ellipse_at_center,rgba(255,255,255,.14),rgba(255,255,255,.035)_40%,transparent_72%)] blur-2xl" />
            <div aria-hidden className="pointer-events-none absolute -inset-px rounded-[35px] bg-gradient-to-b from-white/38 via-white/10 to-white/22 opacity-80" />
            <div className="login-card relative overflow-hidden rounded-[34px] border border-white/14 bg-[#09090a]/95 shadow-[0_32px_90px_rgba(0,0,0,.72),0_0_45px_rgba(255,255,255,.055),inset_0_1px_0_rgba(255,255,255,.055)] backdrop-blur-2xl">
              <div aria-hidden className="pointer-events-none absolute inset-x-10 top-0 h-px bg-gradient-to-r from-transparent via-white/80 to-transparent" />
              <div className="login-card-content relative flex flex-col px-7 py-7 sm:px-8 [@media(max-height:900px)]:py-5 [@media(max-height:700px)]:py-3">
                <div aria-hidden className="absolute right-5 top-5 grid grid-cols-8 gap-2 opacity-25">{Array.from({ length: 32 }).map((_, index) => <i key={index} className="size-px rounded-full bg-white" />)}</div>
                <div className="relative flex justify-center border-b border-white/10 pb-5 [@media(max-height:900px)]:pb-3"><BrandLockup compact /></div>
                <div className="pt-4 text-center [@media(max-height:900px)]:pt-3">
                  <p className="text-[10px] font-semibold uppercase tracking-[.35em] text-white/64">{authStep === "credentials" ? "Welcome back" : "Identity verification"}</p>
                  <h2 id="login-title" className="mt-2 text-2xl font-semibold tracking-[-.035em] text-white [@media(max-height:900px)]:text-xl">{authStep === "credentials" ? "Command Center Access" : "Enter authenticator code"}</h2>
                  <div className="mx-auto mt-4 flex items-center gap-3 [@media(max-height:900px)]:mt-3"><span className="h-px flex-1 bg-white/10" /><span className="size-0 border-x-[5px] border-t-[6px] border-x-transparent border-t-white/70" /><span className="h-px flex-1 bg-white/10" /></div>
                </div>

                <form onSubmit={handleLogin} className="mt-5 flex flex-col space-y-3.5 [@media(max-height:900px)]:mt-3 [@media(max-height:900px)]:space-y-2.5" noValidate>
                  {authStep === "credentials" ? (
                    <motion.div key="credentials" initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} className="space-y-3.5 [@media(max-height:900px)]:space-y-2.5">
                      <label htmlFor={emailId} className="block text-[10px] font-semibold uppercase text-white/72">Work email</label>
                      <div className="relative -mt-2 overflow-hidden rounded-xl border border-white/14 bg-white/[0.025] transition-[border-color,box-shadow,background-color] duration-200 focus-within:border-white/48 focus-within:bg-white/[0.04] focus-within:shadow-[0_0_0_4px_rgba(255,255,255,.055)]"><Mail className="absolute left-4 top-1/2 size-4 -translate-y-1/2 text-white/62" /><Input id={emailId} type="email" autoComplete="username" autoFocus value={email} onChange={(event) => setEmail(event.target.value)} placeholder="administrator@eventos.com" className="h-11 rounded-xl border-0 bg-transparent pl-12 text-xs font-medium text-white placeholder:text-white/42 focus-visible:ring-0 [@media(max-height:900px)]:h-10" required disabled={loading} /></div>
                      <label htmlFor={passwordId} className="block text-[10px] font-semibold uppercase text-white/72">Password</label>
                      <div className="relative -mt-2 overflow-hidden rounded-xl border border-white/14 bg-white/[0.025] transition-[border-color,box-shadow,background-color] duration-200 focus-within:border-white/48 focus-within:bg-white/[0.04] focus-within:shadow-[0_0_0_4px_rgba(255,255,255,.055)]"><Lock className="absolute left-4 top-1/2 size-4 -translate-y-1/2 text-white/62" /><Input id={passwordId} type={showPassword ? "text" : "password"} autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} className="h-11 rounded-xl border-0 bg-transparent px-12 text-xs font-medium text-white focus-visible:ring-0 [@media(max-height:900px)]:h-10" required disabled={loading} /><button type="button" onClick={() => setShowPassword((value) => !value)} className="absolute right-3 top-1/2 grid size-8 -translate-y-1/2 place-items-center rounded-lg text-white/55 transition-colors hover:bg-white/[0.06] hover:text-white" aria-label={showPassword ? "Hide password" : "Show password"}>{showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}</button></div>
                      <div className="flex items-start justify-between gap-4 py-1"><label htmlFor={rememberId} className="flex cursor-pointer items-start gap-3"><input id={rememberId} type="checkbox" checked={rememberMe} onChange={(event) => setRememberMe(event.target.checked)} className="mt-0.5 size-4 rounded border-white/30 bg-black accent-white" /><span><span className="block text-[11px] text-white/82">Remember this device</span><span className="mt-1 block text-[10px] text-white/38">Secure session for 30 days</span></span></label><span className="text-[10px] text-white/42">MFA protected</span></div>
                      <Button type="submit" className="group flex h-12 w-full items-center justify-between rounded-2xl border border-white bg-white py-1 pl-5 pr-1 text-xs font-semibold uppercase tracking-[.04em] text-black shadow-[0_12px_30px_rgba(255,255,255,.08)] hover:bg-[#e7e7e7] active:scale-[.985] [@media(max-height:900px)]:h-11"><span className="flex items-center gap-2.5"><Lock className="size-4" /> Continue securely</span><span className="grid size-10 place-items-center rounded-xl bg-black text-white"><ArrowRight className="size-4 transition-transform group-hover:translate-x-1" /></span></Button>
                      <div className="flex items-center gap-3 py-1"><span className="h-px flex-1 bg-white/12" /><span className="text-[9px] uppercase tracking-[.18em] text-white/35">Alternative access</span><span className="h-px flex-1 bg-white/12" /></div>
                      <div className="grid grid-cols-2 gap-3"><button type="button" disabled title="SSO is not configured" className="flex h-10 items-center justify-center gap-2 rounded-xl border border-white/12 bg-white/[0.018] text-[11px] text-white/38"><UserRound className="size-4" /> SSO login</button><button type="button" disabled title="Hardware-key login is not configured" className="flex h-10 items-center justify-center gap-2 rounded-xl border border-white/12 bg-white/[0.018] text-[11px] text-white/38"><KeyRound className="size-4" /> Hardware key</button></div>
                    </motion.div>
                  ) : (
                    <motion.div key="mfa" initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} className="space-y-4">
                      <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.025] p-3"><span className="grid size-10 place-items-center rounded-xl bg-white/[0.055]"><Mail className="size-4" /></span><div className="min-w-0"><p className="text-[9px] uppercase tracking-[.16em] text-white/35">Verifying account</p><p className="mt-1 truncate text-xs font-medium text-white/80">{email.trim()}</p></div></div>
                      <p className="text-xs leading-5 text-white/48">Enter the six-digit code generated by your registered authenticator app.</p>
                      <label htmlFor={mfaId} className="block text-[10px] font-semibold uppercase text-white/72">Authenticator code</label>
                      <div className="relative -mt-2 grid grid-cols-6 gap-2" onClick={() => mfaRef.current?.focus()}><input ref={mfaRef} id={mfaId} aria-label="Six-digit authenticator code" className="absolute inset-0 z-10 cursor-text opacity-0" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} value={mfaCode} onChange={(event) => setMfaCode(event.target.value.replace(/\D/g, "").slice(0, 6))} required disabled={loading} />{Array.from({ length: 6 }).map((_, index) => <span key={index} aria-hidden className={`grid h-14 place-items-center rounded-xl border bg-white/[0.025] font-mono text-base transition-[border-color,box-shadow,background-color] [@media(max-height:900px)]:h-11 ${index === mfaCode.length ? "border-white/60 bg-white/[0.05] shadow-[0_0_0_4px_rgba(255,255,255,.055)]" : "border-white/14"}`}>{mfaCode[index] ? "•" : ""}</span>)}</div>
                      <Button type="submit" disabled={loading || cooldown > 0} className="group flex h-12 w-full items-center justify-between rounded-2xl border border-white bg-white py-1 pl-5 pr-1 text-xs font-semibold uppercase tracking-[.04em] text-black hover:bg-[#e7e7e7] active:scale-[.985]"><span className="flex flex-1 items-center justify-center gap-2.5">{loading ? <Loader2 className="size-4 animate-spin" /> : cooldown > 0 ? `Try again in ${Math.ceil(cooldown / 60)} min` : <><ShieldCheck className="size-4" /> Verify and continue</>}</span>{!loading && cooldown <= 0 && <span className="grid size-10 place-items-center rounded-xl bg-black text-white"><ArrowRight className="size-4 transition-transform group-hover:translate-x-1" /></span>}</Button>
                      <button type="button" disabled={loading} onClick={() => { setAuthStep("credentials"); setMfaCode(""); }} className="mx-auto block rounded-lg px-3 py-2 text-[11px] font-medium text-white/48 transition-colors hover:bg-white/[0.04] hover:text-white">← Back to credentials</button>
                    </motion.div>
                  )}

                </form>
              </div>
            </div>
          </motion.section>
        </div>

        <footer className="login-footer relative z-10 mt-auto flex min-h-10 shrink-0 items-center justify-center gap-4 rounded-2xl border border-white/[0.08] bg-[#080808]/80 px-5 py-2 text-[9px] text-white/42 shadow-[0_-10px_35px_rgba(0,0,0,.32),inset_0_1px_0_rgba(255,255,255,.025)] backdrop-blur-xl sm:justify-between [@media(max-height:700px)]:min-h-8 [@media(max-height:700px)]:py-1"><p className="flex items-center gap-2"><Lock className="size-3" /> © 2026 Eventos IT. All rights reserved.</p><p className="hidden text-right sm:block">Security policy <span className="mx-3 text-white/16">|</span> Session monitoring enabled <Check className="ml-2 inline size-3" /></p></footer>
      </div>

      <style jsx>{`
        /* Zooming out creates a much wider CSS viewport. Grow the composition
           at those widths so it does not collapse into a tiny center island. */
        @media (min-width: 2200px) {
          .login-canvas {
            max-width: min(92vw, 2920px);
            padding-inline: clamp(64px, 4vw, 120px);
          }

          .login-stage {
            grid-template-columns: minmax(0, 1fr) clamp(480px, 18vw, 560px);
            gap: clamp(72px, 5vw, 160px);
          }

          .login-panel {
            max-width: clamp(480px, 18vw, 560px);
          }

          .login-header {
            min-height: 76px;
            padding-inline: 28px;
          }

          .login-footer {
            min-height: 54px;
            padding-inline: 24px;
            font-size: 10px;
          }

        }

        @media (min-width: 3400px) {
          .login-canvas {
            max-width: 88vw;
          }

          .login-stage {
            grid-template-columns: minmax(0, 1fr) clamp(540px, 16vw, 620px);
          }

          .login-panel {
            max-width: clamp(540px, 16vw, 620px);
          }

          .login-header {
            min-height: 88px;
            padding-inline: 36px;
          }

          .login-footer {
            min-height: 64px;
            padding-inline: 32px;
            font-size: 12px;
          }

        }
      `}</style>
    </main>
  );
}
