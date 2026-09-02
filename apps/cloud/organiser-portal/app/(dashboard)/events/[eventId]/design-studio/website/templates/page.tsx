"use client";

import React, { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  Globe,
  LayoutTemplate,
  ArrowRight,
  Eye,
  CheckCircle2,
  Sparkles,
  ExternalLink,
  Laptop,
  Tablet,
  Smartphone,
  X,
  Code2,
} from "lucide-react";
import { toast } from "sonner";
import { OrganiserPage } from "@/components/organizer/workspace/OrganiserPrimitives";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

interface WebsiteTemplateBlueprint {
  id: string;
  name: string;
  category: string;
  description: string;
  previewImage: string;
  features: string[];
  recommendedFor: string;
}

const WEBSITE_TEMPLATES: WebsiteTemplateBlueprint[] = [
  {
    id: "tech-summit-dark",
    name: "AI & Technology Summit",
    category: "Technology",
    description: "High-contrast obsidian dark aesthetic with glowing ambient mesh gradients, hero countdown, speaker carousel, and schedule tracks.",
    previewImage: "https://images.unsplash.com/photo-1540575467063-178a50c2df87?w=800&auto=format&fit=crop&q=80",
    features: ["Hero Countdown & Video BG", "Speaker Avatar Carousel", "Interactive Multi-Track Agenda", "Sponsor Tier Matrix", "Live Ticket Tier Cards"],
    recommendedFor: "Tech Summits, AI Conferences, Developer Days",
  },
  {
    id: "academic-congress",
    name: "International Scientific Congress",
    category: "Academic",
    description: "Clean, authoritative layout designed for peer-reviewed academic congresses, call for abstracts banner, committee directory, and venue directions.",
    previewImage: "https://images.unsplash.com/photo-1511578314322-379afb476865?w=800&auto=format&fit=crop&q=80",
    features: ["Call for Papers Intake Banner", "Keynote Faculty Roster", "Downloadable Program PDF", "Travel & Accommodation Guide", "Accreditation Details"],
    recommendedFor: "Medical Congresses, University Symposia, Research Summits",
  },
  {
    id: "corporate-expo",
    name: "Enterprise Business Expo & Trade Fair",
    category: "Business",
    description: "Vibrant corporate showcase with interactive floor plan map, exhibitor directory, B2B networking CTA, and sponsor registration.",
    previewImage: "https://images.unsplash.com/photo-1505373877841-8d25f7d46678?w=800&auto=format&fit=crop&q=80",
    features: ["Exhibitor Floorplan Map", "B2B Matchmaking Teaser", "VIP Gala Invitation Section", "Live Stage Streaming Embed", "Sponsor Lead Capture"],
    recommendedFor: "Trade Expos, Industry Expos, Annual General Meetings",
  },
  {
    id: "executive-symposium",
    name: "Executive Leadership Forum",
    category: "Corporate",
    description: "Understated minimalist slate & titanium aesthetic for C-suite executive roundtables and invitation-only symposiums.",
    previewImage: "https://images.unsplash.com/photo-1475721027785-f74eccf877e2?w=800&auto=format&fit=crop&q=80",
    features: ["Restricted Access Gate", "Roundtable Agenda Breakdown", "Speaker Headshots Grid", "Venue Concierge Notes", "Private RSVP Form"],
    recommendedFor: "Leadership Retreats, Private Roundtables, Investor Days",
  },
];

