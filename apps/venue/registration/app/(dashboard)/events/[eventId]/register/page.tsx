"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { Download, FileSpreadsheet, RefreshCw, Save, Upload, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { apiClient, apiGet, apiPost } from "@/lib/api-client";
import { toast } from "sonner";

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

const DEFAULT_FIELD_IDS = new Set(["name", "email", "phone", "company", "designation", "country", "role"]);

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

export default function ParticipantRegistrationPage() {
  const { eventId } = useParams();
  const [fields, setFields] = useState<FormField[]>([]);
  const [formValues, setFormValues] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importing, setImporting] = useState(false);

  const activeFields = useMemo(() => fields.filter(field => field.is_active), [fields]);

  const fetchConfig = async () => {
    setLoading(true);
    try {
      const [config, roles] = await Promise.all([
        apiGet<any>(`/events/${eventId}/registration/form-config?t=${Date.now()}`),
        apiGet<Role[]>(`/events/${eventId}/registration/roles`),
      ]);

      const activeRoles = (roles || []).filter(role => role.is_active).map(role => role.name);
      const configuredFields = (config.fields || []).map((field: FormField) => (
        field.id === "role" ? { ...field, options: activeRoles } : field
      ));
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
      toast.error(err.message || "Failed to load registration form.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (eventId) fetchConfig();
  }, [eventId]);

  const setValue = (id: string, value: any) => {
    setFormValues(prev => ({ ...prev, [id]: value }));
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

    activeFields.forEach(field => {
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
      const empty = value === undefined || value === null || value === "" || (Array.isArray(value) && value.length === 0);
      if (field.is_required && empty) {
        toast.error(`${field.label} is required.`);
        return;
      }
    }

    setSubmitting(true);
    try {
      await apiPost(`/events/${eventId}/participants`, buildPayload());
      toast.success("Participant registered successfully.");
      await fetchConfig();
    } catch (err: any) {
      toast.error(err.message || "Failed to register participant.");
    } finally {
      setSubmitting(false);
    }
  };

  const downloadTemplate = async () => {
    try {
      const token = getStoredToken();
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8002"}/api/v1/events/${eventId}/participants/import-template`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
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
    } catch (err: any) {
      toast.error(err.message || "Failed to import Excel file.");
    } finally {
      setImporting(false);
    }
  };

  const renderField = (field: FormField) => {
    const requiredMark = field.is_required ? <span className="text-rose-400">*</span> : null;
    const label = <label className="text-[9px] font-black uppercase tracking-[0.2em] text-muted">{field.label} {requiredMark}</label>;

    if (field.type === "select") {
      return (
        <div key={field.id} className="space-y-2">
          {label}
          <select value={formValues[field.id] || ""} onChange={e => setValue(field.id, e.target.value)} className="w-full h-12 px-4 rounded-2xl border border-default bg-white/5 text-xs font-bold text-[var(--text)] focus:outline-none focus:border-[var(--pri)] transition-all cursor-pointer">
            <option value="" className="bg-[var(--surf)]">Select option</option>
            {(field.options || []).map(option => <option key={option} value={option} className="bg-[var(--surf)]">{option}</option>)}
          </select>
        </div>
      );
    }

    if (field.type === "checkbox") {
      const selected = formValues[field.id] || [];
      return (
        <div key={field.id} className="space-y-2">
          {label}
          <div className="rounded-2xl border border-default bg-white/5 p-4 space-y-2">
            {(field.options || []).map(option => (
              <label key={option} className="flex items-center gap-2 text-xs font-bold text-[var(--text)]">
                <input
                  type="checkbox"
                  checked={selected.includes(option)}
                  onChange={(e) => setValue(field.id, e.target.checked ? [...selected, option] : selected.filter((item: string) => item !== option))}
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
        <div key={field.id} className="space-y-2">
          {label}
          <select value={country} onChange={e => setValue(field.id, e.target.value)} className="w-full h-12 px-4 rounded-2xl border border-default bg-white/5 text-xs font-bold text-[var(--text)] focus:outline-none focus:border-[var(--pri)] transition-all cursor-pointer">
            <option value="" className="bg-[var(--surf)]">Select country</option>
            {Object.keys(COUNTRY_STATES).map(option => <option key={option} value={option} className="bg-[var(--surf)]">{option}</option>)}
          </select>
          {country && (
            <select value={formValues[`${field.id}_state`] || ""} onChange={e => setValue(`${field.id}_state`, e.target.value)} className="w-full h-12 px-4 rounded-2xl border border-default bg-white/5 text-xs font-bold text-[var(--text)] focus:outline-none focus:border-[var(--pri)] transition-all cursor-pointer">
              <option value="" className="bg-[var(--surf)]">Select state / province</option>
              {(COUNTRY_STATES[country] || []).map(option => <option key={option} value={option} className="bg-[var(--surf)]">{option}</option>)}
            </select>
          )}
        </div>
      );
    }

    if (field.type === "file" || field.type === "image") {
      return (
        <div key={field.id} className="space-y-2">
          {label}
          <div className="relative border-2 border-dashed border-default hover:border-[var(--pri)]/55 rounded-2xl p-5 transition-colors bg-white/5">
            <input type="file" accept={field.type === "image" ? "image/*" : undefined} onChange={e => handleFileUpload(field, e.target.files?.[0])} className="absolute inset-0 opacity-0 cursor-pointer" />
            <div className="flex items-center gap-3">
              <Upload className="h-5 w-5 text-muted" />
              <span className="text-xs font-bold text-[var(--text)]">{formValues[field.id] ? "Uploaded" : "Choose file"}</span>
            </div>
          </div>
        </div>
      );
    }

    return (
      <div key={field.id} className="space-y-2">
        {label}
        <Input
          type={field.type === "date" ? "date" : field.type === "email" ? "email" : field.type === "phone" ? "tel" : "text"}
          placeholder={field.placeholder || `Enter ${field.label.toLowerCase()}`}
          value={formValues[field.id] || ""}
          onChange={e => setValue(field.id, e.target.value)}
          className="h-12 bg-white/5 border-default rounded-2xl px-4 font-bold text-xs text-[var(--text)] focus:border-[var(--pri)] focus:ring-0 transition-all placeholder:text-muted/65"
        />
      </div>
    );
  };

  return (
    <div className="space-y-8 p-6 max-w-6xl mx-auto">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <UserPlus className="h-5 w-5 text-[var(--pri)]" />
            <span className="text-[10px] font-black uppercase tracking-[0.3em] text-[var(--pri)]/85">Participant Registration</span>
          </div>
          <h1 className="text-3xl font-black tracking-tighter text-[var(--text)] mt-1 text-glow-indigo">Register Participants</h1>
          <p className="text-[10px] font-black uppercase tracking-[0.3em] text-muted mt-1">
            Manual intake and Excel import follow the current form builder layout.
          </p>
        </div>
        <Button onClick={fetchConfig} disabled={loading} className="h-12 px-7 bg-white/5 hover:bg-white/10 text-[var(--text)] font-black uppercase tracking-widest text-[11px] rounded-full border border-default hover-lift-3d self-start md:self-auto">
          <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
          Refresh Form
        </Button>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[1fr_360px] gap-8">
        <Card className="glass-3d p-8 rounded-[2rem] border-default bg-[color-mix(in_srgb,var(--text)_5%,transparent)]">
          <div className="flex items-center gap-4 mb-8">
            <div className="h-10 w-10 rounded-xl bg-[var(--pri)]/10 flex items-center justify-center border border-[var(--pri)]/20">
              <UserPlus className="h-5 w-5 text-[var(--pri)]" />
            </div>
            <div>
              <h2 className="text-xl font-black tracking-tighter text-[var(--text)]">Manual Registration</h2>
              <p className="text-[9px] font-black uppercase tracking-[0.2em] text-muted mt-0.5">Uses active fields from Form Builder.</p>
            </div>
          </div>

          {loading ? (
            <div className="py-16 text-center text-xs font-black uppercase tracking-widest text-muted">Loading form...</div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {activeFields.map(renderField)}
                <div className="space-y-2">
                  <label className="text-[9px] font-black uppercase tracking-[0.2em] text-muted">Payment Status</label>
                  <select value={formValues.paid_status || "Unpaid"} onChange={e => setValue("paid_status", e.target.value)} className="w-full h-12 px-4 rounded-2xl border border-default bg-white/5 text-xs font-bold text-[var(--text)] focus:outline-none focus:border-[var(--pri)] transition-all cursor-pointer">
                    <option value="Unpaid" className="bg-[var(--surf)]">Unpaid</option>
                    <option value="Paid" className="bg-[var(--surf)]">Paid</option>
                  </select>
                </div>
              </div>

              <Button type="submit" disabled={submitting} className="w-full h-12 bg-[var(--pri)] hover:bg-[var(--sec)] text-[var(--text)] font-black uppercase tracking-widest text-[11px] rounded-full shadow-[0_15px_30px_color-mix(in_srgb,var(--pri)_30%,transparent)] border-0 hover-lift-3d transition-all duration-300">
                <Save className="h-4 w-4 mr-2" />
                {submitting ? "Registering Participant..." : "Register Participant"}
              </Button>
            </form>
          )}
        </Card>

        <Card className="glass-3d p-6 rounded-[2rem] border-default bg-[color-mix(in_srgb,var(--text)_5%,transparent)] h-fit">
          <div className="flex items-center gap-3 mb-6">
            <div className="h-10 w-10 rounded-xl bg-emerald-500/10 flex items-center justify-center border border-emerald-500/20">
              <FileSpreadsheet className="h-5 w-5 text-emerald-500" />
            </div>
            <div>
              <h2 className="text-lg font-black tracking-tighter text-[var(--text)]">Bulk Import</h2>
              <p className="text-[9px] font-black uppercase tracking-[0.2em] text-muted">Excel template mirrors this form.</p>
            </div>
          </div>

          <div className="space-y-4">
            <Button onClick={downloadTemplate} className="w-full h-11 bg-white/5 hover:bg-white/10 text-[var(--text)] font-black uppercase tracking-widest text-[10px] rounded-full border border-default">
              <Download className="h-4 w-4 mr-2" />
              Download Excel Template
            </Button>

            <div className="relative border-2 border-dashed border-default hover:border-emerald-500/55 rounded-2xl p-8 transition-colors flex flex-col items-center justify-center bg-white/5 text-center">
              <input type="file" accept=".xlsx,.xlsm" onChange={e => setImportFile(e.target.files?.[0] || null)} className="absolute inset-0 opacity-0 cursor-pointer" />
              <Upload className="h-8 w-8 text-muted mb-3" />
              <span className="text-sm font-bold text-[var(--text)]">{importFile ? importFile.name : "Choose completed Excel file"}</span>
              <span className="text-[9px] text-muted font-bold mt-1 uppercase tracking-wider">Upload the generated template after filling participant rows.</span>
            </div>

            <Button onClick={handleExcelImport} disabled={importing || !importFile} className="w-full h-11 bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-400 font-black uppercase tracking-widest text-[10px] rounded-full border border-emerald-500/30 disabled:opacity-40">
              {importing ? "Importing..." : "Import Participants"}
            </Button>
          </div>
        </Card>
      </div>
    </div>
  );
}
