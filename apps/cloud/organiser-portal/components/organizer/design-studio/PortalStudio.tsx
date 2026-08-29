"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Palette,
  Sparkles,
  Globe,
  Upload,
  FileText,
  HelpCircle,
  Mail,
  Phone,
  Save,
  Check,
  Copy,
  ExternalLink,
  Loader2,
  Trash2,
  Plus,
  Eye,
  Sliders,
  Layers,
  CheckCircle2,
  Sun,
  Moon,
  Smartphone,
  Monitor,
  RefreshCw,
  Zap,
  Tag,
  Shield,
  Info,
  Image as ImageIcon,
  PaintBucket,
  SlidersHorizontal,
  QrCode,
  Download,
  Printer,
  Edit3,
  Box,
  Maximize2,
  EyeOff,
  LifeBuoy,
  Lock,
} from "lucide-react";
import { useEvent, useUpdateEvent } from "@/hooks/useEvents";
import { toast } from "sonner";
import { useOperationAccess } from "@/lib/capabilities";
import { RichTextEditor } from "@/components/ui/rich-text-editor";

const DEFAULT_TERMS = `# Official Event Portal Terms & Conditions

Welcome to the official event portal. By accessing the portal, registering for this conference, attending sessions, or uploading materials as faculty, you agree to comply with these terms and policies.

---

# 1. Event Admission & Delegate Passes
* Registration confirmation and official digital entry passes are valid only for the registered individual and are non-transferable without prior written authorization from the organizing committee.
* Attendees must present their official digital pass QR code along with a valid government-issued photo ID at the venue registration desks or self-service kiosks to collect their delegate kit and physical badge.
* Providing fraudulent or misleading attendee information may result in immediate revocation of access without compensation.

---

# 2. Schedule, Sessions & Faculty Guidelines
* The organizing committee reserves the right to modify the agenda, session timings, tracks, or speakers without prior individual notice due to unforeseen circumstances.
* Faculty and oral presenters must upload finalized presentation slide decks via the Speaker Center at least 4 hours prior to their scheduled session.

---

# 3. Payments, Taxes & Refund Policy
* All registration fees are subject to applicable goods and services taxes (GST / VAT) and payment processing surcharges.
* Official tax invoices and payment receipts are available for on-demand download inside the attendee portal upon successful transaction completion.
* Cancellation requests received at least 15 days prior to the conference start date are eligible for a 75% refund. No refunds are granted for late cancellations or no-shows.

---

# 4. Code of Conduct & Photography
* All attendees, delegates, exhibitors, and speakers are expected to maintain professional conduct throughout the venue and associated digital workspaces.
* By attending, you consent to being photographed and video-recorded for non-commercial educational, promotional, and archival purposes.`;

const DEFAULT_PORTAL_FAQS = [
  {
    q: "How do I access and display my official Entry Pass at the venue?",
    a: "Once signed in to the Participant Portal, your digital Entry Pass with your unique QR code is displayed on the main dashboard. You can display it on your smartphone or click 'Download Pass / Save PDF' to show a printed copy at the self-service badge printing kiosks.",
  },
  {
    q: "How can I update my profile details or badge name?",
    a: "Click the 'Edit Profile' button at the top right of your dashboard. You can update your name, title, designation, institution/company, and contact details instantly before the badge printing cutoff date.",
  },
  {
    q: "Where can I download my GST tax invoice and payment receipt?",
    a: "On your attendee dashboard, click the 'View Tax Invoice' button under your pass details to generate and download a compliant PDF tax invoice complete with transaction ID and GST breakdown.",
  },
  {
    q: "I am an invited Speaker / Faculty member. Where do I upload my slides?",
    a: "When signed in with your faculty email, a dedicated 'Speaker & Faculty Center' workspace will appear on your dashboard. Click 'Open Speaker Center' to manage your assigned sessions, upload presentation slides, and submit conflict of interest disclosures.",
  },
];

// ── PRESET THEME PALETTES ──────────────────────────────────────────────────
export const PRESET_THEMES = [
  {
    id: "dark-luxury",
    name: "Midnight Luxury",
    primary: "#6366F1",
    secondary: "#8B5CF6",
    desc: "Indigo and violet with deep obsidian contrast",
  },
  {
    id: "ocean-cyan",
    name: "Cyber Ocean",
    primary: "#0EA5E9",
    secondary: "#06B6D4",
    desc: "Electric sky blue and bright teal with cool undertones",
  },
  {
    id: "emerald-mint",
    name: "Bio Emerald",
    primary: "#10B981",
    secondary: "#059669",
    desc: "Vibrant emerald green suitable for health, bio & medical summits",
  },
  {
    id: "amber-sunset",
    name: "Sunset Amber",
    primary: "#F59E0B",
    secondary: "#EA580C",
    desc: "Warm radiant amber and deep orange for executive conferences",
  },
  {
    id: "crimson-rose",
    name: "Crimson Spark",
    primary: "#F43F5E",
    secondary: "#E11D48",
    desc: "Bold high-energy rose and ruby red with sharp presence",
  },
  {
    id: "purple-haze",
    name: "Galactic Violet",
    primary: "#A855F7",
    secondary: "#D946EF",
    desc: "Deep atmospheric violet and neon fuchsia",
  },
  {
    id: "corporate-blue",
    name: "Executive Blue",
    primary: "#2563EB",
    secondary: "#3B82F6",
    desc: "Classic authoritative enterprise blue for global conventions",
  },
  {
    id: "slate-minimal",
    name: "Titanium Slate",
    primary: "#475569",
    secondary: "#64748B",
    desc: "Minimalist slate palette for executive corporate governance",
  },
];

// ── COMPLETE PATTERN CATALOG: ORIGINAL MOTIFS + GEOMETRIC VECTORS ─────────
export const SVG_PATTERNS = [
  {
    id: "glow-wave",
    name: "Luminous Glow Wave",
    desc: "Smooth dual-gradient organic flow lines with glowing particle accents",
    category: "Ambient Flow",
  },
  {
    id: "tech-grid",
    name: "Cyber Beam Grid",
    desc: "Perspective coordinate grid with dual-angle cyber laser beams",
    category: "Futuristic Grid",
  },
  {
    id: "cyber-matrix",
    name: "Radial Cyber Matrix",
    desc: "Concentric target rings with interconnected node constellations",
    category: "Data Matrix",
  },
  {
    id: "prism-mesh",
    name: "Geometric Prism Mesh",
    desc: "Refractive Delaunay polygon facets with radiant ambient lighting",
    category: "Geometric Prism",
  },
  {
    id: "minimal-dots",
    name: "Minimalist Dot Matrix",
    desc: "Subtle dotted matrix grid with centered radial illumination",
    category: "Minimal",
  },
  {
    id: "triangle-halftone",
    name: "Triangle Halftone Dispersion",
    desc: "Isometric triangular lattice with gradient density fading to center",
    category: "Geometric Halftone",
  },
  {
    id: "dash-matrix",
    name: "Rotational Dash Matrix",
    desc: "Staggered rotating capsule dashes with dynamic halftone scaling",
    category: "Op-Art Matrix",
  },
  {
    id: "hex-hatch",
    name: "Hexagonal Linear Hatch",
    desc: "Isometric hexagons filled with directional parallel line hatching",
    category: "Architectural",
  },
  {
    id: "isometric-cubes",
    name: "Isometric Striped Cubes",
    desc: "3D isometric cubes with directional striped face textures",
    category: "Isometric 3D",
  },
  {
    id: "curved-mesh",
    name: "Perspective Warped Triangles",
    desc: "Curved spherical perspective grid with ascending triangular elements",
    category: "Parametric Grid",
  },
  {
    id: "none",
    name: "Clean / Solid (None)",
    desc: "Standard clean background without decorative SVG graphics",
    category: "Minimal",
  },
];

export type StudioTabId =
  | "branding"
  | "theme"
  | "svg"
  | "content"
  | "support"
  | "preview";

interface PortalStudioProps {
  eventId: string;
}

