"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  Calendar, MapPin, Upload, FileText, Check, Download,
  Sparkles, ExternalLink, ArrowRight, Loader2, Bell,
  Presentation, CheckCircle2, ChevronRight, ArrowLeft,
  Clock, ShieldCheck, AlertCircle, RefreshCw, X, Folder,
  FolderOpen, File, Link as LinkIcon, Layers, Eye, AlertTriangle
} from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { ThemedIllustration } from "@/components/ui/themed-illustration";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";

interface Talk {
  session_speaker_id: string;
  session_name: string;
  session_code: string;
  start_time: string;
  end_time: string;
  talk_title?: string;
  room_name?: string;
  track_name?: string;
  upload_status: string;
  is_locked?: boolean;
  filename?: string;
  download_url?: string;
  preview_url?: string;
  thumbnail_url?: string;
  external_url?: string;
  rejection_reason?: string;
}

interface TreeFileItem {
  name: string;
  path: string;
  size: number;
  isValid: boolean;
  reason?: string;
  rawFile: File;
}

interface TreeNode {
  name: string;
  isFolder: boolean;
  children?: TreeNode[];
  fileItem?: TreeFileItem;
}

const ALLOWED_EXTENSIONS = [".pptx", ".ppt", ".pdf", ".key", ".mp4", ".mov", ".zip", ".png", ".jpg", ".jpeg"];

