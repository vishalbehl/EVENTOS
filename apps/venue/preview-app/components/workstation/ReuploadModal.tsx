"use client";

import { useState } from "react";
import {
  Upload,
  FileText,
  Check,
  Folder,
  FolderUp,
  Files,
  X,
  Loader2,
  AlertCircle,
  Video,
  FileSpreadsheet,
} from "lucide-react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useSRRStore } from "@/store/use-srr-store";
import { apiClient } from "@/lib/api-client";
import { toast } from "sonner";

export function ReuploadModal({
  open,
  onClose,
  initialMode = "file",
}: {
  open: boolean;
  onClose: () => void;
  initialMode?: "file" | "folder";
}) {
  const { speaker, sessions, selectedSessionIndex, updatePresentationFile } = useSRRStore();
  const [uploadMode, setUploadMode] = useState<"file" | "folder">(initialMode);
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [folderName, setFolderName] = useState<string>("");

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      processFiles(Array.from(e.dataTransfer.files));
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      processFiles(Array.from(e.target.files));
    }
  };

  const processFiles = (files: File[]) => {
    setSelectedFiles(files);
    if (uploadMode === "folder" || files.length > 1) {
      // Extract folder name if webkitRelativePath exists
      const relativePath = (files[0] as any).webkitRelativePath;
      if (relativePath) {
        const folder = relativePath.split("/")[0];
        setFolderName(folder);
      } else {
        setFolderName("Selected Session Folder");
      }
    }
  };

  const totalSizeMB = selectedFiles
    .reduce((acc, f) => acc + f.size / (1024 * 1024), 0)
    .toFixed(1);

  const handleUploadConfirm = async () => {
    if (selectedFiles.length === 0) return;
    const currentSession = sessions[selectedSessionIndex];
    if (!speaker || !currentSession) {
      toast.error("No assigned speaker/session is available for upload.");
      return;
    }
    setUploading(true);

    try {
      const primaryFile =
        selectedFiles.find((f) => f.name.endsWith(".pptx") || f.name.endsWith(".ppt")) ||
        selectedFiles[0];
      const sizeMB = parseFloat(totalSizeMB) || 0;
      const operationId = crypto.randomUUID();
      const form = new FormData();
      form.append("speaker_id", speaker.id);
      form.append("session_speaker_id", currentSession.session_speaker_id);
      form.append("filename", primaryFile.name);
      // The Venue Server stores one immutable presentation version per upload;
      // the multipart payload contains the selected primary file only.
      form.append("file_size_bytes", String(primaryFile.size));
      form.append("operation_id", operationId);
      const currentVersion = currentSession.presentations?.[0]?.version;
      if (currentVersion !== undefined) form.append("expected_version", String(currentVersion));
      form.append("file", primaryFile);
      const response = await apiClient.post<any>("/api/v1/srr/files/upload", form, {
        headers: { "Content-Type": "multipart/form-data", "Idempotency-Key": operationId },
      });

      updatePresentationFile(selectedSessionIndex, {
        ...response.file,
        file_size_mb: response.file?.file_size_mb ?? sizeMB,
      });

      setUploading(false);
      setSelectedFiles([]);
      setFolderName("");
      onClose();

      if (uploadMode === "folder" || selectedFiles.length > 1) {
        toast.success(
          `Uploaded the primary presentation from ${selectedFiles.length} selected files (${sizeMB} MB).`
        );
      } else {
        toast.success(`Successfully uploaded ${primaryFile.name}`);
      }
    } catch (err: any) {
      toast.error(err.message || "Upload failed on Venue Server.");
    } finally {
      setUploading(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) {
          setSelectedFiles([]);
          setFolderName("");
          onClose();
        }
      }}
    >
      <DialogContent className="max-w-xl p-6 space-y-5 rounded-3xl border border-[var(--border)] bg-[var(--card)] text-[var(--text)] select-none">
        {/* Title Header */}
        <div className="space-y-1">
          <h3 className="text-lg font-black tracking-tight text-[var(--text)]">
            {uploadMode === "folder" ? "Select Primary Presentation" : "Upload Presentation File"}
          </h3>
          <p className="text-xs text-[var(--muted)]">
            {uploadMode === "folder"
              ? "Select a folder to identify the primary presentation. The Venue Server stores one authoritative file version; embed required media in that file."
              : "Supported formats: Microsoft PowerPoint (.pptx, .ppt), Adobe PDF (.pdf), Keynote (.key), Video (.mp4)"}
          </p>
        </div>

        {/* Mode Selector Tabs (File vs Entire Folder) */}
        <div className="flex items-center gap-2 rounded-2xl border border-[var(--border)] bg-[var(--surf)] p-1.5">
          <button
            type="button"
            onClick={() => {
              setUploadMode("file");
              setSelectedFiles([]);
            }}
            className={cn(
              "flex-1 flex items-center justify-center gap-2 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer",
              uploadMode === "file"
                ? "bg-[var(--card)] text-[var(--text)] shadow-xs"
                : "text-[var(--muted)] hover:text-[var(--text)]"
            )}
          >
            <FileText className="size-4 text-[var(--pri)]" />
            <span>Single File Replacement</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setUploadMode("folder");
              setSelectedFiles([]);
            }}
            className={cn(
              "flex-1 flex items-center justify-center gap-2 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer",
              uploadMode === "folder"
                ? "bg-[var(--card)] text-[var(--text)] shadow-xs"
                : "text-[var(--muted)] hover:text-[var(--text)]"
            )}
          >
            <FolderUp className="size-4 text-[var(--pri)]" />
            <span>Choose From Folder</span>
          </button>
        </div>

        {/* Dropzone Container */}
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          className={cn(
            "relative flex flex-col items-center justify-center rounded-2xl border-2 border-dashed p-7 text-center transition-all",
            dragOver
              ? "border-[var(--pri)] bg-[var(--pri)]/10"
              : "border-[var(--border)] bg-[var(--surf)] hover:border-[var(--pri)]/50"
          )}
        >
          {uploadMode === "folder" ? (
            <input
              type="file"
              // @ts-ignore
              webkitdirectory=""
              directory=""
              multiple
              onChange={handleFileChange}
              className="absolute inset-0 opacity-0 cursor-pointer"
            />
          ) : (
            <input
              type="file"
              accept=".pptx,.ppt,.pdf,.key,.mp4,.xlsx"
              onChange={handleFileChange}
              className="absolute inset-0 opacity-0 cursor-pointer"
            />
          )}

          <div className="flex size-14 items-center justify-center rounded-2xl bg-[var(--card)] border border-[var(--border)] text-[var(--pri)] mb-3 shadow-xs">
            {uploadMode === "folder" ? (
              <FolderUp className="size-6" />
            ) : (
              <Upload className="size-6" />
            )}
          </div>

          <p className="text-xs font-bold text-[var(--text)]">
            {uploadMode === "folder"
              ? "Click or Drag & Drop session folder here"
              : "Click to browse or Drag & Drop presentation here"}
          </p>
          <p className="text-[10px] text-[var(--muted)] mt-1 font-medium">
            {uploadMode === "folder"
              ? "Selects the primary supported presentation file from the folder"
              : "Supports .pptx, .ppt, .pdf, .key, .mp4 up to 2 GB"}
          </p>
        </div>

        {/* Selected Files / Folder Preview */}
        {selectedFiles.length > 0 && (
          <div className="rounded-2xl border border-[var(--border)] bg-[var(--surf)] p-3.5 space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs font-bold text-[var(--text)]">
                {uploadMode === "folder" ? (
                  <Folder className="size-4 text-[var(--pri)]" />
                ) : (
                  <FileText className="size-4 text-[var(--pri)]" />
                )}
                <span>
                  {uploadMode === "folder" ? folderName || "Session Asset Folder" : selectedFiles[0].name}
                </span>
              </div>
              <span className="text-[11px] font-mono text-[var(--muted)]">
                {selectedFiles.length > 1 ? `${selectedFiles.length} files • ` : ""}
                {totalSizeMB} MB
              </span>
            </div>

            {selectedFiles.length > 1 && (
              <div className="max-h-24 overflow-y-auto pr-1 space-y-1 text-[10px] text-[var(--muted)] font-mono">
                {selectedFiles.slice(0, 5).map((f, i) => (
                  <div key={i} className="truncate">
                    • {f.name} ({(f.size / (1024 * 1024)).toFixed(1)} MB)
                  </div>
                ))}
                {selectedFiles.length > 5 && (
                  <div className="text-[var(--pri)] font-bold">
                    + {selectedFiles.length - 5} more files in folder
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Modal Action Buttons */}
        <div className="flex items-center justify-end gap-3 pt-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              setSelectedFiles([]);
              setFolderName("");
              onClose();
            }}
            className="rounded-xl border border-[var(--border)] bg-[var(--card)] hover:bg-[var(--raised)] text-xs font-bold"
          >
            Cancel
          </Button>

          <Button
            type="button"
            onClick={handleUploadConfirm}
            disabled={selectedFiles.length === 0 || uploading}
            className="rounded-xl bg-[var(--pri)] hover:bg-[var(--pri)]/90 text-[var(--primary-contrast)] font-bold text-xs gap-2 shadow-sm cursor-pointer"
          >
            {uploading ? (
              <>
                <Loader2 className="size-3.5 animate-spin" />
                <span>Ingesting Assets...</span>
              </>
            ) : (
              <>
                <Check className="size-3.5 stroke-[3]" />
                <span>
                  {uploadMode === "folder" ? "Confirm Primary Presentation" : "Confirm Upload"}
                </span>
              </>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
