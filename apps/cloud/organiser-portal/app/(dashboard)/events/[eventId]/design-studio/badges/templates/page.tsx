"use client";

import React, { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  CreditCard,
  LayoutTemplate,
  ArrowRight,
  Eye,
  CheckCircle2,
  Sparkles,
  ExternalLink,
  QrCode,
  Printer,
  X,
  Plus,
} from "lucide-react";
import { toast } from "sonner";
import { OrganiserPage } from "@/components/organizer/workspace/OrganiserPrimitives";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

interface BadgeTemplateBlueprint {
  id: string;
  name: string;
  category: "Standard" | "VIP" | "Faculty" | "Exhibitor" | "Plastic Card";
  dimensions: string;
  description: string;
  accentColor: string;
  tags: string[];
}

const BADGE_TEMPLATES: BadgeTemplateBlueprint[] = [
  {
    id: "tpl-standard-delegate-76x100",
    name: "Standard Delegate Conference Badge",
    category: "Standard",
    dimensions: "76 x 100 mm (Portrait)",
    description: "Classic vertical thermal badge with prominent attendee name, designation, company, country, dynamic role color band, and high-density check-in QR code.",
    accentColor: "#6366F1",
    tags: ["High-Contrast QR", "Role Banner", "Thermal Ready"],
  },
  {
    id: "tpl-vip-all-access-gold",
    name: "VIP All-Access Executive Badge",
    category: "VIP",
    dimensions: "76 x 100 mm (Portrait)",
    description: "Premium obsidian backdrop with metallic gold accents, VIP lounge access badge icon, attendee headshot avatar, and security hologram watermark.",
    accentColor: "#F59E0B",
    tags: ["Gold Foil Accent", "Headshot Photo", "All-Access"],
  },
  {
    id: "tpl-faculty-speaker-badge",
    name: "Faculty & Keynote Speaker Badge",
    category: "Faculty",
    dimensions: "76 x 100 mm (Portrait)",
    description: "Distinguished sapphire blue header with faculty accreditation, session code schedule list on reverse, and green room entry badge.",
    accentColor: "#3B82F6",
    tags: ["Session Codes", "Speaker Tag", "Green Room Access"],
  },
  {
    id: "tpl-exhibitor-booth-staff",
    name: "Exhibitor & Sponsor Booth Staff",
    category: "Exhibitor",
    dimensions: "76 x 100 mm (Portrait)",
    description: "Emerald green badge layout with prominent company logo, booth hall number, lead retrieval QR code, and staff credentials.",
    accentColor: "#10B981",
    tags: ["Booth Number", "Lead Retrieval", "Company Logo"],
  },
  {
    id: "tpl-cr80-plastic-card",
    name: "CR80 PVC Plastic Card (Landscape)",
    category: "Plastic Card",
    dimensions: "85.6 x 54 mm (Landscape)",
    description: "Standard credit-card size PVC card layout suitable for zebra card printers, contactless RFID chip encoding, and barcode scanners.",
    accentColor: "#8B5CF6",
    tags: ["CR80 Card", "Barcode / RFID", "Double Sided"],
  },
];