export default function SpeakerCenterPage() {
  const { eventId } = useParams<{ eventId: string }>();
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [speakerData, setSpeakerData] = useState<any>(null);
  const [accessDenied, setAccessDenied] = useState(false);
  const [speakerToken, setSpeakerToken] = useState<string>("");

  // Target talk for modal actions
  const [selectedTalk, setSelectedTalk] = useState<Talk | null>(null);

  // Folder tree upload modal state
  const [folderTreeOpen, setFolderTreeOpen] = useState(false);
  const [folderTree, setFolderTree] = useState<TreeNode[]>([]);
  const [validFolderFiles, setValidFolderFiles] = useState<TreeFileItem[]>([]);
  const [invalidFolderCount, setInvalidFolderCount] = useState<number>(0);
  const [uploadingFolder, setUploadingFolder] = useState(false);

  // External link modal state
  const [linkModalOpen, setLinkModalOpen] = useState(false);
  const [linkUrl, setLinkUrl] = useState("");
  const [savingLink, setSavingLink] = useState(false);

  // File upload state
  const [uploadingSingle, setUploadingSingle] = useState(false);
  const singleFileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);

  const tokenKey = `portal_token_${eventId}`;

  const fetchSpeakerData = useCallback(async () => {
    const token = localStorage.getItem(tokenKey);
    if (!token) {
      router.replace(`/${eventId}/login`);
      return;
    }

    try {
      // 1. Fetch attendee dashboard data to check role & speaker token
      const dashRes = await fetch(`${API_BASE}/api/v1/portal/dashboard`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (dashRes.status === 401) {
        localStorage.removeItem(tokenKey);
        router.replace(`/${eventId}/login`);
        return;
      }

      if (dashRes.ok) {
        const dashData = await dashRes.json();
        const registeredRole = (
          dashData?.participant?.role ||
          dashData?.registration?.role ||
          ""
        ).toLowerCase();
        const SPEAKER_KEYWORDS = ["speaker", "faculty", "keynote", "invited", "panelist", "moderator"];
        const isSpeaker = dashData?.is_speaker || SPEAKER_KEYWORDS.some((kw) => registeredRole.includes(kw));

        if (!isSpeaker) {
          setAccessDenied(true);
          setLoading(false);
          toast.error("This area is restricted to registered faculty and speakers.");
          return;
        }

        // Speaker token from dashboard or participant
        const tokenVal = dashData?.speaker_portal_url?.split("/").pop() || token;
        // 2. Fetch speaker details directly with session token
        let loadedSpeaker = null;

        // Try direct /speakers/me endpoint with Bearer auth
        try {
          const meRes = await fetch(`${API_BASE}/api/v1/portal/speakers/me?token=${encodeURIComponent(token)}`, {
            headers: { Authorization: `Bearer ${token}` },
          });
          if (meRes.ok) {
            loadedSpeaker = await meRes.json();
          }
        } catch {
          // ignore
        }

        // If not loaded and speaker_portal_url has a token, try that
        if (!loadedSpeaker && dashData?.speaker_portal_url) {
          const slug = dashData.speaker_portal_url.split("/").pop();
          if (slug && slug !== token) {
            try {
              const sRes = await fetch(`${API_BASE}/api/v1/portal/auth/${eventId}/${slug}`);
              if (sRes.ok) {
                loadedSpeaker = await sRes.json();
                setSpeakerToken(slug);
              }
            } catch {
              // ignore
            }
          }
        }

        if (loadedSpeaker) {
          setSpeakerData(loadedSpeaker);
          if (loadedSpeaker.upload_token) {
            setSpeakerToken(loadedSpeaker.upload_token);
          }
        } else {
          setSpeakerData({
            name: dashData?.participant?.name || "Speaker",
            email: dashData?.participant?.email || "",
            event_name: dashData?.event?.name || "Conference",
            max_file_size_mb: 500,
            allowed_formats: ["PPTX", "PDF", "KEY", "MP4", "ZIP"],
            talks: [],
          });
        }
      }
    } catch (err) {
      console.error("Failed to load speaker portal data", err);
      toast.error("Failed to load speaker portal data.");
    } finally {
      setLoading(false);
    }
  }, [eventId, router, tokenKey]);

  useEffect(() => {
    fetchSpeakerData();
  }, [fetchSpeakerData]);

  // ── Single File Upload ────────────────────────────────────────────────────────
  const handleSingleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !selectedTalk) return;

    const maxSizeMb = speakerData?.max_file_size_mb || 500;
    if (file.size > maxSizeMb * 1024 * 1024) {
      toast.error(`File exceeds maximum allowed size of ${maxSizeMb}MB`);
      return;
    }

    setUploadingSingle(true);
    try {
      // 1. Request presigned upload URL
      const presignRes = await fetch(`${API_BASE}/api/v1/portal/upload-url?token=${speakerToken}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": crypto.randomUUID(),
        },
        body: JSON.stringify({
          session_speaker_id: selectedTalk.session_speaker_id,
          filename: file.name,
          file_size_bytes: file.size,
          mime_type: file.type || "application/octet-stream",
          file_format: file.name.split(".").pop()?.toUpperCase() || "PPTX",
        }),
      });

      if (!presignRes.ok) {
        const errData = await presignRes.json().catch(() => ({}));
        throw new Error(errData.detail || "Failed to initialize upload.");
      }

      const { upload_url, file_id } = await presignRes.json();

      if (upload_url) {
        const uploadRes = await fetch(upload_url, {
          method: "PUT",
          body: file,
          headers: { "Content-Type": file.type || "application/octet-stream" },
        });
        if (!uploadRes.ok) throw new Error("File transfer to storage failed.");
      }

      // 2. Confirm upload
      const confirmRes = await fetch(`${API_BASE}/api/v1/portal/confirm-upload?token=${speakerToken}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          file_id,
          session_speaker_id: selectedTalk.session_speaker_id,
        }),
      });

      if (!confirmRes.ok) throw new Error("Failed to confirm file upload.");

      toast.success(`"${file.name}" uploaded successfully!`);
      fetchSpeakerData();
    } catch (err: any) {
      toast.error(err.message || "Upload failed. Please try again.");
    } finally {
      setUploadingSingle(false);
      if (singleFileInputRef.current) singleFileInputRef.current.value = "";
    }
  };

  // ── Folder Upload & Tree Construction ─────────────────────────────────────────
  const handleFolderSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (!files.length || !selectedTalk) return;

    const maxSizeMb = speakerData?.max_file_size_mb || 500;
    const maxSizeBytes = maxSizeMb * 1024 * 1024;

    const fileItems: TreeFileItem[] = files.map((file) => {
      const ext = `.${file.name.split(".").pop()?.toLowerCase()}`;
      const isExtValid = ALLOWED_EXTENSIONS.includes(ext);
      const isSizeValid = file.size <= maxSizeBytes;

      let reason = undefined;
      if (!isExtValid) reason = `Unsupported format (${ext})`;
      else if (!isSizeValid) reason = `Exceeds ${maxSizeMb}MB limit`;

      return {
        name: file.name,
        path: file.webkitRelativePath || file.name,
        size: file.size,
        isValid: isExtValid && isSizeValid,
        reason,
        rawFile: file,
      };
    });

    // Build directory tree
    const rootNodes: TreeNode[] = [];

    fileItems.forEach((item) => {
      const parts = item.path.split("/");
      let currentLevel = rootNodes;

      parts.forEach((part, index) => {
        const isFile = index === parts.length - 1;
        let existingNode = currentLevel.find((n) => n.name === part && n.isFolder === !isFile);

        if (!existingNode) {
          existingNode = {
            name: part,
            isFolder: !isFile,
            children: isFile ? undefined : [],
            fileItem: isFile ? item : undefined,
          };
          currentLevel.push(existingNode);
        }

        if (!isFile && existingNode.children) {
          currentLevel = existingNode.children;
        }
      });
    });

    const validFiles = fileItems.filter((f) => f.isValid);
    const invalidCount = fileItems.length - validFiles.length;

    setFolderTree(rootNodes);
    setValidFolderFiles(validFiles);
    setInvalidFolderCount(invalidCount);
    setFolderTreeOpen(true);

    if (folderInputRef.current) folderInputRef.current.value = "";
  };

  // ── Confirm Folder Upload (Sequential Transfer) ───────────────────────────────
  const handleConfirmFolderUpload = async () => {
    if (!validFolderFiles.length || !selectedTalk) return;

    setUploadingFolder(true);
    let successCount = 0;

    for (const item of validFolderFiles) {
      try {
        const presignRes = await fetch(`${API_BASE}/api/v1/portal/upload-url?token=${speakerToken}`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Idempotency-Key": crypto.randomUUID(),
          },
          body: JSON.stringify({
            session_speaker_id: selectedTalk.session_speaker_id,
            filename: item.name,
            file_size_bytes: item.size,
            mime_type: item.rawFile.type || "application/octet-stream",
            file_format: item.name.split(".").pop()?.toUpperCase() || "PPTX",
          }),
        });

        if (!presignRes.ok) continue;
        const { upload_url, file_id } = await presignRes.json();

        if (upload_url) {
          await fetch(upload_url, {
            method: "PUT",
            body: item.rawFile,
            headers: { "Content-Type": item.rawFile.type || "application/octet-stream" },
          });
        }

        await fetch(`${API_BASE}/api/v1/portal/confirm-upload?token=${speakerToken}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            file_id,
            session_speaker_id: selectedTalk.session_speaker_id,
          }),
        });

        successCount++;
      } catch (err) {
        console.error(`Failed to upload ${item.name}`, err);
      }
    }

    setUploadingFolder(false);
    setFolderTreeOpen(false);
    toast.success(`Successfully uploaded ${successCount} files from folder!`);
    fetchSpeakerData();
  };

  // ── Save External Link ────────────────────────────────────────────────────────
  const handleSaveExternalLink = async () => {
    if (!selectedTalk || !linkUrl.trim()) return;

    if (!linkUrl.startsWith("http://") && !linkUrl.startsWith("https://")) {
      toast.error("Please enter a valid URL starting with https:// or http://");
      return;
    }

    setSavingLink(true);
    try {
      const res = await fetch(`${API_BASE}/api/v1/portal/talks/${selectedTalk.session_speaker_id}/external-link`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: linkUrl.trim(),
          token: speakerToken,
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.detail || "Failed to save external link.");
      }

      toast.success("External file link saved successfully!");
      setLinkModalOpen(false);
      setLinkUrl("");
      fetchSpeakerData();
    } catch (err: any) {
      toast.error(err.message || "Failed to save link.");
    } finally {
      setSavingLink(false);
    }
  };

  // Helper renderer for recursive directory tree view
  const renderTreeNode = (node: TreeNode, depth = 0) => {
    if (node.isFolder) {
      return (
        <div key={node.name + depth} className="space-y-1.5" style={{ paddingLeft: `${depth * 18}px` }}>
          <div className="flex items-center gap-2 text-xs font-bold text-[var(--text)] py-1">
            <FolderOpen className="h-4 w-4 text-[var(--pri)] shrink-0" />
            <span>{node.name}</span>
          </div>
          <div className="space-y-1 pl-2 border-l-2 border-[var(--border-default)]">
            {node.children?.map((child) => renderTreeNode(child, depth + 1))}
          </div>
        </div>
      );
    }

    const item = node.fileItem;
    if (!item) return null;

    const sizeMb = (item.size / (1024 * 1024)).toFixed(2);

    return (
      <div
        key={item.path}
        className={`flex items-center justify-between p-2.5 rounded-xl text-xs border transition-all ${
          item.isValid
            ? "bg-[var(--bg-surface-2)] border-[var(--border-default)] text-[var(--text)]"
            : "bg-rose-500/5 border-rose-500/30 text-rose-400"
        }`}
        style={{ marginLeft: `${depth * 14}px` }}
      >
        <div className="flex items-center gap-2.5 min-w-0 pr-3">
          <File className={`h-4 w-4 shrink-0 ${item.isValid ? "text-[var(--pri)]" : "text-rose-500"}`} />
          <div className="min-w-0">
            <span className="font-semibold block truncate text-xs">{item.name}</span>
            <span className="text-[10px] text-[var(--muted)] font-mono">{sizeMb} MB</span>
          </div>
        </div>

        <div>
          {item.isValid ? (
            <span className="px-2 py-0.5 rounded-md bg-emerald-500/10 text-emerald-500 text-[10px] font-black uppercase tracking-wider flex items-center gap-1 shrink-0">
              <Check className="h-3 w-3 stroke-[3]" />
              <span>Valid</span>
            </span>
          ) : (
            <span className="px-2 py-0.5 rounded-md bg-rose-500/10 text-rose-500 text-[10px] font-bold shrink-0">
              {item.reason}
            </span>
          )}
        </div>
      </div>
    );
  };

  if (loading) {
    return (
      <div className="min-h-[80vh] flex flex-col items-center justify-center p-4 bg-transparent relative z-10">
        <Loader2 className="h-9 w-9 animate-spin text-[var(--pri)] mb-3" />
        <span className="text-xs font-black uppercase tracking-widest text-[var(--muted)]">
          Loading Speaker Center...
        </span>
      </div>
    );
  }

  if (accessDenied) {
    return (
      <div className="min-h-screen bg-transparent relative z-10 flex flex-col items-center justify-center p-8 text-center space-y-5">
        <div className="h-16 w-16 rounded-full bg-rose-500/10 border border-rose-500/20 flex items-center justify-center">
          <ShieldCheck className="h-7 w-7 text-rose-400" />
        </div>
        <div className="space-y-1">
          <h1 className="text-xl font-black text-[var(--text)] tracking-tight">Speaker Area - Access Restricted</h1>
          <p className="text-xs text-[var(--muted)] font-medium leading-relaxed max-w-xs">
            This section is only accessible to registered speakers. If you believe this is an error, please contact the organiser.
          </p>
        </div>
        <button
          type="button"
          onClick={() => router.push(`/${eventId}/dashboard`)}
          className="px-7 py-2.5 rounded-xl bg-[var(--pri)] hover:bg-[var(--pri)]/90 text-white text-xs font-black uppercase tracking-wider transition-all cursor-pointer shadow-sm"
        >
          Back to My Dashboard
        </button>
      </div>
    );
  }

  const speakerName = speakerData?.first_name
    ? `${speakerData.first_name} ${speakerData.last_name || ""}`.trim()
    : speakerData?.name || "Distinguished Faculty";
  const eventName = speakerData?.event_name || "Official Conference";
  const talks: Talk[] = speakerData?.talks || [];

  return (
    <div className="min-h-screen pb-16 bg-transparent text-[var(--text)] transition-colors duration-200 relative z-10">
      
      {/* Hidden File Inputs */}
      <input
        ref={singleFileInputRef}
        type="file"
        accept=".pptx,.ppt,.pdf,.key,.mp4,.mov,.zip"
        className="hidden"
        onChange={handleSingleFileChange}
      />
      <input
        ref={folderInputRef}
        type="file"
        // @ts-ignore
        webkitdirectory="true"
        directory="true"
        multiple
        className="hidden"
        onChange={handleFolderSelect}
      />

      <div className="max-w-6xl mx-auto px-4 sm:px-6 pt-8 space-y-8">
        
        {/* ── Top Header Banner with Themed Illustration ───────────────────── */}
        <div className="p-6 md:p-8 rounded-[28px] bg-[var(--card)] border-2 border-[var(--border-default)] shadow-md flex flex-col md:flex-row items-center justify-between gap-6 text-left relative overflow-hidden">
          <div className="space-y-2 relative z-10">
            <span className="text-[10px] font-black uppercase tracking-[0.25em] text-[var(--muted)] block">
              SPEAKER & FACULTY WORKSPACE
            </span>
            <h1 className="text-2xl sm:text-3xl font-black text-[var(--text)] tracking-tight">
              Welcome, {speakerName} ✨
            </h1>
            <p className="text-xs sm:text-sm text-[var(--muted)] font-medium max-w-lg">
              Manage your assigned speaking sessions, upload presentation decks, and attach external resources for {eventName}.
            </p>

            <div className="pt-3">
              <button
                type="button"
                onClick={() => router.push(`/${eventId}/dashboard`)}
                className="px-4 py-2 rounded-xl border-2 border-[var(--border-default)] bg-[var(--bg-surface-2)] hover:bg-[var(--bg-surface-hover)] text-xs font-bold text-[var(--text)] uppercase tracking-wider flex items-center gap-2 transition-all cursor-pointer"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                <span>Attendee Dashboard</span>
              </button>
            </div>
          </div>

          <div className="relative z-10 shrink-0">
            <ThemedIllustration
              name="conference-speaker"
              className="w-48 h-48 sm:w-56 sm:h-56 drop-shadow-xl"
              glow={true}
            />
          </div>
        </div>

        {/* ── Section: Assigned Speaking Talks & File Uploads ────────────────── */}
        <div className="space-y-4 text-left">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <h2 className="text-lg font-black text-[var(--text)] tracking-tight">Your Assigned Sessions & Talks</h2>
              <p className="text-xs text-[var(--muted)]">Upload slides, decks, and resources per talk individually</p>
            </div>
            <span className="text-xs font-black font-mono text-[var(--text)] bg-[var(--bg-surface-2)] px-3 py-1 rounded-full border border-[var(--border-default)]">
              {talks.length} {talks.length === 1 ? "Talk" : "Talks"} Scheduled
            </span>
          </div>

          {talks.length === 0 ? (
            <div className="p-8 rounded-[24px] border-2 border-dashed border-[var(--border-default)] bg-[var(--card)] text-center space-y-3">
              <div className="h-12 w-12 rounded-full bg-[var(--bg-surface-2)] flex items-center justify-center mx-auto text-[var(--muted)]">
                <Presentation className="h-6 w-6" />
              </div>
              <div className="space-y-1">
                <h3 className="text-sm font-bold text-[var(--text)]">No Active Speaking Sessions Assigned Yet</h3>
                <p className="text-xs text-[var(--muted)] max-w-sm mx-auto">
                  The event organisers are currently finalising the agenda schedule. Your speaking sessions will appear here once published.
                </p>
              </div>
            </div>
          ) : (
            <div className="space-y-5">
              {talks.map((talk, idx) => {
                const isUploaded = talk.upload_status === "uploaded" || talk.upload_status === "approved" || !!talk.filename;
                const hasLink = !!talk.external_url;

                // Format Time and Date cleanly
                const dateFormatted = talk.start_time
                  ? new Date(talk.start_time).toLocaleDateString("en-IN", {
                      weekday: "short",
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    })
                  : "Scheduled Date";

                const timeFormatted = talk.start_time && talk.end_time
                  ? `${new Date(talk.start_time).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })} - ${new Date(talk.end_time).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}`
                  : "Scheduled Time";

                return (
                  <div
                    key={talk.session_speaker_id || idx}
                    className="p-6 md:p-7 rounded-[24px] border-2 border-[var(--border-default)] bg-[var(--card)] shadow-md space-y-6 text-left relative overflow-hidden"
                  >
                    {/* Top Row: Talk Title & Status Pill */}
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="px-2.5 py-0.5 rounded-lg bg-[var(--pri)]/10 text-[var(--text)] border border-[var(--pri)]/20 text-[10px] font-black uppercase tracking-wider">
                            {talk.track_name || "General Track"}
                          </span>
                          <span className="text-[11px] font-mono text-[var(--muted)] font-bold">
                            {talk.session_code ? `[${talk.session_code}]` : ""}
                          </span>
                        </div>
                        <h3 className="text-lg md:text-xl font-black text-[var(--text)] tracking-tight">
                          {talk.talk_title || talk.session_name}
                        </h3>
                      </div>

                      <div className="shrink-0">
                        {isUploaded ? (
                          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-500 text-[11px] font-black uppercase tracking-wider">
                            <CheckCircle2 className="h-3.5 w-3.5" />
                            <span>Deck Uploaded</span>
                          </span>
                        ) : hasLink ? (
                          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-500 text-[11px] font-black uppercase tracking-wider">
                            <LinkIcon className="h-3.5 w-3.5" />
                            <span>Link Attached</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-500 text-[11px] font-black uppercase tracking-wider">
                            <Clock className="h-3.5 w-3.5" />
                            <span>Upload Pending</span>
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Clean Metadata Grid: Track, Session, Room, Time, Date (No AV stuff) */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-4 rounded-2xl bg-[var(--bg-surface-2)] border border-[var(--border-default)]">
                      <div className="space-y-0.5">
                        <span className="text-[10px] font-black uppercase tracking-wider text-[var(--muted)] block">
                          Session
                        </span>
                        <span className="text-xs font-bold text-[var(--text)] block truncate">
                          {talk.session_name}
                        </span>
                      </div>

                      <div className="space-y-0.5">
                        <span className="text-[10px] font-black uppercase tracking-wider text-[var(--muted)] block">
                          Room / Hall
                        </span>
                        <span className="text-xs font-bold text-[var(--text)] block truncate">
                          {talk.room_name || "Main Auditorium"}
                        </span>
                      </div>

                      <div className="space-y-0.5">
                        <span className="text-[10px] font-black uppercase tracking-wider text-[var(--muted)] block">
                          Date
                        </span>
                        <span className="text-xs font-bold text-[var(--text)] block truncate">
                          {dateFormatted}
                        </span>
                      </div>

                      <div className="space-y-0.5">
                        <span className="text-[10px] font-black uppercase tracking-wider text-[var(--muted)] block">
                          Time Window
                        </span>
                        <span className="text-xs font-bold font-mono text-[var(--text)] block truncate">
                          {timeFormatted}
                        </span>
                      </div>
                    </div>

                    {/* Attached Resources Display (File or External Link) */}
                    {(talk.filename || talk.external_url) && (
                      <div className="p-4 rounded-2xl bg-[var(--bg-surface-2)] border border-[var(--border-default)] space-y-2">
                        <span className="text-[10px] font-black uppercase tracking-widest text-[var(--muted)] block">
                          Current Attached Presentation Assets
                        </span>
                        <div className="flex flex-wrap items-center gap-3">
                          {talk.filename && (
                            <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-[var(--card)] border border-[var(--border-default)] text-xs font-bold text-[var(--text)]">
                              <FileText className="h-4 w-4 text-[var(--pri)]" />
                              <span className="truncate max-w-xs">{talk.filename}</span>
                              {talk.download_url && (
                                <a
                                  href={talk.download_url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-[var(--pri)] hover:underline ml-1"
                                >
                                  <Download className="h-3.5 w-3.5" />
                                </a>
                              )}
                            </div>
                          )}

                          {talk.external_url && (
                            <a
                              href={talk.external_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-[var(--card)] border border-[var(--border-default)] text-xs font-bold text-blue-500 hover:underline"
                            >
                              <LinkIcon className="h-3.5 w-3.5" />
                              <span className="truncate max-w-xs">{talk.external_url}</span>
                              <ExternalLink className="h-3 w-3" />
                            </a>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Individual Upload & Link Action Buttons */}
                    <div className="flex flex-wrap items-center gap-3 pt-2 border-t-2 border-[var(--border-default)]">
                      {/* Button 1: Upload Single Presentation File */}
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedTalk(talk);
                          singleFileInputRef.current?.click();
                        }}
                        disabled={uploadingSingle}
                        className="h-11 px-5 rounded-xl bg-[var(--pri)] hover:bg-[var(--pri)]/90 text-white text-xs font-black uppercase tracking-wider flex items-center gap-2 transition-all cursor-pointer shadow-md shadow-[var(--pri)]/20"
                      >
                        {uploadingSingle ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                        <span>Upload Slide File</span>
                      </button>

                      {/* Button 2: Upload Entire Folder */}
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedTalk(talk);
                          folderInputRef.current?.click();
                        }}
                        className="h-11 px-5 rounded-xl border-2 border-[var(--border-default)] bg-[var(--card)] hover:bg-[var(--bg-surface-hover)] text-[var(--text)] text-xs font-black uppercase tracking-wider flex items-center gap-2 transition-all cursor-pointer shadow-sm"
                      >
                        <Folder className="h-4 w-4 text-[var(--pri)]" />
                        <span>Upload Folder (with Tree Preview)</span>
                      </button>

                      {/* Button 3: Attach External Drive Link */}
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedTalk(talk);
                          setLinkUrl(talk.external_url || "");
                          setLinkModalOpen(true);
                        }}
                        className="h-11 px-5 rounded-xl border-2 border-[var(--border-default)] bg-[var(--card)] hover:bg-[var(--bg-surface-hover)] text-[var(--text)] text-xs font-black uppercase tracking-wider flex items-center gap-2 transition-all cursor-pointer shadow-sm ml-auto"
                      >
                        <LinkIcon className="h-4 w-4 text-[var(--sec)]" />
                        <span>External Drive Link</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

      </div>

      {/* ── MODAL: FOLDER TREE STRUCTURE & VALIDATION PREVIEW ──────────────── */}
      <Dialog open={folderTreeOpen} onOpenChange={setFolderTreeOpen}>
        <DialogContent className="max-w-2xl rounded-[28px] bg-[var(--card)] border-2 border-[var(--border-default)] p-6 md:p-8 space-y-6">
          <DialogHeader>
            <DialogTitle className="text-xl font-black text-[var(--text)] flex items-center gap-2">
              <Folder className="h-5 w-5 text-[var(--pri)]" />
              <span>Folder Structure & Format Validation</span>
            </DialogTitle>
            <DialogDescription className="text-xs text-[var(--muted)]">
              Preview folder directory hierarchy. Files are checked against supported presentation formats and file size limits.
            </DialogDescription>
          </DialogHeader>

          {/* Validation Summary Bar */}
          <div className="p-4 rounded-2xl bg-[var(--bg-surface-2)] border border-[var(--border-default)] flex items-center justify-between text-xs">
            <div className="flex items-center gap-2">
              <span className="font-bold text-[var(--text)]">Ready to upload:</span>
              <span className="font-black text-emerald-500 bg-emerald-500/10 px-2 py-0.5 rounded-md">
                {validFolderFiles.length} valid files
              </span>
            </div>
            {invalidFolderCount > 0 && (
              <div className="flex items-center gap-1.5 text-rose-500 font-bold">
                <AlertTriangle className="h-4 w-4" />
                <span>{invalidFolderCount} files will be skipped</span>
              </div>
            )}
          </div>

          {/* Directory Tree Box */}
          <div className="max-h-80 overflow-y-auto pr-1 space-y-2 p-4 rounded-2xl bg-[var(--bg-surface-2)] border border-[var(--border-default)]">
            {folderTree.map((node) => renderTreeNode(node))}
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={() => setFolderTreeOpen(false)}
              className="h-12 px-6 rounded-xl border-2 border-[var(--border-default)] hover:bg-[var(--bg-surface-hover)] text-xs font-bold text-[var(--muted)] hover:text-[var(--text)] cursor-pointer transition-all"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleConfirmFolderUpload}
              disabled={uploadingFolder || validFolderFiles.length === 0}
              className="h-12 px-8 rounded-xl bg-[var(--pri)] hover:bg-[var(--pri)]/90 text-white text-xs font-black uppercase tracking-wider flex items-center gap-2 transition-all cursor-pointer shadow-lg shadow-[var(--pri)]/25"
            >
              {uploadingFolder ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
              <span>Upload {validFolderFiles.length} Valid Files</span>
            </button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── MODAL: ATTACH EXTERNAL FILE / DRIVE LINK ───────────────────────── */}
      <Dialog open={linkModalOpen} onOpenChange={setLinkModalOpen}>
        <DialogContent className="max-w-lg rounded-[28px] bg-[var(--card)] border-2 border-[var(--border-default)] p-6 md:p-8 space-y-6">
          <DialogHeader>
            <DialogTitle className="text-xl font-black text-[var(--text)] flex items-center gap-2">
              <LinkIcon className="h-5 w-5 text-[var(--sec)]" />
              <span>Share External Resource Link</span>
            </DialogTitle>
            <DialogDescription className="text-xs text-[var(--muted)]">
              For large slide decks, video reels, or materials hosted on Google Drive, OneDrive, Dropbox, or WeTransfer.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 text-left">
            <div className="space-y-2">
              <label className="text-[11px] font-black uppercase tracking-wider text-[var(--muted)] block">
                Resource URL <span className="text-rose-500">*</span>
              </label>
              <input
                type="url"
                placeholder="https://drive.google.com/drive/folders/..."
                value={linkUrl}
                onChange={(e) => setLinkUrl(e.target.value)}
                className="w-full h-12 px-4 rounded-xl text-sm font-semibold bg-[var(--bg-surface-2)] border-2 border-[var(--border-default)] text-[var(--text)] focus:border-[var(--pri)] focus:ring-4 focus:ring-[var(--pri)]/15 focus:bg-[var(--card)] transition-all"
              />
              <span className="text-[10px] text-[var(--muted)] font-medium block">
                Make sure the shared link has viewer/download permissions enabled.
              </span>
            </div>
          </div>

          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={() => setLinkModalOpen(false)}
              className="h-12 px-6 rounded-xl border-2 border-[var(--border-default)] hover:bg-[var(--bg-surface-hover)] text-xs font-bold text-[var(--muted)] hover:text-[var(--text)] cursor-pointer transition-all"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSaveExternalLink}
              disabled={savingLink || !linkUrl.trim()}
              className="h-12 px-8 rounded-xl bg-[var(--pri)] hover:bg-[var(--pri)]/90 text-white text-xs font-black uppercase tracking-wider flex items-center gap-2 transition-all cursor-pointer shadow-lg shadow-[var(--pri)]/25"
            >
              {savingLink && <Loader2 className="h-4 w-4 animate-spin" />}
              <span>Save Resource Link</span>
            </button>
          </div>
        </DialogContent>
      </Dialog>

    </div>
  );
}
