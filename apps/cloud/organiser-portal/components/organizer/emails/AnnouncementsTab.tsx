"use client";

import { useState, useEffect } from "react";
import { 
  Megaphone, X, Save, Loader2, Info, AlertTriangle, CheckCircle, AlertCircle,
  Pin, Calendar, Link, Paperclip, Check, ExternalLink, FileText, Image, Trash2,
  Eye, Code2, UploadCloud, ChevronDown, ChevronRight
} from "lucide-react";
import { toast } from "sonner";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Card } from "@/components/ui/card";
import { apiClient } from "@/lib/api-client";
import { useOperationAccess } from "@/lib/capabilities";

export default function AnnouncementsTab({ eventId, filterAudience }: { eventId: string; filterAudience?: "all" | "speakers" | "participants" }) {
  const announcementReadAccess = useOperationAccess("announcements.read");
  const announcementAccess = useOperationAccess("announcements.manage");
  const [announcementId, setAnnouncementId] = useState("");
  const [announcements, setAnnouncements] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const displayedAnnouncements = filterAudience && filterAudience !== "all"
    ? announcements.filter((a) => a.audience === filterAudience)
    : announcements;

  // Composer fields
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [audience, setAudience] = useState<"all" | "speakers" | "participants">("all");
  const [priority, setPriority] = useState<"info" | "warning" | "critical">("info");
  const [isPinned, setIsPinned] = useState(false);
  const [scheduledAt, setScheduledAt] = useState("");
  const [expiresAt, setExpiresAt] = useState("");

  // Attachments list
  const [attachments, setAttachments] = useState<any[]>([]);
  const [linkUrl, setLinkUrl] = useState("");
  const [verifyingLink, setVerifyingLink] = useState(false);
  const [uploadingFile, setUploadingFile] = useState(false);
  const [composeMode, setComposeMode] = useState<"write" | "preview">("write");
  const [dragOver, setDragOver] = useState(false);

  // Expanded announcements feed list
  const [expandedFeed, setExpandedFeed] = useState<Record<string, boolean>>({});

  // PDF Viewer & Image Lightbox Modal States (to allow checking uploads)
  const [pdfViewerUrl, setPdfViewerUrl] = useState<string | null>(null);
  const [pdfViewerTitle, setPdfViewerTitle] = useState("");
  const [lightboxImageUrl, setLightboxImageUrl] = useState<string | null>(null);
  const [lightboxTitle, setLightboxTitle] = useState("");

  const resetForm = () => {
    setAnnouncementId(crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2));
    setTitle("");
    setBody("");
    setAudience("all");
    setPriority("info");
    setIsPinned(false);
    setScheduledAt("");
    setExpiresAt("");
    setAttachments([]);
    setLinkUrl("");
    setComposeMode("write");
  };

  const fetchAnnouncements = async () => {
    if (!eventId || !announcementReadAccess.enabled) return;
    setLoading(true);
    try {
      const data = await apiClient.get<any[]>(`/events/${eventId}/announcements`);
      setAnnouncements(data);
    } catch (err: any) {
      toast.error("Failed to load announcements: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    resetForm();
    if (!announcementReadAccess.loading && announcementReadAccess.enabled) {
      void fetchAnnouncements();
    } else if (!announcementReadAccess.loading) {
      setLoading(false);
      setAnnouncements([]);
    }
  }, [eventId, announcementReadAccess.loading, announcementReadAccess.enabled]);

  const handleVerifyLink = async () => {
    if (!announcementAccess.enabled) return;
    if (!linkUrl.trim()) return;
    setVerifyingLink(true);
    try {
      const res = await apiClient.post<any>(`/events/${eventId}/announcements/verify-link`, {
        url: linkUrl.trim()
      });
      if (res.reachable) {
        toast.success("Link verified successfully!");
        setAttachments(prev => [
          ...prev,
          {
            type: "link",
            name: res.title || linkUrl.trim(),
            url: res.url
          }
        ]);
        setLinkUrl("");
      } else {
        toast.error("Link verification failed. The URL is unreachable.");
      }
    } catch (err: any) {
      toast.error("Failed to verify link: " + err.message);
    } finally {
      setVerifyingLink(false);
    }
  };

  const handleFileUpload = async (file: File) => {
    if (!announcementAccess.enabled) return;
    if (!file) return;
    setUploadingFile(true);
    const toastId = toast.loading(`Uploading ${file.name}...`);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("announcement_id", announcementId);
      
      const res = await apiClient.post<any>(`/events/${eventId}/announcements/upload`, fd, {
        headers: {
          "Content-Type": undefined,
          "Idempotency-Key": crypto.randomUUID(),
        }
      });
      
      setAttachments(prev => [
        ...prev,
        {
          type: "file",
          name: res.name,
          url: res.url,
          storage_path: res.storage_path,
          size: res.size
        }
      ]);
      toast.success(`${file.name} uploaded successfully!`, { id: toastId });
    } catch (err: any) {
      toast.error("Upload failed: " + err.message, { id: toastId });
    } finally {
      setUploadingFile(false);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(true);
  };

  const handleDragLeave = () => {
    setDragOver(false);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      await handleFileUpload(e.dataTransfer.files[0]);
    }
  };

  const handlePublish = async () => {
    if (!announcementAccess.enabled) {
      toast.error(`Announcement publishing unavailable: ${(announcementAccess.reason || "capability unavailable").replaceAll("_", " ").toLowerCase()}`);
      return;
    }
    if (!title.trim() || !body.trim()) {
      toast.error("Please provide both a title and message body.");
      return;
    }
    const toastId = toast.loading("Publishing announcement...");
    try {
      const payload = {
        id: announcementId,
        title: title.trim(),
        body: body.trim(),
        audience,
        priority,
        is_pinned: isPinned,
        scheduled_at: scheduledAt ? new Date(scheduledAt).toISOString() : null,
        expires_at: expiresAt ? new Date(expiresAt).toISOString() : null,
        attachments
      };
      
      await apiClient.post(`/events/${eventId}/announcements`, payload, {
        headers: { "Idempotency-Key": `announcement-create-${announcementId}` },
      });
      toast.success("Announcement published successfully!", { id: toastId });
      resetForm();
      await fetchAnnouncements();
    } catch (err: any) {
      toast.error("Failed to publish: " + err.message, { id: toastId });
    }
  };

  const handleDelete = async (id: string) => {
    if (!announcementAccess.enabled) return;
    const toastId = toast.loading("Archiving announcement...");
    try {
      await apiClient.delete(`/events/${eventId}/announcements/${id}`);
      toast.success("Announcement archived and remains recoverable through Command Center.", { id: toastId });
      await fetchAnnouncements();
    } catch (err: any) {
      toast.error("Failed to delete: " + err.message, { id: toastId });
    }
  };

  const handleAttachmentClick = async (att: any) => {
    if (att.type === "link") {
      window.open(att.url, "_blank", "noopener,noreferrer");
      return;
    }
    
    if (att.type === "file" && att.storage_path) {
      const filename = att.name || "";
      const ext = filename.split(".").pop()?.toLowerCase() || "";
      const toastId = toast.loading("Opening attachment...");
      try {
        const res = await apiClient.get<any>(`/portal/announcements/signed-url?storage_path=${encodeURIComponent(att.storage_path)}`);
        toast.dismiss(toastId);
        
        if (ext === "pdf") {
          setPdfViewerUrl(res.url);
          setPdfViewerTitle(att.name);
        } else if (["png", "jpg", "jpeg", "webp", "gif"].includes(ext)) {
          setLightboxImageUrl(res.url);
          setLightboxTitle(att.name);
        } else {
          window.open(res.url, "_blank");
        }
      } catch (err: any) {
        toast.error("Failed to load attachment: " + err.message, { id: toastId });
      }
    }
  };

  const getDriveIcon = (url: string) => {
    if (url.includes("drive.google.com") || url.includes("docs.google.com")) {
      return (
        <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="none">
          <path d="M7.784 14.417L14.773 2.25H9.227L2.239 14.417h5.545z" fill="#0066DA"/>
          <path d="M16.216 14.417L9.227 26.583h5.546L21.76 14.417H16.216z" fill="#00A859"/>
          <path d="M20.625 22.083L13.636 9.917h5.546l6.989 12.166H20.625z" fill="#FFCC00"/>
        </svg>
      );
    }
    if (url.includes("onedrive") || url.includes("sharepoint.com") || url.includes("live.com")) {
      return (
        <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="none">
          <path d="M19.35 10.04C18.67 6.59 15.64 4 12 4 9.11 4 6.6 5.64 5.35 8.04 2.34 8.36 0 10.91 0 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96z" fill="#0078D4"/>
        </svg>
      );
    }
    if (url.includes("dropbox.com")) {
      return (
        <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="#0061FE">
          <path d="M6 2L1 5.3L6 8.7L11 5.3L6 2Z" />
          <path d="M18 2L13 5.3L18 8.7L23 5.3L18 2Z" />
          <path d="M1 11.7L6 15L11 11.7L6 8.3L1 11.7Z" />
          <path d="M23 11.7L18 15L13 11.7L18 8.3L23 11.7Z" />
          <path d="M6 16.3V21.3L11 18V13L6 16.3Z" />
          <path d="M18 16.3V21.3L13 18V13L18 16.3Z" />
        </svg>
      );
    }
    return <ExternalLink className="h-4 w-4 text-indigo-400 shrink-0" />;
  };

  const getAttachmentIcon = (att: any) => {
    if (att.type === "link") {
      return getDriveIcon(att.url);
    }
    const filename = att.name || "";
    const ext = filename.split(".").pop()?.toLowerCase() || "";
    if (ext === "pdf") return <FileText className="h-4 w-4 text-rose-400 shrink-0" />;
    if (["png", "jpg", "jpeg", "webp", "gif"].includes(ext)) return <Image className="h-4 w-4 text-emerald-400 shrink-0" />;
    return <FileText className="h-4 w-4 text-indigo-400 shrink-0" />;
  };

  const toggleFeedExpand = (id: string) => {
    setExpandedFeed(prev => ({
      ...prev,
      [id]: !prev[id]
    }));
  };

  if (!announcementReadAccess.loading && !announcementReadAccess.enabled) {
    return (
      <Card className="mx-auto w-full max-w-3xl rounded-3xl border-amber-500/20 bg-amber-500/5 p-8 text-center">
        <AlertTriangle className="mx-auto mb-3 h-7 w-7 text-amber-300" />
        <h2 className="text-base font-bold text-[var(--text)]">Announcements are unavailable</h2>
        <p className="mt-2 text-sm text-muted">
          Access is blocked: {(announcementReadAccess.reason || "RESOLUTION_UNAVAILABLE").replaceAll("_", " ").toLowerCase()}.
        </p>
      </Card>
    );
  }

  return (
    <div className="w-full max-w-7xl mx-auto flex flex-col flex-1 min-h-0 space-y-6 px-4 md:px-6 animate-in fade-in slide-in-from-bottom-4 duration-500 text-left">
      {/* Header section */}
      <div className="flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <Megaphone className="h-5 w-5 text-[var(--pri)] animate-pulse" />
          <div>
            <h2 className="text-sm font-black uppercase tracking-[0.2em] text-[var(--text)]">Portal Announcements &amp; Alerts</h2>
            <p className="text-[9px] font-black uppercase tracking-widest text-muted mt-0.5">
              Compose targeted bulletins with attachments, scheduling, and verified links.
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 flex-1 min-h-0">
        {/* Left Column: Composer */}
        <div className="lg:col-span-6 flex flex-col space-y-4">
          <Card className="glass-3d rounded-[2rem] p-6 border-default bg-[color-mix(in_srgb,var(--text)_3%,transparent)] space-y-5">
            <h3 className="text-xs font-black uppercase tracking-widest text-[var(--text)] border-b border-white/5 pb-3">
              Broadcast Composer
            </h3>

            {/* Title */}
            <div className="space-y-1.5">
              <label className="text-[9px] font-black uppercase tracking-widest text-muted block">Bulletin Title</label>
              <input
                type="text"
                placeholder="E.g. Room Change: Keynote Session"
                value={title}
                onChange={e => setTitle(e.target.value)}
                className="w-full h-11 bg-[#080912] border border-white/10 rounded-xl px-4 text-xs font-semibold text-[var(--text)] focus:border-[var(--pri)] focus:ring-0 transition-all"
              />
            </div>

            {/* Target Audience & Priority Row */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Audience */}
              <div className="space-y-1.5">
                <label className="text-[9px] font-black uppercase tracking-widest text-muted block font-bold">Audience</label>
                <div className="flex rounded-xl border border-white/10 bg-[#080912] p-1 gap-1">
                  {(["all", "speakers", "participants"] as const).map(aud => (
                    <button
                      key={aud}
                      type="button"
                      onClick={() => setAudience(aud)}
                      className={`flex-1 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-wider transition-all ${
                        audience === aud 
                          ? "bg-[var(--pri)] text-[var(--primary-contrast)]" 
                          : "text-muted hover:text-[var(--text)]"
                      }`}
                    >
                      {aud}
                    </button>
                  ))}
                </div>
              </div>

              {/* Priority */}
              <div className="space-y-1.5">
                <label className="text-[9px] font-black uppercase tracking-widest text-muted block font-bold">Priority Level</label>
                <div className="flex rounded-xl border border-white/10 bg-[#080912] p-1 gap-1">
                  {(["info", "warning", "critical"] as const).map(pr => (
                    <button
                      key={pr}
                      type="button"
                      onClick={() => setPriority(pr)}
                      className={`flex-1 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-wider transition-all ${
                        priority === pr 
                          ? pr === "critical"
                            ? "bg-rose-600 text-white"
                            : pr === "warning"
                              ? "bg-amber-500 text-black font-extrabold"
                              : "bg-blue-600 text-white"
                          : "text-muted hover:text-[var(--text)]"
                      }`}
                    >
                      {pr}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Pin Toggle & Scheduling */}
            <div className="p-4 bg-white/5 border border-white/5 rounded-2xl space-y-4">
              <label className="flex items-center gap-3 cursor-pointer select-none">
                <div className={`h-4.5 w-4.5 rounded border flex items-center justify-center transition-all ${
                  isPinned ? "bg-[var(--pri)] border-[var(--pri)]" : "bg-black/40 border-white/20"
                }`}>
                  <input
                    type="checkbox"
                    checked={isPinned}
                    onChange={e => setIsPinned(e.target.checked)}
                    className="sr-only"
                  />
                  {isPinned && <Check className="h-3 w-3 text-white" />}
                </div>
                <span className="text-[10px] font-black uppercase tracking-wider text-[var(--text)] flex items-center gap-1">
                  <Pin className="h-3 w-3 text-indigo-400 rotate-45" /> Pin to top of feed
                </span>
              </label>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <span className="text-[8px] font-black uppercase tracking-widest text-muted block">Schedule For Later</span>
                  <input
                    type="datetime-local"
                    value={scheduledAt}
                    onChange={e => setScheduledAt(e.target.value)}
                    className="w-full h-9 bg-black/40 border border-white/10 rounded-xl px-3 text-[10px] font-bold text-[var(--text)] focus:border-[var(--pri)]"
                  />
                </div>
                <div className="space-y-1">
                  <span className="text-[8px] font-black uppercase tracking-widest text-muted block">Expires After</span>
                  <input
                    type="datetime-local"
                    value={expiresAt}
                    onChange={e => setExpiresAt(e.target.value)}
                    className="w-full h-9 bg-black/40 border border-white/10 rounded-xl px-3 text-[10px] font-bold text-[var(--text)] focus:border-[var(--pri)]"
                  />
                </div>
              </div>
            </div>

            {/* Message Body Editor / Preview */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-[9px] font-black uppercase tracking-widest text-muted block font-bold">Message Content</label>
                <div className="flex border border-white/10 rounded-lg bg-black/40 p-0.5 gap-0.5">
                  <button
                    type="button"
                    onClick={() => setComposeMode("write")}
                    className={`px-3 py-1 text-[8px] font-black uppercase tracking-widest rounded-md ${
                      composeMode === "write" ? "bg-white/10 text-white" : "text-muted hover:text-white"
                    }`}
                  >
                    <Code2 className="h-3 w-3" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setComposeMode("preview")}
                    className={`px-3 py-1 text-[8px] font-black uppercase tracking-widest rounded-md ${
                      composeMode === "preview" ? "bg-white/10 text-white" : "text-muted hover:text-white"
                    }`}
                  >
                    <Eye className="h-3 w-3" />
                  </button>
                </div>
              </div>

              {composeMode === "write" ? (
                <textarea
                  placeholder="Enter bulletin body (Markdown supported)..."
                  value={body}
                  onChange={e => setBody(e.target.value)}
                  rows={6}
                  className="w-full bg-[#080912] border border-white/10 focus:border-[var(--pri)] focus:ring-0 rounded-2xl px-4 py-3 text-xs text-[var(--text)] font-semibold leading-relaxed resize-none placeholder:text-muted/40"
                />
              ) : (
                <div className="min-h-[144px] max-h-[250px] overflow-y-auto bg-[#080912] border border-white/10 rounded-2xl px-4 py-3 text-xs text-left prose prose-invert max-w-none
                  prose-headings:text-[var(--text)] prose-headings:font-black prose-headings:tracking-tight
                  prose-h1:text-sm prose-h2:text-xs
                  prose-p:text-muted prose-p:text-xs prose-p:leading-relaxed
                  prose-li:text-muted prose-li:text-xs
                  prose-strong:text-[var(--text)] prose-em:text-indigo-300">
                  {body ? (
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{body}</ReactMarkdown>
                  ) : (
                    <span className="text-muted italic">No preview available. Write some content first.</span>
                  )}
                </div>
              )}
            </div>

            {/* Attachments Area */}
            <div className="space-y-3">
              <label className="text-[9px] font-black uppercase tracking-widest text-muted block font-bold">Attachments &amp; Links</label>

              {/* Drag and Drop Zone */}
              <div
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                className={`border-2 border-dashed rounded-2xl p-5 text-center flex flex-col items-center justify-center gap-2 cursor-pointer transition-all ${
                  dragOver 
                    ? "border-[var(--pri)] bg-[var(--pri)]/5 text-[var(--text)]" 
                    : "border-white/10 hover:border-white/20 bg-black/40 text-muted"
                }`}
              >
                <UploadCloud className="h-8 w-8 text-indigo-400" />
                <span className="text-[10px] font-bold uppercase tracking-wider block">
                  Drag &amp; Drop file here, or click to upload
                </span>
                <span className="text-[8px] uppercase tracking-widest text-muted/60">
                  Supports PDF, DOCX, XLSX, images
                </span>
                <input
                  type="file"
                  disabled={announcementAccess.loading || !announcementAccess.enabled}
                  onChange={e => {
                    if (e.target.files && e.target.files[0]) {
                      handleFileUpload(e.target.files[0]);
                    }
                  }}
                  className="sr-only"
                  id="ann-file-picker"
                />
                <button
                  type="button"
                  onClick={() => document.getElementById("ann-file-picker")?.click()}
                  disabled={announcementAccess.loading || !announcementAccess.enabled}
                  className="mt-1 px-4 py-1.5 bg-white/5 border border-white/10 hover:bg-white/10 rounded-xl text-[8px] font-black uppercase tracking-widest text-[#E8EAFF]"
                >
                  Choose File
                </button>
              </div>

              {/* Paste URL block */}
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="Paste external or drive link here..."
                  value={linkUrl}
                  onChange={e => setLinkUrl(e.target.value)}
                  className="h-10 flex-1 bg-black/40 border border-white/10 rounded-xl px-3 text-[11px] text-[var(--text)] font-semibold placeholder:text-muted/40"
                />
                <button
                  type="button"
                  onClick={handleVerifyLink}
                  disabled={verifyingLink || !linkUrl.trim() || announcementAccess.loading || !announcementAccess.enabled}
                  className="px-4 h-10 bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-400 border border-indigo-500/20 disabled:opacity-40 rounded-xl text-[9px] font-black uppercase tracking-wider transition-all"
                >
                  {verifyingLink ? <Loader2 className="h-3 w-3 animate-spin" /> : "Verify Link"}
                </button>
              </div>

              {/* Attachments Chips List */}
              {attachments.length > 0 && (
                <div className="flex flex-wrap gap-2 p-3 bg-black/20 border border-white/5 rounded-2xl">
                  {attachments.map((att, attIdx) => (
                    <div
                      key={attIdx}
                      className="inline-flex items-center gap-2 bg-white/5 border border-white/10 px-3 py-1.5 rounded-xl text-[10px] font-bold text-[#E8EAFF]"
                    >
                      {getAttachmentIcon(att)}
                      <span className="truncate max-w-[120px]">{att.name}</span>
                      <button
                        type="button"
                        onClick={() => setAttachments(prev => prev.filter((_, i) => i !== attIdx))}
                        className="text-muted hover:text-rose-400 p-0.5 rounded-full hover:bg-white/5 transition-all"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Action buttons */}
            <div className="flex gap-3 pt-3 border-t border-white/5">
              <button
                type="button"
                onClick={resetForm}
                className="px-6 h-11 bg-white/5 hover:bg-white/10 text-[var(--text)] border border-default rounded-xl text-[10px] font-black uppercase tracking-widest transition-all"
              >
                Clear
              </button>
              <button
                type="button"
                onClick={handlePublish}
                disabled={!title.trim() || !body.trim() || announcementAccess.loading || !announcementAccess.enabled}
                className="flex-1 inline-flex items-center justify-center gap-2 h-11 bg-[var(--pri)] hover:bg-[var(--pri-hover)] text-white rounded-xl text-[10px] font-black uppercase tracking-widest disabled:opacity-50 transition-all shadow-lg shadow-[var(--pri)]/25"
              >
                Publish Announcement
              </button>
            </div>
          </Card>
        </div>

        {/* Right Column: Live Feed */}
        <div className="lg:col-span-6 flex flex-col space-y-4 min-h-0 h-[650px]">
          <Card className="glass-3d rounded-[2rem] p-6 border-default bg-[color-mix(in_srgb,var(--text)_3%,transparent)] flex flex-col h-full min-h-0">
            <h3 className="text-xs font-black uppercase tracking-widest text-[var(--text)] border-b border-white/5 pb-3 shrink-0">
              Active Bulletins Feed ({displayedAnnouncements.length})
            </h3>

            <div className="flex-1 overflow-y-auto pr-1 space-y-4 custom-scrollbar min-h-0 mt-4">
              {loading ? (
                <div className="flex flex-col items-center justify-center py-20 space-y-3">
                  <Loader2 className="h-6 w-6 text-[var(--pri)] animate-spin" />
                  <span className="text-[10px] font-black text-muted uppercase tracking-wider">Fetching Feed...</span>
                </div>
              ) : displayedAnnouncements.length > 0 ? (
                displayedAnnouncements.map((ann, idx) => {
                  const type = ann.priority || "info";
                  const isPinned = ann.is_pinned;
                  const isExpanded = !!expandedFeed[ann.id || idx];
                  
                  const styles = {
                    critical: {
                      border: "border-rose-500/20 bg-rose-500/[0.02]",
                      badge: "bg-rose-500/10 text-rose-400 border-rose-500/20",
                      label: "Critical"
                    },
                    warning: {
                      border: "border-amber-500/20 bg-amber-500/[0.02]",
                      badge: "bg-amber-500/10 text-amber-400 border-amber-500/20",
                      label: "Warning"
                    },
                    info: {
                      border: "border-indigo-500/20 bg-indigo-500/[0.02]",
                      badge: "bg-indigo-500/10 text-indigo-400 border-indigo-500/20",
                      label: "Info"
                    },
                    success: {
                      border: "border-emerald-500/20 bg-emerald-500/[0.02]",
                      badge: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
                      label: "Success"
                    }
                  }[type as "critical" | "warning" | "info" | "success"] || {
                    border: "border-indigo-500/20 bg-indigo-500/[0.02]",
                    badge: "bg-indigo-500/10 text-indigo-400 border-indigo-500/20",
                    label: "Notice"
                  };

                  return (
                    <div
                      key={ann.id || idx}
                      className={`border rounded-2xl overflow-hidden transition-all duration-350 ${styles.border}`}
                    >
                      {/* Accordion header */}
                      <div
                        onClick={() => toggleFeedExpand(ann.id || idx)}
                        className="px-5 py-4 flex items-center justify-between cursor-pointer hover:bg-white/[0.02] transition-colors"
                      >
                        <div className="flex-1 min-w-0 pr-4">
                          <div className="flex items-center gap-2 mb-1.5">
                            {isPinned && (
                              <span className="inline-flex items-center gap-0.5 text-[8px] font-black uppercase text-indigo-400 tracking-wide">
                                📌 Pinned
                              </span>
                            )}
                            <span className={`inline-flex px-1.5 py-0.5 rounded border text-[8px] font-black uppercase tracking-wider ${styles.badge}`}>
                              {styles.label}
                            </span>
                            <span className="text-[8px] font-bold text-muted uppercase tracking-wider">
                              Audience: {ann.audience || "All"}
                            </span>
                          </div>
                          <h4 className="text-xs font-black text-[var(--text)] truncate">{ann.title}</h4>
                        </div>

                        <div className="flex items-center gap-3 shrink-0">
                          {/* Delete Action button */}
                          <button
                            type="button"
                            disabled={announcementAccess.loading || !announcementAccess.enabled}
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDelete(ann.id);
                            }}
                            className="p-1.5 rounded-lg bg-white/5 border border-white/5 hover:bg-rose-500/15 hover:border-rose-500/20 text-muted hover:text-rose-400 transition-all"
                            title="Delete bulletin"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                          {isExpanded ? <ChevronDown className="h-4 w-4 text-muted" /> : <ChevronRight className="h-4 w-4 text-muted" />}
                        </div>
                      </div>

                      {/* Accordion Body */}
                      {isExpanded && (
                        <div className="px-5 pb-5 pt-1 border-t border-white/5 space-y-4">
                          {/* Message Body */}
                          <div className="prose prose-invert prose-xs max-w-none text-left leading-relaxed
                            prose-headings:text-[var(--text)] prose-headings:font-black prose-headings:text-xs
                            prose-p:text-muted prose-p:text-xs prose-p:leading-relaxed prose-p:my-1
                            prose-li:text-muted prose-li:text-xs
                            prose-strong:text-[var(--text)] prose-em:text-indigo-300">
                            <ReactMarkdown remarkPlugins={[remarkGfm]}>
                              {ann.body}
                            </ReactMarkdown>
                          </div>

                          {/* Scheduling Info */}
                          {(ann.scheduled_at || ann.expires_at) && (
                            <div className="grid grid-cols-2 gap-4 py-2 border-y border-white/5 text-[9px] text-muted uppercase tracking-wider font-semibold">
                              {ann.scheduled_at && (
                                <div>
                                  <span>Scheduled: </span>
                                  <span className="text-[var(--text)]">{new Date(ann.scheduled_at).toLocaleString()}</span>
                                </div>
                              )}
                              {ann.expires_at && (
                                <div>
                                  <span>Expires: </span>
                                  <span className="text-[var(--text)]">{new Date(ann.expires_at).toLocaleString()}</span>
                                </div>
                              )}
                            </div>
                          )}

                          {/* Attachments display */}
                          {ann.attachments && ann.attachments.length > 0 && (
                            <div className="space-y-2 pt-2">
                              <span className="text-[8px] font-black text-muted uppercase tracking-widest block">
                                Attachments ({ann.attachments.length})
                              </span>
                              <div className="flex flex-wrap gap-2">
                                {ann.attachments.map((att: any, attIdx: number) => (
                                  <button
                                    key={attIdx}
                                    type="button"
                                    onClick={() => handleAttachmentClick(att)}
                                    className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-white/5 border border-white/10 hover:bg-white/10 text-[9px] font-bold rounded-lg transition-all text-[#E8EAFF]"
                                  >
                                    {getAttachmentIcon(att)}
                                    <span className="truncate max-w-[120px]">{att.name}</span>
                                    {att.type === "link" && <ExternalLink className="h-3 w-3 opacity-60" />}
                                  </button>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })
              ) : (
                <div className="p-8 border border-dashed border-white/10 rounded-2xl text-center text-xs font-semibold text-muted italic bg-white/[0.01]">
                  No bulletins published yet. Compose on the left to broadcast updates.
                </div>
              )}
            </div>
          </Card>
        </div>
      </div>

      {/* PDF Viewer Modal */}
      {pdfViewerUrl && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/85 backdrop-blur-md p-4 animate-in fade-in duration-200">
          <div className="relative w-full max-w-4xl bg-[#0d0e1b] border border-indigo-500/20 rounded-[2.5rem] shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="px-8 py-5 border-b border-white/5 flex items-center justify-between bg-white/[0.01] shrink-0">
              <div className="flex items-center gap-2">
                <FileText className="h-4 w-4 text-indigo-400" />
                <h3 className="text-sm font-black uppercase tracking-[0.25em] text-[#E8EAFF] truncate max-w-[200px] sm:max-w-md">
                  {pdfViewerTitle}
                </h3>
              </div>
              <button
                onClick={() => {
                  setPdfViewerUrl(null);
                  setPdfViewerTitle("");
                }}
                className="h-8 w-8 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center text-[var(--muted)] hover:text-[#E8EAFF] transition-all"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="p-4 flex-1 bg-black/20">
              <iframe
                src={pdfViewerUrl}
                className="w-full h-[65vh] rounded-2xl border border-white/10 bg-white"
                title="PDF Document Viewer"
              />
            </div>
            <div className="px-8 py-4 border-t border-white/5 bg-white/[0.01] shrink-0 flex justify-end">
              <button
                onClick={() => {
                  setPdfViewerUrl(null);
                  setPdfViewerTitle("");
                }}
                className="px-6 h-10 rounded-xl bg-white/5 border border-white/10 text-[var(--muted)] font-black text-xs uppercase tracking-wider hover:bg-white/10 transition-all"
              >
                Close Viewer
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Image Lightbox Modal */}
      {lightboxImageUrl && (
        <div 
          className="fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-black/95 backdrop-blur-md p-4 animate-in fade-in duration-200"
          onClick={() => {
            setLightboxImageUrl(null);
            setLightboxTitle("");
          }}
        >
          <div className="absolute top-4 right-4 flex items-center gap-3 z-10">
            <span className="text-xs font-black text-white/60 uppercase tracking-widest bg-white/5 border border-white/10 px-3 py-1 rounded-full">
              {lightboxTitle}
            </span>
            <button
              onClick={() => {
                setLightboxImageUrl(null);
                setLightboxTitle("");
              }}
              className="h-9 w-9 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-all"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
          <div className="max-w-4xl max-h-[85vh] overflow-hidden rounded-2xl border border-white/10 shadow-2xl relative" onClick={(e) => e.stopPropagation()}>
            <img
              src={lightboxImageUrl}
              alt={lightboxTitle}
              className="max-w-full max-h-[85vh] object-contain rounded-2xl"
            />
          </div>
        </div>
      )}
    </div>
  );
}