export default function WebsiteTemplatesPage() {
  const params = useParams();
  const router = useRouter();
  const eventId = (params?.eventId as string) || "";

  const [selectedCategory, setSelectedCategory] = useState<string>("All");
  const [previewTemplate, setPreviewTemplate] = useState<WebsiteTemplateBlueprint | null>(null);
  const [applying, setApplying] = useState(false);

  const categories = ["All", "Technology", "Academic", "Business", "Corporate"];

  const filteredTemplates =
    selectedCategory === "All"
      ? WEBSITE_TEMPLATES
      : WEBSITE_TEMPLATES.filter((t) => t.category === selectedCategory);

  const handleApplyTemplate = (template: WebsiteTemplateBlueprint) => {
    setApplying(true);
    setTimeout(() => {
      setApplying(false);
      setPreviewTemplate(null);
      toast.success(`Applied "${template.name}" blueprint to event website!`);
      router.push(`/events/${eventId}/design-studio/website/designer`);
    }, 600);
  };

  return (
    <OrganiserPage
      title="Website Blueprint Templates"
      description="Browse high-converting landing page blueprints, preview on multi-device viewports, and launch in the Website Designer."
      actions={
        <Button
          size="sm"
          onClick={() => router.push(`/events/${eventId}/design-studio/website/designer`)}
          className="h-8 text-xs font-semibold gap-1.5 bg-[var(--pri,#4f46e5)] text-white hover:bg-[var(--pri-hover,#4338ca)] cursor-pointer"
        >
          <Globe className="size-3.5" />
          Open Website Designer
        </Button>
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
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {filteredTemplates.map((tpl) => (
          <div
            key={tpl.id}
            className="group rounded-2xl bg-[var(--surface-panel,#18181b)] border border-[var(--border-default,#27272a)] overflow-hidden transition-all hover:border-[var(--pri,#4f46e5)]/50 hover:shadow-xl flex flex-col justify-between"
          >
            <div>
              {/* Preview Thumbnail */}
              <div className="h-48 w-full relative overflow-hidden bg-zinc-950">
                <img
                  src={tpl.previewImage}
                  alt={tpl.name}
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500 opacity-80 group-hover:opacity-100"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
                <div className="absolute top-3 left-3">
                  <Badge className="bg-black/60 backdrop-blur-md border-white/10 text-[10px] font-bold text-white uppercase tracking-wider">
                    {tpl.category}
                  </Badge>
                </div>
                <div className="absolute bottom-3 left-3 right-3 flex items-center justify-between">
                  <span className="text-xs text-white/80 font-medium">Recommended for: {tpl.recommendedFor}</span>
                </div>
              </div>

              {/* Body Content */}
              <div className="p-5 space-y-3">
                <h3 className="text-base font-bold text-[var(--text-primary,#fff)]">{tpl.name}</h3>
                <p className="text-xs text-[var(--text-secondary,#a1a1aa)] leading-relaxed">{tpl.description}</p>

                {/* Features List */}
                <div className="pt-2 border-t border-[var(--border-default,#27272a)]">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-tertiary,#71717a)] block mb-1.5">
                    Included Modules
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {tpl.features.map((feat, i) => (
                      <span
                        key={i}
                        className="text-[11px] px-2 py-0.5 rounded-md bg-[var(--surface-ground,#09090b)] border border-[var(--border-default,#27272a)] text-zinc-300 flex items-center gap-1"
                      >
                        <CheckCircle2 className="size-3 text-emerald-400" />
                        {feat}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Action Footer */}
            <div className="p-5 pt-0 flex items-center gap-2.5">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPreviewTemplate(tpl)}
                className="flex-1 h-8 text-xs font-semibold gap-1.5 border-[var(--border-default,#27272a)] cursor-pointer"
              >
                <Eye className="size-3.5 text-[var(--pri,#4f46e5)]" />
                Preview Blueprint
              </Button>
              <Button
                size="sm"
                onClick={() => handleApplyTemplate(tpl)}
                className="flex-1 h-8 text-xs font-semibold gap-1.5 bg-[var(--pri,#4f46e5)] text-white hover:bg-[var(--pri-hover,#4338ca)] cursor-pointer"
              >
                <Sparkles className="size-3.5" />
                Use Blueprint
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
              className="bg-[var(--surface-panel,#18181b)] border border-[var(--border-default,#27272a)] rounded-2xl w-full max-w-4xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh]"
            >
              <div className="p-4 border-b border-[var(--border-default,#27272a)] flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-white flex items-center gap-2">
                    <Globe className="size-4 text-[var(--pri,#4f46e5)]" />
                    {previewTemplate.name}
                  </h3>
                  <p className="text-xs text-[var(--text-secondary,#a1a1aa)]">{previewTemplate.category} Blueprint</p>
                </div>
                <button
                  onClick={() => setPreviewTemplate(null)}
                  className="size-8 rounded-lg flex items-center justify-center text-zinc-400 hover:text-white hover:bg-zinc-800 cursor-pointer"
                >
                  <X className="size-4" />
                </button>
              </div>

              <div className="p-6 overflow-y-auto space-y-4">
                <div className="rounded-xl overflow-hidden border border-zinc-800 max-h-[420px]">
                  <img src={previewTemplate.previewImage} alt={previewTemplate.name} className="w-full object-cover" />
                </div>
                <p className="text-xs text-[var(--text-secondary,#a1a1aa)] leading-relaxed">
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
                  onClick={() => handleApplyTemplate(previewTemplate)}
                  disabled={applying}
                  className="h-8 text-xs font-semibold gap-1.5 bg-[var(--pri,#4f46e5)] text-white hover:bg-[var(--pri-hover,#4338ca)] cursor-pointer"
                >
                  <Sparkles className="size-3.5" />
                  {applying ? "Applying Blueprint..." : "Apply Blueprint to Event"}
                </Button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </OrganiserPage>
  );
}
