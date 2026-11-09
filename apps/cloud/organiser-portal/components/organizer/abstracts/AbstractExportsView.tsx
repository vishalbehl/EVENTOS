"use client";

import { useParams } from "next/navigation";
import { BookOpenCheck, Download } from "lucide-react";
import { AbstractShell } from "./AbstractShell";

export function AbstractExportsView() {
  const { eventId } = useParams<{ eventId: string }>();
  const baseUrl = `${process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000"}/api/v1/events/${eventId}/abstracts/exports`;
  const exports = [
    ["Manifest JSON", `${baseUrl}/manifest`],
    ["Submissions CSV", `${baseUrl}/submissions.csv`],
    ["Abstract book DOCX", `${baseUrl}/abstract-book.docx`],
    ["Print-ready abstract book", `${baseUrl}/abstract-book.html`],
    ["Reviewer report DOCX", `${baseUrl}/reviewer-report.docx`],
  ];

  return (
    <AbstractShell view="exports">
      <section className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
        {exports.map(([label, href]) => (
          <a
            key={label}
            href={href}
            className="rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface)] p-5 hover:bg-[var(--bg-surface-2)] transition-colors"
          >
            <Download className="size-5 text-[var(--brand-primary)]" />
            <p className="mt-4 text-sm font-black text-[var(--text-primary)]">{label}</p>
            <p className="mt-1 text-xs text-[var(--text-secondary)]">Export uses authoritative abstract workflow records.</p>
          </a>
        ))}
        <article className="rounded-xl border border-dashed border-[var(--border-default)] bg-[var(--bg-surface)] p-5">
          <BookOpenCheck className="size-5 text-[var(--text-tertiary)]" />
          <p className="mt-4 text-sm font-black text-[var(--text-primary)]">Reviewer report pack</p>
          <p className="mt-1 text-xs leading-5 text-[var(--text-secondary)]">
            The committee evidence pack is available as DOCX; branded per-reviewer templates remain a later extension.
          </p>
        </article>
      </section>
    </AbstractShell>
  );
}
export default AbstractExportsView;
