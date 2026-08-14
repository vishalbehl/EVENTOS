"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  UserPlus,
  Save,
  CheckCircle2,
  ArrowLeft,
  Printer,
  RefreshCw,
  FileText,
  ShieldAlert,
  Lock,
  X,
  User,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import Link from "next/link";
import { apiClient } from "@/lib/api-client";
import { compileTemplateToPdf } from "@/lib/pdf-compiler";
import { toast } from "sonner";
import { countryDialCodes, getDialCodeForCountry } from "@/lib/country-dial-codes";
import { CountryStateEntry, fallbackCountryStates, fetchCountryStates, getStatesForCountry } from "@/lib/country-states";

interface FormField {
  id: string;
  name: string;
  label: string;
  type: string;
  is_default?: boolean;
  is_required?: boolean;
  is_active?: boolean;
  options?: string[];
  placeholder?: string;
}

const STANDARD_FIELD_KEYS = new Set([
  "first_name",
  "last_name",
  "name",
  "email",
  "phone",
  "dial_code",
  "role",
  "company",
  "designation",
  "country",
  "state",
  "paid_status"
]);

const PAYMENT_STATUS_OPTIONS = [
  "Paid",
  "Unpaid",
  "Pending",
  "Partially Paid",
  "Refunded",
  "Complimentary",
  "Waived",
  "Exempted"
];

