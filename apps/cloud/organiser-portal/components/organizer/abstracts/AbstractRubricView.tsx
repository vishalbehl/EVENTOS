"use client";

import { useParams } from "next/navigation";
import { ClipboardCheck } from "lucide-react";
import { toast } from "sonner";
import { useAbstractForm, useSaveAbstractForm } from "@/hooks/useAbstractWorkflow";
import { AbstractShell } from "./AbstractShell";
import { ScopedEventEditor } from "@/components/organizer/events/ScopedEventEditor";
import { ScopedCommandFeedback } from "@/components/organizer/events/ScopedCommandFeedback";

export function AbstractRubricView() {
  const { eventId } = useParams<{ eventId: string }>();
  return <ScopedEventEditor eventId={eventId}><RubricEditor /></ScopedEventEditor>;
}

function RubricEditor() {
  const { eventId } = useParams<{ eventId: string }>();
  const form = useAbstractForm(eventId);
  const save = useSaveAbstractForm(eventId);
  const rubric = Array.isArray(form.data?.schema?.rubric)
    ? (form.data?.schema?.rubric as Array<{ label: string; weight: number; description: string }>)
    : [
        { label: "Scientific merit", weight: 30, description: "Evidence quality, research question, and contribution." },
        { label: "Originality", weight: 20, description: "Novelty against the current conference field." },
        { label: "Methodology", weight: 20, description: "Study design, analysis quality, and limitations." },
        { label: "Relevance", weight: 20, description: "Fit with event tracks and delegate value." },
        { label: "Clarity", weight: 10, description: "Readable title, structure, and conclusion." },
      ];

  return (
    <AbstractShell view="rubric">
      {!Array.isArray(form.data?.schema?.rubric) ? <p>Suggested rubric — not yet saved.</p> : null}
      <ScopedCommandFeedback failure={save.commandFailure} retryAt={save.retryAt} />
      <section className="grid gap-5 lg:grid-cols-3">
        {rubric.map((criterion, index) => (
          <article key={`${criterion.label}-${index}`} className="rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface)] p-5">
            <p className="text-[10px] font-black uppercase tracking-wide text-[var(--text-tertiary)]">
              Criterion {index + 1} · {criterion.weight}%
            </p>
            <h2 className="mt-2 text-sm font-black text-[var(--text-primary)]">{criterion.label}</h2>
            <p className="mt-2 text-xs leading-5 text-[var(--text-secondary)]">{criterion.description}</p>
          </article>
        ))}
        <button
          onClick={() =>
            form.data &&
            save.mutate(
              { ...form.data, schema: { ...form.data.schema, rubric }, publish: true },
              { onSuccess: () => toast.success("Rubric saved to active form") }
            )
          }
          disabled={!form.data || save.isPending}
          className="rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface)] p-5 text-left hover:bg-[var(--bg-surface-2)] disabled:opacity-50 cursor-pointer"
        >
          <ClipboardCheck className="size-5 text-[var(--brand-primary)]" />
          <p className="mt-4 text-sm font-black text-[var(--text-primary)]">Save rubric</p>
          <p className="mt-1 text-xs leading-5 text-[var(--text-secondary)]">
            Persist committee scoring criteria into the active abstract form schema.
          </p>
        </button>
      </section>
      {form.isError ? <p role="alert">The current form could not be loaded. Reload before saving.</p> : null}
      {save.isError && !save.commandFailure ? <p role="alert">{save.error.message}</p> : null}
    </AbstractShell>
  );
}
export default AbstractRubricView;
