"use client";

import { useEffect, useState, useMemo, useRef } from "react";
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
import { toast } from "@/lib/toast";
import { ThemedIllustration, IllustrationName } from "@/components/ui/themed-illustration";
import {
  CountryStateEntry,
  fetchCountryStates,
  getAllowedCountries,
  getStatesForCountry,
  COUNTRY_DIAL_CODES,
  getDialCodeForCountry,
  MASTER_ROLE_CATEGORIES,
} from "@eventos/form-builder-studio";
import { uploadPublicRegistrationFile, requiresNewUploadAttempt } from "@/lib/scan-gated-registration-upload";

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
  step_index?: number;
  grid_width?: "full" | "half" | "third";
  validation?: {
    allowed_file_types?: string[];
    max_file_size_mb?: number;
  };
}

type ManagedUploadValue = {
  kind: "managed-upload";
  managed_url: string;
  name: string;
  size: number;
  type: string;
  preview_url?: string;
};

interface ConfiguredStep {
  id: string;
  title: string;
  description?: string;
}

const TITLE_OPTIONS = ["Dr.", "Prof.", "Mr.", "Ms.", "Mrs."];

const FORM_STEP_ILLUSTRATIONS: IllustrationName[] = [
  "forms",
  "upload",
  "id-card",
  "conference-amico",
  "conference-speaker",
  "forms",
];

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
  const [uploadStates, setUploadStates] = useState<Record<string, {
    status: "uploading";
    progress: number;
    filename: string;
  }>>({});
  const uploadControllers = useRef(new Map<string, AbortController>());
  const uploadRetryKeys = useRef(new Map<string, { fingerprint: string; key: string }>());
  const submissionRetryKey = useRef<{ fingerprint: string; key: string } | null>(null);
  const previewUrls = useRef(new Set<string>());
  const hasPendingUploads = Object.keys(uploadStates).length > 0;
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

  const [alreadyRegisteredData, setAlreadyRegisteredData] = useState<{
    regno?: string;
    name?: string;
    category?: string;
    email?: string;
    phone?: string;
  } | null>(null);

  useEffect(() => () => {
    uploadControllers.current.forEach((controller) => controller.abort());
    previewUrls.current.forEach((url) => URL.revokeObjectURL(url));
    uploadControllers.current.clear();
    previewUrls.current.clear();
  }, []);

  // Check if user is already registered or redirect to login if no session token
  useEffect(() => {
    const token =
      localStorage.getItem(`portal_token_${eventId}`) ||
      localStorage.getItem(`portal_jwt_${eventId}`);
    if (!token) {
      router.replace(`/${eventId}/login`);
      return;
    }

    // Check fast cached registration flag
    const cachedRegistered = localStorage.getItem(`portal_registered_${eventId}`) === "true";
    const cachedParticipant = localStorage.getItem(`portal_participant_${eventId}`);
    if (cachedRegistered && cachedParticipant) {
      try {
        const parsed = JSON.parse(cachedParticipant);
        if (parsed?.regno) {
          setAlreadyRegisteredData({
            regno: parsed.regno,
            name: parsed.name,
            category: parsed.category,
            email: parsed.email,
          });
        }
      } catch {}
    }

    // Verify against both dashboard API and user profile
    Promise.all([
      fetch(`${API_BASE}/api/v1/portal/dashboard`, {
        headers: { Authorization: `Bearer ${token}` },
      }).then((res) => (res.ok ? res.json() : null)),
      fetch(`${API_BASE}/api/v1/portal/users/${eventId}/me`, {
        headers: { Authorization: `Bearer ${token}` },
      }).then((res) => (res.ok ? res.json() : null)),
    ])
      .then(([dash, usr]) => {
        const isRegistered =
          Boolean(dash?.participant?.regno) ||
          Boolean(usr?.is_registered) ||
          (dash?.registration?.status &&
            dash?.registration?.status !== "not_registered" &&
            dash?.registration?.status !== "closed" &&
            Boolean(dash?.registration?.registration_id));

        if (isRegistered) {
          localStorage.setItem(`portal_registered_${eventId}`, "true");
          setAlreadyRegisteredData({
            regno: dash?.participant?.regno || "CONFIRMED",
            name: dash?.participant?.name || usr?.full_name || "Registered Delegate",
            category: dash?.participant?.category || "Delegate",
            email: dash?.participant?.email || usr?.email || "",
            phone: dash?.participant?.phone || "",
          });
        } else {
          localStorage.removeItem(`portal_registered_${eventId}`);
          setAlreadyRegisteredData(null);
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
          setAlreadyRegisteredData({
            regno: p.regno,
            name: p.name || "",
            category: p.category || "Delegate",
            email: p.email || "",
          });
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

  // All active fields, sorted by step_index then configured order
  const activeFields: FormField[] = useMemo(() => {
    if (!config?.fields || !Array.isArray(config.fields)) return [];
    return [...config.fields]
      .filter((f: FormField) => f.is_active !== false)
      .sort((a: FormField, b: FormField) => {
        const si = (a.step_index ?? 0) - (b.step_index ?? 0);
        return si !== 0 ? si : 0;
      });
  }, [config]);

  const hasRoleFieldInForm = useMemo(() => {
    return activeFields.some((f) => f.id === "role" || f.name === "role" || f.type === "role");
  }, [activeFields]);

  // Configured form steps from the form builder (settings.steps)
  const configuredSteps: ConfiguredStep[] = useMemo(() => {
    const saved = config?.settings?.steps as ConfiguredStep[] | undefined;
    if (saved && Array.isArray(saved) && saved.length > 0) return saved;
    return [{ id: "step_0", title: "Registration Details" }];
  }, [config]);

  // Fields per step index
  const fieldsByStep: FormField[][] = useMemo(() => {
    return configuredSteps.map((_, idx) =>
      activeFields.filter((f) => (f.step_index ?? 0) === idx)
    );
  }, [activeFields, configuredSteps]);

  const activePrices: Record<string, number> = config?.active_prices || {};
  const roleOptions: string[] = useMemo(() => {
    const roleField = config?.fields?.find((f: FormField) => f.id === "role" || f.name === "role");
    if (roleField?.options && Array.isArray(roleField.options) && roleField.options.length > 0) {
      return roleField.options;
    }
    if (config?.roles && Array.isArray(config.roles) && config.roles.length > 0) {
      return config.roles.map((r: any) => typeof r === "string" ? r : r.name);
    }
    if (Object.keys(activePrices).length > 0) {
      return Object.keys(activePrices);
    }
    return ["Free Pass", "Complimentary Pass", "Delegate", "Student Delegate", "VIP Guest"];
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

  // ── Build the full step list: N form steps + Category + (Payment) + Confirmation ──
  interface StepDef {
    key: string; // "form_step_0", "form_step_1", ..., "category", "payment", "confirmation"
    label: string;
    description: string;
    illustration: IllustrationName;
    stepIndex?: number; // index into configuredSteps / fieldsByStep
  }


  const stepsList: StepDef[] = useMemo(() => {
    const steps: StepDef[] = configuredSteps.map((cs, idx) => ({
      key: `form_step_${idx}`,
      label: cs.title || `Step ${idx + 1}`,
      description: cs.description || "Complete the fields below to proceed",
      illustration: FORM_STEP_ILLUSTRATIONS[idx] || "forms",
      stepIndex: idx,
    }));

    if (!hasRoleFieldInForm && roleOptions.length > 0) {
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
  }, [configuredSteps, roleOptions, isPaymentEnabled, formData.role, appliedPromo]);

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

  // Validate the required fields of any form step by step index
  const validateFormStep = (fields: FormField[]) => {
    const errs: Record<string, string> = {};

    for (const field of fields) {
      if (["section", "heading", "paragraph", "divider"].includes(field.type)) continue;

      const key = field.name || field.id;
      const val = formData[key];

      if (field.is_required && (!val || (typeof val === "string" && !val.trim()))) {
        errs[key] = `${field.label || key} is required`;
        continue;
      }

      if (field.type === "email" && val && !/^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(val)) {
        errs[key] = "Please enter a valid email address";
      }

      if ((field.type === "phone" || key.includes("phone") || key.includes("mobile")) && val) {
        const digits = String(val).replace(/\D/g, "");
        if (digits.length < 7 || digits.length > 15) {
          errs[key] = "Enter a valid phone number (7-15 digits)";
        }
      }

      if (field.type === "country" || key === "country") {
        const currentCountry = formData.country || val;
        const availableStates = getStatesForCountry(countryStates, currentCountry);
        if (availableStates.length > 0 && field.is_required && !formData.country_state && !formData.state) {
          errs.country_state = "Please select state / province";
        }
      }
    }

    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleNext = () => {
    if (currentStep.key.startsWith("form_step_")) {
      const stepIdx = currentStep.stepIndex ?? 0;
      const fields = fieldsByStep[stepIdx] || [];
      if (!validateFormStep(fields)) {
        toast.error("Please fill in all required fields before continuing.");
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

  const isManagedUploadValue = (value: unknown): value is ManagedUploadValue =>
    Boolean(value && typeof value === "object" &&
      (value as ManagedUploadValue).kind === "managed-upload" &&
      typeof (value as ManagedUploadValue).managed_url === "string");

  const removeManagedUpload = (key: string) => {
    uploadControllers.current.get(key)?.abort();
    uploadControllers.current.delete(key);
    uploadRetryKeys.current.delete(key);
    setUploadStates((current) => {
      const next = { ...current };
      delete next[key];
      return next;
    });
    setFormData((current) => {
      const existing = current[key];
      if (isManagedUploadValue(existing) && existing.preview_url) {
        URL.revokeObjectURL(existing.preview_url);
        previewUrls.current.delete(existing.preview_url);
      }
      const next = { ...current };
      delete next[key];
      return next;
    });
  };

  const uploadManagedField = async (field: FormField, key: string, file: File) => {
    const configuredMaximum = Number(field.validation?.max_file_size_mb || 10);
    const maximumMb = Number.isFinite(configuredMaximum) && configuredMaximum > 0
      ? configuredMaximum : 10;
    if (file.size > maximumMb * 1024 * 1024) {
      setErrors((current) => ({ ...current, [key]: `File size exceeds the ${maximumMb}MB limit.` }));
      return;
    }
    const allowed = (field.validation?.allowed_file_types || [])
      .map((value) => value.trim().toLowerCase().replace(/^\./, ""))
      .filter(Boolean);
    const extension = file.name.includes(".") ? file.name.split(".").pop()?.toLowerCase() || "" : "";
    if (allowed.length && !allowed.includes(extension)) {
      setErrors((current) => ({ ...current, [key]: "This file type is not allowed for this field." }));
      return;
    }

    uploadControllers.current.get(key)?.abort();
    const controller = new AbortController();
    uploadControllers.current.set(key, controller);
    const fingerprint = `${file.name}:${file.size}:${file.lastModified}:${file.type}`;
    const previousReceipt = uploadRetryKeys.current.get(key);
    const idempotencyKey = previousReceipt?.fingerprint === fingerprint
      ? previousReceipt.key : crypto.randomUUID();
    uploadRetryKeys.current.set(key, { fingerprint, key: idempotencyKey });
    setUploadStates((current) => ({
      ...current,
      [key]: { status: "uploading", progress: 0, filename: file.name },
    }));
    setErrors((current) => {
      const next = { ...current };
      delete next[key];
      return next;
    });

    try {
      const accepted = await uploadPublicRegistrationFile({
        apiOrigin: API_BASE,
        eventId,
        fieldName: field.id,
        file,
        idempotencyKey,
        signal: controller.signal,
        onProgress: (progress) => setUploadStates((current) =>
          current[key]?.status === "uploading"
            ? { ...current, [key]: { ...current[key], progress } }
            : current),
      });
      if (uploadControllers.current.get(key) !== controller) return;
      const previewUrl = file.type.startsWith("image/") ? URL.createObjectURL(file) : undefined;
      if (previewUrl) previewUrls.current.add(previewUrl);
      setFormData((current) => {
        const previous = current[key];
        if (isManagedUploadValue(previous) && previous.preview_url) {
          URL.revokeObjectURL(previous.preview_url);
          previewUrls.current.delete(previous.preview_url);
        }
        return { ...current, [key]: {
          kind: "managed-upload",
          managed_url: accepted.managed_url,
          name: accepted.filename || file.name,
          size: file.size,
          type: file.type,
          preview_url: previewUrl,
        } satisfies ManagedUploadValue,
        };
      });
      setUploadStates((current) => {
        const next = { ...current };
        delete next[key];
        return next;
      });
      uploadRetryKeys.current.delete(key);
    } catch (error) {
      if (controller.signal.aborted || uploadControllers.current.get(key) !== controller) return;
      if (requiresNewUploadAttempt(error)) uploadRetryKeys.current.delete(key);
      const message = error instanceof Error ? error.message : "The file could not be uploaded securely.";
      setUploadStates((current) => {
        const next = { ...current };
        delete next[key];
        return next;
      });
      setErrors((current) => ({ ...current, [key]: message }));
    } finally {
      if (uploadControllers.current.get(key) === controller) {
        uploadControllers.current.delete(key);
      }
    }
  };

  const handleSubmitRegistration = async () => {
    if (hasPendingUploads) {
      toast.error("Wait for file security processing to finish before submitting.");
      return;
    }
    // Validate each form step before submission
    for (let i = 0; i < configuredSteps.length; i++) {
      const fields = fieldsByStep[i] || [];
      if (!validateFormStep(fields)) {
        const stepIdx = stepsList.findIndex((s) => s.key === `form_step_${i}`);
        if (stepIdx >= 0) setCurrentStepIndex(stepIdx);
        toast.error("Please resolve errors in your form before submitting.");
        return;
      }
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

      for (const field of activeFields) {
        const stateKey = field.name || field.id;
        const value = formData[stateKey];
        const safeValue = isManagedUploadValue(value) ? value.managed_url : value;
        const standardKey = standardKeys.has(field.id) ? field.id
          : standardKeys.has(stateKey) ? stateKey : null;
        if (standardKey) {
          payloadData[standardKey] = safeValue;
        } else if (field.id) {
          custom_fields[field.id] = safeValue;
        }
      }
      // Some canonical defaults can be supplied by authentication/profile data
      // even when the current visual form omits them.
      for (const key of standardKeys) {
        if (!(key in payloadData) && key in formData) payloadData[key] = formData[key];
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

      const submissionFingerprint = JSON.stringify(payload);
      const idempotencyKey = submissionRetryKey.current?.fingerprint === submissionFingerprint
        ? submissionRetryKey.current.key
        : crypto.randomUUID();
      submissionRetryKey.current = { fingerprint: submissionFingerprint, key: idempotencyKey };

      const res = await fetch(`${API_BASE}/api/v1/portal/registration/${eventId}/register`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": idempotencyKey,
        },
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
      submissionRetryKey.current = null;

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

  const getColSpanClass = (gridWidth?: string) => {
    switch (gridWidth) {
      case "third":
        return "col-span-1 md:col-span-2";
      case "half":
        return "col-span-1 md:col-span-3";
      case "full":
      default:
        return "col-span-1 md:col-span-6";
    }
  };

  // Grid-aware renderer supporting all form builder field types, layouts, dial codes, full country & state, and categorized roles
  const renderGridField = (field: FormField) => {
    const key = field.name || field.id;
    const val = formData[key] ?? "";
    const error = errors[key];
    const spanClass = getColSpanClass(field.grid_width);

    // Layout elements
    if (field.type === "section") {
      return (
        <div key={key} className="col-span-1 md:col-span-6 pt-4 pb-2 border-b border-[var(--border-default)]">
          <h3 className="text-base font-black text-[var(--text)]">{field.label}</h3>
          {field.placeholder && <p className="text-xs text-[var(--muted)] mt-0.5">{field.placeholder}</p>}
        </div>
      );
    }
    if (field.type === "heading") {
      return (
        <div key={key} className="col-span-1 md:col-span-6 pt-2">
          <h4 className="text-sm font-black text-[var(--text)] uppercase tracking-wider">{field.label}</h4>
        </div>
      );
    }
    if (field.type === "paragraph") {
      return (
        <div key={key} className="col-span-1 md:col-span-6 text-xs text-[var(--muted)] leading-relaxed">
          {field.placeholder || field.label}
        </div>
      );
    }
    if (field.type === "divider") {
      return (
        <div key={key} className="col-span-1 md:col-span-6 py-2">
          <hr className="border-t border-[var(--border-default)]" />
        </div>
      );
    }

    // Role selector with master categories
    if (field.type === "role" || key === "role" || key === "category") {
      return (
        <div key={key} className={`${spanClass} space-y-2 text-left`}>
          <label className="text-[11px] font-black uppercase tracking-wider text-[var(--muted)] flex items-center justify-between">
            <span>
              {field.label || "Registration Role / Category"} {field.is_required && <span className="text-rose-500">*</span>}
            </span>
          </label>
          <select
            value={formData.role || ""}
            onChange={(e) => setFormData({ ...formData, role: e.target.value })}
            className={`w-full h-12 px-4 rounded-xl text-sm font-semibold bg-[var(--bg-surface-2)] border-2 text-[var(--text)] transition-all cursor-pointer ${
              error
                ? "border-rose-500 ring-2 ring-rose-500/20"
                : "border-[var(--border-default)] focus:border-[var(--pri)] focus:ring-4 focus:ring-[var(--pri)]/15 focus:bg-[var(--card)]"
            }`}
          >
            <option value="">Select your participation role...</option>
            {Object.entries(MASTER_ROLE_CATEGORIES).map(([catTitle, roleList]) => {
              const availableInCat = roleList.filter((r) =>
                roleOptions.some((opt) => opt.toLowerCase() === r.toLowerCase())
              );
              if (availableInCat.length === 0) return null;
              return (
                <optgroup key={catTitle} label={catTitle}>
                  {availableInCat.map((roleName) => (
                    <option key={roleName} value={roleName}>
                      {roleName}
                    </option>
                  ))}
                </optgroup>
              );
            })}
            {roleOptions
              .filter(
                (r) =>
                  !Object.values(MASTER_ROLE_CATEGORIES)
                    .flat()
                    .some((mr) => mr.toLowerCase() === r.toLowerCase())
              )
              .map((cr) => (
                <option key={cr} value={cr}>
                  {cr}
                </option>
              ))}
          </select>
          {error && <span className="text-xs text-rose-500 font-bold block">{error}</span>}
        </div>
      );
    }

    // Phone input with integrated country dial code selector
    if (field.type === "phone" || key === "phone" || key.includes("mobile") || key.includes("tel")) {
      return (
        <div key={key} className={`${spanClass} space-y-2 text-left`}>
          <label className="text-[11px] font-black uppercase tracking-wider text-[var(--muted)] flex items-center justify-between">
            <span>
              {field.label || "Phone Number"} {field.is_required && <span className="text-rose-500">*</span>}
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
              placeholder={field.placeholder || "Enter phone number"}
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
        <div key={key} className={`${spanClass} grid grid-cols-1 sm:grid-cols-2 gap-3 text-left`}>
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
            {errors.country_state && <span className="text-xs text-rose-500 font-bold block">{errors.country_state}</span>}
          </div>
        </div>
      );
    }

    // Skip separate state/country_state field if country is already rendered
    if (key === "country_state" || key === "state") {
      const hasCountryField = activeFields.some((f: FormField) => (f.name || f.id) === "country");
      if (hasCountryField) {
        return null;
      }
      const currentCountry = formData.country || "India";
      const availableStates = getStatesForCountry(countryStates, currentCountry);
      return (
        <div key={key} className={`${spanClass} space-y-2 text-left`}>
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

    // Email field: bound to authenticated login identity
    if (field.type === "email" || key === "email") {
      const emailValue = formData.email || val || "";
      return (
        <div key={key} className={`${spanClass} space-y-2 text-left`}>
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

    // Title / Prefix
    if (key === "title") {
      const options = field.options && field.options.length > 0 ? field.options : TITLE_OPTIONS;
      return (
        <div key={key} className={`${spanClass} space-y-2 text-left`}>
          <label className="text-[11px] font-black uppercase tracking-wider text-[var(--muted)] flex items-center justify-between">
            <span>
              {field.label || "Title / Prefix"} {field.is_required && <span className="text-rose-500">*</span>}
            </span>
          </label>
          <select
            value={formData.title || options[0]}
            onChange={(e) => setFormData({ ...formData, title: e.target.value })}
            className={`w-full h-12 px-4 rounded-xl text-sm font-semibold bg-[var(--bg-surface-2)] border-2 text-[var(--text)] transition-all cursor-pointer ${
              error
                ? "border-rose-500 ring-2 ring-rose-500/20"
                : "border-[var(--border-default)] focus:border-[var(--pri)] focus:ring-4 focus:ring-[var(--pri)]/15 focus:bg-[var(--card)]"
            }`}
          >
            {options.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
          {error && <span className="text-xs text-rose-500 font-bold block">{error}</span>}
        </div>
      );
    }

    // First Name
    if (key === "first_name") {
      return (
        <div key={key} className={`${spanClass} space-y-2 text-left`}>
          <label className="text-[11px] font-black uppercase tracking-wider text-[var(--muted)] flex items-center justify-between">
            <span>
              {field.label || "First Name"} {field.is_required && <span className="text-rose-500">*</span>}
            </span>
          </label>
          <input
            type="text"
            placeholder={field.placeholder || "Enter first name"}
            value={formData.first_name ?? ""}
            onChange={(e) =>
              setFormData({
                ...formData,
                first_name: e.target.value,
                name: `${e.target.value} ${formData.last_name || ""}`.trim(),
              })
            }
            className={`w-full h-12 px-4 rounded-xl text-sm font-semibold bg-[var(--bg-surface-2)] border-2 text-[var(--text)] transition-all ${
              error
                ? "border-rose-500 ring-2 ring-rose-500/20"
                : "border-[var(--border-default)] focus:border-[var(--pri)] focus:ring-4 focus:ring-[var(--pri)]/15 focus:bg-[var(--card)]"
            }`}
          />
          {error && <span className="text-xs text-rose-500 font-bold block">{error}</span>}
        </div>
      );
    }

    // Last Name
    if (key === "last_name") {
      return (
        <div key={key} className={`${spanClass} space-y-2 text-left`}>
          <label className="text-[11px] font-black uppercase tracking-wider text-[var(--muted)] flex items-center justify-between">
            <span>
              {field.label || "Last Name"} {field.is_required && <span className="text-rose-500">*</span>}
            </span>
          </label>
          <input
            type="text"
            placeholder={field.placeholder || "Enter last name"}
            value={formData.last_name ?? ""}
            onChange={(e) =>
              setFormData({
                ...formData,
                last_name: e.target.value,
                name: `${formData.first_name || ""} ${e.target.value}`.trim(),
              })
            }
            className={`w-full h-12 px-4 rounded-xl text-sm font-semibold bg-[var(--bg-surface-2)] border-2 text-[var(--text)] transition-all ${
              error
                ? "border-rose-500 ring-2 ring-rose-500/20"
                : "border-[var(--border-default)] focus:border-[var(--pri)] focus:ring-4 focus:ring-[var(--pri)]/15 focus:bg-[var(--card)]"
            }`}
          />
          {error && <span className="text-xs text-rose-500 font-bold block">{error}</span>}
        </div>
      );
    }

    // Generic Fields: select, textarea, checkbox, radio, number, date, text
    return (
      <div key={key} className={`${spanClass} space-y-2 text-left`}>
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
        ) : ["file", "image", "upload"].includes(field.type) ? (
          (() => {
            const isImageField = field.type === "image";
            const uploadState = uploadStates[key];
            const isImagePreview =
              Boolean(val) &&
              (isImageField ||
                (typeof val === "object" && val?.type?.startsWith("image/")) ||
                (typeof val === "string" && /\.(png|jpe?g|webp|gif|svg)$/i.test(val)));
            const previewSrc =
              typeof val === "object" ? val?.preview_url : typeof val === "string" ? val : null;
            const fileName =
              uploadState?.filename || (typeof val === "object" ? val?.name
                : typeof val === "string" ? val.split("/").pop() : "Uploaded file");
            const fileSizeFormatted =
              typeof val === "object" && val?.size
                ? val.size > 1024 * 1024
                  ? `${(val.size / (1024 * 1024)).toFixed(1)} MB`
                  : `${Math.round(val.size / 1024)} KB`
                : null;

            const handleFileSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
              const files = e.target.files;
              if (!files || files.length === 0) return;
              void uploadManagedField(field, key, files[0]);
            };

            const handleFileDrop = (e: React.DragEvent<HTMLDivElement>) => {
              e.preventDefault();
              const files = e.dataTransfer.files;
              if (!files || files.length === 0) return;
              void uploadManagedField(field, key, files[0]);
            };

            const configuredTypes = (field.validation?.allowed_file_types || [])
              .map((value) => value.trim()).filter(Boolean);
            const accept = configuredTypes.length
              ? configuredTypes.map((value) => value.startsWith(".") ? value : `.${value}`).join(",")
              : isImageField ? "image/*" : ".pdf,.doc,.docx,.png,.jpg,.jpeg,.webp";

            return (
              <div className="space-y-2">
                {uploadState?.status === "uploading" ? (
                  <div className="p-3.5 rounded-xl bg-[var(--bg-surface-2)] border-2 border-[var(--border-default)] flex items-center justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-3">
                      <Loader2 className="h-5 w-5 shrink-0 animate-spin text-[var(--pri)]" />
                      <div className="min-w-0">
                        <p className="truncate text-xs font-bold text-[var(--text)]">{uploadState.filename}</p>
                        <p className="text-[10px] font-semibold text-[var(--muted)]">
                          Security processing {uploadState.progress}%
                        </p>
                      </div>
                    </div>
                    <button type="button" onClick={() => removeManagedUpload(key)}
                      className="p-1.5 rounded-lg text-[var(--muted)] hover:text-rose-500 hover:bg-rose-500/10 transition"
                      aria-label={`Cancel upload for ${field.label}`}>
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                ) : val ? (
                  <div className="p-3.5 rounded-xl bg-[var(--bg-surface-2)] border-2 border-[var(--border-default)] flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      {isImagePreview && previewSrc ? (
                        <img
                          src={previewSrc}
                          alt={fileName}
                          className="h-12 w-12 rounded-lg object-cover border border-[var(--border-default)] shrink-0 bg-black/20"
                        />
                      ) : (
                        <div className="h-10 w-10 rounded-lg bg-[var(--pri)]/10 border border-[var(--pri)]/20 text-[var(--pri)] flex items-center justify-center shrink-0">
                          <FileText className="h-5 w-5" />
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-bold text-[var(--text)] truncate">{fileName}</p>
                        {fileSizeFormatted && (
                          <p className="text-[10px] text-[var(--muted)] font-semibold">{fileSizeFormatted}</p>
                        )}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => removeManagedUpload(key)}
                      className="p-1.5 rounded-lg text-[var(--muted)] hover:text-rose-500 hover:bg-rose-500/10 transition cursor-pointer shrink-0"
                      title="Remove file"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                ) : (
                  <div
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={handleFileDrop}
                    className={`p-5 border-2 border-dashed rounded-xl text-center transition cursor-pointer bg-[var(--bg-surface-2)]/60 relative group ${
                      error
                        ? "border-rose-500 ring-2 ring-rose-500/20"
                        : "border-[var(--border-default)] hover:border-[var(--pri)] hover:bg-[var(--card)]"
                    }`}
                  >
                    <input
                      type="file"
                      accept={accept}
                      onChange={handleFileSelected}
                      disabled={uploadState?.status === "uploading"}
                      className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                    />
                    <Upload className="h-6 w-6 text-[var(--muted)] group-hover:text-[var(--pri)] mx-auto mb-1.5 transition" />
                    <p className="text-xs font-bold text-[var(--text)]">
                      Click or drag file here to upload
                    </p>
                    <p className="text-[10px] text-[var(--muted)] mt-0.5">
                      {isImageField ? "PNG, JPG, WEBP up to 10MB" : "PDF, DOC, PNG, JPG up to 10MB"}
                    </p>
                  </div>
                )}
              </div>
            );
          })()
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

  // If the participant is already registered, do NOT open the editable form
  if (alreadyRegisteredData) {
    return (
      <div className="min-h-screen pb-16 bg-transparent text-[var(--text)] transition-colors duration-200 relative z-10">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 pt-12 space-y-8">
          {/* Confirmed Registration Card (Dashboard Card Token, No Glow) */}
          <div className="relative overflow-hidden p-6 md:p-8 rounded-[28px] border-2 border-[var(--border-default)] bg-[var(--card)] shadow-xl ring-1 ring-black/5 dark:ring-white/10 text-left space-y-6">
            <div className="relative z-10 space-y-6">
              {/* Header Badge */}
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full text-xs font-black uppercase tracking-wider border border-[var(--sec)]/30 bg-[var(--sec)]/10 text-[var(--sec)]">
                  <ShieldCheck className="w-4 h-4 text-[var(--pri)]" />
                  <span>Confirmed Registration</span>
                </div>
                <span className="px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest bg-emerald-500/15 text-emerald-500 border border-emerald-500/20">
                  Active Delegate
                </span>
              </div>

              <div>
                <h1 className="text-2xl sm:text-3xl font-black text-[var(--text)] tracking-tight">
                  You are Officially Registered!
                </h1>
                <p className="text-xs sm:text-sm text-[var(--muted)] mt-1.5 leading-relaxed">
                  Your delegate credentials and event registration have already been confirmed. The registration form is locked to prevent duplicate submissions and preserve your credential integrity.
                </p>
              </div>

              {/* Delegate Pass Card */}
              <div
                className="p-6 rounded-2xl border-2 border-[var(--border-default)] bg-[var(--bg-surface-2)]/60 relative overflow-hidden"
                style={{
                  borderLeft: "5px solid var(--sec)",
                }}
              >
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <span className="text-[10px] font-black uppercase tracking-wider text-[var(--sec)] block">
                      Registration Number
                    </span>
                    <span className="text-base sm:text-lg font-black font-mono text-[var(--text)]">
                      {alreadyRegisteredData.regno || "CONFIRMED"}
                    </span>
                  </div>

                  <div>
                    <span className="text-[10px] font-black uppercase tracking-wider text-[var(--muted)] block">
                      Registration Category
                    </span>
                    <span
                      className="inline-block px-2.5 py-0.5 mt-0.5 rounded-lg text-xs font-bold"
                      style={{
                        backgroundColor: "color-mix(in srgb, var(--sec) 15%, transparent)",
                        color: "var(--sec)",
                      }}
                    >
                      {alreadyRegisteredData.category || "Delegate"}
                    </span>
                  </div>

                  <div>
                    <span className="text-[10px] font-black uppercase tracking-wider text-[var(--muted)] block">
                      Delegate Name
                    </span>
                    <span className="text-sm font-bold text-[var(--text)] block">
                      {alreadyRegisteredData.name || "Conference Delegate"}
                    </span>
                  </div>

                  {alreadyRegisteredData.email && (
                    <div>
                      <span className="text-[10px] font-black uppercase tracking-wider text-[var(--muted)] block">
                        Registered Email
                      </span>
                      <span className="text-xs font-medium font-mono text-[var(--muted)] block truncate">
                        {alreadyRegisteredData.email}
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {/* Quick Navigation Actions */}
              <div className="pt-2 flex flex-col sm:flex-row items-center gap-3">
                <button
                  type="button"
                  onClick={() => router.push(`/${eventId}/dashboard`)}
                  className="w-full sm:w-auto h-12 px-6 rounded-2xl text-white font-black text-xs uppercase tracking-wider flex items-center justify-center gap-2 shadow-lg cursor-pointer transition-all hover:opacity-90 bg-[var(--pri)]"
                >
                  <span>Open Delegate Dashboard</span>
                  <ArrowRight className="w-4 h-4" />
                </button>

                <button
                  type="button"
                  onClick={() => router.push(`/${eventId}/call-for-abstracts`)}
                  className="w-full sm:w-auto h-12 px-6 rounded-2xl border border-[var(--border-default)] bg-[var(--card)] hover:border-[var(--sec)] text-[var(--text)] font-black text-xs uppercase tracking-wider flex items-center justify-center gap-2 transition-colors cursor-pointer"
                >
                  <FileText className="w-4 h-4 text-[var(--sec)]" />
                  <span>Abstract Workspace</span>
                </button>

                <button
                  type="button"
                  onClick={() => router.push(`/${eventId}`)}
                  className="w-full sm:w-auto h-12 px-4 rounded-2xl text-[var(--muted)] hover:text-[var(--text)] font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                >
                  <span>Event Home</span>
                </button>
              </div>
            </div>
          </div>
        </div>
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
            className="absolute top-6 left-[8%] h-1 bg-[var(--pri)] rounded-full transition-all duration-300"
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
                        ? "text-white ring-4 ring-[var(--pri)]/20"
                        : isCurrent
                        ? "text-white ring-4 ring-[var(--sec)]/30 scale-105"
                        : "bg-[var(--card)] border-2 border-[var(--border-default)] text-[var(--muted)]"
                    }`}
                    style={
                      isPassed || isCurrent
                        ? { backgroundColor: "var(--pri)" }
                        : {}
                    }
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
            <div className="p-6 md:p-8 rounded-[28px] border-2 border-[var(--border-default)] bg-[var(--card)] shadow-xl ring-1 ring-black/5 dark:ring-white/10 space-y-6 text-left">

              {/* ── DYNAMIC FORM STEPS (from Form Builder) ───────────────────── */}
              {currentStep.key.startsWith("form_step_") && (() => {
                const stepIdx = currentStep.stepIndex ?? 0;
                const stepFields = fieldsByStep[stepIdx] || [];
                const isFirstStep = currentStepIndex === 0;
                const isLastFormStep = !stepsList[currentStepIndex + 1]?.key.startsWith("form_step_");

                return (
                  <motion.div
                    key={currentStep.key}
                    initial={{ opacity: 0, x: isFirstStep ? -10 : 10 }}
                    animate={{ opacity: 1, x: 0 }}
                    className="space-y-6"
                  >
                    <div>
                      <h2 className="text-lg font-black text-[var(--text)]">{currentStep.label}</h2>
                      <p className="text-xs text-[var(--muted)] mt-0.5">{currentStep.description}</p>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-6 gap-4">
                      {stepFields.map((field) => renderGridField(field))}

                      {stepFields.length === 0 && (
                        <p className="col-span-1 md:col-span-6 text-sm text-[var(--muted)] text-center py-6 italic">
                          No fields configured for this step.
                        </p>
                      )}
                    </div>

                    {/* Step Actions */}
                    <div className="flex items-center justify-between pt-6 border-t-2 border-[var(--border-default)]">
                      {!isFirstStep ? (
                        <button
                          type="button"
                          onClick={handleBack}
                          className="h-12 px-6 rounded-xl border-2 border-[var(--border-default)] hover:bg-[var(--bg-surface-hover)] text-xs font-bold text-[var(--muted)] hover:text-[var(--text)] flex items-center gap-2 transition-all cursor-pointer"
                        >
                          <ArrowLeft className="h-4 w-4" />
                          <span>Back</span>
                        </button>
                      ) : <div />}

                      {isLastFormStep && roleOptions.length === 0 && !isPaymentEnabled ? (
                        <button
                          type="button"
                          onClick={handleSubmitRegistration}
                          disabled={submitting || hasPendingUploads}
                          className="h-12 px-8 rounded-xl text-white text-xs font-black uppercase tracking-wider flex items-center gap-2 transition-all cursor-pointer shadow-md hover:opacity-90 bg-[var(--pri)]"
                        >
                          {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
                          <span>Confirm & Complete Registration</span>
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={handleNext}
                          className="h-12 px-8 rounded-xl text-white text-xs font-black uppercase tracking-wider flex items-center gap-2 transition-all cursor-pointer shadow-md hover:opacity-90 bg-[var(--pri)]"
                        >
                          <span>Continue</span>
                          <ArrowRight className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  </motion.div>
                );
              })()}



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
                                : role.toLowerCase().includes("free")
                                ? "FREE"
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
                        className="h-12 px-8 rounded-xl text-white text-xs font-black uppercase tracking-wider flex items-center gap-2 transition-all cursor-pointer shadow-md hover:opacity-90 bg-[var(--pri)]"
                      >
                        <span>Proceed to Payment</span>
                        <ArrowRight className="h-4 w-4" />
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={handleSubmitRegistration}
                        disabled={submitting || hasPendingUploads}
                        className="h-12 px-8 rounded-xl text-white text-xs font-black uppercase tracking-wider flex items-center gap-2 transition-all cursor-pointer shadow-md hover:opacity-90 bg-[var(--pri)]"
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
                            ? "Transfer directly to conference bank account"
                            : "Instant simulated checkout verification"}
                        </span>
                      </div>
                    </div>

                    {/* Gateway Specific Badges & Offline Instructions */}
                    {config?.active_gateway === "offline" && config?.offline_instructions && (
                      <div className="p-4 rounded-xl bg-[var(--card)] border border-[var(--border-default)] space-y-2">
                        <span className="text-[10px] font-black uppercase tracking-wider text-[var(--pri)] block">
                          Bank Wire &amp; Payment Details
                        </span>
                        <pre className="text-xs font-mono text-[var(--text)] whitespace-pre-wrap leading-relaxed bg-[var(--bg-surface-2)] p-3 rounded-lg border border-[var(--border-default)]">
                          {config.offline_instructions}
                        </pre>
                      </div>
                    )}

                    {config?.active_gateway === "razorpay" && (
                      <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 text-xs font-semibold flex items-center gap-2">
                        <ShieldCheck className="h-4 w-4 shrink-0" />
                        <span>Connected to Official Razorpay Gateway (UPI, Cards, Netbanking).</span>
                      </div>
                    )}

                    {config?.active_gateway === "stripe" && (
                      <div className="p-3 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-600 dark:text-indigo-400 text-xs font-semibold flex items-center gap-2">
                        <ShieldCheck className="h-4 w-4 shrink-0" />
                        <span>Connected to Official Stripe Global Gateway.</span>
                      </div>
                    )}

                    {config?.active_gateway === "phonepe" && (
                      <div className="p-3 rounded-xl bg-purple-500/10 border border-purple-500/20 text-purple-600 dark:text-purple-400 text-xs font-semibold flex items-center gap-2">
                        <ShieldCheck className="h-4 w-4 shrink-0" />
                        <span>Connected to PhonePe Direct UPI &amp; Cards.</span>
                      </div>
                    )}

                    {config?.active_gateway === "simulated" && (
                      <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-600 dark:text-amber-400 text-xs font-semibold flex items-center gap-2">
                        <Info className="h-4 w-4 shrink-0" />
                        <span>Simulation Sandbox: Registration payment is verified in test mode.</span>
                      </div>
                    )}
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
                      disabled={submitting || hasPendingUploads}
                      className="h-12 px-8 rounded-xl text-white text-xs font-black uppercase tracking-wider flex items-center gap-2 transition-all cursor-pointer shadow-lg hover:opacity-90 bg-[var(--pri)]"
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
            <div className="p-6 md:p-8 rounded-[28px] border-2 border-[var(--border-default)] bg-[var(--card)] shadow-xl ring-1 ring-black/5 dark:ring-white/10 space-y-6 text-center">

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
