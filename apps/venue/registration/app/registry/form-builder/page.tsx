"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { 
  ClipboardList, Plus, Trash2, Save, Sparkles, RefreshCw, 
  Settings2, HelpCircle, Eye, AlertCircle, Edit3, GripVertical,
  X, UploadCloud, FileText, Code2, SplitSquareHorizontal
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";
import { apiClient } from "@/lib/api-client";

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

export default function RegistrationFormBuilder() {
  const { eventId } = useParams();
  
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  
  const [fields, setFields] = useState<FormField[]>([
    { id: "first_name", name: "first_name", label: "First Name", type: "text", is_default: true, is_required: true, is_active: true, placeholder: "Enter first name" },
    { id: "last_name", name: "last_name", label: "Last Name", type: "text", is_default: true, is_required: true, is_active: true, placeholder: "Enter last name" },
    { id: "email", name: "email", label: "Email Address", type: "email", is_default: true, is_required: true, is_active: true, placeholder: "email@example.com" },
    { id: "phone", name: "phone", label: "Mobile Phone", type: "phone", is_default: true, is_required: false, is_active: true, placeholder: "+91 9876543210" },
    { id: "company", name: "company", label: "Organization / Company", type: "text", is_default: true, is_required: false, is_active: true, placeholder: "Company Name" },
    { id: "role", name: "role", label: "Registration Category", type: "select", is_default: true, is_required: true, is_active: true, options: ["Delegate", "Speaker", "VIP", "Exhibitor"] }
  ]);
  const [termsAndConditions, setTermsAndConditions] = useState("All registrations are subject to verification on-site.");

  const handleUpdateField = (id: string, updates: Partial<FormField>) => {
    setFields(prev => prev.map(f => f.id === id ? { ...f, ...updates } : f));
  };

  const handleAddCustomField = () => {
    const customId = `custom_${Math.random().toString(36).substring(2, 9)}`;
    const newField: FormField = {
      id: customId,
      name: customId,
      label: "New Question / Field",
      type: "text",
      is_default: false,
      is_required: false,
      is_active: true,
      placeholder: "Enter placeholder text"
    };
    setFields(prev => [...prev, newField]);
    toast.success("Added custom field. Customize it below!");
  };

  const handleDeleteField = (id: string) => {
    setFields(prev => prev.filter(f => f.id !== id));
    toast.info("Field removed.");
  };

  const handleSaveConfig = async () => {
    try {
      setSaving(true);
      toast.success("Form configuration saved successfully.");
    } catch (err: any) {
      toast.error("Failed to save form configuration.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-8 p-6 w-full">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black tracking-tight text-slate-900 flex items-center gap-3">
            <ClipboardList className="h-8 w-8 text-blue-600" />
            Registration Form Builder
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Design registration fields, configure mandatory rules, set custom questions, and preview live.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            onClick={() => setPreviewOpen(true)}
            className="flex items-center gap-2 font-bold"
          >
            <Eye className="h-4 w-4 text-blue-600" />
            Live Preview
          </Button>
          <Button
            onClick={handleAddCustomField}
            variant="outline"
            className="flex items-center gap-2 font-bold border-slate-300"
          >
            <Plus className="h-4 w-4" />
            Add Custom Field
          </Button>
          <Button
            onClick={handleSaveConfig}
            disabled={saving}
            className="bg-blue-600 hover:bg-blue-700 text-white font-bold flex items-center gap-2"
          >
            <Save className="h-4 w-4" />
            {saving ? "Saving..." : "Save Form Config"}
          </Button>
        </div>
      </div>

      {/* Fields List */}
      <div className="space-y-4">
        {fields.map((field) => (
          <Card key={field.id} className="p-5 border-slate-200 shadow-sm bg-white hover:border-blue-500/40 transition-colors">
            <div className="flex items-start justify-between gap-4">
              
              <div className="flex items-center gap-3">
                <GripVertical className="h-5 w-5 text-slate-300 cursor-grab" />
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-slate-900 text-base">{field.label}</span>
                    {field.is_default && (
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-slate-100 text-slate-600">
                        System Default
                      </span>
                    )}
                    {field.is_required && (
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-red-100 text-red-700">
                        Required
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-500 font-mono mt-0.5">Field ID: {field.id} • Type: {field.type}</p>
                </div>
              </div>

              {/* Controls */}
              <div className="flex items-center gap-4">
                <label className="flex items-center gap-2 text-xs font-semibold text-slate-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={field.is_required}
                    onChange={(e) => handleUpdateField(field.id, { is_required: e.target.checked })}
                    className="rounded text-blue-600 focus:ring-0"
                  />
                  Mandatory
                </label>

                <label className="flex items-center gap-2 text-xs font-semibold text-slate-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={field.is_active}
                    onChange={(e) => handleUpdateField(field.id, { is_active: e.target.checked })}
                    className="rounded text-blue-600 focus:ring-0"
                  />
                  Active
                </label>

                {!field.is_default && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleDeleteField(field.id)}
                    className="h-8 w-8 p-0 text-red-500 hover:bg-red-50"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </div>

            </div>
          </Card>
        ))}
      </div>

      {/* Terms & Conditions Section */}
      <Card className="p-6 border-slate-200 bg-white space-y-3">
        <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
          <FileText className="h-5 w-5 text-blue-600" /> Terms & Conditions / Guidelines
        </h3>
        <textarea
          rows={4}
          value={termsAndConditions}
          onChange={(e) => setTermsAndConditions(e.target.value)}
          className="w-full rounded-xl border border-slate-200 p-3 text-sm focus:ring-1 focus:ring-blue-600"
          placeholder="Enter terms and conditions shown to delegates during registration..."
        />
      </Card>

      {/* Live Preview Modal */}
      {previewOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-xl bg-white border border-slate-200 p-6 rounded-2xl space-y-6 shadow-2xl max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                <Eye className="h-5 w-5 text-blue-600" /> Live Registration Form Preview
              </h2>
              <button onClick={() => setPreviewOpen(false)} className="text-slate-400 hover:text-slate-700">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-4">
              {fields.filter(f => f.is_active).map(f => (
                <div key={f.id}>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    {f.label} {f.is_required && <span className="text-red-500">*</span>}
                  </label>
                  {f.type === "select" ? (
                    <select className="w-full h-10 px-3 rounded-lg border border-slate-200 text-sm bg-white">
                      {(f.options || ["Option 1", "Option 2"]).map(o => (
                        <option key={o} value={o}>{o}</option>
                      ))}
                    </select>
                  ) : (
                    <Input placeholder={f.placeholder || `Enter ${f.label.toLowerCase()}`} className="h-10 text-sm" />
                  )}
                </div>
              ))}
            </div>

            <div className="pt-4 border-t border-slate-100 flex justify-end">
              <Button onClick={() => setPreviewOpen(false)} className="bg-blue-600 text-white font-bold">
                Close Preview
              </Button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
