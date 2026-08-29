"use client";

import { useEffect, useState, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  Globe,
  AlertCircle,
  Calendar,
  CheckCircle2,
  ChevronRight,
  Upload,
  FileText,
  Check,
  Copy,
  ArrowLeft,
  ArrowRight,
  ShieldCheck,
  MapPin,
  Loader2,
  Sparkles,
  Building,
  User,
  Mail,
  Phone,
  Tag,
  CreditCard,
  X,
  HelpCircle,
  Ticket,
  Lock,
  Wallet,
  Info
} from "lucide-react";
import { toast } from "sonner";
import { ThemedIllustration, IllustrationName } from "@/components/ui/themed-illustration";
import {
  CountryStateEntry,
  fetchCountryStates,
  getAllowedCountries,
  getStatesForCountry,
} from "@/lib/country-states";
import { COUNTRY_DIAL_CODES, getDialCodeForCountry } from "@/lib/country-dial-codes";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";

interface FormField {
  id: string;
  name?: string;
  label: string;
  type: string;
  is_default?: boolean;
  is_required?: boolean;
  is_active?: boolean;
  options?: string[];
  placeholder?: string;
}

const TITLE_OPTIONS = ["Dr.", "Prof.", "Mr.", "Ms.", "Mrs."];

const PERSONAL_FIELD_KEYS = new Set([
  "title",
  "name",
  "first_name",
  "last_name",
  "email",
  "phone",
  "gender",
  "dob",
  "country",
  "country_state",
  "state",
  "company",
  "organization",
  "designation",
  "role",
]);

