import React, { useState, useMemo } from "react";
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
} from "lucide-react";
import { FormField, FormSettings, FormStep } from "../types";

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
        if (field.is_required) {
          const val = formData[field.id];
          if (
            val === undefined ||
            val === null ||
            val === "" ||
            (Array.isArray(val) && val.length === 0)
          ) {
            newErrors[field.id] = `${field.label} is required`;
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

                  {/* Standard Text / Email / Phone / Number */}
                  {["text", "email", "phone", "number"].includes(field.type) && (
                    <input
                      type={field.type === "number" ? "number" : field.type === "email" ? "email" : field.type === "phone" ? "tel" : "text"}
                      placeholder={field.placeholder || "Your answer…"}
                      value={formData[field.id] || ""}
                      onChange={(e) => handleValueChange(field.id, e.target.value)}
                      className={`w-full h-10 px-3 text-xs rounded-xl bg-[var(--bg-surface-2,#18181b)] border text-[var(--text-primary,#ffffff)] focus:outline-none transition ${
                        fieldError
                          ? "border-rose-500"
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
                          ? "border-rose-500"
                          : "border-[var(--border-default,#3f3f46)] focus:border-[var(--pri,#4f46e5)]"
                      }`}
                    />
                  )}

                  {/* Dropdown / Select / Role / Title */}
                  {["select", "title", "role"].includes(field.type) && (
                    <select
                      value={formData[field.id] || ""}
                      onChange={(e) => handleValueChange(field.id, e.target.value)}
                      className={`w-full h-10 px-3 text-xs rounded-xl bg-[var(--bg-surface-2,#18181b)] border text-[var(--text-primary,#ffffff)] focus:outline-none transition ${
                        fieldError
                          ? "border-rose-500"
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
                      className="w-full h-10 px-3 text-xs rounded-xl bg-[var(--bg-surface-2,#18181b)] border border-[var(--border-default,#3f3f46)] text-[var(--text-primary,#ffffff)] focus:border-[var(--pri,#4f46e5)] focus:outline-none"
                    />
                  )}
                  {field.type === "time" && (
                    <input
                      type="time"
                      value={formData[field.id] || ""}
                      onChange={(e) => handleValueChange(field.id, e.target.value)}
                      className="w-full h-10 px-3 text-xs rounded-xl bg-[var(--bg-surface-2,#18181b)] border border-[var(--border-default,#3f3f46)] text-[var(--text-primary,#ffffff)] focus:border-[var(--pri,#4f46e5)] focus:outline-none"
                    />
                  )}

                  {/* Country & State */}
                  {field.type === "country" && (
                    <div className="grid grid-cols-2 gap-2">
                      <select
                        value={formData[`${field.id}_country`] || "India"}
                        onChange={(e) => handleValueChange(`${field.id}_country`, e.target.value)}
                        className="h-10 px-3 text-xs rounded-xl bg-[var(--bg-surface-2,#18181b)] border border-[var(--border-default,#3f3f46)] text-[var(--text-primary,#ffffff)]"
                      >
                        <option value="India">India</option>
                        <option value="United States">United States</option>
                        <option value="United Kingdom">United Kingdom</option>
                        <option value="Australia">Australia</option>
                      </select>
                      <input
                        type="text"
                        placeholder="State / Province"
                        value={formData[`${field.id}_state`] || ""}
                        onChange={(e) => handleValueChange(`${field.id}_state`, e.target.value)}
                        className="h-10 px-3 text-xs rounded-xl bg-[var(--bg-surface-2,#18181b)] border border-[var(--border-default,#3f3f46)] text-[var(--text-primary,#ffffff)]"
                      />
                    </div>
                  )}

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

                  {/* File Upload */}
                  {["file", "image"].includes(field.type) && (
                    <div className="p-4 border-2 border-dashed border-[var(--border-default,#3f3f46)] rounded-xl text-center hover:border-[var(--pri,#4f46e5)] transition cursor-pointer bg-[var(--bg-surface-2,#18181b)]/50">
                      <UploadCloud className="size-6 text-[var(--text-tertiary,#71717a)] mx-auto mb-1.5" />
                      <p className="text-xs font-medium text-[var(--text-primary,#ffffff)]">Click to upload file</p>
                      <p className="text-[10px] text-[var(--text-tertiary,#71717a)]">PDF, PNG, JPG up to 10MB</p>
                    </div>
                  )}

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
