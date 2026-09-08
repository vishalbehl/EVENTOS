"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  Building2, CalendarPlus, Check, ChevronRight, Loader2,
  Mail, Palette, Plus, Save, Trash2, UserPlus, CreditCard,
  Receipt, Sliders, Sparkles, CheckCircle2, ArrowLeft, X,
  Shield, Layers, Globe, Clock, DollarSign, Layout, Users,
  Zap, Award, Smartphone, BarChart3, HelpCircle as SupportIcon, Lock,
  Upload, Image as ImageIcon, Ticket, Mic, FileText, CheckSquare, Monitor, AlertCircle, PackagePlus,
  Eye, Info, Star, Bookmark, MapPin, Calendar, Hash, Minus
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { countries, Organization, orgApi, OrgMe, OrgRole, timezones, slugify } from "@/components/organizer/org/org-api";
import { apiClient } from "@/lib/api-client";
import { useAuthStore } from "@/store/use-auth-store";
import { cn } from "@/lib/utils";
import { CommercialPlanCard, CommercialAddonCard } from "@/components/organizer/platform/CommercialCards";
import { CommercialDetailsDialog } from "@/components/organizer/platform/CommercialDetailsDialog";
import { useOrganizationLimitAccess } from "@/lib/capabilities";
import { BrandLogo } from "@/components/ui/brand-logo";

// Module catalog definitions
const MODULE_CATALOG = [
  { id: "registration", title: "Registration", desc: "Manage registrations, tickets and check-ins.", icon: Ticket, defaultChecked: true },
  { id: "speaker_mgmt", title: "Speaker Management", desc: "Manage speakers, abstracts and presentations.", icon: Mic, defaultChecked: true },
  { id: "session_mgmt", title: "Session Management", desc: "Create sessions, tracks and schedules.", icon: Layers, defaultChecked: true },
  { id: "certificates", title: "Certificates", desc: "Design and issue certificates.", icon: Award, defaultChecked: true },
  { id: "badge_printing", title: "Badge Printing", desc: "Create, print and scan badges.", icon: CheckSquare, defaultChecked: true },
  { id: "venue_ops", title: "Venue Operations", desc: "Manage rooms, resources and technical ops.", icon: Monitor, defaultChecked: false },
  { id: "mobile_apps", title: "Mobile Apps", desc: "Engage attendees with mobile applications.", icon: Smartphone, defaultChecked: false },
  { id: "live_polls", title: "Live Polls & Q&A", desc: "Run live polls, Q&A and feedback.", icon: BarChart3, defaultChecked: false },
  { id: "exhibitor_portal", title: "Exhibitor Portal", desc: "Manage exhibitors & their profiles.", icon: Building2, defaultChecked: false },
  { id: "sponsor_portal", title: "Sponsor Portal", desc: "Manage sponsors & their visibility.", icon: Sparkles, defaultChecked: false },
  { id: "ai_assistant", title: "AI Assistant", desc: "Smart recommendations and automation.", icon: Zap, defaultChecked: false },
];

function asArray<T = Record<string, any>>(value: any): T[] {
  if (Array.isArray(value)) return value;
  if (Array.isArray(value?.items)) return value.items;
  if (Array.isArray(value?.data)) return value.data;
  return [];
}

function formatCurrency(amount: number | null | undefined, currency = "INR") {
  if (amount === null || amount === undefined) return "Custom Pricing";
  try {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency,
      maximumFractionDigits: 0,
    }).format(amount);
  } catch {
    return `₹${amount.toLocaleString("en-IN")}`;
  }
}

