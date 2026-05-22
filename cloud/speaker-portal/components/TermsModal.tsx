"use client";

import { motion, AnimatePresence } from "framer-motion";
import { X, ShieldCheck, FileText, CheckCircle2, ChevronRight, Loader2, AlertCircle } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";

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
      <div className="fixed inset-0 z-[100] flex items-center justify-center p-6">
        <motion.div 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="absolute inset-0 bg-black/80 backdrop-blur-xl"
          onClick={onClose}
        />
        
        <motion.div 
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 20 }}
          className="relative w-full max-w-4xl max-h-[90vh] bg-[#0A0B10] border border-white/10 rounded-[3rem] shadow-3xl overflow-hidden flex flex-col"
        >
          <div className="p-8 border-b border-white/5 flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="h-12 w-12 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center">
                <ShieldCheck className="h-6 w-6 text-indigo-400" />
              </div>
              <div>
                <h2 className="text-2xl font-black tracking-tighter">Terms & <span className="text-indigo-400">Compliance</span></h2>
                <p className="text-[10px] font-black text-muted uppercase tracking-[0.3em]">Legal Verification Required</p>
              </div>
            </div>
            <button onClick={onClose} className="p-3 hover:bg-white/5 rounded-full transition-colors">
              <X className="h-5 w-5 text-muted" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-10 custom-scrollbar">
            <div className="space-y-12">
              {/* Step 2: Recording Rights */}
              <section className="space-y-6">
                <h3 className="text-sm font-black uppercase tracking-[0.2em] text-indigo-400 flex items-center gap-3">
                   01. Recording & Distribution Rights
                </h3>
                <div className="grid md:grid-cols-3 gap-4">
                  {[
                    { id: 'FULL', title: 'Full Rights', desc: 'Livestream, record, and archive online permanently.' },
                    { id: 'LIMITED', title: 'Limited Rights', desc: 'Internal use only. No public distribution.' },
                    { id: 'NONE', title: 'No Recording', desc: 'Opt out of all recording and distribution.' }
                  ].map((opt) => (
                    <div 
                      key={opt.id}
                      onClick={() => setRights(opt.id as RecordingRights)}
                      className={cn(
                        "p-6 rounded-[2rem] border-2 transition-all cursor-pointer group",
                        rights === opt.id 
                          ? "border-indigo-500 bg-indigo-500/10 shadow-[0_0_30px_rgba(99,102,241,0.2)]" 
                          : "border-white/5 bg-white/[0.02] hover:border-white/20"
                      )}
                    >
                      <div className="flex items-center justify-between mb-3">
                        <span className={cn(
                          "text-xs font-black uppercase tracking-widest",
                          rights === opt.id ? "text-indigo-400" : "text-muted"
                        )}>{opt.title}</span>
                        {rights === opt.id && <CheckCircle2 className="h-4 w-4 text-indigo-400" />}
                      </div>
                      <p className="text-[11px] font-bold text-muted leading-relaxed">{opt.desc}</p>
                    </div>
                  ))}
                </div>
              </section>

              {/* Step 3: Declarations */}
              <section className="space-y-6">
                <h3 className="text-sm font-black uppercase tracking-[0.2em] text-indigo-400 flex items-center gap-3">
                   02. Declarations Checklist
                </h3>
                <div className="grid md:grid-cols-2 gap-4">
                  {[
                    { id: 'author', label: 'Original Author', desc: 'I am the original author/creator of all uploaded content.' },
                    { id: 'copyright', label: 'Copyright Compliance', desc: 'Content does not infringe any third-party intellectual property.' },
                    { id: 'anonymized', label: 'Data Anonymization', desc: 'All patient/human data is properly anonymized and ethical.' },
                    { id: 'conflict', label: 'Conflict Disclosure', desc: 'Financial relationships and conflicts of interest are disclosed.' },
                    { id: 'terms', label: 'Full Terms & Conditions', desc: 'I have read and agree to the comprehensive T&C document.' },
                    { id: 'gdpr', label: 'GDPR Processing', desc: 'I consent to the processing of my data for conference administration.' }
                  ].map((item) => (
                    <div 
                      key={item.id}
                      onClick={() => toggleCheck(item.id as keyof typeof checkedItems)}
                      className={cn(
                        "flex items-start gap-4 p-5 rounded-3xl border transition-all cursor-pointer",
                        checkedItems[item.id as keyof typeof checkedItems]
                          ? "border-emerald-500/30 bg-emerald-500/5"
                          : "border-white/5 bg-white/[0.01] hover:bg-white/[0.03]"
                      )}
                    >
                      <div className={cn(
                        "h-6 w-6 rounded-lg border-2 flex items-center justify-center flex-shrink-0 mt-0.5",
                        checkedItems[item.id as keyof typeof checkedItems]
                          ? "border-emerald-500 bg-emerald-500 text-white"
                          : "border-white/20"
                      )}>
                        {checkedItems[item.id as keyof typeof checkedItems] && <CheckCircle2 className="h-4 w-4" />}
                      </div>
                      <div>
                        <div className="text-[11px] font-black uppercase tracking-widest mb-1">{item.label}</div>
                        <p className="text-[10px] font-bold text-muted leading-tight">{item.desc}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            </div>
          </div>

          <div className="p-8 border-t border-white/5 bg-white/[0.02] flex items-center justify-between">
            <div className="flex items-center gap-3">
              <AlertCircle className="h-4 w-4 text-orange-400" />
              <p className="text-[10px] font-black text-muted uppercase tracking-widest">Legal acceptance is timestamped and logged</p>
            </div>
            
            <button
              disabled={!allChecked || isSubmitting}
              onClick={() => rights && onAccept(rights)}
              className={cn(
                "btn-primary h-14 px-12 rounded-full flex items-center gap-3 text-[11px]",
                (!allChecked || isSubmitting) && "opacity-50 grayscale"
              )}
            >
              {isSubmitting ? (
                <>Transmitting... <Loader2 className="h-4 w-4 animate-spin" /></>
              ) : (
                <>Accept & Submit <ChevronRight className="h-4 w-4" /></>
              )}
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
