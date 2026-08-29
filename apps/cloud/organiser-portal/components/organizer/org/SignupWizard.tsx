"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  ChevronRight, Eye, EyeOff, Loader2, Lock, Mail, Check,
  ClipboardList, BarChart3, User, ShieldCheck, Fingerprint, Moon, Sun
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useAuthStore } from "@/store/use-auth-store";
import { cn } from "@/lib/utils";
import { orgApi } from "@/components/organizer/org/org-api";
import { authService } from "@/services/auth-service";
import { useTheme } from "@/hooks/useTheme";
import { BrandLogo } from "@/components/ui/brand-logo";

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

const fieldShellClass =
  "relative overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-1)] shadow-[inset_0_1px_0_color-mix(in_srgb,white_60%,transparent)] transition-all duration-300 focus-within:border-[var(--color-primary-mid)] focus-within:ring-2 focus-within:ring-[var(--color-primary-glow)] sm:focus-within:ring-4";
const inputClass =
  "h-8 w-full bg-transparent text-sm font-semibold text-[var(--color-text-primary)] placeholder:text-[var(--color-text-placeholder)] focus:outline-none focus:ring-0 sm:h-10";
const labelClass =
  "px-1 text-[10px] font-bold normal-case tracking-normal text-[var(--color-text-primary)] sm:text-[11px]";
