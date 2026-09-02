"use client";

import React, { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  Mail,
  LayoutTemplate,
  ArrowRight,
  Eye,
  CheckCircle2,
  Sparkles,
  ExternalLink,
  X,
  Send,
  Copy,
  Tag,
} from "lucide-react";
import { toast } from "sonner";
import { OrganiserPage } from "@/components/organizer/workspace/OrganiserPrimitives";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

interface EmailTemplateBlueprint {
  id: string;
  name: string;
  category: "Transactional" | "Speaker" | "Abstract" | "Broadcast";
  subject: string;
  description: string;
  previewHtml: string;
  tags: string[];
}

const EMAIL_TEMPLATES: EmailTemplateBlueprint[] = [
  {
    id: "tpl-registration-confirmation",
    name: "Registration & Digital Pass Confirmation",
    category: "Transactional",
    subject: "Your Registration Confirmed — {{EventName}} Official Pass",
    description: "Sends confirmed delegates their unique Entry Pass QR code, transaction invoice receipt, and calendar .ICS invite.",
    previewHtml: "<div style='padding:20px;background:#09090b;color:#fff;font-family:sans-serif;'><h2>Registration Confirmed!</h2><p>Dear {{Name}}, your delegate pass for {{EventName}} is ready.</p><div style='padding:15px;background:#18181b;border:1px solid #27272a;border-radius:8px;'><strong>Pass Category:</strong> {{Role}}<br/><strong>Registration ID:</strong> {{RegNo}}</div></div>",
    tags: ["Auto-Trigger", "QR Pass", "Invoice Included"],
  },
  {
    id: "tpl-speaker-deck-reminder",
    name: "Speaker Slide Deck Upload Reminder",
    category: "Speaker",
    subject: "Action Required: Upload your presentation slides for {{EventName}}",
    description: "Reminds invited faculty and oral presenters to submit finalized slide decks and disclosure statements before the cutoff.",
    previewHtml: "<div style='padding:20px;background:#09090b;color:#fff;font-family:sans-serif;'><h2>Faculty Presentation Upload</h2><p>Dear {{SpeakerName}}, please upload your presentation deck for your upcoming session: <strong>{{SessionTitle}}</strong>.</p></div>",
    tags: ["Speaker Desk", "Deadline Alert"],
  },
  {
    id: "tpl-abstract-decision-accepted",
    name: "Abstract Acceptance & Presentation Invitation",
    category: "Abstract",
    subject: "Abstract Acceptance Notification — {{EventName}}",
    description: "Notifies primary authors of paper acceptance, oral/poster presentation format assignment, and registration requirements.",
    previewHtml: "<div style='padding:20px;background:#09090b;color:#fff;font-family:sans-serif;'><h2>Congratulations on Your Acceptance!</h2><p>Your abstract <em>{{AbstractTitle}}</em> has been accepted for {{PresentationFormat}}.</p></div>",
    tags: ["Peer Review", "Call for Papers"],
  },
  {
    id: "tpl-certificate-available",
    name: "Certificate of Attendance Ready for Download",
    category: "Transactional",
    subject: "Your Certificate of Attendance is Ready — {{EventName}}",
    description: "Notifies checked-in attendees that their verified digital certificate of attendance is available to download from the portal.",
    previewHtml: "<div style='padding:20px;background:#09090b;color:#fff;font-family:sans-serif;'><h2>Your Certificate is Ready!</h2><p>Thank you for attending {{EventName}}. Click below to view and download your certificate of participation.</p></div>",
    tags: ["Post-Event", "Verification Link"],
  },
  {
    id: "tpl-daily-agenda-briefing",
    name: "Daily Conference Morning Briefing",
    category: "Broadcast",
    subject: "Day {{DayNumber}} Briefing: Today's Keynotes & Sessions — {{EventName}}",
    description: "Broadcast briefing sent each morning highlighting keynote speakers, venue hall changes, and networking evening announcements.",
    previewHtml: "<div style='padding:20px;background:#09090b;color:#fff;font-family:sans-serif;'><h2>Good Morning! Welcome to Day {{DayNumber}}</h2><p>Here is your curated schedule for today at {{Venue}}.</p></div>",
    tags: ["Broadcast", "Daily Schedule"],
  },
];

