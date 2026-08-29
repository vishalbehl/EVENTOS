"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import {
  FileText,
  Play,
  Edit3,
  Upload,
  CheckCircle2,
  Clock,
  MapPin,
  Calendar,
  Info,
  Check,
  Eye,
  Monitor,
  ChevronLeft,
  ChevronRight,
  Lightbulb,
  Layers,
  Video,
  Presentation,
  RefreshCw,
  FileSpreadsheet,
  FileBox,
  FolderSync,
  FolderUp,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { useSRRStore } from "@/store/use-srr-store";
import { toast } from "sonner";

export function SetupStep({
  onOpenReupload,
  onFinalize,
}: {
  onOpenReupload: () => void;
  onFinalize: () => void;
}) {
  const {
    speaker,
    sessions,
    selectedSessionIndex,
    selectSession,
    setCurrentStep,
    setNativeEditing,
    markFileModified,
    updatePresentationFile,
  } = useSRRStore();

  const sessionList = sessions || [];
  const [activeSessionIdx, setActiveSessionIdx] = useState(selectedSessionIndex || 0);

  const currentSession = sessionList[activeSessionIdx] || sessionList[0] || null;
  const hasFiles = currentSession?.presentations && currentSession.presentations.length > 0;
  const activeFile = hasFiles ? currentSession.presentations[0] : null;

  const presentationFiles = currentSession?.presentations || [];

  const handleEditPresentation = async () => {
    setNativeEditing(true);
    toast.info("Opening presentation in Microsoft PowerPoint...");

    if (typeof window !== "undefined" && (window as any).srrDesktop?.openFileInNativeApp) {
      const openPath = activeFile?.local_cache_path || activeFile?.download_url || activeFile?.storage_path;
      if (!openPath) {
        toast.error("No cached presentation file is available on this workstation.");
        setNativeEditing(false);
        return;
      }
      const result = await (window as any).srrDesktop.openFileInNativeApp(openPath);
      if (!result?.opened) {
        toast.error(result?.error || "Unable to open the presentation file.");
        setNativeEditing(false);
        return;
      }
      (window as any).srrDesktop.onFileModified?.(async (data: { filePath: string; modifiedAt: string }) => {
        markFileModified();
        if (!speaker?.id || !currentSession?.session_speaker_id) {
          toast.error("PowerPoint save detected, but Venue Server assignment context is missing.");
          return;
        }
        const deviceKey = typeof window !== "undefined" ? window.localStorage.getItem("eventos_srr_device_key") || undefined : undefined;
        const result = await (window as any).srrDesktop.uploadModifiedPresentation?.({
          filePath: data.filePath,
          speakerId: speaker.id,
          sessionSpeakerId: currentSession.session_speaker_id,
          deviceKey,
        });
        if (result?.error) {
          toast.error(result.error);
          return;
        }
        if (result?.file) {
          updatePresentationFile(activeSessionIdx, result.file);
          toast.success("PowerPoint save detected and uploaded to Venue Server.");
        }
      });
    } else {
      toast.error("Native presentation editing is available only in the Electron app.");
      setNativeEditing(false);
    }
  };

  const handleStartPreview = () => {
    setCurrentStep(3); // Advance to Step 3 (Preview & Test)
  };

  return (
    <div className="h-full flex flex-col justify-between p-4 sm:p-5 max-w-[1700px] mx-auto select-none font-sans overflow-hidden">
      {/* 1. Top Section: Speaker Greeting & Horizontal Session Carousel */}
      <div className="space-y-2.5 shrink-0">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          {/* Greeting */}
          <div className="space-y-0.5">
            <div className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
              <span className="size-1.5 rounded-full bg-emerald-500 animate-pulse" />
              <span>SPEAKER ASSIGNED</span>
            </div>
            <h1 className="text-xl sm:text-2xl font-black text-[var(--text)] tracking-tight">
              Welcome, {speaker?.full_name || "assigned speaker"}
            </h1>
            <p className="text-[11px] text-[var(--muted)] font-medium">
              Please prepare your presentations for today&apos;s sessions.
            </p>
          </div>

          {/* Carousel Controls */}
          <div className="flex items-center gap-3 self-end sm:self-auto">
            <span className="text-xs text-[var(--muted)] font-medium hidden md:inline">
              Click a session to view its files
            </span>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => {
                  const next = activeSessionIdx > 0 ? activeSessionIdx - 1 : sessionList.length - 1;
                  setActiveSessionIdx(next);
                  selectSession(next);
                }}
                className="grid size-7 place-items-center rounded-lg border border-[var(--border)] bg-[var(--card)] text-[var(--text)] hover:bg-[var(--raised)] transition-colors cursor-pointer shadow-xs"
              >
                <ChevronLeft className="size-3.5" />
              </button>
              <button
                type="button"
                onClick={() => {
                  const next = activeSessionIdx < sessionList.length - 1 ? activeSessionIdx + 1 : 0;
                  setActiveSessionIdx(next);
                  selectSession(next);
                }}
                className="grid size-7 place-items-center rounded-lg border border-[var(--border)] bg-[var(--card)] text-[var(--text)] hover:bg-[var(--raised)] transition-colors cursor-pointer shadow-xs"
              >
                <ChevronRight className="size-3.5" />
              </button>
            </div>
          </div>
        </div>

        {/* 3-Column Horizontal Session Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {sessionList.map((sess, idx) => {
            const isSelected = activeSessionIdx === idx;
            const fileCount = idx === 0 ? 4 : idx === 1 ? 2 : 1;
            const statusLabel = isSelected ? "SELECTED" : idx === 1 ? "NEEDS REVIEW" : "READY";

            return (
              <div
                key={sess.session_id || `sess-${idx}`}
                onClick={() => {
                  setActiveSessionIdx(idx);
                  selectSession(idx);
                }}
                className={cn(
                  "group relative flex flex-col justify-between p-3 rounded-2xl border-2 transition-all cursor-pointer shadow-xs min-h-[90px]",
                  isSelected
                    ? "border-[var(--pri)] bg-[var(--card)] ring-2 ring-[var(--pri)]/20 shadow-sm"
                    : "border-[var(--border)] bg-[var(--card)]/60 hover:border-[var(--pri)]/40 hover:bg-[var(--card)]"
                )}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-1.5 text-[11px] font-mono font-bold text-[var(--muted)]">
                    <div
                      className={cn(
                        "size-3.5 rounded-full flex items-center justify-center text-[9px]",
                        isSelected
                          ? "bg-[var(--pri)] text-[var(--primary-contrast)] font-black"
                          : "border border-[var(--border)]"
                      )}
                    >
                      {isSelected ? <Check className="size-2 stroke-[3]" /> : null}
                    </div>
                    <span>{sess.start_time} - {sess.end_time}</span>
                  </div>

                  {isSelected ? (
                    <Badge variant="default" className="text-[9px] font-black uppercase px-2 py-0 shadow-xs">
                      Selected
                    </Badge>
                  ) : statusLabel === "NEEDS REVIEW" ? (
                    <Badge className="border border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400 text-[9px] font-bold uppercase px-2 py-0">
                      Needs Review
                    </Badge>
                  ) : (
                    <Badge className="border border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 text-[9px] font-bold uppercase px-2 py-0">
                      Ready
                    </Badge>
                  )}
                </div>

                <div className="mt-1 space-y-0.5">
                  <h3 className="text-xs font-black text-[var(--text)] truncate">
                    {sess.title}
                  </h3>
                  <div className="flex items-center gap-2.5 text-[10px] text-[var(--muted)] font-medium">
                    <span className="flex items-center gap-1">
                      <MapPin className="size-2.5 text-[var(--pri)]" />
                      {sess.room_name}
                    </span>
                    <span>•</span>
                    <span className="flex items-center gap-1">
                      <FileText className="size-2.5" />
                      {fileCount} Files
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 2. Main 2-Column Section (Structured Cards Layout) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-stretch flex-1 min-h-0 pt-2">
        {/* Left Column (8 cols): Current Session Card, Presentation Files Card & File Status Card */}
        <div className="lg:col-span-8 flex flex-col justify-between space-y-2.5 min-h-0">
          {/* Card 1: Current Session Banner */}
          <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 shadow-xs shrink-0">
            <div className="flex items-center gap-3 min-w-0">
              <div className="grid size-9 place-items-center rounded-xl bg-[var(--surf)] border border-[var(--border)] text-[var(--pri)] shrink-0 shadow-xs">
                <Presentation className="size-4.5" />
              </div>
              <div className="space-y-0.5 truncate">
                <p className="text-[9px] font-black uppercase tracking-[0.2em] text-[var(--acc)]">
                  CURRENT SESSION
                </p>
                <h2 className="text-xs sm:text-sm font-black text-[var(--text)] truncate">
                  {currentSession?.title || "No session assigned"}
                </h2>
                <div className="flex items-center gap-2.5 text-[10px] text-[var(--muted)] font-medium">
                  <span className="flex items-center gap-1">
                    <MapPin className="size-2.5 text-[var(--pri)]" />
                    {currentSession?.room_name || "No room assigned"}
                  </span>
                  <span>•</span>
                  <span className="flex items-center gap-1 font-mono">
                    <Clock className="size-2.5" />
                    {currentSession?.start_time || "--"} - {currentSession?.end_time || "--"}
                  </span>
                  <span>•</span>
                  <span className="flex items-center gap-1">
                    <Calendar className="size-2.5" />
                    25 Aug 2026
                  </span>
                </div>
              </div>
            </div>

            <Button
              variant="outline"
              size="sm"
              className="h-8 rounded-xl border border-[var(--border)] bg-[var(--surf)] hover:bg-[var(--raised)] text-[11px] font-bold text-[var(--text)] gap-1.5 shrink-0 cursor-pointer shadow-xs"
            >
              <Info className="size-3 text-[var(--muted)]" />
              <span>View Session Details</span>
            </Button>
          </div>

          {/* Card 2: Dedicated Presentation Files Card with Folder Replacement Action */}
          <div className="rounded-3xl border border-[var(--border)] bg-[var(--card)] p-3.5 space-y-2 flex-1 min-h-0 flex flex-col shadow-xs">
            {/* Pinned Card Header with Replace Session Folder Action */}
            <div className="flex items-center justify-between shrink-0 pb-1.5 border-b border-[var(--border)]/60">
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-black uppercase tracking-wider text-[var(--muted)]">
                  PRESENTATION FILES ({presentationFiles.length})
                </span>
              </div>

              {/* Action: Replace Entire Session Folder */}
              <Button
                variant="outline"
                size="sm"
                onClick={onOpenReupload}
                className="h-7 px-2.5 rounded-xl border border-[var(--border)] bg-[var(--surf)] hover:bg-[var(--raised)] text-[10px] font-bold text-[var(--text)] gap-1.5 cursor-pointer shadow-xs"
              >
                <FolderSync className="size-3 text-[var(--pri)]" />
                <span>Replace Session Folder</span>
              </Button>
            </div>

            {/* Scrollable File Items List: Dynamic flex height, zero clipping */}
            <div className="flex-1 min-h-0 overflow-y-auto pr-1.5 pb-1 space-y-2.5 scrollbar-thin">
              {presentationFiles.map((file, index) => {
                const ext = (file.file_format || file.original_filename.split(".").pop() || "file").toLowerCase();
                return (
                <div
                  key={file.id}
                  className="rounded-2xl border border-[var(--border)] bg-[var(--surf)] p-3 flex flex-col md:flex-row md:items-center justify-between gap-3 shadow-xs transition-all hover:bg-[var(--raised)] shrink-0"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    {/* Icon Badge */}
                    <div
                      className={cn(
                        "flex size-10 shrink-0 flex-col items-center justify-center rounded-xl font-black shadow-xs",
                        ext.includes("ppt") && "bg-orange-500/15 border border-orange-500/30 text-orange-600 dark:text-orange-400",
                        ext.includes("mp4") && "bg-indigo-500/15 border border-indigo-500/30 text-indigo-600 dark:text-indigo-400",
                        ext.includes("xls") && "bg-emerald-500/15 border border-emerald-500/30 text-emerald-600 dark:text-emerald-400",
                        ext.includes("pdf") && "bg-purple-500/15 border border-purple-500/30 text-purple-600 dark:text-purple-400"
                      )}
                    >
                      {ext.includes("mp4") ? <Video className="size-4" /> : ext.includes("xls") ? <FileSpreadsheet className="size-4" /> : ext.includes("pdf") ? <FileBox className="size-4" /> : <FileText className="size-4" />}
                      <span className="text-[8px] font-black uppercase leading-none mt-0.5">{ext}</span>
                    </div>

                    <div className="space-y-0.5 truncate">
                      <div className="flex items-center gap-2">
                        <h4 className="text-xs sm:text-sm font-black text-[var(--text)] truncate">
                          {file.original_filename}
                        </h4>
                        <Badge
                          className={cn(
                            "text-[8px] font-black uppercase px-1.5 py-0 border",
                            "border-emerald-500/30 bg-emerald-500/15 text-emerald-700 dark:text-emerald-400"
                          )}
                        >
                          {index === 0 ? "MAIN PRESENTATION" : "PRESENTATION FILE"}
                        </Badge>
                      </div>
                      <p className="text-[11px] text-[var(--muted)] font-medium">
                        {file.file_format || "FILE"} • {file.slides_count == null ? "analysis pending" : `${file.slides_count} slides`} • {file.file_size_mb} MB
                      </p>
                      <p className="text-[10px] text-[var(--muted)] flex items-center gap-1 font-medium">
                        <span className="text-emerald-600 dark:text-emerald-400 font-bold flex items-center gap-0.5">
                          <CheckCircle2 className="size-2.5" /> Current Version
                        </span>
                        <span>•</span>
                        <span>Status: {file.upload_status}</span>
                      </p>
                    </div>
                  </div>

                  {/* Action Buttons */}
                  <div className="flex items-center gap-1.5 shrink-0 self-end md:self-center">
                    {index === 0 && (
                      <Button
                        size="sm"
                        onClick={handleEditPresentation}
                        className="h-8 px-3 rounded-xl bg-[var(--pri)] hover:bg-[var(--pri)]/90 text-[var(--primary-contrast)] text-[11px] font-bold gap-1.5 cursor-pointer shadow-xs"
                      >
                        <Edit3 className="size-3" />
                        <span>Edit Presentation</span>
                      </Button>
                    )}

                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleStartPreview}
                      className="h-8 px-3 rounded-xl border border-[var(--border)] bg-[var(--card)] hover:bg-[var(--raised)] text-[11px] font-bold gap-1.5 cursor-pointer shadow-xs"
                    >
                      <Eye className="size-3 text-[var(--muted)]" />
                      <span>Preview</span>
                    </Button>

                    <Button
                      variant="outline"
                      size="sm"
                      onClick={onOpenReupload}
                      className="h-8 px-2.5 rounded-xl border border-[var(--border)] bg-[var(--card)] hover:bg-[var(--raised)] text-[11px] font-bold gap-1.5 cursor-pointer shadow-xs"
                    >
                      <RefreshCw className="size-3 text-[var(--pri)]" />
                      <span>Replace File</span>
                    </Button>
                  </div>
                </div>
              );
              })}
            </div>
          </div>

          {/* Card 3: File Status & Diagnostics & Finalize Submission Bar */}
          <div className="rounded-2xl border border-[var(--border)] bg-[var(--surf)] p-3 flex flex-col md:flex-row md:items-center justify-between gap-3 shadow-xs shrink-0">
            {/* 4 Stats */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
              <div>
                <p className="text-[9px] text-[var(--muted)] font-bold uppercase">File Status</p>
                <p className="font-black text-emerald-600 dark:text-emerald-400 flex items-center gap-1 mt-0.5 text-xs">
                  <CheckCircle2 className="size-3" /> {activeFile ? activeFile.upload_status : "No File"}
                </p>
                <p className="text-[9px] text-[var(--muted)]">{activeFile ? "Server status" : "Upload required"}</p>
              </div>

              <div>
                <p className="text-[9px] text-[var(--muted)] font-bold uppercase">Slides</p>
                <p className="font-black text-[var(--text)] flex items-center gap-1 mt-0.5 text-xs">
                  <Layers className="size-3 text-[var(--pri)]" /> {activeFile?.slides_count ?? "-"}
                </p>
                <p className="text-[9px] text-[var(--muted)]">{activeFile?.slides_count == null ? "Analysis pending" : "Total Slides"}</p>
              </div>

              <div>
                <p className="text-[9px] text-[var(--muted)] font-bold uppercase">Format</p>
                <p className="font-black text-[var(--text)] mt-0.5 text-xs">{activeFile?.file_format || "-"}</p>
                <p className="text-[9px] text-[var(--muted)]">File format</p>
              </div>

              <div>
                <p className="text-[9px] text-[var(--muted)] font-bold uppercase">Last Checked</p>
                <p className="font-black text-[var(--text)] mt-0.5 font-mono text-xs">{activeFile?.last_modified || "-"}</p>
                <p className="text-[9px] text-[var(--muted)]">Server observed</p>
              </div>
            </div>

            {/* Finalize Action Button */}
            <div className="shrink-0 self-end md:self-center">
              <Button
                type="button"
                onClick={onFinalize}
                disabled={!activeFile}
                className="h-10 px-5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-black text-xs uppercase tracking-wider gap-2 cursor-pointer shadow-md transition-all hover:scale-[1.01]"
              >
                <Check className="size-3.5 stroke-[3]" />
                <span>Looks Good - Finalize & Submit</span>
              </Button>
            </div>
          </div>
        </div>

        {/* Right Column (4 cols): Single Unified Instructions Card */}
        <div className="lg:col-span-4 flex flex-col justify-between min-h-0">
          <div className="rounded-3xl border border-[var(--border)] bg-[var(--card)] p-4 space-y-3 shadow-xs h-full flex flex-col justify-between">
            <span className="text-[10px] font-black uppercase tracking-wider text-[var(--muted)] block">
              STEP-BY-STEP INSTRUCTIONS
            </span>

            {/* Step 1 */}
            <div className="flex items-start gap-3 pb-2 border-b border-[var(--border)]/60">
              <span className="text-xs font-bold text-[var(--muted)] mt-1 min-w-3 text-center">1</span>
              <div className="grid size-8 shrink-0 place-items-center rounded-xl bg-indigo-500/15 border border-indigo-500/30 text-indigo-600 dark:text-indigo-400">
                <Eye className="size-4" />
              </div>
              <div className="space-y-0.5">
                <h4 className="text-xs font-black text-[var(--text)]">Review Your Presentation</h4>
                <p className="text-[11px] text-[var(--muted)] font-medium leading-relaxed">
                  Click &ldquo;Preview&rdquo; to review your slides and ensure everything is perfect.
                </p>
              </div>
            </div>

            {/* Step 2 */}
            <div className="flex items-start gap-3 pb-2 border-b border-[var(--border)]/60">
              <span className="text-xs font-bold text-[var(--muted)] mt-1 min-w-3 text-center">2</span>
              <div className="grid size-8 shrink-0 place-items-center rounded-xl bg-indigo-500/15 border border-indigo-500/30 text-indigo-600 dark:text-indigo-400">
                <Upload className="size-4" />
              </div>
              <div className="space-y-0.5">
                <h4 className="text-xs font-black text-[var(--text)]">Update File (If Needed)</h4>
                <p className="text-[11px] text-[var(--muted)] font-medium leading-relaxed">
                  Click &ldquo;Edit Presentation&rdquo; or &ldquo;Replace File&rdquo; to modify your presentation.
                </p>
              </div>
            </div>

            {/* Step 3 */}
            <div className="flex items-start gap-3 pb-2 border-b border-[var(--border)]/60">
              <span className="text-xs font-bold text-[var(--muted)] mt-1 min-w-3 text-center">3</span>
              <div className="grid size-8 shrink-0 place-items-center rounded-xl bg-indigo-500/15 border border-indigo-500/30 text-indigo-600 dark:text-indigo-400">
                <Monitor className="size-4" />
              </div>
              <div className="space-y-0.5">
                <h4 className="text-xs font-black text-[var(--text)]">Preview & Test</h4>
                <p className="text-[11px] text-[var(--muted)] font-medium leading-relaxed">
                  Check animations, videos, fonts and layout in presentation mode.
                </p>
              </div>
            </div>

            {/* Step 4 (Active Green Ring) */}
            <div className="rounded-2xl border-2 border-emerald-500/50 bg-emerald-500/10 p-3 flex items-start gap-2.5 shadow-xs">
              <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400 mt-1 min-w-3 text-center font-mono">4</span>
              <div className="grid size-8 shrink-0 place-items-center rounded-xl bg-emerald-500/20 border border-emerald-500/40 text-emerald-600 dark:text-emerald-400">
                <Check className="size-4 stroke-[3]" />
              </div>
              <div className="space-y-0.5">
                <h4 className="text-xs font-black text-emerald-900 dark:text-emerald-300">Finalize & Submit</h4>
                <p className="text-[10px] sm:text-[11px] text-emerald-800 dark:text-emerald-400 font-medium leading-relaxed">
                  Once you&apos;re satisfied, click &ldquo;Looks Good - Finalize & Submit&rdquo; to send your presentation.
                </p>
              </div>
            </div>

            {/* Integrated Tip Box */}
            <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-2.5 flex items-start gap-2 text-xs text-amber-800 dark:text-amber-300">
              <Lightbulb className="size-3.5 text-amber-500 shrink-0 mt-0.5" />
              <div className="space-y-0.5">
                <span className="font-black text-amber-900 dark:text-amber-200 text-[11px]">Tip</span>
                <p className="text-[10px] text-amber-800 dark:text-amber-400 font-medium leading-relaxed">
                  Test all videos and verify font rendering before finalizing.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
