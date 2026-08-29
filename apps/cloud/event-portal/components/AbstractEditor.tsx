"use client";

import { useEffect, useState } from "react";
import {
  CheckCircle2,
  FilePenLine,
  Lock,
  RotateCcw,
  Send,
  Undo2,
} from "lucide-react";
import { toast } from "sonner";
import {
  PortalTalk,
  useSaveAbstractDraft,
  useSubmitAbstract,
  useWithdrawAbstract,
} from "@/hooks/usePortal";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";

const STATUS_TONE: Record<PortalTalk["abstract_status"], string> = {
  DRAFT: "border-[var(--border-default)] bg-[var(--bg-surface-2)] text-[var(--muted)]",
  SUBMITTED: "border-[var(--status-info)] bg-[var(--status-info-muted)] text-[var(--status-info)]",
  UNDER_REVIEW: "border-[var(--status-warning)] bg-[var(--status-warning-muted)] text-[var(--status-warning)]",
  ACCEPTED: "border-[var(--status-success)] bg-[var(--status-success-muted)] text-[var(--status-success)]",
  REJECTED: "border-[var(--status-danger)] bg-[var(--status-danger-muted)] text-[var(--status-danger)]",
  REVISION_REQUESTED: "border-[var(--pri)] bg-[color-mix(in_srgb,var(--pri)_12%,transparent)] text-[var(--pri)]",
  WITHDRAWN: "border-[var(--border-default)] bg-[var(--bg-surface-3)] text-[var(--muted)]",
};

export function AbstractEditor({
  eventId,
  token,
  talk,
  enabled,
  denialReason,
}: {
  eventId: string;
  token: string;
  talk: PortalTalk;
  enabled: boolean;
  denialReason?: string | null;
}) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(talk.abstract_text ?? "");
  const [keywords, setKeywords] = useState(
    (talk.abstract_keywords ?? []).join(", "),
  );
  const save = useSaveAbstractDraft();
  const submit = useSubmitAbstract();
  const withdraw = useWithdrawAbstract();

  useEffect(() => {
    setText(talk.abstract_text ?? "");
    setKeywords((talk.abstract_keywords ?? []).join(", "));
  }, [talk.abstract_keywords, talk.abstract_text, talk.abstract_version]);

  if (!enabled) {
    return (
      <div className="rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface-2)] p-4">
        <div className="flex items-start gap-3">
          <Lock className="mt-0.5 h-4 w-4 text-[var(--muted)]" />
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-[var(--text)]">
              Abstract submission unavailable
            </p>
            <p className="mt-1 text-xs leading-5 text-[var(--muted)]">
              The organizer has not enabled abstract submission for this event
              {denialReason ? ` (${denialReason.replaceAll("_", " ").toLowerCase()})` : ""}.
            </p>
          </div>
        </div>
      </div>
    );
  }

  const locked = ["SUBMITTED", "UNDER_REVIEW", "ACCEPTED"].includes(
    talk.abstract_status,
  );

  const wordCount = text.trim() ? text.trim().split(/\s+/).length : 0;

  const handleSaveDraft = async () => {
    try {
      const keywordList = keywords
        .split(",")
        .map((k) => k.trim())
        .filter(Boolean);
      await save.mutateAsync({
        eventId,
        token,
        talk,
        abstractText: text,
        keywords: keywordList,
      });
      setEditing(false);
      toast.success("Abstract draft saved successfully");
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || "Failed to save abstract draft");
    }
  };

  const handleSubmit = async () => {
    try {
      await submit.mutateAsync({ eventId, token, talk });
      setEditing(false);
      toast.success("Abstract submitted for review!");
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || "Failed to submit abstract");
    }
  };

  const handleWithdraw = async () => {
    try {
      await withdraw.mutateAsync({ eventId, token, talk });
      toast.success("Abstract withdrawn");
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || "Failed to withdraw abstract");
    }
  };

  return (
    <div className="space-y-4 rounded-xl border border-[var(--border-default)] bg-[var(--card)] p-5">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border-default)] pb-4">
        <div>
          <h4 className="text-sm font-bold text-[var(--text)]">Abstract Details</h4>
          <p className="text-xs text-[var(--muted)]">Version {talk.abstract_version || 1}</p>
        </div>
        <span
          className={cn(
            "rounded-full border px-3 py-0.5 text-xs font-semibold uppercase tracking-wider",
            STATUS_TONE[talk.abstract_status] ?? STATUS_TONE.DRAFT,
          )}
        >
          {talk.abstract_status.replaceAll("_", " ")}
        </span>
      </div>

      {editing ? (
        <div className="space-y-4">
          <div>
            <label className="text-xs font-semibold text-[var(--text)] block mb-1.5">Abstract Body ({wordCount} words)</label>
            <Textarea
              rows={8}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Paste or type your abstract text here..."
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-[var(--text)] block mb-1.5">Keywords (comma-separated)</label>
            <Input
              type="text"
              value={keywords}
              onChange={(e) => setKeywords(e.target.value)}
              placeholder="e.g. Artificial Intelligence, Healthcare, Oncology"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" size="sm" onClick={() => setEditing(false)}>Cancel</Button>
            <Button size="sm" onClick={handleSaveDraft} disabled={save.isPending}>
              {save.isPending ? "Saving..." : "Save Draft"}
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="rounded-lg bg-[var(--bg-surface-2)] p-4 border border-[var(--border-default)]">
            <p className="text-xs text-[var(--text)] whitespace-pre-wrap leading-relaxed">
              {text || <span className="text-[var(--muted)] italic">No abstract provided yet.</span>}
            </p>
          </div>

          {keywords ? (
            <div className="flex flex-wrap gap-1.5">
              {keywords.split(",").map((k, i) => (
                <span key={i} className="px-2.5 py-0.5 rounded-md bg-[var(--bg-surface-3)] text-xs text-[var(--text-secondary)] border border-[var(--border-default)]">
                  {k.trim()}
                </span>
              ))}
            </div>
          ) : null}

          {talk.abstract_review_notes && (
            <div className="p-3 rounded-lg border border-[var(--status-warning)] bg-[var(--status-warning-muted)] text-xs text-[var(--status-warning)]">
              <span className="font-bold">Reviewer Feedback:</span> {talk.abstract_review_notes}
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-[var(--border-default)]">
            <div className="text-xs text-[var(--muted)]">
              {wordCount} words
            </div>

            <div className="flex gap-2">
              {!locked && (
                <>
                  <Button variant="outline" size="sm" onClick={() => setEditing(true)} className="flex items-center gap-1.5">
                    <FilePenLine className="h-3.5 w-3.5" />
                    Edit
                  </Button>
                  <Button size="sm" onClick={handleSubmit} disabled={submit.isPending || !text.trim()} className="flex items-center gap-1.5">
                    <Send className="h-3.5 w-3.5" />
                    Submit Abstract
                  </Button>
                </>
              )}
              {talk.abstract_status === "SUBMITTED" && (
                <Button variant="outline" size="sm" onClick={handleWithdraw} disabled={withdraw.isPending} className="flex items-center gap-1.5 text-[var(--status-danger)]">
                  <Undo2 className="h-3.5 w-3.5" />
                  Withdraw
                </Button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