export default function EmailTemplatesPage() {
  const params = useParams();
  const router = useRouter();
  const eventId = (params?.eventId as string) || "";

  const [selectedCategory, setSelectedCategory] = useState<string>("All");
  const [previewTemplate, setPreviewTemplate] = useState<EmailTemplateBlueprint | null>(null);

  const categories = ["All", "Transactional", "Speaker", "Abstract", "Broadcast"];

  const filtered =
    selectedCategory === "All"
      ? EMAIL_TEMPLATES
      : EMAIL_TEMPLATES.filter((t) => t.category === selectedCategory);

  const handleUseTemplate = (template: EmailTemplateBlueprint) => {
    toast.success(`Opening "${template.name}" in Email Designer...`);
    router.push(`/events/${eventId}/design-studio/emails/designer`);
  };

  return (
    <OrganiserPage
      title="Email Template Blueprints"
      description="Select proven transactional and broadcast email blueprints, preview layout formatting, and customize in the Email Designer."
      actions={
        <Button
          size="sm"
          onClick={() => router.push(`/events/${eventId}/design-studio/emails/designer`)}
          className="h-8 text-xs font-semibold gap-1.5 bg-[var(--pri,#4f46e5)] text-white hover:bg-[var(--pri-hover,#4338ca)] cursor-pointer"
        >
          <Mail className="size-3.5" />
          Open Email Designer
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
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {filtered.map((tpl) => (
          <div
            key={tpl.id}
            className="group rounded-2xl bg-[var(--surface-panel,#18181b)] border border-[var(--border-default,#27272a)] p-5 transition-all hover:border-[var(--pri,#4f46e5)]/50 hover:shadow-xl flex flex-col justify-between"
          >
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Badge className="bg-zinc-800 border-zinc-700 text-[10px] font-bold text-zinc-300 uppercase tracking-wider">
                  {tpl.category}
                </Badge>
              </div>

              <div>
                <h3 className="text-sm font-bold text-[var(--text-primary,#fff)] group-hover:text-[var(--pri,#4f46e5)] transition-colors">
                  {tpl.name}
                </h3>
                <p className="text-[11px] font-medium text-zinc-400 mt-1 italic">&quot;{tpl.subject}&quot;</p>
              </div>

              <p className="text-xs text-[var(--text-secondary,#a1a1aa)] leading-relaxed">{tpl.description}</p>

              <div className="flex flex-wrap gap-1 pt-2">
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
                Edit
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
              className="bg-[var(--surface-panel,#18181b)] border border-[var(--border-default,#27272a)] rounded-2xl w-full max-w-2xl overflow-hidden shadow-2xl flex flex-col max-h-[85vh]"
            >
              <div className="p-4 border-b border-[var(--border-default,#27272a)] flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-white flex items-center gap-2">
                    <Mail className="size-4 text-[var(--pri,#4f46e5)]" />
                    {previewTemplate.name}
                  </h3>
                  <p className="text-xs text-[var(--text-secondary,#a1a1aa)]">Subject: {previewTemplate.subject}</p>
                </div>
                <button
                  onClick={() => setPreviewTemplate(null)}
                  className="size-8 rounded-lg flex items-center justify-center text-zinc-400 hover:text-white hover:bg-zinc-800 cursor-pointer"
                >
                  <X className="size-4" />
                </button>
              </div>

              <div className="p-6 overflow-y-auto space-y-4">
                <div
                  className="rounded-xl p-4 bg-zinc-950 border border-zinc-800"
                  dangerouslySetInnerHTML={{ __html: previewTemplate.previewHtml }}
                />
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
                  Launch in Email Designer
                </Button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </OrganiserPage>
  );
}
