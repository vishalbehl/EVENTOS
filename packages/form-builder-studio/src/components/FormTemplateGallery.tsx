import React, { useState, useMemo } from "react";
import {
  Search,
  Plus,
  Layers,
  ArrowRight,
  Eye,
  Sliders,
  CheckCircle2,
  Trash2,
  Edit3,
  Copy,
  Tag,
  X,
  FileText,
  UserCheck,
  Star,
  ClipboardList,
} from "lucide-react";
import { FormTemplate, FormCategory, FormBuilderMode } from "../types";
import { FormRenderer } from "./FormRenderer";

export interface FormTemplateGalleryProps {
  templates?: FormTemplate[];
  categories?: FormCategory[];
  facilityCategory?: string; // e.g. "registration", "abstract", "survey"
  mode?: FormBuilderMode;
  onSelectTemplate?: (template: FormTemplate) => void;
  onEditTemplate?: (template: FormTemplate) => void;
  onApplyTemplate?: (template: FormTemplate) => void;
  onCreateCustomTemplate?: (data: { name: string; category_key: string; description: string }) => void;
  onCreateCategory?: (name: string, description: string) => void;
  onUpdateCategory?: (id: string, name: string, description: string) => void;
  onDeleteCategory?: (id: string) => void;
  className?: string;
}

const DEFAULT_STANDARD_CATEGORIES: FormCategory[] = [
  { id: "11111111-1111-1111-1111-111111111101", name: "Registration Form", slug: "registration", is_system: true, sort_order: 0, is_active: true },
  { id: "11111111-1111-1111-1111-111111111102", name: "Abstract Form", slug: "abstract", is_system: true, sort_order: 1, is_active: true },
  { id: "11111111-1111-1111-1111-111111111103", name: "Survey Form", slug: "survey", is_system: true, sort_order: 2, is_active: true },
  { id: "11111111-1111-1111-1111-111111111104", name: "Speaker Intake Form", slug: "speaker_intake", is_system: true, sort_order: 3, is_active: true },
  { id: "11111111-1111-1111-1111-111111111105", name: "Sponsor Application", slug: "sponsor_application", is_system: true, sort_order: 4, is_active: true },
];