export default function DynamicRegistrationPage() {
  const { eventId } = useParams<{ eventId: string }>();
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [config, setConfig] = useState<any>(null);
  const [countryStates, setCountryStates] = useState<CountryStateEntry[]>([]);

  // Stepper state
  const [currentStepIndex, setCurrentStepIndex] = useState<number>(0);

  // Dynamic form state
  const [formData, setFormData] = useState<Record<string, any>>({
    title: "Dr.",
    first_name: "",
    last_name: "",
    name: "",
    role: "", // None selected by default
    country: "India",
    country_state: "",
    state: "",
    phone_dial_code: "+91",
  });

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [promoCode, setPromoCode] = useState("");
  const [validatingPromo, setValidatingPromo] = useState(false);
  const [appliedPromo, setAppliedPromo] = useState<{
    code: string;
    discount_amount: number;
    total_price: number;
  } | null>(null);

  const [successData, setSuccessData] = useState<{
    regno: string;
    name: string;
    role: string;
    message: string;
    status?: string;
  } | null>(null);

  // Check if user is already registered or redirect to login if no session token
  useEffect(() => {
    const token =
      localStorage.getItem(`portal_token_${eventId}`) ||
      localStorage.getItem(`portal_jwt_${eventId}`);
    if (!token) {
      router.replace(`/${eventId}/login`);
      return;
    }

    // Check if participant is already registered
    const isRegisteredFlag = localStorage.getItem(`portal_registered_${eventId}`);
    if (isRegisteredFlag === "true") {
      toast.info("You are already registered! Redirecting to your dashboard...");
      router.replace(`/${eventId}/dashboard`);
      return;
    }

    // Verify against dashboard API
    fetch(`${API_BASE}/api/v1/portal/dashboard/${eventId}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((dash) => {
        if (dash?.registration || dash?.participant?.regno) {
          localStorage.setItem(`portal_registered_${eventId}`, "true");
          toast.info("You are already registered! Redirecting to your dashboard...");
          router.replace(`/${eventId}/dashboard`);
          return;
        }
      })
      .catch(() => {});

    try {
      const payload = JSON.parse(atob(token.split(".")[1]));
      setFormData((prev) => ({
        ...prev,
        email: prev.email || payload.email || "",
        phone: prev.phone || payload.phone || "",
      }));
    } catch {
      // JWT decode fallback
    }

    const storedParticipant = localStorage.getItem(`portal_participant_${eventId}`);
    if (storedParticipant) {
      try {
        const p = JSON.parse(storedParticipant);
        if (p.regno) {
          localStorage.setItem(`portal_registered_${eventId}`, "true");
          router.replace(`/${eventId}/dashboard`);
          return;
        }
        const nameParts = (p.name || "").trim().split(" ");
        setFormData((prev) => ({
          ...prev,
          title: prev.title || p.title || "Dr.",
          name: prev.name || p.name || "",
          first_name: prev.first_name || p.first_name || nameParts[0] || "",
          last_name: prev.last_name || p.last_name || nameParts.slice(1).join(" ") || "",
          email: prev.email || p.email || "",
          phone: prev.phone || p.phone || "",
          company: prev.company || p.company || p.organization || "",
          organization: prev.organization || p.organization || p.company || "",
          designation: prev.designation || p.designation || "",
        }));
      } catch { }
    }
  }, [eventId, router]);

  // Fetch Form Config
  useEffect(() => {
    fetchCountryStates().then(setCountryStates);

    fetch(`${API_BASE}/api/v1/portal/registration/${eventId}/form`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data) {
          setConfig(data);
        }
      })
      .catch(() => {
        toast.error("Failed to load registration configuration.");
      })
      .finally(() => setLoading(false));
  }, [eventId]);

  const activeFields: FormField[] = useMemo(() => {
    if (!config?.fields || !Array.isArray(config.fields)) return [];
    return config.fields.filter(
      (f: FormField) => f.is_active !== false && f.id !== "role" && f.name !== "role"
    );
  }, [config]);

  // Split active fields into Personal vs Additional/Custom
  const personalFields = useMemo(() => {
    return activeFields.filter((f) => PERSONAL_FIELD_KEYS.has(f.name || f.id));
  }, [activeFields]);

  const additionalFields = useMemo(() => {
    return activeFields.filter((f) => !PERSONAL_FIELD_KEYS.has(f.name || f.id));
  }, [activeFields]);

  const activePrices: Record<string, number> = config?.active_prices || {};
  const roleOptions: string[] = useMemo(() => {
    const roleField = config?.fields?.find((f: FormField) => f.id === "role" || f.name === "role");
    if (roleField?.options && Array.isArray(roleField.options) && roleField.options.length > 0) {
      return roleField.options;
    }
    if (Object.keys(activePrices).length > 0) {
      return Object.keys(activePrices);
    }
    return ["Delegate"];
  }, [config, activePrices]);

  const isPaymentEnabled = Boolean(config?.payment_enabled);
  const currency = config?.currency || "INR";

  const getTicketBasePrice = () => {
    if (!isPaymentEnabled || !activePrices || !formData.role) return 0;
    return Number(activePrices[formData.role] || 0);
  };

  const getFinalTicketPrice = () => {
    const base = getTicketBasePrice();
    if (appliedPromo) {
      return Math.max(0, base - appliedPromo.discount_amount);
    }
    return base;
  };

  // Dynamic Steps Definition
  interface StepDef {
    key: "personal" | "additional" | "category" | "payment" | "confirmation";
    label: string;
    description: string;
    illustration: IllustrationName;
  }

  const stepsList: StepDef[] = useMemo(() => {
    const steps: StepDef[] = [
      {
        key: "personal",
        label: "Personal Details",
        description: "Your official contact & professional profile",
        illustration: "forms",
      },
    ];

    if (additionalFields.length > 0) {
      steps.push({
        key: "additional",
        label: "Additional Info",
        description: "Special preferences, dietary & participation details",
        illustration: "upload",
      });
    }

    if (roleOptions.length > 0) {
      steps.push({
        key: "category",
        label: "Pass Category",
        description: "Select your delegate access tier & package",
        illustration: "id-card",
      });
    }

    if (isPaymentEnabled && getFinalTicketPrice() > 0) {
      steps.push({
        key: "payment",
        label: "Payment",
        description: "Review order summary and complete checkout",
        illustration: "conference-amico",
      });
    }

    steps.push({
      key: "confirmation",
      label: "Confirmation",
      description: "Official pass issuance & badge access",
      illustration: "conference-speaker",
    });

    return steps;
  }, [additionalFields, roleOptions, isPaymentEnabled, config, formData.role, appliedPromo]);

  const currentStep = stepsList[currentStepIndex] || stepsList[0];
  const totalSteps = stepsList.length;

  const handleApplyPromo = async () => {
    if (!promoCode.trim()) return;
    setValidatingPromo(true);
    try {
      const res = await fetch(`${API_BASE}/api/v1/portal/registration/${eventId}/validate-coupon`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: promoCode.trim(), role: formData.role || "Delegate" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Invalid promo code.");

      setAppliedPromo({
        code: promoCode.trim().toUpperCase(),
        discount_amount: Number(data.discount_amount || 0),
        total_price: Number(data.final_price || 0),
      });
      toast.success(`Coupon ${promoCode.toUpperCase()} applied!`);
    } catch (err: any) {
      toast.error(err.message || "Failed to apply coupon.");
    } finally {
      setValidatingPromo(false);
    }
  };

  const validatePersonalStep = () => {
    const errs: Record<string, string> = {};

    // Validate Title & Names
    const hasFirstNameField = personalFields.some((f) => (f.name || f.id) === "first_name");
    const hasNameField = personalFields.some((f) => (f.name || f.id) === "name");

    if (hasFirstNameField) {
      if (!formData.first_name?.trim()) errs.first_name = "First name is required";
    }
    if (hasNameField && !hasFirstNameField) {
      if (!formData.name?.trim()) errs.name = "Full name is required";
    }

    // Validate other personal fields
    for (const field of personalFields) {
      const key = field.name || field.id;
      if (key === "first_name" || key === "last_name" || key === "name" || key === "title") {
        continue;
      }
      const val = formData[key];
      if (field.is_required && (!val || (typeof val === "string" && !val.trim()))) {
        errs[key] = `${field.label || key} is required`;
      }
      if (field.type === "email" && val && !/\S+@\S+\.\S+/.test(val)) {
        errs[key] = "Please enter a valid email address";
      }
    }

    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const validateAdditionalStep = () => {
    const errs: Record<string, string> = {};
    for (const field of additionalFields) {
      const key = field.name || field.id;
      const val = formData[key];
      if (field.is_required && (!val || (typeof val === "string" && !val.trim()))) {
        errs[key] = `${field.label || key} is required`;
      }
    }
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleNext = () => {
    if (currentStep.key === "personal") {
      if (!validatePersonalStep()) {
        toast.error("Please fill in all required personal details.");
        return;
      }
    } else if (currentStep.key === "additional") {
      if (!validateAdditionalStep()) {
        toast.error("Please answer the required additional questions.");
        return;
      }
    } else if (currentStep.key === "category") {
      if (!formData.role) {
        toast.error("Please select a pass category to continue.");
        return;
      }
    }
    setCurrentStepIndex((prev) => Math.min(prev + 1, totalSteps - 1));
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleBack = () => {
    setCurrentStepIndex((prev) => Math.max(prev - 1, 0));
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleSubmitRegistration = async () => {
    if (!validatePersonalStep()) {
      setCurrentStepIndex(0);
      toast.error("Please resolve personal information errors.");
      return;
    }
    if (additionalFields.length > 0 && !validateAdditionalStep()) {
      setCurrentStepIndex(stepsList.findIndex((s) => s.key === "additional"));
      toast.error("Please resolve additional questions errors.");
      return;
    }
    if (!formData.role && roleOptions.length > 0) {
      const catIdx = stepsList.findIndex((s) => s.key === "category");
      if (catIdx >= 0) setCurrentStepIndex(catIdx);
      toast.error("Please select a pass category.");
      return;
    }

    setSubmitting(true);
    try {
      const standardKeys = new Set([
        "title",
        "name",
        "first_name",
        "last_name",
        "email",
        "phone",
        "company",
        "organization",
        "designation",
        "country",
        "country_state",
        "state",
        "gender",
        "dob",
        "role",
      ]);

      const custom_fields: Record<string, any> = {};
      const payloadData: Record<string, any> = {};

      for (const [k, v] of Object.entries(formData)) {
        if (standardKeys.has(k)) {
          payloadData[k] = v;
        } else {
          custom_fields[k] = v;
        }
      }

      // Consolidate full name with title prefix
      const titlePrefix = payloadData.title ? `${payloadData.title} ` : "";
      const baseName =
        payloadData.name ||
        `${payloadData.first_name || ""} ${payloadData.last_name || ""}`.trim();
      const fullName = baseName.startsWith(titlePrefix.trim())
        ? baseName
        : `${titlePrefix}${baseName}`.trim();

      const rawPhone = payloadData.phone ? String(payloadData.phone).trim() : "";
      const fullPhone = rawPhone
        ? rawPhone.startsWith("+")
          ? rawPhone
          : `${formData.phone_dial_code || "+91"} ${rawPhone}`.trim()
        : "";

      const payload = {
        title: payloadData.title || "Dr.",
        first_name: payloadData.first_name || baseName.split(" ")[0] || "",
        last_name: payloadData.last_name || baseName.split(" ").slice(1).join(" ") || "",
        name: fullName,
        email: payloadData.email || "",
        phone: fullPhone,
        company: payloadData.company || payloadData.organization || "",
        designation: payloadData.designation || "",
        country: payloadData.country || "India",
        country_state: payloadData.country_state || payloadData.state || "",
        role: formData.role || "Delegate",
        gender: payloadData.gender,
        dob: payloadData.dob,
        promo_code: appliedPromo?.code || "",
        amount_paid: getFinalTicketPrice(),
        custom_fields,
      };

      const res = await fetch(`${API_BASE}/api/v1/portal/registration/${eventId}/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const resData = await res.json();
      if (!res.ok) throw new Error(resData.detail || "Failed to submit registration.");

      setSuccessData({
        regno: resData.regno || "",
        name: fullName || "Delegate",
        role: formData.role || "Delegate",
        message: resData.message || "Registration confirmed successfully!",
        status: resData.status || "approved",
      });

      if (resData.token) {
        localStorage.setItem(`portal_token_${eventId}`, resData.token);
        localStorage.setItem(`portal_jwt_${eventId}`, resData.token);
      }

      localStorage.setItem(
        `portal_participant_${eventId}`,
        JSON.stringify({
          name: fullName,
          email: payload.email,
          role: payload.role,
          regno: resData.regno,
        })
      );

      localStorage.setItem(`portal_registered_${eventId}`, "true");

      setCurrentStepIndex(totalSteps - 1);
      toast.success("Registration completed successfully! 🎉");
    } catch (err: any) {
      toast.error(err.message || "Failed to submit registration.");
    } finally {
      setSubmitting(false);
    }
  };

  // Helper renderer for generic inputs (Single Column Flow with large h-12 height)
  const renderSingleColumnField = (field: FormField) => {
    const key = field.name || field.id;
    const val = formData[key] ?? "";
    const error = errors[key];

    // Phone input with integrated country dial code selector (Strictly digits only)
    if (field.type === "phone" || key === "phone") {
      return (
        <div key={key} className="space-y-2 text-left">
          <label className="text-[11px] font-black uppercase tracking-wider text-[var(--muted)] flex items-center justify-between">
            <span>
              {field.label || "Mobile / WhatsApp Number"} {field.is_required && <span className="text-rose-500">*</span>}
            </span>
            <span className="text-[10px] font-bold text-[var(--muted)]">Numbers only</span>
          </label>
          <div className="flex gap-2.5">
            <select
              value={formData.phone_dial_code || "+91"}
              onChange={(e) => setFormData({ ...formData, phone_dial_code: e.target.value })}
              className="h-12 w-32 sm:w-36 px-2.5 rounded-xl text-xs font-mono font-bold bg-[var(--bg-surface-2)] border-2 border-[var(--border-default)] text-[var(--text)] focus:border-[var(--pri)] focus:ring-4 focus:ring-[var(--pri)]/15 focus:bg-[var(--card)] shrink-0 cursor-pointer"
            >
              {COUNTRY_DIAL_CODES.map((c) => (
                <option key={`${c.code}-${c.dial_code}`} value={c.dial_code}>
                  {c.flag} {c.dial_code}
                </option>
              ))}
            </select>
            <input
              type="tel"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={15}
              placeholder={field.placeholder || "Enter mobile number"}
              value={val}
              onChange={(e) => {
                const digitsOnly = e.target.value.replace(/\D/g, "");
                setFormData({ ...formData, [key]: digitsOnly });
              }}
              className={`flex-1 h-12 px-4 rounded-xl text-sm font-semibold bg-[var(--bg-surface-2)] border-2 text-[var(--text)] transition-all ${
                error
                  ? "border-rose-500 ring-2 ring-rose-500/20"
                  : "border-[var(--border-default)] focus:border-[var(--pri)] focus:ring-4 focus:ring-[var(--pri)]/15 focus:bg-[var(--card)]"
              }`}
            />
          </div>
          {error && <span className="text-xs text-rose-500 font-bold block">{error}</span>}
        </div>
      );
    }

    // Country field with dynamic State/Province selector paired together
    if (field.type === "country" || key === "country") {
      const currentCountry = formData.country || "India";
      const availableStates = getStatesForCountry(countryStates, currentCountry);

      return (
        <div key={key} className="space-y-5 text-left">
          {/* Country Selector */}
          <div className="space-y-2">
            <label className="text-[11px] font-black uppercase tracking-wider text-[var(--muted)] flex items-center justify-between">
              <span>
                {field.label || "Country"} {field.is_required && <span className="text-rose-500">*</span>}
              </span>
            </label>
            <select
              value={currentCountry}
              onChange={(e) => {
                const newCountry = e.target.value;
                setFormData({
                  ...formData,
                  country: newCountry,
                  country_state: "",
                  state: "",
                  phone_dial_code: getDialCodeForCountry(newCountry),
                });
              }}
              className={`w-full h-12 px-4 rounded-xl text-sm font-semibold bg-[var(--bg-surface-2)] border-2 text-[var(--text)] transition-all cursor-pointer ${
                error
                  ? "border-rose-500 ring-2 ring-rose-500/20"
                  : "border-[var(--border-default)] focus:border-[var(--pri)] focus:ring-4 focus:ring-[var(--pri)]/15 focus:bg-[var(--card)]"
              }`}
            >
              {getAllowedCountries(field.options, countryStates).map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
            {error && <span className="text-xs text-rose-500 font-bold block">{error}</span>}
          </div>

          {/* State / Province Selector */}
          <div className="space-y-2">
            <label className="text-[11px] font-black uppercase tracking-wider text-[var(--muted)] flex items-center justify-between">
              <span>State / Province</span>
            </label>
            {availableStates.length > 0 ? (
              <select
                value={formData.country_state || formData.state || ""}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    country_state: e.target.value,
                    state: e.target.value,
                  })
                }
                className="w-full h-12 px-4 rounded-xl text-sm font-semibold bg-[var(--bg-surface-2)] border-2 border-[var(--border-default)] text-[var(--text)] focus:border-[var(--pri)] focus:ring-4 focus:ring-[var(--pri)]/15 focus:bg-[var(--card)] transition-all cursor-pointer"
              >
                <option value="">Select State / Province</option>
                {availableStates.map((st) => (
                  <option key={st} value={st}>
                    {st}
                  </option>
                ))}
              </select>
            ) : (
              <input
                type="text"
                placeholder="Enter State / Province"
                value={formData.country_state || formData.state || ""}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    country_state: e.target.value,
                    state: e.target.value,
                  })
                }
                className="w-full h-12 px-4 rounded-xl text-sm font-semibold bg-[var(--bg-surface-2)] border-2 border-[var(--border-default)] text-[var(--text)] focus:border-[var(--pri)] focus:ring-4 focus:ring-[var(--pri)]/15 focus:bg-[var(--card)] transition-all"
              />
            )}
          </div>
        </div>
      );
    }

    // Skip separate state/country_state field if country is already rendered in personal list
    if (key === "country_state" || key === "state") {
      const hasCountryField = personalFields.some((f) => (f.name || f.id) === "country");
      if (hasCountryField) {
        return null;
      }
      const currentCountry = formData.country || "India";
      const availableStates = getStatesForCountry(countryStates, currentCountry);
      return (
        <div key={key} className="space-y-2 text-left">
          <label className="text-[11px] font-black uppercase tracking-wider text-[var(--muted)] flex items-center justify-between">
            <span>
              {field.label || "State / Province"} {field.is_required && <span className="text-rose-500">*</span>}
            </span>
          </label>
          {availableStates.length > 0 ? (
            <select
              value={val}
              onChange={(e) => setFormData({ ...formData, [key]: e.target.value })}
              className="w-full h-12 px-4 rounded-xl text-sm font-semibold bg-[var(--bg-surface-2)] border-2 border-[var(--border-default)] text-[var(--text)] focus:border-[var(--pri)] focus:ring-4 focus:ring-[var(--pri)]/15 focus:bg-[var(--card)] cursor-pointer"
            >
              <option value="">Select State / Province</option>
              {availableStates.map((st) => (
                <option key={st} value={st}>
                  {st}
                </option>
              ))}
            </select>
          ) : (
            <input
              type="text"
              placeholder={field.placeholder || "Enter State / Province"}
              value={val}
              onChange={(e) => setFormData({ ...formData, [key]: e.target.value })}
              className="w-full h-12 px-4 rounded-xl text-sm font-semibold bg-[var(--bg-surface-2)] border-2 border-[var(--border-default)] text-[var(--text)] focus:border-[var(--pri)] focus:ring-4 focus:ring-[var(--pri)]/15 focus:bg-[var(--card)]"
            />
          )}
          {error && <span className="text-xs text-rose-500 font-bold block">{error}</span>}
        </div>
      );
    }

    // Email field: bound to authenticated login identity, permanently locked & read-only
    if (field.type === "email" || key === "email") {
      const emailValue = formData.email || val || "";
      return (
        <div key={key} className="space-y-2 text-left">
          <label className="text-[11px] font-black uppercase tracking-wider text-[var(--muted)] flex items-center justify-between">
            <span>
              {field.label || "Email Address"} <span className="text-rose-500">*</span>
            </span>
            <span className="inline-flex items-center gap-1 text-[10px] font-bold text-[var(--muted)]">
              <Lock className="h-3 w-3 text-[var(--sec)]" /> Bound to Login Email
            </span>
          </label>
          <div className="relative">
            <input
              type="email"
              value={emailValue}
              readOnly
              disabled
              className="w-full h-12 px-4 pr-10 rounded-xl text-sm font-semibold bg-[var(--bg-surface-2)]/60 border-2 border-[var(--border-default)] text-[var(--text)]/80 cursor-not-allowed opacity-90 transition-all select-none"
              title="Email is permanently bound to your login credentials and cannot be changed"
            />
            <div className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[var(--muted)] flex items-center gap-1.5 pointer-events-none">
              <Lock className="h-4 w-4 text-[var(--sec)]" />
            </div>
          </div>
          {error && <span className="text-xs text-rose-500 font-bold block">{error}</span>}
        </div>
      );
    }

    return (
      <div key={key} className="space-y-2 text-left">
        <label className="text-[11px] font-black uppercase tracking-wider text-[var(--muted)] flex items-center justify-between">
          <span>
            {field.label || key} {field.is_required && <span className="text-rose-500">*</span>}
          </span>
        </label>

        {field.type === "select" ||
        (Array.isArray(field.options) && field.options.length > 0 && field.type !== "radio") ? (
          <select
            value={val}
            onChange={(e) => setFormData({ ...formData, [key]: e.target.value })}
            className={`w-full h-12 px-4 rounded-xl text-sm font-semibold bg-[var(--bg-surface-2)] border-2 text-[var(--text)] transition-all ${
              error
                ? "border-rose-500 ring-2 ring-rose-500/20"
                : "border-[var(--border-default)] focus:border-[var(--pri)] focus:ring-4 focus:ring-[var(--pri)]/15 focus:bg-[var(--card)]"
            }`}
          >
            <option value="">{field.placeholder || `Select ${field.label || key}`}</option>
            {(field.options || []).map((opt) => (
              <option key={opt} value={opt}>
                {opt}
              </option>
            ))}
          </select>
        ) : field.type === "textarea" ? (
          <textarea
            rows={4}
            placeholder={field.placeholder || `Enter ${field.label || key}`}
            value={val}
            onChange={(e) => setFormData({ ...formData, [key]: e.target.value })}
            className={`w-full p-4 rounded-xl text-sm font-semibold bg-[var(--bg-surface-2)] border-2 text-[var(--text)] transition-all resize-none ${
              error
                ? "border-rose-500 ring-2 ring-rose-500/20"
                : "border-[var(--border-default)] focus:border-[var(--pri)] focus:ring-4 focus:ring-[var(--pri)]/15 focus:bg-[var(--card)]"
            }`}
          />
        ) : field.type === "checkbox" ? (
          <label className="flex items-center gap-3 p-3.5 rounded-xl bg-[var(--bg-surface-2)] border-2 border-[var(--border-default)] cursor-pointer hover:border-[var(--pri)]/40 transition-colors">
            <input
              type="checkbox"
              checked={Boolean(val)}
              onChange={(e) => setFormData({ ...formData, [key]: e.target.checked })}
              className="h-5 w-5 rounded border-2 border-[var(--border-default)] text-[var(--pri)] focus:ring-[var(--pri)]/25 cursor-pointer accent-[var(--pri)]"
            />
            <span className="text-sm font-semibold text-[var(--text)]">
              {field.placeholder || field.label}
            </span>
          </label>
        ) : (
          <input
            type={field.type || "text"}
            placeholder={field.placeholder || `Enter ${field.label || key}`}
            value={val}
            onChange={(e) => setFormData({ ...formData, [key]: e.target.value })}
            className={`w-full h-12 px-4 rounded-xl text-sm font-semibold bg-[var(--bg-surface-2)] border-2 text-[var(--text)] transition-all ${
              error
                ? "border-rose-500 ring-2 ring-rose-500/20"
                : "border-[var(--border-default)] focus:border-[var(--pri)] focus:ring-4 focus:ring-[var(--pri)]/15 focus:bg-[var(--card)]"
            }`}
          />
        )}

        {error && <span className="text-xs text-rose-500 font-bold block">{error}</span>}
      </div>
    );
  };

  if (loading) {
    return (
      <div className="min-h-[80vh] flex flex-col items-center justify-center p-4">
        <Loader2 className="h-10 w-10 animate-spin text-[var(--pri)] mb-3" />
        <span className="text-xs font-black uppercase tracking-widest text-[var(--muted)]">
          Loading Registration Portal...
        </span>
      </div>
    );
  }

  const eventName = config?.event_name || "";

  return (
    <div className="min-h-screen pb-16 bg-transparent text-[var(--text)] transition-colors duration-200 relative z-10">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 pt-8 space-y-8">

        {/* ── Top Header Banner (Solid Opaque Card) ──────────────────────────── */}
        <div className="p-6 md:p-8 rounded-[28px] bg-[var(--card)] border-2 border-[var(--border-default)] shadow-md flex flex-col sm:flex-row items-center justify-between gap-6 text-left relative overflow-hidden">
          <div className="space-y-1.5">
            <span className="text-[10px] font-black uppercase tracking-[0.25em] text-[var(--muted)] block">
              OFFICIAL EVENT REGISTRATION
            </span>
            <h1 className="text-2xl sm:text-3xl font-black text-[var(--text)] tracking-tight">
              {eventName ? `${eventName} Registration` : "Event Registration"}
            </h1>
            <p className="text-xs sm:text-sm text-[var(--muted)] font-medium max-w-xl">
              Complete the official registration form to confirm your delegate participation and receive your event pass.
            </p>
          </div>

          <div className="shrink-0 flex items-center gap-2">
            <div className="px-4 py-2 rounded-2xl bg-[var(--bg-surface-2)] border border-[var(--border-default)] text-right">
              <span className="text-[10px] font-black uppercase tracking-widest text-[var(--muted)] block">
                Current Step
              </span>
              <span className="text-sm font-black text-[var(--text)]">
                {currentStepIndex + 1} of {totalSteps}: {currentStep.label}
              </span>
            </div>
          </div>
        </div>

        {/* ── Stepper Navigation Bar ─────────────────────────────────────────── */}
        <div className="relative py-2 px-2">
          <div className="absolute top-6 left-[8%] right-[8%] h-1 bg-[var(--border-default)] rounded-full" />
          <div
            className="absolute top-6 left-[8%] h-1 bg-gradient-to-r from-[var(--pri)] to-[var(--sec)] rounded-full transition-all duration-300"
            style={{
              width: `${(currentStepIndex / Math.max(1, totalSteps - 1)) * 84}%`,
            }}
          />

          <div className="grid grid-flow-col auto-cols-fr gap-2 relative z-10">
            {stepsList.map((step, idx) => {
              const isPassed = currentStepIndex > idx;
              const isCurrent = currentStepIndex === idx;

              return (
                <div key={step.key} className="flex flex-col items-center text-center">
                  <div
                    className={`h-11 w-11 rounded-full flex items-center justify-center font-black text-xs transition-all shadow-md ${
                      isPassed
                        ? "bg-[var(--pri)] text-white ring-4 ring-[var(--pri)]/20"
                        : isCurrent
                        ? "bg-[var(--pri)] text-white ring-4 ring-[var(--pri)]/30 scale-105"
                        : "bg-[var(--card)] border-2 border-[var(--border-default)] text-[var(--muted)]"
                    }`}
                  >
                    {isPassed ? <Check className="h-5 w-5 stroke-[3]" /> : idx + 1}
                  </div>

                  <span
                    className={`text-[10px] sm:text-xs font-black uppercase tracking-wider mt-2.5 transition-colors ${
                      isCurrent || isPassed ? "text-[var(--text)]" : "text-[var(--muted)]"
                    }`}
                  >
                    {step.label}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* ── 2-Column Content Grid: Form (7/12) + Big Side Illustration (5/12) ─── */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">

          {/* ════ LEFT COLUMN: SOLID FORM CARD (7 COLS) ═══════════════════════ */}
          <div className="lg:col-span-7 space-y-6">
            <div className="p-6 md:p-8 rounded-[28px] border-2 border-[var(--border-default)] bg-[var(--card)] shadow-lg space-y-6 text-left">

              {/* ── STEP 1: PERSONAL DETAILS ─────────────────────────────────── */}
              {currentStep.key === "personal" && (
                <motion.div
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  className="space-y-6"
                >
                  <div>
                    <h2 className="text-lg font-black text-[var(--text)]">Personal Information</h2>
                    <p className="text-xs text-[var(--muted)] mt-0.5">
                      Enter your verified identity and professional credentials
                    </p>
                  </div>

                  <div className="space-y-5">
                    {/* Unified Single Row: Title Prefix + First Name + Last Name */}
                    <div className="space-y-2">
                      <label className="text-[11px] font-black uppercase tracking-wider text-[var(--muted)] block">
                        Full Name & Title <span className="text-rose-500">*</span>
                      </label>
                      <div className="flex gap-2.5">
                        {/* Title Prefix Dropdown */}
                        <div className="w-28 sm:w-32 shrink-0">
                          <select
                            value={formData.title || "Dr."}
                            onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                            className="w-full h-12 px-3 rounded-xl text-sm font-bold bg-[var(--bg-surface-2)] border-2 border-[var(--border-default)] text-[var(--text)] focus:border-[var(--pri)] focus:ring-4 focus:ring-[var(--pri)]/15 focus:bg-[var(--card)]"
                          >
                            {TITLE_OPTIONS.map((t) => (
                              <option key={t} value={t}>
                                {t}
                              </option>
                            ))}
                          </select>
                        </div>

                        {/* First Name / Name input */}
                        <div className="flex-1">
                          <input
                            type="text"
                            placeholder="First Name"
                            value={formData.first_name ?? formData.name ?? ""}
                            onChange={(e) =>
                              setFormData({
                                ...formData,
                                first_name: e.target.value,
                                name: `${e.target.value} ${formData.last_name || ""}`.trim(),
                              })
                            }
                            className={`w-full h-12 px-4 rounded-xl text-sm font-semibold bg-[var(--bg-surface-2)] border-2 text-[var(--text)] transition-all ${
                              errors.first_name || errors.name
                                ? "border-rose-500 ring-2 ring-rose-500/20"
                                : "border-[var(--border-default)] focus:border-[var(--pri)] focus:ring-4 focus:ring-[var(--pri)]/15 focus:bg-[var(--card)]"
                            }`}
                          />
                        </div>

                        {/* Last Name input */}
                        <div className="flex-1">
                          <input
                            type="text"
                            placeholder="Last Name"
                            value={formData.last_name ?? ""}
                            onChange={(e) =>
                              setFormData({
                                ...formData,
                                last_name: e.target.value,
                                name: `${formData.first_name || ""} ${e.target.value}`.trim(),
                              })
                            }
                            className="w-full h-12 px-4 rounded-xl text-sm font-semibold bg-[var(--bg-surface-2)] border-2 border-[var(--border-default)] text-[var(--text)] focus:border-[var(--pri)] focus:ring-4 focus:ring-[var(--pri)]/15 focus:bg-[var(--card)] transition-all"
                          />
                        </div>
                      </div>
                      {(errors.first_name || errors.name) && (
                        <span className="text-xs text-rose-500 font-bold block">
                          {errors.first_name || errors.name}
                        </span>
                      )}
                    </div>

                    {/* Single Column Vertical Stack for All Other Personal Fields */}
                    {personalFields
                      .filter(
                        (f) =>
                          !["title", "name", "first_name", "last_name"].includes(f.name || f.id)
                      )
                      .map((field) => renderSingleColumnField(field))}
                  </div>

                  {/* Step 1 Actions */}
                  <div className="flex items-center justify-end gap-3 pt-6 border-t-2 border-[var(--border-default)]">
                    {totalSteps > 2 ? (
                      <button
                        type="button"
                        onClick={handleNext}
                        className="h-12 px-8 rounded-xl bg-[var(--pri)] hover:bg-[var(--pri)]/90 text-white text-xs font-black uppercase tracking-wider flex items-center gap-2 transition-all cursor-pointer shadow-md shadow-[var(--pri)]/20"
                      >
                        <span>Continue</span>
                        <ArrowRight className="h-4 w-4" />
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={handleSubmitRegistration}
                        disabled={submitting}
                        className="h-12 px-8 rounded-xl bg-[var(--pri)] hover:bg-[var(--pri)]/90 text-white text-xs font-black uppercase tracking-wider flex items-center gap-2 transition-all cursor-pointer shadow-md shadow-[var(--pri)]/20"
                      >
                        {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
                        <span>Confirm & Complete Registration</span>
                      </button>
                    )}
                  </div>
                </motion.div>
              )}

              {/* ── STEP 2: ADDITIONAL INFORMATION (ORGANISER CUSTOM FIELDS) ─── */}
              {currentStep.key === "additional" && (
                <motion.div
                  initial={{ opacity: 0, x: 10 }}
                  animate={{ opacity: 1, x: 0 }}
                  className="space-y-6"
                >
                  <div>
                    <h2 className="text-lg font-black text-[var(--text)]">Additional Information</h2>
                    <p className="text-xs text-[var(--muted)] mt-0.5">
                      Please answer the following event-specific questions
                    </p>
                  </div>

                  <div className="space-y-5">
                    {additionalFields.map((field) => renderSingleColumnField(field))}
                  </div>

                  {/* Step 2 Actions */}
                  <div className="flex items-center justify-between pt-6 border-t-2 border-[var(--border-default)]">
                    <button
                      type="button"
                      onClick={handleBack}
                      className="h-12 px-6 rounded-xl border-2 border-[var(--border-default)] hover:bg-[var(--bg-surface-hover)] text-xs font-bold text-[var(--muted)] hover:text-[var(--text)] flex items-center gap-2 transition-all cursor-pointer"
                    >
                      <ArrowLeft className="h-4 w-4" />
                      <span>Back</span>
                    </button>

                    <button
                      type="button"
                      onClick={handleNext}
                      className="h-12 px-8 rounded-xl bg-[var(--pri)] hover:bg-[var(--pri)]/90 text-white text-xs font-black uppercase tracking-wider flex items-center gap-2 transition-all cursor-pointer shadow-md shadow-[var(--pri)]/20"
                    >
                      <span>Continue</span>
                      <ArrowRight className="h-4 w-4" />
                    </button>
                  </div>
                </motion.div>
              )}

              {/* ── STEP 3: PASS CATEGORY & TIER SELECTION ───────────────────── */}
              {currentStep.key === "category" && (
                <motion.div
                  initial={{ opacity: 0, x: 10 }}
                  animate={{ opacity: 1, x: 0 }}
                  className="space-y-6"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <h2 className="text-lg font-black text-[var(--text)]">Select Pass Category</h2>
                      <p className="text-xs text-[var(--muted)] mt-0.5">
                        Choose your delegate admission package
                      </p>
                    </div>
                    {config?.active_tier && (
                      <span className="px-3 py-1 rounded-xl bg-[var(--pri)]/10 border border-[var(--pri)]/20 text-[var(--pri)] text-xs font-black uppercase tracking-wider">
                        {config.active_tier} Tier
                      </span>
                    )}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {roleOptions.map((role) => {
                      const price = activePrices[role] ?? 0;
                      const isSelected = formData.role === role;

                      return (
                        <div
                          key={role}
                          onClick={() => setFormData({ ...formData, role })}
                          className={`p-6 rounded-2xl border-2 transition-all cursor-pointer space-y-3 ${
                            isSelected
                              ? "border-[var(--pri)] bg-[var(--pri)]/10 shadow-lg ring-2 ring-[var(--pri)]/20"
                              : "border-[var(--border-default)] bg-[var(--bg-surface-2)] hover:border-[var(--pri)]/50 hover:bg-[var(--card)]"
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <span className="text-sm font-black text-[var(--text)] uppercase tracking-tight">
                              {role}
                            </span>
                            {isSelected && (
                              <div className="h-6 w-6 rounded-full bg-[var(--pri)] text-white flex items-center justify-center shadow-sm">
                                <Check className="h-3.5 w-3.5 stroke-[3]" />
                              </div>
                            )}
                          </div>

                          <div className="flex items-baseline gap-1.5 pt-2">
                            <span className="text-2xl font-black text-[var(--text)] font-mono">
                              {isPaymentEnabled && price > 0
                                ? `${currency} ${Number(price).toLocaleString()}`
                                : "Complimentary"}
                            </span>
                            {isPaymentEnabled && price > 0 && (
                              <span className="text-xs text-[var(--muted)] font-semibold">
                                / pass
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Step 3 Actions */}
                  <div className="flex items-center justify-between pt-6 border-t-2 border-[var(--border-default)]">
                    <button
                      type="button"
                      onClick={handleBack}
                      className="h-12 px-6 rounded-xl border-2 border-[var(--border-default)] hover:bg-[var(--bg-surface-hover)] text-xs font-bold text-[var(--muted)] hover:text-[var(--text)] flex items-center gap-2 transition-all cursor-pointer"
                    >
                      <ArrowLeft className="h-4 w-4" />
                      <span>Back</span>
                    </button>

                    {isPaymentEnabled && getFinalTicketPrice() > 0 ? (
                      <button
                        type="button"
                        onClick={handleNext}
                        className="h-12 px-8 rounded-xl bg-[var(--pri)] hover:bg-[var(--pri)]/90 text-white text-xs font-black uppercase tracking-wider flex items-center gap-2 transition-all cursor-pointer shadow-md shadow-[var(--pri)]/20"
                      >
                        <span>Proceed to Payment</span>
                        <ArrowRight className="h-4 w-4" />
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={handleSubmitRegistration}
                        disabled={submitting}
                        className="h-12 px-8 rounded-xl bg-[var(--pri)] hover:bg-[var(--pri)]/90 text-white text-xs font-black uppercase tracking-wider flex items-center gap-2 transition-all cursor-pointer shadow-md shadow-[var(--pri)]/20"
                      >
                        {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
                        <span>Confirm Registration</span>
                      </button>
                    )}
                  </div>
                </motion.div>
              )}

              {/* ── STEP 4: PAYMENT & CHECKOUT ───────────────────────────────── */}
              {currentStep.key === "payment" && (
                <motion.div
                  initial={{ opacity: 0, x: 10 }}
                  animate={{ opacity: 1, x: 0 }}
                  className="space-y-6"
                >
                  <div>
                    <h2 className="text-lg font-black text-[var(--text)]">Review & Payment</h2>
                    <p className="text-xs text-[var(--muted)] mt-0.5">
                      Official conference payment gateway
                    </p>
                  </div>

                  {/* Solid Order Summary Box */}
                  <div className="p-6 rounded-2xl bg-[var(--bg-surface-2)] border-2 border-[var(--border-default)] space-y-4">
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-[var(--muted)] font-bold">
                        {formData.role || "Delegate"} Pass
                      </span>
                      <span className="font-mono font-bold text-[var(--text)]">
                        {currency} {Number(getTicketBasePrice()).toLocaleString()}
                      </span>
                    </div>

                    {appliedPromo && (
                      <div className="flex justify-between items-center text-sm text-emerald-500 font-bold">
                        <span>Coupon Discount ({appliedPromo.code})</span>
                        <span>- {currency} {Number(appliedPromo.discount_amount).toLocaleString()}</span>
                      </div>
                    )}

                    <div className="pt-3 border-t-2 border-[var(--border-default)] flex justify-between items-baseline">
                      <span className="text-base font-black text-[var(--text)]">Total Payable</span>
                      <span className="text-2xl font-black text-[var(--text)] font-mono">
                        {currency} {Number(getFinalTicketPrice()).toLocaleString()}
                      </span>
                    </div>
                  </div>

                  {/* Organizer Configured Payment Method Gateway Box */}
                  <div className="p-4 rounded-2xl bg-[var(--bg-surface-2)] border-2 border-[var(--border-default)] space-y-2.5">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-black uppercase tracking-wider text-[var(--muted)]">
                        Payment Method
                      </span>
                      <span className="px-2.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-[10px] font-bold uppercase tracking-wider flex items-center gap-1 border border-emerald-500/20">
                        <ShieldCheck className="h-3 w-3" /> 256-Bit Encrypted
                      </span>
                    </div>

                    <div className="flex items-center gap-3 p-3 rounded-xl bg-[var(--card)] border border-[var(--border-default)]">
                      <div className="h-10 w-10 rounded-xl bg-[var(--pri)]/10 text-[var(--pri)] flex items-center justify-center shrink-0 border border-[var(--pri)]/20">
                        {config?.active_gateway === "stripe" ? (
                          <CreditCard className="h-5 w-5" />
                        ) : config?.active_gateway === "razorpay" ? (
                          <Wallet className="h-5 w-5" />
                        ) : config?.active_gateway === "offline" ? (
                          <Building className="h-5 w-5" />
                        ) : (
                          <CreditCard className="h-5 w-5" />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <span className="text-xs font-black text-[var(--text)] block truncate">
                          {config?.active_gateway === "stripe"
                            ? "Stripe Global Secure Gateway"
                            : config?.active_gateway === "razorpay"
                            ? "Razorpay Payment Suite (Cards, UPI, Netbanking)"
                            : config?.active_gateway === "phonepe"
                            ? "PhonePe Direct UPI & Cards"
                            : config?.active_gateway === "offline"
                            ? "Offline Bank Transfer / Wire"
                            : "Instant Card Verification"}
                        </span>
                        <span className="text-[10px] text-[var(--muted)] font-semibold block">
                          {config?.active_gateway === "stripe"
                            ? "Supports Visa, MasterCard, Amex, Apple Pay & Google Pay"
                            : config?.active_gateway === "razorpay"
                            ? "Supports GPay, PhonePe, Paytm, All Major Cards & 50+ Banks"
                            : config?.active_gateway === "phonepe"
                            ? "Instant UPI QR and debit/credit cards"
                            : config?.active_gateway === "offline"
                            ? "Invoice will be generated upon registration approval"
                            : "Instant simulated checkout verification"}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Promo Code Input Box */}
                  <div className="space-y-2">
                    <label className="text-[11px] font-black uppercase tracking-wider text-[var(--muted)] block">
                      Promo / Coupon Code
                    </label>
                    <div className="flex gap-2.5">
                      <input
                        type="text"
                        placeholder="ENTER CODE"
                        value={promoCode}
                        onChange={(e) => setPromoCode(e.target.value.toUpperCase())}
                        className="flex-1 h-12 px-4 rounded-xl text-sm font-mono uppercase font-bold bg-[var(--bg-surface-2)] border-2 border-[var(--border-default)] text-[var(--text)] focus:border-[var(--pri)] focus:ring-4 focus:ring-[var(--pri)]/15 focus:bg-[var(--card)]"
                      />
                      <button
                        type="button"
                        onClick={handleApplyPromo}
                        disabled={validatingPromo || !promoCode.trim()}
                        className="h-12 px-6 rounded-xl bg-[var(--card)] border-2 border-[var(--border-default)] hover:border-[var(--pri)] text-xs font-black text-[var(--text)] uppercase tracking-wider transition-all cursor-pointer shrink-0 shadow-sm"
                      >
                        {validatingPromo ? <Loader2 className="h-4 w-4 animate-spin" /> : "Apply"}
                      </button>
                    </div>
                  </div>

                  {/* Step 4 Actions */}
                  <div className="flex items-center justify-between pt-6 border-t-2 border-[var(--border-default)]">
                    <button
                      type="button"
                      onClick={handleBack}
                      className="h-12 px-6 rounded-xl border-2 border-[var(--border-default)] hover:bg-[var(--bg-surface-hover)] text-xs font-bold text-[var(--muted)] hover:text-[var(--text)] flex items-center gap-2 transition-all cursor-pointer"
                    >
                      <ArrowLeft className="h-4 w-4" />
                      <span>Back</span>
                    </button>

                    <button
                      type="button"
                      onClick={handleSubmitRegistration}
                      disabled={submitting}
                      className="h-12 px-8 rounded-xl bg-[var(--pri)] hover:opacity-95 text-[var(--primary-contrast,#ffffff)] text-xs font-black uppercase tracking-wider flex items-center gap-2 transition-all cursor-pointer shadow-lg shadow-[var(--pri)]/25"
                    >
                      {submitting ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Lock className="h-4 w-4" />
                      )}
                      <span>
                        {config?.active_gateway === "offline"
                          ? "Submit for Offline Payment Verification"
                          : `Pay ${currency} ${Number(getFinalTicketPrice()).toLocaleString()} & Confirm`}
                      </span>
                    </button>
                  </div>
                </motion.div>
              )}

              {/* ── STEP 5: CONFIRMATION ─────────────────────────────────────── */}
              {currentStep.key === "confirmation" && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="space-y-6 text-center py-6"
                >
                  <div className="h-20 w-20 mx-auto rounded-full bg-emerald-500/10 border-2 border-emerald-500/30 text-emerald-500 flex items-center justify-center shadow-lg shadow-emerald-500/20">
                    <Check className="h-10 w-10 stroke-[3]" />
                  </div>

                  <div className="space-y-2">
                    <h2 className="text-2xl sm:text-3xl font-black text-[var(--text)] tracking-tight">
                      Registration Confirmed! 🎉
                    </h2>
                    <p className="text-sm text-[var(--muted)] max-w-md mx-auto leading-relaxed">
                      {successData?.message ||
                        "Your delegate pass has been issued. You can now access your personalized attendee dashboard."}
                    </p>
                  </div>

                  {successData?.regno && (
                    <div className="p-5 rounded-2xl bg-[var(--bg-surface-2)] border-2 border-[var(--border-default)] inline-block mx-auto space-y-1.5 shadow-sm">
                      <span className="text-[10px] font-black uppercase tracking-widest text-[var(--muted)] block">
                        Official Registration ID
                      </span>
                      <span className="text-lg font-black font-mono text-[var(--text)] block">
                        {successData.regno}
                      </span>
                    </div>
                  )}

                  <div className="pt-4 flex justify-center">
                    <button
                      type="button"
                      onClick={() => {
                        localStorage.setItem(`portal_registered_${eventId}`, "true");
                        router.replace(`/${eventId}/dashboard`);
                      }}
                      className="h-14 px-8 rounded-2xl bg-[var(--pri)] hover:opacity-95 text-[var(--primary-contrast,#ffffff)] text-xs sm:text-sm font-black uppercase tracking-wider flex items-center gap-3 transition-all cursor-pointer shadow-xl shadow-[var(--pri)]/30"
                    >
                      <span>Go to Attendee Dashboard &amp; Entry Pass</span>
                      <ArrowRight className="h-5 w-5" />
                    </button>
                  </div>
                </motion.div>
              )}

            </div>
          </div>

          {/* ════ RIGHT COLUMN: BIG THEMED ILLUSTRATION & INFO (5 COLS - STEADY/FIXED IN GRID) ═════════ */}
          <div className="lg:col-span-5 space-y-6">
            <div className="p-6 md:p-8 rounded-[28px] border-2 border-[var(--border-default)] bg-[var(--card)] shadow-lg space-y-6 text-center">

              {/* Big Themed Illustration matching Current Step */}
              <div className="py-2 flex justify-center items-center">
                <ThemedIllustration
                  key={currentStep.illustration}
                  name={currentStep.illustration}
                  className="w-56 h-56 sm:w-64 sm:h-64 drop-shadow-xl"
                  glow={true}
                  animate={true}
                />
              </div>

              {/* Step Info Box */}
              <div className="space-y-1.5 text-center">
                <span className="text-[10px] font-black uppercase tracking-widest text-[var(--muted)] block">
                  STEP {currentStepIndex + 1} OF {totalSteps}
                </span>
                <h3 className="text-lg font-black text-[var(--text)] tracking-tight">
                  {currentStep.label}
                </h3>
                <p className="text-xs text-[var(--muted)] leading-relaxed max-w-xs mx-auto">
                  {currentStep.description}
                </p>
              </div>

              {/* Live Ticket Badge Preview */}
              <div className="p-4 rounded-2xl bg-[var(--bg-surface-2)] border-2 border-[var(--border-default)] text-left space-y-2.5">
                <div className="flex justify-between items-center text-xs">
                  <span className="text-[var(--muted)] font-bold">Selected Tier</span>
                  {formData.role ? (
                    <span className="font-black text-[var(--text)] uppercase tracking-wider">
                      {formData.role}
                    </span>
                  ) : (
                    <span className="text-xs font-semibold text-[var(--muted)] italic">
                      None Selected
                    </span>
                  )}
                </div>
                <div className="flex justify-between items-center text-xs pt-2 border-t border-[var(--border-default)]">
                  <span className="text-[var(--muted)] font-bold">Access Fee</span>
                  <span className="font-black text-[var(--text)] font-mono text-sm">
                    {formData.role ? (
                      isPaymentEnabled && getFinalTicketPrice() > 0
                        ? `${currency} ${Number(getFinalTicketPrice()).toLocaleString()}`
                        : "Complimentary"
                    ) : (
                      <span className="text-sm font-bold text-[var(--muted)]">—</span>
                    )}
                  </span>
                </div>
              </div>

            </div>
          </div>

        </div>

      </div>
    </div>
  );
}
