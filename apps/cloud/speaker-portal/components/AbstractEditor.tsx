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

const STATUS_TONE: Record<PortalTalk["abstract_status"], string> = {
  DRAFT: "border-white/10 bg-white/5 text-slate-300",
  SUBMITTED: "border-sky-400/25 bg-sky-400/10 text-sky-300",
  UNDER_REVIEW: "border-amber-400/25 bg-amber-400/10 text-amber-300",
  ACCEPTED: "border-emerald-400/25 bg-emerald-400/10 text-emerald-300",
  REJECTED: "border-red-400/25 bg-red-400/10 text-red-300",
  REVISION_REQUESTED:
    "border-violet-400/25 bg-violet-400/10 text-violet-300",
  WITHDRAWN: "border-white/10 bg-white/5 text-slate-400",
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
      <div className="rounded-2xl border border-white/10 bg-black/10 p-4">
        <div className="flex items-start gap-3">
          <Lock className="mt-0.5 h-4 w-4 text-slate-400" />
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-300">
              Abstract submission unavailable
            </p>
            <p className="mt-1 text-xs leading-5 text-slate-500">
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
  const canSubmit = text.trim().length >= 50 && !locked;
  const parsedKeywords = keywords
    .split(",")
    .map((keyword) => keyword.trim())
    .filter(Boolean);

  const saveDraft = async () => {
    try {
      await save.mutateAsync({
        eventId,
        token,
        talk,
        abstractText: text,
        keywords: parsedKeywords,
      });
      setEditing(false);
      toast.success("Abstract draft saved");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Abstract draft could not be saved",
      );
    }
  };

  const submitDraft = async () => {
    try {
      await submit.mutateAsync({ eventId, token, talk });
      setEditing(false);
      toast.success("Abstract submitted for review");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Abstract could not be submitted",
      );
    }
  };

  const withdrawSubmission = async () => {
    try {
      await withdraw.mutateAsync({ eventId, token, talk });
      toast.success("Abstract withdrawn");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Abstract could not be withdrawn",
      );
    }
  };

  return (
    <div className="rounded-2xl border border-white/10 bg-black/10 p-4 text-left">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <FilePenLine className="h-4 w-4 text-indigo-300" />
          <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-300">
            Talk abstract
          </p>
        </div>
        <span
          className={cn(
            "rounded-full border px-2 py-1 text-[9px] font-black uppercase tracking-wider",
            STATUS_TONE[talk.abstract_status],
          )}
        >
          {talk.abstract_status.replaceAll("_", " ")}
        </span>
      </div>

      {talk.abstract_review_notes && (
        <div className="mt-3 rounded-xl border border-violet-400/20 bg-violet-400/5 p-3">
          <p className="text-[9px] font-black uppercase tracking-wider text-violet-300">
            Organizer review
          </p>
          <p className="mt-1 text-xs leading-5 text-violet-100">
            {talk.abstract_review_notes}
          </p>
        </div>
      )}

      {editing ? (
        <div className="mt-4 space-y-3">
          <textarea
            value={text}
            onChange={(event) => setText(event.target.value)}
            rows={7}
            maxLength={20000}
            placeholder="Explain the problem, method, evidence, and conclusion for this talk."
            className="w-full rounded-xl border border-white/10 bg-black/20 p-3 text-sm leading-6 text-white outline-none placeholder:text-slate-600 focus:border-indigo-400"
          />
          <div className="flex items-center justify-between text-[10px] font-bold text-slate-500">
            <span>Minimum 50 characters</span>
            <span>{text.trim().length.toLocaleString()} / 20,000</span>
          </div>
          <input
            value={keywords}
            onChange={(event) => setKeywords(event.target.value)}
            placeholder="Keywords, separated by commas"
            className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2.5 text-sm text-white outline-none placeholder:text-slate-600 focus:border-indigo-400"
          />
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={saveDraft}
              disabled={save.isPending || text.trim().length < 50}
              className="rounded-xl bg-indigo-500 px-4 py-2 text-[10px] font-black uppercase tracking-wider text-white disabled:opacity-40"
            >
              Save draft
            </button>
            <button
              type="button"
              onClick={() => setEditing(false)}
              className="rounded-xl border border-white/10 px-4 py-2 text-[10px] font-black uppercase tracking-wider text-slate-300"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div className="mt-3">
          <p className="line-clamp-4 whitespace-pre-wrap text-xs leading-5 text-slate-400">
            {talk.abstract_text ||
              "No abstract has been drafted for this talk yet."}
          </p>
          {!!talk.abstract_keywords?.length && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {talk.abstract_keywords.map((keyword) => (
                <span
                  key={keyword}
                  className="rounded-md bg-white/5 px-2 py-1 text-[9px] font-bold text-slate-400"
                >
                  {keyword}
                </span>
              ))}
            </div>
          )}
          <div className="mt-4 flex flex-wrap gap-2">
            {!locked && (
              <button
                type="button"
                onClick={() => setEditing(true)}
                className="rounded-xl border border-white/10 px-3 py-2 text-[10px] font-black uppercase tracking-wider text-slate-200 hover:bg-white/5"
              >
                <RotateCcw className="mr-1 inline h-3 w-3" />
                {talk.abstract_text ? "Edit draft" : "Write abstract"}
              </button>
            )}
            {canSubmit && talk.abstract_text && (
              <button
                type="button"
                onClick={submitDraft}
                disabled={submit.isPending}
                className="rounded-xl bg-indigo-500 px-3 py-2 text-[10px] font-black uppercase tracking-wider text-white disabled:opacity-40"
              >
                <Send className="mr-1 inline h-3 w-3" />
                Submit for review
              </button>
            )}
            {["SUBMITTED", "UNDER_REVIEW"].includes(talk.abstract_status) && (
              <button
                type="button"
                onClick={withdrawSubmission}
                disabled={withdraw.isPending}
                className="rounded-xl border border-amber-400/20 px-3 py-2 text-[10px] font-black uppercase tracking-wider text-amber-300 disabled:opacity-40"
              >
                <Undo2 className="mr-1 inline h-3 w-3" />
                Withdraw
              </button>
            )}
            {talk.abstract_status === "ACCEPTED" && (
              <span className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wider text-emerald-300">
                <CheckCircle2 className="h-3.5 w-3.5" />
                Accepted for programme
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
