"use client";

import { useRef, useState } from "react";
import { Download, FileCheck2, Paperclip, ShieldAlert, Upload } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  type SupportScope,
  useDownloadSupportAttachmentAdmin,
  useSupportAttachmentsAdmin,
  useUploadSupportAttachmentAdmin,
} from "@/services/support-admin-service";

const ACCEPTED = ".pdf,.png,.jpg,.jpeg,.txt,.csv,.docx,.xlsx";

function formatBytes(value?: number | null) {
  if (!value) return "Unknown size";
  if (value < 1024 * 1024) return `${Math.ceil(value / 1024)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

export function SupportAttachmentsPanel({ scope, ticketId }: { scope: SupportScope; ticketId: string }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [reason, setReason] = useState("");
  const attachments = useSupportAttachmentsAdmin(scope, ticketId);
  const upload = useUploadSupportAttachmentAdmin(scope);
  const download = useDownloadSupportAttachmentAdmin(scope);

  const submit = async () => {
    if (!file || reason.trim().length < 12) return;
    try {
      await upload.mutateAsync({ ticketId, file, reason: reason.trim(), idempotencyKey: crypto.randomUUID() });
      toast.success("Attachment uploaded and quarantined for malware scanning.");
      setFile(null);
      setReason("");
      if (inputRef.current) inputRef.current.value = "";
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Attachment upload failed.");
    }
  };

  const openDownload = async (attachmentId: string) => {
    try {
      const result = await download.mutateAsync({ ticketId, attachmentId });
      window.open(result.download_url, "_blank", "noopener,noreferrer");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Attachment is not available for download.");
    }
  };

  return (
    <section className="rounded-2xl border border-border bg-surface p-5">
      <div className="flex items-start justify-between gap-3">
        <div><h2 className="flex items-center gap-2 text-sm font-semibold"><Paperclip className="size-4" />Case attachments</h2><p className="mt-1 text-xs text-[var(--text-tertiary)]">Direct uploads remain quarantined until the shared malware scanner marks them ready.</p></div>
        <Badge variant="outline" className="border-amber-400/20 text-[9px] uppercase text-amber-300">Private evidence</Badge>
      </div>

      <div className="mt-4 space-y-2">
        {attachments.isLoading ? <p className="text-xs text-[var(--text-tertiary)]">Loading attachments...</p> : !attachments.data?.length ? <p className="rounded-xl border border-dashed border-border p-5 text-center text-xs text-[var(--text-tertiary)]">No case files are recorded.</p> : attachments.data.map((attachment) => (
          <article key={attachment.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-surface-2 p-3">
            <div className="min-w-0"><p className="truncate text-xs font-semibold text-[var(--text-primary)]">{attachment.file_name}</p><p className="mt-1 text-[10px] text-[var(--text-tertiary)]">{formatBytes(attachment.file_size_bytes)} · {new Date(attachment.created_at).toLocaleString()}</p></div>
            <div className="flex items-center gap-2"><Badge variant="outline" className="text-[9px] uppercase">{attachment.processing_status}</Badge><Button variant="ghost" size="icon" aria-label={`Download ${attachment.file_name}`} disabled={attachment.processing_status !== "READY" || download.isPending} onClick={() => void openDownload(attachment.id)}><Download className="size-4" /></Button></div>
          </article>
        ))}
      </div>

      <div className="mt-5 grid gap-3 border-t border-border pt-5">
        <label className="text-xs text-[var(--text-secondary)]">Select evidence file<input ref={inputRef} type="file" accept={ACCEPTED} className="mt-1.5 block w-full rounded-lg border border-border bg-surface-2 p-2 text-xs" onChange={(event) => setFile(event.target.files?.[0] ?? null)} /></label>
        <label className="text-xs text-[var(--text-secondary)]">Audit reason<Textarea value={reason} onChange={(event) => setReason(event.target.value)} minLength={12} placeholder="Explain why this file is required for the support case" className="mt-1.5 min-h-20" /></label>
        <div className="flex flex-wrap items-center justify-between gap-3"><p className="flex items-center gap-1.5 text-[10px] text-amber-300"><ShieldAlert className="size-3.5" />25 MB maximum. Unsafe or unscanned files cannot be downloaded.</p><Button size="sm" disabled={!file || reason.trim().length < 12 || upload.isPending} onClick={() => void submit()}>{upload.isPending ? <FileCheck2 className="mr-2 size-4 animate-pulse" /> : <Upload className="mr-2 size-4" />}{upload.isPending ? "Uploading..." : "Upload evidence"}</Button></div>
      </div>
    </section>
  );
}
