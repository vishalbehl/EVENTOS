"use client";

import React, { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  Award,
  LayoutTemplate,
  ArrowRight,
  Eye,
  CheckCircle2,
  Sparkles,
  ExternalLink,
  ShieldCheck,
  Download,
  X,
  Plus,
} from "lucide-react";
import { toast } from "sonner";
import { OrganiserPage } from "@/components/organizer/workspace/OrganiserPrimitives";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

interface CertificateTemplateBlueprint {
  id: string;
  name: string;
  category: "Attendance" | "Speaker" | "Award" | "Committee";
  dimensions: string;
  description: string;
  accentColor: string;
  tags: string[];
}

const CERTIFICATE_TEMPLATES: CertificateTemplateBlueprint[] = [
  {
    id: "tpl-cert-attendance-classic",
    name: "Official Certificate of Attendance",
    category: "Attendance",
    dimensions: "A4 Landscape (297 x 210 mm)",
    description: "Elegant parchment gold borders with dynamic participant name, event title, credit hours, signatures, and anti-forgery verification QR.",
    accentColor: "#F59E0B",
    tags: ["Accredited", "Verification QR", "Double Signatures"],
  },
  {
    id: "tpl-cert-keynote-appreciation",
    name: "Keynote Faculty Appreciation Honor",
    category: "Speaker",
    dimensions: "A4 Landscape (297 x 210 mm)",
    description: "Distinguished obsidian and royal blue certificate honoring invited faculty and keynote speakers with presentation session details.",
    accentColor: "#3B82F6",
    tags: ["Faculty Honor", "Session Title", "Gold Seal"],
  },
  {
    id: "tpl-cert-best-paper-award",
    name: "Best Scientific Oral Paper Award",
    category: "Award",
    dimensions: "A4 Landscape (297 x 210 mm)",
    description: "Prestige laurel wreath emblem for scientific track winners, co-authors, and outstanding clinical research investigators.",
    accentColor: "#10B981",
    tags: ["Laurel Emblem", "Research Track", "Winner Badge"],
  },
  {
    id: "tpl-cert-poster-presentation",
    name: "Scientific ePoster Presenter Recognition",
    category: "Attendance",
    dimensions: "A4 Landscape (297 x 210 mm)",
    description: "Clean modern design recognizing academic poster authors, abstract codes, and thematic symposium category.",
    accentColor: "#6366F1",
    tags: ["Poster Code", "Academic", "Author Credit"],
  },
  {
    id: "tpl-cert-organizing-committee",
    name: "Organizing Committee Recognition",
    category: "Committee",
    dimensions: "A4 Landscape (297 x 210 mm)",
    description: "Dedicated certificate of appreciation honoring conference chairpersons, scientific reviewers, and executive steering committee.",
    accentColor: "#8B5CF6",
    tags: ["Leadership", "Executive", "Embossed Seal"],
  },
];

