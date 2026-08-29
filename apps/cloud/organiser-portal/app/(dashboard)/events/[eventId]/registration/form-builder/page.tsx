"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { 
  ClipboardList, Plus, Trash2, Save, RefreshCw, 
  Eye, AlertCircle, X, UploadCloud, CheckCircle2,
  FileText, Check, ShieldCheck, HelpCircle, Layers, Globe
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { 
  OrganiserPage, 
  Panel, 
  MetricCard, 
  StatusBadge 
} from "@/components/organizer/workspace/OrganiserPrimitives";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { apiGet, apiPost } from "@/lib/api-client";
import { useEvent } from "@/hooks/useEvents";
import { Portal } from "@/components/ui/portal";
import { CountryStateEntry, fetchCountryStates, getAllowedCountries, getStatesForCountry } from "@/lib/country-states";
import { COUNTRY_DIAL_CODES, getDialCodeForCountry } from "@/lib/country-dial-codes";
import { CapabilityAction } from "@/lib/capabilities";
import { cn } from "@/lib/utils";

interface FormField {
  id: string;
  name: string;
  label: string;
  type: string; // text, date, select, checkbox, file, image, email, phone, country, state
  is_default: boolean;
  is_required: boolean;
  is_active: boolean;
  options?: string[];
  placeholder?: string;
}

const DEFAULT_FORM_FIELDS: FormField[] = [
  {
    id: "title",
    name: "title",
    label: "Title / Prefix",
    type: "select",
    is_default: true,
    is_required: false,
    is_active: true,
    placeholder: "Select title",
    options: ["Dr.", "Prof.", "Mr.", "Ms.", "Mrs."],
  },
  {
    id: "first_name",
    name: "first_name",
    label: "First Name",
    type: "text",
    is_default: true,
    is_required: true,
    is_active: true,
    placeholder: "Enter your first name",
  },
  {
    id: "last_name",
    name: "last_name",
    label: "Last Name",
    type: "text",
    is_default: true,
    is_required: true,
    is_active: true,
    placeholder: "Enter your last name",
  },
  {
    id: "email",
    name: "email",
    label: "Email Address",
    type: "email",
    is_default: true,
    is_required: true,
    is_active: true,
    placeholder: "Enter your email address",
  },
  {
    id: "phone",
    name: "phone",
    label: "Phone Number",
    type: "phone",
    is_default: true,
    is_required: true,
    is_active: true,
    placeholder: "Enter phone number",
  },
  {
    id: "company",
    name: "company",
    label: "Institution / Organization",
    type: "text",
    is_default: true,
    is_required: true,
    is_active: true,
    placeholder: "Enter institution, hospital, or organization",
  },
  {
    id: "designation",
    name: "designation",
    label: "Job Title / Designation",
    type: "text",
    is_default: true,
    is_required: true,
    is_active: true,
    placeholder: "Enter your job title or designation",
  },
  {
    id: "country",
    name: "country",
    label: "Country",
    type: "country",
    is_default: true,
    is_required: true,
    is_active: true,
    placeholder: "Select your country",
  },
  {
    id: "role",
    name: "role",
    label: "Registration Role / Category",
    type: "select",
    is_default: true,
    is_required: true,
    is_active: true,
    placeholder: "Select your role category",
    options: [],
  },
];

const REMOVED_DEFAULT_IDS = new Set(["council_number", "postal_code", "dietary_preference", "emergency_contact", "state", "city"]);