const socialButtonClass =
  "flex h-8 items-center justify-center gap-2 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-1)] text-xs font-bold text-[var(--color-text-primary)] shadow-sm transition-all hover:bg-[var(--color-surface-3)] active:scale-[0.98] sm:h-10 sm:gap-2.5 sm:text-sm";

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
    <div className="space-y-2">
      {step === 1 ? (
        <form onSubmit={handleLogin} className="space-y-2">
          <div className="flex flex-col space-y-1">
            <h2 className="text-2xl font-black tracking-tight text-[var(--color-text-primary)]">
              Welcome back! 👋
            </h2>
            <p className="text-sm font-medium text-[var(--color-text-secondary)]">
              Login to access your organiser workspace
            </p>
          </div>

          <div className="space-y-2">
            <div className="space-y-2">
              <label className={labelClass}>
                Email address
              </label>
              <div className={fieldShellClass}>
                <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@company.com"
                  className={cn(inputClass, "pl-11 pr-4")}
                  required
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className={labelClass}>
                Password
              </label>
              <div className={fieldShellClass}>
                <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter password"
                  className={cn(inputClass, "pl-11 pr-11")}
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-[var(--color-text-muted)] transition-colors hover:text-[var(--color-text-primary)]"
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
                "flex h-4 w-4 items-center justify-center rounded border border-[var(--color-border)] bg-[var(--color-surface-1)] transition-all",
                rememberMe && "border-[var(--color-primary-mid)] bg-[var(--color-primary-mid)]/10"
              )}>
                {rememberMe && <Check className="h-3 w-3 text-[var(--color-primary-mid)] stroke-[3]" />}
              </div>
              <span className="text-[11px] font-bold text-[var(--color-text-muted)] group-hover:text-[var(--color-text-primary)] transition-colors">
                Remember device
              </span>
            </button>
            <span className="text-[11px] font-bold text-[var(--color-primary-mid)] hover:underline cursor-pointer">
              Forgot password?
            </span>
          </div>

          <Button
            type="submit"
            disabled={loading}
            className="flex h-9 w-full items-center justify-center gap-2 rounded-xl border-0 bg-gradient-to-r from-[var(--color-primary-start)] via-[var(--color-primary-mid)] to-[var(--color-primary-end)] text-sm font-black text-[var(--color-text-inverse)] shadow-glow-primary transition-all active:scale-[0.98] sm:h-11"
          >
            {loading ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              <>
                Sign In <ChevronRight className="h-4 w-4" />
              </>
            )}
          </Button>

          <div className="relative flex items-center">
            <div className="flex-grow border-t border-[var(--color-border)]"></div>
            <span className="flex-shrink mx-3 text-[9px] font-black uppercase tracking-widest text-[var(--color-text-muted)]">
              Or Continue With
            </span>
            <div className="flex-grow border-t border-[var(--color-border)]"></div>
          </div>

          <div className="grid grid-cols-2 gap-2 sm:gap-2.5">
            <button
              type="button"
              className={socialButtonClass}
            >
              <svg className="h-4 w-4 shrink-0 sm:h-5 sm:w-5" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
              </svg>
              <span>Google</span>
            </button>
            <button
              type="button"
              className={socialButtonClass}
            >
              <svg className="h-4 w-4 shrink-0 sm:h-5 sm:w-5" viewBox="0 0 23 23">
                <rect x="0" y="0" width="11" height="11" fill="#f25022" />
                <rect x="12" y="0" width="11" height="11" fill="#7fba00" />
                <rect x="0" y="12" width="11" height="11" fill="#00a4ef" />
                <rect x="12" y="12" width="11" height="11" fill="#ffb900" />
              </svg>
              <span>Microsoft</span>
            </button>
          </div>

          <div className="text-center text-xs font-bold text-[var(--color-text-muted)]">
            New to EventOS?{" "}
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                onToggleFlip?.(true);
              }}
              className="text-[var(--color-primary-mid)] hover:underline font-bold"
            >
              Create account
            </button>
          </div>
        </form>
      ) : (
        <div className="space-y-4 text-center py-4">
          <div className="space-y-2">
            <h2 className="text-xl font-bold text-[var(--color-text-primary)] tracking-tight">Security Check</h2>
            <p className="text-[11px] text-[var(--color-primary-mid)] font-black uppercase tracking-widest flex items-center justify-center gap-2">
              <ShieldCheck className="h-4 w-4" /> Identity Validated
            </p>
          </div>
          <div className="flex justify-center">
            <div className="relative h-16 w-16 flex items-center justify-center">
              <div className="absolute inset-0 bg-[var(--color-primary-mid)]/20 blur-xl rounded-full animate-pulse" />
              <Fingerprint className="h-10 w-10 text-[var(--color-primary-mid)] relative z-10" />
            </div>
          </div>
          <div className="flex gap-2 justify-center">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div key={i} className="h-10 w-8 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-1)] flex items-center justify-center">
                <div className="h-1 w-1 rounded-full bg-[var(--color-primary-mid)] animate-pulse" />
              </div>
            ))}
          </div>
          <Button disabled className="w-full h-11 bg-[var(--color-surface-3)] border border-[var(--color-border)] text-[var(--color-text-muted)] font-black uppercase tracking-wider text-[11px] rounded-2xl flex items-center justify-center gap-2">
            Signing you in... <Loader2 className="h-4 w-4 animate-spin text-[var(--color-primary-mid)]" />
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
    <div className="space-y-2">
      <div className="flex flex-col space-y-0.5">
        <h2 className="text-2xl font-black tracking-tight text-[var(--color-text-primary)]">
          Create account
        </h2>
        <p className="text-sm font-medium text-[var(--color-text-secondary)]">
          Set up your organiser profile
        </p>
      </div>

      <div className="space-y-2">
        <div className="grid grid-cols-2 gap-2 sm:gap-2.5">
          <div className="space-y-2">
            <label className={labelClass}>First Name</label>
            <div className={fieldShellClass}>
              <input
                type="text"
                value={form.first_name}
                onChange={(e) => setForm({ ...form, first_name: e.target.value })}
                placeholder="John"
                className={cn(inputClass, "px-4")}
                required
              />
            </div>
          </div>
          <div className="space-y-2">
            <label className={labelClass}>Last Name</label>
            <div className={fieldShellClass}>
              <input
                type="text"
                value={form.last_name}
                onChange={(e) => setForm({ ...form, last_name: e.target.value })}
                placeholder="Doe"
                className={cn(inputClass, "px-4")}
                required
              />
            </div>
          </div>
        </div>

        <div className="space-y-2">
          <label className={labelClass}>Work Email</label>
          <div className={fieldShellClass}>
            <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              placeholder="name@company.com"
              className={cn(inputClass, "pl-11 pr-4")}
              required
            />
          </div>
        </div>

        <div className="space-y-2">
          <label className={labelClass}>Password</label>
          <div className={fieldShellClass}>
            <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
              type={showPassword ? "text" : "password"}
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              placeholder="At least 8 characters"
              className={cn(inputClass, "pl-11 pr-11")}
              required
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-4 top-1/2 -translate-y-1/2 text-[var(--color-text-muted)] transition-colors hover:text-[var(--color-text-primary)]"
            >
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </div>
      </div>

      <Button
        onClick={submit}
        disabled={loading || !isFormValid}
        className="flex h-9 w-full items-center justify-center gap-2 rounded-xl border-0 bg-gradient-to-r from-[var(--color-primary-start)] via-[var(--color-primary-mid)] to-[var(--color-primary-end)] text-sm font-black text-[var(--color-text-inverse)] shadow-glow-primary transition-all active:scale-[0.98] sm:h-11"
      >
        {loading ? (
          <Loader2 className="h-5 w-5 animate-spin" />
        ) : (
          <>
            Create Account <ChevronRight className="h-4 w-4" />
          </>
        )}
      </Button>

      <div className="relative flex items-center">
        <div className="flex-grow border-t border-[var(--color-border)]"></div>
        <span className="flex-shrink mx-3 text-[9px] font-black uppercase tracking-widest text-[var(--color-text-muted)]">
          Or Sign Up With
        </span>
        <div className="flex-grow border-t border-[var(--color-border)]"></div>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:gap-2.5">
        <button
          type="button"
          className={socialButtonClass}
        >
          <svg className="h-4 w-4 shrink-0 sm:h-5 sm:w-5" viewBox="0 0 24 24">
            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
          </svg>
          <span>Google</span>
        </button>
        <button
          type="button"
          className={socialButtonClass}
        >
          <svg className="h-4 w-4 shrink-0 sm:h-5 sm:w-5" viewBox="0 0 23 23">
            <rect x="0" y="0" width="11" height="11" fill="#f25022" />
            <rect x="12" y="0" width="11" height="11" fill="#7fba00" />
            <rect x="0" y="12" width="11" height="11" fill="#00a4ef" />
            <rect x="12" y="12" width="11" height="11" fill="#ffb900" />
          </svg>
          <span>Microsoft</span>
        </button>
      </div>

      <div className="text-center text-xs font-bold text-[var(--color-text-muted)]">
        Already have an account?{" "}
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            onToggleFlip?.(false);
          }}
          className="text-[var(--color-primary-mid)] hover:underline font-bold"
        >
          Sign in
        </button>
      </div>
    </div>
  );
}

