"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import {
  Box, ChevronRight, Eye, EyeOff, Loader2, Lock, Mail, Check,
  ClipboardList, FileImage, Building2, BarChart3, UserStar
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { orgApi } from "@/components/organizer/org/org-api";
import { useAuthStore } from "@/store/use-auth-store";
import { cn } from "@/lib/utils";
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

export function SignupWizard() {
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
    <PublicShell
      eyebrow="Account Setup"
      title="Create your EventOS profile"
      subtitle="Register your access credentials to deploy a high-telemetry conference console."
      sideImage={bgImage}
    >
      <div className="space-y-4">
        <div className="flex flex-col space-y-1">
          <h2 className="text-xs font-black uppercase tracking-[0.3em] text-[var(--pri)]">
            Create account
          </h2>
          <p className="text-xl font-bold tracking-tight text-white">
            Set up your organizer profile
          </p>
        </div>

        {/* Inputs */}
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
          className="w-full h-12 bg-[var(--pri)] hover:bg-[#e0ff00] text-black font-black uppercase tracking-wider text-[11px] rounded-2xl shadow-[0_15px_30px_rgba(224,255,0,0.12)] border-0 active:scale-[0.98] transition-all flex items-center justify-center gap-2"
        >
          {loading ? (
            <Loader2 className="h-5 w-5 animate-spin" />
          ) : (
            <>
              Create Account <ChevronRight className="h-4 w-4" />
            </>
          )}
        </Button>

        {/* Separator */}
        <div className="relative flex items-center">
          <div className="flex-grow border-t border-white/[0.06]"></div>
          <span className="flex-shrink mx-4 text-[9px] font-black uppercase tracking-widest text-[#8b8b95]">
            Or Sign Up With
          </span>
          <div className="flex-grow border-t border-white/[0.06]"></div>
        </div>

        {/* Social Options */}
        <div className="grid grid-cols-2 gap-3">
          <button
            type="button"
            className="h-10 rounded-xl border border-white/[0.06] bg-[#0c0c0e] hover:bg-white/[0.02] flex items-center justify-center gap-2 text-xs font-bold text-white transition-all active:scale-95"
          >
            <svg className="h-4 w-4" viewBox="0 0 24 24">
              <path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
              <path fill="currentColor" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
              <path fill="currentColor" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
              <path fill="currentColor" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
            </svg>
            Google
          </button>
          <button
            type="button"
            className="h-10 rounded-xl border border-white/[0.06] bg-[#0c0c0e] hover:bg-white/[0.02] flex items-center justify-center gap-2 text-xs font-bold text-white transition-all active:scale-95"
          >
            <svg className="h-4 w-4 text-[#00a4ef]" viewBox="0 0 23 23">
              <path fill="currentColor" d="M0 0h11v11H0zM12 0h11v11H12zM0 12h11v11H0zM12 12h11v11H12z" />
            </svg>
            Microsoft
          </button>
        </div>

        <div className="text-center text-xs font-bold text-[#8b8b95]">
          Already have an account?{" "}
          <Link href="/login" className="text-[var(--pri)] hover:underline">
            Sign in
          </Link>
        </div>
      </div>
    </PublicShell>
  );
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
    <PublicShell eyebrow="Team Invite" title="Join your EventOS workspace" subtitle="Finish your account to start collaborating with your conference team.">
      <div className="space-y-6">
        <div className="flex flex-col space-y-2">
          <h2 className="text-xs font-black uppercase tracking-[0.3em] text-[var(--pri)]">
            Setup account
          </h2>
          <p className="text-2xl font-bold tracking-tight text-white">
            Complete your profile invitation
          </p>
        </div>

        <div className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <label className="text-[10px] font-black uppercase tracking-wider text-[#8b8b95] px-1">First Name</label>
              <div className="relative rounded-2xl border border-white/[0.08] bg-[#0c0c0e] focus-within:border-[var(--pri)]/50 focus-within:ring-2 focus-within:ring-[var(--pri)]/10 transition-all overflow-hidden">
                <input
                  type="text"
                  value={form.first_name}
                  onChange={(e) => setForm({ ...form, first_name: e.target.value })}
                  placeholder="John"
                  className="w-full h-14 bg-transparent pl-5 pr-5 text-sm font-semibold text-white focus:outline-none focus:ring-0 placeholder:text-[#5f6068]"
                />
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-black uppercase tracking-wider text-[#8b8b95] px-1">Last Name</label>
              <div className="relative rounded-2xl border border-white/[0.08] bg-[#0c0c0e] focus-within:border-[var(--pri)]/50 focus-within:ring-2 focus-within:ring-[var(--pri)]/10 transition-all overflow-hidden">
                <input
                  type="text"
                  value={form.last_name}
                  onChange={(e) => setForm({ ...form, last_name: e.target.value })}
                  placeholder="Doe"
                  className="w-full h-14 bg-transparent pl-5 pr-5 text-sm font-semibold text-white focus:outline-none focus:ring-0 placeholder:text-[#5f6068]"
                />
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-[10px] font-black uppercase tracking-wider text-[#8b8b95] px-1">Password</label>
            <div className="relative rounded-2xl border border-white/[0.08] bg-[#0c0c0e] focus-within:border-[var(--pri)]/50 focus-within:ring-2 focus-within:ring-[var(--pri)]/10 transition-all overflow-hidden">
              <input
                type="password"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                placeholder="At least 8 characters"
                className="w-full h-14 bg-transparent pl-5 pr-5 text-sm font-semibold text-white focus:outline-none focus:ring-0 placeholder:text-[#5f6068]"
              />
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-[10px] font-black uppercase tracking-wider text-[#8b8b95] px-1">Confirm Password</label>
            <div className="relative rounded-2xl border border-white/[0.08] bg-[#0c0c0e] focus-within:border-[var(--pri)]/50 focus-within:ring-2 focus-within:ring-[var(--pri)]/10 transition-all overflow-hidden">
              <input
                type="password"
                value={form.confirm_password}
                onChange={(e) => setForm({ ...form, confirm_password: e.target.value })}
                placeholder="Repeat password"
                className="w-full h-14 bg-transparent pl-5 pr-5 text-sm font-semibold text-white focus:outline-none focus:ring-0 placeholder:text-[#5f6068]"
              />
            </div>
          </div>
        </div>

        <Button onClick={submit} disabled={loading} className="w-full h-14 bg-[var(--pri)] hover:bg-[#e0ff00] text-black font-black uppercase tracking-wider text-[11px] rounded-2xl shadow-[0_15px_30px_rgba(224,255,0,0.12)] border-0 active:scale-[0.98] transition-all flex items-center justify-center gap-2">
          {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : "Accept Invite"}
        </Button>
      </div>
    </PublicShell>
  );
}

export function PublicShell({
  eyebrow,
  title,
  subtitle,
  sideImage,
  children,
}: {
  eyebrow: string;
  title: string;
  subtitle: string;
  sideImage?: any;
  children: React.ReactNode;
}) {
  const features = [
    { name: "Registration Management ", icon: ClipboardList },
    { name: "Speaker Management", icon: UserStar },
    { name: "Eposter & Files", icon: FileImage },
    { name: "Venue Operations", icon: Building2 },
    { name: "Analytics & Reporting", icon: BarChart3 },
  ];

  const bgUrl = sideImage ? (typeof sideImage === "string" ? sideImage : sideImage.src) : bgImage.src;
  const logoUrl = logoImage.src;

  return (
    <div className="h-screen max-h-screen bg-[#050505] text-[#f5f5f5] grid lg:grid-cols-[1fr_560px] overflow-hidden font-sans">
      {/* Left Pane - Premium Showcase */}
      <div className="hidden lg:flex flex-col justify-between p-12 border-r border-white/[0.04] relative h-full overflow-hidden bg-[#09090b]">
        {/* Background Image behind text - Fully opaque and crisp */}
        <div
          className="absolute inset-0 z-0 bg-cover bg-center bg-no-repeat transition-all duration-700 hover:scale-105"
          style={{ backgroundImage: `url(${bgUrl})` }}
        />

        {/* Soft edge-vignette to blend background */}
        <div className="absolute inset-0 pointer-events-none z-0 bg-gradient-to-r from-transparent to-[#050505]/20" />



        {/* Center Mockup / Showcase - frosted glass card over image */}
        <div className="my-auto relative z-10 max-w-xl">
          <div className="bg-black/40 backdrop-blur-md rounded-2xl border border-white/10 px-8 py-7 space-y-4 shadow-[0_20px_60px_rgba(0,0,0,0.5)]">
            <span className="text-xs font-black uppercase tracking-[0.25em] text-[var(--pri)]">
              {eyebrow}
            </span>
            <h1 className="text-5xl font-black tracking-tight leading-[1.05] text-white">
              {title}
            </h1>
            <p className="text-sm font-medium text-white/80 leading-relaxed">
              {subtitle}
            </p>
          </div>
        </div>

        {/* Bottom Feature List - Single horizontal row of glass badges with large icons above text */}
        <div className="grid grid-cols-5 gap-3 w-full border-t border-white/10 pt-6 relative z-10">
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

      {/* Right Pane - Form Card — strictly h-screen, no scroll */}
      <div className="h-full flex flex-col items-center justify-center p-6 bg-[#050505] relative z-10 overflow-hidden">
        <div className="w-full max-w-[440px] flex flex-col gap-5">
          {/* Logo — centered, large */}
          <div className="flex justify-center">
            <img
              src={logoUrl}
              alt="EventOS Logo"
              className="h-28 w-auto object-contain filter drop-shadow-[0_4px_16px_rgba(0,0,0,0.5)]"
              onError={(e) => {
                e.currentTarget.style.display = "none";
              }}
            />
          </div>
          {children}
        </div>
      </div>
    </div>
  );
}
