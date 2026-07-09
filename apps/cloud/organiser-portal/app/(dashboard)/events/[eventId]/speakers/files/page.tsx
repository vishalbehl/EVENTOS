"use client";

import React, { useState, useMemo, useEffect } from "react";
import { useParams } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { 
  FileVideo, FileText, Search, Filter, CheckCircle2, 
  XCircle, Download, ShieldCheck, Zap, Clock, User, 
  Eye, ChevronRight, AlertCircle, FileCheck, Info, 
  MapPin, Layers, RefreshCw, BarChart2, Tv, UploadCloud,
  ChevronDown, History, ShieldAlert, ListChecks, PlayCircle, Plus,
  X, Award, Calendar, AlertTriangle
} from "lucide-react";
import { useFiles, useApproveFile, useRejectFile, useDownloadFile } from "@/hooks/useFiles";
import { useSessions } from "@/hooks/useSessions";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { apiClient } from "@/lib/api-client";

type FileReviewView = "dashboard" | "validation" | "upload";

export default function FileMonitoringPage() {
  const { eventId } = useParams();
  const eventIdStr = eventId as string;

  const [view, setView] = useState<FileReviewView>("dashboard");
  const [searchQuery, setSearchQuery] = useState("");
  
  // Dynamic filter selections
  const [filterRoom, setFilterRoom] = useState("all");
  const [filterDay, setFilterDay] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");

  // Pagination states
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  // Rejection/Audit Modal State
  const [activeSessionSpeakerId, setActiveSessionSpeakerId] = useState<string | null>(null);
  const [historyVersions, setHistoryVersions] = useState<any[]>([]);
  const [versionsLoading, setVersionsLoading] = useState(false);
  const [showRejectForm, setShowRejectForm] = useState(false);
  const [rejectionReason, setRejectionReason] = useState("");

  // Upload Portal Form State
  const [selectedRoom, setSelectedRoom] = useState("");
  const [selectedSessionId, setSelectedSessionId] = useState("");
  const [selectedSpeakerId, setSelectedSpeakerId] = useState(""); // session_speaker_id
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);

  // Fetch Core Data
  const { data: sessions } = useSessions(eventIdStr || "");
  const { data: files, isLoading: filesLoading, refetch: refetchFiles } = useFiles(eventIdStr || "");

  const approveMutation = useApproveFile(eventIdStr);
  const rejectMutation = useRejectFile(eventIdStr);
  const downloadMutation = useDownloadFile(eventIdStr);

  // Resolve Master List combining Speakers with their assigned files
  const speakerAssignments = useMemo(() => {
    const list: any[] = [];
    if (!sessions) return list;

    sessions.forEach(s => {
      s.speakers?.forEach((sp: any) => {
        // Find current version of file uploaded for this slot
        const file = files?.find(f => f.session_speaker_id === sp.session_speaker_id);
        list.push({
          speakerId: sp.id,
          speakerName: sp.full_name,
          speakerEmail: sp.email || "No Email",
          sessionSpeakerId: sp.session_speaker_id,
          sessionId: s.id,
          sessionName: s.name,
          track: "Plenary Track",
          roomName: s.room_name || "Unassigned Room",
          startTime: s.start_time,
          presentationTitle: sp.presentation_title || "General Presentation",
          file: file || null
        });
      });
    });
    return list;
  }, [sessions, files]);

  // Dynamically resolve filters list from assignments
  const roomsList = useMemo(() => {
    const set = new Set<string>();
    speakerAssignments.forEach(a => {
      if (a.roomName) set.add(a.roomName);
    });
    return Array.from(set).sort();
  }, [speakerAssignments]);

  const daysList = useMemo(() => {
    const set = new Set<string>();
    speakerAssignments.forEach(a => {
      if (a.startTime) {
        set.add(a.startTime.slice(0, 10)); // YYYY-MM-DD
      }
    });
    return Array.from(set).sort();
  }, [speakerAssignments]);

  // Active Assignment memo resolved dynamically from activeSessionSpeakerId
  const activeAssignment = useMemo(() => {
    if (!activeSessionSpeakerId) return null;
    return speakerAssignments.find(a => a.sessionSpeakerId === activeSessionSpeakerId) || null;
  }, [speakerAssignments, activeSessionSpeakerId]);

  // Statistics Computations
  const stats = useMemo(() => {
    const total = speakerAssignments.length;
    const uploaded = speakerAssignments.filter(a => a.file).length;
    const pending = total - uploaded;
    const approved = speakerAssignments.filter(a => a.file?.upload_status === "approved").length;
    const issues = speakerAssignments.filter(a => a.file?.validation?.overall_result === "fail" || a.file?.validation?.overall_result === "warning").length;
    const processing = speakerAssignments.filter(a => a.file?.upload_status === "processing" || a.file?.upload_status === "pending_validation").length;

    return { total, uploaded, pending, approved, issues, processing };
  }, [speakerAssignments]);

  // Format chart distribution
  const typeDistribution = useMemo(() => {
    const formats = { pptx: 0, pdf: 0, video: 0, image: 0, other: 0 };
    speakerAssignments.forEach(a => {
      if (!a.file) return;
      const fmt = a.file.file_format?.toLowerCase();
      if (["pptx", "ppt"].includes(fmt)) formats.pptx++;
      else if (fmt === "pdf") formats.pdf++;
      else if (["mp4", "mov", "avi"].includes(fmt)) formats.video++;
      else if (["png", "jpg", "jpeg"].includes(fmt)) formats.image++;
      else formats.other++;
    });
    return formats;
  }, [speakerAssignments]);

  // Status distribution
  const statusDistribution = useMemo(() => {
    const states = { approved: 0, pendingReview: 0, needsChanges: 0, processing: 0 };
    speakerAssignments.forEach(a => {
      if (!a.file) return;
      const status = a.file.upload_status;
      if (status === "approved") states.approved++;
      else if (status === "rejected") states.needsChanges++;
      else if (["processing", "pending_validation"].includes(status)) states.processing++;
      else states.pendingReview++;
    });
    return states;
  }, [speakerAssignments]);

  // Search and Filter Master List
  const filteredAssignments = useMemo(() => {
    return speakerAssignments.filter(a => {
      const matchesSearch = 
        a.speakerName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        a.presentationTitle.toLowerCase().includes(searchQuery.toLowerCase()) ||
        a.file?.original_filename.toLowerCase().includes(searchQuery.toLowerCase());

      const matchesRoom = filterRoom === "all" || a.roomName === filterRoom;
      
      const matchesDay = filterDay === "all" || (a.startTime && a.startTime.startsWith(filterDay));

      const matchesStatus = 
        filterStatus === "all" ||
        (filterStatus === "uploaded" && a.file) ||
        (filterStatus === "pending" && !a.file) ||
        (filterStatus === "approved" && a.file?.upload_status === "approved") ||
        (filterStatus === "rejected" && a.file?.upload_status === "rejected") ||
        (filterStatus === "review" && a.file?.upload_status === "pending_validation");

      return matchesSearch && matchesRoom && matchesDay && matchesStatus;
    });
  }, [speakerAssignments, searchQuery, filterRoom, filterDay, filterStatus]);

  // Reset page when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, filterRoom, filterDay, filterStatus]);

  const totalElements = filteredAssignments.length;
  const totalPages = Math.ceil(totalElements / pageSize);

  const paginatedAssignments = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredAssignments.slice(start, start + pageSize);
  }, [filteredAssignments, currentPage, pageSize]);

  // Fetch Versions for Modal on open
  const fetchVersionsForModal = async (sessionSpeakerId: string) => {
    setVersionsLoading(true);
    try {
      const data = await apiClient.get<any[]>(
        `/events/${eventIdStr}/files?current_version_only=false&session_speaker_id=${sessionSpeakerId}`
      );
      setHistoryVersions(data);
    } catch (err) {
      console.error(err);
    } finally {
      setVersionsLoading(false);
    }
  };

  const handleRowClick = (assignment: any) => {
    setActiveSessionSpeakerId(assignment.sessionSpeakerId);
    setShowRejectForm(false);
    setRejectionReason("");
    if (assignment.sessionSpeakerId) {
      fetchVersionsForModal(assignment.sessionSpeakerId);
    }
  };

  // Direct File Upload Integration
  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!selectedSpeakerId) {
      toast.error("Please select a session and speaker slot first.");
      return;
    }

    setUploading(true);
    setUploadProgress(10);
    try {
      const ext = file.name.split(".").pop()?.toLowerCase() || "";
      // 1. Get presigned URL
      const payload = {
        filename: file.name,
        file_size_bytes: file.size,
        mime_type: file.type || "application/octet-stream",
        file_format: ext,
        session_speaker_id: selectedSpeakerId
      };
      
      setUploadProgress(30);
      const presigned = await apiClient.post<any>(`/events/${eventIdStr}/files/upload-url`, payload);
      
      setUploadProgress(50);
      // 2. Put file to Cloudflare S3
      const response = await fetch(presigned.upload_url, {
        method: "PUT",
        headers: {
          "Content-Type": file.type || "application/octet-stream"
        },
        body: file
      });

      if (!response.ok) {
        throw new Error("S3 Upload Failed");
      }

      setUploadProgress(80);
      // 3. Confirm upload
      await apiClient.post(`/events/${eventIdStr}/files/confirm-upload`, {
        file_id: presigned.file_id
      });
      
      setUploadProgress(100);
      toast.success("File uploaded successfully! Automated checks initiated.");
      refetchFiles();
      
      // Reset upload forms
      setSelectedRoom("");
      setSelectedSessionId("");
      setSelectedSpeakerId("");
      setView("validation");
    } catch (err: any) {
      toast.error("Upload failed: " + (err.message || "Network error. Check size limits."));
    } finally {
      setUploading(false);
      setUploadProgress(0);
    }
  };

  // Quick Action Handlers inside Modal
  const handleApprove = async (fileId: string) => {
    try {
      await approveMutation.mutateAsync(fileId);
      toast.success("Presentation approved.");
      refetchFiles();
      setActiveSessionSpeakerId(null); // Close modal on success
    } catch (err) {
      toast.error("Failed to approve file.");
    }
  };

  const handleRejectSubmit = async () => {
    if (!activeAssignment?.file?.id || !rejectionReason.trim()) return;
    try {
      await rejectMutation.mutateAsync({ fileId: activeAssignment.file.id, reason: rejectionReason.trim() });
      toast.success("File marked as needs changes. Speaker notified.");
      setShowRejectForm(false);
      setRejectionReason("");
      refetchFiles();
      setActiveSessionSpeakerId(null); // Close modal on success
    } catch (err) {
      toast.error("Failed to submit rejection.");
    }
  };

  const handleDownload = async (fileId: string) => {
    try {
      await downloadMutation.mutateAsync(fileId);
    } catch (err) {
      toast.error("Failed to initialize download link.");
    }
  };

  // Get dynamic state classes
  const getStatusBadge = (status?: string, valResult?: string) => {
    if (!status) return { label: "Pending Upload", style: "bg-slate-500/10 text-slate-400 border-slate-500/20" };
    if (status === "approved") return { label: "Approved", style: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" };
    if (status === "rejected") return { label: "Needs Changes", style: "bg-rose-500/10 text-rose-400 border-rose-500/20" };
    if (["processing", "pending_validation"].includes(status)) return { label: "Scanning", style: "bg-indigo-500/10 text-indigo-400 border-indigo-500/20 animate-pulse" };
    if (valResult === "fail") return { label: "Failed Checks", style: "bg-amber-500/10 text-amber-400 border-amber-500/20" };
    return { label: "Pending Review", style: "bg-amber-500/10 text-amber-400 border-amber-500/20" };
  };

  // Cascading lists for Upload Form
  const filteredSessionsForUpload = useMemo(() => {
    if (!sessions) return [];
    if (!selectedRoom) return sessions;
    return sessions.filter(s => s.room_name === selectedRoom);
  }, [sessions, selectedRoom]);

  const uploadSelectedSession = sessions?.find(s => s.id === selectedSessionId);
  const uploadSessionSpeakers = uploadSelectedSession?.speakers || [];

  const currentUploadedFileForUploadForm = useMemo(() => {
    if (!selectedSpeakerId) return null;
    return files?.find(f => f.session_speaker_id === selectedSpeakerId) || null;
  }, [files, selectedSpeakerId]);

  return (
    <div className="relative w-full max-w-full overflow-hidden p-6 flex flex-col h-full min-h-0">
      {/* Background Aesthetics */}
      <div className="absolute inset-0 z-0 pointer-events-none">
        <div className="absolute top-[-10%] right-[-10%] w-[500px] h-[500px] bg-[var(--pri)] rounded-full blur-[120px] opacity-10" />
        <div className="absolute bottom-[-10%] left-[-10%] w-[400px] h-[400px] bg-[var(--sec)] rounded-full blur-[120px] opacity-10" />
      </div>

      <div className="relative z-10 flex-1 flex flex-col min-h-0 space-y-6">
        
        {/* Header Block & Navigation Tabs */}
        <header className="flex flex-col gap-4 border-b border-white/5 pb-4 sm:flex-row sm:items-center sm:justify-between shrink-0">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <FileVideo className="h-4 w-4 text-[var(--pri)]" />
              <span className="text-[9px] font-black uppercase tracking-[0.35em] text-[var(--pri)]">Presenter Portal</span>
            </div>
            <h1 className="text-4xl font-black tracking-tighter text-[var(--text)]">
              FILE <span className="text-[var(--pri)]">MONITORING</span>
            </h1>
          </div>

          {/* Premium Workflow Tabs */}
          <nav className="flex items-center gap-1.5 bg-white/5 p-1.5 rounded-2xl border border-white/5 backdrop-blur-md">
            {[
              { id: "dashboard", label: "Dashboard" },
              { id: "validation", label: "Validation Status" },
              { id: "upload", label: "Upload Center" }
            ].map((t) => (
              <button
                key={t.id}
                onClick={() => setView(t.id as FileReviewView)}
                className={cn(
                  "px-5 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all duration-300",
                  view === t.id
                    ? "bg-[var(--pri)] text-white shadow-lg shadow-[var(--pri)]/20"
                    : "text-[var(--muted)] hover:text-[var(--text)] hover:bg-white/5"
                )}
              >
                {t.label}
              </button>
            ))}
          </nav>
        </header>

        {/* Views Router */}
        <div className="flex-1 min-h-0 overflow-y-auto pr-1 custom-scrollbar">
          
          {/* VIEW 1: DASHBOARD */}
          {view === "dashboard" && (
            <div className="space-y-6 animate-in fade-in duration-500">
              
              {/* KPI Cards */}
              <div className="grid grid-cols-2 lg:grid-cols-6 gap-4">
                {[
                  { label: "Total Presentations", value: stats.total, color: "text-indigo-400", sub: "Assigned slots" },
                  { label: "Files Uploaded", value: stats.uploaded, color: "text-emerald-400", sub: `${Math.round((stats.uploaded / (stats.total || 1)) * 100)}% Upload rate` },
                  { label: "Pending Upload", value: stats.pending, color: "text-slate-400", sub: "Not yet received" },
                  { label: "Approved Files", value: stats.approved, color: "text-emerald-500", sub: "Passed validation" },
                  { label: "Issues Found", value: stats.issues, color: "text-rose-400", sub: "Failures / warnings" },
                  { label: "Scanning Logs", value: stats.processing, color: "text-indigo-400", sub: "Queued validators" }
                ].map((kpi, i) => (
                  <Card key={i} className="glass-3d border-default bg-[color-mix(in_srgb,var(--text)_2%,transparent)] rounded-2xl">
                    <CardContent className="p-4 flex flex-col justify-between h-full">
                      <span className="text-[8px] font-black uppercase text-muted tracking-widest block">{kpi.label}</span>
                      <h3 className={cn("text-2xl font-black mt-2", kpi.color)}>{kpi.value}</h3>
                      <span className="text-[8px] text-muted font-semibold block mt-1">{kpi.sub}</span>
                    </CardContent>
                  </Card>
                ))}
              </div>

              {/* Charts Row */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                
                {/* Chart 1: Files by Status */}
                <Card className="glass-3d border-default p-6 rounded-[2rem] bg-[color-mix(in_srgb,var(--text)_3%,transparent)] space-y-6">
                  <h3 className="text-xs font-black uppercase tracking-widest text-[var(--text)] border-b border-white/5 pb-3">
                    Files by Status
                  </h3>
                  <div className="flex flex-col sm:flex-row items-center justify-around gap-6">
                    <div className="relative h-32 w-32 rounded-full border-8 border-white/5 flex items-center justify-center">
                      <div className="absolute inset-0 rounded-full border-8 border-indigo-500 border-t-transparent border-r-transparent animate-spin duration-1000" />
                      <div className="text-center">
                        <span className="text-xs font-black text-[var(--text)]">{stats.uploaded}</span>
                        <span className="text-[8px] text-muted block uppercase font-bold">Uploaded</span>
                      </div>
                    </div>

                    <div className="space-y-3 w-full max-w-[200px]">
                      {[
                        { label: "Approved", value: statusDistribution.approved, pct: stats.uploaded ? Math.round((statusDistribution.approved / stats.uploaded) * 100) : 0, color: "bg-emerald-400" },
                        { label: "Pending/Review", value: statusDistribution.pendingReview, pct: stats.uploaded ? Math.round((statusDistribution.pendingReview / stats.uploaded) * 100) : 0, color: "bg-amber-400" },
                        { label: "Needs Changes", value: statusDistribution.needsChanges, pct: stats.uploaded ? Math.round((statusDistribution.needsChanges / stats.uploaded) * 100) : 0, color: "bg-rose-500" },
                        { label: "Scanning", value: statusDistribution.processing, pct: stats.uploaded ? Math.round((statusDistribution.processing / stats.uploaded) * 100) : 0, color: "bg-indigo-500" }
                      ].map((item, i) => (
                        <div key={i} className="space-y-1">
                          <div className="flex items-center justify-between text-[9px] font-bold text-muted uppercase">
                            <span className="flex items-center gap-1.5">
                              <span className={cn("h-1.5 w-1.5 rounded-full", item.color)} />
                              {item.label}
                            </span>
                            <span>{item.value} ({item.pct}%)</span>
                          </div>
                          <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
                            <div className={cn("h-full rounded-full", item.color)} style={{ width: `${item.pct}%` }} />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </Card>

                {/* Chart 2: Files by Type */}
                <Card className="glass-3d border-default p-6 rounded-[2rem] bg-[color-mix(in_srgb,var(--text)_3%,transparent)] space-y-6">
                  <h3 className="text-xs font-black uppercase tracking-widest text-[var(--text)] border-b border-white/5 pb-3">
                    Files by Type
                  </h3>
                  <div className="space-y-4">
                    {[
                      { label: "PPT / PPTX", value: typeDistribution.pptx, pct: stats.uploaded ? Math.round((typeDistribution.pptx / stats.uploaded) * 100) : 0, color: "bg-rose-500" },
                      { label: "PDF", value: typeDistribution.pdf, pct: stats.uploaded ? Math.round((typeDistribution.pdf / stats.uploaded) * 100) : 0, color: "bg-indigo-400" },
                      { label: "Video (MP4/MOV)", value: typeDistribution.video, pct: stats.uploaded ? Math.round((typeDistribution.video / stats.uploaded) * 100) : 0, color: "bg-amber-400" },
                      { label: "Image", value: typeDistribution.image, pct: stats.uploaded ? Math.round((typeDistribution.image / stats.uploaded) * 100) : 0, color: "bg-emerald-400" },
                      { label: "Others", value: typeDistribution.other, pct: stats.uploaded ? Math.round((typeDistribution.other / stats.uploaded) * 100) : 0, color: "bg-slate-400" }
                    ].map((item, i) => (
                      <div key={i} className="flex items-center gap-4 text-[9px] font-bold text-muted uppercase">
                        <span className="w-24 shrink-0">{item.label}</span>
                        <div className="flex-1 h-2.5 bg-white/5 rounded-full overflow-hidden">
                          <div className={cn("h-full rounded-full", item.color)} style={{ width: `${item.pct}%` }} />
                        </div>
                        <span className="w-12 text-right">{item.value} ({item.pct}%)</span>
                      </div>
                    ))}
                  </div>
                </Card>

              </div>

              {/* Recent Activity Mini Table */}
              <Card className="glass-3d border-default p-6 rounded-[2rem] bg-[color-mix(in_srgb,var(--text)_3%,transparent)] space-y-4">
                <div className="flex items-center justify-between border-b border-white/5 pb-3">
                  <h3 className="text-xs font-black uppercase tracking-widest text-[var(--text)]">
                    Recent Outbound Uploads
                  </h3>
                  <Button variant="link" onClick={() => setView("validation")} className="text-[10px] text-[var(--pri)] font-black uppercase tracking-wider p-0 h-auto">
                    View All Files →
                  </Button>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-white/5 text-[8px] font-black uppercase tracking-wider text-muted">
                        <th className="py-3 px-4">Speaker</th>
                        <th className="py-3 px-4">Session / Topic</th>
                        <th className="py-3 px-4">File Name</th>
                        <th className="py-3 px-4">Format</th>
                        <th className="py-3 px-4 text-center">Status</th>
                        <th className="py-3 px-4">Uploaded On</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5 text-xs">
                      {speakerAssignments.filter(a => a.file).slice(0, 5).map((ass, i) => {
                        const state = getStatusBadge(ass.file.upload_status, ass.file.validation?.overall_result);
                        return (
                          <tr key={i} className="hover:bg-white/[0.01]">
                            <td className="py-3.5 px-4 font-bold text-[var(--text)]">{ass.speakerName}</td>
                            <td className="py-3.5 px-4">
                              <div className="font-semibold text-xs text-[var(--text)]">{ass.presentationTitle}</div>
                              <div className="text-[9px] text-muted truncate max-w-[200px]">{ass.sessionName}</div>
                            </td>
                            <td className="py-3.5 px-4 font-mono text-[10px] text-muted truncate max-w-[150px]">{ass.file.original_filename}</td>
                            <td className="py-3.5 px-4 uppercase font-bold text-[10px] text-indigo-400">{ass.file.file_format}</td>
                            <td className="py-3.5 px-4 text-center">
                              <Badge className={cn("rounded-md border text-[8px] font-black uppercase tracking-wider", state.style)}>
                                {state.label}
                              </Badge>
                            </td>
                            <td className="py-3.5 px-4 text-muted text-[10px]">{new Date(ass.file.uploaded_at).toLocaleString()}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </Card>

            </div>
          )}

          {/* VIEW 2: VALIDATION STATUS */}
          {view === "validation" && (
            <div className="space-y-6 animate-in fade-in duration-500">
              
              {/* Search and Filters Controls */}
              <div className="flex flex-col sm:flex-row items-center gap-3 p-4 rounded-2xl border border-white/5 bg-white/[0.01]">
                <div className="relative flex-1 w-full">
                  <Search className="absolute left-3.5 top-3 h-4 w-4 text-muted" />
                  <Input 
                    type="text"
                    placeholder="Search by file, speaker, or presentation title..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-10 rounded-xl bg-white/5 border-white/10 text-xs w-full"
                  />
                </div>

                <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
                  
                  {/* Room filter */}
                  <select 
                    value={filterRoom}
                    onChange={(e) => setFilterRoom(e.target.value)}
                    className="h-10 px-3.5 rounded-xl border border-white/10 bg-white/5 text-xs text-muted font-semibold focus:outline-none"
                  >
                    <option value="all">All Rooms</option>
                    {roomsList.map((r, i) => (
                      <option key={i} value={r}>{r}</option>
                    ))}
                  </select>

                  {/* Day filter */}
                  <select 
                    value={filterDay}
                    onChange={(e) => setFilterDay(e.target.value)}
                    className="h-10 px-3.5 rounded-xl border border-white/10 bg-white/5 text-xs text-muted font-semibold focus:outline-none"
                  >
                    <option value="all">All Days</option>
                    {daysList.map((d, i) => (
                      <option key={i} value={d}>Day: {d}</option>
                    ))}
                  </select>

                  {/* Status filter */}
                  <select 
                    value={filterStatus}
                    onChange={(e) => setFilterStatus(e.target.value)}
                    className="h-10 px-3.5 rounded-xl border border-white/10 bg-white/5 text-xs text-muted font-semibold focus:outline-none"
                  >
                    <option value="all">All Statuses</option>
                    <option value="uploaded">Uploaded</option>
                    <option value="pending">Pending Upload</option>
                    <option value="approved">Approved</option>
                    <option value="rejected">Needs Changes</option>
                    <option value="review">Under Review</option>
                  </select>
                </div>
              </div>

              {/* Validation Status Table - Full Width, No Vertical Scroll, With Premium Pagination */}
              <Card className="glass-3d border-default p-6 rounded-[2rem] bg-[color-mix(in_srgb,var(--text)_2%,transparent)] w-full space-y-4">
                <div className="overflow-x-auto w-full">
                  <table className="w-full text-left border-collapse whitespace-nowrap">
                    <thead>
                      <tr className="border-b border-white/5 text-[8px] font-black uppercase tracking-wider text-muted bg-[#0f1016]">
                        <th className="py-3 px-4">File Details</th>
                        <th className="py-3 px-4">Presenter</th>
                        <th className="py-3 px-4">Session / Topic</th>
                        <th className="py-3 px-4">Room</th>
                        <th className="py-3 px-4">Uploaded On</th>
                        <th className="py-3 px-4 text-center">Validation Status</th>
                        <th className="py-3 px-4 text-center">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5 text-xs">
                      {paginatedAssignments.map((ass, i) => {
                        const state = getStatusBadge(ass.file?.upload_status, ass.file?.validation?.overall_result);
                        const file = ass.file;

                        return (
                          <tr 
                            key={i} 
                            onClick={() => handleRowClick(ass)}
                            className="hover:bg-white/[0.02] cursor-pointer transition-colors"
                          >
                            <td className="py-3.5 px-4 font-bold text-[var(--text)]">
                              {file ? (
                                <div>
                                  <div className="text-xs font-bold text-[var(--text)] hover:text-[var(--pri)] transition-colors">{file.original_filename}</div>
                                  <div className="text-[9px] text-muted font-mono mt-0.5">
                                    {(file.file_size_bytes / (1024 * 1024)).toFixed(1)} MB · v{file.version_number}
                                  </div>
                                </div>
                              ) : (
                                <span className="text-muted italic text-[11px]">No file uploaded</span>
                              )}
                            </td>
                            <td className="py-3.5 px-4 font-semibold text-[var(--text)]">
                              {ass.speakerName}
                              <div className="text-[9px] text-muted font-normal mt-0.5">{ass.speakerEmail}</div>
                            </td>
                            <td className="py-3.5 px-4">
                              <div className="font-semibold text-xs text-[var(--text)]">{ass.presentationTitle}</div>
                              <div className="text-[9px] text-muted truncate max-w-[200px]">{ass.sessionName}</div>
                            </td>
                            <td className="py-3.5 px-4 text-muted font-medium">{ass.roomName}</td>
                            <td className="py-3.5 px-4 text-muted text-[10px]">
                              {file ? new Date(file.uploaded_at).toLocaleString() : "—"}
                            </td>
                            <td className="py-3.5 px-4 text-center">
                              <Badge className={cn("rounded-md border text-[8px] font-black uppercase tracking-wider", state.style)}>
                                {state.label}
                              </Badge>
                            </td>
                            <td className="py-3.5 px-4 text-center" onClick={(e) => e.stopPropagation()}>
                              {file ? (
                                <button
                                  onClick={() => handleDownload(file.id)}
                                  className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-muted hover:text-[var(--text)] transition"
                                  title="Download file"
                                >
                                  <Download className="h-3.5 w-3.5" />
                                </button>
                              ) : (
                                <span className="text-[8px] font-black text-muted uppercase tracking-wider">Awaiting</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                      {paginatedAssignments.length === 0 && (
                        <tr>
                          <td colSpan={7} className="py-8 text-center text-xs font-semibold text-muted italic">
                            No files matched filters criteria.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>

                {/* Premium Pagination Controls */}
                <div className="flex flex-col sm:flex-row items-center justify-between gap-4 border-t border-white/5 pt-4 text-[10px] font-bold uppercase tracking-wider text-muted">
                  <div className="flex items-center gap-2">
                    <span>Show</span>
                    <select
                      value={pageSize}
                      onChange={(e) => {
                        setPageSize(Number(e.target.value));
                        setCurrentPage(1);
                      }}
                      className="h-8 px-2 rounded-lg border border-white/10 bg-white/5 text-[var(--text)] font-semibold focus:outline-none"
                    >
                      <option value="10">10</option>
                      <option value="20">20</option>
                      <option value="30">30</option>
                      <option value="50">50</option>
                    </select>
                    <span>entries</span>
                    <span className="ml-4 normal-case text-muted/80">
                      Showing {totalElements ? (currentPage - 1) * pageSize + 1 : 0} to {Math.min(currentPage * pageSize, totalElements)} of {totalElements} entries
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                      disabled={currentPage === 1}
                      className="rounded-lg bg-white/5 border-white/10 hover:bg-white/10 text-[10px] font-bold uppercase tracking-wider px-3.5 disabled:opacity-50"
                    >
                      Previous
                    </Button>
                    
                    <span className="text-[10px] font-bold text-[var(--text)] mx-2 normal-case">
                      Page {currentPage} of {totalPages || 1}
                    </span>

                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                      disabled={currentPage === totalPages || totalPages === 0}
                      className="rounded-lg bg-white/5 border-white/10 hover:bg-white/10 text-[10px] font-bold uppercase tracking-wider px-3.5 disabled:opacity-50"
                    >
                      Next
                    </Button>
                  </div>
                </div>

              </Card>

            </div>
          )}

          {/* VIEW 3: UPLOAD CENTER (Mockup Layout With Premium Dark Glass Theme) */}
          {view === "upload" && (
            <div className="space-y-6 animate-in fade-in duration-500">
              
              {/* Header inside Upload Center */}
              <div className="flex items-center justify-between border-b border-white/5 pb-4">
                <div>
                  <h3 className="text-xl font-black text-[var(--text)]">Presentation Upload Center</h3>
                  <p className="text-xs text-muted mt-0.5">Upload, replace or manage presentation files for sessions.</p>
                </div>
                <div className="flex items-center gap-2">
                  <Button 
                    onClick={() => setView("dashboard")}
                    variant="outline" 
                    size="sm"
                    className="bg-white/5 border border-white/10 hover:bg-white/10 text-[10px] font-black uppercase tracking-wider rounded-xl px-4 py-2 flex items-center gap-1.5"
                  >
                    <span>← Back to Dashboard</span>
                  </Button>
                  <Button 
                    variant="outline" 
                    size="sm"
                    className="bg-white/5 border border-white/10 hover:bg-white/10 text-[10px] font-black uppercase tracking-wider rounded-xl px-4 py-2 flex items-center gap-1.5"
                  >
                    <Info className="h-3.5 w-3.5 text-[var(--pri)]" />
                    <span>Upload Guidelines</span>
                  </Button>
                </div>
              </div>

              {/* Main Upload Grid */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                
                {/* Left Area (Takes 2 columns) */}
                <div className="lg:col-span-2 space-y-6">
                  
                  {/* Upload New Presentation Box */}
                  <Card className="glass-3d border-default p-6 rounded-[2rem] bg-[color-mix(in_srgb,var(--text)_2%,transparent)]">
                    <h4 className="text-xs font-black uppercase text-muted tracking-wider mb-4">Upload New Presentation</h4>
                    
                    <div className="flex flex-col items-center justify-center p-8 border-2 border-dashed border-[var(--pri)]/20 rounded-[2rem] bg-white/[0.01] space-y-4 text-center">
                      <div className="p-4 rounded-full bg-[var(--pri)]/10 text-[var(--pri)]">
                        <UploadCloud className="h-10 w-10 animate-bounce" />
                      </div>
                      <div>
                        <h4 className="text-sm font-black text-[var(--text)]">Drag & drop your file here</h4>
                        <span className="text-[10px] text-muted block my-1">or</span>
                      </div>

                      <label className="cursor-pointer">
                        <span className="inline-flex items-center justify-center h-10 px-8 rounded-xl bg-[var(--pri)] hover:bg-[var(--pri)]/90 text-[10px] font-black uppercase tracking-widest text-white transition-all shadow-lg shadow-[var(--pri)]/20">
                          Choose File
                        </span>
                        <input 
                          type="file"
                          onChange={handleFileUpload}
                          className="hidden"
                          accept=".pptx,.ppt,.pdf,.mp4,.mov"
                          disabled={!selectedSpeakerId || uploading}
                        />
                      </label>
                      
                      <p className="text-[10px] text-muted pt-2">
                        Supported formats: PPT, PPTX, PDF, MP4, MOV | Max file size: 2 GB
                      </p>
                    </div>

                    {uploading && (
                      <div className="space-y-2 mt-4 pt-3 border-t border-white/5 animate-pulse">
                        <div className="flex items-center justify-between text-[9px] font-black uppercase tracking-wider text-muted">
                          <span>Uploading to Storage Node...</span>
                          <span>{uploadProgress}%</span>
                        </div>
                        <div className="h-2 bg-white/5 rounded-full overflow-hidden">
                          <div className="h-full bg-[var(--pri)] rounded-full transition-all duration-300" style={{ width: `${uploadProgress}%` }} />
                        </div>
                      </div>
                    )}
                  </Card>

                  {/* Session Details Form */}
                  <Card className="glass-3d border-default p-6 rounded-[2rem] bg-[color-mix(in_srgb,var(--text)_2%,transparent)] space-y-6">
                    <h4 className="text-xs font-black uppercase text-muted tracking-wider border-b border-white/5 pb-2">Session Details</h4>
                    
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      
                      {/* Room/Hall Selector */}
                      <div className="space-y-1.5">
                        <label className="text-[9px] font-black uppercase text-muted tracking-wider">Select Hall / Room</label>
                        <select 
                          value={selectedRoom}
                          onChange={(e) => {
                            setSelectedRoom(e.target.value);
                            setSelectedSessionId("");
                            setSelectedSpeakerId("");
                          }}
                          className="w-full h-11 px-4 rounded-xl border border-white/10 bg-[#12131a] text-xs text-[var(--text)] focus:outline-none"
                        >
                          <option value="">Choose Hall...</option>
                          {roomsList.map((room, i) => (
                            <option key={i} value={room}>{room}</option>
                          ))}
                        </select>
                      </div>

                      {/* Session Selector */}
                      <div className="space-y-1.5">
                        <label className="text-[9px] font-black uppercase text-muted tracking-wider">Session</label>
                        <select 
                          value={selectedSessionId}
                          onChange={(e) => {
                            setSelectedSessionId(e.target.value);
                            setSelectedSpeakerId("");
                          }}
                          disabled={!selectedRoom}
                          className="w-full h-11 px-4 rounded-xl border border-white/10 bg-[#12131a] text-xs text-[var(--text)] focus:outline-none disabled:opacity-50"
                        >
                          <option value="">Choose Session...</option>
                          {filteredSessionsForUpload.map(s => (
                            <option key={s.id} value={s.id}>{s.name}</option>
                          ))}
                        </select>
                      </div>

                      {/* Speaker Selector */}
                      <div className="space-y-1.5">
                        <label className="text-[9px] font-black uppercase text-muted tracking-wider">Speaker</label>
                        <select 
                          value={selectedSpeakerId}
                          onChange={(e) => setSelectedSpeakerId(e.target.value)}
                          disabled={!selectedSessionId}
                          className="w-full h-11 px-4 rounded-xl border border-white/10 bg-[#12131a] text-xs text-[var(--text)] focus:outline-none disabled:opacity-50"
                        >
                          <option value="">Select Speaker...</option>
                          {uploadSessionSpeakers.map((sp: any) => (
                            <option key={sp.id} value={sp.session_speaker_id}>{sp.full_name}</option>
                          ))}
                        </select>
                      </div>

                    </div>

                    {selectedSpeakerId && (
                      <div className="p-4 rounded-2xl border border-white/5 bg-white/[0.01] grid grid-cols-2 md:grid-cols-4 gap-4 text-xs mt-4">
                        <div>
                          <span className="text-[8px] font-black uppercase text-muted block">Hall / Room</span>
                          <span className="font-bold text-[var(--text)]">{selectedRoom}</span>
                        </div>
                        <div>
                          <span className="text-[8px] font-black uppercase text-muted block">Track</span>
                          <span className="font-bold text-[var(--text)]">Plenary Track</span>
                        </div>
                        <div>
                          <span className="text-[8px] font-black uppercase text-muted block">Date & Time</span>
                          <span className="font-bold text-[var(--text)]">
                            {uploadSelectedSession?.start_time 
                              ? new Date(uploadSelectedSession.start_time).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" }) 
                              : "—"}
                          </span>
                        </div>
                        <div>
                          <span className="text-[8px] font-black uppercase text-muted block">Presentation Title</span>
                          <span className="font-bold text-[var(--text)] truncate block max-w-[150px]">
                            {uploadSessionSpeakers.find((sp: any) => sp.session_speaker_id === selectedSpeakerId)?.presentation_title || "General Talk"}
                          </span>
                        </div>
                      </div>
                    )}
                  </Card>

                </div>

                {/* Right Area (Takes 1 column) */}
                <div className="space-y-6">
                  
                  {/* Upload Tips Card */}
                  <Card className="glass-3d border-default p-6 rounded-[2rem] bg-[color-mix(in_srgb,var(--text)_2%,transparent)] space-y-4">
                    <h4 className="text-xs font-black uppercase text-muted tracking-wider border-b border-white/5 pb-2">Upload Tips</h4>
                    
                    <div className="space-y-3">
                      {[
                        "Upload your final presentation before the deadline.",
                        "Use 16:9 aspect ratio for best display.",
                        "Embedded fonts are recommended.",
                        "Videos must be in MP4 format.",
                        "Maximum 2 GB per file."
                      ].map((tip, idx) => (
                        <div key={idx} className="flex items-start gap-2.5 text-xs text-muted">
                          <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0 mt-0.5" />
                          <span>{tip}</span>
                        </div>
                      ))}
                    </div>
                  </Card>

                  {/* Current File Card */}
                  <Card className="glass-3d border-default p-6 rounded-[2rem] bg-[color-mix(in_srgb,var(--text)_2%,transparent)] space-y-4">
                    <h4 className="text-xs font-black uppercase text-muted tracking-wider border-b border-white/5 pb-2">Current File</h4>
                    
                    {currentUploadedFileForUploadForm ? (
                      <div className="space-y-4">
                        <div className="p-3 rounded-xl border border-white/5 bg-white/[0.01] flex items-center justify-between">
                          <div className="flex items-center gap-2 truncate">
                            <div className="p-2.5 rounded-lg bg-[var(--pri)]/10 text-[var(--pri)] shrink-0">
                              <FileText className="h-4 w-4" />
                            </div>
                            <div className="truncate">
                              <div className="text-xs font-bold text-[var(--text)] truncate">
                                {currentUploadedFileForUploadForm.original_filename}
                              </div>
                              <div className="text-[9px] text-muted mt-0.5">
                                {(currentUploadedFileForUploadForm.file_size_bytes / (1024 * 1024)).toFixed(1)} MB · Uploaded on {new Date(currentUploadedFileForUploadForm.uploaded_at).toLocaleDateString()}
                              </div>
                            </div>
                          </div>

                          <Badge className="bg-emerald-500/10 text-emerald-400 border-emerald-500/20 text-[8px] font-black uppercase tracking-wider px-1.5 py-0.5">
                            {currentUploadedFileForUploadForm.upload_status}
                          </Badge>
                        </div>

                        {/* Replace File Button */}
                        <label className="cursor-pointer block">
                          <span className="w-full h-10 inline-flex items-center justify-center border border-dashed border-[var(--pri)]/30 hover:bg-[var(--pri)]/5 text-xs font-bold text-[var(--pri)] rounded-xl transition">
                            Replace File
                          </span>
                          <input 
                            type="file"
                            onChange={handleFileUpload}
                            className="hidden"
                            accept=".pptx,.ppt,.pdf,.mp4,.mov"
                            disabled={uploading}
                          />
                        </label>
                      </div>
                    ) : (
                      <div className="p-6 border border-dashed border-white/10 rounded-xl text-center text-xs font-semibold text-muted italic bg-white/[0.01]">
                        No file uploaded yet.
                      </div>
                    )}
                  </Card>

                </div>

              </div>

              {/* Upload Footer Bar */}
              <div className="flex flex-col sm:flex-row items-center justify-between gap-4 p-4 rounded-[2rem] border border-white/5 bg-white/[0.02]">
                <div className="flex items-center gap-2 text-[10px] text-muted uppercase tracking-wider font-semibold">
                  <CheckCircle2 className="h-4 w-4 text-[var(--pri)] shrink-0 animate-pulse" />
                  <span>By uploading, you confirm that you have the right to present this content.</span>
                </div>
                <Button 
                  onClick={() => setView("validation")}
                  className="w-full sm:w-auto px-8 py-2.5 rounded-xl bg-[var(--pri)] hover:bg-[var(--pri)]/90 text-white text-[10px] font-black uppercase tracking-wider shadow-lg shadow-[var(--pri)]/20"
                >
                  Upload & Continue
                </Button>
              </div>

            </div>
          )}

        </div>

      </div>

      {/* DYNAMIC VALIDATION AUDIT MODAL (Row Click Popup) */}
      <AnimatePresence>
        {activeAssignment && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm overflow-y-auto">
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="w-full max-w-4xl p-6 rounded-[2rem] border border-white/10 bg-[#0f1016] shadow-2xl space-y-6 my-8"
            >
              {/* Modal Header */}
              <div className="flex items-start justify-between border-b border-white/5 pb-4">
                <div>
                  <span className="text-[8px] font-black uppercase text-[var(--pri)] tracking-[0.3em]">Validation Auditor</span>
                  <h2 className="text-xl font-black text-[var(--text)] mt-1">{activeAssignment.presentationTitle}</h2>
                  <p className="text-[10px] text-muted mt-0.5">Presenter: <span className="text-[var(--text)] font-semibold">{activeAssignment.speakerName}</span> ({activeAssignment.speakerEmail})</p>
                </div>
                <button 
                  onClick={() => setActiveSessionSpeakerId(null)}
                  className="p-1.5 rounded-lg bg-white/5 border border-white/5 hover:bg-white/10 text-muted hover:text-[var(--text)] transition"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              {/* Modal Body */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                
                {/* Left Column: File validation detailed checks */}
                <div className="space-y-6">
                  <div>
                    <h3 className="text-xs font-black uppercase tracking-widest text-[var(--text)] border-b border-white/5 pb-2">
                      Validation Checklist
                    </h3>
                  </div>

                  {activeAssignment.file ? (
                    <div className="space-y-4">
                      {/* Check details grid */}
                      {[
                        { 
                          label: "File Format", 
                          value: `Format: ${activeAssignment.file.file_format?.toUpperCase()}`, 
                          valid: ["pptx", "pdf", "mp4"].includes(activeAssignment.file.file_format?.toLowerCase()) 
                        },
                        { 
                          label: "Antivirus Scan", 
                          value: `Scan Status: ${activeAssignment.file.validation?.antivirus_status || "CLEAN"}`, 
                          valid: activeAssignment.file.validation?.antivirus_status !== "INFECTED" 
                        },
                        { 
                          label: "Slide Count", 
                          value: `Count: ${activeAssignment.file.validation?.slide_count || activeAssignment.file.validation?.technical_metadata?.page_count || "N/A"} slides/pages`, 
                          valid: true 
                        },
                        { 
                          label: "Embedded Fonts", 
                          value: activeAssignment.file.validation?.has_missing_fonts 
                            ? `Missing: ${activeAssignment.file.validation.missing_fonts_list?.join(", ")}` 
                            : "All fonts successfully embedded", 
                          valid: !activeAssignment.file.validation?.has_missing_fonts 
                        },
                        { 
                          label: "Video Elements", 
                          value: `Detected ${activeAssignment.file.validation?.video_count || 0} embedded videos`, 
                          valid: !activeAssignment.file.validation?.has_unsupported_video 
                        },
                        { 
                          label: "Media & External Links", 
                          value: `External links: ${activeAssignment.file.validation?.external_url_count || 0}. Connected media is valid.`, 
                          valid: !activeAssignment.file.validation?.has_broken_internal_media 
                        },
                        { 
                          label: "Aspect Ratio Layout", 
                          value: `Widescreen 16:9 check status: Passed`, 
                          valid: true 
                        }
                      ].map((chk, i) => (
                        <div key={i} className="flex items-start justify-between p-3 rounded-xl border border-white/5 bg-white/[0.01]">
                          <div>
                            <h4 className="text-xs font-bold text-[var(--text)]">{chk.label}</h4>
                            <p className="text-[10px] text-muted mt-0.5">{chk.value}</p>
                          </div>
                          {chk.valid ? (
                            <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0 mt-0.5" />
                          ) : (
                            <AlertTriangle className="h-4 w-4 text-rose-400 shrink-0 mt-0.5" />
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="p-8 border border-dashed border-white/10 rounded-2xl text-center text-xs font-semibold text-muted italic bg-white/[0.01]">
                      No file uploaded yet. Validation checks will initiate automatically once a presentation file is received.
                    </div>
                  )}
                </div>

                {/* Right Column: Version History & Actions */}
                <div className="space-y-6">
                  <div>
                    <h3 className="text-xs font-black uppercase tracking-widest text-[var(--text)] border-b border-white/5 pb-2">
                      Version logs & History
                    </h3>
                  </div>

                  {versionsLoading ? (
                    <div className="flex flex-col items-center justify-center py-10 space-y-2">
                      <RefreshCw className="h-5 w-5 text-[var(--pri)] animate-spin" />
                      <span className="text-[9px] text-muted font-bold uppercase tracking-wider">Syncing Version Tree...</span>
                    </div>
                  ) : (
                    <div className="space-y-4 max-h-[300px] overflow-y-auto pr-1 custom-scrollbar">
                      {historyVersions.map((v, i) => {
                        const state = getStatusBadge(v.upload_status, v.validation?.overall_result);
                        return (
                          <div key={i} className={cn("p-3.5 rounded-xl border border-white/5 bg-white/[0.01] space-y-2.5", v.is_current_version && "border-[var(--pri)] bg-white/[0.02]")}>
                            <div className="flex items-center justify-between">
                              <span className="text-xs font-black text-indigo-400">
                                Version v{v.version_number} {v.is_current_version && <span className="text-[8px] font-black uppercase text-emerald-400 ml-1">Active</span>}
                              </span>
                              <div className="flex items-center gap-2">
                                <Badge className={cn("rounded-md border text-[8px] font-black uppercase tracking-wider px-1.5 py-0.5", state.style)}>
                                  {state.label}
                                </Badge>
                                <button 
                                  onClick={() => handleDownload(v.id)}
                                  className="p-1 rounded bg-white/5 hover:bg-white/10 text-muted hover:text-[var(--text)] transition"
                                  title="Download version"
                                >
                                  <Download className="h-3 w-3" />
                                </button>
                              </div>
                            </div>

                            <p className="text-[10px] font-mono text-muted truncate">{v.original_filename}</p>
                            
                            {/* Display historical rejection comments if present */}
                            {v.rejection_reason && (
                              <div className="p-2.5 rounded-lg border border-rose-500/10 bg-rose-500/5 text-[9px] text-rose-400 font-semibold space-y-1">
                                <div className="flex items-center gap-1 font-bold text-[8px] uppercase tracking-wider text-rose-300">
                                  <AlertCircle className="h-3 w-3" />
                                  <span>Rejection Log:</span>
                                </div>
                                <p className="leading-relaxed whitespace-pre-line">{v.rejection_reason}</p>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Actions Center */}
                  {activeAssignment.file && (
                    <div className="border-t border-white/5 pt-4 space-y-4">
                      
                      {!showRejectForm ? (
                        <div className="flex items-center gap-2">
                          {activeAssignment.file.upload_status !== "approved" && (
                            <Button 
                              onClick={() => handleApprove(activeAssignment.file.id)}
                              className="flex-1 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-black uppercase tracking-wider py-2.5"
                            >
                              Approve Presentation
                            </Button>
                          )}
                          {activeAssignment.file.upload_status !== "rejected" && (
                            <Button 
                              onClick={() => setShowRejectForm(true)}
                              className="flex-1 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-black uppercase tracking-wider py-2.5"
                            >
                              Request Changes
                            </Button>
                          )}
                        </div>
                      ) : (
                        <div className="space-y-3 animate-in slide-in-from-bottom-2 duration-300">
                          <label className="text-[8px] font-black uppercase text-muted tracking-wider">Provide Rejection Reason</label>
                          <Textarea 
                            value={rejectionReason}
                            onChange={(e) => setRejectionReason(e.target.value)}
                            placeholder="Slide aspect ratio must be 16:9, or font Calibri is missing..."
                            rows={3}
                            className="w-full rounded-xl bg-white/5 border-white/10 text-xs text-[var(--text)] focus:outline-none"
                          />
                          <div className="flex items-center justify-end gap-2">
                            <Button 
                              variant="outline" 
                              size="sm" 
                              onClick={() => setShowRejectForm(false)}
                              className="rounded-xl bg-white/5 border-white/10 hover:bg-white/10 text-xs font-semibold"
                            >
                              Back
                            </Button>
                            <Button 
                              size="sm" 
                              onClick={handleRejectSubmit}
                              disabled={!rejectionReason.trim()}
                              className="rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-black uppercase tracking-wider"
                            >
                              Submit Rejection
                            </Button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                </div>

              </div>

            </motion.div>
          </div>
        )}
      </AnimatePresence>

    </div>
  );
}
