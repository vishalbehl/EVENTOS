"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { X, Mail, CheckCircle2, Loader2, AlertCircle, Send } from "lucide-react";
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
  const params = useParams();
  const eventIdStr = (params?.eventId as string) || "";
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
        `Campaign dispatched to ${result.total_recipients} speaker${result.total_recipients !== 1 ? "s" : ""}.`
      );
      onSuccess();
      onClose();
      setSelectedTemplateId(null);
    } catch (err: any) {
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
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60">
          <motion.div
            initial={{ scale: 0.96, opacity: 0, y: 8 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.96, opacity: 0, y: 8 }}
            transition={{ duration: 0.15 }}
            className="w-full max-w-lg rounded-lg border border-[var(--border-default)] bg-[var(--card)] p-6 shadow-md flex flex-col max-h-[90vh] overflow-hidden space-y-4"
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b border-[var(--border-subtle)] pb-3">
              <div className="flex items-center gap-2.5">
                <div className="flex size-8 items-center justify-center rounded-lg bg-[var(--pri)]/10 text-[var(--pri)] border border-[var(--pri)]/20">
                  <Mail className="size-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-[var(--text-primary)]">
                    Select Email Template
                  </h3>
                  <p className="text-[11px] text-[var(--text-secondary)]">
                    Dispatching to <span className="font-bold text-[var(--pri)]">{count}</span> recipient{count !== 1 ? "s" : ""}
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

            {/* Template list */}
            <div className="space-y-2.5 max-h-72 overflow-y-auto pr-1">
              {templatesLoading ? (
                <div className="py-10 text-center text-xs text-[var(--text-secondary)]">
                  <Loader2 className="size-5 text-[var(--pri)] animate-spin mx-auto mb-1.5" />
                  Loading email templates...
                </div>
              ) : templates?.length === 0 ? (
                <div className="text-center py-8 text-xs text-[var(--text-secondary)]">
                  <AlertCircle className="size-6 text-[var(--text-tertiary)] mx-auto mb-1.5" />
                  <p className="font-semibold">No templates available</p>
                  <p className="text-[11px] text-[var(--text-tertiary)]">Create a template in Email Designer first.</p>
                </div>
              ) : (
                templates?.map((t) => (
                  <button
                    type="button"
                    key={t.id}
                    onClick={() => {
                      setSelectedTemplateId(t.id);
                      setInlineError(null);
                    }}
                    className={cn(
                      "w-full flex items-center justify-between p-3 rounded-lg border transition-colors text-left cursor-pointer",
                      selectedTemplateId === t.id
                        ? "bg-[var(--pri)]/10 border-[var(--pri)]"
                        : "bg-[var(--bg-surface-2)] border-[var(--border-default)] hover:border-[var(--pri)]/50"
                    )}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-[var(--text-primary)]">{t.name}</span>
                        <span className="text-[9px] font-bold uppercase px-1.5 py-0.2 rounded bg-[var(--card)] text-[var(--text-tertiary)] border border-[var(--border-subtle)]">
                          {t.template_type}
                        </span>
                      </div>
                      <p className="text-[11px] text-[var(--text-secondary)] truncate mt-0.5">{t.subject}</p>
                    </div>
                    <div
                      className={cn(
                        "size-4 rounded-full border flex items-center justify-center shrink-0 ml-3",
                        selectedTemplateId === t.id
                          ? "bg-[var(--pri)] border-[var(--pri)] text-[var(--primary-contrast)]"
                          : "border-[var(--border-default)]"
                      )}
                    >
                      {selectedTemplateId === t.id && <CheckCircle2 className="size-3" />}
                    </div>
                  </button>
                ))
              )}
            </div>

            {/* Inline error message */}
            {inlineError && (
              <div className="flex items-start gap-2 p-3 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-600 dark:text-rose-400 text-xs">
                <AlertCircle className="size-4 shrink-0 mt-0.5" />
                <p className="font-medium">{inlineError}</p>
              </div>
            )}

            {/* Actions */}
            <div className="flex items-center justify-end gap-2.5 border-t border-[var(--border-subtle)] pt-3">
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg border border-[var(--border-default)] bg-[var(--card)] px-4 py-2 text-xs font-semibold text-[var(--text-secondary)] hover:bg-[var(--bg-surface-hover)] transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={!selectedTemplateId || sendToSpeakers.isPending}
                onClick={handleSend}
                className="flex items-center gap-2 rounded-lg bg-[var(--pri)] px-5 py-2 text-xs font-bold text-[var(--primary-contrast)] shadow-sm hover:opacity-90 disabled:opacity-40 transition-all cursor-pointer"
              >
                {sendToSpeakers.isPending ? (
                  <>
                    <Loader2 className="size-3.5 animate-spin" /> Dispatching...
                  </>
                ) : (
                  <>
                    <Send className="size-3.5" /> Send to {count} Speaker{count !== 1 ? "s" : ""}
                  </>
                )}
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
