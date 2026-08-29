"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  X,
  Upload,
  Sparkles,
  FileSpreadsheet,
  Layers,
  Calendar,
  Clock,
  Check,
  Loader2,
  Download,
  ArrowRight,
  BookOpen,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface ImportAgendaModalProps {
  isOpen: boolean;
  onClose: () => void;
  onApplyTemplate: (templateKey: string) => void;
  onImportFile: (file: File) => void;
  onApplyAIPrompt: (prompt: string) => void;
}

const PREBUILT_TEMPLATES = [
  {
    key: "medical-congress-3day",
    title: "3-Day Medical Congress",
    category: "Healthcare & Science",
    badge: "Most Popular",
    daysCount: 3,
    roomsCount: 6,
    sessionsCount: 36,
    description:
      "Comprehensive multi-track layout with Keynotes, CME-accredited Symposia, ePosters, Oral Presentations, and automated Coffee/Lunch breaks.",
    color: "#3b82f6",
  },
  {
    key: "single-day-seminar",
    title: "Single Day Executive Seminar",
    category: "Corporate & Tech",
    badge: "Fast Setup",
    daysCount: 1,
    roomsCount: 2,
    sessionsCount: 8,
    description:
      "Streamlined single-day agenda with Opening Ceremony, Fireside Chats, Panel Discussions, Networking Lunch, and Closing Keynote.",
    color: "#8b5cf6",
  },
  {
    key: "workshop-cme-summit",
    title: "Hands-on Workshop & CME Summit",
    category: "Education & Training",
    badge: "CME Focused",
    daysCount: 2,
    roomsCount: 4,
    sessionsCount: 18,
    description:
      "Hands-on workshop stations, breakout masterclasses, interactive case discussions, and certification exam slots.",
    color: "#10b981",
  },
  {
    key: "hybrid-tech-summit",
    title: "Global Hybrid Tech Summit",
    category: "Technology",
    badge: "Multi-Track",
    daysCount: 3,
    roomsCount: 8,
    sessionsCount: 48,
    description:
      "Developer keynotes, lightning talks, live-streamed breakout rooms, panel stages, and interactive Q&A segments.",
    color: "#f59e0b",
  },
];

