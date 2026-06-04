"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Calendar, MapPin, Globe, Mail, Phone } from "lucide-react";
import { SpeakerBrandingSettings } from "@/hooks/usePortal";

export const THEME_PRESETS: Record<string, { bg: string; surf: string; card: string; color: string; sec: string }> = {
  midnight: { bg: "#080410", surf: "#120924", card: "#1d0f3a", color: "#7c3aed", sec: "#a78bfa" },
  ocean:    { bg: "#060f1e", surf: "#0a182f", card: "#112547", color: "#0ea5e9", sec: "#38bdf8" },
  emerald:  { bg: "#040f0c", surf: "#071914", card: "#0f2a22", color: "#10b981", sec: "#34d399" },
  sunset:   { bg: "#0f0b04", surf: "#181107", card: "#2a1d0c", color: "#f59e0b", sec: "#fbbf24" },
  rose:     { bg: "#0f0508", surf: "#190a10", card: "#2a101b", color: "#f43f5e", sec: "#fb7185" },
  slate:    { bg: "#0b0f17", surf: "#151e2e", card: "#202c3f", color: "#94a3b8", sec: "#cbd5e1" },
};

const DEFAULT_BANNERS = ["/header/1.jpg", "/header/2.jpg", "/header/3.jpg"];

interface SpeakerPortalLayoutProps {
  children: React.ReactNode;
  branding: SpeakerBrandingSettings;
  eventName?: string;
  startDate?: string | null;
  endDate?: string | null;
  location?: string | null;
  venueName?: string | null;
  country?: string | null;
  organizerName?: string | null;
}

function formatDateRange(startStr?: string | null, endStr?: string | null) {
  if (!startStr) return "";
  try {
    const start = new Date(startStr);
    if (isNaN(start.getTime())) return "";
    const months = ["JAN","FEB","MAR","APR","MAY","JUN","JUL","AUG","SEP","OCT","NOV","DEC"];
    const sDay = String(start.getDate()).padStart(2, "0");
    const sMon = months[start.getMonth()];
    const sYear = start.getFullYear();
    if (!endStr) return `${sDay} ${sMon} ${sYear}`;
    const end = new Date(endStr);
    if (isNaN(end.getTime()) || start.toDateString() === end.toDateString()) return `${sDay} ${sMon} ${sYear}`;
    const eDay = String(end.getDate()).padStart(2, "0");
    const eMon = months[end.getMonth()];
    const eYear = end.getFullYear();
    if (sYear !== eYear) return `${sDay} ${sMon} ${sYear} – ${eDay} ${eMon} ${eYear}`;
    if (sMon !== eMon) return `${sDay} ${sMon} – ${eDay} ${eMon} ${sYear}`;
    return `${sDay} – ${eDay} ${sMon} ${sYear}`;
  } catch { return ""; }
}

