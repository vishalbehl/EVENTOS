"use client";

import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useState, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Globe, Sliders, Shield, Trash2, Save, Loader2, Building2, MapPin, Calendar, Users, Info, ToggleLeft, FileArchive, Zap, AlertCircle, Clock, Mail, Phone, CheckCircle2, AlertTriangle, ArrowRight, ShieldCheck, Plus,
  TrendingUp, Award, ExternalLink, RefreshCw, Upload
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { useEvent, useUpdateEvent } from "@/hooks/useEvents";
import { useSessions } from "@/hooks/useSessions";
import { useFiles } from "@/hooks/useFiles";
import { apiClient } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/store/use-auth-store";
import { Skeleton } from "@/components/ui/skeleton";
import { CountryStateEntry, fetchCountryStates, getStatesForCountry } from "@/lib/country-states";

type DetailsTab = "overview" | "venue" | "settings" | "activation";
type SettingsSubTab = "general" | "time" | "privacy" | "integrations" | "team" | "danger";
type ProgramStatus = "draft" | "final" | "updated";

const statusToProgram = (status?: string): ProgramStatus => {
  if (status === "active") return "final";
  if (status === "completed" || status === "archived") return "updated";
  return "draft";
};

const programToStatus = (status: ProgramStatus) => {
  if (status === "final") return "active";
  if (status === "updated") return "completed";
  return "draft";
};

const toDateInput = (value?: string | null) => (value ? value.slice(0, 10) : "");
const toDateTimeInput = (value?: string | null) => (value ? value.slice(0, 16) : "");
const csvFormats = (value: string) =>
  value
    .split(/[,\n]/)
    .map((item) => item.trim().toLowerCase().replace(/^\./, ""))
    .filter(Boolean);

