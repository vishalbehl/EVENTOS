"use client";
// Quota control: max_speakers is enforced by the API before creation.

import { useEffect, useMemo, useState, useRef } from "react";
import { useLimitAccess } from "@/lib/capabilities";
import { motion, AnimatePresence } from "framer-motion";
import {
  X,
  UserPlus,
  Mail,
  Info,
  Check,
  Loader2,
  Calendar,
  Clock,
  Presentation,
  Plus,
  Trash2,
  Search,
  UserCheck,
  Sparkles,
  Layers,
  Tag,
} from "lucide-react";
import { useEmailTemplates } from "@/hooks/useEmails";
import { useSessions } from "@/hooks/useSessions";
import { usePosterCategories } from "@/hooks/usePosters";
import { useTracks, type TrackItem } from "@/hooks/useSpeakers";
import { apiGet, apiPost } from "@/lib/api-client";
import { SPEAKER_TYPES } from "@/types/backend";
import { cn, formatApiError } from "@/lib/utils";
import { toast } from "sonner";
import { useParams } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { COUNTRY_DIAL_CODES, getDialCodeForCountry } from "@/lib/country-dial-codes";
import { fetchCountryStates, CountryStateEntry, getStatesForCountry, fallbackCountryStates } from "@/lib/country-states";

interface RegisterSpeakerDialogProps {
  isOpen: boolean;
  onClose: () => void;
  eventId?: string;
}

interface FormField {
  id: string;
  name: string;
  label: string;
  type: string;
  is_default: boolean;
  is_required: boolean;
  is_active: boolean;
  options?: string[];
  placeholder?: string;
}

interface ParticipantSearchResult {
  id: string;
  regno?: string;
  name: string;
  first_name: string;
  last_name: string;
  email?: string;
  phone?: string;
  role: string;
  roles?: string[];
  company?: string;
  designation?: string;
  country?: string;
  state?: string;
  track_id?: string;
  custom_fields?: Record<string, any>;
}

const DEFAULT_FIELD_IDS = new Set([
  "name",
  "title",
  "first_name",
  "last_name",
  "email",
  "phone",
  "phone_dial_code",
  "company",
  "affiliation",
  "designation",
  "country",
  "state",
  "city",
  "role",
  "track_id",
  "paid_status",
]);