export default function RegistrationFormBuilder() {
  const params = useParams();
  const eventId = (params?.eventId as string) || "";
  const { data: event } = useEvent(eventId);
  
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewCountry, setPreviewCountry] = useState<Record<string, string>>({});
  const [countryStates, setCountryStates] = useState<CountryStateEntry[]>([]);
  const [countryPicker, setCountryPicker] = useState<Record<string, string>>({});
  
  const [fields, setFields] = useState<FormField[]>([]);
  const [isLive, setIsLive] = useState(true);
  const [termsAndConditions, setTermsAndConditions] = useState("");

  const getEffectiveFieldType = (field: FormField) => {
    if (field.id === "email") return "email";
    if (field.id === "phone") return "phone";
    if (field.id === "country") return "country";
    if (field.id === "role" || field.id === "title") return "select";
    return field.type;
  };

  const normalizeSystemField = (field: FormField): FormField => ({
    ...field,
    type: getEffectiveFieldType(field),
  });

  const fetchConfig = async () => {
    setLoading(true);
    try {
      const res = await apiGet<any>(`/events/${eventId}/registration/form-config?t=${Date.now()}`);
      
      let fetchedFields: FormField[] = res.fields && res.fields.length > 0 ? res.fields : DEFAULT_FORM_FIELDS;
      
      // Filter out legacy default fields that have been removed from system defaults
      fetchedFields = fetchedFields.filter(f => !(f.is_default && REMOVED_DEFAULT_IDS.has(f.id || f.name)));

      // Migrate old single 'name' field if present
      const hasNameField = fetchedFields.some((f: any) => f.id === "name");
      if (hasNameField) {
        const migrated: any[] = [];
        fetchedFields.forEach((f: any) => {
          if (f.id === "name") {
            migrated.push(
              {
                id: "first_name",
                name: "first_name",
                label: "First Name",
                type: "text",
                is_default: true,
                is_required: true,
                is_active: true,
                placeholder: "Enter your first name"
              },
              {
                id: "last_name",
                name: "last_name",
                label: "Last Name",
                type: "text",
                is_default: true,
                is_required: true,
                is_active: true,
                placeholder: "Enter your last name"
              }
            );
          } else {
            migrated.push(f);
          }
        });
        fetchedFields = migrated;
      }

      // Ensure all 11 clean default fields exist in the list
      const existingIds = new Set(fetchedFields.map(f => f.id || f.name));
      const missingDefaults = DEFAULT_FORM_FIELDS.filter(df => !existingIds.has(df.id) && !existingIds.has(df.name));
      if (missingDefaults.length > 0) {
        fetchedFields = [...fetchedFields, ...missingDefaults];
      }

      setFields(fetchedFields.map(normalizeSystemField));
      setIsLive(res.is_live !== undefined ? res.is_live : true);
      setTermsAndConditions(res.terms_and_conditions || "");
    } catch (err: any) {
      toast.error(err.message || "Failed to load form configuration.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (eventId) {
      fetchConfig();
    }
  }, [eventId]);

  useEffect(() => {
    fetchCountryStates().then(setCountryStates);
  }, []);

  const handleUpdateField = (id: string, updates: Partial<FormField>) => {
    setFields(prev => prev.map(f => f.id === id ? { ...f, ...updates } : f));
  };

  const handleAddCustomField = () => {
    const customId = `custom_${Math.random().toString(36).substring(2, 9)}`;
    const newField: FormField = {
      id: customId,
      name: customId,
      label: "New Custom Question",
      type: "text",
      is_default: false,
      is_required: false,
      is_active: true,
      placeholder: "Enter attendee answer..."
    };
    setFields(prev => [...prev, newField]);
    toast.success("Added new custom question. Configure its type and options below!");
  };

  const handleDeleteField = (id: string) => {
    setFields(prev => prev.filter(f => f.id !== id));
    toast.info("Custom question removed.");
  };

  const handleAddOption = (fieldId: string) => {
    setFields(prev => prev.map(f => {
      if (f.id === fieldId) {
        const currentOptions = f.options || [];
        return {
          ...f,
          options: [...currentOptions, `Option ${currentOptions.length + 1}`]
        };
      }
      return f;
    }));
  };

  const handleUpdateOption = (fieldId: string, optIndex: number, newVal: string) => {
    setFields(prev => prev.map(f => {
      if (f.id === fieldId && f.options) {
        const updated = [...f.options];
        updated[optIndex] = newVal;
        return { ...f, options: updated };
      }
      return f;
    }));
  };

  const handleRemoveOption = (fieldId: string, optIndex: number) => {
    setFields(prev => prev.map(f => {
      if (f.id === fieldId && f.options) {
        return {
          ...f,
          options: f.options.filter((_, idx) => idx !== optIndex)
        };
      }
      return f;
    }));
  };

  const handleAddAllowedCountry = (fieldId: string) => {
    const country = countryPicker[fieldId];
    if (!country) return;

    setFields(prev => prev.map(f => {
      if (f.id !== fieldId) return f;
      const currentOptions = f.options || [];
      if (currentOptions.includes(country)) return f;
      return { ...f, options: [...currentOptions, country] };
    }));
    setCountryPicker(prev => ({ ...prev, [fieldId]: "" }));
  };

  const handleRemoveAllowedCountry = (fieldId: string, country: string) => {
    setFields(prev => prev.map(f => (
      f.id === fieldId ? { ...f, options: (f.options || []).filter(c => c !== country) } : f
    )));
  };

  const getCountryChoices = (field: FormField) => getAllowedCountries(field.options, countryStates);

  const handleSaveConfig = async () => {
    const emptyLabels = fields.some(f => !f.label.trim());
    if (emptyLabels) {
      toast.error("All form fields must have a display label.");
      return;
    }

    setSaving(true);
    try {
      await apiPost(`/events/${eventId}/registration/form-config`, {
        fields,
        is_live: isLive,
        terms_and_conditions: termsAndConditions
      });
      toast.success("Registration form configuration saved and synchronized successfully!");
      fetchConfig();
    } catch (err: any) {
      toast.error(err.message || "Failed to save configuration.");
    } finally {
      setSaving(false);
    }
  };

  const defaultFieldsList = fields.filter(f => f.is_default);
  const customFieldsList = fields.filter(f => !f.is_default);
  const activeFieldsCount = fields.filter(f => f.is_active).length;

  return (
    <OrganiserPage
      title="Registration Form Builder"
      description={
        event 
          ? `Customize attendee questions, default identity fields, and submission requirements for ${event.name}.`
          : "Configure registration form questionnaire, attendee profile fields, and mandatory inputs."
      }
      actions={
        <div className="flex flex-wrap items-center gap-2">
          {/* Live / Draft Status Badge Button */}
          <button
            type="button"
            onClick={() => setIsLive(!isLive)}
            className={cn(
              "h-8 px-3 rounded-full text-xs font-semibold transition-all flex items-center gap-2 border cursor-pointer",
              isLive
                ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-500 hover:bg-emerald-500/20"
                : "bg-amber-500/10 border-amber-500/30 text-amber-500 hover:bg-amber-500/20"
            )}
          >
            <span className={cn("size-2 rounded-full", isLive ? "bg-emerald-500 animate-ping" : "bg-amber-500")} />
            {isLive ? "Registration Live" : "Draft Mode"}
          </button>

          <Button
            size="sm"
            variant="outline"
            onClick={() => setPreviewOpen(true)}
            disabled={loading || saving || fields.length === 0}
            className="h-8 text-xs font-semibold gap-1.5 border-[var(--border-default)] cursor-pointer"
          >
            <Eye className="size-3.5 text-[var(--pri)]" />
            Preview Form
          </Button>

          <Button
            size="sm"
            variant="outline"
            onClick={fetchConfig}
            disabled={loading || saving}
            className="h-8 text-xs font-semibold gap-1.5 border-[var(--border-default)] cursor-pointer"
          >
            <RefreshCw className={cn("size-3.5", loading && "animate-spin")} />
            Sync
          </Button>

          <CapabilityAction operation="registration.forms.manage">
            <Button
              size="sm"
              onClick={handleSaveConfig}
              disabled={loading || saving}
              className="h-8 text-xs font-bold gap-1.5 bg-[var(--pri)] text-[var(--primary-contrast)] hover:opacity-90 shadow-sm cursor-pointer"
            >
              <Save className="size-3.5" />
              {saving ? "Saving..." : "Save Layout"}
            </Button>
          </CapabilityAction>
        </div>
      }
    >
      {/* Metric Summary Cards */}
      <div className="op-metric-grid">
        <MetricCard
          label="Form Status"
          value={isLive ? "Live" : "Draft"}
          hint={isLive ? "Accepting public submissions" : "Form offline (hidden from public)"}
          tone={isLive ? "emerald" : "amber"}
          icon={<CheckCircle2 className="size-5 text-[var(--pri)]" />}
        />
        <MetricCard
          label="Total Fields"
          value={fields.length.toString()}
          hint="Total inputs in questionnaire"
          tone="purple"
          icon={<ClipboardList className="size-5 text-[var(--pri)]" />}
        />
        <MetricCard
          label="Active Fields"
          value={activeFieldsCount.toString()}
          hint="Visible to attendees on portal"
          tone="blue"
          icon={<Check className="size-5 text-[var(--pri)]" />}
        />
        <MetricCard
          label="Custom Questions"
          value={customFieldsList.length.toString()}
          hint="Event-specific custom fields"
          tone="cyan"
          icon={<Plus className="size-5 text-[var(--pri)]" />}
        />
      </div>

      {loading ? (
        <Panel className="p-12 flex flex-col items-center justify-center space-y-3 text-center">
          <RefreshCw className="size-7 text-[var(--pri)] animate-spin" />
          <p className="text-xs font-bold text-[var(--text-secondary)] uppercase tracking-wider">
            Loading Form Configuration...
          </p>
        </Panel>
      ) : (
        <div className="space-y-6">
          {/* Section 1: Core Attendee Identity Fields */}
          <Panel
            title="Core Attendee Identity Fields"
            action={
              <Badge variant="outline" className="text-[10px] font-mono border-[var(--border-subtle)] text-[var(--text-tertiary)]">
                {defaultFieldsList.length} Core System Fields
              </Badge>
            }
          >
            <div className="space-y-4">
              <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
                Essential identity and contact fields. First Name, Last Name, and Email are mandatory core identity fields.
              </p>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
                {defaultFieldsList.map((field) => {
                  const isCore = field.id === "first_name" || field.id === "last_name" || field.id === "email";
                  const fieldType = getEffectiveFieldType(field);
                  const isCountry = fieldType === "country";

                  return (
                    <div
                      key={field.id}
                      className={cn(
                        "p-4 rounded-xl border transition-all space-y-3 bg-[var(--bg-surface-2)]/60",
                        isCountry && "md:col-span-2 lg:col-span-2",
                        field.is_active 
                          ? "border-[var(--border-subtle)] hover:border-[var(--pri)]/40" 
                          : "border-[var(--border-subtle)]/60 opacity-60"
                      )}
                    >
                      {/* Top metadata & Toggles */}
                      <div className="flex items-start justify-between gap-2">
                        <div className="space-y-1 min-w-0">
                          <span className="text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-[var(--pri)]/10 text-[var(--pri)]">
                            {fieldType === "select" ? "Category (Dropdown)" : fieldType === "email" ? "Email Address" : fieldType === "phone" ? "Phone Number" : fieldType === "country" ? "Country & State Select" : "Text Input"}
                          </span>
                          <p className="text-[10px] text-[var(--text-tertiary)] font-mono truncate mt-1">
                            Column: {field.name}
                          </p>
                        </div>

                        <div className="flex items-center gap-3 shrink-0">
                          {/* Active Switch */}
                          <div className="flex flex-col items-center">
                            <span className="text-[9px] font-bold text-[var(--text-tertiary)] uppercase">Active</span>
                            <button
                              type="button"
                              disabled={isCore}
                              onClick={() => handleUpdateField(field.id, { is_active: !field.is_active })}
                              className={cn(
                                "relative inline-flex h-4 w-7 shrink-0 cursor-pointer rounded-full transition-colors mt-0.5 border",
                                field.is_active ? "bg-emerald-600 border-emerald-600" : "bg-[var(--bg-surface-3)] border-[var(--border-default)]",
                                isCore && "opacity-50 cursor-not-allowed"
                              )}
                            >
                              <span
                                className={cn(
                                  "pointer-events-none inline-block h-3 w-3 transform rounded-full transition shadow-xs",
                                  field.is_active ? "translate-x-3 bg-white" : "translate-x-0 bg-[var(--text-secondary)]"
                                )}
                              />
                            </button>
                          </div>

                          {/* Required Switch */}
                          <div className="flex flex-col items-center">
                            <span className="text-[9px] font-bold text-[var(--text-tertiary)] uppercase">Req</span>
                            <button
                              type="button"
                              disabled={isCore}
                              onClick={() => handleUpdateField(field.id, { is_required: !field.is_required })}
                              className={cn(
                                "relative inline-flex h-4 w-7 shrink-0 cursor-pointer rounded-full transition-colors mt-0.5 border",
                                field.is_required ? "bg-[var(--pri)] border-[var(--pri)]" : "bg-[var(--bg-surface-3)] border-[var(--border-default)]",
                                isCore && "opacity-50 cursor-not-allowed"
                              )}
                            >
                              <span
                                className={cn(
                                  "pointer-events-none inline-block h-3 w-3 transform rounded-full transition shadow-xs",
                                  field.is_required ? "translate-x-3 bg-[var(--primary-contrast)]" : "translate-x-0 bg-[var(--text-secondary)]"
                                )}
                              />
                            </button>
                          </div>
                        </div>
                      </div>

                      {/* Display Label Input */}
                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-[var(--text-secondary)] uppercase tracking-wider">
                          Display Label
                        </label>
                        <Input
                          type="text"
                          value={field.label}
                          onChange={(e) => handleUpdateField(field.id, { label: e.target.value })}
                          className="h-8 text-xs font-medium bg-[var(--bg-surface)] border-[var(--border-subtle)] rounded-lg"
                        />
                      </div>

                      {/* Country & State Note */}
                      {fieldType === "country" && (
                        <p className="text-[10px] text-[var(--text-tertiary)] italic leading-tight">
                          Includes integrated cascading State / Province selector. Country and State are recorded directly to the attendee database.
                        </p>
                      )}

                      {/* Allowed Countries restriction (Clean flexbox layout without overlap) */}
                      {fieldType === "country" && (
                        <div className="pt-2.5 border-t border-[var(--border-subtle)] space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] font-bold text-[var(--text-secondary)] uppercase tracking-wider">
                              Country Restrictions
                            </span>
                            <span className="text-[10px] text-[var(--text-tertiary)] font-mono">
                              {(field.options || []).length === 0 ? "Global (All Allowed)" : `${field.options?.length} Restricted`}
                            </span>
                          </div>
                          
                          <div className="flex items-center gap-2">
                            <select
                              value={countryPicker[field.id] || ""}
                              onChange={(e) => setCountryPicker(prev => ({ ...prev, [field.id]: e.target.value }))}
                              className="h-8 min-w-0 flex-1 bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-lg px-2.5 text-xs text-[var(--text-primary)] cursor-pointer truncate focus:border-[var(--pri)]"
                            >
                              <option value="">Choose country to allow...</option>
                              {countryStates
                                .filter(entry => !(field.options || []).includes(entry.country))
                                .map(entry => (
                                  <option key={entry.country} value={entry.country}>{entry.country}</option>
                                ))}
                            </select>
                            <Button
                              type="button"
                              size="sm"
                              onClick={() => handleAddAllowedCountry(field.id)}
                              className="h-8 px-3 text-xs font-bold shrink-0 bg-[var(--pri)] text-[var(--primary-contrast)] hover:opacity-90 cursor-pointer"
                            >
                              <Plus className="size-3 mr-1" />
                              Add Country
                            </Button>
                          </div>

                          {(field.options || []).length > 0 && (
                            <div className="flex flex-wrap gap-1.5 pt-1 max-h-24 overflow-y-auto">
                              {(field.options || []).map(country => (
                                <span
                                  key={country}
                                  className="inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-xs font-medium bg-[var(--pri)]/10 text-[var(--pri)] border border-[var(--pri)]/20"
                                >
                                  {country}
                                  <button
                                    type="button"
                                    onClick={() => handleRemoveAllowedCountry(field.id, country)}
                                    className="size-3.5 rounded hover:bg-rose-500/20 hover:text-rose-400 flex items-center justify-center cursor-pointer transition"
                                  >
                                    <X className="size-3" />
                                  </button>
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </Panel>

          {/* Section 2: Custom Form Questions */}
          <Panel
            title="Custom Form Questions"
            action={
              <Button
                size="sm"
                onClick={handleAddCustomField}
                className="h-8 text-xs font-bold gap-1.5 bg-[var(--pri)] text-[var(--primary-contrast)] hover:opacity-90 shadow-sm cursor-pointer"
              >
                <Plus className="size-3.5" />
                Add Question
              </Button>
            }
          >
            {customFieldsList.length === 0 ? (
              <div className="p-8 border border-dashed border-[var(--border-subtle)] rounded-xl flex flex-col items-center justify-center text-center space-y-2.5">
                <ClipboardList className="size-8 text-[var(--pri)]/60" />
                <h4 className="text-xs font-bold uppercase tracking-wider text-[var(--text-primary)]">
                  No Custom Questions Added
                </h4>
                <p className="text-xs text-[var(--text-secondary)] max-w-md">
                  Collect dietary preferences, medical registration numbers, file uploads, or survey questions from attendees during checkout.
                </p>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleAddCustomField}
                  className="h-8 text-xs font-semibold gap-1.5 mt-2 border-[var(--border-default)]"
                >
                  <Plus className="size-3.5 text-[var(--pri)]" />
                  Create First Question
                </Button>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {customFieldsList.map((field, index) => {
                  const fieldType = getEffectiveFieldType(field);

                  return (
                    <div
                      key={field.id}
                      className="p-4 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface-2)]/60 hover:border-[var(--pri)]/40 transition-all space-y-3.5"
                    >
                      {/* Top Header */}
                      <div className="flex items-center justify-between gap-3 border-b border-[var(--border-subtle)] pb-2.5">
                        <div className="flex items-center gap-2">
                          <span className="size-5 rounded-full bg-[var(--pri)]/10 text-[var(--pri)] text-[10px] font-bold flex items-center justify-center">
                            {index + 1}
                          </span>
                          <span className="text-xs font-bold text-[var(--text-primary)]">Question #{index + 1}</span>
                        </div>

                        <div className="flex items-center gap-3">
                          {/* Required Switch */}
                          <div className="flex items-center gap-1.5">
                            <span className="text-[9px] font-bold text-[var(--text-tertiary)] uppercase">Required</span>
                            <button
                              type="button"
                              onClick={() => handleUpdateField(field.id, { is_required: !field.is_required })}
                              className={cn(
                                "relative inline-flex h-4 w-7 shrink-0 cursor-pointer rounded-full transition-colors border",
                                field.is_required ? "bg-[var(--pri)] border-[var(--pri)]" : "bg-[var(--bg-surface-3)] border-[var(--border-default)]"
                              )}
                            >
                              <span
                                className={cn(
                                  "pointer-events-none inline-block h-3 w-3 transform rounded-full transition shadow-xs",
                                  field.is_required ? "translate-x-3 bg-[var(--primary-contrast)]" : "translate-x-0 bg-[var(--text-secondary)]"
                                )}
                              />
                            </button>
                          </div>

                          {/* Delete Question Button */}
                          <button
                            type="button"
                            onClick={() => handleDeleteField(field.id)}
                            className="size-7 rounded-md border border-[var(--border-subtle)] hover:border-rose-500/30 hover:bg-rose-500/10 text-[var(--text-tertiary)] hover:text-rose-500 flex items-center justify-center transition cursor-pointer"
                          >
                            <Trash2 className="size-3.5" />
                          </button>
                        </div>
                      </div>

                      {/* Question Label & Type */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div className="space-y-1">
                          <label className="text-[10px] font-bold text-[var(--text-secondary)] uppercase tracking-wider">
                            Question / Label
                          </label>
                          <Input
                            type="text"
                            value={field.label}
                            onChange={(e) => handleUpdateField(field.id, { label: e.target.value })}
                            className="h-8 text-xs font-medium bg-[var(--bg-surface)] border-[var(--border-subtle)] rounded-lg"
                            placeholder="e.g. Dietary Restrictions"
                          />
                        </div>

                        <div className="space-y-1">
                          <label className="text-[10px] font-bold text-[var(--text-secondary)] uppercase tracking-wider">
                            Input Type
                          </label>
                          <select
                            value={fieldType}
                            onChange={(e) => handleUpdateField(field.id, { type: e.target.value, options: e.target.value === "select" || e.target.value === "checkbox" || e.target.value === "country" ? [] : undefined })}
                            className="h-8 w-full text-xs font-medium bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-lg px-2 text-[var(--text-primary)] cursor-pointer"
                          >
                            <option value="text">Short Answer (Text)</option>
                            <option value="email">Email Address</option>
                            <option value="phone">Phone Number</option>
                            <option value="country">Country & State Selector</option>
                            <option value="date">Date Selector</option>
                            <option value="select">Dropdown Menu</option>
                            <option value="checkbox">Checkbox List</option>
                            <option value="image">Photo / Image Upload</option>
                            <option value="file">Document / PDF Upload</option>
                          </select>
                        </div>
                      </div>

                      {/* Placeholder Input */}
                      {fieldType !== "image" && fieldType !== "file" && fieldType !== "date" && (
                        <div className="space-y-1">
                          <label className="text-[10px] font-bold text-[var(--text-secondary)] uppercase tracking-wider">
                            Input Placeholder / Hint
                          </label>
                          <Input
                            type="text"
                            value={field.placeholder || ""}
                            onChange={(e) => handleUpdateField(field.id, { placeholder: e.target.value })}
                            className="h-8 text-xs font-medium bg-[var(--bg-surface)] border-[var(--border-subtle)] rounded-lg"
                            placeholder="Enter hint text for attendee..."
                          />
                        </div>
                      )}

                      {/* Country restriction for custom country question */}
                      {fieldType === "country" && (
                        <div className="pt-2.5 border-t border-[var(--border-subtle)] space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] font-bold text-[var(--text-secondary)] uppercase tracking-wider">
                              Country Restrictions
                            </span>
                            <span className="text-[10px] text-[var(--text-tertiary)] font-mono">
                              {(field.options || []).length === 0 ? "Global (All Allowed)" : `${field.options?.length} Restricted`}
                            </span>
                          </div>
                          
                          <div className="flex items-center gap-2">
                            <select
                              value={countryPicker[field.id] || ""}
                              onChange={(e) => setCountryPicker(prev => ({ ...prev, [field.id]: e.target.value }))}
                              className="h-8 min-w-0 flex-1 bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-lg px-2.5 text-xs text-[var(--text-primary)] cursor-pointer truncate focus:border-[var(--pri)]"
                            >
                              <option value="">Choose country to allow...</option>
                              {countryStates
                                .filter(entry => !(field.options || []).includes(entry.country))
                                .map(entry => (
                                  <option key={entry.country} value={entry.country}>{entry.country}</option>
                                ))}
                            </select>
                            <Button
                              type="button"
                              size="sm"
                              onClick={() => handleAddAllowedCountry(field.id)}
                              className="h-8 px-3 text-xs font-bold shrink-0 bg-[var(--pri)] text-[var(--primary-contrast)] hover:opacity-90 cursor-pointer"
                            >
                              <Plus className="size-3 mr-1" />
                              Add Country
                            </Button>
                          </div>

                          {(field.options || []).length > 0 && (
                            <div className="flex flex-wrap gap-1.5 pt-1 max-h-24 overflow-y-auto">
                              {(field.options || []).map(country => (
                                <span
                                  key={country}
                                  className="inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-xs font-medium bg-[var(--pri)]/10 text-[var(--pri)] border border-[var(--pri)]/20"
                                >
                                  {country}
                                  <button
                                    type="button"
                                    onClick={() => handleRemoveAllowedCountry(field.id, country)}
                                    className="size-3.5 rounded hover:bg-rose-500/20 hover:text-rose-400 flex items-center justify-center cursor-pointer transition"
                                  >
                                    <X className="size-3" />
                                  </button>
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      )}

                      {/* Dropdown / Checkbox Options Manager */}
                      {(fieldType === "select" || fieldType === "checkbox") && (
                        <div className="p-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] space-y-2.5">
                          <div className="flex items-center justify-between">
                            <span className="text-[9px] font-bold text-[var(--text-secondary)] uppercase tracking-wider">
                              Options & Choices
                            </span>
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              onClick={() => handleAddOption(field.id)}
                              className="h-6 px-2 text-[9px] font-bold text-[var(--pri)] border-[var(--border-subtle)]"
                            >
                              <Plus className="size-2.5 mr-0.5" />
                              Add Option
                            </Button>
                          </div>

                          {(field.options || []).length === 0 ? (
                            <p className="text-[10px] text-[var(--text-tertiary)] italic">Add choice options for this question.</p>
                          ) : (
                            <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1">
                              {(field.options || []).map((opt, optIndex) => (
                                <div key={optIndex} className="flex items-center gap-1.5">
                                  <Input
                                    type="text"
                                    value={opt}
                                    onChange={(e) => handleUpdateOption(field.id, optIndex, e.target.value)}
                                    className="h-7 text-xs bg-[var(--bg-surface-2)] border-[var(--border-subtle)] rounded-md px-2"
                                    placeholder={`Choice ${optIndex + 1}`}
                                  />
                                  <button
                                    type="button"
                                    onClick={() => handleRemoveOption(field.id, optIndex)}
                                    className="size-7 rounded-md hover:bg-rose-500/10 text-[var(--text-tertiary)] hover:text-rose-500 flex items-center justify-center shrink-0 cursor-pointer"
                                  >
                                    <Trash2 className="size-3" />
                                  </button>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </Panel>

          {/* Section 3: Terms & Conditions and Policies */}
          <Panel
            title="Terms & Conditions and Policy"
          >
            <div className="space-y-3">
              <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
                Legal disclaimer, consent terms, and refund policy displayed at the bottom of the registration form.
              </p>
              <Textarea
                value={termsAndConditions}
                onChange={(e) => setTermsAndConditions(e.target.value)}
                placeholder="Enter Terms & Conditions markdown (e.g. ## Terms & Conditions\n1. Registration is non-refundable...)"
                rows={5}
                className="font-mono text-xs leading-relaxed"
              />
              <p className="text-[10px] text-[var(--text-tertiary)]">
                Supports Markdown syntax (`## Heading`, `*bullet point*`, `**bold text**`, `[link](url)`).
              </p>
            </div>
          </Panel>
        </div>
      )}

      {/* Live Portal Preview Modal */}
      {previewOpen && (
        <Portal>
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-in fade-in duration-200">
            <div className="relative w-full max-w-xl bg-[var(--bg-surface)] border border-[var(--border-default)] rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
              {/* Header */}
              <div className="px-5 py-3.5 border-b border-[var(--border-subtle)] flex items-center justify-between bg-[var(--bg-surface-2)]/60">
                <div className="flex items-center gap-2">
                  <Eye className="size-4 text-[var(--pri)]" />
                  <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--text-primary)]">
                    Registration Portal Preview
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => setPreviewOpen(false)}
                  className="size-7 rounded-md hover:bg-[var(--bg-surface-3)] flex items-center justify-center text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition"
                >
                  <X className="size-4" />
                </button>
              </div>

              {/* Body */}
              <div className="p-6 overflow-y-auto space-y-5 flex-1 text-left">
                <div className="text-center pb-3 border-b border-[var(--border-subtle)] space-y-1">
                  <h2 className="text-base font-bold text-[var(--text-primary)]">
                    {event?.name || "Event Registration"}
                  </h2>
                  <p className="text-xs text-[var(--text-secondary)]">Attendee Registration Form Mockup</p>
                </div>

                <form className="space-y-3.5" onSubmit={(e) => e.preventDefault()}>
                  {fields
                    .filter(f => f.is_active)
                    .map(f => {
                      const fieldType = getEffectiveFieldType(f);

                      return (
                        <div key={f.id} className="space-y-1">
                          <label className="text-[11px] font-bold text-[var(--text-primary)] flex items-center gap-1">
                            {f.label}
                            {f.is_required && <span className="text-rose-500 font-bold">*</span>}
                          </label>

                          {fieldType === "select" ? (
                            <select className="h-9 w-full bg-[var(--bg-surface-2)] border border-[var(--border-subtle)] rounded-lg px-3 text-xs text-[var(--text-primary)] cursor-pointer">
                              <option value="">Select option...</option>
                              {f.id === "role" ? (
                                <>
                                  <option value="Delegate">Delegate</option>
                                  <option value="Speaker">Speaker</option>
                                  <option value="VIP Guest">VIP Guest</option>
                                  <option value="Student Delegate">Student Delegate</option>
                                </>
                              ) : (
                                (f.options || []).map((o, idx) => (
                                  <option key={idx} value={o}>{o}</option>
                                ))
                              )}
                            </select>
                          ) : fieldType === "checkbox" ? (
                            <div className="space-y-1.5 p-3 rounded-lg bg-[var(--bg-surface-2)] border border-[var(--border-subtle)]">
                              {(f.options || []).map((o, idx) => (
                                <label key={idx} className="flex items-center gap-2 text-xs text-[var(--text-secondary)] cursor-pointer">
                                  <input type="checkbox" className="rounded border-[var(--border-subtle)] text-[var(--pri)]" />
                                  {o}
                                </label>
                              ))}
                            </div>
                          ) : fieldType === "date" ? (
                            <input type="date" className="h-9 w-full bg-[var(--bg-surface-2)] border border-[var(--border-subtle)] rounded-lg px-3 text-xs text-[var(--text-primary)]" />
                          ) : fieldType === "file" || fieldType === "image" ? (
                            <div className="border border-dashed border-[var(--border-subtle)] rounded-lg p-3.5 flex flex-col items-center justify-center text-center cursor-pointer hover:border-[var(--pri)]/50 transition">
                              <UploadCloud className="size-4 text-[var(--text-tertiary)] mb-1" />
                              <span className="text-[10px] font-medium text-[var(--text-secondary)]">
                                Choose file or drag & drop here
                              </span>
                            </div>
                          ) : fieldType === "country" ? (
                            (() => {
                              const countries = getCountryChoices(f);
                              const selectedCountry = previewCountry[f.id] || (countries.length === 1 ? countries[0] : "");
                              const states = getStatesForCountry(countryStates, selectedCountry);

                              return (
                                <div className="space-y-2">
                                  {countries.length === 1 ? (
                                    <select
                                      disabled
                                      value={countries[0]}
                                      className="h-9 w-full bg-[var(--bg-surface-2)] border border-[var(--border-subtle)] rounded-lg px-3 text-xs text-[var(--text-primary)] cursor-not-allowed opacity-90"
                                    >
                                      <option value={countries[0]}>{countries[0]}</option>
                                    </select>
                                  ) : (
                                    <select
                                      value={selectedCountry}
                                      onChange={(e) => setPreviewCountry(prev => ({ ...prev, [f.id]: e.target.value }))}
                                      className="h-9 w-full bg-[var(--bg-surface-2)] border border-[var(--border-subtle)] rounded-lg px-3 text-xs text-[var(--text-primary)] cursor-pointer"
                                    >
                                      <option value="">Select Country...</option>
                                      {countries.map(country => (
                                        <option key={country} value={country}>{country}</option>
                                      ))}
                                    </select>
                                  )}

                                  {selectedCountry && (
                                    <div className="space-y-1 pt-1">
                                      <label className="text-[11px] font-bold text-[var(--text-primary)] flex items-center gap-1">
                                        State / Province
                                        {f.is_required && <span className="text-rose-500 font-bold">*</span>}
                                      </label>
                                      {states.length ? (
                                        <select
                                          className="h-9 w-full bg-[var(--bg-surface-2)] border border-[var(--border-subtle)] rounded-lg px-3 text-xs text-[var(--text-primary)] cursor-pointer"
                                        >
                                          <option value="">Select State / Province...</option>
                                          {states.map(state => (
                                            <option key={state} value={state}>{state}</option>
                                          ))}
                                        </select>
                                      ) : (
                                        <Input
                                          type="text"
                                          placeholder="Enter state / province"
                                          className="h-9 bg-[var(--bg-surface-2)] border-[var(--border-subtle)] rounded-lg text-xs"
                                        />
                                      )}
                                    </div>
                                  )}
                                </div>
                              );
                            })()
                          ) : fieldType === "phone" || f.id === "phone" ? (
                            <div className="flex gap-1.5">
                              <select
                                defaultValue="+91"
                                className="h-9 w-28 shrink-0 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface-2)] px-2 text-xs font-mono text-[var(--text-primary)] cursor-pointer"
                              >
                                {COUNTRY_DIAL_CODES.map((c) => (
                                  <option key={`${c.code}-${c.dial_code}`} value={c.dial_code}>
                                    {c.flag} {c.dial_code}
                                  </option>
                                ))}
                              </select>
                              <Input
                                type="tel"
                                placeholder={f.placeholder || "Enter phone / WhatsApp number"}
                                className="h-9 flex-1 bg-[var(--bg-surface-2)] border-[var(--border-subtle)] rounded-lg text-xs"
                              />
                            </div>
                          ) : (
                            <Input
                              type={fieldType === "email" ? "email" : "text"}
                              placeholder={f.placeholder || `Enter ${f.label.toLowerCase()}`}
                              className="h-9 bg-[var(--bg-surface-2)] border-[var(--border-subtle)] rounded-lg text-xs"
                            />
                          )}
                        </div>
                      );
                    })}

                  {/* Terms & Conditions preview */}
                  <div className="pt-3 border-t border-[var(--border-subtle)] space-y-2">
                    <span className="text-[11px] font-bold text-[var(--text-primary)]">Terms &amp; Conditions</span>
                    <div className="p-3 rounded-lg bg-[var(--bg-surface-2)] border border-[var(--border-subtle)] max-h-28 overflow-y-auto text-xs text-[var(--text-secondary)] leading-relaxed">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>
                        {termsAndConditions || "## Terms & Conditions\n\n1. Registration is non-transferable and non-refundable.\n2. Attendees must adhere to the Event Code of Conduct.\n3. The organizers reserve the right to modify the schedule."}
                      </ReactMarkdown>
                    </div>
                    <label className="flex items-start gap-2 cursor-pointer select-none text-[11px] text-[var(--text-secondary)] font-medium">
                      <input type="checkbox" disabled className="mt-0.5 rounded border-[var(--border-subtle)] text-[var(--pri)]" checked={true} readOnly />
                      <span>
                        I have read and agree to the terms and conditions. <span className="text-rose-500 font-bold">*</span>
                      </span>
                    </label>
                  </div>

                  <Button
                    type="button"
                    className="w-full h-10 bg-[var(--pri)] text-[var(--primary-contrast)] font-bold text-xs rounded-xl shadow-sm mt-4"
                  >
                    Submit Registration
                  </Button>
                </form>
              </div>

              {/* Footer */}
              <div className="px-5 py-3 border-t border-[var(--border-subtle)] bg-[var(--bg-surface-2)]/60 flex items-center justify-end">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setPreviewOpen(false)}
                  className="h-8 text-xs font-semibold"
                >
                  Close Preview
                </Button>
              </div>
            </div>
          </div>
        </Portal>
      )}
    </OrganiserPage>
  );
}