export default function BadgeTemplatesPage() {
  const params = useParams();
  const router = useRouter();
  const eventId = (params?.eventId as string) || "";

  const [selectedCategory, setSelectedCategory] = useState<string>("All");
  const [previewTemplate, setPreviewTemplate] = useState<BadgeTemplateBlueprint | null>(null);

  const categories = ["All", "Standard", "VIP", "Faculty", "Exhibitor", "Plastic Card"];

  const filtered =
    selectedCategory === "All"
      ? BADGE_TEMPLATES
      : BADGE_TEMPLATES.filter((t) => t.category === selectedCategory);

  const handleUseTemplate = (template: BadgeTemplateBlueprint) => {
    toast.success(`Opening "${template.name}" in Badge Designer...`);
    router.push(`/events/${eventId}/design-studio/badges/designer`);
  };

  return (
    <OrganiserPage
      title="Badge Blueprint Templates"
      description="Choose standard thermal paper or PVC plastic badge blueprints, customize typography and QR placeholders, and assign to event roles."
      actions={
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => router.push(`/events/${eventId}/design-studio/badges/settings`)}
            className="h-8 text-xs font-semibold gap-1.5 border-[var(--border-default)] cursor-pointer"
          >
            <CreditCard className="size-3.5 text-[var(--pri,#4f46e5)]" />
            Badge Role Settings
          </Button>

          <Button
            size="sm"
            onClick={() => router.push(`/events/${eventId}/design-studio/badges/designer`)}
            className="h-8 text-xs font-semibold gap-1.5 bg-[var(--pri,#4f46e5)] text-white hover:bg-[var(--pri-hover,#4338ca)] cursor-pointer"
          >
            <Plus className="size-3.5" />
            Create Custom Badge
          </Button>
        </div>
      }
    >
      {/* Category Filter Pills */}
      <div className="flex items-center gap-2 mb-6 overflow-x-auto pb-1">
        {categories.map((cat) => (
          <button
            key={cat}
            onClick={() => setSelectedCategory(cat)}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
              selectedCategory === cat
                ? "bg-[var(--pri,#4f46e5)] text-white shadow-sm"
                : "bg-[var(--surface-panel,#18181b)] text-[var(--text-secondary,#a1a1aa)] border border-[var(--border-default,#27272a)] hover:text-white"
            }`}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* Templates Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {filtered.map((tpl) => (
          <div
            key={tpl.id}
            className="group rounded-2xl bg-[var(--surface-panel,#18181b)] border border-[var(--border-default,#27272a)] p-5 transition-all hover:border-[var(--pri,#4f46e5)]/50 hover:shadow-xl flex flex-col justify-between"
          >
            <div className="space-y-3">
              {/* Badge Visual Mockup Card */}
              <div
                className="h-36 rounded-xl border border-zinc-800 p-3.5 flex flex-col justify-between relative overflow-hidden bg-gradient-to-b from-zinc-900 to-zinc-950"
                style={{ borderTop: `4px solid ${tpl.accentColor}` }}
              >
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-black uppercase tracking-widest text-zinc-400">EVENTOS 2026</span>
                  <Badge className="bg-black/60 border-white/10 text-[9px] font-bold text-white uppercase">
                    {tpl.dimensions}
                  </Badge>
                </div>

                <div className="space-y-1">
                  <div className="h-4 w-32 bg-zinc-700/60 rounded" />
                  <div className="h-2.5 w-24 bg-zinc-800 rounded" />
                </div>

                <div className="flex items-center justify-between pt-2 border-t border-zinc-800/80">
                  <span
                    className="text-[9px] font-black uppercase px-2 py-0.5 rounded"
                    style={{ backgroundColor: `${tpl.accentColor}20`, color: tpl.accentColor }}
                  >
                    {tpl.category} PASS
                  </span>
                  <QrCode className="size-5 text-zinc-400" />
                </div>
              </div>

              <div>
                <h3 className="text-sm font-bold text-[var(--text-primary,#fff)] group-hover:text-[var(--pri,#4f46e5)] transition-colors">
                  {tpl.name}
                </h3>
                <p className="text-xs text-[var(--text-secondary,#a1a1aa)] mt-1 leading-relaxed">{tpl.description}</p>
              </div>

              <div className="flex flex-wrap gap-1 pt-1">
                {tpl.tags.map((tag, i) => (
                  <span
                    key={i}
                    className="text-[10px] px-2 py-0.5 rounded bg-[var(--surface-ground,#09090b)] border border-[var(--border-default,#27272a)] text-zinc-400"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            </div>

            <div className="pt-4 mt-4 border-t border-[var(--border-default,#27272a)] flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPreviewTemplate(tpl)}
                className="flex-1 h-8 text-xs font-semibold gap-1 border-[var(--border-default)] cursor-pointer"
              >
                <Eye className="size-3.5 text-[var(--pri,#4f46e5)]" />
                Preview
              </Button>
              <Button
                size="sm"
                onClick={() => handleUseTemplate(tpl)}
                className="flex-1 h-8 text-xs font-semibold gap-1 bg-[var(--pri,#4f46e5)] text-white hover:bg-[var(--pri-hover,#4338ca)] cursor-pointer"
              >
                <Sparkles className="size-3.5" />
                Customize
              </Button>
            </div>
          </div>
        ))}
      </div>

      {/* Preview Modal */}
      <AnimatePresence>
        {previewTemplate && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-[var(--surface-panel,#18181b)] border border-[var(--border-default,#27272a)] rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl flex flex-col"
            >
              <div className="p-4 border-b border-[var(--border-default,#27272a)] flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-white flex items-center gap-2">
                    <CreditCard className="size-4 text-[var(--pri,#4f46e5)]" />
                    {previewTemplate.name}
                  </h3>
                  <p className="text-xs text-[var(--text-secondary,#a1a1aa)]">{previewTemplate.dimensions}</p>
                </div>
                <button
                  onClick={() => setPreviewTemplate(null)}
                  className="size-8 rounded-lg flex items-center justify-center text-zinc-400 hover:text-white hover:bg-zinc-800 cursor-pointer"
                >
                  <X className="size-4" />
                </button>
              </div>

              <div className="p-6 space-y-4 flex flex-col items-center">
                {/* Large Preview */}
                <div
                  className="w-56 h-72 rounded-2xl border-2 border-zinc-700 p-5 flex flex-col justify-between shadow-2xl bg-gradient-to-b from-zinc-900 to-black text-center"
                  style={{ borderTop: `6px solid ${previewTemplate.accentColor}` }}
                >
                  <div>
                    <span className="text-[10px] font-black uppercase tracking-widest text-zinc-400 block">
                      GLOBAL SUMMIT 2026
                    </span>
                    <span className="text-[9px] text-zinc-500">SAN FRANCISCO, CA</span>
                  </div>

                  <div className="space-y-1 my-auto">
                    <h2 className="text-base font-black text-white">DR. ALEX MORGAN</h2>
                    <p className="text-[11px] text-zinc-400">Chief AI Scientist</p>
                    <p className="text-[10px] text-zinc-500 font-semibold">Stanford Institute</p>
                  </div>

                  <div className="space-y-2 pt-2 border-t border-zinc-800">
                    <span
                      className="inline-block text-[10px] font-black uppercase px-3 py-0.5 rounded-full"
                      style={{ backgroundColor: `${previewTemplate.accentColor}20`, color: previewTemplate.accentColor }}
                    >
                      {previewTemplate.category} PASS
                    </span>
                    <div className="flex justify-center">
                      <QrCode className="size-10 text-white" />
                    </div>
                  </div>
                </div>

                <p className="text-xs text-[var(--text-secondary,#a1a1aa)] text-center leading-relaxed">
                  {previewTemplate.description}
                </p>
              </div>

              <div className="p-4 border-t border-[var(--border-default,#27272a)] flex items-center justify-end gap-2.5">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPreviewTemplate(null)}
                  className="h-8 text-xs font-semibold cursor-pointer"
                >
                  Close
                </Button>
                <Button
                  size="sm"
                  onClick={() => handleUseTemplate(previewTemplate)}
                  className="h-8 text-xs font-semibold gap-1.5 bg-[var(--pri,#4f46e5)] text-white hover:bg-[var(--pri-hover,#4338ca)] cursor-pointer"
                >
                  <Sparkles className="size-3.5" />
                  Launch in Badge Designer
                </Button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </OrganiserPage>
  );
}
