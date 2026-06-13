"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  BadgeCheck, Building2, CalendarPlus, Check, ChevronRight, ExternalLink, Loader2,
  Mail, Palette, PartyPopper, Plus, Save, Shield, Trash2, UserPlus, CreditCard,
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
import { countries, Organization, OrgMember, orgApi, OrgMe, OrgRole, timezones, usageTone } from "@/components/organizer/org/org-api";
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

  // New billing/checkout states
  const [plans, setPlans] = useState<any[]>([]);
  const [selectedPlan, setSelectedPlan] = useState<any | null>(null);
  const [checkoutOpen, setCheckoutOpen] = useState(false);

  // Mock card details state
  const [cardholder, setCardholder] = useState("");
  const [cardNo, setCardNo] = useState("");
  const [expiry, setExpiry] = useState("");
  const [cvv, setCvv] = useState("");
  const [isFlipped, setIsFlipped] = useState(false);
  const [processingState, setProcessingState] = useState<number | null>(null); // null, 0, 1, 2, 3, 4 (success)

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
      })
      .catch((err) => {
        console.error("Failed to load onboarding context:", err);
        toast.error("Session expired or invalid. Please log in again.");
        router.replace("/login");
      });
  }, [router]);

  useEffect(() => {
    if (step === 3) {
      orgApi.plans()
        .then(setPlans)
        .catch((err) => {
          console.error("Failed to load available plans:", err);
        });
    }
  }, [step]);

  if (!data) return <LoadingSurface />;

  const steps = ["Customise Your Workspace", "Invite Your Team", "Create Your First Event", "Set Up Billing", "You're Ready!"];

  const saveBrand = async () => {
    setSaving(true);
    try {
      const result = await orgApi.updateMe(brand as Partial<Organization>);
      setData({ ...data, organization: result.organization });
      setStep(1);
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
    if (!cardholder || !cardNo || !expiry || !cvv) {
      toast.error("Please fill in all credit card details.");
      return;
    }

    // Start checkout micro-animations
    setProcessingState(0);
    
    // Cycle through messages
    const timers: NodeJS.Timeout[] = [];
    for (let i = 1; i <= 4; i++) {
      const t = setTimeout(() => {
        setProcessingState(i);
        if (i === 4) {
          // Final success trigger
          orgApi.subscribe({
            plan_name: selectedPlan.name,
            cardholder_name: cardholder,
            card_number: cardNo,
            expiry: expiry,
            cvv: cvv,
          })
            .then((result) => {
              setData((prev) => prev ? { ...prev, organization: result.organization } : null);
              toast.success(`Active plan updated to ${selectedPlan.name}`);
              setTimeout(() => {
                setCheckoutOpen(false);
                setProcessingState(null);
                setStep(4);
              }, 1500);
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
      router.push("/dashboard");
    } catch (error: any) {
      toast.error(error.message || "Failed to complete onboarding.");
    }
  };

  // Format Card Number (adds spaces every 4 digits)
  const handleCardNoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value.replace(/\D/g, "");
    const formatted = raw.replace(/(.{4})/g, "$1 ").trim().slice(0, 19);
    setCardNo(formatted);
  };

  // Format Expiry Date (MM/YY)
  const handleExpiryChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value.replace(/\D/g, "");
    let formatted = raw;
    if (raw.length > 2) {
      formatted = `${raw.slice(0, 2)}/${raw.slice(2, 4)}`;
    }
    setExpiry(formatted.slice(0, 5));
  };

  // Format CVV (max 3 digits)
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
          <Stack title="Customise Your Workspace" icon={Palette}>
            <BrandFields brand={brand} setBrand={setBrand} />
            <Button onClick={saveBrand} disabled={saving} className="h-12 rounded-xl bg-[var(--pri)] font-black uppercase tracking-widest text-[11px]">{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save & Continue"}</Button>
          </Stack>
        )}
        {step === 1 && (
          <Stack title="Invite Your Team" icon={UserPlus}>
            <div className="grid gap-3 md:grid-cols-[1fr_180px_auto]">
              <Input placeholder="teammate@hospital.org" value={invite.email} onChange={(e) => setInvite({ ...invite, email: e.target.value })} className="h-12 rounded-xl bg-white/5 border-default" />
              <RoleSelect value={invite.org_role} onChange={(org_role) => setInvite({ ...invite, org_role })} />
              <Button onClick={sendInvite} className="h-12 rounded-xl bg-[var(--pri)]"><Mail className="mr-2 h-4 w-4" />Send</Button>
            </div>
            {pending.map((email) => <div key={email} className="rounded-xl border border-default bg-white/[0.03] px-4 py-3 text-sm font-bold text-muted">{email} pending</div>)}
            <Button variant="outline" onClick={() => setStep(2)} className="h-12 rounded-xl border-default bg-white/5">Skip for now</Button>
          </Stack>
        )}
        {step === 2 && (
          <Stack title="Create Your First Event" icon={CalendarPlus}>
            <div className="grid gap-4 md:grid-cols-2">
              <Input placeholder="Annual Conference 2026" value={event.name} onChange={(e) => setEvent({ ...event, name: e.target.value })} className="h-12 rounded-xl bg-white/5 border-default md:col-span-2" />
              <Input type="date" value={event.start_date} onChange={(e) => setEvent({ ...event, start_date: e.target.value })} className="h-12 rounded-xl bg-white/5 border-default" />
              <Input type="date" value={event.end_date} onChange={(e) => setEvent({ ...event, end_date: e.target.value })} className="h-12 rounded-xl bg-white/5 border-default" />
            </div>
            {eventId ? <a href={`/events/${eventId}/speaker/dashboard`} className="flex items-center gap-2 text-[var(--pri)] font-black uppercase tracking-widest text-[11px]">Event created <ExternalLink className="h-4 w-4" /></a> : <Button onClick={createEvent} className="h-12 rounded-xl bg-[var(--pri)]">Create Event</Button>}
            <Button variant="outline" onClick={() => setStep(3)} className="h-12 rounded-xl border-default bg-white/5">Skip for now</Button>
          </Stack>
        )}
        {step === 3 && (
          <Stack title="Set Up Billing" icon={BadgeCheck}>
            <div className="grid gap-5 md:grid-cols-3">
              {plans.map((p) => {
                const isActive = data.organization.plan.toLowerCase() === p.name.toLowerCase() || 
                                (data.organization.plan.toLowerCase() === "pro" && p.name.toLowerCase() === "professional");
                return (
                  <div
                    key={p.id}
                    onClick={() => {
                      setSelectedPlan(p);
                      setCheckoutOpen(true);
                    }}
                    className={cn(
                      "rounded-3xl border p-6 hover:border-violet-500/50 cursor-pointer transition-all flex flex-col justify-between group relative overflow-hidden",
                      isActive
                        ? "bg-violet-500/10 border-violet-500/40 shadow-[0_10px_30px_-10px_rgba(139,92,246,0.2)]"
                        : "bg-white/3 border-default hover:bg-white/5"
                    )}
                  >
                    {isActive && (
                      <div className="absolute top-0 right-0 bg-violet-500 text-white text-[8px] font-black uppercase tracking-widest px-3 py-1 rounded-bl-xl">
                        Active Plan
                      </div>
                    )}
                    <div>
                      <h3 className="text-lg font-black text-white group-hover:text-violet-400 transition-colors capitalize">{p.name}</h3>
                      <p className="text-[11px] text-white/45 mt-2 leading-relaxed">{p.description}</p>

                      <div className="my-5 flex items-baseline gap-1">
                        <span className="text-2xl font-black text-white">
                          {p.name.toLowerCase() === "starter" ? "$0" : p.name.toLowerCase() === "professional" ? "$49" : "$199"}
                        </span>
                        <span className="text-[10px] text-white/30 font-bold uppercase tracking-wider">/ month</span>
                      </div>

                      <div className="space-y-2.5 pt-4 border-t border-white/5">
                        <p className="text-[9px] font-black uppercase tracking-wider text-white/30">Limits & Quotas</p>
                        <div className="grid grid-cols-2 gap-2 text-[10px] font-bold text-white/60">
                          <div>Events: {p.max_events}</div>
                          <div>Users: {p.max_users}</div>
                          <div className="col-span-2">Storage: {p.storage_quota_mb / 1024} GB</div>
                        </div>
                      </div>

                      {p.features && p.features.length > 0 && (
                        <div className="space-y-2 pt-4 mt-4 border-t border-white/5">
                          <p className="text-[9px] font-black uppercase tracking-wider text-white/30">Includes</p>
                          <div className="space-y-1">
                            {p.features.slice(0, 3).map((f: string) => (
                              <div key={f} className="flex items-center gap-2 text-[10px] text-emerald-400 font-semibold">
                                <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                                <span className="truncate">{f}</span>
                              </div>
                            ))}
                            {p.features.length > 3 && (
                              <p className="text-[9px] text-white/30 font-bold pl-5">+{p.features.length - 3} more features</p>
                            )}
                          </div>
                        </div>
                      )}
                    </div>

                    <button className={cn(
                      "w-full h-11 rounded-xl text-[11px] font-black uppercase tracking-wider transition-all mt-6 active:scale-95 border",
                      isActive
                        ? "bg-violet-500/20 border-violet-500/30 text-violet-300 pointer-events-none"
                        : "bg-white/5 border-white/10 text-white/60 hover:bg-violet-500 hover:text-white hover:border-violet-500 shadow-md"
                    )}>
                      {isActive ? "Active Plan" : "Choose Plan"}
                    </button>
                  </div>
                );
              })}
            </div>
            
            <div className="flex gap-4">
              <Button variant="outline" onClick={() => setStep(4)} className="h-12 rounded-xl border-default bg-white/5 text-[11px] font-bold uppercase tracking-wider">I'll do this later</Button>
            </div>
          </Stack>
        )}
        {step === 4 && (
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
        <DialogContent className="max-w-2xl border-white/10 bg-[#0e0e14]/95 backdrop-blur-xl text-white rounded-3xl p-6 relative overflow-hidden">
          {processingState === null ? (
            <>
              <DialogHeader>
                <DialogTitle className="text-lg font-black tracking-tight flex items-center gap-2 text-white">
                  <CreditCard className="w-5 h-5 text-violet-400" />
                  Sandbox Payment Checkout
                </DialogTitle>
                <p className="text-xs text-white/40 font-medium">
                  Configure mock billing credentials to unlock entitlements for <strong>{selectedPlan?.name}</strong>.
                </p>
              </DialogHeader>

              <form onSubmit={handleSubscribe} className="grid md:grid-cols-2 gap-6 pt-4">
                {/* 3D Virtual Credit Card Representation */}
                <div className="flex flex-col justify-center items-center">
                  <div className="relative w-full h-[180px] perspective-1000 select-none">
                    <motion.div
                      animate={{ rotateY: isFlipped ? 180 : 0 }}
                      transition={{ duration: 0.6 }}
                      className="relative w-full h-full preserve-3d"
                      style={{ transformStyle: "preserve-3d" }}
                    >
                      {/* Card Front */}
                      <div 
                        className="absolute inset-0 w-full h-full rounded-2xl p-5 bg-gradient-to-br from-violet-600 to-indigo-800 border border-white/10 shadow-2xl flex flex-col justify-between"
                        style={{ backfaceVisibility: "hidden" }}
                      >
                        <div className="flex items-start justify-between">
                          <div>
                            <p className="text-[8px] uppercase tracking-wider text-white/50 font-bold">EventOS Entitlement Token</p>
                            <h4 className="text-xs font-black tracking-tight mt-0.5 capitalize">{selectedPlan?.name || "Workspace Subscription"}</h4>
                          </div>
                          <div className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center font-black text-[10px] tracking-tighter">
                            {cardNo.startsWith("4") ? "VISA" : cardNo.startsWith("5") ? "MC" : "EOS"}
                          </div>
                        </div>

                        <div className="my-1.5 flex gap-1">
                          <div className="w-9 h-6.5 rounded bg-gradient-to-r from-amber-400 to-yellow-500 opacity-80" />
                        </div>

                        <div>
                          <p className="text-base font-mono tracking-[0.12em] font-black text-white/90 truncate">
                            {cardNo || "•••• •••• •••• ••••"}
                          </p>
                          <div className="flex justify-between items-end mt-2">
                            <div className="max-w-[130px] truncate">
                              <p className="text-[6px] uppercase tracking-widest text-white/40 font-bold">Holder</p>
                              <p className="text-[9px] font-bold uppercase tracking-wide truncate">
                                {cardholder || "YOUR NAME"}
                              </p>
                            </div>
                            <div>
                              <p className="text-[6px] uppercase tracking-widest text-white/40 font-bold">Expiry</p>
                              <p className="text-[9px] font-mono font-bold">{expiry || "MM/YY"}</p>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Card Back */}
                      <div 
                        className="absolute inset-0 w-full h-full rounded-2xl bg-[#13121b] border border-white/10 shadow-2xl flex flex-col justify-between py-4"
                        style={{ backfaceVisibility: "hidden", transform: "rotateY(180deg)" }}
                      >
                        <div className="w-full h-8 bg-black mt-2" />
                        <div className="px-5">
                          <p className="text-[6px] uppercase tracking-widest text-white/40 font-bold text-right mb-0.5">CVV</p>
                          <div className="flex items-center justify-between">
                            <div className="h-7 bg-white/10 rounded px-2.5 flex items-center text-[8px] font-mono tracking-widest text-white/30 italic w-32">
                              Authorized Signature
                            </div>
                            <div className="h-7 bg-white text-black font-mono font-black text-xs rounded px-2.5 flex items-center justify-center min-w-[40px] shadow-inner">
                              {cvv || "•••"}
                            </div>
                          </div>
                        </div>
                        <p className="text-[7px] text-white/20 font-bold px-5 text-center leading-tight">
                          For sandbox validation only. No financial asset transfers occur.
                        </p>
                      </div>
                    </motion.div>
                  </div>
                  <div className="mt-4 p-3 rounded-2xl bg-white/5 border border-white/5 text-[9px] text-white/40 text-center font-medium">
                    Hover or click inputs to watch the card flip. Supports standard formats.
                  </div>
                </div>

                {/* Card Fields Form */}
                <div className="space-y-4">
                  <div>
                    <label className="text-[9px] font-bold uppercase tracking-widest text-white/40 block mb-1.5">Card Holder</label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. John Doe"
                      value={cardholder}
                      onChange={(e) => setCardholder(e.target.value)}
                      onFocus={() => setIsFlipped(false)}
                      className="w-full h-11 rounded-xl bg-white/5 border border-white/10 px-4 text-xs text-white focus:outline-none focus:border-violet-500/40 transition-all"
                    />
                  </div>

                  <div>
                    <label className="text-[9px] font-bold uppercase tracking-widest text-white/40 block mb-1.5">Card Number</label>
                    <input
                      type="text"
                      required
                      placeholder="4000 1234 5678 9010"
                      value={cardNo}
                      onChange={handleCardNoChange}
                      onFocus={() => setIsFlipped(false)}
                      className="w-full h-11 rounded-xl bg-white/5 border border-white/10 px-4 text-xs text-white font-mono focus:outline-none focus:border-violet-500/40 transition-all"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-[9px] font-bold uppercase tracking-widest text-white/40 block mb-1.5">Expiry Date</label>
                      <input
                        type="text"
                        required
                        placeholder="MM/YY"
                        value={expiry}
                        onChange={handleExpiryChange}
                        onFocus={() => setIsFlipped(false)}
                        className="w-full h-11 rounded-xl bg-white/5 border border-white/10 px-4 text-xs text-white font-mono focus:outline-none focus:border-violet-500/40 transition-all text-center"
                      />
                    </div>
                    <div>
                      <label className="text-[9px] font-bold uppercase tracking-widest text-white/40 block mb-1.5">CVV</label>
                      <input
                        type="password"
                        required
                        placeholder="•••"
                        value={cvv}
                        onChange={handleCvvChange}
                        onFocus={() => setIsFlipped(true)}
                        onBlur={() => setIsFlipped(false)}
                        className="w-full h-11 rounded-xl bg-white/5 border border-white/10 px-4 text-xs text-white font-mono focus:outline-none focus:border-violet-500/40 transition-all text-center"
                      />
                    </div>
                  </div>

                  <div className="flex gap-3 pt-2">
                    <button
                      type="button"
                      onClick={() => setCheckoutOpen(false)}
                      className="flex-1 h-11 rounded-xl border border-white/10 text-xs text-white/40 hover:text-white font-bold transition-all"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="flex-1 h-11 rounded-xl bg-violet-600 hover:bg-violet-500 text-xs font-black uppercase tracking-wider text-white shadow-lg shadow-violet-600/20 active:scale-95 transition-all"
                    >
                      Authorize Sandbox
                    </button>
                  </div>
                </div>
              </form>
            </>
          ) : (
            /* Checkout Processing/Success Animations */
            <div className="flex flex-col items-center justify-center py-12 space-y-6 text-center min-h-[340px]">
              {processingState < 4 ? (
                <>
                  <div className="relative w-16 h-16 flex items-center justify-center">
                    <div className="absolute inset-0 bg-violet-500/20 blur-xl rounded-full animate-pulse" />
                    <Loader2 className="w-10 h-10 text-violet-400 animate-spin" />
                  </div>
                  <div className="space-y-2">
                    <h4 className="text-sm font-bold text-white tracking-tight">Processing Escrow Handshake</h4>
                    <p className="text-xs text-white/40 font-mono animate-pulse">{processingMessages[processingState]}</p>
                  </div>
                </>
              ) : (
                <motion.div
                  initial={{ scale: 0.8, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ type: "spring", stiffness: 200, damping: 15 }}
                  className="space-y-4"
                >
                  <div className="w-16 h-16 rounded-full bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center mx-auto text-emerald-400">
                    <Check className="w-8 h-8 text-emerald-400" />
                  </div>
                  <div className="space-y-2">
                    <h4 className="text-base font-black text-white tracking-tight">Ecosystem Authorized</h4>
                    <p className="text-xs text-emerald-400 font-bold uppercase tracking-widest">
                      Subscription Active · Limits Synced
                    </p>
                  </div>
                </motion.div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

export function OrgSettingsPage() {
  const [data, setData] = useState<OrgMe | null>(null);
  const [members, setMembers] = useState<OrgMember[]>([]);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [invite, setInvite] = useState({ email: "", org_role: "member" as OrgRole });
  const [upgradeOpen, setUpgradeOpen] = useState(false);
  const user = useAuthStore((state) => state.user);

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
      <Tabs defaultValue="profile" className="min-h-full">
        <div className="flex items-center justify-between gap-4">
          <PageTitle icon={Building2} title="Organisation Settings" subtitle={`${org.name} · ${org.slug}`} />
          <TabsList><TabsTrigger value="profile">Profile</TabsTrigger><TabsTrigger value="branding">Branding</TabsTrigger><TabsTrigger value="team">Team</TabsTrigger><TabsTrigger value="plan">Plan</TabsTrigger></TabsList>
        </div>
        <TabsContent value="profile"><ProfileTab org={org} onSave={save} /></TabsContent>
        <TabsContent value="branding"><BrandingTab org={org} onSave={save} /></TabsContent>
        <TabsContent value="team">
          <TeamTab members={members} currentUserId={user?.id} data={data} onInvite={() => setInviteOpen(true)} onChanged={load} />
        </TabsContent>
        <TabsContent value="plan"><PlanUsageTab data={data} onUpgrade={() => setUpgradeOpen(true)} /></TabsContent>
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
            <InfoBlock title="Members" items={(selected?.members || []).map((m: OrgMember) => `${m.name} · ${m.org_role}`)} />
            <InfoBlock title="Events" items={(selected?.events || []).map((e: any) => `${e.name} · ${e.start_date}`)} />
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

function PlanUsageTab({ data, onUpgrade }: { data: OrgMe; onUpgrade: () => void }) {
  const high = data.event_count / data.plan_limits.events > .9 || data.member_count / data.plan_limits.users > .9 || data.storage_used_gb / data.plan_limits.storage_gb > .9;
  return <div className="space-y-5">{high && <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm font-bold text-amber-200">You're approaching a resource limit. Upgrade your plan to continue.</div>}<div className="rounded-2xl border border-default bg-white/[0.04] p-5 flex items-center justify-between"><div><PlanBadge plan={data.organization.plan} /><p className="mt-3 text-sm text-muted">Trial expiry or renewal date appears here when billing is connected.</p></div><Button onClick={onUpgrade} className="rounded-xl bg-[var(--pri)]">Upgrade Plan</Button></div><UsageBar label={`Events: ${data.event_count} / ${data.plan_limits.events}`} value={data.event_count} max={data.plan_limits.events} /><UsageBar label={`Team Members: ${data.member_count} / ${data.plan_limits.users}`} value={data.member_count} max={data.plan_limits.users} /><UsageBar label={`Storage: ${data.storage_used_gb.toFixed(1)} GB / ${data.plan_limits.storage_gb} GB`} value={data.storage_used_gb} max={data.plan_limits.storage_gb} /></div>;
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
