"use client";

import { useEffect, useState, useMemo } from "react";
import { useParams } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  Layers,
  Plus,
  Tag,
  Users,
  CreditCard,
  DollarSign,
  Save,
  Loader2,
  X,
  Clock,
  Sparkles,
  Trash2,
  RefreshCw,
  ArrowRight,
  ArrowLeft,
  Copy,
  Calendar,
  Edit3,
  Globe,
} from "lucide-react";
import {
  MetricCard,
  OrganiserPage,
  Panel,
  StatusBadge,
} from "@/components/organizer/workspace/OrganiserPrimitives";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { DateTimePickerWithTZ } from "@/components/organizer/common/DateTimePickerWithTZ";
import { useEvent, useUpdateEvent } from "@/hooks/useEvents";
import { apiClient, apiGet } from "@/lib/api-client";
import { toast } from "sonner";
import { cn, formatDateTimeInTZ } from "@/lib/utils";

const CURRENCIES = [
  { code: "INR", symbol: "₹" },
  { code: "USD", symbol: "$" },
  { code: "EUR", symbol: "€" },
  { code: "GBP", symbol: "£" },
  { code: "AED", symbol: "د.إ" },
  { code: "SGD", symbol: "S$" },
  { code: "CAD", symbol: "CA$" },
  { code: "AUD", symbol: "A$" },
  { code: "JPY", symbol: "¥" },
];

const TIER_PRESETS = [
  "Early Bird",
  "Standard",
  "Late Registration",
  "Spot Registration",
  "VIP Access",
  "Group Rate",
];

interface Role {
  id: string;
  name: string;
  category?: string;
  role_code?: string;
  code?: string;
  is_active: boolean;
  is_default?: boolean;
  sort_order?: number;
}

interface Participant {
  id: string;
  role: string;
  paid_status: string;
  [key: string]: any;
}

