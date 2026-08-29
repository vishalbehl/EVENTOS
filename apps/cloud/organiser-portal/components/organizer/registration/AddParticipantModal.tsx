"use client";

import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  X,
  Upload,
  Save,
  FileSpreadsheet,
  Download,
  RefreshCw,
  UserPlus,
  Check,
} from "lucide-react";
import { apiClient, apiGet, apiPost } from "@/lib/api-client";
import { formatApiError } from "@/lib/utils";
import { toast } from "sonner";
import { CapabilityAction } from "@/lib/capabilities";
import { cn } from "@/lib/utils";
import { COUNTRY_DIAL_CODES, getDialCodeForCountry } from "@/lib/country-dial-codes";
import { fetchCountryStates, CountryStateEntry, getStatesForCountry, fallbackCountryStates } from "@/lib/country-states";

interface AddParticipantModalProps {
  isOpen: boolean;
  onClose: () => void;
  eventId: string;
  onSuccess: () => void;
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

interface Role {
  id: string;
  category: string;
  name: string;
  is_active: boolean;
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
  "designation",
  "country",
  "state",
  "city",
  "role",
  "paid_status",
]);

function getStoredToken() {
  if (typeof window === "undefined") return "";
  try {
    const storage = localStorage.getItem("obsidian-auth-storage");
    if (!storage) return "";
    return JSON.parse(storage)?.state?.accessToken || "";
  } catch {
    return "";
  }
}

