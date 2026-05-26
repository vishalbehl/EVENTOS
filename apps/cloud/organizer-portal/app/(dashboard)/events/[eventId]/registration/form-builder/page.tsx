"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { 
  ClipboardList, Plus, Trash2, Save, Sparkles, RefreshCw, 
  Settings2, HelpCircle, Eye, AlertCircle, Edit3, GripVertical,
  X, UploadCloud, FileText, Code2, SplitSquareHorizontal
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";
import { apiGet, apiPost } from "@/lib/api-client";
import { Portal } from "@/components/ui/portal";
import { CountryStateEntry, fetchCountryStates, getAllowedCountries, getStatesForCountry } from "@/lib/country-states";

interface FormField {
  id: string;
  name: string;
  label: string;
  type: string; // text, date, select, checkbox, file, image
  is_default: boolean;
  is_required: boolean;
  is_active: boolean;
  options?: string[];
  placeholder?: string;
}

export default function RegistrationFormBuilder() {
  const { eventId } = useParams();
  
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewCountry, setPreviewCountry] = useState<Record<string, string>>({});
  const [countryStates, setCountryStates] = useState<CountryStateEntry[]>([]);
  const [countryPicker, setCountryPicker] = useState<Record<string, string>>({});
  
  const [fields, setFields] = useState<FormField[]>([]);
  const [isLive, setIsLive] = useState(false);
  const [termsAndConditions, setTermsAndConditions] = useState("");
  const [tcViewMode, setTcViewMode] = useState<"edit" | "preview" | "split">("split");
  const [tcPreviewOpen, setTcPreviewOpen] = useState(false);

  const getEffectiveFieldType = (field: FormField) => {
    if (field.id === "email") return "email";
    if (field.id === "phone") return "phone";
    if (field.id === "country") return "country";
    if (field.id === "role") return "select";
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
      setFields((res.fields || []).map(normalizeSystemField));
      setIsLive(res.is_live || false);
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
      label: "New Custom Field",
      type: "text",
      is_default: false,
      is_required: false,
      is_active: true,
      placeholder: "Enter value"
    };
    setFields(prev => [...prev, newField]);
    toast.success("Added new custom field card. Customize it below!");
  };

  const handleDeleteField = (id: string) => {
    setFields(prev => prev.filter(f => f.id !== id));
    toast.info("Field removed.");
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
    // Basic validation
    const emptyLabels = fields.some(f => !f.label.trim());
    if (emptyLabels) {
      toast.error("All form fields must have a label.");
      return;
    }

    setSaving(true);
    try {
      await apiPost(`/events/${eventId}/registration/form-config`, {
        fields,
        terms_and_conditions: termsAndConditions
      });
      toast.success("Registration form configuration saved successfully!");
      fetchConfig();
    } catch (err: any) {
      toast.error(err.message || "Failed to save configuration.");
    } finally {
      setSaving(false);
    }
  };

  const defaultFieldsList = fields.filter(f => f.is_default);
  const customFieldsList = fields.filter(f => !f.is_default);

  return (
    <div className="space-y-8 p-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <ClipboardList className="h-5 w-5 text-[var(--pri)] animate-pulse" />
            <span className="text-[10px] font-black uppercase tracking-[0.3em] text-[var(--pri)]/80">FORM CONFIGURATION</span>
          </div>
          <h1 className="text-3xl font-black tracking-tighter text-[var(--text)] mt-1 text-glow-indigo">Form Builder</h1>
          <p className="text-[10px] font-black uppercase tracking-[0.3em] text-muted mt-1">
            Toggle default fields, configure custom questionnaire inputs, and build your form.
          </p>
        </div>

        <div className="flex gap-3">
          <Button 
            onClick={() => setPreviewOpen(true)}
            disabled={loading || saving || fields.length === 0}
            className="h-12 px-6 bg-[var(--pri)]/20 hover:bg-[var(--pri)]/35 text-white font-black uppercase tracking-widest text-[11px] rounded-full border border-[var(--pri)]/30 hover-lift-3d"
          >
            <Eye className="h-4 w-4 mr-2" />
            Preview
          </Button>
          <Button 
            onClick={fetchConfig} 
            disabled={loading || saving} 
            className="h-12 px-6 bg-white/5 hover:bg-white/10 text-[var(--text)] font-black uppercase tracking-widest text-[11px] rounded-full border border-default hover-lift-3d"
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
          <Button 
            onClick={handleSaveConfig} 
            disabled={loading || saving} 
            className="h-12 px-8 bg-[var(--pri)] hover:bg-[var(--sec)] text-white font-black uppercase tracking-widest text-[11px] rounded-full border-0 hover-lift-3d shadow-[0_10px_20px_color-mix(in_srgb,var(--pri)_35%,transparent)]"
          >
            <Save className="h-4 w-4 mr-2" />
            {saving ? "Saving..." : "Save Layout"}
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center py-20 space-y-4">
          <RefreshCw className="h-8 w-8 text-[var(--pri)] animate-spin" />
          <p className="text-xs text-muted font-bold uppercase tracking-wider">Loading Configuration...</p>
        </div>
      ) : (
        <div className="space-y-10">
          
          {/* Default/System Fields Section (Top, 2-column grid) */}
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="text-xs font-black uppercase tracking-[0.2em] text-muted">Core Default Fields</h2>
              <span className="text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full bg-white/5 text-muted border border-default">System</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {defaultFieldsList.map(field => {
                const isCore = field.id === "name" || field.id === "email";
                const fieldType = getEffectiveFieldType(field);
                return (
                  <Card 
                    key={field.id} 
                    className="p-5 glass-3d border-default rounded-2xl bg-[color-mix(in_srgb,var(--text)_3%,transparent)] hover:border-[var(--pri)]/40 transition-all duration-300 relative overflow-hidden"
                  >
                    <div className="flex items-start justify-between">
                      <div className="space-y-1">
                        <span className="text-[9px] font-black uppercase tracking-widest text-[var(--pri)] bg-[var(--pri)]/10 px-2 py-0.5 rounded-md">
                          {fieldType === "select" ? "Category (Select)" : fieldType === "email" ? "Email Input" : fieldType === "phone" ? "Phone Input" : fieldType === "country" ? "Country Select" : "Text Input"}
                        </span>
                        <h4 className="text-sm font-black uppercase tracking-wider text-[var(--text)] mt-1.5">{field.label}</h4>
                        <p className="text-[9px] text-muted font-semibold">Database Column: {field.name}</p>
                      </div>

                      <div className="flex flex-col items-end gap-2">
                        {/* Active Toggle */}
                        <div className="flex items-center gap-2">
                          <span className="text-[9px] font-bold text-muted uppercase tracking-wider">Active</span>
                          <button
                            type="button"
                            disabled={isCore}
                            onClick={() => handleUpdateField(field.id, { is_active: !field.is_active })}
                            className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                              field.is_active ? "bg-emerald-500" : "bg-neutral-800"
                            } ${isCore ? "opacity-50 cursor-not-allowed" : ""}`}
                          >
                            <span
                              className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                                field.is_active ? "translate-x-4" : "translate-x-0"
                              }`}
                            />
                          </button>
                        </div>

                        {/* Required Toggle */}
                        <div className="flex items-center gap-2">
                          <span className="text-[9px] font-bold text-muted uppercase tracking-wider">Required</span>
                          <button
                            type="button"
                            disabled={isCore}
                            onClick={() => handleUpdateField(field.id, { is_required: !field.is_required })}
                            className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                              field.is_required ? "bg-[var(--pri)]" : "bg-neutral-800"
                            } ${isCore ? "opacity-50 cursor-not-allowed" : ""}`}
                          >
                            <span
                              className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                                field.is_required ? "translate-x-4" : "translate-x-0"
                              }`}
                            />
                          </button>
                        </div>
                      </div>
                    </div>

                    <div className="mt-4 space-y-2">
                      <label className="text-[9px] font-black text-muted uppercase tracking-widest">Field Display Label</label>
                      <Input
                        type="text"
                        value={field.label}
                        onChange={(e) => handleUpdateField(field.id, { label: e.target.value })}
                        className="h-10 bg-white/5 border-default rounded-xl px-3 font-semibold text-xs text-[var(--text)]"
                      />
                    </div>

                    {fieldType === "country" && (
                      <div className="mt-4 space-y-3 bg-white/5 border border-default/50 p-4 rounded-2xl">
                        <div>
                          <p className="text-[9px] font-black text-muted uppercase tracking-widest">Allowed Countries</p>
                          <p className="text-[9px] text-muted/70 font-semibold mt-1">
                            Leave empty to allow every country. Add one country to lock the public form to it.
                          </p>
                        </div>
                        <div className="flex gap-2">
                          <select
                            value={countryPicker[field.id] || ""}
                            onChange={(e) => setCountryPicker(prev => ({ ...prev, [field.id]: e.target.value }))}
                            className="h-10 min-w-0 flex-1 bg-white/5 border border-default rounded-xl px-3 font-semibold text-xs text-[var(--text)] focus:border-[var(--pri)] focus:ring-0 transition-all cursor-pointer"
                          >
                            <option value="" className="bg-[var(--surf)]">Select country...</option>
                            {countryStates
                              .filter(entry => !(field.options || []).includes(entry.country))
                              .map(entry => (
                                <option key={entry.country} value={entry.country} className="bg-[var(--surf)]">{entry.country}</option>
                              ))}
                          </select>
                          <Button
                            type="button"
                            onClick={() => handleAddAllowedCountry(field.id)}
                            className="h-10 px-4 bg-[var(--pri)]/10 hover:bg-[var(--pri)]/20 text-[var(--pri)] border border-[var(--pri)]/20 font-black uppercase tracking-widest text-[8px] rounded-xl"
                          >
                            Add
                          </Button>
                        </div>
                        {(field.options || []).length > 0 && (
                          <div className="flex flex-wrap gap-2">
                            {(field.options || []).map(country => (
                              <button
                                key={country}
                                type="button"
                                onClick={() => handleRemoveAllowedCountry(field.id, country)}
                                className="inline-flex items-center gap-1 rounded-full border border-[var(--pri)]/20 bg-[var(--pri)]/10 px-3 py-1 text-[9px] font-black uppercase tracking-wider text-[var(--pri)] hover:bg-rose-500/10 hover:text-rose-400 hover:border-rose-500/20"
                              >
                                {country}
                                <X className="h-3 w-3" />
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </Card>
                );
              })}
            </div>
          </div>

          {/* Custom Form Fields Section (Bottom) */}
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="text-xs font-black uppercase tracking-[0.2em] text-muted">Custom Form Questions</h2>
              <Button 
                onClick={handleAddCustomField}
                className="h-10 px-5 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/20 font-black uppercase tracking-widest text-[9px] rounded-full hover-lift-3d"
              >
                <Plus className="h-3.5 w-3.5 mr-1" />
                Add Question
              </Button>
            </div>

            {customFieldsList.length === 0 ? (
              <Card className="p-10 glass-3d border-default border-dashed rounded-[2.5rem] bg-white/5 flex flex-col items-center justify-center text-center space-y-3">
                <AlertCircle className="h-8 w-8 text-[var(--pri)] animate-pulse" />
                <h4 className="text-xs font-black uppercase tracking-widest text-[var(--text)]">No Custom Questions Defined</h4>
                <p className="text-[10px] text-muted leading-relaxed max-w-sm">
                  Add custom fields for uploads, dates, select menus, or checkboxes to gather specific delegate details.
                </p>
                <Button 
                  onClick={handleAddCustomField}
                  className="h-9 px-6 bg-[var(--pri)] hover:bg-[var(--sec)] text-[var(--text)] font-black uppercase tracking-widest text-[9px] rounded-full border-0 mt-2"
                >
                  Create First Question
                </Button>
              </Card>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                {customFieldsList.map((field, index) => (
                  (() => {
                    const fieldType = getEffectiveFieldType(field);

                    return (
                    <Card
                      key={field.id}
                      className="p-6 glass-3d border-default rounded-[2rem] bg-[color-mix(in_srgb,var(--text)_5%,transparent)] hover:border-[var(--pri)]/60 transition-all duration-300 relative space-y-4"
                    >
                    <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 border-b border-default/30 pb-4">
                      
                      <div className="flex items-center gap-3">
                        <div className="h-8 w-8 bg-white/5 border border-default rounded-xl flex items-center justify-center shrink-0">
                          <span className="text-xs font-black text-muted">{index + 1}</span>
                        </div>
                        <div>
                          <Input
                            type="text"
                            value={field.label}
                            onChange={(e) => handleUpdateField(field.id, { label: e.target.value })}
                            className="h-10 max-w-xs bg-transparent border-0 border-b border-dashed border-default focus:border-[var(--pri)] focus:ring-0 rounded-none px-0 font-black text-sm text-[var(--text)] py-0"
                            placeholder="Enter Question / Label"
                          />
                          <p className="text-[9px] text-muted font-bold mt-1 uppercase tracking-widest">Type: {fieldType}</p>
                        </div>
                      </div>

                      <div className="flex items-center gap-6 self-end sm:self-auto">
                        {/* Requirement Toggle */}
                        <div className="flex items-center gap-2">
                          <span className="text-[9px] font-bold text-muted uppercase tracking-wider">Required</span>
                          <button
                            type="button"
                            onClick={() => handleUpdateField(field.id, { is_required: !field.is_required })}
                            className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                              field.is_required ? "bg-[var(--pri)]" : "bg-neutral-800"
                            }`}
                          >
                            <span
                              className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                                field.is_required ? "translate-x-4" : "translate-x-0"
                              }`}
                            />
                          </button>
                        </div>

                        {/* Delete Field */}
                        <Button 
                          type="button"
                          onClick={() => handleDeleteField(field.id)}
                          className="h-8 w-8 p-0 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/20 text-rose-400 rounded-full shrink-0 flex items-center justify-center hover-lift-3d"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 gap-4">
                      {/* Select Input Type */}
                      <div className="space-y-1.5">
                        <label className="text-[9px] font-black text-muted uppercase tracking-widest">Question Input Type</label>
                        <select
                          value={fieldType}
                          onChange={(e) => handleUpdateField(field.id, { type: e.target.value, options: e.target.value === "select" || e.target.value === "checkbox" || e.target.value === "country" ? [] : undefined })}
                          className="h-10 w-full bg-white/5 border border-default rounded-xl px-3 font-semibold text-xs text-[var(--text)] focus:border-[var(--pri)] focus:ring-0 transition-all cursor-pointer"
                        >
                          <option value="text" className="bg-[var(--surf)]">Short Answer (Text)</option>
                          <option value="email" className="bg-[var(--surf)]">Email Address</option>
                          <option value="phone" className="bg-[var(--surf)]">Phone Number</option>
                          <option value="country" className="bg-[var(--surf)]">Country & State Selectors</option>
                          <option value="date" className="bg-[var(--surf)]">Date Selector</option>
                          <option value="select" className="bg-[var(--surf)]">Dropdown Selection</option>
                          <option value="checkbox" className="bg-[var(--surf)]">Checkbox list</option>
                          <option value="image" className="bg-[var(--surf)]">Profile Photo / Image Upload</option>
                          <option value="file" className="bg-[var(--surf)]">Document / PDF File Upload</option>
                        </select>
                      </div>

                      {/* Field Placeholder */}
                      {fieldType !== "image" && fieldType !== "file" && fieldType !== "date" && (
                        <div className="space-y-1.5">
                          <label className="text-[9px] font-black text-muted uppercase tracking-widest">Input Placeholder</label>
                          <Input
                            type="text"
                            value={field.placeholder || ""}
                            onChange={(e) => handleUpdateField(field.id, { placeholder: e.target.value })}
                            className="h-10 bg-white/5 border-default rounded-xl px-3 font-semibold text-xs text-[var(--text)]"
                            placeholder="Enter hint text..."
                          />
                        </div>
                      )}
                    </div>

                    {fieldType === "country" && (
                      <div className="space-y-3 bg-white/5 border border-default/50 p-5 rounded-2xl">
                        <div>
                          <span className="text-[9px] font-black text-muted uppercase tracking-widest">Allowed Countries</span>
                          <p className="text-[9px] text-muted/70 font-semibold mt-1">
                            Empty means all countries. Add one country for event-specific registrations like India-only.
                          </p>
                        </div>
                        <div className="flex gap-2">
                          <select
                            value={countryPicker[field.id] || ""}
                            onChange={(e) => setCountryPicker(prev => ({ ...prev, [field.id]: e.target.value }))}
                            className="h-10 min-w-0 flex-1 bg-white/5 border border-default rounded-xl px-3 font-semibold text-xs text-[var(--text)] focus:border-[var(--pri)] focus:ring-0 transition-all cursor-pointer"
                          >
                            <option value="" className="bg-[var(--surf)]">Select country...</option>
                            {countryStates
                              .filter(entry => !(field.options || []).includes(entry.country))
                              .map(entry => (
                                <option key={entry.country} value={entry.country} className="bg-[var(--surf)]">{entry.country}</option>
                              ))}
                          </select>
                          <Button
                            type="button"
                            onClick={() => handleAddAllowedCountry(field.id)}
                            className="h-10 px-4 bg-[var(--pri)]/10 hover:bg-[var(--pri)]/20 text-[var(--pri)] border border-[var(--pri)]/20 font-black uppercase tracking-widest text-[8px] rounded-xl"
                          >
                            Add
                          </Button>
                        </div>
                        {(field.options || []).length > 0 && (
                          <div className="flex flex-wrap gap-2">
                            {(field.options || []).map(country => (
                              <button
                                key={country}
                                type="button"
                                onClick={() => handleRemoveAllowedCountry(field.id, country)}
                                className="inline-flex items-center gap-1 rounded-full border border-[var(--pri)]/20 bg-[var(--pri)]/10 px-3 py-1 text-[9px] font-black uppercase tracking-wider text-[var(--pri)] hover:bg-rose-500/10 hover:text-rose-400 hover:border-rose-500/20"
                              >
                                {country}
                                <X className="h-3 w-3" />
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Dropdown Options List */}
                    {(fieldType === "select" || fieldType === "checkbox") && (
                      <div className="space-y-3 bg-white/5 border border-default/50 p-5 rounded-2xl">
                        <div className="flex items-center justify-between border-b border-default/30 pb-2.5">
                          <span className="text-[9px] font-black text-muted uppercase tracking-widest">Options / Choices</span>
                          <Button
                            onClick={() => handleAddOption(field.id)}
                            className="h-7 px-3 bg-[var(--pri)]/10 hover:bg-[var(--pri)]/20 text-[var(--pri)] border border-[var(--pri)]/20 font-black uppercase tracking-widest text-[8px] rounded-md"
                          >
                            <Plus className="h-3 w-3 mr-0.5" />
                            Add Option
                          </Button>
                        </div>

                        {(field.options || []).length === 0 ? (
                          <p className="text-[9px] text-muted/65 italic font-bold">Please add at least one choice option for this question.</p>
                        ) : (
                          <div className="space-y-2">
                            {(field.options || []).map((opt, optIndex) => (
                              <div key={optIndex} className="flex items-center gap-2">
                                <span className="text-xs font-black text-muted mr-1">•</span>
                                <Input
                                  type="text"
                                  value={opt}
                                  onChange={(e) => handleUpdateOption(field.id, optIndex, e.target.value)}
                                  className="h-8 flex-1 bg-white/5 border-default rounded-lg px-2 font-bold text-xs text-[var(--text)]"
                                  placeholder={`Choice ${optIndex + 1}`}
                                />
                                <Button
                                  type="button"
                                  onClick={() => handleRemoveOption(field.id, optIndex)}
                                  className="h-8 w-8 p-0 bg-transparent hover:bg-rose-500/10 border border-default text-muted hover:text-rose-400 rounded-lg shrink-0 flex items-center justify-center"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                    </Card>
                    );
                  })()                 ))}
              </div>
            )}
          </div>

          {/* Terms & Conditions Configuration — Markdown Editor */}
          <Card className="glass-card p-8 border border-white/5 space-y-6 rounded-[2rem] mt-8">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <FileText className="h-5 w-5 text-[var(--pri)]" />
                <div>
                  <h2 className="text-sm font-black uppercase tracking-[0.2em] text-[var(--text)]">Terms &amp; Conditions</h2>
                  <p className="text-[9px] font-bold text-muted mt-0.5">Supports Markdown formatting — **bold**, _italic_, ## headings, lists, etc.</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {/* View mode switcher */}
                <div className="flex items-center rounded-xl border border-white/10 bg-white/5 p-0.5 gap-0.5">
                  {(["edit", "split", "preview"] as const).map(mode => (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => setTcViewMode(mode)}
                      className={`h-7 px-3 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all ${
                        tcViewMode === mode
                          ? "bg-[var(--pri)] text-white shadow"
                          : "text-muted hover:text-[var(--text)]"
                      }`}
                    >
                      {mode === "edit" ? <Code2 className="h-3 w-3" /> : mode === "preview" ? <Eye className="h-3 w-3" /> : <SplitSquareHorizontal className="h-3 w-3" />}
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={() => setTcPreviewOpen(true)}
                  disabled={!termsAndConditions}
                  className="h-8 px-4 bg-[var(--pri)]/10 hover:bg-[var(--pri)]/20 text-[var(--pri)] border border-[var(--pri)]/20 font-black uppercase tracking-widest text-[9px] rounded-xl disabled:opacity-40 flex items-center gap-1.5 transition-all"
                >
                  <Eye className="h-3 w-3" />
                  Full Preview
                </button>
              </div>
            </div>

            {/* Markdown Quick Reference */}
            <div className="flex flex-wrap gap-2">
              {[
                { label: "**Bold**", desc: "Bold text" },
                { label: "_Italic_", desc: "Italic text" },
                { label: "## Heading", desc: "Section heading" },
                { label: "- Item", desc: "Bullet list" },
                { label: "1. Item", desc: "Numbered list" },
                { label: "[Link](url)", desc: "Hyperlink" },
              ].map(hint => (
                <button
                  key={hint.label}
                  type="button"
                  onClick={() => setTermsAndConditions(prev => prev + "\n" + hint.label)}
                  title={hint.desc}
                  className="px-2.5 py-1 rounded-lg bg-white/5 border border-white/8 text-[9px] font-mono text-muted hover:text-[var(--text)] hover:bg-white/10 transition-all"
                >
                  {hint.label}
                </button>
              ))}
            </div>

            {/* Editor Area */}
            <div className={`grid gap-4 ${
              tcViewMode === "split" ? "grid-cols-2" : "grid-cols-1"
            }`}>

              {/* Raw Markdown Editor */}
              {(tcViewMode === "edit" || tcViewMode === "split") && (
                <div className="space-y-1.5">
                  {tcViewMode === "split" && (
                    <div className="flex items-center gap-1.5">
                      <Code2 className="h-3 w-3 text-muted" />
                      <span className="text-[9px] font-black uppercase tracking-widest text-muted">Markdown Source</span>
                    </div>
                  )}
                  <textarea
                    placeholder={`# Terms & Conditions\n\n## 1. Registration Policy\nRegistration is non-transferable and non-refundable.\n\n## 2. Code of Conduct\nAttendees must adhere to the Event Code of Conduct.\n\n## 3. Modifications\nOrganizers reserve the right to modify the schedule without prior notice.`}
                    value={termsAndConditions}
                    onChange={e => setTermsAndConditions(e.target.value)}
                    rows={14}
                    spellCheck={false}
                    className="w-full bg-[#080912] border border-white/10 focus:border-[var(--pri)] focus:ring-0 rounded-2xl px-4 py-3 text-xs text-[var(--text)] font-mono leading-relaxed transition-all resize-y min-h-[200px]"
                  />
                </div>
              )}

              {/* Rendered Markdown Preview */}
              {(tcViewMode === "preview" || tcViewMode === "split") && (
                <div className="space-y-1.5">
                  {tcViewMode === "split" && (
                    <div className="flex items-center gap-1.5">
                      <Eye className="h-3 w-3 text-muted" />
                      <span className="text-[9px] font-black uppercase tracking-widest text-muted">Rendered Preview</span>
                    </div>
                  )}
                  <div className="min-h-[200px] bg-[#080912] border border-white/10 rounded-2xl px-5 py-4 overflow-y-auto prose prose-invert prose-xs max-w-none
                    prose-headings:text-[var(--text)] prose-headings:font-black prose-headings:tracking-tight
                    prose-h1:text-lg prose-h2:text-sm prose-h3:text-xs
                    prose-p:text-muted prose-p:text-xs prose-p:leading-relaxed
                    prose-li:text-muted prose-li:text-xs
                    prose-strong:text-[var(--text)] prose-em:text-indigo-300
                    prose-a:text-indigo-400 prose-a:no-underline hover:prose-a:underline
                    prose-hr:border-white/10">
                    {termsAndConditions ? (
                      <ReactMarkdown>{termsAndConditions}</ReactMarkdown>
                    ) : (
                      <div className="flex flex-col items-center justify-center h-full min-h-[160px] text-center space-y-2 opacity-40">
                        <FileText className="h-8 w-8 text-muted" />
                        <p className="text-[10px] font-bold text-muted uppercase tracking-widest">Start typing markdown on the left</p>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            <p className="text-[9px] font-bold text-muted leading-relaxed">
              These terms will be rendered as formatted text with a mandatory checkbox on the registration preview page before payment. Supports full Markdown syntax. If left blank, default terms will be shown.
            </p>
          </Card>

          {/* T&C Full Preview Modal */}
          {tcPreviewOpen && (
            <Portal>
              <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-in fade-in duration-200">
                <div className="relative w-full max-w-2xl bg-[var(--base)] border border-white/10 rounded-[2.5rem] shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
                  <div className="px-8 py-5 border-b border-white/5 flex items-center justify-between bg-white/[0.01] shrink-0">
                    <div className="flex items-center gap-2">
                      <FileText className="h-4 w-4 text-[var(--pri)]" />
                      <h3 className="text-sm font-black uppercase tracking-[0.25em] text-[var(--text)]">Terms &amp; Conditions Preview</h3>
                    </div>
                    <button
                      onClick={() => setTcPreviewOpen(false)}
                      className="h-8 w-8 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center text-muted hover:text-[var(--text)] transition-all"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                  <div className="p-8 overflow-y-auto flex-1 custom-scrollbar prose prose-invert max-w-none
                    prose-headings:text-[var(--text)] prose-headings:font-black prose-headings:tracking-tight
                    prose-h1:text-xl prose-h2:text-base prose-h3:text-sm
                    prose-p:text-muted prose-p:text-sm prose-p:leading-relaxed
                    prose-li:text-muted prose-li:text-sm
                    prose-strong:text-[var(--text)] prose-em:text-indigo-300
                    prose-a:text-indigo-400 prose-a:no-underline hover:prose-a:underline
                    prose-hr:border-white/10">
                    <ReactMarkdown>{termsAndConditions}</ReactMarkdown>
                  </div>
                  <div className="px-8 py-4 border-t border-white/5 bg-white/[0.01] shrink-0">
                    <div className="flex items-start gap-3 p-3 rounded-xl bg-indigo-500/5 border border-indigo-500/15">
                      <input type="checkbox" disabled className="h-4 w-4 mt-0.5 rounded border-white/20 bg-white/5 text-indigo-500 cursor-not-allowed" />
                      <span className="text-[10px] font-bold text-muted uppercase tracking-wider leading-relaxed">
                        I have read and agree to the Terms &amp; Conditions above. <span className="text-indigo-400">*</span>
                        <span className="block text-indigo-400/60 mt-0.5 normal-case font-medium tracking-normal">This checkbox will be required on the registration form.</span>
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </Portal>
          )}
        </div>
      )}

      {/* Preview Modal */}
      {previewOpen && (
        <Portal>
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-in fade-in duration-200">
            <div className="relative w-full max-w-2xl bg-[var(--base)] border border-white/10 rounded-[2.5rem] shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
              
              {/* Modal Header */}
              <div className="px-8 py-5 border-b border-white/5 flex items-center justify-between bg-white/[0.01]">
                <div className="flex items-center gap-2">
                  <Eye className="h-4.5 w-4.5 text-[var(--pri)]" />
                  <h3 className="text-sm font-black uppercase tracking-[0.25em] text-[var(--text)]">Live Portal Preview</h3>
                </div>
                <button
                  onClick={() => setPreviewOpen(false)}
                  className="h-8 w-8 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center text-muted hover:text-[var(--text)] transition-all"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              {/* Modal Scrollable Content (Mockup Registration Form) */}
              <div className="p-8 overflow-y-auto space-y-6 flex-1 custom-scrollbar">
                <div className="text-center space-y-2 pb-4 border-b border-white/5">
                  <h2 className="text-xl font-black tracking-tight text-[var(--text)]">Attendee Registration</h2>
                  <p className="text-[10px] font-bold text-muted uppercase tracking-widest">Public Registration Portal Preview</p>
                </div>

                <form className="space-y-4" onSubmit={(e) => e.preventDefault()}>
                  {fields
                    .filter(f => f.is_active)
                    .map(f => {
                      const fieldType = getEffectiveFieldType(f);

                      return (
                        <div key={f.id} className="space-y-1.5 text-left">
                          <label className="text-[10px] font-black uppercase tracking-wider text-muted flex items-center gap-1">
                            {f.label}
                            {f.is_required && <span className="text-rose-500 font-bold">*</span>}
                          </label>

                          {fieldType === "select" ? (
                            <select className="h-11 w-full bg-white/5 border border-white/10 rounded-xl px-4 text-xs font-semibold text-[var(--text)] focus:border-[var(--pri)] focus:outline-none transition-all cursor-pointer">
                              <option value="" className="bg-[var(--base)] text-[var(--text)]">Select option...</option>
                              {f.id === "role" ? (
                                <>
                                  <option value="Delegate" className="bg-[var(--base)] text-[var(--text)]">Delegate</option>
                                  <option value="Speaker" className="bg-[var(--base)] text-[var(--text)]">Speaker</option>
                                  <option value="VIP Guest" className="bg-[var(--base)] text-[var(--text)]">VIP Guest</option>
                                  <option value="Student Delegate" className="bg-[var(--base)] text-[var(--text)]">Student Delegate</option>
                                </>
                              ) : (
                                (f.options || []).map((o, idx) => (
                                  <option key={idx} value={o} className="bg-[var(--base)] text-[var(--text)]">{o}</option>
                                ))
                              )}
                            </select>
                          ) : fieldType === "checkbox" ? (
                            <div className="space-y-2 p-4 rounded-xl bg-white/[0.02] border border-white/5">
                              {(f.options || []).map((o, idx) => (
                                <label key={idx} className="flex items-center gap-2.5 text-xs text-muted font-semibold cursor-pointer hover:text-[var(--text)] transition-colors">
                                  <input type="checkbox" className="rounded border-white/10 bg-white/5 text-[var(--pri)] focus:ring-0" />
                                  {o}
                                </label>
                              ))}
                            </div>
                          ) : fieldType === "date" ? (
                            <input type="date" className="h-11 w-full bg-white/5 border border-white/10 rounded-xl px-4 text-xs font-semibold text-[var(--text)] focus:border-[var(--pri)] focus:outline-none transition-all" />
                          ) : fieldType === "file" || fieldType === "image" ? (
                            <div className="border border-dashed border-white/10 hover:border-[var(--pri)]/40 bg-white/[0.01] hover:bg-white/[0.02] rounded-xl p-4 flex flex-col items-center justify-center text-center cursor-pointer transition-all">
                              <UploadCloud className="h-5 w-5 text-muted mb-1" />
                              <span className="text-[10px] font-bold text-muted uppercase tracking-wider">Choose file or drag here</span>
                            </div>
                          ) : fieldType === "country" ? (
                            (() => {
                              const countries = getCountryChoices(f);
                              const selectedCountry = previewCountry[f.id] || (countries.length === 1 ? countries[0] : "");
                              const states = getStatesForCountry(countryStates, selectedCountry);

                              return (
                                <div className="space-y-3">
                                  {countries.length === 1 ? (
                                    <select
                                      disabled
                                      value={countries[0]}
                                      className="h-11 w-full bg-white/5 border border-white/10 rounded-xl px-4 text-xs font-semibold text-[var(--text)] opacity-100 focus:border-[var(--pri)] focus:outline-none transition-all cursor-not-allowed"
                                    >
                                      <option value={countries[0]} className="bg-[var(--base)] text-[var(--text)]">{countries[0]}</option>
                                    </select>
                                  ) : (
                                    <select
                                      value={selectedCountry}
                                      onChange={(e) => setPreviewCountry(prev => ({ ...prev, [f.id]: e.target.value }))}
                                      className="h-11 w-full bg-white/5 border border-white/10 rounded-xl px-4 text-xs font-semibold text-[var(--text)] focus:border-[var(--pri)] focus:outline-none transition-all cursor-pointer"
                                    >
                                      <option value="" className="bg-[var(--base)] text-[var(--text)]">Select Country...</option>
                                      {countries.map(country => (
                                        <option key={country} value={country} className="bg-[var(--base)] text-[var(--text)]">{country}</option>
                                      ))}
                                    </select>
                                  )}

                                  {selectedCountry && (
                                    <div className="space-y-1.5 animate-in fade-in duration-200">
                                      <label className="text-[10px] font-black uppercase tracking-wider text-muted flex items-center gap-1">
                                        State / Province
                                        {f.is_required && <span className="text-rose-500 font-bold">*</span>}
                                      </label>
                                      {states.length ? (
                                        <select
                                          className="h-11 w-full bg-white/5 border border-white/10 rounded-xl px-4 text-xs font-semibold text-[var(--text)] focus:border-[var(--pri)] focus:outline-none transition-all cursor-pointer"
                                        >
                                          <option value="" className="bg-[var(--base)] text-[var(--text)]">Select State / Province...</option>
                                          {states.map(state => (
                                            <option key={state} value={state} className="bg-[var(--base)] text-[var(--text)]">{state}</option>
                                          ))}
                                        </select>
                                      ) : (
                                        <Input
                                          type="text"
                                          placeholder="Enter state / province"
                                          className="h-11 bg-white/5 border border-white/10 rounded-xl px-4 text-xs font-semibold text-[var(--text)] focus:border-[var(--pri)] transition-all"
                                        />
                                      )}
                                    </div>
                                  )}
                                </div>
                              );
                            })()
                          ) : fieldType === "email" ? (
                            <Input
                              type="email"
                              placeholder={f.placeholder || `Enter ${f.label.toLowerCase()}`}
                              className="h-11 bg-white/5 border border-white/10 rounded-xl px-4 text-xs font-semibold text-[var(--text)] focus:border-[var(--pri)] transition-all"
                            />
                          ) : fieldType === "phone" ? (
                            <div className="flex gap-2">
                              <select disabled className="h-11 w-24 bg-white/5 border border-white/10 rounded-xl px-2 text-xs font-semibold text-muted opacity-80 cursor-not-allowed">
                                <option>+91</option>
                              </select>
                              <Input
                                type="text"
                                disabled
                                placeholder={f.placeholder || "Enter phone number..."}
                                className="h-11 bg-white/5 border border-white/10 rounded-xl px-4 text-xs font-semibold text-[var(--text)] flex-1 opacity-80"
                              />
                            </div>
                          ) : (
                            <Input
                              type="text"
                              placeholder={f.placeholder || `Enter ${f.label.toLowerCase()}`}
                              className="h-11 bg-white/5 border border-white/10 rounded-xl px-4 text-xs font-semibold text-[var(--text)] focus:border-[var(--pri)] transition-all"
                            />
                          )}
                        </div>
                      )
                    })}

                  {/* Terms & Conditions preview in Form Builder Mockup */}
                  <div className="space-y-3 pt-4 border-t border-white/5 text-left">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-black uppercase tracking-wider text-muted">Terms &amp; Conditions</span>
                      <span className="text-[9px] font-bold text-[var(--pri)]/60 uppercase tracking-widest">Markdown Preview</span>
                    </div>
                    <div className="p-3 rounded-xl bg-white/5 border border-white/5 max-h-28 overflow-y-auto prose prose-invert prose-xs max-w-none
                      prose-headings:text-[var(--text)] prose-headings:font-black prose-headings:text-xs prose-headings:mb-1
                      prose-p:text-muted prose-p:text-[10px] prose-p:leading-relaxed prose-p:my-0.5
                      prose-li:text-muted prose-li:text-[10px] prose-li:my-0
                      prose-strong:text-[var(--text)] prose-em:text-indigo-300
                      prose-a:text-indigo-400 prose-hr:border-white/10 prose-ul:my-1 prose-ol:my-1">
                      <ReactMarkdown>
                        {termsAndConditions || "## Terms & Conditions\n\n1. Registration is non-transferable and non-refundable.\n2. Attendees must adhere to the Event Code of Conduct.\n3. The organizers reserve the right to modify the schedule without prior notice."}
                      </ReactMarkdown>
                    </div>
                    <label className="flex items-start gap-2.5 cursor-pointer select-none">
                      <input type="checkbox" disabled className="h-4 w-4 bg-white/5 border border-white/10 rounded text-[var(--pri)] focus:ring-0 mt-0.5" checked={true} readOnly />
                      <span className="text-[10px] font-bold text-muted uppercase tracking-wider leading-normal">
                        I have read and agree to the terms and conditions. <span className="text-rose-500 font-bold">*</span>
                      </span>
                    </label>
                  </div>

                  <button
                    type="button"
                    className="w-full h-12 bg-[var(--pri)] hover:bg-[var(--pri-hover)] text-white font-black uppercase tracking-widest text-[11px] rounded-xl shadow-lg mt-6 transition-all"
                  >
                    Submit Registration
                  </button>
                </form>
              </div>

              {/* Modal Footer */}
              <div className="px-8 py-4 border-t border-white/5 bg-white/[0.01] flex items-center justify-end">
                <Button
                  onClick={() => setPreviewOpen(false)}
                  className="h-10 px-6 bg-white/5 hover:bg-white/10 text-muted hover:text-[var(--text)] font-black uppercase tracking-widest text-[9px] rounded-full border border-default"
                >
                  Close Preview
                </Button>
              </div>

            </div>
          </div>
        </Portal>
      )}
    </div>
  );
}
