"use client";

import React, { useState, useRef, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  FileSpreadsheet, Upload, Loader2, AlertCircle, CheckCircle2,
  Mail, ArrowRight, Shield, Download, XCircle, Search, Clock
} from "lucide-react";
import { toast } from "sonner";
import { apiClient } from "@/lib/api-client";
import { useAutoInvite } from "@/hooks/useEmails";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { cn, formatApiError } from "@/lib/utils";

type ImportPreviewRow = {
  row_number: number;
  session_code?: string | null;
  session_name?: string | null;
  room_name?: string | null;
  start_time?: string | null;
  end_time?: string | null;
  speaker_first_name?: string | null;
  speaker_last_name?: string | null;
  speaker_email?: string | null;
  presentation_title?: string | null;
  presentation?: string | null;
  category?: string | null;
  talk_duration_min?: number | null;
  errors: string[];
  warnings: string[];
  is_valid: boolean;
};

type ImportPreview = {
  rows_total: number;
  rows_valid: number;
  rows_with_errors: number;
  rows_with_warnings: number;
  sessions_to_create: number;
  speakers_to_create: number;
  rooms_to_create: number;
  preview_rows: ImportPreviewRow[];
  can_import: boolean;
};

interface ScheduleImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  eventId: string;
}

export function ScheduleImportModal({ isOpen, onClose, eventId }: ScheduleImportModalProps) {
  const [importType, setImportType] = useState<"schedule" | "eposter">("schedule");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [importCommitted, setImportCommitted] = useState(false);
  const [committedSpeakerCount, setCommittedSpeakerCount] = useState(0);
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const autoInvite = useAutoInvite(eventId);

  // Reset states when modal is opened/closed
  useEffect(() => {
    if (isOpen) {
      setSelectedFile(null);
      setPreview(null);
      setImportError(null);
      setImportCommitted(false);
      setCommittedSpeakerCount(0);
      setSearchQuery("");
      autoInvite.reset();
    }
  }, [isOpen]);

  const handleFile = async (file?: File | null) => {
    if (!file) return;
    setSelectedFile(file);
    setPreview(null);
    setImportError(null);
    setIsPreviewing(true);
    try {
      const body = new FormData();
      body.append("file", file);
      const response = await apiClient.post<ImportPreview>(
        `/events/${eventId}/import/preview?import_type=${importType}`,
        body,
        { headers: { "Content-Type": undefined } as any }
      );
      setPreview(response);
      if (response.can_import) {
        toast.success("Agenda parsed successfully.");
      } else {
        toast.warning("Agenda parsed with blocking conflicts. Review rows.");
      }
    } catch (error: any) {
      const msg = formatApiError(error, "Could not parse workbook.");
      setImportError(msg);
      toast.error(msg);
    } finally {
      setIsPreviewing(false);
      setIsDragging(false);
    }
  };

  const commitImport = async () => {
    if (!selectedFile) {
      toast.error("Upload an Excel agenda first.");
      return;
    }
    setIsUploading(true);
    try {
      const body = new FormData();
      body.append("file", selectedFile);
      await apiClient.post(`/events/${eventId}/import/upload?import_type=${importType}`, body, {
        headers: { "Content-Type": undefined } as any,
      });
      const speakerCount = preview?.speakers_to_create ?? 0;
      setCommittedSpeakerCount(speakerCount);
      setImportCommitted(true);
      toast.success("Workbook import successfully queued!");
    } catch (error: any) {
      toast.error(formatApiError(error, "Could not queue import."));
    } finally {
      setIsUploading(false);
    }
  };

  // Filter parsed rows
  const filteredRows = useMemo(() => {
    if (!preview) return [];
    return preview.preview_rows.filter((row) => {
      const search = searchQuery.toLowerCase();
      return (
        row.session_name?.toLowerCase().includes(search) ||
        row.session_code?.toLowerCase().includes(search) ||
        row.room_name?.toLowerCase().includes(search) ||
        `${row.speaker_first_name} ${row.speaker_last_name}`.toLowerCase().includes(search) ||
        row.speaker_email?.toLowerCase().includes(search)
      );
    });
  }, [preview, searchQuery]);

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 md:p-10 font-sans">
          {/* Overlay */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-black/60 backdrop-blur-xl"
          />

          {/* Modal Container */}
          <motion.div
            initial={{ scale: 0.95, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.95, opacity: 0, y: 20 }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
            className="w-full max-w-6xl h-[88vh] bg-[var(--card)] border border-[var(--border-default)] rounded-lg shadow-2xl flex flex-col relative overflow-hidden text-[var(--text-primary)]"
          >
            {/* Close Button */}
            <div className="absolute top-4 right-4 z-50">
              <button
                type="button"
                onClick={onClose}
                className="size-8 rounded-md border border-[var(--border-default)] bg-[var(--card)] flex items-center justify-center text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)] transition-colors cursor-pointer shadow-sm"
              >
                <XCircle className="size-4" />
              </button>
            </div>

            {/* Modal Header */}
            <div className="p-5 border-b border-[var(--border-subtle)] bg-[var(--bg-surface-2)] shrink-0">
              <div className="flex items-center gap-3">
                <div className="size-8 rounded-lg bg-[var(--pri)]/10 text-[var(--pri)] flex items-center justify-center border border-[var(--pri)]/20">
                  <FileSpreadsheet className="size-4" />
                </div>
                <div>
                  <h2 className="text-base font-bold tracking-tight text-[var(--text-primary)]">
                    Agenda Workbook Ingestor
                  </h2>
                  <p className="text-[11px] text-[var(--text-secondary)]">
                    Upload and map sessions, speakers, and rooms in bulk
                  </p>
                </div>
              </div>
            </div>

            {/* Modal Body */}
            <div className="flex-1 flex overflow-hidden flex-col lg:flex-row">
              
              {/* Left/Main Column */}
              <div className="flex-1 flex flex-col overflow-y-auto p-5 space-y-4 min-w-0">
                
                {/* Switcher & Upload Block */}
                {!importCommitted && (
                  <div className="grid gap-4 md:grid-cols-[240px_1fr]">
                    {/* Switcher */}
                    <div className="p-4 rounded-lg bg-[var(--bg-surface-2)] border border-[var(--border-default)] flex flex-col justify-between">
                      <div className="space-y-1">
                        <h4 className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">Ingestion Mode</h4>
                        <p className="text-xs text-[var(--text-secondary)]">Choose the excel template format.</p>
                      </div>
                      
                      <div className="flex flex-col gap-1.5 mt-3">
                        <button
                          onClick={() => { setImportType("schedule"); setPreview(null); setSelectedFile(null); }}
                          className={cn(
                            "w-full rounded-lg py-2 px-3 text-xs font-bold transition-all text-center cursor-pointer",
                            importType === "schedule" ? "bg-[var(--pri)] text-[var(--primary-contrast)] shadow-sm" : "text-[var(--text-secondary)] hover:text-[var(--text-primary)] bg-[var(--card)] border border-[var(--border-default)]"
                          )}
                        >
                          Sessions Agenda
                        </button>
                        <button
                          onClick={() => { setImportType("eposter"); setPreview(null); setSelectedFile(null); }}
                          className={cn(
                            "w-full rounded-lg py-2 px-3 text-xs font-bold transition-all text-center cursor-pointer",
                            importType === "eposter" ? "bg-[var(--pri)] text-[var(--primary-contrast)] shadow-sm" : "text-[var(--text-secondary)] hover:text-[var(--text-primary)] bg-[var(--card)] border border-[var(--border-default)]"
                          )}
                        >
                          E-Posters
                        </button>
                      </div>
                    </div>

                    {/* Drag Zone */}
                    <div
                      onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                      onDrop={(e) => { e.preventDefault(); void handleFile(e.dataTransfer.files?.[0]); }}
                      onDragLeave={() => setIsDragging(false)}
                      className={cn(
                        "relative flex flex-col items-center justify-center rounded-lg border-2 border-dashed p-6 text-center transition-colors min-h-[140px]",
                        isDragging ? "border-[var(--pri)] bg-[var(--pri)]/5" : "border-[var(--border-default)] bg-[var(--bg-surface-2)] hover:border-[var(--pri)]"
                      )}
                    >
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept=".xlsx,.xls"
                        className="hidden"
                        onChange={(e) => void handleFile(e.target.files?.[0])}
                      />
                      <div className="flex items-center gap-3">
                        <div className="size-10 rounded-lg border border-[var(--pri)]/20 bg-[var(--pri)]/10 text-[var(--pri)] flex items-center justify-center shrink-0">
                          {isPreviewing ? <Loader2 className="size-4 animate-spin text-[var(--pri)]" /> : <Upload className="size-4 text-[var(--pri)]" />}
                        </div>
                        <div className="text-left">
                          <h4 className="text-xs font-bold text-[var(--text-primary)] truncate max-w-[280px]">
                            {selectedFile?.name || "Upload Excel Workbook"}
                          </h4>
                          <p className="text-[11px] text-[var(--text-secondary)] mt-0.5">Drag and drop file here or click Browse</p>
                        </div>
                      </div>
                      <Button
                        onClick={() => fileInputRef.current?.click()}
                        className="h-8 px-3 rounded-lg border border-[var(--border-default)] bg-[var(--card)] text-xs font-semibold text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)] mt-3 cursor-pointer shadow-sm"
                      >
                        Browse File
                      </Button>
                    </div>
                  </div>
                )}

                {/* Main Content Area */}
                {importCommitted ? (
                  /* Success Pane */
                  <motion.div
                    initial={{ opacity: 0, y: 15 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-6 flex flex-col gap-4"
                  >
                    <div className="flex items-start gap-4">
                      <div className="size-10 shrink-0 rounded-lg bg-emerald-500/15 flex items-center justify-center text-emerald-500">
                        <CheckCircle2 className="size-5" />
                      </div>
                      <div>
                        <h3 className="text-sm font-bold text-[var(--text-primary)] mb-0.5">
                          Agenda Import Completed!
                        </h3>
                        <p className="text-xs text-[var(--text-secondary)]">
                          {committedSpeakerCount > 0 ? (
                            <>
                              <span className="text-[var(--text-primary)] font-bold">{committedSpeakerCount}</span> new {importType === "eposter" ? "poster presenters" : "speakers"} registered.
                            </>
                          ) : (
                            "All records updated. The schedule is synced with backend nodes."
                          )}
                        </p>
                      </div>
                    </div>

                    {autoInvite.data && (
                      <div className="flex items-start gap-3 p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-xs">
                        <Mail className="size-4 text-emerald-500 shrink-0 mt-0.5" />
                        <div>
                          <p className="font-bold text-emerald-600 dark:text-emerald-400">
                            {autoInvite.data.pending_speakers} invitations successfully queued for delivery.
                          </p>
                          {autoInvite.data.already_uploaded > 0 && (
                            <p className="text-[11px] text-[var(--text-secondary)]">
                              Skipped {autoInvite.data.already_uploaded} speakers who have already uploaded files.
                            </p>
                          )}
                        </div>
                      </div>
                    )}

                    {autoInvite.isError && (
                      <div className="flex items-start gap-3 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 text-xs">
                        <AlertCircle className="size-4 text-amber-500 shrink-0 mt-0.5" />
                        <p className="font-semibold text-amber-600 dark:text-amber-400">
                          {(autoInvite.error as any)?.response?.data?.detail ?? "Could not send invitations automatically."}
                        </p>
                      </div>
                    )}

                    {!autoInvite.data && (
                      <div className="flex items-center gap-3 mt-1">
                        <Button
                          onClick={async () => {
                            try {
                              const res = await autoInvite.mutateAsync();
                              toast.success(`Queued ${res.pending_speakers} invitation emails.`);
                            } catch (e: any) {
                              toast.error(formatApiError(e, "Failed to dispatch invitations."));
                            }
                          }}
                          disabled={autoInvite.isPending}
                          className="h-9 rounded-lg bg-[var(--pri)] hover:opacity-90 px-4 text-xs font-bold text-[var(--primary-contrast)] flex items-center gap-1.5 shadow-sm border-0 cursor-pointer"
                        >
                          {autoInvite.isPending ? (
                            <><Loader2 className="size-3.5 animate-spin" /> Dispatching...</>
                          ) : (
                            <><Mail className="size-3.5" /> Dispatch Upload Links to Speakers</>
                          )}
                        </Button>
                        <button
                          onClick={onClose}
                          className="text-xs font-semibold text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors cursor-pointer"
                        >
                          Skip Invitations
                        </button>
                      </div>
                    )}
                  </motion.div>
                ) : preview ? (
                  /* Preview Table */
                  <div className="flex flex-col gap-3 flex-1 overflow-hidden min-h-0">
                    <div className="flex items-center justify-between shrink-0 px-1">
                      <div className="flex items-center gap-4">
                        <h4 className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">Agenda Summary</h4>
                        <div className="flex items-center gap-3 text-xs">
                          <span className="text-[var(--text-secondary)]">Rows: <strong className="text-[var(--text-primary)]">{preview.rows_total}</strong></span>
                          <span className="text-[var(--text-secondary)]">Sessions: <strong className="text-[var(--pri)]">{preview.sessions_to_create}</strong></span>
                          <span className="text-[var(--text-secondary)]">Rooms: <strong className="text-blue-500">{preview.rooms_to_create}</strong></span>
                          {preview.rows_with_errors > 0 && (
                            <span className="text-rose-500 font-bold">Errors: {preview.rows_with_errors}</span>
                          )}
                        </div>
                      </div>
                      
                      <div className="relative w-56">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-[var(--text-tertiary)]" />
                        <Input
                          value={searchQuery}
                          onChange={(e) => setSearchQuery(e.target.value)}
                          placeholder="Filter rows..."
                          className="h-8 rounded-lg border-[var(--border-default)] bg-[var(--bg-surface-2)] pl-8 text-xs font-semibold text-[var(--text-primary)]"
                        />
                      </div>
                    </div>

                    <div className="flex-1 border border-[var(--border-default)] rounded-lg overflow-hidden flex flex-col bg-[var(--card)] min-h-0">
                      <div className="overflow-auto flex-1 text-xs">
                        <table className="w-full min-w-[800px] text-left border-collapse">
                          <thead className="sticky top-0 z-10 bg-[var(--bg-surface-2)] border-b border-[var(--border-default)]">
                            <tr className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">
                              <th className="px-3 py-2.5 w-[100px]">Room</th>
                              <th className="px-3 py-2.5 w-[160px]">Session</th>
                              <th className="px-3 py-2.5 w-[110px]">Time</th>
                              <th className="px-3 py-2.5 w-[160px]">Speaker</th>
                              <th className="px-3 py-2.5 w-[180px]">{importType === "eposter" ? "Poster Title" : "Presentation Title"}</th>
                              <th className="px-3 py-2.5 w-[100px]">Status</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-[var(--border-subtle)]">
                            {filteredRows.map((row) => (
                              <tr key={row.row_number} className="hover:bg-[var(--bg-surface-hover)] transition-colors">
                                <td className="px-3 py-2.5 font-semibold text-[var(--text-secondary)] truncate">{row.room_name || "—"}</td>
                                <td className="px-3 py-2.5">
                                  <p className="font-semibold text-[var(--text-primary)] truncate">{row.session_name || "—"}</p>
                                  <p className="text-[9px] font-mono text-[var(--text-tertiary)] uppercase">{row.session_code || "—"}</p>
                                </td>
                                <td className="px-3 py-2.5 text-[11px] font-mono text-[var(--text-secondary)]">
                                  {row.start_time || "—"}
                                </td>
                                <td className="px-3 py-2.5">
                                  <p className="font-semibold text-[var(--text-primary)] truncate">
                                    {[row.speaker_first_name, row.speaker_last_name].filter(Boolean).join(" ") || "—"}
                                  </p>
                                  <p className="text-[10px] text-[var(--text-tertiary)] truncate">{row.speaker_email || "—"}</p>
                                </td>
                                <td className="px-3 py-2.5 text-[var(--text-secondary)] truncate">{row.presentation_title || row.presentation || "—"}</td>
                                <td className="px-3 py-2.5">
                                  <Badge className={cn("border-0 text-[8px] font-bold uppercase px-2 py-0.5", row.is_valid ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" : "bg-rose-500/10 text-rose-600 dark:text-rose-400")}>
                                    {row.is_valid ? "VALID" : "CONFLICT"}
                                  </Badge>
                                  {(row.errors.length > 0 || row.warnings.length > 0) && (
                                    <p className="text-[9px] text-rose-500 mt-0.5 leading-tight max-w-[130px] truncate" title={[...row.errors, ...row.warnings].join("; ")}>
                                      {[...row.errors, ...row.warnings].join("; ")}
                                    </p>
                                  )}
                                </td>
                              </tr>
                            ))}
                            {filteredRows.length === 0 && (
                              <tr>
                                <td colSpan={6} className="text-center py-8 text-[var(--text-secondary)] text-xs">
                                  No matching preview rows found.
                                </td>
                              </tr>
                            )}
                          </tbody>
                        </table>
                      </div>
                      
                      <div className="p-3 border-t border-[var(--border-subtle)] bg-[var(--bg-surface-2)] flex items-center justify-between shrink-0 gap-3">
                        <span className="text-xs text-[var(--text-secondary)]">
                          {preview.can_import ? "Verification passed. Ingestion is safe." : "Ingestion blocked due to critical row conflicts."}
                        </span>
                        <Button
                          onClick={commitImport}
                          disabled={isUploading || !preview.can_import}
                          className="h-9 rounded-lg bg-[var(--pri)] hover:opacity-90 px-4 text-xs font-bold text-[var(--primary-contrast)] shadow-sm border-0 cursor-pointer"
                        >
                          {isUploading ? <Loader2 className="size-3.5 animate-spin mr-1.5" /> : null}
                          Commit Ingestion
                        </Button>
                      </div>
                    </div>
                  </div>
                ) : importError ? (
                  /* Error display */
                  <div className="flex flex-col items-center justify-center py-16 text-center text-xs">
                    <AlertCircle className="size-10 text-rose-500 mb-3" />
                    <h4 className="text-sm font-bold text-[var(--text-primary)] uppercase tracking-wider mb-1">Ingestion Failed</h4>
                    <p className="text-xs text-[var(--text-secondary)] max-w-md mb-4">{importError}</p>
                    <Button
                      onClick={() => { setSelectedFile(null); setImportError(null); }}
                      className="h-9 rounded-lg bg-[var(--pri)] hover:opacity-90 px-4 text-xs font-bold text-[var(--primary-contrast)] cursor-pointer"
                    >
                      Try Another File
                    </Button>
                  </div>
                ) : (
                  /* Empty state */
                  <div className="flex flex-col items-center justify-center py-16 text-center text-xs">
                    <FileSpreadsheet className="size-12 text-[var(--text-tertiary)] mb-3" />
                    <h4 className="text-sm font-bold text-[var(--text-primary)] tracking-tight mb-1">No workbook loaded</h4>
                    <p className="text-xs text-[var(--text-secondary)] max-w-sm">
                      Upload an Excel agenda workbook (.xlsx) to verify sessions, rooms, and speaker mappings.
                    </p>
                  </div>
                )}
              </div>

              {/* Right Column: Schema Instructions (Only visible if not committed) */}
              {!importCommitted && (
                <div className="w-full lg:w-[280px] border-t lg:border-t-0 lg:border-l border-[var(--border-default)] shrink-0 overflow-y-auto max-h-[30vh] lg:max-h-none">
                  <SchemaCard type={importType} />
                </div>
              )}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

function SchemaCard({ type = "schedule" }: { type?: "schedule" | "eposter" }) {
  const scheduleColumns = [
    { label: "A", field: "session_code", desc: "Unique code (e.g. S-101)" },
    { label: "B", field: "session_name", desc: "Full session title" },
    { label: "C", field: "session_type", desc: "regular, workshop, etc." },
    { label: "D", field: "room_name", desc: "Exact name of the hall" },
    { label: "E", field: "start_datetime", desc: "YYYY-MM-DD HH:MM" },
    { label: "F", field: "end_datetime", desc: "YYYY-MM-DD HH:MM" },
    { label: "G", field: "first_name", desc: "Speaker first name" },
    { label: "H", field: "last_name", desc: "Speaker last name" },
    { label: "I", field: "email", desc: "Speaker email" },
    { label: "J", field: "phone", desc: "Speaker contact" },
    { label: "K", field: "affiliation", desc: "Organization" },
    { label: "L", field: "country", desc: "Speaker country" },
    { label: "M", field: "presentation", desc: "Talk title" },
    { label: "N", field: "talk_start", desc: "Talk timing (HH:MM)" },
    { label: "O", field: "talk_end", desc: "Talk timing (HH:MM)" },
    { label: "P", field: "talk_order", desc: "Position (0, 1, 2...)" },
    { label: "Q", field: "duration", desc: "Minutes (e.g. 20)" },
    { label: "R", field: "moderator", desc: "Session moderator name" },
  ];

  const posterColumns = [
    { label: "A", field: "session_code", desc: "Poster group code" },
    { label: "B", field: "session_name", desc: "Poster session name" },
    { label: "C", field: "session_type", desc: "Optional: 'poster'" },
    { label: "D", field: "room_name", desc: "Optional: 'EPoster Hall'" },
    { label: "E", field: "start_datetime", desc: "YYYY-MM-DD HH:MM" },
    { label: "F", field: "end_datetime", desc: "YYYY-MM-DD HH:MM" },
    { label: "G", field: "first_name", desc: "Speaker first name" },
    { label: "H", field: "last_name", desc: "Speaker last name" },
    { label: "I", field: "email", desc: "Speaker email" },
    { label: "J", field: "phone", desc: "Contact phone" },
    { label: "K", field: "affiliation", desc: "Organization" },
    { label: "L", field: "country", desc: "Country" },
    { label: "M", field: "poster_title", desc: "Full title of poster" },
    { label: "N", field: "category", desc: "Topic/Category" },
    { label: "O", field: "abstract", desc: "Full abstract text" },
  ];

  const columns = type === "eposter" ? posterColumns : scheduleColumns;
  const sampleUrl = type === "eposter" ? "/samples/sample_eposters.xlsx" : "/samples/sample_agenda.xlsx";

  return (
    <div className="p-4 space-y-4 flex flex-col h-full bg-[var(--bg-surface-2)] text-xs">
      <div>
        <h4 className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-tertiary)] flex items-center gap-1.5">
          <Shield className="size-3.5 text-[var(--pri)]" /> Schema Columns Map
        </h4>
        <p className="text-xs text-[var(--text-secondary)] mt-1">
          {type === "eposter"
            ? "Speakers mapped by email. Posters auto-assigned."
            : "Rooms by name, sessions by code, speakers by email."}
        </p>
      </div>

      <div className="flex-1 space-y-1 overflow-y-auto max-h-[240px] lg:max-h-none pr-1">
        {columns.map((col) => (
          <div key={col.label} className="flex items-center gap-2 text-xs py-1 border-b border-[var(--border-subtle)] last:border-0">
            <div className="size-4 shrink-0 rounded bg-[var(--pri)]/10 flex items-center justify-center font-bold text-[var(--pri)] text-[9px]">{col.label}</div>
            <span className="font-semibold text-[var(--text-primary)] w-20 shrink-0 truncate">{col.field}</span>
            <span className="text-[var(--text-tertiary)] truncate text-[11px]">{col.desc}</span>
          </div>
        ))}
      </div>

      <Button
        variant="outline"
        className="w-full h-9 rounded-lg border-[var(--border-default)] bg-[var(--card)] hover:bg-[var(--bg-surface-hover)] text-[var(--pri)] text-xs font-bold gap-1.5 mt-auto cursor-pointer shadow-sm"
        onClick={() => window.open(sampleUrl, "_blank")}
      >
        <Download className="size-3.5" /> Download Sample
      </Button>
    </div>
  );
}
