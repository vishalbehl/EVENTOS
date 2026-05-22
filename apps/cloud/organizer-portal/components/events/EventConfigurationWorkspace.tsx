"use client";

import { ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import {
  AlertCircle,
  ArrowRight,
  Building2,
  Calendar,
  CheckCircle2,
  Clock,
  Database,
  Download,
  FileArchive,
  FileSpreadsheet,
  Globe,
  History,
  Loader2,
  Mail,
  MapPin,
  Save,
  Search,
  Settings,
  Shield,
  ToggleLeft,
  Trash2,
  Upload,
  User,
  Zap,
} from "lucide-react";
import { toast } from "sonner";
import { useEvent, useUpdateEvent } from "@/hooks/useEvents";
import { useAutoInvite } from "@/hooks/useEmails";
import { apiClient } from "@/lib/api-client";
import { useFloatingToolbarStore } from "@/store/useFloatingToolbarStore";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type WorkspaceTab = "event-config" | "schedule-import" | "settings";
type ProgramStatus = "draft" | "final" | "updated";

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

const statusToProgram = (status?: string): ProgramStatus => {
  if (status === "active") return "final";
  if (status === "completed" || status === "archived") return "updated";
  return "draft";
};

const programToStatus = (status: ProgramStatus) => {
  if (status === "final") return "active";
  if (status === "updated") return "completed";
  return "draft";
};

const toDateInput = (value?: string | null) => (value ? value.slice(0, 10) : "");
const toDateTimeInput = (value?: string | null) => (value ? value.slice(0, 16) : "");
const csvFormats = (value: string) =>
  value
    .split(/[,\n]/)
    .map((item) => item.trim().toLowerCase().replace(/^\./, ""))
    .filter(Boolean);

export function EventConfigurationWorkspace() {
  const { eventId } = useParams();
  const eventIdValue = eventId as string;
  const { data: event } = useEvent(eventIdValue);
  const updateEvent = useUpdateEvent(eventIdValue);
  const setToolbarActions = useFloatingToolbarStore((state) => state.setActions);

  const [activeTab, setActiveTab] = useState<WorkspaceTab>("event-config");
  const [isDragging, setIsDragging] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isClearing, setIsClearing] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [importType, setImportType] = useState<"schedule" | "eposter">("schedule");
  const [importError, setImportError] = useState<string | null>(null);
  const [importCommitted, setImportCommitted] = useState(false);
  const [committedSpeakerCount, setCommittedSpeakerCount] = useState(0);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const router = useRouter();
  const autoInvite = useAutoInvite(eventIdValue);

  const handleClearData = async () => {
    if (!window.confirm("ARE YOU SURE? This will PERMANENTLY DELETE all sessions, speakers, rooms, and import history for this event. This cannot be undone.")) {
      return;
    }

    setIsClearing(true);
    try {
      await apiClient.post(`/events/${eventIdValue}/clear-data`);
      toast.success("All event data has been cleared.");
      // Reset preview if open
      setPreview(null);
      setSelectedFile(null);
      
      // Force a full page reload to clear all React Query caches and reset the workspace UI
      setTimeout(() => {
        window.location.reload();
      }, 1000);
    } catch (error) {
      toast.error("Failed to clear event data.");
    } finally {
      setIsClearing(false);
    }
  };

  const [form, setForm] = useState({
    name: "",
    short_code: "",
    organiser: "",
    location: "",
    venue_name: "",
    start_date: "",
    end_date: "",
    status: "draft" as ProgramStatus,
    enable_posters: true,
    upload_deadline: "",
    max_file_size_mb: 500,
    allowed_formats: "pptx, pdf, mp4, zip, folder",
    enable_moderator: true,
    enable_whatsapp: false,
    enable_srr: true,
    enable_signage: true,
    enable_webhooks: false,
    timezone: "UTC",
  });

  useEffect(() => {
    if (!event) return;
    const toggles = (event as any).feature_toggles || {};
    setForm((current) => ({
      ...current,
      name: event.name || "",
      short_code: event.short_code || "",
      organiser: (event as any).organizer_name || event.created_by || "",
      location: event.location || "",
      venue_name: event.venue_name || "",
      start_date: toDateInput(event.start_date),
      end_date: toDateInput(event.end_date),
      status: statusToProgram(event.status),
      upload_deadline: toDateTimeInput(event.upload_deadline),
      max_file_size_mb: event.max_file_size_mb || 500,
      allowed_formats: (event.allowed_formats?.length ? event.allowed_formats : ["pptx", "pdf", "mp4", "zip", "folder"]).join(", "),
      timezone: event.timezone || "UTC",
      // Feature Toggles
      enable_posters: toggles.enable_posters ?? true,
      enable_moderator: toggles.enable_moderator ?? true,
      enable_whatsapp: toggles.enable_whatsapp ?? false,
      enable_srr: toggles.enable_srr ?? true,
      enable_signage: toggles.enable_signage ?? true,
      enable_webhooks: toggles.enable_webhooks ?? false,
    }));
  }, [event]);

  useEffect(() => {
    setToolbarActions([
      { label: "Save Config", icon: Save, onClick: () => void handleSave(), color: "bg-[var(--pri)]/10" },
      { label: "Import Schedule", icon: FileSpreadsheet, onClick: () => setActiveTab("schedule-import") },
      { label: "Policy Settings", icon: Settings, onClick: () => setActiveTab("settings") },
    ]);
  }, [form, selectedFile, preview, setToolbarActions]);

  const tabs = [
    { id: "event-config" as const, label: "Event Config", icon: Globe },
    { id: "schedule-import" as const, label: "Schedule Import", icon: FileSpreadsheet },
    { id: "settings" as const, label: "Settings", icon: Settings },
  ];

  const allowedFormats = useMemo(() => csvFormats(form.allowed_formats), [form.allowed_formats]);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      // Build event payload — only include dates when they have a value,
      // because sending an empty string fails Pydantic date validation.
      const eventPayload: Record<string, unknown> = {
        name: form.name,
        short_code: form.short_code.toUpperCase(),
        organizer_name: form.organiser || null,
        location: form.location || null,
        venue_name: form.venue_name || null,
        status: programToStatus(form.status),
        timezone: form.timezone,
        upload_deadline: form.upload_deadline || null,
        max_file_size_mb: Number(form.max_file_size_mb),
        allowed_formats: allowedFormats,
        feature_toggles: {
          enable_posters: form.enable_posters,
          enable_moderator: form.enable_moderator,
          enable_whatsapp: form.enable_whatsapp,
          enable_srr: form.enable_srr,
          enable_signage: form.enable_signage,
          enable_webhooks: form.enable_webhooks,
        },
      };
      if (form.start_date) eventPayload.start_date = form.start_date;
      if (form.end_date) eventPayload.end_date = form.end_date;

      await updateEvent.mutateAsync(eventPayload);

      toast.success("Event configuration saved.");
    } catch (error: any) {
      const detail = error?.response?.data?.detail;
      const message = Array.isArray(detail)
        ? detail.map((d: any) => d.msg ?? JSON.stringify(d)).join("; ")
        : detail ?? error?.message ?? "Could not save configuration.";
      toast.error(message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleFile = async (file?: File | null) => {
    if (!file) return;
    setSelectedFile(file);
    setPreview(null);
    setImportError(null);
    setIsPreviewing(true);
    try {
      const body = new FormData();
      body.append("file", file);
      const response = await apiClient.post<ImportPreview>(`/events/${eventIdValue}/import/preview?import_type=${importType}`, body, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      setPreview(response);
      if (response.can_import) {
        toast.success("Agenda parsed. Session, speaker, room, and timing map is ready.");
      } else {
        toast.warning("Agenda parsed with blocking conflicts. Review the rows before commit.");
      }
    } catch (error: any) {
      setImportError(error.response?.data?.detail || "Could not parse workbook.");
      toast.error(error.response?.data?.detail || "Could not parse workbook.");
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
      await apiClient.post(`/events/${eventIdValue}/import/upload?import_type=${importType}`, body, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      // Record how many speakers were in the workbook for the success panel
      const speakerCount = preview?.speakers_to_create ?? 0;
      setCommittedSpeakerCount(speakerCount);
      setImportCommitted(true);
    } catch (error: any) {
      toast.error(error.response?.data?.detail || "Could not queue import.");
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className={cn("animate-fade-in perspective-1000", activeTab === "schedule-import" ? "flex flex-col gap-6" : "space-y-10 pb-20")}>
      <header className="flex flex-col gap-6 px-2 xl:flex-row xl:items-center xl:justify-between">
        <div>
          <h1 className="text-3xl font-black tracking-tighter text-[var(--text)] mb-2 text-glow-indigo">
            Event <span className="text-[var(--sec)]">Configuration</span>
          </h1>
          <p className="text-[13px] font-bold text-muted uppercase tracking-[0.3em]">
            Event profile, agenda import, and submission controls
          </p>
        </div>

        <Button
          onClick={handleSave}
          disabled={isSaving}
          className="h-12 px-8 rounded-full bg-[var(--pri)] hover:bg-[var(--sec)] text-[var(--text)] font-black uppercase tracking-widest text-[11px] border-0 shadow-[0_15px_30px_color-mix(in_srgb,var(--pri)_30%,transparent)]"
        >
          {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
          Apply Configuration
        </Button>
      </header>

      <nav className="flex w-fit flex-wrap items-center gap-2 rounded-full border border-default bg-[color-mix(in_srgb,var(--text)_5%,transparent)] p-2 glass-3d">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              "relative flex items-center gap-2 rounded-full px-6 py-3 text-[11px] font-black uppercase tracking-widest transition-all",
              activeTab === tab.id ? "text-[var(--text)]" : "text-muted hover:text-[var(--text)]"
            )}
          >
            {activeTab === tab.id && <motion.div layoutId="event-config-nav" className="absolute inset-0 rounded-full bg-[var(--pri)] shadow-lg z-[-1]" />}
            <tab.icon className="h-4 w-4" />
            {tab.label}
          </button>
        ))}
      </nav>

      <AnimatePresence mode="wait">
        {activeTab === "event-config" && (
          <motion.section key="event-config" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="grid gap-8 xl:grid-cols-[1fr_360px]">
            <Card className="glass-3d border-default rounded-[3rem] p-6 md:p-8 xl:p-12">
              <div className="grid gap-6 md:gap-8 grid-cols-1 md:grid-cols-2">
                <Field icon={Globe} label="Name" value={form.name} onChange={(value) => setForm({ ...form, name: value })} className="md:col-span-2" />
                <Field icon={Database} label="Short Code" value={form.short_code} onChange={(value) => setForm({ ...form, short_code: value.toUpperCase() })} />
                <Field icon={User} label="Organiser" value={form.organiser} onChange={(value) => setForm({ ...form, organiser: value })} placeholder="Organiser name" />
                <Field icon={MapPin} label="Location" value={form.location} onChange={(value) => setForm({ ...form, location: value })} placeholder="City, state, country" />
                <Field icon={Building2} label="Venue" value={form.venue_name} onChange={(value) => setForm({ ...form, venue_name: value })} placeholder="Venue name" />
                
                <div className="space-y-3">
                  <Field icon={Globe} label="Event Timezone" value={form.timezone} onChange={(value) => setForm({ ...form, timezone: value })} placeholder="e.g. Asia/Kolkata" />
                  <p className="px-1 text-[9px] font-medium text-muted">Use IANA timezone names (e.g. UTC, Asia/Kolkata, Europe/London)</p>
                </div>

                <div className="space-y-3">
                  <label className="px-1 text-[10px] font-black uppercase tracking-[0.25em] text-muted">Start - End</label>
                  <div className="grid grid-cols-2 gap-3">
                    <Input type="date" value={form.start_date} onChange={(e) => setForm({ ...form, start_date: e.target.value })} className="h-14 rounded-2xl border-default bg-[color-mix(in_srgb,var(--text)_5%,transparent)] px-5 text-[var(--text)] [color-scheme:dark]" />
                    <Input type="date" value={form.end_date} onChange={(e) => setForm({ ...form, end_date: e.target.value })} className="h-14 rounded-2xl border-default bg-[color-mix(in_srgb,var(--text)_5%,transparent)] px-5 text-[var(--text)] [color-scheme:dark]" />
                  </div>
                </div>

                <div className="space-y-3">
                  <label className="px-1 text-[10px] font-black uppercase tracking-[0.25em] text-muted">Status</label>
                  <div className="grid grid-cols-3 gap-2 rounded-2xl border border-default bg-[color-mix(in_srgb,var(--text)_5%,transparent)] p-1.5">
                    {(["draft", "final", "updated"] as const).map((item) => (
                      <button key={item} onClick={() => setForm({ ...form, status: item })} className={cn("rounded-xl px-3 py-3 text-[10px] font-black uppercase tracking-widest transition-all", form.status === item ? "bg-[var(--pri)] text-[var(--text)]" : "text-muted hover:text-[var(--text)]")}>
                        {item}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </Card>

            <aside className="space-y-6">
              <div className="glass-3d rounded-[2.5rem] border-default p-7">
                <h3 className="mb-5 text-[11px] font-black uppercase tracking-[0.25em] text-muted">Current Rules</h3>
                <div className="space-y-4 text-[12px] font-bold">
                  <SummaryLine label="Upload cap" value={`${form.max_file_size_mb} MB`} />
                  <SummaryLine label="Formats" value={allowedFormats.join(", ") || "-"} />
                  <SummaryLine label="Deadline" value={form.upload_deadline || "Not set"} />
                  <SummaryLine label="ePosters" value={form.enable_posters ? "Enabled" : "Disabled"} />
                </div>
              </div>
            </aside>
          </motion.section>
        )}

        {activeTab === "schedule-import" && (
          <motion.section
            key="schedule-import"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="grid gap-8 xl:grid-cols-[320px_1fr_320px]"
          >
            {/* Import Type Switcher (Mobile/Top) */}
            <div className="xl:col-span-3 glass-3d rounded-3xl border-default p-4 flex items-center justify-between gap-4">
               <div className="flex items-center gap-4">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--pri)]/10 text-[var(--pri)]">
                     <FileSpreadsheet className="h-5 w-5" />
                  </div>
                  <div>
                     <h4 className="text-[12px] font-black uppercase tracking-widest text-[var(--text)]">Import Mode</h4>
                     <p className="text-[10px] font-medium text-muted">Select the type of agenda you are uploading</p>
                  </div>
               </div>
               
               <div className="flex items-center gap-2 rounded-2xl border border-default bg-[color-mix(in_srgb,var(--text)_5%,transparent)] p-1">
                  <button 
                     onClick={() => setImportType("schedule")}
                     className={cn(
                        "rounded-xl px-6 py-2.5 text-[10px] font-black uppercase tracking-widest transition-all",
                        importType === "schedule" ? "bg-[var(--pri)] text-[var(--text)]" : "text-muted hover:text-[var(--text)]"
                     )}
                  >
                     Session Schedule
                  </button>
                  <button 
                     onClick={() => setImportType("eposter")}
                     className={cn(
                        "rounded-xl px-6 py-2.5 text-[10px] font-black uppercase tracking-widest transition-all",
                        importType === "eposter" ? "bg-[var(--sec)] text-[var(--text)]" : "text-muted hover:text-[var(--text)]"
                     )}
                  >
                     ePoster Schedule
                  </button>
               </div>
            </div>

            {/* Left Column: Upload */}
            <section className="flex flex-col gap-5">
              <h3 className="px-2 text-[11px] font-black uppercase tracking-[0.3em] text-muted">Agenda Workbook</h3>
              <input ref={fileInputRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={(event) => void handleFile(event.target.files?.[0])} />
              <div
                onDragOver={(event) => {
                  event.preventDefault();
                  setIsDragging(true);
                }}
                onDrop={(event) => {
                  event.preventDefault();
                  void handleFile(event.dataTransfer.files?.[0]);
                }}
                onDragLeave={() => setIsDragging(false)}
                className={cn("relative flex-1 flex flex-col items-center justify-center overflow-hidden rounded-[3rem] border-4 border-dashed p-10 text-center transition-all", isDragging ? "scale-[1.02] border-[var(--pri)] bg-[var(--pri)]/10" : "border-default bg-[color-mix(in_srgb,var(--text)_5%,transparent)] hover:border-[var(--pri)]/30")}
              >
                <motion.div animate={{ y: [0, -12, 0] }} transition={{ duration: 4, repeat: Infinity }} className="mb-8 flex h-20 w-20 items-center justify-center rounded-[2rem] border border-[var(--pri)]/30 glass-3d">
                  {isPreviewing ? <Loader2 className="h-10 w-10 animate-spin text-[var(--pri)]" /> : <Upload className="h-10 w-10 text-[var(--pri)]" />}
                </motion.div>
                <h4 className="mb-3 text-xl font-black uppercase tracking-tighter text-[var(--text)]">{selectedFile?.name || "Upload Excel Agenda"}</h4>
                <p className="mb-8 max-w-[230px] text-[12px] font-medium leading-relaxed text-muted">The workbook is parsed by the backend and mapped row-by-row into sessions, rooms, speakers, and timings.</p>
                <Button onClick={() => fileInputRef.current?.click()} className="h-12 rounded-full border border-default bg-[color-mix(in_srgb,var(--text)_5%,transparent)] px-8 text-[10px] font-black uppercase tracking-widest text-[var(--text)]">Browse Workbook</Button>
              </div>
            </section>

            {/* Middle Column: Mapping & Table */}
            <section className="min-w-0 flex flex-col gap-5">
              <div className="flex items-center justify-between px-2">
                <h3 className="text-[11px] font-black uppercase tracking-[0.3em] text-muted">Parsed Mapping Preview</h3>
                <div className="relative w-64">
                  <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-muted" />
                  <Input placeholder="Filter parsed rows..." className="h-9 rounded-xl border-default bg-[color-mix(in_srgb,var(--text)_5%,transparent)] pl-9 text-[10px]" />
                </div>
              </div>

              {preview && !importError && (
                <div className="grid grid-cols-4 gap-3 px-2">
                  <div className="glass-3d rounded-xl border-default p-3 flex flex-col items-center justify-center text-center">
                    <p className="text-[12px] font-black text-[var(--text)]">{preview.rows_total}</p>
                    <p className="text-[7px] font-bold text-muted uppercase tracking-widest">Total Rows</p>
                  </div>
                  <div className="glass-3d rounded-xl border-default p-3 flex flex-col items-center justify-center text-center">
                    <p className="text-[12px] font-black text-[var(--pri)]">{preview.sessions_to_create}</p>
                    <p className="text-[7px] font-bold text-muted uppercase tracking-widest">Sessions</p>
                  </div>
                  <div className="glass-3d rounded-xl border-default p-3 flex flex-col items-center justify-center text-center">
                    <p className="text-[12px] font-black text-[var(--sec)]">{preview.rooms_to_create}</p>
                    <p className="text-[7px] font-bold text-muted uppercase tracking-widest">Rooms</p>
                  </div>
                  <div className={cn(
                    "glass-3d rounded-xl border-default p-3 flex flex-col items-center justify-center text-center",
                    preview.rows_with_errors > 0 ? "border-[var(--dan)]/30" : ""
                  )}>
                    <p className={cn("text-[12px] font-black", preview.rows_with_errors > 0 ? "text-[var(--dan)]" : "text-[var(--success)]")}>
                      {preview.rows_with_errors}
                    </p>
                    <p className="text-[7px] font-bold text-muted uppercase tracking-widest">Errors</p>
                  </div>
                </div>
              )}

              <Card className="glass-3d flex flex-col rounded-[3rem] border-default overflow-hidden h-[600px]">
                <div className="flex-1 overflow-auto no-scrollbar">
                  {!preview && !importError ? (
                    <EmptyImportState />
                  ) : importError ? (
                    <div className="flex min-h-[400px] flex-col items-center justify-center p-10 text-center">
                      <AlertCircle className="mb-5 h-12 w-12 text-[var(--dan)]" />
                      <p className="max-w-md text-[13px] font-bold text-[var(--text)]">{importError}</p>
                    </div>
                  ) : (
                    <table className="w-full min-w-[1100px] table-fixed text-left">
                      <thead className="sticky top-0 z-10">
                        <tr className="border-b border-default bg-[color-mix(in_srgb,var(--base)_95%,transparent)] backdrop-blur-md">
                          <th className="w-[120px] px-4 py-5 text-[10px] font-black uppercase tracking-[0.25em] text-muted">Room</th>
                          <th className="w-[200px] px-4 py-5 text-[10px] font-black uppercase tracking-[0.25em] text-muted">Session</th>
                          <th className="w-[140px] px-4 py-5 text-[10px] font-black uppercase tracking-[0.25em] text-muted">Time</th>
                          <th className="w-[200px] px-4 py-5 text-[10px] font-black uppercase tracking-[0.25em] text-muted">Speaker</th>
                          <th className="w-[220px] px-4 py-5 text-[10px] font-black uppercase tracking-[0.25em] text-muted">{importType === 'eposter' ? 'ePoster Title' : 'Presentation'}</th>
                          <th className="w-[120px] px-4 py-5 text-[10px] font-black uppercase tracking-[0.25em] text-muted">{importType === 'eposter' ? 'Category' : 'Duration'}</th>
                          <th className="px-4 py-5 text-[10px] font-black uppercase tracking-[0.25em] text-muted">Integrity</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-default/10">
                        {preview!.preview_rows.map((row: any) => (
                          <tr key={row.row_number} className="transition-all hover:bg-[var(--pri)]/5">
                            <td className="px-4 py-4 text-[12px] font-bold text-muted truncate">{row.room_name || "-"}</td>
                            <td className="px-4 py-4">
                              <p className="text-[13px] font-bold text-[var(--text)] truncate">{row.session_name || "-"}</p>
                              <p className="text-[10px] font-mono uppercase text-muted mt-1">{row.session_code || "-"}</p>
                            </td>
                            <td className="px-4 py-4 text-[11px] font-mono text-muted truncate">
                              {row.start_time || "-"} {row.end_time ? `\u2192 ${row.end_time.split(' ')[1]}` : ""}
                            </td>
                            <td className="px-4 py-4">
                              <p className="text-[13px] font-bold text-[var(--text)] truncate">
                                {[row.speaker_first_name, row.speaker_last_name].filter(Boolean).join(" ") || "-"}
                              </p>
                              <p className="text-[10px] text-muted truncate mt-1">{row.speaker_email || "-"}</p>
                            </td>
                            <td className="px-4 py-4 text-[12px] font-medium text-[var(--text)] truncate">
                              {row.presentation_title || row.presentation || "-"}
                            </td>
                            <td className="px-4 py-4">
                              <div className="flex items-center gap-2">
                                {importType === 'eposter' ? (
                                   <span className="text-[11px] font-medium text-muted truncate">{row.category || "-"}</span>
                                ) : (
                                  <>
                                    <Clock className="h-3 w-3 text-[var(--pri)]" />
                                    <span className="text-[11px] font-black text-[var(--text)] uppercase tracking-widest">
                                      {row.talk_duration_min ? `${row.talk_duration_min} min` : "-"}
                                    </span>
                                  </>
                                )}
                              </div>
                            </td>
                            <td className="px-4 py-4">
                              <Badge className={cn("border-0 px-2 py-0.5 text-[8px] font-black", row.is_valid ? "bg-[var(--success)]/20 text-[var(--success)]" : "bg-[var(--dan)]/20 text-[var(--dan)]")}>
                                {row.is_valid ? "VALID" : "CONFLICT"}
                              </Badge>
                              {(row.errors.length > 0 || row.warnings.length > 0) && (
                                <p className="mt-2 text-[10px] font-medium text-[var(--dan)] leading-snug line-clamp-2 italic">
                                  {[...row.errors, ...row.warnings].join("; ")}
                                </p>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
                {preview && !importError && (
                  <div className="border-t border-default bg-[color-mix(in_srgb,var(--text)_5%,transparent)] p-6 flex items-center justify-end">
                    <Button onClick={commitImport} disabled={isUploading || !preview!.can_import} className="h-12 rounded-full bg-[var(--pri)] px-10 text-[11px] font-black uppercase tracking-widest text-[var(--text)] shadow-xl shadow-[var(--pri)]/20">
                      {isUploading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                      {importCommitted ? "Import Committed" : "Commit Import"}
                    </Button>
                  </div>
                )}
              </Card>

              {/* Import Success Panel — appears after commit */}
              <AnimatePresence>
                {importCommitted && (
                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    className="glass-3d rounded-[2.5rem] border border-[var(--success)]/20 bg-[color-mix(in_srgb,var(--success)_5%,transparent)] p-8 flex flex-col gap-6"
                  >
                    {/* Header */}
                    <div className="flex items-start gap-5">
                      <div className="h-14 w-14 shrink-0 rounded-2xl bg-[var(--success)]/15 flex items-center justify-center">
                        <CheckCircle2 className="h-7 w-7 text-[var(--success)]" />
                      </div>
                      <div>
                        <h3 className="text-[16px] font-black tracking-tight text-[var(--text)] mb-1">
                          Import complete!
                        </h3>
                        <p className="text-[12px] font-bold text-muted">
                          {committedSpeakerCount > 0
                            ? <><span className="text-[var(--text)] font-black">{committedSpeakerCount} {importType === 'eposter' ? 'poster' : 'speaker'}{committedSpeakerCount !== 1 ? 's' : ''}</span> queued for ingestion — the backend worker is creating records now.
                              {autoInvite.data && autoInvite.data.already_uploaded > 0 && (
                                <span className="text-amber-400"> · {autoInvite.data.already_uploaded} already uploaded, only {autoInvite.data.pending_speakers} will receive links.</span>
                              )}
                            </>
                            : "Import job queued. The backend worker is processing your workbook."
                          }
                        </p>
                      </div>
                    </div>

                    {/* Auto-invite result */}
                    {autoInvite.data && (
                      <motion.div
                        initial={{ opacity: 0, scale: 0.97 }}
                        animate={{ opacity: 1, scale: 1 }}
                        className="flex items-start gap-4 p-4 rounded-2xl bg-[var(--success)]/10 border border-[var(--success)]/20"
                      >
                        <Mail className="h-5 w-5 text-[var(--success)] shrink-0 mt-0.5" />
                        <div>
                          <p className="text-[12px] font-black text-[var(--success)] mb-0.5">
                            {autoInvite.data.pending_speakers} invitation email{autoInvite.data.pending_speakers !== 1 ? 's' : ''} queued for delivery
                          </p>
                          {autoInvite.data.already_uploaded > 0 && (
                            <p className="text-[11px] font-bold text-muted">
                              {autoInvite.data.already_uploaded} speaker{autoInvite.data.already_uploaded !== 1 ? 's' : ''} skipped — already uploaded
                            </p>
                          )}
                        </div>
                      </motion.div>
                    )}

                    {/* Error from auto-invite (e.g. template not found) */}
                    {autoInvite.isError && (
                      <div className="flex items-start gap-4 p-4 rounded-2xl bg-amber-500/10 border border-amber-500/20">
                        <AlertCircle className="h-5 w-5 text-amber-400 shrink-0 mt-0.5" />
                        <p className="text-[11px] font-bold text-amber-400">
                          {(autoInvite.error as any)?.response?.data?.detail ?? "Could not send invitations automatically."}
                        </p>
                      </div>
                    )}

                    {/* CTA Buttons */}
                    {!autoInvite.data && (
                      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
                        <Button
                          onClick={async () => {
                            try {
                              const result = await autoInvite.mutateAsync();
                              toast.success(`${result.pending_speakers} invitation email${result.pending_speakers !== 1 ? 's' : ''} queued for delivery.`);
                            } catch (err: any) {
                              const detail = err?.response?.data?.detail ?? "Failed to send invitations.";
                              toast.error(detail);
                            }
                          }}
                          disabled={autoInvite.isPending}
                          className="h-12 rounded-full bg-[var(--pri)] px-8 text-[11px] font-black uppercase tracking-widest text-[var(--text)] shadow-xl shadow-[var(--pri)]/20 flex items-center gap-3"
                        >
                          {autoInvite.isPending ? (
                            <><Loader2 className="h-4 w-4 animate-spin" /> Sending Invitations...</>
                          ) : (
                            <><Mail className="h-4 w-4" /> Send Upload Links to All Speakers</>
                          )}
                        </Button>

                        <button
                          onClick={() => router.push(`/events/${eventIdValue}/speakers`)}
                          className="flex items-center gap-2 text-[11px] font-black text-muted uppercase tracking-widest hover:text-[var(--text)] transition-colors"
                        >
                          Skip — I'll send later <ArrowRight className="h-3 w-3" />
                        </button>
                      </div>
                    )}

                    {/* Done: go to speakers */}
                    {autoInvite.data && (
                      <button
                        onClick={() => router.push(`/events/${eventIdValue}/speakers`)}
                        className="flex items-center gap-2 text-[11px] font-black text-[var(--pri)] uppercase tracking-widest hover:text-[var(--sec)] transition-colors"
                      >
                        View Speakers <ArrowRight className="h-3 w-3" />
                      </button>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>

            </section>

            {/* Right Column: Schema */}
            <section className="flex flex-col gap-5">
              <h3 className="px-2 text-[11px] font-black uppercase tracking-[0.3em] text-muted">
                {importType === 'eposter' ? 'Poster Schema' : 'Agenda Schema'}
              </h3>
              <SchemaCard type={importType} />
            </section>
          </motion.section>
        )}

        {activeTab === "settings" && (
          <motion.section 
            key="settings" 
            initial={{ opacity: 0, y: 10 }} 
            animate={{ opacity: 1, y: 0 }} 
            exit={{ opacity: 0, y: -10 }} 
            className="grid gap-8 lg:grid-cols-[1fr_400px]"
          >
            {/* Left: Main Policies */}
            <div className="space-y-8">
              <SettingsPanel title="Submission Policies" icon={FileArchive}>
                <div className="grid gap-8 md:grid-cols-2">
                  <div className="space-y-6">
                    <div>
                      <label className="mb-2 block text-[10px] font-black uppercase tracking-widest text-muted">Upload Deadline</label>
                      <Input 
                        type="datetime-local" 
                        value={form.upload_deadline} 
                        onChange={(e) => setForm({ ...form, upload_deadline: e.target.value })} 
                        className="h-14 rounded-2xl border-default bg-[color-mix(in_srgb,var(--text)_5%,transparent)] px-5 text-[13px] font-bold text-[var(--text)] [color-scheme:dark]" 
                      />
                    </div>
                    <div>
                      <label className="mb-2 block text-[10px] font-black uppercase tracking-widest text-muted">Max File Size (MB)</label>
                      <div className="flex items-center gap-3">
                        <Input 
                          type="number" 
                          min={1} 
                          max={2048} 
                          value={form.max_file_size_mb} 
                          onChange={(e) => setForm({ ...form, max_file_size_mb: Number(e.target.value) })} 
                          className="h-14 rounded-2xl border-default bg-[color-mix(in_srgb,var(--text)_5%,transparent)] px-5 text-[13px] font-bold text-[var(--text)]" 
                        />
                        <span className="text-[10px] font-black uppercase text-muted">Limit</span>
                      </div>
                    </div>
                  </div>

                  <div>
                    <label className="mb-2 block text-[10px] font-black uppercase tracking-widest text-muted">Allowed File Extensions</label>
                    <textarea 
                      value={form.allowed_formats} 
                      onChange={(e) => setForm({ ...form, allowed_formats: e.target.value })} 
                      className="min-h-[148px] w-full rounded-2xl border-default bg-[color-mix(in_srgb,var(--text)_5%,transparent)] p-5 text-[12px] font-bold text-[var(--text)] outline-none transition-all focus:border-[var(--pri)]/50 focus:ring-1 focus:ring-[var(--pri)]/20" 
                      placeholder="pptx, pdf, zip..." 
                    />
                  </div>
                </div>
              </SettingsPanel>

              <SettingsPanel title="Workflow Controls" icon={ToggleLeft}>
                <div className="grid gap-4 sm:grid-cols-2">
                  <ToggleRow label="Moderation Flow" value={form.enable_moderator} onChange={(value) => setForm({ ...form, enable_moderator: value })} />
                  <ToggleRow label="Speaker Ready Room" value={form.enable_srr} onChange={(value) => setForm({ ...form, enable_srr: value })} />
                  <ToggleRow label="WhatsApp Reminders" value={form.enable_whatsapp} onChange={(value) => setForm({ ...form, enable_whatsapp: value })} />
                  <ToggleRow label="Venue Signage" value={form.enable_signage} onChange={(value) => setForm({ ...form, enable_signage: value })} />
                  <ToggleRow label="Webhook Triggers" value={form.enable_webhooks} onChange={(value) => setForm({ ...form, enable_webhooks: value })} />
                  <ToggleRow label="ePoster Workflow" value={form.enable_posters} onChange={(value) => setForm({ ...form, enable_posters: value })} />
                </div>
              </SettingsPanel>
            </div>

            {/* Right: Info & Danger Zone */}
            <div className="space-y-8">
              <SettingsPanel title="Danger Zone" icon={Trash2}>
                <div className="space-y-4">
                  <p className="text-[11px] font-medium leading-relaxed text-muted">
                    Permanently delete all data associated with this event (files, databases, logs, sessions, speakers, etc.) except the core event and user profiles. Use this for a complete factory reset.
                    <span className="mt-1 block font-black text-[var(--dan)]">NON-REVERSIBLE.</span>
                  </p>
                  <Button 
                    onClick={() => void handleClearData()} 
                    disabled={isClearing}
                    className="h-14 w-full rounded-3xl bg-[var(--dan)] text-[10px] font-black uppercase tracking-widest text-[var(--text)] hover:opacity-90 shadow-xl shadow-[var(--dan)]/20"
                  >
                    {isClearing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Trash2 className="mr-2 h-4 w-4" />}
                    Delete All Event Data
                  </Button>
                </div>
              </SettingsPanel>

              <Card className="glass-3d rounded-[2.5rem] border-default p-8 bg-gradient-to-br from-[var(--pri)]/5 to-transparent">
                <Shield className="mb-4 h-8 w-8 text-[var(--pri)]" />
                <h4 className="mb-2 text-[12px] font-black uppercase tracking-widest text-[var(--text)]">Security & Policy</h4>
                <p className="text-[11px] font-medium leading-relaxed text-muted">
                  All changes made here affect the public-facing submission portals immediately. Ensure your deadlines and format rules align with your event program.
                </p>
              </Card>
            </div>
          </motion.section>
        )}
      </AnimatePresence>
    </div>
  );
}

function Field({ icon: Icon, label, value, onChange, placeholder, className }: { icon: typeof Globe; label: string; value: string; onChange: (value: string) => void; placeholder?: string; className?: string }) {
  return (
    <div className={cn("space-y-3", className)}>
      <label className="px-1 text-[10px] font-black uppercase tracking-[0.25em] text-muted">{label}</label>
      <div className="relative">
        <Icon className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-muted" />
        <Input value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} className="h-14 rounded-2xl border-default bg-[color-mix(in_srgb,var(--text)_5%,transparent)] pl-12 pr-5 text-[15px] font-bold text-[var(--text)] placeholder:text-muted" />
      </div>
    </div>
  );
}

function SummaryLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-muted">{label}</span>
      <span className="truncate text-right text-[var(--text)]">{value}</span>
    </div>
  );
}

function Metric({ label, value, danger }: { label: string; value: string; danger?: boolean }) {
  return (
    <div>
      <p className="mb-1 text-[10px] font-black uppercase tracking-widest text-muted">{label}</p>
      <p className={cn("text-[14px] font-bold", danger ? "text-[var(--dan)]" : "text-[var(--text)]")}>{value}</p>
    </div>
  );
}

function SettingsPanel({ title, icon: Icon, children }: { title: string; icon: typeof Settings; children: ReactNode }) {
  return (
    <Card className="glass-3d rounded-[3rem] border-default p-8">
      <div className="mb-8 flex items-center gap-4">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--pri)]/15 text-[var(--pri)]">
          <Icon className="h-5 w-5" />
        </div>
        <h3 className="text-[14px] font-black uppercase tracking-widest text-[var(--text)]">{title}</h3>
      </div>
      {children}
    </Card>
  );
}

function ToggleRow({ label, value, onChange }: { label: string; value: boolean; onChange: (value: boolean) => void }) {
  return (
    <div className="flex items-center justify-between rounded-2xl border border-default bg-[color-mix(in_srgb,var(--text)_3%,transparent)] p-5 group hover:bg-[color-mix(in_srgb,var(--text)_5%,transparent)] transition-all">
      <div className="space-y-1">
        <span className="text-[13px] font-bold text-[var(--text)]">{label}</span>
        <p className="text-[9px] font-black text-muted uppercase tracking-widest">{value ? 'Active' : 'Disabled'}</p>
      </div>
      <button 
        type="button" 
        onClick={() => onChange(!value)} 
        aria-pressed={value} 
        className={cn(
          "relative h-8 w-14 rounded-full border-2 p-1 transition-all duration-500 ease-[cubic-bezier(0.34,1.56,0.64,1)] shadow-inner", 
          value ? "border-[var(--pri)] bg-[var(--pri)] shadow-[0_0_15px_color-mix(in_srgb,var(--pri)_40%,transparent)]" : "border-default bg-[color-mix(in_srgb,var(--text)_10%,transparent)]"
        )}
      >
        <motion.span 
          animate={{ x: value ? 24 : 0, scale: value ? 1.1 : 1 }} 
          transition={{ type: "spring", stiffness: 500, damping: 30 }}
          className="block h-5 w-5 rounded-full bg-[var(--text)] shadow-[0_2px_5px_rgba(0,0,0,0.3)]" 
        />
      </button>
    </div>
  );
}

function EmptyImportState() {
  return (
    <div className="flex min-h-[560px] flex-col items-center justify-center p-10 text-center">
      <FileSpreadsheet className="mb-5 h-14 w-14 text-muted" />
      <h3 className="mb-3 text-xl font-black uppercase tracking-tighter text-[var(--text)]">No agenda loaded</h3>
      <p className="max-w-md text-[12px] font-medium leading-relaxed text-muted">Upload an Excel workbook to preview the exact session, room, speaker, and timing mapping before committing it to the backend.</p>
    </div>
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
    <div className="glass-3d rounded-[2.5rem] border-default p-6 flex flex-col h-full">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Shield className="h-4 w-4 text-[var(--pri)]" />
          <h4 className="text-[10px] font-black uppercase tracking-[0.25em] text-muted">
            {type === 'eposter' ? 'ePoster Schema' : 'Agenda Schema'}
          </h4>
        </div>
      </div>

      <p className="text-[11px] font-medium leading-relaxed text-muted mb-6">
        {type === 'eposter' 
           ? 'Speakers are matched by email. Posters will be auto-assigned to the EPoster Hall.' 
           : 'The system maps rooms by name, sessions by code, and speakers by email.'}
      </p>

      <div className="flex-1 overflow-y-auto pr-2 no-scrollbar space-y-2 mb-6 max-h-[400px]">
        {columns.map((col) => (
          <ColumnInfo key={col.label} label={col.label} field={col.field} desc={col.desc} />
        ))}
      </div>

      <Button
        variant="outline"
        className="w-full h-12 rounded-2xl border-default bg-[var(--pri)]/5 hover:bg-[var(--pri)]/10 text-[var(--pri)] text-[10px] font-black uppercase tracking-widest gap-3"
        onClick={() => window.open(sampleUrl, '_blank')}
      >
        <Download className="h-4 w-4" /> Download Sample
      </Button>
    </div>
  );
}

function ColumnInfo({ label, field, desc }: { label: string; field: string; desc: string }) {
  return (
    <div className="flex items-center gap-3 text-[10px] py-1 border-b border-default last:border-0">
      <div className="w-5 h-5 shrink-0 rounded bg-[var(--pri)]/10 flex items-center justify-center font-bold text-[var(--pri)] text-[8px]">{label}</div>
      <span className="font-bold text-[var(--text)] w-24 shrink-0 truncate">{field}</span>
      <span className="text-muted truncate">{desc}</span>
    </div>
  );
}
