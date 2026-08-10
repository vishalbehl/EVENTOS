'use client';

import React, { useState } from 'react';
import dynamic from 'next/dynamic';
import {
  Plus,
  Search,
  Globe,
  Eye,
  Edit3,
  Copy,
  Trash2,
  Monitor,
  Tablet,
  Smartphone,
  Check,
  X,
  Sparkles,
  ArrowLeft,
  Loader2,
  Calendar,
  Layers,
} from 'lucide-react';
import type { WebsiteProjectData, WebsiteBuilderStudioProps, EventDataSnapshot } from '@eventos/website-builder-studio';

// Dynamically load WebsiteBuilderStudio for SSR compatibility
const WebsiteBuilderStudio = dynamic<WebsiteBuilderStudioProps>(
  () => import('@eventos/website-builder-studio').then((mod) => mod.WebsiteBuilderStudio),
  {
    ssr: false,
    loading: () => (
      <div className="h-screen w-screen flex items-center justify-center bg-background text-foreground">
        <Loader2 className="h-8 w-8 text-primary animate-spin" />
        <span className="ml-3 font-semibold text-muted-foreground">Loading Website Studio...</span>
      </div>
    ),
  }
);

interface WebsiteTemplateRecord {
  id: string;
  name: string;
  category: string;
  description: string;
  status: 'PUBLISHED' | 'DRAFT';
  version: string;
  updatedAt: string;
  html: string;
  css: string;
}

const DEFAULT_TEMPLATES: WebsiteTemplateRecord[] = [
  {
    id: 'tpl-global-summit',
    name: 'Global Tech Summit 2026',
    category: 'Conference',
    description: 'High-impact glassmorphism hero banner, keynote speaker grid, agenda timeline, and sponsor wall.',
    status: 'PUBLISHED',
    version: 'v1.4',
    updatedAt: '2 hours ago',
    html: `
      <section style="position: relative; min-height: 85vh; display: flex; align-items: center; justify-content: center; background: linear-gradient(135deg, #090d16 0%, #161032 50%, #090d16 100%); color: #ffffff; padding: 80px 24px; text-align: center;">
        <div style="max-width: 900px; margin: 0 auto;">
          <div style="display: inline-flex; align-items: center; gap: 8px; background: rgba(255,255,255,0.08); border: 1px solid rgba(255,255,255,0.15); padding: 8px 18px; border-radius: 999px; font-size: 14px; font-weight: 600; color: #a78bfa; margin-bottom: 24px;">
            <span>📅 October 24 - 26, 2026</span>
            <span>•</span>
            <span>📍 San Francisco, CA</span>
          </div>
          <h1 style="font-size: 54px; font-weight: 800; line-height: 1.15; margin: 0 0 20px 0;">
            Global Tech Summit 2026
          </h1>
          <p style="font-size: 20px; color: #94a3b8; max-width: 680px; margin: 0 auto 36px auto;">
            Join world-class industry leaders, researchers, and innovators for three days of breakthrough insights.
          </p>
          <a href="#register" style="background: #7c3aed; color: #ffffff; padding: 16px 36px; border-radius: 12px; font-weight: 700; text-decoration: none; display: inline-block;">
            Register Now
          </a>
        </div>
      </section>
    `,
    css: '',
  },
  {
    id: 'tpl-academic-symposium',
    name: 'International Academic Symposium',
    category: 'Academic',
    description: 'Clean minimalist layout tailored for research papers, keynotes, committee members, and proceedings.',
    status: 'PUBLISHED',
    version: 'v1.1',
    updatedAt: '1 day ago',
    html: `
      <section style="padding: 90px 24px; background: #080912; color: #ffffff; text-align: center;">
        <div style="max-width: 800px; margin: 0 auto;">
          <span style="color: #f43f5e; font-weight: 700; text-transform: uppercase; letter-spacing: 0.1em; font-size: 13px;">Call for Papers & Submissions</span>
          <h1 style="font-size: 48px; font-weight: 800; margin: 16px 0;">International Academic Symposium 2026</h1>
          <p style="font-size: 18px; color: #94a3b8; line-height: 1.6; margin-bottom: 32px;">Advancing scientific frontiers through peer-reviewed research and interdisciplinary collaboration.</p>
          <a href="#submit" style="background: #f43f5e; color: #ffffff; padding: 14px 32px; border-radius: 10px; font-weight: 700; text-decoration: none;">Submit Abstract</a>
        </div>
      </section>
    `,
    css: '',
  },
  {
    id: 'tpl-expo-showcase',
    name: 'Global Trade Expo & Showcase',
    category: 'Expo',
    description: 'Tiered sponsor logo gallery, interactive floorplan placeholder, partner hotels, and attendee passes.',
    status: 'DRAFT',
    version: 'v0.9',
    updatedAt: '3 days ago',
    html: `
      <section style="padding: 80px 24px; background: #0c0e1a; color: #ffffff; text-align: center;">
        <div style="max-width: 1000px; margin: 0 auto;">
          <h1 style="font-size: 52px; font-weight: 900; margin-bottom: 20px;">Global Trade Expo 2026</h1>
          <p style="font-size: 20px; color: #94a3b8; margin-bottom: 40px;">The premier industrial exhibition featuring 200+ global brands and live product demonstrations.</p>
          <a href="#passes" style="background: #a78bfa; color: #080912; padding: 16px 36px; border-radius: 12px; font-weight: 800; text-decoration: none;">Get Visitor Pass</a>
        </div>
      </section>
    `,
    css: '',
  },
];