export default function CertificateTemplatesPage() {
  const params = useParams();
  const router = useRouter();
  const eventId = (params?.eventId as string) || "";

  const [selectedCategory, setSelectedCategory] = useState<string>("All");
  const [previewTemplate, setPreviewTemplate] = useState<CertificateTemplateBlueprint | null>(null);

  const categories = ["All", "Attendance", "Speaker", "Award", "Committee"];

  const filtered =
    selectedCategory === "All"
      ? CERTIFICATE_TEMPLATES
      : CERTIFICATE_TEMPLATES.filter((t) => t.category === selectedCategory);

  const handleUseTemplate = (template: CertificateTemplateBlueprint) => {
    toast.success(`Opening "${template.name}" in Certificate Designer...`);
    router.push(`/events/${eventId}/design-studio/certificates/designer`);
  };

  return (
    <OrganiserPage
      title="Certificate Blueprint Templates"
      description="Explore accredited certificate blueprints, customize typography, digital signatures, and verification QR stamps, and assign to roles."
      actions={
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => router.push(`/events/${eventId}/design-studio/certificates/settings`)}
            className="h-8 text-xs font-semibold gap-1.5 border-[var(--border-default)] cursor-pointer"
          >
            <Award className="size-3.5 text-[var(--pri,#4f46e5)]" />
            Certificate Role Settings
          </Button>

          <Button
            size="sm"
            onClick={() => router.push(`/events/${eventId}/design-studio/certificates/designer`)}
            className="h-8 text-xs font-semibold gap-1.5 bg-[var(--pri,#4f46e5)] text-white hover:bg-[var(--pri-hover,#4338ca)] cursor-pointer"
          >
            <Plus className="size-3.5" />
            Create Custom Certificate
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
              {/* Certificate Visual Mockup Card */}
              <div
                className="h-36 rounded-xl border border-zinc-800 p-3.5 flex flex-col justify-between relative overflow-hidden bg-gradient-to-br from-zinc-900 via-black to-zinc-950 text-center"
                style={{ border: `1px solid ${tpl.accentColor}40` }}
              >
                <div className="flex items-center justify-between">
                  <span className="text-[9px] font-black uppercase tracking-widest text-zinc-400">CERTIFICATE</span>
                  <Badge className="bg-black/60 border-white/10 text-[8px] font-bold text-white uppercase">
                    {tpl.dimensions}
                  </Badge>
                </div>

                <div className="space-y-1 my-auto">
                  <div className="h-3 w-28 mx-auto bg-zinc-700/60 rounded" />
                  <div className="h-2 w-36 mx-auto bg-zinc-800 rounded" />
                </div>

                <div className="flex items-center justify-between pt-1.5 border-t border-zinc-800/80">
                  <span
                    className="text-[9px] font-black uppercase px-2 py-0.5 rounded"
                    style={{ backgroundColor: `${tpl.accentColor}20`, color: tpl.accentColor }}
                  >
                    {tpl.category}
                  </span>
                  <Award className="size-4" style={{ color: tpl.accentColor }} />
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
              className="bg-[var(--surface-panel,#18181b)] border border-[var(--border-default,#27272a)] rounded-2xl w-full max-w-2xl overflow-hidden shadow-2xl flex flex-col"
            >
              <div className="p-4 border-b border-[var(--border-default,#27272a)] flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-white flex items-center gap-2">
                    <Award className="size-4 text-[var(--pri,#4f46e5)]" />
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
                {/* Large Certificate Preview */}
                <div
                  className="w-full max-w-lg h-64 rounded-2xl border-2 border-zinc-700 p-6 flex flex-col justify-between shadow-2xl bg-gradient-to-b from-zinc-900 via-black to-zinc-950 text-center"
                  style={{ border: `2px solid ${previewTemplate.accentColor}` }}
                >
                  <div>
                    <span className="text-[10px] font-black uppercase tracking-widest text-zinc-400 block">
                      INTERNATIONAL MEDICAL & SCIENTIFIC CONGRESS 2026
                    </span>
                    <h2 className="text-lg font-serif font-black text-white mt-1">CERTIFICATE OF RECOGNITION</h2>
                  </div>

                  <div className="space-y-0.5 my-auto">
                    <p className="text-[10px] text-zinc-400">THIS IS PROUDLY PRESENTED TO</p>
                    <h3 className="text-base font-bold text-white tracking-wide">DR. ELEANOR VANCE</h3>
                    <p className="text-[10px] text-zinc-400">In recognition of meritorious participation and keynote presentation</p>
                  </div>

                  <div className="flex items-center justify-between pt-3 border-t border-zinc-800 text-[10px] text-zinc-400">
                    <div>
                      <div className="w-16 h-0.5 bg-zinc-600 mb-1 mx-auto" />
                      <span>Scientific Chair</span>
                    </div>
                    <Award className="size-8" style={{ color: previewTemplate.accentColor }} />
                    <div>
                      <div className="w-16 h-0.5 bg-zinc-600 mb-1 mx-auto" />
                      <span>Executive Director</span>
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
                  Launch in Certificate Designer
                </Button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </OrganiserPage>
  );
}