export function ImportAgendaModal({
  isOpen,
  onClose,
  onApplyTemplate,
  onImportFile,
  onApplyAIPrompt,
}: ImportAgendaModalProps) {
  const [activeTab, setActiveTab] = useState<"templates" | "file" | "ai">("templates");
  const [selectedTemplate, setSelectedTemplate] = useState<string>("medical-congress-3day");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [aiPrompt, setAiPrompt] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);

  const handleTemplateSelect = () => {
    setIsProcessing(true);
    setTimeout(() => {
      onApplyTemplate(selectedTemplate);
      setIsProcessing(false);
      onClose();
      toast.success("Agenda template applied successfully.");
    }, 400);
  };

  const handleFileSubmit = () => {
    if (!selectedFile) {
      toast.error("Please select a file to import.");
      return;
    }
    setIsProcessing(true);
    setTimeout(() => {
      onImportFile(selectedFile);
      setIsProcessing(false);
      onClose();
      toast.success("Agenda imported from file.");
    }, 500);
  };

  const handleAiSubmit = () => {
    if (!aiPrompt.trim()) {
      toast.error("Please enter a prompt to generate the agenda.");
      return;
    }
    setIsProcessing(true);
    setTimeout(() => {
      onApplyAIPrompt(aiPrompt);
      setIsProcessing(false);
      onClose();
      toast.success("AI Agenda structure generated successfully.");
    }, 700);
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60">
          <motion.div
            initial={{ scale: 0.96, opacity: 0, y: 8 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.96, opacity: 0, y: 8 }}
            transition={{ duration: 0.15 }}
            className="w-full max-w-3xl rounded-lg border border-[var(--border-default)] bg-[var(--card)] p-6 shadow-md flex flex-col max-h-[90vh] overflow-hidden space-y-4"
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b border-[var(--border-subtle)] pb-3">
              <div className="flex items-center gap-2.5">
                <div className="flex size-8 items-center justify-center rounded-lg bg-[var(--pri)]/10 text-[var(--pri)] border border-[var(--pri)]/20">
                  <Layers className="size-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-[var(--text-primary)]">
                    Import or Create Event Agenda
                  </h3>
                  <p className="text-[11px] text-[var(--text-secondary)]">
                    Choose from standard conference templates, import spreadsheet data, or generate with AI.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="rounded-md p-1 text-[var(--text-tertiary)] hover:bg-[var(--bg-surface-hover)] hover:text-[var(--text-primary)] transition-colors cursor-pointer"
              >
                <X className="size-4" />
              </button>
            </div>

            {/* Tab Switcher */}
            <div className="flex items-center rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface-2)] p-1 gap-1 w-fit">
              <button
                type="button"
                onClick={() => setActiveTab("templates")}
                className={cn(
                  "flex items-center gap-1.5 rounded-md px-3.5 py-1.5 text-xs font-semibold transition-colors cursor-pointer",
                  activeTab === "templates"
                    ? "bg-[var(--pri)] text-[var(--primary-contrast)] shadow-sm font-bold"
                    : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                )}
              >
                <BookOpen className="size-3.5" /> Starter Templates
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("file")}
                className={cn(
                  "flex items-center gap-1.5 rounded-md px-3.5 py-1.5 text-xs font-semibold transition-colors cursor-pointer",
                  activeTab === "file"
                    ? "bg-[var(--pri)] text-[var(--primary-contrast)] shadow-sm font-bold"
                    : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                )}
              >
                <FileSpreadsheet className="size-3.5" /> CSV / Excel File
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("ai")}
                className={cn(
                  "flex items-center gap-1.5 rounded-md px-3.5 py-1.5 text-xs font-semibold transition-colors cursor-pointer",
                  activeTab === "ai"
                    ? "bg-[var(--pri)] text-[var(--primary-contrast)] shadow-sm font-bold"
                    : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                )}
              >
                <Sparkles className="size-3.5" /> AI Generator
              </button>
            </div>

            {/* Content Body */}
            <div className="flex-1 overflow-y-auto pr-1 min-h-0 space-y-4">
              {activeTab === "templates" && (
                <div className="space-y-3">
                  <p className="text-xs text-[var(--text-secondary)]">
                    Select a curated conference structure to pre-fill rooms, tracks, default sessions, and break times:
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {PREBUILT_TEMPLATES.map((tmpl) => {
                      const isSelected = selectedTemplate === tmpl.key;
                      return (
                        <div
                          key={tmpl.key}
                          onClick={() => setSelectedTemplate(tmpl.key)}
                          className={cn(
                            "relative flex flex-col justify-between rounded-lg border p-3.5 cursor-pointer transition-all",
                            isSelected
                              ? "border-[var(--pri)] bg-[var(--pri)]/5 shadow-xs"
                              : "border-[var(--border-default)] bg-[var(--card)] hover:border-[var(--border-subtle)] hover:bg-[var(--surface-subtle)]"
                          )}
                        >
                          <div className="space-y-2">
                            <div className="flex items-center justify-between">
                              <span className="rounded-full bg-[var(--surface-subtle)] px-2 py-0.5 text-[10px] font-bold text-[var(--text-secondary)]">
                                {tmpl.category}
                              </span>
                              <span
                                className="rounded-full px-2 py-0.5 text-[10px] font-bold"
                                style={{ backgroundColor: `${tmpl.color}20`, color: tmpl.color }}
                              >
                                {tmpl.badge}
                              </span>
                            </div>

                            <div>
                              <h4 className="text-xs font-bold text-[var(--text-primary)]">
                                {tmpl.title}
                              </h4>
                              <p className="text-[11px] text-[var(--text-secondary)] line-clamp-2 mt-1">
                                {tmpl.description}
                              </p>
                            </div>
                          </div>

                          <div className="mt-3 flex items-center justify-between border-t border-[var(--border-subtle)] pt-2.5 text-[10px] text-[var(--text-tertiary)]">
                            <div className="flex items-center gap-3">
                              <span className="flex items-center gap-1 font-medium">
                                <Calendar className="size-3" /> {tmpl.daysCount} Days
                              </span>
                              <span className="flex items-center gap-1 font-medium">
                                <Layers className="size-3" /> {tmpl.roomsCount} Rooms
                              </span>
                              <span className="flex items-center gap-1 font-medium">
                                <Clock className="size-3" /> ~{tmpl.sessionsCount} Sessions
                              </span>
                            </div>
                            <div
                              className={cn(
                                "flex size-4 items-center justify-center rounded-full border",
                                isSelected
                                  ? "border-[var(--pri)] bg-[var(--pri)] text-[var(--primary-contrast)]"
                                  : "border-[var(--border-default)]"
                              )}
                            >
                              {isSelected && <Check className="size-2.5" />}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {activeTab === "file" && (
                <div className="space-y-4">
                  <div className="rounded-lg border border-dashed border-[var(--border-default)] p-6 text-center hover:border-[var(--pri)] transition-colors bg-[var(--surface-subtle)]/50">
                    <input
                      type="file"
                      accept=".csv,.xlsx,.xls,.json"
                      onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
                      className="hidden"
                      id="agenda-file-upload"
                    />
                    <label
                      htmlFor="agenda-file-upload"
                      className="flex flex-col items-center justify-center cursor-pointer gap-2"
                    >
                      <div className="flex size-10 items-center justify-center rounded-full bg-[var(--pri)]/10 text-[var(--pri)]">
                        <Upload className="size-5" />
                      </div>
                      <span className="text-xs font-bold text-[var(--text-primary)]">
                        {selectedFile ? selectedFile.name : "Choose CSV, Excel, or JSON File"}
                      </span>
                      <span className="text-[11px] text-[var(--text-secondary)]">
                        Drag and drop your agenda file or click to browse.
                      </span>
                    </label>
                  </div>

                  <div className="flex items-center justify-between rounded-lg border border-[var(--border-default)] bg-[var(--card)] p-3 text-xs">
                    <div className="flex items-center gap-2">
                      <FileSpreadsheet className="size-4 text-[var(--pri)]" />
                      <div>
                        <span className="font-bold text-[var(--text-primary)]">Need a sample format?</span>
                        <p className="text-[11px] text-[var(--text-secondary)]">
                          Download the standard schedule import template with sessions, rooms & times.
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => toast.info("Downloading sample agenda template...")}
                      className="flex items-center gap-1.5 rounded-md border border-[var(--border-default)] bg-[var(--surface-subtle)] px-2.5 py-1 text-[11px] font-semibold text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)] cursor-pointer"
                    >
                      <Download className="size-3" /> Sample Template
                    </button>
                  </div>
                </div>
              )}

              {activeTab === "ai" && (
                <div className="space-y-3">
                  <div className="flex items-center gap-2 text-xs text-[var(--text-secondary)]">
                    <Sparkles className="size-4 text-[var(--pri)]" />
                    <span>Describe your conference requirements to auto-generate a structured agenda:</span>
                  </div>

                  <textarea
                    rows={4}
                    value={aiPrompt}
                    onChange={(e) => setAiPrompt(e.target.value)}
                    placeholder="e.g. Create a 3-day cardiology congress with 4 parallel halls (Hall A to D), morning keynotes at 9 AM, CME symposiums, 30-min coffee breaks at 10:30 AM, and 1-hour lunch break at 1:00 PM."
                    className="w-full rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface-2)] p-3 text-xs text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:border-[var(--pri)] focus:outline-none"
                  />

                  <div className="flex flex-wrap gap-2 text-[11px]">
                    <span className="text-[var(--text-tertiary)]">Quick Prompts:</span>
                    <button
                      type="button"
                      onClick={() =>
                        setAiPrompt(
                          "3-Day Cardiology Conference with 6 parallel tracks, keynotes, panel discussions, and automatic coffee/lunch breaks."
                        )
                      }
                      className="rounded-full bg-[var(--surface-subtle)] px-2.5 py-0.5 text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--border-default)] cursor-pointer"
                    >
                      + 3-Day Cardiology Congress
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setAiPrompt(
                          "2-Day Hands-on Workshop with 4 breakout rooms, certification tracks, and networking dinner."
                        )
                      }
                      className="rounded-full bg-[var(--surface-subtle)] px-2.5 py-0.5 text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--border-default)] cursor-pointer"
                    >
                      + 2-Day CME Workshop
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Footer Actions */}
            <div className="flex items-center justify-end gap-2 border-t border-[var(--border-subtle)] pt-3">
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg border border-[var(--border-default)] bg-[var(--card)] px-4 py-2 text-xs font-semibold text-[var(--text-secondary)] hover:bg-[var(--bg-surface-hover)] transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isProcessing}
                onClick={() => {
                  if (activeTab === "templates") handleTemplateSelect();
                  else if (activeTab === "file") handleFileSubmit();
                  else if (activeTab === "ai") handleAiSubmit();
                }}
                className="flex items-center gap-2 rounded-lg bg-[var(--pri)] px-5 py-2 text-xs font-bold text-[var(--primary-contrast)] shadow-sm hover:opacity-95 disabled:opacity-50 transition-opacity cursor-pointer"
              >
                {isProcessing && <Loader2 className="size-3.5 animate-spin" />}
                {activeTab === "templates" && "Apply Template"}
                {activeTab === "file" && "Import Spreadsheet"}
                {activeTab === "ai" && "Generate with AI"}
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
