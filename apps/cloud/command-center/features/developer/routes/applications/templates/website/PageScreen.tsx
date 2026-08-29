'use client';

import React, { useState, useMemo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Globe,
  Plus,
  Search,
  Eye,
  Edit3,
  Trash2,
  Sparkles,
  Monitor,
  Tablet,
  Smartphone,
  X,
  AlertCircle,
} from 'lucide-react';
import { EVENT_TEMPLATES, EventTemplateMeta, renderWebsiteDocument } from '@eventos/website-builder-studio';

interface TemplateItem {
  id: string;
  name: string;
  category: 'master' | 'tech' | 'medical' | 'hackathon' | 'academic' | 'expo' | 'gala' | 'custom';
  categoryLabel: string;
  description: string;
  isSystem: boolean;
  pagesCount: number;
  previewHtml: string;
  createDocument: () => ReturnType<EventTemplateMeta['createDocument']>;
}

const CATEGORY_FILTERS = [
  { id: 'all', label: 'All Templates' },
  { id: 'master', label: 'Global Master' },
  { id: 'tech', label: 'Tech & AI' },
  { id: 'medical', label: 'Medical' },
  { id: 'hackathon', label: 'Hackathon' },
  { id: 'academic', label: 'Academic' },
  { id: 'expo', label: 'Expo & Trade' },
  { id: 'gala', label: 'Gala & Awards' },
];

function generateTemplatePreviewHtml(doc: ReturnType<EventTemplateMeta['createDocument']>): string {
  try {
    const homePage = doc.pages.find((p) => p.isHomePage) || doc.pages[0];
    return renderWebsiteDocument(doc, homePage.id, 'preview').html;
  } catch {
    return '<html><body style="background:#080912;color:#ffffff;font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;"><div>Preview unavailable</div></body></html>';
  }
}

