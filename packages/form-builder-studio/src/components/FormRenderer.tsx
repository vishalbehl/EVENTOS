import React, { useState, useMemo, useEffect } from "react";
import {
  CheckCircle2,
  Calendar,
  Clock,
  Globe,
  UploadCloud,
  Star,
  FileCheck,
  HelpCircle,
  AlertCircle,
  ArrowRight,
  ArrowLeft,
  ShieldCheck,
  Sparkles,
  CreditCard,
  Check,
  FileText,
  Lock,
  X,
  Trash2,
  Paperclip,
  Image as ImageIcon,
} from "lucide-react";
import { FormField, FormSettings, FormStep } from "../types";
import {
  CountryStateEntry,
  COUNTRY_DIAL_CODES,
  fetchCountryStates,
  fallbackCountryStates,
  getAllowedCountries,
  getStatesForCountry,
  getDialCodeForCountry,
  MASTER_ROLE_CATEGORIES,
} from "../constants/country-data";

interface FormRendererProps {
  fields: FormField[];
  settings?: FormSettings;
  previewMode?: boolean;
  onSubmit?: (data: Record<string, any>) => void;
  className?: string;
}

export function FormRenderer({
  fields,
  settings = {},
  previewMode = false,
  onSubmit,
  className = "",
}: FormRendererProps) {
  const [formData, setFormData] = useState<Record<string, any>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitted, setSubmitted] = useState(false);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [countryStates, setCountryStates] = useState<CountryStateEntry[]>(fallbackCountryStates);

  useEffect(() => {
    fetchCountryStates().then((entries) => {
      if (entries && entries.length > 0) {
        setCountryStates(entries);
      }
    });
  }, []);

  const isPhoneField = (f: FormField) =>
    f.type === "phone" ||
    f.id.toLowerCase().includes("phone") ||
    f.id.toLowerCase().includes("mobile") ||
    f.id.toLowerCase().includes("tel");

  const isRoleField = (f: FormField) =>
    f.type === "role" ||
    f.id.toLowerCase() === "role" ||
    f.id.toLowerCase() === "category";

  // Active fields
  const activeFields = useMemo(() => {
    return [...fields]
      .filter((f) => f.is_active)
      .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
  }, [fields]);

  // Compute multi-step sequence
  const configuredSteps: FormStep[] = useMemo(() => {
    if (settings.steps && settings.steps.length > 0) {
      return settings.steps;
    }
    return [{ id: "step_1", title: "Registration Details" }];
  }, [settings.steps]);

  // Total flow steps: Custom Form Steps + [Optional Review & Terms] + [Optional Payment]
  const allFlowSteps = useMemo(() => {
    const list: Array<{ type: "form_step" | "review_terms" | "payment"; id: string; title: string; stepIndex?: number }> = [];

    // Add configured form steps
    configuredSteps.forEach((st, idx) => {
      list.push({
        type: "form_step",
        id: st.id,
        title: st.title || `Step ${idx + 1}`,
        stepIndex: idx,
      });
    });

    // Add Review & Terms step if enabled (default true)
    if (settings.enable_preview !== false || settings.enable_terms !== false) {
      list.push({
        type: "review_terms",
        id: "step_review_terms",
        title: "Review & Terms",
      });
    }

    // Add Payment step if enabled
    if (settings.enable_payment) {
      list.push({
        type: "payment",
        id: "step_payment",
        title: "Payment Checkout",
      });
    }

    return list;
  }, [configuredSteps, settings.enable_preview, settings.enable_terms, settings.enable_payment]);

  const [currentStepIdx, setCurrentStepIdx] = useState(0);
  const activeFlowStep = allFlowSteps[currentStepIdx] || allFlowSteps[0];

  // Fields belonging to current form step
  const currentStepFields = useMemo(() => {
    if (activeFlowStep.type !== "form_step") return [];
    const stepNum = activeFlowStep.stepIndex ?? 0;
    return activeFields.filter((f) => (f.step_index ?? 0) === stepNum);
  }, [activeFields, activeFlowStep]);

  const handleValueChange = (fieldId: string, value: any) => {
    setFormData((prev) => ({ ...prev, [fieldId]: value }));
    if (errors[fieldId]) {
      setErrors((prev) => {
        const next = { ...prev };
        delete next[fieldId];
        return next;
      });
    }
  };

  const handleCheckboxToggle = (fieldId: string, optionValue: string) => {
    const currentList: string[] = Array.isArray(formData[fieldId]) ? formData[fieldId] : [];
    const nextList = currentList.includes(optionValue)
      ? currentList.filter((item) => item !== optionValue)
      : [...currentList, optionValue];
    handleValueChange(fieldId, nextList);
  };

  const validateCurrentStep = () => {
    const newErrors: Record<string, string> = {};

    if (activeFlowStep.type === "form_step") {
      currentStepFields.forEach((field) => {
        const val = formData[field.id];
        const isBlank =
          val === undefined ||
          val === null ||
          val === "" ||
          (typeof val === "string" && val.trim() === "") ||
          (Array.isArray(val) && val.length === 0);

        // 1. Required field checks
        if (field.is_required) {
          if (field.type === "country") {
            const countryVal = formData[`${field.id}_country`] || formData.country || "India";
            const stateVal = formData[`${field.id}_state`] || formData.state || formData.country_state;
            const availableStates = getStatesForCountry(countryStates, String(countryVal));
            if (!countryVal || String(countryVal).trim() === "") {
              newErrors[field.id] = "Country is required";
            } else if (availableStates.length > 0 && (!stateVal || String(stateVal).trim() === "")) {
              newErrors[field.id] = "State / Province is required";
            }
          } else if (isPhoneField(field)) {
            const digits = String(val || "").replace(/\D/g, "");
            if (digits.length === 0) {
              newErrors[field.id] = `${field.label || "Phone number"} is required`;
            }
          } else if (isRoleField(field)) {
            if (isBlank) {
              newErrors[field.id] = "Please select a role / pass category";
            }
          } else if (isBlank) {
            newErrors[field.id] = `${field.label || "This field"} is required`;
          }
        }

        // 2. Email format validation
        if ((field.type === "email" || field.id.toLowerCase().includes("email")) && !isBlank) {
          const emailStr = String(val).trim();
          if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailStr)) {
            newErrors[field.id] = "Please enter a valid email address (e.g. name@domain.com)";
          }
        }

        // 3. Telephone number validation (digits only, valid E.164 length 7 to 15)
        if (isPhoneField(field) && !isBlank) {
          const digitsOnly = String(val).replace(/\D/g, "");
          if (digitsOnly.length < 7 || digitsOnly.length > 15) {
            newErrors[field.id] = "Please enter a valid telephone number (7-15 digits)";
          }
        }

        // 4. Number validation
        if (field.type === "number" && !isBlank) {
          if (isNaN(Number(val))) {
            newErrors[field.id] = "Please enter a valid number";
          }
        }

        // 5. URL validation
        if ((field.id.toLowerCase().includes("website") || field.id.toLowerCase().includes("url") || field.id.toLowerCase().includes("linkedin")) && !isBlank) {
          const urlStr = String(val).trim();
          if (!/^https?:\/\/.+/i.test(urlStr)) {
            newErrors[field.id] = "Please enter a valid web link (must start with http:// or https://)";
          }
        }

        // 6. Non-required Country State validation (if country is picked, state must be picked if available)
        if (field.type === "country" && !field.is_required) {
          const countryVal = formData[`${field.id}_country`] || formData.country;
          const stateVal = formData[`${field.id}_state`] || formData.state || formData.country_state;
          if (countryVal) {
            const availableStates = getStatesForCountry(countryStates, String(countryVal));
            if (availableStates.length > 0 && (!stateVal || String(stateVal).trim() === "")) {
              newErrors[field.id] = "Please select a State / Province for the selected country";
            }
          }
        }
      });
    } else if (activeFlowStep.type === "review_terms") {
      if (settings.enable_terms !== false && !termsAccepted) {
        newErrors["terms"] = "You must agree to the Terms & Conditions to proceed";
      }
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return false;
    }
    return true;
  };


  const handleNextStep = () => {
    if (!validateCurrentStep()) return;
    if (currentStepIdx < allFlowSteps.length - 1) {
      setCurrentStepIdx((prev) => prev + 1);
    } else {
      handleFinalSubmit();
    }
  };

  const handlePrevStep = () => {
    if (currentStepIdx > 0) {
      setCurrentStepIdx((prev) => prev - 1);
    }
  };

  const handleFinalSubmit = () => {
    if (onSubmit) {
      onSubmit(formData);
    }
    setSubmitted(true);
  };

  if (submitted) {
    return (
      <div className="p-8 text-center bg-[var(--bg-surface-2,#18181b)] border border-[var(--border-subtle,#27272a)] rounded-2xl max-w-lg mx-auto my-8 shadow-xl">
        <div className="size-16 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 mx-auto flex items-center justify-center mb-4">
          <CheckCircle2 className="size-8" />
        </div>
        <h3 className="text-xl font-bold text-[var(--text-primary,#ffffff)] mb-2">
          {settings.success_title || "Thank You!"}
        </h3>
        <p className="text-sm text-[var(--text-secondary,#a1a1aa)] mb-6">
          {settings.success_message || "Your submission has been recorded successfully."}
        </p>
        {previewMode && (
          <button
            type="button"
            onClick={() => {
              setSubmitted(false);
              setFormData({});
              setCurrentStepIdx(0);
              setTermsAccepted(false);
            }}
            className="px-4 py-2 text-xs font-semibold rounded-lg bg-[var(--pri,#f4f4f5)] text-[var(--primary-contrast,#09090b)] hover:opacity-90 transition cursor-pointer"
          >
            Reset Form Preview
          </button>
        )}
      </div>
    );
  }

  return (
    <div className={`space-y-6 ${className}`}>
      {previewMode && (
        <div className="p-3 bg-[var(--pri,#4f46e5)]/10 border border-[var(--pri,#4f46e5)]/30 rounded-xl flex items-center gap-2 text-xs text-[var(--pri,#4f46e5)]">
          <Sparkles className="size-4 shrink-0" />
          <span>Interactive Preview Mode — test real validation and multi-step progression.</span>
        </div>
      )}

      {/* ── Multi-Step Stepper Progress Bar ───────────────────── */}
      {allFlowSteps.length > 1 && (
        <div className="p-4 rounded-2xl bg-[var(--bg-surface-2,#18181b)] border border-[var(--border-subtle,#27272a)]">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold text-[var(--text-primary,#ffffff)]">
              Step {currentStepIdx + 1} of {allFlowSteps.length}: {activeFlowStep.title}
            </span>
            <span className="text-[11px] font-mono text-[var(--text-tertiary,#71717a)]">
              {Math.round(((currentStepIdx + 1) / allFlowSteps.length) * 100)}% Complete
            </span>
          </div>

          <div className="flex items-center gap-1.5">
            {allFlowSteps.map((st, sIdx) => {
              const isDone = sIdx < currentStepIdx;
              const isCurrent = sIdx === currentStepIdx;
              return (
                <div key={st.id || sIdx} className="flex-1">
                  <div
                    className={`h-1.5 rounded-full transition-all duration-300 ${
                      isDone
                        ? "bg-emerald-500"
                        : isCurrent
                        ? "bg-[var(--pri,#4f46e5)]"
                        : "bg-[var(--bg-surface-3,#27272a)]"
                    }`}
                  />
                  <p className={`text-[10px] mt-1.5 truncate hidden sm:block ${
                    isCurrent ? "font-bold text-[var(--text-primary,#ffffff)]" : "text-[var(--text-tertiary,#71717a)]"
                  }`}>
                    {st.title}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Step Content ──────────────────────────────────────── */}
      {activeFlowStep.type === "form_step" && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
            {currentStepFields.map((field) => {
              const colSpan =
                field.grid_width === "third"
                  ? "md:col-span-4"
                  : field.grid_width === "half"
                  ? "md:col-span-6"
                  : "md:col-span-12";

              const fieldError = errors[field.id];

              if (field.type === "divider") {
                return (
                  <div key={field.id} className="md:col-span-12 my-2">
                    <hr className="border-t border-[var(--border-subtle,#27272a)]" />
                  </div>
                );
              }

              if (field.type === "section_header") {
                return (
                  <div key={field.id} className="md:col-span-12 pt-3 pb-1 border-b border-[var(--border-subtle,#27272a)]">
                    <h4 className="text-base font-bold text-[var(--text-primary,#ffffff)]">{field.label}</h4>
                    {field.help_text && (
                      <p className="text-xs text-[var(--text-tertiary,#71717a)] mt-0.5">{field.help_text}</p>
                    )}
                  </div>
                );
              }

              if (field.type === "rich_text") {
                return (
                  <div key={field.id} className="md:col-span-12 p-4 rounded-xl bg-[var(--bg-surface-2,#18181b)] border border-[var(--border-subtle,#27272a)]">
                    <p className="text-xs text-[var(--text-secondary,#a1a1aa)] leading-relaxed">{field.help_text || field.label}</p>
                  </div>
                );
              }

              return (
                <div key={field.id} className={`${colSpan} space-y-1.5`}>
                  <label className="block text-xs font-semibold text-[var(--text-primary,#ffffff)]">
                    {field.label}
                    {field.is_required && <span className="text-rose-400 font-bold ml-1">*</span>}
                  </label>

                  {/* Telephone with International Country Dial Code Selector */}
                  {isPhoneField(field) && field.type !== "country" && (
                    <div className="flex gap-2">
                      <select
                        value={
                          formData[`${field.id}_dial_code`] ||
                          getDialCodeForCountry(formData[`${field.id}_country`] || formData.country || "India")
                        }
                        onChange={(e) => handleValueChange(`${field.id}_dial_code`, e.target.value)}
                        className="h-10 px-2.5 text-xs font-mono font-semibold rounded-xl bg-[var(--bg-surface-2,#18181b)] border border-[var(--border-default,#3f3f46)] text-[var(--text-primary,#ffffff)] focus:border-[var(--pri,#4f46e5)] focus:outline-none cursor-pointer shrink-0 max-w-[140px] truncate"
                      >
                        {COUNTRY_DIAL_CODES.map((c) => (
                          <option key={`${c.code}-${c.dial_code}`} value={c.dial_code} className="bg-zinc-900 text-white">
                            {c.flag} {c.dial_code} ({c.name})
                          </option>
                        ))}
                      </select>
                      <input
                        type="tel"
                        inputMode="numeric"
                        pattern="[0-9]*"
                        maxLength={15}
                        placeholder={field.placeholder || "Enter phone number…"}
                        value={formData[field.id] || ""}
                        onChange={(e) => {
                          const digitsOnly = e.target.value.replace(/\D/g, "");
                          handleValueChange(field.id, digitsOnly);
                        }}
                        className={`flex-1 h-10 px-3 text-xs rounded-xl bg-[var(--bg-surface-2,#18181b)] border text-[var(--text-primary,#ffffff)] focus:outline-none transition ${
                          fieldError
                            ? "border-rose-500 ring-2 ring-rose-500/20"
                            : "border-[var(--border-default,#3f3f46)] focus:border-[var(--pri,#4f46e5)]"
                        }`}
                      />
                    </div>
                  )}

                  {/* Standard Text / Email / Number (Non-phone) */}
                  {["text", "email", "number"].includes(field.type) && !isPhoneField(field) && !isRoleField(field) && (
                    <input
                      type={field.type === "number" ? "number" : field.type === "email" ? "email" : "text"}
                      placeholder={field.placeholder || "Your answer…"}
                      value={formData[field.id] || ""}
                      onChange={(e) => handleValueChange(field.id, e.target.value)}
                      className={`w-full h-10 px-3 text-xs rounded-xl bg-[var(--bg-surface-2,#18181b)] border text-[var(--text-primary,#ffffff)] focus:outline-none transition ${
                        fieldError
                          ? "border-rose-500 ring-2 ring-rose-500/20"
                          : "border-[var(--border-default,#3f3f46)] focus:border-[var(--pri,#4f46e5)]"
                      }`}
                    />
                  )}

                  {/* Textarea */}
                  {field.type === "textarea" && (
                    <textarea
                      rows={3}
                      placeholder={field.placeholder || "Your answer…"}
                      value={formData[field.id] || ""}
                      onChange={(e) => handleValueChange(field.id, e.target.value)}
                      className={`w-full p-3 text-xs rounded-xl bg-[var(--bg-surface-2,#18181b)] border text-[var(--text-primary,#ffffff)] focus:outline-none transition resize-none ${
                        fieldError
                          ? "border-rose-500 ring-2 ring-rose-500/20"
                          : "border-[var(--border-default,#3f3f46)] focus:border-[var(--pri,#4f46e5)]"
                      }`}
                    />
                  )}

                  {/* Role / Pass Category Selector with Categorized Groups */}
                  {isRoleField(field) && (
                    <select
                      value={formData[field.id] || ""}
                      onChange={(e) => handleValueChange(field.id, e.target.value)}
                      className={`w-full h-10 px-3 text-xs rounded-xl bg-[var(--bg-surface-2,#18181b)] border text-[var(--text-primary,#ffffff)] focus:outline-none transition cursor-pointer ${
                        fieldError
                          ? "border-rose-500 ring-2 ring-rose-500/20"
                          : "border-[var(--border-default,#3f3f46)] focus:border-[var(--pri,#4f46e5)]"
                      }`}
                    >
                      <option value="" className="bg-zinc-900 text-zinc-400">
                        {field.placeholder || "Select participant role / pass category…"}
                      </option>
                      {Array.isArray(field.options) && field.options.length > 0 ? (
                        field.options.map((opt, oIdx) => {
                          const label = typeof opt === "string" ? opt : opt.label;
                          const val = typeof opt === "string" ? opt : opt.value;
                          return (
                            <option key={oIdx} value={val} className="bg-zinc-900 text-white">
                              {label}
                            </option>
                          );
                        })
                      ) : (
                        Object.entries(MASTER_ROLE_CATEGORIES).map(([catName, rolesList]) => (
                          <optgroup key={catName} label={`── ${catName} ──`} className="bg-zinc-900 text-indigo-400 font-bold">
                            {rolesList.map((r) => (
                              <option key={r} value={r} className="bg-zinc-900 text-zinc-100 font-normal">
                                {r}
                              </option>
                            ))}
                          </optgroup>
                        ))
                      )}
                    </select>
                  )}

                  {/* Standard Select / Title (Non-role) */}
                  {["select", "title"].includes(field.type) && !isRoleField(field) && (
                    <select
                      value={formData[field.id] || ""}
                      onChange={(e) => handleValueChange(field.id, e.target.value)}
                      className={`w-full h-10 px-3 text-xs rounded-xl bg-[var(--bg-surface-2,#18181b)] border text-[var(--text-primary,#ffffff)] focus:outline-none transition ${
                        fieldError
                          ? "border-rose-500 ring-2 ring-rose-500/20"
                          : "border-[var(--border-default,#3f3f46)] focus:border-[var(--pri,#4f46e5)]"
                      }`}
                    >
                      <option value="" className="bg-zinc-900 text-zinc-400">
                        {field.placeholder || "Select an option…"}
                      </option>
                      {((field.options as (string | { label: string; value: string })[]) || []).map((opt, oIdx) => {
                        const label = typeof opt === "string" ? opt : opt.label;
                        const val = typeof opt === "string" ? opt : opt.value;
                        return (
                          <option key={oIdx} value={val} className="bg-zinc-900 text-white">
                            {label}
                          </option>
                        );
                      })}
                    </select>
                  )}

                  {/* Radio Buttons */}
                  {field.type === "radio" && (
                    <div className="space-y-2 pt-1">
                      {((field.options as (string | { label: string; value: string })[]) || []).map((opt, oIdx) => {
                        const label = typeof opt === "string" ? opt : opt.label;
                        const val = typeof opt === "string" ? opt : opt.value;
                        const isChecked = formData[field.id] === val;
                        return (
                          <label key={oIdx} className="flex items-center gap-2.5 cursor-pointer text-xs">
                            <input
                              type="radio"
                              name={field.id}
                              value={val}
                              checked={isChecked}
                              onChange={() => handleValueChange(field.id, val)}
                              className="accent-[var(--pri,#4f46e5)] size-4"
                            />
                            <span className="text-[var(--text-secondary,#a1a1aa)]">{label}</span>
                          </label>
                        );
                      })}
                    </div>
                  )}

                  {/* Checkbox / Multiselect */}
                  {["checkbox", "multiselect"].includes(field.type) && (
                    <div className="space-y-2 pt-1">
                      {((field.options as (string | { label: string; value: string })[]) || []).map((opt, oIdx) => {
                        const label = typeof opt === "string" ? opt : opt.label;
                        const val = typeof opt === "string" ? opt : opt.value;
                        const currentList: string[] = Array.isArray(formData[field.id]) ? formData[field.id] : [];
                        const isChecked = currentList.includes(val);
                        return (
                          <label key={oIdx} className="flex items-center gap-2.5 cursor-pointer text-xs">
                            <input
                              type="checkbox"
                              value={val}
                              checked={isChecked}
                              onChange={() => handleCheckboxToggle(field.id, val)}
                              className="accent-[var(--pri,#4f46e5)] size-4 rounded"
                            />
                            <span className="text-[var(--text-secondary,#a1a1aa)]">{label}</span>
                          </label>
                        );
                      })}
                    </div>
                  )}

                  {/* Date & Time */}
                  {field.type === "date" && (
                    <input
                      type="date"
                      value={formData[field.id] || ""}
                      onChange={(e) => handleValueChange(field.id, e.target.value)}
                      className={`w-full h-10 px-3 text-xs rounded-xl bg-[var(--bg-surface-2,#18181b)] border text-[var(--text-primary,#ffffff)] focus:outline-none transition ${
                        fieldError
                          ? "border-rose-500 ring-2 ring-rose-500/20"
                          : "border-[var(--border-default,#3f3f46)] focus:border-[var(--pri,#4f46e5)]"
                      }`}
                    />
                  )}
                  {field.type === "time" && (
                    <input
                      type="time"
                      value={formData[field.id] || ""}
                      onChange={(e) => handleValueChange(field.id, e.target.value)}
                      className={`w-full h-10 px-3 text-xs rounded-xl bg-[var(--bg-surface-2,#18181b)] border text-[var(--text-primary,#ffffff)] focus:outline-none transition ${
                        fieldError
                          ? "border-rose-500 ring-2 ring-rose-500/20"
                          : "border-[var(--border-default,#3f3f46)] focus:border-[var(--pri,#4f46e5)]"
                      }`}
                    />
                  )}

                  {/* Country & State Paired Selectors with Full Global Directory */}
                  {field.type === "country" && (() => {
                    const selectedCountry = formData[`${field.id}_country`] || formData.country || "India";
                    const availableStates = getStatesForCountry(countryStates, selectedCountry);
                    const selectedState = formData[`${field.id}_state`] || formData.state || formData.country_state || "";
                    const allowedCountries = getAllowedCountries(field.options, countryStates);

                    return (
                      <div className="space-y-3">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          {/* Country Selector */}
                          <div className="space-y-1.5">
                            <label className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-tertiary,#71717a)] flex items-center justify-between">
                              <span>Country {field.is_required && <span className="text-rose-400">*</span>}</span>
                            </label>
                            <select
                              value={selectedCountry}
                              onChange={(e) => {
                                const nextCountry = e.target.value;
                                handleValueChange(`${field.id}_country`, nextCountry);
                                handleValueChange("country", nextCountry);
                                handleValueChange(`${field.id}_state`, "");
                                handleValueChange("state", "");
                                handleValueChange("country_state", "");

                                const matchingDial = getDialCodeForCountry(nextCountry);
                                activeFields.forEach((f) => {
                                  if (isPhoneField(f)) {
                                    handleValueChange(`${f.id}_dial_code`, matchingDial);
                                  }
                                });
                              }}
                              className={`w-full h-10 px-3 text-xs rounded-xl bg-[var(--bg-surface-2,#18181b)] border text-[var(--text-primary,#ffffff)] focus:outline-none transition cursor-pointer ${
                                fieldError
                                  ? "border-rose-500 ring-2 ring-rose-500/20"
                                  : "border-[var(--border-default,#3f3f46)] focus:border-[var(--pri,#4f46e5)]"
                              }`}
                            >
                              {allowedCountries.map((c) => (
                                <option key={c} value={c} className="bg-zinc-900 text-white">
                                  {c}
                                </option>
                              ))}
                            </select>
                          </div>

                          {/* Dynamic State / Province Selector */}
                          <div className="space-y-1.5">
                            <label className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-tertiary,#71717a)] flex items-center justify-between">
                              <span>State / Province {field.is_required && availableStates.length > 0 && <span className="text-rose-400">*</span>}</span>
                            </label>
                            {availableStates.length > 0 ? (
                              <select
                                value={selectedState}
                                onChange={(e) => {
                                  handleValueChange(`${field.id}_state`, e.target.value);
                                  handleValueChange("state", e.target.value);
                                  handleValueChange("country_state", e.target.value);
                                }}
                                className={`w-full h-10 px-3 text-xs rounded-xl bg-[var(--bg-surface-2,#18181b)] border text-[var(--text-primary,#ffffff)] focus:outline-none transition cursor-pointer ${
                                  fieldError && !selectedState
                                    ? "border-rose-500 ring-2 ring-rose-500/20"
                                    : "border-[var(--border-default,#3f3f46)] focus:border-[var(--pri,#4f46e5)]"
                                }`}
                              >
                                <option value="" className="bg-zinc-900 text-zinc-400">
                                  Select State / Province…
                                </option>
                                {availableStates.map((st) => (
                                  <option key={st} value={st} className="bg-zinc-900 text-white">
                                    {st}
                                  </option>
                                ))}
                              </select>
                            ) : (
                              <input
                                type="text"
                                placeholder="Enter State / Province"
                                value={selectedState}
                                onChange={(e) => {
                                  handleValueChange(`${field.id}_state`, e.target.value);
                                  handleValueChange("state", e.target.value);
                                  handleValueChange("country_state", e.target.value);
                                }}
                                className="w-full h-10 px-3 text-xs rounded-xl bg-[var(--bg-surface-2,#18181b)] border border-[var(--border-default,#3f3f46)] text-[var(--text-primary,#ffffff)] focus:border-[var(--pri,#4f46e5)] focus:outline-none"
                              />
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })()}


                  {/* Rating (1-5) */}
                  {field.type === "rating" && (
                    <div className="flex gap-2 pt-1">
                      {[1, 2, 3, 4, 5].map((star) => (
                        <button
                          key={star}
                          type="button"
                          onClick={() => handleValueChange(field.id, star)}
                          className={`p-1.5 rounded-lg border transition cursor-pointer ${
                            (formData[field.id] || 0) >= star
                              ? "bg-amber-500/20 border-amber-500/50 text-amber-400"
                              : "bg-[var(--bg-surface-2,#18181b)] border-[var(--border-default,#3f3f46)] text-[var(--text-tertiary,#71717a)]"
                          }`}
                        >
                          <Star className="size-5 fill-current" />
                        </button>
                      ))}
                    </div>
                  )}

                  {/* NPS Score (0-10) */}
                  {field.type === "nps" && (
                    <div className="pt-1">
                      <div className="grid grid-cols-11 gap-1">
                        {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((score) => {
                          const isSelected = formData[field.id] === score;
                          return (
                            <button
                              key={score}
                              type="button"
                              onClick={() => handleValueChange(field.id, score)}
                              className={`h-9 rounded-lg text-xs font-bold transition cursor-pointer border ${
                                isSelected
                                  ? "bg-[var(--pri,#f4f4f5)] border-[var(--pri,#f4f4f5)] text-[var(--primary-contrast,#09090b)] shadow-md"
                                  : "bg-[var(--bg-surface-2,#18181b)] border-[var(--border-subtle,#27272a)] text-[var(--text-secondary,#a1a1aa)] hover:border-[var(--pri,#4f46e5)]/60"
                              }`}
                            >
                              {score}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* File / Image Upload */}
                  {["file", "image", "upload"].includes(field.type) && (() => {
                    const fileVal = formData[field.id];
                    const isImageField = field.type === "image";
                    const isImagePreview =
                      Boolean(fileVal) &&
                      (isImageField ||
                        (typeof fileVal === "object" && fileVal?.type?.startsWith("image/")) ||
                        (typeof fileVal === "string" && (fileVal.startsWith("data:image/") || /\.(png|jpe?g|webp|gif|svg)$/i.test(fileVal))));
                    const previewSrc =
                      typeof fileVal === "object" ? fileVal?.dataUrl || fileVal?.url : typeof fileVal === "string" ? fileVal : null;
                    const fileName =
                      typeof fileVal === "object" ? fileVal?.name : typeof fileVal === "string" ? fileVal.split("/").pop() : "Uploaded file";
                    const fileSizeFormatted =
                      typeof fileVal === "object" && fileVal?.size
                        ? fileVal.size > 1024 * 1024
                          ? `${(fileVal.size / (1024 * 1024)).toFixed(1)} MB`
                          : `${Math.round(fileVal.size / 1024)} KB`
                        : null;

                    const handleFileSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
                      const files = e.target.files;
                      if (!files || files.length === 0) return;
                      const file = files[0];
                      if (file.size > 10 * 1024 * 1024) {
                        setErrors((prev) => ({ ...prev, [field.id]: "File size exceeds 10MB limit." }));
                        return;
                      }
                      const reader = new FileReader();
                      reader.onload = () => {
                        handleValueChange(field.id, {
                          name: file.name,
                          size: file.size,
                          type: file.type,
                          dataUrl: reader.result as string,
                        });
                      };
                      reader.readAsDataURL(file);
                    };

                    const handleFileDrop = (e: React.DragEvent<HTMLDivElement>) => {
                      e.preventDefault();
                      const files = e.dataTransfer.files;
                      if (!files || files.length === 0) return;
                      const file = files[0];
                      if (file.size > 10 * 1024 * 1024) {
                        setErrors((prev) => ({ ...prev, [field.id]: "File size exceeds 10MB limit." }));
                        return;
                      }
                      const reader = new FileReader();
                      reader.onload = () => {
                        handleValueChange(field.id, {
                          name: file.name,
                          size: file.size,
                          type: file.type,
                          dataUrl: reader.result as string,
                        });
                      };
                      reader.readAsDataURL(file);
                    };

                    return (
                      <div className="space-y-2">
                        {fileVal ? (
                          <div className="p-3 rounded-xl bg-[var(--bg-surface-2,#18181b)] border border-[var(--border-default,#3f3f46)] flex items-center justify-between gap-3">
                            <div className="flex items-center gap-3 min-w-0 flex-1">
                              {isImagePreview && previewSrc ? (
                                <img
                                  src={previewSrc}
                                  alt={fileName}
                                  className="size-12 rounded-lg object-cover border border-[var(--border-subtle,#27272a)] shrink-0 bg-black/40"
                                />
                              ) : (
                                <div className="size-10 rounded-lg bg-[var(--pri,#4f46e5)]/15 border border-[var(--pri,#4f46e5)]/30 text-[var(--pri,#4f46e5)] flex items-center justify-center shrink-0">
                                  <FileText className="size-5" />
                                </div>
                              )}
                              <div className="min-w-0 flex-1">
                                <p className="text-xs font-bold text-[var(--text-primary,#ffffff)] truncate">
                                  {fileName}
                                </p>
                                {fileSizeFormatted && (
                                  <p className="text-[10px] text-[var(--text-tertiary,#71717a)]">
                                    {fileSizeFormatted}
                                  </p>
                                )}
                              </div>
                            </div>
                            <button
                              type="button"
                              onClick={() => handleValueChange(field.id, "")}
                              className="p-1.5 rounded-lg text-[var(--text-tertiary,#71717a)] hover:text-rose-400 hover:bg-rose-500/10 transition cursor-pointer shrink-0"
                              title="Remove file"
                            >
                              <X className="size-4" />
                            </button>
                          </div>
                        ) : (
                          <div
                            onDragOver={(e) => e.preventDefault()}
                            onDrop={handleFileDrop}
                            className={`p-4 border-2 border-dashed rounded-xl text-center transition cursor-pointer bg-[var(--bg-surface-2,#18181b)]/50 relative group ${
                              fieldError
                                ? "border-rose-500 ring-2 ring-rose-500/20"
                                : "border-[var(--border-default,#3f3f46)] hover:border-[var(--pri,#4f46e5)]"
                            }`}
                          >
                            <input
                              type="file"
                              accept={isImageField ? "image/*" : ".pdf,.doc,.docx,.png,.jpg,.jpeg,.webp"}
                              onChange={handleFileSelected}
                              className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                            />
                            {isImageField ? (
                              <ImageIcon className="size-6 text-[var(--text-tertiary,#71717a)] group-hover:text-[var(--pri,#4f46e5)] mx-auto mb-1.5 transition" />
                            ) : (
                              <UploadCloud className="size-6 text-[var(--text-tertiary,#71717a)] group-hover:text-[var(--pri,#4f46e5)] mx-auto mb-1.5 transition" />
                            )}
                            <p className="text-xs font-semibold text-[var(--text-primary,#ffffff)]">
                              Click or drag file here to upload
                            </p>
                            <p className="text-[10px] text-[var(--text-tertiary,#71717a)] mt-0.5">
                              {isImageField ? "PNG, JPG, WEBP up to 10MB" : "PDF, DOC, PNG, JPG up to 10MB"}
                            </p>
                          </div>
                        )}
                      </div>
                    );
                  })()}

                  {/* Help text & validation errors */}
                  {field.help_text && (
                    <p className="text-[10px] text-[var(--text-tertiary,#71717a)] italic">{field.help_text}</p>
                  )}
                  {fieldError && (
                    <p className="text-[11px] text-rose-400 font-medium flex items-center gap-1 mt-1">
                      <AlertCircle className="size-3 shrink-0" />
                      {fieldError}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Review & Terms Step ───────────────────────────────── */}
      {activeFlowStep.type === "review_terms" && (
        <div className="space-y-6">
          {/* Summary Preview Table */}
          {settings.enable_preview !== false && (
            <div className="p-5 rounded-2xl bg-[var(--bg-surface-2,#18181b)] border border-[var(--border-subtle,#27272a)] space-y-4">
              <div className="flex items-center gap-2 border-b border-[var(--border-subtle,#27272a)] pb-3">
                <FileCheck className="size-4 text-[var(--pri,#4f46e5)]" />
                <h4 className="text-sm font-bold text-[var(--text-primary,#ffffff)]">
                  Summary of Registration Details
                </h4>
              </div>

              <div className="divide-y divide-[var(--border-subtle,#27272a)]/50 text-xs">
                {activeFields.map((f) => {
                  const val = formData[f.id];
                  if (!val && val !== 0) return null;
                  return (
                    <div key={f.id} className="py-2 flex items-center justify-between">
                      <span className="text-[var(--text-secondary,#a1a1aa)]">{f.label}</span>
                      <span className="font-semibold text-[var(--text-primary,#ffffff)]">
                        {Array.isArray(val) ? val.join(", ") : String(val)}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Terms & Conditions Agreement */}
          {settings.enable_terms !== false && (
            <div className="p-5 rounded-2xl bg-[var(--bg-surface-2,#18181b)] border border-[var(--border-subtle,#27272a)] space-y-3">
              <div className="flex items-center gap-2">
                <ShieldCheck className="size-4 text-emerald-400" />
                <h4 className="text-sm font-bold text-[var(--text-primary,#ffffff)]">
                  Terms & Conditions
                </h4>
              </div>

              <div className="p-3 max-h-32 overflow-y-auto rounded-xl bg-[var(--bg-surface-3,#1b1b1d)] text-[11px] text-[var(--text-secondary,#a1a1aa)] leading-relaxed">
                {settings.terms_and_conditions ||
                  "1. All registrations are subject to verification.\n2. Cancellation and refund policies apply as defined by the event organizer.\n3. Attendees agree to abide by the event code of conduct and safety regulations."}
              </div>

              <label className="flex items-start gap-2.5 cursor-pointer pt-2">
                <input
                  type="checkbox"
                  checked={termsAccepted}
                  onChange={(e) => {
                    setTermsAccepted(e.target.checked);
                    if (errors["terms"]) {
                      setErrors((prev) => {
                        const n = { ...prev };
                        delete n["terms"];
                        return n;
                      });
                    }
                  }}
                  className="accent-[var(--pri,#4f46e5)] size-4 rounded mt-0.5"
                />
                <span className="text-xs font-semibold text-[var(--text-primary,#ffffff)]">
                  I have read and agree to the event Terms & Conditions <span className="text-rose-400">*</span>
                </span>
              </label>

              {errors["terms"] && (
                <p className="text-xs text-rose-400 flex items-center gap-1 mt-1 font-medium">
                  <AlertCircle className="size-3.5" />
                  {errors["terms"]}
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── Payment Step ──────────────────────────────────────── */}
      {activeFlowStep.type === "payment" && (
        <div className="p-6 rounded-2xl bg-[var(--bg-surface-2,#18181b)] border border-[var(--border-subtle,#27272a)] space-y-5">
          <div className="flex items-center justify-between border-b border-[var(--border-subtle,#27272a)] pb-3">
            <div className="flex items-center gap-2">
              <CreditCard className="size-5 text-[var(--pri,#4f46e5)]" />
              <h4 className="text-sm font-bold text-[var(--text-primary,#ffffff)]">Payment & Checkout</h4>
            </div>
            <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
              Secure Gateway
            </span>
          </div>

          <div className="p-4 rounded-xl bg-[var(--bg-surface-3,#1b1b1d)] space-y-2 text-xs">
            <div className="flex justify-between text-[var(--text-secondary,#a1a1aa)]">
              <span>Registration Pass ({formData["role"] || "Attendee"})</span>
              <span className="font-semibold text-[var(--text-primary,#ffffff)]">₹ 4,999.00</span>
            </div>
            <div className="flex justify-between text-[var(--text-secondary,#a1a1aa)]">
              <span>Taxes & GST (18%)</span>
              <span className="font-semibold text-[var(--text-primary,#ffffff)]">₹ 899.82</span>
            </div>
            <div className="border-t border-[var(--border-subtle,#27272a)] pt-2 flex justify-between text-sm font-bold text-[var(--text-primary,#ffffff)]">
              <span>Total Payable</span>
              <span className="text-emerald-400">₹ 5,898.82</span>
            </div>
          </div>

          <p className="text-[11px] text-[var(--text-tertiary,#71717a)] text-center flex items-center justify-center gap-1">
            <Lock className="size-3" />
            256-bit encrypted checkout via Stripe / Razorpay
          </p>
        </div>
      )}

      {/* ── Navigation Bottom Bar ─────────────────────────────── */}
      <div className="pt-4 border-t border-[var(--border-subtle,#27272a)] flex items-center justify-between">
        {currentStepIdx > 0 ? (
          <button
            type="button"
            onClick={handlePrevStep}
            className="h-10 px-4 rounded-xl border border-[var(--border-default,#3f3f46)] hover:bg-[var(--bg-surface-3,#1b1b1d)] text-xs font-semibold text-[var(--text-secondary,#a1a1aa)] hover:text-[var(--text-primary,#ffffff)] flex items-center gap-1.5 transition cursor-pointer"
          >
            <ArrowLeft className="size-3.5" />
            <span>Previous Step</span>
          </button>
        ) : (
          <div />
        )}

        <button
          type="button"
          onClick={handleNextStep}
          className="h-11 px-6 rounded-xl font-bold text-xs bg-[var(--pri,#f4f4f5)] text-[var(--primary-contrast,#09090b)] hover:opacity-90 shadow-lg flex items-center gap-2 cursor-pointer transition"
        >
          <span>
            {currentStepIdx === allFlowSteps.length - 1
              ? settings.submit_button_label || "Complete Registration"
              : "Next Step"}
          </span>
          <ArrowRight className="size-4" />
        </button>
      </div>
    </div>
  );
}