const MOCK_EVENT_SNAPSHOT: EventDataSnapshot = {
  eventName: 'Global Tech Summit 2026',
  startDate: '2026-10-24T09:00:00Z',
  endDate: '2026-10-26T18:00:00Z',
  snapshotId: 'snap-mock',
  snapshotCreatedAt: new Date().toISOString(),
  venue: {
    name: 'Moscone Center',
    address: '747 Howard St',
    city: 'San Francisco',
    country: 'USA',
  },
  speakers: [
    { id: 'spk1', name: 'Dr. Sarah Chen', designation: 'AI Researcher', speakerType: 'KEYNOTE', photo: 'https://i.pravatar.cc/150?u=a042581f4e29026704d' },
    { id: 'spk2', name: 'Prof. James Park', designation: 'Director of ML', speakerType: 'KEYNOTE', photo: 'https://i.pravatar.cc/150?u=a042581f4e29026704e' },
    { id: 'spk3', name: 'Elena Rostova', designation: 'Chief Architect', speakerType: 'INVITED', photo: 'https://i.pravatar.cc/150?u=a04258114e29026702d' },
    { id: 'spk4', name: 'Michael Chang', designation: 'VP Engineering', speakerType: 'INVITED', photo: 'https://i.pravatar.cc/150?u=a04258a2462d826712d' },
  ],
  sessions: [
    { id: 'sess1', title: 'The Future of General AI', date: '2026-10-24', startTime: '09:00', endTime: '10:30', sessionType: 'KEYNOTE', track: 'AI/ML', speakerIds: ['spk1', 'spk2'] },
    { id: 'sess2', title: 'Scaling Microservices', date: '2026-10-24', startTime: '11:00', endTime: '12:00', sessionType: 'PANEL', track: 'Architecture', speakerIds: ['spk3'] },
  ],
  sponsors: [
    { id: 'spo1', name: 'Acme Corp', tier: 'PLATINUM', logoUrl: 'https://ui-avatars.com/api/?name=ACME&background=random' },
    { id: 'spo2', name: 'GlobalNet', tier: 'GOLD', logoUrl: 'https://ui-avatars.com/api/?name=GL&background=random' },
  ],
  ticketCategories: [
    { id: 't1', name: 'Early Bird', price: 499, currency: 'USD', benefits: ['Full Access', 'Lunch Included'] },
    { id: 't2', name: 'Standard Pass', price: 799, currency: 'USD', benefits: ['Full Access', 'Lunch Included', 'Gala Dinner'] },
  ],
  importantDates: [
    { id: 'd1', label: 'Abstract Submission', date: '2026-08-31', type: 'ABSTRACT' },
    { id: 'd2', label: 'Early Bird Ends', date: '2026-09-15', type: 'EARLY_BIRD' },
  ],
  stats: { totalDelegates: 5000, totalCountries: 45 },
};