export function SpeakerPortalLayout({
  children,
  branding,
  eventName,
  startDate,
  endDate,
  location,
  venueName,
  country,
  organizerName,
}: SpeakerPortalLayoutProps) {
  const [activeSlide, setActiveSlide] = useState(0);
  const themeId = branding?.theme || "midnight";
  const theme = THEME_PRESETS[themeId] || THEME_PRESETS.midnight;

  const banners =
    branding?.header_images && branding.header_images.length > 0
      ? branding.header_images
      : DEFAULT_BANNERS;

  const logoUrl = branding?.logo_url || "/logo/1.png";
  const dateRange = formatDateRange(startDate, endDate);

  const venue = [venueName, location, country].filter(Boolean).join(", ");

  // Slideshow interval
  useEffect(() => {
    if (banners.length <= 1) return;
    const id = setInterval(() => setActiveSlide((p) => (p + 1) % banners.length), 5000);
    return () => clearInterval(id);
  }, [banners]);

  const footerEmails = branding?.footer_support_emails || [];
  const footerPhones = branding?.footer_support_phones || [];
  const footerWebsites = branding?.footer_websites || [];
  const footerLocations = branding?.footer_locations || [];
  const showFooterLogo = branding?.footer_show_logo !== false;
  const hasFooterContent =
    footerEmails.length > 0 || footerPhones.length > 0 ||
    footerWebsites.length > 0 || footerLocations.length > 0 ||
    showFooterLogo;

  return (
    <>
      {/* Inject CSS custom properties */}
      <style dangerouslySetInnerHTML={{ __html: `
        :root {
          --base: ${theme.bg};
          --surf: ${theme.surf};
          --card: ${theme.card};
          --pri: ${theme.color};
          --sec: ${theme.sec};
        }
        body, .min-h-screen { background-color: var(--base) !important; }
        .text-indigo-400 { color: var(--sec) !important; }
        .text-indigo-500 { color: var(--pri) !important; }
        .bg-indigo-500   { background-color: var(--pri) !important; }
        .bg-indigo-500\\/10 { background-color: color-mix(in srgb, var(--pri) 10%, transparent) !important; }
        .border-indigo-500 { border-color: var(--pri) !important; }
        .focus\\:ring-indigo-500\\/20:focus { box-shadow: 0 0 0 3px color-mix(in srgb, var(--pri) 20%, transparent) !important; }
        .bg-indigo-600\\/20 { background-color: color-mix(in srgb, var(--pri) 20%, transparent) !important; }
        .from-indigo-500 { --tw-gradient-from: var(--pri) !important; }
        .to-purple-600   { --tw-gradient-to: var(--sec) !important; }
      ` }} />

      {/* Header Slideshow Banner */}
      <div className="relative w-full h-[260px] md:h-[320px] overflow-hidden">
        <div className="absolute inset-0 z-0">
          {banners.map((src, i) => (
            <motion.div
              key={src + i}
              initial={{ opacity: 0 }}
              animate={{ opacity: activeSlide === i ? 1 : 0 }}
              transition={{ duration: 1.2 }}
              className="absolute inset-0 bg-cover bg-center"
              style={{ backgroundImage: `url(${src})` }}
            />
          ))}
          {/* Gradient overlay */}
          <div className="absolute inset-0 bg-gradient-to-b from-black/30 via-black/40 to-[var(--base)] z-10" />
        </div>

        {/* Event meta overlay */}
        <div className="absolute bottom-0 left-0 right-0 px-6 md:px-16 pb-8 flex items-end justify-between gap-6 z-20">
          <div className="flex items-center gap-5">
            {/* Logo */}
            <div className="h-16 w-16 rounded-2xl bg-white/10 backdrop-blur-md border border-white/20 flex items-center justify-center overflow-hidden shadow-2xl shrink-0">
              <img
                src={logoUrl}
                alt="Event Logo"
                className="h-full w-full object-contain p-1"
                onError={(e) => {
                  (e.currentTarget as HTMLImageElement).style.display = "none";
                }}
              />
            </div>
            <div>
              {eventName && (
                <h2 className="text-white font-black text-xl md:text-2xl tracking-tight leading-tight drop-shadow-lg">
                  {eventName}
                </h2>
              )}
              {organizerName && (
                <p className="text-white/70 text-[11px] font-bold uppercase tracking-widest mt-0.5">
                  {organizerName}
                </p>
              )}
            </div>
          </div>

          {/* Date + Venue chips */}
          <div className="flex flex-wrap gap-2 justify-end">
            {dateRange && (
              <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-black/40 backdrop-blur-md border border-white/15 text-white/90 text-[11px] font-black uppercase tracking-wider">
                <Calendar className="h-3 w-3" /> {dateRange}
              </span>
            )}
            {venue && (
              <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-black/40 backdrop-blur-md border border-white/15 text-white/90 text-[11px] font-black uppercase tracking-wider max-w-[220px] truncate">
                <MapPin className="h-3 w-3 shrink-0" /> {venue}
              </span>
            )}
          </div>
        </div>

        {/* Slide dots */}
        {banners.length > 1 && (
          <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-1.5 z-20">
            {banners.map((_, i) => (
              <button
                key={i}
                onClick={() => setActiveSlide(i)}
                className={`h-1.5 rounded-full transition-all duration-300 ${
                  i === activeSlide ? "w-6 bg-white" : "w-1.5 bg-white/30"
                }`}
              />
            ))}
          </div>
        )}
      </div>

      {/* Main content */}
      <main>{children}</main>

      {/* Footer */}
      {hasFooterContent && (
        <footer className="mt-16 border-t border-white/5 py-10 px-6 md:px-16">
          <div className="max-w-5xl mx-auto">
            <div className="flex flex-col md:flex-row items-start gap-8">
              {showFooterLogo && (
                <div className="shrink-0">
                  <img
                    src={logoUrl}
                    alt="Logo"
                    className="h-10 w-auto object-contain opacity-70"
                    onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
                  />
                </div>
              )}
              <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-4">
                {footerEmails.map((e) => (
                  <a key={e} href={`mailto:${e}`} className="flex items-center gap-2 text-[12px] font-bold text-muted hover:text-[var(--sec)] transition-colors">
                    <Mail className="h-3.5 w-3.5 text-[var(--pri)] shrink-0" /> {e}
                  </a>
                ))}
                {footerPhones.map((p) => (
                  <span key={p} className="flex items-center gap-2 text-[12px] font-bold text-muted">
                    <Phone className="h-3.5 w-3.5 text-[var(--pri)] shrink-0" /> {p}
                  </span>
                ))}
                {footerWebsites.map((w) => (
                  <a key={w} href={w} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-[12px] font-bold text-muted hover:text-[var(--sec)] transition-colors">
                    <Globe className="h-3.5 w-3.5 text-[var(--pri)] shrink-0" /> {w.replace(/^https?:\/\//, "")}
                  </a>
                ))}
                {footerLocations.map((l) => (
                  <span key={l} className="flex items-center gap-2 text-[12px] font-bold text-muted">
                    <MapPin className="h-3.5 w-3.5 text-[var(--pri)] shrink-0" /> {l}
                  </span>
                ))}
              </div>
            </div>
            <p className="text-center text-[10px] font-black text-muted/40 uppercase tracking-[0.3em] mt-8">
              Speaker Portal · Powered by EventOS
            </p>
          </div>
        </footer>
      )}
    </>
  );
}
