"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { 
  X, Calendar, MapPin, Tag, Plus, Sparkles, Loader2, Hash, Globe, Mail, Phone, Users, 
  BadgeCheck, Building2, Check, ChevronRight, CreditCard, Info, Percent, Receipt, Sliders, 
  CheckCircle2, ArrowLeft, Coins, Lock 
} from "lucide-react";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Switch } from "../ui/switch";
import { useCreateEvent, useUpdateEvent } from "@/hooks/useEvents";
import { cn } from "@/lib/utils";
import { EventSummary } from "@/types/backend";
import { CountryStateEntry, fetchCountryStates, getStatesForCountry } from "@/lib/country-states";
import { orgApi } from "@/components/organizer/org/org-api";
import { toast } from "sonner";

interface CreateEventDialogProps {
  isOpen: boolean;
  onClose: () => void;
  eventToEdit?: EventSummary | null;
}

export function CreateEventDialog({ isOpen, onClose, eventToEdit }: CreateEventDialogProps) {
  const createEvent = useCreateEvent();
  const updateEvent = useUpdateEvent(eventToEdit?.id || "");
  const [loading, setLoading] = useState(false);
  const [globalTimezone, setGlobalTimezone] = useState("Asia/Kolkata");

  // Step state: 0=Event Details, 1=Plan Selection, 2=Add-ons, 3=Sandbox Checkout, 4=Success
  const [step, setStep] = useState(0);
  const isEditing = !!eventToEdit;

  // DB Billing context
  const [plans, setPlans] = useState<any[]>([]);
  const [addons, setAddons] = useState<any[]>([]);
  const [loadingConfig, setLoadingConfig] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState<any | null>(null);
  const [selectedAddons, setSelectedAddons] = useState<string[]>([]);
  const [priceDetails, setPriceDetails] = useState<any | null>(null);
  const [calculating, setCalculating] = useState(false);

  // Billing Form Details
  const [billingName, setBillingName] = useState("");
  const [billingEmail, setBillingEmail] = useState("");
  const [billingPhone, setBillingPhone] = useState("");
  const [gstNumber, setGstNumber] = useState("");

  // Sandbox Card Details
  const [cardholder, setCardholder] = useState("");
  const [cardNo, setCardNo] = useState("");
  const [expiry, setExpiry] = useState("");
  const [cvv, setCvv] = useState("");
  const [isFlipped, setIsFlipped] = useState(false);
  const [processingState, setProcessingState] = useState<number | null>(null);
  const [successDetails, setSuccessDetails] = useState<any | null>(null);

  const processingMessages = [
    "Verifying available workspace limits...",
    "Registering high-priority callback events...",
    "Securing sandbox payment gateway...",
    "Syncing tenant plan overrides...",
  ];

  const [formData, setFormData] = useState({
    name: "",
    short_code: "",
    location: "",
    venue_name: "",
    country: "",
    state: "",
    organizer_details: {
      name: "",
      email: "",
      phone: "",
      website: ""
    },
    start_date: "",
    end_date: "",
    timezone: "Asia/Kolkata",
    status: "draft" as const,
    speaker_settings: { enabled: true, window_required: true },
    registration_settings: { enabled: true, registration_allowed: true, participants_list_allowed: true }
  });

  const [countryStates, setCountryStates] = useState<CountryStateEntry[]>([]);

  useEffect(() => {
    fetchCountryStates().then(setCountryStates).catch(console.error);

    // Fetch global timezone
    const apiBase = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";
    fetch(`${apiBase}/api/v1/global-settings`, {
      headers: {
        'Authorization': `Bearer ${localStorage.getItem("accessToken") || ""}`
      }
    })
      .then(res => {
        if (res.ok) return res.json();
        throw new Error();
      })
      .then(data => {
        if (data && data.timezone) {
          setGlobalTimezone(data.timezone);
          if (!eventToEdit) {
            setFormData(prev => ({ ...prev, timezone: data.timezone }));
          }
        }
      })
      .catch(() => {});
  }, [eventToEdit]);

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [isOpen]);

  useEffect(() => {
    if (eventToEdit && isOpen) {
      const details = (eventToEdit as any).organizer_details || { name: "", email: "", phone: "", website: "" };
      const speakerSettings = (eventToEdit as any).speaker_settings || { enabled: true, window_required: true };
      const registrationSettings = (eventToEdit as any).registration_settings || { enabled: true, registration_allowed: true, participants_list_allowed: true };
      setFormData({
        name: eventToEdit.name,
        short_code: eventToEdit.short_code,
        location: eventToEdit.location || "",
        venue_name: eventToEdit.venue_name || "",
        country: (eventToEdit as any).country || "",
        state: (eventToEdit as any).state || "",
        organizer_details: {
          name: details.name || eventToEdit.organizer_name || "",
          email: details.email || "",
          phone: details.phone || "",
          website: details.website || ""
        },
        start_date: eventToEdit.start_date ? new Date(eventToEdit.start_date).toISOString().split('T')[0] : "",
        end_date: eventToEdit.end_date ? new Date(eventToEdit.end_date).toISOString().split('T')[0] : "",
        timezone: (eventToEdit as any).timezone || globalTimezone,
        status: eventToEdit.status as any,
        speaker_settings: { enabled: speakerSettings.enabled ?? true, window_required: speakerSettings.window_required ?? true },
        registration_settings: { enabled: registrationSettings.enabled ?? true, registration_allowed: registrationSettings.registration_allowed ?? true, participants_list_allowed: registrationSettings.participants_list_allowed ?? true },
      });
    } else if (isOpen) {
      setFormData({
        name: "",
        short_code: "",
        location: "",
        venue_name: "",
        country: "",
        state: "",
        organizer_details: {
          name: "",
          email: "",
          phone: "",
          website: ""
        },
        start_date: "",
        end_date: "",
        timezone: globalTimezone,
        status: "draft",
        speaker_settings: { enabled: true, window_required: true },
        registration_settings: { enabled: true, registration_allowed: true, participants_list_allowed: true },
      });
    }
  }, [eventToEdit, isOpen, globalTimezone]);

  useEffect(() => {
    if (isOpen) {
      setStep(0);
      setSuccessDetails(null);
      setProcessingState(null);
      setCardholder("");
      setCardNo("");
      setExpiry("");
      setCvv("");
      setSelectedAddons([]);
      if (!isEditing) {
        setLoadingConfig(true);
        Promise.all([orgApi.me(), orgApi.plans(), orgApi.addons()])
          .then(([meRes, plansRes, addonsRes]) => {
            setPlans(plansRes);
            setAddons(addonsRes);
            setBillingName(meRes.organization.name || "");
            setBillingEmail(meRes.organization.billing_email || "");
            
            // Pre-select plan if they have one
            const currentPlan = plansRes.find(p => p.name.toLowerCase() === meRes.organization.plan.toLowerCase());
            setSelectedPlan(currentPlan || plansRes[0]);
          })
          .catch(err => {
            console.error("Failed to load plans/addons in dialog:", err);
          })
          .finally(() => setLoadingConfig(false));
      }
    }
  }, [isOpen, isEditing]);

  useEffect(() => {
    if (isEditing || !selectedPlan) return;
    setCalculating(true);
    orgApi.calculatePrice({
      plan_name: selectedPlan.name,
      is_custom: false,
      custom_limits: null,
      addon_keys: selectedAddons,
      promo_code: null
    })
      .then(res => setPriceDetails(res))
      .catch(err => console.error("Failed to calculate price in dialog:", err))
      .finally(() => setCalculating(false));
  }, [selectedPlan, selectedAddons, isEditing]);

  const isVenueOps = (key: string) => {
    return key === "ADDON_VENUE_READY_ROOM" || key === "ADDON_ONSITE_TECH";
  };

  const hasVenueOpsSelected = selectedAddons.some(isVenueOps);

  const handleSubmit = async (e: React.FormEvent) => {
    if (e) e.preventDefault();
    setLoading(true);
    try {
      if (isEditing) {
        await updateEvent.mutateAsync(formData);
        onClose();
      } else {
        // Proceed to Plan Selection Step
        setStep(1);
      }
    } catch (error) {
      console.error("Failed to save event details:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleCheckoutSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!billingName || !billingEmail || !billingPhone) {
      toast.error("Please fill in all invoice contact details.");
      return;
    }
    if (!cardholder || !cardNo || !expiry || !cvv) {
      toast.error("Please fill in all sandbox card details.");
      return;
    }

    setProcessingState(0);
    const timers: NodeJS.Timeout[] = [];
    for (let i = 1; i <= 4; i++) {
      const t = setTimeout(async () => {
        setProcessingState(i);
        if (i === 4) {
          try {
            // 1. Subscribe organization to the selected plan and addons
            const subRes = await orgApi.subscribe({
              plan_name: selectedPlan.name,
              is_custom: false,
              custom_limits: null,
              addon_keys: selectedAddons,
              promo_code: null,
              billing_name: billingName,
              billing_email: billingEmail,
              billing_phone: billingPhone,
              gst_number: gstNumber || null,
              cardholder_name: cardholder,
              card_number: cardNo,
              expiry: expiry,
              cvv: cvv,
            });

            // 2. Create the Event
            const eventRes = await createEvent.mutateAsync(formData);

            setSuccessDetails({
              transaction_id: subRes.transaction_id,
              amount_paid: subRes.amount_paid,
              plan_name: selectedPlan.name,
              invoice_no: `INV-${subRes.transaction_id.slice(0, 8).toUpperCase()}`,
              event_name: formData.name
            });
            toast.success("Billing plan activated and event created successfully!");
            setStep(4);
          } catch (err: any) {
            toast.error(err.message || "Failed to finalize subscription and event.");
            setProcessingState(null);
          }
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
      formatted = `${raw.slice(0, 2)}/${raw.slice(2, 4)}`;
    }
    setExpiry(formatted.slice(0, 5));
  };

  const handleCvvChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value.replace(/\D/g, "");
    setCvv(raw.slice(0, 3));
  };

  const getHeaderTitle = () => {
    if (isEditing) return "Edit Event";
    if (step === 0) return "Step 1 of 4: Event Details";
    if (step === 1) return "Step 2 of 4: Select Plan Pool";
    if (step === 2) return "Step 3 of 4: Select Add-ons";
    if (step === 3) return "Step 4 of 4: Sandbox Checkout";
    return "Transaction Success!";
  };

  const getHeaderSubtitle = () => {
    if (isEditing) return "Update event details";
    if (step === 0) return "Specify name, dates, location, and coordinator settings";
    if (step === 1) return "Choose the subscription tier for your workspace event";
    if (step === 2) return "Add optional modules or skip to purchase later";
    if (step === 3) return "Authorize payment details to finalize your event";
    return "Your event has been created and plan entitlements are active";
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-[var(--base)]/80 backdrop-blur-md z-[200]"
          />

          {/* Dialog Container */}
          <div className="fixed inset-0 flex items-center justify-center z-[210] pointer-events-none p-4 md:p-8">
            <motion.div
              initial={{ scale: 0.95, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 20 }}
              className="w-full max-w-5xl glass-3d rounded-[3rem] border-default shadow-2xl pointer-events-auto flex flex-col h-full max-h-[95vh] overflow-hidden"
            >
              {/* Header */}
              <div className="p-8 border-b border-default flex-shrink-0">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="h-12 w-12 rounded-2xl bg-[var(--pri)]/10 flex items-center justify-center">
                      <Plus className="h-6 w-6 text-[var(--pri)]" />
                    </div>
                    <div>
                      <h3 className="text-xl font-black text-[var(--text)] tracking-tight">
                        {getHeaderTitle()}
                      </h3>
                      <p className="text-[11px] font-bold text-muted uppercase tracking-widest mt-0.5">
                        {getHeaderSubtitle()}
                      </p>
                    </div>
                  </div>
                  <button onClick={onClose} className="h-10 w-10 rounded-full border border-default flex items-center justify-center text-muted hover:text-[var(--text)] transition-all hover:rotate-90">
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </div>

              {/* Loader Surface */}
              {loadingConfig ? (
                <div className="flex-1 flex flex-col items-center justify-center space-y-3">
                  <Loader2 className="w-8 h-8 text-[var(--pri)] animate-spin" />
                  <p className="text-xs text-white/40 font-bold tracking-tight">Syncing available catalog rates...</p>
                </div>
              ) : (
                /* Step content */
                <div className="flex-1 overflow-y-auto p-8 no-scrollbar">
                  {step === 0 && (
                    <form onSubmit={handleSubmit} className="space-y-8">
                      <div className="space-y-2">
                        <label className="text-[9px] font-black text-muted uppercase tracking-widest ml-1">Event Name *</label>
                        <div className="relative">
                          <Sparkles className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted" />
                          <Input
                            required
                            value={formData.name}
                            onChange={e => setFormData({ ...formData, name: e.target.value })}
                            placeholder="e.g. Global Tech Summit 2026"
                            className="h-12 glass-3d border-default pl-12 text-[13px] font-bold text-[var(--text)]"
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-6">
                        <div className="space-y-2">
                          <label className="text-[9px] font-black text-muted uppercase tracking-widest ml-1">Short Code *</label>
                          <div className="relative">
                            <Hash className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted" />
                            <Input
                              required
                              value={formData.short_code}
                              onChange={e => setFormData({ ...formData, short_code: e.target.value.toUpperCase() })}
                              placeholder="GTS26"
                              maxLength={10}
                              className="h-12 glass-3d border-default pl-12 text-[13px] font-bold text-[var(--text)] font-mono"
                            />
                          </div>
                        </div>
                        <div className="space-y-2">
                          <label className="text-[9px] font-black text-muted uppercase tracking-widest ml-1">Venue Center Name</label>
                          <div className="relative">
                            <Sparkles className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted" />
                            <Input
                              value={formData.venue_name}
                              onChange={e => setFormData({ ...formData, venue_name: e.target.value })}
                              placeholder="e.g. Grand Plaza Hotel"
                              className="h-12 glass-3d border-default pl-12 text-[13px] font-bold text-[var(--text)]"
                            />
                          </div>
                        </div>
                      </div>

                      <div className="grid grid-cols-3 gap-6">
                        <div className="space-y-2">
                          <label className="text-[9px] font-black text-muted uppercase tracking-widest ml-1">Country</label>
                          <div className="relative">
                            <Globe className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted pointer-events-none" />
                            <select
                              value={formData.country}
                              onChange={e => setFormData({ ...formData, country: e.target.value, state: "" })}
                              className="w-full h-12 glass-3d border border-default pl-12 pr-4 text-[13px] font-bold text-[var(--text)] bg-[var(--base)] rounded-xl outline-none focus:border-[var(--pri)]/50 transition-all appearance-none"
                            >
                              <option value="" disabled className="bg-[var(--base)] text-muted">Select Country</option>
                              {countryStates.map(c => (
                                <option key={c.country} value={c.country} className="bg-[var(--base)] text-[var(--text)]">{c.country}</option>
                              ))}
                            </select>
                          </div>
                        </div>
                        <div className="space-y-2">
                          <label className="text-[9px] font-black text-muted uppercase tracking-widest ml-1">State / Province</label>
                          <div className="relative">
                            <MapPin className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted pointer-events-none" />
                            <select
                              value={formData.state}
                              onChange={e => setFormData({ ...formData, state: e.target.value })}
                              disabled={!formData.country}
                              className="w-full h-12 glass-3d border border-default pl-12 pr-4 text-[13px] font-bold text-[var(--text)] bg-[var(--base)] rounded-xl outline-none focus:border-[var(--pri)]/50 transition-all appearance-none disabled:opacity-50"
                            >
                              <option value="" className="bg-[var(--base)] text-muted">Select State</option>
                              {getStatesForCountry(countryStates, formData.country).map(s => (
                                <option key={s} value={s} className="bg-[var(--base)] text-[var(--text)]">{s}</option>
                              ))}
                            </select>
                          </div>
                        </div>
                        <div className="space-y-2">
                          <label className="text-[9px] font-black text-muted uppercase tracking-widest ml-1">Street / City Details</label>
                          <div className="relative">
                            <MapPin className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted" />
                            <Input
                              value={formData.location}
                              onChange={e => setFormData({ ...formData, location: e.target.value })}
                              placeholder="e.g. 5th Avenue, California"
                              className="h-12 glass-3d border-default pl-12 text-[13px] font-bold text-[var(--text)]"
                            />
                          </div>
                        </div>
                      </div>

                      {/* Organizer Contact Info */}
                      <div className="glass-3d p-6 rounded-[2rem] border-default space-y-6">
                        <div>
                          <h4 className="text-[12px] font-black text-[var(--text)] uppercase tracking-wider">Organizer Contact Info</h4>
                          <p className="text-muted text-[10px] font-bold uppercase tracking-widest mt-0.5">Specify organizer details and public contact channels.</p>
                        </div>

                        <div className="grid grid-cols-2 gap-6">
                          <div className="space-y-2">
                            <label className="text-[9px] font-black text-muted uppercase tracking-widest ml-1">Organizer Name</label>
                            <div className="relative">
                              <Users className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted" />
                              <Input
                                value={formData.organizer_details.name}
                                onChange={e => setFormData({
                                  ...formData,
                                  organizer_details: { ...formData.organizer_details, name: e.target.value }
                                })}
                                placeholder="e.g. Tech Solutions Inc."
                                className="h-12 glass-3d border-default pl-12 text-[13px] font-bold text-[var(--text)]"
                              />
                            </div>
                          </div>
                          <div className="space-y-2">
                            <label className="text-[9px] font-black text-muted uppercase tracking-widest ml-1">Organizer Email</label>
                            <div className="relative">
                              <Mail className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted" />
                              <Input
                                type="email"
                                value={formData.organizer_details.email}
                                onChange={e => setFormData({
                                  ...formData,
                                  organizer_details: { ...formData.organizer_details, email: e.target.value }
                                })}
                                placeholder="org@example.com"
                                className="h-12 glass-3d border-default pl-12 text-[13px] font-bold text-[var(--text)]"
                              />
                            </div>
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-6">
                          <div className="space-y-2">
                            <label className="text-[9px] font-black text-muted uppercase tracking-widest ml-1">Organizer Phone</label>
                            <div className="relative">
                              <Phone className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted" />
                              <Input
                                value={formData.organizer_details.phone}
                                onChange={e => setFormData({
                                  ...formData,
                                  organizer_details: { ...formData.organizer_details, phone: e.target.value }
                                })}
                                placeholder="+1 555 1234"
                                className="h-12 glass-3d border-default pl-12 text-[13px] font-bold text-[var(--text)]"
                              />
                            </div>
                          </div>
                          <div className="space-y-2">
                            <label className="text-[9px] font-black text-muted uppercase tracking-widest ml-1">Organizer Website</label>
                            <div className="relative">
                              <Globe className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted" />
                              <Input
                                value={formData.organizer_details.website}
                                onChange={e => setFormData({
                                  ...formData,
                                  organizer_details: { ...formData.organizer_details, website: e.target.value }
                                })}
                                placeholder="www.organizer.com"
                                className="h-12 glass-3d border-default pl-12 text-[13px] font-bold text-[var(--text)]"
                              />
                            </div>
                          </div>
                        </div>
                      </div>

                      <div className="grid grid-cols-3 gap-6">
                        <div className="space-y-2">
                          <label className="text-[9px] font-black text-muted uppercase tracking-widest ml-1">Start Date *</label>
                          <div className="relative">
                            <Calendar className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted" />
                            <Input
                              required
                              type="date"
                              value={formData.start_date}
                              onChange={e => setFormData({ ...formData, start_date: e.target.value })}
                              className="h-12 glass-3d border-default pl-12 text-[13px] font-bold text-[var(--text)] [color-scheme:dark]"
                            />
                          </div>
                        </div>
                        <div className="space-y-2">
                          <label className="text-[9px] font-black text-muted uppercase tracking-widest ml-1">End Date *</label>
                          <div className="relative">
                            <Calendar className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted" />
                            <Input
                              required
                              type="date"
                              value={formData.end_date}
                              onChange={e => setFormData({ ...formData, end_date: e.target.value })}
                              className="h-12 glass-3d border-default pl-12 text-[13px] font-bold text-[var(--text)] [color-scheme:dark]"
                            />
                          </div>
                        </div>
                        <div className="space-y-2">
                          <label className="text-[9px] font-black text-muted uppercase tracking-widest ml-1">Event Timezone *</label>
                          <div className="relative">
                            <Globe className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted pointer-events-none" />
                            <select
                              required
                              value={formData.timezone}
                              onChange={e => setFormData({ ...formData, timezone: e.target.value })}
                              className="w-full h-12 glass-3d border border-default pl-12 pr-4 text-[13px] font-bold text-[var(--text)] bg-[var(--base)] rounded-xl outline-none focus:border-[var(--pri)]/50 transition-all cursor-pointer"
                            >
                              <option value="Asia/Kolkata">Asia/Kolkata (IST - UTC+05:30)</option>
                              <option value="UTC">UTC (Coordinated Universal Time - UTC+00:00)</option>
                              <option value="America/New_York">America/New_York (EST/EDT - UTC-05:00/04:00)</option>
                              <option value="America/Chicago">America/Chicago (CST/CDT - UTC-06:00/05:00)</option>
                              <option value="America/Denver">America/Denver (MST/MDT - UTC-07:00/06:00)</option>
                              <option value="America/Los_Angeles">America/Los_Angeles (PST/PDT - UTC-08:00/07:00)</option>
                              <option value="Europe/London">Europe/London (GMT/BST - UTC+00:00/01:00)</option>
                              <option value="Europe/Paris">Europe/Paris (CET/CEST - UTC+01:00/02:00)</option>
                              <option value="Asia/Singapore">Asia/Singapore (SGT - UTC+08:00)</option>
                              <option value="Asia/Tokyo">Asia/Tokyo (JST - UTC+09:00)</option>
                            </select>
                          </div>
                        </div>
                      </div>

                      {/* Event Features / Modes Switches */}
                      <div className="glass-3d p-6 rounded-[2rem] border-default space-y-6">
                        <div>
                          <h4 className="text-[12px] font-black text-[var(--text)] uppercase tracking-wider">Event Features & Modes</h4>
                          <p className="text-muted text-[10px] font-bold uppercase tracking-widest mt-0.5">Enable the modules required for this conference. At least one must be active.</p>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                          <div className="flex items-center justify-between p-5 rounded-2xl bg-white/5 border border-default/50 hover:border-[var(--pri)]/20 transition-all gap-4">
                            <div className="space-y-1">
                              <Label className="text-[12px] font-black text-[var(--text)] leading-none cursor-pointer" htmlFor="switch-speaker">Speaker Presentation Desk</Label>
                              <p className="text-muted text-[9px] font-bold uppercase tracking-wider leading-normal">Manage schedule, speakers, files & eposters</p>
                            </div>
                            <Switch
                              id="switch-speaker"
                              checked={formData.speaker_settings.enabled}
                              onCheckedChange={(checked) => {
                                if (!checked && !formData.registration_settings.enabled) return;
                                setFormData({ ...formData, speaker_settings: { ...formData.speaker_settings, enabled: checked } });
                              }}
                            />
                          </div>

                          <div className="flex items-center justify-between p-5 rounded-2xl bg-white/5 border border-default/50 hover:border-[var(--sec)]/20 transition-all gap-4">
                            <div className="space-y-1">
                              <Label className="text-[12px] font-black text-[var(--text)] leading-none cursor-pointer" htmlFor="switch-registration">On-Site Registration & Badges</Label>
                              <p className="text-muted text-[9px] font-bold uppercase tracking-wider leading-normal">Manage registrations, checkins & dynamic badge printing</p>
                            </div>
                            <Switch
                              id="switch-registration"
                              checked={formData.registration_settings.enabled}
                              onCheckedChange={(checked) => {
                                if (!checked && !formData.speaker_settings.enabled) return;
                                setFormData({ ...formData, registration_settings: { ...formData.registration_settings, enabled: checked } });
                              }}
                            />
                          </div>
                        </div>
                      </div>
                    </form>
                  )}

                  {step === 1 && (
                    <div className="space-y-6">
                      <div className="grid md:grid-cols-3 gap-5">
                        {plans.map(p => {
                          const isSelected = selectedPlan?.id === p.id;
                          return (
                            <div
                              key={p.id}
                              onClick={() => setSelectedPlan(p)}
                              className={cn(
                                "rounded-3xl border p-6 cursor-pointer transition-all flex flex-col justify-between group relative overflow-hidden select-none",
                                isSelected
                                  ? "bg-[var(--pri)]/10 border-[var(--pri)] shadow-[0_10px_35px_-10px_rgba(99,102,241,0.2)]"
                                  : "bg-white/3 border-default hover:bg-white/5 hover:border-white/20"
                              )}
                            >
                              <div className="space-y-4">
                                <div className="flex justify-between items-start">
                                  <h4 className="text-base font-black text-white capitalize flex items-center gap-1.5 font-black">
                                    {p.name}
                                    {p.is_popular && <BadgeCheck className="w-4 h-4 text-indigo-400" />}
                                  </h4>
                                </div>
                                <p className="text-[11px] text-white/50 leading-relaxed min-h-[40px]">{p.description}</p>
                                <div className="flex items-baseline gap-0.5">
                                  <span className="text-2xl font-black text-white">₹{Number(p.price_per_event_min || 0).toLocaleString()}</span>
                                  <span className="text-[10px] text-white/30 font-bold uppercase">/ event</span>
                                </div>
                                <div className="space-y-2 text-[10px] text-white/60 font-semibold border-t border-white/5 pt-4">
                                  <div className="flex justify-between"><span>Max Events:</span><span className="text-white">{p.max_events}</span></div>
                                  <div className="flex justify-between"><span>Staff Users:</span><span className="text-white">{p.max_users}</span></div>
                                  <div className="flex justify-between"><span>Registrations:</span><span className="text-white">{p.max_registrations || "Unlimited"}</span></div>
                                  <div className="flex justify-between"><span>File Storage:</span><span className="text-white">{p.storage_quota_mb / 1024} GB</span></div>
                                </div>
                              </div>
                              <button className={cn(
                                "w-full h-10 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all mt-6 active:scale-95 border",
                                isSelected
                                  ? "bg-[var(--pri)] border-[var(--pri)] text-white shadow-md shadow-[var(--pri)]/10"
                                  : "bg-white/5 border-white/10 text-white/60 hover:bg-white/10"
                              )}>
                                {isSelected ? "Plan Selected" : "Select Plan"}
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                  {step === 2 && (
                    <div className="space-y-6">
                      <div className="grid md:grid-cols-2 gap-4">
                        {addons.map(a => {
                          const isChecked = selectedAddons.includes(a.key);
                          const isIncluded = a.included_in_plan && selectedPlan && a.included_in_plan.toLowerCase() === selectedPlan.name.toLowerCase();
                          const isCustomRate = isVenueOps(a.key);
                          
                          return (
                            <div
                              key={a.id}
                              onClick={() => !isIncluded && (isChecked ? setSelectedAddons(selectedAddons.filter(k => k !== a.key)) : setSelectedAddons([...selectedAddons, a.key]))}
                              className={cn(
                                "rounded-2xl border p-5 cursor-pointer transition-all flex items-start gap-4 relative select-none",
                                isChecked && !isIncluded
                                  ? "bg-violet-500/10 border-violet-500/40 shadow-sm"
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
                                className="rounded border-white/20 bg-white/5 text-[var(--pri)] focus:ring-[var(--pri)] w-5 h-5 shrink-0 mt-0.5 accent-indigo-500"
                              />
                              <div className="space-y-1.5 flex-1">
                                <div className="flex justify-between items-baseline">
                                  <h5 className="text-xs font-black text-white">{a.name}</h5>
                                  {isCustomRate && (
                                    <span className="text-[8px] bg-amber-500/10 text-amber-400 font-extrabold uppercase px-2 py-0.5 rounded-full border border-amber-500/20">
                                      Callback Required
                                    </span>
                                  )}
                                </div>
                                <p className="text-[10px] text-white/45 leading-relaxed">{a.description}</p>
                                <div className="pt-2 flex items-center gap-1.5">
                                  <span className="text-[11px] font-black text-indigo-400">
                                    {isIncluded 
                                      ? "Included in Base Plan" 
                                      : isCustomRate 
                                        ? "Custom (To Be Decided)" 
                                        : a.price_inr 
                                          ? `+₹${Number(a.price_inr).toLocaleString()}` 
                                          : "Custom Pricing"}
                                  </span>
                                  {!isIncluded && a.billing_unit && !isCustomRate && (
                                    <span className="text-[8px] text-white/30 uppercase tracking-widest font-black">({a.billing_unit.replace('_', ' ')})</span>
                                  )}
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                      
                      <div className="rounded-2xl border border-white/5 bg-white/[0.02] p-5 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                        <div className="space-y-1">
                          <h5 className="text-xs font-black text-white">Escrow Total Calculated</h5>
                          <p className="text-[10px] text-white/40 font-medium">Adds chosen addons to the default plan price. Custom/venue addons are excluded from upfront payment.</p>
                        </div>
                        <div className="flex items-baseline gap-1 bg-white/5 border border-white/5 px-4 py-2 rounded-xl">
                          <span className="text-sm font-bold text-white/50 uppercase tracking-wider">Subtotal:</span>
                          <span className="text-xl font-black text-white">
                            ₹{Number(priceDetails?.total || selectedPlan?.price_per_event_min || 0).toLocaleString()}
                          </span>
                        </div>
                      </div>
                    </div>
                  )}

                  {step === 3 && (
                    <div className="max-h-[90vh]">
                      {processingState === null ? (
                        <form onSubmit={handleCheckoutSubmit} className="grid md:grid-cols-2 gap-6 pt-2 select-none">
                          {/* Invoice Billing Info */}
                          <div className="space-y-3.5">
                            <h5 className="text-[10px] font-black uppercase tracking-widest text-white/50 border-b border-white/5 pb-1 flex items-center gap-1.5">
                              <Receipt className="w-3.5 h-3.5 text-violet-400" />
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
                                className="w-full h-10 rounded-xl bg-white/5 border border-white/10 px-3.5 text-xs text-white focus:outline-none focus:border-violet-500/40 transition-all font-bold"
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
                                className="w-full h-10 rounded-xl bg-white/5 border border-white/10 px-3.5 text-xs text-white focus:outline-none focus:border-violet-500/40 transition-all font-bold"
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
                                  className="w-full h-10 rounded-xl bg-white/5 border border-white/10 px-3.5 text-xs text-white focus:outline-none focus:border-violet-500/40 transition-all font-bold"
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
                                  className="w-full h-10 rounded-xl bg-white/5 border border-white/10 px-3.5 text-xs text-white focus:outline-none focus:border-violet-500/40 transition-all font-mono font-bold tracking-wider"
                                />
                              </div>
                            </div>
                            
                            {hasVenueOpsSelected && (
                              <div className="p-3.5 rounded-2xl bg-amber-500/5 border border-amber-500/20 space-y-1 text-amber-200">
                                <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase">
                                  <Info className="w-3.5 h-3.5 shrink-0 text-amber-400" />
                                  Venue Operations Selected
                                </div>
                                <p className="text-[9px] leading-relaxed font-semibold">
                                  A callback ticket will be filed to discuss hardware & technical staff support details. Pricing for venue setup will be set by the Super Admin council.
                                </p>
                              </div>
                            )}

                            {/* Total price indicator on checkout */}
                            <div className="p-3.5 rounded-2xl bg-white/5 border border-white/5 space-y-1">
                              <div className="flex justify-between items-center text-[10px] text-white/50 font-bold uppercase">
                                <span>Mock Escrow Due</span>
                                <span>₹{Number(priceDetails?.total || selectedPlan?.price_per_event_min || 0).toLocaleString()}</span>
                              </div>
                              <p className="text-[8px] text-white/35 font-medium leading-normal">
                                Includes plan base price and non-custom selected add-ons. No upfront card charges will apply for custom callback elements.
                              </p>
                            </div>
                          </div>
                          
                          {/* Credit card form & 3D Flipping animation */}
                          <div className="space-y-4">
                            <h5 className="text-[10px] font-black uppercase tracking-widest text-white/50 border-b border-white/5 pb-1 flex items-center gap-1.5">
                              <CreditCard className="w-3.5 h-3.5 text-violet-400" />
                              Sandbox Card Details
                            </h5>
                            
                            <div className="flex flex-col justify-center items-center">
                              <div className="relative w-full h-[140px] select-none" style={{ perspective: "1000px" }}>
                                <motion.div
                                  animate={{ rotateY: isFlipped ? 180 : 0 }}
                                  transition={{ duration: 0.6 }}
                                  className="relative w-full h-full"
                                  style={{ transformStyle: "preserve-3d" }}
                                >
                                  {/* Front */}
                                  <div 
                                    className="absolute inset-0 w-full h-full rounded-2xl p-4 bg-gradient-to-br from-violet-600 to-indigo-850 border border-white/10 shadow-xl flex flex-col justify-between"
                                    style={{ backfaceVisibility: "hidden" }}
                                  >
                                    <div className="flex justify-between items-start">
                                      <div>
                                        <p className="text-[6px] uppercase tracking-wider text-white/44 font-bold">EventOS Billing Platform</p>
                                        <h5 className="text-[9px] font-black text-white mt-0.5 tracking-tight uppercase">
                                          {selectedPlan?.name}
                                        </h5>
                                      </div>
                                      <span className="text-[9px] font-bold text-white/80 bg-white/10 px-2 py-0.5 rounded">EOS</span>
                                    </div>
                                    
                                    <p className="text-sm font-mono tracking-widest font-black text-white/90 truncate my-2">
                                      {cardNo || "•••• •••• •••• ••••"}
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
                                        {cvv || "•••"}
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
                                  className="w-full h-9 rounded-xl bg-white/5 border border-white/10 px-3.5 text-xs text-white focus:outline-none focus:border-violet-500/40 transition-all font-semibold"
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
                                  className="w-full h-9 rounded-xl bg-white/5 border border-white/10 px-3.5 text-xs text-white font-mono focus:outline-none focus:border-violet-500/40 transition-all"
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
                                    className="w-full h-9 rounded-xl bg-white/5 border border-white/10 px-3.5 text-xs text-white font-mono focus:outline-none focus:border-violet-500/40 transition-all text-center"
                                  />
                                </div>
                                <div>
                                  <label className="text-[9px] font-bold uppercase tracking-widest text-white/40 block mb-1">CVV</label>
                                  <input
                                    type="password"
                                    required
                                    placeholder="•••"
                                    value={cvv}
                                    onChange={handleCvvChange}
                                    onFocus={() => setIsFlipped(true)}
                                    onBlur={() => setIsFlipped(false)}
                                    className="w-full h-9 rounded-xl bg-white/5 border border-white/10 px-3.5 text-xs text-white font-mono focus:outline-none focus:border-violet-500/40 transition-all text-center"
                                  />
                                </div>
                              </div>
                            </div>
                            
                            <div className="flex gap-3 pt-2">
                              <button
                                type="button"
                                onClick={() => setStep(2)}
                                className="flex-1 h-10 rounded-xl border border-white/10 text-xs text-white/40 hover:text-white font-bold transition-all"
                              >
                                Back
                              </button>
                              <button
                                type="submit"
                                className="flex-[2] h-10 rounded-xl bg-violet-600 hover:bg-violet-500 text-xs font-black uppercase tracking-wider text-white shadow-lg shadow-violet-600/20 active:scale-95 transition-all"
                              >
                                {hasVenueOpsSelected ? "Request Callback & Pay" : "Authorize Sandbox"}
                              </button>
                            </div>
                          </div>
                        </form>
                      ) : successDetails === null ? (
                        /* Processing Escrow Loading Loop */
                        <div className="flex flex-col items-center justify-center py-16 space-y-6 text-center min-h-[300px]">
                          <div className="relative w-14 h-14 flex items-center justify-center">
                            <div className="absolute inset-0 bg-violet-500/20 blur-xl rounded-full animate-pulse" />
                            <Loader2 className="w-8 h-8 text-violet-400 animate-spin" />
                          </div>
                          <div className="space-y-2 max-w-sm">
                            <h4 className="text-sm font-bold text-white tracking-tight">Authorizing Escrow Handshake</h4>
                            <p className="text-[10px] text-white/40 font-mono animate-pulse">{processingMessages[processingState] || "Syncing records..."}</p>
                          </div>
                        </div>
                      ) : null}
                    </div>
                  )}

                  {step === 4 && successDetails && (
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
                        <h4 className="text-lg font-black tracking-tight text-white font-black">Event Registered & Entitled</h4>
                        <p className="text-[10px] text-emerald-400 font-black uppercase tracking-widest">
                          Subscription Approved · Organization features active
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
                            <span className="text-white/55 font-semibold">Plan Level:</span>
                            <span className="text-white capitalize">{successDetails.plan_name}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-white/55 font-semibold">Billed Name:</span>
                            <span className="text-white">{billingName}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-white/55 font-semibold">Registered Event:</span>
                            <span className="text-white">{successDetails.event_name}</span>
                          </div>
                          {hasVenueOpsSelected && (
                            <div className="flex justify-between text-amber-400">
                              <span className="font-semibold">Venue operations:</span>
                              <span>Callback Pending</span>
                            </div>
                          )}
                          <div className="flex justify-between">
                            <span className="text-white/55 font-semibold">Transaction ID:</span>
                            <span className="text-white/80 font-mono text-[10px] break-all">{successDetails.transaction_id}</span>
                          </div>
                          <div className="flex justify-between border-t border-white/5 pt-2.5 items-baseline">
                            <span className="text-white/55 font-semibold">Paid Amount (INR):</span>
                            <span className="text-base font-black text-white">₹{Number(successDetails.amount_paid).toLocaleString()}</span>
                          </div>
                        </div>
                      </div>
                      
                      <Button
                        onClick={onClose}
                        className="w-full max-w-xs h-11 rounded-xl bg-violet-600 hover:bg-violet-500 font-black uppercase tracking-widest text-[10px] text-white shadow-lg transition-all active:scale-95 border-0"
                      >
                        Done
                      </Button>
                    </motion.div>
                  )}
                </div>
              )}

              {/* Footer */}
              {step !== 4 && !loadingConfig && (
                <div className="p-8 border-t border-default bg-[color-mix(in_srgb,var(--base)_50%,transparent)] backdrop-blur-sm flex gap-4 flex-shrink-0">
                  {isEditing ? (
                    <>
                      <Button onClick={onClose} variant="ghost" className="flex-1 h-14 rounded-2xl text-[11px] font-black uppercase tracking-widest text-muted border-0">
                        Cancel
                      </Button>
                      <Button
                        disabled={loading}
                        onClick={handleSubmit}
                        className="flex-[2] h-14 rounded-2xl bg-[var(--pri)] hover:bg-[var(--sec)] text-[var(--text)] font-black uppercase tracking-widest text-[11px] shadow-lg border-0"
                      >
                        {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Plus className="h-4 w-4 mr-2" />}
                        Update Event
                      </Button>
                    </>
                  ) : (
                    <>
                      {step === 0 && (
                        <>
                          <Button onClick={onClose} variant="ghost" className="flex-1 h-14 rounded-2xl text-[11px] font-black uppercase tracking-widest text-muted border-0">
                            Cancel
                          </Button>
                          <Button
                            onClick={handleSubmit}
                            className="flex-[2] h-14 rounded-2xl bg-[var(--pri)] hover:bg-[var(--sec)] text-[var(--text)] font-black uppercase tracking-widest text-[11px] shadow-lg border-0"
                          >
                            Next: Select Plan <ChevronRight className="h-4 w-4 ml-1.5" />
                          </Button>
                        </>
                      )}
                      
                      {step === 1 && (
                        <>
                          <Button onClick={() => setStep(0)} variant="ghost" className="flex-1 h-14 rounded-2xl text-[11px] font-black uppercase tracking-widest text-muted border-0">
                            Back
                          </Button>
                          <Button
                            onClick={() => setStep(2)}
                            disabled={!selectedPlan}
                            className="flex-[2] h-14 rounded-2xl bg-[var(--pri)] hover:bg-[var(--sec)] text-[var(--text)] font-black uppercase tracking-widest text-[11px] shadow-lg border-0"
                          >
                            Next: Select Add-ons <ChevronRight className="h-4 w-4 ml-1.5" />
                          </Button>
                        </>
                      )}
                      
                      {step === 2 && (
                        <>
                          <Button onClick={() => setStep(1)} variant="ghost" className="flex-1 h-14 rounded-2xl text-[11px] font-black uppercase tracking-widest text-muted border-0">
                            Back
                          </Button>
                          <Button
                            onClick={() => setStep(3)}
                            className="flex-[2] h-14 rounded-2xl bg-[var(--pri)] hover:bg-[var(--sec)] text-[var(--text)] font-black uppercase tracking-widest text-[11px] shadow-lg border-0"
                          >
                            Proceed to Checkout <ChevronRight className="h-4 w-4 ml-1.5" />
                          </Button>
                        </>
                      )}
                      
                      {step === 3 && (
                        <div className="flex-1 text-center text-[10px] text-white/35 font-bold uppercase tracking-wide">
                          Payment Portal Active
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  );
}