export default function DynamicOnSiteRegistrationPage() {
  const router = useRouter();
  const [loadingConfig, setLoadingConfig] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [successData, setSuccessData] = useState<any>(null);
  const [capacityError, setCapacityError] = useState<string | null>(null);
  const [capacityInfo, setCapacityInfo] = useState<{
    total_registered: number;
    total_event_limit: number;
    is_full: boolean;
  } | null>(null);

  // Country & State dataset
  const [countryStates, setCountryStates] = useState<CountryStateEntry[]>(fallbackCountryStates);
  const [dialCode, setDialCode] = useState<string>("+91");

  // Admin Capacity Override Modal state
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [adminUsername, setAdminUsername] = useState("");
  const [adminPassword, setAdminPassword] = useState("");
  const [authError, setAuthError] = useState<string | null>(null);
  const [authorizing, setAuthorizing] = useState(false);

  const [fields, setFields] = useState<FormField[]>([]);
  const [terms, setTerms] = useState("");
  const [formData, setFormData] = useState<Record<string, any>>({
    role: "Delegate",
    country: "India",
    state: "",
    phone: "",
    paid_status: "Paid"
  });

  const availableStates = useMemo(() => {
    return getStatesForCountry(countryStates, formData.country || "India");
  }, [countryStates, formData.country]);

  const fetchFormConfig = async () => {
    try {
      setLoadingConfig(true);
      const [res, capRes, countryEntries]: [any, any, CountryStateEntry[]] = await Promise.all([
        apiClient.get("/venue/registration/form-config").catch(() => null),
        apiClient.get("/venue/registration/capacity").catch(() => null),
        fetchCountryStates().catch(() => fallbackCountryStates)
      ]);

      if (countryEntries && countryEntries.length) {
        setCountryStates(countryEntries);
      }

      if (res && res.fields) {
        let activeFields: FormField[] = res.fields.filter((f: FormField) => f.is_active !== false);
        // Ensure paid_status dropdown is present in fields
        if (!activeFields.some((f) => f.id === "paid_status" || f.name === "paid_status")) {
          activeFields.push({
            id: "paid_status",
            name: "paid_status",
            label: "Payment Status",
            type: "select",
            is_required: true,
            options: PAYMENT_STATUS_OPTIONS
          });
        } else {
          // Ensure options are comprehensive
          activeFields = activeFields.map((f) => {
            if (f.id === "paid_status" || f.name === "paid_status") {
              return { ...f, options: PAYMENT_STATUS_OPTIONS };
            }
            return f;
          });
        }
        setFields(activeFields);
        if (res.terms_and_conditions) setTerms(res.terms_and_conditions);
      } else {
        // Fallback standard fields
        setFields([
          { id: "first_name", name: "first_name", label: "First Name", type: "text", is_required: true, placeholder: "First Name" },
          { id: "last_name", name: "last_name", label: "Last Name", type: "text", is_required: true, placeholder: "Last Name" },
          { id: "email", name: "email", label: "Email Address", type: "email", is_required: true, placeholder: "email@example.com" },
          { id: "phone", name: "phone", label: "Phone Number", type: "phone", is_required: false, placeholder: "9876543210" },
          { id: "role", name: "role", label: "Registration Category", type: "select", is_required: true, options: ["Delegate", "Speaker", "VIP", "Exhibitor", "Faculty", "Student", "Organizer"] },
          { id: "company", name: "company", label: "Organization / Company", type: "text", is_required: false, placeholder: "Company / Institution Name" },
          { id: "designation", name: "designation", label: "Designation / Title", type: "text", is_required: false, placeholder: "Job Title / Role" },
          { id: "country", name: "country", label: "Country of Residence", type: "country", is_required: false },
          { id: "state", name: "state", label: "State / Province", type: "state", is_required: false },
          { id: "paid_status", name: "paid_status", label: "Payment Status", type: "select", is_required: true, options: PAYMENT_STATUS_OPTIONS }
        ]);
      }

      if (capRes && capRes.total_event_limit > 0 && capRes.total_registered >= capRes.total_event_limit) {
        const isFull = capRes.total_registered >= capRes.total_event_limit;
        setCapacityInfo({
          total_registered: capRes.total_registered,
          total_event_limit: capRes.total_event_limit,
          is_full: isFull,
        });
        if (isFull) {
          setCapacityError(`Organiser Overall Event Capacity Limit Reached (${capRes.total_event_limit} Delegates). Admin authorization required to proceed.`);
        }
      }
    } catch (err) {
      console.error("Failed to load form config:", err);
    } finally {
      setLoadingConfig(false);
    }
  };

  useEffect(() => {
    fetchFormConfig();
  }, []);

  const handleInputChange = (fieldId: string, val: any) => {
    setFormData((prev) => {
      const next = { ...prev, [fieldId]: val };
      if (fieldId === "country") {
        next.state = "";
        const nextDial = getDialCodeForCountry(val);
        if (nextDial) setDialCode(nextDial);
      }
      return next;
    });
  };

  // Sanitizes custom fields to strictly exclude standard attributes, kit statuses, and internal fields
  const buildSanitizedCustomFields = () => {
    const customFields: Record<string, any> = {};
    Object.entries(formData).forEach(([key, value]) => {
      const lowerKey = key.toLowerCase();
      if (
        !STANDARD_FIELD_KEYS.has(lowerKey) &&
        !lowerKey.startsWith("kit_") &&
        !lowerKey.startsWith("badge_") &&
        !lowerKey.startsWith("checkin_") &&
        value !== undefined &&
        value !== null &&
        value !== ""
      ) {
        customFields[key] = value;
      }
    });
    return customFields;
  };

  const getCombinedPhoneNumber = () => {
    const rawPhone = (formData.phone || "").trim();
    if (!rawPhone) return "";
    return `${dialCode} ${rawPhone}`.trim();
  };

  const handleSubmit = async (e?: React.FormEvent | null) => {
    if (e && e.preventDefault) e.preventDefault();
    const firstName = (formData.first_name || formData.name?.split(" ")[0] || "").trim();
    const lastName = (formData.last_name || formData.name?.split(" ").slice(1).join(" ") || "").trim();

    if (!firstName && !formData.name) {
      toast.error("First Name is required.");
      return;
    }

    if (formData.email && formData.email.trim()) {
      const emailPattern = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
      if (!emailPattern.test(formData.email.trim())) {
        toast.error("Please enter a valid email address (e.g. name@domain.com).");
        return;
      }
    }

    // If event is already at capacity, directly launch Admin Authorization Modal without failing HTTP request
    if (capacityInfo?.is_full) {
      setAuthError(null);
      setShowAuthModal(true);
      return;
    }

    try {
      setSubmitting(true);
      const payload = {
        first_name: firstName,
        last_name: lastName || "Delegate",
        email: (formData.email || "").trim().toLowerCase(),
        phone: getCombinedPhoneNumber(),
        role: formData.role || "Delegate",
        company: (formData.company || "").trim(),
        designation: (formData.designation || "").trim(),
        country: formData.country || "India",
        state: formData.state || "",
        paid_status: formData.paid_status || "Paid",
        custom_fields: buildSanitizedCustomFields(),
        admin_override: false,
      };

      const res: any = await apiClient.post("/venue/registration/participants", payload);
      setSuccessData(res.participant || res);
      toast.success(`Participant registered successfully! Reg ID: ${res.participant?.regno || ""}`);
    } catch (err: any) {
      const errMsg = typeof err === "string" ? err : err?.message || err?.detail || "Failed to register participant.";

      if (errMsg.toLowerCase().includes("capacity limit") || errMsg.toLowerCase().includes("admin authorization")) {
        setCapacityError(errMsg);
        setCapacityInfo((prev) => ({
          total_registered: prev?.total_registered || 400,
          total_event_limit: prev?.total_event_limit || 400,
          is_full: true,
        }));
        setAuthError(null);
        setShowAuthModal(true);
      } else {
        console.error("Registration error:", errMsg);
        toast.error(errMsg);
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleAuthorizeAndRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adminUsername.trim() || !adminPassword.trim()) {
      setAuthError("Both Admin Username and Admin Password are required.");
      return;
    }

    const firstName = (formData.first_name || formData.name?.split(" ")[0] || "").trim();
    const lastName = (formData.last_name || formData.name?.split(" ").slice(1).join(" ") || "").trim();

    try {
      setAuthorizing(true);
      setAuthError(null);
      const payload = {
        first_name: firstName,
        last_name: lastName || "Delegate",
        email: (formData.email || "").trim().toLowerCase(),
        phone: getCombinedPhoneNumber(),
        role: formData.role || "Delegate",
        company: (formData.company || "").trim(),
        designation: (formData.designation || "").trim(),
        country: formData.country || "India",
        state: formData.state || "",
        paid_status: formData.paid_status || "Paid",
        custom_fields: buildSanitizedCustomFields(),
        admin_override: true,
        allow_override: true,
        admin_username: adminUsername.trim(),
        admin_password: adminPassword.trim(),
      };

      const res: any = await apiClient.post("/venue/registration/participants", payload);
      setShowAuthModal(false);
      setAdminPassword("");
      setCapacityError(null);
      setSuccessData(res.participant || res);
      toast.success(`Participant registered with Admin Capacity Override! Reg ID: ${res.participant?.regno || ""}`);
    } catch (err: any) {
      const errMsg = typeof err === "string" ? err : err?.message || err?.detail || "Admin authorization failed.";
      setAuthError(errMsg);
      toast.error(errMsg);
    } finally {
      setAuthorizing(false);
    }
  };

  const handlePrintBadgeNow = async () => {
    if (!successData) return;
    try {
      toast.info(`Compiling badge PDF for ${successData.name}...`);
      const templatesRes: any = await apiClient.get("/venue/registration/templates");
      const templates = Array.isArray(templatesRes) ? templatesRes : [];
      const badgeTemplates = templates.filter((t: any) => t.template_type !== "certificate");

      const activeTemplate =
        badgeTemplates.length > 0
          ? badgeTemplates[0].template_data || badgeTemplates[0].templateData || badgeTemplates[0]
          : {
              width_mm: 76,
              height_mm: 100,
              pages: [
                {
                  backgroundColor: "#FFFFFF",
                  fields: [
                    { type: "text", placeholder: "{{name}}", x_mm: 5, y_mm: 20, w_mm: 66, h_mm: 12, fontSize: 16, bold: true, color: "#1E293B", align: "center" },
                    { type: "text", placeholder: "{{role}}", x_mm: 5, y_mm: 35, w_mm: 66, h_mm: 8, fontSize: 12, bold: true, color: "#2563EB", align: "center" },
                    { type: "text", placeholder: "{{company}}", x_mm: 5, y_mm: 45, w_mm: 66, h_mm: 8, fontSize: 10, color: "#64748B", align: "center" },
                    { type: "qr", qrValue: "{{regno}}", x_mm: 23, y_mm: 58, w_mm: 30, h_mm: 30 },
                  ],
                },
              ],
            };

      const pdf = await compileTemplateToPdf([successData], activeTemplate, { name: "EventX OS" });
      const blobUrl = URL.createObjectURL(pdf.output("blob"));
      window.open(blobUrl, "_blank");
      toast.success("Badge PDF generated! Spool opened in new tab.");
    } catch (e: any) {
      console.error(e);
      toast.error("Failed to generate badge PDF.");
    }
  };

  // Helper to render dynamic form field input based on field type
  const renderFieldInput = (field: FormField) => {
    const val = formData[field.id] !== undefined ? formData[field.id] : "";

    // 1. Phone number with country dial code
    if (field.type === "phone" || field.id === "phone") {
      return (
        <div className="flex gap-2">
          <select
            value={dialCode}
            onChange={(e) => setDialCode(e.target.value)}
            className="w-32 h-11 px-2.5 rounded-xl border border-[var(--border)] bg-[var(--surf)] text-xs font-bold text-[var(--text)] focus:ring-1 focus:ring-[var(--pri)]"
          >
            {countryDialCodes.map((c) => (
              <option key={`${c.code}-${c.dial_code}`} value={c.dial_code}>
                {c.flag || "🌐"} {c.dial_code} ({c.code})
              </option>
            ))}
          </select>
          <Input
            type="tel"
            value={val}
            onChange={(e) => {
              const clean = e.target.value.replace(/[^0-9\s\-]/g, "").slice(0, 15);
              handleInputChange(field.id, clean);
            }}
            placeholder={field.placeholder || "Enter phone number"}
            required={field.is_required}
            className="flex-1 h-11 bg-[var(--surf)] border-[var(--border)] text-sm font-semibold text-[var(--text)] focus:ring-1 focus:ring-[var(--pri)] font-mono"
          />
        </div>
      );
    }

    // 2. Country dropdown
    if (field.type === "country" || field.id === "country") {
      return (
        <select
          value={val || "India"}
          onChange={(e) => handleInputChange(field.id, e.target.value)}
          className="w-full h-11 px-3 rounded-xl border border-[var(--border)] bg-[var(--surf)] text-sm font-semibold text-[var(--text)] focus:ring-1 focus:ring-[var(--pri)]"
        >
          {countryStates.map((entry) => (
            <option key={entry.country} value={entry.country}>
              {entry.country}
            </option>
          ))}
        </select>
      );
    }

    // 3. State / Province cascading dropdown
    if (field.type === "state" || field.id === "state") {
      return (
        <select
          value={val}
          onChange={(e) => handleInputChange(field.id, e.target.value)}
          className="w-full h-11 px-3 rounded-xl border border-[var(--border)] bg-[var(--surf)] text-sm font-semibold text-[var(--text)] focus:ring-1 focus:ring-[var(--pri)]"
        >
          <option value="">{availableStates.length ? "Select State / Province" : "No predefined states (Optional)"}</option>
          {availableStates.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      );
    }

    // 4. Payment Status dropdown
    if (field.id === "paid_status" || field.name === "paid_status") {
      return (
        <select
          value={val || "Paid"}
          onChange={(e) => handleInputChange(field.id, e.target.value)}
          className="w-full h-11 px-3 rounded-xl border border-[var(--border)] bg-[var(--surf)] text-sm font-semibold text-[var(--text)] focus:ring-1 focus:ring-[var(--pri)]"
        >
          {PAYMENT_STATUS_OPTIONS.map((opt) => (
            <option key={opt} value={opt}>
              {opt}
            </option>
          ))}
        </select>
      );
    }

    // 5. Date selector
    if (field.type === "date") {
      return (
        <Input
          type="date"
          value={val}
          onChange={(e) => handleInputChange(field.id, e.target.value)}
          required={field.is_required}
          className="h-11 bg-[var(--surf)] border-[var(--border)] text-sm font-semibold text-[var(--text)] focus:ring-1 focus:ring-[var(--pri)]"
        />
      );
    }

    // 6. Select dropdown
    if (field.type === "select" || (field.options && field.options.length > 0)) {
      return (
        <select
          value={val || (field.options && field.options[0]) || ""}
          onChange={(e) => handleInputChange(field.id, e.target.value)}
          className="w-full h-11 px-3 rounded-xl border border-[var(--border)] bg-[var(--surf)] text-sm font-semibold text-[var(--text)] focus:ring-1 focus:ring-[var(--pri)]"
        >
          {(field.options || []).map((opt) => (
            <option key={opt} value={opt}>
              {opt}
            </option>
          ))}
        </select>
      );
    }

    // 7. Textarea
    if (field.type === "textarea") {
      return (
        <textarea
          value={val}
          onChange={(e) => handleInputChange(field.id, e.target.value)}
          placeholder={field.placeholder || `Enter ${field.label.toLowerCase()}`}
          required={field.is_required}
          rows={3}
          className="w-full p-3 rounded-xl border border-[var(--border)] bg-[var(--surf)] text-sm font-semibold text-[var(--text)] focus:ring-1 focus:ring-[var(--pri)] resize-none"
        />
      );
    }

    // 8. Standard inputs (text, email, number)
    return (
      <Input
        type={field.type === "email" ? "email" : field.type === "number" ? "number" : "text"}
        value={val}
        onChange={(e) => handleInputChange(field.id, e.target.value)}
        placeholder={field.placeholder || `Enter ${field.label.toLowerCase()}`}
        required={field.is_required}
        className="h-11 bg-[var(--surf)] border-[var(--border)] text-sm font-semibold text-[var(--text)] focus:ring-1 focus:ring-[var(--pri)]"
      />
    );
  };

  return (
    <div className="w-full space-y-6">
      {/* Top Header */}
      <div className="flex items-center justify-between bg-[var(--card)] p-5 rounded-2xl border border-[var(--border)] shadow-sm">
        <div className="flex items-center gap-3">
          <Link href="/registry">
            <Button variant="ghost" size="sm" className="h-9 w-9 p-0 text-[var(--muted)]">
              <ArrowLeft className="w-5 h-5" />
            </Button>
          </Link>
          <div>
            <h2 className="text-xl font-black text-[var(--text)] tracking-tight">On-Site Registration Desk</h2>
            <p className="text-xs text-[var(--muted)]">Form dynamically inherited from saved event registration template</p>
          </div>
        </div>

        <Button variant="outline" onClick={fetchFormConfig} disabled={loadingConfig} className="h-9 text-xs font-bold">
          <RefreshCw className={`w-3.5 h-3.5 mr-1 ${loadingConfig ? "animate-spin" : ""}`} /> Reload Form Template
        </Button>
      </div>

      {successData ? (
        <div className="bg-[var(--card)] rounded-2xl border border-[var(--border)] shadow-lg p-8 text-center space-y-6">
          <div className="w-16 h-16 bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 rounded-full flex items-center justify-center mx-auto">
            <CheckCircle2 className="w-8 h-8" />
          </div>
          <div>
            <h3 className="text-2xl font-black text-[var(--text)]">Registration Successful!</h3>
            <p className="text-[var(--muted)] text-sm mt-1">
              Participant <strong className="text-[var(--text)]">{successData.name}</strong> has been registered.
            </p>
            <p className="text-sm font-mono text-[var(--acc)] font-black mt-2">
              Registration ID: {successData.regno}
            </p>
          </div>

          <div className="flex items-center justify-center gap-4 pt-4">
            <Button
              onClick={handlePrintBadgeNow}
              className="bg-[var(--pri)] text-[var(--primary-contrast)] font-bold gap-2 h-11 px-6 shadow-md"
            >
              <Printer className="w-4 h-4" /> Print Badge PDF Now
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                setSuccessData(null);
                setFormData({
                  role: "Delegate",
                  country: "India",
                  state: "",
                  phone: "",
                  paid_status: "Paid"
                });
              }}
              className="h-11 px-6 font-bold"
            >
              Register Another Delegate
            </Button>
          </div>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="bg-[var(--card)] p-8 rounded-2xl border border-[var(--border)] shadow-sm space-y-8">
          {loadingConfig ? (
            <div className="py-20 text-center text-[var(--muted)]">
              <RefreshCw className="w-8 h-8 animate-spin mx-auto text-[var(--pri)] mb-3" />
              <p className="text-sm font-bold">Loading inherited registration form template...</p>
            </div>
          ) : (
            <>
              {/* Delegate Personal & Registration Information Section */}
              <div className="space-y-4">
                <div className="border-b border-[var(--border)] pb-2 flex items-center gap-2">
                  <User className="w-4 h-4 text-[var(--pri)]" />
                  <h3 className="text-xs font-black uppercase tracking-wider text-[var(--text)]">Delegate Information</h3>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  {fields.map((field) => (
                    <div key={field.id} className="space-y-1.5">
                      <label className="block text-xs font-black uppercase tracking-wider text-[var(--muted)]">
                        {field.label} {field.is_required && <span className="text-red-500">*</span>}
                      </label>
                      {renderFieldInput(field)}
                    </div>
                  ))}
                </div>
              </div>

              {/* Capacity Error Warning Banner */}
              {capacityError && (
                <div className="p-4 bg-amber-500/10 border border-amber-500/30 rounded-xl text-xs text-amber-700 dark:text-amber-300 space-y-3 animate-in fade-in slide-in-from-top-2">
                  <div className="font-bold flex items-center gap-2 text-sm">
                    <ShieldAlert className="w-5 h-5 text-amber-500 shrink-0" />
                    <span>{capacityError}</span>
                  </div>
                  <p className="text-xs opacity-90">
                    The Organiser overall event registration limit has been reached. Admin credentials are required to authorize a capacity override for this registration.
                  </p>
                  <div className="pt-1">
                    <Button
                      type="button"
                      onClick={() => {
                        setAuthError(null);
                        setShowAuthModal(true);
                      }}
                      className="bg-amber-600 hover:bg-amber-700 text-white font-bold h-9 px-4 text-xs shadow gap-2"
                    >
                      <Lock className="w-3.5 h-3.5" />
                      Authorize Admin Capacity Override
                    </Button>
                  </div>
                </div>
              )}

              {/* Terms Banner */}
              {terms && (
                <div className="p-4 bg-[var(--raised)] border border-[var(--border)] rounded-xl text-xs text-[var(--muted)] flex items-start gap-3">
                  <FileText className="w-5 h-5 text-[var(--acc)] shrink-0 mt-0.5" />
                  <div>
                    <strong className="text-[var(--text)] block mb-0.5">Attendee Declaration & Terms:</strong>
                    {terms}
                  </div>
                </div>
              )}

              {/* Submit Buttons */}
              <div className="flex justify-end gap-3 pt-4 border-t border-[var(--border)]">
                <Button
                  type="submit"
                  disabled={submitting}
                  className="bg-[var(--pri)] hover:bg-[var(--pri)]/80 text-[var(--primary-contrast)] font-extrabold h-12 px-8 text-sm shadow-lg flex items-center gap-2"
                >
                  <UserPlus className="w-4 h-4" />
                  {submitting
                    ? "Processing Registration..."
                    : capacityInfo?.is_full
                    ? "Authorize & Register (Capacity Reached)"
                    : "Complete Registration & Print Badge"}
                </Button>
              </div>
            </>
          )}
        </form>
      )}

      {/* Admin Capacity Override Modal */}
      {showAuthModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-150">
          <div className="bg-[var(--card)] border border-[var(--border)] rounded-2xl p-6 max-w-md w-full shadow-2xl space-y-5 animate-in zoom-in-95 duration-200 relative">
            <button
              onClick={() => {
                setShowAuthModal(false);
                setAuthError(null);
              }}
              className="absolute top-4 right-4 text-[var(--muted)] hover:text-[var(--text)] p-1 rounded-lg transition-colors"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-3 border-b border-[var(--border)] pb-4">
              <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-500 shrink-0">
                <ShieldAlert className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-black text-[var(--text)]">Admin Capacity Override</h3>
                <p className="text-xs text-[var(--muted)]">Event limit reached. Enter Admin credentials to authorize.</p>
              </div>
            </div>

            <form onSubmit={handleAuthorizeAndRegister} className="space-y-4">
              <div className="space-y-1.5">
                <label className="block text-xs font-black uppercase tracking-wider text-[var(--muted)]">
                  Admin Username or Email <span className="text-red-500">*</span>
                </label>
                <Input
                  type="text"
                  value={adminUsername}
                  onChange={(e) => setAdminUsername(e.target.value)}
                  placeholder="Enter Admin username / email"
                  required
                  autoFocus
                  className="h-10 bg-[var(--surf)] border-[var(--border)] text-sm font-semibold text-[var(--text)]"
                />
              </div>

              <div className="space-y-1.5">
                <label className="block text-xs font-black uppercase tracking-wider text-[var(--muted)]">
                  Admin Password <span className="text-red-500">*</span>
                </label>
                <Input
                  type="password"
                  value={adminPassword}
                  onChange={(e) => setAdminPassword(e.target.value)}
                  placeholder="Enter Admin password"
                  required
                  className="h-10 bg-[var(--surf)] border-[var(--border)] text-sm font-semibold text-[var(--text)]"
                />
              </div>

              {authError && (
                <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-xs text-red-600 dark:text-red-400 font-semibold flex items-center gap-2">
                  <ShieldAlert className="w-4 h-4 shrink-0 text-red-500" />
                  <span>{authError}</span>
                </div>
              )}

              <div className="flex justify-end gap-3 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setShowAuthModal(false);
                    setAuthError(null);
                  }}
                  className="h-10 px-4 font-bold text-xs"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={authorizing}
                  className="bg-amber-600 hover:bg-amber-700 text-white font-bold h-10 px-5 text-xs shadow gap-2"
                >
                  <Lock className="w-3.5 h-3.5" />
                  {authorizing ? "Verifying..." : "Authorize & Register Now"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