export default function WebsiteTemplatesPageScreen() {
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [previewTemplate, setPreviewTemplate] = useState<TemplateItem | null>(null);
  const [previewDevice, setPreviewDevice] = useState<'desktop' | 'tablet' | 'mobile'>('desktop');
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [customTemplates, setCustomTemplates] = useState<TemplateItem[]>([]);
  const [newTemplateName, setNewTemplateName] = useState('');
  const [newTemplateCategory, setNewTemplateCategory] = useState<'tech' | 'medical' | 'hackathon' | 'academic' | 'expo' | 'gala'>('tech');
  const [selectedBaseTemplateId, setSelectedBaseTemplateId] = useState<string>('template_tech_summit');

  // Master template definition
  const masterTemplateItem: TemplateItem = useMemo(() => {
    const techDoc = EVENT_TEMPLATES[0].createDocument();
    return {
      id: 'master-event-website',
      name: 'Master Event Website Template',
      category: 'master',
      categoryLabel: 'Global Master',
      description: 'Enterprise multi-page event blueprint with hero, speaker lineup, and registration tiers.',
      isSystem: true,
      pagesCount: 3,
      previewHtml: generateTemplatePreviewHtml(techDoc),
      createDocument: () => techDoc,
    };
  }, []);

  // Seeded event templates
  const seededTemplates: TemplateItem[] = useMemo(() => {
    return EVENT_TEMPLATES.map((t) => {
      const doc = t.createDocument();
      return {
        id: t.id,
        name: t.name,
        category: t.category,
        categoryLabel: CATEGORY_FILTERS.find((c) => c.id === t.category)?.label || t.category,
        description: t.description,
        isSystem: true,
        pagesCount: t.id === 'template_tech_summit' || t.id === 'template_medical_symposium' ? 3 : 2,
        previewHtml: generateTemplatePreviewHtml(doc),
        createDocument: t.createDocument,
      };
    });
  }, []);

  // Combined template library
  const allTemplates = useMemo(() => {
    return [masterTemplateItem, ...seededTemplates, ...customTemplates];
  }, [masterTemplateItem, seededTemplates, customTemplates]);

  // Filtered templates
  const filteredTemplates = useMemo(() => {
    return allTemplates.filter((t) => {
      const matchesSearch =
        t.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        t.description.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesCategory = selectedCategory === 'all' || t.category === selectedCategory;
      return matchesSearch && matchesCategory;
    });
  }, [allTemplates, searchQuery, selectedCategory]);

  const handleDelete = (templateId: string) => {
    if (confirm('Are you sure you want to delete this custom template?')) {
      setCustomTemplates((prev) => prev.filter((t) => t.id !== templateId));
    }
  };

  const handleCreateNew = () => {
    if (!newTemplateName.trim()) return;
    const base = EVENT_TEMPLATES.find((t) => t.id === selectedBaseTemplateId) || EVENT_TEMPLATES[0];
    const newId = `custom_${Date.now()}`;
    const doc = base.createDocument();
    const newItem: TemplateItem = {
      id: newId,
      name: newTemplateName.trim(),
      category: newTemplateCategory,
      categoryLabel: CATEGORY_FILTERS.find((c) => c.id === newTemplateCategory)?.label || 'Custom',
      description: `Custom event template created from ${base.name}.`,
      isSystem: false,
      pagesCount: 2,
      previewHtml: generateTemplatePreviewHtml(doc),
      createDocument: base.createDocument,
    };
    setCustomTemplates((prev) => [newItem, ...prev]);
    setIsCreateModalOpen(false);
    setNewTemplateName('');
    router.push(`/applications/templates/website/builder?templateId=${newId}`);
  };

  return (
    <div className="flex flex-col gap-6 p-6 min-h-full bg-[var(--bg-surface-2)] text-white font-sans">
      {/* ── Top Header Bar ─────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[var(--border-default)] pb-5">
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold bg-white/10 text-white border border-white/15">
              <Globe className="w-3.5 h-3.5 text-white" />
              DEVELOPER PLATFORM
            </span>
            <span className="text-xs text-neutral-300 font-medium">
              {allTemplates.length} Event Website Blueprints
            </span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-white">
            Website Templates
          </h1>
          <p className="text-sm text-neutral-300">
            Browse, preview, and customize enterprise multi-page event websites.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => setIsCreateModalOpen(true)}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-white hover:bg-neutral-200 text-black font-bold text-sm shadow-md transition-all cursor-pointer"
          >
            <Plus className="w-4 h-4 text-black" />
            Create Template
          </button>
        </div>
      </div>

      {/* ── Search & Category Filter Controls ──────────────────────────────── */}
      <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4">
        {/* Category Tabs */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 custom-scrollbar">
          {CATEGORY_FILTERS.map((cat) => {
            const isActive = selectedCategory === cat.id;
            return (
              <button
                key={cat.id}
                onClick={() => setSelectedCategory(cat.id)}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap transition-all cursor-pointer ${
                  isActive
                    ? 'bg-white text-black shadow-sm'
                    : 'bg-[var(--bg-surface-3)] text-neutral-300 hover:text-white hover:bg-[var(--bg-surface)] border border-[var(--border-default)]'
                }`}
              >
                {cat.label}
              </button>
            );
          })}
        </div>

        {/* Search Input */}
        <div className="relative min-w-[280px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search templates..."
            className="w-full pl-9 pr-8 py-2 text-xs rounded-lg bg-[var(--bg-surface-3)] border border-[var(--border-default)] text-white placeholder:text-neutral-400 focus:outline-none focus:border-white focus:ring-1 focus:ring-white transition-all"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-white"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* ── Template Cards Grid ────────────────────────────────────────────── */}
      {filteredTemplates.length === 0 ? (
        <div className="flex flex-col items-center justify-center p-12 text-center rounded-xl border border-dashed border-[var(--border-default)] bg-[var(--bg-surface)]">
          <AlertCircle className="w-8 h-8 text-neutral-400 mb-2" />
          <p className="text-sm font-bold text-white">No matching templates found</p>
          <p className="text-xs text-neutral-400 mt-1">Try selecting a different category or search term.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredTemplates.map((template) => {
            return (
              <div
                key={template.id}
                className="group relative flex flex-col rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface)] hover:border-white/40 hover:shadow-xl transition-all duration-200 overflow-hidden"
              >
                {/* ── Exact Miniature Desktop Iframe Preview ───────────────── */}
                <div className="relative w-full h-[200px] bg-[#080912] overflow-hidden border-b border-[var(--border-default)]">
                  {/* Category Pill */}
                  <div className="absolute top-3 left-3 z-20">
                    <span className="px-2.5 py-1 rounded-full text-[11px] font-bold bg-black/80 backdrop-blur-md text-white border border-white/15 shadow-sm">
                      {template.categoryLabel}
                    </span>
                  </div>

                  {/* Scaled Exact Desktop Website Viewport */}
                  <div className="w-full h-full relative overflow-hidden bg-[#080912]">
                    <iframe
                      title={template.name}
                      srcDoc={template.previewHtml}
                      className="w-[1200px] h-[750px] scale-[0.27] origin-top-left border-none pointer-events-none select-none bg-[#080912]"
                      tabIndex={-1}
                    />
                  </div>
                </div>

                {/* ── Card Content (Clean & Focused) ─────────────────────────── */}
                <div className="flex flex-col flex-1 p-4 gap-1.5">
                  <h3 className="text-sm font-bold text-white line-clamp-1">
                    {template.name}
                  </h3>
                  <p className="text-xs text-neutral-300 line-clamp-2 leading-relaxed">
                    {template.description}
                  </p>
                </div>

                {/* ── Card Footer Actions ──────────────────────────────────── */}
                <div className="flex items-center justify-between px-4 py-3 border-t border-[var(--border-default)] bg-[var(--bg-surface-3)]/60 gap-2">
                  <button
                    type="button"
                    onClick={() => setPreviewTemplate(template)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-white hover:bg-[var(--bg-surface)] border border-[var(--border-default)] transition-all cursor-pointer"
                  >
                    <Eye className="w-3.5 h-3.5 text-white" />
                    Preview
                  </button>

                  <div className="flex items-center gap-2">
                    {!template.isSystem && (
                      <button
                        type="button"
                        onClick={() => handleDelete(template.id)}
                        className="p-1.5 rounded-lg text-xs text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 transition-all cursor-pointer"
                        title="Delete custom template"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                    <Link
                      href={`/applications/templates/website/builder?templateId=${template.id}`}
                      className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-bold bg-white hover:bg-neutral-200 text-black shadow-sm transition-all"
                    >
                      <Edit3 className="w-3.5 h-3.5 text-black" />
                      Edit Template
                    </Link>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Live Preview Modal Dialog ──────────────────────────────────────── */}
      {previewTemplate && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/85 backdrop-blur-md p-4 animate-in fade-in duration-150">
          <div className="relative flex flex-col w-full max-w-6xl h-[90vh] rounded-2xl bg-[var(--bg-surface-2)] border border-[var(--border-default)] shadow-2xl overflow-hidden">
            {/* Modal Header */}
            <div className="flex items-center justify-between px-6 py-3.5 border-b border-[var(--border-default)] bg-[var(--bg-surface)]">
              <div className="flex items-center gap-3">
                <span className="font-bold text-sm text-white">
                  {previewTemplate.name}
                </span>
                <span className="px-2.5 py-0.5 rounded text-xs bg-white/10 text-white border border-white/15 font-bold">
                  {previewTemplate.categoryLabel}
                </span>
              </div>

              {/* Viewport Device Switcher */}
              <div className="flex items-center gap-1 bg-[var(--bg-surface-3)] p-1 rounded-lg border border-[var(--border-default)]">
                <button
                  onClick={() => setPreviewDevice('desktop')}
                  className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-bold transition-all cursor-pointer ${
                    previewDevice === 'desktop'
                      ? 'bg-white text-black shadow-sm'
                      : 'text-neutral-300 hover:text-white'
                  }`}
                >
                  <Monitor className="w-3.5 h-3.5" />
                  Desktop
                </button>
                <button
                  onClick={() => setPreviewDevice('tablet')}
                  className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-bold transition-all cursor-pointer ${
                    previewDevice === 'tablet'
                      ? 'bg-white text-black shadow-sm'
                      : 'text-neutral-300 hover:text-white'
                  }`}
                >
                  <Tablet className="w-3.5 h-3.5" />
                  Tablet
                </button>
                <button
                  onClick={() => setPreviewDevice('mobile')}
                  className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-bold transition-all cursor-pointer ${
                    previewDevice === 'mobile'
                      ? 'bg-white text-black shadow-sm'
                      : 'text-neutral-300 hover:text-white'
                  }`}
                >
                  <Smartphone className="w-3.5 h-3.5" />
                  Mobile
                </button>
              </div>

              {/* Actions */}
              <div className="flex items-center gap-2">
                <Link
                  href={`/applications/templates/website/builder?templateId=${previewTemplate.id}`}
                  className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-bold bg-white text-black hover:bg-neutral-200 transition-all shadow-sm"
                >
                  <Edit3 className="w-3.5 h-3.5 text-black" />
                  Open in Builder
                </Link>
                <button
                  onClick={() => setPreviewTemplate(null)}
                  className="p-1.5 rounded-lg text-neutral-300 hover:text-white hover:bg-[var(--bg-surface)] transition-colors cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Viewport Frame */}
            <div className="flex-1 bg-black/70 p-4 flex items-center justify-center overflow-auto">
              <div
                className="h-full bg-[#080912] rounded-xl border border-[var(--border-default)] shadow-2xl overflow-hidden transition-all duration-300"
                style={{
                  width:
                    previewDevice === 'desktop'
                      ? '100%'
                      : previewDevice === 'tablet'
                      ? '768px'
                      : '375px',
                  maxWidth: '100%',
                }}
              >
                <iframe
                  srcDoc={previewTemplate.previewHtml}
                  title="Website Template Preview"
                  className="w-full h-full border-0 bg-[#080912]"
                  sandbox="allow-scripts allow-same-origin"
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Create New Template Modal Dialog ───────────────────────────────── */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/85 backdrop-blur-md p-4 animate-in fade-in duration-150">
          <div className="flex flex-col w-full max-w-lg rounded-2xl bg-[var(--bg-surface-2)] border border-[var(--border-default)] shadow-2xl overflow-hidden p-6 gap-5">
            <div className="flex items-center justify-between border-b border-[var(--border-default)] pb-3.5">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-lg bg-white/10 text-white">
                  <Sparkles className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h2 className="text-base font-bold text-white">Create Event Website Template</h2>
                  <p className="text-xs text-neutral-300">Choose a starting blueprint to customize in the Studio</p>
                </div>
              </div>
              <button
                onClick={() => setIsCreateModalOpen(false)}
                className="text-neutral-400 hover:text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex flex-col gap-4">
              <div>
                <label className="text-xs font-bold text-white block mb-1.5">
                  Template Name *
                </label>
                <input
                  type="text"
                  value={newTemplateName}
                  onChange={(e) => setNewTemplateName(e.target.value)}
                  placeholder="e.g., Global AI Summit 2026"
                  className="w-full px-3.5 py-2 text-sm rounded-lg bg-[var(--bg-surface-3)] border border-[var(--border-default)] text-white placeholder:text-neutral-400 focus:outline-none focus:border-white focus:ring-1 focus:ring-white transition-all"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-white block mb-1.5">
                  Category
                </label>
                <select
                  value={newTemplateCategory}
                  onChange={(e) => setNewTemplateCategory(e.target.value as any)}
                  className="w-full px-3.5 py-2 text-sm rounded-lg bg-[var(--bg-surface-3)] border border-[var(--border-default)] text-white focus:outline-none focus:border-white focus:ring-1 focus:ring-white transition-all cursor-pointer"
                >
                  <option value="tech">Tech & AI Summit</option>
                  <option value="medical">Medical & Clinical Symposium</option>
                  <option value="hackathon">Hackathon & Builder</option>
                  <option value="academic">Academic & Science Congress</option>
                  <option value="expo">B2B Trade Show & Expo</option>
                  <option value="gala">Gala Dinner & Awards</option>
                </select>
              </div>

              <div>
                <label className="text-xs font-bold text-white block mb-1.5">
                  Starting Blueprint
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {EVENT_TEMPLATES.map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => setSelectedBaseTemplateId(t.id)}
                      className={`p-2.5 rounded-lg border text-left flex flex-col gap-1 transition-all cursor-pointer ${
                        selectedBaseTemplateId === t.id
                          ? 'border-white bg-white/10 text-white'
                          : 'border-[var(--border-default)] bg-[var(--bg-surface-3)] hover:bg-[var(--bg-surface)] text-neutral-300'
                      }`}
                    >
                      <span className="text-xs font-bold text-white line-clamp-1">{t.name}</span>
                      <span className="text-[10px] uppercase font-bold text-neutral-400">{t.category}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 border-t border-[var(--border-default)] pt-4 mt-2">
              <button
                type="button"
                onClick={() => setIsCreateModalOpen(false)}
                className="px-4 py-2 rounded-lg text-xs font-bold text-neutral-300 hover:text-white hover:bg-[var(--bg-surface)] transition-all cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleCreateNew}
                disabled={!newTemplateName.trim()}
                className="px-4 py-2 rounded-lg text-xs font-bold bg-white text-black hover:bg-neutral-200 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-md cursor-pointer"
              >
                Create & Open Studio
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
