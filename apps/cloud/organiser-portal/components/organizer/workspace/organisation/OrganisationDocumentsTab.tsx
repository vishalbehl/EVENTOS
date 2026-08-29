"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Archive,
  Download,
  FileClock,
  FileText,
  RefreshCw,
  Upload,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { apiClient, apiGet } from "@/lib/api-client";
import { DataTable, Panel, StatusBadge } from "../OrganiserPrimitives";
import { OrganisationPage } from "./shared";

type Doc = {
  id: string;
  document_group_id: string;
  revision: number;
  name: string;
  document_type: string;
  owner_name?: string;
  expires_at?: string | null;
  processing_status: string;
  download_url?: string | null;
  version: number;
};
type Revision = {
  id: string;
  revision: number;
  name: string;
  owner_name: string;
  processing_status: string;
  is_current: boolean;
  created_at: string;
  download_url?: string | null;
};

export function OrganisationDocumentsTab() {
  const qc = useQueryClient();
  const [page, setPage] = useState(1),
    [pageSize, setPageSize] = useState(10);
  const [open, setOpen] = useState(false),
    [replacement, setReplacement] = useState<Doc | null>(null),
    [historyDocument, setHistoryDocument] = useState<Doc | null>(null);
  const [archiveDocument, setArchiveDocument] = useState<Doc | null>(null);
  const [file, setFile] = useState<File | null>(null),
    [type, setType] = useState("LEGAL"),
    [expiry, setExpiry] = useState("");
  const query = useQuery({
    queryKey: ["organisation", "documents", page, pageSize],
    queryFn: () =>
      apiGet<{ items: Doc[]; total: number }>(
        `/organiser/documents?page=${page}&page_size=${pageSize}`,
      ),
  });
  const history = useQuery({
    queryKey: ["organisation", "document-history", historyDocument?.id],
    queryFn: () =>
      apiGet<{ items: Revision[] }>(
        `/organiser/documents/${historyDocument!.id}/history`,
      ),
    enabled: Boolean(historyDocument),
  });
  const closeUpload = () => {
    setOpen(false);
    setReplacement(null);
    setFile(null);
    setExpiry("");
  };
  const upload = useMutation({
    mutationFn: () => {
      const body = new FormData();
      body.append("file", file!);
      const params = new URLSearchParams();
      if (!replacement) params.set("document_type", type);
      if (expiry)
        params.set("expires_at", new Date(`${expiry}T00:00:00Z`).toISOString());
      const path = replacement
        ? `/organiser/documents/${replacement.id}/replace?${params}`
        : `/organiser/documents?${params}`;
      return apiClient.post(path, body, {
        headers: {
          "Content-Type": "multipart/form-data",
          ...(replacement ? { "If-Match": String(replacement.version) } : {}),
        },
      });
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["organisation", "documents"] });
      toast.success(
        replacement
          ? "Replacement queued for security scanning."
          : "Document queued for security scanning.",
      );
      closeUpload();
    },
    onError: (cause: any) => toast.error(cause?.message || "Upload failed."),
  });
  const archive = useMutation({
    mutationFn: (document: Doc) =>
      apiClient.delete(`/organiser/documents/${document.id}`, {
        headers: { "If-Match": String(document.version) },
      }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["organisation", "documents"] });
      setArchiveDocument(null);
      toast.success("Document archived.");
    },
    onError: (cause: any) =>
      toast.error(cause?.message || "Document could not be archived."),
  });
  const beginUpload = (document?: Doc) => {
    setReplacement(document || null);
    setType(document?.document_type || "LEGAL");
    setExpiry(document?.expires_at?.slice(0, 10) || "");
    setFile(null);
    setOpen(true);
  };

  return (
    <OrganisationPage
      actions={
        <Button onClick={() => beginUpload()}>
          <Upload className="mr-2 h-4 w-4" />
          Upload document
        </Button>
      }
    >
      <Panel title="Organisation documents" className="p-0">
        <DataTable
          columns={[
            "Document",
            "Type",
            "Revision",
            "Owner",
            "Expiry",
            "Security",
            "Actions",
          ]}
          total={query.data?.total || 0}
          page={page}
          pageSize={pageSize}
          onPageChange={setPage}
          onPageSizeChange={setPageSize}
          rows={(query.data?.items || []).map((document) => [
            <span
              key={document.id}
              className="inline-flex items-center gap-2 font-bold"
            >
              <FileText className="h-4 w-4 text-[var(--op-primary)]" />
              {document.name}
            </span>,
            document.document_type,
            `v${document.revision}`,
            document.owner_name || "Unavailable",
            document.expires_at
              ? new Date(document.expires_at).toLocaleDateString()
              : "No expiry",
            <StatusBadge
              key={`${document.id}-status`}
              status={document.processing_status}
            />,
            <div key={`${document.id}-actions`} className="flex gap-2">
              {document.download_url ? (
                <Button asChild size="icon" variant="outline" title="Download">
                  <a
                    href={document.download_url}
                    aria-label={`Download ${document.name}`}
                  >
                    <Download className="h-4 w-4" />
                  </a>
                </Button>
              ) : null}
              <Button
                size="icon"
                variant="outline"
                title="Replace"
                aria-label={`Replace ${document.name}`}
                onClick={() => beginUpload(document)}
              >
                <RefreshCw className="h-4 w-4" />
              </Button>
              <Button
                size="icon"
                variant="outline"
                title="Version history"
                aria-label={`History for ${document.name}`}
                onClick={() => setHistoryDocument(document)}
              >
                <FileClock className="h-4 w-4" />
              </Button>
              <Button
                size="icon"
                variant="outline"
                title="Archive"
                aria-label={`Archive ${document.name}`}
                onClick={() => setArchiveDocument(document)}
              >
                <Archive className="h-4 w-4" />
              </Button>
            </div>,
          ])}
          empty={
            query.isLoading
              ? "Loading documents..."
              : query.isError
                ? "Document records are unavailable."
                : "No organisation documents have been uploaded."
          }
        />
      </Panel>
      <Dialog
        open={open}
        onOpenChange={(value) => {
          if (!value) closeUpload();
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {replacement
                ? "Replace organisation document"
                : "Upload organisation document"}
            </DialogTitle>
            <DialogDescription>
              {replacement
                ? `The current v${replacement.revision} remains in immutable history.`
                : "Downloads stay locked until the security scan reports ready."}
            </DialogDescription>
          </DialogHeader>
          {!replacement ? (
            <label className="text-sm font-medium">
              Document type
              <select
                className="op-select mt-2 w-full"
                value={type}
                onChange={(event) => setType(event.target.value)}
              >
                <option>LEGAL</option>
                <option>TAX</option>
                <option>INSURANCE</option>
                <option>COMPLIANCE</option>
                <option>OTHER</option>
              </select>
            </label>
          ) : null}
          <label className="text-sm font-medium">
            Expiry date (optional)
            <input
              className="op-input mt-2 w-full"
              type="date"
              value={expiry}
              onChange={(event) => setExpiry(event.target.value)}
            />
          </label>
          <label className="text-sm font-medium">
            File
            <input
              className="mt-2 block w-full rounded-md border border-[var(--op-border)] p-2 text-sm"
              type="file"
              onChange={(event) => setFile(event.target.files?.[0] || null)}
            />
          </label>
          <DialogFooter>
            <Button variant="outline" onClick={closeUpload}>
              Cancel
            </Button>
            <Button
              disabled={!file || upload.isPending}
              onClick={() => upload.mutate()}
            >
              {upload.isPending
                ? "Uploading..."
                : replacement
                  ? "Replace document"
                  : "Upload"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog
        open={Boolean(historyDocument)}
        onOpenChange={(value) => {
          if (!value) setHistoryDocument(null);
        }}
      >
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Document version history</DialogTitle>
            <DialogDescription>
              {historyDocument?.name}. Previous files are retained as immutable
              revisions.
            </DialogDescription>
          </DialogHeader>
          <DataTable
            columns={[
              "Revision",
              "File",
              "Uploaded by",
              "Uploaded",
              "Security",
              "Download",
            ]}
            rows={(history.data?.items || []).map((revision) => [
              `v${revision.revision}${revision.is_current ? " (current)" : ""}`,
              revision.name,
              revision.owner_name,
              new Date(revision.created_at).toLocaleString(),
              <StatusBadge
                key={`${revision.id}-status`}
                status={revision.processing_status}
              />,
              revision.download_url ? (
                <Button
                  key={`${revision.id}-download`}
                  asChild
                  size="icon"
                  variant="outline"
                >
                  <a
                    href={revision.download_url}
                    aria-label={`Download revision ${revision.revision}`}
                  >
                    <Download className="h-4 w-4" />
                  </a>
                </Button>
              ) : (
                "Locked"
              ),
            ])}
            empty={
              history.isLoading
                ? "Loading version history..."
                : history.isError
                  ? "Version history is unavailable."
                  : "No versions found."
            }
          />
        </DialogContent>
      </Dialog>
      <Dialog
        open={Boolean(archiveDocument)}
        onOpenChange={(value) => {
          if (!value) setArchiveDocument(null);
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Archive organisation document</DialogTitle>
            <DialogDescription>
              {archiveDocument?.name} will leave the active list. Its immutable
              revision history remains retained.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setArchiveDocument(null)}>
              Cancel
            </Button>
            <Button
              disabled={!archiveDocument || archive.isPending}
              onClick={() => archiveDocument && archive.mutate(archiveDocument)}
            >
              {archive.isPending ? "Archiving..." : "Archive document"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </OrganisationPage>
  );
}
