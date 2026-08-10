"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { X, Mail, CheckCircle2, Loader2, AlertCircle, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useEmailTemplates, useSendToSpeakers } from "@/hooks/useEmails";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface EmailCampaignDialogProps {
  isOpen: boolean;
  onClose: () => void;
  selectedSpeakerIds: string[];
  onSuccess: () => void;
}

export function EmailCampaignDialog({
  isOpen,
  onClose,
  selectedSpeakerIds,
  onSuccess,
}: EmailCampaignDialogProps) {
  const { eventId } = useParams();
  const eventIdStr = eventId as string;
  const { data: templates, isLoading: templatesLoading } = useEmailTemplates(eventIdStr);
  const sendToSpeakers = useSendToSpeakers(eventIdStr);

  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);
  const [inlineError, setInlineError] = useState<string | null>(null);

  const count = selectedSpeakerIds.length;

  const handleSend = async () => {
    if (!selectedTemplateId) return;
    setInlineError(null);

    try {
      const result = await sendToSpeakers.mutateAsync({
        template_id: selectedTemplateId,
        recipient_ids: selectedSpeakerIds,
        send_immediately: true,
      });

      toast.success(
        `Campaign sent to ${result.total_recipients} speaker${result.total_recipients !== 1 ? "s" : ""}.`
      );
      onSuccess();
      onClose();
      setSelectedTemplateId(null);
    } catch (err: any) {
      // Do NOT close — surface the error inside the dialog instead
      const detail = err?.response?.data?.detail ?? err?.message ?? "Failed to send emails.";
      const msg = Array.isArray(detail)
        ? detail.map((d: any) => d.msg ?? JSON.stringify(d)).join(", ")
        : typeof detail === "string"
        ? detail
        : "Failed to send emails.";
      setInlineError(msg);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[200]"
          />
          <div className="fixed inset-0 flex items-center justify-center z-[210] pointer-events-none p-4">
            <motion.div
              initial={{ scale: 0.95, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 20 }}
              className="w-full max-w-lg bg-[var(--card)] rounded-[2.5rem] border border-[var(--border)] shadow-2xl pointer-events-auto overflow-hidden text-[var(--text)]"
            >
              <div className="p-8">
                {/* Header */}
                <div className="flex items-center justify-between mb-8">
                  <div className="flex items-center gap-4">
                    <div className="h-12 w-12 rounded-2xl bg-[var(--pri)]/10 flex items-center justify-center">
                      <Mail className="h-6 w-6 text-[var(--pri)]" />
                    </div>
                    <div>
                      <h3 className="text-xl font-black text-[var(--text)] tracking-tight">
                        Select Email Template
                      </h3>
                      <p className="text-[11px] font-bold text-muted uppercase tracking-widest mt-0.5">
                        Sending to{" "}
                        <span className="text-[var(--pri)]">{count}</span>{" "}
                        recipient{count !== 1 ? "s" : ""}
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={onClose}
                    className="h-10 w-10 rounded-full border border-[var(--border)] bg-[var(--surf)] flex items-center justify-center text-muted hover:text-[var(--text)] transition-all"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>

                {/* Template list */}
                <div className="space-y-3 max-h-[360px] overflow-y-auto pr-2 no-scrollbar">
                  {templatesLoading ? (
                    [1, 2, 3].map((i) => (
                      <div
                        key={i}
                        className="h-16 w-full rounded-2xl bg-[color-mix(in_srgb,var(--text)_5%,transparent)] animate-pulse"
                      />
                    ))
                  ) : templates?.length === 0 ? (
                    <div className="text-center py-10">
                      <AlertCircle className="h-10 w-10 text-muted mx-auto mb-2 opacity-50" />
                      <p className="text-[13px] font-bold text-muted">
                        No templates found. Create one in the Email Manager first.
                      </p>
                    </div>
                  ) : (
                    templates?.map((t) => (
                      <button
                        key={t.id}
                        onClick={() => {
                          setSelectedTemplateId(t.id);
                          setInlineError(null);
                        }}
                        className={cn(
                          "w-full flex items-center justify-between p-5 rounded-2xl border transition-all text-left group",
                          selectedTemplateId === t.id
                            ? "bg-[var(--pri)]/10 border-[var(--pri)] shadow-inner"
                            : "bg-[color-mix(in_srgb,var(--text)_3%,transparent)] border-default hover:border-[var(--pri)]/30"
                        )}
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <p className="text-[13px] font-black text-[var(--text)]">{t.name}</p>
                            <span className="text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full bg-[color-mix(in_srgb,var(--text)_8%,transparent)] text-muted">
                              {t.template_type}
                            </span>
                          </div>
                          <p className="text-[11px] text-muted truncate mt-0.5">{t.subject}</p>
                        </div>
                        <div
                          className={cn(
                            "h-6 w-6 rounded-full border-2 flex items-center justify-center transition-all shrink-0 ml-4",
                            selectedTemplateId === t.id
                              ? "bg-[var(--pri)] border-[var(--pri)] text-[var(--text)]"
                              : "border-default group-hover:border-[var(--pri)]/50"
                          )}
                        >
                          {selectedTemplateId === t.id && <CheckCircle2 className="h-3.5 w-3.5" />}
                        </div>
                      </button>
                    ))
                  )}
                </div>

                {/* Inline error — shown inside dialog, dialog stays open */}
                <AnimatePresence>
                  {inlineError && (
                    <motion.div
                      initial={{ opacity: 0, y: -8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -8 }}
                      className="mt-5 flex items-start gap-3 p-4 rounded-2xl bg-[var(--dan)]/10 border border-[var(--dan)]/20"
                    >
                      <AlertCircle className="h-5 w-5 text-[var(--dan)] shrink-0 mt-0.5" />
                      <p className="text-[12px] font-bold text-[var(--dan)] leading-relaxed">
                        {inlineError}
                      </p>
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Footer buttons */}
                <div className="mt-8 flex gap-4">
                  <Button
                    onClick={onClose}
                    variant="ghost"
                    className="flex-1 h-14 rounded-2xl text-[11px] font-black uppercase tracking-widest text-muted hover:text-[var(--text)]"
                  >
                    Cancel
                  </Button>
                  <Button
                    disabled={!selectedTemplateId || sendToSpeakers.isPending}
                    onClick={handleSend}
                    className="flex-[2] h-14 rounded-2xl bg-[var(--pri)] hover:bg-[var(--sec)] text-[var(--text)] font-black uppercase tracking-widest text-[11px] shadow-lg border-0 flex items-center justify-center gap-2"
                  >
                    {sendToSpeakers.isPending ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Dispatching…
                      </>
                    ) : (
                      <>
                        <Send className="h-4 w-4" />
                        Send to {count} Speaker{count !== 1 ? "s" : ""}
                      </>
                    )}
                  </Button>
                </div>
              </div>
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  );
}