export function RegisterSpeakerDialog({
  isOpen,
  onClose,
  eventId: explicitEventId,
}: RegisterSpeakerDialogProps) {
  const speakerQuota = useLimitAccess("max_speakers");
  const params = useParams();
  const eventIdStr = explicitEventId ?? String(params.eventId ?? "");
  const queryClient = useQueryClient();

  const { data: templates } = useEmailTemplates(eventIdStr);
  const { data: sessions } = useSessions(eventIdStr);
  const { data: categories } = usePosterCategories(eventIdStr);
  const { data: tracks = [] } = useTracks(eventIdStr);

  const [mode, setMode] = useState<"manual" | "invite">("manual");
  const [loadingConfig, setLoadingConfig] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [fields, setFields] = useState<FormField[]>([]);
  const [countryStates, setCountryStates] = useState<CountryStateEntry[]>(fallbackCountryStates);

  // Form State
  const [formValues, setFormValues] = useState<Record<string, any>>({
    title: "Dr.",
    first_name: "",
    last_name: "",
    email: "",
    phone: "",
    phone_dial_code: "+91",
    affiliation: "",
    company: "",
    designation: "",
    country: "India",
    state: "",
    track_id: "",
    role: "Speaker",
    paid_status: "Unpaid",
    template_id: "",
  });

  // Participant Search & Linking State
  const [participantSearchQuery, setParticipantSearchQuery] = useState("");
  const [isSearchingParticipants, setIsSearchingParticipants] = useState(false);
  const [participantResults, setParticipantResults] = useState<ParticipantSearchResult[]>([]);
  const [isSearchDropdownOpen, setIsSearchDropdownOpen] = useState(false);
  const [selectedParticipant, setSelectedParticipant] = useState<ParticipantSearchResult | null>(null);
  const [roleAction, setRoleAction] = useState<"add_role" | "convert_role">("add_role");
  const searchContainerRef = useRef<HTMLDivElement>(null);

  // Talks State
  const [talks, setTalks] = useState<
    Array<{
      session_id: string;
      presentation_title: string;
      start_time: string;
      end_time: string;
      talk_duration_minutes: number;
      speaker_type: string;
      authors?: string;
      category?: string;
      abstract?: string;
    }>
  >([]);

  useEffect(() => {
    fetchCountryStates().then(setCountryStates);
  }, []);

  // Fetch Registration Form Config
  const fetchFormConfig = async () => {
    if (!eventIdStr) return;
    setLoadingConfig(true);
    try {
      const config = await apiGet<any>(`/events/${eventIdStr}/registration/form-config?t=${Date.now()}`);
      const configuredFields = (config?.fields || []).filter(
        (f: FormField) => f.id !== "role" && f.is_active
      );
      setFields(configuredFields);

      const defaults: Record<string, any> = {
        title: "Dr.",
        first_name: "",
        last_name: "",
        email: "",
        phone: "",
        phone_dial_code: "+91",
        affiliation: "",
        company: "",
        designation: "",
        country: "India",
        state: "",
        track_id: "",
        role: "Speaker",
        paid_status: "Unpaid",
        template_id: "",
      };

      configuredFields.forEach((field: FormField) => {
        if (field.type === "checkbox") defaults[field.id] = [];
        else if (field.id === "country") defaults[field.id] = "India";
        else if (field.id === "title") defaults[field.id] = "Dr.";
        else if (!defaults[field.id]) defaults[field.id] = "";
      });

      setFormValues(defaults);
    } catch (err: any) {
      // Fallback if form config is not present
      setFields([]);
    } finally {
      setLoadingConfig(false);
    }
  };

  useEffect(() => {
    if (isOpen && eventIdStr) {
      fetchFormConfig();
      setSelectedParticipant(null);
      setParticipantSearchQuery("");
      setParticipantResults([]);
      setRoleAction("add_role");
      setTalks([]);
      setMode("manual");
    }
  }, [isOpen, eventIdStr]);

  // Debounced search for registered participants
  useEffect(() => {
    if (!participantSearchQuery.trim() || participantSearchQuery.length < 2) {
      setParticipantResults([]);
      setIsSearchingParticipants(false);
      return;
    }

    const timer = setTimeout(async () => {
      setIsSearchingParticipants(true);
      try {
        const res = await apiGet<any>(
          `/events/${eventIdStr}/participants?search=${encodeURIComponent(participantSearchQuery)}&page_size=10`
        );
        const list = Array.isArray(res) ? res : res?.items || [];
        setParticipantResults(list);
        setIsSearchDropdownOpen(true);
      } catch {
        setParticipantResults([]);
      } finally {
        setIsSearchingParticipants(false);
      }
    }, 280);

    return () => clearTimeout(timer);
  }, [participantSearchQuery, eventIdStr]);

  // Close search dropdown on click outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (searchContainerRef.current && !searchContainerRef.current.contains(event.target as Node)) {
        setIsSearchDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const setValue = (id: string, value: any) => {
    setFormValues((prev) => ({ ...prev, [id]: value }));
  };

  const handleSelectParticipant = (p: ParticipantSearchResult) => {
    setSelectedParticipant(p);
    setIsSearchDropdownOpen(false);
    setParticipantSearchQuery(`${p.first_name || ""} ${p.last_name || ""}`.trim() || p.email || "");

    // Pre-fill form values with participant data
    setFormValues((prev) => ({
      ...prev,
      first_name: p.first_name || (p.name ? p.name.split(" ")[0] : ""),
      last_name: p.last_name || (p.name && p.name.includes(" ") ? p.name.split(" ").slice(1).join(" ") : ""),
      email: p.email || "",
      phone: p.phone ? p.phone.replace(/^\+\d+\s*/, "") : "",
      phone_dial_code: p.phone && p.phone.startsWith("+") ? p.phone.split(" ")[0] : prev.phone_dial_code || "+91",
      company: p.company || "",
      affiliation: p.company || prev.affiliation || "",
      designation: p.designation || "",
      country: p.country || "India",
      state: p.state || "",
      track_id: p.track_id || prev.track_id || "",
      ...(p.custom_fields || {}),
    }));

    toast.info(`Imported details for ${p.name || p.email}. Choose role assignment option below.`);
  };

  const handleClearSelectedParticipant = () => {
    setSelectedParticipant(null);
    setParticipantSearchQuery("");
    setRoleAction("add_role");
  };

  const addTalk = () => {
    setTalks([
      ...talks,
      {
        session_id: "",
        presentation_title: "",
        start_time: "",
        end_time: "",
        talk_duration_minutes: 0,
        speaker_type: "",
        authors: `${formValues.first_name} ${formValues.last_name}`.trim(),
        category: "",
        abstract: "",
      },
    ]);
  };

  const removeTalk = (index: number) => {
    setTalks(talks.filter((_, i) => i !== index));
  };

  const calculateDuration = (start: string, end: string) => {
    if (!start || !end) return 0;
    try {
      const diff = new Date(end).getTime() - new Date(start).getTime();
      return Math.max(0, Math.round(diff / (1000 * 60)));
    } catch {
      return 0;
    }
  };

  const updateTalk = (index: number, field: string, value: any) => {
    const next = [...talks];
    (next[index] as any)[field] = value;
    if (field === "start_time" || field === "end_time") {
      const st = field === "start_time" ? value : next[index].start_time;
      const et = field === "end_time" ? value : next[index].end_time;
      next[index].talk_duration_minutes = calculateDuration(st, et);
    }
    setTalks(next);
  };

  const buildPayload = () => {
    const custom_fields: Record<string, any> = {};

    fields.forEach((field) => {
      const val = formValues[field.id];
      if (!DEFAULT_FIELD_IDS.has(field.id) && !DEFAULT_FIELD_IDS.has(field.name)) {
        custom_fields[field.id] = val;
      }
    });

    const dial = formValues.phone_dial_code || "+91";
    const rawPhone = String(formValues.phone || "").trim();
    const formattedPhone = rawPhone
      ? rawPhone.startsWith("+")
        ? rawPhone
        : `${dial} ${rawPhone}`
      : undefined;

    return {
      title: formValues.title || undefined,
      first_name: (formValues.first_name || "").trim(),
      last_name: (formValues.last_name || "").trim(),
      email: (formValues.email || "").trim(),
      phone: formattedPhone,
      company: formValues.company || formValues.affiliation || undefined,
      affiliation: formValues.affiliation || formValues.company || undefined,
      designation: formValues.designation || undefined,
      country: formValues.country || undefined,
      state: formValues.state || undefined,
      track_id: formValues.track_id || undefined,
      role: "Speaker",
      participant_id: selectedParticipant?.id || undefined,
      role_action: selectedParticipant ? roleAction : "none",
      custom_fields,
      talks: mode === "manual" ? talks : [],
      send_invite: mode === "invite",
      template_id: formValues.template_id || undefined,
    };
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formValues.first_name || !formValues.last_name || !formValues.email) {
      toast.error("Please fill in first name, last name, and email.");
      return;
    }

    if (mode === "manual" && talks.some((t) => !t.session_id)) {
      toast.error("Please select a session for each talk assignment.");
      return;
    }

    setSubmitting(true);
    try {
      const payload = buildPayload();
      await apiPost(
        `/events/${eventIdStr}/speakers/manual-register`,
        payload,
        { headers: { "Idempotency-Key": crypto.randomUUID() } }
      );

      toast.success(
        mode === "manual"
          ? selectedParticipant
            ? "Participant successfully assigned Speaker role."
            : "Speaker successfully registered."
          : "Speaker invitation dispatched."
      );

      queryClient.invalidateQueries({ queryKey: ["speakers", eventIdStr] });
      queryClient.invalidateQueries({ queryKey: ["participants", eventIdStr] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-stats", eventIdStr] });
      onClose();
    } catch (err: any) {
      toast.error(formatApiError(err, "Failed to register speaker."));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60">
          <motion.div
            initial={{ scale: 0.96, opacity: 0, y: 8 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.96, opacity: 0, y: 8 }}
            transition={{ duration: 0.15 }}
            className="w-full max-w-3xl rounded-lg border border-[var(--border-default)] bg-[var(--card)] p-6 shadow-md flex flex-col max-h-[92vh] overflow-hidden space-y-4"
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b border-[var(--border-subtle)] pb-3">
              <div className="flex items-center gap-2.5">
                <div className="flex size-8 items-center justify-center rounded-lg bg-[var(--pri)]/10 text-[var(--pri)] border border-[var(--pri)]/20">
                  <UserPlus className="size-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-[var(--text-primary)]">
                    {selectedParticipant ? "Add Registered Participant as Speaker" : "Register Speaker"}
                  </h3>
                  <p className="text-[11px] text-[var(--text-secondary)]">
                    Unified registration form with track binding and multi-role participant conversion.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="rounded-md p-1 text-[var(--text-tertiary)] hover:bg-[var(--bg-surface-hover)] hover:text-[var(--text-primary)] transition-colors cursor-pointer"
              >
                <X className="size-4" />
              </button>
            </div>

            {/* Top Bar: Participant Search & Mode Switcher */}
            <div className="space-y-3">
              {/* Participant Quick-Fetch Combobox */}
              <div ref={searchContainerRef} className="relative">
                <div className="flex items-center justify-between gap-2">
                  <label className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-tertiary)] flex items-center gap-1.5">
                    <Search className="size-3 text-[var(--pri)]" />
                    Fetch Registered Participant (Optional)
                  </label>
                  {selectedParticipant && (
                    <button
                      type="button"
                      onClick={handleClearSelectedParticipant}
                      className="text-[11px] font-semibold text-rose-500 hover:underline cursor-pointer"
                    >
                      Clear & Enter New Speaker
                    </button>
                  )}
                </div>

                <div className="relative mt-1">
                  <input
                    type="text"
                    value={participantSearchQuery}
                    onChange={(e) => {
                      setParticipantSearchQuery(e.target.value);
                      setIsSearchDropdownOpen(true);
                    }}
                    onFocus={() => {
                      if (participantResults.length > 0) setIsSearchDropdownOpen(true);
                    }}
                    placeholder="Search participant by name, email, or registration #..."
                    className="h-9 w-full rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface-2)] pl-9 pr-8 text-xs text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:border-[var(--pri)] focus:outline-none"
                  />
                  <Search className="absolute left-3 top-2.5 size-3.5 text-[var(--text-tertiary)]" />
                  {isSearchingParticipants && (
                    <Loader2 className="absolute right-3 top-2.5 size-3.5 animate-spin text-[var(--pri)]" />
                  )}
                </div>

                {/* Dropdown Results */}
                {isSearchDropdownOpen && participantResults.length > 0 && (
                  <div className="absolute left-0 right-0 top-full z-20 mt-1 max-h-56 overflow-y-auto rounded-lg border border-[var(--border-default)] bg-[var(--card)] p-1 shadow-md">
                    {participantResults.map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => handleSelectParticipant(p)}
                        className="flex w-full items-center justify-between rounded-md p-2 text-left text-xs transition-colors hover:bg-[var(--bg-surface-hover)] cursor-pointer"
                      >
                        <div className="flex flex-col">
                          <span className="font-bold text-[var(--text-primary)]">
                            {p.name || `${p.first_name || ""} ${p.last_name || ""}`.trim()}
                          </span>
                          <span className="text-[10px] text-[var(--text-secondary)]">
                            {p.email} • Reg #{p.regno || "N/A"}
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <span className="rounded bg-[var(--surface-subtle)] px-2 py-0.5 text-[10px] font-medium text-[var(--text-secondary)]">
                            {p.role || "Delegate"}
                          </span>
                          <span className="text-[11px] font-semibold text-[var(--pri)]">Select →</span>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Multi-Role Option Banner if Participant Selected */}
              {selectedParticipant && (
                <div className="rounded-lg border border-[var(--pri)]/30 bg-[var(--pri)]/5 p-3 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <UserCheck className="size-4 text-[var(--pri)]" />
                      <span className="text-xs font-bold text-[var(--text-primary)]">
                        Participant Linked: {selectedParticipant.name || selectedParticipant.email}
                      </span>
                    </div>
                    <span className="rounded-full bg-[var(--pri)]/20 px-2 py-0.5 text-[10px] font-bold text-[var(--pri)]">
                      Current Role: {selectedParticipant.role || "Delegate"}
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                    <label
                      onClick={() => setRoleAction("add_role")}
                      className={cn(
                        "flex items-start gap-2.5 rounded-lg border p-2.5 cursor-pointer transition-colors",
                        roleAction === "add_role"
                          ? "border-[var(--pri)] bg-[var(--card)] shadow-xs"
                          : "border-[var(--border-default)] bg-[var(--surface-subtle)] hover:bg-[var(--card)]"
                      )}
                    >
                      <input
                        type="radio"
                        name="role_action"
                        checked={roleAction === "add_role"}
                        onChange={() => setRoleAction("add_role")}
                        className="mt-0.5 accent-[var(--pri)]"
                      />
                      <div className="flex flex-col">
                        <span className="font-bold text-[var(--text-primary)]">Keep Role & Add Speaker</span>
                        <span className="text-[11px] text-[var(--text-secondary)]">
                          Retains primary role ({selectedParticipant.role || "Delegate"}) while adding Speaker credentials & talks.
                        </span>
                      </div>
                    </label>

                    <label
                      onClick={() => setRoleAction("convert_role")}
                      className={cn(
                        "flex items-start gap-2.5 rounded-lg border p-2.5 cursor-pointer transition-colors",
                        roleAction === "convert_role"
                          ? "border-[var(--pri)] bg-[var(--card)] shadow-xs"
                          : "border-[var(--border-default)] bg-[var(--surface-subtle)] hover:bg-[var(--card)]"
                      )}
                    >
                      <input
                        type="radio"
                        name="role_action"
                        checked={roleAction === "convert_role"}
                        onChange={() => setRoleAction("convert_role")}
                        className="mt-0.5 accent-[var(--pri)]"
                      />
                      <div className="flex flex-col">
                        <span className="font-bold text-[var(--text-primary)]">Convert Primary Role</span>
                        <span className="text-[11px] text-[var(--text-secondary)]">
                          Replaces primary badge role with Speaker category.
                        </span>
                      </div>
                    </label>
                  </div>
                </div>
              )}

              {/* Mode Switcher */}
              <div className="flex items-center rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface-2)] p-1 gap-1 w-fit">
                <button
                  type="button"
                  onClick={() => setMode("manual")}
                  className={cn(
                    "flex items-center gap-1.5 rounded-md px-3 py-1 text-xs font-semibold transition-colors cursor-pointer",
                    mode === "manual"
                      ? "bg-[var(--pri)] text-[var(--primary-contrast)] shadow-sm font-bold"
                      : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                  )}
                >
                  <Info className="size-3.5" /> Manual Entry & Talks
                </button>
                <button
                  type="button"
                  onClick={() => setMode("invite")}
                  className={cn(
                    "flex items-center gap-1.5 rounded-md px-3 py-1 text-xs font-semibold transition-colors cursor-pointer",
                    mode === "invite"
                      ? "bg-[var(--pri)] text-[var(--primary-contrast)] shadow-sm font-bold"
                      : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                  )}
                >
                  <Mail className="size-3.5" /> Quick Intake Invite
                </button>
              </div>
            </div>

            {/* Form Body */}
            <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto space-y-4 pr-1 min-h-0">
              {loadingConfig ? (
                <div className="flex h-32 items-center justify-center">
                  <Loader2 className="size-6 animate-spin text-[var(--pri)]" />
                </div>
              ) : (
                <>
                  {/* Personal & Name Info */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div className="space-y-1">
                      <label className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-tertiary)] block mb-1">
                        Title
                      </label>
                      <select
                        value={formValues.title || "Dr."}
                        onChange={(e) => setValue("title", e.target.value)}
                        className="h-9 w-full rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface-2)] px-3 text-xs text-[var(--text-primary)] focus:border-[var(--pri)] focus:outline-none cursor-pointer"
                      >
                        <option value="Dr.">Dr.</option>
                        <option value="Prof.">Prof.</option>
                        <option value="Mr.">Mr.</option>
                        <option value="Ms.">Ms.</option>
                        <option value="Mrs.">Mrs.</option>
                        <option value="Hon.">Hon.</option>
                      </select>
                    </div>

                    <div className="space-y-1">
                      <label className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-tertiary)] block mb-1">
                        First Name <span className="text-rose-500">*</span>
                      </label>
                      <input
                        required
                        value={formValues.first_name || ""}
                        onChange={(e) => setValue("first_name", e.target.value)}
                        placeholder="e.g. Alan"
                        className="h-9 w-full rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface-2)] px-3 text-xs text-[var(--text-primary)] focus:border-[var(--pri)] focus:outline-none"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-tertiary)] block mb-1">
                        Last Name <span className="text-rose-500">*</span>
                      </label>
                      <input
                        required
                        value={formValues.last_name || ""}
                        onChange={(e) => setValue("last_name", e.target.value)}
                        placeholder="e.g. Turing"
                        className="h-9 w-full rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface-2)] px-3 text-xs text-[var(--text-primary)] focus:border-[var(--pri)] focus:outline-none"
                      />
                    </div>
                  </div>

                  {/* Email & Phone */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-tertiary)] block mb-1">
                        Email Address <span className="text-rose-500">*</span>
                      </label>
                      <input
                        required
                        type="email"
                        value={formValues.email || ""}
                        onChange={(e) => setValue("email", e.target.value)}
                        placeholder="speaker@conference.org"
                        className="h-9 w-full rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface-2)] px-3 text-xs text-[var(--text-primary)] focus:border-[var(--pri)] focus:outline-none"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-tertiary)] block mb-1">
                        Phone Number
                      </label>
                      <div className="flex gap-1.5">
                        <select
                          value={formValues.phone_dial_code || "+91"}
                          onChange={(e) => setValue("phone_dial_code", e.target.value)}
                          className="h-9 w-28 shrink-0 rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface-2)] px-2 text-xs font-mono text-[var(--text-primary)] focus:border-[var(--pri)] focus:outline-none cursor-pointer"
                        >
                          {COUNTRY_DIAL_CODES.map((c) => (
                            <option key={`${c.code}-${c.dial_code}`} value={c.dial_code}>
                              {c.flag} {c.dial_code}
                            </option>
                          ))}
                        </select>
                        <input
                          type="tel"
                          placeholder="Mobile number"
                          value={formValues.phone || ""}
                          onChange={(e) => setValue("phone", e.target.value)}
                          className="h-9 flex-1 rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface-2)] px-3 text-xs text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:border-[var(--pri)] focus:outline-none"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Role Binding & Track Selection */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3 rounded-lg border border-[var(--border-default)] bg-[var(--surface-subtle)]">
                    <div className="space-y-1">
                      <label className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-tertiary)] flex items-center gap-1.5 mb-1">
                        <Tag className="size-3 text-[var(--pri)]" />
                        Assigned Role (Bound)
                      </label>
                      <div className="flex h-9 w-full items-center justify-between rounded-lg border border-[var(--border-default)] bg-[var(--card)] px-3 text-xs font-bold text-[var(--text-primary)]">
                        <span>Speaker</span>
                        <span className="rounded bg-[var(--pri)]/10 px-2 py-0.5 text-[10px] text-[var(--pri)]">
                          Fixed to Speaker
                        </span>
                      </div>
                    </div>

                    <div className="space-y-1">
                      <label className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-tertiary)] flex items-center gap-1.5 mb-1">
                        <Layers className="size-3 text-[var(--pri)]" />
                        Event Track
                      </label>
                      <select
                        value={formValues.track_id || ""}
                        onChange={(e) => setValue("track_id", e.target.value)}
                        className="h-9 w-full rounded-lg border border-[var(--border-default)] bg-[var(--card)] px-3 text-xs text-[var(--text-primary)] focus:border-[var(--pri)] focus:outline-none cursor-pointer"
                      >
                        <option value="">No specific track (General)</option>
                        {tracks.map((t: TrackItem) => (
                          <option key={t.id} value={t.id}>
                            {t.name} {t.code ? `(${t.code})` : ""}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {/* Affiliation & Designation */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-tertiary)] block mb-1">
                        Affiliation / Organization
                      </label>
                      <input
                        value={formValues.affiliation || formValues.company || ""}
                        onChange={(e) => {
                          setValue("affiliation", e.target.value);
                          setValue("company", e.target.value);
                        }}
                        placeholder="Cambridge University / AI Hospital"
                        className="h-9 w-full rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface-2)] px-3 text-xs text-[var(--text-primary)] focus:border-[var(--pri)] focus:outline-none"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-tertiary)] block mb-1">
                        Designation / Title
                      </label>
                      <input
                        value={formValues.designation || ""}
                        onChange={(e) => setValue("designation", e.target.value)}
                        placeholder="Professor / Head of Department"
                        className="h-9 w-full rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface-2)] px-3 text-xs text-[var(--text-primary)] focus:border-[var(--pri)] focus:outline-none"
                      />
                    </div>
                  </div>

                  {/* Country & State */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-tertiary)] block mb-1">
                        Country
                      </label>
                      <select
                        value={formValues.country || "India"}
                        onChange={(e) => {
                          const newCountry = e.target.value;
                          setValue("country", newCountry);
                          setValue("phone_dial_code", getDialCodeForCountry(newCountry));
                          setValue("state", "");
                        }}
                        className="h-9 w-full rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface-2)] px-3 text-xs text-[var(--text-primary)] focus:border-[var(--pri)] focus:outline-none cursor-pointer"
                      >
                        <option value="">Select country</option>
                        {countryStates.map((item) => (
                          <option key={item.country} value={item.country}>
                            {item.country}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="space-y-1">
                      <label className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-tertiary)] block mb-1">
                        State / Province
                      </label>
                      {getStatesForCountry(countryStates, formValues.country || "").length > 0 ? (
                        <select
                          value={formValues.state || ""}
                          onChange={(e) => setValue("state", e.target.value)}
                          className="h-9 w-full rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface-2)] px-3 text-xs text-[var(--text-primary)] focus:border-[var(--pri)] focus:outline-none cursor-pointer"
                        >
                          <option value="">Select state / province</option>
                          {getStatesForCountry(countryStates, formValues.country || "").map((st) => (
                            <option key={st} value={st}>
                              {st}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <input
                          type="text"
                          placeholder="Enter state or province"
                          value={formValues.state || ""}
                          onChange={(e) => setValue("state", e.target.value)}
                          className="h-9 w-full rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface-2)] px-3 text-xs text-[var(--text-primary)] focus:border-[var(--pri)] focus:outline-none"
                        />
                      )}
                    </div>
                  </div>

                  {/* Dynamic Custom Fields from Form Config */}
                  {fields.map((field) => {
                    if (DEFAULT_FIELD_IDS.has(field.id) || DEFAULT_FIELD_IDS.has(field.name)) {
                      return null;
                    }
                    return (
                      <div key={field.id} className="space-y-1">
                        <label className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-tertiary)] block mb-1">
                          {field.label} {field.is_required && <span className="text-rose-500">*</span>}
                        </label>
                        <input
                          type="text"
                          value={formValues[field.id] || ""}
                          onChange={(e) => setValue(field.id, e.target.value)}
                          placeholder={field.placeholder || `Enter ${field.label}`}
                          className="h-9 w-full rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface-2)] px-3 text-xs text-[var(--text-primary)] focus:border-[var(--pri)] focus:outline-none"
                        />
                      </div>
                    );
                  })}

                  {/* Quick Invite Email Template Selector */}
                  {mode === "invite" && (
                    <div className="space-y-1 p-3 rounded-lg border border-[var(--border-default)] bg-[var(--surface-subtle)]">
                      <label className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-tertiary)] flex items-center gap-1.5 mb-1">
                        <Mail className="size-3.5 text-[var(--pri)]" />
                        Invitation Email Template
                      </label>
                      <select
                        value={formValues.template_id || ""}
                        onChange={(e) => setValue("template_id", e.target.value)}
                        className="h-9 w-full rounded-lg border border-[var(--border-default)] bg-[var(--card)] px-3 text-xs text-[var(--text-primary)] focus:border-[var(--pri)] focus:outline-none cursor-pointer"
                      >
                        <option value="">Default Speaker Invitation Template</option>
                        {(templates || []).map((t: any) => (
                          <option key={t.id} value={t.id}>
                            {t.name} ({t.subject})
                          </option>
                        ))}
                      </select>
                      <p className="text-[11px] text-[var(--text-secondary)] mt-1">
                        An email with a magic upload token will be dispatched directly to this speaker.
                      </p>
                    </div>
                  )}

                  {/* Talk / Session Assignments (Manual Mode) */}
                  {mode === "manual" && (
                    <div className="space-y-3 pt-2">
                      <div className="flex items-center justify-between border-t border-[var(--border-subtle)] pt-3">
                        <div>
                          <h4 className="text-xs font-bold text-[var(--text-primary)]">
                            Assigned Talks & Sessions ({talks.length})
                          </h4>
                          <p className="text-[11px] text-[var(--text-secondary)]">
                            Optionally connect this speaker directly into the schedule.
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={addTalk}
                          className="flex items-center gap-1 rounded-md bg-[var(--pri)]/10 px-2.5 py-1 text-xs font-bold text-[var(--pri)] hover:bg-[var(--pri)]/20 transition-colors cursor-pointer"
                        >
                          <Plus className="size-3" /> Add Talk
                        </button>
                      </div>

                      {talks.map((talk, idx) => (
                        <div
                          key={idx}
                          className="rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface-2)] p-3 space-y-3"
                        >
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-bold text-[var(--text-primary)]">
                              Talk #{idx + 1}
                            </span>
                            <button
                              type="button"
                              onClick={() => removeTalk(idx)}
                              className="text-rose-500 hover:text-rose-600 p-1 cursor-pointer"
                            >
                              <Trash2 className="size-3.5" />
                            </button>
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                            <div className="space-y-1">
                              <label className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-tertiary)] block">
                                Session *
                              </label>
                              <select
                                required
                                value={talk.session_id}
                                onChange={(e) => updateTalk(idx, "session_id", e.target.value)}
                                className="h-8 w-full rounded-md border border-[var(--border-default)] bg-[var(--card)] px-2 text-xs text-[var(--text-primary)] focus:border-[var(--pri)] focus:outline-none cursor-pointer"
                              >
                                <option value="">Select session...</option>
                                {(sessions || []).map((s: any) => (
                                  <option key={s.id} value={s.id}>
                                    {s.name} ({s.session_code || "No code"})
                                  </option>
                                ))}
                              </select>
                            </div>

                            <div className="space-y-1">
                              <label className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-tertiary)] block">
                                Presentation Title
                              </label>
                              <input
                                value={talk.presentation_title}
                                onChange={(e) => updateTalk(idx, "presentation_title", e.target.value)}
                                placeholder="Keynote or talk title"
                                className="h-8 w-full rounded-md border border-[var(--border-default)] bg-[var(--card)] px-2 text-xs text-[var(--text-primary)] focus:border-[var(--pri)] focus:outline-none"
                              />
                            </div>

                            <div className="space-y-1">
                              <label className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-tertiary)] block">
                                Speaker Designation / Type
                              </label>
                              <select
                                value={talk.speaker_type || ""}
                                onChange={(e) => updateTalk(idx, "speaker_type", e.target.value)}
                                className="h-8 w-full rounded-md border border-[var(--border-default)] bg-[var(--card)] px-2 text-xs text-[var(--text-primary)] focus:border-[var(--pri)] focus:outline-none cursor-pointer"
                              >
                                <option value="">Select speaker type...</option>
                                {SPEAKER_TYPES.map((st) => (
                                  <option key={st.code} value={st.code}>
                                    {st.label}
                                  </option>
                                ))}
                              </select>
                            </div>

                            <div className="space-y-1">
                              <label className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-tertiary)] block">
                                Talk Duration (Minutes)
                              </label>
                              <input
                                type="number"
                                min={1}
                                value={talk.talk_duration_minutes || 20}
                                onChange={(e) => updateTalk(idx, "talk_duration_minutes", parseInt(e.target.value) || 0)}
                                className="h-8 w-full rounded-md border border-[var(--border-default)] bg-[var(--card)] px-2 text-xs text-[var(--text-primary)] focus:border-[var(--pri)] focus:outline-none"
                              />
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}

              {/* Submit Buttons */}
              <div className="flex items-center justify-end gap-2 border-t border-[var(--border-subtle)] pt-4">
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-lg border border-[var(--border-default)] bg-[var(--card)] px-4 py-2 text-xs font-semibold text-[var(--text-secondary)] hover:bg-[var(--bg-surface-hover)] transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting || loadingConfig}
                  className="flex items-center gap-2 rounded-lg bg-[var(--pri)] px-5 py-2 text-xs font-bold text-[var(--primary-contrast)] shadow-sm hover:opacity-95 disabled:opacity-50 transition-opacity cursor-pointer"
                >
                  {submitting && <Loader2 className="size-3.5 animate-spin" />}
                  {mode === "manual"
                    ? selectedParticipant
                      ? "Add Speaker Role"
                      : "Register Speaker"
                    : "Send Invitation"}
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
