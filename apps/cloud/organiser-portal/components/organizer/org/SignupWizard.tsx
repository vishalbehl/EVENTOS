"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Box, Check, ChevronRight, Eye, EyeOff, Loader2, Lock, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { countries, orgApi, slugify, timezones } from "@/components/organizer/org/org-api";
import { useAuthStore } from "@/store/use-auth-store";
import { cn } from "@/lib/utils";

type SignupForm = {
  org_name: string;
  slug: string;
  country: string;
  timezone: string;
  first_name: string;
  last_name: string;
  email: string;
  password: string;
  confirm_password: string;
};

const initialForm: SignupForm = {
  org_name: "",
  slug: "",
  country: "IN",
  timezone: "Asia/Kolkata",
  first_name: "",
  last_name: "",
  email: "",
  password: "",
  confirm_password: "",
};

export function SignupWizard() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [form, setForm] = useState(initialForm);
  const [slugAvailable, setSlugAvailable] = useState<boolean | null>(null);
  const [checkingSlug, setCheckingSlug] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const setAuth = useAuthStore((state) => state.setAuth);

  useEffect(() => {
    if (!form.slug || form.slug.length < 3) {
      setSlugAvailable(null);
      return;
    }
    const timer = window.setTimeout(async () => {
      setCheckingSlug(true);
      try {
        const result = await orgApi.checkSlug(form.slug);
        setSlugAvailable(result.available);
      } catch {
        setSlugAvailable(false);
      } finally {
        setCheckingSlug(false);
      }
    }, 500);
    return () => window.clearTimeout(timer);
  }, [form.slug]);

  const update = (key: keyof SignupForm, value: string) => {
    setForm((prev) => {
      const next = { ...prev, [key]: value };
      if (key === "org_name" && (!prev.slug || prev.slug === slugify(prev.org_name))) {
        next.slug = slugify(value);
      }
      if (key === "slug") next.slug = slugify(value);
      return next;
    });
  };

  const canContinue = useMemo(() => {
    if (step === 1) return form.org_name.length >= 2 && form.slug.length >= 3 && slugAvailable === true;
    if (step === 2) return form.first_name && form.last_name && form.email.includes("@") && form.password.length >= 8 && form.password === form.confirm_password;
    return true;
  }, [form, slugAvailable, step]);

  const submit = async () => {
    setLoading(true);
    try {
      const result = await orgApi.signup({
        org_name: form.org_name,
        slug: form.slug,
        first_name: form.first_name,
        last_name: form.last_name,
        email: form.email,
        password: form.password,
        country: form.country,
        timezone: form.timezone,
      });
      setAuth(result.user, result.access_token);
      toast.success("Workspace created. Let us set up the essentials.");
      router.push("/onboarding");
    } catch (error: any) {
      toast.error(error.message || "Could not create workspace.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <PublicShell eyebrow="New Organisation" title="Launch your EventOS workspace" subtitle="Create a branded command center for your conference operations.">
      <div className="mb-8 flex items-center gap-2">
        {[1, 2, 3].map((item) => (
          <div key={item} className={cn("h-1.5 flex-1 rounded-full bg-white/10", item <= step && "bg-[var(--pri)] shadow-[0_0_12px_color-mix(in_srgb,var(--pri)_45%,transparent)]")} />
        ))}
      </div>

      {step === 1 && (
        <motion.div initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} className="space-y-5">
          <Header title="About Your Organisation" />
          <Field label="Organisation Name"><Input value={form.org_name} maxLength={100} onChange={(e) => update("org_name", e.target.value)} className="h-12 rounded-xl bg-white/5 border-default" /></Field>
          <Field label="Organisation Slug">
            <div className="relative">
              <Input value={form.slug} onChange={(e) => update("slug", e.target.value)} className="h-12 rounded-xl bg-white/5 border-default pr-11" />
              <div className="absolute right-3 top-1/2 -translate-y-1/2">
                {checkingSlug ? <Loader2 className="h-4 w-4 animate-spin text-muted" /> : slugAvailable === true ? <Check className="h-4 w-4 text-emerald-400" /> : slugAvailable === false ? <X className="h-4 w-4 text-[var(--dan)]" /> : null}
              </div>
            </div>
            <p className="mt-2 text-[10px] font-black uppercase tracking-widest text-muted">Your portal will be at: eventx.in/{form.slug || "your-slug"}</p>
          </Field>
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Country"><Select value={form.country} onValueChange={(value) => update("country", value)}><SelectTrigger className="h-12 rounded-xl bg-white/5 border-default"><SelectValue /></SelectTrigger><SelectContent>{countries.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}</SelectContent></Select></Field>
            <Field label="Timezone"><Select value={form.timezone} onValueChange={(value) => update("timezone", value)}><SelectTrigger className="h-12 rounded-xl bg-white/5 border-default"><SelectValue /></SelectTrigger><SelectContent>{timezones.map((tz) => <SelectItem key={tz} value={tz}>{tz}</SelectItem>)}</SelectContent></Select></Field>
          </div>
          <Continue disabled={!canContinue} onClick={() => setStep(2)} />
        </motion.div>
      )}

      {step === 2 && (
        <motion.div initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} className="space-y-5">
          <Header title="Your Account" />
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="First Name"><Input value={form.first_name} onChange={(e) => update("first_name", e.target.value)} className="h-12 rounded-xl bg-white/5 border-default" /></Field>
            <Field label="Last Name"><Input value={form.last_name} onChange={(e) => update("last_name", e.target.value)} className="h-12 rounded-xl bg-white/5 border-default" /></Field>
          </div>
          <Field label="Work Email"><Input type="email" value={form.email} onChange={(e) => update("email", e.target.value)} className="h-12 rounded-xl bg-white/5 border-default" /></Field>
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Password"><PasswordInput value={form.password} show={showPassword} setShow={setShowPassword} onChange={(value) => update("password", value)} /></Field>
            <Field label="Confirm Password"><PasswordInput value={form.confirm_password} show={showPassword} setShow={setShowPassword} onChange={(value) => update("confirm_password", value)} /></Field>
          </div>
          <div className="flex gap-3">
            <Button variant="outline" onClick={() => setStep(1)} className="h-12 rounded-xl border-default bg-white/5">Back</Button>
            <Continue disabled={!canContinue} onClick={() => setStep(3)} />
          </div>
        </motion.div>
      )}

      {step === 3 && (
        <motion.div initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} className="space-y-6">
          <Header title="Review & Launch" />
          <div className="rounded-2xl border border-default bg-white/[0.04] p-5 space-y-4">
            <Summary label="Organisation" value={`${form.org_name} (${form.slug})`} />
            <Summary label="Your role" value="Owner" />
            <Summary label="Plan" value="Free Trial (14 days)" />
            <Summary label="Account" value={form.email} />
          </div>
          <Button onClick={submit} disabled={loading} className="w-full h-14 rounded-full bg-[var(--pri)] hover:bg-[var(--sec)] font-black uppercase tracking-[0.18em] text-[11px]">
            {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : "Create Your Platform"}
          </Button>
          <button onClick={() => setStep(2)} className="w-full text-[10px] font-black uppercase tracking-widest text-muted hover:text-[var(--text)]">Back to account details</button>
        </motion.div>
      )}

      <div className="mt-8 text-center text-[11px] font-bold text-muted">
        Already have access? <Link href="/" className="text-[var(--pri)] hover:text-[var(--sec)]">Sign in</Link>
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
      <div className="space-y-5">
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="First Name"><Input value={form.first_name} onChange={(e) => setForm({ ...form, first_name: e.target.value })} className="h-12 rounded-xl bg-white/5 border-default" /></Field>
          <Field label="Last Name"><Input value={form.last_name} onChange={(e) => setForm({ ...form, last_name: e.target.value })} className="h-12 rounded-xl bg-white/5 border-default" /></Field>
        </div>
        <Field label="Password"><Input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} className="h-12 rounded-xl bg-white/5 border-default" /></Field>
        <Field label="Confirm Password"><Input type="password" value={form.confirm_password} onChange={(e) => setForm({ ...form, confirm_password: e.target.value })} className="h-12 rounded-xl bg-white/5 border-default" /></Field>
        <Button onClick={submit} disabled={loading} className="w-full h-14 rounded-full bg-[var(--pri)] hover:bg-[var(--sec)] font-black uppercase tracking-[0.18em] text-[11px]">
          {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : "Accept Invite"}
        </Button>
      </div>
    </PublicShell>
  );
}