export function OnboardingWizard() {
  const userLimitAccess = useOrganizationLimitAccess("max_users");
  const eventLimitAccess = useOrganizationLimitAccess("max_events");
  const router = useRouter();
  const searchParams = useSearchParams();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [data, setData] = useState<OrgMe | null>(null);
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);

  // DB API Plans & Addons
  const [currentBillingPlan, setCurrentBillingPlan] = useState<any>(null);
  const [dbPlans, setDbPlans] = useState<any[]>([]);
  const [billingCatalogueUnavailable, setBillingCatalogueUnavailable] = useState(false);
  const [dbAddons, setDbAddons] = useState<any[]>([]);
  const [loadingDbBilling, setLoadingDbBilling] = useState(true);

  // Feature Detail Inspection Pop-Up Window State
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailType, setDetailType] = useState<"plan" | "addon" | null>(null);
  const [detailData, setDetailData] = useState<any | null>(null);

  // Step 2: Organisation Identity State
  const [orgIdentity, setOrgIdentity] = useState({
    name: "",
    slug: "",
    organization_type: "conference_organiser",
    country: "IN",
    timezone: "Asia/Kolkata",
    language: "English",
  });


  // Step 3: Organisation Profile State
  const [orgProfile, setOrgProfile] = useState({
    industry: "medical",
    expected_events_per_year: "1-5",
    average_attendees_per_event: "500-1000",
    primary_goal: "all_in_one",
  });

  // Step 4: Workspace Config State
  const [workspaceConfig, setWorkspaceConfig] = useState({
    portal_name: "",
    logo_url: "",
    primary_color: "var(--color-primary-mid)",
    secondary_color: "#6366f1",
    date_format: "DD/MM/YYYY",
    time_format: "24 Hour",
    currency: "INR (₹)",
  });

  // Step 5: Team Members State
  const [teamMembers, setTeamMembers] = useState<Array<{ name: string; email: string; role: OrgRole; access: string }>>([]);
  const [newMember, setNewMember] = useState({ name: "", email: "", role: "member" as OrgRole });

  // Step 6: First Event State - Full Event Fields Matching DB Model
  const [eventData, setEventData] = useState({
    name: "",
    short_code: "",
    event_type: "Conference",
    start_date: "",
    end_date: "",
    timezone: "Asia/Kolkata",
    venue: "",
    city: "",
    country: "India",
    currency: "INR",
    delegates: "500",
    speakers: "25",
    rooms: "5",
  });
  const [skippedEvent, setSkippedEvent] = useState(false);
  const [skippedTeam, setSkippedTeam] = useState(false);

  // Step 7: Selected Modules State
  const [selectedModules, setSelectedModules] = useState<string[]>(
    MODULE_CATALOG.filter((m) => m.defaultChecked).map((m) => m.id)
  );

  // Step 8: Choose Plan State
  const [billingCycle, setBillingCycle] = useState<"monthly" | "yearly">("yearly");
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null);
  const [skippedPlan, setSkippedPlan] = useState(false);

  // Step 9: Add-Ons State
  const [selectedAddonIds, setSelectedAddonIds] = useState<string[]>([]);

  // Step 10: Terms & Final Confirmation State
  const [termsAgreed, setTermsAgreed] = useState(false);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [processingState, setProcessingState] = useState<number | null>(null);

  // Normalizing dbPlans for Official CommercialPlanCard
  const commercialPlans = useMemo(() => {
    const rawList = asArray(dbPlans);

    return rawList.map((plan, i) => {
      const price = plan.price ?? plan.price_monthly ?? plan.amount ?? plan.price_per_event;
      return {
        id: String(plan.id ?? plan.code ?? plan.key ?? `plan-${i}`),
        name: String(plan.name ?? "Standard Tier"),
        tagline: plan.tagline || plan.subtitle || plan.description || "Essential event operations",
        description: plan.description || undefined,
        priceLabel: price !== null && price !== undefined ? `${formatCurrency(price, plan.currency || "INR")} / event` : "Custom Pricing",
        colorHex: String(plan.color_hex ?? plan.color ?? (i === 0 ? "#6366F1" : i === 1 ? "#C2F542" : "#EC4899")),
        isPopular: Boolean(plan.is_popular || plan.popular),
        isActive: plan.is_active !== false,
        subscribersLabel: plan.subscribers_count ? `${plan.subscribers_count} subscribers` : "Workspace ready",
        highlights: [
          plan.limits?.max_users == null ? "Team members not configured" : `${plan.limits.max_users} team members`,
          plan.limits?.max_registrations == null ? "Registrations not configured" : `${plan.limits.max_registrations} registrations`,
          plan.limits?.max_speakers == null ? "Speakers not configured" : `${plan.limits.max_speakers} speakers`,
          plan.limits?.max_sessions == null ? "Sessions not configured" : `${plan.limits.max_sessions} sessions`,
          plan.limits?.max_rooms == null ? "Rooms not configured" : `${plan.limits.max_rooms} parallel rooms`,
          plan.limits?.storage_quota_mb == null ? "Storage not configured" : `${Math.round(plan.limits.storage_quota_mb / 1024)} GB storage`,
        ],
        tierIndex: i,
        raw: plan,
      };
    });
  }, [dbPlans]);

  // Normalizing dbAddons for Official CommercialAddonCard
  const commercialAddons = useMemo(() => {
    const rawList = asArray(dbAddons);

    return rawList.map((addon) => {
      const price = addon.final_price ?? addon.price_monthly ?? addon.price ?? addon.price_inr;
      return {
        id: String(addon.id ?? addon.addon_id ?? addon.key),
        name: String(addon.name ?? addon.addon_name ?? "Add-On"),
        description: addon.description || addon.short_description || "Commercial add-on with optional capacity and coverage.",
        imageUrl: addon.image_url || undefined,
        type: (addon.addon_type || addon.type || "PLAN").toUpperCase() as "PLAN" | "VENUE",
        billingUnit: String(addon.billing_unit || "PER_EVENT"),
        hardwareCount: Array.isArray(addon.hardware_spec)
          ? addon.hardware_spec.reduce((sum: number, item: any) => sum + Number(item.quantity || 0), 0)
          : (addon.hardwareCount || 0),
        staffCount: Array.isArray(addon.staff_spec)
          ? addon.staff_spec.reduce((sum: number, item: any) => sum + Number(item.quantity || 0), 0)
          : (addon.staffCount || 0),
        priceLabel: price ? formatCurrency(price, addon.currency || "INR") : "Custom Pricing",
        isActive: addon.is_active !== false,
        raw: addon,
      };
    });
  }, [dbAddons]);

  const currentSelectedPlanObj = useMemo(() => {
    if (commercialPlans.length === 0) return null;
    return commercialPlans.find((p) => p.id === selectedPlanId) || commercialPlans[0];
  }, [commercialPlans, selectedPlanId]);

  const hasActivePlan = Boolean(
    data?.organization?.is_active &&
    (["ACTIVE", "TRIAL"].includes(String(currentBillingPlan?.status ?? "").toUpperCase()) || Boolean(currentBillingPlan?.subscription_id))
  );

  const maxStepIndex = hasActivePlan ? 6 : 8;

  const steps = useMemo(() => {
    if (hasActivePlan) {
      return [
        { title: "Welcome", subtitle: "Get started" },
        { title: "Organisation", subtitle: "Basic information" },
        { title: "Profile", subtitle: "Tell us about you" },
        { title: "Workspace", subtitle: "Configure workspace" },
        { title: "Team", subtitle: "Invite your team" },
        { title: "First Event", subtitle: "Create first event" },
        { title: "Review", subtitle: "Final launch" },
      ];
    }
    return [
      { title: "Welcome", subtitle: "Get started" },
      { title: "Organisation", subtitle: "Basic information" },
      { title: "Profile", subtitle: "Tell us about you" },
      { title: "Workspace", subtitle: "Configure workspace" },
      { title: "Team", subtitle: "Invite your team" },
      { title: "Choose Plan", subtitle: "Select plan" },
      { title: "Add-Ons", subtitle: "Enhance capacity" },
      { title: "First Event", subtitle: "Create first event" },
      { title: "Review", subtitle: "Final launch" },
    ];
  }, [hasActivePlan]);

  useEffect(() => {
    orgApi.me()
      .then((result) => {
        setData(result);
        const org = result.organization;
        const isDefault =
          Boolean((org as any).is_platform_org) ||
          Boolean((org as any).is_internal_unrestricted) ||
          org.slug?.toLowerCase() === "eventos" ||
          org.slug?.toLowerCase() === "default-org" ||
          Boolean(org.onboarding_completed);

        if (isDefault) {
          const profile = useAuthStore.getState().user;
          if (profile) {
            useAuthStore.getState().updateUser({ ...profile, onboarding_completed: true });
          }
          router.replace("/dashboard");
          return;
        }

        setData(result);
        
        // Auto-resume at saved step or query param step
        const paramStep = searchParams?.get("step");
        if (paramStep !== null && paramStep !== undefined) {
          setStep(Math.min(9, Math.max(0, Number(paramStep))));
        } else if (typeof org.onboarding_step === "number" && org.onboarding_step > 0 && org.onboarding_step < 10) {
          setStep(org.onboarding_step);
        }

        setOrgIdentity({
          name: org.name || "",
          slug: slugify(org.slug || org.name || "org"),
          organization_type: org.organization_type || "conference_organiser",
          country: org.country || "IN",
          timezone: org.timezone || "Asia/Kolkata",
          language: org.language || "English",
        });
        setOrgProfile({
          industry: org.industry || "medical",
          expected_events_per_year: org.expected_events_per_year || "1-5",
          average_attendees_per_event: org.average_attendees_per_event || "500-1000",
          primary_goal: org.primary_goal || "all_in_one",
        });
        setWorkspaceConfig({
          portal_name: org.portal_name || (org.name ? `${org.name.toUpperCase()} ORGANIZER PORTAL` : ""),
          logo_url: org.logo_url || "",
          primary_color: org.primary_color || "var(--op-primary)",
          secondary_color: org.secondary_color || "#6366f1",
          date_format: org.date_format || "DD/MM/YYYY",
          time_format: org.time_format || "24 Hour",
          currency: org.currency || "INR (₹)",
        });

        setEventData((prev) => ({
          ...prev,
          timezone: org.timezone || "Asia/Kolkata",
          country: org.country || "India",
        }));

        const currentUser = useAuthStore.getState().user;
        if (currentUser) {
          setTeamMembers([
            {
              name: currentUser.full_name || `${currentUser.first_name} ${currentUser.last_name}`,
              email: currentUser.email,
              role: "owner",
              access: "Full Access",
            },
          ]);
        }
      })
      .catch((err) => {
        console.error("Failed to load onboarding data:", err);
        toast.error("Session expired. Please log in again.");
        router.replace("/login");
      });

    setLoadingDbBilling(true);
    Promise.all([orgApi.plans(), orgApi.addons(), orgApi.currentBillingPlan().catch(() => null)])
      .then(([plansRes, addonsRes, billingRes]) => {
        const rawP = plansRes ?? [];
        const rawA = addonsRes ?? [];
        setBillingCatalogueUnavailable(false);
        setDbPlans(rawP);
        setDbAddons(rawA);
        setCurrentBillingPlan(billingRes);
        setSelectedPlanId(rawP[0] ? String(rawP[0].id || rawP[0].code) : null);
      })
      .catch(() => {
        setBillingCatalogueUnavailable(true);
        setDbPlans([]);
        setDbAddons([]);
        setCurrentBillingPlan(null);
      })
      .finally(() => setLoadingDbBilling(false));
  }, [router, searchParams]);

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      toast.error("Image size must be less than 5MB.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setWorkspaceConfig({ ...workspaceConfig, logo_url: reader.result as string });
      toast.success("Logo uploaded successfully.");
    };
    reader.readAsDataURL(file);
  };

  const handleSaveStep = async (stepIndex: number, advance: boolean) => {
    setSaving(true);
    try {
      const payload: Partial<Organization> & { onboarding_step?: number } = {
        name: orgIdentity.name,
        slug: slugify(orgIdentity.slug || orgIdentity.name || "org"),
        organization_type: orgIdentity.organization_type,
        country: orgIdentity.country,
        timezone: orgIdentity.timezone,
        language: orgIdentity.language,
        industry: orgProfile.industry,
        expected_events_per_year: orgProfile.expected_events_per_year,
        average_attendees_per_event: orgProfile.average_attendees_per_event,
        primary_goal: orgProfile.primary_goal,
        portal_name: workspaceConfig.portal_name,
        logo_url: workspaceConfig.logo_url,
        primary_color: workspaceConfig.primary_color,
        secondary_color: workspaceConfig.secondary_color,
        date_format: workspaceConfig.date_format,
        time_format: workspaceConfig.time_format,
        currency: workspaceConfig.currency,
        onboarding_step: advance ? Math.min(maxStepIndex, stepIndex + 1) : stepIndex,
      };

      const res = await orgApi.updateMe(payload as any);
      if (data) {
        setData({ ...data, organization: res.organization });
      }

      if (advance) {
        setStep((prev) => Math.min(maxStepIndex, prev + 1));
        toast.success("Step saved & advancing to next step.");
      } else {
        toast.success("Draft saved successfully.");
      }
    } catch (error: any) {
      toast.error(error.message || "Failed to save progress.");
    } finally {
      setSaving(false);
    }
  };

  if (!data) {
    return (
      <div className="min-h-screen bg-[var(--color-bg)] flex flex-col items-center justify-center space-y-4">
        <Loader2 className="w-10 h-10 text-[var(--color-primary-mid)] animate-spin" />
        <p className="text-xs font-black uppercase tracking-widest text-[var(--color-text-muted)]">Initializing Workspace Session...</p>
      </div>
    );
  }

  const isStepSkipped = (idx: number) => {
    if (hasActivePlan) {
      return (
        (idx === 4 && skippedTeam) ||
        (idx === 5 && (skippedEvent || !eventData.name))
      );
    }
    return (
      (idx === 4 && skippedTeam) ||
      (idx === 5 && skippedPlan) ||
      (idx === 6 && skippedPlan) ||
      (idx === 7 && (skippedEvent || !eventData.name))
    );
  };

  const handleAddTeamMember = async () => {
    if (!newMember.email) return;
    try {
      await orgApi.invite(newMember.email, newMember.role);
      setTeamMembers([
        ...teamMembers,
        {
          name: newMember.name || newMember.email.split("@")[0],
          email: newMember.email,
          role: newMember.role,
          access: newMember.role === "admin" || newMember.role === "owner" ? "Full Access" : "Edit Access",
        },
      ]);
      setNewMember({ name: "", email: "", role: "member" });
      toast.success(`Invitation sent to ${newMember.email}`);
    } catch (error: any) {
      toast.error(error.message || "Could not send invite.");
    }
  };

  const handleCreateEvent = async () => {
    if (!eventData.name) {
      toast.error("Event name is required.");
      return;
    }
    const shortCode = eventData.short_code.trim().toUpperCase() ||
      eventData.name.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 10) || "EVENT1";

    setSaving(true);
    try {
      await apiClient.post<any>("/events", {
        name: eventData.name,
        short_code: shortCode,
        start_date: eventData.start_date || new Date().toISOString().split("T")[0],
        end_date: eventData.end_date || eventData.start_date || new Date().toISOString().split("T")[0],
        timezone: eventData.timezone || orgIdentity.timezone,
        venue_name: eventData.venue,
        location: eventData.city ? `${eventData.venue ? eventData.venue + ", " : ""}${eventData.city}` : eventData.venue,
        country: eventData.country,
        currency: eventData.currency || "INR",
      }, { headers: { "Idempotency-Key": crypto.randomUUID() } });
      setSkippedEvent(false);
      handleSaveStep(hasActivePlan ? 5 : 7, true);
    } catch (error: any) {
      toast.error(error.message || "Could not create event.");
      setSaving(false);
    }
  };

  const toggleModule = (id: string) => {
    if (selectedModules.includes(id)) {
      setSelectedModules(selectedModules.filter((m) => m !== id));
    } else {
      setSelectedModules([...selectedModules, id]);
    }
  };

  const toggleAddon = (id: string) => {
    if (selectedAddonIds.includes(id)) {
      setSelectedAddonIds(selectedAddonIds.filter((a) => a !== id));
    } else {
      setSelectedAddonIds([...selectedAddonIds, id]);
    }
  };

  const handleOpenPlanDetails = async (planId: string) => {
    try {
      const res = await orgApi.plan(planId).catch(() => commercialPlans.find((p) => p.id === planId)?.raw);
      setDetailType("plan");
      setDetailData(res);
      setDetailOpen(true);
    } catch (err) {
      console.error("Failed to fetch plan details", err);
    }
  };

  const handleOpenAddonDetails = async (addonId: string) => {
    try {
      const res = await orgApi.addon(addonId).catch(() => commercialAddons.find((a) => a.id === addonId)?.raw);
      setDetailType("addon");
      setDetailData(res);
      setDetailOpen(true);
    } catch (err) {
      console.error("Failed to fetch addon details", err);
    }
  };

  const handleFinalizeWorkspace = async () => {
    if (!termsAgreed) {
      toast.error("Please accept the Terms of Service to proceed.");
      return;
    }
    setCheckoutOpen(true);
    setProcessingState(0);
    const interval = setInterval(() => {
      setProcessingState((prev) => {
        if (prev === null) return 0;
        if (prev >= 3) {
          clearInterval(interval);
          finishOnboarding();
          return 4;
        }
        return prev + 1;
      });
    }, 800);
  };

  const finishOnboarding = async () => {
    try {
      await orgApi.updateMe({ onboarding_completed: true, onboarding_step: maxStepIndex } as Partial<Organization>);
      const profile = await apiClient.get<any>("/auth/me").catch(() => ({}));
      useAuthStore.getState().updateUser({ ...profile, onboarding_completed: true });
      toast.success("Workspace launched! Redirecting to dashboard...");
      setTimeout(() => {
        router.replace("/dashboard");
      }, 1000);
    } catch (error: any) {
      toast.error(error.message || "Failed to complete setup.");
    }
  };

  return (
    <div className="flex h-screen max-h-screen select-none flex-col overflow-hidden bg-[var(--op-page-bg)] font-sans text-[var(--op-text)]">
      {/* Top Header Bar */}
      <header className="z-50 flex h-16 shrink-0 items-center justify-between border-b border-[var(--op-border)] bg-[var(--op-header-bg)] px-6">
        <BrandLogo name="eventos" subtitle="ORGANIZER PORTAL PRO WORKSPACE" compact textClassName="text-xs uppercase tracking-widest" />
        <div className="flex items-center gap-4">
          <span className="text-[10px] font-black uppercase tracking-widest text-[var(--color-text-muted)]">Step {step + 1} of {steps.length}</span>
          <button
            onClick={() => {
              if (window.confirm("Exit workspace setup? Progress is saved as draft.")) router.push("/login");
            }}
            className="text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
      </header>

      {/* Mobile Step Selector Bar */}
      <div className="lg:hidden flex items-center gap-2 px-4 py-2.5 bg-[var(--color-surface-2)] border-b border-[var(--color-border)] overflow-x-auto custom-scrollbar shrink-0">
        {steps.map((s, idx) => {
          const isDone = idx < step;
          const isCurrent = idx === step;
          const isSkipped = isDone && isStepSkipped(idx);
          return (
            <button
              key={s.title}
              onClick={() => idx <= step && setStep(idx)}
              disabled={idx > step}
              className={cn(
                "flex shrink-0 items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[11px] font-bold",
                isCurrent
                  ? "bg-[var(--color-primary-mid)] text-[var(--color-text-inverse)] border-[var(--color-primary-mid)]"
                  : isSkipped
                    ? "bg-amber-500/10 border-amber-500/30 text-amber-400 border-dashed"
                    : isDone
                      ? "bg-[var(--color-surface-3)] border-[var(--color-border)] text-emerald-400"
                      : "bg-transparent border-transparent text-[var(--color-text-muted)] cursor-not-allowed"
              )}
            >
              {isSkipped ? (
                <Minus className="h-3 w-3 stroke-[3]" />
              ) : isDone ? (
                <Check className="h-3 w-3 stroke-[3]" />
              ) : (
                <span>{idx + 1}.</span>
              )}
              <span>{s.title}</span>
            </button>
          );
        })}
      </div>

      {/* Main Layout with Fixed Stationary Left Steps Sidebar */}
      <div className="flex-1 grid lg:grid-cols-[260px_1fr] h-[calc(100vh-64px)] overflow-hidden">
        {/* FIXED STATIONARY LEFT SIDEBAR */}
        <aside className="hidden h-full shrink-0 flex-col justify-between overflow-hidden border-r border-[var(--op-border)] bg-[var(--op-sidebar-bg)] p-3.5 lg:flex">
          <div className="space-y-1 overflow-y-auto pr-1">
            {steps.map((s, idx) => {
              const isDone = idx < step;
              const isCurrent = idx === step;
              const isSkipped = isDone && isStepSkipped(idx);
              return (
                <button
                  key={s.title}
                  onClick={() => idx <= step && setStep(idx)}
                  disabled={idx > step}
                  className={cn(
                    "group relative flex w-full items-center gap-2.5 overflow-hidden rounded-lg border p-2 text-left",
                    isCurrent
                      ? "border-[var(--op-primary)] bg-[color-mix(in_srgb,var(--op-primary)_10%,var(--op-panel-bg))]"
                      : isSkipped
                        ? "bg-amber-500/[0.04] border-amber-500/30 border-dashed hover:bg-amber-500/[0.08]"
                        : isDone
                          ? "bg-[var(--color-surface-2)] border-[var(--color-border)] hover:bg-[var(--color-surface-3)]"
                          : "bg-transparent border-transparent opacity-40 cursor-not-allowed"
                  )}
                >
                  {isCurrent && <div className="absolute left-0 inset-y-0 w-1 bg-[var(--color-primary-mid)] rounded-r-full" />}
                  <div
                    className={cn(
                      "h-6 w-6 rounded-lg flex items-center justify-center text-[10px] font-black shrink-0 transition-all",
                      isSkipped
                        ? "bg-amber-500/20 text-amber-400 border border-amber-500/40"
                        : isDone
                          ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                          : isCurrent
                            ? "bg-[var(--op-primary)] text-white"
                            : "bg-[var(--color-surface-4)] text-[var(--color-text-secondary)]"
                    )}
                  >
                    {isSkipped ? (
                      <Minus className="h-3 w-3 stroke-[3]" />
                    ) : isDone ? (
                      <Check className="h-3 w-3 stroke-[3]" />
                    ) : (
                      idx + 1
                    )}
                  </div>
                  <div className="flex flex-col min-w-0">
                    <span className={cn("text-[11px] font-black tracking-tight truncate", isCurrent ? "text-[var(--color-text-primary)]" : isSkipped ? "text-amber-300/90" : "text-[var(--color-text-secondary)]")}>
                      {s.title}
                    </span>
                    <span className={cn("text-[9px] truncate font-semibold", isSkipped ? "text-amber-400/80 uppercase font-black tracking-wider" : "text-[var(--color-text-muted)]")}>
                      {isSkipped ? "Skipped" : s.subtitle}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>

          <div className="pt-2 border-t border-[var(--color-border)]">
            <a
              href="mailto:support@eventos.com"
              className="flex items-center gap-2 text-[11px] text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] font-semibold transition-colors"
            >
              <SupportIcon className="h-3.5 w-3.5 text-[var(--color-primary-mid)]" />
              Need help? <span className="underline font-bold">Contact Support</span>
            </a>
          </div>
        </aside>

        {/* Right Work Area */}
        <main className="relative h-full overflow-y-auto bg-[var(--op-page-bg)] p-6 md:p-10">
          <AnimatePresence mode="wait">
            {/* STEP 1: WELCOME SCREEN */}
            {step === 0 && (
              <motion.div key="step0" initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -15 }} className="relative z-10 grid min-h-full items-center gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(360px,520px)] xl:grid-cols-[minmax(0,1fr)_minmax(420px,600px)]">
                <div className="space-y-8">
                  <div className="space-y-3">
                    <h1 className="max-w-xl text-3xl font-black tracking-tight text-[var(--color-text-primary)] md:text-5xl">Let's set up your organisation</h1>
                    <p className="max-w-lg text-sm font-medium leading-relaxed text-[var(--color-text-secondary)]">
                      This will only take a few minutes. You can change anything later or save progress as draft.
                    </p>
                  </div>

                  <div className="space-y-4 max-w-lg">
                    {[
                      { icon: Globe, title: "Personalised workspace", desc: "Create your unique workspace for events." },
                      { icon: Layout, title: "Everything in one place", desc: "Manage events, people, sessions & more." },
                      { icon: Lock, title: "Enterprise ready", desc: "Secure, scalable and built for organisers." },
                    ].map((feat) => (
                      <div key={feat.title} className="flex items-start gap-4 rounded-lg border border-[var(--op-border)] bg-[var(--op-panel-bg)] p-4 hover:border-[var(--op-primary)]">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-[var(--op-border)] bg-[var(--op-panel-soft)]">
                          <feat.icon className="h-5 w-5 text-[var(--color-primary-mid)]" />
                        </div>
                        <div className="space-y-0.5">
                          <h4 className="text-sm font-bold text-[var(--color-text-primary)]">{feat.title}</h4>
                          <p className="text-xs font-medium text-[var(--color-text-secondary)]">{feat.desc}</p>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="flex items-center gap-4 pt-2">
                    <Button onClick={() => handleSaveStep(0, true)} className="h-13 flex items-center gap-2 rounded-lg bg-[var(--op-primary)] px-8 text-xs font-black uppercase tracking-wider text-white hover:opacity-90">
                      Start Setup <ChevronRight className="h-4 w-4 stroke-[3]" />
                    </Button>
                    <span className="text-xs font-medium text-[var(--color-text-muted)]">Takes less than 5 minutes</span>
                  </div>
                </div>

                <div className="flex items-center justify-center p-2 w-full overflow-hidden">
                  <img
                    src="/assets/illustrations/onboarding/onboarding-welcome.png"
                    alt="Welcome Hero Graphic"
                    className="h-auto max-h-[min(64vh,620px)] w-full object-contain"
                  />
                </div>
              </motion.div>
            )}

            {/* STEP 2: ORGANISATION IDENTITY */}
            {step === 1 && (
              <motion.div key="step1" initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -15 }} className="grid lg:grid-cols-[1fr_420px] gap-10 items-start">
                <div className="space-y-6">
                  <div className="space-y-1">
                    <h2 className="text-2xl font-black text-[var(--color-text-primary)] tracking-tight">Organisation Identity</h2>
                    <p className="text-xs text-[var(--color-text-muted)] font-medium">Let's start with the basics.</p>
                  </div>

                  <div className="space-y-5">
                    <div className="space-y-2">
                      <label className="text-[10px] font-black uppercase tracking-wider text-[var(--op-muted)]">Organisation Name *</label>
                      <Input
                        value={orgIdentity.name}
                        onChange={(e) => {
                          const newName = e.target.value;
                          setOrgIdentity({ ...orgIdentity, name: newName, slug: slugify(newName) });
                          setWorkspaceConfig((prev) => ({
                            ...prev,
                            portal_name: `${newName ? newName.toUpperCase() : "XYZ"} ORGANIZER PORTAL`
                          }));
                        }}
                        placeholder="Enter your organization name"
                        className="h-12 rounded-xl bg-[var(--op-panel-bg)] border-[var(--op-border)] text-sm font-semibold text-[var(--op-text)] focus:border-[var(--op-primary)]"
                      />
                    </div>

                    <div className="space-y-2">
                      <label className="text-[10px] font-black uppercase tracking-wider text-[var(--op-muted)]">Organisation Type</label>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                        {[
                          { id: "conference_organiser", label: "Conference Organiser", icon: Building2 },
                          { id: "medical_society", label: "Medical Society", icon: Shield },
                          { id: "association", label: "Association", icon: Users },
                          { id: "corporate", label: "Corporate", icon: Globe },
                          { id: "university", label: "University", icon: Layout },
                          { id: "government", label: "Government", icon: Building2 },
                          { id: "ngo", label: "NGO", icon: Sparkles },
                          { id: "other", label: "Other", icon: Layers },
                        ].map((t) => {
                          const isSelected = orgIdentity.organization_type === t.id;
                          return (
                            <button
                              key={t.id}
                              type="button"
                              onClick={() => setOrgIdentity({ ...orgIdentity, organization_type: t.id })}
                              className={cn(
                                "relative rounded-xl border p-3.5 text-center flex flex-col items-center justify-center gap-2 transition-all cursor-pointer",
                                isSelected
                                  ? "bg-[color-mix(in_srgb,var(--op-primary)_14%,var(--op-panel-bg))] border-[var(--op-primary)] text-[var(--op-text)] ring-2 ring-[var(--op-primary)]/40 shadow-sm"
                                  : "bg-[var(--op-panel-bg)] border-[var(--op-border)] text-[var(--op-muted)] hover:text-[var(--op-text)] hover:bg-[var(--op-panel-soft)] hover:border-[var(--op-border-soft)]"
                              )}
                            >
                              <t.icon className={cn("h-5 w-5 transition-colors", isSelected ? "text-[var(--op-primary)]" : "text-[var(--op-muted)]")} />
                              <span className="text-[11px] font-bold">{t.label}</span>
                              {isSelected && (
                                <span className="absolute top-2 right-2 h-4 w-4 rounded-full bg-[var(--op-primary)] text-[var(--primary-contrast,#ffffff)] flex items-center justify-center shadow-sm">
                                  <Check className="h-2.5 w-2.5 stroke-[3]" />
                                </span>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    <div className="grid md:grid-cols-3 gap-4">
                      <div className="space-y-2">
                        <label className="text-[10px] font-black uppercase tracking-wider text-[var(--op-muted)]">Country *</label>
                        <Select value={orgIdentity.country} onValueChange={(val) => setOrgIdentity({ ...orgIdentity, country: val })}>
                          <SelectTrigger className="h-12 rounded-xl bg-[var(--op-panel-bg)] border-[var(--op-border)] text-xs font-semibold text-[var(--op-text)]"><SelectValue /></SelectTrigger>
                          <SelectContent>{countries.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}</SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <label className="text-[10px] font-black uppercase tracking-wider text-[var(--op-muted)]">Timezone *</label>
                        <Select value={orgIdentity.timezone} onValueChange={(val) => setOrgIdentity({ ...orgIdentity, timezone: val })}>
                          <SelectTrigger className="h-12 rounded-xl bg-[var(--op-panel-bg)] border-[var(--op-border)] text-xs font-semibold text-[var(--op-text)]"><SelectValue /></SelectTrigger>
                          <SelectContent>{timezones.map((tz) => <SelectItem key={tz} value={tz}>{tz}</SelectItem>)}</SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <label className="text-[10px] font-black uppercase tracking-wider text-[var(--op-muted)]">Language *</label>
                        <Select value={orgIdentity.language} onValueChange={(val) => setOrgIdentity({ ...orgIdentity, language: val })}>
                          <SelectTrigger className="h-12 rounded-xl bg-[var(--op-panel-bg)] border-[var(--op-border)] text-xs font-semibold text-[var(--op-text)]"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {["English", "Hindi", "Spanish", "French", "German"].map((lang) => (
                              <SelectItem key={lang} value={lang}>{lang}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  </div>

                  <div className="flex justify-between items-center pt-4">
                    <Button variant="outline" onClick={() => handleSaveStep(1, false)} disabled={saving} className="h-12 rounded-xl border-[var(--op-border)] bg-[var(--op-panel-soft)] text-xs font-bold text-[var(--op-text)] flex items-center gap-1.5 hover:bg-[var(--op-panel-bg)]">
                      <Bookmark className="h-3.5 w-3.5 text-[var(--op-primary)]" /> Save as Draft
                    </Button>
                    <Button onClick={() => handleSaveStep(1, true)} disabled={saving} className="h-12 px-6 bg-[var(--op-primary)] hover:opacity-90 text-[var(--primary-contrast,#ffffff)] font-black uppercase tracking-wider text-xs rounded-xl flex items-center gap-2">
                      {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <>Save & Next <ChevronRight className="h-4 w-4 stroke-[3]" /></>}
                    </Button>
                  </div>
                </div>

                <div className="flex flex-col items-center justify-center p-2 space-y-4">
                  <img
                    src="/assets/illustrations/onboarding/workspace-profile.png"
                    alt="Workspace Identity Graphic"
                    className="w-full h-auto max-h-[320px] object-contain rounded-lg border-0 shadow-none bg-transparent"
                  />
                  <div className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] p-4 space-y-1.5 text-xs text-center">
                    <div className="text-[var(--color-text-primary)] font-bold">{orgIdentity.name || "Your Organisation Name"}</div>
                    <div className="text-emerald-400 font-mono text-[10px]">Event.in/{orgIdentity.slug || "your-slug"}</div>
                  </div>
                </div>
              </motion.div>
            )}

            {/* STEP 3: ORGANISATION PROFILE */}
            {step === 2 && (
              <motion.div key="step2" initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -15 }} className="grid lg:grid-cols-[1fr_420px] gap-10 items-start">
                <div className="space-y-6">
                  <div className="space-y-1">
                    <h2 className="text-2xl font-black text-[var(--color-text-primary)] tracking-tight">Organisation Profile</h2>
                    <p className="text-xs text-[var(--color-text-muted)] font-medium">Help us personalise your experience.</p>
                  </div>

                  <div className="space-y-6">
                    <div className="space-y-2">
                      <label className="text-[10px] font-black uppercase tracking-wider text-[var(--op-muted)]">Industry *</label>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                        {[
                          { id: "medical", label: "Medical", icon: Shield },
                          { id: "corporate", label: "Corporate", icon: Globe },
                          { id: "technology", label: "Technology", icon: Monitor },
                          { id: "academic", label: "Academic", icon: Layout },
                          { id: "government", label: "Government", icon: Building2 },
                          { id: "association", label: "Association", icon: Users },
                          { id: "other", label: "Other", icon: Layers },
                        ].map((ind) => {
                          const isSelected = orgProfile.industry === ind.id;
                          return (
                            <button
                              key={ind.id}
                              type="button"
                              onClick={() => setOrgProfile({ ...orgProfile, industry: ind.id })}
                              className={cn(
                                "relative rounded-xl border p-3.5 text-center flex flex-col items-center justify-center gap-2 transition-all cursor-pointer",
                                isSelected
                                  ? "bg-[color-mix(in_srgb,var(--op-primary)_14%,var(--op-panel-bg))] border-[var(--op-primary)] text-[var(--op-text)] ring-2 ring-[var(--op-primary)]/40 shadow-sm"
                                  : "bg-[var(--op-panel-bg)] border-[var(--op-border)] text-[var(--op-muted)] hover:text-[var(--op-text)] hover:bg-[var(--op-panel-soft)] hover:border-[var(--op-border-soft)]"
                              )}
                            >
                              <ind.icon className={cn("h-5 w-5 transition-colors", isSelected ? "text-[var(--op-primary)]" : "text-[var(--op-muted)]")} />
                              <span className="text-[11px] font-bold">{ind.label}</span>
                              {isSelected && (
                                <span className="absolute top-2 right-2 h-4 w-4 rounded-full bg-[var(--op-primary)] text-[var(--primary-contrast,#ffffff)] flex items-center justify-center shadow-sm">
                                  <Check className="h-2.5 w-2.5 stroke-[3]" />
                                </span>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    <div className="space-y-2">
                      <label className="text-[10px] font-black uppercase tracking-wider text-[var(--op-muted)]">Expected Events Per Year *</label>
                      <div className="grid grid-cols-3 gap-3">
                        {["1-5", "5-20", "20+"].map((option) => {
                          const isSelected = orgProfile.expected_events_per_year === option;
                          return (
                            <button
                              key={option}
                              type="button"
                              onClick={() => setOrgProfile({ ...orgProfile, expected_events_per_year: option })}
                              className={cn(
                                "h-12 rounded-xl border font-black text-xs transition-all cursor-pointer flex items-center justify-center gap-2",
                                isSelected
                                  ? "bg-[var(--op-primary)] text-[var(--primary-contrast,#ffffff)] border-[var(--op-primary)] shadow-sm"
                                  : "bg-[var(--op-panel-bg)] border-[var(--op-border)] text-[var(--op-muted)] hover:text-[var(--op-text)] hover:bg-[var(--op-panel-soft)]"
                              )}
                            >
                              {isSelected && <Check className="h-3.5 w-3.5 stroke-[3]" />}
                              {option}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    <div className="space-y-2">
                      <label className="text-[10px] font-black uppercase tracking-wider text-[var(--op-muted)]">Average Attendees Per Event *</label>
                      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
                        {["< 100", "100-500", "500-1000", "1000-5000", "5000+"].map((att) => {
                          const isSelected = orgProfile.average_attendees_per_event === att;
                          return (
                            <button
                              key={att}
                              type="button"
                              onClick={() => setOrgProfile({ ...orgProfile, average_attendees_per_event: att })}
                              className={cn(
                                "h-11 rounded-xl border text-[11px] font-black transition-all cursor-pointer px-2 flex items-center justify-center gap-1.5",
                                isSelected
                                  ? "bg-[var(--op-primary)] text-[var(--primary-contrast,#ffffff)] border-[var(--op-primary)] shadow-sm"
                                  : "bg-[var(--op-panel-bg)] border-[var(--op-border)] text-[var(--op-muted)] hover:text-[var(--op-text)] hover:bg-[var(--op-panel-soft)]"
                              )}
                            >
                              {isSelected && <Check className="h-3 w-3 stroke-[3]" />}
                              {att}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    <div className="space-y-2">
                      <label className="text-[10px] font-black uppercase tracking-wider text-[var(--op-muted)]">Primary Goal *</label>
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                        {[
                          { id: "registration", label: "Registration", icon: Ticket },
                          { id: "speaker_mgmt", label: "Speaker Mgmt", icon: Mic },
                          { id: "scientific_program", label: "Scientific Program", icon: FileText },
                          { id: "hybrid_event", label: "Hybrid Event", icon: Monitor },
                          { id: "venue_ops", label: "Venue Ops", icon: Building2 },
                          { id: "all_in_one", label: "All-In-One", icon: Zap },
                        ].map((goal) => {
                          const isSelected = orgProfile.primary_goal === goal.id;
                          return (
                            <button
                              key={goal.id}
                              type="button"
                              onClick={() => setOrgProfile({ ...orgProfile, primary_goal: goal.id })}
                              className={cn(
                                "relative rounded-xl border p-3.5 text-center flex flex-col items-center justify-center gap-2 transition-all cursor-pointer",
                                isSelected
                                  ? "bg-[color-mix(in_srgb,var(--op-primary)_14%,var(--op-panel-bg))] border-[var(--op-primary)] text-[var(--op-text)] ring-2 ring-[var(--op-primary)]/40 shadow-sm"
                                  : "bg-[var(--op-panel-bg)] border-[var(--op-border)] text-[var(--op-muted)] hover:text-[var(--op-text)] hover:bg-[var(--op-panel-soft)] hover:border-[var(--op-border-soft)]"
                              )}
                            >
                              <goal.icon className={cn("h-5 w-5 transition-colors", isSelected ? "text-[var(--op-primary)]" : "text-[var(--op-muted)]")} />
                              <span className="text-[11px] font-bold">{goal.label}</span>
                              {isSelected && (
                                <span className="absolute top-2 right-2 h-4 w-4 rounded-full bg-[var(--op-primary)] text-[var(--primary-contrast,#ffffff)] flex items-center justify-center shadow-sm">
                                  <Check className="h-2.5 w-2.5 stroke-[3]" />
                                </span>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>

                  <div className="flex justify-between items-center pt-4">
                    <Button variant="outline" onClick={() => handleSaveStep(2, false)} disabled={saving} className="h-12 rounded-xl border-[var(--op-border)] bg-[var(--op-panel-soft)] text-xs font-bold text-[var(--op-text)] flex items-center gap-1.5 hover:bg-[var(--op-panel-bg)]">
                      <Bookmark className="h-3.5 w-3.5 text-[var(--op-primary)]" /> Save as Draft
                    </Button>
                    <Button onClick={() => handleSaveStep(2, true)} disabled={saving} className="h-12 px-6 bg-[var(--op-primary)] hover:opacity-90 text-[var(--primary-contrast,#ffffff)] font-black uppercase tracking-wider text-xs rounded-xl flex items-center gap-2">
                      {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <>Save & Next <ChevronRight className="h-4 w-4 stroke-[3]" /></>}
                    </Button>
                  </div>
                </div>

                <div className="flex flex-col items-center justify-center p-2 space-y-4">
                  <img
                    src="/assets/illustrations/onboarding/workspace-profile.png"
                    alt="Profile Graphic"
                    className="w-full h-auto max-h-[320px] object-contain rounded-lg border-0 shadow-none bg-transparent"
                  />
                  <div className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] p-4 space-y-1.5 text-xs font-medium text-[var(--color-text-secondary)]">
                    <div>Industry: <span className="text-[var(--color-text-primary)] font-bold capitalize">{orgProfile.industry}</span></div>
                    <div>Events / Yr: <span className="text-[var(--color-text-primary)] font-bold">{orgProfile.expected_events_per_year}</span></div>
                  </div>
                </div>
              </motion.div>
            )}

            {/* STEP 4: CONFIGURE WORKSPACE & LOGO */}
            {step === 3 && (
              <motion.div key="step3" initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -15 }} className="grid lg:grid-cols-[1fr_420px] gap-10 items-start">
                <div className="space-y-6">
                  <div className="space-y-1">
                    <h2 className="text-2xl font-black text-[var(--color-text-primary)] tracking-tight">Configure Your Workspace</h2>
                    <p className="text-xs text-[var(--color-text-muted)] font-medium">Upload your logo and customize theme colors.</p>
                  </div>

                  <div className="space-y-5">
                    <div className="space-y-2">
                      <label className="text-[10px] font-black uppercase tracking-wider text-[var(--op-muted)]">Portal Name *</label>
                      <Input
                        value={workspaceConfig.portal_name}
                        onChange={(e) => setWorkspaceConfig({ ...workspaceConfig, portal_name: e.target.value })}
                        placeholder="Enter portal name"
                        className="h-12 rounded-xl bg-[var(--op-panel-bg)] border-[var(--op-border)] text-sm font-semibold text-[var(--op-text)] focus:border-[var(--op-primary)]"
                      />
                    </div>

                    <div className="space-y-2">
                      <label className="text-[10px] font-black uppercase tracking-wider text-[var(--op-muted)]">Organisation Logo</label>
                      <input type="file" ref={fileInputRef} accept="image/*" className="hidden" onChange={handleLogoUpload} />
                      <div className="rounded-xl border border-[var(--op-border)] bg-[var(--op-panel-bg)] p-4 flex items-center justify-between gap-4">
                        <div className="flex items-center gap-3">
                          <div className="h-14 w-14 rounded-xl bg-[var(--op-panel-soft)] border border-[var(--op-border)] flex items-center justify-center font-black text-xs text-[var(--op-primary)] overflow-hidden shrink-0">
                            {workspaceConfig.logo_url ? (
                              <img src={workspaceConfig.logo_url} alt="Uploaded Logo" className="h-full w-full object-cover" />
                            ) : (
                              <ImageIcon className="h-6 w-6 text-[var(--op-muted)]" />
                            )}
                          </div>
                          <div>
                            <p className="text-xs font-bold text-[var(--op-text)]">{workspaceConfig.logo_url ? "Logo Uploaded" : "No Logo Uploaded"}</p>
                            <span className="text-[9px] text-[var(--op-muted)]">PNG, JPG or SVG (Max 5MB)</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Button
                            type="button"
                            onClick={() => fileInputRef.current?.click()}
                            variant="outline"
                            className="h-9 px-3 text-xs rounded-xl border-[var(--op-border)] bg-[var(--op-panel-soft)] text-[var(--op-text)] font-bold flex items-center gap-1.5"
                          >
                            <Upload className="h-3.5 w-3.5 text-[var(--op-primary)]" /> Upload
                          </Button>
                          {workspaceConfig.logo_url && (
                            <Button
                              type="button"
                              onClick={() => setWorkspaceConfig({ ...workspaceConfig, logo_url: "" })}
                              variant="outline"
                              className="h-9 px-2 text-xs rounded-xl border-rose-500/30 bg-rose-500/10 text-rose-400 hover:bg-rose-500/20"
                            >
                              Remove
                            </Button>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="space-y-3">
                      <label className="text-[10px] font-black uppercase tracking-wider text-[var(--op-muted)]">Primary Color</label>
                      <div className="flex items-center gap-3">
                        {["#4f46e5", "#6366f1", "#0ea5e9", "#10b981", "#f59e0b", "#f43f5e", "#8b5cf6"].map((hex) => (
                          <button
                            key={hex}
                            type="button"
                            onClick={() => setWorkspaceConfig({ ...workspaceConfig, primary_color: hex })}
                            className={cn(
                              "h-8 w-8 rounded-full border-2 transition-all cursor-pointer",
                              workspaceConfig.primary_color === hex ? "ring-2 ring-offset-2 ring-[var(--op-text)] scale-110 shadow-md" : "border-transparent opacity-80 hover:opacity-100"
                            )}
                            style={{ backgroundColor: hex }}
                          />
                        ))}
                      </div>
                    </div>

                    <div className="grid md:grid-cols-3 gap-4">
                      <div className="space-y-2">
                        <label className="text-[10px] font-black uppercase tracking-wider text-[var(--op-muted)]">Date Format</label>
                        <Select value={workspaceConfig.date_format} onValueChange={(val) => setWorkspaceConfig({ ...workspaceConfig, date_format: val })}>
                          <SelectTrigger className="h-12 rounded-xl bg-[var(--op-panel-bg)] border-[var(--op-border)] text-xs font-semibold text-[var(--op-text)]"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {["DD/MM/YYYY", "MM/DD/YYYY", "YYYY-MM-DD"].map((df) => (
                              <SelectItem key={df} value={df}>{df}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <label className="text-[10px] font-black uppercase tracking-wider text-[var(--op-muted)]">Time Format</label>
                        <Select value={workspaceConfig.time_format} onValueChange={(val) => setWorkspaceConfig({ ...workspaceConfig, time_format: val })}>
                          <SelectTrigger className="h-12 rounded-xl bg-[var(--op-panel-bg)] border-[var(--op-border)] text-xs font-semibold text-[var(--op-text)]"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {["24 Hour", "12 Hour"].map((tf) => (
                              <SelectItem key={tf} value={tf}>{tf}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <label className="text-[10px] font-black uppercase tracking-wider text-[var(--op-muted)]">Currency</label>
                        <Select value={workspaceConfig.currency} onValueChange={(val) => setWorkspaceConfig({ ...workspaceConfig, currency: val })}>
                          <SelectTrigger className="h-12 rounded-xl bg-[var(--op-panel-bg)] border-[var(--op-border)] text-xs font-semibold text-[var(--op-text)]"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {["INR (₹)", "USD ($)", "EUR (€)", "GBP (£)"].map((cur) => (
                              <SelectItem key={cur} value={cur}>{cur}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  </div>

                  <div className="flex justify-between items-center pt-4">
                    <Button variant="outline" onClick={() => handleSaveStep(3, false)} disabled={saving} className="h-12 rounded-xl border-[var(--op-border)] bg-[var(--op-panel-soft)] text-xs font-bold text-[var(--op-text)] flex items-center gap-1.5 hover:bg-[var(--op-panel-bg)]">
                      <Bookmark className="h-3.5 w-3.5 text-[var(--op-primary)]" /> Save as Draft
                    </Button>
                    <Button onClick={() => handleSaveStep(3, true)} disabled={saving} className="h-12 px-6 bg-[var(--op-primary)] hover:opacity-90 text-[var(--primary-contrast,#ffffff)] font-black uppercase tracking-wider text-xs rounded-xl flex items-center gap-2">
                      {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <>Save & Next <ChevronRight className="h-4 w-4 stroke-[3]" /></>}
                    </Button>
                  </div>
                </div>

                <div className="sticky top-24 space-y-4 rounded-lg border border-[var(--op-border)] bg-[var(--op-panel-bg)] p-6">
                  <span className="text-[10px] font-black uppercase tracking-widest text-[var(--color-text-muted)]">Live Workspace Preview</span>
                  <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] p-4 space-y-4">
                    <div className="flex items-center gap-3 border-b border-[var(--color-border)] pb-3">
                      <div className="h-8 w-8 rounded-lg bg-[var(--color-primary-mid)] text-[var(--color-text-inverse)] font-black text-xs flex items-center justify-center overflow-hidden">
                        {workspaceConfig.logo_url ? (
                          <img src={workspaceConfig.logo_url} alt="Logo" className="h-full w-full object-cover" />
                        ) : (
                          orgIdentity.name ? orgIdentity.name.slice(0, 2).toUpperCase() : "WS"
                        )}
                      </div>
                      <span className="text-xs font-bold text-[var(--color-text-primary)]">{workspaceConfig.portal_name || "YOUR ORGANIZER PORTAL"}</span>
                    </div>

                    <div className="rounded-xl border border-[var(--color-border)] p-3 space-y-1.5" style={{ backgroundColor: `${workspaceConfig.primary_color}15` }}>
                      <span className="text-[9px] font-black uppercase tracking-widest text-[var(--color-primary-mid)]">Portal Theme</span>
                      <h5 className="text-xs font-bold text-[var(--color-text-primary)]">{orgIdentity.name || "Organisation Workspace"}</h5>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}

            {/* STEP 5: INVITE YOUR TEAM */}
            {step === 4 && (
              <motion.div key="step4" initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -15 }} className="grid lg:grid-cols-[1fr_420px] gap-10 items-start">
                <div className="space-y-6">
                  <div className="space-y-1">
                    <h2 className="text-2xl font-black text-[var(--color-text-primary)] tracking-tight">Invite Your Team</h2>
                    <p className="text-xs text-[var(--color-text-muted)] font-medium">Add your team members and assign roles. You can invite more later.</p>
                  </div>

                  <div className="space-y-4">
                    <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] divide-y divide-[var(--color-border-subtle)]">
                      {teamMembers.map((m, i) => (
                        <div key={i} className="p-4 flex items-center justify-between gap-4">
                          <div className="flex items-center gap-3">
                            <div className="h-9 w-9 rounded-full bg-[color-mix(in_srgb,var(--color-primary-mid)_18%,transparent)] border border-[color-mix(in_srgb,var(--color-primary-mid)_40%,transparent)] flex items-center justify-center font-black text-xs text-[var(--color-primary-mid)]">
                              {m.name.slice(0, 2).toUpperCase()}
                            </div>
                            <div>
                              <p className="text-xs font-bold text-[var(--color-text-primary)]">{m.name}</p>
                              <span className="text-[10px] text-[var(--color-text-muted)]">{m.email}</span>
                            </div>
                          </div>
                          <div className="flex items-center gap-3">
                            <span className="text-[10px] font-black uppercase tracking-wider px-2.5 py-1 rounded-full bg-[var(--color-surface-3)] text-[var(--color-text-secondary)] border border-[var(--color-border)]">
                              {m.role}
                            </span>
                            <span className="text-[9px] font-bold uppercase tracking-widest text-emerald-400">{m.access}</span>
                          </div>
                        </div>
                      ))}
                    </div>

                    <div className="grid md:grid-cols-[1fr_1fr_140px_auto] gap-3 pt-2">
                      <Input placeholder="Name" value={newMember.name} onChange={(e) => setNewMember({ ...newMember, name: e.target.value })} className="h-12 rounded-xl bg-[var(--color-surface-2)] border-[var(--color-border)] text-xs font-semibold" />
                      <Input placeholder="teammate@company.org" value={newMember.email} onChange={(e) => setNewMember({ ...newMember, email: e.target.value })} className="h-12 rounded-xl bg-[var(--color-surface-2)] border-[var(--color-border)] text-xs font-semibold" />
                      <Select value={newMember.role} onValueChange={(role: OrgRole) => setNewMember({ ...newMember, role })}>
                        <SelectTrigger className="h-12 rounded-xl bg-[var(--color-surface-2)] border-[var(--color-border)] text-xs font-semibold"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="admin">Admin</SelectItem>
                          <SelectItem value="member">Member</SelectItem>
                          <SelectItem value="billing_only">Billing Only</SelectItem>
                        </SelectContent>
                      </Select>
                      <Button
                        onClick={handleAddTeamMember}
                        disabled={userLimitAccess.loading || !userLimitAccess.enabled}
                        title={
                          userLimitAccess.enabled
                            ? undefined
                            : `Unavailable: ${(userLimitAccess.reason || "RESOLUTION_UNAVAILABLE").replaceAll("_", " ").toLowerCase()}`
                        }
                        className="h-12 px-4 rounded-xl bg-[var(--color-primary-mid)] text-[var(--color-text-inverse)] font-bold text-xs"
                      >
                        <Plus className="h-4 w-4" /> Add
                      </Button>
                    </div>
                  </div>

                  <div className="flex justify-between items-center pt-4">
                    <Button variant="outline" onClick={() => handleSaveStep(4, false)} disabled={saving} className="h-12 rounded-xl border-[var(--color-border)] bg-[var(--color-surface-3)] text-xs font-bold flex items-center gap-1.5">
                      <Bookmark className="h-3.5 w-3.5 text-[var(--color-primary-mid)]" /> Save as Draft
                    </Button>
                    <div className="flex items-center gap-3">
                      <Button
                        variant="ghost"
                        onClick={() => {
                          setSkippedTeam(true);
                          handleSaveStep(4, true);
                        }}
                        className="h-12 text-xs font-bold text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]"
                      >
                        Skip for now →
                      </Button>
                      <Button
                        onClick={() => {
                          setSkippedTeam(false);
                          handleSaveStep(4, true);
                        }}
                        disabled={saving}
                        className="h-12 px-6 bg-[var(--color-primary-mid)] hover:bg-[var(--color-primary-end)] text-[var(--color-text-inverse)] font-black uppercase tracking-wider text-xs rounded-xl flex items-center gap-2"
                      >
                        Save & Next <ChevronRight className="h-4 w-4 stroke-[3]" />
                      </Button>
                    </div>
                  </div>
                </div>

                <div className="flex flex-col items-center justify-center p-2 space-y-4">
                  <img
                    src="/assets/illustrations/onboarding/team-invite.png"
                    alt="Team Collaboration Graphic"
                    className="w-full h-auto max-h-[320px] object-contain rounded-lg border-0 shadow-none bg-transparent"
                  />
                  <div className="w-full space-y-2 text-xs text-[var(--color-text-secondary)] font-medium text-center">
                      <div className="flex items-center justify-center gap-2"><Check className="h-3.5 w-3.5 text-emerald-400 stroke-[3]" /> Invite team members anytime</div>
                    <div className="flex items-center justify-center gap-2"><Check className="h-3.5 w-3.5 text-emerald-400 stroke-[3]" /> Assign RBAC permissions</div>
                  </div>
                </div>
              </motion.div>
            )}

            {/* STEP 5: CHOOSE PLAN (Only if no active plan) */}
            {!hasActivePlan && step === 5 && (
              <motion.div key="step5" initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -15 }} className="space-y-6">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div className="space-y-1">
                    <h2 className="text-2xl font-black text-[var(--color-text-primary)] tracking-tight">Choose Your Subscription Plan</h2>
                    <p className="text-xs text-[var(--color-text-muted)] font-medium">Select a core workspace plan matching your event portfolio scale.</p>
                  </div>
                </div>

                {loadingDbBilling ? (
                  <div className="grid md:grid-cols-3 gap-6 py-12">
                    {[1, 2, 3].map((i) => <div key={i} className="h-96 rounded-lg bg-[var(--color-surface-3)] animate-pulse" />)}
                  </div>
                ) : billingCatalogueUnavailable ? (
                  <div className="rounded-lg border border-red-500/30 bg-red-500/5 p-8 text-center">
                    <h4 className="text-sm font-bold text-[var(--color-text-primary)]">Plan catalogue unavailable</h4>
                    <p className="mt-2 text-xs text-[var(--color-text-secondary)]">No default plan has been substituted. Retry after the authoritative commercial service is available.</p>
                  </div>
                ) : commercialPlans.length === 0 ? (
                  <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] p-8 text-center">
                    <h4 className="text-sm font-bold text-[var(--color-text-primary)]">No published plans</h4>
                    <p className="mt-2 text-xs text-[var(--color-text-muted)]">A plan must be published from Command Center before it can be selected.</p>
                  </div>
                ) : (
                  <div className="grid gap-6 xl:grid-cols-3">
                    {commercialPlans.map((plan) => {
                      const isSelected = selectedPlanId === plan.id;
                      return (
                        <CommercialPlanCard
                          key={plan.id}
                          plan={plan}
                          index={plan.tierIndex}
                          actionVariant={isSelected && !skippedPlan ? "current" : "choose"}
                          isCurrentPlan={isSelected && !skippedPlan}
                          onAction={() => {
                            setSelectedPlanId(plan.id);
                            setSkippedPlan(false);
                          }}
                          secondaryLabel="Details"
                          onSecondaryAction={() => handleOpenPlanDetails(plan.id)}
                        />
                      );
                    })}
                  </div>
                )}

                <div className="flex justify-between items-center pt-4 border-t border-[var(--color-border)]">
                  <Button variant="outline" onClick={() => handleSaveStep(5, false)} disabled={saving} className="h-12 rounded-xl border-[var(--color-border)] bg-[var(--color-surface-3)] text-xs font-bold flex items-center gap-1.5">
                    <Bookmark className="h-3.5 w-3.5 text-[var(--color-primary-mid)]" /> Save as Draft
                  </Button>
                  <div className="flex items-center gap-3">
                    <Button
                      variant="ghost"
                      onClick={() => {
                        setSkippedPlan(true);
                        handleSaveStep(5, false);
                        setStep(8);
                      }}
                      className="h-12 text-xs font-bold text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]"
                    >
                      Skip for now (Start Free Trial) →
                    </Button>
                    <Button onClick={() => handleSaveStep(5, true)} className="h-12 px-6 bg-[var(--color-primary-mid)] hover:bg-[var(--color-primary-end)] text-[var(--color-text-inverse)] font-black uppercase tracking-wider text-xs rounded-xl flex items-center gap-2">
                      Save & Next <ChevronRight className="h-4 w-4 stroke-[3]" />
                    </Button>
                  </div>
                </div>
              </motion.div>
            )}

            {/* STEP 6: ADD-ONS SELECTION (Only if no active plan) */}
            {!hasActivePlan && step === 6 && (
              <motion.div key="step6" initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -15 }} className="space-y-6">
                <div className="space-y-1">
                  <h2 className="text-2xl font-black text-[var(--color-text-primary)] tracking-tight">Select Workspace Add-Ons</h2>
                  <p className="text-xs text-[var(--color-text-muted)] font-medium">Enhance your workspace capacity with commercial plan extensions.</p>
                </div>

                {loadingDbBilling ? (
                  <div className="grid md:grid-cols-3 gap-5 py-8">
                    {[1, 2, 3].map((i) => <div key={i} className="h-80 rounded-lg bg-[var(--color-surface-3)] animate-pulse" />)}
                  </div>
                ) : billingCatalogueUnavailable ? (
                  <div className="rounded-lg border border-red-500/30 bg-red-500/5 p-8 text-center"><h4 className="text-sm font-bold text-[var(--color-text-primary)]">Add-on catalogue unavailable</h4><p className="mt-2 text-xs text-[var(--color-text-secondary)]">No fabricated add-ons have been substituted.</p></div>
                ) : commercialAddons.length === 0 ? (
                  <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] p-8 text-center space-y-2">
                    <PackagePlus className="h-8 w-8 text-[var(--color-text-muted)] mx-auto" />
                    <h4 className="text-sm font-bold text-[var(--color-text-primary)]">No active add-ons catalog</h4>
                    <p className="text-xs text-[var(--color-text-muted)]">Standard plan entitlements active.</p>
                  </div>
                ) : (
                  <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
                    {commercialAddons.map((addon) => (
                      <CommercialAddonCard
                        key={addon.id}
                        addon={addon}
                        selected={selectedAddonIds.includes(addon.id)}
                        onAction={() => toggleAddon(addon.id)}
                        onDetails={() => handleOpenAddonDetails(addon.id)}
                      />
                    ))}
                  </div>
                )}

                <div className="flex justify-between items-center pt-4 border-t border-[var(--color-border)]">
                  <Button variant="outline" onClick={() => handleSaveStep(6, false)} disabled={saving} className="h-12 rounded-xl border-[var(--color-border)] bg-[var(--color-surface-3)] text-xs font-bold flex items-center gap-1.5">
                    <Bookmark className="h-3.5 w-3.5 text-[var(--color-primary-mid)]" /> Save as Draft
                  </Button>
                  <div className="flex items-center gap-3">
                    <Button variant="ghost" onClick={() => handleSaveStep(6, true)} className="h-12 text-xs font-bold text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]">
                      Skip for now →
                    </Button>
                    <Button onClick={() => handleSaveStep(6, true)} className="h-12 px-6 bg-[var(--color-primary-mid)] hover:bg-[var(--color-primary-end)] text-[var(--color-text-inverse)] font-black uppercase tracking-wider text-xs rounded-xl flex items-center gap-2">
                      Review & Confirm <ChevronRight className="h-4 w-4 stroke-[3]" />
                    </Button>
                  </div>
                </div>
              </motion.div>
            )}

            {/* CREATE YOUR FIRST EVENT (Step 5 if active plan exists, else Step 7) */}
            {((hasActivePlan && step === 5) || (!hasActivePlan && step === 7)) && (
              <motion.div key="step7" initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -15 }} className="grid lg:grid-cols-[1fr_420px] gap-10 items-start">
                <div className="space-y-6">
                  <div className="space-y-1">
                    <h2 className="text-2xl font-black text-[var(--color-text-primary)] tracking-tight">Create Your First Event</h2>
                    <p className="text-xs text-[var(--color-text-muted)] font-medium">Enter all conference parameters to set up your event workspace in the DB.</p>
                  </div>

                  <div className="space-y-4">
                    <div className="grid md:grid-cols-2 gap-4">
                      {/* Event Name & Short Code */}
                      <div className="space-y-2 md:col-span-2">
                        <label className="text-[10px] font-black uppercase tracking-wider text-[var(--color-text-muted)]">Event Name *</label>
                        <Input
                          value={eventData.name}
                          onChange={(e) => setEventData({ ...eventData, name: e.target.value, short_code: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 10) })}
                          placeholder="e.g. Annual Medical Conference 2025"
                          className="h-12 rounded-xl bg-[var(--color-surface-2)] border-[var(--color-border)] text-xs font-semibold"
                        />
                      </div>

                      <div className="space-y-2">
                        <label className="text-[10px] font-black uppercase tracking-wider text-[var(--color-text-muted)]">Event Short Code / Slug *</label>
                        <div className="relative flex items-center">
                          <Hash className="absolute left-3.5 h-4 w-4 text-[var(--color-text-muted)]" />
                          <Input
                            value={eventData.short_code}
                            onChange={(e) => setEventData({ ...eventData, short_code: e.target.value.toUpperCase() })}
                            placeholder="AMC2025"
                            className="h-12 rounded-xl bg-[var(--color-surface-2)] border-[var(--color-border)] pl-10 text-xs font-mono font-bold uppercase"
                          />
                        </div>
                      </div>

                      <div className="space-y-2">
                        <label className="text-[10px] font-black uppercase tracking-wider text-[var(--color-text-muted)]">Event Type *</label>
                        <Select value={eventData.event_type} onValueChange={(val) => setEventData({ ...eventData, event_type: val })}>
                          <SelectTrigger className="h-12 rounded-xl bg-[var(--color-surface-2)] border-[var(--color-border)] text-xs font-semibold"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {["Conference", "Expo", "Summit", "Workshop", "Webinar"].map((et) => (
                              <SelectItem key={et} value={et}>{et}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      {/* Dates */}
                      <div className="space-y-2">
                        <label className="text-[10px] font-black uppercase tracking-wider text-[var(--color-text-muted)]">Start Date *</label>
                        <Input type="date" value={eventData.start_date} onChange={(e) => setEventData({ ...eventData, start_date: e.target.value })} className="h-12 rounded-xl bg-[var(--color-surface-2)] border-[var(--color-border)] text-xs font-semibold" />
                      </div>

                      <div className="space-y-2">
                        <label className="text-[10px] font-black uppercase tracking-wider text-[var(--color-text-muted)]">End Date *</label>
                        <Input type="date" value={eventData.end_date} onChange={(e) => setEventData({ ...eventData, end_date: e.target.value })} className="h-12 rounded-xl bg-[var(--color-surface-2)] border-[var(--color-border)] text-xs font-semibold" />
                      </div>

                      {/* Location & Venue */}
                      <div className="space-y-2">
                        <label className="text-[10px] font-black uppercase tracking-wider text-[var(--color-text-muted)]">Venue Name</label>
                        <Input value={eventData.venue} onChange={(e) => setEventData({ ...eventData, venue: e.target.value })} placeholder="Convention Center / Hotel" className="h-12 rounded-xl bg-[var(--color-surface-2)] border-[var(--color-border)] text-xs font-semibold" />
                      </div>

                      <div className="space-y-2">
                        <label className="text-[10px] font-black uppercase tracking-wider text-[var(--color-text-muted)]">City</label>
                        <Input value={eventData.city} onChange={(e) => setEventData({ ...eventData, city: e.target.value })} placeholder="City Name" className="h-12 rounded-xl bg-[var(--color-surface-2)] border-[var(--color-border)] text-xs font-semibold" />
                      </div>

                      {/* Country & Currency */}
                      <div className="space-y-2">
                        <label className="text-[10px] font-black uppercase tracking-wider text-[var(--color-text-muted)]">Country</label>
                        <Input value={eventData.country} onChange={(e) => setEventData({ ...eventData, country: e.target.value })} placeholder="Country" className="h-12 rounded-xl bg-[var(--color-surface-2)] border-[var(--color-border)] text-xs font-semibold" />
                      </div>

                      <div className="space-y-2">
                        <label className="text-[10px] font-black uppercase tracking-wider text-[var(--color-text-muted)]">Currency</label>
                        <Select value={eventData.currency} onValueChange={(val) => setEventData({ ...eventData, currency: val })}>
                          <SelectTrigger className="h-12 rounded-xl bg-[var(--color-surface-2)] border-[var(--color-border)] text-xs font-semibold"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {["INR", "USD", "EUR", "GBP"].map((cur) => (
                              <SelectItem key={cur} value={cur}>{cur}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      {/* Capacity Projections */}
                      <div className="space-y-2">
                        <label className="text-[10px] font-black uppercase tracking-wider text-[var(--color-text-muted)]">Expected Attendees</label>
                        <Input value={eventData.delegates} onChange={(e) => setEventData({ ...eventData, delegates: e.target.value })} placeholder="e.g. 500" className="h-12 rounded-xl bg-[var(--color-surface-2)] border-[var(--color-border)] text-xs font-semibold" />
                      </div>

                      <div className="space-y-2">
                        <label className="text-[10px] font-black uppercase tracking-wider text-[var(--color-text-muted)]">Expected Speakers</label>
                        <Input value={eventData.speakers} onChange={(e) => setEventData({ ...eventData, speakers: e.target.value })} placeholder="e.g. 30" className="h-12 rounded-xl bg-[var(--color-surface-2)] border-[var(--color-border)] text-xs font-semibold" />
                      </div>
                    </div>
                  </div>

                  <div className="flex justify-between items-center pt-4">
                    <Button variant="outline" onClick={() => handleSaveStep(hasActivePlan ? 5 : 7, false)} disabled={saving} className="h-12 rounded-xl border-[var(--color-border)] bg-[var(--color-surface-3)] text-xs font-bold flex items-center gap-1.5">
                      <Bookmark className="h-3.5 w-3.5 text-[var(--color-primary-mid)]" /> Save as Draft
                    </Button>
                    <div className="flex items-center gap-3">
                      <Button
                        variant="ghost"
                        onClick={() => {
                          setSkippedEvent(true);
                          handleSaveStep(hasActivePlan ? 5 : 7, true);
                        }}
                        className="h-12 text-xs font-bold text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]"
                      >
                        Skip for now →
                      </Button>
                      <Button
                        onClick={handleCreateEvent}
                        disabled={saving || eventLimitAccess.loading || !eventLimitAccess.enabled}
                        title={
                          eventLimitAccess.enabled
                            ? undefined
                            : `Unavailable: ${(eventLimitAccess.reason || "RESOLUTION_UNAVAILABLE").replaceAll("_", " ").toLowerCase()}`
                        }
                        className="h-12 px-6 bg-[var(--color-primary-mid)] hover:bg-[var(--color-primary-end)] text-[var(--color-text-inverse)] font-black uppercase tracking-wider text-xs rounded-xl flex items-center gap-2"
                      >
                        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <>Save & Next <ChevronRight className="h-4 w-4 stroke-[3]" /></>}
                      </Button>
                    </div>
                  </div>
                </div>

                <div className="flex flex-col items-center justify-center p-2 space-y-4">
                  <img
                    src="/assets/illustrations/onboarding/event-preview.png"
                    alt="Event Preview Banner Graphic"
                    className="w-full h-auto max-h-[280px] object-contain rounded-lg border-0 shadow-none bg-transparent"
                  />
                  <div className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] p-4 space-y-3">
                    <div className="flex items-center justify-between border-b border-[var(--color-border)] pb-2">
                      <span className="text-xs font-bold text-[var(--color-primary-mid)]">{eventData.name || "Your Event Name"}</span>
                      <span className="text-[9px] font-black uppercase bg-[color-mix(in_srgb,var(--color-primary-mid)_12%,transparent)] text-[var(--color-primary-mid)] px-2 py-0.5 rounded-full border border-[color-mix(in_srgb,var(--color-primary-mid)_25%,transparent)]">
                        {eventData.short_code || "CODE"}
                      </span>
                    </div>
                    <div className="space-y-1.5 text-xs text-[var(--color-text-secondary)] font-medium">
                      <div className="flex items-center gap-2"><Calendar className="h-3.5 w-3.5 text-[var(--color-primary-mid)]" /> {eventData.start_date || "Start Date"} → {eventData.end_date || "End Date"}</div>
                      <div className="flex items-center gap-2"><MapPin className="h-3.5 w-3.5 text-[var(--color-primary-mid)]" /> {eventData.venue ? `${eventData.venue}, ${eventData.city}` : "Venue pending"}</div>
                      <div className="flex items-center gap-2"><Globe className="h-3.5 w-3.5 text-[var(--color-primary-mid)]" /> Timezone: {eventData.timezone} | Currency: {eventData.currency}</div>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}

            {/* WORKSPACE SUMMARY REVIEW & TERMS CONFIRMATION (Step 6 if active plan exists, else Step 8) */}
            {((hasActivePlan && step === 6) || (!hasActivePlan && step === 8)) && (
              <motion.div key="step8" initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -15 }} className="space-y-6">
                <div className="space-y-1">
                  <h2 className="text-2xl font-black text-[var(--color-text-primary)] tracking-tight">Review & Launch Workspace</h2>
                  <p className="text-xs text-[var(--color-text-muted)] font-medium">Please review all workspace configurations before launching.</p>
                </div>

                <div className="grid md:grid-cols-2 gap-5">
                  <div className="rounded-xl border border-[var(--op-border)] bg-[var(--op-panel-bg)] p-6 space-y-4">
                    <h4 className="text-xs font-black uppercase tracking-wider text-[var(--op-primary)]">1. Organisation Details</h4>
                    <div className="space-y-2 text-xs text-[var(--op-muted)] font-medium">
                      <div className="flex justify-between"><span>Name:</span><span className="text-[var(--op-text)] font-bold">{orgIdentity.name}</span></div>
                      <div className="flex justify-between"><span>Type:</span><span className="text-[var(--op-text)] capitalize">{orgIdentity.organization_type.replace('_', ' ')}</span></div>
                      <div className="flex justify-between"><span>Country:</span><span className="text-[var(--op-text)]">{orgIdentity.country}</span></div>
                      <div className="flex justify-between"><span>Timezone:</span><span className="text-[var(--op-text)]">{orgIdentity.timezone}</span></div>
                    </div>
                  </div>

                  <div className="rounded-xl border border-[var(--op-border)] bg-[var(--op-panel-bg)] p-6 space-y-4">
                    <h4 className="text-xs font-black uppercase tracking-wider text-[var(--op-primary)]">2. Workspace & Branding</h4>
                    <div className="space-y-2 text-xs text-[var(--op-muted)] font-medium">
                      <div className="flex justify-between"><span>Portal Name:</span><span className="text-[var(--op-text)] font-bold">{workspaceConfig.portal_name || "YOUR ORGANIZER PORTAL"}</span></div>
                      <div className="flex justify-between"><span>Logo:</span><span className="text-[var(--op-text)]">{workspaceConfig.logo_url ? "Uploaded" : "Default"}</span></div>
                      <div className="flex justify-between"><span>Primary Color:</span><span className="font-mono text-[var(--op-text)]" style={{ color: workspaceConfig.primary_color }}>{workspaceConfig.primary_color}</span></div>
                      <div className="flex justify-between"><span>Date / Time:</span><span className="text-[var(--op-text)]">{workspaceConfig.date_format} • {workspaceConfig.time_format}</span></div>
                    </div>
                  </div>

                  <div className="rounded-xl border border-[var(--op-border)] bg-[var(--op-panel-bg)] p-6 space-y-4">
                    <h4 className="text-xs font-black uppercase tracking-wider text-[var(--op-primary)]">3. First Event Configured</h4>
                    <div className="space-y-2 text-xs text-[var(--op-muted)] font-medium">
                      <div className="flex justify-between"><span>Event Name:</span><span className="text-[var(--op-text)] font-bold">{skippedEvent ? "Skipped" : (eventData.name || "Configured")}</span></div>
                      {!skippedEvent && eventData.name && (
                        <>
                          <div className="flex justify-between"><span>Short Code:</span><span className="text-emerald-400 font-mono font-bold">{eventData.short_code || "CODE"}</span></div>
                          <div className="flex justify-between"><span>Event Dates:</span><span className="text-[var(--op-text)]">{eventData.start_date || "Start"} → {eventData.end_date || "End"}</span></div>
                          <div className="flex justify-between"><span>Venue & Location:</span><span className="text-[var(--op-text)]">{eventData.venue ? `${eventData.venue}, ${eventData.city}` : "N/A"}</span></div>
                          <div className="flex justify-between"><span>Delegates / Speakers:</span><span className="text-[var(--op-text)]">{eventData.delegates} Attendees / {eventData.speakers} Speakers</span></div>
                        </>
                      )}
                    </div>
                  </div>

                  <div className="rounded-xl border border-[var(--op-border)] bg-[var(--op-panel-bg)] p-6 space-y-4">
                    <h4 className="text-xs font-black uppercase tracking-wider text-[var(--op-primary)]">4. Plan & Billing</h4>
                    <div className="space-y-2 text-xs text-[var(--op-muted)] font-medium">
                      <div className="flex justify-between">
                        <span>Subscription Status:</span>
                        <span className="text-emerald-400 font-bold">
                          {hasActivePlan ? `Active Subscription (${currentBillingPlan?.plan?.name || "Plan unavailable"})` : (skippedPlan ? "Free Trial" : (currentSelectedPlanObj?.name || "Selected Plan"))}
                        </span>
                      </div>
                      {!hasActivePlan && (
                        <div className="flex justify-between"><span>Selected Add-Ons:</span><span className="text-[var(--op-text)] font-bold">{selectedAddonIds.length} Add-Ons</span></div>
                      )}
                    </div>
                  </div>
                </div>

                <div className="rounded-xl border border-[var(--op-border)] bg-[var(--op-panel-bg)] p-5 flex items-center gap-4">
                  <input
                    type="checkbox"
                    id="termsCheck"
                    checked={termsAgreed}
                    onChange={(e) => setTermsAgreed(e.target.checked)}
                    className="h-5 w-5 rounded border-[var(--op-border)] bg-[var(--op-panel-soft)] text-[var(--op-primary)] focus:ring-0 cursor-pointer"
                  />
                  <label htmlFor="termsCheck" className="text-xs text-[var(--op-muted)] font-medium cursor-pointer">
                    I agree to the <span className="text-[var(--op-primary)] underline">Terms of Service</span>, <span className="text-[var(--op-primary)] underline">Privacy Policy</span>, and Master Subscription Agreement for Event OS.
                  </label>
                </div>

                <div className="flex justify-between items-center pt-4 border-t border-[var(--op-border)]">
                  <Button variant="outline" onClick={() => setStep(skippedPlan ? 5 : 7)} className="h-12 rounded-xl border-[var(--op-border)] bg-[var(--op-panel-soft)] text-[var(--op-text)] text-xs font-bold hover:bg-[var(--op-panel-bg)]">Back</Button>
                  <Button
                    onClick={handleFinalizeWorkspace}
                    disabled={!termsAgreed || saving}
                    className={cn(
                      "h-13 flex items-center gap-2 rounded-xl px-8 text-xs font-black uppercase tracking-wider transition-all",
                      termsAgreed ? "bg-[var(--op-primary)] text-[var(--primary-contrast,#ffffff)] hover:opacity-90 cursor-pointer shadow-sm" : "bg-[var(--op-panel-soft)] text-[var(--op-muted)] cursor-not-allowed border border-[var(--op-border)]"
                    )}
                  >
                    Confirm & Launch Workspace <ChevronRight className="h-4 w-4 stroke-[3]" />
                  </Button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </main>
      </div>

      {/* OFFICIAL ENTERPRISE COMMERCIAL DETAILS DIALOG MODAL */}
      <CommercialDetailsDialog
        open={detailOpen}
        onOpenChange={setDetailOpen}
        type={detailType}
        data={detailData}
      />

      {/* Payment Authorization Modal */}
      <AnimatePresence>
        {checkoutOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="w-full max-w-md space-y-6 rounded-lg border border-[var(--op-border)] bg-[var(--op-panel-bg)] p-8 text-center">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full border border-[var(--op-success)] bg-[color-mix(in_srgb,var(--op-success)_10%,var(--op-panel-bg))] text-[var(--op-success)]">
                <CheckCircle2 className="h-8 w-8 stroke-[3]" />
              </div>

              <div className="space-y-2">
                <h3 className="text-xl font-black text-[var(--color-text-primary)]">
                  {skippedPlan ? "Workspace Created" : "Workspace Ready"}
                </h3>
                <p className="text-xs text-emerald-400 font-semibold uppercase tracking-wider">
                  {skippedPlan ? "Workspace Initialized (Free Trial Active)" : "Payment Authorized & Workspace Provisioned"}
                </p>
              </div>

              <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-3)] p-4 text-left text-xs text-[var(--color-text-secondary)] space-y-2">
                <div className="flex justify-between"><span>Tenant Name:</span><span className="text-[var(--color-text-primary)] font-bold">{orgIdentity.name}</span></div>
                <div className="flex justify-between"><span>Workspace URL:</span><span className="text-emerald-400 font-mono">Event.in/{orgIdentity.slug}</span></div>
                <div className="flex justify-between"><span>Status:</span><span className="text-emerald-400 font-bold">Active & Provisioned</span></div>
              </div>

              <div className="flex items-center justify-center gap-2 text-xs text-[var(--color-text-muted)] font-medium">
                <Loader2 className="h-4 w-4 animate-spin text-[var(--color-primary-mid)]" />
                Launching your workspace dashboard...
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
