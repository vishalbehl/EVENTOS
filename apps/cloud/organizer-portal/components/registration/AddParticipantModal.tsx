"use client";

import { useEffect, useMemo, useState } from "react";
import { X, Upload, Save, FileSpreadsheet, Download, RefreshCw, UserPlus } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { apiClient, apiGet, apiPost } from "@/lib/api-client";
import { toast } from "sonner";

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

const DEFAULT_FIELD_IDS = new Set(["name", "first_name", "last_name", "email", "phone", "company", "designation", "country", "role"]);

const COUNTRY_STATES: Record<string, string[]> = {
  India: ["Andhra Pradesh", "Delhi", "Gujarat", "Karnataka", "Kerala", "Maharashtra", "Tamil Nadu", "Telangana", "Uttar Pradesh", "West Bengal"],
  "United States": ["California", "Florida", "Georgia", "Illinois", "New York", "North Carolina", "Ohio", "Pennsylvania", "Texas", "Washington"],
  "United Kingdom": ["England", "Northern Ireland", "Scotland", "Wales"],
  Canada: ["Alberta", "British Columbia", "Manitoba", "Nova Scotia", "Ontario", "Quebec", "Saskatchewan"],
  Australia: ["New South Wales", "Queensland", "South Australia", "Tasmania", "Victoria", "Western Australia"],
  Germany: ["Bavaria", "Berlin", "Hamburg", "Hesse", "North Rhine-Westphalia", "Saxony"],
};

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