export default function PortalStudio({ eventId }: PortalStudioProps) {
  const { data: event, isLoading: eventLoading } = useEvent(eventId);
  const updateEvent = useUpdateEvent(eventId);
  const planningAccess = useOperationAccess("events.planning.manage");

  const [activeTab, setActiveTab] = useState<StudioTabId>("branding");
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);

  // ── Form State ──
  const [eventName, setEventName] = useState("");
  const [shortCode, setShortCode] = useState("");
  const [tagline, setTagline] = useState("");
  const [description, setDescription] = useState("");
  const [logoUrl, setLogoUrl] = useState("");

  // Theme & Colors
  const [selectedPreset, setSelectedPreset] = useState("dark-luxury");
  const [primaryColor, setPrimaryColor] = useState("#6366F1");
  const [secondaryColor, setSecondaryColor] = useState("#8B5CF6");
  const [darkModeDefault, setDarkModeDefault] = useState(true);

  // Background Options (Pattern, Solid, Image)
  const [bgMode, setBgMode] = useState<"pattern" | "solid" | "image" | "none">("pattern");
  const [svgPattern, setSvgPattern] = useState("glow-wave");
  const [bgImageUrl, setBgImageUrl] = useState("");
  const [bgBlur, setBgBlur] = useState<number>(0);
  const [bgOverlayOpacity, setBgOverlayOpacity] = useState<number>(0.4);
  const [bgSolidColor, setBgSolidColor] = useState("#000000");

  // Content & Material
  const [useDynamicStats, setUseDynamicStats] = useState(true);
  const [customStats, setCustomStats] = useState<Array<{ label: string; icon: string }>>([
    { label: "1 Day Conference", icon: "calendar" },
    { label: "8 Tracks", icon: "tracks" },
    { label: "42 Sessions", icon: "sessions" },
    { label: "38 Speakers", icon: "speakers" },
  ]);
  const [programUrl, setProgramUrl] = useState("");
  const [speakerGuidelinesUrl, setSpeakerGuidelinesUrl] = useState("");
  const [termsAndConditions, setTermsAndConditions] = useState("");
  const [faqs, setFaqs] = useState<Array<{ q: string; a: string }>>([]);

  // Contacts & Support
  const [supportEmail, setSupportEmail] = useState("");
  const [supportPhone, setSupportPhone] = useState("");
  const [additionalContacts, setAdditionalContacts] = useState<
    Array<{ id: string; type: "email" | "phone" | "whatsapp" | "desk"; value: string; label: string }>
  >([]);

  // Preview Mode
  const [previewDevice, setPreviewDevice] = useState<"desktop" | "mobile">("desktop");
  const [previewTheme, setPreviewTheme] = useState<"dark" | "light">("dark");

  const portalUrl = `${process.env.NEXT_PUBLIC_REGISTRATION_URL || "http://localhost:3003"}/${eventId}`;

  // Populate from event data
  useEffect(() => {
    if (!event) return;
    setEventName(event.name || "");
    setShortCode(event.short_code || "");
    setDescription(event.description || "");
    setLogoUrl(event.logo_url || "");

    const rs = (event.registration_settings || {}) as Record<string, any>;
    setTagline(rs.tagline || "");
    setSupportEmail(rs.support_email || event.support_email || "");
    setSupportPhone(rs.support_phone || event.support_phone || "");
    setAdditionalContacts(rs.additional_contacts || []);
    setProgramUrl(rs.program_url || "");
    setSpeakerGuidelinesUrl(rs.speaker_guidelines_url || "");
    const loadedFaqs = (rs.faqs && Array.isArray(rs.faqs) && rs.faqs.length > 0) ? rs.faqs : DEFAULT_PORTAL_FAQS;
    setFaqs(loadedFaqs);

    const themeConfig = rs.theme_config || {};
    setSelectedPreset(themeConfig.preset || rs.theme_preset || "dark-luxury");
    setPrimaryColor(themeConfig.primary_color || rs.primary_color || event.theme_color || "#6366F1");
    setSecondaryColor(themeConfig.secondary_color || rs.secondary_color || "#8B5CF6");
    setDarkModeDefault(themeConfig.dark_mode_default !== undefined ? themeConfig.dark_mode_default !== false : (rs.dark_mode_default !== false));

    // Background Mode & Options
    setBgMode(themeConfig.bg_mode || rs.bg_mode || "pattern");
    setSvgPattern(themeConfig.svg_pattern || rs.svg_pattern || "glow-wave");
    setBgImageUrl(themeConfig.bg_image_url || rs.bg_image_url || "");
    setBgBlur(themeConfig.bg_blur ?? rs.bg_blur ?? 0);
    setBgOverlayOpacity(themeConfig.bg_overlay_opacity ?? rs.bg_overlay_opacity ?? 0.4);
    setBgSolidColor(themeConfig.bg_solid_color || rs.bg_solid_color || "#000000");

    if (rs.stats && Array.isArray(rs.stats) && rs.stats.length > 0) {
      setUseDynamicStats(false);
      setCustomStats(rs.stats);
    } else {
      setUseDynamicStats(true);
    }
  }, [event]);

  // Handle Preset Select
  const handleApplyPreset = (preset: (typeof PRESET_THEMES)[0]) => {
    setSelectedPreset(preset.id);
    setPrimaryColor(preset.primary);
    setSecondaryColor(preset.secondary);
    toast.success(`Applied ${preset.name} palette`);
  };

  // Handle Save
  const handleSaveAll = async () => {
    if (!planningAccess.enabled) {
      toast.error("You do not have permission to modify event portal settings.");
      return;
    }
    setSaving(true);
    try {
      const currentRS = (event?.registration_settings || {}) as Record<string, any>;
      const updatedThemeConfig = {
        preset: selectedPreset,
        primary_color: primaryColor,
        secondary_color: secondaryColor,
        dark_mode_default: darkModeDefault,
        bg_mode: bgMode,
        svg_pattern: svgPattern,
        bg_image_url: bgImageUrl,
        bg_blur: bgBlur,
        bg_overlay_opacity: bgOverlayOpacity,
        bg_solid_color: bgSolidColor,
      };

      const updatedRS = {
        ...currentRS,
        tagline,
        support_email: supportEmail,
        support_phone: supportPhone,
        additional_contacts: additionalContacts,
        program_url: programUrl,
        speaker_guidelines_url: speakerGuidelinesUrl,
        terms_and_conditions: termsAndConditions,
        faqs,
        primary_color: primaryColor,
        secondary_color: secondaryColor,
        theme_preset: selectedPreset,
        bg_mode: bgMode,
        svg_pattern: svgPattern,
        bg_image_url: bgImageUrl,
        bg_blur: bgBlur,
        bg_overlay_opacity: bgOverlayOpacity,
        bg_solid_color: bgSolidColor,
        dark_mode_default: darkModeDefault,
        theme_config: updatedThemeConfig,
        stats: useDynamicStats ? [] : customStats,
      };

      await updateEvent.mutateAsync({
        name: eventName,
        description,
        theme_color: primaryColor,
        registration_settings: updatedRS as any,
      });

      toast.success("Portal settings saved successfully!");
    } catch (err: any) {
      toast.error(err?.message || "Failed to save portal settings.");
    } finally {
      setSaving(false);
    }
  };

  const copyPortalLink = () => {
    navigator.clipboard.writeText(portalUrl);
    setCopied(true);
    toast.success("Portal URL copied to clipboard");
    setTimeout(() => setCopied(false), 2000);
  };

  const addFaqItem = () => {
    setFaqs([...faqs, { q: "", a: "" }]);
  };

  const updateFaqItem = (index: number, field: "q" | "a", value: string) => {
    const next = [...faqs];
    next[index][field] = value;
    setFaqs(next);
  };

  const removeFaqItem = (index: number) => {
    setFaqs(faqs.filter((_, i) => i !== index));
  };

  const addContactItem = () => {
    setAdditionalContacts([
      ...additionalContacts,
      { id: Math.random().toString(36).substring(2, 9), type: "email", value: "", label: "Support Desk" },
    ]);
  };

  const removeContactItem = (id: string) => {
    setAdditionalContacts(additionalContacts.filter((c) => c.id !== id));
  };

  if (eventLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="size-6 animate-spin text-[var(--pri)]" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* ── TOP ACTION HEADER ─────────────────────────────────────────────── */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-6 rounded-2xl bg-[var(--card)] border border-[var(--border-default)] shadow-sm">
        <div className="space-y-1">
          <div className="flex items-center gap-2.5">
            <div className="h-9 w-9 rounded-xl bg-[var(--pri)]/10 text-[var(--pri)] flex items-center justify-center font-black">
              <Globe className="size-5" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-[var(--text-primary)] tracking-tight">
                Participant Portal &amp; Design Studio
              </h2>
              <p className="text-xs text-[var(--text-secondary)]">
                Customize attendee branding, brand accent colors, background styles, and preview the live dashboard.
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          <button
            type="button"
            onClick={copyPortalLink}
            className="px-3.5 py-2 rounded-xl text-xs font-semibold border border-[var(--border-default)] bg-[var(--bg-surface-2)] text-[var(--text-primary)] hover:bg-[var(--card)] transition-all flex items-center gap-2 cursor-pointer"
          >
            {copied ? <Check className="size-3.5 text-emerald-500" /> : <Copy className="size-3.5" />}
            <span>Copy Portal URL</span>
          </button>

          <a
            href={portalUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="px-3.5 py-2 rounded-xl text-xs font-semibold border border-[var(--border-default)] bg-[var(--bg-surface-2)] text-[var(--text-primary)] hover:bg-[var(--card)] transition-all flex items-center gap-2 cursor-pointer"
          >
            <ExternalLink className="size-3.5" />
            <span>Open Public Portal</span>
          </a>

          <button
            type="button"
            onClick={handleSaveAll}
            disabled={saving || !planningAccess.enabled}
            className="px-5 py-2 rounded-xl text-xs font-bold bg-[var(--pri)] hover:opacity-95 text-white transition-all flex items-center gap-2 shadow-md shadow-[var(--pri)]/20 cursor-pointer disabled:opacity-50"
          >
            {saving ? <Loader2 className="size-3.5 animate-spin" /> : <Save className="size-3.5" />}
            <span>Save All Changes</span>
          </button>
        </div>
      </div>

      {/* ── TAB NAVIGATION ────────────────────────────────────────────────── */}
      <div className="flex items-center gap-1.5 p-1.5 rounded-2xl bg-[var(--bg-surface-2)] border border-[var(--border-default)] overflow-x-auto">
        {[
          { id: "branding", label: "Branding & Identity", icon: Tag },
          { id: "theme", label: "Color Presets & Themes", icon: Palette },
          { id: "svg", label: "Background Styling", icon: Sparkles },
          { id: "content", label: "Guidelines & Terms", icon: FileText },
          { id: "support", label: "Support & Contacts", icon: Mail },
          { id: "preview", label: "Live Dashboard Simulator", icon: Eye },
        ].map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id as StudioTabId)}
              className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition-all cursor-pointer whitespace-nowrap ${isActive
                ? "bg-[var(--pri)] text-white shadow-sm"
                : "text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--card)]"
                }`}
            >
              <Icon className="size-4" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* ── TAB PANELS ────────────────────────────────────────────────────── */}
      <div className="p-6 md:p-8 rounded-2xl bg-[var(--card)] border border-[var(--border-default)] shadow-sm min-h-[500px]">
        <AnimatePresence mode="wait">
          {/* ════ TAB 1: BRANDING & IDENTITY ════ */}
          {activeTab === "branding" && (
            <motion.div
              key="branding"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              className="space-y-6 max-w-4xl"
            >
              <div>
                <h3 className="text-base font-bold text-[var(--text-primary)]">
                  Event Identity &amp; Portal Copy
                </h3>
                <p className="text-xs text-[var(--text-secondary)] mt-0.5">
                  Configure the primary title, short code, and hero tagline displayed to registered attendees.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-[var(--text-primary)]">Event Display Name</label>
                  <input
                    type="text"
                    value={eventName}
                    onChange={(e) => setEventName(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface-2)] text-xs text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--pri)]"
                    placeholder="e.g. 14th National Oncology & Clinical AI Summit"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-[var(--text-primary)]">Short Code (Acronym)</label>
                  <input
                    type="text"
                    value={shortCode}
                    onChange={(e) => setShortCode(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface-2)] text-xs text-[var(--text-primary)] font-mono uppercase focus:outline-none focus:ring-2 focus:ring-[var(--pri)]"
                    placeholder="e.g. NOCAS-2026"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-[var(--text-primary)]">Portal Hero Tagline</label>
                <input
                  type="text"
                  value={tagline}
                  onChange={(e) => setTagline(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface-2)] text-xs text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--pri)]"
                  placeholder="e.g. Empowering Next-Generation Clinical Innovation & Precision Healthcare"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-[var(--text-primary)]">Overview / Welcome Message</label>
                <textarea
                  rows={4}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface-2)] text-xs text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--pri)] leading-relaxed"
                  placeholder="Welcome to the official attendee and faculty portal. Access your verified digital entry pass, dynamic schedules, conference materials, and personalized certificates."
                />
              </div>

              <div className="space-y-2">
                <label className="text-xs font-bold text-[var(--text-primary)]">Event Logo URL</label>
                <div className="flex items-center gap-3">
                  <input
                    type="text"
                    value={logoUrl}
                    onChange={(e) => setLogoUrl(e.target.value)}
                    className="flex-1 px-3.5 py-2.5 rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface-2)] text-xs text-[var(--text-primary)] font-mono focus:outline-none focus:ring-2 focus:ring-[var(--pri)]"
                    placeholder="https://example.com/logo.png"
                  />
                  {logoUrl && (
                    <div className="h-10 w-10 rounded-xl border border-[var(--border-default)] bg-black/40 flex items-center justify-center p-1 overflow-hidden shrink-0">
                      <img src={logoUrl} alt="Logo" className="max-h-full max-w-full object-contain" />
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          )}

          {/* ════ TAB 2: THEMES & COLOR PRESETS ════ */}
          {activeTab === "theme" && (
            <motion.div
              key="theme"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              className="space-y-6 max-w-4xl"
            >
              <div>
                <h3 className="text-base font-bold text-[var(--text-primary)]">
                  Color Presets &amp; Brand Accent Colors
                </h3>
                <p className="text-xs text-[var(--text-secondary)] mt-0.5">
                  Pick a curated palette or customize your exact brand Hex colors. These tokens style all portal buttons, pass badges, active tabs, and gradient highlights.
                </p>
              </div>

              {/* Preset Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
                {PRESET_THEMES.map((preset) => {
                  const isSelected = selectedPreset === preset.id;
                  return (
                    <div
                      key={preset.id}
                      onClick={() => handleApplyPreset(preset)}
                      className={`group p-4 rounded-2xl border transition-all cursor-pointer space-y-3 relative ${isSelected
                        ? "border-[var(--pri)] bg-[var(--pri)]/5 ring-2 ring-[var(--pri)]/20 shadow-md"
                        : "border-[var(--border-default)] bg-[var(--bg-surface-2)] hover:border-[var(--pri)]/40 hover:bg-[var(--card)]"
                        }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-[var(--text-primary)]">
                          {preset.name}
                        </span>
                        {isSelected && <CheckCircle2 className="size-4 text-[var(--pri)]" />}
                      </div>

                      <div className="flex items-center gap-2">
                        <div className="h-6 w-10 rounded-lg shadow-sm border border-white/10" style={{ backgroundColor: preset.primary }} />
                        <div className="h-6 w-10 rounded-lg shadow-sm border border-white/10" style={{ backgroundColor: preset.secondary }} />
                      </div>

                      <p className="text-[11px] text-[var(--text-secondary)] line-clamp-2">
                        {preset.desc}
                      </p>
                    </div>
                  );
                })}
              </div>

              {/* Custom Hex Inputs */}
              <div className="p-5 rounded-2xl bg-[var(--bg-surface-2)] border border-[var(--border-default)] space-y-4">
                <h4 className="text-xs font-bold text-[var(--text-primary)] uppercase tracking-wider">
                  Custom Hex Override
                </h4>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-[var(--text-secondary)]">
                      Primary Brand Color (`--pri`)
                    </label>
                    <div className="flex items-center gap-3">
                      <input
                        type="color"
                        value={primaryColor}
                        onChange={(e) => setPrimaryColor(e.target.value)}
                        className="h-10 w-12 rounded-lg border border-[var(--border-default)] cursor-pointer bg-transparent"
                      />
                      <input
                        type="text"
                        value={primaryColor}
                        onChange={(e) => setPrimaryColor(e.target.value)}
                        className="flex-1 px-3 py-2 rounded-xl border border-[var(--border-default)] bg-[var(--card)] text-xs text-[var(--text-primary)] font-mono uppercase"
                      />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-[var(--text-secondary)]">
                      Secondary Accent Color (`--sec`)
                    </label>
                    <div className="flex items-center gap-3">
                      <input
                        type="color"
                        value={secondaryColor}
                        onChange={(e) => setSecondaryColor(e.target.value)}
                        className="h-10 w-12 rounded-lg border border-[var(--border-default)] cursor-pointer bg-transparent"
                      />
                      <input
                        type="text"
                        value={secondaryColor}
                        onChange={(e) => setSecondaryColor(e.target.value)}
                        className="flex-1 px-3 py-2 rounded-xl border border-[var(--border-default)] bg-[var(--card)] text-xs text-[var(--text-primary)] font-mono uppercase"
                      />
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between pt-2 border-t border-[var(--border-default)]">
                  <div>
                    <span className="text-xs font-bold text-[var(--text-primary)] block">
                      Default Attendee View Mode
                    </span>
                    <span className="text-[11px] text-[var(--text-secondary)]">
                      Attendees can always toggle their preferred theme using the top-right switcher.
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 p-1 rounded-xl bg-[var(--card)] border border-[var(--border-default)]">
                    <button
                      type="button"
                      onClick={() => setDarkModeDefault(true)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all ${darkModeDefault ? "bg-[var(--pri)] text-white shadow-sm" : "text-[var(--text-secondary)]"
                        }`}
                    >
                      <Moon className="size-3.5" />
                      <span>Dark</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setDarkModeDefault(false)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all ${!darkModeDefault ? "bg-[var(--pri)] text-white shadow-sm" : "text-[var(--text-secondary)]"
                        }`}
                    >
                      <Sun className="size-3.5" />
                      <span>Light</span>
                    </button>
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {/* ════ TAB 3: BACKGROUND STYLING & GRAPHICS ════ */}
          {activeTab === "svg" && (
            <motion.div
              key="svg"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              className="space-y-6 max-w-5xl"
            >
              <div>
                <h3 className="text-base font-bold text-[var(--text-primary)]">
                  Portal Background &amp; Ambient Visuals
                </h3>
                <p className="text-xs text-[var(--text-secondary)] mt-0.5">
                  Select an ambient SVG pattern, solid color backdrop, or custom image.
                </p>
              </div>

              {/* Segmented Mode Selector */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-1.5 rounded-2xl bg-[var(--bg-surface-2)] border border-[var(--border-default)]">
                {[
                  { id: "pattern", label: "SVG Patterns", icon: Sparkles, desc: "Ambient vectors & halftones" },
                  { id: "solid", label: "Solid Color", icon: PaintBucket, desc: "Clean uniform backdrop" },
                  { id: "image", label: "Custom Image", icon: ImageIcon, desc: "Full-screen stretched image" },
                  { id: "none", label: "Clean / None", icon: EyeOff, desc: "No background overlay" },
                ].map((mode) => {
                  const Icon = mode.icon;
                  const isSelected = bgMode === mode.id;
                  return (
                    <button
                      key={mode.id}
                      type="button"
                      onClick={() => setBgMode(mode.id as any)}
                      className={`p-3 rounded-xl text-left transition-all cursor-pointer flex flex-col gap-1 ${isSelected
                        ? "bg-[var(--pri)] text-white shadow-md"
                        : "text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--card)]"
                        }`}
                    >
                      <div className="flex items-center gap-2">
                        <Icon className="size-4" />
                        <span className="text-xs font-bold">{mode.label}</span>
                      </div>
                      <span className={`text-[10px] ${isSelected ? "text-white/80" : "text-[var(--text-secondary)]"}`}>
                        {mode.desc}
                      </span>
                    </button>
                  );
                })}
              </div>

              {/* ── MODE: CUSTOM IMAGE CONTROLS ── */}
              {bgMode === "image" && (
                <div className="p-6 rounded-2xl bg-[var(--bg-surface-2)] border border-[var(--border-default)] space-y-6">
                  <div>
                    <h4 className="text-xs font-bold text-[var(--text-primary)] uppercase tracking-wider flex items-center gap-2">
                      <ImageIcon className="size-4 text-[var(--pri)]" />
                      Custom Stretched Background Image
                    </h4>
                    <p className="text-[11px] text-[var(--text-secondary)] mt-1">
                      Images are stretched to cover the entire browser viewport (`object-cover`). Adjust blur and dark overlay tint to ensure cards and text remain 100% legible.
                    </p>
                  </div>

                  <div className="space-y-2">
                    <label className="text-xs font-bold text-[var(--text-primary)]">Image URL / Banner Link</label>
                    <input
                      type="text"
                      value={bgImageUrl}
                      onChange={(e) => setBgImageUrl(e.target.value)}
                      className="w-full px-3.5 py-2.5 rounded-xl border border-[var(--border-default)] bg-[var(--card)] text-xs text-[var(--text-primary)] font-mono focus:outline-none focus:ring-2 focus:ring-[var(--pri)]"
                      placeholder="https://images.unsplash.com/photo-1540575467063-178a50c2df87?w=1920"
                    />
                  </div>

                  {/* Image Preview & Sliders */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-2">
                    <div className="relative h-44 rounded-2xl overflow-hidden border border-[var(--border-default)] bg-black/50 shadow-inner flex items-center justify-center">
                      {bgImageUrl ? (
                        <>
                          <div
                            className="absolute inset-0 w-full h-full bg-cover bg-center transition-all duration-300"
                            style={{
                              backgroundImage: `url(${bgImageUrl})`,
                              filter: bgBlur > 0 ? `blur(${bgBlur}px)` : "none",
                            }}
                          />
                          <div
                            className="absolute inset-0 bg-black transition-opacity duration-300"
                            style={{ opacity: bgOverlayOpacity }}
                          />
                          <div className="relative z-10 p-3 rounded-xl bg-black/60 backdrop-blur-md border border-white/10 text-center space-y-1">
                            <span className="text-[10px] font-black text-white uppercase tracking-wider block">
                              Live Stretched Preview
                            </span>
                            <span className="text-[9px] text-white/80 font-mono">
                              Blur: {bgBlur}px • Opacity: {Math.round(bgOverlayOpacity * 100)}%
                            </span>
                          </div>
                        </>
                      ) : (
                        <div className="text-center p-4 space-y-1.5 text-[var(--text-secondary)]">
                          <ImageIcon className="size-8 mx-auto opacity-40" />
                          <span className="text-xs font-semibold block">No Image URL Entered</span>
                          <span className="text-[10px] opacity-70">Paste an image link above</span>
                        </div>
                      )}
                    </div>

                    <div className="md:col-span-2 space-y-5 flex flex-col justify-center">
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <label className="text-xs font-bold text-[var(--text-primary)] flex items-center gap-1.5">
                            <SlidersHorizontal className="size-3.5 text-[var(--pri)]" />
                            Blur Intensity
                          </label>
                          <span className="px-2.5 py-0.5 rounded-full bg-[var(--pri)]/10 text-[var(--pri)] text-xs font-bold font-mono">
                            {bgBlur}px
                          </span>
                        </div>
                        <input
                          type="range"
                          min="0"
                          max="30"
                          step="1"
                          value={bgBlur}
                          onChange={(e) => setBgBlur(Number(e.target.value))}
                          className="w-full accent-[var(--pri)] cursor-pointer"
                        />
                        <div className="flex justify-between text-[10px] text-[var(--text-secondary)]">
                          <span>0px (Crisp / Sharp)</span>
                          <span>12px (Balanced)</span>
                          <span>30px (Heavy Glass)</span>
                        </div>
                      </div>

                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <label className="text-xs font-bold text-[var(--text-primary)] flex items-center gap-1.5">
                            <Layers className="size-3.5 text-[var(--pri)]" />
                            Overlay Darkness &amp; Contrast
                          </label>
                          <span className="px-2.5 py-0.5 rounded-full bg-[var(--pri)]/10 text-[var(--pri)] text-xs font-bold font-mono">
                            {Math.round(bgOverlayOpacity * 100)}%
                          </span>
                        </div>
                        <input
                          type="range"
                          min="0"
                          max="0.9"
                          step="0.05"
                          value={bgOverlayOpacity}
                          onChange={(e) => setBgOverlayOpacity(Number(e.target.value))}
                          className="w-full accent-[var(--pri)] cursor-pointer"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* ── MODE: SOLID COLOR CONTROLS ── */}
              {bgMode === "solid" && (
                <div className="p-6 rounded-2xl bg-[var(--bg-surface-2)] border border-[var(--border-default)] space-y-4">
                  <h4 className="text-xs font-bold text-[var(--text-primary)] uppercase tracking-wider flex items-center gap-2">
                    <PaintBucket className="size-4 text-[var(--pri)]" />
                    Solid Backdrop Color
                  </h4>

                  <div className="flex items-center gap-3">
                    <input
                      type="color"
                      value={bgSolidColor}
                      onChange={(e) => setBgSolidColor(e.target.value)}
                      className="h-10 w-14 rounded-xl border border-[var(--border-default)] cursor-pointer bg-transparent"
                    />
                    <input
                      type="text"
                      value={bgSolidColor}
                      onChange={(e) => setBgSolidColor(e.target.value)}
                      className="w-48 px-3.5 py-2.5 rounded-xl border border-[var(--border-default)] bg-[var(--card)] text-xs text-[var(--text-primary)] font-mono uppercase"
                    />
                  </div>

                  <div className="flex items-center gap-2 pt-2">
                    <span className="text-[10px] font-bold text-[var(--text-secondary)] uppercase">Quick Swatches:</span>
                    {["#080912", "#0f172a", "#0a0a0a", "#18181b", "#1e1b4b", "#022c22", "#f8fafc", "#ffffff"].map((color) => (
                      <button
                        key={color}
                        type="button"
                        onClick={() => setBgSolidColor(color)}
                        className="h-6 w-6 rounded-full border border-white/20 shadow-sm cursor-pointer transition-transform hover:scale-110"
                        style={{ backgroundColor: color }}
                        title={color}
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* ── MODE: SVG PATTERNS GRID ── */}
              {bgMode === "pattern" && (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {SVG_PATTERNS.map((pattern) => {
                    const isSelected = svgPattern === pattern.id;
                    return (
                      <div
                        key={pattern.id}
                        onClick={() => {
                          setSvgPattern(pattern.id);
                          setBgMode("pattern");
                        }}
                        className={`group relative overflow-hidden rounded-2xl border transition-all cursor-pointer p-4 space-y-3 ${isSelected
                          ? "border-[var(--pri)] bg-[var(--pri)]/5 ring-2 ring-[var(--pri)]/20 shadow-md"
                          : "border-[var(--border-default)] bg-[var(--bg-surface-2)] hover:border-[var(--pri)]/40 hover:bg-[var(--card)]"
                          }`}
                      >
                        {/* Mini SVG Live Visualizer */}
                        <div
                          className="relative h-28 w-full rounded-xl overflow-hidden border border-[var(--border-default)] flex items-center justify-center shadow-inner"
                          style={{ backgroundColor: "#080912" }}
                        >
                          {/* 1. Luminous Glow Wave */}
                          {pattern.id === "glow-wave" && (
                            <svg className="w-full h-full" viewBox="0 0 200 100" fill="none">
                              <defs>
                                <radialGradient id={`miniWave-${pattern.id}`} cx="50%" cy="50%" r="50%">
                                  <stop offset="0%" stopColor={primaryColor} stopOpacity="0.4" />
                                  <stop offset="100%" stopColor="transparent" stopOpacity="0" />
                                </radialGradient>
                              </defs>
                              <rect width="200" height="100" fill={`url(#miniWave-${pattern.id})`} />
                              <path d="M-20 30 C 40 10, 80 60, 140 35 C 170 20, 190 50, 220 40" stroke={primaryColor} strokeWidth="2" strokeDasharray="4 4" />
                              <path d="M-10 70 C 50 50, 100 90, 160 70 C 180 60, 200 80, 220 75" stroke={secondaryColor} strokeWidth="1.5" />
                              <circle cx="100" cy="40" r="14" stroke={primaryColor} strokeOpacity="0.3" />
                            </svg>
                          )}

                          {/* 2. Cyber Beam Grid */}
                          {pattern.id === "tech-grid" && (
                            <svg className="w-full h-full" viewBox="0 0 200 100" fill="none">
                              <defs>
                                <pattern id={`miniGrid-${pattern.id}`} width="16" height="16" patternUnits="userSpaceOnUse">
                                  <path d="M 16 0 L 0 0 0 16" fill="none" stroke={primaryColor} strokeWidth="0.75" strokeOpacity="0.3" />
                                </pattern>
                              </defs>
                              <rect width="200" height="100" fill={`url(#miniGrid-${pattern.id})`} />
                              <line x1="0" y1="0" x2="200" y2="100" stroke={primaryColor} strokeWidth="1.5" strokeOpacity="0.5" />
                              <line x1="200" y1="0" x2="0" y2="100" stroke={secondaryColor} strokeWidth="1" strokeOpacity="0.4" strokeDasharray="3 3" />
                            </svg>
                          )}

                          {/* 3. Radial Cyber Matrix */}
                          {pattern.id === "cyber-matrix" && (
                            <svg className="w-full h-full" viewBox="0 0 200 100" fill="none">
                              <circle cx="100" cy="50" r="22" stroke={primaryColor} strokeWidth="1.5" strokeDasharray="4 4" />
                              <circle cx="100" cy="50" r="42" stroke={secondaryColor} strokeWidth="1" strokeDasharray="2 4" />
                              <circle cx="75" cy="40" r="3" fill={primaryColor} />
                              <circle cx="125" cy="60" r="3" fill={secondaryColor} />
                              <line x1="75" y1="40" x2="125" y2="60" stroke={primaryColor} strokeWidth="1" strokeOpacity="0.5" />
                            </svg>
                          )}

                          {/* 4. Geometric Prism Mesh */}
                          {pattern.id === "prism-mesh" && (
                            <svg className="w-full h-full" viewBox="0 0 200 100" fill="none">
                              <polygon points="20,15 90,40 40,90" stroke={primaryColor} strokeWidth="1.2" fill={primaryColor} fillOpacity="0.2" />
                              <polygon points="90,40 180,25 140,85" stroke={secondaryColor} strokeWidth="1.2" fill={secondaryColor} fillOpacity="0.2" />
                              <polygon points="40,90 90,40 140,85" stroke={primaryColor} strokeWidth="1" strokeOpacity="0.4" />
                            </svg>
                          )}

                          {/* 5. Triangle Halftone */}
                          {pattern.id === "triangle-halftone" && (
                            <svg className="w-full h-full" viewBox="0 0 200 100" fill="none">
                              <polygon points="20,10 30,26 10,26" fill={primaryColor} fillOpacity="0.8" />
                              <polygon points="60,10 70,26 50,26" fill={secondaryColor} fillOpacity="0.75" />
                              <polygon points="100,10 110,26 90,26" fill={primaryColor} fillOpacity="0.8" />
                              <polygon points="140,10 150,26 130,26" fill={secondaryColor} fillOpacity="0.75" />
                              <polygon points="180,10 190,26 170,26" fill={primaryColor} fillOpacity="0.8" />
                              <polygon points="40,32 46,44 34,44" fill={primaryColor} fillOpacity="0.4" />
                              <polygon points="120,32 126,44 114,44" fill={secondaryColor} fillOpacity="0.4" />
                              <polygon points="40,68 46,56 34,56" fill={secondaryColor} fillOpacity="0.4" />
                              <polygon points="120,68 126,56 114,56" fill={primaryColor} fillOpacity="0.4" />
                              <polygon points="20,90 30,74 10,74" fill={primaryColor} fillOpacity="0.8" />
                              <polygon points="60,90 70,74 50,74" fill={secondaryColor} fillOpacity="0.75" />
                              <polygon points="100,90 110,74 90,74" fill={primaryColor} fillOpacity="0.8" />
                              <polygon points="140,90 150,74 130,74" fill={secondaryColor} fillOpacity="0.75" />
                              <polygon points="180,90 190,74 170,74" fill={primaryColor} fillOpacity="0.8" />
                            </svg>
                          )}

                          {/* 6. Rotational Dash Matrix */}
                          {pattern.id === "dash-matrix" && (
                            <svg className="w-full h-full" viewBox="0 0 200 100" fill="none">
                              <rect x="25" y="8" width="2" height="5" rx="1" fill={primaryColor} fillOpacity="0.3" />
                              <rect x="75" y="8" width="2" height="5" rx="1" fill={secondaryColor} fillOpacity="0.3" />
                              <rect x="125" y="8" width="2" height="5" rx="1" fill={primaryColor} fillOpacity="0.3" />
                              <rect x="175" y="8" width="2" height="5" rx="1" fill={secondaryColor} fillOpacity="0.3" />
                              <rect x="45" y="24" width="3" height="9" rx="1.5" fill={primaryColor} fillOpacity="0.5" transform="rotate(25 46.5 28.5)" />
                              <rect x="105" y="24" width="3" height="9" rx="1.5" fill={secondaryColor} fillOpacity="0.5" transform="rotate(-25 106.5 28.5)" />
                              <rect x="165" y="24" width="3" height="9" rx="1.5" fill={primaryColor} fillOpacity="0.5" transform="rotate(25 166.5 28.5)" />
                              <rect x="30" y="46" width="5" height="15" rx="2.5" fill={secondaryColor} fillOpacity="0.85" transform="rotate(65 32.5 53.5)" />
                              <rect x="80" y="46" width="5" height="15" rx="2.5" fill={primaryColor} fillOpacity="0.85" transform="rotate(-65 82.5 53.5)" />
                              <rect x="130" y="46" width="5" height="15" rx="2.5" fill={secondaryColor} fillOpacity="0.85" transform="rotate(65 132.5 53.5)" />
                              <rect x="180" y="46" width="5" height="15" rx="2.5" fill={primaryColor} fillOpacity="0.85" transform="rotate(-65 182.5 53.5)" />
                              <rect x="45" y="72" width="3" height="9" rx="1.5" fill={primaryColor} fillOpacity="0.5" transform="rotate(-25 46.5 76.5)" />
                              <rect x="105" y="72" width="3" height="9" rx="1.5" fill={secondaryColor} fillOpacity="0.5" transform="rotate(25 106.5 76.5)" />
                              <rect x="165" y="72" width="3" height="9" rx="1.5" fill={primaryColor} fillOpacity="0.5" transform="rotate(-25 166.5 76.5)" />
                            </svg>
                          )}

                          {/* 7. Hexagonal Linear Hatch */}
                          {pattern.id === "hex-hatch" && (
                            <svg className="w-full h-full" viewBox="0 0 200 100" fill="none">
                              <g transform="translate(45, 48)">
                                <polygon points="0,-25 22,-12 22,12 0,25 -22,12 -22,-12" stroke={primaryColor} strokeWidth="0.8" strokeOpacity="0.4" />
                                <line x1="-18" y1="-10" x2="18" y2="-10" stroke={primaryColor} strokeWidth="1.5" />
                                <line x1="-20" y1="0" x2="20" y2="0" stroke={primaryColor} strokeWidth="1.5" />
                                <line x1="-18" y1="10" x2="18" y2="10" stroke={primaryColor} strokeWidth="1.5" />
                              </g>
                              <g transform="translate(95, 28)">
                                <polygon points="0,-25 22,-12 22,12 0,25 -22,12 -22,-12" stroke={secondaryColor} strokeWidth="0.8" strokeOpacity="0.4" />
                                <line x1="-14" y1="-18" x2="10" y2="20" stroke={secondaryColor} strokeWidth="1.5" />
                                <line x1="-5" y1="-22" x2="18" y2="14" stroke={secondaryColor} strokeWidth="1.5" />
                              </g>
                              <line x1="140" y1="20" x2="175" y2="20" stroke={primaryColor} strokeWidth="1.5" strokeOpacity="0.6" />
                              <line x1="150" y1="50" x2="185" y2="35" stroke={secondaryColor} strokeWidth="1.5" strokeOpacity="0.5" />
                            </svg>
                          )}

                          {/* 8. Isometric Striped Cubes */}
                          {pattern.id === "isometric-cubes" && (
                            <svg className="w-full h-full" viewBox="0 0 200 100" fill="none">
                              <g transform="translate(70, 48)">
                                <polygon points="0,-24 24,-12 0,0 -24,-12" stroke={primaryColor} strokeWidth="0.8" fill={primaryColor} fillOpacity="0.08" />
                                <polygon points="-24,-12 0,0 0,24 -24,12" stroke={primaryColor} strokeWidth="0.8" />
                                <polygon points="0,0 24,-12 24,12 0,24" stroke={secondaryColor} strokeWidth="0.8" fill={secondaryColor} fillOpacity="0.08" />
                                <line x1="-16" y1="-8" x2="6" y2="3" stroke={primaryColor} strokeWidth="1.2" />
                                <line x1="-18" y1="-6" x2="-18" y2="15" stroke={primaryColor} strokeWidth="1.2" />
                                <line x1="4" y1="3" x2="20" y2="-6" stroke={secondaryColor} strokeWidth="1.2" />
                              </g>
                              <g transform="translate(140, 48)">
                                <polygon points="0,-24 24,-12 0,0 -24,-12" stroke={secondaryColor} strokeWidth="0.8" fill={secondaryColor} fillOpacity="0.08" />
                                <polygon points="-24,-12 0,0 0,24 -24,12" stroke={secondaryColor} strokeWidth="0.8" />
                                <polygon points="0,0 24,-12 24,12 0,24" stroke={primaryColor} strokeWidth="0.8" fill={primaryColor} fillOpacity="0.08" />
                                <line x1="-16" y1="-8" x2="6" y2="3" stroke={secondaryColor} strokeWidth="1.2" />
                                <line x1="-18" y1="-6" x2="-18" y2="15" stroke={secondaryColor} strokeWidth="1.2" />
                                <line x1="4" y1="3" x2="20" y2="-6" stroke={primaryColor} strokeWidth="1.2" />
                              </g>
                            </svg>
                          )}

                          {/* 9. Perspective Warped Triangles */}
                          {pattern.id === "curved-mesh" && (
                            <svg className="w-full h-full" viewBox="0 0 200 100" fill="none">
                              <path d="M 0 95 Q 100 80 200 95" stroke={primaryColor} strokeWidth="1.2" strokeOpacity="0.6" fill="none" />
                              <path d="M 0 80 Q 100 68 200 80" stroke={secondaryColor} strokeWidth="1" strokeOpacity="0.5" fill="none" />
                              <path d="M 0 65 Q 100 56 200 65" stroke={primaryColor} strokeWidth="0.8" strokeOpacity="0.4" fill="none" />
                              <line x1="100" y1="100" x2="40" y2="20" stroke={primaryColor} strokeWidth="0.8" strokeOpacity="0.3" />
                              <line x1="100" y1="100" x2="100" y2="20" stroke={primaryColor} strokeWidth="1" strokeOpacity="0.4" />
                              <line x1="100" y1="100" x2="160" y2="20" stroke={secondaryColor} strokeWidth="0.8" strokeOpacity="0.3" />
                              <polygon points="95,88 100,81 105,88" fill={primaryColor} fillOpacity="0.8" />
                              <polygon points="75,89 80,82 85,89" fill={secondaryColor} fillOpacity="0.75" />
                              <polygon points="115,89 120,82 125,89" fill={secondaryColor} fillOpacity="0.75" />
                              <polygon points="97,68 100,63 103,68" fill={primaryColor} fillOpacity="0.5" />
                            </svg>
                          )}

                          {/* 10. Minimal Dots */}
                          {pattern.id === "minimal-dots" && (
                            <svg className="w-full h-full" viewBox="0 0 200 100" fill="none">
                              <defs>
                                <pattern id={`miniDots-${pattern.id}`} width="12" height="12" patternUnits="userSpaceOnUse">
                                  <circle cx="2" cy="2" r="1.2" fill={primaryColor} fillOpacity="0.4" />
                                </pattern>
                              </defs>
                              <rect width="200" height="100" fill={`url(#miniDots-${pattern.id})`} />
                            </svg>
                          )}

                          {/* 11. Clean None */}
                          {pattern.id === "none" && (
                            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-widest">
                              No Decorative SVG
                            </span>
                          )}
                        </div>

                        {/* Details */}
                        <div>
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-bold text-[var(--text-primary)]">
                              {pattern.name}
                            </span>
                            {isSelected && <CheckCircle2 className="size-4 text-[var(--pri)]" />}
                          </div>
                          <span className="text-[10px] font-semibold text-[var(--pri)] uppercase tracking-wider block mt-0.5">
                            {pattern.category}
                          </span>
                          <p className="text-[11px] text-[var(--text-secondary)] mt-1 line-clamp-2">
                            {pattern.desc}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </motion.div>
          )}

          {/* ════ TAB 4: GUIDELINES, FAQS & TERMS ════ */}
          {activeTab === "content" && (
            <motion.div
              key="content"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              className="space-y-8 max-w-4xl"
            >
              <div>
                <h3 className="text-base font-bold text-[var(--text-primary)]">
                  Conference Material, Terms &amp; Policies
                </h3>
                <p className="text-xs text-[var(--text-secondary)] mt-0.5">
                  Manage external links to the event brochure, faculty upload guidelines, and attendee terms.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-[var(--text-primary)]">
                    Program Schedule / Brochure PDF Link
                  </label>
                  <input
                    type="text"
                    value={programUrl}
                    onChange={(e) => setProgramUrl(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface-2)] text-xs text-[var(--text-primary)] font-mono focus:outline-none focus:ring-2 focus:ring-[var(--pri)]"
                    placeholder="https://drive.google.com/.../brochure.pdf"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-[var(--text-primary)]">
                    Speaker Presentation Guidelines Link
                  </label>
                  <input
                    type="text"
                    value={speakerGuidelinesUrl}
                    onChange={(e) => setSpeakerGuidelinesUrl(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface-2)] text-xs text-[var(--text-primary)] font-mono focus:outline-none focus:ring-2 focus:ring-[var(--pri)]"
                    placeholder="https://drive.google.com/.../speaker-guidelines.pdf"
                  />
                </div>
              </div>

              {/* FAQs Section */}
              <div className="space-y-4 pt-4 border-t border-[var(--border-default)]">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-xs font-bold text-[var(--text-primary)] uppercase tracking-wider">
                      Attendee Portal Frequently Asked Questions (FAQs)
                    </h4>
                    <p className="text-[11px] text-[var(--text-secondary)] mt-0.5">
                      Add frequently asked questions shown in the attendee support modal.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={addFaqItem}
                    className="px-3 py-1.5 rounded-xl text-xs font-bold bg-[var(--pri)]/10 text-[var(--pri)] hover:bg-[var(--pri)]/20 transition-all flex items-center gap-1.5 cursor-pointer"
                  >
                    <Plus className="size-3.5" />
                    <span>Add Question</span>
                  </button>
                </div>

                <div className="space-y-3">
                  {faqs.map((faq, idx) => (
                    <div
                      key={idx}
                      className="p-4 rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface-2)] space-y-2.5"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <input
                          type="text"
                          value={faq.q}
                          onChange={(e) => updateFaqItem(idx, "q", e.target.value)}
                          className="flex-1 px-3 py-1.5 rounded-lg border border-[var(--border-default)] bg-[var(--card)] text-xs font-bold text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--pri)]"
                          placeholder="Question title..."
                        />
                        <button
                          type="button"
                          onClick={() => removeFaqItem(idx)}
                          className="p-1.5 text-slate-400 hover:text-rose-500 transition-colors cursor-pointer"
                          title="Delete FAQ"
                        >
                          <Trash2 className="size-4" />
                        </button>
                      </div>
                      <textarea
                        rows={2}
                        value={faq.a}
                        onChange={(e) => updateFaqItem(idx, "a", e.target.value)}
                        className="w-full px-3 py-1.5 rounded-lg border border-[var(--border-default)] bg-[var(--card)] text-xs text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--pri)]"
                        placeholder="Answer explanation..."
                      />
                    </div>
                  ))}
                </div>
              </div>

              {/* Terms & Conditions Rich Text */}
              <div className="space-y-2 pt-4 border-t border-[var(--border-default)]">
                <label className="text-xs font-bold text-[var(--text-primary)] block">
                  Attendee Terms, Admission &amp; Refund Policies
                </label>
                <div className="rounded-xl border border-[var(--border-default)] overflow-hidden bg-[var(--card)]">
                  <RichTextEditor
                    value={termsAndConditions || DEFAULT_TERMS}
                    onChange={(val) => setTermsAndConditions(val)}
                  />
                </div>
              </div>
            </motion.div>
          )}

          {/* ════ TAB 5: SUPPORT & CONTACTS ════ */}
          {activeTab === "support" && (
            <motion.div
              key="support"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              className="space-y-6 max-w-4xl"
            >
              <div>
                <h3 className="text-base font-bold text-[var(--text-primary)]">
                  Multi-Channel Support &amp; Help Desk
                </h3>
                <p className="text-xs text-[var(--text-secondary)] mt-0.5">
                  Display direct email and hotline contacts inside the attendee portal drawer.
                </p>
              </div>

              {/* Permanent Platform Support Email (System-Locked) */}
              <div className="p-4 rounded-2xl bg-[var(--bg-surface-2)] border border-[var(--border-default)] space-y-2.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Shield className="size-4 text-[var(--pri)]" />
                    <span className="text-xs font-bold text-[var(--text-primary)]">
                      Permanent Platform Support Desk
                    </span>
                  </div>
                  <span className="px-2 py-0.5 rounded-md bg-amber-500/10 text-amber-500 text-[10px] font-black uppercase tracking-wider flex items-center gap-1 border border-amber-500/20">
                    <Lock className="size-3" />
                    <span>System Locked</span>
                  </span>
                </div>
                <p className="text-[11px] text-[var(--text-secondary)] leading-relaxed">
                  This official platform technical support address is permanently integrated across all attendee portals and cannot be altered or removed.
                </p>
                <div className="flex items-center justify-between p-2.5 rounded-xl bg-[var(--card)] border border-[var(--border-default)]">
                  <div className="flex items-center gap-2 text-xs font-mono font-bold text-[var(--text-primary)]">
                    <Mail className="size-4 text-[var(--pri)]" />
                    <span>support@eventos.io</span>
                  </div>
                  <span className="text-[10px] font-bold text-[var(--muted)] uppercase tracking-wider">
                    Core Technical Desk
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-[var(--text-primary)]">Event-Specific Organiser Email</label>
                  <input
                    type="email"
                    value={supportEmail}
                    onChange={(e) => setSupportEmail(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface-2)] text-xs text-[var(--text-primary)] font-mono focus:outline-none focus:ring-2 focus:ring-[var(--pri)]"
                    placeholder="organizer@eventdomain.com"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-[var(--text-primary)]">Helpdesk Hotline / WhatsApp</label>
                  <input
                    type="tel"
                    value={supportPhone}
                    onChange={(e) => setSupportPhone(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface-2)] text-xs text-[var(--text-primary)] font-mono focus:outline-none focus:ring-2 focus:ring-[var(--pri)]"
                    placeholder="+91 98765 43210"
                  />
                </div>
              </div>

              <div className="space-y-3 pt-4 border-t border-[var(--border-default)]">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold text-[var(--text-primary)] uppercase tracking-wider">
                    Additional Support Contacts
                  </h4>
                  <button
                    type="button"
                    onClick={addContactItem}
                    className="px-3 py-1.5 rounded-xl text-xs font-bold bg-[var(--pri)]/10 text-[var(--pri)] hover:bg-[var(--pri)]/20 transition-all flex items-center gap-1.5 cursor-pointer"
                  >
                    <Plus className="size-3.5" />
                    <span>Add Channel</span>
                  </button>
                </div>

                {additionalContacts.map((contact) => (
                  <div key={contact.id} className="flex items-center gap-3 p-2.5 rounded-xl bg-[var(--bg-surface-2)] border border-[var(--border-default)]">
                    {/* Dynamic channel icon */}
                    <div className="shrink-0">
                      {contact.type === "whatsapp" && (
                        <div className="size-8 rounded-lg bg-emerald-500/10 text-emerald-500 flex items-center justify-center">
                          <svg className="size-4 fill-emerald-500" viewBox="0 0 24 24">
                            <path d="M12.031 2C6.496 2 2 6.496 2 12.031c0 1.83.493 3.618 1.43 5.183L2 22l4.912-1.397a10.003 10.003 0 0 0 5.119 1.428h.004c5.531 0 10.027-4.496 10.027-10.031 0-2.678-1.043-5.198-2.937-7.092A9.972 9.972 0 0 0 12.031 2zm0 18.232h-.003a8.214 8.214 0 0 1-4.184-1.144l-.3-.178-3.111.885.875-3.033-.195-.312A8.172 8.172 0 0 1 3.824 12.03c0-4.526 3.682-8.208 8.211-8.208 2.193 0 4.255.855 5.807 2.408a8.163 8.163 0 0 1 2.405 5.804c0 4.527-3.682 8.208-8.216 8.208zm4.5-6.148c-.247-.124-1.463-.722-1.69-.805-.227-.083-.392-.124-.557.124-.165.247-.64 1.805-.784.97-.144.165-.289.186-.536.062-.247-.124-1.044-.385-1.989-1.227-.735-.655-1.232-1.464-1.376-1.712-.144-.247-.015-.381.109-.504.111-.111.247-.289.371-.433.124-.144.165-.247.247-.412.083-.165.041-.309-.021-.433-.062-.124-.557-1.341-.763-1.836-.201-.482-.405-.417-.557-.425l-.474-.008c-.165 0-.433.062-.66.309-.227.247-.866.846-.866 2.063s.887 2.393 1.011 2.558c.124.165 1.745 2.665 4.228 3.738.591.256 1.053.409 1.413.523.594.189 1.134.162 1.561.098.477-.071 1.463-.598 1.669-1.176.206-.577.206-1.072.144-1.175-.062-.103-.227-.165-.474-.289z" />
                          </svg>
                        </div>
                      )}
                      {contact.type === "email" && (
                        <div className="size-8 rounded-lg bg-[var(--pri)]/10 text-[var(--pri)] flex items-center justify-center">
                          <Mail className="size-4" />
                        </div>
                      )}
                      {contact.type === "phone" && (
                        <div className="size-8 rounded-lg bg-sky-500/10 text-sky-500 flex items-center justify-center">
                          <Phone className="size-4" />
                        </div>
                      )}
                      {contact.type === "desk" && (
                        <div className="size-8 rounded-lg bg-amber-500/10 text-amber-500 flex items-center justify-center">
                          <LifeBuoy className="size-4" />
                        </div>
                      )}
                    </div>

                    <input
                      type="text"
                      value={contact.label}
                      onChange={(e) => {
                        const next = additionalContacts.map((c) =>
                          c.id === contact.id ? { ...c, label: e.target.value } : c
                        );
                        setAdditionalContacts(next);
                      }}
                      className="w-36 px-3 py-1.5 rounded-lg border border-[var(--border-default)] bg-[var(--card)] text-xs text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--pri)]"
                      placeholder="Label (e.g. Travel Desk)"
                    />

                    <select
                      value={contact.type}
                      onChange={(e) => {
                        const next = additionalContacts.map((c) =>
                          c.id === contact.id ? { ...c, type: e.target.value as any } : c
                        );
                        setAdditionalContacts(next);
                      }}
                      className="w-36 px-3 py-1.5 rounded-lg border border-[var(--border-default)] bg-[var(--card)] text-xs text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--pri)]"
                    >
                      <option value="email">Email</option>
                      <option value="phone">Phone</option>
                      <option value="whatsapp">WhatsApp</option>
                      <option value="desk">Help Desk</option>
                    </select>

                    <input
                      type="text"
                      value={contact.value}
                      onChange={(e) => {
                        const next = additionalContacts.map((c) =>
                          c.id === contact.id ? { ...c, value: e.target.value } : c
                        );
                        setAdditionalContacts(next);
                      }}
                      className="flex-1 px-3 py-1.5 rounded-lg border border-[var(--border-default)] bg-[var(--card)] text-xs text-[var(--text-primary)] font-mono focus:outline-none focus:ring-2 focus:ring-[var(--pri)]"
                      placeholder="support@eventos.io or +91 99999..."
                    />

                    <button
                      type="button"
                      onClick={() => removeContactItem(contact.id)}
                      className="p-1.5 text-slate-400 hover:text-rose-500 transition-colors cursor-pointer self-center"
                      title="Remove"
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </div>
                ))}
              </div>
            </motion.div>
          )}

          {/* ════ TAB 6: TRUE-TO-LIFE LIVE PORTAL SIMULATOR ════ */}
          {activeTab === "preview" && (
            <motion.div
              key="preview"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              className="space-y-5"
            >
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h3 className="text-base font-bold text-[var(--text-primary)] flex items-center gap-2">
                    <Monitor className="size-4 text-[var(--pri)]" />
                    Pixel-Perfect Attendee Portal Simulator
                  </h3>
                  <p className="text-xs text-[var(--text-secondary)] mt-0.5">
                    Real-time simulation showing the frosted glass attendee cards, official QR pass, announcements card, and custom backdrop.
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  {/* Device Selector */}
                  <div className="flex items-center gap-1 p-1 rounded-xl bg-[var(--bg-surface-2)] border border-[var(--border-default)]">
                    <button
                      type="button"
                      onClick={() => setPreviewDevice("desktop")}
                      className={`p-1.5 rounded-lg transition-all ${previewDevice === "desktop"
                        ? "bg-[var(--pri)] text-white"
                        : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                        }`}
                      title="Desktop View"
                    >
                      <Monitor className="size-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setPreviewDevice("mobile")}
                      className={`p-1.5 rounded-lg transition-all ${previewDevice === "mobile"
                        ? "bg-[var(--pri)] text-white"
                        : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                        }`}
                      title="Mobile View"
                    >
                      <Smartphone className="size-4" />
                    </button>
                  </div>

                  {/* Mode Selector */}
                  <div className="flex items-center gap-1 p-1 rounded-xl bg-[var(--bg-surface-2)] border border-[var(--border-default)]">
                    <button
                      type="button"
                      onClick={() => setPreviewTheme("dark")}
                      className={`p-1.5 rounded-lg transition-all ${previewTheme === "dark"
                        ? "bg-[var(--pri)] text-white"
                        : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                        }`}
                      title="Dark Mode"
                    >
                      <Moon className="size-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setPreviewTheme("light")}
                      className={`p-1.5 rounded-lg transition-all ${previewTheme === "light"
                        ? "bg-[var(--pri)] text-white"
                        : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                        }`}
                      title="Light Mode"
                    >
                      <Sun className="size-4" />
                    </button>
                  </div>
                </div>
              </div>

              {/* ── SIMULATION CANVAS WITH REAL-TIME LUMINANCE CONTRAST ── */}
              {(() => {
                // Determine perceptive luminance & contrast tokens
                const isSolid = bgMode === "solid" && !!bgSolidColor;
                let isDark = previewTheme === "dark";
                if (isSolid) {
                  const hex = bgSolidColor.replace("#", "");
                  const r = parseInt(hex.substring(0, 2), 16) || 0;
                  const g = parseInt(hex.substring(2, 4), 16) || 0;
                  const b = parseInt(hex.substring(4, 6), 16) || 0;
                  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
                  isDark = lum < 0.55;
                }

                const getHexLum = (c: string) => {
                  const h = (c || "#6366F1").replace("#", "");
                  const r = parseInt(h.substring(0, 2), 16) || 0;
                  const g = parseInt(h.substring(2, 4), 16) || 0;
                  const b = parseInt(h.substring(4, 6), 16) || 0;
                  return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
                };

                const priContrast = getHexLum(primaryColor) > 0.58 ? "#09090b" : "#ffffff";
                const secContrast = getHexLum(secondaryColor) > 0.58 ? "#09090b" : "#ffffff";

                const simColors = {
                  canvasBg: isSolid ? bgSolidColor : (isDark ? "#080912" : "#f8fafc"),
                  text: isDark ? "#f8fafc" : "#0f172a",
                  muted: isDark ? "#94a3b8" : "#64748b",
                  cardBg: isDark ? "rgba(18, 21, 40, 0.85)" : "rgba(255, 255, 255, 0.88)",
                  innerCardBg: isDark ? "rgba(0, 0, 0, 0.28)" : "#f8fafc",
                  borderColor: isDark ? "rgba(255, 255, 255, 0.16)" : "rgba(0, 0, 0, 0.12)",
                  headerBg: isDark ? "rgba(8, 9, 18, 0.88)" : "rgba(255, 255, 255, 0.88)",
                };

                return (
                  <div
                    className={`mx-auto rounded-3xl border overflow-hidden shadow-2xl transition-all duration-300 relative ${
                      previewDevice === "mobile" ? "max-w-sm" : "w-full"
                    }`}
                    style={{
                      backgroundColor: simColors.canvasBg,
                      borderColor: simColors.borderColor,
                      color: simColors.text,
                    }}
                  >
                    {/* ── ACTIVE BACKGROUND RENDERING LAYER ── */}
                    {bgMode === "image" && bgImageUrl && (
                      <div className="absolute inset-0 pointer-events-none overflow-hidden select-none">
                        <div
                          className="absolute inset-0 w-full h-full bg-cover bg-center transition-all duration-500 scale-105"
                          style={{
                            backgroundImage: `url(${bgImageUrl})`,
                            filter: bgBlur > 0 ? `blur(${bgBlur}px)` : "none",
                          }}
                        />
                        <div
                          className="absolute inset-0 transition-opacity duration-300"
                          style={{
                            backgroundColor: isDark ? "#080912" : "#ffffff",
                            opacity: bgOverlayOpacity,
                          }}
                        />
                      </div>
                    )}

                    {bgMode === "pattern" && svgPattern !== "none" && (
                      <div className="absolute inset-0 pointer-events-none opacity-60 select-none">
                        {/* 1. Luminous Glow Wave */}
                        {(svgPattern === "glow-wave" || svgPattern === "waves") && (
                          <svg className="w-full h-full" viewBox="0 0 1440 900" fill="none">
                            <radialGradient id="simWaveGlow1" cx="20%" cy="20%" r="50%">
                              <stop offset="0%" stopColor={primaryColor} stopOpacity="0.45" />
                              <stop offset="100%" stopColor="transparent" stopOpacity="0" />
                            </radialGradient>
                            <radialGradient id="simWaveGlow2" cx="80%" cy="80%" r="50%">
                              <stop offset="0%" stopColor={secondaryColor} stopOpacity="0.4" />
                              <stop offset="100%" stopColor="transparent" stopOpacity="0" />
                            </radialGradient>
                            <rect width="1440" height="900" fill="url(#simWaveGlow1)" />
                            <rect width="1440" height="900" fill="url(#simWaveGlow2)" />
                            <path d="M-100 300 C 300 100, 600 500, 1100 250 C 1300 150, 1500 350, 1700 280" stroke={primaryColor} strokeWidth="2.5" strokeDasharray="8 10" fill="none" opacity="0.6" />
                            <path d="M-50 600 C 400 350, 800 800, 1200 500 C 1400 400, 1550 650, 1750 550" stroke={secondaryColor} strokeWidth="2" fill="none" opacity="0.5" />
                          </svg>
                        )}

                        {/* 2. Cyber Beam Grid */}
                        {(svgPattern === "tech-grid" || svgPattern === "diagonal-lines") && (
                          <svg className="w-full h-full" viewBox="0 0 1440 900" fill="none">
                            <defs>
                              <pattern id="simGridPat" width="56" height="56" patternUnits="userSpaceOnUse">
                                <path d="M 56 0 L 0 0 0 56" fill="none" stroke={primaryColor} strokeWidth="1" strokeOpacity="0.18" />
                              </pattern>
                            </defs>
                            <rect width="1440" height="900" fill="url(#simGridPat)" />
                            <line x1="0" y1="0" x2="1440" y2="900" stroke={primaryColor} strokeWidth="1.75" strokeOpacity="0.3" strokeDasharray="10 14" />
                          </svg>
                        )}

                        {/* 3. Radial Cyber Matrix */}
                        {(svgPattern === "cyber-matrix" || svgPattern === "circuit") && (
                          <svg className="w-full h-full" viewBox="0 0 1440 900" fill="none">
                            <circle cx="720" cy="450" r="160" stroke={primaryColor} strokeWidth="1.5" strokeOpacity="0.35" strokeDasharray="6 8" />
                            <circle cx="720" cy="450" r="320" stroke={secondaryColor} strokeWidth="1.2" strokeOpacity="0.25" strokeDasharray="4 10" />
                            <line x1="580" y1="360" x2="940" y2="340" stroke={primaryColor} strokeWidth="1.5" strokeOpacity="0.4" />
                          </svg>
                        )}

                        {/* 4. Geometric Prism Mesh */}
                        {(svgPattern === "prism-mesh" || svgPattern === "geometric-shapes") && (
                          <svg className="w-full h-full" viewBox="0 0 1440 900" fill="none">
                            <polygon points="80,40 420,210 180,640" stroke={primaryColor} strokeWidth="1.5" strokeOpacity="0.4" fill={primaryColor} fillOpacity="0.1" />
                            <polygon points="420,210 840,90 680,480" stroke={secondaryColor} strokeWidth="1.5" strokeOpacity="0.35" fill={secondaryColor} fillOpacity="0.1" />
                          </svg>
                        )}

                        {/* 5. Triangle Halftone */}
                        {svgPattern === "triangle-halftone" && (
                          <svg className="w-full h-full" viewBox="0 0 1440 900" fill="none">
                            <defs>
                              <pattern id="simIsoGrid" width="60" height="103.92" patternUnits="userSpaceOnUse">
                                <path d="M 30 0 L 60 51.96 L 30 103.92 L 0 51.96 Z M 0 0 L 60 103.92 M 60 0 L 0 103.92" stroke={primaryColor} strokeWidth="0.75" strokeOpacity="0.15" fill="none" />
                              </pattern>
                              <pattern id="simHalftoneTop" width="120" height="207.84" patternUnits="userSpaceOnUse">
                                <polygon points="30,12 50,44 10,44" fill={primaryColor} fillOpacity="0.7" />
                                <polygon points="90,12 110,44 70,44" fill={secondaryColor} fillOpacity="0.65" />
                                <polygon points="30,48 50,16 10,16" fill={primaryColor} fillOpacity="0.6" />
                              </pattern>
                              <pattern id="simHalftoneBottom" width="120" height="207.84" patternUnits="userSpaceOnUse">
                                <polygon points="30,135 45,110 15,110" fill={primaryColor} fillOpacity="0.45" />
                                <polygon points="90,135 105,110 75,110" fill={secondaryColor} fillOpacity="0.4" />
                                <polygon points="30,195 50,163 10,163" fill={primaryColor} fillOpacity="0.7" />
                              </pattern>
                            </defs>
                            <rect width="1440" height="900" fill="url(#simIsoGrid)" />
                            <rect x="0" y="0" width="1440" height="300" fill="url(#simHalftoneTop)" />
                            <rect x="0" y="600" width="1440" height="300" fill="url(#simHalftoneBottom)" />
                          </svg>
                        )}

                        {/* 6. Rotational Dash Matrix */}
                        {svgPattern === "dash-matrix" && (
                          <svg className="w-full h-full" viewBox="0 0 1440 900" fill="none">
                            <defs>
                              <pattern id="simDashPat" width="96" height="144" patternUnits="userSpaceOnUse">
                                <rect x="12" y="6" width="3" height="6" rx="1.5" fill={primaryColor} fillOpacity="0.25" />
                                <rect x="36" y="6" width="3" height="6" rx="1.5" fill={secondaryColor} fillOpacity="0.25" />
                                <rect x="24" y="24" width="4" height="10" rx="2" fill={primaryColor} fillOpacity="0.4" transform="rotate(15 26 29)" />
                                <rect x="48" y="24" width="4" height="10" rx="2" fill={secondaryColor} fillOpacity="0.4" transform="rotate(-15 50 29)" />
                                <rect x="24" y="72" width="7" height="22" rx="3.5" fill={secondaryColor} fillOpacity="0.8" transform="rotate(65 27.5 83)" />
                              </pattern>
                            </defs>
                            <rect width="1440" height="900" fill="url(#simDashPat)" />
                          </svg>
                        )}

                        {/* 7. Minimal Dots */}
                        {svgPattern === "minimal-dots" && (
                          <svg className="w-full h-full" viewBox="0 0 1440 900" fill="none">
                            <defs>
                              <pattern id="simCleanDots" width="36" height="36" patternUnits="userSpaceOnUse">
                                <circle cx="2.5" cy="2.5" r="1.75" fill={primaryColor} fillOpacity="0.28" />
                              </pattern>
                            </defs>
                            <rect width="1440" height="900" fill="url(#simCleanDots)" />
                          </svg>
                        )}
                      </div>
                    )}

                    {/* ── SIMULATED HEADER ── */}
                    <div
                      className="px-5 py-3 border-b flex items-center justify-between relative z-20 backdrop-blur-md"
                      style={{
                        borderColor: simColors.borderColor,
                        backgroundColor: simColors.headerBg,
                      }}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        {logoUrl ? (
                          <img src={logoUrl} alt="Logo" className="h-7 w-7 rounded-xl object-contain shadow-sm" />
                        ) : (
                          <div
                            className="h-7 w-7 rounded-xl flex items-center justify-center text-[10px] font-black text-white shadow-sm border border-white/20 uppercase select-none"
                            style={{ backgroundColor: primaryColor }}
                          >
                            {(shortCode || eventName?.slice(0, 3) || "EV").slice(0, 4)}
                          </div>
                        )}
                        <div className="truncate">
                          <span className="font-extrabold text-xs sm:text-sm tracking-tight truncate block" style={{ color: simColors.text }}>
                            {eventName || "14th National Clinical & AI Conference"}
                          </span>
                          <span className="text-[9px] font-bold uppercase tracking-widest block -mt-0.5" style={{ color: simColors.muted }}>
                            Participant Portal
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <div
                          className="h-7 w-7 rounded-full flex items-center justify-center text-[10px] font-bold text-white shadow-sm cursor-pointer"
                          style={{ backgroundColor: primaryColor }}
                        >
                          JD
                        </div>
                      </div>
                    </div>

                    {/* ── SIMULATED DASHBOARD BODY WITH FROSTED GLASS CARDS ── */}
                    <div className="p-5 sm:p-8 space-y-6 relative z-10">
                      {/* Attendee Welcome Greeting Card */}
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                        <div className="space-y-1">
                          <span className="text-[10px] font-bold uppercase tracking-widest block" style={{ color: simColors.muted }}>
                            Welcome back
                          </span>
                          <h2 className="text-xl sm:text-2xl font-black tracking-tight" style={{ color: simColors.text }}>
                            Dr. John Doe <span className="inline-block animate-wave">👋</span>
                          </h2>
                          <p className="text-xs max-w-md" style={{ color: simColors.muted }}>
                            {tagline || "Here is your official digital pass, verified session agenda, and live announcements."}
                          </p>
                        </div>

                        <button
                          type="button"
                          className="px-3.5 py-2 rounded-xl border text-xs font-bold flex items-center gap-2 transition-all self-start sm:self-auto cursor-pointer shadow-sm"
                          style={{
                            borderColor: simColors.borderColor,
                            backgroundColor: simColors.cardBg,
                            color: simColors.text,
                            backdropFilter: "blur(12px)",
                          }}
                        >
                          <Edit3 className="size-3.5" style={{ color: primaryColor }} />
                          <span>Edit Profile</span>
                        </button>
                      </div>

                      {/* Official Entry Pass Card & Announcements Grid */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                        {/* Pass Card with Frosted Glassmorphism */}
                        <div
                          className="p-5 sm:p-6 rounded-3xl border relative overflow-hidden space-y-4 shadow-2xl ring-1"
                          style={{
                            borderColor: simColors.borderColor,
                            backgroundColor: simColors.cardBg,
                            backdropFilter: "blur(16px)",
                            color: simColors.text,
                          }}
                        >
                          <div
                            className="absolute top-0 left-0 right-0 h-1.5"
                            style={{
                              background: `linear-gradient(90deg, ${primaryColor}, ${secondaryColor})`,
                            }}
                          />

                          <div className="flex items-center justify-between pt-1">
                            <div className="space-y-0.5">
                              <span className="text-[10px] font-black uppercase tracking-widest block" style={{ color: simColors.muted }}>
                                Verified Pass
                              </span>
                              <h3 className="text-sm font-black uppercase tracking-tight">
                                Delegate Entry Badge
                              </h3>
                            </div>

                            <span
                              className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider shadow-sm"
                              style={{ backgroundColor: primaryColor, color: priContrast }}
                            >
                              Confirmed
                            </span>
                          </div>

                          {/* QR and Attendee Details */}
                          <div
                            className="flex items-center gap-4 p-3.5 rounded-2xl border shadow-inner"
                            style={{
                              borderColor: simColors.borderColor,
                              backgroundColor: simColors.innerCardBg,
                            }}
                          >
                            <div className="h-16 w-16 rounded-xl bg-white p-1.5 flex items-center justify-center shadow-md shrink-0">
                              <QrCode className="size-full text-black" />
                            </div>
                            <div className="min-w-0 space-y-0.5">
                              <span className="text-xs font-black truncate block">Dr. John Doe</span>
                              <span className="text-[10px] font-mono block" style={{ color: simColors.muted }}>ID: CONF-8921-VIP</span>
                              <span className="text-[10px] truncate block" style={{ color: simColors.muted }}>AIIMS New Delhi • India</span>
                            </div>
                          </div>

                          {/* Action Buttons */}
                          <div className="flex items-center gap-2 pt-1 flex-wrap">
                            <button
                              type="button"
                              className="flex-1 py-2 px-3 rounded-xl text-xs font-bold shadow-md flex items-center justify-center gap-1.5 cursor-pointer"
                              style={{ backgroundColor: primaryColor, color: priContrast }}
                            >
                              <Download className="size-3.5" />
                              <span>Download Pass</span>
                            </button>

                            <button
                              type="button"
                              className="py-2 px-3 rounded-xl text-xs font-bold border flex items-center gap-1.5 cursor-pointer"
                              style={{
                                borderColor: simColors.borderColor,
                                backgroundColor: simColors.innerCardBg,
                                color: simColors.text,
                              }}
                            >
                              <Printer className="size-3.5" />
                              <span>PDF</span>
                            </button>
                          </div>
                        </div>

                        {/* Announcements Card with Frosted Glassmorphism */}
                        <div
                          className="p-5 sm:p-6 rounded-3xl border relative overflow-hidden space-y-4 shadow-2xl ring-1 flex flex-col justify-between"
                          style={{
                            borderColor: simColors.borderColor,
                            backgroundColor: simColors.cardBg,
                            backdropFilter: "blur(16px)",
                            color: simColors.text,
                          }}
                        >
                          <div className="space-y-3">
                            <div className="flex items-center justify-between">
                              <span className="text-xs font-bold uppercase tracking-wider flex items-center gap-2">
                                <Zap className="size-3.5" style={{ color: secondaryColor }} />
                                Live Notices &amp; Broadcasts
                              </span>
                              <span className="px-2 py-0.5 rounded-full text-[9px] font-bold bg-amber-500/10 text-amber-500 border border-amber-500/20">
                                Live Update
                              </span>
                            </div>

                            <div
                              className="p-3.5 rounded-2xl border space-y-1"
                              style={{
                                borderColor: simColors.borderColor,
                                backgroundColor: simColors.innerCardBg,
                              }}
                            >
                              <h4 className="text-xs font-bold">
                                Registration Desk &amp; Badge Pickup Open
                              </h4>
                              <p className="text-[11px] leading-relaxed" style={{ color: simColors.muted }}>
                                Delegates can collect printed badges and conference kits at Hall B between 8:00 AM and 5:00 PM.
                              </p>
                            </div>
                          </div>

                          <div
                            className="pt-2 border-t flex items-center justify-between text-[10px]"
                            style={{ borderColor: simColors.borderColor, color: simColors.muted }}
                          >
                            <span>Updated 15 mins ago</span>
                            <span className="font-bold" style={{ color: secondaryColor }}>View All Notices &rarr;</span>
                          </div>
                        </div>
                      </div>

                      {/* ── SIMULATED 4 STATUS KPI CARDS ── */}
                      <div className="space-y-2.5 pt-2">
                        <span className="text-xs font-extrabold tracking-tight block" style={{ color: simColors.text }}>
                          Registration Status Overview
                        </span>

                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                          {/* KPI 1: Registration */}
                          <div
                            className="p-4 rounded-2xl border shadow-lg space-y-2"
                            style={{
                              borderColor: simColors.borderColor,
                              backgroundColor: simColors.cardBg,
                              backdropFilter: "blur(16px)",
                            }}
                          >
                            <div className="flex items-center justify-between">
                              <span className="text-[10px] font-bold" style={{ color: simColors.muted }}>Registration</span>
                              <span className="text-[9px] font-black uppercase text-emerald-500">Confirmed</span>
                            </div>
                            <div>
                              <span className="text-[9px] block" style={{ color: simColors.muted }}>Registered on</span>
                              <span className="text-xs font-bold block" style={{ color: simColors.text }}>24 Aug 2026</span>
                            </div>
                          </div>

                          {/* KPI 2: Payment */}
                          <div
                            className="p-4 rounded-2xl border shadow-lg space-y-2"
                            style={{
                              borderColor: simColors.borderColor,
                              backgroundColor: simColors.cardBg,
                              backdropFilter: "blur(16px)",
                            }}
                          >
                            <div className="flex items-center justify-between">
                              <span className="text-[10px] font-bold" style={{ color: simColors.muted }}>Payment</span>
                              <span className="text-[9px] font-black uppercase text-emerald-500">Paid</span>
                            </div>
                            <div>
                              <span className="text-[9px] block" style={{ color: simColors.muted }}>Amount</span>
                              <span className="text-xs font-bold block" style={{ color: simColors.text }}>₹ 4,500</span>
                            </div>
                          </div>

                          {/* KPI 3: Badge */}
                          <div
                            className="p-4 rounded-2xl border shadow-lg space-y-2"
                            style={{
                              borderColor: simColors.borderColor,
                              backgroundColor: simColors.cardBg,
                              backdropFilter: "blur(16px)",
                            }}
                          >
                            <div className="flex items-center justify-between">
                              <span className="text-[10px] font-bold" style={{ color: simColors.muted }}>Physical Badge</span>
                              <span className="text-[9px] font-black uppercase text-emerald-500">Ready</span>
                            </div>
                            <div>
                              <span className="text-[9px] block" style={{ color: simColors.muted }}>Pickup</span>
                              <span className="text-xs font-bold block" style={{ color: simColors.text }}>Hall B Desk</span>
                            </div>
                          </div>

                          {/* KPI 4: Certificate */}
                          <div
                            className="p-4 rounded-2xl border shadow-lg space-y-2"
                            style={{
                              borderColor: simColors.borderColor,
                              backgroundColor: simColors.cardBg,
                              backdropFilter: "blur(16px)",
                            }}
                          >
                            <div className="flex items-center justify-between">
                              <span className="text-[10px] font-bold" style={{ color: simColors.muted }}>Certificate</span>
                              <span className="text-[9px] font-bold uppercase" style={{ color: simColors.muted }}>Pending</span>
                            </div>
                            <div>
                              <span className="text-[9px] block" style={{ color: simColors.muted }}>Available after</span>
                              <span className="text-xs font-bold block" style={{ color: simColors.text }}>Conclusion</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })()}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