function PublicShell({ eyebrow, title, subtitle, children }: { eyebrow: string; title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[var(--base)] text-[var(--text)] grid lg:grid-cols-[1fr_560px] overflow-hidden">
      <div className="relative hidden lg:flex flex-col justify-between p-12 border-r border-default bg-[radial-gradient(circle_at_20%_20%,color-mix(in_srgb,var(--pri)_22%,transparent),transparent_30%),radial-gradient(circle_at_80%_70%,color-mix(in_srgb,var(--sec)_18%,transparent),transparent_26%)]">
        <div className="absolute inset-0 bg-[url('/header/1.jpg')] bg-cover bg-center opacity-20 mix-blend-luminosity" />
        <div className="relative z-10">
          <div className="flex items-center gap-3">
            <div className="h-12 w-12 rounded-2xl glass-3d border-default flex items-center justify-center"><Box className="h-6 w-6 text-[var(--pri)]" /></div>
            <div>
              <h1 className="text-2xl font-black tracking-tighter">Event<span className="text-[var(--sec)]">OS</span></h1>
              <p className="text-[9px] font-black uppercase tracking-[0.3em] text-muted">Conference Platform</p>
            </div>
          </div>
        </div>
        <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} className="relative z-10 max-w-xl">
          <p className="text-[11px] font-black uppercase tracking-[0.3em] text-[var(--pri)]">{eyebrow}</p>
          <h2 className="mt-5 text-6xl font-black tracking-tighter leading-[0.92]">{title}</h2>
          <p className="mt-6 text-lg text-muted max-w-md">{subtitle}</p>
        </motion.div>
        <div className="relative z-10 grid grid-cols-3 gap-4 text-[10px] font-black uppercase tracking-widest text-muted">
          <span>Branding</span><span>Team</span><span>Events</span>
        </div>
      </div>
      <div className="flex items-center justify-center p-5 md:p-10">
        <div className="w-full max-w-[500px] rounded-[2rem] border border-default bg-[color-mix(in_srgb,var(--surf)_82%,transparent)] p-6 md:p-9 shadow-2xl backdrop-blur-md">
          {children}
        </div>
      </div>
    </div>
  );
}

