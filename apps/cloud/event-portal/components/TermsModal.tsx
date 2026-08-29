"use client";

import { motion, AnimatePresence } from "framer-motion";
import { X, ShieldCheck, FileText, CheckCircle2, ChevronRight, Loader2, AlertCircle } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

interface TermsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAccept: (options: RecordingRights) => void;
  isSubmitting: boolean;
}

export type RecordingRights = "FULL" | "LIMITED" | "NONE";

export function TermsModal({ isOpen, onClose, onAccept, isSubmitting }: TermsModalProps) {
  const [rights, setRights] = useState<RecordingRights | null>(null);
  const [checkedItems, setCheckedItems] = useState({
    author: false,
    copyright: false,
    anonymized: false,
    conflict: false,
    terms: false,
    gdpr: false,
  });

  const allChecked = Object.values(checkedItems).every(v => v) && rights !== null;

  const toggleCheck = (key: keyof typeof checkedItems) => {
    setCheckedItems(prev => ({ ...prev, [key]: !prev[key] }));
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
        <motion.div 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="absolute inset-0 bg-black/80 backdrop-blur-sm"
          onClick={onClose}
        />
        
        <motion.div 
          initial={{ opacity: 0, scale: 0.95, y: 15 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 15 }}
          className="relative w-full max-w-3xl max-h-[90vh] bg-[var(--card)] border border-[var(--border-default)] rounded-2xl shadow-2xl overflow-hidden flex flex-col"
        >
          <div className="p-6 border-b border-[var(--border-default)] flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-[color-mix(in_srgb,var(--pri)_15%,transparent)] border border-[var(--border-default)] flex items-center justify-center">
                <ShieldCheck className="h-5 w-5 text-[var(--pri)]" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-[var(--text)]">Terms & Compliance</h2>
                <p className="text-xs text-[var(--muted)]">Speaker & Presenter Verification</p>
              </div>
            </div>
            <button onClick={onClose} className="p-2 hover:bg-[var(--bg-surface-hover)] rounded-lg transition-colors text-[var(--muted)] hover:text-[var(--text)]">
              <X className="h-5 w-5" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-6 space-y-6">
            {/* Step 1: Recording Rights */}
            <section className="space-y-3">
              <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--pri)]">
                01. Recording & Distribution Rights
              </h3>
              <div className="grid md:grid-cols-3 gap-3">
                {[
                  { id: 'FULL', title: 'Full Rights', desc: 'Livestream, record, and archive online permanently.' },
                  { id: 'LIMITED', title: 'Limited Rights', desc: 'Internal use only. No public distribution.' },
                  { id: 'NONE', title: 'No Recording', desc: 'Opt out of all recording and distribution.' }
                ].map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setRights(opt.id as RecordingRights)}
                    className={cn(
                      "p-4 rounded-xl border text-left transition-all",
                      rights === opt.id
                        ? "border-[var(--pri)] bg-[color-mix(in_srgb,var(--pri)_12%,transparent)] ring-2 ring-[var(--pri)]"
                        : "border-[var(--border-default)] bg-[var(--bg-surface-2)] hover:border-[var(--border-strong)]"
                    )}
                  >
                    <div className="font-semibold text-sm text-[var(--text)] mb-1">{opt.title}</div>
                    <div className="text-xs text-[var(--muted)]">{opt.desc}</div>
                  </button>
                ))}
              </div>
            </section>

            {/* Step 2: Declarations */}
            <section className="space-y-3">
              <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--pri)]">
                02. Presenter Declarations
              </h3>
              <div className="space-y-2">
                {[
                  { key: 'author', label: 'I am the primary author or authorized representative of this presentation.' },
                  { key: 'copyright', label: 'All slides, media, and materials comply with copyright and citation guidelines.' },
                  { key: 'anonymized', label: 'Patient or participant data (if any) is fully de-identified and complies with privacy regulations.' },
                  { key: 'conflict', label: 'I have declared any relevant commercial or academic conflicts of interest in my slides.' },
                  { key: 'terms', label: 'I agree to the conference presentation guidelines and speaker code of conduct.' },
                  { key: 'gdpr', label: 'I consent to the processing of my presentation materials for event execution.' },
                ].map((item) => (
                  <label
                    key={item.key}
                    onClick={() => toggleCheck(item.key as keyof typeof checkedItems)}
                    className="flex items-start gap-3 p-3 rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface-2)] hover:bg-[var(--bg-surface-hover)] cursor-pointer transition-colors"
                  >
                    <input
                      type="checkbox"
                      checked={checkedItems[item.key as keyof typeof checkedItems]}
                      onChange={() => {}}
                      className="mt-0.5 h-4 w-4 rounded border-[var(--border-default)] text-[var(--pri)] accent-[var(--pri)]"
                    />
                    <span className="text-xs text-[var(--text)] leading-relaxed">{item.label}</span>
                  </label>
                ))}
              </div>
            </section>
          </div>

          <div className="p-6 border-t border-[var(--border-default)] flex justify-end gap-3 bg-[var(--card)]">
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            <Button
              disabled={!allChecked || isSubmitting}
              onClick={() => rights && onAccept(rights)}
              className="flex items-center gap-2"
            >
              {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
              Accept & Submit
            </Button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
