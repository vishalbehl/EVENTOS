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
import { cn } from "@/lib/utils";

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
        { headers: { "Content-Type": "multipart/form-data" } }
      );
      setPreview(response);
      if (response.can_import) {
        toast.success("Agenda parsed successfully.");
      } else {
        toast.warning("Agenda parsed with blocking conflicts. Review rows.");
      }
    } catch (error: any) {
      const msg = error.response?.data?.detail || "Could not parse workbook.";
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
        headers: { "Content-Type": "multipart/form-data" },
      });
      const speakerCount = preview?.speakers_to_create ?? 0;
      setCommittedSpeakerCount(speakerCount);
      setImportCommitted(true);
      toast.success("Workbook import successfully queued!");
    } catch (error: any) {
      toast.error(error.response?.data?.detail || "Could not queue import.");
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
            className="w-full max-w-6xl h-[88vh] bg-[var(--base)]/90 backdrop-blur-2xl border border-default rounded-[3.5rem] shadow-3xl flex flex-col relative overflow-hidden glass-3d"
          >
            {/* Close Button */}
            <div className="absolute top-6 right-6 z-50">
              <Button
                onClick={onClose}
                variant="ghost"
                size="icon"
                className="h-10 w-10 rounded-full bg-[var(--base)]/40 border border-default text-muted hover:text-[var(--text)] transition-all"
              >
                <XCircle className="h-5 w-5" />
              </Button>
            </div>

            {/* Modal Header */}
            <div className="p-8 md:p-10 border-b border-default bg-gradient-to-r from-[var(--pri)]/10 via-transparent to-transparent shrink-0">
              <h2 className="text-2xl font-black tracking-tight text-[var(--text)] flex items-center gap-3">
                <FileSpreadsheet className="h-6 w-6 text-[var(--pri)]" /> Agenda Workbook Ingestor
              </h2>
              <p className="text-[11px] font-bold text-muted uppercase tracking-[0.2em] mt-1">
                Upload and map sessions, speakers, and rooms in bulk
              </p>
            </div>

            {/* Modal Body */}
            <div className="flex-1 flex overflow-hidden flex-col lg:flex-row">
              
              {/* Left/Main Column */}
              <div className="flex-1 flex flex-col overflow-y-auto no-scrollbar p-6 md:p-8 space-y-6 min-w-0">
                
                {/* Switcher & Upload Block */}
                {!importCommitted && (
                  <div className="grid gap-6 md:grid-cols-[260px_1fr]">
                    {/* Switcher */}
                    <div className="p-5 rounded-3xl bg-[color-mix(in_srgb,var(--text)_3%,transparent)] border border-default flex flex-col justify-between">
                      <div className="space-y-2">
                        <h4 className="text-[10px] font-black uppercase tracking-widest text-muted">Ingestion Mode</h4>
                        <p className="text-[11px] font-medium text-muted leading-relaxed">Choose the excel template format you are importing.</p>
                      </div>
                      
                      <div className="flex flex-col gap-2 mt-4">
                        <button
                          onClick={() => { setImportType("schedule"); setPreview(null); setSelectedFile(null); }}
                          className={cn(
                            "w-full rounded-2xl py-3 text-[10px] font-black uppercase tracking-widest transition-all text-center",
                            importType === "schedule" ? "bg-[var(--pri)] text-[var(--text)] shadow-md" : "text-muted hover:text-[var(--text)] bg-[var(--base)]/40 border border-default/50"
                          )}
                        >
                          Sessions Agenda
                        </button>
                        <button
                          onClick={() => { setImportType("eposter"); setPreview(null); setSelectedFile(null); }}
                          className={cn(
                            "w-full rounded-2xl py-3 text-[10px] font-black uppercase tracking-widest transition-all text-center",
                            importType === "eposter" ? "bg-[var(--sec)] text-[var(--text)] shadow-md" : "text-muted hover:text-[var(--text)] bg-[var(--base)]/40 border border-default/50"
                          )}
                        >
                          ePoster Schedule
                        </button>
                      </div>
                    </div>

                    {/* Drag Zone */}
                    <div
                      onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                      onDrop={(e) => { e.preventDefault(); void handleFile(e.dataTransfer.files?.[0]); }}
                      onDragLeave={() => setIsDragging(false)}
                      className={cn(
                        "relative flex flex-col items-center justify-center rounded-3xl border-2 border-dashed p-6 text-center transition-all min-h-[160px]",
                        isDragging ? "border-[var(--pri)] bg-[var(--pri)]/10 scale-[1.01]" : "border-default bg-[color-mix(in_srgb,var(--text)_5%,transparent)] hover:border-[var(--pri)]/30"
                      )}
                    >
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept=".xlsx,.xls"
                        className="hidden"
                        onChange={(e) => void handleFile(e.target.files?.[0])}
                      />
                      <div className="flex items-center gap-4">
                        <div className="h-12 w-12 rounded-2xl border border-[var(--pri)]/20 bg-[var(--pri)]/5 flex items-center justify-center shrink-0">
                          {isPreviewing ? <Loader2 className="h-5 w-5 animate-spin text-[var(--pri)]" /> : <Upload className="h-5 w-5 text-[var(--pri)]" />}
                        </div>
                        <div className="text-left">
                          <h4 className="text-sm font-black text-[var(--text)] truncate max-w-[320px]">
                            {selectedFile?.name || "Upload Excel Workbook"}
                          </h4>
                          <p className="text-[10px] text-muted font-bold mt-1">Drag and drop file here or click Browse</p>
                        </div>
                      </div>
                      <Button
                        onClick={() => fileInputRef.current?.click()}
                        className="h-9 px-4 rounded-xl border border-default bg-[var(--base)] text-[9px] font-black uppercase tracking-widest text-[var(--text)] mt-4 hover:bg-[var(--base)]/80"
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
                    className="rounded-[2.5rem] border border-[var(--success)]/20 bg-[var(--success)]/5 p-8 flex flex-col gap-6"
                  >
                    <div className="flex items-start gap-5">
                      <div className="h-14 w-14 shrink-0 rounded-2xl bg-[var(--success)]/15 flex items-center justify-center">
                        <CheckCircle2 className="h-7 w-7 text-[var(--success)]" />
                      </div>
                      <div>
                        <h3 className="text-lg font-black tracking-tight text-[var(--text)] mb-1">
                          Agenda Import Completed!
                        </h3>
                        <p className="text-xs font-bold text-muted leading-relaxed">
                          {committedSpeakerCount > 0 ? (
                            <>
                              <span className="text-[var(--text)] font-black">{committedSpeakerCount}</span> new {importType === "eposter" ? "poster presenters" : "speakers"} successfully registered. The email invitation templates are ready.
                            </>
                          ) : (
                            "All records updated. The schedule is synced with backend nodes."
                          )}
                        </p>
                      </div>
                    </div>

                    {autoInvite.data && (
                      <div className="flex items-start gap-4 p-4 rounded-2xl bg-[var(--success)]/10 border border-[var(--success)]/20">
                        <Mail className="h-5 w-5 text-[var(--success)] shrink-0 mt-0.5" />
                        <div>
                          <p className="text-xs font-black text-[var(--success)] mb-0.5">
                            {autoInvite.data.pending_speakers} invitations successfully queued for delivery.
                          </p>
                          {autoInvite.data.already_uploaded > 0 && (
                            <p className="text-[10px] font-bold text-muted">
                              Skipped {autoInvite.data.already_uploaded} speakers who have already uploaded files.
                            </p>
                          )}
                        </div>
                      </div>
                    )}

                    {autoInvite.isError && (
                      <div className="flex items-start gap-4 p-4 rounded-2xl bg-amber-500/10 border border-amber-500/20">
                        <AlertCircle className="h-5 w-5 text-amber-400 shrink-0 mt-0.5" />
                        <p className="text-xs font-bold text-amber-400">
                          {(autoInvite.error as any)?.response?.data?.detail ?? "Could not send invitations automatically."}
                        </p>
                      </div>
                    )}

                    {!autoInvite.data && (
                      <div className="flex items-center gap-4 mt-2">
                        <Button
                          onClick={async () => {
                            try {
                              const res = await autoInvite.mutateAsync();
                              toast.success(`Queued ${res.pending_speakers} invitation emails.`);
                            } catch (e: any) {
                              toast.error(e?.response?.data?.detail || "Failed to dispatch invitations.");
                            }
                          }}
                          disabled={autoInvite.isPending}
                          className="h-11 rounded-full bg-[var(--pri)] px-6 text-[10px] font-black uppercase tracking-widest text-[var(--text)] flex items-center gap-2 shadow-lg"
                        >
                          {autoInvite.isPending ? (
                            <><Loader2 className="h-4 w-4 animate-spin" /> Dispatching...</>
                          ) : (
                            <><Mail className="h-4 w-4" /> Dispatch Upload Links to Speakers</>
                          )}
                        </Button>
                        <button
                          onClick={onClose}
                          className="text-[10px] font-black text-muted uppercase tracking-widest hover:text-[var(--text)] transition-colors"
                        >
                          Skip Invitations
                        </button>
                      </div>
                    )}
                  </motion.div>
                ) : preview ? (
                  /* Preview Table */
                  <div className="flex flex-col gap-4 flex-1 overflow-hidden min-h-0">
                    <div className="flex items-center justify-between shrink-0 px-1">
                      <div className="flex items-center gap-6">
                        <h4 className="text-[11px] font-black uppercase tracking-[0.2em] text-muted">Agenda Summary</h4>
                        <div className="flex items-center gap-4 text-xs font-bold">
                          <span className="text-muted">Rows: <strong className="text-[var(--text)]">{preview.rows_total}</strong></span>
                          <span className="text-muted">Sessions: <strong className="text-[var(--pri)]">{preview.sessions_to_create}</strong></span>
                          <span className="text-muted">Rooms: <strong className="text-[var(--sec)]">{preview.rooms_to_create}</strong></span>
                          {preview.rows_with_errors > 0 && (
                            <span className="text-red-400">Errors: <strong className="font-black">{preview.rows_with_errors}</strong></span>
                          )}
                        </div>
                      </div>
                      
                      <div className="relative w-60">
                        <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-muted" />
                        <Input
                          value={searchQuery}
                          onChange={(e) => setSearchQuery(e.target.value)}
                          placeholder="Filter rows..."
                          className="h-9 rounded-xl border-default bg-[color-mix(in_srgb,var(--text)_3%,transparent)] pl-9 text-[10px] font-bold"
                        />
                      </div>
                    </div>

                    <div className="flex-1 border border-default rounded-3xl overflow-hidden flex flex-col bg-[color-mix(in_srgb,var(--text)_3%,transparent)] min-h-0">
                      <div className="overflow-auto no-scrollbar flex-1">
                        <table className="w-full min-w-[900px] text-left border-collapse">
                          <thead className="sticky top-0 z-10 bg-[var(--base)] border-b border-default">
                            <tr className="text-[9px] font-black uppercase tracking-wider text-muted">
                              <th className="px-4 py-3 w-[100px]">Room</th>
                              <th className="px-4 py-3 w-[160px]">Session</th>
                              <th className="px-4 py-3 w-[120px]">Time</th>
                              <th className="px-4 py-3 w-[160px]">Speaker</th>
                              <th className="px-4 py-3 w-[180px]">{importType === "eposter" ? "Poster Title" : "Presentation Title"}</th>
                              <th className="px-4 py-3 w-[120px]">Status</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-white/5">
                            {filteredRows.map((row) => (
                              <tr key={row.row_number} className="text-xs hover:bg-white/5 transition-colors">
                                <td className="px-4 py-3 font-bold text-muted truncate">{row.room_name || "—"}</td>
                                <td className="px-4 py-3">
                                  <p className="font-bold text-[var(--text)] truncate">{row.session_name || "—"}</p>
                                  <p className="text-[8px] font-mono text-muted uppercase mt-0.5">{row.session_code || "—"}</p>
                                </td>
                                <td className="px-4 py-3 text-[10px] font-mono text-muted">
                                  {row.start_time || "—"}
                                </td>
                                <td className="px-4 py-3">
                                  <p className="font-bold text-[var(--text)] truncate">
                                    {[row.speaker_first_name, row.speaker_last_name].filter(Boolean).join(" ") || "—"}
                                  </p>
                                  <p className="text-[9px] text-muted truncate mt-0.5">{row.speaker_email || "—"}</p>
                                </td>
                                <td className="px-4 py-3 text-muted truncate">{row.presentation_title || row.presentation || "—"}</td>
                                <td className="px-4 py-3">
                                  <Badge className={cn("border-0 text-[8px] font-black uppercase px-2 py-0.5", row.is_valid ? "bg-emerald-500/10 text-emerald-500" : "bg-red-500/10 text-red-500")}>
                                    {row.is_valid ? "VALID" : "CONFLICT"}
                                  </Badge>
                                  {(row.errors.length > 0 || row.warnings.length > 0) && (
                                    <p className="text-[8px] text-red-400 mt-1 italic leading-tight max-w-[140px] truncate" title={[...row.errors, ...row.warnings].join("; ")}>
                                      {[...row.errors, ...row.warnings].join("; ")}
                                    </p>
                                  )}
                                </td>
                              </tr>
                            ))}
                            {filteredRows.length === 0 && (
                              <tr>
                                <td colSpan={6} className="text-center py-10 text-muted font-bold text-[10px] uppercase tracking-widest">
                                  No matching preview rows found.
                                </td>
                              </tr>
                            )}
                          </tbody>
                        </table>
                      </div>
                      
                      <div className="p-4 border-t border-default bg-[color-mix(in_srgb,var(--text)_3%,transparent)] flex items-center justify-end shrink-0 gap-4">
                        <span className="text-[10px] font-bold text-muted">
                          {preview.can_import ? "Verification passed. Ingestion is safe." : "Ingestion blocked due to critical row conflicts."}
                        </span>
                        <Button
                          onClick={commitImport}
                          disabled={isUploading || !preview.can_import}
                          className="h-10 rounded-xl bg-[var(--pri)] px-6 text-[10px] font-black uppercase tracking-widest text-[var(--text)] shadow-lg"
                        >
                          {isUploading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                          Commit Ingestion
                        </Button>
                      </div>
                    </div>
                  </div>
                ) : importError ? (
                  /* Error display */
                  <div className="flex flex-col items-center justify-center py-20 text-center">
                    <AlertCircle className="h-12 w-12 text-red-500 mb-4" />
                    <h4 className="text-sm font-black text-[var(--text)] uppercase tracking-wider mb-2">Ingestion Failed</h4>
                    <p className="text-xs text-muted max-w-md mb-6">{importError}</p>
                    <Button
                      onClick={() => { setSelectedFile(null); setImportError(null); }}
                      className="h-10 rounded-xl bg-[var(--pri)] px-6 text-[10px] font-black uppercase tracking-widest text-[var(--text)]"
                    >
                      Try Another File
                    </Button>
                  </div>
                ) : (
                  /* Empty state */
                  <div className="flex flex-col items-center justify-center py-20 text-center">
                    <FileSpreadsheet className="h-16 w-16 text-muted mb-4" />
                    <h4 className="text-base font-black text-[var(--text)] uppercase tracking-tight mb-2">No workbook loaded</h4>
                    <p className="text-xs text-muted max-w-sm">
                      Upload an Excel agenda workbook (.xlsx) to verify sessions, rooms, and speaker mappings before applying updates to the live database.
                    </p>
                  </div>
                )}
              </div>

              {/* Right Column: Schema Instructions (Only visible if not committed) */}
              {!importCommitted && (
                <div className="w-full lg:w-[320px] border-t lg:border-t-0 lg:border-l border-default shrink-0 overflow-y-auto no-scrollbar max-h-[30vh] lg:max-h-none">
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
    { label: "I", field: "email", desc: "Speaker email (Primary Key)" },
    { label: "J", field: "phone", desc: "Speaker contact (Optional)" },
    { label: "K", field: "affiliation", desc: "Organization/University" },
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
    { label: "I", field: "email", desc: "Speaker email (Primary Key)" },
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
    <div className="p-6 space-y-6 flex flex-col h-full bg-[var(--base)]/30 backdrop-blur-md">
      <div>
        <h4 className="text-[10px] font-black uppercase tracking-[0.25em] text-muted flex items-center gap-2">
          <Shield className="h-4 w-4 text-[var(--pri)]" /> Schema Columns Map
        </h4>
        <p className="text-[11px] font-medium text-muted leading-relaxed mt-2">
          {type === "eposter"
            ? "Speakers are mapped by email. Posters are auto-assigned to screens."
            : "Rooms are mapped by name, sessions by code, and speakers by email."}
        </p>
      </div>

      <div className="flex-1 space-y-1.5 overflow-y-auto no-scrollbar max-h-[250px] lg:max-h-none pr-1">
        {columns.map((col) => (
          <div key={col.label} className="flex items-center gap-3 text-[10px] py-1 border-b border-default last:border-0">
            <div className="w-5 h-5 shrink-0 rounded bg-[var(--pri)]/10 flex items-center justify-center font-bold text-[var(--pri)] text-[8px]">{col.label}</div>
            <span className="font-bold text-[var(--text)] w-24 shrink-0 truncate">{col.field}</span>
            <span className="text-muted truncate">{col.desc}</span>
          </div>
        ))}
      </div>

      <Button
        variant="outline"
        className="w-full h-11 rounded-2xl border-default bg-[var(--pri)]/5 hover:bg-[var(--pri)]/10 text-[var(--pri)] text-[10px] font-black uppercase tracking-widest gap-2 mt-auto"
        onClick={() => window.open(sampleUrl, "_blank")}
      >
        <Download className="h-4 w-4" /> Download Sample
      </Button>
    </div>
  );
}
