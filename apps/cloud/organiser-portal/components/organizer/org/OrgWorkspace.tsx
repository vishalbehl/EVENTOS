"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  BadgeCheck, Building2, CalendarPlus, Check, ChevronRight, ExternalLink, Loader2,
  Mail, Palette, PartyPopper, Plus, Save, Shield, Trash2, UserPlus, CreditCard,
  Info, Coins, Percent, Receipt, Sliders, Sparkles, CheckCircle2, ArrowLeft, X,
} from "lucide-react";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PlansAddonsManagement } from "@/components/organizer/billing/PlansAddonsManagement";
import { countries, Organization, OrgMember, orgApi, OrgMe, OrgRole, timezones, usageTone, slugify } from "@/components/organizer/org/org-api";
import { apiClient } from "@/lib/api-client";
import { useAuthStore } from "@/store/use-auth-store";
import { cn } from "@/lib/utils";

export function OnboardingWizard() {
  const router = useRouter();
  const [data, setData] = useState<OrgMe | null>(null);
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [brand, setBrand] = useState({ logo_url: "", primary_color: "#6366f1", secondary_color: "#8b5cf6" });
  const [invite, setInvite] = useState({ email: "", org_role: "member" as OrgRole });
  const [pending, setPending] = useState<string[]>([]);
  const [event, setEvent] = useState({ name: "", start_date: "", end_date: "", timezone: "Asia/Kolkata" });
  const [eventId, setEventId] = useState<string | null>(null);

  // New Organization details state
  const [orgForm, setOrgForm] = useState({ name: "", slug: "", country: "IN", timezone: "Asia/Kolkata", phone: "" });
  const [slugAvailable, setSlugAvailable] = useState<boolean | null>(null);
  const [checkingSlug, setCheckingSlug] = useState(false);

  // New billing/checkout states
  const [plans, setPlans] = useState<any[]>([]);
  const [addons, setAddons] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedPlan, setSelectedPlan] = useState<any | null>(null);
  const [isCustom, setIsCustom] = useState(false);
  const [customLimits, setCustomLimits] = useState({
    max_events: 1,
    max_users: 2,
    max_registrations: 150,
    max_speakers: 30,
    max_sessions: 25,
    max_rooms: 5,
    max_storage_gb: 10
  });
  const [selectedAddons, setSelectedAddons] = useState<string[]>([]);
  const [promoCode, setPromoCode] = useState("");
  const [promoInput, setPromoInput] = useState("");
  const [priceDetails, setPriceDetails] = useState<any | null>(null);
  const [calculating, setCalculating] = useState(false);

  // Checkout flow states
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [billingName, setBillingName] = useState("");
  const [billingEmail, setBillingEmail] = useState("");
  const [billingPhone, setBillingPhone] = useState("");
  const [gstNumber, setGstNumber] = useState("");

  // Mock card details state
  const [cardholder, setCardholder] = useState("");
  const [cardNo, setCardNo] = useState("");
  const [expiry, setExpiry] = useState("");
  const [cvv, setCvv] = useState("");
  const [isFlipped, setIsFlipped] = useState(false);
  const [processingState, setProcessingState] = useState<number | null>(null); // null, 0, 1, 2, 3, 4 (success)
  const [successDetails, setSuccessDetails] = useState<any | null>(null);

  const processingMessages = [
    "Connecting secure sandbox gateway...",
    "Authorizing credit transaction escrow...",
    "Synchronizing tenant database records...",
    "Provisioning feature entitlement policies...",
  ];

  useEffect(() => {
    orgApi.me()
      .then((result) => {
        if (result.organization.onboarding_completed) {
          router.replace("/dashboard");
          return;
        }
        setData(result);
        setBrand({
          logo_url: result.organization.logo_url || "",
          primary_color: result.organization.primary_color,
          secondary_color: result.organization.secondary_color,
        });
        setOrgForm({
          name: result.organization.name || "",
          slug: result.organization.slug || "",
          country: result.organization.country || "IN",
          timezone: result.organization.timezone || "Asia/Kolkata",
          phone: useAuthStore.getState().user?.phone || "",
        });
        setBillingName(result.organization.name || "");
        setBillingEmail(result.organization.billing_email || "");
      })
      .catch((err) => {
        console.error("Failed to load onboarding context:", err);
        toast.error("Session expired or invalid. Please log in again.");
        router.replace("/login");
      });
  }, [router]);

  useEffect(() => {
    if (!orgForm.slug || orgForm.slug.length < 3 || (data && orgForm.slug === data.organization.slug)) {
      setSlugAvailable(true);
      return;
    }
    const timer = window.setTimeout(async () => {
      setCheckingSlug(true);
      try {
        const result = await orgApi.checkSlug(orgForm.slug);
        setSlugAvailable(result.available);
      } catch {
        setSlugAvailable(false);
      } finally {
        setCheckingSlug(false);
      }
    }, 500);
    return () => window.clearTimeout(timer);
  }, [orgForm.slug, data]);

  useEffect(() => {
    if (step === 4) {
      setLoading(true);
      Promise.all([orgApi.plans(), orgApi.addons()])
        .then(([plansRes, addonsRes]) => {
          setPlans(plansRes);
          setAddons(addonsRes.filter((a: any) => String(a.addon_type || "PLAN").toUpperCase() === "PLAN"));

          const activePlan = plansRes.find(p => p.name.toLowerCase() === data?.organization.plan.toLowerCase()) || plansRes[0];
          setSelectedPlan(activePlan);

          if (activePlan) {
            setCustomLimits({
              max_events: activePlan.max_events || 1,
              max_users: activePlan.max_users || 10,
              max_registrations: activePlan.max_registrations || 1000,
              max_speakers: activePlan.max_speakers || 100,
              max_sessions: activePlan.max_sessions || 100,
              max_rooms: activePlan.max_rooms || 20,
              max_storage_gb: activePlan.storage_quota_mb ? activePlan.storage_quota_mb / 1024 : 50
            });
          }
        })
        .catch((err) => {
          console.error("Failed to load onboarding billing configurations:", err);
        })
        .finally(() => setLoading(false));
    }
  }, [step, data]);

  useEffect(() => {
    if (!selectedPlan) return;
    setCalculating(true);

    apiClient.post<any>("/organisations/calculate-price", {
      plan_name: selectedPlan.name,
      is_custom: isCustom,
      custom_limits: isCustom ? customLimits : null,
      addon_keys: selectedAddons,
      promo_code: promoCode || null,
    })
      .then((res) => {
        setPriceDetails(res);
      })
      .catch((err) => {
        console.error("Failed to calculate onboarding price:", err);
      })
      .finally(() => setCalculating(false));
  }, [selectedPlan, isCustom, customLimits, selectedAddons, promoCode]);

  const handleBasePlanChange = (plan: any) => {
    setSelectedPlan(plan);
    setCustomLimits({
      max_events: Math.max(customLimits.max_events, plan.max_events || 1),
      max_users: Math.max(customLimits.max_users, plan.max_users || 2),
      max_registrations: Math.max(customLimits.max_registrations, plan.max_registrations || 150),
      max_speakers: Math.max(customLimits.max_speakers, plan.max_speakers || 30),
      max_sessions: Math.max(customLimits.max_sessions, plan.max_sessions || 25),
      max_rooms: Math.max(customLimits.max_rooms, plan.max_rooms || 5),
      max_storage_gb: Math.max(customLimits.max_storage_gb, plan.storage_quota_mb ? plan.storage_quota_mb / 1024 : 10)
    });
  };

  const toggleAddon = (key: string) => {
    if (selectedAddons.includes(key)) {
      setSelectedAddons(selectedAddons.filter(k => k !== key));
    } else {
      setSelectedAddons([...selectedAddons, key]);
    }
  };

  const applyPromo = () => {
    if (!promoInput.trim()) return;
    const code = promoInput.trim().toUpperCase();
    if (code === "EVENTOS50" || code === "WELCOME20") {
      setPromoCode(code);
      toast.success(`Promo code ${code} applied successfully!`);
    } else {
      toast.error("Invalid promo code.");
    }
  };

  if (!data) return <LoadingSurface />;

  const steps = [
    "Organisation Details",
    "Customise Branding",
    "Invite Your Team",
    "Create Your First Event",
    "Set Up Billing",
    "You're Ready!"
  ];

  const saveOrgDetails = async () => {
    if (!orgForm.name || !orgForm.slug) {
      toast.error("Organisation name and slug are required.");
      return;
    }
    if (slugAvailable === false) {
      toast.error("Slug is already taken.");
      return;
    }
    setSaving(true);
    try {
      const result = await orgApi.updateMe({
        name: orgForm.name,
        slug: orgForm.slug,
        country: orgForm.country,
        timezone: orgForm.timezone,
      } as Partial<Organization>);

      const phoneRes = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/users/me`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${useAuthStore.getState().accessToken}`,
        },
        body: JSON.stringify({ phone: orgForm.phone }),
      });
      if (phoneRes.ok) {
        const updatedUser = await phoneRes.json();
        useAuthStore.getState().updateUser(updatedUser);
      }

      setData({ ...data, organization: result.organization } as OrgMe);
      setStep(1);
      toast.success("Organisation details saved.");
    } catch (error: any) {
      toast.error(error.message || "Failed to save organisation details.");
    } finally {
      setSaving(false);
    }
  };

  const saveBrand = async () => {
    setSaving(true);
    try {
      const result = await orgApi.updateMe(brand as Partial<Organization>);
      setData({ ...data, organization: result.organization } as OrgMe);
      setStep(2);
      toast.success("Workspace branding saved.");
    } catch (error: any) {
      toast.error(error.message || "Failed to save branding.");
    } finally {
      setSaving(false);
    }
  };

  const sendInvite = async () => {
    if (!invite.email) return;
    try {
      const result = await orgApi.invite(invite.email, invite.org_role);
      setPending([...pending, invite.email]);
      setInvite({ email: "", org_role: "member" });
      toast.success(result.message);
    } catch (error: any) {
      toast.error(error.message || "Failed to send invitation.");
    }
  };

  const createEvent = async () => {
    try {
      const result = await apiClient.post<any>("/events", {
        name: event.name,
        short_code: event.name.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 10) || "EVENT1",
        start_date: event.start_date,
        end_date: event.end_date || event.start_date,
        timezone: event.timezone,
      });
      setEventId(result.id);
      toast.success("Event created.");
    } catch (error: any) {
      toast.error(error.message || "Could not create event.");
    }
  };

  const handleSubscribe = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!billingName || !billingEmail || !billingPhone) {
      toast.error("Please fill in all invoice contact details.");
      return;
    }
    if (!cardholder || !cardNo || !expiry || !cvv) {
      toast.error("Please fill in all credit card details.");
      return;
    }

    setProcessingState(0);

    const timers: NodeJS.Timeout[] = [];
    for (let i = 1; i <= 4; i++) {
      const t = setTimeout(() => {
        setProcessingState(i);
        if (i === 4) {
          orgApi.subscribe({
            plan_name: selectedPlan.name,
            is_custom: isCustom,
            custom_limits: isCustom ? customLimits : null,
            addon_keys: selectedAddons,
            promo_code: promoCode || null,
            billing_name: billingName,
            billing_email: billingEmail,
            billing_phone: billingPhone,
            gst_number: gstNumber || null,
            cardholder_name: cardholder,
            card_number: cardNo,
            expiry: expiry,
            cvv: cvv,
          })
            .then((result) => {
              setData((prev) => prev ? { ...prev, organization: result.organization } : null);
              setSuccessDetails({
                transaction_id: result.transaction_id,
                amount_paid: result.amount_paid,
                plan_name: isCustom ? "Custom Tier" : selectedPlan.name,
                invoice_no: `INV-${result.transaction_id.slice(0,8).toUpperCase()}`
              });
              toast.success(`Active plan updated to ${selectedPlan.name}`);
            })
            .catch((err) => {
              toast.error(err.message || "Sandbox payment authorization failed.");
              setProcessingState(null);
            });
        }
      }, i * 900);
      timers.push(t);
    }
  };

  const finish = async () => {
    try {
      await orgApi.updateMe({ onboarding_completed: true } as Partial<Organization>);
      // Update auth store user details as well
      const profile = await apiClient.get<any>('/auth/me');
      useAuthStore.getState().updateUser(profile);
      router.push("/dashboard");
    } catch (error: any) {
      toast.error(error.message || "Failed to complete onboarding.");
    }
  };

  const handleCardNoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value.replace(/\D/g, "");
    const formatted = raw.replace(/(.{4})/g, "$1 ").trim().slice(0, 19);
    setCardNo(formatted);
  };

  const handleExpiryChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value.replace(/\D/g, "");
    let formatted = raw;
    if (raw.length > 2) {
      formatted = `${raw.slice(0, 2)}/${raw.slice(2, 4)}`;
    }
    setExpiry(formatted.slice(0, 5));
  };

  const handleCvvChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value.replace(/\D/g, "");
    setCvv(raw.slice(0, 3));
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[320px_1fr] min-h-full">
      <div className="space-y-3">
        {steps.map((label, index) => (
          <button key={label} onClick={() => setStep(index)} className={cn("w-full rounded-2xl border border-default p-4 text-left transition bg-white/[0.03] hover:bg-white/[0.06]", step === index && "border-[var(--pri)] bg-[var(--pri)]/10")}>
            <div className="flex items-center gap-3">
              <span className={cn("flex h-8 w-8 items-center justify-center rounded-full bg-white/10 text-xs font-black", index < step && "bg-emerald-500 text-white", index === step && "bg-[var(--pri)] text-white")}>{index < step ? <Check className="h-4 w-4" /> : index + 1}</span>
              <span className="text-sm font-black tracking-tight">{label}</span>
            </div>
          </button>
        ))}
      </div>
      <motion.div key={step} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="rounded-[1.5rem] border border-default bg-white/[0.035] p-6">
        {step === 0 && (
          <Stack title="Tell Us About Your Organisation" icon={Building2}>
            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase tracking-wider text-[#8b8b95] px-1">Organisation Name</label>
                <Input
                  value={orgForm.name}
                  onChange={(e) => setOrgForm({ ...orgForm, name: e.target.value })}
                  placeholder="e.g. Acme Corporation"
                  className="h-12 rounded-xl bg-white/5 border-default"
                />
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase tracking-wider text-[#8b8b95] px-1">Organisation Slug</label>
                <div className="relative">
                  <Input
                    value={orgForm.slug}
                    onChange={(e) => setOrgForm({ ...orgForm, slug: slugify(e.target.value) })}
                    placeholder="e.g. acme"
                    className="h-12 rounded-xl bg-white/5 border-default pr-11"
                  />
                  <div className="absolute right-3 top-1/2 -translate-y-1/2">
                    {checkingSlug ? <Loader2 className="h-4 w-4 animate-spin text-muted" /> : slugAvailable === true ? <Check className="h-4 w-4 text-emerald-400" /> : slugAvailable === false ? <X className="h-4 w-4 text-[var(--dan)]" /> : null}
                  </div>
                </div>
                <p className="text-[10px] font-black uppercase tracking-widest text-muted">Your portal will be at: eventx.in/{orgForm.slug || "your-slug"}</p>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-wider text-[#8b8b95] px-1">Country</label>
                  <Select value={orgForm.country} onValueChange={(country) => setOrgForm({ ...orgForm, country })}>
                    <SelectTrigger className="h-12 rounded-xl bg-white/5 border-default"><SelectValue /></SelectTrigger>
                    <SelectContent>{countries.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-wider text-[#8b8b95] px-1">Timezone</label>
                  <Select value={orgForm.timezone} onValueChange={(timezone) => setOrgForm({ ...orgForm, timezone })}>
                    <SelectTrigger className="h-12 rounded-xl bg-white/5 border-default"><SelectValue /></SelectTrigger>
                    <SelectContent>{timezones.map((tz) => <SelectItem key={tz} value={tz}>{tz}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase tracking-wider text-[#8b8b95] px-1">Contact Phone Number</label>
                <Input
                  value={orgForm.phone}
                  onChange={(e) => setOrgForm({ ...orgForm, phone: e.target.value })}
                  placeholder="+91 9999999999"
                  className="h-12 rounded-xl bg-white/5 border-default"
                />
              </div>
            </div>
            <Button onClick={saveOrgDetails} disabled={saving} className="h-12 rounded-xl bg-[var(--pri)] font-black uppercase tracking-widest text-[11px] mt-6">{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save & Continue"}</Button>
          </Stack>
        )}
        {step === 1 && (
          <Stack title="Customise Your Workspace" icon={Palette}>
            <BrandFields brand={brand} setBrand={setBrand} />
            <Button onClick={saveBrand} disabled={saving} className="h-12 rounded-xl bg-[var(--pri)] font-black uppercase tracking-widest text-[11px]">{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save & Continue"}</Button>
          </Stack>
        )}
        {step === 2 && (
          <Stack title="Invite Your Team" icon={UserPlus}>
            <div className="grid gap-3 md:grid-cols-[1fr_180px_auto]">
              <Input placeholder="teammate@hospital.org" value={invite.email} onChange={(e) => setInvite({ ...invite, email: e.target.value })} className="h-12 rounded-xl bg-white/5 border-default" />
              <RoleSelect value={invite.org_role} onChange={(org_role) => setInvite({ ...invite, org_role })} />
              <Button onClick={sendInvite} className="h-12 rounded-xl bg-[var(--pri)]"><Mail className="mr-2 h-4 w-4" />Send</Button>
            </div>
            {pending.map((email) => <div key={email} className="rounded-xl border border-default bg-white/[0.03] px-4 py-3 text-sm font-bold text-muted">{email} pending</div>)}
            <Button variant="outline" onClick={() => setStep(3)} className="h-12 rounded-xl border-default bg-white/5">Skip for now</Button>
          </Stack>
        )}
        {step === 3 && (
          <Stack title="Create Your First Event" icon={CalendarPlus}>
            <div className="grid gap-4 md:grid-cols-2">
              <Input placeholder="Annual Conference 2026" value={event.name} onChange={(e) => setEvent({ ...event, name: e.target.value })} className="h-12 rounded-xl bg-white/5 border-default md:col-span-2" />
              <Input type="date" value={event.start_date} onChange={(e) => setEvent({ ...event, start_date: e.target.value })} className="h-12 rounded-xl bg-white/5 border-default" />
              <Input type="date" value={event.end_date} onChange={(e) => setEvent({ ...event, end_date: e.target.value })} className="h-12 rounded-xl bg-white/5 border-default" />
            </div>
            {eventId ? <a href={`/events/${eventId}/dashboard`} className="flex items-center gap-2 text-[var(--pri)] font-black uppercase tracking-widest text-[11px] font-black">Event created <ExternalLink className="h-4 w-4" /></a> : <Button onClick={createEvent} className="h-12 rounded-xl bg-[var(--pri)]">Create Event</Button>}
            <Button variant="outline" onClick={() => setStep(4)} className="h-12 rounded-xl border-default bg-white/5">Skip for now</Button>
          </Stack>
        )}
        {step === 4 && (
          <Stack title="Set Up Billing" icon={BadgeCheck}>
            {loading ? (
              <div className="flex flex-col items-center justify-center py-20 space-y-3">
                <Loader2 className="w-8 h-8 text-[var(--pri)] animate-spin" />
                <p className="text-xs text-white/40 font-bold tracking-tight">Syncing available catalog rates...</p>
              </div>
            ) : (
              <div className="grid lg:grid-cols-[1fr_360px] gap-6 items-start">
                <div className="space-y-6">
                  {/* Standard Tiers selection */}
                  <div className="space-y-3">
                    <h4 className="text-xs font-black uppercase tracking-wider text-white/40">1. Select Base Subscription Plan</h4>
                    <div className="grid md:grid-cols-3 gap-4">
                      {plans.map((p) => {
                        const isSelected = selectedPlan?.id === p.id;
                        const isCurrent = data.organization.plan.toLowerCase() === p.name.toLowerCase() ||
                                          (data.organization.plan.toLowerCase() === "pro" && p.name.toLowerCase() === "professional");
                        return (
                          <div
                            key={p.id}
                            onClick={() => {
                              setIsCustom(false);
                              handleBasePlanChange(p);
                            }}
                            className={cn(
                              "rounded-2xl border p-5 cursor-pointer transition-all flex flex-col justify-between group relative overflow-hidden",
                              isSelected && !isCustom
                                ? "bg-[var(--pri)]/10 border-[var(--pri)] shadow-[0_10px_30px_-10px_rgba(99,102,241,0.2)]"
                                : "bg-white/3 border-default hover:bg-white/5 hover:border-white/20"
                            )}
                          >
                            {isCurrent && (
                              <div className="absolute top-0 right-0 bg-emerald-500 text-white text-[7px] font-black uppercase tracking-widest px-2.5 py-0.5 rounded-bl-lg">
                                Current Tier
                              </div>
                            )}
                            <div className="space-y-2.5">
                              <h4 className="text-sm font-black text-white capitalize flex items-center gap-1.5">
                                {p.name}
                                {p.is_popular && <BadgeCheck className="w-3.5 h-3.5 text-[var(--color-primary-mid)]" />}
                              </h4>
                              <p className="text-[10px] text-white/45 leading-normal min-h-[30px]">{p.description}</p>
                              <div className="flex items-baseline gap-0.5">
                                <span className="text-xl font-black text-white">â‚¹{Number(p.price_per_event_min || 0).toLocaleString()}</span>
                                <span className="text-[9px] text-white/30 font-bold uppercase">/ event</span>
                              </div>
                              <div className="space-y-1 text-[9px] text-white/60 font-semibold border-t border-white/5 pt-2">
                                <div>Events: {p.max_events}</div>
                                <div>Users: {p.max_users}</div>
                                <div>Registrations: {p.max_registrations || "Unlimited"}</div>
                                <div>Storage: {p.storage_quota_mb / 1024} GB</div>
                              </div>
                            </div>
                            <button className={cn(
                              "w-full h-8 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all mt-4 active:scale-95 border",
                              isSelected && !isCustom
                                ? "bg-[var(--pri)] border-[var(--pri)] text-white"
                                : "bg-white/5 border-white/10 text-white/60 hover:bg-white/10"
                            )}>
                              {isSelected && !isCustom ? "Selected" : "Select Tier"}
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Custom Quota Builder */}
                  <div className="space-y-3 rounded-2xl border border-white/5 bg-white/[0.015] p-5">
                    <div className="flex justify-between items-center">
                      <div className="space-y-0.5">
                        <h4 className="text-xs font-black uppercase tracking-wider text-white">2. Customize Plan Quotas</h4>
                        <p className="text-[10px] text-white/40 font-medium">Scale up individual limit configurations beyond plan defaults.</p>
                      </div>
                      <button
                        onClick={() => {
                          setIsCustom(!isCustom);
                          if (!isCustom && selectedPlan) {
                            handleBasePlanChange(selectedPlan);
                          }
                        }}
                        className={cn(
                          "px-4 h-9 rounded-lg text-[10px] font-black uppercase tracking-wider border transition-all flex items-center gap-1.5 active:scale-95",
                          isCustom
                            ? "bg-[var(--pri)] border-[var(--pri)] text-[var(--color-text-inverse)] shadow-md shadow-[var(--pri)]/10"
                            : "bg-white/5 border-white/10 text-white/70 hover:bg-white/10"
                        )}
                      >
                        <Sliders className="w-3.5 h-3.5" />
                        {isCustom ? "Customizer Active" : "Customize Quotas"}
                      </button>
                    </div>

                    {isCustom ? (
                      <div className="grid md:grid-cols-2 gap-5 pt-3 border-t border-white/5">
                        {/* Events Slider */}
                        <div className="space-y-1">
                          <div className="flex justify-between text-[10px] font-bold">
                            <span className="text-white/60">Number of Events</span>
                            <span className="text-[var(--color-primary-mid)] font-black">{customLimits.max_events} {customLimits.max_events === 20 ? "Events (Max)" : "Events"}</span>
                          </div>
                          <input
                            type="range"
                            min={selectedPlan?.max_events || 1}
                            max={20}
                            value={customLimits.max_events}
                            onChange={(e) => setCustomLimits({ ...customLimits, max_events: Number(e.target.value) })}
                            className="w-full h-1 bg-white/15 rounded-lg appearance-none cursor-pointer accent-[var(--pri)]"
                          />
                          <p className="text-[8px] text-white/35 font-bold">Select event package volume.</p>
                        </div>

                        {/* Users Slider */}
                        <div className="space-y-1">
                          <div className="flex justify-between text-[10px] font-bold">
                            <span className="text-white/60">Organizer/Staff Users</span>
                            <span className="text-[var(--color-primary-mid)] font-black">{customLimits.max_users} {customLimits.max_users === 50 ? "Users (Max)" : "Users"}</span>
                          </div>
                          <input
                            type="range"
                            min={selectedPlan?.max_users || 2}
                            max={50}
                            value={customLimits.max_users}
                            onChange={(e) => setCustomLimits({ ...customLimits, max_users: Number(e.target.value) })}
                            className="w-full h-1 bg-white/15 rounded-lg appearance-none cursor-pointer accent-[var(--pri)]"
                          />
                          <p className="text-[8px] text-white/35 font-bold">Includes {selectedPlan?.max_users} users. +â‚¹1,500/user/event.</p>
                        </div>

                        {/* Registrations Slider */}
                        <div className="space-y-1">
                          <div className="flex justify-between text-[10px] font-bold">
                            <span className="text-white/60">Attendee Registrations</span>
                            <span className="text-[var(--color-primary-mid)] font-black">
                              {customLimits.max_registrations >= 10000 ? "10,000+ (Unlimited)" : `${customLimits.max_registrations.toLocaleString()} Registrations`}
                            </span>
                          </div>
                          <input
                            type="range"
                            min={selectedPlan?.max_registrations || 150}
                            max={10000}
                            step={50}
                            value={customLimits.max_registrations}
                            onChange={(e) => setCustomLimits({ ...customLimits, max_registrations: Number(e.target.value) })}
                            className="w-full h-1 bg-white/15 rounded-lg appearance-none cursor-pointer accent-[var(--pri)]"
                          />
                          <p className="text-[8px] text-white/35 font-bold">Includes {selectedPlan?.max_registrations} attendees. +â‚¹5/attendee/event.</p>
                        </div>

                        {/* Storage Slider */}
                        <div className="space-y-1">
                          <div className="flex justify-between text-[10px] font-bold">
                            <span className="text-white/60">File Storage Quota</span>
                            <span className="text-[var(--color-primary-mid)] font-black">{customLimits.max_storage_gb} GB Storage</span>
                          </div>
                          <input
                            type="range"
                            min={selectedPlan ? selectedPlan.storage_quota_mb / 1024 : 10}
                            max={500}
                            step={10}
                            value={customLimits.max_storage_gb}
                            onChange={(e) => setCustomLimits({ ...customLimits, max_storage_gb: Number(e.target.value) })}
                            className="w-full h-1 bg-white/15 rounded-lg appearance-none cursor-pointer accent-[var(--pri)]"
                          />
                          <p className="text-[8px] text-white/35 font-bold">Includes {selectedPlan ? selectedPlan.storage_quota_mb / 1024 : 10} GB. +â‚¹200/GB/event.</p>
                        </div>

                        {/* Speakers Slider */}
                        <div className="space-y-1">
                          <div className="flex justify-between text-[10px] font-bold">
                            <span className="text-white/60">Speakers limit</span>
                            <span className="text-[var(--color-primary-mid)] font-black">{customLimits.max_speakers} Speakers</span>
                          </div>
                          <input
                            type="range"
                            min={selectedPlan?.max_speakers || 30}
                            max={500}
                            step={10}
                            value={customLimits.max_speakers}
                            onChange={(e) => setCustomLimits({ ...customLimits, max_speakers: Number(e.target.value) })}
                            className="w-full h-1 bg-white/15 rounded-lg appearance-none cursor-pointer accent-[var(--pri)]"
                          />
                          <p className="text-[8px] text-white/35 font-bold">Includes {selectedPlan?.max_speakers || 30} speakers. +â‚¹100/speaker/event.</p>
                        </div>

                        {/* Rooms Slider */}
                        <div className="space-y-1">
                          <div className="flex justify-between text-[10px] font-bold">
                            <span className="text-white/60">Rooms/Halls</span>
                            <span className="text-[var(--color-primary-mid)] font-black">{customLimits.max_rooms} Rooms</span>
                          </div>
                          <input
                            type="range"
                            min={selectedPlan?.max_rooms || 5}
                            max={50}
                            value={customLimits.max_rooms}
                            onChange={(e) => setCustomLimits({ ...customLimits, max_rooms: Number(e.target.value) })}
                            className="w-full h-1 bg-white/15 rounded-lg appearance-none cursor-pointer accent-[var(--pri)]"
                          />
                          <p className="text-[8px] text-white/35 font-bold">Includes {selectedPlan?.max_rooms || 5} rooms. +â‚¹1,000/room/event.</p>
                        </div>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center justify-center py-6 text-center text-white/30 text-[10px] font-bold border-t border-white/5 mt-3">
                        <Sliders className="w-5 h-5 mb-1.5 text-white/10" />
                        Limits and quotas locked to standard tier defaults.
                      </div>
                    )}
                  </div>

                  {/* Optional Add-ons selection */}
                  <div className="space-y-3">
                    <h4 className="text-xs font-black uppercase tracking-wider text-white/40">3. Select Optional Workspace Add-ons</h4>
                    <div className="grid md:grid-cols-2 gap-4">
                      {addons.map((a) => {
                        const isChecked = selectedAddons.includes(a.key);
                        const isIncluded = a.included_in_plan && selectedPlan && a.included_in_plan.toLowerCase() === selectedPlan.name.toLowerCase();

                        return (
                          <div
                            key={a.id}
                            onClick={() => !isIncluded && toggleAddon(a.key)}
                            className={cn(
                              "rounded-xl border p-4 cursor-pointer transition-all flex items-start gap-3 relative",
                              isChecked && !isIncluded
                                ? "bg-[var(--pri)]/5 border-[var(--pri)]/20 shadow-sm"
                                : isIncluded
                                  ? "bg-emerald-500/5 border-emerald-500/20 opacity-80 cursor-default"
                                  : "bg-white/3 border-default hover:bg-white/5 hover:border-white/10"
                            )}
                          >
                            <input
                              type="checkbox"
                              checked={isChecked || !!isIncluded}
                              readOnly
                              disabled={!!isIncluded}
                              className="rounded border-white/20 bg-white/5 text-[var(--pri)] focus:ring-[var(--pri)] w-4 h-4 shrink-0 mt-0.5 accent-[var(--pri)]"
                            />
                            <div className="space-y-1">
                              <h5 className="text-[11px] font-black text-white">{a.name}</h5>
                              <p className="text-[9px] text-white/40 leading-normal leading-relaxed">{a.description}</p>
                              <div className="pt-1 flex items-center gap-1.5">
                                <span className="text-[10px] font-bold text-[var(--color-primary-mid)]">
                                  {isIncluded ? "Included in Base" : a.price_inr ? `+â‚¹${Number(a.price_inr).toLocaleString()}` : "Custom Pricing"}
                                </span>
                                {!isIncluded && a.billing_unit && (
                                  <span className="text-[8px] text-white/30 uppercase tracking-widest font-black">({a.billing_unit.replace('_', ' ')})</span>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>

                {/* Live Pricing Calculator Panel */}
                <div className="rounded-3xl border border-white/10 bg-white/[0.035] backdrop-blur-xl p-5 space-y-5 sticky top-5">
                  <h4 className="text-xs font-black uppercase tracking-wider text-white/50 flex items-center gap-2">
                    <Receipt className="w-4 h-4 text-[var(--color-primary-mid)]" />
                    Pricing Summary
                  </h4>

                  {calculating || !priceDetails ? (
                    <div className="flex flex-col items-center justify-center py-12 space-y-2">
                      <Loader2 className="w-5 h-5 text-[var(--color-primary-mid)] animate-spin" />
                      <span className="text-[9px] text-white/40 uppercase tracking-widest font-black">Calculating Rates...</span>
                    </div>
                  ) : (
                    <div className="space-y-4 text-xs font-bold">
                      <div className="pb-3 border-b border-white/5 space-y-2">
                        <div className="flex justify-between">
                          <span className="text-white/50">Base Plan ({priceDetails.plan_name})</span>
                          <span className="text-white">â‚¹{Number(priceDetails.base_price_per_event).toLocaleString()}</span>
                        </div>

                        {priceDetails.extra_quota_price_per_event > 0 && (
                          <div className="flex justify-between">
                            <span className="text-white/50">Custom Quota Surcharge</span>
                            <span className="text-white">+â‚¹{Number(priceDetails.extra_quota_price_per_event).toLocaleString()}</span>
                          </div>
                        )}

                        {priceDetails.addons_price_per_event > 0 && (
                          <div className="flex justify-between">
                            <span className="text-white/50">Add-on Modules Cost</span>
                            <span className="text-white">+â‚¹{Number(priceDetails.addons_price_per_event).toLocaleString()}</span>
                          </div>
                        )}

                        <div className="flex justify-between text-[11px] font-black text-[var(--color-primary-mid)] pt-1">
                          <span>Rate Per Event</span>
                          <span>â‚¹{Number(priceDetails.price_per_event).toLocaleString()}</span>
                        </div>
                      </div>

                      <div className="pb-3 border-b border-white/5 space-y-2">
                        <div className="flex justify-between">
                          <span className="text-white/50">Total Package Vol.</span>
                          <span className="text-white">{priceDetails.number_of_events} {priceDetails.number_of_events === 1 ? "Event" : "Events"}</span>
                        </div>

                        <div className="flex justify-between font-black text-white text-[11px]">
                          <span>Contract Subtotal</span>
                          <span>â‚¹{Number(priceDetails.subtotal).toLocaleString()}</span>
                        </div>

                        {priceDetails.discount > 0 && (
                          <div className="flex justify-between text-emerald-400 font-black">
                            <span className="flex items-center gap-1">
                              <Percent className="w-3 h-3 text-emerald-400" />
                              Discount Applied ({priceDetails.discount_percent}%)
                            </span>
                            <span>-â‚¹{Number(priceDetails.discount).toLocaleString()}</span>
                          </div>
                        )}
                      </div>

                      <div className="space-y-1">
                        <div className="flex justify-between items-baseline">
                          <span className="text-[10px] font-black uppercase tracking-wider text-white/50">Total Amount Due</span>
                          <span className="text-xl font-black text-white">â‚¹{Number(priceDetails.total).toLocaleString()}</span>
                        </div>
                        <p className="text-[8px] text-white/30 text-right">Includes all mock sandbox duties and provisioning fees.</p>
                      </div>

                      {/* Promo Code Input */}
                      <div className="space-y-1.5 pt-2">
                        <label className="text-[9px] font-bold uppercase tracking-wider text-white/40 block">Add Promotional Coupon</label>
                        <div className="flex gap-2">
                          <Input
                            placeholder="e.g. EVENTOS50"
                            value={promoInput}
                            onChange={(e) => setPromoInput(e.target.value)}
                            className="h-10 rounded-lg bg-white/5 border-default text-xs font-bold"
                          />
                          <Button onClick={applyPromo} className="h-10 rounded-lg bg-white/10 text-white font-bold px-3">
                            Apply
                          </Button>
                        </div>
                        {promoCode && (
                          <p className="text-[9px] text-emerald-400 font-bold">
                            Code <strong>{promoCode}</strong> is active!
                          </p>
                        )}
                      </div>

                      <Button
                        onClick={() => {
                          setCheckoutOpen(true);
                        }}
                        className="w-full h-12 rounded-xl bg-[var(--pri)] hover:opacity-90 text-[var(--color-text-inverse)] font-black uppercase tracking-widest text-[11px] shadow-lg shadow-[var(--pri)]/10 transition-all mt-4 active:scale-95"
                      >
                        Proceed to Checkout
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            )}

            <div className="flex gap-4">
              <Button variant="outline" onClick={() => setStep(5)} className="h-12 rounded-xl border-default bg-white/5 text-[11px] font-bold uppercase tracking-wider">I'll do this later</Button>
            </div>
          </Stack>
        )}
        {step === 5 && (
          <Stack title="You're Ready!" icon={PartyPopper}>
            <div className="grid gap-4 md:grid-cols-3">
              {["Create a Session", "Add Speakers", "Configure Registration"].map((label) => <div key={label} className="rounded-2xl border border-default bg-white/[0.04] p-4 font-black text-sm">{label}<ChevronRight className="mt-5 h-4 w-4 text-[var(--pri)]" /></div>)}
            </div>
            <Button onClick={finish} className="h-12 rounded-xl bg-[var(--pri)] font-black uppercase tracking-widest text-[11px]">Go to Dashboard</Button>
          </Stack>
        )}
      </motion.div>

      {/* Checkout Modal */}
      <Dialog open={checkoutOpen} onOpenChange={setCheckoutOpen}>
        <DialogContent className="max-w-2xl border-white/10 bg-[#0e0e14]/95 backdrop-blur-xl text-white rounded-3xl p-6 relative overflow-hidden select-none max-h-[90vh] overflow-y-auto">
          <div className="absolute top-0 right-0 h-32 w-32 bg-[var(--pri)]/10 blur-3xl rounded-full" />

          {processingState === null ? (
            <>
              <DialogHeader>
                <DialogTitle className="text-base font-black tracking-tight flex items-center gap-2 text-white">
                  <CreditCard className="w-5 h-5 text-[var(--color-primary-mid)]" />
                  Subscription Sandbox Checkout
                </DialogTitle>
                <p className="text-xs text-white/40 font-medium">
                  Provide billing context to generate your tax invoice and authorize entitlements.
                </p>
              </DialogHeader>

              <form onSubmit={handleSubscribe} className="grid md:grid-cols-2 gap-6 pt-4">
                {/* Billing Details & Invoice info */}
                <div className="space-y-3.5">
                  <h5 className="text-[10px] font-black uppercase tracking-widest text-white/50 border-b border-white/5 pb-1 flex items-center gap-1.5">
                    <Receipt className="w-3.5 h-3.5 text-[var(--color-primary-mid)]" />
                    Invoice Contact & Tax Details
                  </h5>

                  <div>
                    <label className="text-[9px] font-bold uppercase tracking-widest text-white/40 block mb-1">Company / Billing Name</label>
                    <input
                      type="text"
                      required
                      placeholder="Organization Name"
                      value={billingName}
                      onChange={(e) => setBillingName(e.target.value)}
                      className="w-full h-10 rounded-xl bg-white/5 border border-white/10 px-3.5 text-xs text-white focus:outline-none focus:border-[var(--pri)]/40 transition-all font-bold"
                    />
                  </div>

                  <div>
                    <label className="text-[9px] font-bold uppercase tracking-widest text-white/40 block mb-1">Billing Email Address</label>
                    <input
                      type="email"
                      required
                      placeholder="billing@company.com"
                      value={billingEmail}
                      onChange={(e) => setBillingEmail(e.target.value)}
                      className="w-full h-10 rounded-xl bg-white/5 border border-white/10 px-3.5 text-xs text-white focus:outline-none focus:border-[var(--pri)]/40 transition-all font-bold"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-[9px] font-bold uppercase tracking-widest text-white/40 block mb-1">Phone Number</label>
                      <input
                        type="text"
                        required
                        placeholder="+91 9999999999"
                        value={billingPhone}
                        onChange={(e) => setBillingPhone(e.target.value)}
                        className="w-full h-10 rounded-xl bg-white/5 border border-white/10 px-3.5 text-xs text-white focus:outline-none focus:border-[var(--pri)]/40 transition-all font-bold"
                      />
                    </div>
                    <div>
                      <label className="text-[9px] font-bold uppercase tracking-widest text-white/40 block mb-1">GSTIN (Optional)</label>
                      <input
                        type="text"
                        placeholder="27AAPCS1081F1Z1"
                        maxLength={15}
                        value={gstNumber}
                        onChange={(e) => setGstNumber(e.target.value.toUpperCase())}
                        className="w-full h-10 rounded-xl bg-white/5 border border-white/10 px-3.5 text-xs text-white focus:outline-none focus:border-[var(--pri)]/40 transition-all font-mono font-bold tracking-wider"
                      />
                    </div>
                  </div>

                  {/* Total price indicator on checkout */}
                  <div className="p-3.5 rounded-2xl bg-white/5 border border-white/5 space-y-1">
                    <div className="flex justify-between items-center text-[10px] text-white/50 font-bold uppercase">
                      <span>Mock Escrow Due</span>
                      <span>â‚¹{Number(priceDetails?.total || 0).toLocaleString()}</span>
                    </div>
                    <p className="text-[8px] text-white/35 font-medium leading-normal">
                      Includes plan base, custom limits, and {selectedAddons.length} addons. Promo discount applied.
                    </p>
                  </div>
                </div>

                {/* Credit card form & 3D Flipping animation */}
                <div className="space-y-4">
                  <h5 className="text-[10px] font-black uppercase tracking-widest text-white/50 border-b border-white/5 pb-1 flex items-center gap-1.5">
                    <CreditCard className="w-3.5 h-3.5 text-[var(--color-primary-mid)]" />
                    Sandbox Card Details
                  </h5>

                  <div className="flex flex-col justify-center items-center">
                    <div className="relative w-full h-[140px] perspective-1000 select-none">
                      <motion.div
                        animate={{ rotateY: isFlipped ? 180 : 0 }}
                        transition={{ duration: 0.6 }}
                        className="relative w-full h-full preserve-3d"
                        style={{ transformStyle: "preserve-3d" }}
                      >
                        {/* Front */}
                        <div
                          className="absolute inset-0 w-full h-full rounded-2xl p-4 bg-gradient-to-br from-zinc-800 to-neutral-950 border border-[var(--pri)]/20 shadow-xl flex flex-col justify-between"
                          style={{ backfaceVisibility: "hidden" }}
                        >
                          <div className="flex justify-between items-start">
                            <div>
                              <p className="text-[6px] uppercase tracking-wider text-white/44 font-bold">EventOS Billing Platform</p>
                              <h5 className="text-[9px] font-black text-white mt-0.5 tracking-tight uppercase">
                                {isCustom ? "Custom Entitlements" : selectedPlan?.name}
                              </h5>
                            </div>
                            <span className="text-[9px] font-bold text-white/80 bg-white/10 px-2 py-0.5 rounded">EOS</span>
                          </div>

                          <p className="text-sm font-mono tracking-widest font-black text-white/90 truncate my-2">
                            {cardNo || "â€¢â€¢â€¢â€¢ â€¢â€¢â€¢â€¢ â€¢â€¢â€¢â€¢ â€¢â€¢â€¢â€¢"}
                          </p>

                          <div className="flex justify-between items-end text-[7px] font-bold uppercase tracking-wider text-white/50">
                            <div className="max-w-[140px] truncate">
                              <p className="text-[5px] text-white/30">Cardholder</p>
                              <p className="text-white truncate font-black">{cardholder || "YOUR FULL NAME"}</p>
                            </div>
                            <div>
                              <p className="text-[5px] text-white/30">Expiry</p>
                              <p className="text-white font-black">{expiry || "MM/YY"}</p>
                            </div>
                          </div>
                        </div>

                        {/* Back */}
                        <div
                          className="absolute inset-0 w-full h-full rounded-2xl bg-[#121118] border border-white/10 shadow-xl flex flex-col justify-between py-3"
                          style={{ backfaceVisibility: "hidden", transform: "rotateY(180deg)" }}
                        >
                          <div className="w-full h-6 bg-black mt-1" />
                          <div className="px-4 flex justify-between items-center">
                            <span className="text-[6px] text-white/30 font-bold uppercase">Authorized Sandbox Signature</span>
                            <div className="h-6 bg-white text-black font-mono font-black text-xs rounded px-2.5 flex items-center justify-center min-w-[36px]">
                              {cvv || "â€¢â€¢â€¢"}
                            </div>
                          </div>
                          <p className="text-[6px] text-white/20 font-bold text-center leading-tight px-4">
                            Dummy transaction portal. No actual financial operations occur.
                          </p>
                        </div>
                      </motion.div>
                    </div>
                  </div>

                  {/* Card fields input */}
                  <div className="space-y-3">
                    <div>
                      <label className="text-[9px] font-bold uppercase tracking-widest text-white/40 block mb-1">Card Holder Name</label>
                      <input
                        type="text"
                        required
                        placeholder="John Doe"
                        value={cardholder}
                        onChange={(e) => setCardholder(e.target.value)}
                        onFocus={() => setIsFlipped(false)}
                        className="w-full h-9 rounded-xl bg-white/5 border border-white/10 px-3.5 text-xs text-white focus:outline-none focus:border-[var(--pri)]/40 transition-all font-semibold"
                      />
                    </div>

                    <div>
                      <label className="text-[9px] font-bold uppercase tracking-widest text-white/40 block mb-1">Card Number</label>
                      <input
                        type="text"
                        required
                        placeholder="4000 1234 5678 9010"
                        value={cardNo}
                        onChange={handleCardNoChange}
                        onFocus={() => setIsFlipped(false)}
                        className="w-full h-9 rounded-xl bg-white/5 border border-white/10 px-3.5 text-xs text-white font-mono focus:outline-none focus:border-[var(--pri)]/40 transition-all"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-[9px] font-bold uppercase tracking-widest text-white/40 block mb-1">Expiry Date</label>
                        <input
                          type="text"
                          required
                          placeholder="MM/YY"
                          value={expiry}
                          onChange={handleExpiryChange}
                          onFocus={() => setIsFlipped(false)}
                          className="w-full h-9 rounded-xl bg-white/5 border border-white/10 px-3.5 text-xs text-white font-mono focus:outline-none focus:border-[var(--pri)]/40 transition-all text-center"
                        />
                      </div>
                      <div>
                        <label className="text-[9px] font-bold uppercase tracking-widest text-white/40 block mb-1">CVV</label>
                        <input
                          type="password"
                          required
                          placeholder="â€¢â€¢â€¢"
                          value={cvv}
                          onChange={handleCvvChange}
                          onFocus={() => setIsFlipped(true)}
                          onBlur={() => setIsFlipped(false)}
                          className="w-full h-9 rounded-xl bg-white/5 border border-white/10 px-3.5 text-xs text-white font-mono focus:outline-none focus:border-[var(--pri)]/40 transition-all text-center"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="flex gap-3 pt-2">
                    <button
                      type="button"
                      onClick={() => setCheckoutOpen(false)}
                      className="flex-1 h-10 rounded-xl border border-white/10 text-xs text-white/40 hover:text-white font-bold transition-all"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="flex-1 h-10 rounded-xl bg-[var(--pri)] hover:opacity-90 text-[var(--color-text-inverse)] text-xs font-black uppercase tracking-wider shadow-lg shadow-[var(--pri)]/10 active:scale-95 transition-all"
                    >
                      Authorize Sandbox
                    </button>
                  </div>
                </div>
              </form>
            </>
          ) : successDetails === null ? (
            /* Processing Escrow Loading Loop */
            <div className="flex flex-col items-center justify-center py-16 space-y-6 text-center min-h-[300px]">
              <div className="relative w-14 h-14 flex items-center justify-center">
                <div className="absolute inset-0 bg-[var(--pri)]/10 blur-xl rounded-full animate-pulse" />
                <Loader2 className="w-8 h-8 text-[var(--color-primary-mid)] animate-spin" />
              </div>
              <div className="space-y-2 max-w-sm">
                <h4 className="text-sm font-bold text-white tracking-tight">Authorizing Escrow Handshake</h4>
                <p className="text-[10px] text-white/40 font-mono animate-pulse">{processingMessages[processingState] || "Syncing records..."}</p>
              </div>
            </div>
          ) : (
            /* Dummy Transaction Success / Finalization Screen */
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: "spring", stiffness: 200, damping: 20 }}
              className="flex flex-col items-center justify-center py-6 text-center space-y-6 min-h-[350px]"
            >
              <div className="w-14 h-14 rounded-full bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 animate-bounce">
                <CheckCircle2 className="w-7 h-7" />
              </div>

              <div className="space-y-1.5">
                <h4 className="text-lg font-black tracking-tight text-white font-black">Payment Success & Entitled</h4>
                <p className="text-[10px] text-emerald-400 font-black uppercase tracking-widest">
                  Transaction Authorized Â· Workspace limits synchronized
                </p>
              </div>

              {/* Receipt Preview */}
              <div className="w-full max-w-sm rounded-2xl border border-white/5 bg-white/[0.02] p-5 space-y-3.5 text-left text-xs font-bold relative">
                <div className="absolute top-0 right-0 h-24 w-24 bg-emerald-500/5 blur-2xl rounded-full" />
                <div className="flex justify-between border-b border-white/5 pb-2">
                  <span className="text-white/40 font-bold uppercase tracking-wider text-[9px]">Receipt Details</span>
                  <span className="text-white/40 font-bold uppercase tracking-wider text-[9px] font-mono">{successDetails.invoice_no}</span>
                </div>

                <div className="space-y-2">
                  <div className="flex justify-between">
                    <span className="text-white/55 font-semibold">Plan Entitled:</span>
                    <span className="text-white capitalize">{successDetails.plan_name}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-white/55 font-semibold">Billed Name:</span>
                    <span className="text-white">{billingName}</span>
                  </div>
                  {gstNumber && (
                    <div className="flex justify-between">
                      <span className="text-white/55 font-semibold">GSTIN Applied:</span>
                      <span className="text-white font-mono">{gstNumber}</span>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <span className="text-white/55 font-semibold">Transaction ID:</span>
                    <span className="text-white/80 font-mono text-[10px] break-all">{successDetails.transaction_id}</span>
                  </div>
                  <div className="flex justify-between border-t border-white/5 pt-2.5 items-baseline">
                    <span className="text-white/55 font-semibold">Total Settled (INR):</span>
                    <span className="text-base font-black text-white">â‚¹{Number(successDetails.amount_paid).toLocaleString()}</span>
                  </div>
                </div>
              </div>

              <Button
                onClick={() => {
                  setCheckoutOpen(false);
                  setProcessingState(null);
                  setSuccessDetails(null);
                  setStep(5);
                }}
                className="w-full max-w-xs h-11 rounded-xl bg-[var(--pri)] hover:opacity-90 font-black uppercase tracking-widest text-[10px] text-[var(--color-text-inverse)] shadow-lg transition-all active:scale-95"
              >
                Continue Onboarding
              </Button>
            </motion.div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

export function OrgSettingsPage() {
  const searchParams = useSearchParams();
  const [data, setData] = useState<OrgMe | null>(null);
  const [members, setMembers] = useState<OrgMember[]>([]);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [invite, setInvite] = useState({ email: "", org_role: "member" as OrgRole });
  const [upgradeOpen, setUpgradeOpen] = useState(false);
  const [activeTab, setActiveTab] = useState("profile");
  const user = useAuthStore((state) => state.user);

  useEffect(() => {
    const tab = searchParams?.get("tab");
    if (tab) {
      setActiveTab(tab);
    }
  }, [searchParams]);

  const load = async () => {
    const [org, memberList] = await Promise.all([orgApi.me(), orgApi.members()]);
    setData(org);
    setMembers(memberList);
  };

  useEffect(() => { load(); }, []);
  if (!data) return <LoadingSurface />;

  const org = data.organization;
  const save = async (patch: Partial<Organization>) => {
    const result = await orgApi.updateMe(patch);
    setData({ ...data, organization: result.organization });
    toast.success("Organisation updated.");
  };

  const sendInvite = async () => {
    await orgApi.invite(invite.email, invite.org_role);
    toast.success(`Invitation sent to ${invite.email}`);
    setInviteOpen(false);
    setInvite({ email: "", org_role: "member" });
    load();
  };

  return (
    <>
      <Tabs value={activeTab} onValueChange={setActiveTab} className="min-h-full">
        <div className="flex items-center justify-between gap-4">
          <PageTitle icon={Building2} title="Organisation Settings" subtitle={`${org.name} Â· ${org.slug}`} />
          <TabsList>
            <TabsTrigger value="profile">Profile</TabsTrigger>
            <TabsTrigger value="branding">Branding</TabsTrigger>
            <TabsTrigger value="team">Team</TabsTrigger>
          </TabsList>
        </div>
        <TabsContent value="profile"><ProfileTab org={org} onSave={save} /></TabsContent>
        <TabsContent value="branding"><BrandingTab org={org} onSave={save} /></TabsContent>
        <TabsContent value="team">
          <TeamTab members={members} currentUserId={user?.id} data={data} onInvite={() => setInviteOpen(true)} onChanged={load} />
        </TabsContent>
      </Tabs>
      <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
        <DialogContent className="border-default bg-[var(--surf)] text-[var(--text)]">
          <DialogHeader><DialogTitle>Invite Member</DialogTitle></DialogHeader>
          <Input placeholder="name@company.com" value={invite.email} onChange={(e) => setInvite({ ...invite, email: e.target.value })} className="h-12 rounded-xl bg-white/5 border-default" />
          <RoleSelect value={invite.org_role} onChange={(org_role) => setInvite({ ...invite, org_role })} />
          <Button onClick={sendInvite} className="h-12 rounded-xl bg-[var(--pri)]">Send Invitation</Button>
        </DialogContent>
      </Dialog>
      <Dialog open={upgradeOpen} onOpenChange={setUpgradeOpen}>
        <DialogContent className="border-default bg-[var(--surf)] text-[var(--text)]">
          <DialogHeader><DialogTitle>Upgrade Plan</DialogTitle></DialogHeader>
          <p className="text-sm text-muted">Contact us at hello@eventx.in to upgrade your workspace plan.</p>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function PlatformAdminPage() {
  const router = useRouter();
  const user = useAuthStore((state) => state.user);
  const accessToken = useAuthStore((state) => state.accessToken);
  const setAuth = useAuthStore((state) => state.setAuth);
  const [orgs, setOrgs] = useState<Organization[]>([]);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [selected, setSelected] = useState<any | null>(null);
  const [edit, setEdit] = useState<Organization | null>(null);
  const [reason, setReason] = useState("");

  useEffect(() => {
    if (user && !user.is_platform_admin && user.role !== "super_admin") router.replace("/dashboard");
  }, [router, user]);

  const load = async () => {
    const params = new URLSearchParams();
    if (search) params.set("search", search);
    if (filter !== "all" && filter !== "suspended") params.set("plan", filter);
    if (filter === "suspended") params.set("is_active", "false");
    const result = await orgApi.platformOrgs(`?${params.toString()}`);
    setOrgs(result.items);
  };

  useEffect(() => { if (user?.is_platform_admin || user?.role === "super_admin") load(); }, [filter, search, user]);

  const stats = useMemo(() => ({
    total: orgs.length,
    active: orgs.filter((o) => o.is_active).length,
    events: orgs.reduce((sum, o) => sum + (o.event_count || 0), 0),
    members: orgs.reduce((sum, o) => sum + (o.member_count || 0), 0),
    files: 0,
    storage: orgs.reduce((sum, o) => sum + (o.storage_used_gb || 0), 0),
  }), [orgs]);

  const impersonate = async (org: Organization) => {
    if (!accessToken || !user) return;
    localStorage.setItem("eventos_original_token", accessToken);
    localStorage.setItem("eventos_impersonating_org", org.name);
    const result = await orgApi.impersonate(org.id);
    setAuth(user, result.access_token);
    window.location.reload();
  };

  return (
    <Tabs defaultValue="orgs">
      <div className="flex items-center justify-between gap-4">
        <PageTitle icon={Shield} title="Platform Admin" subtitle="Operate organisations, plans, limits, and impersonation." />
        <TabsList><TabsTrigger value="orgs">Organisations</TabsTrigger><TabsTrigger value="stats">Platform Stats</TabsTrigger></TabsList>
      </div>
      <TabsContent value="orgs" className="space-y-5">
        <div className="flex flex-wrap gap-3">
          <Input placeholder="Search name, slug, email" value={search} onChange={(e) => setSearch(e.target.value)} className="h-11 max-w-sm rounded-xl bg-white/5 border-default" />
          {["all", "trial", "starter", "pro", "enterprise", "suspended"].map((item) => <Button key={item} variant={filter === item ? "primary" : "outline"} onClick={() => setFilter(item)} className="h-11 rounded-xl border-default capitalize">{item}</Button>)}
        </div>
        <div className="overflow-hidden rounded-2xl border border-default">
          <table className="w-full text-sm">
            <thead className="bg-white/[0.04] text-[10px] uppercase tracking-widest text-muted"><tr><th className="p-4 text-left">Organisation</th><th>Plan</th><th>Events</th><th>Members</th><th>Status</th><th>Created</th><th></th></tr></thead>
            <tbody>
              {orgs.map((org) => (
                <tr key={org.id} className="border-t border-default">
                  <td className="p-4"><div className="font-black">{org.name}</div><div className="text-xs text-muted">{org.slug}</div></td>
                  <td><PlanBadge plan={org.plan} /></td>
                  <td>{org.event_count || 0}</td>
                  <td>{org.member_count || 0}</td>
                  <td><Badge className={org.is_active ? "bg-emerald-500/20 text-emerald-300" : "bg-[var(--dan)]/20 text-[var(--dan)]"}>{org.is_active ? "Active" : "Suspended"}</Badge></td>
                  <td>{formatDistanceToNow(new Date(org.created_at), { addSuffix: true })}</td>
                  <td className="p-4 text-right">
                    <div className="flex justify-end gap-2">
                      <Button size="sm" variant="outline" onClick={async () => setSelected(await orgApi.platformOrg(org.id))} className="rounded-xl border-default">Details</Button>
                      <Button size="sm" variant="outline" onClick={() => setEdit(org)} className="rounded-xl border-default">Change Plan</Button>
                      <Button size="sm" onClick={() => impersonate(org)} className="rounded-xl bg-[var(--pri)]">Impersonate</Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </TabsContent>
      <TabsContent value="stats"><div className="grid gap-4 md:grid-cols-3">{[
        ["Total Organisations", stats.total], ["Active This Month", stats.active], ["Total Events", stats.events],
        ["Total Participants", stats.members], ["Total Files Processed", stats.files], ["Storage Used", `${stats.storage.toFixed(1)} GB`],
      ].map(([label, value]) => <Metric key={label} label={String(label)} value={String(value)} />)}</div></TabsContent>
      <Dialog open={!!selected} onOpenChange={() => setSelected(null)}>
        <DialogContent className="max-w-3xl border-default bg-[var(--surf)] text-[var(--text)]">
          <DialogHeader><DialogTitle>{selected?.organization?.name}</DialogTitle></DialogHeader>
          <div className="grid gap-4 md:grid-cols-2">
            <InfoBlock title="Members" items={(selected?.members || []).map((m: OrgMember) => `${m.name} Â· ${m.org_role}`)} />
            <InfoBlock title="Events" items={(selected?.events || []).map((e: any) => `${e.name} Â· ${e.start_date}`)} />
          </div>
        </DialogContent>
      </Dialog>
      <Dialog open={!!edit} onOpenChange={() => setEdit(null)}>
        <DialogContent className="border-default bg-[var(--surf)] text-[var(--text)]">
          <DialogHeader><DialogTitle>Change Plan</DialogTitle></DialogHeader>
          {edit && <PlatformEdit org={edit} reason={reason} setReason={setReason} onSaved={() => { setEdit(null); load(); }} />}
        </DialogContent>
      </Dialog>
    </Tabs>
  );
}

function ProfileTab({ org, onSave }: { org: Organization; onSave: (patch: Partial<Organization>) => void }) {
  const [form, setForm] = useState(org);
  return <FormGrid><Field label="Organisation Name"><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="h-12 rounded-xl bg-white/5 border-default" /></Field><Field label="Slug"><Input value={form.slug} readOnly className="h-12 rounded-xl bg-white/5 border-default opacity-70" /><p className="text-xs text-muted mt-2">Contact support to change</p></Field><Field label="Billing Email"><Input value={form.billing_email || ""} onChange={(e) => setForm({ ...form, billing_email: e.target.value })} className="h-12 rounded-xl bg-white/5 border-default" /></Field><Field label="Country"><Select value={form.country} onValueChange={(country) => setForm({ ...form, country })}><SelectTrigger className="h-12 rounded-xl bg-white/5 border-default"><SelectValue /></SelectTrigger><SelectContent>{countries.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}</SelectContent></Select></Field><Field label="Timezone"><Select value={form.timezone} onValueChange={(timezone) => setForm({ ...form, timezone })}><SelectTrigger className="h-12 rounded-xl bg-white/5 border-default"><SelectValue /></SelectTrigger><SelectContent>{timezones.map((tz) => <SelectItem key={tz} value={tz}>{tz}</SelectItem>)}</SelectContent></Select></Field><Button onClick={() => onSave(form)} className="h-12 rounded-xl bg-[var(--pri)]"><Save className="mr-2 h-4 w-4" />Save Changes</Button></FormGrid>;
}

function BrandingTab({ org, onSave }: { org: Organization; onSave: (patch: Partial<Organization>) => void }) {
  const [brand, setBrand] = useState({ logo_url: org.logo_url || "", primary_color: org.primary_color, secondary_color: org.secondary_color });
  return <div className="grid gap-6 lg:grid-cols-[1fr_360px]"><FormGrid><BrandFields brand={brand} setBrand={setBrand} /><Button onClick={() => onSave(brand as Partial<Organization>)} className="h-12 rounded-xl bg-[var(--pri)]">Save Branding</Button></FormGrid><div className="rounded-2xl border border-default bg-white/[0.04] p-5"><div className="rounded-xl p-4" style={{ border: `1px solid ${brand.primary_color}` }}><div className="mb-4 h-10 w-10 rounded-xl" style={{ background: brand.primary_color }} /><h3 className="font-black">Live Preview</h3><p className="text-sm text-muted">Conference operations card</p><button className="mt-5 rounded-full px-4 py-2 text-xs font-black text-white" style={{ background: brand.primary_color }}>Primary Action</button><span className="ml-3 rounded-full px-3 py-2 text-xs font-black text-white" style={{ background: brand.secondary_color }}>Badge</span></div></div></div>;
}

function TeamTab({ members, currentUserId, data, onInvite, onChanged }: { members: OrgMember[]; currentUserId?: string; data: OrgMe; onInvite: () => void; onChanged: () => void }) {
  const remove = async (id: string) => { await orgApi.removeMember(id); onChanged(); };
  const used = members.filter((m) => m.is_active).length;
  return <div className="space-y-5"><div className="flex items-center justify-between"><h3 className="text-xl font-black">{used} members</h3><Button onClick={onInvite} className="rounded-xl bg-[var(--pri)]"><Plus className="mr-2 h-4 w-4" />Invite Member</Button></div><div className="overflow-hidden rounded-2xl border border-default"><table className="w-full text-sm"><tbody>{members.map((m) => <tr key={m.id} className={cn("border-b border-default last:border-0", m.user_id === currentUserId && "bg-[var(--pri)]/10")}><td className="p-4 font-black">{m.name} {m.user_id === currentUserId && <Badge className="ml-2 bg-[var(--pri)]/20 text-[var(--pri)]">(you)</Badge>}</td><td>{m.email}</td><td className="capitalize">{m.org_role}</td><td><Badge className={m.accepted_at ? "bg-emerald-500/20 text-emerald-300" : "bg-amber-500/20 text-amber-300"}>{m.accepted_at ? "Active" : "Pending"}</Badge></td><td>{m.accepted_at ? formatDistanceToNow(new Date(m.accepted_at), { addSuffix: true }) : "-"}</td><td className="p-4 text-right">{m.user_id !== currentUserId && data.org_role === "owner" && <Button size="sm" variant="outline" onClick={() => remove(m.id)} className="rounded-xl border-default text-[var(--dan)]"><Trash2 className="h-4 w-4" /></Button>}</td></tr>)}</tbody></table></div><UsageBar label={`${used} / ${data.plan_limits.users} team members`} value={used} max={data.plan_limits.users} /></div>;
}

function PlanUsageTab({ data, onRefresh }: { data: OrgMe; onRefresh: () => void }) {
  return <PlansAddonsManagement />;

  const [activeView, setActiveView] = useState<"usage" | "browse">("usage");
  const [plans, setPlans] = useState<any[]>([]);
  const [addons, setAddons] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Custom plan config states
  const [selectedPlan, setSelectedPlan] = useState<any | null>(null);
  const [isCustom, setIsCustom] = useState(false);
  const [customLimits, setCustomLimits] = useState({
    max_events: 1,
    max_users: 2,
    max_registrations: 150,
    max_speakers: 30,
    max_sessions: 25,
    max_rooms: 5,
    max_storage_gb: 10
  });
  const [selectedAddons, setSelectedAddons] = useState<string[]>([]);
  const [promoCode, setPromoCode] = useState("");
  const [promoInput, setPromoInput] = useState("");
  const [priceDetails, setPriceDetails] = useState<any | null>(null);
  const [calculating, setCalculating] = useState(false);

  // Checkout flow states
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [billingName, setBillingName] = useState("");
  const [billingEmail, setBillingEmail] = useState("");
  const [billingPhone, setBillingPhone] = useState("");
  const [gstNumber, setGstNumber] = useState("");

  const [cardholder, setCardholder] = useState("");
  const [cardNo, setCardNo] = useState("");
  const [expiry, setExpiry] = useState("");
  const [cvv, setCvv] = useState("");
  const [isFlipped, setIsFlipped] = useState(false);
  const [processingState, setProcessingState] = useState<number | null>(null);
  const [successDetails, setSuccessDetails] = useState<any | null>(null);

  const processingMessages = [
    "Connecting secure billing sandbox...",
    "Verifying GSTIN records & promo code details...",
    "Authorizing mock transaction escrow...",
    "Provisioning custom limit entitlements...",
  ];
  const planExpiry = data.organization.plan_expires_at;
  const processingIndex = processingState ?? -1;
  const processingMessage =
    processingIndex >= 0 ? (processingMessages[processingIndex] || "Syncing records...") : "Syncing records...";

  useEffect(() => {
    if (activeView === "browse") {
      setLoading(true);
      Promise.all([orgApi.plans(), orgApi.addons()])
        .then(([plansRes, addonsRes]) => {
          setPlans(plansRes);
          setAddons(addonsRes.filter((a: any) => String(a.addon_type || "PLAN").toUpperCase() === "PLAN"));

          // Set initial base plan to Pro or Basic if not set
          const activePlan = plansRes.find(p => p.name.toLowerCase() === data.organization.plan.toLowerCase()) || plansRes[0];
          setSelectedPlan(activePlan);

          // Initialize limits to active plan's limits
          if (activePlan) {
            setCustomLimits({
              max_events: activePlan.max_events || 1,
              max_users: activePlan.max_users || 10,
              max_registrations: activePlan.max_registrations || 1000,
              max_speakers: activePlan.max_speakers || 100,
              max_sessions: activePlan.max_sessions || 100,
              max_rooms: activePlan.max_rooms || 20,
              max_storage_gb: activePlan.storage_quota_mb ? activePlan.storage_quota_mb / 1024 : 50
            });
          }
        })
        .catch(err => {
          console.error("Failed to load plans/addons:", err);
          toast.error("Failed to load billing configurations.");
        })
        .finally(() => setLoading(false));
    }
  }, [activeView, data.organization.plan]);

  // Recalculate price in real-time
  useEffect(() => {
    if (!selectedPlan) return;
    setCalculating(true);
    orgApi.calculatePrice({
      plan_name: selectedPlan.name,
      is_custom: isCustom,
      custom_limits: isCustom ? customLimits : null,
      addon_keys: selectedAddons,
      promo_code: promoCode || null
    })
      .then(res => {
        setPriceDetails(res);
      })
      .catch(err => {
        console.error("Failed to calculate price:", err);
      })
      .finally(() => setCalculating(false));
  }, [selectedPlan, isCustom, customLimits, selectedAddons, promoCode]);

  // Set slider boundaries when base plan changes
  const handleBasePlanChange = (plan: any) => {
    setSelectedPlan(plan);
    setCustomLimits({
      max_events: Math.max(customLimits.max_events, plan.max_events || 1),
      max_users: Math.max(customLimits.max_users, plan.max_users || 2),
      max_registrations: Math.max(customLimits.max_registrations, plan.max_registrations || 150),
      max_speakers: Math.max(customLimits.max_speakers, plan.max_speakers || 30),
      max_sessions: Math.max(customLimits.max_sessions, plan.max_sessions || 25),
      max_rooms: Math.max(customLimits.max_rooms, plan.max_rooms || 5),
      max_storage_gb: Math.max(customLimits.max_storage_gb, plan.storage_quota_mb ? plan.storage_quota_mb / 1024 : 10)
    });
  };

  const toggleAddon = (key: string) => {
    if (selectedAddons.includes(key)) {
      setSelectedAddons(selectedAddons.filter(k => k !== key));
    } else {
      setSelectedAddons([...selectedAddons, key]);
    }
  };

  const applyPromo = () => {
    if (!promoInput.trim()) return;
    const code = promoInput.trim().toUpperCase();
    if (code === "EVENTOS50" || code === "WELCOME20") {
      setPromoCode(code);
      toast.success(`Promo code ${code} applied successfully!`);
    } else {
      toast.error("Invalid promo code.");
    }
  };

  const handleCheckout = (e: React.FormEvent) => {
    e.preventDefault();
    if (!billingName || !billingEmail || !billingPhone) {
      toast.error("Please fill in all invoice contact details.");
      return;
    }
    if (!cardholder || !cardNo || !expiry || !cvv) {
      toast.error("Please fill in all card verification fields.");
      return;
    }

    // Start checkout processing flow
    setProcessingState(0);
    const timers: NodeJS.Timeout[] = [];
    for (let i = 1; i <= 4; i++) {
      const t = setTimeout(() => {
        setProcessingState(i);
        if (i === 4) {
          // Final purchase trigger
          orgApi.subscribe({
            plan_name: selectedPlan.name,
            is_custom: isCustom,
            custom_limits: isCustom ? customLimits : null,
            addon_keys: selectedAddons,
            promo_code: promoCode || null,
            billing_name: billingName,
            billing_email: billingEmail,
            billing_phone: billingPhone,
            gst_number: gstNumber || null,
            cardholder_name: cardholder,
            card_number: cardNo,
            expiry: expiry,
            cvv: cvv
          })
            .then(res => {
              setSuccessDetails({
                transaction_id: res.transaction_id,
                amount_paid: res.amount_paid,
                plan_name: isCustom ? "Custom Tier" : selectedPlan.name,
                invoice_no: `INV-${res.transaction_id.slice(0,8).toUpperCase()}`
              });
              toast.success("Billing plan active and entitlements updated!");
              onRefresh();
            })
            .catch(err => {
              toast.error(err.message || "Failed to finalize subscription transaction.");
              setProcessingState(null);
            });
        }
      }, i * 900);
      timers.push(t);
    }
  };

  const handleCardNoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value.replace(/\D/g, "");
    const formatted = raw.replace(/(.{4})/g, "$1 ").trim().slice(0, 19);
    setCardNo(formatted);
  };

  const handleExpiryChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value.replace(/\D/g, "");
    let formatted = raw;
    if (raw.length > 2) {
      formatted = `${raw.slice(0,2)}/${raw.slice(2,4)}`;
    }
    setExpiry(formatted.slice(0, 5));
  };

  const handleCvvChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value.replace(/\D/g, "");
    setCvv(raw.slice(0, 3));
  };

  const high = data.event_count / data.plan_limits.events > .9 || data.member_count / data.plan_limits.users > .9 || data.storage_used_gb / data.plan_limits.storage_gb > .9;

  if (activeView === "usage") {
    return (
      <div className="space-y-6">
        {high && (
          <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 text-xs font-bold text-amber-200 flex items-center gap-3">
            <Info className="w-4 h-4 shrink-0 text-amber-400" />
            You are approaching resource quotas on your active plan tier. Modify limits to avoid disruption.
          </div>
        )}

        <div className="rounded-3xl border border-white/10 bg-white/[0.035] backdrop-blur-xl p-6 relative overflow-hidden flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
          <div className="absolute top-0 right-0 h-40 w-40 bg-[var(--pri)]/10 blur-3xl rounded-full" />
          <div className="space-y-2 relative z-10">
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-black uppercase tracking-widest text-white/45 bg-white/5 border border-white/5 px-2.5 py-1 rounded-full">Workspace Core Tier</span>
              <PlanBadge plan={data.organization.plan} />
            </div>
            <h3 className="text-xl font-black text-white capitalize">{data.organization.plan} Plan</h3>
            <p className="text-xs text-white/40 font-medium">
              Status: <span className="text-emerald-400 font-bold">Active</span> Â· Renews/expires: {planExpiry ? formatDistanceToNow(new Date(planExpiry!), { addSuffix: true }) : "Unlimited"}
            </p>
          </div>
          <Button onClick={() => setActiveView("browse")} className="rounded-xl bg-[var(--pri)] hover:bg-[var(--pri)]/80 text-[11px] font-black uppercase tracking-widest relative z-10 px-6 h-12 shadow-lg shadow-[var(--pri)]/20 transition-all active:scale-95">
            Upgrade / Modify Plan
          </Button>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <div className="rounded-2xl border border-default bg-white/[0.02] p-5 space-y-4">
            <UsageBar label={`Events: ${data.event_count} / ${data.plan_limits.events || "âˆž"}`} value={data.event_count} max={data.plan_limits.events} />
          </div>

          <div className="rounded-2xl border border-default bg-white/[0.02] p-5 space-y-4">
            <UsageBar label={`Organizer Users: ${data.member_count} / ${data.plan_limits.users || "âˆž"}`} value={data.member_count} max={data.plan_limits.users} />
          </div>

          <div className="rounded-2xl border border-default bg-white/[0.02] p-5 space-y-4">
            <UsageBar label={`Storage: ${data.storage_used_gb.toFixed(1)} GB / ${data.plan_limits.storage_gb || "âˆž"} GB`} value={data.storage_used_gb} max={data.plan_limits.storage_gb} />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <button onClick={() => setActiveView("usage")} className="flex items-center gap-2 text-xs text-white/50 hover:text-white font-bold transition-colors">
          <ArrowLeft className="w-4 h-4" />
          Back to Usage Settings
        </button>
        <h3 className="text-sm font-black text-white/40 uppercase tracking-widest">Plan Customizer</h3>
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center py-20 space-y-3">
          <Loader2 className="w-8 h-8 text-[var(--pri)] animate-spin" />
          <p className="text-xs text-white/40 font-bold tracking-tight">Syncing available catalog rates...</p>
        </div>
      ) : (
        <div className="grid lg:grid-cols-[1fr_360px] gap-6 items-start">
          <div className="space-y-6">
            {/* Standard Tiers selection */}
            <div className="space-y-3">
              <h4 className="text-xs font-black uppercase tracking-wider text-white/40">1. Select Base Subscription Plan</h4>
              <div className="grid md:grid-cols-3 gap-4">
                {plans.map((p) => {
                  const isSelected = selectedPlan?.id === p.id;
                  const isCurrent = data.organization.plan.toLowerCase() === p.name.toLowerCase() ||
                                    (data.organization.plan.toLowerCase() === "pro" && p.name.toLowerCase() === "professional");
                  return (
                    <div
                      key={p.id}
                      onClick={() => {
                        setIsCustom(false);
                        handleBasePlanChange(p);
                      }}
                      className={cn(
                        "rounded-2xl border p-5 cursor-pointer transition-all flex flex-col justify-between group relative overflow-hidden",
                        isSelected && !isCustom
                          ? "bg-[var(--pri)]/10 border-[var(--pri)] shadow-[0_10px_30px_-10px_rgba(99,102,241,0.2)]"
                          : "bg-white/3 border-default hover:bg-white/5 hover:border-white/20"
                      )}
                    >
                      {isCurrent && (
                        <div className="absolute top-0 right-0 bg-emerald-500 text-white text-[7px] font-black uppercase tracking-widest px-2.5 py-0.5 rounded-bl-lg">
                          Current Tier
                        </div>
                      )}
                      <div className="space-y-2.5">
                        <h4 className="text-sm font-black text-white capitalize flex items-center gap-1.5">
                          {p.name}
                          {p.is_popular && <BadgeCheck className="w-3.5 h-3.5 text-[var(--color-primary-mid)]" />}
                        </h4>
                        <p className="text-[10px] text-white/45 leading-normal min-h-[30px]">{p.description}</p>
                        <div className="flex items-baseline gap-0.5">
                          <span className="text-xl font-black text-white">â‚¹{Number(p.price_per_event_min || 0).toLocaleString()}</span>
                          <span className="text-[9px] text-white/30 font-bold uppercase">/ event</span>
                        </div>
                        <div className="space-y-1 text-[9px] text-white/60 font-semibold border-t border-white/5 pt-2">
                          <div>Events: {p.max_events}</div>
                          <div>Users: {p.max_users}</div>
                          <div>Registrations: {p.max_registrations || "Unlimited"}</div>
                          <div>Storage: {p.storage_quota_mb / 1024} GB</div>
                        </div>
                      </div>
                      <button className={cn(
                        "w-full h-8 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all mt-4 active:scale-95 border",
                        isSelected && !isCustom
                          ? "bg-[var(--pri)] border-[var(--pri)] text-black font-semibold"
                          : "bg-white/5 border-white/10 text-white/60 hover:bg-white/10"
                      )}>
                        {isSelected && !isCustom ? "Selected" : "Select Tier"}
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Custom Quota Builder */}
            <div className="space-y-3 rounded-2xl border border-white/5 bg-white/[0.015] p-5">
              <div className="flex justify-between items-center">
                <div className="space-y-0.5">
                  <h4 className="text-xs font-black uppercase tracking-wider text-white">2. Customize Plan Quotas</h4>
                  <p className="text-[10px] text-white/40 font-medium">Scale up individual limit configurations beyond plan defaults.</p>
                </div>
                <button
                  onClick={() => {
                    setIsCustom(!isCustom);
                    if (!isCustom && selectedPlan) {
                      handleBasePlanChange(selectedPlan);
                    }
                  }}
                  className={cn(
                    "px-4 h-9 rounded-lg text-[10px] font-black uppercase tracking-wider border transition-all flex items-center gap-1.5 active:scale-95",
                    isCustom
                      ? "bg-[var(--pri)] border-[var(--pri)] text-[var(--color-text-inverse)] shadow-md shadow-[var(--pri)]/10"
                      : "bg-white/5 border-white/10 text-white/70 hover:bg-white/10"
                  )}
                >
                  <Sliders className="w-3.5 h-3.5" />
                  {isCustom ? "Customizer Active" : "Customize Quotas"}
                </button>
              </div>

              {isCustom ? (
                <div className="grid md:grid-cols-2 gap-5 pt-3 border-t border-white/5">
                  {/* Events Slider */}
                  <div className="space-y-1">
                    <div className="flex justify-between text-[10px] font-bold">
                      <span className="text-white/60">Number of Events</span>
                      <span className="text-[var(--color-primary-mid)] font-black">{customLimits.max_events} {customLimits.max_events === 20 ? "Events (Max)" : "Events"}</span>
                    </div>
                    <input
                      type="range"
                      min={selectedPlan?.max_events || 1}
                      max={20}
                      value={customLimits.max_events}
                      onChange={(e) => setCustomLimits({ ...customLimits, max_events: Number(e.target.value) })}
                      className="w-full h-1 bg-white/15 rounded-lg appearance-none cursor-pointer accent-[var(--pri)]"
                    />
                    <p className="text-[8px] text-white/35 font-bold">Select event package volume.</p>
                  </div>

                  {/* Users Slider */}
                  <div className="space-y-1">
                    <div className="flex justify-between text-[10px] font-bold">
                      <span className="text-white/60">Organizer/Staff Users</span>
                      <span className="text-[var(--color-primary-mid)] font-black">{customLimits.max_users} {customLimits.max_users === 50 ? "Users (Max)" : "Users"}</span>
                    </div>
                    <input
                      type="range"
                      min={selectedPlan?.max_users || 2}
                      max={50}
                      value={customLimits.max_users}
                      onChange={(e) => setCustomLimits({ ...customLimits, max_users: Number(e.target.value) })}
                      className="w-full h-1 bg-white/15 rounded-lg appearance-none cursor-pointer accent-[var(--pri)]"
                    />
                    <p className="text-[8px] text-white/35 font-bold">Includes {selectedPlan?.max_users} users. +â‚¹1,500/user/event.</p>
                  </div>

                  {/* Registrations Slider */}
                  <div className="space-y-1">
                    <div className="flex justify-between text-[10px] font-bold">
                      <span className="text-white/60">Attendee Registrations</span>
                      <span className="text-[var(--color-primary-mid)] font-black">
                        {customLimits.max_registrations >= 10000 ? "10,000+ (Unlimited)" : `${customLimits.max_registrations.toLocaleString()} Registrations`}
                      </span>
                    </div>
                    <input
                      type="range"
                      min={selectedPlan?.max_registrations || 150}
                      max={10000}
                      step={50}
                      value={customLimits.max_registrations}
                      onChange={(e) => setCustomLimits({ ...customLimits, max_registrations: Number(e.target.value) })}
                      className="w-full h-1 bg-white/15 rounded-lg appearance-none cursor-pointer accent-[var(--pri)]"
                    />
                    <p className="text-[8px] text-white/35 font-bold">Includes {selectedPlan?.max_registrations} attendees. +â‚¹5/attendee/event.</p>
                  </div>

                  {/* Storage Slider */}
                  <div className="space-y-1">
                    <div className="flex justify-between text-[10px] font-bold">
                      <span className="text-white/60">File Storage Quota</span>
                      <span className="text-[var(--color-primary-mid)] font-black">{customLimits.max_storage_gb} GB Storage</span>
                    </div>
                    <input
                      type="range"
                      min={selectedPlan ? selectedPlan.storage_quota_mb / 1024 : 10}
                      max={500}
                      step={10}
                      value={customLimits.max_storage_gb}
                      onChange={(e) => setCustomLimits({ ...customLimits, max_storage_gb: Number(e.target.value) })}
                      className="w-full h-1 bg-white/15 rounded-lg appearance-none cursor-pointer accent-[var(--pri)]"
                    />
                    <p className="text-[8px] text-white/35 font-bold">Includes {selectedPlan ? selectedPlan.storage_quota_mb / 1024 : 10} GB. +â‚¹200/GB/event.</p>
                  </div>

                  {/* Speakers Slider */}
                  <div className="space-y-1">
                    <div className="flex justify-between text-[10px] font-bold">
                      <span className="text-white/60">Speakers limit</span>
                      <span className="text-[var(--color-primary-mid)] font-black">{customLimits.max_speakers} Speakers</span>
                    </div>
                    <input
                      type="range"
                      min={selectedPlan?.max_speakers || 30}
                      max={500}
                      step={10}
                      value={customLimits.max_speakers}
                      onChange={(e) => setCustomLimits({ ...customLimits, max_speakers: Number(e.target.value) })}
                      className="w-full h-1 bg-white/15 rounded-lg appearance-none cursor-pointer accent-[var(--pri)]"
                    />
                    <p className="text-[8px] text-white/35 font-bold">Includes {selectedPlan?.max_speakers || 30} speakers. +â‚¹100/speaker/event.</p>
                  </div>

                  {/* Rooms Slider */}
                  <div className="space-y-1">
                    <div className="flex justify-between text-[10px] font-bold">
                      <span className="text-white/60">Rooms/Halls</span>
                      <span className="text-[var(--color-primary-mid)] font-black">{customLimits.max_rooms} Rooms</span>
                    </div>
                    <input
                      type="range"
                      min={selectedPlan?.max_rooms || 5}
                      max={50}
                      value={customLimits.max_rooms}
                      onChange={(e) => setCustomLimits({ ...customLimits, max_rooms: Number(e.target.value) })}
                      className="w-full h-1 bg-white/15 rounded-lg appearance-none cursor-pointer accent-[var(--pri)]"
                    />
                    <p className="text-[8px] text-white/35 font-bold">Includes {selectedPlan?.max_rooms || 5} rooms. +â‚¹1,000/room/event.</p>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-6 text-center text-white/30 text-[10px] font-bold border-t border-white/5 mt-3">
                  <Sliders className="w-5 h-5 mb-1.5 text-white/10" />
                  Limits and quotas locked to standard tier defaults.
                </div>
              )}
            </div>

            {/* Optional Add-ons selection */}
            <div className="space-y-3">
              <h4 className="text-xs font-black uppercase tracking-wider text-white/40">3. Select Optional Workspace Add-ons</h4>
              <div className="grid md:grid-cols-2 gap-4">
                {addons.map((a) => {
                  const isChecked = selectedAddons.includes(a.key);
                  const isIncluded = a.included_in_plan && selectedPlan && a.included_in_plan.toLowerCase() === selectedPlan.name.toLowerCase();

                  return (
                    <div
                      key={a.id}
                      onClick={() => !isIncluded && toggleAddon(a.key)}
                      className={cn(
                        "rounded-xl border p-4 cursor-pointer transition-all flex items-start gap-3 relative",
                        isChecked && !isIncluded
                          ? "bg-[var(--pri)]/5 border-[var(--pri)]/20 shadow-sm animate-pulse-subtle"
                          : isIncluded
                            ? "bg-emerald-500/5 border-emerald-500/20 opacity-80 cursor-default"
                            : "bg-white/3 border-default hover:bg-white/5 hover:border-white/10"
                      )}
                    >
                      <input
                        type="checkbox"
                        checked={isChecked || !!isIncluded}
                        readOnly
                        disabled={!!isIncluded}
                        className="rounded border-white/20 bg-white/5 text-[var(--pri)] focus:ring-[var(--pri)] w-4 h-4 shrink-0 mt-0.5 accent-[var(--pri)]"
                      />
                      <div className="space-y-1">
                        <h5 className="text-[11px] font-black text-white">{a.name}</h5>
                        <p className="text-[9px] text-white/40 leading-normal leading-relaxed">{a.description}</p>
                        <div className="pt-1 flex items-center gap-1.5">
                          <span className="text-[10px] font-bold text-[var(--color-primary-mid)]">
                            {isIncluded ? "Included in Base" : a.price_inr ? `+â‚¹${Number(a.price_inr).toLocaleString()}` : "Custom Pricing"}
                          </span>
                          {!isIncluded && a.billing_unit && (
                            <span className="text-[8px] text-white/30 uppercase tracking-widest font-black">({a.billing_unit.replace('_', ' ')})</span>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Live Pricing Calculator Panel */}
          <div className="rounded-3xl border border-white/10 bg-white/[0.035] backdrop-blur-xl p-5 space-y-5 sticky top-5">
            <h4 className="text-xs font-black uppercase tracking-wider text-white/50 flex items-center gap-2">
              <Receipt className="w-4 h-4 text-[var(--color-primary-mid)]" />
              Pricing Summary
            </h4>

            {calculating || !priceDetails ? (
              <div className="flex flex-col items-center justify-center py-12 space-y-2">
                <Loader2 className="w-5 h-5 text-[var(--color-primary-mid)] animate-spin" />
                <span className="text-[9px] text-white/40 uppercase tracking-widest font-black">Calculating Rates...</span>
              </div>
            ) : (
              <div className="space-y-4 text-xs font-bold">
                <div className="pb-3 border-b border-white/5 space-y-2">
                  <div className="flex justify-between">
                    <span className="text-white/50">Base Plan ({priceDetails.plan_name})</span>
                    <span className="text-white">â‚¹{Number(priceDetails.base_price_per_event).toLocaleString()}</span>
                  </div>

                  {priceDetails.extra_quota_price_per_event > 0 && (
                    <div className="flex justify-between">
                      <span className="text-white/50">Custom Quota Surcharge</span>
                      <span className="text-white">+â‚¹{Number(priceDetails.extra_quota_price_per_event).toLocaleString()}</span>
                    </div>
                  )}

                  {priceDetails.addons_price_per_event > 0 && (
                    <div className="flex justify-between">
                      <span className="text-white/50">Add-on Modules Cost</span>
                      <span className="text-white">+â‚¹{Number(priceDetails.addons_price_per_event).toLocaleString()}</span>
                    </div>
                  )}

                  <div className="flex justify-between text-[11px] font-black text-[var(--color-primary-mid)] pt-1">
                    <span>Rate Per Event</span>
                    <span>â‚¹{Number(priceDetails.price_per_event).toLocaleString()}</span>
                  </div>
                </div>

                <div className="pb-3 border-b border-white/5 space-y-2">
                  <div className="flex justify-between">
                    <span className="text-white/50">Total Package Vol.</span>
                    <span className="text-white">{priceDetails.number_of_events} {priceDetails.number_of_events === 1 ? "Event" : "Events"}</span>
                  </div>

                  <div className="flex justify-between font-black text-white text-[11px]">
                    <span>Contract Subtotal</span>
                    <span>â‚¹{Number(priceDetails.subtotal).toLocaleString()}</span>
                  </div>

                  {priceDetails.discount > 0 && (
                    <div className="flex justify-between text-emerald-400 font-black">
                      <span className="flex items-center gap-1">
                        <Percent className="w-3 h-3 text-emerald-400" />
                        Discount Applied ({priceDetails.discount_percent}%)
                      </span>
                      <span>-â‚¹{Number(priceDetails.discount).toLocaleString()}</span>
                    </div>
                  )}
                </div>

                <div className="space-y-1">
                  <div className="flex justify-between items-baseline">
                    <span className="text-[10px] font-black uppercase tracking-wider text-white/50">Total Amount Due</span>
                    <span className="text-xl font-black text-white">â‚¹{Number(priceDetails.total).toLocaleString()}</span>
                  </div>
                  <p className="text-[8px] text-white/30 text-right">Includes all mock sandbox duties and provisioning fees.</p>
                </div>

                {/* Promo Code Input */}
                <div className="space-y-1.5 pt-2">
                  <label className="text-[9px] font-bold uppercase tracking-wider text-white/40 block">Add Promotional Coupon</label>
                  <div className="flex gap-2">
                    <Input
                      placeholder="e.g. EVENTOS50"
                      value={promoInput}
                      onChange={(e) => setPromoInput(e.target.value)}
                      className="h-10 rounded-lg bg-white/5 border-default text-xs font-bold"
                    />
                    <Button onClick={applyPromo} className="h-10 rounded-lg bg-white/10 text-white font-bold px-3">
                      Apply
                    </Button>
                  </div>
                  {promoCode && (
                    <p className="text-[9px] text-emerald-400 font-bold">
                      Code <strong>{promoCode}</strong> is active! (50% or 20% discount applied)
                    </p>
                  )}
                </div>

                <Button
                  onClick={() => {
                    setBillingName(data.organization.name || "");
                    setBillingEmail(data.organization.billing_email || "");
                    setCheckoutOpen(true);
                  }}
                  className="w-full h-12 rounded-xl bg-[var(--pri)] hover:opacity-90 text-[var(--color-text-inverse)] font-black uppercase tracking-widest text-[11px] shadow-lg shadow-[var(--pri)]/10 transition-all mt-4 active:scale-95"
                >
                  Proceed to Checkout
                </Button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Integrated Checkout Wizard */}
      <Dialog open={checkoutOpen} onOpenChange={setCheckoutOpen}>
        <DialogContent className="max-w-2xl border-white/10 bg-[#0e0e14]/95 backdrop-blur-xl text-white rounded-3xl p-6 relative overflow-hidden select-none max-h-[90vh] overflow-y-auto">
          <div className="absolute top-0 right-0 h-32 w-32 bg-[var(--pri)]/10 blur-3xl rounded-full" />

          {processingState === null ? (
            <>
              <DialogHeader>
                <DialogTitle className="text-base font-black tracking-tight flex items-center gap-2 text-white">
                  <CreditCard className="w-5 h-5 text-[var(--color-primary-mid)]" />
                  Subscription Sandbox Checkout
                </DialogTitle>
                <p className="text-xs text-white/40 font-medium">
                  Provide billing context to generate your tax invoice and authorize entitlements.
                </p>
              </DialogHeader>

              <form onSubmit={handleCheckout} className="grid md:grid-cols-2 gap-6 pt-4">
                {/* Billing Details & Invoice info */}
                <div className="space-y-3.5">
                  <h5 className="text-[10px] font-black uppercase tracking-widest text-white/50 border-b border-white/5 pb-1 flex items-center gap-1.5">
                    <Receipt className="w-3.5 h-3.5 text-[var(--color-primary-mid)]" />
                    Invoice Contact & Tax Details
                  </h5>

                  <div>
                    <label className="text-[9px] font-bold uppercase tracking-widest text-white/40 block mb-1">Company / Billing Name</label>
                    <input
                      type="text"
                      required
                      placeholder="Organization Name"
                      value={billingName}
                      onChange={(e) => setBillingName(e.target.value)}
                      className="w-full h-10 rounded-xl bg-white/5 border border-white/10 px-3.5 text-xs text-white focus:outline-none focus:border-[var(--pri)]/40 transition-all font-bold"
                    />
                  </div>

                  <div>
                    <label className="text-[9px] font-bold uppercase tracking-widest text-white/40 block mb-1">Billing Email Address</label>
                    <input
                      type="email"
                      required
                      placeholder="billing@company.com"
                      value={billingEmail}
                      onChange={(e) => setBillingEmail(e.target.value)}
                      className="w-full h-10 rounded-xl bg-white/5 border border-white/10 px-3.5 text-xs text-white focus:outline-none focus:border-[var(--pri)]/40 transition-all font-bold"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-[9px] font-bold uppercase tracking-widest text-white/40 block mb-1">Phone Number</label>
                      <input
                        type="text"
                        required
                        placeholder="+91 9999999999"
                        value={billingPhone}
                        onChange={(e) => setBillingPhone(e.target.value)}
                        className="w-full h-10 rounded-xl bg-white/5 border border-white/10 px-3.5 text-xs text-white focus:outline-none focus:border-[var(--pri)]/40 transition-all font-bold"
                      />
                    </div>
                    <div>
                      <label className="text-[9px] font-bold uppercase tracking-widest text-white/40 block mb-1">GSTIN (Optional)</label>
                      <input
                        type="text"
                        placeholder="27AAPCS1081F1Z1"
                        maxLength={15}
                        value={gstNumber}
                        onChange={(e) => setGstNumber(e.target.value.toUpperCase())}
                        className="w-full h-10 rounded-xl bg-white/5 border border-white/10 px-3.5 text-xs text-white focus:outline-none focus:border-[var(--pri)]/40 transition-all font-mono font-bold tracking-wider"
                      />
                    </div>
                  </div>

                  {/* Total price indicator on checkout */}
                  <div className="p-3.5 rounded-2xl bg-white/5 border border-white/5 space-y-1">
                    <div className="flex justify-between items-center text-[10px] text-white/50 font-bold uppercase">
                      <span>Mock Escrow Due</span>
                      <span>â‚¹{Number(priceDetails?.total || 0).toLocaleString()}</span>
                    </div>
                    <p className="text-[8px] text-white/35 font-medium leading-normal">
                      Includes plan base, custom limits, and {selectedAddons.length} addons. Promo discount applied.
                    </p>
                  </div>
                </div>

                {/* Credit card form & 3D Flipping animation */}
                <div className="space-y-4">
                  <h5 className="text-[10px] font-black uppercase tracking-widest text-white/50 border-b border-white/5 pb-1 flex items-center gap-1.5">
                    <CreditCard className="w-3.5 h-3.5 text-[var(--color-primary-mid)]" />
                    Sandbox Card Details
                  </h5>

                  <div className="flex flex-col justify-center items-center">
                    <div className="relative w-full h-[140px] perspective-1000 select-none">
                      <motion.div
                        animate={{ rotateY: isFlipped ? 180 : 0 }}
                        transition={{ duration: 0.6 }}
                        className="relative w-full h-full preserve-3d"
                        style={{ transformStyle: "preserve-3d" }}
                      >
                        {/* Front */}
                        <div
                          className="absolute inset-0 w-full h-full rounded-2xl p-4 bg-gradient-to-br from-zinc-800 to-neutral-950 border border-[var(--pri)]/20 shadow-xl flex flex-col justify-between"
                          style={{ backfaceVisibility: "hidden" }}
                        >
                          <div className="flex justify-between items-start">
                            <div>
                              <p className="text-[6px] uppercase tracking-wider text-white/44 font-bold">EventOS Billing Platform</p>
                              <h5 className="text-[9px] font-black text-white mt-0.5 tracking-tight uppercase">
                                {isCustom ? "Custom Entitlements" : selectedPlan?.name}
                              </h5>
                            </div>
                            <span className="text-[9px] font-bold text-white/80 bg-white/10 px-2 py-0.5 rounded">EOS</span>
                          </div>

                          <p className="text-sm font-mono tracking-widest font-black text-white/90 truncate my-2">
                            {cardNo || "â€¢â€¢â€¢â€¢ â€¢â€¢â€¢â€¢ â€¢â€¢â€¢â€¢ â€¢â€¢â€¢â€¢"}
                          </p>

                          <div className="flex justify-between items-end text-[7px] font-bold uppercase tracking-wider text-white/50">
                            <div className="max-w-[140px] truncate">
                              <p className="text-[5px] text-white/30">Cardholder</p>
                              <p className="text-white truncate font-black">{cardholder || "YOUR FULL NAME"}</p>
                            </div>
                            <div>
                              <p className="text-[5px] text-white/30">Expiry</p>
                              <p className="text-white font-black">{expiry || "MM/YY"}</p>
                            </div>
                          </div>
                        </div>

                        {/* Back */}
                        <div
                          className="absolute inset-0 w-full h-full rounded-2xl bg-[#121118] border border-white/10 shadow-xl flex flex-col justify-between py-3"
                          style={{ backfaceVisibility: "hidden", transform: "rotateY(180deg)" }}
                        >
                          <div className="w-full h-6 bg-black mt-1" />
                          <div className="px-4 flex justify-between items-center">
                            <span className="text-[6px] text-white/30 font-bold uppercase">Authorized Sandbox Signature</span>
                            <div className="h-6 bg-white text-black font-mono font-black text-xs rounded px-2.5 flex items-center justify-center min-w-[36px]">
                              {cvv || "â€¢â€¢â€¢"}
                            </div>
                          </div>
                          <p className="text-[6px] text-white/20 font-bold text-center leading-tight px-4">
                            Dummy transaction portal. No actual financial operations occur.
                          </p>
                        </div>
                      </motion.div>
                    </div>
                  </div>

                  {/* Card fields input */}
                  <div className="space-y-3">
                    <div>
                      <label className="text-[9px] font-bold uppercase tracking-widest text-white/40 block mb-1">Card Holder Name</label>
                      <input
                        type="text"
                        required
                        placeholder="John Doe"
                        value={cardholder}
                        onChange={(e) => setCardholder(e.target.value)}
                        onFocus={() => setIsFlipped(false)}
                        className="w-full h-9 rounded-xl bg-white/5 border border-white/10 px-3.5 text-xs text-white focus:outline-none focus:border-[var(--pri)]/40 transition-all font-semibold"
                      />
                    </div>

                    <div>
                      <label className="text-[9px] font-bold uppercase tracking-widest text-white/40 block mb-1">Card Number</label>
                      <input
                        type="text"
                        required
                        placeholder="4000 1234 5678 9010"
                        value={cardNo}
                        onChange={handleCardNoChange}
                        onFocus={() => setIsFlipped(false)}
                        className="w-full h-9 rounded-xl bg-white/5 border border-white/10 px-3.5 text-xs text-white font-mono focus:outline-none focus:border-[var(--pri)]/40 transition-all"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-[9px] font-bold uppercase tracking-widest text-white/40 block mb-1">Expiry Date</label>
                        <input
                          type="text"
                          required
                          placeholder="MM/YY"
                          value={expiry}
                          onChange={handleExpiryChange}
                          onFocus={() => setIsFlipped(false)}
                          className="w-full h-9 rounded-xl bg-white/5 border border-white/10 px-3.5 text-xs text-white font-mono focus:outline-none focus:border-[var(--pri)]/40 transition-all text-center"
                        />
                      </div>
                      <div>
                        <label className="text-[9px] font-bold uppercase tracking-widest text-white/40 block mb-1">CVV</label>
                        <input
                          type="password"
                          required
                          placeholder="â€¢â€¢â€¢"
                          value={cvv}
                          onChange={handleCvvChange}
                          onFocus={() => setIsFlipped(true)}
                          onBlur={() => setIsFlipped(false)}
                          className="w-full h-9 rounded-xl bg-white/5 border border-white/10 px-3.5 text-xs text-white font-mono focus:outline-none focus:border-[var(--pri)]/40 transition-all text-center"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="flex gap-3 pt-2">
                    <button
                      type="button"
                      onClick={() => setCheckoutOpen(false)}
                      className="flex-1 h-10 rounded-xl border border-white/10 text-xs text-white/40 hover:text-white font-bold transition-all"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="flex-1 h-10 rounded-xl bg-[var(--pri)] hover:opacity-90 text-[var(--color-text-inverse)] text-xs font-black uppercase tracking-wider shadow-lg shadow-[var(--pri)]/10 active:scale-95 transition-all"
                    >
                      Authorize Sandbox
                    </button>
                  </div>
                </div>
              </form>
            </>
          ) : successDetails === null ? (
            /* Processing Escrow Loading Loop */
            <div className="flex flex-col items-center justify-center py-16 space-y-6 text-center min-h-[300px]">
              <div className="relative w-14 h-14 flex items-center justify-center">
                <div className="absolute inset-0 bg-[var(--pri)]/10 blur-xl rounded-full animate-pulse" />
                <Loader2 className="w-8 h-8 text-[var(--color-primary-mid)] animate-spin" />
              </div>
              <div className="space-y-2 max-w-sm">
                <h4 className="text-sm font-bold text-white tracking-tight">Authorizing Escrow Handshake</h4>
                <p className="text-[10px] text-white/40 font-mono animate-pulse">{processingMessage}</p>
              </div>
            </div>
          ) : (
            /* Dummy Transaction Success / Finalization Screen */
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: "spring", stiffness: 200, damping: 20 }}
              className="flex flex-col items-center justify-center py-6 text-center space-y-6 min-h-[350px]"
            >
              <div className="w-14 h-14 rounded-full bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 animate-bounce">
                <CheckCircle2 className="w-7 h-7" />
              </div>

              <div className="space-y-1.5">
                <h4 className="text-lg font-black tracking-tight text-white font-black">Payment Success & Entitled</h4>
                <p className="text-[10px] text-emerald-400 font-black uppercase tracking-widest">
                  Transaction Authorized Â· Workspace limits synchronized
                </p>
              </div>

              {/* Receipt Preview */}
              <div className="w-full max-w-sm rounded-2xl border border-white/5 bg-white/[0.02] p-5 space-y-3.5 text-left text-xs font-bold relative">
                <div className="absolute top-0 right-0 h-24 w-24 bg-emerald-500/5 blur-2xl rounded-full" />
                <div className="flex justify-between border-b border-white/5 pb-2">
                  <span className="text-white/40 font-bold uppercase tracking-wider text-[9px]">Receipt Details</span>
                  <span className="text-white/40 font-bold uppercase tracking-wider text-[9px] font-mono">{successDetails.invoice_no}</span>
                </div>

                <div className="space-y-2">
                  <div className="flex justify-between">
                    <span className="text-white/55 font-semibold">Plan Entitled:</span>
                    <span className="text-white capitalize">{successDetails.plan_name}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-white/55 font-semibold">Billed Name:</span>
                    <span className="text-white">{billingName}</span>
                  </div>
                  {gstNumber && (
                    <div className="flex justify-between">
                      <span className="text-white/55 font-semibold">GSTIN Applied:</span>
                      <span className="text-white font-mono">{gstNumber}</span>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <span className="text-white/55 font-semibold">Transaction ID:</span>
                    <span className="text-white/80 font-mono text-[10px] break-all">{successDetails.transaction_id}</span>
                  </div>
                  <div className="flex justify-between border-t border-white/5 pt-2.5 items-baseline">
                    <span className="text-white/55 font-semibold">Total Settled (INR):</span>
                    <span className="text-base font-black text-white">â‚¹{Number(successDetails.amount_paid).toLocaleString()}</span>
                  </div>
                </div>
              </div>

              <Button
                onClick={() => {
                  setCheckoutOpen(false);
                  setProcessingState(null);
                  setSuccessDetails(null);
                  setActiveView("usage");
                }}
                className="w-full max-w-xs h-11 rounded-xl bg-[var(--pri)] hover:opacity-90 text-[var(--color-text-inverse)] font-black uppercase tracking-widest text-[10px] shadow-lg transition-all active:scale-95"
              >
                Go to Dashboard
              </Button>
            </motion.div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function PlatformEdit({ org, reason, setReason, onSaved }: { org: Organization; reason: string; setReason: (value: string) => void; onSaved: () => void }) {
  const [form, setForm] = useState({ plan: org.plan, max_events: org.max_events, max_users: org.max_users, max_storage_gb: org.max_storage_gb, is_active: org.is_active });
  const save = async () => { await orgApi.platformUpdate(org.id, { ...form, suspension_reason: reason }); toast.success("Organisation updated."); onSaved(); };
  return <div className="space-y-4"><Select value={form.plan} onValueChange={(plan: any) => setForm({ ...form, plan })}><SelectTrigger className="h-12 rounded-xl bg-white/5 border-default"><SelectValue /></SelectTrigger><SelectContent>{["trial", "starter", "pro", "enterprise"].map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent></Select><div className="grid grid-cols-3 gap-3"><Input type="number" value={form.max_events} onChange={(e) => setForm({ ...form, max_events: Number(e.target.value) })} className="h-12 rounded-xl bg-white/5 border-default" /><Input type="number" value={form.max_users} onChange={(e) => setForm({ ...form, max_users: Number(e.target.value) })} className="h-12 rounded-xl bg-white/5 border-default" /><Input type="number" value={form.max_storage_gb} onChange={(e) => setForm({ ...form, max_storage_gb: Number(e.target.value) })} className="h-12 rounded-xl bg-white/5 border-default" /></div><Textarea placeholder="Suspension reason" value={reason} onChange={(e) => setReason(e.target.value)} className="rounded-xl bg-white/5 border-default" /><Button onClick={save} className="h-12 rounded-xl bg-[var(--pri)]">Save</Button></div>;
}

function BrandFields({ brand, setBrand }: { brand: { logo_url: string; primary_color: string; secondary_color: string }; setBrand: (value: { logo_url: string; primary_color: string; secondary_color: string }) => void }) {
  return <div className="grid gap-4 md:grid-cols-2"><Field label="Logo URL"><Input value={brand.logo_url} onChange={(e) => setBrand({ ...brand, logo_url: e.target.value })} className="h-12 rounded-xl bg-white/5 border-default" /></Field><Field label="Primary Colour"><ColorInput value={brand.primary_color} onChange={(primary_color) => setBrand({ ...brand, primary_color })} /></Field><Field label="Secondary Colour"><ColorInput value={brand.secondary_color} onChange={(secondary_color) => setBrand({ ...brand, secondary_color })} /></Field></div>;
}

function ColorInput({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return <div className="flex gap-2"><Input type="color" value={value} onChange={(e) => onChange(e.target.value)} className="h-12 w-14 rounded-xl bg-white/5 border-default p-1" /><Input value={value} onChange={(e) => onChange(e.target.value)} className="h-12 rounded-xl bg-white/5 border-default" /></div>;
}

function RoleSelect({ value, onChange }: { value: OrgRole; onChange: (value: OrgRole) => void }) {
  return <Select value={value} onValueChange={(value) => onChange(value as OrgRole)}><SelectTrigger className="h-12 rounded-xl bg-white/5 border-default"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="admin">Admin</SelectItem><SelectItem value="member">Member</SelectItem><SelectItem value="billing_only">Billing Only</SelectItem></SelectContent></Select>;
}

function PageTitle({ icon: Icon, title, subtitle }: { icon: any; title: string; subtitle: string }) {
  return <div className="flex items-center gap-3"><div className="h-12 w-12 rounded-2xl bg-[var(--pri)]/10 text-[var(--pri)] flex items-center justify-center"><Icon className="h-5 w-5" /></div><div><h1 className="text-2xl font-black tracking-tighter">{title}</h1><p className="text-sm text-muted">{subtitle}</p></div></div>;
}

function Stack({ title, icon: Icon, children }: { title: string; icon: any; children: React.ReactNode }) {
  return <div className="space-y-6"><PageTitle icon={Icon} title={title} subtitle="Complete this step to shape the workspace." />{children}</div>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block"><span className="mb-2 block text-[10px] font-black uppercase tracking-[0.2em] text-muted">{label}</span>{children}</label>;
}

function FormGrid({ children }: { children: React.ReactNode }) {
  return <div className="grid gap-5 md:grid-cols-2 max-w-4xl">{children}</div>;
}

function PlanBadge({ plan }: { plan: string }) {
  const color = plan === "enterprise" ? "bg-fuchsia-500/20 text-fuchsia-300" : plan === "pro" ? "bg-[var(--pri)]/20 text-[var(--pri)]" : plan === "starter" ? "bg-cyan-500/20 text-cyan-300" : "bg-amber-500/20 text-amber-300";
  return <Badge className={cn("capitalize", color)}>{plan}</Badge>;
}

function UsageBar({ label, value, max }: { label: string; value: number; max: number }) {
  const pct = Math.min(100, max ? (value / max) * 100 : 0);
  return <div className="space-y-2"><div className="flex justify-between text-xs font-black uppercase tracking-widest text-muted"><span>{label}</span><span>{Math.round(pct)}%</span></div><div className="h-2 rounded-full bg-white/10 overflow-hidden"><div className={cn("h-full rounded-full", usageTone(value, max))} style={{ width: `${pct}%` }} /></div></div>;
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="rounded-2xl border border-default bg-white/[0.04] p-5"><p className="text-[10px] font-black uppercase tracking-widest text-muted">{label}</p><p className="mt-3 text-3xl font-black tracking-tighter">{value}</p></div>;
}

function InfoBlock({ title, items }: { title: string; items: string[] }) {
  return <div className="rounded-2xl border border-default p-4"><h3 className="mb-3 font-black">{title}</h3>{items.length ? items.map((item) => <p key={item} className="border-t border-default py-2 text-sm text-muted">{item}</p>) : <p className="text-sm text-muted">No records</p>}</div>;
}

function LoadingSurface() {
  return <div className="flex min-h-[420px] items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-[var(--pri)]" /></div>;
}