export default function RegistrationCategoriesPage() {
  const params = useParams();
  const eventId = (params?.eventId as string) || "";
  const { data: event, refetch: refetchEvent } = useEvent(eventId);
  const updateEvent = useUpdateEvent(eventId);

  const [roles, setRoles] = useState<Role[]>([]);
  const [tiers, setTiers] = useState<string[]>(["Early Bird", "Standard"]);
  const [pricing, setPricing] = useState<Record<string, string>>({});
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Single-Tier 2-Step Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalStep, setModalStep] = useState<1 | 2>(1);
  const [editingTierOriginalName, setEditingTierOriginalName] = useState<string | null>(null);
  const [tierName, setTierName] = useState("");
  const [tierStartTime, setTierStartTime] = useState<string | null>(null);
  const [tierCutoff, setTierCutoff] = useState<string | null>(null);
  const [tierSchedules, setTierSchedules] = useState<Record<string, { available_from?: string | null; available_until?: string | null }>>({});
  const [tierRolePrices, setTierRolePrices] = useState<Record<string, string>>({});
  const [batchUniformPrice, setBatchUniformPrice] = useState("");

  // Add Pass Category Modal State
  const [isAddRoleModalOpen, setIsAddRoleModalOpen] = useState(false);
  const [newRoleCategory, setNewRoleCategory] = useState("General Attendees");
  const [newRoleName, setNewRoleName] = useState("");
  const [newRoleCode, setNewRoleCode] = useState("");
  const [addingRole, setAddingRole] = useState(false);

  const currency = event?.currency || "INR";
  const currencySymbol = CURRENCIES.find((c) => c.code === currency)?.symbol || "₹";
  const timezone = (event as any)?.timezone || "Asia/Kolkata";

  // Lock behind-screen scroll when modal dialog is open
  useEffect(() => {
    if (isModalOpen || isAddRoleModalOpen) {
      const prevBodyOverflow = document.body.style.overflow;
      const mainEl = document.getElementById("organiser-main");
      const prevMainOverflow = mainEl?.style.overflow;

      document.body.style.overflow = "hidden";
      if (mainEl) {
        mainEl.style.overflow = "hidden";
      }

      return () => {
        document.body.style.overflow = prevBodyOverflow;
        if (mainEl) {
          mainEl.style.overflow = prevMainOverflow || "";
        }
      };
    }
  }, [isModalOpen, isAddRoleModalOpen]);

  const loadData = async () => {
    if (!eventId) return;
    setLoading(true);
    try {
      const [rolesRes, tiersRes, pricingRes, participantsRes, schedulesRes] = await Promise.all([
        apiClient.get<Role[]>(`/events/${eventId}/registration/roles`).catch(() => []),
        apiClient.get<string[]>(`/events/${eventId}/pricing/tiers`).catch(() => ["Early Bird", "Standard"]),
        apiClient.get<Record<string, number>>(`/events/${eventId}/pricing`).catch(() => ({})),
        apiGet<Participant[]>(`/events/${eventId}/participants`).catch(() => []),
        apiClient.get<Record<string, { available_from?: string | null; available_until?: string | null }>>(`/events/${eventId}/pricing/schedules`).catch(() => ({})),
      ]);

      setRoles(rolesRes || []);
      const loadedTiers = tiersRes?.length ? tiersRes : ["Early Bird", "Standard"];
      setTiers(loadedTiers);

      const formattedPricing: Record<string, string> = {};
      Object.entries(pricingRes || {}).forEach(([k, v]) => {
        formattedPricing[k] = String(v);
      });
      setPricing(formattedPricing);
      setParticipants(participantsRes || []);
      setTierSchedules(schedulesRes || {});
    } catch {
      toast.error("Failed to load pass categories and pricing.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    const handleFocus = () => loadData();
    window.addEventListener("focus", handleFocus);
    return () => window.removeEventListener("focus", handleFocus);
  }, [eventId]);

  const activeRoles = useMemo(() => roles.filter((r) => r.is_active !== false), [roles]);

  // Determine active tier based on schedules & cutoffs
  const activeTier = useMemo(() => {
    const cutoffs = (event as any)?.registration_settings?.tier_cutoffs || {};
    if (!tiers || tiers.length === 0) return "Standard";

    const now = new Date();

    // 1. Check open tier windows
    for (const t of tiers) {
      const sched = tierSchedules[t] || {};
      const startStr = sched.available_from;
      const endStr = sched.available_until || cutoffs[t];

      const startDate = startStr ? new Date(startStr) : null;
      const endDate = endStr ? new Date(endStr) : null;

      const isStarted = !startDate || now >= startDate;
      const isNotExpired = !endDate || now <= endDate;

      if (isStarted && isNotExpired) {
        return t;
      }
    }

    // 2. Upcoming tier fallback
    for (const t of tiers) {
      const sched = tierSchedules[t] || {};
      const startStr = sched.available_from;
      if (startStr && new Date(startStr) > now) {
        return t;
      }
    }

    return tiers[0];
  }, [event, tiers, tierSchedules]);

  // Count registrations per role
  const roleRegistrationCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    participants.forEach((p) => {
      const roleName = p.role || "Delegate";
      counts[roleName] = (counts[roleName] || 0) + 1;
    });
    return counts;
  }, [participants]);

  // Open modal for a New Tier
  const handleOpenNewTierModal = () => {
    setEditingTierOriginalName(null);
    setTierName("");
    setTierStartTime(null);
    setTierCutoff(null);
    const initialPrices: Record<string, string> = {};
    activeRoles.forEach((role) => {
      initialPrices[role.name] = "";
    });
    setTierRolePrices(initialPrices);
    setBatchUniformPrice("");
    setModalStep(1);
    setIsModalOpen(true);
  };

  // Open modal to Edit an Existing Tier
  const handleOpenEditTierModal = (targetTier: string) => {
    setEditingTierOriginalName(targetTier);
    setTierName(targetTier);
    const sched = tierSchedules[targetTier] || {};
    const cutoffs = (event as any)?.registration_settings?.tier_cutoffs || {};
    setTierStartTime(sched.available_from || null);
    setTierCutoff(sched.available_until || cutoffs[targetTier] || null);

    const initialPrices: Record<string, string> = {};
    activeRoles.forEach((role) => {
      const key = `${role.name}_${targetTier}`;
      initialPrices[role.name] = pricing[key] !== undefined ? pricing[key] : "";
    });
    setTierRolePrices(initialPrices);
    setBatchUniformPrice("");
    setModalStep(1);
    setIsModalOpen(true);
  };

  // Delete a tier
  const handleDeleteTier = async (tierToDelete: string) => {
    if (tiers.length <= 1) {
      toast.error("At least one pricing tier must remain.");
      return;
    }
    if (!window.confirm(`Delete the "${tierToDelete}" pricing tier and its rates?`)) {
      return;
    }

    try {
      const nextTiers = tiers.filter((t) => t !== tierToDelete);
      await apiClient.post(`/events/${eventId}/pricing/tiers`, { tiers: nextTiers });

      // Clean up cutoffs
      const currentCutoffs = { ...((event as any)?.registration_settings?.tier_cutoffs || {}) };
      delete currentCutoffs[tierToDelete];
      await updateEvent.mutateAsync({
        registration_settings: {
          ...((event as any)?.registration_settings || {}),
          tier_cutoffs: currentCutoffs,
        },
      });

      // Clean up pricing matrix
      const updatedPricing: Record<string, number | null> = {};
      activeRoles.forEach((role) => {
        nextTiers.forEach((t) => {
          const key = `${role.name}_${t}`;
          const val = pricing[key];
          updatedPricing[key] = val && val.trim() !== "" ? parseFloat(val) : null;
        });
      });
      await apiClient.post(`/events/${eventId}/pricing`, { pricingData: updatedPricing });

      toast.success(`Tier "${tierToDelete}" deleted.`);
      await Promise.all([loadData(), refetchEvent()]);
    } catch (err: any) {
      toast.error(err.message || "Failed to delete tier.");
    }
  };

  // Apply batch price to all roles for the current tier
  const handleApplySamePriceToAllRoles = () => {
    const amount = batchUniformPrice.trim();
    if (!amount) {
      toast.error("Enter a price to apply to all roles.");
      return;
    }
    setTierRolePrices((prev) => {
      const next = { ...prev };
      activeRoles.forEach((role) => {
        next[role.name] = amount;
      });
      return next;
    });
    toast.success(`Applied ${currencySymbol} ${amount} to all ${activeRoles.length} roles.`);
  };

  // Save the configured Tier & its pricing matrix
  const handleSaveTierConfig = async () => {
    const finalTierName = tierName.trim();
    if (!finalTierName) {
      toast.error("Tier name is required.");
      return;
    }

    setSaving(true);
    try {
      // 1. Compute new tiers array
      let nextTiers = [...tiers];
      if (editingTierOriginalName) {
        nextTiers = nextTiers.map((t) => (t === editingTierOriginalName ? finalTierName : t));
      } else {
        if (!nextTiers.includes(finalTierName)) {
          nextTiers.push(finalTierName);
        }
      }
      await apiClient.post(`/events/${eventId}/pricing/tiers`, { tiers: nextTiers });

      // 2. Update cutoffs
      const currentCutoffs = { ...((event as any)?.registration_settings?.tier_cutoffs || {}) };
      if (editingTierOriginalName && editingTierOriginalName !== finalTierName) {
        delete currentCutoffs[editingTierOriginalName];
      }
      if (tierCutoff) {
        currentCutoffs[finalTierName] = tierCutoff;
      } else {
        delete currentCutoffs[finalTierName];
      }

      await updateEvent.mutateAsync({
        registration_settings: {
          ...((event as any)?.registration_settings || {}),
          tier_cutoffs: currentCutoffs,
        },
      });

      // 3. Update Pricing Matrix
      const updatedPricing: Record<string, number | null> = {};
      activeRoles.forEach((role) => {
        nextTiers.forEach((t) => {
          const key = `${role.name}_${t}`;
          if (t === finalTierName) {
            const val = tierRolePrices[role.name];
            updatedPricing[key] = val && val.trim() !== "" ? parseFloat(val) : null;
          } else {
            const existingVal = pricing[key];
            updatedPricing[key] = existingVal && existingVal.trim() !== "" ? parseFloat(existingVal) : null;
          }
        });
      });

      // 4. Update schedules payload
      const updatedSchedules = {
        ...tierSchedules,
        [finalTierName]: {
          available_from: tierStartTime || null,
          available_until: tierCutoff || null,
        },
      };

      await apiClient.post(`/events/${eventId}/pricing`, {
        pricingData: updatedPricing,
        tierSchedules: updatedSchedules,
      });

      toast.success(`Tier "${finalTierName}" and role pricing saved!`);
      setIsModalOpen(false);
      await Promise.all([loadData(), refetchEvent()]);
    } catch (err: any) {
      toast.error(err.message || "Failed to save tier pricing.");
    } finally {
      setSaving(false);
    }
  };

  const handleCreateRole = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newRoleName.trim()) {
      toast.error("Please enter a category or role name.");
      return;
    }
    setAddingRole(true);
    try {
      const payload = {
        category: newRoleCategory,
        name: newRoleName.trim(),
        role_code: newRoleCode.trim() || undefined,
        is_active: true,
      };
      await apiClient.post(`/events/${eventId}/registration/roles`, payload, {
        headers: { "Idempotency-Key": `participant-role-${Date.now()}` },
      });
      toast.success(`Pass category "${newRoleName.trim()}" added successfully!`);
      setIsAddRoleModalOpen(false);
      setNewRoleName("");
      setNewRoleCode("");
      await loadData();
    } catch (err: any) {
      toast.error(err.message || "Failed to create pass category.");
    } finally {
      setAddingRole(false);
    }
  };

  const totalRegistered = participants.length;
  const cutoffs = (event as any)?.registration_settings?.tier_cutoffs || {};

  return (
    <OrganiserPage
      title="Pass Categories & Pricing Tiers"
      description={
        event
          ? `Manage delegate pass tiers, pricing matrix, and attendee enrollment for ${event.name}.`
          : "Configure ticket pricing, pass categories, and registration tiers."
      }
      actions={
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={loadData}
            disabled={loading}
            className="h-8 text-xs font-semibold gap-1.5 border-[var(--border-default)] cursor-pointer"
          >
            <RefreshCw className={cn("size-3.5", loading && "animate-spin")} />
            Sync
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              setNewRoleName("");
              setNewRoleCode("");
              setNewRoleCategory("General Attendees");
              setIsAddRoleModalOpen(true);
            }}
            className="h-8 text-xs font-bold gap-1.5 border-[var(--border-default)] hover:border-[var(--pri)] hover:text-[var(--pri)] cursor-pointer"
          >
            <Plus className="size-3.5 text-[var(--pri)]" />
            Add Pass Category
          </Button>
          <Button
            size="sm"
            onClick={handleOpenNewTierModal}
            className="h-8 text-xs font-bold gap-1.5 bg-[var(--pri)] text-[var(--primary-contrast)] hover:opacity-90 shadow-sm cursor-pointer"
          >
            <Plus className="size-3.5" />
            Add Pricing Tier
          </Button>
        </div>
      }
    >
      {/* Metric Cards */}
      <div className="op-metric-grid">
        <MetricCard
          label="Active Categories"
          value={activeRoles.length.toString()}
          hint="Role-based pass tiers"
          tone="purple"
          icon={<Layers className="size-5 text-[var(--pri)]" />}
        />
        <MetricCard
          label="Active Pricing Tier"
          value={activeTier}
          hint="Currently applied rates"
          tone="teal"
          icon={<Tag className="size-5 text-[var(--sec)]" />}
        />
        <MetricCard
          label="Registered Attendees"
          value={totalRegistered.toLocaleString()}
          hint={`Across ${activeRoles.length} pass categories`}
          tone="green"
          icon={<Users className="size-5 text-emerald-500" />}
        />
        <MetricCard
          label="Event Timezone & Currency"
          value={timezone.split("/")[1] || timezone}
          hint={`${currencySymbol} ${currency} • ${timezone}`}
          tone="amber"
          icon={<Globe className="size-5 text-amber-500" />}
        />
      </div>

      {/* Tier Overview Cards Strip */}
      <div className="space-y-2">
        <div>
          <span className="text-xs font-bold uppercase tracking-wider text-[var(--text-secondary)]">
            Configured Pricing Tiers
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
          {tiers.map((t) => {
            const isCurrent = t === activeTier;
            const sched = tierSchedules[t] || {};
            const startDateStr = sched.available_from;
            const cutoffDateStr = sched.available_until || cutoffs[t];

            const now = new Date();
            const isUpcoming = startDateStr ? new Date(startDateStr) > now : false;
            const isExpired = cutoffDateStr ? new Date(cutoffDateStr) < now : false;

            return (
              <div
                key={t}
                className={cn(
                  "p-3.5 rounded-lg border transition-all relative flex flex-col justify-between gap-3 bg-[var(--card)]",
                  isCurrent
                    ? "border-[var(--pri)] ring-1 ring-[var(--pri)] shadow-sm bg-[var(--pri)]/[0.02]"
                    : "border-[var(--border-default)] hover:border-[var(--border-strong)]"
                )}
              >
                <div>
                  <div className="flex items-center justify-between gap-1.5">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="font-bold text-xs text-[var(--text-primary)]">{t}</span>
                      {isCurrent ? (
                        <span className="px-1.5 py-0.2 rounded text-[9px] font-bold uppercase bg-[var(--pri)] text-[var(--primary-contrast)]">
                          Active Now
                        </span>
                      ) : isUpcoming ? (
                        <span className="px-1.5 py-0.2 rounded text-[9px] font-bold uppercase bg-blue-500/15 text-blue-500 border border-blue-500/30">
                          Upcoming
                        </span>
                      ) : isExpired ? (
                        <span className="px-1.5 py-0.2 rounded text-[9px] font-bold uppercase bg-rose-500/15 text-rose-500 border border-rose-500/30">
                          Closed
                        </span>
                      ) : null}
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={() => handleOpenEditTierModal(t)}
                        className="p-1 rounded text-[var(--text-secondary)] hover:text-[var(--pri)] hover:bg-[var(--bg-surface-hover)] transition-colors cursor-pointer"
                        title="Edit tier rates & availability schedule"
                      >
                        <Edit3 className="size-3.5" />
                      </button>
                      {tiers.length > 1 && (
                        <button
                          type="button"
                          onClick={() => handleDeleteTier(t)}
                          className="p-1 rounded text-[var(--text-secondary)] hover:text-rose-500 hover:bg-[var(--bg-surface-hover)] transition-colors cursor-pointer"
                          title="Delete tier"
                        >
                          <Trash2 className="size-3.5" />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Availability Schedule (2-Column Grid) */}
                  <div className="mt-2.5 pt-2.5 border-t border-[var(--border-subtle)] grid grid-cols-2 gap-2 text-[11px]">
                    {/* Start Time */}
                    <div className="flex items-start gap-1.5 p-1.5 rounded-md bg-[var(--bg-surface-2)]/60 border border-[var(--border-subtle)]">
                      <Clock className="size-3.5 text-[var(--pri)] shrink-0 mt-0.5" />
                      <div className="flex flex-col min-w-0">
                        <span className="text-[9px] text-[var(--text-tertiary)] uppercase font-bold tracking-wider">Start Time</span>
                        <span className="font-medium text-[var(--text-primary)] text-[11px] truncate mt-0.5">
                          {startDateStr ? formatDateTimeInTZ(startDateStr, timezone) : "Immediate"}
                        </span>
                      </div>
                    </div>

                    {/* Cutoff / End Time */}
                    <div className="flex items-start gap-1.5 p-1.5 rounded-md bg-[var(--bg-surface-2)]/60 border border-[var(--border-subtle)]">
                      <Calendar className="size-3.5 text-[var(--pri)] shrink-0 mt-0.5" />
                      <div className="flex flex-col min-w-0">
                        <span className="text-[9px] text-[var(--text-tertiary)] uppercase font-bold tracking-wider">End Time</span>
                        <span className={cn("font-medium text-[11px] truncate mt-0.5", isExpired ? "text-rose-500 font-bold" : "text-[var(--text-primary)]")}>
                          {cutoffDateStr ? formatDateTimeInTZ(cutoffDateStr, timezone) : "No Cutoff"}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleOpenEditTierModal(t)}
                  className="w-full h-7 text-[10px] font-bold border-[var(--border-default)] hover:border-[var(--pri)] hover:text-[var(--pri)] transition-colors cursor-pointer"
                >
                  Edit Rates & Schedule
                </Button>
              </div>
            );
          })}
        </div>
      </div>

      {/* Pricing Matrix Table */}
      <Panel title="Roles & Pricing Matrix" className="p-0 overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-xs text-[var(--text-secondary)]">
            Loading live pass categories and rates...
          </div>
        ) : activeRoles.length === 0 ? (
          <div className="text-center py-16 text-xs text-[var(--text-secondary)] space-y-3">
            <p>No active pass categories configured yet for this event.</p>
            <Button
              size="sm"
              onClick={handleOpenNewTierModal}
              className="bg-[var(--pri)] text-[var(--primary-contrast)] font-bold text-xs cursor-pointer"
            >
              Configure First Tier
            </Button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse min-w-[600px]">
              <thead className="bg-[var(--bg-surface-2)] border-b border-[var(--border-subtle)] shadow-sm">
                <tr className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-secondary)]">
                  <th className="p-3.5 pl-5 w-12 text-center text-[10px] font-bold text-[var(--text-tertiary)] uppercase tracking-wider">#</th>
                  <th className="p-3.5">Role / Pass Category</th>
                  <th className="p-3.5">Category Group</th>
                  {tiers.map((t, idx) => (
                    <th
                      key={t}
                      className={cn(
                        "p-3.5 text-right font-mono",
                        idx === tiers.length - 1 && "pr-5",
                        t === activeTier && "text-[var(--pri)] bg-[var(--pri)]/5"
                      )}
                    >
                      <div className="flex items-center justify-end gap-1.5">
                        <span>{t} ({currencySymbol})</span>
                        {t === activeTier && (
                          <span className="size-1.5 rounded-full bg-[var(--pri)] inline-block" title="Currently active tier" />
                        )}
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-subtle)] bg-[var(--card)]">
                {activeRoles.map((role, rIdx) => {
                  return (
                    <tr
                      key={role.id}
                      className="hover:bg-[var(--bg-surface-hover)] transition-colors group"
                    >
                      <td className="p-3.5 pl-5 w-12 text-center font-mono text-xs text-[var(--text-tertiary)] font-bold">
                        {rIdx + 1}
                      </td>
                      <td className="p-3.5">
                        <div className="flex flex-col">
                          <span className="font-bold text-xs text-[var(--text-primary)]">
                            {role.name}
                          </span>
                          {(role.role_code || role.code) && (
                            <span className="text-[10px] text-[var(--text-tertiary)] font-mono uppercase">
                              Code: {role.role_code || role.code}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="p-3.5 text-xs text-[var(--text-secondary)]">
                        {role.category || "General Attendees"}
                      </td>
                      {tiers.map((t, idx) => {
                        const priceKey = `${role.name}_${t}`;
                        const priceVal = pricing[priceKey];
                        const isCurrent = t === activeTier;
                        const isNumericAndPositive =
                          priceVal !== undefined &&
                          priceVal !== "" &&
                          !isNaN(parseFloat(priceVal)) &&
                          parseFloat(priceVal) > 0;

                        return (
                          <td
                            key={t}
                            className={cn(
                              "p-3.5 text-right font-mono font-bold text-xs",
                              idx === tiers.length - 1 && "pr-5",
                              isCurrent ? "bg-[var(--pri)]/5 text-[var(--pri)]" : "text-[var(--text-primary)]"
                            )}
                          >
                            {isNumericAndPositive ? (
                              <span>
                                {currencySymbol} {parseFloat(priceVal).toLocaleString()}
                              </span>
                            ) : (
                              <span className="text-emerald-500 font-semibold uppercase text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/20">
                                Free
                              </span>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      {/* ── 2-STEP SINGLE-TIER CONFIGURATION MODAL ── */}
      <AnimatePresence>
        {isModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
            <motion.div
              initial={{ scale: 0.95, opacity: 0, y: 15 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 15 }}
              className="w-full max-w-3xl max-h-[90vh] bg-[var(--card)] border border-[var(--border-default)] rounded-xl shadow-2xl overflow-hidden flex flex-col text-[var(--text-primary)]"
            >
              {/* Modal Header */}
              <div className="p-5 border-b border-[var(--border-subtle)] bg-[var(--bg-surface-2)] flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="size-9 rounded-lg bg-[var(--pri)]/10 text-[var(--pri)] flex items-center justify-center border border-[var(--pri)]/20">
                    <Tag className="size-4.5" />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-[var(--text-primary)] flex items-center gap-2">
                      {editingTierOriginalName ? `Edit Tier: ${editingTierOriginalName}` : "Create Pricing Tier"}
                    </h3>
                    <p className="text-[11px] text-[var(--text-secondary)]">
                      Configure schedule availability window and delegate role ticket rates.
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="size-8 rounded-md border border-[var(--border-default)] bg-[var(--card)] flex items-center justify-center text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors cursor-pointer shadow-sm"
                >
                  <X className="size-4" />
                </button>
              </div>

              {/* Step Navigation Tabs */}
              <div className="flex border-b border-[var(--border-subtle)] bg-[var(--card)] px-5">
                <button
                  type="button"
                  onClick={() => setModalStep(1)}
                  className={cn(
                    "py-3 px-4 text-xs font-semibold border-b-2 transition-all flex items-center gap-2 cursor-pointer",
                    modalStep === 1
                      ? "border-[var(--pri)] text-[var(--pri)] font-bold bg-[var(--pri)]/5"
                      : "border-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                  )}
                >
                  <span className="size-5 rounded-full bg-[var(--bg-surface-2)] border border-[var(--border-default)] text-[10px] flex items-center justify-center font-mono">1</span>
                  Tier Name & Availability Schedule
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (!tierName.trim()) {
                      toast.error("Please enter a tier name first.");
                      return;
                    }
                    setModalStep(2);
                  }}
                  className={cn(
                    "py-3 px-4 text-xs font-semibold border-b-2 transition-all flex items-center gap-2 cursor-pointer",
                    modalStep === 2
                      ? "border-[var(--pri)] text-[var(--pri)] font-bold bg-[var(--pri)]/5"
                      : "border-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                  )}
                >
                  <span className="size-5 rounded-full bg-[var(--bg-surface-2)] border border-[var(--border-default)] text-[10px] flex items-center justify-center font-mono">2</span>
                  Role Pricing Rates
                </button>
              </div>

              {/* Modal Body */}
              <div className="flex-1 overflow-y-auto p-5 space-y-5 text-xs custom-scrollbar">
                {/* ── STEP 1: TIER NAME & SCHEDULE DATES ── */}
                {modalStep === 1 && (
                  <div className="space-y-6 max-w-2xl mx-auto py-2">
                    {/* Tier Name */}
                    <div className="space-y-2">
                      <label className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-tertiary)] block">
                        Tier Name *
                      </label>
                      <Input
                        required
                        value={tierName}
                        onChange={(e) => setTierName(e.target.value)}
                        placeholder="e.g. Early Bird, Standard, Late Registration"
                        className="h-10 bg-[var(--bg-surface-2)] border-[var(--border-default)] text-sm font-semibold rounded-lg"
                      />
                      {/* Quick Presets */}
                      <div className="flex flex-wrap items-center gap-1.5 pt-1.5">
                        <span className="text-[10px] text-[var(--text-tertiary)]">Presets:</span>
                        {TIER_PRESETS.map((preset) => (
                          <button
                            key={preset}
                            type="button"
                            onClick={() => setTierName(preset)}
                            className={cn(
                              "text-[10px] font-semibold px-2.5 py-1 rounded border transition-colors cursor-pointer",
                              tierName === preset
                                ? "bg-[var(--pri)] text-[var(--primary-contrast)] border-[var(--pri)] font-bold shadow-sm"
                                : "bg-[var(--card)] border-[var(--border-default)] text-[var(--text-secondary)] hover:text-[var(--pri)] hover:border-[var(--pri)]"
                            )}
                          >
                            {preset}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Single Column Schedule Configuration with Split Date/Time */}
                    <div className="space-y-5 pt-2 border-t border-[var(--border-subtle)]">
                      {/* Start Date & Time (Available From) */}
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between">
                          <label className="text-xs font-bold text-[var(--text-primary)] flex items-center gap-1.5">
                            <Clock className="size-3.5 text-[var(--pri)]" />
                            Start Date & Time (Available From)
                          </label>
                          <span className="text-[10px] text-[var(--text-tertiary)] font-mono">
                            {timezone}
                          </span>
                        </div>

                        <DateTimePickerWithTZ
                          value={tierStartTime}
                          onChange={(iso) => setTierStartTime(iso)}
                          timezone={timezone}
                          placeholder="Select start date & time..."
                          defaultTime="00:00"
                        />

                        <p className="text-[10px] text-[var(--text-secondary)] leading-relaxed">
                          When this tier opens for registrations in <strong>{timezone}</strong>. Leave empty for immediate availability.
                        </p>
                      </div>

                      {/* Cutoff / Last Date (Available Until) */}
                      <div className="space-y-1.5 pt-2 border-t border-[var(--border-subtle)]">
                        <div className="flex items-center justify-between">
                          <label className="text-xs font-bold text-[var(--text-primary)] flex items-center gap-1.5">
                            <Calendar className="size-3.5 text-[var(--pri)]" />
                            Last Date & Time (Available Until)
                          </label>
                          <span className="text-[10px] text-[var(--text-tertiary)] font-mono">
                            {timezone}
                          </span>
                        </div>

                        <DateTimePickerWithTZ
                          value={tierCutoff}
                          onChange={(iso) => setTierCutoff(iso)}
                          timezone={timezone}
                          placeholder="Select cutoff date & time..."
                          defaultTime="23:59"
                        />

                        <p className="text-[10px] text-[var(--text-secondary)] leading-relaxed">
                          Cutoff expiration in <strong>{timezone}</strong>. Attendees automatically roll over to next tier after this.
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                {/* ── STEP 2: ROLE PRICING MATRIX (2-COLUMN GRID) ── */}
                {modalStep === 2 && (
                  <div className="space-y-4">
                    {/* Batch "Apply Same Price to All Roles" Bar */}
                    <div className="p-4 rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface-2)] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-1.5 font-bold text-xs text-[var(--text-primary)]">
                          <Copy className="size-3.5 text-[var(--pri)]" />
                          Apply Same Price to All Roles
                        </div>
                        <p className="text-[11px] text-[var(--text-secondary)] mt-0.5">
                          Set a uniform base fee across all active roles for <strong className="text-[var(--pri)]">{tierName}</strong>.
                        </p>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <div className="relative">
                          <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs font-mono text-[var(--text-tertiary)]">
                            {currencySymbol}
                          </span>
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            placeholder="5000"
                            value={batchUniformPrice}
                            onChange={(e) => setBatchUniformPrice(e.target.value)}
                            className="h-8 w-28 pl-6 pr-2 rounded-md border border-[var(--border-default)] bg-[var(--card)] text-xs font-mono font-bold text-[var(--text-primary)] focus:outline-none focus:border-[var(--pri)]"
                          />
                        </div>
                        <Button
                          type="button"
                          size="sm"
                          onClick={handleApplySamePriceToAllRoles}
                          className="h-8 px-3 bg-[var(--pri)] text-[var(--primary-contrast)] font-bold text-xs rounded-md shrink-0 cursor-pointer shadow-sm"
                        >
                          Apply to All
                        </Button>
                      </div>
                    </div>

                    {/* Roles 2-Column Grid (Single unified scrollbar) */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <label className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-tertiary)] block">
                          Role Pricing for {tierName} ({currencySymbol} {currency})
                        </label>
                        <span className="text-[10px] text-[var(--text-secondary)]">
                          Leave 0 or empty for Free / Complimentary
                        </span>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 p-1">
                        {activeRoles.map((role) => (
                          <div
                            key={role.id}
                            className="p-3 rounded-lg border border-[var(--border-default)] bg-[var(--card)] flex items-center justify-between gap-3 shadow-sm hover:border-[var(--pri)]/40 transition-colors"
                          >
                            <div className="min-w-0 flex-1">
                              <span className="font-bold text-xs text-[var(--text-primary)] block truncate">
                                {role.name}
                              </span>
                              <span className="text-[10px] text-[var(--text-tertiary)] block truncate">
                                {role.category || "General"}
                              </span>
                            </div>

                            <div className="flex items-center gap-1.5 shrink-0">
                              <span className="text-xs font-mono text-[var(--text-tertiary)]">
                                {currencySymbol}
                              </span>
                              <input
                                type="number"
                                min="0"
                                step="0.01"
                                placeholder="0.00"
                                value={tierRolePrices[role.name] !== undefined ? tierRolePrices[role.name] : ""}
                                onChange={(e) => {
                                  const val = e.target.value;
                                  setTierRolePrices((prev) => ({
                                    ...prev,
                                    [role.name]: val,
                                  }));
                                }}
                                className="h-8 w-28 text-right rounded-md border border-[var(--border-default)] bg-[var(--bg-surface-2)] px-2 text-xs font-mono font-bold text-[var(--text-primary)] focus:outline-none focus:border-[var(--pri)]"
                              />
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Modal Footer Controls */}
              <div className="p-4 border-t border-[var(--border-subtle)] bg-[var(--bg-surface-2)] flex items-center justify-between gap-2.5 shrink-0">
                <div>
                  {modalStep === 2 && (
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setModalStep(1)}
                      className="h-9 px-3 text-xs font-semibold border-[var(--border-default)] bg-[var(--card)] cursor-pointer flex items-center gap-1"
                    >
                      <ArrowLeft className="size-3.5" /> Back to Step 1
                    </Button>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setIsModalOpen(false)}
                    className="h-9 px-4 rounded-lg border border-[var(--border-default)] bg-[var(--card)] text-xs font-semibold text-[var(--text-secondary)] hover:bg-[var(--bg-surface-hover)] cursor-pointer"
                  >
                    Cancel
                  </Button>

                  {modalStep === 1 ? (
                    <Button
                      type="button"
                      onClick={() => {
                        if (!tierName.trim()) {
                          toast.error("Please enter or choose a tier name.");
                          return;
                        }
                        setModalStep(2);
                      }}
                      className="h-9 px-4 bg-[var(--pri)] text-[var(--primary-contrast)] font-bold text-xs rounded-lg shadow-sm border-0 cursor-pointer flex items-center gap-1.5"
                    >
                      Next: Set Role Pricing <ArrowRight className="size-3.5" />
                    </Button>
                  ) : (
                    <Button
                      type="button"
                      onClick={handleSaveTierConfig}
                      disabled={saving}
                      className="h-9 px-4 bg-[var(--pri)] hover:opacity-90 text-[var(--primary-contrast)] font-bold text-xs rounded-lg shadow-sm border-0 cursor-pointer flex items-center gap-1.5"
                    >
                      {saving ? (
                        <>
                          <Loader2 className="size-3.5 animate-spin" /> Saving Tier...
                        </>
                      ) : (
                        <>
                          <Save className="size-3.5" /> Save Tier & Pricing
                        </>
                      )}
                    </Button>
                  )}
                </div>
              </div>
            </motion.div>
          </div>
        )}

        {/* Add Pass Category Modal */}
        {isAddRoleModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
            <motion.div
              initial={{ scale: 0.95, opacity: 0, y: 15 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 15 }}
              className="w-full max-w-lg bg-[var(--card)] border border-[var(--border-default)] rounded-lg shadow-2xl overflow-hidden flex flex-col text-[var(--text-primary)]"
            >
              <form onSubmit={handleCreateRole}>
                {/* Header */}
                <div className="p-5 border-b border-[var(--border-subtle)] bg-[var(--bg-surface-2)] flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="size-8 rounded-lg bg-[var(--pri)]/10 text-[var(--pri)] flex items-center justify-center border border-[var(--pri)]/20">
                      <Plus className="size-4" />
                    </div>
                    <div>
                      <h3 className="text-base font-bold text-[var(--text-primary)]">
                        Add Pass Category / Role
                      </h3>
                      <p className="text-[11px] text-[var(--text-secondary)]">
                        Create a new attendee pass category for this event.
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsAddRoleModalOpen(false)}
                    className="size-8 rounded-md border border-[var(--border-default)] bg-[var(--card)] flex items-center justify-center text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors cursor-pointer shadow-sm"
                  >
                    <X className="size-4" />
                  </button>
                </div>

                {/* Body */}
                <div className="p-5 space-y-4 text-xs">
                  {/* Category Group */}
                  <div className="space-y-1.5">
                    <label className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-tertiary)] block">
                      Category Group *
                    </label>
                    <select
                      value={newRoleCategory}
                      onChange={(e) => setNewRoleCategory(e.target.value)}
                      className="w-full h-9 px-3 rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface-2)] text-xs font-semibold text-[var(--text-primary)] focus:outline-none focus:border-[var(--pri)]"
                    >
                      <option value="General Attendees">General Attendees</option>
                      <option value="Presentation Related">Presentation Related</option>
                      <option value="Business & Partners">Business & Partners</option>
                      <option value="Media & Public Relations">Media & Public Relations</option>
                      <option value="Event Operations">Event Operations</option>
                      <option value="Special Access">Special Access</option>
                      <option value="Session Specific">Session Specific</option>
                    </select>
                  </div>

                  {/* Role Name */}
                  <div className="space-y-1.5">
                    <label className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-tertiary)] block">
                      Category / Role Name *
                    </label>
                    <Input
                      required
                      value={newRoleName}
                      onChange={(e) => {
                        setNewRoleName(e.target.value);
                        if (!newRoleCode) {
                          const auto = e.target.value.replace(/[^A-Za-z0-9]/g, "").slice(0, 3).toUpperCase();
                          setNewRoleCode(auto);
                        }
                      }}
                      placeholder="e.g. Faculty Delegate, Research Scholar, VIP Guest"
                      className="h-9 bg-[var(--bg-surface-2)] border-[var(--border-default)] text-xs font-semibold rounded-lg"
                    />
                  </div>

                  {/* Quick Suggestions */}
                  <div className="space-y-1.5">
                    <span className="text-[10px] text-[var(--text-tertiary)] block">Quick Suggestions:</span>
                    <div className="flex flex-wrap gap-1.5">
                      {[
                        { name: "Faculty Delegate", code: "FAC" },
                        { name: "Research Scholar", code: "RES" },
                        { name: "Industry Professional", code: "IND" },
                        { name: "Corporate Attendee", code: "COR" },
                        { name: "Workshop Instructor", code: "INS" },
                        { name: "Investor", code: "INV" },
                        { name: "Startup Founder", code: "FND" },
                      ].map((item) => (
                        <button
                          key={item.name}
                          type="button"
                          onClick={() => {
                            setNewRoleName(item.name);
                            setNewRoleCode(item.code);
                          }}
                          className={cn(
                            "text-[10px] font-semibold px-2 py-0.5 rounded border transition-colors cursor-pointer",
                            newRoleName === item.name
                              ? "bg-[var(--pri)] text-[var(--primary-contrast)] border-[var(--pri)] font-bold shadow-sm"
                              : "bg-[var(--card)] border-[var(--border-default)] text-[var(--text-secondary)] hover:text-[var(--pri)] hover:border-[var(--pri)]"
                          )}
                        >
                          {item.name} ({item.code})
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Role Code */}
                  <div className="space-y-1.5">
                    <label className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-tertiary)] block">
                      Badge / Ticket Code (Optional)
                    </label>
                    <Input
                      maxLength={10}
                      value={newRoleCode}
                      onChange={(e) => setNewRoleCode(e.target.value.toUpperCase())}
                      placeholder="e.g. FAC, RES, DEL"
                      className="h-9 font-mono uppercase bg-[var(--bg-surface-2)] border-[var(--border-default)] text-xs font-semibold rounded-lg"
                    />
                    <p className="text-[10px] text-[var(--text-tertiary)]">
                      Used on badge prints, tickets, and entry gate scanning.
                    </p>
                  </div>
                </div>

                {/* Footer */}
                <div className="p-4 border-t border-[var(--border-subtle)] bg-[var(--bg-surface-2)] flex items-center justify-end gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setIsAddRoleModalOpen(false)}
                    className="h-8 px-3 rounded-md text-xs font-semibold"
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    disabled={addingRole || !newRoleName.trim()}
                    className="h-8 px-4 bg-[var(--pri)] text-[var(--primary-contrast)] font-bold text-xs rounded-md shadow-sm cursor-pointer"
                  >
                    {addingRole ? (
                      <>
                        <Loader2 className="size-3.5 animate-spin mr-1.5" /> Adding...
                      </>
                    ) : (
                      "Add Pass Category"
                    )}
                  </Button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </OrganiserPage>
  );
}
