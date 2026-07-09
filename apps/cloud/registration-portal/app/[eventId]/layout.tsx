"use client";

import { useEffect, useState } from "react";
import { useParams, usePathname, useRouter } from "next/navigation";
import {
  Loader2, Calendar, MapPin, Globe, Mail, Phone, FileText,
  X, Check, HelpCircle, User, LogOut
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

const THEME_PRESETS: Record<string, { bg: string, surf: string, card: string, color: string, sec: string }> = {
  midnight: { bg: '#080410', surf: '#120924', card: '#1d0f3a', color: '#7c3aed', sec: '#a78bfa' },
  ocean: { bg: '#060f1e', surf: '#0a182f', card: '#112547', color: '#0ea5e9', sec: '#38bdf8' },
  emerald: { bg: '#040f0c', surf: '#071914', card: '#0f2a22', color: '#10b981', sec: '#34d399' },
  sunset: { bg: '#0f0b04', surf: '#181107', card: '#2a1d0c', color: '#f59e0b', sec: '#fbbf24' },
  rose: { bg: '#0f0508', surf: '#190a10', card: '#2a101b', color: '#f43f5e', sec: '#fb7185' },
  slate: { bg: '#0b0f17', surf: '#151e2e', card: '#202c3f', color: '#94a3b8', sec: '#cbd5e1' },
};

const DEFAULT_BANNERS = [
  "/header/1.jpg",
  "/header/2.jpg",
  "/header/3.jpg"
];

interface EventLayoutProps {
  children: React.ReactNode;
}

// ── JWT decoder helper ──────────────────────────────────────────
function decodeJwt(token: string) {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const base64Url = parts[1];
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const jsonPayload = decodeURIComponent(
      atob(base64)
        .split('')
        .map(c => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join('')
    );
    return JSON.parse(jsonPayload);
  } catch (e) {
    return null;
  }
}

export default function EventPortalLayout({
  children,
}: EventLayoutProps) {
  const { eventId } = useParams<{ eventId: string }>();
  const pathname = usePathname();
  const router = useRouter();

  const [themeColors, setThemeColors] = useState(THEME_PRESETS.midnight);
  const [config, setConfig] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [activeSlide, setActiveSlide] = useState(0);
  const [attendeeEmail, setAttendeeEmail] = useState<string | null>(null);

  // Modals state
  const [termsModalOpen, setTermsModalOpen] = useState(false);
  const [faqModalOpen, setFaqModalOpen] = useState(false);
  const [faqOpenIndex, setFaqOpenIndex] = useState<number | null>(null);

  // Fetch event config
  useEffect(() => {
    if (!eventId) return;
    const apiBase = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";

    fetch(`${apiBase}/api/v1/portal/registration/${eventId}/form`)
      .then(res => {
        if (!res.ok) throw new Error("Failed to load branding");
        return res.json();
      })
      .then(data => {
        setConfig(data);
        const themeId = data?.branding_settings?.theme || 'midnight';
        setThemeColors(THEME_PRESETS[themeId] || THEME_PRESETS.midnight);
        setLoading(false);
      })
      .catch(err => {
        console.error("Layout branding fetch failed", err);
        // Fallback to avoid stuck loading screen
        setConfig({
          event_name: "Event",
          is_live: true,
          branding_settings: {
            theme: "midnight",
            header_images: DEFAULT_BANNERS,
            footer_show_logo: true,
          }
        });
        setThemeColors(THEME_PRESETS.midnight);
        setLoading(false);
      });
  }, [eventId]);

  // Slideshow interval handler
  useEffect(() => {
    const banners = (config?.branding_settings?.header_images && config.branding_settings.header_images.length > 0)
      ? config.branding_settings.header_images
      : DEFAULT_BANNERS;

    if (banners.length <= 1) return;
    const interval = setInterval(() => {
      setActiveSlide(prev => (prev + 1) % banners.length);
    }, 5000);
    return () => clearInterval(interval);
  }, [config]);

  // Attendee login state sync based on path changes
  useEffect(() => {
    if (!eventId) return;
    const token = localStorage.getItem(`portal_token_${eventId}`);
    if (token) {
      const payload = decodeJwt(token);
      if (payload && payload.email) {
        setAttendeeEmail(payload.email);
      } else {
        setAttendeeEmail(null);
      }
    } else {
      setAttendeeEmail(null);
    }
  }, [pathname, eventId]);

  const handleLogout = () => {
    if (!eventId) return;
    localStorage.removeItem(`portal_token_${eventId}`);
    setAttendeeEmail(null);
    router.push(`/${eventId}/login`);
  };

  const formatHeaderDateRange = (startStr: string | null, endStr: string | null) => {
    if (!startStr) return "";
    try {
      const start = new Date(startStr);
      if (isNaN(start.getTime())) return "";

      const monthNames = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
      const startDay = String(start.getDate()).padStart(2, '0');
      const startMonth = monthNames[start.getMonth()];
      const startYear = start.getFullYear();

      if (!endStr) {
        return `${startDay} ${startMonth} ${startYear}`;
      }

      const end = new Date(endStr);
      if (isNaN(end.getTime()) || start.toDateString() === end.toDateString()) {
        return `${startDay} ${startMonth} ${startYear}`;
      }

      const endDay = String(end.getDate()).padStart(2, '0');
      const endMonth = monthNames[end.getMonth()];
      const endYear = end.getFullYear();

      if (startYear !== endYear) {
        return `${startDay} ${startMonth} ${startYear} - ${endDay} ${endMonth} ${endYear}`;
      }

      if (startMonth !== endMonth) {
        return `${startDay} ${startMonth} - ${endDay} ${endMonth} ${startYear}`;
      }

      return `${startDay} - ${endDay} ${startMonth} ${startYear}`;
    } catch (e) {
      return "";
    }
  };

  const formatHeaderVenue = (conf: any) => {
    const parts: string[] = [];
    if (conf.venue_name) parts.push(conf.venue_name);
    if (conf.location) parts.push(conf.location);
    if (conf.state) parts.push(conf.state);
    if (conf.country) parts.push(conf.country);
    return parts.join(", ");
  };

  if (loading || !config) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#080912]">
        <Loader2 className="h-8 w-8 text-indigo-400 animate-spin" />
      </div>
    );
  }

  const activeBanners = (config.branding_settings?.header_images && config.branding_settings.header_images.length > 0)
    ? config.branding_settings.header_images
    : DEFAULT_BANNERS;

  const logoUrl = config.branding_settings?.logo_url || config.logo_url || "/logo/1.png";

  return (
    <>
      <style dangerouslySetInnerHTML={{
        __html: `
        :root {
          --base: ${themeColors.bg};
          --surf: ${themeColors.surf};
          --card: ${themeColors.card};
          --pri: ${themeColors.color};
          --sec: ${themeColors.sec};
        }
        
        body, .min-h-screen {
          background-color: var(--base) !important;
        }

        .bg-\\[\\#0d0e1b\\] { background-color: var(--card) !important; }
        .bg-\\[\\#0d0e1b\\]\\/80 { background-color: color-mix(in srgb, var(--card) 80%, transparent) !important; }
        .bg-\\[\\#0d0e1b\\]\\/85 { background-color: color-mix(in srgb, var(--card) 85%, transparent) !important; }
        .bg-\\[\\#080912\\] { background-color: var(--base) !important; }
        option.bg-\\[\\#080912\\] { background-color: var(--card) !important; }
        
        .text-indigo-300 { color: color-mix(in srgb, var(--sec) 80%, white) !important; }
        .text-indigo-300\\/80 { color: color-mix(in srgb, var(--sec) 60%, white) !important; }
        .text-indigo-400 { color: var(--sec) !important; }
        .text-indigo-500 { color: var(--pri) !important; }
        
        .bg-indigo-500 { background-color: var(--pri) !important; }
        .bg-indigo-500\\/10 { background-color: color-mix(in srgb, var(--pri) 10%, transparent) !important; }
        .bg-indigo-600\\/10 { background-color: color-mix(in srgb, var(--pri) 10%, transparent) !important; }
        .bg-indigo-950\\/5 { background-color: color-mix(in srgb, var(--base) 5%, transparent) !important; }
        
        .border-indigo-500 { border-color: var(--pri) !important; }
        .border-indigo-500\\/20 { border-color: color-mix(in srgb, var(--pri) 20%, transparent) !important; }
        .border-indigo-500\\/30 { border-color: color-mix(in srgb, var(--pri) 30%, transparent) !important; }
        
        .focus\\:border-indigo-500:focus { border-color: var(--pri) !important; }
        .focus\\:ring-indigo-500\\/20:focus { --tw-ring-color: color-mix(in srgb, var(--pri) 20%, transparent) !important; }
        
        .shadow-\\[0_0_15px_rgba\\(99\\,102\\,241\\,0\\.5\\)\\] { box-shadow: 0 0 15px color-mix(in srgb, var(--pri) 50%, transparent) !important; }
        .shadow-\\[0_0_10px_rgba\\(99\\,102\\,241\\,0\\.2\\)\\] { box-shadow: 0 0 10px color-mix(in srgb, var(--pri) 20%, transparent) !important; }
        
        .selection\\:bg-indigo-500\\/30 *::selection { background-color: color-mix(in srgb, var(--pri) 30%, transparent) !important; }
      `}} />

      <div className="min-h-screen bg-[var(--base)] text-[var(--text)] transition-colors duration-300 flex flex-col items-center w-full">

        {/* ── Global Header Navigation Bar ── */}
        <nav className="w-full sticky top-0 z-50 border-b border-white/5 backdrop-blur-xl bg-black/40 py-4 px-4 md:px-8 lg:px-16 flex items-center justify-between shrink-0 shadow-md">
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 bg-white/5 border border-white/10 rounded-lg p-1 flex items-center justify-center shrink-0">
              <img
                src={logoUrl}
                alt="Logo"
                className="max-h-full max-w-full object-contain"
              />
            </div>
            <div className="text-left">
              <span className="text-[8px] font-black text-indigo-400 uppercase tracking-[0.3em] block">
                Registration Portal
              </span>
              <h1 className="text-sm font-black text-[#E8EAFF] tracking-tight leading-tight max-w-[200px] sm:max-w-xs truncate">
                {config.event_name}
              </h1>
            </div>
          </div>
          <div className="flex items-center gap-4">
            {attendeeEmail && (
              <div className="hidden sm:flex items-center gap-2 bg-white/5 border border-white/5 px-3 py-1.5 rounded-full">
                <User className="h-3.5 w-3.5 text-indigo-400" />
                <span className="text-[10px] font-black text-[#E8EAFF] tracking-wide max-w-[150px] truncate">{attendeeEmail}</span>
              </div>
            )}
            {attendeeEmail && (
              <button
                onClick={handleLogout}
                className="flex items-center gap-1.5 text-xs font-black text-[var(--muted)] hover:text-[#E8EAFF] transition-colors px-3 py-2 rounded-xl hover:bg-white/5"
              >
                <LogOut className="h-4 w-4 text-indigo-400" />Logout
              </button>
            )}
          </div>
        </nav>

        {/* ── Global Header Slideshow Banner Wrapper (Full-Width, No Whitespaces) ── */}
        <div className="w-full shrink-0">
          <div className="w-full relative overflow-hidden min-h-[280px] md:min-h-[360px] flex items-end p-8 md:p-12 border-b border-white/10 shadow-2xl glass-3d">
            <div className="absolute inset-0 z-0">
              {activeBanners.map((imgUrl: string, idx: number) => (
                <motion.div
                  key={imgUrl}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: activeSlide === idx ? 1 : 0 }}
                  transition={{ duration: 1 }}
                  className="absolute inset-0 bg-cover bg-center"
                  style={{ backgroundImage: `url(${imgUrl})` }}
                />
              ))}
              <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/40 to-black/20 z-10" />
            </div>

            <div className="relative z-20 w-full max-w-7xl mx-auto px-4 md:px-8 lg:px-16 flex flex-col md:flex-row md:items-center justify-between gap-6 text-left">
              <div className="flex items-center gap-5">
                <div className="h-16 w-16 md:h-20 md:w-20 bg-white/10 backdrop-blur-md rounded-2xl p-2.5 flex items-center justify-center border border-white/10 shadow-lg">
                  <img
                    src={logoUrl}
                    alt="Event Logo"
                    className="max-h-full max-w-full object-contain"
                  />
                </div>
                <div>
                  <span className="text-[9px] font-black tracking-[0.3em] uppercase text-indigo-300 bg-indigo-500/10 border border-indigo-500/20 px-3 py-1 rounded-full">
                    OFFICIAL PORTAL
                  </span>
                  <h1 className="text-2xl md:text-4xl font-black text-white tracking-tighter leading-tight uppercase mt-2">
                    {config.event_name}
                  </h1>
                  <p className="text-[9px] font-black uppercase tracking-[0.3em] text-indigo-300/80 mt-1 pl-1">
                    Powered by EventX OS
                  </p>
                </div>
              </div>

              <div className="flex flex-col gap-2.5 bg-black/40 backdrop-blur border border-white/5 p-4 rounded-2xl md:min-w-[240px]">
                {config.start_date && (
                  <div className="flex items-center gap-2">
                    <Calendar className="h-4 w-4 text-indigo-400 shrink-0" />
                    <span className="text-[10px] font-bold text-[#E8EAFF]">
                      {formatHeaderDateRange(config.start_date, config.end_date)}
                    </span>
                  </div>
                )}
                {(config.venue_name || config.location) && (
                  <div className="flex items-center gap-2">
                    <MapPin className="h-4 w-4 text-indigo-400 shrink-0" />
                    <span className="text-[10px] font-bold text-[#E8EAFF] line-clamp-2">
                      {formatHeaderVenue(config)}
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* ── Page Content Wrapper ── */}
        <div className="w-full max-w-7xl px-4 md:px-8 lg:px-16 py-8 flex flex-col items-center flex-grow">
          {/* ── Page Content ── */}
          <main className="w-full flex-1 flex flex-col items-center justify-start z-10">
            {children}
          </main>
        </div>

        {/* ── Premium Flush Footer (Full-Width) ── */}
        <footer className="w-full mt-auto bg-black/40 backdrop-blur-xl border-t border-white/10 px-4 md:px-8 lg:px-16 py-8 md:py-12 text-left text-xs text-muted z-10 relative overflow-hidden group">
          {/* Ambient footer glow decoration */}
          <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-500/5 rounded-full blur-3xl pointer-events-none group-hover:bg-indigo-500/10 transition-colors duration-500" />
          <div className="max-w-7xl mx-auto grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-8 md:gap-10 relative z-10 items-start">
            {/* Column 1: Logo — dedicated left column, full size in window container */}
            {config.branding_settings?.footer_show_logo !== false && (
              <div className="flex items-start justify-start w-full">
                <div className="w-full aspect-[3/1] md:aspect-[4/1.5] max-h-24 bg-[#0d0e1b]/60 border border-white/10 rounded-2xl p-4 flex items-center justify-center overflow-hidden shadow-2xl relative group/logo">
                  <div className="absolute inset-0 bg-gradient-to-tr from-indigo-500/5 to-purple-500/5 opacity-0 group-hover/logo:opacity-100 transition-opacity duration-500" />
                  <img
                    src={logoUrl}
                    alt="Footer Logo"
                    className="w-full h-full object-contain filter drop-shadow-[0_2px_8px_rgba(99,102,241,0.2)] opacity-95 transition-all duration-300 group-hover/logo:scale-105"
                  />
                </div>
              </div>
            )}

            {/* Column 2: Event Info */}
            <div className="space-y-3">
              <span className="font-black uppercase tracking-wider text-[#E8EAFF] text-xs block">{config.event_name || "EventX OS Portal"}</span>
              <p className="leading-relaxed text-[11px] text-muted/80">
                Secure, premium public registration and attendee portal. Manage your pass, speaker session assets, and event updates in real-time.
              </p>
            </div>

            {/* Column 3: Information Category */}
            <div className="space-y-4">
              <span className="text-[10px] font-black uppercase tracking-widest text-[#E8EAFF] block">
                Information Category
              </span>
              <ul className="space-y-2 text-[11px] font-bold">
                <li>
                  <button onClick={() => setTermsModalOpen(true)} className="hover:text-indigo-400 transition-colors uppercase tracking-wider text-left">
                    Terms &amp; Conditions
                  </button>
                </li>
                <li>
                  <button onClick={() => setFaqModalOpen(true)} className="hover:text-indigo-400 transition-colors uppercase tracking-wider text-left">
                    Frequently Asked Questions (FAQ)
                  </button>
                </li>
              </ul>
            </div>

            {/* Column 4: Contact Details */}
            <div className="space-y-4 text-left">
              <span className="text-[10px] font-black uppercase tracking-widest text-[#E8EAFF] block">
                Contact Details
              </span>
              <div className="space-y-2.5 text-[11px]">
                {/* Support Emails */}
                {config.branding_settings?.footer_support_emails && config.branding_settings.footer_support_emails.length > 0 ? (
                  config.branding_settings.footer_support_emails.map((email: string, idx: number) => (
                    <div key={`email-${idx}`} className="flex items-center gap-2">
                      <Mail className="h-4 w-4 text-indigo-400 shrink-0" />
                      <a href={`mailto:${email}`} className="text-muted hover:text-[#E8EAFF] transition-colors">
                        {email}
                      </a>
                    </div>
                  ))
                ) : (
                  (config.branding_settings?.footer_support_email || config.support_email) ? (
                    <div className="flex items-center gap-2">
                      <Mail className="h-4 w-4 text-indigo-400 shrink-0" />
                      <a href={`mailto:${config.branding_settings?.footer_support_email || config.support_email}`} className="text-muted hover:text-[#E8EAFF] transition-colors">
                        {config.branding_settings?.footer_support_email || config.support_email}
                      </a>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <Mail className="h-4 w-4 text-indigo-400 shrink-0" />
                      <a href="mailto:support@eventos.com" className="text-muted hover:text-[#E8EAFF] transition-colors">
                        support@eventos.com
                      </a>
                    </div>
                  )
                )}

                {/* Support Phones */}
                {config.branding_settings?.footer_support_phones && config.branding_settings.footer_support_phones.length > 0 ? (
                  config.branding_settings.footer_support_phones.map((phone: string, idx: number) => (
                    <div key={`phone-${idx}`} className="flex items-center gap-2">
                      <Phone className="h-4 w-4 text-indigo-400 shrink-0" />
                      <span className="text-muted">{phone}</span>
                    </div>
                  ))
                ) : (
                  (config.branding_settings?.footer_support_phone || config.branding_settings?.support_phone) ? (
                    <div className="flex items-center gap-2">
                      <Phone className="h-4 w-4 text-indigo-400 shrink-0" />
                      <span className="text-muted">
                        {config.branding_settings?.footer_support_phone || config.branding_settings?.support_phone}
                      </span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <Phone className="h-4 w-4 text-indigo-400 shrink-0" />
                      <span className="text-muted">011-123456789</span>
                    </div>
                  )
                )}

                {/* Websites */}
                {config.branding_settings?.footer_websites && config.branding_settings.footer_websites.length > 0 && (
                  config.branding_settings.footer_websites.map((web: string, idx: number) => {
                    const displayWeb = web.replace(/^https?:\/\//i, '');
                    return (
                      <div key={`web-${idx}`} className="flex items-center gap-2">
                        <Globe className="h-4 w-4 text-indigo-400 shrink-0" />
                        <a href={web.startsWith('http') ? web : `https://${web}`} target="_blank" rel="noopener noreferrer" className="text-muted hover:text-[#E8EAFF] transition-colors truncate max-w-[200px]">
                          {displayWeb}
                        </a>
                      </div>
                    );
                  })
                )}

                {/* Locations / Venues */}
                {config.branding_settings?.footer_locations && config.branding_settings.footer_locations.length > 0 && (
                  config.branding_settings.footer_locations.map((loc: string, idx: number) => (
                    <div key={`loc-${idx}`} className="flex items-center gap-2">
                      <MapPin className="h-4 w-4 text-indigo-400 shrink-0" />
                      <span className="text-muted leading-relaxed line-clamp-2">{loc}</span>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>

          {/* Company Branding Divider & Powered By */}
          <div className="max-w-7xl mx-auto mt-8 pt-8 border-t border-white/10 relative z-10 flex flex-col sm:flex-row items-center justify-between gap-4">
            <p className="text-[10px] text-muted/50 font-bold uppercase tracking-wider">
              © {new Date().getFullYear()} {config.event_name || "Conference"}. All rights reserved.
            </p>
            <div className="flex items-center gap-2.5 text-muted/60">
              <span className="text-[10px] font-extrabold uppercase tracking-[0.2em]">Powered by</span>
              <div className="flex items-center gap-1.5 bg-white/5 px-3 py-1.5 rounded-full border border-white/5 hover:border-indigo-500/30 hover:bg-white/10 transition-all cursor-default select-none shadow-[0_0_10px_rgba(99,102,241,0.05)]">
                <svg className="h-4 w-4 text-indigo-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polygon points="12 2 2 7 12 12 22 7 12 2" />
                  <polyline points="2 17 12 22 22 17" />
                  <polyline points="2 12 12 17 22 12" />
                </svg>
                <span className="text-xs font-black text-[#E8EAFF] tracking-tight uppercase">Event<span className="text-indigo-400">OS</span></span>
              </div>
            </div>
          </div>
        </footer>

        {/* ── Terms and Conditions Modal ── */}
        <AnimatePresence>
          {termsModalOpen && (
            <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                onClick={() => setTermsModalOpen(false)} className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
              <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
                className="relative w-full max-w-2xl bg-[#0d0e1b] border border-indigo-500/20 rounded-[2.5rem] shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
                <div className="flex justify-between items-center px-8 py-5 border-b border-white/5 shrink-0 bg-white/[0.01]">
                  <div className="flex items-center gap-2">
                    <FileText className="h-4 w-4 text-indigo-400" />
                    <h3 className="text-sm font-black uppercase tracking-[0.25em] text-[#E8EAFF]">Terms &amp; Conditions</h3>
                  </div>
                  <button onClick={() => setTermsModalOpen(false)} className="h-8 w-8 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center text-muted hover:text-[#E8EAFF] transition-all">
                    <X className="h-4 w-4" />
                  </button>
                </div>
                <div className="p-8 overflow-y-auto custom-scrollbar text-left flex-1">
                  {config.terms_and_conditions || config.branding_settings?.footer_terms ? (
                    <div className="prose prose-invert max-w-none text-left tnc-markdown
                      prose-headings:text-[#E8EAFF] prose-headings:font-black prose-headings:tracking-tight
                      prose-h1:text-xl prose-h2:text-base prose-h3:text-sm prose-h4:text-xs
                      prose-p:text-muted prose-p:text-sm prose-p:leading-relaxed
                      prose-li:text-muted prose-li:text-sm
                      prose-strong:text-[#E8EAFF] prose-em:text-indigo-300
                      prose-a:text-indigo-400 prose-a:no-underline hover:prose-a:underline
                      prose-hr:border-white/10 prose-ul:space-y-1 prose-ol:space-y-1">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>
                        {config.terms_and_conditions || config.branding_settings?.footer_terms}
                      </ReactMarkdown>
                    </div>
                  ) : (
                    <p className="text-xs text-muted font-semibold">No special guidelines configured for this event. Regular event terms apply.</p>
                  )}
                </div>
                <div className="px-8 py-5 border-t border-white/5 bg-white/[0.01] shrink-0">
                  <button
                    type="button"
                    onClick={() => setTermsModalOpen(false)}
                    className="w-full h-11 rounded-full btn-primary text-xs font-black uppercase tracking-widest"
                  >
                    Close
                  </button>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

        {/* ── FAQ Modal ── */}
        <AnimatePresence>
          {faqModalOpen && (
            <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                onClick={() => setFaqModalOpen(false)} className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
              <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
                className="relative w-full max-w-2xl bg-[#0F1228] border border-white/10 rounded-[2.5rem] shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
                <div className="flex justify-between items-center px-8 py-5 border-b border-white/5 shrink-0 bg-white/[0.01]">
                  <div className="flex items-center gap-2">
                    <HelpCircle className="h-4 w-4 text-indigo-400" />
                    <h3 className="text-sm font-black uppercase tracking-wider text-[#E8EAFF]">Frequently Asked Questions</h3>
                  </div>
                  <button onClick={() => setFaqModalOpen(false)} className="text-muted hover:text-white transition-colors">
                    <X className="h-5 w-5" />
                  </button>
                </div>
                <div className="p-8 overflow-y-auto custom-scrollbar text-left text-xs text-muted font-bold space-y-4">
                  {config.faqs && config.faqs.length > 0 ? (
                    <div className="space-y-3.5">
                      {config.faqs.map((faq: any, idx: number) => {
                        const isOpen = faqOpenIndex === idx;
                        return (
                          <div key={idx} className="border border-white/5 rounded-2xl bg-white/[0.01] overflow-hidden transition-all duration-300">
                            <button onClick={() => setFaqOpenIndex(isOpen ? null : idx)}
                              className="w-full px-6 py-4 flex items-center justify-between text-left focus:outline-none hover:bg-white/[0.02]">
                              <span className="text-[#E8EAFF] font-black uppercase tracking-wider text-[11px] pr-4">{faq.q}</span>
                              <span className="text-indigo-400 font-extrabold shrink-0 text-sm">{isOpen ? "−" : "+"}</span>
                            </button>
                            <AnimatePresence initial={false}>
                              {isOpen && (
                                <motion.div initial={{ height: 0 }} animate={{ height: "auto" }} exit={{ height: 0 }}
                                  className="overflow-hidden">
                                  <div className="px-6 pb-5 pt-1 text-[11px] leading-relaxed text-muted font-medium border-t border-white/5">
                                    {faq.a}
                                  </div>
                                </motion.div>
                              )}
                            </AnimatePresence>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <p>No questions listed yet for this event.</p>
                  )}
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>
      </div>
    </>
  );
}