type PublicOrganizationBrand = {
  organization: { slug: string; name: string };
  published: boolean;
  assets: Record<string, string>;
  tokens: Record<string, string | number | boolean>;
  white_label: {
    enabled: boolean;
    product_name?: string | null;
    hide_eventos_branding?: boolean;
    footer_text?: string | null;
    support_url?: string | null;
    reason_code?: string | null;
  };
  login_page: {
    enabled: boolean;
    headline?: string | null;
    subheading?: string | null;
    logo_asset_url?: string | null;
    background_asset_url?: string | null;
    support_url?: string | null;
    terms_url?: string | null;
    privacy_url?: string | null;
    reason_code?: string | null;
  };
};

export function UnifiedAuthContainer({ initialFlipped = false }: { initialFlipped?: boolean }) {
  const [isFlipped, setIsFlipped] = useState(initialFlipped);
  const [publicBrand, setPublicBrand] = useState<PublicOrganizationBrand | null>(null);
  const [brandUnavailable, setBrandUnavailable] = useState(false);
  const router = useRouter();
  const { theme, toggleTheme, mounted } = useTheme();

  useEffect(() => {
    setIsFlipped(window.location.pathname === "/signup");
    const handlePopState = () => {
      setIsFlipped(window.location.pathname === "/signup");
    };
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams(window.location.search);
    const organizationSlug = params.get("org");
    const lookup = organizationSlug
      ? `slug=${encodeURIComponent(organizationSlug)}`
      : `host=${encodeURIComponent(window.location.hostname)}`;
    const apiBase = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";
    fetch(`${apiBase}/api/v1/platform/public/branding?${lookup}`, {
      signal: controller.signal,
      cache: "no-store",
    })
      .then(async (response) => {
        if (!response.ok) throw new Error("Organization brand is unavailable");
        return response.json() as Promise<PublicOrganizationBrand>;
      })
      .then((brand) => {
        setPublicBrand(brand);
        setBrandUnavailable(false);
      })
      .catch((error) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setPublicBrand(null);
        setBrandUnavailable(Boolean(organizationSlug));
      });
    return () => controller.abort();
  }, []);

  const handleToggle = (flip: boolean) => {
    setIsFlipped(flip);
    const path = flip ? "/signup" : "/login";
    window.history.pushState(null, "", path);
  };

  const loginBrand = publicBrand?.login_page.enabled ? publicBrand.login_page : null;
  const whiteLabel = publicBrand?.white_label.enabled ? publicBrand.white_label : null;
  const logoUrl = loginBrand?.logo_asset_url || publicBrand?.assets.logo_url || "";
  const productName = whiteLabel?.product_name || "EVENTOS";

  const features = [
    { name: "Event Management", text: "Plan, organise and execute seamless events.", icon: ClipboardList },
    { name: "Team Collaboration", text: "Work with your team and manage roles with ease.", icon: User },
    { name: "Real-time Insights", text: "Track performance and make data-driven decisions.", icon: BarChart3 },
    { name: "Enterprise Grade Security", text: "Your data is protected with top-tier security controls.", icon: ShieldCheck },
  ];

  const eyebrow = isFlipped ? "Organiser Workspace" : "Welcome Back! 👋";
  const title = isFlipped
    ? `Create your ${productName} account`
    : loginBrand?.headline || "Manage events. Engage audiences.";
  const defaultSubtitle = isFlipped
    ? "Set up your profile to start building, planning, and managing your events today."
    : "Streamline event operations, boost productivity, and deliver memorable attendee experiences.";

  const subtitle = !isFlipped && loginBrand?.subheading
    ? loginBrand.subheading
    : defaultSubtitle;

  return (
    <div className="relative h-dvh max-h-dvh overflow-hidden bg-[var(--color-bg)] font-sans text-[var(--color-text-primary)]">
      <div aria-hidden className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_8%_10%,color-mix(in_srgb,var(--color-primary-mid)_16%,transparent),transparent_28%),radial-gradient(circle_at_78%_12%,color-mix(in_srgb,var(--color-primary-start)_11%,transparent),transparent_30%),radial-gradient(circle_at_48%_92%,color-mix(in_srgb,var(--color-accent-lime)_18%,transparent),transparent_30%)]" />

      <main className="relative z-10 grid h-full grid-rows-[64px_minmax(0,1fr)_44px] overflow-hidden bg-[color-mix(in_srgb,var(--color-surface-1)_72%,transparent)] backdrop-blur-2xl">
        <header className="flex min-h-0 items-center justify-between border-b border-[var(--color-border)] px-[clamp(1rem,3vw,3rem)]">
          <BrandLogo src={logoUrl} name={productName.toLowerCase()} subtitle="Organiser Portal" compact className="gap-2 sm:gap-3" markClassName="sm:h-10 sm:w-10" textClassName="sm:text-lg" />
          <div className="flex shrink-0 items-center gap-2 sm:gap-4">
            <a
              href={loginBrand?.support_url || whiteLabel?.support_url || "https://docs.eventos.com"}
              target="_blank"
              rel="noreferrer"
              className="hidden text-sm font-semibold text-[var(--color-text-secondary)] transition-colors hover:text-[var(--color-primary-mid)] sm:inline"
            >
              Help & Docs
            </a>
            <button
              type="button"
              onClick={toggleTheme}
              className="flex h-9 items-center gap-2 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-2)] px-2.5 text-sm font-semibold text-[var(--color-text-secondary)] shadow-sm transition-colors hover:text-[var(--color-text-primary)] sm:h-10 sm:px-3"
              aria-label="Toggle theme"
            >
              {mounted && theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
              <span className="hidden sm:inline">{mounted && theme === "dark" ? "Light Mode" : "Dark Mode"}</span>
            </button>
          </div>
        </header>

        <section className="relative min-h-0 overflow-hidden px-[clamp(1rem,5vw,5rem)] py-[clamp(.75rem,2vh,1.25rem)]">
          <div className="relative z-10 grid h-full min-h-0 items-center gap-[clamp(1rem,4vw,4rem)] lg:grid-cols-[minmax(0,1fr)_minmax(340px,430px)]">
            <div className="grid min-h-0 grid-cols-1 items-center gap-[clamp(1rem,3vw,3rem)] lg:grid-cols-[minmax(0,1.05fr)_minmax(320px,0.95fr)] xl:grid-cols-[minmax(0,1fr)_minmax(380px,1.1fr)]">
              <div className="min-w-0">
              <motion.div
                key={isFlipped ? "signup-text" : "login-text"}
                initial={{ opacity: 0, x: -18 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.42 }}
                className="max-w-[580px]"
              >
                <span className="inline-flex rounded-full bg-[color-mix(in_srgb,var(--color-primary-mid)_12%,transparent)] px-3.5 py-1 text-xs font-bold text-[var(--color-primary-mid)]">
                  {eyebrow}
                </span>
                <h1 className="mt-3 max-w-[540px] text-[clamp(1.75rem,2.8vw,2.75rem)] font-extrabold leading-[1.12] tracking-tight text-[var(--color-text-primary)]">
                  {title.includes(".") ? (
                    <>
                      {title.split(".")[0]}.
                      <br />
                      <span className="bg-gradient-to-r from-[var(--color-primary-start)] via-[var(--color-primary-mid)] to-[var(--color-primary-end)] bg-clip-text text-transparent">
                        {title.split(".").slice(1).join(".").trim()}
                      </span>
                    </>
                  ) : title}
                </h1>
                <p className="mt-3 max-w-lg text-[clamp(.85rem,1.1vw,0.975rem)] font-medium leading-relaxed text-[var(--color-text-secondary)]">
                  {subtitle}
                </p>
              </motion.div>

              <div className="mt-5 grid max-w-xl grid-cols-2 gap-x-4 gap-y-3">
                {features.map((feat) => {
                  const Icon = feat.icon;
                  return (
                    <div key={feat.name} className="flex min-w-0 items-start gap-2.5">
                      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-[color-mix(in_srgb,var(--color-primary-mid)_12%,var(--color-surface-2))] text-[var(--color-primary-mid)]">
                        <Icon className="h-4 w-4" />
                      </span>
                      <span className="min-w-0">
                        <span className="block text-xs sm:text-sm font-bold leading-tight text-[var(--color-text-primary)]">{feat.name}</span>
                        <span className="mt-0.5 block text-[11px] sm:text-xs leading-snug text-[var(--color-text-secondary)]">{feat.text}</span>
                      </span>
                    </div>
                  );
                })}
              </div>
              </div>
              <div className="relative hidden min-h-0 items-center justify-center lg:flex">
                <div
                  aria-hidden
                  className="pointer-events-none absolute -inset-6 rounded-full bg-[radial-gradient(ellipse_at_center,color-mix(in_srgb,var(--color-primary-mid)_18%,transparent),transparent_70%)] blur-3xl"
                />
                <motion.img
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
                  src="/assets/illustrations/auth/auth-hero.png"
                  alt="EventOS Auth Experience"
                  className="relative z-10 max-h-[min(66vh,620px)] w-auto max-w-full object-contain filter drop-shadow-[0_20px_40px_rgba(0,0,0,0.18)] dark:drop-shadow-[0_20px_40px_rgba(0,0,0,0.45)] transition-transform duration-500 hover:scale-[1.02]"
                  onError={(event) => { event.currentTarget.style.display = "none"; }}
                />
              </div>
            </div>

          <div className="w-full max-w-[430px] justify-self-center lg:justify-self-end">
            <AnimatePresence mode="wait" initial={false}>
              {!isFlipped ? (
                <motion.div
                  key="login-card"
                  initial={{ opacity: 0, rotateY: -12, y: 8 }}
                  animate={{ opacity: 1, rotateY: 0, y: 0 }}
                  exit={{ opacity: 0, rotateY: 12, y: -8 }}
                  transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
                  className="w-full rounded-[28px] border border-[var(--color-border)] bg-[var(--color-surface-2)] p-5 shadow-modal backdrop-blur-2xl"
                >
                <BrandLogo src={logoUrl} name={productName.toLowerCase()} subtitle="Organiser Portal" compact className="mb-3 lg:hidden" markClassName="sm:h-12 sm:w-12 sm:rounded-[20px] sm:text-xl" textClassName="sm:text-2xl" />
                  <LoginPageForm onToggleFlip={handleToggle} />
                </motion.div>
              ) : (
                <motion.div
                  key="signup-card"
                  initial={{ opacity: 0, rotateY: 12, y: 8 }}
                  animate={{ opacity: 1, rotateY: 0, y: 0 }}
                  exit={{ opacity: 0, rotateY: -12, y: -8 }}
                  transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
                  className="w-full rounded-[28px] border border-[var(--color-border)] bg-[var(--color-surface-2)] p-5 shadow-modal backdrop-blur-2xl"
                >
                  <SignupWizardForm onToggleFlip={handleToggle} />
                </motion.div>
              )}
            </AnimatePresence>
          </div>
          </div>
          {brandUnavailable ? <p className="absolute bottom-5 text-xs text-amber-500">Organization branding unavailable; secure platform branding is in use.</p> : null}
        </section>
        <footer className="flex min-h-0 items-center justify-between border-t border-[var(--color-border)] px-[clamp(1rem,3vw,3rem)] text-xs font-medium text-[var(--color-text-muted)]">
          <span className="truncate">© 2026 {productName}. All rights reserved.</span>
          <nav className="flex items-center gap-4">
            <a href={loginBrand?.terms_url || "#"} className="hover:text-[var(--color-primary-mid)]">Terms & Conditions</a>
            <a href={loginBrand?.privacy_url || "#"} className="hover:text-[var(--color-primary-mid)]">Privacy</a>
            <a href="#" className="hover:text-[var(--color-primary-mid)]">Security</a>
            <a href={loginBrand?.support_url || whiteLabel?.support_url || "https://docs.eventos.com"} className="hover:text-[var(--color-primary-mid)]">Support</a>
          </nav>
        </footer>
      </main>
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
    <div className="grid min-h-screen place-items-center bg-[var(--color-bg)] p-6 text-[var(--color-text-primary)]">
      <div className="w-full max-w-lg rounded-[28px] border border-[var(--color-border)] bg-[var(--color-surface-2)] p-8 shadow-modal backdrop-blur-2xl">
        <div className="space-y-6">
          <h2 className="text-xl font-bold text-[var(--color-text-primary)]">Accept Invitation</h2>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <input type="text" placeholder="First Name" className="h-11 w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-1)] px-4 text-sm text-[var(--color-text-primary)] placeholder:text-[var(--color-text-placeholder)]" value={form.first_name} onChange={e => setForm({ ...form, first_name: e.target.value })} />
              <input type="text" placeholder="Last Name" className="h-11 w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-1)] px-4 text-sm text-[var(--color-text-primary)] placeholder:text-[var(--color-text-placeholder)]" value={form.last_name} onChange={e => setForm({ ...form, last_name: e.target.value })} />
            </div>
            <input type="password" placeholder="Password" className="h-11 w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-1)] px-4 text-sm text-[var(--color-text-primary)] placeholder:text-[var(--color-text-placeholder)]" value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} />
            <input type="password" placeholder="Confirm Password" className="h-11 w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-1)] px-4 text-sm text-[var(--color-text-primary)] placeholder:text-[var(--color-text-placeholder)]" value={form.confirm_password} onChange={e => setForm({ ...form, confirm_password: e.target.value })} />
            <Button onClick={submit} className="h-11 w-full rounded-xl bg-gradient-to-r from-[var(--color-primary-start)] via-[var(--color-primary-mid)] to-[var(--color-primary-end)] font-black uppercase tracking-wider text-[var(--color-text-inverse)]">
              {loading ? <Loader2 className="animate-spin" /> : "Accept"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