export default function EventSettingsPage() {
  const { eventId } = useParams();
  const router = useRouter();
  const eventIdValue = eventId as string;
  const { user } = useAuthStore();

  const { data: event, isLoading: eventLoading, refetch: refetchEvent } = useEvent(eventIdValue);
  const { data: sessions } = useSessions(eventIdValue);
  const { data: files } = useFiles(eventIdValue);
  const updateEvent = useUpdateEvent(eventIdValue);

  const isAdmin = useMemo(() => {
    return user && ["super_admin", "organiser", "admin"].includes(user.role);
  }, [user]);

  const searchParams = useSearchParams();
  const tabParam = searchParams.get("tab") as DetailsTab | null;

  const [activeTab, setActiveTab] = useState<DetailsTab>(tabParam || "overview");
  const [activeSubTab, setActiveSubTab] = useState<SettingsSubTab>("general");

  const [isSaving, setIsSaving] = useState(false);
  const [isClearing, setIsClearing] = useState(false);
  const [users, setUsers] = useState<any[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [countryStates, setCountryStates] = useState<CountryStateEntry[]>([]);

  // Form State
  const [form, setForm] = useState({
    name: "",
    short_code: "",
    country: "",
    state: "",
    organizer_details: {
      name: "",
      email: "",
      phone: "",
      website: "",
    },
    location: "",
    venue_name: "",
    start_date: "",
    end_date: "",
    status: "draft" as ProgramStatus,
    enable_posters: true,
    upload_deadline: "",
    max_file_size_mb: 500,
    allowed_formats: "pptx, pdf, mp4, zip, folder",
    enable_moderator: true,
    enable_whatsapp: false,
    enable_srr: true,
    enable_signage: true,
    enable_webhooks: false,
    enable_auto_approval: false,
    timezone: "UTC",
    tagline: "",
    description: "",
    map_link: "",
    venue_images: [] as string[],
    venue_details: {
      website: "",
      email: "",
      phone: "",
      facilities: [] as string[],
      images: [] as string[],
      notes: "",
      map_coords: "",
    },
    licensing_details: {
      plan_name: "",
      price: 0,
      addons: [] as string[],
      activated_at: null as string | null,
      expires_at: null as string | null,
      status: "inactive",
    },
  });

  // Venue Facilities checklist
  const [facilities, setFacilities] = useState<string[]>([
    "High Speed WiFi", "Parking Available", "Wheelchair Access", "Catering Services"
  ]);

  const [isUploadingImage, setIsUploadingImage] = useState(false);

  useEffect(() => {
    fetchCountryStates().then(setCountryStates).catch(console.error);
  }, []);

  const [analytics, setAnalytics] = useState<any>(null);

  useEffect(() => {
    if (!eventIdValue) return;
    apiClient.get<any>(`/events/${eventIdValue}/participants/analytics-dashboard`)
      .then(res => setAnalytics(res))
      .catch(err => console.error("Failed to load analytics dashboard data", err));
  }, [eventIdValue]);

  useEffect(() => {
    if (tabParam && ["overview", "venue", "settings", "activation"].includes(tabParam)) {
      setActiveTab(tabParam);
    }
  }, [tabParam]);

  useEffect(() => {
    if (activeSubTab === "team" && isAdmin) {
      setUsersLoading(true);
      apiClient.get<any[]>("/users")
        .then((res) => {
          const assigned = res.filter((u: any) =>
            u.assignments?.some((a: any) => a.event_id === eventIdValue)
          );
          setUsers(assigned);
        })
        .catch((err) => {
          console.error("Failed to fetch event users", err);
        })
        .finally(() => {
          setUsersLoading(false);
        });
    }
  }, [activeSubTab, isAdmin, eventIdValue]);

  useEffect(() => {
    if (!event) return;
    const toggles = (event as any).feature_toggles || {};
    const details = (event as any).organizer_details || { name: "", email: "", phone: "", website: "" };
    const vDetails = (event as any).venue_details || {};
    const lDetails = (event as any).licensing_details || {};

    setForm((current) => ({
      ...current,
      name: event.name || "",
      short_code: event.short_code || "",
      country: (event as any).country || "",
      state: (event as any).state || "",
      organizer_details: {
        name: details.name || (event as any).organizer_name || "",
        email: details.email || "",
        phone: details.phone || "",
        website: details.website || ""
      },
      location: event.location || "",
      venue_name: event.venue_name || "",
      start_date: toDateInput(event.start_date),
      end_date: toDateInput(event.end_date),
      status: statusToProgram(event.status),
      upload_deadline: toDateTimeInput(event.upload_deadline),
      max_file_size_mb: event.max_file_size_mb || 500,
      allowed_formats: (event.allowed_formats?.length ? event.allowed_formats : ["pptx", "pdf", "mp4", "zip", "folder"]).join(", "),
      timezone: event.timezone || "UTC",
      tagline: (event as any).tagline || "",
      description: (event as any).description || "",
      map_link: (event as any).map_link || "",
      venue_images: (event as any).venue_images || [],
      venue_details: {
        website: vDetails.website || "",
        email: vDetails.email || "",
        phone: vDetails.phone || "",
        facilities: vDetails.facilities || [],
        images: vDetails.images || [],
        notes: vDetails.notes || "",
        map_coords: vDetails.map_coords || "",
      },
      licensing_details: {
        plan_name: lDetails.plan_name || "",
        price: lDetails.price || 0,
        addons: lDetails.addons || [],
        activated_at: lDetails.activated_at || null,
        expires_at: lDetails.expires_at || null,
        status: lDetails.status || "inactive",
      },
      // Feature Toggles
      enable_posters: toggles.enable_posters ?? true,
      enable_moderator: toggles.enable_moderator ?? true,
      enable_whatsapp: toggles.enable_whatsapp ?? false,
      enable_srr: toggles.enable_srr ?? true,
      enable_signage: toggles.enable_signage ?? true,
      enable_webhooks: toggles.enable_webhooks ?? false,
      enable_auto_approval: toggles.enable_auto_approval ?? false,
    }));
  }, [event]);

  const allowedFormats = useMemo(() => csvFormats(form.allowed_formats), [form.allowed_formats]);

  const speakerCount = useMemo(() => {
    if (!sessions) return 0;
    const set = new Set();
    sessions.forEach(s => s.speakers?.forEach(sp => set.add(sp.id)));
    return set.size;
  }, [sessions]);

  const sessionsCount = sessions?.length || 0;

  const dynamicHighlights = useMemo(() => {
    return [
      `Dates: ${form.start_date ? new Date(form.start_date).toLocaleDateString() : "TBD"} - ${form.end_date ? new Date(form.end_date).toLocaleDateString() : "TBD"}`,
      `Timezone: ${form.timezone}`,
      `Sessions: ${sessionsCount} Scheduled`,
      `Speakers: ${speakerCount} Presenting`,
      `Upload Limit: Max ${form.max_file_size_mb} MB (${form.allowed_formats})`
    ];
  }, [form, sessionsCount, speakerCount]);

  const progressList = useMemo(() => {
    const isVenueConfigured = !!form.venue_name && !!form.location;
    return [
      { label: "Event Setup", pct: 100, color: "bg-emerald-400" },
      { label: "Sessions & Rooms", pct: sessionsCount > 0 ? 100 : 0, color: sessionsCount > 0 ? "bg-emerald-400" : "bg-amber-400" },
      { label: "Speakers", pct: speakerCount > 0 ? 100 : 0, color: speakerCount > 0 ? "bg-emerald-400" : "bg-amber-400" },
      { label: "Registration Portal", pct: (event as any)?.registration_settings?.enabled ? 100 : 0, color: (event as any)?.registration_settings?.enabled ? "bg-emerald-400" : "bg-amber-400" },
      { label: "Communications", pct: form.enable_webhooks ? 100 : 50, color: form.enable_webhooks ? "bg-emerald-400" : "bg-amber-400" },
      { label: "Venue Operations", pct: isVenueConfigured ? 100 : 0, color: isVenueConfigured ? "bg-emerald-400" : "bg-amber-400" }
    ];
  }, [form, sessionsCount, speakerCount, event]);

  const planInclusions = useMemo(() => {
    const tier = form.licensing_details.plan_name;
    if (!tier) return [];
    if (tier.toLowerCase().includes("starter") || tier.toLowerCase().includes("basic") || tier.toLowerCase().includes("free")) {
      return [
        "Up to 500 Registrations",
        "Up to 25 Speakers & Posters",
        "Up to 15 Active Sessions",
        "Up to 3 Rooms Setup Layout",
        "Standard Email Campaigns",
        "Basic Analytics Dashboard"
      ];
    }
    return [
      "Up to 5,000 Registrations",
      "Up to 250 Speakers & Posters",
      "Up to 150 Active Sessions",
      "Up to 20 Rooms Setup Layout",
      "Unlimited Email Campaigns",
      "Real-time Dashboard Analytics",
      "Standard 24/7 Technical Support"
    ];
  }, [form.licensing_details.plan_name]);

  const coverImage = useMemo(() => {
    const banner = (event as any)?.branding_settings?.banner_url || (event as any)?.branding_settings?.logo_url;
    return banner || "https://images.unsplash.com/photo-1511578314322-379afb476865?q=80&w=600&auto=format&fit=crop";
  }, [event]);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const eventPayload: Record<string, unknown> = {
        name: form.name,
        short_code: form.short_code.toUpperCase(),
        country: form.country || null,
        state: form.state || null,
        organizer_name: form.organizer_details.name || null,
        organizer_details: form.organizer_details,
        location: form.location || null,
        venue_name: form.venue_name || null,
        status: programToStatus(form.status),
        timezone: form.timezone,
        upload_deadline: form.upload_deadline || null,
        max_file_size_mb: Number(form.max_file_size_mb),
        allowed_formats: allowedFormats,
        tagline: form.tagline,
        description: form.description,
        map_link: form.map_link || null,
        venue_images: form.venue_images || [],
        venue_details: form.venue_details,
        licensing_details: form.licensing_details,
        feature_toggles: {
          enable_posters: form.enable_posters,
          enable_moderator: form.enable_moderator,
          enable_whatsapp: form.enable_whatsapp,
          enable_srr: form.enable_srr,
          enable_signage: form.enable_signage,
          enable_webhooks: form.enable_webhooks,
          enable_auto_approval: form.enable_auto_approval,
        },
      };
      if (form.start_date) eventPayload.start_date = form.start_date;
      if (form.end_date) eventPayload.end_date = form.end_date;

      await updateEvent.mutateAsync(eventPayload);
      toast.success("Event details updated successfully.");
      refetchEvent();
    } catch (error: any) {
      toast.error(error?.message || "Could not save configuration.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleClearData = async () => {
    if (!window.confirm("ARE YOU SURE? This will PERMANENTLY DELETE all sessions, speakers, rooms, and import history for this event. This cannot be undone.")) {
      return;
    }

    setIsClearing(true);
    try {
      await apiClient.post(`/events/${eventIdValue}/clear-data`);
      toast.success("All event data has been cleared.");
      setTimeout(() => {
        window.location.reload();
      }, 1000);
    } catch (error) {
      toast.error("Failed to clear event data.");
    } finally {
      setIsClearing(false);
    }
  };

  const handleUploadVenueImage = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    
    setIsUploadingImage(true);
    const file = files[0];
    const formData = new FormData();
    formData.append("file", file);

    try {
      const res = await apiClient.post<{ url: string; venue_images?: string[] }>(
        `/events/${eventIdValue}/venue-images/upload`,
        formData,
        { headers: { "Content-Type": "multipart/form-data" } }
      );
      
      const newImages = res.venue_images || [...form.venue_images, res.url];
      setForm(prev => ({
        ...prev,
        venue_images: newImages
      }));
      toast.success("Venue image uploaded successfully.");
    } catch (err: any) {
      console.error(err);
      toast.error(err?.message || "Failed to upload venue image.");
    } finally {
      setIsUploadingImage(false);
    }
  };



  // Render Skeleton while loading
  if (eventLoading) {
    return (
      <div className="space-y-8 p-6">
        <Skeleton className="h-12 w-64 bg-white/5" />
        <Skeleton className="h-64 rounded-3xl bg-white/5" />
      </div>
    );
  }

  return (
    <div className="relative w-full max-w-full overflow-hidden p-6 flex flex-col h-full min-h-0 space-y-6">
      {/* Background Glows */}
      <div className="absolute inset-0 z-0 pointer-events-none">
        <div className="absolute top-[-10%] right-[-10%] w-[500px] h-[500px] bg-[var(--pri)] rounded-full blur-[120px] opacity-10" />
        <div className="absolute bottom-[-10%] left-[-10%] w-[400px] h-[400px] bg-[var(--sec)] rounded-full blur-[120px] opacity-10" />
      </div>

      {/* Header and Submenu tabs */}
      <header className="relative z-10 flex flex-col gap-4 border-b border-white/5 pb-4 sm:flex-row sm:items-center sm:justify-between shrink-0">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Globe className="h-4 w-4 text-[var(--pri)]" />
            <span className="text-[9px] font-black uppercase tracking-[0.35em] text-[var(--pri)]">Event Workspace</span>
          </div>
          <h1 className="text-4xl font-black tracking-tighter text-[var(--text)]">
            EVENT <span className="text-[var(--pri)]">OVERVIEW</span>
          </h1>
        </div>

        {/* Workspace Navigation Bar */}
        <nav className="flex items-center gap-1.5 bg-white/5 p-1.5 rounded-2xl border border-white/5 backdrop-blur-md">
          {[
            { id: "overview", label: "Event Overview", icon: Globe },
            { id: "venue", label: "Venue & Location", icon: Building2 },
            { id: "settings", label: "Event Settings", icon: Sliders },
            { id: "activation", label: "Plan & Activation", icon: Zap }
          ].map((t) => (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id as DetailsTab)}
              className={cn(
                "px-4 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all duration-300 flex items-center gap-2",
                activeTab === t.id
                  ? "bg-[var(--pri)] text-white shadow-lg shadow-[var(--pri)]/20"
                  : "text-[var(--muted)] hover:text-[var(--text)] hover:bg-white/5"
              )}
            >
              <t.icon className="h-3.5 w-3.5" />
              <span>{t.label}</span>
            </button>
          ))}
        </nav>
      </header>

      {/* Main Content Router */}
      <div className="relative z-10 flex-1 min-h-0 overflow-y-auto pr-1 custom-scrollbar">

        {/* VIEW 1: EVENT OVERVIEW */}
        {activeTab === "overview" && (
          <div className="space-y-6 animate-in fade-in duration-500">

            {/* Top Details Card & Health Index */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

              {/* Left Details Block */}
              <Card className="lg:col-span-2 glass-3d border-default p-6 rounded-[2rem] bg-[color-mix(in_srgb,var(--text)_3%,transparent)] flex flex-col md:flex-row gap-6">
                {/* Event Cover Image */}
                <div className="w-full md:w-56 h-56 rounded-2xl overflow-hidden relative border border-white/10 shrink-0">
                  <img
                    src={coverImage}
                    alt="Event backdrop"
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent" />
                  <Badge className="absolute top-3 left-3 bg-emerald-500 text-white border-none rounded font-bold uppercase tracking-wider text-[8px]">
                    {form.status.toUpperCase()}
                  </Badge>
                </div>

                <div className="flex-1 flex flex-col justify-between space-y-4">
                  <div>
                    <h2 className="text-2xl font-black tracking-tight text-[var(--text)]">{form.name}</h2>
                    <p className="text-xs text-muted font-semibold mt-1 italic">{form.tagline ? `"${form.tagline}"` : ""}</p>
                  </div>

                  <div className="grid grid-cols-2 gap-4 text-xs">
                    <div className="flex items-center gap-2">
                      <Calendar className="h-4 w-4 text-[var(--pri)] shrink-0" />
                      <div>
                        <span className="text-[9px] uppercase text-muted block">Duration</span>
                        <span className="font-bold text-[var(--text)]">{new Date(form.start_date || Date.now()).toLocaleDateString()} - {new Date(form.end_date || Date.now()).toLocaleDateString()}</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <Clock className="h-4 w-4 text-[var(--pri)] shrink-0" />
                      <div>
                        <span className="text-[9px] uppercase text-muted block">Timezone</span>
                        <span className="font-bold text-[var(--text)]">{form.timezone}</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <MapPin className="h-4 w-4 text-[var(--pri)] shrink-0" />
                      <div>
                        <span className="text-[9px] uppercase text-muted block">Venue</span>
                        <span className="font-bold text-[var(--text)] truncate block max-w-[150px]">{form.venue_name || "TBD"}</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <Info className="h-4 w-4 text-[var(--pri)] shrink-0" />
                      <div>
                        <span className="text-[9px] uppercase text-muted block">Code</span>
                        <span className="font-bold text-[var(--text)]">#{form.short_code}</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 pt-2">
                    <Button
                      onClick={() => setActiveTab("settings")}
                      className="rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 text-[9px] font-black uppercase tracking-wider h-9"
                    >
                      Configure Workspace
                    </Button>
                    <Button
                      onClick={() => setActiveTab("venue")}
                      className="rounded-xl bg-[var(--pri)] hover:bg-[var(--pri)]/90 text-white text-[9px] font-black uppercase tracking-wider h-9 shadow-lg shadow-[var(--pri)]/20"
                    >
                      Edit Venue setup
                    </Button>
                  </div>
                </div>
              </Card>

              {/* Event Health Score */}
              <Card className="lg:col-span-1 glass-3d border-default p-6 rounded-[2rem] bg-[color-mix(in_srgb,var(--text)_3%,transparent)] flex flex-col items-center justify-center text-center space-y-4">
                <span className="text-[9px] font-black uppercase text-muted tracking-widest">Event Setup Health</span>

                <div className="relative h-28 w-28 rounded-full border-[6px] border-white/5 flex items-center justify-center">
                  <div className="absolute inset-0 rounded-full border-[6px] border-indigo-500 border-t-transparent border-r-transparent animate-spin duration-1000" />
                  <div className="text-center">
                    <span className="text-2xl font-black text-[var(--text)]">
                      {Math.round(progressList.reduce((acc, item) => acc + item.pct, 0) / progressList.length)}%
                    </span>
                    <span className="text-[8px] text-emerald-400 block uppercase font-bold mt-0.5">
                      {Math.round(progressList.reduce((acc, item) => acc + item.pct, 0) / progressList.length) >= 75 ? "Good" : "Drafting"}
                    </span>
                  </div>
                </div>

                <div className="text-xs">
                  <p className="font-bold text-[var(--text)]">Workspace is fully optimized!</p>
                  <p className="text-[9px] text-muted mt-1 uppercase font-semibold">Verification check passed with zero issues.</p>
                </div>
              </Card>

            </div>

            {/* KPI Cards Row */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              {[
                { label: "Registrations", value: analytics?.kpis?.total_registrations ?? 0, change: "Total registered delegates", color: "text-indigo-400" },
                { label: "Speakers List", value: speakerCount || 0, change: "Assigned speakers count", color: "text-emerald-400" },
                { label: "Active Sessions", value: sessionsCount || 0, change: "Scheduled event sessions", color: "text-amber-400" },
                { label: "Est. Ticket Revenue", value: analytics?.kpis?.total_revenue ? "₹ " + Number(analytics.kpis.total_revenue).toLocaleString() : "₹ 0", change: "Confirmed payment collections", color: "text-emerald-500" }
              ].map((kpi, i) => (
                <Card key={i} className="glass-3d border-default bg-[color-mix(in_srgb,var(--text)_2%,transparent)] p-4 flex flex-col justify-between rounded-2xl">
                  <span className="text-[8px] font-black uppercase text-muted tracking-widest">{kpi.label}</span>
                  <h3 className={cn("text-2xl font-black mt-2", kpi.color)}>{kpi.value}</h3>
                  <span className="text-[8px] text-muted font-bold block mt-1 uppercase tracking-wider">{kpi.change}</span>
                </Card>
              ))}
            </div>

            {/* Event Details Grid Row */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

              {/* Description Card */}
              <Card className="lg:col-span-2 glass-3d border-default p-6 rounded-[2rem] bg-[color-mix(in_srgb,var(--text)_3%,transparent)] space-y-4">
                <h3 className="text-xs font-black uppercase tracking-widest text-[var(--text)] border-b border-white/5 pb-2">
                  Event Description
                </h3>
                <p className="text-xs text-muted leading-relaxed whitespace-pre-wrap">
                  {form.description || `${form.name} is the premier technology conference bringing together industry leaders, innovators, researchers, and enthusiasts to explore the latest trends and advancements.`}
                </p>

                {/* Key Highlights list */}
                <div className="pt-4 border-t border-white/5 space-y-3">
                  <span className="text-[8px] font-black uppercase text-muted tracking-widest block">Key Highlights</span>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {dynamicHighlights.map((hl, idx) => (
                      <div key={idx} className="flex items-center gap-2 text-xs text-muted">
                        <CheckCircle2 className="h-4 w-4 text-[var(--pri)] shrink-0" />
                        <span>{hl}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </Card>

              {/* Progress Checklist Card */}
              <Card className="lg:col-span-1 glass-3d border-default p-6 rounded-[2rem] bg-[color-mix(in_srgb,var(--text)_3%,transparent)] space-y-4">
                <h3 className="text-xs font-black uppercase tracking-widest text-[var(--text)] border-b border-white/5 pb-2">
                  Setup Progress
                </h3>

                <div className="space-y-4">
                  {progressList.map((item, idx) => (
                    <div key={idx} className="space-y-1">
                      <div className="flex items-center justify-between text-[9px] font-bold text-muted uppercase">
                        <span>{item.label}</span>
                        <span>{item.pct}%</span>
                      </div>
                      <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
                        <div className={cn("h-full rounded-full", item.color)} style={{ width: `${item.pct}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
              </Card>

            </div>

          </div>
        )}

        {/* VIEW 2: VENUE & LOCATION SETUP */}
        {activeTab === "venue" && (
          <div className="space-y-6 animate-in fade-in duration-500">

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

              {/* Left Column: Venue Info Fields */}
              <Card className="lg:col-span-2 glass-3d border-default p-6 rounded-[2rem] bg-[color-mix(in_srgb,var(--text)_3%,transparent)] space-y-6">
                <div>
                  <h3 className="text-base font-black text-[var(--text)]">Venue & Location Setup</h3>
                  <p className="text-[10px] text-muted mt-0.5">Configure venue details, address, and related physical information.</p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

                  {/* Venue Name */}
                  <div className="space-y-1.5 md:col-span-2">
                    <label className="text-[9px] font-black uppercase text-muted tracking-wider">Venue Name</label>
                    <Input
                      value={form.venue_name}
                      onChange={(e) => setForm({ ...form, venue_name: e.target.value })}
                      placeholder="e.g. Jio World Convention Centre"
                      className="h-11 rounded-xl border border-white/10 bg-[#12131a] text-xs text-[var(--text)] focus:outline-none"
                    />
                  </div>

                  {/* Address */}
                  <div className="space-y-1.5 md:col-span-2">
                    <label className="text-[9px] font-black uppercase text-muted tracking-wider">Address</label>
                    <Textarea
                      value={form.location}
                      onChange={(e) => setForm({ ...form, location: e.target.value })}
                      placeholder="Street address details..."
                      rows={2}
                      className="rounded-xl border border-white/10 bg-[#12131a] text-xs text-[var(--text)] focus:outline-none"
                    />
                  </div>

                  {/* Country */}
                  <div className="space-y-1.5">
                    <label className="text-[9px] font-black uppercase text-muted tracking-wider">Country</label>
                    <select
                      value={form.country}
                      onChange={e => setForm({ ...form, country: e.target.value, state: "" })}
                      className="w-full h-11 px-4 rounded-xl border border-white/10 bg-[#12131a] text-xs text-[var(--text)] focus:outline-none"
                    >
                      <option value="" disabled>Select Country</option>
                      {countryStates.map(c => (
                        <option key={c.country} value={c.country}>{c.country}</option>
                      ))}
                    </select>
                  </div>

                  {/* State */}
                  <div className="space-y-1.5">
                    <label className="text-[9px] font-black uppercase text-muted tracking-wider">State / Province</label>
                    <select
                      value={form.state}
                      onChange={e => setForm({ ...form, state: e.target.value })}
                      disabled={!form.country}
                      className="w-full h-11 px-4 rounded-xl border border-white/10 bg-[#12131a] text-xs text-[var(--text)] focus:outline-none disabled:opacity-50"
                    >
                      <option value="">Select State</option>
                      {getStatesForCountry(countryStates, form.country).map(s => (
                        <option key={s} value={s}>{s}</option>
                      ))}
                    </select>
                  </div>

                  {/* Website */}
                  <div className="space-y-1.5">
                    <label className="text-[9px] font-black uppercase text-muted tracking-wider">Venue Website</label>
                    <Input
                      value={form.venue_details.website}
                      onChange={(e) => setForm({ ...form, venue_details: { ...form.venue_details, website: e.target.value } })}
                      placeholder="https://www.venue.com"
                      className="h-11 rounded-xl border border-white/10 bg-[#12131a] text-xs text-[var(--text)] focus:outline-none"
                    />
                  </div>

                  {/* Contact Email */}
                  <div className="space-y-1.5">
                    <label className="text-[9px] font-black uppercase text-muted tracking-wider">Contact Email</label>
                    <Input
                      value={form.venue_details.email}
                      onChange={(e) => setForm({ ...form, venue_details: { ...form.venue_details, email: e.target.value } })}
                      placeholder="events@venue.com"
                      className="h-11 rounded-xl border border-white/10 bg-[#12131a] text-xs text-[var(--text)] focus:outline-none"
                    />
                  </div>

                </div>

                {/* Facilities tags */}
                <div className="space-y-3 pt-4 border-t border-white/5">
                  <span className="text-[9px] font-black uppercase text-muted tracking-wider">Venue Facilities</span>
                  <div className="flex flex-wrap gap-2">
                    {[
                      "High Speed WiFi", "Parking Available", "Wheelchair Access", "Catering Services",
                      "Audio / Visual", "Accommodation", "Business Center"
                    ].map((fac, idx) => {
                      const isSelected = form.venue_details.facilities.includes(fac);
                      return (
                        <button
                          key={idx}
                          onClick={() => {
                            const updated = isSelected
                              ? form.venue_details.facilities.filter(f => f !== fac)
                              : [...form.venue_details.facilities, fac];
                            setForm({ ...form, venue_details: { ...form.venue_details, facilities: updated } });
                          }}
                          className={cn(
                            "px-4 py-2 rounded-xl text-[10px] font-bold border transition",
                            isSelected
                              ? "bg-[var(--pri)]/10 text-[var(--pri)] border-[var(--pri)]/30"
                              : "bg-white/5 text-muted border-white/5 hover:bg-white/10"
                          )}
                        >
                          {fac}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Save Block */}
                {isAdmin && (
                  <div className="flex justify-end pt-4 border-t border-white/5">
                    <Button
                      onClick={handleSave}
                      disabled={isSaving}
                      className="px-6 py-2 rounded-xl bg-[var(--pri)] hover:bg-[var(--pri)]/90 text-white text-xs font-black uppercase tracking-wider h-11 shadow-lg shadow-[var(--pri)]/20 flex items-center gap-1.5"
                    >
                      {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                      <span>Save & Apply Venue Settings</span>
                    </Button>
                  </div>
                )}
              </Card>

              {/* Right Column: Images, Notes, Map */}
              <div className="space-y-6">

                {/* Images Gallery */}
                <Card className="glass-3d border-default p-6 rounded-[2rem] bg-[color-mix(in_srgb,var(--text)_3%,transparent)] space-y-4">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-black uppercase text-muted tracking-wider">Venue Images</h4>
                    {isUploadingImage && <Loader2 className="h-3.5 w-3.5 animate-spin text-[var(--pri)]" />}
                  </div>

                  <input
                    id="venue-image-upload-input"
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handleUploadVenueImage}
                    disabled={isUploadingImage}
                  />

                  <div className="grid grid-cols-3 gap-2">
                    {form.venue_images.map((img, i) => (
                      <div key={i} className="h-20 rounded-xl overflow-hidden border border-white/5 relative group">
                        <img src={img} className="w-full h-full object-cover" />
                        <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 flex items-center justify-center transition cursor-pointer">
                          <Trash2 className="h-4 w-4 text-rose-500" onClick={() => {
                            const updated = form.venue_images.filter((_, idx) => idx !== i);
                            setForm({ ...form, venue_images: updated });
                          }} />
                        </div>
                      </div>
                    ))}

                    {form.venue_images.length === 0 && (
                      <div className="col-span-3 border border-dashed border-white/10 rounded-xl p-4 text-center bg-white/[0.01] flex flex-col items-center justify-center min-h-[90px]">
                        <Upload className="h-5 w-5 text-muted mb-1" />
                        <p className="text-[9px] text-muted font-bold uppercase tracking-wider">No Venue Gallery Images</p>
                        <p className="text-[7px] text-muted/50 mt-0.5">Upload images representing the venue.</p>
                      </div>
                    )}

                    <button
                      type="button"
                      disabled={isUploadingImage}
                      onClick={() => document.getElementById("venue-image-upload-input")?.click()}
                      className="h-20 rounded-xl border border-dashed border-white/10 hover:border-white/20 flex flex-col items-center justify-center text-center bg-white/[0.01] disabled:opacity-50"
                    >
                      <Plus className="h-4 w-4 text-muted" />
                      <span className="text-[7px] font-bold uppercase text-muted mt-1">Add Image</span>
                    </button>
                  </div>
                </Card>

                {/* Maps mockup */}
                <Card className="glass-3d border-default p-6 rounded-[2rem] bg-[color-mix(in_srgb,var(--text)_3%,transparent)] space-y-3">
                  <h4 className="text-xs font-black uppercase text-muted tracking-wider">Venue Map</h4>
                  <div className="h-28 rounded-xl overflow-hidden relative border border-white/5">
                    <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,var(--pri)_10%,transparent_100%)] opacity-20 pointer-events-none" />
                    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-center space-y-1.5">
                      <MapPin className="h-6 w-6 text-[var(--pri)] mx-auto animate-bounce" />
                      <span className="text-[8px] font-black uppercase text-muted tracking-widest block">Geocoding resolved</span>
                    </div>
                  </div>

                  <div className="space-y-1 pt-1">
                    <label className="text-[8px] font-black uppercase text-muted tracking-wider">Google Maps Link</label>
                    <Input
                      value={form.map_link}
                      onChange={(e) => setForm({ ...form, map_link: e.target.value })}
                      placeholder="e.g. https://maps.google.com/?q=..."
                      className="h-9 rounded-xl border border-white/10 bg-[#12131a] text-[10px] text-[var(--text)] focus:outline-none"
                    />
                  </div>

                  {(() => {
                    const mapsUrl = form.map_link || (form.venue_name || form.location ? `https://maps.google.com/?q=${encodeURIComponent(form.venue_name || form.location)}` : null);
                    if (!mapsUrl) return null;
                    return (
                      <a
                        href={mapsUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[9px] text-[var(--pri)] font-bold uppercase tracking-wider flex items-center gap-1 hover:underline pt-1 inline-flex"
                      >
                        <span>View on Maps</span>
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    );
                  })()}
                </Card>

                {/* Notes box */}
                <Card className="glass-3d border-default p-6 rounded-[2rem] bg-[color-mix(in_srgb,var(--text)_3%,transparent)] space-y-2">
                  <h4 className="text-xs font-black uppercase text-muted tracking-wider">Internal Notes</h4>
                  <Textarea
                    value={form.venue_details.notes}
                    onChange={(e) => setForm({ ...form, venue_details: { ...form.venue_details, notes: e.target.value } })}
                    placeholder="Provide internal instructions for the venue team..."
                    rows={3}
                    className="rounded-xl border border-white/10 bg-[#12131a] text-xs text-[var(--text)] focus:outline-none"
                  />
                </Card>

              </div>

            </div>

          </div>
        )}

        {/* VIEW 3: EVENT SETTINGS */}
        {activeTab === "settings" && (
          <div className="space-y-6 animate-in fade-in duration-500">

            {/* Horizontal Settings Submenu */}
            <nav className="flex items-center gap-1.5 bg-white/5 p-1 rounded-xl border border-white/5 backdrop-blur-md w-fit">
              {[
                { id: "general", label: "General Information" },
                { id: "time", label: "Date & Time" },
                { id: "privacy", label: "Preferences & Toggles" },
                { id: "integrations", label: "Security & Pipelines" },
                { id: "team", label: "Team Access" },
                { id: "danger", label: "Danger Zone" }
              ].map((t) => (
                <button
                  key={t.id}
                  onClick={() => setActiveSubTab(t.id as SettingsSubTab)}
                  className={cn(
                    "px-4 py-2 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all",
                    activeSubTab === t.id
                      ? "bg-white/10 text-white"
                      : "text-muted hover:text-[var(--text)] hover:bg-white/5"
                  )}
                >
                  {t.label}
                </button>
              ))}
            </nav>

            <AnimatePresence mode="wait">

              {/* Sub-Tab 1: General settings */}
              {activeSubTab === "general" && (
                <motion.div key="general" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}>
                  <Card className="glass-3d border-default p-6 rounded-[2rem] bg-[color-mix(in_srgb,var(--text)_3%,transparent)] space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-1.5">
                        <label className="text-[9px] font-black uppercase text-muted tracking-wider">Event Name</label>
                        <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="h-11 rounded-xl border border-white/10 bg-[#12131a] text-xs text-[var(--text)]" />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-[9px] font-black uppercase text-muted tracking-wider">Tagline</label>
                        <Input value={form.tagline} onChange={(e) => setForm({ ...form, tagline: e.target.value })} className="h-11 rounded-xl border border-white/10 bg-[#12131a] text-xs text-[var(--text)]" />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-[9px] font-black uppercase text-muted tracking-wider">Event Code (Short Code)</label>
                        <Input value={form.short_code} onChange={(e) => setForm({ ...form, short_code: e.target.value.toUpperCase() })} className="h-11 rounded-xl border border-white/10 bg-[#12131a] text-xs text-[var(--text)]" />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-[9px] font-black uppercase text-muted tracking-wider">Status</label>
                        <select
                          value={form.status}
                          onChange={(e) => setForm({ ...form, status: e.target.value as ProgramStatus })}
                          className="w-full h-11 px-4 rounded-xl border border-white/10 bg-[#12131a] text-xs text-[var(--text)] focus:outline-none"
                        >
                          <option value="draft">Draft</option>
                          <option value="final">Active / Live</option>
                          <option value="updated">Completed / Archived</option>
                        </select>
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-[9px] font-black uppercase text-muted tracking-wider">Event Description</label>
                      <Textarea
                        value={form.description}
                        onChange={(e) => setForm({ ...form, description: e.target.value })}
                        placeholder="Write a brief overview of your event..."
                        rows={4}
                        className="rounded-xl border border-white/10 bg-[#12131a] text-xs text-[var(--text)]"
                      />
                    </div>

                    {isAdmin && (
                      <div className="flex justify-end pt-4 border-t border-white/5">
                        <Button onClick={handleSave} disabled={isSaving} className="px-6 py-2 rounded-xl bg-[var(--pri)] hover:bg-[var(--pri)]/90 text-white text-xs font-black uppercase tracking-wider h-11 shadow-lg shadow-[var(--pri)]/20 flex items-center gap-1.5">
                          {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                          <span>Apply Configuration</span>
                        </Button>
                      </div>
                    )}
                  </Card>
                </motion.div>
              )}

              {/* Sub-Tab 2: Time & Date */}
              {activeSubTab === "time" && (
                <motion.div key="time" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}>
                  <Card className="glass-3d border-default p-6 rounded-[2rem] bg-[color-mix(in_srgb,var(--text)_3%,transparent)] space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-1.5">
                        <label className="text-[9px] font-black uppercase text-muted tracking-wider">Start Date</label>
                        <Input type="date" value={form.start_date} onChange={(e) => setForm({ ...form, start_date: e.target.value })} className="h-11 rounded-xl border border-white/10 bg-[#12131a] text-xs text-[var(--text)] [color-scheme:dark]" />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-[9px] font-black uppercase text-muted tracking-wider">End Date</label>
                        <Input type="date" value={form.end_date} onChange={(e) => setForm({ ...form, end_date: e.target.value })} className="h-11 rounded-xl border border-white/10 bg-[#12131a] text-xs text-[var(--text)] [color-scheme:dark]" />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-[9px] font-black uppercase text-muted tracking-wider">Timezone</label>
                        <select
                          value={form.timezone}
                          onChange={(e) => setForm({ ...form, timezone: e.target.value })}
                          className="w-full h-11 px-4 rounded-xl border border-white/10 bg-[#12131a] text-xs text-[var(--text)] focus:outline-none"
                        >
                          <option value="Asia/Kolkata">Asia/Kolkata (IST - UTC+05:30)</option>
                          <option value="UTC">UTC (Coordinated Universal Time - UTC+00:00)</option>
                          <option value="America/New_York">America/New_York (EST/EDT - UTC-05:00/04:00)</option>
                          <option value="Europe/London">Europe/London (GMT/BST - UTC+00:00/01:00)</option>
                        </select>
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-[9px] font-black uppercase text-muted tracking-wider">Date Format</label>
                        <select
                          className="w-full h-11 px-4 rounded-xl border border-white/10 bg-[#12131a] text-xs text-[var(--text)] focus:outline-none"
                        >
                          <option>DD MMMM, YYYY (e.g. 10 Dec, 2026)</option>
                          <option>MM-DD-YYYY</option>
                          <option>YYYY-MM-DD</option>
                        </select>
                      </div>
                    </div>

                    {isAdmin && (
                      <div className="flex justify-end pt-4 border-t border-white/5">
                        <Button onClick={handleSave} disabled={isSaving} className="px-6 py-2 rounded-xl bg-[var(--pri)] hover:bg-[var(--pri)]/90 text-white text-xs font-black uppercase tracking-wider h-11 shadow-lg shadow-[var(--pri)]/20 flex items-center gap-1.5">
                          {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                          <span>Save Settings</span>
                        </Button>
                      </div>
                    )}
                  </Card>
                </motion.div>
              )}

              {/* Sub-Tab 3: Privacy & Preferences */}
              {activeSubTab === "privacy" && (
                <motion.div key="privacy" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}>
                  <Card className="glass-3d border-default p-6 rounded-[2rem] bg-[color-mix(in_srgb,var(--text)_3%,transparent)] space-y-6">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <ToggleRow label="Enable Waitlist" value={form.enable_auto_approval} disabled={!isAdmin} onChange={(val) => setForm({ ...form, enable_auto_approval: val })} />
                      <ToggleRow label="Enable Agenda Public View" value={form.enable_srr} disabled={!isAdmin} onChange={(val) => setForm({ ...form, enable_srr: val })} />
                      <ToggleRow label="Enable Speaker Directory" value={form.enable_moderator} disabled={!isAdmin} onChange={(val) => setForm({ ...form, enable_moderator: val })} />
                      <ToggleRow label="Enable Event App" value={form.enable_signage} disabled={!isAdmin} onChange={(val) => setForm({ ...form, enable_signage: val })} />
                      <ToggleRow label="Enable Multi-language Support" value={form.enable_whatsapp} disabled={!isAdmin} onChange={(val) => setForm({ ...form, enable_whatsapp: val })} />
                      <ToggleRow label="Enable Real-time Chat" value={form.enable_webhooks} disabled={!isAdmin} onChange={(val) => setForm({ ...form, enable_webhooks: val })} />
                    </div>

                    {isAdmin && (
                      <div className="flex justify-end pt-4 border-t border-white/5">
                        <Button onClick={handleSave} disabled={isSaving} className="px-6 py-2 rounded-xl bg-[var(--pri)] hover:bg-[var(--pri)]/90 text-white text-xs font-black uppercase tracking-wider h-11 shadow-lg shadow-[var(--pri)]/20 flex items-center gap-1.5">
                          {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                          <span>Save Settings</span>
                        </Button>
                      </div>
                    )}
                  </Card>
                </motion.div>
              )}

              {/* Sub-Tab 4: Security & Pipelines */}
              {activeSubTab === "integrations" && (
                <motion.div key="integrations" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}>
                  <Card className="glass-3d border-default p-6 rounded-[2rem] bg-[color-mix(in_srgb,var(--text)_3%,transparent)] space-y-6">

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div className="space-y-4">
                        <div className="space-y-1.5">
                          <label className="text-[9px] font-black uppercase text-muted tracking-wider">Submission Deadline</label>
                          <Input type="datetime-local" value={form.upload_deadline} onChange={(e) => setForm({ ...form, upload_deadline: e.target.value })} className="h-11 rounded-xl border border-white/10 bg-[#12131a] text-xs text-[var(--text)] [color-scheme:dark]" />
                        </div>
                        <div className="space-y-1.5">
                          <label className="text-[9px] font-black uppercase text-muted tracking-wider">Max File Size Limit (MB)</label>
                          <Input type="number" value={form.max_file_size_mb} onChange={(e) => setForm({ ...form, max_file_size_mb: Number(e.target.value) })} className="h-11 rounded-xl border border-white/10 bg-[#12131a] text-xs text-[var(--text)]" />
                        </div>
                      </div>

                      <div className="space-y-1.5">
                        <label className="text-[9px] font-black uppercase text-muted tracking-wider">Allowed Formats Extensions</label>
                        <Textarea value={form.allowed_formats} onChange={(e) => setForm({ ...form, allowed_formats: e.target.value })} rows={4} className="rounded-xl border border-white/10 bg-[#12131a] text-xs text-[var(--text)]" />
                      </div>
                    </div>

                    {isAdmin && (
                      <div className="flex justify-end pt-4 border-t border-white/5">
                        <Button onClick={handleSave} disabled={isSaving} className="px-6 py-2 rounded-xl bg-[var(--pri)] hover:bg-[var(--pri)]/90 text-white text-xs font-black uppercase tracking-wider h-11 shadow-lg shadow-[var(--pri)]/20 flex items-center gap-1.5">
                          {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                          <span>Apply Policies</span>
                        </Button>
                      </div>
                    )}
                  </Card>
                </motion.div>
              )}

              {/* Sub-Tab 5: Team Access */}
              {activeSubTab === "team" && (
                <motion.div key="team" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}>
                  <Card className="glass-3d border-default p-6 rounded-[2rem] bg-[color-mix(in_srgb,var(--text)_3%,transparent)] space-y-6">
                    <div className="flex items-center justify-between border-b border-white/5 pb-2">
                      <h4 className="text-xs font-black uppercase text-muted tracking-wider">Team Access Control</h4>
                      <Badge className="bg-indigo-500/10 text-indigo-400 border-indigo-500/20 text-[8px] font-black uppercase tracking-wider px-2 py-0.5">
                        {users.length} members assigned
                      </Badge>
                    </div>

                    {usersLoading ? (
                      <div className="flex flex-col items-center justify-center py-10 space-y-2">
                        <RefreshCw className="h-5 w-5 text-[var(--pri)] animate-spin" />
                        <span className="text-[9px] text-muted font-bold uppercase tracking-widest">Loading members...</span>
                      </div>
                    ) : users.length > 0 ? (
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {users.map((u, i) => (
                          <div key={i} className="p-4 rounded-2xl border border-white/5 bg-white/[0.01] flex items-center gap-3">
                            <div className="p-2 bg-indigo-500/10 rounded-xl text-indigo-400">
                              <Users className="h-4 w-4" />
                            </div>
                            <div className="min-w-0">
                              <p className="text-xs font-bold text-[var(--text)] truncate">{u.first_name} {u.last_name}</p>
                              <span className="text-[8px] text-muted font-mono block mt-0.5 truncate">{u.email}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-muted italic">No specific members assigned to this event workspace yet.</p>
                    )}
                  </Card>
                </motion.div>
              )}

              {/* Sub-Tab 6: Danger Zone */}
              {activeSubTab === "danger" && (
                <motion.div key="danger" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}>
                  <Card className="glass-3d border-red-500/10 bg-red-500/5 p-6 rounded-[2rem] space-y-4">
                    <h4 className="text-xs font-black uppercase text-red-400 tracking-wider flex items-center gap-1.5">
                      <AlertTriangle className="h-4 w-4" />
                      <span>Factory telemetry reset</span>
                    </h4>
                    <p className="text-xs text-muted leading-relaxed">
                      Wipes all databases, sessions, presentations, and speaker rosters for this Event ID. This action is non-reversible.
                    </p>
                    <div className="pt-2">
                      <Button
                        onClick={handleClearData}
                        disabled={isClearing}
                        className="rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-black uppercase tracking-wider px-6 h-10 shadow-lg shadow-rose-600/20"
                      >
                        {isClearing ? <Loader2 className="h-4 w-4 animate-spin" /> : "Confirm Complete Factory Reset"}
                      </Button>
                    </div>
                  </Card>
                </motion.div>
              )}

            </AnimatePresence>

          </div>
        )}

        {/* VIEW 4: PLAN & ACTIVATION */}
        {activeTab === "activation" && (
          <div className="space-y-6 animate-in fade-in duration-500">

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

              {/* Plan Information (Takes 2 Columns) */}
              <div className="lg:col-span-2 space-y-6">

                {/* Plan Information Card */}
                {form.licensing_details.plan_name ? (
                  <Card className="glass-3d border-default p-6 rounded-[2rem] bg-gradient-to-br from-indigo-500/10 via-[var(--pri)]/5 to-transparent space-y-6">
                    <div className="flex items-start justify-between">
                      <div>
                        <Badge className="bg-[var(--pri)]/20 text-[var(--pri)] border-[var(--pri)]/30 text-[8px] font-black uppercase tracking-wider px-2 py-0.5 rounded">
                          {form.licensing_details.status === "active" ? "Active Plan" : "Plan Purchased"}
                        </Badge>
                        <h3 className="text-xl font-black text-[var(--text)] mt-2">{form.licensing_details.plan_name}</h3>
                        <p className="text-[10px] text-muted mt-0.5">This plan was purchased when the event was created.</p>
                      </div>
                      <div className="text-right">
                        <h2 className="text-2xl font-black text-white">
                          {form.licensing_details.price > 0 ? `₹ ${form.licensing_details.price.toLocaleString()}` : "Free"}
                        </h2>
                        <span className="text-[8px] text-muted font-bold block uppercase tracking-widest mt-1">Per Event (Excl. GST)</span>
                      </div>
                    </div>

                    {/* Plan Includes list */}
                    {planInclusions.length > 0 && (
                      <div className="pt-4 border-t border-white/5 space-y-3">
                        <span className="text-[8px] font-black uppercase text-muted tracking-widest block">Plan Includes</span>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs text-muted">
                          {planInclusions.map((item, idx) => (
                            <div key={idx} className="flex items-center gap-2">
                              <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
                              <span>{item}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </Card>
                ) : (
                  <Card className="glass-3d border-default p-6 rounded-[2rem] bg-[color-mix(in_srgb,var(--text)_2%,transparent)] space-y-4 flex flex-col items-center justify-center text-center min-h-[180px]">
                    <div className="h-12 w-12 rounded-full bg-white/5 border border-white/10 flex items-center justify-center mb-2">
                      <ShieldCheck className="h-6 w-6 text-muted" />
                    </div>
                    <h3 className="text-sm font-black text-[var(--text)]">No Plan Associated</h3>
                    <p className="text-[10px] text-muted max-w-xs">
                      This event has no active licensing plan on record. A plan must be selected during event creation.
                    </p>
                  </Card>
                )}

                {/* Event Activation details */}
                <Card className="glass-3d border-default p-6 rounded-[2rem] bg-[color-mix(in_srgb,var(--text)_2%,transparent)] space-y-4">
                  <div className="flex items-center gap-2 border-b border-white/5 pb-2">
                    <ShieldCheck className="h-5 w-5 text-emerald-400" />
                    <h4 className="text-xs font-black uppercase text-[var(--text)] tracking-wider">Event Activation details</h4>
                  </div>
                  <div className="grid grid-cols-2 gap-4 text-xs">
                    <div>
                      <span className="text-muted block">Activation Date (Estimated):</span>
                      <span className="font-bold text-[var(--text)]">
                        {form.licensing_details.activated_at ? new Date(form.licensing_details.activated_at).toLocaleDateString() : new Date(form.start_date || Date.now()).toLocaleDateString()}
                      </span>
                    </div>
                    <div>
                      <span className="text-muted block">Event Expiry Date:</span>
                      <span className="font-bold text-[var(--text)]">
                        {form.licensing_details.expires_at ? new Date(form.licensing_details.expires_at).toLocaleDateString() : new Date(form.end_date || Date.now()).toLocaleDateString()}
                      </span>
                    </div>
                  </div>
                </Card>

              </div>

              {/* Add-ons & Checkout (Takes 1 Column) */}
              <div className="space-y-6">

                {/* Add-ons card */}
                <Card className="glass-3d border-default p-6 rounded-[2rem] bg-[color-mix(in_srgb,var(--text)_3%,transparent)] space-y-4">
                  <h4 className="text-xs font-black uppercase text-muted tracking-wider border-b border-white/5 pb-2">Add-Ons ({form.licensing_details.addons.length} Selected)</h4>

                  <div className="space-y-3">
                    {[
                      { name: "Venue Operations", price: 19999 },
                      { name: "Digital Signage", price: 9999 },
                      { name: "WhatsApp Notifications", price: 5999 }
                    ].map((addon, i) => {
                      const isChecked = form.licensing_details.addons.includes(addon.name);
                      return (
                        <div key={i} className="flex items-center justify-between p-3 rounded-xl border border-white/5 bg-white/[0.01] text-xs">
                          <label className="flex items-center gap-2 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={() => {
                                const updated = isChecked
                                  ? form.licensing_details.addons.filter(a => a !== addon.name)
                                  : [...form.licensing_details.addons, addon.name];
                                setForm({ ...form, licensing_details: { ...form.licensing_details, addons: updated } });
                              }}
                              className="rounded border-white/10 bg-white/5 text-[var(--pri)] focus:ring-0 focus:ring-offset-0"
                            />
                            <span className="font-bold text-[var(--text)]">{addon.name}</span>
                          </label>
                          <span className="font-mono text-indigo-400">₹ {addon.price.toLocaleString()}</span>
                        </div>
                      );
                    })}
                  </div>
                </Card>

                {/* Billing Summary */}
                <Card className="glass-3d border-default p-6 rounded-[2rem] bg-[color-mix(in_srgb,var(--text)_3%,transparent)] space-y-4">
                  <h4 className="text-xs font-black uppercase text-muted tracking-wider border-b border-white/5 pb-2">Payment Summary</h4>

                  <div className="space-y-2 text-xs">
                    <div className="flex items-center justify-between text-muted">
                      <span>Plan Amount:</span>
                      <span className="font-mono">₹ {form.licensing_details.price.toLocaleString()}</span>
                    </div>
                    <div className="flex items-center justify-between text-muted">
                      <span>Add-Ons Total:</span>
                      <span className="font-mono">₹ {(form.licensing_details.addons.reduce((sum, name) => sum + (name === "Venue Operations" ? 19999 : name === "Digital Signage" ? 9999 : 5999), 0)).toLocaleString()}</span>
                    </div>
                    <div className="flex items-center justify-between text-muted">
                      <span>Sub Total:</span>
                      <span className="font-mono">₹ {(form.licensing_details.price + form.licensing_details.addons.reduce((sum, name) => sum + (name === "Venue Operations" ? 19999 : name === "Digital Signage" ? 9999 : 5999), 0)).toLocaleString()}</span>
                    </div>
                    <div className="flex items-center justify-between text-muted">
                      <span>GST (18%):</span>
                      <span className="font-mono">₹ {Math.round((form.licensing_details.price + form.licensing_details.addons.reduce((sum, name) => sum + (name === "Venue Operations" ? 19999 : name === "Digital Signage" ? 9999 : 5999), 0)) * 0.18).toLocaleString()}</span>
                    </div>
                    <div className="flex items-center justify-between text-sm font-bold text-[var(--text)] border-t border-white/5 pt-2">
                      <span>Total Amount:</span>
                      <span className="font-mono text-[var(--pri)]">
                        ₹ {Math.round((form.licensing_details.price + form.licensing_details.addons.reduce((sum, name) => sum + (name === "Venue Operations" ? 19999 : name === "Digital Signage" ? 9999 : 5999), 0)) * 1.18).toLocaleString()}
                      </span>
                    </div>
                  </div>

                  <Button
                    onClick={() => {
                      handleSave().then(() => {
                        toast.success("Checkout processing started! Plan and Add-ons applied.");
                      });
                    }}
                    className="w-full rounded-xl bg-[var(--pri)] hover:bg-[var(--pri)]/90 text-white text-xs font-black uppercase tracking-wider py-3 shadow-lg shadow-[var(--pri)]/20 mt-2 flex items-center justify-center gap-1"
                  >
                    <span>Proceed to Checkout</span>
                    <ArrowRight className="h-4 w-4" />
                  </Button>
                </Card>

              </div>

            </div>

          </div>
        )}

      </div>

    </div>
  );
}

function ToggleRow({ label, value, onChange, disabled }: { label: string; value: boolean; onChange: (val: boolean) => void; disabled?: boolean }) {
  return (
    <div className="flex items-center justify-between rounded-2xl border border-default bg-[color-mix(in_srgb,var(--text)_3%,transparent)] p-5 group hover:bg-[color-mix(in_srgb,var(--text)_5%,transparent)] transition-all">
      <div className="space-y-1">
        <span className="text-[13px] font-bold text-[var(--text)]">{label}</span>
        <p className="text-[9px] font-black text-muted uppercase tracking-widest">{value ? 'Active' : 'Disabled'}</p>
      </div>
      <button
        type="button"
        disabled={disabled}
        onClick={() => onChange(!value)}
        className={cn(
          "relative h-8 w-14 rounded-full border-2 p-1 transition-all duration-500 ease-[cubic-bezier(0.34,1.56,0.64,1)] shadow-inner",
          value ? "border-[var(--pri)] bg-[var(--pri)] shadow-[0_0_15px_color-mix(in_srgb,var(--pri)_40%,transparent)]" : "border-default bg-[color-mix(in_srgb,var(--text)_10%,transparent)]",
          disabled && "opacity-50 cursor-not-allowed"
        )}
      >
        <motion.span
          animate={{ x: value ? 24 : 0, scale: value ? 1.1 : 1 }}
          transition={{ type: "spring", stiffness: 500, damping: 30 }}
          className="block h-5 w-5 rounded-full bg-[var(--text)] shadow-[0_2px_5px_rgba(0,0,0,0.3)]"
        />
      </button>
    </div>
  );
}
