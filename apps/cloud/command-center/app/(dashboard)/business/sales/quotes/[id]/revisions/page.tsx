"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, CheckCircle2, FileText, Plus, ShieldAlert, User } from "lucide-react";
import { useCreateQuoteRevision, useQuoteDetail, useQuoteRevisions } from "@/services/super-admin-service";
import { PageContainer } from "@/components/super-admin/ui/PageContainer";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatIST, formatLakhRupee } from "@/lib/formatters";

export default function QuoteRevisionsPage() {
  const router = useRouter();
  const params = useParams();
  const quoteId = params.id as string;

  const { data: quote } = useQuoteDetail(quoteId);
  const { data: revisions = [], refetch: refetchRevisions } = useQuoteRevisions(quoteId);
  const createRevisionMutation = useCreateQuoteRevision(quoteId);

  const [selectedRevisionId, setSelectedRevisionId] = useState<string>("");
  const [noteInput, setNoteInput] = useState("");

  const activeRevision = revisions.find((revision: any) => revision.id === selectedRevisionId) || revisions[0];

  const handleCreateRevision = async () => {
    await createRevisionMutation.mutateAsync({
      notes: [noteInput || "Revision created without additional notes."],
    });
    setNoteInput("");
    refetchRevisions();
  };

  return (
    <PageContainer>
      <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="space-y-2">
          <Button size="sm" variant="ghost" className="h-8 gap-2 px-0 text-xs text-secondary" onClick={() => router.back()}>
            <ArrowLeft className="h-4 w-4" />
            Back
          </Button>
          <div>
            <h1 className="text-xl font-black text-primary">Quote Revision Manager</h1>
            <p className="text-xs text-tertiary">
              Real revision history for {quote?.quote_number || quoteId}. Fabricated comparison data has been removed.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            disabled
            variant="outline"
            size="sm"
            className="h-9 gap-1 border-border bg-surface-2 text-xs text-secondary"
            title="Revision comparison requires persisted delta snapshots before it can be enabled."
          >
            <ShieldAlert className="h-3.5 w-3.5" />
            Compare Unavailable
          </Button>
          <Button
            onClick={handleCreateRevision}
            disabled={createRevisionMutation.isPending}
            className="h-9 gap-1 rounded-xl bg-brand-primary px-4 text-xs font-bold text-white"
          >
            <Plus className="h-3.5 w-3.5" />
            {createRevisionMutation.isPending ? "Creating..." : "Create Revision"}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-8 xl:grid-cols-12">
        <div className="space-y-4 xl:col-span-4">
          <span className="block text-[10px] font-extrabold uppercase tracking-wider text-secondary">Revision versions</span>

          <div className="space-y-3">
            {revisions.map((revision: any) => {
              const isActive = revision.id === selectedRevisionId || (!selectedRevisionId && revision.id === revisions[0]?.id);
              return (
                <Card
                  key={revision.id}
                  onClick={() => setSelectedRevisionId(revision.id)}
                  className={`flex h-28 cursor-pointer flex-col justify-between rounded-2xl border p-4 transition-all ${
                    isActive ? "border-brand-primary/50 bg-[var(--bg-surface)] shadow-md" : "border-border/40 bg-surface-2 hover:border-brand-primary/30"
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <span className="text-xs font-black text-primary">Version {revision.version_number}</span>
                    <Badge className="border border-success/30 bg-success/15 text-[8px] font-black uppercase text-success">
                      {revision.status || "REVISED"}
                    </Badge>
                  </div>

                  <div className="flex items-baseline justify-between pt-2">
                    <span className="font-mono text-sm font-black text-primary">{formatLakhRupee(revision.total_amount)}</span>
                    <span className="flex items-center gap-1 text-[9px] font-bold text-tertiary">
                      <User className="h-3 w-3" />
                      Super Admin
                    </span>
                  </div>

                  <span className="mt-1.5 block border-t border-border/20 pt-1.5 font-mono text-[8px] text-tertiary">
                    Created: {formatIST(revision.created_at)}
                  </span>
                </Card>
              );
            })}

            {revisions.length === 0 && (
              <Card className="rounded-2xl border border-border/50 bg-surface p-8 text-center text-xs text-secondary">
                No revisions are stored for this quote yet.
              </Card>
            )}
          </div>
        </div>

        <div className="space-y-6 xl:col-span-8">
          <Card className="rounded-3xl border border-amber-500/20 bg-amber-500/5 p-5">
            <div className="flex gap-3 text-xs text-secondary">
              <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" />
              <div className="space-y-1">
                <p className="font-black uppercase tracking-[0.18em] text-amber-300">Comparison disabled</p>
                <p>
                  The previous comparison table used fabricated category totals. Re-enable this only after the backend exposes persisted revision line-item
                  deltas, source snapshots, authorization, and audit evidence.
                </p>
              </div>
            </div>
          </Card>

          <Card className="space-y-4 rounded-3xl border border-[var(--border-default)] bg-[var(--bg-surface)] p-5">
            <span className="block border-b border-border/40 pb-2 text-[10px] font-extrabold uppercase tracking-wider text-secondary">
              Revision notes: Version {activeRevision?.version_number || "Not selected"}
            </span>

            <div className="space-y-2">
              {activeRevision?.notes?.map((note: string, index: number) => (
                <div key={`${activeRevision.id}-${index}`} className="flex items-start gap-2 text-xs font-semibold text-secondary">
                  <FileText className="mt-0.5 h-4 w-4 shrink-0 text-brand-primary" />
                  <span>{note}</span>
                </div>
              ))}
              {(!activeRevision?.notes || activeRevision.notes.length === 0) && (
                <span className="block text-[9px] text-tertiary">No notes configured for this revision.</span>
              )}
            </div>
          </Card>

          <Card className="space-y-3 rounded-3xl border border-[var(--border-default)] bg-[var(--bg-surface)] p-5">
            <span className="block text-[10px] font-extrabold uppercase tracking-wider text-secondary">Add revision notes</span>
            <textarea
              value={noteInput}
              onChange={(event) => setNoteInput(event.target.value)}
              placeholder="Summarize changes for the new revision..."
              className="h-20 w-full rounded-2xl border border-border bg-surface-2 p-3 text-xs text-primary outline-none focus:border-brand-primary"
            />
          </Card>
        </div>
      </div>

      <Card className="mt-8 rounded-3xl border border-[var(--border-default)] bg-[var(--bg-surface)] p-6">
        <span className="mb-4 block border-b border-border/40 pb-2 text-[10px] font-extrabold uppercase tracking-wider text-secondary">
          Revision timeline
        </span>

        <div className="space-y-5">
          {revisions.map((revision: any, index: number) => (
            <div key={revision.id} className="relative flex items-start gap-3 text-xs font-semibold text-secondary">
              {index < revisions.length - 1 && <div className="absolute bottom-[-26px] left-[13px] top-[26px] w-[2px] bg-border/40" />}
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-brand-primary/20 bg-brand-primary/10 text-brand-primary">
                <CheckCircle2 className="h-4 w-4" />
              </div>
              <div className="space-y-1">
                <p className="font-bold text-primary">Version {revision.version_number} moved to {revision.status || "REVISED"}</p>
                <span className="block font-mono text-[9px] text-tertiary">{formatIST(revision.created_at)}</span>
              </div>
            </div>
          ))}
        </div>
      </Card>
    </PageContainer>
  );
}