export function FormTemplateGallery({
  templates = [],
  categories = [],
  facilityCategory,
  mode = "organiser-portal",
  onSelectTemplate,
  onEditTemplate,
  onApplyTemplate,
  onCreateCustomTemplate,
  onCreateCategory,
  onUpdateCategory,
  onDeleteCategory,
  className = "",
}: FormTemplateGalleryProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategoryKey, setSelectedCategoryKey] = useState<string>(facilityCategory || "all");
  const [previewTemplate, setPreviewTemplate] = useState<FormTemplate | null>(null);

  // Modals state
  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);
  const [isCreateTemplateModalOpen, setIsCreateTemplateModalOpen] = useState(false);

  // New Category Form
  const [newCatName, setNewCatName] = useState("");
  const [newCatDesc, setNewCatDesc] = useState("");

  // New Template Form
  const [newTplName, setNewTplName] = useState("");
  const [newTplCat, setNewTplCat] = useState(facilityCategory || "registration");
  const [newTplDesc, setNewTplDesc] = useState("");

  // Effective categories (ensure fallback so dropdown is never empty)
  const activeCategories = useMemo(() => {
    if (categories && categories.length > 0) {
      return categories;
    }
    return DEFAULT_STANDARD_CATEGORIES;
  }, [categories]);

  // Filter templates based on facility scope and search
  const filteredTemplates = useMemo(() => {
    return templates.filter((t) => {
      // Facility category constraint
      if (facilityCategory && t.category_key !== facilityCategory) {
        return false;
      }

      const matchesCategory =
        selectedCategoryKey === "all" ||
        t.category_key === selectedCategoryKey ||
        t.category_name?.toLowerCase().includes(selectedCategoryKey.toLowerCase());

      const matchesSearch =
        searchQuery.trim() === "" ||
        t.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (t.description || "").toLowerCase().includes(searchQuery.toLowerCase());

      return matchesCategory && matchesSearch;
    });
  }, [templates, facilityCategory, selectedCategoryKey, searchQuery]);

  const handleCreateCategorySubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCatName.trim()) return;
    if (onCreateCategory) {
      onCreateCategory(newCatName.trim(), newCatDesc.trim());
    }
    setNewCatName("");
    setNewCatDesc("");
  };

  const handleCreateTemplateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTplName.trim()) return;
    if (onCreateCustomTemplate) {
      onCreateCustomTemplate({
        name: newTplName.trim(),
        category_key: newTplCat,
        description: newTplDesc.trim(),
      });
    }
    setNewTplName("");
    setNewTplDesc("");
    setIsCreateTemplateModalOpen(false);
  };

  const handleEditClick = (template: FormTemplate) => {
    if (onEditTemplate) {
      onEditTemplate(template);
    } else if (onSelectTemplate) {
      onSelectTemplate(template);
    } else if (onApplyTemplate) {
      onApplyTemplate(template);
    }
  };

  return (
    <div className={`space-y-6 ${className}`}>
      {/* ── Top Header Toolbar ────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-[var(--text-primary,#ffffff)] flex items-center gap-2">
            <Layers className="size-5 text-[var(--pri,#4f46e5)]" />
            <span>{facilityCategory ? `${facilityCategory.replace(/_/g, " ").toUpperCase()} Templates` : "Form Blueprint Gallery"}</span>
          </h2>
          <p className="text-xs text-[var(--text-secondary,#a1a1aa)] mt-0.5">
            {facilityCategory
              ? `Select a ${facilityCategory.replace(/_/g, " ")} blueprint to edit and customize for your event.`
              : "Pre-built questionnaire blueprints and custom organizational form layouts."}
          </p>
        </div>

        <div className="flex items-center gap-2">
          {!facilityCategory && (
            <button
              type="button"
              onClick={() => setIsCategoryModalOpen(true)}
              className="h-9 px-3.5 rounded-xl border border-[var(--border-subtle,#27272a)] hover:bg-[var(--bg-surface-2,#18181b)] text-xs font-semibold text-[var(--text-secondary,#a1a1aa)] hover:text-[var(--text-primary,#ffffff)] flex items-center gap-1.5 transition cursor-pointer"
            >
              <Tag className="size-3.5 text-[var(--pri,#4f46e5)]" />
              <span>Manage Categories</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => setIsCreateTemplateModalOpen(true)}
            className="h-9 px-4 rounded-xl bg-[var(--pri,#f4f4f5)] text-[var(--primary-contrast,#09090b)] hover:opacity-90 text-xs font-bold flex items-center gap-1.5 shadow-md transition cursor-pointer"
          >
            <Plus className="size-3.5" />
            <span>Create Custom Form</span>
          </button>
        </div>
      </div>

      {/* ── Filters & Search ──────────────────────────────────────── */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 p-3 rounded-2xl bg-[var(--bg-surface-2,#18181b)] border border-[var(--border-subtle,#27272a)]">
        {/* Search Input */}
        <div className="relative flex-1 max-w-md">
          <Search className="size-3.5 absolute left-3 top-3 text-[var(--text-tertiary,#71717a)]" />
          <input
            type="text"
            placeholder="Search templates by name or description..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full h-9 pl-9 pr-3 rounded-xl bg-[var(--bg-surface,#09090b)] border border-[var(--border-subtle,#27272a)] text-xs text-[var(--text-primary,#ffffff)] focus:border-[var(--pri,#4f46e5)] focus:outline-none"
          />
        </div>

        {/* Category Pills Filter (Only in Global Design Studio) */}
        {!facilityCategory && (
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 md:pb-0">
            <button
              type="button"
              onClick={() => setSelectedCategoryKey("all")}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition cursor-pointer border ${
                selectedCategoryKey === "all"
                  ? "bg-[var(--pri,#f4f4f5)] border-[var(--pri,#f4f4f5)] text-[var(--primary-contrast,#09090b)]"
                  : "bg-[var(--bg-surface-3,#1b1b1d)] border-[var(--border-subtle,#27272a)] text-[var(--text-secondary,#a1a1aa)] hover:text-[var(--text-primary,#ffffff)] hover:border-[var(--border-default,#3f3f46)]"
              }`}
            >
              All Categories
            </button>
            {activeCategories.map((cat) => (
              <button
                key={cat.id || cat.slug}
                type="button"
                onClick={() => setSelectedCategoryKey(cat.slug)}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition cursor-pointer border ${
                  selectedCategoryKey === cat.slug
                    ? "bg-[var(--pri,#f4f4f5)] border-[var(--pri,#f4f4f5)] text-[var(--primary-contrast,#09090b)]"
                    : "bg-[var(--bg-surface-3,#1b1b1d)] border-[var(--border-subtle,#27272a)] text-[var(--text-secondary,#a1a1aa)] hover:text-[var(--text-primary,#ffffff)] hover:border-[var(--border-default,#3f3f46)]"
                }`}
              >
                {cat.name}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* ── Template Cards Grid ───────────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {filteredTemplates.map((template) => {
          const isDefault = template.is_default;
          return (
            <div
              key={template.id}
              className="flex flex-col justify-between p-5 rounded-2xl bg-[var(--bg-surface-2,#18181b)] border border-[var(--border-subtle,#27272a)] hover:border-[var(--pri,#4f46e5)]/60 hover:shadow-xl transition group relative"
            >
              <div className="space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <div className="size-8 rounded-lg bg-[var(--bg-surface-3,#1b1b1d)] border border-[var(--border-subtle,#27272a)] flex items-center justify-center text-[var(--pri,#4f46e5)] group-hover:scale-105 transition">
                      <FileText className="size-4" />
                    </div>
                    <div>
                      <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-[var(--pri,#4f46e5)]/10 text-[var(--pri,#4f46e5)] border border-[var(--pri,#4f46e5)]/20">
                        {template.category_name || template.category_key.replace(/_/g, " ")}
                      </span>
                    </div>
                  </div>

                  {isDefault && (
                    <span className="text-[9px] font-bold uppercase px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                      Standard
                    </span>
                  )}
                </div>

                <div>
                  <h3 className="text-sm font-bold text-[var(--text-primary,#ffffff)] group-hover:text-[var(--pri,#4f46e5)] transition">
                    {template.name}
                  </h3>
                  <p className="text-xs text-[var(--text-secondary,#a1a1aa)] mt-1 line-clamp-2 leading-relaxed">
                    {template.description || "Comprehensive event questionnaire layout."}
                  </p>
                </div>

                <div className="flex items-center gap-2 pt-2 border-t border-[var(--border-subtle,#27272a)]/50 text-[11px] text-[var(--text-tertiary,#71717a)]">
                  <span>{template.fields?.length || 0} Questions</span>
                  <span>•</span>
                  <span>
                    {template.fields?.filter((f) => f.is_required).length || 0} Required
                  </span>
                </div>
              </div>

              {/* Action Buttons: Preview & Edit */}
              <div className="pt-4 mt-4 border-t border-[var(--border-subtle,#27272a)] flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() => setPreviewTemplate(template)}
                  className="h-8 px-3 rounded-xl border border-[var(--border-subtle,#27272a)] hover:bg-[var(--bg-surface-3,#1b1b1d)] text-xs font-semibold text-[var(--text-secondary,#a1a1aa)] hover:text-[var(--text-primary,#ffffff)] flex items-center gap-1.5 transition cursor-pointer"
                >
                  <Eye className="size-3.5 text-[var(--pri,#4f46e5)]" />
                  <span>Preview</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleEditClick(template)}
                  className="h-8 px-3.5 rounded-xl bg-[var(--pri,#f4f4f5)] text-[var(--primary-contrast,#09090b)] hover:opacity-90 text-xs font-bold flex items-center gap-1.5 shadow-sm transition cursor-pointer"
                >
                  <Edit3 className="size-3" />
                  <span>Edit in Designer</span>
                  <ArrowRight className="size-3" />
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {filteredTemplates.length === 0 && (
        <div className="p-16 border-2 border-dashed border-[var(--border-subtle,#27272a)] rounded-2xl text-center space-y-3 bg-[var(--bg-surface-2,#18181b)]">
          <Layers className="size-10 text-[var(--pri,#4f46e5)]/50 mx-auto" />
          <h4 className="text-sm font-bold text-[var(--text-primary,#ffffff)]">No form blueprints found</h4>
          <p className="text-xs text-[var(--text-secondary,#a1a1aa)] max-w-sm mx-auto">
            Try adjusting your search criteria or create a new custom form template.
          </p>
        </div>
      )}

      {/* ── Category Manager Modal ─────────────────────────────────── */}
      {isCategoryModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in">
          <div className="w-full max-w-lg bg-[var(--bg-surface-2,#18181b)] border border-[var(--border-subtle,#27272a)] rounded-2xl shadow-2xl p-6 space-y-5">
            <div className="flex items-center justify-between border-b border-[var(--border-subtle,#27272a)] pb-3">
              <h3 className="text-sm font-bold text-[var(--text-primary,#ffffff)] flex items-center gap-2">
                <Tag className="size-4 text-[var(--pri,#4f46e5)]" />
                <span>Form Blueprint Categories</span>
              </h3>
              <button
                type="button"
                onClick={() => setIsCategoryModalOpen(false)}
                className="p-1 rounded-lg text-[var(--text-tertiary,#71717a)] hover:text-white cursor-pointer"
              >
                <X className="size-4" />
              </button>
            </div>

            {/* Existing Categories List */}
            <div className="space-y-2 max-h-56 overflow-y-auto">
              {activeCategories.map((cat) => (
                <div
                  key={cat.id || cat.slug}
                  className="flex items-center justify-between p-3 rounded-xl bg-[var(--bg-surface-3,#1b1b1d)] border border-[var(--border-subtle,#27272a)] text-xs"
                >
                  <div>
                    <span className="font-semibold text-[var(--text-primary,#ffffff)]">{cat.name}</span>
                    <span className="text-[10px] text-[var(--text-tertiary,#71717a)] font-mono ml-2">({cat.slug})</span>
                  </div>
                  {cat.is_system ? (
                    <span className="text-[9px] font-bold uppercase px-2 py-0.5 rounded bg-[var(--pri,#4f46e5)]/10 text-[var(--pri,#4f46e5)]">
                      System
                    </span>
                  ) : (
                    onDeleteCategory && (
                      <button
                        type="button"
                        onClick={() => onDeleteCategory(cat.id)}
                        className="p-1 rounded text-[var(--text-tertiary,#71717a)] hover:text-rose-400 cursor-pointer"
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    )
                  )}
                </div>
              ))}
            </div>

            {/* Add New Category */}
            {onCreateCategory && (
              <form onSubmit={handleCreateCategorySubmit} className="pt-3 border-t border-[var(--border-subtle,#27272a)] space-y-3">
                <h4 className="text-xs font-bold text-[var(--text-primary,#ffffff)]">Add New Category</h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <input
                    type="text"
                    placeholder="Category Name..."
                    value={newCatName}
                    onChange={(e) => setNewCatName(e.target.value)}
                    className="w-full h-8 px-3 rounded-xl bg-[var(--bg-surface,#09090b)] border border-[var(--border-subtle,#27272a)] text-xs text-[var(--text-primary,#ffffff)] focus:border-[var(--pri,#4f46e5)] focus:outline-none"
                  />
                  <input
                    type="text"
                    placeholder="Short description..."
                    value={newCatDesc}
                    onChange={(e) => setNewCatDesc(e.target.value)}
                    className="w-full h-8 px-3 rounded-xl bg-[var(--bg-surface,#09090b)] border border-[var(--border-subtle,#27272a)] text-xs text-[var(--text-primary,#ffffff)] focus:border-[var(--pri,#4f46e5)] focus:outline-none"
                  />
                </div>
                <div className="flex justify-end">
                  <button
                    type="submit"
                    disabled={!newCatName.trim()}
                    className="h-8 px-4 text-xs font-bold rounded-xl bg-[var(--pri,#f4f4f5)] text-[var(--primary-contrast,#09090b)] hover:opacity-90 transition cursor-pointer disabled:opacity-50"
                  >
                    Add Category
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* ── Create Custom Template Modal ──────────────────────────── */}
      {isCreateTemplateModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in">
          <div className="w-full max-w-md bg-[var(--bg-surface-2,#18181b)] border border-[var(--border-subtle,#27272a)] rounded-2xl shadow-2xl p-6 space-y-5">
            <div className="flex items-center justify-between border-b border-[var(--border-subtle,#27272a)] pb-3">
              <h3 className="text-sm font-bold text-[var(--text-primary,#ffffff)]">
                Create New Form Blueprint
              </h3>
              <button
                type="button"
                onClick={() => setIsCreateTemplateModalOpen(false)}
                className="p-1 rounded-lg text-[var(--text-tertiary,#71717a)] hover:text-white cursor-pointer"
              >
                <X className="size-4" />
              </button>
            </div>

            <form onSubmit={handleCreateTemplateSubmit} className="space-y-3.5">
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-secondary,#a1a1aa)]">
                  Template Name
                </label>
                <input
                  type="text"
                  placeholder="e.g. VIP Dinner Registration Questionnaire"
                  value={newTplName}
                  onChange={(e) => setNewTplName(e.target.value)}
                  className="w-full h-9 px-3 rounded-xl bg-[var(--bg-surface,#09090b)] border border-[var(--border-subtle,#27272a)] text-xs text-[var(--text-primary,#ffffff)] focus:border-[var(--pri,#4f46e5)] focus:outline-none"
                  required
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-secondary,#a1a1aa)]">
                  Form Category
                </label>
                <select
                  value={newTplCat}
                  onChange={(e) => setNewTplCat(e.target.value)}
                  className="w-full h-9 px-3 rounded-xl bg-[var(--bg-surface,#09090b)] border border-[var(--border-subtle,#27272a)] text-xs text-[var(--text-primary,#ffffff)] focus:border-[var(--pri,#4f46e5)] focus:outline-none cursor-pointer"
                >
                  {activeCategories.map((c) => (
                    <option key={c.id || c.slug} value={c.slug} className="bg-zinc-900 text-white">
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-secondary,#a1a1aa)]">
                  Description
                </label>
                <textarea
                  rows={3}
                  placeholder="Explain what this form questionnaire captures..."
                  value={newTplDesc}
                  onChange={(e) => setNewTplDesc(e.target.value)}
                  className="w-full p-3 rounded-xl bg-[var(--bg-surface,#09090b)] border border-[var(--border-subtle,#27272a)] text-xs text-[var(--text-primary,#ffffff)] focus:border-[var(--pri,#4f46e5)] focus:outline-none"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsCreateTemplateModalOpen(false)}
                  className="h-9 px-4 text-xs font-semibold rounded-xl border border-[var(--border-subtle,#27272a)] hover:bg-[var(--bg-surface-3,#1b1b1d)] text-[var(--text-secondary,#a1a1aa)] cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!newTplName.trim()}
                  className="h-9 px-4 text-xs font-bold rounded-xl bg-[var(--pri,#f4f4f5)] text-[var(--primary-contrast,#09090b)] hover:opacity-90 transition cursor-pointer disabled:opacity-50"
                >
                  Start Building Form
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Preview Modal ─────────────────────────────────────────── */}
      {previewTemplate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in">
          <div className="w-full max-w-2xl max-h-[90vh] bg-[var(--bg-surface-2,#18181b)] border border-[var(--border-subtle,#27272a)] rounded-2xl shadow-2xl flex flex-col overflow-hidden">
            <div className="h-14 border-b border-[var(--border-subtle,#27272a)] px-5 flex items-center justify-between shrink-0">
              <div>
                <h3 className="text-sm font-bold text-[var(--text-primary,#ffffff)]">{previewTemplate.name}</h3>
                <span className="text-[10px] text-[var(--pri,#4f46e5)] font-semibold">
                  Category: {previewTemplate.category_name || previewTemplate.category_key}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setPreviewTemplate(null)}
                className="p-1.5 rounded-lg text-[var(--text-tertiary,#71717a)] hover:text-white hover:bg-[var(--bg-surface-3,#1b1b1d)] cursor-pointer"
              >
                <X className="size-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6">
              <FormRenderer fields={previewTemplate.fields} settings={previewTemplate.settings} previewMode={true} />
            </div>

            <div className="h-14 border-t border-[var(--border-subtle,#27272a)] px-5 flex items-center justify-between shrink-0 bg-[var(--bg-surface-3,#1b1b1d)]">
              <span className="text-xs text-[var(--text-tertiary,#71717a)]">
                {previewTemplate.fields.length} questions in this template
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setPreviewTemplate(null)}
                  className="h-8 px-3.5 text-xs font-semibold rounded-xl border border-[var(--border-subtle,#27272a)] hover:bg-[var(--bg-surface-2,#18181b)] text-[var(--text-secondary,#a1a1aa)] cursor-pointer"
                >
                  Close Preview
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const t = previewTemplate;
                    setPreviewTemplate(null);
                    handleEditClick(t);
                  }}
                  className="h-8 px-4 text-xs font-bold rounded-xl bg-[var(--pri,#f4f4f5)] text-[var(--primary-contrast,#09090b)] hover:opacity-90 cursor-pointer shadow-sm flex items-center gap-1.5"
                >
                  <Edit3 className="size-3" />
                  <span>Edit in Designer</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