export default function WebsiteTemplateStudioScreen() {
  const [templates, setTemplates] = useState<WebsiteTemplateRecord[]>(DEFAULT_TEMPLATES);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [activeTemplateId, setActiveTemplateId] = useState<string | null>(null);

  // Modals state
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [previewModalTemplate, setPreviewModalTemplate] = useState<WebsiteTemplateRecord | null>(null);
  const [previewDevice, setPreviewDevice] = useState<'desktop' | 'tablet' | 'mobile'>('desktop');

  // New Template Form
  const [newTplName, setNewTplName] = useState('');
  const [newTplCategory, setNewTplCategory] = useState('Conference');
  const [newTplPreset, setNewTplPreset] = useState('tpl-global-summit');

  // Filter templates
  const filteredTemplates = templates.filter((tpl) => {
    const matchesSearch = tpl.name.toLowerCase().includes(searchQuery.toLowerCase()) || tpl.description.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory = selectedCategory === 'ALL' || tpl.category.toUpperCase() === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  const activeTemplate = templates.find((t) => t.id === activeTemplateId);

  const handleCreateNewTemplate = () => {
    if (!newTplName.trim()) return;
    const preset = templates.find((t) => t.id === newTplPreset) || templates[0];
    const newRecord: WebsiteTemplateRecord = {
      id: `tpl-${Date.now()}`,
      name: newTplName.trim(),
      category: newTplCategory,
      description: `Custom website template created from ${preset.name}.`,
      status: 'DRAFT',
      version: 'v1.0',
      updatedAt: 'Just now',
      html: preset.html,
      css: preset.css,
    };

    setTemplates([newRecord, ...templates]);
    setCreateModalOpen(false);
    setNewTplName('');
    setActiveTemplateId(newRecord.id);
  };

  const handleDuplicate = (tpl: WebsiteTemplateRecord) => {
    const duplicated: WebsiteTemplateRecord = {
      ...tpl,
      id: `tpl-${Date.now()}`,
      name: `${tpl.name} (Copy)`,
      status: 'DRAFT',
      updatedAt: 'Just now',
    };
    setTemplates([duplicated, ...templates]);
  };

  const handleDelete = (id: string) => {
    if (window.confirm('Are you sure you want to delete this website template?')) {
      setTemplates(templates.filter((t) => t.id !== id));
    }
  };

  const handleSaveFromStudio = async (data: WebsiteProjectData) => {
    if (!activeTemplateId) return;
    setTemplates((prev) =>
      prev.map((t) =>
        t.id === activeTemplateId
          ? {
              ...t,
              html: data.html || t.html,
              css: data.css || t.css,
              updatedAt: 'Just now',
            }
          : t
      )
    );
  };

  const handlePublishFromStudio = async (data: WebsiteProjectData) => {
    if (!activeTemplateId) return;
    setTemplates((prev) =>
      prev.map((t) =>
        t.id === activeTemplateId
          ? {
              ...t,
              html: data.html || t.html,
              css: data.css || t.css,
              status: 'PUBLISHED',
              updatedAt: 'Just now',
            }
          : t
      )
    );
    alert('🎉 Website template published successfully!');
  };

  // If a template is actively open in studio, render the GrapesJS Studio view
  if (activeTemplateId && activeTemplate) {
    return (
      <div className="flex h-full min-h-0 flex-1 overflow-hidden">
        <WebsiteBuilderStudio
          mode="GLOBAL_ADMIN"
          initialData={{
            id: activeTemplate.id,
            name: activeTemplate.name,
            html: activeTemplate.html,
            css: activeTemplate.css,
          }}
          eventSnapshot={MOCK_EVENT_SNAPSHOT}
          onSave={handleSaveFromStudio}
          onPublish={handlePublishFromStudio}
          onBack={() => setActiveTemplateId(null)}
        />
      </div>
    );
  }

  // First Page: Catalog View & Creation Screen
  return (
    <div className="flex flex-col h-full min-h-0 flex-1 overflow-y-auto bg-background text-foreground p-6 md:p-8">
      {/* Header Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6 border-b border-white/10 mb-8">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <span className="p-2 rounded-xl bg-purple-500/10 text-purple-400 border border-purple-500/20">
              <Globe className="h-6 w-6" />
            </span>
            <h1 className="text-2xl font-bold text-white tracking-tight">Website Landing Templates</h1>
            <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
              Application Console
            </span>
          </div>
          <p className="text-sm text-slate-400">
            Manage global landing page templates, curated section blocks, and design presets across the platform.
          </p>
        </div>

        <button
          onClick={() => setCreateModalOpen(true)}
          className="inline-flex items-center gap-2 bg-purple-600 hover:bg-purple-500 text-white font-semibold text-sm px-5 py-2.5 rounded-xl shadow-lg shadow-purple-600/30 transition-all cursor-pointer"
        >
          <Plus className="h-4 w-4" /> Create Website Template
        </button>
      </div>

      {/* Toolbar & Filter Options */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 mb-6">
        {/* Search Input */}
        <div className="relative w-full sm:w-80">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <input
            type="text"
            placeholder="Search templates..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-white/[0.04] border border-white/10 rounded-xl text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-purple-500"
          />
        </div>

        {/* Category Tabs */}
        <div className="flex items-center gap-1.5 p-1 bg-white/[0.04] border border-white/10 rounded-xl overflow-x-auto w-full sm:w-auto">
          {['ALL', 'CONFERENCE', 'ACADEMIC', 'EXPO'].map((cat) => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                selectedCategory === cat
                  ? 'bg-purple-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              {cat === 'ALL' ? 'All Templates' : cat}
            </button>
          ))}
        </div>
      </div>

      {/* Template Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredTemplates.map((tpl) => (
          <div
            key={tpl.id}
            className="group bg-card border border-border hover:border-primary/50 rounded-2xl p-5 transition-all flex flex-col justify-between"
          >
            <div>
              {/* Card Top Details */}
              <div className="flex items-center justify-between mb-3">
                <span className="text-[11px] font-bold tracking-wider uppercase px-2.5 py-1 rounded-md bg-white/5 text-purple-400 border border-white/10">
                  {tpl.category}
                </span>
                <span
                  className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider ${
                    tpl.status === 'PUBLISHED'
                      ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                      : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                  }`}
                >
                  {tpl.status}
                </span>
              </div>

              <h3 className="text-lg font-bold text-white mb-2 group-hover:text-purple-300 transition-colors">
                {tpl.name}
              </h3>
              <p className="text-xs text-slate-400 line-clamp-2 leading-relaxed mb-4">
                {tpl.description}
              </p>
            </div>

            {/* Card Footer Actions */}
            <div className="pt-4 border-t border-white/5 flex items-center justify-between gap-2">
              <span className="text-[11px] text-slate-500 font-medium">Updated {tpl.updatedAt}</span>

              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => setPreviewModalTemplate(tpl)}
                  className="p-2 rounded-lg bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white transition-all cursor-pointer"
                  title="Live Preview"
                >
                  <Eye className="h-4 w-4" />
                </button>
                <button
                  onClick={() => handleDuplicate(tpl)}
                  className="p-2 rounded-lg bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white transition-all cursor-pointer"
                  title="Duplicate Template"
                >
                  <Copy className="h-4 w-4" />
                </button>
                <button
                  onClick={() => handleDelete(tpl.id)}
                  className="p-2 rounded-lg bg-white/5 hover:bg-red-500/20 text-slate-400 hover:text-red-400 transition-all cursor-pointer"
                  title="Delete Template"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
                <button
                  onClick={() => setActiveTemplateId(tpl.id)}
                  className="inline-flex items-center gap-1.5 bg-purple-600/20 hover:bg-purple-600 text-purple-300 hover:text-white font-semibold text-xs px-3.5 py-2 rounded-lg border border-purple-500/30 transition-all cursor-pointer"
                >
                  <Edit3 className="h-3.5 w-3.5" /> Edit Studio
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Live Preview Modal */}
      {previewModalTemplate && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-card border border-border rounded-2xl w-full max-w-5xl h-[85vh] flex flex-col overflow-hidden shadow-2xl">
            {/* Modal Header */}
            <div className="px-6 py-4 border-b border-border flex items-center justify-between bg-background">
              <div>
                <h3 className="text-base font-bold text-white">{previewModalTemplate.name}</h3>
                <span className="text-xs text-purple-400">Template Live Preview</span>
              </div>

              {/* Viewport device switchers */}
              <div className="flex items-center gap-1 bg-white/5 p-1 rounded-xl border border-white/10">
                <button
                  onClick={() => setPreviewDevice('desktop')}
                  className={`px-3 py-1 rounded-lg text-xs font-semibold flex items-center gap-1.5 ${
                    previewDevice === 'desktop' ? 'bg-purple-600 text-white' : 'text-slate-400'
                  }`}
                >
                  <Monitor className="h-3.5 w-3.5" /> Desktop
                </button>
                <button
                  onClick={() => setPreviewDevice('tablet')}
                  className={`px-3 py-1 rounded-lg text-xs font-semibold flex items-center gap-1.5 ${
                    previewDevice === 'tablet' ? 'bg-purple-600 text-white' : 'text-slate-400'
                  }`}
                >
                  <Tablet className="h-3.5 w-3.5" /> Tablet
                </button>
                <button
                  onClick={() => setPreviewDevice('mobile')}
                  className={`px-3 py-1 rounded-lg text-xs font-semibold flex items-center gap-1.5 ${
                    previewDevice === 'mobile' ? 'bg-purple-600 text-white' : 'text-slate-400'
                  }`}
                >
                  <Smartphone className="h-3.5 w-3.5" /> Mobile
                </button>
              </div>

              <button
                onClick={() => setPreviewModalTemplate(null)}
                className="text-slate-400 hover:text-white p-2"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Preview Frame */}
            <div className="flex-1 bg-background flex items-center justify-center p-4 overflow-hidden">
              <iframe
                srcDoc={`<!DOCTYPE html><html><head><style>body { margin: 0; font-family: sans-serif; background: #080912; color: #fff; }</style></head><body>${previewModalTemplate.html}</body></html>`}
                title="Template Preview"
                className="bg-[#080912] transition-all border border-white/10 rounded-xl shadow-2xl h-full"
                style={{
                  width:
                    previewDevice === 'desktop'
                      ? '100%'
                      : previewDevice === 'tablet'
                      ? '768px'
                      : '375px',
                }}
              />
            </div>
          </div>
        </div>
      )}

      {/* Create Template Modal */}
      {createModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-card border border-border rounded-2xl w-full max-w-lg p-6 shadow-2xl">
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-purple-400" /> Create Website Template
              </h3>
              <button onClick={() => setCreateModalOpen(false)} className="text-slate-400 hover:text-white">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                  Template Name
                </label>
                <input
                  type="text"
                  placeholder="e.g., Global AI Summit 2026"
                  value={newTplName}
                  onChange={(e) => setNewTplName(e.target.value)}
                  className="w-full px-4 py-2.5 bg-white/[0.04] border border-white/10 rounded-xl text-sm text-white focus:outline-none focus:border-purple-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                  Category
                </label>
                <select
                  value={newTplCategory}
                  onChange={(e) => setNewTplCategory(e.target.value)}
                  className="w-full px-4 py-2.5 bg-[#080912] border border-white/10 rounded-xl text-sm text-white focus:outline-none focus:border-purple-500"
                >
                  <option value="Conference">Conference</option>
                  <option value="Academic">Academic</option>
                  <option value="Expo">Expo & Trade Show</option>
                  <option value="Webinar">Webinar / Single-Page</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                  Starter Preset
                </label>
                <select
                  value={newTplPreset}
                  onChange={(e) => setNewTplPreset(e.target.value)}
                  className="w-full px-4 py-2.5 bg-[#080912] border border-white/10 rounded-xl text-sm text-white focus:outline-none focus:border-purple-500"
                >
                  {templates.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name} ({t.category})
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-white/10">
              <button
                onClick={() => setCreateModalOpen(false)}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-400 hover:text-white"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateNewTemplate}
                className="px-5 py-2 rounded-xl text-xs font-semibold bg-purple-600 hover:bg-purple-500 text-white shadow-lg shadow-purple-600/30"
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
