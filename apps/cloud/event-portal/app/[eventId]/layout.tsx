"use client";

import { useEffect, useState, useTransition } from "react";
import { useParams, usePathname, useRouter } from "next/navigation";
import {
  Calendar, MapPin, Globe, Shield, HelpCircle, FileText,
  Sun, Moon, Laptop, LogOut, ChevronDown, Check,
  User, QrCode, Ticket, Award, Sparkles, ExternalLink, Presentation,
  Bell, Mail, Phone, Info, LifeBuoy
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { BrandLogo } from "@/components/ui/brand-logo";
import { PortalBackground, type SvgPatternType } from "@/components/ui/portal-background";
import { toast } from "sonner";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";

const FAQS = [
  {
    q: "How do I collect my conference badge and delegate kit on-site?",
    a: "Present your Digital Pass QR Code found in your Attendee Portal at the Self-Service Kiosks or Registration Desk at the venue reception to instantly print your official conference badge."
  },
  {
    q: "How do invited speakers upload and manage presentation slides?",
    a: "Invited faculty and speakers can access the Speaker Workspace via the portal header to upload .pptx or .pdf presentation decks and review session timings before the upload deadline."
  },
  {
    q: "How do I access the multi-track scientific program and session room locations?",
    a: "Click 'View Program' on the portal homepage or dashboard to explore specialized scientific tracks, hall allocations, keynote timings, and speaker abstracts in real time."
  },
  {
    q: "Where can I download my payment invoice, receipt, and tax summary?",
    a: "Navigate to the 'My Registration & Invoice' section on your dashboard to instantly download official PDF tax invoices and payment receipts with GST/VAT details."
  },
  {
    q: "When and where will my Certificate of Attendance and CME credits be available?",
    a: "Certificates of Attendance and accredited CME/CPD credit certificates are automatically generated and available for 1-click download in your portal immediately following event completion."
  },
  {
    q: "What should I do if I need on-site technical support or have accessibility requirements?",
    a: "Click 'Need help?' or 'Contact Support' in the portal header to view dedicated helpline phone numbers, email assistance, or visit the Help Desk located in the main venue lobby."
  }
];

function getContrastColor(hexColor: string): string {
  const hex = (hexColor || "#6366F1").replace("#", "");
  const r = parseInt(hex.substring(0, 2), 16) || 0;
  const g = parseInt(hex.substring(2, 4), 16) || 0;
  const b = parseInt(hex.substring(4, 6), 16) || 0;
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.58 ? "#09090b" : "#ffffff";
}

function getAccessibleTextColor(colorHex: string, isDarkBackdrop: boolean): string {
  const hex = (colorHex || "#6366F1").replace("#", "");
  const r = parseInt(hex.substring(0, 2), 16) || 0;
  const g = parseInt(hex.substring(2, 4), 16) || 0;
  const b = parseInt(hex.substring(4, 6), 16) || 0;
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;

  if (isDarkBackdrop && luminance < 0.4) {
    return `color-mix(in srgb, ${colorHex} 65%, #ffffff)`;
  }
  if (!isDarkBackdrop && luminance > 0.6) {
    return `color-mix(in srgb, ${colorHex} 75%, #000000)`;
  }
  return colorHex;
}

function getSolidColorContrastVars(solidColor: string) {
  const hex = solidColor.replace("#", "");
  const r = parseInt(hex.substring(0, 2), 16) || 0;
  const g = parseInt(hex.substring(2, 4), 16) || 0;
  const b = parseInt(hex.substring(4, 6), 16) || 0;
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  const isDark = luminance < 0.55;

  if (isDark) {
    return {
      "--bg-base": solidColor,
      backgroundColor: solidColor,
      "--text": "#f8fafc",
      "--text-primary": "#f8fafc",
      "--text-secondary": "#cbd5e1",
      "--muted": "#94a3b8",
      "--border-default": "rgba(255, 255, 255, 0.18)",
      "--border": "rgba(255, 255, 255, 0.18)",
      "--card": "rgba(18, 21, 40, 0.90)",
      "--card-solid": "#121528",
      "--bg-surface-2": "rgba(255, 255, 255, 0.06)",
      "--bg-surface-hover": "rgba(255, 255, 255, 0.12)",
      color: "#f8fafc",
    };
  } else {
    return {
      "--bg-base": solidColor,
      backgroundColor: solidColor,
      "--text": "#0f172a",
      "--text-primary": "#0f172a",
      "--text-secondary": "#334155",
      "--muted": "#475569",
      "--border-default": "rgba(0, 0, 0, 0.14)",
      "--border": "rgba(0, 0, 0, 0.14)",
      "--card": "rgba(255, 255, 255, 0.94)",
      "--card-solid": "#ffffff",
      "--bg-surface-2": "rgba(0, 0, 0, 0.05)",
      "--bg-surface-hover": "rgba(0, 0, 0, 0.09)",
      color: "#0f172a",
    };
  }
}

export default function EventPortalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { eventId } = useParams<{ eventId: string }>();
  const pathname = usePathname();
  const router = useRouter();
  const [, startTransition] = useTransition();

  const [theme, setTheme] = useState<"dark" | "light" | "system">("dark");
  const [eventData, setEventData] = useState<any>(null);
  const [participant, setParticipant] = useState<any>(null);
  const [isSpeaker, setIsSpeaker] = useState(false);
  const [faqOpen, setFaqOpen] = useState(false);
  const [termsOpen, setTermsOpen] = useState(false);
  const [supportOpen, setSupportOpen] = useState(false);
  const [expandedFaqs, setExpandedFaqs] = useState<number[]>([]);

  const toggleFaq = (idx: number) => {
    setExpandedFaqs((prev) =>
      prev.includes(idx) ? prev.filter((i) => i !== idx) : [...prev, idx]
    );
  };

  // Sync active theme
  useEffect(() => {
    const saved = localStorage.getItem("portal_theme") as any;
    if (saved) {
      setTheme(saved);
      document.documentElement.setAttribute("data-theme", saved);
    } else if (eventData?.dark_mode_default !== undefined) {
      const mode = eventData.dark_mode_default ? "dark" : "light";
      setTheme(mode);
      document.documentElement.setAttribute("data-theme", mode);
    } else {
      document.documentElement.setAttribute("data-theme", "dark");
    }
  }, [eventData?.dark_mode_default]);

  const handleThemeChange = (newTheme: "dark" | "light" | "system") => {
    setTheme(newTheme);
    localStorage.setItem("portal_theme", newTheme);
    if (newTheme === "system") {
      const isDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
      document.documentElement.setAttribute("data-theme", isDark ? "dark" : "light");
    } else {
      document.documentElement.setAttribute("data-theme", newTheme);
    }
  };

  // Fetch Event metadata & participant session
  useEffect(() => {
    if (!eventId) return;

    // Load from local storage cache immediately on mount
    try {
      const cached = localStorage.getItem(`portal_theme_cache_${eventId}`);
      if (cached) {
        setEventData(JSON.parse(cached));
      }
    } catch (e) {}

    fetch(`${API_BASE}/api/v1/portal/registration/${eventId}/form`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data) {
          setEventData(data);
          try {
            localStorage.setItem(`portal_theme_cache_${eventId}`, JSON.stringify(data));
          } catch (e) {}
        }
      })
      .catch(() => { });

    const storedParticipant = localStorage.getItem(`portal_participant_${eventId}`);
    if (storedParticipant) {
      try {
        const parsed = JSON.parse(storedParticipant);
        if (parsed && (parsed.email || parsed.name)) {
          setParticipant(parsed);
        }
      } catch (e) { }
    }

    const token = localStorage.getItem(`portal_token_${eventId}`) || localStorage.getItem(`portal_jwt_${eventId}`);
    if (token) {
      fetch(`${API_BASE}/api/v1/portal/dashboard`, {
        headers: { Authorization: `Bearer ${token}` },
      })
        .then((res) => (res.ok ? res.json() : null))
        .then((dash) => {
          if (dash?.participant) {
            setParticipant(dash.participant);
            localStorage.setItem(`portal_participant_${eventId}`, JSON.stringify(dash.participant));
            setIsSpeaker(Boolean(dash.is_speaker || dash.speaker_portal_url));
          }
        })
        .catch(() => { });
    }
  }, [eventId, pathname]);

  const handleLogout = () => {
    localStorage.removeItem(`portal_token_${eventId}`);
    localStorage.removeItem(`portal_jwt_${eventId}`);
    localStorage.removeItem(`portal_participant_${eventId}`);
    setParticipant(null);
    toast.success("Signed out successfully");
    startTransition(() => {
      router.push(`/${eventId}/login`);
    });
  };

  const isAuthPage = pathname.includes("/login") || pathname === `/${eventId}`;
  const isSpeakerCenter = pathname.includes("/speaker");

  // Dynamic Theme CSS tokens
  const primaryHex = eventData?.primary_color || eventData?.theme_config?.primary_color || eventData?.theme_color || "#6366F1";
  const secondaryHex = eventData?.secondary_color || eventData?.theme_config?.secondary_color || "#A855F7";
  const bgMode = eventData?.bg_mode || eventData?.theme_config?.bg_mode || "pattern";
  const svgPattern: SvgPatternType = (eventData?.svg_pattern || eventData?.theme_config?.svg_pattern || "glow-wave") as SvgPatternType;
  const bgImageUrl = eventData?.bg_image_url || eventData?.theme_config?.bg_image_url || "";
  const bgBlur = eventData?.bg_blur ?? eventData?.theme_config?.bg_blur ?? 0;
  const bgOverlayOpacity = eventData?.bg_overlay_opacity ?? eventData?.theme_config?.bg_overlay_opacity ?? 0.4;
  const bgSolidColor = eventData?.bg_solid_color || eventData?.theme_config?.bg_solid_color || "#000000";

  // Dynamic Content from Portal Settings
  const dynamicFaqs: Array<{ q: string; a: string }> = (
    eventData?.faqs && Array.isArray(eventData.faqs) && eventData.faqs.length > 0
      ? eventData.faqs.map((f: any) => ({
        q: f.q || f.question || "Frequently Asked Question",
        a: f.a || f.answer || "",
      }))
      : FAQS
  );

  const dynamicTerms = eventData?.terms_and_conditions || "";
  const supportEmail = eventData?.support_email || "support@eventos.io";
  const supportPhone = eventData?.support_phone || "";
  const additionalContacts = Array.isArray(eventData?.additional_contacts) ? eventData.additional_contacts : [];

  const getInitials = (name?: string) => {
    if (!name) return "JD";
    const parts = name.trim().split(" ");
    if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
    return name.slice(0, 2).toUpperCase();
  };

  // Contrast tokens for solid background
  const solidContrastVars: Record<string, string> =
    bgMode === "solid" ? getSolidColorContrastVars(bgSolidColor || "#000000") : {};

  const isBackdropDark = bgMode === "solid" ? (solidContrastVars["--text"] === "#f8fafc") : true;
  const primaryContrast = getContrastColor(primaryHex);
  const secondaryContrast = getContrastColor(secondaryHex);
  const priTextColor = getAccessibleTextColor(primaryHex, isBackdropDark);
  const secTextColor = getAccessibleTextColor(secondaryHex, isBackdropDark);

  // Dynamically sync CSS variables to document.documentElement so Radix Portals / Modals inherit them
  useEffect(() => {
    if (typeof document === "undefined") return;
    const root = document.documentElement;
    root.style.setProperty("--pri", primaryHex);
    root.style.setProperty("--sec", secondaryHex);
    root.style.setProperty("--brand-primary", primaryHex);
    root.style.setProperty("--brand-secondary", secondaryHex);
    root.style.setProperty("--primary-contrast", primaryContrast);
    root.style.setProperty("--secondary-contrast", secondaryContrast);
    root.style.setProperty("--pri-text", priTextColor);
    root.style.setProperty("--sec-text", secTextColor);
    if (bgMode === "solid") {
      Object.entries(solidContrastVars).forEach(([k, v]) => {
        root.style.setProperty(k, String(v));
      });
    }
  }, [primaryHex, secondaryHex, primaryContrast, secondaryContrast, priTextColor, secTextColor, bgMode, bgSolidColor]);

  return (
    <div
      suppressHydrationWarning
      className={`min-h-screen flex flex-col bg-[var(--bg-base)] text-[var(--text)] transition-colors duration-200 relative ${isAuthPage ? "lg:h-screen lg:max-h-screen lg:overflow-hidden" : ""
        }`}
      style={
        eventData
          ? ({
              "--pri": primaryHex,
              "--sec": secondaryHex,
              "--brand-primary": primaryHex,
              "--brand-secondary": secondaryHex,
              "--primary-contrast": primaryContrast,
              "--secondary-contrast": secondaryContrast,
              "--pri-text": priTextColor,
              "--sec-text": secTextColor,
              ...solidContrastVars,
            } as React.CSSProperties)
          : undefined
      }
    >
      {/* ── GLOBAL THEME INJECTION FOR RADIX PORTALS & DIALOGS ──────────────── */}
      {eventData && (
        <style suppressHydrationWarning>{`
          :root, html, body, [data-theme], [data-radix-portal], [role="dialog"], [role="menu"], [data-radix-popper-content-wrapper] {
            --pri: ${primaryHex} !important;
            --sec: ${secondaryHex} !important;
            --brand-primary: ${primaryHex} !important;
            --brand-secondary: ${secondaryHex} !important;
            --primary-contrast: ${primaryContrast} !important;
            --secondary-contrast: ${secondaryContrast} !important;
            --pri-text: ${priTextColor} !important;
            --sec-text: ${secTextColor} !important;
            ${Object.entries(solidContrastVars)
            .map(([k, v]) => `${k}: ${v} !important;`)
            .join("\n")}
          }
        `}</style>
      )}

      {/* ── DYNAMIC BACKGROUND THEME ────────────────────────────────────────── */}
      {eventData && bgMode !== "none" && (
        <PortalBackground
          mode={bgMode}
          pattern={svgPattern}
          imageUrl={bgImageUrl}
          blur={Number(bgBlur)}
          overlayOpacity={Number(bgOverlayOpacity)}
          solidColor={bgSolidColor}
        />
      )}

      {/* ── TOP HEADER ──────────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-40 w-full border-b border-[var(--border-default)] bg-[var(--bg-base)]/90 backdrop-blur-md shrink-0">

        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-14 sm:h-16 flex items-center justify-between gap-4">
          {/* Left Brand & Event Title */}
          <div
            className="flex items-center gap-3 min-w-0 cursor-pointer"
            onClick={() => router.push(participant ? `/${eventId}/dashboard` : `/${eventId}`)}
          >
            <BrandLogo
              logoUrl={eventData?.logo_url}
              shortCode={eventData?.short_code}
              onlyMark={true}
              size="md"
            />
            <div className="truncate">
              <span className="font-extrabold text-sm sm:text-base text-[var(--text)] tracking-tight truncate block">
                {eventData?.event_name || ""}
              </span>
              <span className="text-[10px] font-bold uppercase tracking-widest text-[var(--muted)] block -mt-0.5">
                {isSpeakerCenter ? "Speaker Center" : "Participant Portal"}
              </span>
            </div>
          </div>

          {/* Right Header Navigation & Actions */}
          <div className="flex items-center gap-3 shrink-0">
            {/* Need Help Link */}
            <button
              type="button"
              onClick={() => setSupportOpen(true)}
              className="hidden sm:flex items-center gap-1.5 text-xs font-bold text-[var(--muted)] hover:text-[var(--text)] transition-colors cursor-pointer px-2 py-1"
            >
              <HelpCircle className="h-3.5 w-3.5" />
              <span>Need help?</span>
            </button>

            {/* Direct 1-Click Light/Dark Mode Toggle (Only visible when not locked to solid background) */}
            {bgMode !== "solid" && (
              <button
                type="button"
                onClick={() => handleThemeChange(theme === "light" ? "dark" : "light")}
                className="h-9 w-9 rounded-xl border border-[var(--border-default)] bg-[var(--card)] flex items-center justify-center text-[var(--muted)] hover:text-[var(--text)] hover:border-[var(--pri)]/40 transition-all cursor-pointer shadow-sm"
                title={theme === "light" ? "Switch to Dark Mode" : "Switch to Light Mode"}
              >
                {theme === "light" ? (
                  <Moon className="h-4 w-4 text-[var(--pri)]" />
                ) : (
                  <Sun className="h-4 w-4 text-amber-400" />
                )}
              </button>
            )}

            {/* Authenticated Participant Menu Pill */}
            {participant ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    className="flex items-center gap-2.5 pl-2 pr-3 py-1.5 rounded-full border border-[var(--border-default)] bg-[var(--card)] hover:border-[var(--pri)]/40 transition-all cursor-pointer shadow-sm text-left"
                  >
                    <div
                      className="h-7 w-7 rounded-full flex items-center justify-center text-xs font-black text-[var(--primary-contrast,#ffffff)] shadow-sm shrink-0 uppercase select-none"
                      style={{ backgroundColor: primaryHex }}
                    >
                      {getInitials(participant.name || participant.first_name)}
                    </div>
                    <div className="hidden md:block max-w-[120px] truncate">
                      <span className="text-xs font-black text-[var(--text)] block truncate">
                        {participant.name || `${participant.first_name || ""} ${participant.last_name || ""}`.trim() || "Participant"}
                      </span>
                      <span className="text-[10px] text-[var(--muted)] font-mono block -mt-0.5 truncate">
                        {participant.registration_number || participant.email || "Registered"}
                      </span>
                    </div>
                    <ChevronDown className="h-3.5 w-3.5 text-[var(--muted)]" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56 p-2 rounded-2xl bg-[var(--card)] border border-[var(--border-default)] shadow-xl">
                  <div className="p-2 border-b border-[var(--border-default)]">
                    <span className="text-xs font-black text-[var(--text)] block truncate">
                      {participant.name || `${participant.first_name || ""} ${participant.last_name || ""}`.trim()}
                    </span>
                    <span className="text-[10px] text-[var(--muted)] block truncate">
                      {participant.email}
                    </span>
                    <span className="inline-block mt-1 px-2 py-0.5 rounded-full bg-[var(--pri)]/10 text-[var(--pri)] text-[9px] font-black uppercase tracking-wider">
                      {participant.role || "Delegate"}
                    </span>
                  </div>

                  <DropdownMenuItem
                    onClick={() => router.push(`/${eventId}/dashboard`)}
                    className="p-2 rounded-xl text-xs font-semibold text-[var(--text)] hover:bg-[var(--bg-surface-2)] cursor-pointer flex items-center gap-2"
                  >
                    <QrCode className="h-4 w-4 text-[var(--pri)]" />
                    <span>My Entry Pass</span>
                  </DropdownMenuItem>

                  {isSpeaker && (
                    <DropdownMenuItem
                      onClick={() => router.push(`/${eventId}/speaker`)}
                      className="p-2 rounded-xl text-xs font-semibold text-[var(--text)] hover:bg-[var(--bg-surface-2)] cursor-pointer flex items-center gap-2"
                    >
                      <Presentation className="h-4 w-4 text-[var(--sec)]" />
                      <span>Speaker Workspace</span>
                    </DropdownMenuItem>
                  )}

                  <DropdownMenuSeparator className="my-1 bg-[var(--border-default)]" />

                  <DropdownMenuItem
                    onClick={handleLogout}
                    className="p-2 rounded-xl text-xs font-semibold text-rose-500 hover:bg-rose-500/10 cursor-pointer flex items-center gap-2"
                  >
                    <LogOut className="h-4 w-4" />
                    <span>Sign Out</span>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              !isAuthPage && (
                <Button
                  size="sm"
                  onClick={() => router.push(`/${eventId}/login`)}
                  className="rounded-xl text-xs font-bold bg-[var(--pri)] hover:opacity-95 text-[var(--primary-contrast,#ffffff)] shadow-sm px-4"
                >
                  Sign In
                </Button>
              )
            )}
          </div>
        </div>
      </header>

      {/* ── MAIN CONTENT AREA ──────────────────────────────────────────────── */}
      <main className="flex-1 w-full relative z-10">
        {children}
      </main>

      {/* ── FOOTER ─────────────────────────────────────────────────────────── */}
      <footer className="w-full border-t border-[var(--border-default)] bg-[var(--bg-base)]/80 backdrop-blur-md py-6 px-4 sm:px-6 relative z-10 shrink-0">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4 text-center sm:text-left">
          <div className="flex items-center gap-2 text-xs text-[var(--muted)]">
            <span>Powered by</span>
            <span className="font-black text-[var(--text)] tracking-wider">EVENTOS</span>
            <span>&bull;</span>
            <span>Official Conference Platform</span>
          </div>

          <div className="flex items-center gap-4 text-xs font-semibold text-[var(--muted)]">
            <button
              type="button"
              onClick={() => setTermsOpen(true)}
              className="hover:text-[var(--text)] transition-colors cursor-pointer"
            >
              Terms &amp; Conditions
            </button>
            <span>&bull;</span>
            <button
              type="button"
              onClick={() => setFaqOpen(true)}
              className="hover:text-[var(--text)] transition-colors cursor-pointer"
            >
              FAQs
            </button>
            <span>&bull;</span>
            <button
              type="button"
              onClick={() => setSupportOpen(true)}
              className="hover:text-[var(--text)] transition-colors cursor-pointer"
            >
              Support Desk
            </button>
          </div>
        </div>
      </footer>

      {/* ── DIALOG: TERMS & CONDITIONS ─────────────────────────────────────── */}
      <Dialog open={termsOpen} onOpenChange={setTermsOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto rounded-3xl bg-[var(--card)] border-2 border-[var(--border-default)] p-6 sm:p-8 space-y-4">
          <DialogHeader>
            <DialogTitle className="text-xl font-extrabold text-[var(--text)] flex items-center gap-2">
              <FileText className="h-5 w-5 text-[var(--pri)]" />
              <span>Event Terms &amp; Policies</span>
            </DialogTitle>
            <DialogDescription className="text-xs text-[var(--muted)]">
              Official attendee guidelines, admission policy, and refund regulations.
            </DialogDescription>
          </DialogHeader>

          <div className="text-xs text-[var(--text-secondary)] leading-relaxed space-y-4 pt-2">
            {dynamicTerms ? (
              /<[a-z][\s\S]*>/i.test(dynamicTerms) ? (
                <div
                  className="prose prose-sm dark:prose-invert max-w-none text-xs text-[var(--text-secondary)] space-y-3 leading-relaxed [&>ol]:list-decimal [&>ol]:pl-5 [&>ol]:space-y-2 [&>ul]:list-disc [&>ul]:pl-5 [&>ul]:space-y-1.5 [&>p]:mb-2.5 [&_strong]:text-[var(--text)] [&_strong]:font-black [&_h1]:text-base [&_h1]:font-black [&_h1]:text-[var(--text)] [&_h2]:text-sm [&_h2]:font-extrabold [&_h2]:text-[var(--text)] [&_h3]:text-xs [&_h3]:font-bold [&_h3]:text-[var(--text)]"
                  dangerouslySetInnerHTML={{ __html: dynamicTerms }}
                />
              ) : (
                <div className="prose prose-sm dark:prose-invert max-w-none text-xs text-[var(--text-secondary)] space-y-3 leading-relaxed [&>ol]:list-decimal [&>ol]:pl-5 [&>ol]:space-y-2 [&>ul]:list-disc [&>ul]:pl-5 [&>ul]:space-y-1.5 [&>p]:mb-2.5 [&_strong]:text-[var(--text)] [&_strong]:font-black [&_h1]:text-base [&_h1]:font-black [&_h1]:text-[var(--text)] [&_h2]:text-sm [&_h2]:font-extrabold [&_h2]:text-[var(--text)] [&_h3]:text-xs [&_h3]:font-bold [&_h3]:text-[var(--text)]">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                    {dynamicTerms}
                  </ReactMarkdown>
                </div>
              )
            ) : (
              <div className="space-y-3.5">
                <p>1. <strong className="text-[var(--text)] font-black">Admission &amp; Access:</strong> Official entry passes are non-transferable. Badges must be displayed at all times inside the conference halls and exhibition areas.</p>
                <p>2. <strong className="text-[var(--text)] font-black">Cancellations &amp; Refunds:</strong> Cancellation requests received up to 15 days before the event are eligible for a 75% refund. No refunds are provided for no-shows.</p>
                <p>3. <strong className="text-[var(--text)] font-black">Photography &amp; Recording:</strong> By attending, participants grant permission to be photographed and filmed for conference archival and promotional media.</p>
                <p>4. <strong className="text-[var(--text)] font-black">Code of Conduct:</strong> All attendees, faculty, and exhibitors must uphold professional and respectful conduct across all physical and digital conference spaces.</p>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* ── DIALOG: FAQS (INTERACTIVE ON-CLICK ACCORDION) ──────────────────── */}
      <Dialog open={faqOpen} onOpenChange={setFaqOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto rounded-3xl bg-[var(--card)] border-2 border-[var(--border-default)] p-6 sm:p-8 space-y-4">
          <DialogHeader>
            <DialogTitle className="text-xl font-extrabold text-[var(--text)] flex items-center gap-2">
              <HelpCircle className="h-5 w-5 text-[var(--pri)]" />
              <span>Frequently Asked Questions</span>
            </DialogTitle>
            <DialogDescription className="text-xs text-[var(--muted)]">
              Click on any question below to expand the answer.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2.5 pt-2">
            {dynamicFaqs.map((faq, idx) => {
              const isExpanded = expandedFaqs.includes(idx);
              return (
                <div
                  key={idx}
                  className="rounded-2xl border border-[var(--border-default)] bg-[var(--bg-surface-2)] overflow-hidden transition-all duration-200"
                >
                  <button
                    type="button"
                    onClick={() => toggleFaq(idx)}
                    className="w-full p-4 flex items-center justify-between gap-3 text-left hover:bg-[var(--bg-surface-hover)] transition-colors cursor-pointer"
                  >
                    <span className="text-xs font-bold text-[var(--text)]">
                      {faq.q}
                    </span>
                    <ChevronDown
                      className={`h-4 w-4 shrink-0 text-[var(--muted)] transition-transform duration-200 ${isExpanded ? "rotate-180 text-[var(--pri)]" : ""
                        }`}
                    />
                  </button>

                  <AnimatePresence initial={false}>
                    {isExpanded && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        className="overflow-hidden"
                      >
                        <div className="px-4 pb-4 pt-1 border-t border-[var(--border-default)] text-xs text-[var(--text-secondary)] leading-relaxed space-y-2">
                          {/<[a-z][\s\S]*>/i.test(faq.a) ? (
                            <div
                              className="prose prose-sm dark:prose-invert max-w-none text-xs text-[var(--text-secondary)] leading-relaxed [&_strong]:text-[var(--text)] [&_strong]:font-black"
                              dangerouslySetInnerHTML={{ __html: faq.a }}
                            />
                          ) : (
                            <ReactMarkdown remarkPlugins={[remarkGfm]}>
                              {faq.a}
                            </ReactMarkdown>
                          )}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              );
            })}
          </div>
        </DialogContent>
      </Dialog>

      {/* ── DIALOG: MULTI-CHANNEL SUPPORT DESK ─────────────────────────────── */}
      <Dialog open={supportOpen} onOpenChange={setSupportOpen}>
        <DialogContent className="max-w-md rounded-3xl bg-[var(--card)] border-2 border-[var(--border-default)] p-6 sm:p-8 space-y-5">
          <DialogHeader>
            <DialogTitle className="text-xl font-extrabold text-[var(--text)] flex items-center gap-2">
              <Mail className="h-5 w-5 text-[var(--pri)]" />
              <span>Contact Organiser Support</span>
            </DialogTitle>
            <DialogDescription className="text-xs text-[var(--muted)]">
              Need assistance with your registration, badge, payment, or session schedule?
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 pt-2">
            {supportEmail && (
              <a
                href={`mailto:${supportEmail}`}
                className="flex items-center gap-3 p-3.5 rounded-2xl border border-[var(--border-default)] bg-[var(--bg-surface-2)] hover:border-[var(--pri)]/40 hover:bg-[var(--pri)]/5 transition-all group"
              >
                <div className="h-9 w-9 rounded-xl bg-[var(--pri)]/10 text-[var(--pri)] flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                  <Mail className="h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--muted)] block">Email Support</span>
                  <span className="text-xs font-extrabold text-[var(--text)] truncate block font-mono">{supportEmail}</span>
                </div>
                <ExternalLink className="h-3.5 w-3.5 text-[var(--muted)] opacity-0 group-hover:opacity-100 transition-opacity" />
              </a>
            )}

            {supportPhone && (
              <a
                href={`tel:${supportPhone.replace(/[^0-9+]/g, '')}`}
                className="flex items-center gap-3 p-3.5 rounded-2xl border border-[var(--border-default)] bg-[var(--bg-surface-2)] hover:border-sky-500/40 hover:bg-sky-500/5 transition-all group"
              >
                <div className="h-9 w-9 rounded-xl bg-sky-500/10 text-sky-500 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                  <Phone className="h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--muted)] block">Phone Hotline</span>
                  <span className="text-xs font-extrabold text-[var(--text)] truncate block font-mono">{supportPhone}</span>
                </div>
                <ExternalLink className="h-3.5 w-3.5 text-[var(--muted)] opacity-0 group-hover:opacity-100 transition-opacity" />
              </a>
            )}

            {additionalContacts.map((c: any, idx: number) => {
              const type = (c.type || "").toLowerCase();
              const label = c.label || "Support Desk";
              const val = c.value || "";
              const cleanPhone = val.replace(/[^0-9+]/g, '');
              const waNumber = val.replace(/[^0-9]/g, '');

              if (type === "whatsapp" || label.toLowerCase().includes("whatsapp")) {
                return (
                  <a
                    key={idx}
                    href={`https://wa.me/${waNumber}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-3 p-3.5 rounded-2xl border border-[var(--border-default)] bg-[var(--bg-surface-2)] hover:border-emerald-500/40 hover:bg-emerald-500/5 transition-all group"
                  >
                    <div className="h-9 w-9 rounded-xl bg-emerald-500/10 text-emerald-500 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                      <svg className="h-4 w-4 fill-emerald-500" viewBox="0 0 24 24">
                        <path d="M12.031 2C6.496 2 2 6.496 2 12.031c0 1.83.493 3.618 1.43 5.183L2 22l4.912-1.397a10.003 10.003 0 0 0 5.119 1.428h.004c5.531 0 10.027-4.496 10.027-10.031 0-2.678-1.043-5.198-2.937-7.092A9.972 9.972 0 0 0 12.031 2zm0 18.232h-.003a8.214 8.214 0 0 1-4.184-1.144l-.3-.178-3.111.885.875-3.033-.195-.312A8.172 8.172 0 0 1 3.824 12.03c0-4.526 3.682-8.208 8.211-8.208 2.193 0 4.255.855 5.807 2.408a8.163 8.163 0 0 1 2.405 5.804c0 4.527-3.682 8.208-8.216 8.208zm4.5-6.148c-.247-.124-1.463-.722-1.69-.805-.227-.083-.392-.124-.557.124-.165.247-.64 1.805-.784.97-.144.165-.289.186-.536.062-.247-.124-1.044-.385-1.989-1.227-.735-.655-1.232-1.464-1.376-1.712-.144-.247-.015-.381.109-.504.111-.111.247-.289.371-.433.124-.144.165-.247.247-.412.083-.165.041-.309-.021-.433-.062-.124-.557-1.341-.763-1.836-.201-.482-.405-.417-.557-.425l-.474-.008c-.165 0-.433.062-.66.309-.227.247-.866.846-.866 2.063s.887 2.393 1.011 2.558c.124.165 1.745 2.665 4.228 3.738.591.256 1.053.409 1.413.523.594.189 1.134.162 1.561.098.477-.071 1.463-.598 1.669-1.176.206-.577.206-1.072.144-1.175-.062-.103-.227-.165-.474-.289z" />
                      </svg>
                    </div>
                    <div className="min-w-0 flex-1">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--muted)] block">{label}</span>
                      <span className="text-xs font-extrabold text-[var(--text)] truncate block font-mono">{val}</span>
                    </div>
                    <ExternalLink className="h-3.5 w-3.5 text-[var(--muted)] opacity-0 group-hover:opacity-100 transition-opacity" />
                  </a>
                );
              }

              if (type === "phone" || label.toLowerCase().includes("phone") || label.toLowerCase().includes("hotline")) {
                return (
                  <a
                    key={idx}
                    href={`tel:${cleanPhone}`}
                    className="flex items-center gap-3 p-3.5 rounded-2xl border border-[var(--border-default)] bg-[var(--bg-surface-2)] hover:border-sky-500/40 hover:bg-sky-500/5 transition-all group"
                  >
                    <div className="h-9 w-9 rounded-xl bg-sky-500/10 text-sky-500 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                      <Phone className="h-4 w-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--muted)] block">{label}</span>
                      <span className="text-xs font-extrabold text-[var(--text)] truncate block font-mono">{val}</span>
                    </div>
                    <ExternalLink className="h-3.5 w-3.5 text-[var(--muted)] opacity-0 group-hover:opacity-100 transition-opacity" />
                  </a>
                );
              }

              if (type === "email" || label.toLowerCase().includes("email") || val.includes("@")) {
                return (
                  <a
                    key={idx}
                    href={`mailto:${val}`}
                    className="flex items-center gap-3 p-3.5 rounded-2xl border border-[var(--border-default)] bg-[var(--bg-surface-2)] hover:border-[var(--pri)]/40 hover:bg-[var(--pri)]/5 transition-all group"
                  >
                    <div className="h-9 w-9 rounded-xl bg-[var(--pri)]/10 text-[var(--pri)] flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                      <Mail className="h-4 w-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--muted)] block">{label}</span>
                      <span className="text-xs font-extrabold text-[var(--text)] truncate block font-mono">{val}</span>
                    </div>
                    <ExternalLink className="h-3.5 w-3.5 text-[var(--muted)] opacity-0 group-hover:opacity-100 transition-opacity" />
                  </a>
                );
              }

              return (
                <div
                  key={idx}
                  className="flex items-center gap-3 p-3.5 rounded-2xl border border-[var(--border-default)] bg-[var(--bg-surface-2)]"
                >
                  <div className="h-9 w-9 rounded-xl bg-amber-500/10 text-amber-500 flex items-center justify-center shrink-0">
                    <LifeBuoy className="h-4 w-4" />
                  </div>
                  <div className="min-w-0">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--muted)] block">{label}</span>
                    <span className="text-xs font-extrabold text-[var(--text)] truncate block">{val}</span>
                  </div>
                </div>
              );
            })}

            {/* Permanent Platform Technical Desk */}
            {supportEmail !== "support@eventos.io" && (
              <a
                href="mailto:support@eventos.io"
                className="flex items-center gap-3 p-3.5 rounded-2xl border border-[var(--border-default)] bg-[var(--bg-surface-2)] hover:border-[var(--pri)]/40 hover:bg-[var(--pri)]/5 transition-all group"
              >
                <div className="h-9 w-9 rounded-xl bg-[var(--pri)]/10 text-[var(--pri)] flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                  <Shield className="h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--muted)] block">Platform Technical Desk</span>
                  <span className="text-xs font-extrabold text-[var(--text)] truncate block font-mono">support@eventos.io</span>
                </div>
                <ExternalLink className="h-3.5 w-3.5 text-[var(--muted)] opacity-0 group-hover:opacity-100 transition-opacity" />
              </a>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