export default function AddParticipantModal({
  isOpen,
  onClose,
  eventId,
  onSuccess,
}: AddParticipantModalProps) {
  const [activeTab, setActiveTab] = useState<"manual" | "excel">("manual");
  const [fields, setFields] = useState<FormField[]>([]);
  const [formValues, setFormValues] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<any>(null);
  const [countryStates, setCountryStates] = useState<CountryStateEntry[]>(fallbackCountryStates);

  const activeFields = useMemo(() => fields.filter((field) => field.is_active), [fields]);

  useEffect(() => {
    fetchCountryStates().then(setCountryStates);
  }, []);

  const fetchConfig = async () => {
    if (!eventId) return;
    setLoading(true);
    try {
      const [config, roles] = await Promise.all([
        apiGet<any>(`/events/${eventId}/registration/form-config?t=${Date.now()}`),
        apiGet<Role[]>(`/events/${eventId}/registration/roles`),
      ]);

      const activeRoles = (roles || []).filter((role) => role.is_active).map((role) => role.name);
      const configuredFields = (config.fields || []).map((field: FormField) =>
        field.id === "role" ? { ...field, options: activeRoles } : field
      );
      setFields(configuredFields);

      const defaults: Record<string, any> = { 
        paid_status: "Unpaid", 
        source: "manual_admin",
        phone_dial_code: "+91",
        country: "India"
      };
      configuredFields.forEach((field: FormField) => {
        if (!field.is_active) return;
        if (field.type === "checkbox") defaults[field.id] = [];
        else if (field.id === "role") defaults[field.id] = activeRoles[0] || "Delegate";
        else if (field.id === "country") defaults[field.id] = "India";
        else if (field.id === "title") defaults[field.id] = "Dr.";
        else defaults[field.id] = "";
      });
      setFormValues(defaults);
    } catch (err: any) {
      toast.error(err.message || "Failed to load registration form configurations.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen && eventId) {
      fetchConfig();
      setImportFile(null);
      setImportResult(null);
      setActiveTab("manual");
    }
  }, [isOpen, eventId]);

  const setValue = (id: string, value: any) => {
    setFormValues((prev) => ({ ...prev, [id]: value }));
  };

  const handleFileUpload = async (field: FormField, file?: File | null) => {
    if (!file) return;
    const data = new FormData();
    data.append("file", file);
    try {
      const result = await apiClient.post<any>(`/portal/registration/${eventId}/upload`, data, {
        headers: { "Content-Type": undefined } as any,
      });
      setValue(field.id, result.url);
      toast.success(`${field.label} uploaded.`);
    } catch (err: any) {
      toast.error(err.message || `Failed to upload ${field.label}.`);
    }
  };

  const buildPayload = () => {
    const payload: Record<string, any> = {
      paid_status: formValues.paid_status || "Unpaid",
      source: "manual_admin",
      custom_fields: {},
    };

    activeFields.forEach((field) => {
      const value = formValues[field.id];
      if (DEFAULT_FIELD_IDS.has(field.id) || DEFAULT_FIELD_IDS.has(field.name)) {
        payload[field.name || field.id] = value;
      } else {
        payload.custom_fields[field.id] = value;
      }

      if (field.type === "country" && formValues[`${field.id}_state`]) {
        payload.custom_fields[`${field.id}_state`] = formValues[`${field.id}_state`];
      }
    });

    if (formValues.phone) {
      const dial = formValues.phone_dial_code || "+91";
      const rawPhone = String(formValues.phone).trim();
      payload.phone = rawPhone.startsWith("+") ? rawPhone : `${dial} ${rawPhone}`;
    }

    if (formValues.state) {
      payload.state = formValues.state;
    }

    if (!payload.name) {
      const prefix = formValues.title ? `${formValues.title} ` : "";
      payload.name = `${prefix}${(payload.first_name || "").toString().trim()} ${(payload.last_name || "").toString().trim()}`.trim();
    }

    return payload;
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    for (const field of activeFields) {
      const value = formValues[field.id];
      const empty =
        value === undefined ||
        value === null ||
        value === "" ||
        (Array.isArray(value) && value.length === 0);
      if (field.is_required && empty) {
        toast.error(`${field.label} is required.`);
        return;
      }
    }

    setSubmitting(true);
    try {
      const key = crypto.randomUUID();
      const submitWith = async (payload: Record<string, any>) =>
        apiPost(`/events/${eventId}/participants`, payload, {
          headers: { "Idempotency-Key": key },
        });

      const payload = buildPayload();
      try {
        await submitWith(payload);
        toast.success("Participant registered successfully.");
      } catch (err: any) {
        const detail = err?.response?.data?.detail;
        if (err?.response?.status === 409 && detail?.code === "PROFILE_MERGE_REQUIRED") {
          const confirmed = window.confirm(
            `${detail.message}\n\nMerge this registration into the existing profile?`
          );
          if (!confirmed) {
            setSubmitting(false);
            return;
          }
          await submitWith({ ...payload, confirm_merge: true });
          toast.success("Profile merged with the existing participant.");
        } else if (
          err?.response?.status === 402 ||
          err?.response?.data?.detail?.code === "QUOTA_EXHAUSTED"
        ) {
          const detail = err?.response?.data?.detail;
          toast.error(
            detail?.code === "QUOTA_EXHAUSTED"
              ? `Registration quota exhausted (${detail.used}/${detail.allowed}). Upgrade the plan to add more participants.`
              : formatApiError(err, "Payment required to register more participants.")
          );
        } else {
          throw err;
        }
      }
      onSuccess();
      onClose();
    } catch (err: any) {
      toast.error(formatApiError(err, "Failed to register participant."));
    } finally {
      setSubmitting(false);
    }
  };

  const downloadTemplate = async () => {
    try {
      const token = getStoredToken();
      const response = await fetch(
        `${
          process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000"
        }/api/v1/events/${eventId}/participants/import-template`,
        {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        }
      );
      if (!response.ok) throw new Error(await response.text());
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `participant-import-template-${eventId}.xlsx`;
      link.click();
      window.URL.revokeObjectURL(url);
    } catch (err: any) {
      toast.error(formatApiError(err, "Failed to download Excel template."));
    }
  };

  const handleExcelImport = async () => {
    if (!importFile) {
      toast.error("Choose an Excel file first.");
      return;
    }
    setImporting(true);
    try {
      const data = new FormData();
      data.append("file", importFile);
      const result = await apiClient.post<any>(`/events/${eventId}/participants/import-excel`, data, {
        headers: { "Content-Type": undefined, "Idempotency-Key": crypto.randomUUID() } as any,
      });
      setImportResult(result);
      toast.success("Spreadsheet processed successfully.");
      onSuccess();
    } catch (err: any) {
      const detail = err?.response?.data?.detail;
      if (detail?.code === "QUOTA_EXHAUSTED") {
        toast.error(
          `Registration quota exhausted (${detail.used}/${detail.allowed}). Upgrade the plan to add more participants.`
        );
      } else {
        toast.error(formatApiError(err, "Failed to import Excel file."));
      }
    } finally {
      setImporting(false);
    }
  };

  const renderField = (field: FormField) => {
    const requiredMark = field.is_required ? <span className="text-rose-500">*</span> : null;
    const label = (
      <label className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-tertiary)] block mb-1">
        {field.label} {requiredMark}
      </label>
    );

    if (field.type === "select") {
      return (
        <div key={field.id} className="space-y-1">
          {label}
          <select
            value={formValues[field.id] || ""}
            onChange={(e) => setValue(field.id, e.target.value)}
            className="h-9 w-full rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface-2)] px-3 text-xs text-[var(--text-primary)] focus:border-[var(--pri)] focus:outline-none"
          >
            <option value="">Select option</option>
            {(field.options || []).map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </div>
      );
    }

    if (field.type === "checkbox") {
      const selected = formValues[field.id] || [];
      return (
        <div key={field.id} className="space-y-1 sm:col-span-2">
          {label}
          <div className="rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface-2)] p-3 grid grid-cols-2 gap-2">
            {(field.options || []).map((option) => (
              <label
                key={option}
                className="flex items-center gap-2 text-xs font-medium text-[var(--text-primary)] cursor-pointer select-none"
              >
                <input
                  type="checkbox"
                  checked={selected.includes(option)}
                  onChange={(e) =>
                    setValue(
                      field.id,
                      e.target.checked
                        ? [...selected, option]
                        : selected.filter((item: string) => item !== option)
                    )
                  }
                  className="rounded border-[var(--border-default)] accent-[var(--pri)]"
                />
                {option}
              </label>
            ))}
          </div>
        </div>
      );
    }

    if (field.type === "country") {
      const country = formValues[field.id] || "";
      const states = getStatesForCountry(countryStates, country);
      return (
        <div key={field.id} className="space-y-2 sm:col-span-2 grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-1">
            {label}
            <select
              value={country}
              onChange={(e) => {
                const newCountry = e.target.value;
                setValue(field.id, newCountry);
                setValue("phone_dial_code", getDialCodeForCountry(newCountry));
                setValue("state", "");
                setValue(`${field.id}_state`, "");
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
            {states.length > 0 ? (
              <select
                value={formValues["state"] || formValues[`${field.id}_state`] || ""}
                onChange={(e) => {
                  setValue("state", e.target.value);
                  setValue(`${field.id}_state`, e.target.value);
                }}
                disabled={!country}
                className="h-9 w-full rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface-2)] px-3 text-xs text-[var(--text-primary)] focus:border-[var(--pri)] focus:outline-none disabled:opacity-40 cursor-pointer"
              >
                <option value="">Select state / province</option>
                {states.map((st) => (
                  <option key={st} value={st}>
                    {st}
                  </option>
                ))}
              </select>
            ) : (
              <input
                type="text"
                placeholder="Enter state or province"
                value={formValues["state"] || formValues[`${field.id}_state`] || ""}
                onChange={(e) => {
                  setValue("state", e.target.value);
                  setValue(`${field.id}_state`, e.target.value);
                }}
                className="h-9 w-full rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface-2)] px-3 text-xs text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:border-[var(--pri)] focus:outline-none"
              />
            )}
          </div>
        </div>
      );
    }

    if (field.type === "state") {
      const country = formValues["country"] || "";
      const states = getStatesForCountry(countryStates, country);
      if (states.length > 0) {
        return (
          <div key={field.id} className="space-y-1">
            {label}
            <select
              value={formValues[field.id] || ""}
              onChange={(e) => setValue(field.id, e.target.value)}
              className="h-9 w-full rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface-2)] px-3 text-xs text-[var(--text-primary)] focus:border-[var(--pri)] focus:outline-none cursor-pointer"
            >
              <option value="">Select state / province</option>
              {states.map((st) => (
                <option key={st} value={st}>
                  {st}
                </option>
              ))}
            </select>
          </div>
        );
      }
    }

    if (field.type === "phone" || field.id === "phone") {
      return (
        <div key={field.id} className="space-y-1">
          {label}
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
              placeholder={field.placeholder || "Enter mobile number"}
              value={formValues[field.id] || ""}
              onChange={(e) => setValue(field.id, e.target.value)}
              className="h-9 flex-1 rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface-2)] px-3 text-xs text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:border-[var(--pri)] focus:outline-none"
            />
          </div>
        </div>
      );
    }

    if (field.type === "file" || field.type === "image") {
      return (
        <div key={field.id} className="space-y-1">
          {label}
          <div className="relative rounded-lg border border-dashed border-[var(--border-default)] hover:border-[var(--pri)] p-3 transition-colors bg-[var(--bg-surface-2)] cursor-pointer text-center">
            <input
              type="file"
              accept={field.type === "image" ? "image/*" : undefined}
              onChange={(e) => handleFileUpload(field, e.target.files?.[0])}
              className="absolute inset-0 opacity-0 cursor-pointer"
            />
            <div className="flex items-center gap-2 justify-center py-0.5">
              <Upload className="size-3.5 text-[var(--text-tertiary)]" />
              <span className="text-xs font-medium text-[var(--text-primary)] truncate max-w-[180px]">
                {formValues[field.id] ? "Uploaded ✓" : "Choose file"}
              </span>
            </div>
          </div>
        </div>
      );
    }

    return (
      <div key={field.id} className="space-y-1">
        {label}
        <input
          type={
            field.type === "date"
              ? "date"
              : field.type === "email"
              ? "email"
              : "text"
          }
          placeholder={field.placeholder || `Enter ${field.label.toLowerCase()}`}
          value={formValues[field.id] || ""}
          onChange={(e) => setValue(field.id, e.target.value)}
          className="h-9 w-full rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface-2)] px-3 text-xs text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:border-[var(--pri)] focus:outline-none"
        />
      </div>
    );
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
            className="w-full max-w-2xl rounded-lg border border-[var(--border-default)] bg-[var(--card)] p-6 shadow-md flex flex-col max-h-[90vh] overflow-hidden space-y-4"
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-[var(--border-subtle)] pb-3 shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="flex size-8 items-center justify-center rounded-lg bg-[var(--pri)]/10 text-[var(--pri)] border border-[var(--pri)]/20">
                  <UserPlus className="size-4" />
                </div>
                <div>
                  <h2 className="text-sm font-bold text-[var(--text-primary)]">Add New Participant</h2>
                  <p className="text-[11px] text-[var(--text-secondary)]">Register a single attendee or upload a bulk spreadsheet.</p>
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

            {/* Tab Selector */}
            <div className="flex items-center justify-between border-b border-[var(--border-subtle)] pb-3 shrink-0">
              <div className="flex items-center rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface-2)] p-1 gap-1">
                <button
                  type="button"
                  onClick={() => setActiveTab("manual")}
                  className={cn(
                    "rounded-md px-3.5 py-1.5 text-xs font-semibold transition-colors cursor-pointer",
                    activeTab === "manual"
                      ? "bg-[var(--pri)] text-[var(--primary-contrast)] shadow-sm font-bold"
                      : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                  )}
                >
                  Manual Form
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab("excel")}
                  className={cn(
                    "rounded-md px-3.5 py-1.5 text-xs font-semibold transition-colors cursor-pointer",
                    activeTab === "excel"
                      ? "bg-[var(--pri)] text-[var(--primary-contrast)] shadow-sm font-bold"
                      : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                  )}
                >
                  Excel Bulk Import
                </button>
              </div>

              {activeTab === "manual" && (
                <span className="text-[10px] font-semibold text-[var(--text-secondary)]">
                  Mirrored from form builder
                </span>
              )}
            </div>

            {/* Modal Body */}
            <div className="flex-1 overflow-y-auto pr-1 min-h-0">
              {loading ? (
                <div className="py-16 flex flex-col items-center justify-center space-y-2 text-xs text-[var(--text-secondary)]">
                  <RefreshCw className="size-5 text-[var(--pri)] animate-spin" />
                  <span>Loading registration schema...</span>
                </div>
              ) : activeTab === "manual" ? (
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                    {activeFields.map(renderField)}
                    <div className="space-y-1">
                      <label className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-tertiary)] block mb-1">
                        Payment Status
                      </label>
                      <select
                        value={formValues.paid_status || "Unpaid"}
                        onChange={(e) => setValue("paid_status", e.target.value)}
                        className="h-9 w-full rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface-2)] px-3 text-xs text-[var(--text-primary)] focus:border-[var(--pri)] focus:outline-none"
                      >
                        <option value="Unpaid">Unpaid</option>
                        <option value="Paid">Paid</option>
                      </select>
                    </div>
                  </div>

                  <div className="pt-3 border-t border-[var(--border-subtle)] flex items-center justify-end gap-2.5">
                    <button
                      type="button"
                      onClick={onClose}
                      className="rounded-lg border border-[var(--border-default)] bg-[var(--card)] px-4 py-2 text-xs font-semibold text-[var(--text-secondary)] hover:bg-[var(--bg-surface-hover)] transition-colors cursor-pointer"
                    >
                      Cancel
                    </button>
                    <CapabilityAction operation="registration.manage" limitKey="max_registrations">
                      <button
                        type="submit"
                        disabled={submitting}
                        className="flex items-center gap-2 rounded-lg bg-[var(--pri)] px-5 py-2 text-xs font-bold text-[var(--primary-contrast)] shadow-sm transition-all hover:opacity-90 disabled:opacity-40 cursor-pointer"
                      >
                        <Save className="size-3.5" />
                        {submitting ? "Registering..." : "Save Delegate"}
                      </button>
                    </CapabilityAction>
                  </div>
                </form>
              ) : importResult ? (
                <div className="space-y-4">
                  <div className="text-center space-y-1.5">
                    <div className="inline-flex size-10 rounded-full bg-emerald-500/10 border border-emerald-500/20 items-center justify-center text-emerald-600 dark:text-emerald-400">
                      <Check className="size-5" />
                    </div>
                    <h3 className="text-sm font-bold text-[var(--text-primary)]">Import Process Complete</h3>
                    <p className="text-xs text-[var(--text-secondary)]">{importResult.message}</p>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div className="rounded-lg border border-[var(--border-default)] bg-[var(--card)] p-3 text-center">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-tertiary)] mb-0.5">Approved</p>
                      <p className="text-xl font-bold text-emerald-600 dark:text-emerald-400">{importResult.inserted}</p>
                    </div>
                    <div className="rounded-lg border border-[var(--border-default)] bg-[var(--card)] p-3 text-center">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-tertiary)] mb-0.5">Merged</p>
                      <p className="text-xl font-bold text-blue-600 dark:text-blue-400">{importResult.merged}</p>
                    </div>
                    <div className="rounded-lg border border-[var(--border-default)] bg-[var(--card)] p-3 text-center">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-tertiary)] mb-0.5">Waitlisted</p>
                      <p className="text-xl font-bold text-amber-600 dark:text-amber-400">{importResult.waitlisted}</p>
                    </div>
                    <div className="rounded-lg border border-[var(--border-default)] bg-[var(--card)] p-3 text-center">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-tertiary)] mb-0.5">Skipped</p>
                      <p className="text-xl font-bold text-rose-600 dark:text-rose-400">{importResult.skipped}</p>
                    </div>
                  </div>

                  {importResult.skipped_details && importResult.skipped_details.length > 0 && (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-bold text-rose-500">Skipped Entries / Errors</span>
                        <span className="text-[10px] text-[var(--text-tertiary)]">{importResult.skipped_details.length} issues found</span>
                      </div>
                      <div className="rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface-2)] overflow-hidden max-h-48 overflow-y-auto">
                        <table className="w-full text-left text-xs border-collapse">
                          <thead className="bg-[var(--card)] text-[10px] font-bold uppercase text-[var(--text-tertiary)] border-b border-[var(--border-subtle)] sticky top-0">
                            <tr>
                              <th className="px-3 py-2 w-12 text-center">Row</th>
                              <th className="px-3 py-2">Name</th>
                              <th className="px-3 py-2">Email</th>
                              <th className="px-3 py-2">Role</th>
                              <th className="px-3 py-2">Reason</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-[var(--border-subtle)] text-[var(--text-secondary)]">
                            {importResult.skipped_details.map((detail: any, dIdx: number) => (
                              <tr key={dIdx}>
                                <td className="px-3 py-2 text-center font-mono font-bold text-rose-500">{detail.row}</td>
                                <td className="px-3 py-2 font-medium text-[var(--text-primary)]">{detail.name || "—"}</td>
                                <td className="px-3 py-2">{detail.email || "—"}</td>
                                <td className="px-3 py-2">{detail.role || "—"}</td>
                                <td className="px-3 py-2 text-rose-500 font-medium">{detail.reason}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  <div className="pt-3 border-t border-[var(--border-subtle)] flex items-center justify-end">
                    <button
                      type="button"
                      onClick={() => {
                        setImportResult(null);
                        setImportFile(null);
                        onSuccess();
                        onClose();
                      }}
                      className="rounded-lg bg-[var(--pri)] px-5 py-2 text-xs font-bold text-[var(--primary-contrast)] shadow-sm transition-all hover:opacity-90 cursor-pointer"
                    >
                      Done
                    </button>
                  </div>
                </div>
              ) : (
                <div className="space-y-4 max-w-lg mx-auto py-2">
                  <div className="text-center space-y-1">
                    <p className="text-xs font-bold text-[var(--text-primary)]">Excel Bulk Intake Spooler</p>
                    <p className="text-xs text-[var(--text-secondary)]">
                      Download the template spreadsheet matching your configured fields. Fill in attendee details and upload it back here.
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={downloadTemplate}
                    className="w-full h-10 flex items-center justify-center gap-2 rounded-lg border border-[var(--border-default)] bg-[var(--card)] text-xs font-bold text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)] transition-colors cursor-pointer"
                  >
                    <Download className="size-4 text-[var(--pri)]" />
                    Download Excel Template (.xlsx)
                  </button>

                  <div className="relative rounded-lg border-2 border-dashed border-[var(--border-default)] hover:border-[var(--pri)] p-8 transition-colors flex flex-col items-center justify-center bg-[var(--bg-surface-2)] text-center cursor-pointer">
                    <input
                      type="file"
                      accept=".xlsx,.xlsm"
                      onChange={(e) => setImportFile(e.target.files?.[0] || null)}
                      className="absolute inset-0 opacity-0 cursor-pointer"
                    />
                    <FileSpreadsheet className="size-8 text-[var(--text-tertiary)] mb-2" />
                    <span className="text-xs font-bold text-[var(--text-primary)]">
                      {importFile ? importFile.name : "Choose completed spreadsheet"}
                    </span>
                    <span className="text-[10px] text-[var(--text-tertiary)] mt-0.5">
                      Drag & drop or browse .xlsx files
                    </span>
                  </div>

                  <div className="pt-3 border-t border-[var(--border-subtle)] flex items-center justify-end gap-2.5">
                    <button
                      type="button"
                      onClick={onClose}
                      className="rounded-lg border border-[var(--border-default)] bg-[var(--card)] px-4 py-2 text-xs font-semibold text-[var(--text-secondary)] hover:bg-[var(--bg-surface-hover)] transition-colors cursor-pointer"
                    >
                      Cancel
                    </button>
                    <CapabilityAction operation="registration.import" limitKey="max_registrations">
                      <button
                        type="button"
                        onClick={handleExcelImport}
                        disabled={importing || !importFile}
                        className="flex items-center gap-2 rounded-lg bg-emerald-600 px-5 py-2 text-xs font-bold text-white shadow-sm transition-all hover:bg-emerald-700 disabled:opacity-40 cursor-pointer"
                      >
                        {importing ? "Importing delegates..." : "Import Delegates"}
                      </button>
                    </CapabilityAction>
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