export default function AddParticipantModal({ isOpen, onClose, eventId, onSuccess }: AddParticipantModalProps) {
  const [activeTab, setActiveTab] = useState<"manual" | "excel">("manual");
  const [fields, setFields] = useState<FormField[]>([]);
  const [formValues, setFormValues] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importing, setImporting] = useState(false);

  const activeFields = useMemo(() => fields.filter((field) => field.is_active), [fields]);

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

      const defaults: Record<string, any> = { paid_status: "Unpaid", source: "manual_admin" };
      configuredFields.forEach((field: FormField) => {
        if (!field.is_active) return;
        if (field.type === "checkbox") defaults[field.id] = [];
        else if (field.id === "role") defaults[field.id] = activeRoles[0] || "Delegate";
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
        headers: { "Content-Type": "multipart/form-data" },
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
      await apiPost(`/events/${eventId}/participants`, buildPayload());
      toast.success("Participant registered successfully.");
      onSuccess();
      onClose();
    } catch (err: any) {
      toast.error(err.message || "Failed to register participant.");
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
      toast.error(err.message || "Failed to download Excel template.");
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
        headers: { "Content-Type": "multipart/form-data" },
      });
      toast.success(result.message || "Participants imported.");
      setImportFile(null);
      onSuccess();
      onClose();
    } catch (err: any) {
      toast.error(err.message || "Failed to import Excel file.");
    } finally {
      setImporting(false);
    }
  };

  const renderField = (field: FormField) => {
    const requiredMark = field.is_required ? <span className="text-rose-400">*</span> : null;
    const label = (
      <label className="text-[9px] font-black uppercase tracking-[0.2em] text-muted block mb-1.5">
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
            className="w-full h-11 px-4 rounded-xl border border-default bg-white/5 text-xs font-semibold text-[var(--text)] focus:outline-none focus:border-[var(--pri)] transition-all cursor-pointer"
          >
            <option value="" className="bg-[var(--surf)]">Select option</option>
            {(field.options || []).map((option) => (
              <option key={option} value={option} className="bg-[var(--surf)]">
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
          <div className="rounded-xl border border-default bg-white/5 p-4 grid grid-cols-2 gap-2">
            {(field.options || []).map((option) => (
              <label key={option} className="flex items-center gap-2 text-xs font-semibold text-[var(--text)] cursor-pointer select-none">
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
                  className="rounded accent-[var(--pri)]"
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
      return (
        <div key={field.id} className="space-y-2 sm:col-span-2 grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1">
            {label}
            <select
              value={country}
              onChange={(e) => setValue(field.id, e.target.value)}
              className="w-full h-11 px-4 rounded-xl border border-default bg-white/5 text-xs font-semibold text-[var(--text)] focus:outline-none focus:border-[var(--pri)] transition-all cursor-pointer"
            >
              <option value="" className="bg-[var(--surf)]">Select country</option>
              {Object.keys(COUNTRY_STATES).map((option) => (
                <option key={option} value={option} className="bg-[var(--surf)]">
                  {option}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <label className="text-[9px] font-black uppercase tracking-[0.2em] text-muted block mb-1.5">State / Province</label>
            <select
              value={formValues[`${field.id}_state`] || ""}
              onChange={(e) => setValue(`${field.id}_state`, e.target.value)}
              disabled={!country}
              className="w-full h-11 px-4 rounded-xl border border-default bg-white/5 text-xs font-semibold text-[var(--text)] focus:outline-none focus:border-[var(--pri)] transition-all cursor-pointer disabled:opacity-40"
            >
              <option value="" className="bg-[var(--surf)]">Select state</option>
              {(COUNTRY_STATES[country] || []).map((option) => (
                <option key={option} value={option} className="bg-[var(--surf)]">
                  {option}
                </option>
              ))}
            </select>
          </div>
        </div>
      );
    }

    if (field.type === "file" || field.type === "image") {
      return (
        <div key={field.id} className="space-y-1">
          {label}
          <div className="relative border border-dashed border-default hover:border-[var(--pri)]/55 rounded-xl p-3 transition-colors bg-white/5 cursor-pointer">
            <input
              type="file"
              accept={field.type === "image" ? "image/*" : undefined}
              onChange={(e) => handleFileUpload(field, e.target.files?.[0])}
              className="absolute inset-0 opacity-0 cursor-pointer"
            />
            <div className="flex items-center gap-2.5 justify-center py-1">
              <Upload className="h-4 w-4 text-muted" />
              <span className="text-xs font-bold text-[var(--text)] truncate max-w-[180px]">
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
        <Input
          type={
            field.type === "date"
              ? "date"
              : field.type === "email"
              ? "email"
              : field.type === "phone"
              ? "tel"
              : "text"
          }
          placeholder={field.placeholder || `Enter ${field.label.toLowerCase()}`}
          value={formValues[field.id] || ""}
          onChange={(e) => setValue(field.id, e.target.value)}
          className="h-11 bg-white/5 border-default rounded-xl px-4 font-semibold text-xs text-[var(--text)] focus:border-[var(--pri)] focus:ring-0 transition-all placeholder:text-muted/60"
        />
      </div>
    );
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-md">
          <motion.div
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.95, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="w-full max-w-3xl bg-[var(--surf)] border border-default rounded-[2.5rem] glass-3d shadow-2xl flex flex-col overflow-hidden max-h-[90vh]"
          >
            {/* Modal Header */}
            <div className="p-6 border-b border-default flex items-center justify-between shrink-0">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 bg-[var(--pri)]/10 rounded-xl flex items-center justify-center border border-[var(--pri)]/20">
                  <UserPlus className="h-5 w-5 text-[var(--pri)]" />
                </div>
                <div>
                  <h2 className="text-xl font-black tracking-tight text-[var(--text)]">Add New Participant</h2>
                  <p className="text-[9px] font-black uppercase tracking-[0.2em] text-muted mt-0.5">Event registration intake spooler</p>
                </div>
              </div>
              <button
                onClick={onClose}
                className="h-8 w-8 rounded-full bg-white/5 hover:bg-rose-500/10 hover:text-rose-400 border border-white/5 flex items-center justify-center text-muted transition-colors cursor-pointer"
              >
                <X className="h-4.5 w-4.5" />
              </button>
            </div>

            {/* Modal Tabs Selector */}
            <div className="px-6 py-4 border-b border-default bg-white/[0.01] flex justify-between items-center shrink-0">
              <div className="flex items-center rounded-xl border border-white/5 bg-white/5 p-1 gap-1">
                <button
                  onClick={() => setActiveTab("manual")}
                  className={`px-5 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all cursor-pointer ${
                    activeTab === "manual" ? "bg-[var(--pri)] text-white shadow" : "text-muted hover:text-[var(--text)]"
                  }`}
                >
                  Manual Form
                </button>
                <button
                  onClick={() => setActiveTab("excel")}
                  className={`px-5 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all cursor-pointer ${
                    activeTab === "excel" ? "bg-[var(--pri)] text-white shadow" : "text-muted hover:text-[var(--text)]"
                  }`}
                >
                  Excel Import
                </button>
              </div>

              {activeTab === "manual" && (
                <span className="text-[9px] font-black uppercase text-muted bg-white/5 border border-default px-3 py-1 rounded-full">
                  Fields mirrored from builder
                </span>
              )}
            </div>

            {/* Modal Body (Scrollable Content) */}
            <div className="flex-1 overflow-y-auto p-6 min-h-0 custom-scrollbar">
              {loading ? (
                <div className="py-20 flex flex-col items-center justify-center space-y-3">
                  <RefreshCw className="h-6 w-6 text-[var(--pri)] animate-spin" />
                  <p className="text-[10px] text-muted font-black uppercase tracking-widest">Loading intake schema...</p>
                </div>
              ) : activeTab === "manual" ? (
                <form onSubmit={handleSubmit} className="space-y-6">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                    {activeFields.map(renderField)}
                    <div className="space-y-1">
                      <label className="text-[9px] font-black uppercase tracking-[0.2em] text-muted block mb-1.5">Payment Status</label>
                      <select
                        value={formValues.paid_status || "Unpaid"}
                        onChange={(e) => setValue("paid_status", e.target.value)}
                        className="w-full h-11 px-4 rounded-xl border border-default bg-white/5 text-xs font-semibold text-[var(--text)] focus:outline-none focus:border-[var(--pri)] transition-all cursor-pointer"
                      >
                        <option value="Unpaid" className="bg-[var(--surf)]">Unpaid</option>
                        <option value="Paid" className="bg-[var(--surf)]">Paid</option>
                      </select>
                    </div>
                  </div>

                  <div className="pt-4 border-t border-default flex items-center justify-end gap-3">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={onClose}
                      className="h-11 px-6 rounded-full border border-default font-black uppercase tracking-wider text-[10px]"
                    >
                      Cancel
                    </Button>
                    <Button
                      type="submit"
                      disabled={submitting}
                      className="h-11 px-8 bg-[var(--pri)] hover:bg-[var(--sec)] text-white font-black uppercase tracking-widest text-[10px] rounded-full border-0 shadow-[0_10px_20px_color-mix(in_srgb,var(--pri)_25%,transparent)]"
                    >
                      <Save className="h-4 w-4 mr-2" />
                      {submitting ? "Registering..." : "Save Delegate"}
                    </Button>
                  </div>
                </form>
              ) : (
                <div className="space-y-6 max-w-xl mx-auto py-4">
                  <div className="space-y-3">
                    <p className="text-xs font-bold text-muted uppercase tracking-widest text-center">Excel Bulk Intake Spooler</p>
                    <p className="text-[10px] text-muted/80 text-center leading-relaxed">
                      Download the template file matching your active layout configurations. Fill in delegate rows and upload the spreadsheet back.
                    </p>
                  </div>

                  <Button
                    onClick={downloadTemplate}
                    className="w-full h-12 bg-white/5 hover:bg-white/10 text-[var(--text)] font-black uppercase tracking-widest text-[10px] rounded-2xl border border-default hover-lift-3d"
                  >
                    <Download className="h-4 w-4 mr-2" />
                    Download Excel Template
                  </Button>

                  <div className="relative border-2 border-dashed border-default hover:border-emerald-500/55 rounded-2xl p-10 transition-colors flex flex-col items-center justify-center bg-white/5 text-center cursor-pointer">
                    <input
                      type="file"
                      accept=".xlsx,.xlsm"
                      onChange={(e) => setImportFile(e.target.files?.[0] || null)}
                      className="absolute inset-0 opacity-0 cursor-pointer"
                    />
                    <FileSpreadsheet className="h-10 w-10 text-muted mb-3" />
                    <span className="text-xs font-black text-[var(--text)] uppercase tracking-wider">
                      {importFile ? importFile.name : "Choose completed spreadsheet"}
                    </span>
                    <span className="text-[8px] text-muted/65 font-bold mt-1 uppercase tracking-wider">
                      Drag & drop or browse .xlsx files
                    </span>
                  </div>

                  <div className="pt-4 border-t border-default flex items-center justify-end gap-3">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={onClose}
                      className="h-11 px-6 rounded-full border border-default font-black uppercase tracking-wider text-[10px]"
                    >
                      Cancel
                    </Button>
                    <Button
                      onClick={handleExcelImport}
                      disabled={importing || !importFile}
                      className="h-11 px-8 bg-emerald-500 hover:bg-emerald-600 text-white font-black uppercase tracking-widest text-[10px] rounded-full border-0 disabled:opacity-40"
                    >
                      {importing ? "Importing delegates..." : "Import delegates"}
                    </Button>
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