function Header({ title }: { title: string }) {
  return <h2 className="text-2xl font-black tracking-tighter">{title}</h2>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block space-y-2"><span className="text-[10px] font-black uppercase tracking-[0.2em] text-muted px-1">{label}</span>{children}</label>;
}

function Continue({ disabled, onClick }: { disabled: boolean; onClick: () => void }) {
  return <Button onClick={onClick} disabled={disabled} className="h-12 flex-1 rounded-full bg-[var(--pri)] hover:bg-[var(--sec)] font-black uppercase tracking-[0.18em] text-[11px]">Continue <ChevronRight className="ml-2 h-4 w-4" /></Button>;
}

function PasswordInput({ value, show, setShow, onChange }: { value: string; show: boolean; setShow: (value: boolean) => void; onChange: (value: string) => void }) {
  return (
    <div className="relative">
      <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted" />
      <Input type={show ? "text" : "password"} value={value} onChange={(e) => onChange(e.target.value)} className="h-12 rounded-xl bg-white/5 border-default pl-10 pr-10" />
      <button type="button" onClick={() => setShow(!show)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-[var(--text)]">{show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</button>
    </div>
  );
}

function Summary({ label, value }: { label: string; value: string }) {
  return <div className="flex items-center justify-between gap-4 border-b border-default pb-3 last:border-0 last:pb-0"><span className="text-[10px] font-black uppercase tracking-widest text-muted">{label}</span><span className="text-sm font-bold text-right">{value}</span></div>;
}
